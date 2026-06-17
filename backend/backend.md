# BACKEND.md — Data Cleaning Layer

Spec for the cleaning backend. It turns the five raw files into **canonical, validated
tables** that every downstream module (cost engine, backtest, notification harness)
consumes. Downstream code must NOT read raw files directly — only the canonical outputs.

Read `CLAUDE.md` first for project context, data quirks, and the analytical rules.
German appears only as literal raw-data tokens (sheet/column names, status values); see
the glossary in `CLAUDE.md` for the German↔English mapping.

---

## 1. Pipeline

```
raw (xlsx/pdf, read-only)
   └─ load()      parse each source, no logic
        └─ clean()    apply per-source rules (Section 5)
             └─ validate()  run QA checks (Section 6); fail loud on hard errors
                  └─ write()  canonical parquet + CSV to /data/clean/
```

One module per source + one orchestrator:
```
backend/
  io_raw.py        # raw readers (path + layout quirks only)
  clean_load.py    # Lastgang  -> load_profile
  clean_spot.py    # Spot      -> spot_price
  clean_sessions.py# Ladevorg. -> sessions
  tariff.py        # Netzentgelt + Preisblatt -> tariff_params (reference)
  validate.py      # cross-source QA
  pipeline.py      # orchestrate -> /data/clean/
  config.py        # paths, tz, thresholds (single source of truth)
```

Idempotent: re-running reproduces identical outputs. Cleaning logic lives here only;
analysis assumptions stay in the analysis layer's CONFIG.

---

## 2. Global conventions

- **Timezone:** all timestamps tz-aware **Europe/Berlin (CET/CEST)**. Source is CET wall
  time; localize with DST handling (Section 5.1).
- **Units:** energy `kWh`, power `kW`, price stored in **EUR/kWh** internally
  (raw spot is ct/kWh → divide by 100 on ingest). Keep a `_ct` copy only for display.
- **Decimals:** raw German format may use `,` — coerce to float. CSV *exports* use
  `sep=';'`, `decimal=','`; parquet is canonical for code.
- **Naming:** snake_case columns, English. Domain values (status text) stay German.
- **Missing:** never silently fill. Either flag (`is_*` boolean) or drop with a counted
  reason in the cleaning report.
- **Output:** `/data/clean/<table>.parquet` (+ `.csv`), plus `/data/clean/_report.json`
  with row counts, drops-by-reason, and validation results.

---

## 3. Canonical output schemas (the downstream contract)

### `load_profile`  (grid meter, what we BUY)
| col | type | notes |
|---|---|---|
| ts | datetime[tz] | interval START, 15-min grid |
| year | int | partition key |
| kwh | float | energy drawn this interval (≥0) |
| kw | float | avg power this interval (≥0) |
| dst_flag | category | normal / spring_skip / fall_repeat |

### `spot_price`  (uniform 15-min grid for clean 1:1 join with load_profile)
| col | type | notes |
|---|---|---|
| ts | datetime[tz] | 15-min START |
| price_eur_kwh | float | can be negative |
| price_ct_kwh | float | display only |
| native_resolution | category | `hourly` (broadcast ×4) or `15min` |

### `sessions`  (what we SELL)
| col | type | notes |
|---|---|---|
| session_id | int | unique, PK |
| charge_point | str | DE*LDK*E00233..E00238 |
| start_ts / end_ts | datetime[tz] | |
| charge_duration_s | int | end−start |
| dwell_s | int | parsed from `Standzeit` |
| flex_headroom_s | int | max(dwell−charge, 0); shiftability proxy |
| kwh | float | delivered (>0 after clean) |
| contract_id | str | from `Vertrag` |
| is_roaming | bool | contract == `DE-LDK-C00480594` |
| auth_type | category | RFID / App / Webseite |
| notifiable | bool | not roaming AND auth in {App, Webseite} |
| status | category | from `Status` |
| billing_status | category | from `Abrechnung` |
| anomaly_reason | category | from `Grund für die Auffälligkeit` (`-` = none) |
| is_anomaly | bool | anomaly_reason != `-` |
| year / month | int / str | partition keys |

### `tariff_params`  (reference, key→value; see Section 5.4)
Network/levy rates by year — not time series. Feeds the cost engine.

---

## 4. Source → canonical map

| raw file | module | canonical | period covered |
|---|---|---|---|
| Lastgang_…Ladehub.xlsx | clean_load | load_profile | 2025 full, 2026 partial (NO 2024) |
| Spotmarktpreis_.xlsx | clean_spot | spot_price | 2024-01 → 2026-05 |
| Ladevorgänge_…Ladehub.xlsx | clean_sessions | sessions | 2024-07 → 2026-06 |
| Berechnugn_Netzentgelte.xlsx + Preisblatt_Strom_2024_-final.pdf | tariff | tariff_params | rates |

---

## 5. Per-source cleaning rules

### 5.1 Lastgang → `load_profile`
- Read sheet per year (`2025`, `2026`). Data starts row idx 2; cols idx 4=Ab-Datum,
  5=Ab-Zeit, 6=kWh, 7=kW. Ignore the left "Kopfdaten" block (cols 0–1) and the right
  status block (cols 9+).
- Build `ts = date(col4).normalize() + time_of_day(col5)`. Drop rows with NaN kWh.
- Coerce kwh, kw to float (German decimal aware).
- **DST:** localize to Europe/Berlin. Spring-forward day has 92 intervals (mark
  `spring_skip`), fall-back has 100 with a repeated hour (mark `fall_repeat`,
  `ambiguous` handling = keep both, infer order by row sequence). Do NOT drop/dup silently.
