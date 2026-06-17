#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cleaning layer (implements backend.md).

Turns the raw xlsx files in backend/data/ into two canonical, validated tables in
backend/data/clean/ that the analytics, strategy, ML and API layers all consume:

  * master_15min.csv  -- one row per 15-min interval (the BUY + PRICE + SELL grid)
  * sessions.csv      -- one row per charging session (per-user grain, for nudging/ML)
  * _report.json      -- row counts, drops-by-reason, validation checks

Run:  uv run python clean_data.py
Downstream code reads data/clean/*, never the raw xlsx.

German tokens are kept where they must match raw columns/sheets (commented inline);
see the glossary in CLAUDE.md.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

BASE = Path(__file__).resolve().parent
DATA = BASE / "data" if (BASE / "data").is_dir() else BASE
CLEAN = DATA / "clean"
CLEAN.mkdir(parents=True, exist_ok=True)

TZ = "Europe/Berlin"
ROAMING_CONTRACT = "DE-LDK-C00480594"     # foreign EMP roaming contract (not notifiable)
NOTIFIABLE_AUTH = {"App", "Webseite"}     # auth types we can push offers to
BILLED_VALUE = "Abgerechnet"              # Abrechnung value when billed
MIN_KWH_SESSION = 0.5                     # drop near-zero sessions below this

report: dict = {"tables": {}, "validation": [], "warnings": []}


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def find(substr: str) -> Path:
    for p in DATA.iterdir():
        if substr.lower() in p.name.lower():
            return p
    raise FileNotFoundError(f"No raw file matching '{substr}' in {DATA}")


def time_to_timedelta(x) -> pd.Timedelta:
    """time-of-day (datetime.time / Timestamp / 'HH:MM:SS') -> Timedelta."""
    if pd.isna(x):
        return pd.Timedelta(0)
    if hasattr(x, "hour"):
        return pd.Timedelta(hours=x.hour, minutes=getattr(x, "minute", 0),
                            seconds=getattr(x, "second", 0))
    return pd.to_timedelta(str(x))


def localize(naive: pd.Series, ambiguous="infer") -> pd.Series:
    """Localize a tz-naive wall-clock series to Europe/Berlin, handling DST.

    'infer' works for complete, ordered series (load profile, spot). For scattered
    timestamps (sessions) pass ambiguous=True and we record the approximation.
    """
    try:
        return naive.dt.tz_localize(TZ, ambiguous=ambiguous,
                                    nonexistent="shift_forward")
    except Exception as e:  # pragma: no cover - defensive
        report["warnings"].append(f"tz_localize fell back to ambiguous=True: {e}")
        return naive.dt.tz_localize(TZ, ambiguous=True, nonexistent="shift_forward")


_DWELL_RE = {
    "h": re.compile(r"(\d+)\s*Stunde"),
    "m": re.compile(r"(\d+)\s*Minute"),
    "s": re.compile(r"(\d+)\s*Sekunde"),
}


def parse_dwell_seconds(text) -> float:
    """'1 Stunde 29 Minuten 30 Sekunden' -> seconds. NaN if unparseable."""
    if pd.isna(text):
        return np.nan
    t = str(text)
    h = _DWELL_RE["h"].search(t)
    m = _DWELL_RE["m"].search(t)
    s = _DWELL_RE["s"].search(t)
    if not (h or m or s):
        return np.nan
    return (int(h.group(1)) if h else 0) * 3600 \
        + (int(m.group(1)) if m else 0) * 60 \
        + (int(s.group(1)) if s else 0)


def dst_flags_from_counts(ts: pd.Series) -> pd.Series:
    """Mark each row's DST status from how many intervals its calendar day has."""
    day = ts.dt.tz_convert(TZ).dt.normalize() if ts.dt.tz is not None else ts.dt.normalize()
    counts = day.map(day.value_counts())
    out = pd.Series("normal", index=ts.index)
    out[counts < 96] = "spring_skip"   # 23h day (spring-forward)
    out[counts > 96] = "fall_repeat"   # 25h day (fall-back)
    return out


# --------------------------------------------------------------------------- #
# 1. Lastgang -> load_profile (grid meter, what we BUY)
# --------------------------------------------------------------------------- #
def clean_load() -> pd.DataFrame:
    f = find("Lastgang")
    frames = []
    for sheet in pd.ExcelFile(f).sheet_names:
        raw = pd.read_excel(f, sheet_name=sheet, header=None)
        d = raw.iloc[:, [4, 5, 6, 7]].copy()          # date, time, kWh, kW
        d.columns = ["date", "time", "grid_kwh", "grid_kw"]
        d["grid_kwh"] = pd.to_numeric(d["grid_kwh"], errors="coerce")
        d["grid_kw"] = pd.to_numeric(d["grid_kw"], errors="coerce")
        d["date"] = pd.to_datetime(d["date"], errors="coerce")
        d = d.dropna(subset=["date", "grid_kwh"]).reset_index(drop=True)  # drops headers
        naive = d["date"].dt.normalize() + d["time"].map(time_to_timedelta)
        d["ts"] = localize(naive, ambiguous="infer")
        frames.append(d[["ts", "grid_kwh", "grid_kw"]])
    out = (pd.concat(frames, ignore_index=True)
             .dropna(subset=["ts"])
             .drop_duplicates("ts")
             .sort_values("ts")
             .reset_index(drop=True))
    out["dst_flag"] = dst_flags_from_counts(out["ts"])
    report["tables"]["load_profile_rows"] = len(out)
    return out


# --------------------------------------------------------------------------- #
# 2. Spotmarktpreis -> spot_price (uniform 15-min grid)
# --------------------------------------------------------------------------- #
def clean_spot() -> pd.DataFrame:
    f = find("Spotmarkt")
    parts = []
    for sheet in pd.ExcelFile(f).sheet_names:
        if "spot" not in sheet.lower():
            continue                                   # skip 'Quelle'
        s = pd.read_excel(f, sheet_name=sheet, header=0).iloc[:, [0, 1, 5]]
        s.columns = ["date", "von", "price_ct"]        # von = interval start time
        s["date"] = pd.to_datetime(s["date"], errors="coerce")
        s["price_ct"] = pd.to_numeric(s["price_ct"], errors="coerce")
        s = s.dropna(subset=["date", "price_ct"])
        naive = s["date"].dt.normalize() + s["von"].map(time_to_timedelta)
        s["ts"] = naive.values
        s = s.dropna(subset=["ts"]).sort_values("ts").reset_index(drop=True)

        # native resolution from the modal spacing of this sheet
        step = s["ts"].diff().dt.total_seconds().mode()
        is_hourly = (not step.empty) and step.iloc[0] == 3600
        s["native_resolution"] = "hourly" if is_hourly else "15min"

        if is_hourly:
            # broadcast each hourly price to its four 15-min slots
            s = s.loc[s.index.repeat(4)].reset_index(drop=True)
            offset = np.tile([0, 15, 30, 45], len(s) // 4)
            s["ts"] = s["ts"] + pd.to_timedelta(offset, unit="m")
        parts.append(s[["ts", "price_ct", "native_resolution"]])

    spot = (pd.concat(parts, ignore_index=True)
              .dropna(subset=["ts"])
              .drop_duplicates("ts")            # sheets meet at a boundary
              .sort_values("ts")
              .reset_index(drop=True))
    spot["ts"] = localize(spot["ts"], ambiguous="infer")
    spot = spot.dropna(subset=["ts"]).drop_duplicates("ts")
    spot = spot.rename(columns={"price_ct": "spot_ct_kwh"})
    spot["spot_eur_kwh"] = spot["spot_ct_kwh"] / 100.0
    report["tables"]["spot_price_rows"] = len(spot)
    return spot


# --------------------------------------------------------------------------- #
# 3. Ladevorgaenge -> sessions (what we SELL, per-user grain)
# --------------------------------------------------------------------------- #
def clean_sessions() -> pd.DataFrame:
    f = find("Ladevorg")
    ev = pd.read_excel(f, sheet_name="Ladevorgaenge", header=0)
    ev.columns = [str(c).strip() for c in ev.columns]
    n0 = len(ev)

    out = pd.DataFrame()
    out["session_id"] = pd.to_numeric(ev["ID"], errors="coerce").astype("Int64")
    out["charge_point"] = ev["Ladepunkt"].astype(str)
    out["start_ts"] = localize(pd.to_datetime(ev["Gestartet"], errors="coerce"),
                               ambiguous=True)
    out["end_ts"] = localize(pd.to_datetime(ev["Beendet"], errors="coerce"),
                             ambiguous=True)
    out["kwh"] = pd.to_numeric(ev["Verbrauch (kWh)"], errors="coerce")
    out["dwell_s"] = ev["Standzeit"].map(parse_dwell_seconds)
    out["charge_duration_s"] = (out["end_ts"] - out["start_ts"]).dt.total_seconds()
    out["flex_headroom_s"] = (out["dwell_s"] - out["charge_duration_s"]).clip(lower=0)

    out["contract_id"] = ev["Vertrag"].astype(str)
    out["is_roaming"] = out["contract_id"] == ROAMING_CONTRACT
    out["auth_type"] = ev["Auth. Typ"].astype(str)
    out["notifiable"] = (~out["is_roaming"]) & out["auth_type"].isin(NOTIFIABLE_AUTH)
    out["status"] = ev["Status"].astype(str)
    out["billing_status"] = ev["Abrechnung"].astype(str)
    out["anomaly_reason"] = ev["Grund für die Auffälligkeit"].astype(str)
    out["is_anomaly"] = out["anomaly_reason"].str.strip() != "-"

    # --- drops (counted) ---
    drop_nan = out["kwh"].isna()
    drop_small = out["kwh"] < MIN_KWH_SESSION
    report["tables"]["sessions_raw"] = n0
    report["tables"]["sessions_dropped_kwh_missing"] = int(drop_nan.sum())
    report["tables"]["sessions_dropped_too_small"] = int((drop_small & ~drop_nan).sum())
    out = out[~(drop_nan | drop_small)].copy()

    out["year"] = out["start_ts"].dt.year
    out["month"] = out["start_ts"].dt.strftime("%Y-%m")
    out = out.sort_values("start_ts").reset_index(drop=True)

    report["tables"]["sessions_clean"] = len(out)
    report["tables"]["sessions_flagged_anomaly"] = int(out["is_anomaly"].sum())
    report["tables"]["sessions_not_billed"] = int((out["billing_status"] != BILLED_VALUE).sum())
    report["tables"]["sessions_notifiable"] = int(out["notifiable"].sum())
    if out["session_id"].duplicated().any():
        report["warnings"].append("Duplicate session_id values present.")
    return out


# --------------------------------------------------------------------------- #
# 4. Build the single master 15-min table (BUY + PRICE + SELL)
# --------------------------------------------------------------------------- #
def build_master(load: pd.DataFrame, spot: pd.DataFrame,
                 sessions: pd.DataFrame) -> pd.DataFrame:
    m = load.merge(spot[["ts", "spot_ct_kwh", "spot_eur_kwh", "native_resolution"]],
                   on="ts", how="left")
    m = m.rename(columns={"native_resolution": "spot_native_resolution"})
    m["spot_missing"] = m["spot_ct_kwh"].isna()

    # aggregate sold energy onto the 15-min grid by the session's START interval
    s = sessions.dropna(subset=["start_ts"]).copy()
    s["ts"] = s["start_ts"].dt.floor("15min")
    agg = s.groupby("ts").agg(
        sold_kwh=("kwh", "sum"),
        session_count=("kwh", "size"),
        sold_kwh_roaming=("kwh", lambda x: x[s.loc[x.index, "is_roaming"]].sum()),
        sold_kwh_notifiable=("kwh", lambda x: x[s.loc[x.index, "notifiable"]].sum()),
    )
    m = m.merge(agg, on="ts", how="left")
    for c in ["sold_kwh", "session_count", "sold_kwh_roaming", "sold_kwh_notifiable"]:
        m[c] = m[c].fillna(0)            # genuine zero: no session started here
    m["session_count"] = m["session_count"].astype(int)

    # calendar helpers for the dashboard
    m["date"] = m["ts"].dt.date
    m["year"] = m["ts"].dt.year
    m["month"] = m["ts"].dt.strftime("%Y-%m")
    m["hour"] = m["ts"].dt.hour

    cols = ["ts", "date", "year", "month", "hour", "dst_flag",
            "grid_kwh", "grid_kw",
            "spot_ct_kwh", "spot_eur_kwh", "spot_native_resolution", "spot_missing",
            "sold_kwh", "session_count", "sold_kwh_roaming", "sold_kwh_notifiable"]
    m = m[cols].sort_values("ts").reset_index(drop=True)
    report["tables"]["master_rows"] = len(m)
    report["tables"]["master_spot_missing"] = int(m["spot_missing"].sum())
    return m


# --------------------------------------------------------------------------- #
# 5. validation (soft = warn, hard = abort)
# --------------------------------------------------------------------------- #
def check(name: str, ok: bool, actual, expected, hard=False) -> None:
    report["validation"].append({"check": name, "pass": bool(ok),
                                 "actual": actual, "expected": expected,
                                 "severity": "HARD" if hard else "SOFT"})
    if hard and not ok:
        raise AssertionError(f"HARD validation failed: {name} (got {actual}, want {expected})")


def validate(master: pd.DataFrame, sessions: pd.DataFrame) -> None:
    # HARD: no negative / NaN energy on the grid
    check("grid_kwh non-negative & non-null",
          bool((master["grid_kwh"] >= 0).all()), None, ">=0", hard=True)
    check("session kwh > 0 after clean",
          bool((sessions["kwh"] > 0).all()), None, ">0", hard=True)

    # SOFT: 2025 totals vs known baseline
    g25 = master.loc[master["year"] == 2025, "grid_kwh"].sum()
    check("2025 grid kWh ~= 271,214.55", abs(g25 - 271214.55) / 271214.55 < 0.005,
          round(float(g25), 2), 271214.55)
    peak25 = master.loc[master["year"] == 2025, "grid_kw"].max()
    check("2025 peak kW ~= 393.6", abs(peak25 - 393.6) < 2.0,
          round(float(peak25), 1), 393.6)
    sold25 = sessions.loc[sessions["year"] == 2025, "kwh"].sum()
    check("2025 sold kWh ~= 250,472.6", abs(sold25 - 250472.6) / 250472.6 < 0.005,
          round(float(sold25), 1), 250472.6)

    # cross-source reconciliation: buy >= sell, loss in a sane band
    if g25 and sold25:
        loss = 1 - sold25 / g25
        check("2025 grid >= sold (buy>=sell)", g25 >= sold25, None, "buy>=sell", hard=True)
        check("2025 loss ratio in 5-10%", 0.05 <= loss <= 0.10,
              round(float(loss) * 100, 2), "5-10%")


# --------------------------------------------------------------------------- #
def to_csv(df: pd.DataFrame, name: str) -> Path:
    path = CLEAN / name
    df.to_csv(path, index=False)
    return path


def main() -> None:
    print("Cleaning raw -> data/clean/ ...")
    load = clean_load()
    spot = clean_spot()
    sessions = clean_sessions()
    master = build_master(load, spot, sessions)

    validate(master, sessions)

    p1 = to_csv(master, "master_15min.csv")
    p2 = to_csv(sessions, "sessions.csv")
    with open(CLEAN / "_report.json", "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False, default=str)

    print(f"  master_15min.csv : {len(master):>6,} rows  -> {p1}")
    print(f"  sessions.csv     : {len(sessions):>6,} rows  -> {p2}")
    print("\nValidation:")
    for v in report["validation"]:
        mark = "OK " if v["pass"] else "!! "
        print(f"  [{mark}{v['severity']}] {v['check']}: got {v['actual']} (want {v['expected']})")
    if report["warnings"]:
        print("\nWarnings:")
        for w in report["warnings"]:
            print("  -", w)
    print("\ndone.")


if __name__ == "__main__":
    main()
