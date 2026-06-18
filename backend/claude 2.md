# CLAUDE.md — Charging-Hub Profitability & Smart-Charging Analysis

Context file for working on this project. Read this first.

> Language: project is in English. German appears ONLY as literal data-file tokens
> (sheet/column names, status values, contract IDs) that must match the raw files, shown
> in `code font`. See the glossary at the end for the German↔English term mapping.

---

## 1. Goal

Quantify the economics of a DC fast-charging hub and **show the money an automated
strategy would make**. The strategy has up to four levers:

1. **Peak shaving** — hold site load under a kW cap to cut the fixed demand charge.
2. **Spot-aware load steering** — move charging into cheap hours, out of expensive ones.
3. **Time-of-use pricing** — the mechanism that actually makes drivers shift.
4. **Notification agent** — app push that nudges a (known) customer to plug in at a good
   time; track conversion and attribute energy saved + margin earned via customer ID.

**Headline metric** = baseline (what actually happened) − optimized (what the strategy
would have done) over the same real period.

---

## 2. Method decisions (important — don't drift from these)

- **Backtest, not forecast.** "Show the money" = counterfactual replay on historical
  actuals. More credible than predicting the future and needs no ML.
- **ML is NOT needed** for the headline number. Only candidate use is a short-horizon
  demand prediction inside a *real-time* controller; even there, trend/seasonal models
  usually beat heavy ML and are easier to defend. Day-ahead spot prices are published,
  so they don't need predicting.
- A full-year-2026 projection (if wanted) = simple trend + seasonality, **validated
  against the Jan–May 2026 actuals we already have**.
