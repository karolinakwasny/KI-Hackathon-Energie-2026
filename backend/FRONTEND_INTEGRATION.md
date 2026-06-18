# Frontend Integration Guide

This backend serves both JSON APIs and the current demo UI. The frontend team can
either use the existing static pages in `frontend/`, or call the API from a
separate app.

## Run locally

```powershell
cd E:\Code\KI-hackathon\backend
.\.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8000 --reload
```

Open:

- Operator dashboard: `http://127.0.0.1:8000/ui/dashboard.html`
- Driver app: `http://127.0.0.1:8000/ui/app.html`
- API docs: `http://127.0.0.1:8000/docs`

For a public demo, expose the same local server through Cloudflare Tunnel or any
reverse proxy. The frontend should use the public origin as its API base URL.

## API base URL

For the bundled static pages, the API base is relative:

```js
const API = "";
```

For a separate frontend, set it to the backend origin:

```js
const API = "http://127.0.0.1:8000";
// or: const API = "https://your-tunnel.trycloudflare.com";
```

The backend has permissive CORS enabled for hackathon/demo use.

## Core endpoints

### Metadata and tariff constants

`GET /meta`

Returns available years, data coverage, and tariff assumptions.

Important response fields:

```json
{
  "years": [2025, 2026],
  "period": {"start": "...", "end": "..."},
  "tariff": {
    "ne_energy_ct_kwh": 8.24,
    "concession_ct_kwh": 0.11,
    "electricity_tax_ct_kwh": 2.05,
    "surcharges_ct_kwh": 0.0,
    "supplier_markup_ct_kwh": 0.0,
    "ne_demand_eur_kw": 19.76,
    "metering_eur_a": 131.51
  }
}
```

Frontend use:

- Populate year filters from `years`.
- Use `tariff` for displayed price-stack calculations.
- The variable per-kWh surcharge is:

```js
const addersCt =
  tariff.ne_energy_ct_kwh +
  tariff.concession_ct_kwh +
  tariff.electricity_tax_ct_kwh +
  tariff.surcharges_ct_kwh +
  tariff.supplier_markup_ct_kwh;
```

### Dashboard KPIs

`GET /kpis?year=2025`

Returns annual energy, sold kWh, peak kW, cost stack, and simple profit scenarios.
Use this for top-level dashboard cards.

### Time series

`GET /timeseries?year=2025&freq=D`

`freq` can be `H`, `D`, `W`, or `M`. The API returns points with:

- `ts`
- `grid_kwh`
- `sold_kwh`
- `peak_kw`
- `spot_ct_kwh`

Use `freq=D` for month/day charts and `freq=M` for annual month curves.

### Average load shape

`GET /load-profile/hourly?year=2025`

Groups the full year by hour of day and returns average load, sold energy, and
mean spot price. This is not a specific day; it is the average 24-hour pattern.

### Time-of-use strategy

`GET /strategy/tou?year=2025&n=4`

Returns the cheapest and most expensive hours based on historical average spot
price by hour:

```json
{
  "cheap_hours": [13, 14, 12, 11],
  "expensive_hours": [21, 18, 20, 19],
  "cheap_avg_ct_kwh": 5.14,
  "expensive_avg_ct_kwh": 12.66,
  "spread_ct_kwh": 7.52
}
```

Calculation:

1. Filter master 15-minute rows to the selected year.
2. Group rows by `hour`.
3. Average `spot_ct_kwh` for each hour.
4. Sort the 24 hourly averages.
5. Pick the `n` cheapest and `n` most expensive hours.
6. `spread_ct_kwh = expensive_avg_ct_kwh - cheap_avg_ct_kwh`.

This is a historical steering signal, not the live spot price for one date.

## Driver offer flow

### Get a customer offer

`GET /users/{contract_id}/offer?year=2025`

Example:

`GET /users/DE-LDK-C43313814-L/offer?year=2025`

Important response fields:

