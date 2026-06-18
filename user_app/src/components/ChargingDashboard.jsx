import { useEffect, useState } from "react";
import PriceChart from "./PriceChart";
import PriceList from "./PriceList";
import StationManager from "./StationManager";

import freeImg from "../assets/electric_car.png";
import takenImg from "../assets/car_red.png";
import freeImgPair from "../assets/electric_car_mirror.png";
import takenImgPair from "../assets/electric_car_mirror.png";

const BASE_URL = "http://localhost:8000";

function formatPriceCtToEur(ct) {
  return +(ct / 100).toFixed(3);
}

export default function ChargingDashboard() {
  const [activePage, setActivePage] = useState("prices");
  const [hours, setHours] = useState([]);
  const [tariff, setTariff] = useState(null);
  const [spots, setSpots] = useState(new Array(6).fill(false));
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [burgerOpen, setBurgerOpen] = useState(false);

  const stations = [spots.slice(0, 2), spots.slice(2, 4), spots.slice(4, 6)];

  const stationAssetGroups = [
    [
      { taken: takenImg, free: freeImg },
      { taken: takenImgPair, free: freeImgPair },
    ],
    [
      { taken: takenImg, free: freeImg },
      { taken: takenImgPair, free: freeImgPair },
    ],
    [
      { taken: takenImg, free: freeImg },
      { taken: takenImgPair, free: takenImgPair },
    ],
  ];

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const metaRes = await fetch(`${BASE_URL}/meta`);
        const meta = metaRes.ok ? await metaRes.json() : null;
        if (mounted && meta?.tariff) setTariff(meta.tariff);

        const tsRes = await fetch(`${BASE_URL}/timeseries?year=2025&freq=H`);
        if (!tsRes.ok) throw new Error("Failed to load timeseries");
        const tsJson = await tsRes.json();

        const now = new Date();
        const points = tsJson.points || [];
        const next = points
          .map((p) => ({ ...p, dt: new Date(p.ts) }))
          .filter((p) => p.dt >= now)
          .slice(0, 24);

        const final = next.length
          ? next
          : points.slice(-24).map((p) => ({ ...p, dt: new Date(p.ts) }));
        if (mounted) setHours(final);
      } catch (e) {
        console.error(e);
      }
    }
    load();
    return () => (mounted = false);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setSpots((prev) => {
        const next = [...prev];
        const toggles = Math.floor(Math.random() * 2) + 1;
        for (let i = 0; i < toggles; i++) {
          const idx = Math.floor(Math.random() * next.length);
          next[idx] = !next[idx];
        }
        return next;
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const surchargeCt = tariff
    ? (tariff.ne_energy_ct_kwh || 0) +
      (tariff.concession_ct_kwh || 0) +
      (tariff.electricity_tax_ct_kwh || 0) +
      (tariff.surcharges_ct_kwh || 0) +
      (tariff.supplier_markup_ct_kwh || 0)
    : 0;

  const priceBands = hours
    .map((h) => (h.spot_ct_kwh || 0) + surchargeCt)
    .sort((a, b) => a - b);
  const lowThreshold =
    priceBands.length > 0
      ? priceBands[Math.floor(priceBands.length * 0.33)]
      : 0;
  const highThreshold =
    priceBands.length > 0
      ? priceBands[Math.floor(priceBands.length * 0.66)]
      : 0;

  const chartData = hours.map((h) => {
    const totalCt = (h.spot_ct_kwh || 0) + surchargeCt;
    return {
      name: h.dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      price: formatPriceCtToEur(totalCt),
      rawItem: {
        time: h.dt.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        price: formatPriceCtToEur(totalCt),
        label:
          totalCt <= lowThreshold
            ? "⚡ ECO SAVE"
            : totalCt > highThreshold
              ? "🔥 PEAK"
              : "Standard",
      },
    };
  });

  return (
    <div className="mobile-shell">
      <header className="mobile-navbar">
        <button
          className="burger-btn"
          onClick={() => setBurgerOpen(!burgerOpen)}
          aria-label="Menu"
        >
          <div className={`bar ${burgerOpen ? "bar--top-open" : ""}`}></div>
          <div className={`bar ${burgerOpen ? "bar--mid-open" : ""}`}></div>
          <div className={`bar ${burgerOpen ? "bar--bot-open" : ""}`}></div>
        </button>
        <span className="navbar-brand">⚡ SPOT ON</span>
        <div className="status-dot">Live</div>
      </header>

      <nav
        className={`burger-drawer ${burgerOpen ? "burger-drawer--active" : ""}`}
      >
        <ul className="drawer-links">
          <div className="drawer-header">Main Views</div>
          <li>
            <button
              className={`drawer-nav-btn ${activePage === "prices" ? "active" : ""}`}
              onClick={() => {
                setActivePage("prices");
                setBurgerOpen(false);
              }}
            >
              📊 Rates Timeline
            </button>
          </li>
          <li>
            <button
              className={`drawer-nav-btn ${activePage === "bays" ? "active" : ""}`}
              onClick={() => {
                setActivePage("bays");
                setBurgerOpen(false);
              }}
            >
              🔌 Station Occupancy
            </button>
          </li>
        </ul>
        <div
          className="drawer-overlay-tap"
          onClick={() => setBurgerOpen(false)}
        ></div>
      </nav>

      <div className="page-content-viewport">
        {activePage === "prices" ? (
          <div className="sub-page">
            <PriceChart
              chartData={chartData}
              hours={hours}
              onPointSelect={setSelectedBooking}
            />
            <PriceList
              hours={hours}
              surchargeCt={surchargeCt}
              lowThreshold={lowThreshold}
              highThreshold={highThreshold}
              formatPriceCtToEur={formatPriceCtToEur}
              onSelectBooking={setSelectedBooking}
            />
          </div>
        ) : (
          <div className="sub-page">
            <StationManager
              stations={stations}
              stationAssetGroups={stationAssetGroups}
            />
          </div>
        )}
      </div>

      {selectedBooking && (
        <div className="modal-overlay" onClick={() => setSelectedBooking(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">⚡</div>
            <h3>Book Window</h3>
            <p>
              Reserve 1-hour session starting at{" "}
              <strong>{selectedBooking.time}</strong>.
            </p>
            <div className="price-estimate-box">
              <span>Rate:</span>
              <strong>€{selectedBooking.price} / kWh</strong>
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setSelectedBooking(null)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  alert(`Reserved!`);
                  setSelectedBooking(null);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
