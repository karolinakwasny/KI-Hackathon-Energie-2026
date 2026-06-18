#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Charging-Hub Profitability Analysis
====================================

Reads the raw data (load profile, spot prices, charging sessions, network fees),
cleans it, and computes:

  1. COST per 15-min interval = grid draw (kWh) x spot price + levies/taxes
                                + fixed network demand + metering costs
  2. REVENUE                  = sold kWh x selling price
                                (selling price = cost/kWh x (1 + margin))
  3. PROFIT / LOSS            = revenue - cost
  4. PEAK ANALYSIS            = annual peak + demand-charge sensitivity
  5. LOAD SHIFTING            = what-if: move load out of expensive evening hours
                                into cheap midday/morning hours

Key logic:
  * We BUY more kWh (grid draw, load profile) than we SELL (sessions). The gap is
    losses/standby -> cost with no revenue. Therefore: ALWAYS apply the margin to
    "cost per SOLD kWh".
  * The demand charge (Leistungspreis) is a FIXED annual cost driven by the single
    yearly peak.

All assumptions live in the CONFIG block at the top and can be changed there.

NOTE on German tokens: strings used to read the raw Excel files are kept in German
because they must match the source columns/sheets exactly. They are commented inline.
German domain terms -> English: Lastgang = load profile, Netzentgelt = network/grid fee,
Arbeitspreis = energy charge, Leistungspreis = demand charge, Ladevorgaenge = sessions,
Vertrag = contract, Standzeit = dwell time, Abrechnung = billing.
"""

import os
import pandas as pd
import numpy as np

# =============================================================================
#  CONFIG  --  adjust all parameters / assumptions here
# =============================================================================
CONFIG = {
    # ---- file paths ----
    "path_load_profile": "Lastgang_Ladeinfrastruktur_Beispiel_Ladehub.xlsx",
    "path_spot":         "Spotmarktpreis_.xlsx",
    "path_sessions":     "Ladevorgänge_Ladeinfrastruktur_Beispiel_Ladehub.xlsx",
    "outdir":            ".",

    # ---- analysis year ----
    "year": 2025,

    # ---- network fee (2025 values from the calc, NOT the 2024 price sheet) ----
    "ne_energy_ct_kwh": 8.24,    # cent/kWh  (on grid draw)   [Arbeitspreis]
    "ne_demand_eur_kw": 19.76,   # EUR/kW.a  (on annual peak) [Leistungspreis]

    # ---- other price components (cent/kWh on grid draw) ----
    "concession_levy_ct_kwh": 0.11,   # special-contract customer [Konzessionsabgabe]
    "electricity_tax_ct_kwh": 2.05,   # ASSUMPTION - may be reduced -> verify [Stromsteuer]
    "surcharges_ct_kwh":      0.00,   # statutory surcharges 2025 (KWK, 19 StromNEV, Offshore...)
    "supplier_markup_ct_kwh": 0.00,   # supplier spread/markup over spot -> fill in

    # ---- fixed annual costs (EUR/a) ----
    "metering_eur_a": 131.51,    # 101.65 + 19.13 + 10.73 [Messstellenbetrieb]

    # ---- pricing strategy ----
    "margin": 0.30,              # markup on cost per sold kWh (0.30 = 30%)

    # ---- load-shift scenario (what-if) ----
    "shift_share": 0.30,                 # fraction of energy in expensive hours to move
    "shift_from_hours": [16, 17, 18, 19],        # expensive evening hours (source)
    "shift_to_hours":   [10, 11, 12, 13, 14],    # cheap midday hours (target)
    "peak_cap_kw": 300.0,        # target peak cap for the demand-charge sensitivity

    # ---- cleaning ----
    "min_kwh_session": 0.5,      # sessions below this are dropped
}

QUARTER_HOUR_H = 0.25  # 15 min = 0.25 h

# German tokens from the raw files (kept so reads match the source) ------------
ROAMING_CONTRACT = "DE-LDK-C00480594"   # foreign EMP roaming contract
BILLED_VALUE = "Abgerechnet"            # value of the "Abrechnung" column when billed
SESSIONS_SHEET = "Ladevorgaenge"        # sheet name in the sessions workbook
COL_START = "Gestartet"                 # session start
COL_END = "Beendet"                     # session end
COL_KWH = "Verbrauch (kWh)"             # delivered energy
COL_CONTRACT = "Vertrag"                # contract / customer id
COL_ANOMALY = "Grund für die Auffälligkeit"  # anomaly reason ("-" = none)
COL_BILLING = "Abrechnung"              # billing status


# =============================================================================
#  HELPERS
# =============================================================================
def _time_to_timedelta(x):
    """Convert a time-of-day (datetime.time / Timestamp / string) to a Timedelta."""
    if pd.isna(x):
        return pd.Timedelta(0)
    if hasattr(x, "hour"):
        return pd.Timedelta(hours=x.hour, minutes=getattr(x, "minute", 0),
                            seconds=getattr(x, "second", 0))
    return pd.to_timedelta(str(x))


def eur(x):
    return f"{x:,.2f} EUR"


# =============================================================================
#  1. LOAD DATA
# =============================================================================
def read_load_profile(path, year):
    """Load profile (grid draw) as a 15-min series: columns ts, kwh, kw."""
    sheet = str(year)
    raw = pd.read_excel(path, sheet_name=sheet, header=None)
    # Data block starts at row idx 2; cols idx 4=start-date, 5=start-time, 6=kWh, 7=kW
    d = raw.iloc[2:, [4, 5, 6, 7]].copy()
    d.columns = ["date", "time", "kwh", "kw"]
    d = d.dropna(subset=["kwh"])
    for c in ("kwh", "kw"):
        d[c] = pd.to_numeric(d[c], errors="coerce")
    d = d.dropna(subset=["kwh"]).reset_index(drop=True)
    d["date"] = pd.to_datetime(d["date"])
    d["ts"] = d["date"].dt.normalize() + d["time"].map(_time_to_timedelta)
    d = d[(d["ts"] >= f"{year}-01-01") & (d["ts"] < f"{year+1}-01-01")]
    d["hour_floor"] = d["ts"].dt.floor("h")
    d["hour"] = d["ts"].dt.hour
    return d[["ts", "hour_floor", "hour", "kwh", "kw"]].sort_values("ts").reset_index(drop=True)


def read_spot(path):
    """Merge all spot sheets into one hourly price series (ct/kWh)."""
    xl = pd.ExcelFile(path)
    parts = []
    for sheet in xl.sheet_names:
        if "spot" not in sheet.lower():
            continue  # skip 'Quelle' (source) etc.
        s = pd.read_excel(path, sheet_name=sheet, header=0)
        s = s.iloc[:, :6]
        s.columns = ["date", "from", "tz_from", "to", "tz_to", "price"]
        s["date"] = pd.to_datetime(s["date"], errors="coerce")
        s["price"] = pd.to_numeric(s["price"], errors="coerce")
        s = s.dropna(subset=["date", "price"])
        s["ts"] = s["date"].dt.normalize() + s["from"].map(_time_to_timedelta)
        parts.append(s[["ts", "price"]])
    spot = pd.concat(parts, ignore_index=True).drop_duplicates("ts")
    spot["hour_floor"] = spot["ts"].dt.floor("h")
    # collapse to an hourly price (sheet 2 may be 15-min -> mean)
    spot_h = spot.groupby("hour_floor", as_index=False)["price"].mean()
    return spot_h.rename(columns={"price": "spot_ct"})


def read_sessions(path, year, min_kwh):
    """Load + clean charging sessions. Returns (clean_df, report_dict)."""
    ev = pd.read_excel(path, sheet_name=SESSIONS_SHEET, header=0)
    ev["start"] = pd.to_datetime(ev[COL_START], errors="coerce")
    ev["kwh"] = pd.to_numeric(ev[COL_KWH], errors="coerce")
    n0 = len(ev)

    # restrict to the analysis year
    ev = ev[(ev["start"] >= f"{year}-01-01") & (ev["start"] < f"{year+1}-01-01")].copy()
    n_year = len(ev)

    # cleaning
    drop_nan = ev["kwh"].isna()
    drop_small = ev["kwh"] < min_kwh
    report = {
        "rows_total": n0,
        "in_year": n_year,
        "dropped_kwh_missing": int(drop_nan.sum()),
        "dropped_too_small": int((drop_small & ~drop_nan).sum()),
        "flagged_anomaly": int((ev.get(COL_ANOMALY, pd.Series(dtype=str)) != "-").sum())
            if COL_ANOMALY in ev.columns else 0,
        "not_billed": int((ev.get(COL_BILLING, pd.Series(dtype=str)) != BILLED_VALUE).sum())
            if COL_BILLING in ev.columns else 0,
    }
    ev_clean = ev[~(drop_nan | drop_small)].copy()
    report["clean_count"] = len(ev_clean)
    report["clean_kwh"] = float(ev_clean["kwh"].sum())
    return ev_clean, report


# =============================================================================
#  2. COST ENGINE (per interval)
# =============================================================================
def compute_costs(load_profile, spot, cfg):
    """Join load profile with spot prices and cost each 15-min interval."""
    df = load_profile.merge(spot, on="hour_floor", how="left")
    missing = int(df["spot_ct"].isna().sum())
    df["spot_ct"] = df["spot_ct"].fillna(df["spot_ct"].mean())  # emergency fallback

    # variable cost per kWh (cent) on the GRID DRAW
    var_ct = (df["spot_ct"]
              + cfg["ne_energy_ct_kwh"]
              + cfg["concession_levy_ct_kwh"]
              + cfg["electricity_tax_ct_kwh"]
              + cfg["surcharges_ct_kwh"]
              + cfg["supplier_markup_ct_kwh"])
    df["cost_var_eur"] = df["kwh"] * var_ct / 100.0
    return df, missing


def cost_summary(df_cost, peak_kw, sold_kwh, cfg):
    """Aggregate costs into an annual summary."""
    grid_kwh = df_cost["kwh"].sum()

    spot_eur   = (df_cost["kwh"] * df_cost["spot_ct"] / 100).sum()
    ne_energy  = grid_kwh * cfg["ne_energy_ct_kwh"] / 100
    concession = grid_kwh * cfg["concession_levy_ct_kwh"] / 100
    el_tax     = grid_kwh * cfg["electricity_tax_ct_kwh"] / 100
    surcharges = grid_kwh * cfg["surcharges_ct_kwh"] / 100
    supplier   = grid_kwh * cfg["supplier_markup_ct_kwh"] / 100
    ne_demand  = peak_kw * cfg["ne_demand_eur_kw"]       # FIXED
    metering   = cfg["metering_eur_a"]                   # FIXED

    var_total  = spot_eur + ne_energy + concession + el_tax + surcharges + supplier
    fix_total  = ne_demand + metering
    total      = var_total + fix_total

    return {
        "grid_kwh": grid_kwh,
        "sold_kwh": sold_kwh,
        "loss_kwh": grid_kwh - sold_kwh,
        "loss_pct": (grid_kwh - sold_kwh) / grid_kwh * 100 if grid_kwh else 0,
        "spot_eur": spot_eur,
        "ne_energy": ne_energy,
        "concession": concession,
        "electricity_tax": el_tax,
        "surcharges": surcharges,
        "supplier": supplier,
        "ne_demand": ne_demand,
        "metering": metering,
        "cost_total": total,
        "cost_per_grid_kwh_ct": total / grid_kwh * 100 if grid_kwh else 0,
        "cost_per_sold_kwh_ct": total / sold_kwh * 100 if sold_kwh else 0,
    }


# =============================================================================
#  3. REVENUE & PROFIT (margin on cost per sold kWh)
# =============================================================================
def profit(summary, margin):
    cps_eur = summary["cost_per_sold_kwh_ct"] / 100        # cost per sold kWh
    sell_price_eur = cps_eur * (1 + margin)                # selling price per kWh
    revenue = sell_price_eur * summary["sold_kwh"]
    result = revenue - summary["cost_total"]
    return {
        "margin": margin,
        "sell_price_ct_kwh": sell_price_eur * 100,
        "revenue": revenue,
        "profit": result,
        "profit_pct_on_cost": result / summary["cost_total"] * 100,
    }


# =============================================================================
#  4. PEAK ANALYSIS
# =============================================================================
def peak_analysis(load_profile, cfg):
    peak = load_profile["kw"].max()
    peak_ts = load_profile.loc[load_profile["kw"].idxmax(), "ts"]
    dp = cfg["ne_demand_eur_kw"]
    cap = cfg["peak_cap_kw"]
    above_cap = load_profile[load_profile["kw"] > cap]
    return {
        "peak_kw": peak,
        "peak_ts": peak_ts,
        "demand_charge_cost": peak * dp,
        "cap_kw": cap,
        "intervals_above_cap": len(above_cap),
        "saving_at_cap": max(0.0, (peak - cap)) * dp,
        "top10": load_profile.nlargest(10, "kw")[["ts", "kw"]],
    }


# =============================================================================
#  5. LOAD SHIFTING (what-if)
# =============================================================================
def load_shift(df_cost, cfg):
    """
    Simulate: move 'shift_share' of the energy out of the expensive source hours into
    the cheap target hours, and cap the peak at 'peak_cap_kw'. Values the energy-cost
    change at the spot price and estimates the demand-charge saving.
    """
    df = df_cost.copy()
    src = cfg["shift_from_hours"]
    dst = cfg["shift_to_hours"]
    share = cfg["shift_share"]

    # volume-weighted mean spot price of source and target hours
    q = df[df["hour"].isin(src)]
    z = df[df["hour"].isin(dst)]
    spot_src = (q["kwh"] * q["spot_ct"]).sum() / q["kwh"].sum() if q["kwh"].sum() else 0
    spot_dst = (z["kwh"] * z["spot_ct"]).sum() / z["kwh"].sum() if z["kwh"].sum() else 0
    shifted_kwh = q["kwh"].sum() * share

    # only the SPOT part changes (per-kWh network/levies stay the same)
    energy_saving = shifted_kwh * (spot_src - spot_dst) / 100.0

    # demand charge: cap the peak at cap (assume shifting enables the cap)
    peak = df["kw"].max()
    cap = cfg["peak_cap_kw"]
    demand_saving = max(0.0, peak - cap) * cfg["ne_demand_eur_kw"]

    return {
        "spot_source_ct": spot_src,
        "spot_target_ct": spot_dst,
        "shifted_kwh": shifted_kwh,
        "energy_saving": energy_saving,
        "demand_saving": demand_saving,
        "total_saving": energy_saving + demand_saving,
    }


# =============================================================================
#  REPORT
# =============================================================================
def hourly_profile(df_cost):
    p = df_cost.groupby("hour").agg(
        energy_kwh=("kwh", "sum"),
        avg_kw=("kw", "mean"),
        max_kw=("kw", "max"),
        spot_ct=("spot_ct", "mean"),
    )
    p["energy_share_pct"] = (p["energy_kwh"] / p["energy_kwh"].sum() * 100).round(1)
    return p.round(2)


def main():
    cfg = CONFIG

    print("=" * 70)
    print(f"  CHARGING-HUB PROFITABILITY ANALYSIS  --  year {cfg['year']}")
    print("=" * 70)

    # --- load ---
    load_profile = read_load_profile(cfg["path_load_profile"], cfg["year"])
    spot = read_spot(cfg["path_spot"])
    sessions, report = read_sessions(cfg["path_sessions"], cfg["year"], cfg["min_kwh_session"])
    sold_kwh = report["clean_kwh"]

    print("\n[1] DATA CLEANING (sessions)")
    print(f"    rows total ............... {report['rows_total']:>10,}")
    print(f"    in year {cfg['year']} ............ {report['in_year']:>10,}")
    print(f"    dropped (kWh missing) .... {report['dropped_kwh_missing']:>10,}")
    print(f"    dropped (< {cfg['min_kwh_session']} kWh) ...... {report['dropped_too_small']:>10,}")
    print(f"    flagged as anomaly ....... {report['flagged_anomaly']:>10,}  (kept)")
    print(f"    not billed ............... {report['not_billed']:>10,}  (kept)")
    print(f"    -> clean sessions ........ {report['clean_count']:>10,}")
    print(f"    -> sold kWh .............. {sold_kwh:>13,.1f}")

    # --- cost ---
    df_cost, missing = compute_costs(load_profile, spot, cfg)
    peak = peak_analysis(load_profile, cfg)
    summ = cost_summary(df_cost, peak["peak_kw"], sold_kwh, cfg)

    print("\n[2] COST (year)")
    print(f"    grid draw (bought) ....... {summ['grid_kwh']:>13,.1f} kWh")
    print(f"    sold (sessions) .......... {summ['sold_kwh']:>13,.1f} kWh")
    print(f"    loss / standby ........... {summ['loss_kwh']:>13,.1f} kWh  ({summ['loss_pct']:.1f} %)")
    print( "    ---------------------------------------------")
    print(f"    spot energy .............. {summ['spot_eur']:>13,.2f} EUR")
    print(f"    network energy charge .... {summ['ne_energy']:>13,.2f} EUR")
    print(f"    network demand charge(fix) {summ['ne_demand']:>13,.2f} EUR")
    print(f"    concession levy .......... {summ['concession']:>13,.2f} EUR")
    print(f"    electricity tax .......... {summ['electricity_tax']:>13,.2f} EUR")
    print(f"    statutory surcharges ..... {summ['surcharges']:>13,.2f} EUR")
    print(f"    supplier markup .......... {summ['supplier']:>13,.2f} EUR")
    print(f"    metering (fixed) ......... {summ['metering']:>13,.2f} EUR")
    print( "    =============================================")
    print(f"    COST TOTAL ............... {summ['cost_total']:>13,.2f} EUR")
    print(f"    cost per grid kWh ........ {summ['cost_per_grid_kwh_ct']:>13.2f} ct")
    print(f"    cost per SOLD kWh ........ {summ['cost_per_sold_kwh_ct']:>13.2f} ct  <- margin base")

    # --- profit for 30% and 40% ---
    print("\n[3] PRICE & PROFIT  (selling price = cost/sold kWh x (1 + margin))")
    for m in (0.30, 0.40):
        g = profit(summ, m)
        print(f"    margin {int(m*100)}%:  sell {g['sell_price_ct_kwh']:.1f} ct/kWh"
              f"  ->  revenue {g['revenue']:>11,.0f} EUR  ->  profit {g['profit']:>10,.0f} EUR")

    # --- peak ---
    print("\n[4] PEAK / DEMAND CHARGE")
    print(f"    annual peak .............. {peak['peak_kw']:.1f} kW  at {peak['peak_ts']}")
    print(f"    demand-charge cost ....... {peak['demand_charge_cost']:,.2f} EUR")
    print(f"    intervals > {peak['cap_kw']:.0f} kW ...... {peak['intervals_above_cap']}  "
          f"({peak['intervals_above_cap']/len(load_profile)*100:.2f} % of year)")
    print(f"    saving if capped at {peak['cap_kw']:.0f} kW: {peak['saving_at_cap']:,.2f} EUR/a")

    # --- load shift ---
    sh = load_shift(df_cost, cfg)
    print("\n[5] LOAD SHIFT  (expensive evening -> cheap midday hours)")
    print(f"    spot source hours {cfg['shift_from_hours']} .. {sh['spot_source_ct']:.2f} ct/kWh")
    print(f"    spot target hours {cfg['shift_to_hours']} .. {sh['spot_target_ct']:.2f} ct/kWh")
    print(f"    shifted energy ({int(cfg['shift_share']*100)}%) ... {sh['shifted_kwh']:,.0f} kWh")
    print(f"    energy-cost saving ....... {sh['energy_saving']:,.2f} EUR")
    print(f"    demand-charge saving ..... {sh['demand_saving']:,.2f} EUR")
    print(f"    -> total saving .......... {sh['total_saving']:,.2f} EUR/a")

    # --- exports ---
    prof = hourly_profile(df_cost)
    out_prof = os.path.join(cfg["outdir"], f"hourly_profile_{cfg['year']}.csv")
    prof.to_csv(out_prof)

    df_cost["month"] = df_cost["ts"].dt.to_period("M").astype(str)
    monthly = df_cost.groupby("month").agg(
        grid_kwh=("kwh", "sum"),
        cost_var_eur=("cost_var_eur", "sum"),
        peak_kw=("kw", "max"),
    ).round(2)
    out_month = os.path.join(cfg["outdir"], f"monthly_summary_{cfg['year']}.csv")
    monthly.to_csv(out_month)

    print(f"\n[6] EXPORTS")
    print(f"    {out_prof}")
    print(f"    {out_month}")
    print("\ndone.")


if __name__ == "__main__":
    main()