- `contract_id`
- `cheap_hours`
- `expensive_hours`
- `discount_ct_kwh`
- `valid_date`
- `expected_shift_kwh`
- `expected_saving_eur`
- `customer_segment` (`loyal`, `normal`, or `rare`)
- `sessions`
- `active_months`
- `sessions_per_month`
- `discount_share`
- `margin_rate`
- `pricing`

The `pricing` object is calculated by the backend in `calculation.py` so the
frontend does not need to duplicate tariff, VAT, or margin logic:

```json
{
  "standard_price_ct_kwh": 24.97,
  "discount_ct_kwh": 1.50,
  "offer_price_ct_kwh": 23.47,
  "usual_evening_price_ct_kwh": 37.05,
  "savings_vs_evening_ct_kwh": 13.58,
  "cheap_avg_spot_ct_kwh": 5.14,
  "expensive_avg_spot_ct_kwh": 12.66,
  "vat_rate": 0.19
}
```

Segment logic:

- Loyal: at least 6 sessions/month, smaller discount, higher margin protection.
- Normal: at least 2 sessions/month, medium discount.
- Rare: below 2 sessions/month, stronger acquisition discount.

### Submit a customer response

`POST /users/{contract_id}/response`

Query parameters:

- `notification_id` required
- `accepted` required (`true` or `false`)
- `shifted_kwh` optional
- `reason` optional (`price`, `time`, `other`)

Examples:

```http
POST /users/DE-LDK-C43313814-L/response?notification_id=abc123&accepted=true&shifted_kwh=210
POST /users/DE-LDK-C43313814-L/response?notification_id=abc123&accepted=false&shifted_kwh=0&reason=price
```

The current CSV response log stores accepted/declined and shifted kWh. The API
echoes `reason` for frontend confirmation, but the CSV schema is kept stable.

## Price formulas

The displayed customer price is:

```text
final customer price =
  (spot price + Netz/Ladehub Arbeit + electricity tax + concession/other + margin)
  * 1.19 VAT
```

In code terms:

```js
const addersCt =
  tariff.ne_energy_ct_kwh +
  tariff.concession_ct_kwh +
  tariff.electricity_tax_ct_kwh +
  tariff.surcharges_ct_kwh +
  tariff.supplier_markup_ct_kwh;

const baseCostCt = spotCt + addersCt;
const marginCt = baseCostCt * marginRate;
const netPriceCt = baseCostCt + marginCt;
const finalPriceCt = netPriceCt * 1.19;
```

The backend owns this formula in `calculation.py`. For the driver app, the
customer sees only:

- Standard price
- Today's discount
- Your offer price

Do not show margin or internal cost stack in the customer-facing app.

## Live QR demo flow

Start a campaign:

```http
POST /campaign/live/start?year=2025&limit=10&seed=12345
```

Poll campaign state:

```http
GET /campaign/live?year=2025&limit=10
```

Use one projector QR:

```http
GET /campaign/live/claim?year=2025&limit=10
```

Each scanner is randomly assigned one unclaimed pending offer and redirected to:

```text
/ui/app.html?contract_id=...&notification_id=...&v=live
```

In live mode, the app hides sample contract links and the operator link.

## Frontend linking examples

Driver app for a known contract:

```text
/ui/app.html?contract_id=DE-LDK-C43313814-L
```

Live audience app link:

```text
/ui/app.html?contract_id=DE-LDK-C43313814-L&notification_id=test123&v=live
```

Dashboard:

```text
/ui/dashboard.html
```

Dashboard tabs are client-side. The current page supports:

- Overview
- Analytics
- Pricing
- Live demo

## Notes for production

- Replace the temporary Cloudflare URL with the deployed backend URL.
- Keep the customer-facing app free of internal margin/tax-stack detail.
- Persist live campaign claim state in a database if the backend process may
  restart during a demo.
- If the frontend needs response reasons in analytics, add a new response-log
  schema or a separate reasons table rather than silently changing the existing
  CSV columns.