- Sort by ts, assert strictly increasing after DST handling, dedupe exact ts.
- Restrict to the sheet's year.

### 5.2 Spotmarktpreis → `spot_price`
- Read every sheet whose name contains `spot` (skip `Quelle`). Cols: Datum, von,
  tz_von, bis, tz_bis, preis(ct/kWh).
- `ts = Datum.normalize() + time_of_day(von)`; coerce preis; drop NaN.
- Concatenate sheets, **dedupe on ts** (sheets overlap at boundaries).
- Detect native resolution per row (hourly vs 15-min — granularity switched Oct 2025).
- **Normalize to a uniform 15-min grid:** where native is hourly, broadcast the hourly
  price to its four 15-min slots (`native_resolution='hourly'`); where 15-min, use as is.
  Result joins 1:1 to load_profile.
- `price_eur_kwh = price_ct_kwh / 100`. Negative prices are valid — keep.
- Flag (don't fill) any gaps in the expected continuous grid for the covered range.

### 5.3 Ladevorgänge → `sessions`
- Read sheet `Ladevorgaenge` (header row 0). Parse `Gestartet`/`Beendet` → tz-aware.
- `kwh = to_numeric(Verbrauch (kWh))`.
- Parse `Standzeit` (e.g. "29 Minuten 30 Sekunden", "3 Minuten 1 Sekunde", may include
  "Stunde(n)") → `dwell_s` via regex on Stunde/Minute/Sekunde tokens.
- `charge_duration_s = end_ts − start_ts`; `flex_headroom_s = max(dwell_s − charge, 0)`.
- Derive `is_roaming`, `auth_type`, `notifiable`, `is_anomaly` (reason != `-`),
  `billing_status`.
- **Drop:** kwh is NaN; kwh < `MIN_KWH_SESSION` (=0.5) → ~30 near-zero rows. Count by reason.
- **Keep but flag (do NOT drop):** anomalies (`Dauer zu niedrig.`, `max. Energie/Preis
  überschritten`, `Überschneidung mit anderem Ladevorgang`, `keine eichrechtskonformen
  Messdaten`), and unbilled rows (`Abrechnung != Abgerechnet`). These stay in revenue
  unless an analysis explicitly excludes them.
- Assert `session_id` unique. Flag (not drop) overlapping sessions on the same charge_point.

Reference distribution (sanity): roaming `DE-LDK-C00480594` ≈ 87.9 % of sessions /
90.6 % of kWh; notifiable (non-roaming) ≈ 1,587 sessions, 41,616 kWh, 353 contracts.

### 5.4 Netzentgelt + Preisblatt → `tariff_params`
Reference table, NOT a cleaned time series. Capture (year-tagged):
- `ne_energy_ct_kwh` = 8.24 (2025), `ne_demand_eur_kw` = 19.76 (2025).
  Note 2024 price-sheet values (7.48 / 17.84) are different — tag by year, default to the
  analysis year.
- `concession_levy_ct_kwh` = 0.11 (special contract), `metering_eur_a` = 131.51.
- `electricity_tax_ct_kwh` (assumption, flag `confirmed=false`), `surcharges_ct_kwh`,
  `supplier_markup_ct_kwh` — placeholders, see CLAUDE.md §6.
PDF is parsed once → static values; do not re-parse at runtime.

---

## 6. Validation (run after clean; hard = abort, soft = warn in report)

**load_profile**
- HARD: no NaN in kwh/kw; kwh ≥ 0; kw ≥ 0.
- HARD: interval count per day = 96 (±4 only on the two DST days).
- SOFT: `sum(kwh)` matches known total (2025 ≈ 271,214.55, tol 0.5 %).
- SOFT: implied peak kw ≈ 393.6 for 2025.

**spot_price**
- HARD: ts unique, strictly increasing, 15-min spacing across covered range.
- SOFT: price within [−60, 250] ct/kWh (flag outliers, don't drop).
- SOFT: report any gaps vs expected grid.

**sessions**
- HARD: session_id unique; kwh > 0 after clean; end_ts ≥ start_ts.
- SOFT: every contract maps to is_roaming/auth cleanly; report unmapped.
- SOFT: 2025 sold kwh ≈ 250,472.6 (tol 0.5 %).

**cross-source (the key reconciliation)**
- HARD: for each year present in both, `grid_kwh (load) ≥ sold_kwh (sessions)`.
- SOFT: loss ratio `1 − sold/grid` in **5–10 %** (2025 ≈ 7.6 %). Outside → warn loudly;
  likely a join/tz/year-filter bug.
- HARD: spot_price fully covers the load_profile date range (else join produces NaN cost).

Report (`_report.json`): per-table row counts in/out, drops by reason, every SOFT/HARD
check with pass/fail and actual vs expected.

---

## 7. Known traps (do not "fix" by silently dropping)

- 2024 has sessions + spot but **no load profile** → grid-based cost starts 2025.
- Spot resolution switch (Oct 2025) — handle in 5.2, never assume uniform hourly.
- DST days — handle in 5.1, never assume 96/day everywhere.
- Negative spot prices are real, not errors.
- Roaming dominates volume; `notifiable` is a small slice — keep the flag accurate, the
  notification harness depends on it.
- DC fast sessions: `flex_headroom_s` is usually ~0; that's expected, it tells the shift
  model that deferral is limited and price-steering is the real lever.

---

## 8. Run

```
python -m backend.pipeline            # full clean -> /data/clean/
python -m backend.pipeline --validate # checks only, exit nonzero on HARD fail
```
Outputs: `load_profile`, `spot_price`, `sessions`, `tariff_params` (parquet + csv) and
`_report.json`. Downstream reads these, never the raw xlsx.