#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NOTIFY layer — simulated notification send + logging (no real email yet).

Turns strategy Offers into NotificationRecords, "sends" them (simulated), and
appends to config.NOTIFICATIONS_LOG. Simulates user responses with a
configurable conversion parameter (or an injected PriceResponseModel) and
appends to config.RESPONSES_LOG. Structured so a real SMTP/push sender drops
into send() later.

SEAM: frozen signatures + log schemas (models.NotificationRecord.COLUMNS /
ResponseRecord.COLUMNS). Implement the bodies. Import shared bits from
config.py / models.py; do not redefine paths or schemas.
"""
from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import numpy as np

from config import NOTIFICATIONS_LOG, RESPONSES_LOG
from models import Offer, NotificationRecord, ResponseRecord, PriceResponseModel


def _now_iso() -> str:
    """Current timestamp as a timezone-aware ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


def _append_csv(path: Path, columns: list[str], rows: list[dict]) -> None:
    """Append `rows` to a CSV at `path` in `columns` order.

    Creates the file (with header) if missing, otherwise appends without a
    header. Writes nothing for an empty `rows` list.
    """
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    write_header = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=columns)
        if write_header:
            writer.writeheader()
        for row in rows:
            writer.writerow({col: row[col] for col in columns})


def make_notification(offer: Offer, channel: str = "app") -> NotificationRecord:
    """Render one Offer into a NotificationRecord (status defaults to 'sent')."""
    return NotificationRecord(
        notification_id=uuid4().hex[:12],
        contract_id=offer.contract_id,
        year=offer.year,
        sent_ts=_now_iso(),
        channel=channel,
        cheap_hours=json.dumps(offer.cheap_hours),
        discount_ct_kwh=offer.discount_ct_kwh,
        valid_date=offer.valid_date,
        status="sent",
    )


def send(record: NotificationRecord) -> NotificationRecord:
    """Simulated send. Real SMTP/push goes here later. Returns updated status.

    SEAM: a real SMTP/push transport drops in here. It should set
    ``record.status`` to "sent" on success or "failed" on a transport error
    and return the record. The simulation always succeeds (deterministic) so
    downstream tests are stable; flip the body to a real client later.
    """
    # TODO(real-transport): replace with SMTP/push call; set "failed" on error.
    record.status = "sent"
    return record


def send_offers(offers: list[Offer], channel: str = "app",
                append_log: bool = True) -> list[NotificationRecord]:
    """Make + send all offers, append to NOTIFICATIONS_LOG. Returns the records."""
    records = [send(make_notification(offer, channel)) for offer in offers]
    if append_log:
        _append_csv(NOTIFICATIONS_LOG, NotificationRecord.COLUMNS,
                    [r.to_dict() for r in records])
    return records


def simulate_responses(records: list[NotificationRecord],
                       conversion: float = 0.20,
                       price_model: PriceResponseModel | None = None,
                       seed: int = 42, append_log: bool = True,
                       *, offers: list[Offer] | None = None) -> list[ResponseRecord]:
    """Simulate accept/decline per notification.

    Use price_model.price_response(contract, discount) when injected, else the flat
    `conversion` rate. Set ResponseRecord.shifted_kwh on accept (0 on decline).
    Append to RESPONSES_LOG. Deterministic given seed.

    shifted_kwh: a NotificationRecord does not carry the expected shift, so to
    record a non-trivial accepted volume the originating Offers can be passed
    via the keyword-only `offers` argument (frozen positional signature kept
    intact). When supplied and 1:1 with `records`, an accept stores the offer's
    ``expected_shift_kwh``. Without `offers` it falls back to 0.0.
    TODO(attribution): final shifted kWh is derived from matched session data
    by the attribution layer; this simulated value is a placeholder.
    """
    rng = np.random.default_rng(seed)
    responses: list[ResponseRecord] = []
    for idx, record in enumerate(records):
        if price_model is not None:
            p = price_model.price_response(record.contract_id, record.discount_ct_kwh)
        else:
            p = conversion
        accepted = bool(rng.random() < p)
        shifted = 0.0
        if accepted and offers is not None and idx < len(offers):
            shifted = float(offers[idx].expected_shift_kwh)
        responses.append(ResponseRecord(
            notification_id=record.notification_id,
            contract_id=record.contract_id,
            responded_ts=_now_iso(),
            accepted=accepted,
            shifted_kwh=shifted,
        ))
    if append_log:
        _append_csv(RESPONSES_LOG, ResponseRecord.COLUMNS,
                    [r.to_dict() for r in responses])
    return responses


if __name__ == "__main__":
    print("notify: run via strategy.build_offers -> send_offers -> simulate_responses")
