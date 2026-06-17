#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ANALYTICS layer — importable cost / profit / peak / load-shape functions.

Refactor of Charging_hub_analysis.py into pure functions that read the clean
master grid (config.load_master). The API + strategy import these.

SEAM: signatures below are frozen. Implement the bodies; do not change names,
args, or return-dict keys. Read from config.TARIFF / config.load_master.
"""
from __future__ import annotations

import pandas as pd

from config import TARIFF, load_master, load_sessions, filter_year, DEFAULT_YEAR


def cost_summary(year: int = DEFAULT_YEAR, tariff: dict = TARIFF) -> dict:
    """Annual cost stack on the grid draw + fixed demand/metering.

    Returns keys: grid_kwh, sold_kwh, loss_kwh, loss_pct, spot_eur, ne_energy,
    ne_demand, concession, electricity_tax, surcharges, supplier, metering,
    cost_total, cost_per_grid_kwh_ct, cost_per_sold_kwh_ct.
    """
    m = filter_year(load_master(), year)
    s = filter_year(load_sessions(), year)
    if m.empty:
        raise ValueError(f"No master data for year {year}.")

    grid_kwh = float(m["grid_kwh"].sum())
    sold_kwh = float(s["kwh"].sum())
    peak_kw = float(m["grid_kw"].max())
    t = tariff

    # spot can be NaN on some intervals (spot_missing) — fill with the mean so
    # the total stays sane (mirror api.py /kpis).
    spot_eur = float((m["grid_kwh"] * m["spot_eur_kwh"].fillna(m["spot_eur_kwh"].mean())).sum())
    ne_energy = grid_kwh * t["ne_energy_ct_kwh"] / 100
    concession = grid_kwh * t["concession_ct_kwh"] / 100
    electricity_tax = grid_kwh * t["electricity_tax_ct_kwh"] / 100
    surcharges = grid_kwh * t["surcharges_ct_kwh"] / 100
    supplier = grid_kwh * t["supplier_markup_ct_kwh"] / 100
    ne_demand = peak_kw * t["ne_demand_eur_kw"]
    metering = t["metering_eur_a"]
    cost_total = (spot_eur + ne_energy + concession + electricity_tax
                  + surcharges + supplier + ne_demand + metering)

    return {
        "grid_kwh": round(grid_kwh, 1),
        "sold_kwh": round(sold_kwh, 1),
        "loss_kwh": round(grid_kwh - sold_kwh, 1),
        "loss_pct": round((grid_kwh - sold_kwh) / grid_kwh * 100, 2) if grid_kwh else 0.0,
        "spot_eur": round(spot_eur, 2),
        "ne_energy": round(ne_energy, 2),
        "ne_demand": round(ne_demand, 2),
        "concession": round(concession, 2),
        "electricity_tax": round(electricity_tax, 2),
        "surcharges": round(surcharges, 2),
        "supplier": round(supplier, 2),
        "metering": round(metering, 2),
        "cost_total": round(cost_total, 2),
        "cost_per_grid_kwh_ct": round(cost_total / grid_kwh * 100, 2) if grid_kwh else 0.0,
        "cost_per_sold_kwh_ct": round(cost_total / sold_kwh * 100, 2) if sold_kwh else 0.0,
    }


def profit(summary: dict, margin: float) -> dict:
    """Margin applied to cost-per-SOLD-kWh (NOT grid kWh — see CLAUDE.md §4).

    Returns: margin, sell_price_ct_kwh, revenue_eur, profit_eur, profit_pct_on_cost.
    """
    cost_total = summary["cost_total"]
    sold_kwh = summary["sold_kwh"]
    cost_per_sold_ct = summary["cost_per_sold_kwh_ct"]

    sell_price_ct_kwh = cost_per_sold_ct * (1 + margin)
    revenue_eur = sell_price_ct_kwh / 100 * sold_kwh
    profit_eur = revenue_eur - cost_total

    return {
        "margin": margin,
        "sell_price_ct_kwh": round(sell_price_ct_kwh, 2),
        "revenue_eur": round(revenue_eur, 2),
        "profit_eur": round(profit_eur, 2),
        "profit_pct_on_cost": round(profit_eur / cost_total * 100, 2) if cost_total else 0.0,
    }


def peak_analysis(year: int = DEFAULT_YEAR, cap_kw: float = 300.0,
                  tariff: dict = TARIFF) -> dict:
    """Annual peak + demand-charge sensitivity.

    Returns: peak_kw, peak_ts, demand_charge_eur, cap_kw, intervals_above_cap,
    saving_at_cap_eur, top10 (list of {ts, kw}).
    """
    m = filter_year(load_master(), year)
    if m.empty:
        raise ValueError(f"No master data for year {year}.")

    peak_kw = float(m["grid_kw"].max())
    peak_ts = str(m.loc[m["grid_kw"].idxmax(), "ts"])
    demand_charge_eur = peak_kw * tariff["ne_demand_eur_kw"]

    above = m[m["grid_kw"] > cap_kw]
    # capping the peak to cap_kw lowers the (fixed) demand charge by the shaved kW
    capped_peak = min(peak_kw, cap_kw)
    saving_at_cap_eur = (peak_kw - capped_peak) * tariff["ne_demand_eur_kw"]

    top = m.nlargest(10, "grid_kw")[["ts", "grid_kw"]]
    top10 = [{"ts": str(r.ts), "kw": round(float(r.grid_kw), 1)}
             for r in top.itertuples(index=False)]

    return {
        "peak_kw": round(peak_kw, 1),
        "peak_ts": peak_ts,
        "demand_charge_eur": round(demand_charge_eur, 2),
        "cap_kw": cap_kw,
        "intervals_above_cap": int(len(above)),
        "saving_at_cap_eur": round(saving_at_cap_eur, 2),
        "top10": top10,
    }


def hourly_profile(year: int = DEFAULT_YEAR) -> pd.DataFrame:
    """Per hour-of-day: energy_kwh, avg_kw, max_kw, spot_ct, sold_kwh, energy_share_pct."""
    m = filter_year(load_master(), year)
    if m.empty:
        raise ValueError(f"No master data for year {year}.")

    p = m.groupby("hour").agg(
        energy_kwh=("grid_kwh", "sum"),
        avg_kw=("grid_kw", "mean"),
        max_kw=("grid_kw", "max"),
        spot_ct=("spot_ct_kwh", "mean"),
        sold_kwh=("sold_kwh", "sum"),
    ).reset_index()
    p["energy_share_pct"] = p["energy_kwh"] / p["energy_kwh"].sum() * 100
    return p.round(2)


def load_shift(year: int = DEFAULT_YEAR, shift_share: float = 0.30,
               from_hours=(16, 17, 18, 19), to_hours=(10, 11, 12, 13, 14),
               cap_kw: float = 300.0, tariff: dict = TARIFF) -> dict:
    """What-if: move shift_share of energy from from_hours into to_hours + cap peak.

    Returns: spot_source_ct, spot_target_ct, shifted_kwh, energy_saving_eur,
    demand_saving_eur, total_saving_eur.
    """
    m = filter_year(load_master(), year)
    if m.empty:
        raise ValueError(f"No master data for year {year}.")

    spot = m["spot_ct_kwh"].fillna(m["spot_ct_kwh"].mean())
    from_mask = m["hour"].isin(from_hours)
    to_mask = m["hour"].isin(to_hours)

    # volume-weighted avg spot in each band (ct/kWh)
    from_kwh = float(m.loc[from_mask, "grid_kwh"].sum())
    to_kwh = float(m.loc[to_mask, "grid_kwh"].sum())
    spot_source_ct = float((m.loc[from_mask, "grid_kwh"] * spot[from_mask]).sum() / from_kwh) if from_kwh else 0.0
    spot_target_ct = float((m.loc[to_mask, "grid_kwh"] * spot[to_mask]).sum() / to_kwh) if to_kwh else 0.0

    shifted_kwh = from_kwh * shift_share
    # energy saving = volume moved * price spread (expensive -> cheap)
    energy_saving_eur = shifted_kwh * (spot_source_ct - spot_target_ct) / 100

    # peak shaving: capping site load to cap_kw cuts the fixed demand charge
    peak_kw = float(m["grid_kw"].max())
    demand_saving_eur = max(0.0, peak_kw - cap_kw) * tariff["ne_demand_eur_kw"]

    total_saving_eur = energy_saving_eur + demand_saving_eur

    return {
        "spot_source_ct": round(spot_source_ct, 2),
        "spot_target_ct": round(spot_target_ct, 2),
        "shifted_kwh": round(shifted_kwh, 1),
        "energy_saving_eur": round(energy_saving_eur, 2),
        "demand_saving_eur": round(demand_saving_eur, 2),
        "total_saving_eur": round(total_saving_eur, 2),
    }


if __name__ == "__main__":
    import json
    print(json.dumps(cost_summary(), indent=2, default=str))
