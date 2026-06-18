#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ATTRIBUTION layer (MEASURE step) — turn logged responses into € saved / uplift.

Reads config.RESPONSES_LOG + config.NOTIFICATIONS_LOG + the clean sessions/master,
and computes how much energy was shifted and what the operator saved (energy-cost
spread on shifted kWh + any demand-charge relief).

IMPORTANT (CLAUDE.md §2): true uplift needs a live A/B holdout — historical nudges
never happened. Here conversion is a parameter; expose the result as a parameterised
estimate and structure for a real control group later.

SEAM: frozen signature + return type (models.AttributionResult). Implement the body.
Import shared bits from config.py / models.py.
"""
from __future__ import annotations

import pandas as pd

from config import NOTIFICATIONS_LOG, RESPONSES_LOG, TARIFF, load_master, DEFAULT_YEAR
from models import AttributionResult, NotificationRecord, ResponseRecord


def _empty(columns: list[str]) -> pd.DataFrame:
    """Empty frame with exactly the given columns (so downstream joins/sums work)."""
    return pd.DataFrame(columns=columns)


def load_logs() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Read notifications + responses logs (empty frames with right columns if absent).

    This is the ONLY file reader in this module; the compute helpers below take
    DataFrames so they can be unit-tested without the real CSVs existing.
    """
    if NOTIFICATIONS_LOG.exists():
        notifications = pd.read_csv(NOTIFICATIONS_LOG)
    else:
        notifications = _empty(NotificationRecord.COLUMNS)

    if RESPONSES_LOG.exists():
        responses = pd.read_csv(RESPONSES_LOG)
    else:
        responses = _empty(ResponseRecord.COLUMNS)

    return notifications, responses


def _spot_spread(year: int, n: int = 4) -> float:
    """Cheap-vs-expensive spot spread (ct/kWh) for the year.

    Mirrors strategy.tou_bands / api.strategy_tou: group master by hour-of-day,
    take mean spot of the top-`n` expensive hours minus the bottom-`n` cheap hours.
    Returns 0.0 if master has no rows for the year (so valuation degrades to 0).
    """
    m = load_master()
    m = m[m["year"] == year]
    if m.empty:
        return 0.0
    by_hour = m.groupby("hour")["spot_ct_kwh"].mean().sort_values()
    cheap = by_hour.head(n)
    pricey = by_hour.tail(n)
    return float(pricey.mean() - cheap.mean())


def _truthy(series: pd.Series) -> pd.Series:
    """Coerce a logged `accepted` column to bool.

    CSV round-trips can yield bool, the strings "True"/"False", or 0/1; normalise
    all of them so the accepted mask is correct regardless of how notify.py wrote it.
    """
    if series.dtype == bool:
        return series
    return series.astype(str).str.strip().str.lower().isin({"true", "1", "1.0", "yes"})


def _join(notifications: pd.DataFrame, responses: pd.DataFrame, year: int) -> pd.DataFrame:
    """Join responses to notifications on notification_id, restricted to `year`.

    The year comes from the notifications log (the responses log carries no year).
    Returns one row per response that matches a notification sent in `year`, with
    an `accepted` bool and numeric `shifted_kwh`.
    """
    if notifications.empty:
        return pd.DataFrame(columns=["notification_id", "contract_id", "accepted", "shifted_kwh"])

    notif = notifications.copy()
    notif["year"] = pd.to_numeric(notif["year"], errors="coerce")
    notif = notif[notif["year"] == year]

    # contract_id is authoritative from the notification side.
    notif_keys = notif[["notification_id", "contract_id"]]

    if responses.empty:
        resp = _empty(ResponseRecord.COLUMNS)
    else:
        resp = responses.copy()

    joined = notif_keys.merge(
        resp[["notification_id", "accepted", "shifted_kwh"]],
        on="notification_id", how="left",
    )
    joined["accepted"] = _truthy(joined["accepted"].fillna(False))
    joined["shifted_kwh"] = pd.to_numeric(joined["shifted_kwh"], errors="coerce").fillna(0.0)
    return joined


