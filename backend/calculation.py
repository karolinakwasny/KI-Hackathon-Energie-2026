#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Central price calculations shared by the API and frontend display.

Customer-facing apps should receive finished display prices from the backend.
That keeps tariff, VAT, margin, and spot-price assumptions in one place.
"""
from __future__ import annotations

from config import TARIFF


VAT_RATE = 0.19
DEFAULT_MARGIN_RATE = 0.30


def tariff_adders_ct(tariff: dict | None = None) -> float:
    """Variable non-spot cost adders in ct/kWh."""
    t = tariff or TARIFF
    return (
        float(t.get("ne_energy_ct_kwh", 0.0))
        + float(t.get("concession_ct_kwh", 0.0))
        + float(t.get("electricity_tax_ct_kwh", 0.0))
        + float(t.get("surcharges_ct_kwh", 0.0))
        + float(t.get("supplier_markup_ct_kwh", 0.0))
    )


def customer_offer_prices(
    cheap_avg_spot_ct_kwh: float,
    expensive_avg_spot_ct_kwh: float,
    discount_ct_kwh: float,
    margin_rate: float = DEFAULT_MARGIN_RATE,
    hourly_spot_ct_kwh: dict[int, float] | None = None,
    cheap_hours: list[int] | None = None,
    expensive_hours: list[int] | None = None,
    tariff: dict | None = None,
) -> dict:
    """Compute customer-safe price fields for the driver offer.

    Formula:
        final customer price =
            (spot + Netz/Ladehub Arbeit + electricity tax + concession/other
             + margin) * 1.19 VAT

    The customer sees only standard price, discount, offer price, and the
    comparison against their usual evening charging slot. Margin and internal
    component details stay server-side.
    """
    adders_ct = tariff_adders_ct(tariff)
    cheap_spot = float(cheap_avg_spot_ct_kwh)
    evening_spot = float(expensive_avg_spot_ct_kwh)
    discount = float(discount_ct_kwh)
    margin = float(margin_rate)

    cheap_base_ct = cheap_spot + adders_ct
    cheap_margin_ct = cheap_base_ct * margin
    standard_net_ct = cheap_base_ct + cheap_margin_ct
    standard_price_ct = standard_net_ct * (1 + VAT_RATE)
    offer_price_ct = max(0.0, standard_price_ct - discount)

    evening_base_ct = evening_spot + adders_ct
    evening_net_ct = evening_base_ct * (1 + margin)
    usual_evening_price_ct = evening_net_ct * (1 + VAT_RATE)
    savings_vs_evening_ct = max(0.0, usual_evening_price_ct - offer_price_ct)
    slots = []
    if hourly_spot_ct_kwh:
        cheap_set = set(cheap_hours or [])
        expensive_set = set(expensive_hours or [])
        clean_hourly = {int(h): float(v) for h, v in hourly_spot_ct_kwh.items()}
        best_hour = min(clean_hourly, key=clean_hourly.get)
        peak_hour = max(clean_hourly, key=clean_hourly.get)
        for hour in range(24):
            spot_ct = clean_hourly.get(hour)
            if spot_ct is None:
                continue
            slot_base_ct = spot_ct + adders_ct
            slot_net_ct = slot_base_ct * (1 + margin)
            slot_standard_ct = slot_net_ct * (1 + VAT_RATE)
            is_cheap = hour in cheap_set
            slot_discount_ct = discount if is_cheap else 0.0
            slot_offer_ct = max(0.0, slot_standard_ct - slot_discount_ct)
            slots.append({
                "hour": hour,
                "label": f"{hour:02d}:00-{(hour + 1) % 24:02d}:00",
                "spot_ct_kwh": round(spot_ct, 2),
                "price_ct_kwh": round(slot_offer_ct, 2),
                "standard_price_ct_kwh": round(slot_standard_ct, 2),
                "discount_ct_kwh": round(slot_discount_ct, 2),
                "savings_vs_evening_ct_kwh": round(
                    max(0.0, usual_evening_price_ct - slot_offer_ct), 2
                ),
                "is_cheap": is_cheap,
                "is_expensive": hour in expensive_set,
                "is_best": hour == best_hour,
                "is_peak": hour == peak_hour,
            })

    return {
        "standard_price_ct_kwh": round(standard_price_ct, 2),
        "discount_ct_kwh": round(discount, 2),
        "offer_price_ct_kwh": round(offer_price_ct, 2),
        "usual_evening_price_ct_kwh": round(usual_evening_price_ct, 2),
        "savings_vs_evening_ct_kwh": round(savings_vs_evening_ct, 2),
        "cheap_avg_spot_ct_kwh": round(cheap_spot, 2),
        "expensive_avg_spot_ct_kwh": round(evening_spot, 2),
        "vat_rate": VAT_RATE,
        "slots": slots,
    }
