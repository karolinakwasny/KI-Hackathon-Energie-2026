#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Shared configuration + clean-data loaders. SINGLE SOURCE OF TRUTH.

Every module (strategy, notify, attribution, analytics, api) imports paths,
constants, the TARIFF dict and the load_*() helpers from here. Do NOT redefine
these elsewhere. This file is owned by the integration layer — module agents
should import from it, not edit it.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent
DATA = BASE / "data" if (BASE / "data").is_dir() else BASE
CLEAN = DATA / "clean"

MASTER_CSV = CLEAN / "master_15min.csv"
SESSIONS_CSV = CLEAN / "sessions.csv"
NOTIFICATIONS_LOG = CLEAN / "notifications_log.csv"   # written by notify.py
RESPONSES_LOG = CLEAN / "responses_log.csv"           # written by notify.py

TZ = "Europe/Berlin"
DEFAULT_YEAR = 2025
ROAMING_CONTRACT = "DE-LDK-C00480594"   # foreign EMP roaming (not notifiable)
NOTIFIABLE_AUTH = {"App", "Webseite"}
MIN_KWH_SESSION = 0.5

# Tariff / cost assumptions (mirror CLAUDE.md). cent/kWh unless noted.
TARIFF = {
    "ne_energy_ct_kwh": 8.24,       # network energy charge (Arbeitspreis)
    "ne_demand_eur_kw": 19.76,      # network demand charge (Leistungspreis, on peak)
    "concession_ct_kwh": 0.11,
    "electricity_tax_ct_kwh": 2.05,  # ASSUMPTION - verify
    "surcharges_ct_kwh": 0.0,
    "supplier_markup_ct_kwh": 0.0,
    "metering_eur_a": 131.51,        # EUR/year (fixed)
}


def _parse_tz(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """Parse tz-aware columns. The CSV stores mixed CET/CEST offsets, which
    parse_dates can't collapse into one column, so parse via UTC then convert
    to Europe/Berlin (yields a proper datetime64[ns, tz] column)."""
    for c in cols:
        if c in df.columns:
            df[c] = pd.to_datetime(df[c], utc=True, errors="coerce").dt.tz_convert(TZ)
    return df


@lru_cache(maxsize=1)
def load_master() -> pd.DataFrame:
    """The 15-min BUY+PRICE+SELL grid. Columns: see clean_data.build_master."""
    if not MASTER_CSV.exists():
        raise FileNotFoundError(f"{MASTER_CSV} missing - run clean_data.py first.")
    return _parse_tz(pd.read_csv(MASTER_CSV), ["ts"])


@lru_cache(maxsize=1)
def load_sessions() -> pd.DataFrame:
    """Per-session table. Columns: see clean_data.clean_sessions."""
    if not SESSIONS_CSV.exists():
        raise FileNotFoundError(f"{SESSIONS_CSV} missing - run clean_data.py first.")
    return _parse_tz(pd.read_csv(SESSIONS_CSV), ["start_ts", "end_ts"])


def filter_year(df: pd.DataFrame, year: int | None) -> pd.DataFrame:
    return df if year is None else df[df["year"] == year]