def attribute(year: int = DEFAULT_YEAR, tariff: dict = TARIFF) -> AttributionResult:
    """Campaign-level attribution from the logs.

    Value shifted kWh at the cheap-vs-expensive spot spread (energy_saving), add
    demand_saving if peak relief applies, sum to total_saving. Returns
    models.AttributionResult.
    """
    notifications, responses = load_logs()
    joined = _join(notifications, responses, year)

    offers_sent = int(len(joined))
    accepted_mask = joined["accepted"] if not joined.empty else pd.Series([], dtype=bool)
    accepted = int(accepted_mask.sum())
    conversion_pct = (accepted / offers_sent * 100.0) if offers_sent else 0.0

    # kwh_shifted = energy moved by the customers who accepted, as logged by notify.
    kwh_shifted = float(joined.loc[accepted_mask, "shifted_kwh"].sum()) if accepted else 0.0

    notes_parts: list[str] = []

    # FALLBACK: notify.py may log shifted_kwh = 0 (the simulated response carries no
    # measured energy). We do NOT fabricate a number from the offer here — without a
    # matched real session we cannot defensibly attribute kWh — so kwh_shifted (and
    # therefore energy_saving) report 0.0 with a note. A future pass can estimate it
    # by matching each accepted nudge to the contract's next session within a window
    # (CLAUDE.md §8 step 3); valuation below is already wired for that.
    if accepted and kwh_shifted == 0.0:
        notes_parts.append(
            "shifted_kwh logged as 0 for all accepted responses; reporting 0 kWh "
            "shifted (no matched session to measure energy moved). Wire nudge->session "
            "matching to populate this."
        )

    # Value the shifted energy at the spot spread (ct/kWh -> EUR).
    spread = _spot_spread(year)
    energy_saving_eur = kwh_shifted * spread / 100.0

    # demand_saving_eur: kept at 0.0. The network demand charge is a FIXED annual
    # block set by the single highest 15-min peak (CLAUDE.md §4). Steering a handful
    # of sessions only relieves the demand charge if it provably lowers that one
    # annual peak interval — which the response log alone cannot establish. We do not
    # claim peak relief here; it belongs to the peak-shaving backtest lever.
    demand_saving_eur = 0.0

    total_saving_eur = energy_saving_eur + demand_saving_eur

    # CLAUDE.md §2 caveat — always present.
    notes_parts.append(
        f"Conversion is a PARAMETER, not measured uplift: these {accepted} accepts are "
        "raw conversion (over-credits drivers who'd have come anyway). True uplift needs "
        "a live A/B holdout / control group; structure ingests a real notification log "
        f"already. Shifted energy valued at the {spread:.2f} ct/kWh top-4-vs-bottom-4 "
        "spot spread for the year."
    )

    return AttributionResult(
        year=year,
        offers_sent=offers_sent,
        accepted=accepted,
        conversion_pct=round(conversion_pct, 2),
        kwh_shifted=round(kwh_shifted, 3),
        energy_saving_eur=round(energy_saving_eur, 2),
        demand_saving_eur=round(demand_saving_eur, 2),
        total_saving_eur=round(total_saving_eur, 2),
        notes=" ".join(notes_parts),
    )


def per_contract(year: int = DEFAULT_YEAR) -> pd.DataFrame:
    """Per-contract breakdown: offers_sent, accepted, kwh_shifted, saving_eur."""
    notifications, responses = load_logs()
    joined = _join(notifications, responses, year)

    cols = ["contract_id", "offers_sent", "accepted", "kwh_shifted", "saving_eur"]
    if joined.empty:
        return pd.DataFrame(columns=cols)

    spread = _spot_spread(year)
    joined["accepted_n"] = joined["accepted"].astype(int)
    joined["accepted_kwh"] = joined["shifted_kwh"].where(joined["accepted"], 0.0)

    g = joined.groupby("contract_id", dropna=False).agg(
        offers_sent=("notification_id", "size"),
        accepted=("accepted_n", "sum"),
        kwh_shifted=("accepted_kwh", "sum"),
    ).reset_index()
    g["saving_eur"] = (g["kwh_shifted"] * spread / 100.0).round(2)
    g["kwh_shifted"] = g["kwh_shifted"].round(3)
    return g[cols].sort_values("saving_eur", ascending=False).reset_index(drop=True)


if __name__ == "__main__":
    print(attribute().to_dict())
