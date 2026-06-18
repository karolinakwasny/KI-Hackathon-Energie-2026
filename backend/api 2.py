#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Backend API (skeleton) for the charging-hub dashboard + nudge loop.

Serves the cleaned tables in data/clean/ as JSON for:
  * the CLIENT dashboard (operator): KPIs, time series, load pattern, strategy, campaign
  * the USER app: personalised offer + response logging

Also serves a sample frontend (operator dashboard + driver app) at /ui.

Run:
    uv run uvicorn api:app --reload --port 8000
Then open:
    http://localhost:8000/             -> operator dashboard
    http://localhost:8000/ui/app.html  -> driver app
    http://localhost:8000/docs         -> interactive API docs

Reads data/clean/master_15min.csv + sessions.csv. Run clean_data.py first.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

BASE = Path(__file__).resolve().parent
CLEAN = (BASE / "data" / "clean") if (BASE / "data" / "clean").is_dir() else (BASE / "clean")
FRONTEND = BASE / "frontend"

# Tariff / cost assumptions (mirror CLAUDE.md / Charging_hub_analysis CONFIG).
TARIFF = {
    "ne_energy_ct_kwh": 8.24,      # network energy charge (Arbeitspreis)
    "ne_demand_eur_kw": 19.76,     # network demand charge (Leistungspreis, on peak)
    "concession_ct_kwh": 0.11,
    "electricity_tax_ct_kwh": 2.05,   # assumption - verify
    "surcharges_ct_kwh": 0.0,
    "supplier_markup_ct_kwh": 0.0,
    "metering_eur_a": 131.51,
}

app = FastAPI(title="Charging-Hub Backend", version="0.1.0",
              description="Clean-data API for the dashboard + nudge workflow.")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

# Sample frontend (operator dashboard + driver app) served at /ui.
if FRONTEND.is_dir():
    app.mount("/ui", StaticFiles(directory=FRONTEND, html=True), name="ui")


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/ui/dashboard.html")


_cache: dict = {}


# --------------------------------------------------------------------------- #
def master() -> pd.DataFrame:
    try:
        import config
        return config.load_master()           # shared loader (correct tz parsing)
    except FileNotFoundError as e:
        raise HTTPException(503, f"{e} - run clean_data.py first.")


def sessions() -> pd.DataFrame:
    try:
        import config
        return config.load_sessions()
    except FileNotFoundError as e:
        raise HTTPException(503, f"{e} - run clean_data.py first.")


def _year(df: pd.DataFrame, year: int | None) -> pd.DataFrame:
    return df if year is None else df[df["year"] == year]


def _master_session_window(m: pd.DataFrame) -> tuple[pd.Timestamp, pd.Timestamp]:
    """Half-open session window covered by the 15-min master grid."""
    return m["ts"].min(), m["ts"].max() + pd.Timedelta(minutes=15)