- **Notification conversion CANNOT be backtested** — there is no notification log; the
  nudges never happened historically. Conversion must be measured by a **live A/B
  experiment with a holdout/control group** to get true *uplift* (extra conversions
  caused by the nudge), not raw conversion (which over-credits people who'd come anyway).
  Until then, conversion is a **parameter** in the model; structure code to ingest a real
  notification log later.

---

## 3. Data files (`/mnt/user-data/uploads/`, read-only)

### Lastgang_…Ladehub.xlsx — load profile = GRID meter (what we BUY)
- Registered-power (RLM) 15-min load profile, unit kWh, CET.
- Sheets: `2025` (full year, 35,040 intervals, **271,214.55 kWh**, peak **393.6 kW**),
  `2026` (partial: Jan–early Jun, ~132,395 kWh).
- **NO 2024 sheet** — load-based analysis can only start in 2025.
- Layout quirk: header rows 0–1; data from row idx 2; cols idx 4=start-date, 5=start-time,
  6=kWh, 7=kW. Timestamp = date(col4) + time-of-day(col5).

### Spotmarktpreis_.xlsx — wholesale spot price (ct/kWh)
- Source: netztransparenz.de, §3 Nr. 42a EEG spot price (calculated across all exchanges,
  NOT raw EPEX). Published with lag (~10th working day of M+1).
- Sheets: `Spotmarktpreis 01.01.2024-30.09` (hourly, 2024-01-01→2025-09-30),
  `Spotmarktpreis 01.10.2025-31.05` (2025-10-01→2026-05-31, **15-min** — granularity
  switched Oct 2025), `Quelle` (source note).
- Many **negative-price** hours. Observed range −50 to +210 ct/kWh.
- API exists (REST, OAuth client-credentials, register at the WebAPI portal). Good for
  historical; not real-time. For forward/day-ahead use ENTSO-E / SMARD / aWATTar/Tibber.

### Ladevorgänge_…Ladehub.xlsx — charging sessions (what we SELL)
- Sheet `Ladevorgaenge`: 13,155 sessions, **Jul 2024 → Jun 2026**, all **DC**. 6 charge
  points `DE*LDK*E00233`–`E00238`.
- Columns (German, literal): `ID`, `Ladepunkt` (charge point), `Status`, `Gestartet`
  (start), `Beendet` (end), `Standzeit` (dwell), `Verbrauch (kWh)` (energy), `Phase`,
  `Vertrag` (contract), `Auth. Typ`, `Grund für die Auffälligkeit` (anomaly reason),
  `Abrechnung` (billing).
- **NO selling-price column** — revenue must come from a tariff assumption (we use
  cost × (1+margin)).
- Sheet `Übersicht Ladevorgaenge`: monthly rollup. Volume clearly **growing** (~14
  sessions in the first month → 750+/month by 2026).

### Berechnugn_Netzentgelte.xlsx — 2025 network-fee calc
- 271,214.55 kWh, 393.6 kW, `<2500h` band (689 h/a utilisation), energy charge
  **8.24 ct/kWh**, demand charge **19.76 EUR/kW·a** → **30,125.61 EUR**. (2025 rates.)

### Preisblatt_Strom_2024_-final.pdf — BS Netz price sheet 2024
- Structure reference only. The 2025 rates (8.24 / 19.76) are **NOT** on it (2024
  Umspannung 20/0.4 kV <2500h values are 7.48 ct / 17.84 EUR/kW).
- Gives the other cost components: concession levy (special contract) **0.11 ct/kWh**,
  metering (RLM LV) ~**131.51 EUR/a** (101.65+19.13+10.73), and points to
  netztransparenz.de for the statutory surcharges.

---

## 4. Critical analytical rules (the easy-to-get-wrong bits)

- **Buy ≠ Sell.** 2025: bought (grid) 271,214.55 kWh, sold (sessions) 250,472.6 kWh →
  **7.6 % loss/standby** gap. Cost is on grid kWh; revenue is on sold kWh.
  **Apply margin to cost-per-SOLD-kWh**, never per grid kWh, or the loss eats the margin.
- **Demand charge is a FIXED annual block** driven by the single highest 15-min peak
  (393.6 kW). It does not vary hour to hour. Peak shaving reduces it directly: each kW
  shaved = 19.76 EUR/a.
- **Notifiable base is small.** Roaming contract `DE-LDK-C00480594` = 87.9 % of sessions /
  **90.6 % of kWh** — these belong to a foreign EMP, the hub likely can't push app
  notifications to them. Addressable = **non-roaming: 1,587 sessions, 41,616 kWh (9.4 %),
  353 unique contracts (197 repeat)**. Auth types: RFID 11,132 / App 1,965 / Webseite 58.
  → The notification agent's reachable population is the App/non-roaming slice.
- DC fast sessions: dwell ≈ charge time (people leave when done), so in-session deferral
  is limited. Realistic shift mechanism = **price steering / nudging which sessions happen
  when**, not delaying a plugged-in car. Bound "shiftable energy" from dwell-vs-charge gap.
- Watch **DST** when rebuilding timestamps (CET/CEST) and the **Oct-2025 spot granularity
  switch** (hourly → 15-min).

---

## 5. Established 2025 numbers (baseline)

| Item | Value |
|---|---|
| Grid bought | 271,214.55 kWh |
| Sold (sessions) | 250,472.6 kWh (loss 7.6 %) |
| Spot energy cost | 23,407.20 EUR (vol-wt avg 8.63 ct/kWh) |
| Network energy charge (8.24 ct) | 22,348.08 EUR |
| Network demand charge (fixed) | 7,777.54 EUR |
| Concession levy (0.11 ct) | 298.34 EUR |
| Electricity tax (assumed 2.05 ct) | 5,559.90 EUR |
| Metering (fixed) | 131.51 EUR |
| **Total cost** | **59,522.56 EUR** → 21.95 ct/grid-kWh, **23.76 ct/sold-kWh** |
| Profit @30 % markup | sell 30.9 ct/kWh → ~17,857 EUR |
| Profit @40 % markup | sell 33.3 ct/kWh → ~23,809 EUR |
| Annual peak | 393.6 kW @ 2025-09-21 17:30 |
| Intervals > 300 kW | ~37 (0.11 % of year) → cap@300 saves 1,849.54 EUR/a |
| Hourly pattern | expensive+peaky 16–19h (spot 11–13 ct); cheap midday 11–15h (6.3–7.1 ct); morning = middle |
| Load-shift example | 30 % evening→midday + cap@300 ≈ 3,374 EUR/a |

---

## 6. Open parameters / missing inputs (all live in `CONFIG`)

- `surcharges_ct_kwh` — statutory surcharges 2025 (KWK-G, §19 StromNEV, Offshore…). Now 0.
- `supplier_markup_ct_kwh` — supplier spread/margin over raw spot. Now 0.
- `electricity_tax_ct_kwh` — assumed 2.05; **confirm** (hub may qualify for reduced rate).
- Customer selling tariff(s) — not in data; using cost+markup instead.
- Notification log — does not exist; conversion is a parameter pending a live experiment.

Each +1 ct of cost raises the required selling price by ~1.3–1.4 ct at these markups.

---

## 7. Artifacts (`/mnt/user-data/outputs/`)

- `charging_hub_analysis.py` — parametrised pipeline. All assumptions in a top `CONFIG`
  block. Stages: load → clean → cost engine (per 15-min) → revenue/profit → peak analysis
  → load-shift what-if → CSV exports. Runs clean on the real files.
- `hourly_profile_2025.csv` — energy/load/spot by hour of day.
- `monthly_summary_2025.csv` — consumption/cost/peak per month.
- `BACKEND.md` — spec for the data-cleaning layer (canonical schemas + rules).

Conventions: domain logic and identifiers in English; German kept only for literal raw
tokens. Outputs go to `/mnt/user-data/outputs/`; uploads are read-only.

---

## 8. Roadmap / next steps

1. **Cleaning backend** — implement `BACKEND.md` (canonical tables + validation report).
2. **Backtest engine** — replay 2025–H1 2026 with strategy ON vs OFF; report EUR delta
   per lever (peak shaving / spot steering / ToU).
3. **Notification-agent attribution harness** — keyed on customer ID:
   nudge → matched session within window → energy saved + margin. Conversion as a
   parameter now; ingest real notification log + control group later for uplift.
4. **(Optional) 2026 projection** — trend + seasonality on the growing monthly volume,
   validated against Jan–May 2026 actuals.

---

## 9. Status

Done: data understood/cleaned, full 2025 cost stack, baseline profit, peak + load-shift
sizing, addressable-customer sizing, English conversion of code + docs. Next: build the
cleaning backend, then the backtest engine and notification-attribution harness.

---

## Glossary (German data/regulatory term → English)

| German | English |
|---|---|
| Lastgang | load profile |
| Netzentgelt | network / grid fee |
| Arbeitspreis | energy charge (per kWh) |
| Leistungspreis | demand / capacity charge (per kW peak) |
| Ladevorgänge / Ladevorgaenge | charging sessions |
| Ladepunkt | charge point |
| Vertrag | contract / customer id |
| Verbrauch | consumption / energy |
| Standzeit | dwell time |
| Abrechnung | billing |
| Grund für die Auffälligkeit | anomaly reason |
| Konzessionsabgabe | concession levy |
| Stromsteuer | electricity tax |
| Messstellenbetrieb | metering (meter operation) |
| gesetzliche Umlagen | statutory surcharges |
| Lieferanten-Aufschlag | supplier markup |
| Spotmarktpreis | spot market price |
| Jahresbenutzungsdauer | annual utilisation hours |