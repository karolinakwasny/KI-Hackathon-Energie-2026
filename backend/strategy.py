#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
STRATEGY layer — time-of-use steering offers. The ML teammate plugs in here.

Reads the clean master grid + sessions, finds cheap vs expensive hours, and
builds per-customer Offer objects. predict_demand / price_response are OPTIONAL
injected models (config-free default fallbacks live here) so the ML model can
drop in without changing call sites.

SEAM: frozen signatures + return types (models.Offer). Implement the bodies.
Import shared bits from config.py and models.py; do not redefine them.
"""
from __future__ import annotations

import math
from datetime import date

from config import load_master, load_sessions, filter_year, DEFAULT_YEAR
from models import Offer, PriceResponseModel, DemandModel


SEGMENT_POLICIES = {
    "loyal": {"min_sessions_per_month": 6.0, "discount_share": 0.20, "margin_rate": 0.35},
    "normal": {"min_sessions_per_month": 2.0, "discount_share": 0.50, "margin_rate": 0.30},
    "rare": {"min_sessions_per_month": 0.0, "discount_share": 0.80, "margin_rate": 0.20},
}


def tou_bands(year: int = DEFAULT_YEAR, n: int = 4) -> dict:
    """Cheapest vs most-expensive hours by mean spot price.

    Returns: cheap_hours, expensive_hours, cheap_avg_ct_kwh, expensive_avg_ct_kwh,
    spread_ct_kwh. (api.strategy_tou already has a reference implementation to mirror.)
    """
    m = filter_year(load_master(), year)
    if m.empty:
        raise ValueError(f"No data for year {year}.")
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
    }


def customer_segment(contract_id: str, year: int = DEFAULT_YEAR) -> dict:
    """Classify customer loyalty from session frequency.

    Loyal customers likely charge anyway, so they get smaller steering discounts
    and stronger margin protection. Rare customers get acquisition-oriented
    discounts to build repeat behavior.
    """
    s = filter_year(load_sessions(), year)
    s = s[s["contract_id"] == contract_id]
    sessions = int(len(s))
    months = int(s["start_ts"].dt.strftime("%Y-%m").nunique()) if sessions else 0
    sessions_per_month = sessions / max(months, 1)

    if sessions_per_month >= SEGMENT_POLICIES["loyal"]["min_sessions_per_month"]:
        segment = "loyal"
    elif sessions_per_month >= SEGMENT_POLICIES["normal"]["min_sessions_per_month"]:
        segment = "normal"
    else:
        segment = "rare"

    policy = SEGMENT_POLICIES[segment]
    return {
        "customer_segment": segment,
        "sessions": sessions,
        "active_months": months,
        "sessions_per_month": round(sessions_per_month, 2),
        "discount_share": policy["discount_share"],
        "margin_rate": policy["margin_rate"],
    }


def default_price_response(contract_id: str, discount_ct_kwh: float) -> float:
    """Fallback p(shift) when no ML PriceResponseModel is injected.

    Monotonic, saturating logistic in the discount (ct/kWh):

        p(shift) = 1 / (1 + exp(-k * (discount - x0)))

    with k = 0.35 (slope) and x0 = 4.0 ct/kWh (half-saturation point). This gives
    a defensible S-curve: ~0 uplift for a token discount, ~50 % at a ~4 ct/kWh
    discount, saturating below 1 for large discounts. Contract-independent here
    (no per-customer history to fit) — the real, customer-specific uplift comes
    from a live A/B test (CLAUDE.md §2), at which point a PriceResponseModel is
    injected and this fallback is bypassed. Output clamped to [0, 1].
    """
    k = 0.35
    x0 = 4.0
    p = 1.0 / (1.0 + math.exp(-k * (discount_ct_kwh - x0)))
    return max(0.0, min(1.0, p))


def build_offer(contract_id: str, year: int = DEFAULT_YEAR, n: int = 4,
                price_model: PriceResponseModel | None = None,
                demand_model: DemandModel | None = None) -> Offer:
    """Build a personalised ToU Offer for one contract.

    Use the contract's own session history (sessions filtered by contract_id) to
    size expected_shift_kwh, value it against the band spread for
    expected_saving_eur, and use price_model.price_response (or
    default_price_response) for the shift probability. Returns models.Offer.
    """
    bands = tou_bands(year, n)
    cheap_hours = bands["cheap_hours"]
    expensive_hours = bands["expensive_hours"]
    spread = bands["spread_ct_kwh"]

    # The contract's own sessions in this year, attributed to their start hour.
    s = filter_year(load_sessions(), year)
    s = s[s["contract_id"] == contract_id]
    segment = customer_segment(contract_id, year)

    # Segment-aware offer: protect margin for loyal customers who likely charge
    # anyway; use stronger acquisition discounts for rare/normal customers.
    discount_ct_kwh = spread * segment["discount_share"]

    # Energy this contract currently charges during the expensive hours — that is
    # the pool we can steer into the cheap band.
    if s.empty:
        expensive_kwh = 0.0
    else:
        start_hour = s["start_ts"].dt.hour
        expensive_kwh = float(s.loc[start_hour.isin(expensive_hours), "kwh"].sum())

    # Shift probability: injected model if present, else the saturating fallback.
    if price_model is not None:
        p_shift = float(price_model.price_response(contract_id, discount_ct_kwh))
    else:
        p_shift = default_price_response(contract_id, discount_ct_kwh)
    p_shift = max(0.0, min(1.0, p_shift))

    expected_shift_kwh = expensive_kwh * p_shift
    # Net operator upside on shifted energy after funding the discount.
    expected_saving_eur = expected_shift_kwh * max(0.0, spread - discount_ct_kwh) / 100.0

    # Representative date the offer applies to: the contract's last session date if
    # we have one, else today.
    if s.empty:
        valid_date = date.today().isoformat()
    else:
        valid_date = s["start_ts"].max().date().isoformat()

    return Offer(
        contract_id=contract_id,
        year=year,
        cheap_hours=cheap_hours,
        expensive_hours=expensive_hours,
        discount_ct_kwh=round(discount_ct_kwh, 2),
        valid_date=valid_date,
        expected_shift_kwh=round(expected_shift_kwh, 3),
        expected_saving_eur=round(expected_saving_eur, 2),
    )


def build_offers(year: int = DEFAULT_YEAR, n: int = 4,
                 notifiable_only: bool = True,
                 price_model: PriceResponseModel | None = None) -> list[Offer]:
    """Build offers for the addressable audience (notifiable contracts by default)."""
    s = filter_year(load_sessions(), year)
    if notifiable_only:
        s = s[s["notifiable"] == True]  # noqa: E712 - pandas boolean mask
    contracts = sorted(s["contract_id"].dropna().unique().tolist())
    return [build_offer(c, year=year, n=n, price_model=price_model) for c in contracts]


if __name__ == "__main__":
    print(tou_bands())