def _sessions_in_window(s: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    return s[(s["start_ts"] >= start) & (s["start_ts"] < end)]


# --------------------------------------------------------------------------- #
@app.get("/health")
def health():
    return {"status": "ok", "clean_dir": str(CLEAN), "cached": list(_cache)}


@app.get("/meta")
def meta():
    """Years available + period covered, so the frontend can populate filters."""
    m = master()
    start, end = _master_session_window(m)
    return {
        "years": sorted(int(y) for y in m["year"].unique()),
        "period": {"start": str(m["ts"].min()), "end": str(m["ts"].max())},
        "session_overlap_window": {"start": str(start), "end": str(end)},
        "intervals": int(len(m)),
        "tariff": TARIFF,
    }


@app.get("/kpis")
def kpis(year: int = Query(2025)):
    """Headline numbers for the dashboard cards: energy, cost stack, peak, profit."""
    m = _year(master(), year)
    if m.empty:
        raise HTTPException(404, f"No data for year {year}.")
    start, end = _master_session_window(m)
    s = _sessions_in_window(_year(sessions(), year), start, end)

    grid_kwh = float(m["grid_kwh"].sum())
    sold_kwh = float(s["kwh"].sum())
    peak_kw = float(m["grid_kw"].max())
    t = TARIFF

    spot_eur = float((m["grid_kwh"] * m["spot_eur_kwh"].fillna(m["spot_eur_kwh"].mean())).sum())
    ne_energy = grid_kwh * t["ne_energy_ct_kwh"] / 100
    concession = grid_kwh * t["concession_ct_kwh"] / 100
    el_tax = grid_kwh * t["electricity_tax_ct_kwh"] / 100
    surcharges = grid_kwh * t["surcharges_ct_kwh"] / 100
    supplier = grid_kwh * t["supplier_markup_ct_kwh"] / 100
    ne_demand = peak_kw * t["ne_demand_eur_kw"]
    metering = t["metering_eur_a"]
    total = spot_eur + ne_energy + concession + el_tax + surcharges + supplier + ne_demand + metering
    cost_per_sold = total / sold_kwh if sold_kwh else 0

    def profit(margin):
        sell = cost_per_sold * (1 + margin)
        rev = sell * sold_kwh
        return {"margin": margin, "sell_ct_kwh": round(sell * 100, 2),
                "revenue_eur": round(rev, 2), "profit_eur": round(rev - total, 2)}

    return {
        "year": year,
        "period": {"start": str(m["ts"].min()), "end": str(m["ts"].max())},
        "session_overlap_window": {"start": str(start), "end": str(end)},
        "grid_kwh": round(grid_kwh, 1),
        "sold_kwh": round(sold_kwh, 1),
        "loss_pct": round((grid_kwh - sold_kwh) / grid_kwh * 100, 2) if grid_kwh else 0,
        "peak_kw": round(peak_kw, 1),
        "cost_eur": {
            "spot_energy": round(spot_eur, 2), "network_energy": round(ne_energy, 2),
            "network_demand": round(ne_demand, 2), "concession": round(concession, 2),
            "electricity_tax": round(el_tax, 2), "surcharges": round(surcharges, 2),
            "supplier_markup": round(supplier, 2), "metering": round(metering, 2),
            "total": round(total, 2),
        },
        "cost_per_sold_ct_kwh": round(cost_per_sold * 100, 2),
        "profit": [profit(0.30), profit(0.40)],
    }


@app.get("/timeseries")
def timeseries(year: int = Query(2025), freq: str = Query("D", description="pandas resample, e.g. H, D, W, M")):
    """Resampled buy/sell/price series for the dashboard charts."""
    m_year = _year(master(), year)
    m = m_year.set_index("ts")
    if m.empty:
        raise HTTPException(404, f"No data for year {year}.")
    start, end = _master_session_window(m_year)
    # tolerate legacy pandas offset aliases (pandas>=2.2 renamed M->ME etc.)
    freq = {"M": "ME", "Q": "QE", "Y": "YE", "A": "YE", "H": "h"}.get(freq, freq)
    try:
        g = m.resample(freq).agg(
            grid_kwh=("grid_kwh", "sum"), sold_kwh=("sold_kwh", "sum"),
            peak_kw=("grid_kw", "max"), spot_ct_kwh=("spot_ct_kwh", "mean"),
        ).reset_index()
    except ValueError as e:
        raise HTTPException(400, f"Invalid freq '{freq}': {e}")
    g["ts"] = g["ts"].astype(str)
    records = g.round(3).astype(object).where(pd.notna(g), None).to_dict("records")
    return {
        "year": year,
        "freq": freq,
        "period": {"start": str(m_year["ts"].min()), "end": str(m_year["ts"].max())},
        "session_overlap_window": {"start": str(start), "end": str(end)},
        "points": records,
    }


@app.get("/load-profile/hourly")
def hourly(year: int = Query(2025)):
    """Average shape by hour of day: load, price and sold energy."""
    m = _year(master(), year)
    if m.empty:
        raise HTTPException(404, f"No data for year {year}.")
    p = m.groupby("hour").agg(
        avg_kw=("grid_kw", "mean"), energy_kwh=("grid_kwh", "sum"),
        sold_kwh=("sold_kwh", "sum"), spot_ct_kwh=("spot_ct_kwh", "mean"),
    ).reset_index()
    p["energy_share_pct"] = (p["energy_kwh"] / p["energy_kwh"].sum() * 100)
    return {"year": year, "hours": p.round(2).to_dict("records")}


@app.get("/sessions/summary")
def sessions_summary(year: int = Query(2025)):
    """Audience sizing for the notification agent."""
    m = _year(master(), year)
    s_all = _year(sessions(), year)
    if m.empty:
        raise HTTPException(404, f"No master data for year {year}.")
    start, end = _master_session_window(m)
    s = _sessions_in_window(s_all, start, end)
    if s.empty:
        raise HTTPException(404, f"No sessions in master window for year {year}.")
    excluded = s_all[~s_all.index.isin(s.index)]
    return {
        "year": year,
        "period": {"start": str(s_all["start_ts"].min()), "end": str(s_all["start_ts"].max())},
        "session_overlap_window": {"start": str(start), "end": str(end)},
        "sessions": int(len(s)),
        "kwh": round(float(s["kwh"].sum()), 1),
        "excluded_outside_master_window": {
            "sessions": int(len(excluded)),
            "kwh": round(float(excluded["kwh"].sum()), 1),
        },
        "roaming": {"sessions": int(s["is_roaming"].sum()),
                    "kwh": round(float(s.loc[s["is_roaming"], "kwh"].sum()), 1)},
        "notifiable": {"sessions": int(s["notifiable"].sum()),
                       "kwh": round(float(s.loc[s["notifiable"], "kwh"].sum()), 1),
                       "contracts": int(s.loc[s["notifiable"], "contract_id"].nunique())},
        "auth_types": s["auth_type"].value_counts().to_dict(),
        "anomalies": int(s["is_anomaly"].sum()),
    }


@app.get("/strategy/tou")
def strategy_tou(year: int = Query(2025), n: int = Query(4, description="hours per band")):
    """Cheapest vs most-expensive hours -> a time-of-use steering suggestion.

    The real strategy/ML lives in the next layer; this returns the data-driven
    skeleton the frontend can render and the nudge engine will act on.
    """
    m = _year(master(), year)
    if m.empty:
        raise HTTPException(404, f"No data for year {year}.")
    by_hour = m.groupby("hour")["spot_ct_kwh"].mean().sort_values()
    cheap = by_hour.head(n)
    pricey = by_hour.tail(n)
    spread = float(pricey.mean() - cheap.mean())
    return {
        "year": year,
        "cheap_hours": [int(h) for h in cheap.index],
        "expensive_hours": [int(h) for h in pricey.index],
        "cheap_avg_ct_kwh": round(float(cheap.mean()), 2),
        "expensive_avg_ct_kwh": round(float(pricey.mean()), 2),
        "spread_ct_kwh": round(spread, 2),
        "suggestion": (f"Offer a discount to move charging from hours "
                       f"{[int(h) for h in pricey.index]} into "
                       f"{[int(h) for h in cheap.index]} "
                       f"(~{round(spread, 1)} ct/kWh cheaper energy)."),
    }


# --- ANALYTICS (cost engine layer) ---------------------------------------- #
@app.get("/analytics/peak")
def analytics_peak(year: int = Query(2025), cap_kw: float = Query(300.0)):
    """Annual peak + demand-charge sensitivity (peak shaving lever)."""
    import analytics
    try:
        return analytics.peak_analysis(year, cap_kw=cap_kw)
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.get("/analytics/load-shift")
def analytics_load_shift(year: int = Query(2025), shift_share: float = Query(0.30)):
    """What-if saving from steering evening load into cheap midday hours."""
    import analytics
    try:
        return analytics.load_shift(year, shift_share=shift_share)
    except ValueError as e:
        raise HTTPException(404, str(e))


# --- STRATEGY (build offers for the addressable audience) ------------------ #
@app.get("/strategy/offers")
def strategy_offers(year: int = Query(2025), limit: int = Query(50)):
    """Per-customer ToU offers for the notifiable audience (top `limit`)."""
    import strategy
    offers = strategy.build_offers(year)
    offers.sort(key=lambda o: o.expected_saving_eur, reverse=True)
    return {"year": year, "total_offers": len(offers),
            "offers": [o.to_dict() for o in offers[:limit]]}


# --- CAMPAIGN (NOTIFY + MEASURE in one call) ------------------------------ #
@app.post("/campaign/simulate")
def campaign_simulate(year: int = Query(2025), conversion: float = Query(0.5),
                      seed: int = Query(42)):
    """Run the simulated nudge loop: build offers -> send -> simulate responses
    -> attribute. Writes the notification/response logs and returns the result."""
    import strategy, notify, attribution
    offers = strategy.build_offers(year)
    records = notify.send_offers(offers)
    notify.simulate_responses(records, conversion=conversion, seed=seed, offers=offers)
    return attribution.attribute(year).to_dict()


@app.get("/attribution")
def attribution_summary(year: int = Query(2025)):
    """Campaign attribution from the existing logs (run /campaign/simulate first)."""
    import attribution
    return attribution.attribute(year).to_dict()


# --- USER side ------------------------------------------------------------ #
@app.get("/users/{contract_id}/offer")
def user_offer(contract_id: str, year: int = Query(2025)):
    """Personalised offer for one contract (uses the contract's own history)."""
    import strategy
    return strategy.build_offer(contract_id, year).to_dict()


@app.post("/users/{contract_id}/response")
def user_response(contract_id: str, notification_id: str = Query(...),
                  accepted: bool = Query(...), shifted_kwh: float = Query(0.0)):
    """Log a real user response into RESPONSES_LOG (feeds the MEASURE step)."""
    import config
    from models import ResponseRecord
    from notify import _append_csv, _now_iso
    rec = ResponseRecord(notification_id=notification_id, contract_id=contract_id,
                         responded_ts=_now_iso(), accepted=accepted,
                         shifted_kwh=shifted_kwh)
    _append_csv(config.RESPONSES_LOG, ResponseRecord.COLUMNS, [rec.to_dict()])
    return {"logged": True, **rec.to_dict()}
