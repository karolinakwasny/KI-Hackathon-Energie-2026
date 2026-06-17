#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Shared data contracts between strategy / notify / attribution / api.

These dataclasses + the two CSV log schemas are the FROZEN seam. Module agents
implement against these types and MUST NOT change field names/types (downstream
code depends on them). Owned by the integration layer.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Protocol


# --------------------------------------------------------------------------- #
# Strategy output
# --------------------------------------------------------------------------- #
@dataclass
class Offer:
    """A time-of-use steering offer for one customer (contract)."""
    contract_id: str
    year: int
    cheap_hours: list[int]            # hours to steer charging INTO
    expensive_hours: list[int]        # hours to steer OUT OF
    discount_ct_kwh: float            # price reduction offered in cheap hours
    valid_date: str                   # ISO date the offer applies to
    expected_shift_kwh: float = 0.0   # strategy's estimate of energy moved
    expected_saving_eur: float = 0.0  # operator saving if taken

    def to_dict(self) -> dict:
        return asdict(self)


# --------------------------------------------------------------------------- #
# Notify output  ->  NOTIFICATIONS_LOG / RESPONSES_LOG schemas
# --------------------------------------------------------------------------- #
@dataclass
class NotificationRecord:
    notification_id: str
    contract_id: str
    year: int
    sent_ts: str                      # ISO timestamp
    channel: str                      # "app" | "email" (simulated)
    cheap_hours: str                  # json-encoded list[int]
    discount_ct_kwh: float
    valid_date: str
    status: str                       # "sent" | "failed"

    # column order for NOTIFICATIONS_LOG.csv
    COLUMNS = ["notification_id", "contract_id", "year", "sent_ts", "channel",
               "cheap_hours", "discount_ct_kwh", "valid_date", "status"]

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ResponseRecord:
    notification_id: str
    contract_id: str
    responded_ts: str                 # ISO timestamp
    accepted: bool
    shifted_kwh: float = 0.0          # energy the user moved if accepted

    COLUMNS = ["notification_id", "contract_id", "responded_ts", "accepted",
               "shifted_kwh"]

    def to_dict(self) -> dict:
        return asdict(self)


# --------------------------------------------------------------------------- #
# Attribution output
# --------------------------------------------------------------------------- #
@dataclass
class AttributionResult:
    """Campaign-level uplift attribution (MEASURE step)."""
    year: int
    offers_sent: int
    accepted: int
    conversion_pct: float
    kwh_shifted: float
    energy_saving_eur: float
    demand_saving_eur: float
    total_saving_eur: float
    notes: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# --------------------------------------------------------------------------- #
# ML seam (the teammate's model plugs in here; both are optional/injected)
# --------------------------------------------------------------------------- #
class DemandModel(Protocol):
    def predict_demand(self, ts) -> float:
        """Predicted site load (kW) at timestamp ts."""
        ...


class PriceResponseModel(Protocol):
    def price_response(self, contract_id: str, discount_ct_kwh: float) -> float:
        """Probability [0,1] that this customer shifts given the discount."""
        ...
