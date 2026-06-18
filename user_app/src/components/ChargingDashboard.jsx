import { useEffect, useState } from "react";
import freeImg from "../assets/electric_car.png";
import takenImg from "../assets/car_red.png";
import freeImgPair from "../assets/electric_car_mirror.png";
import takenImgPair from "../assets/car_red_mirror.png";

const BASE_URL = "http://localhost:8000";

function formatPriceCtToEur(ct) {
  return +(ct / 100).toFixed(3);
}

export default function ChargingDashboard() {
  const [activePage, setActivePage] = useState("prices"); // 'prices' or 'bays'
  const [hours, setHours] = useState([]);
  const [tariff, setTariff] = useState(null);
  const [spots, setSpots] = useState(new Array(6).fill(false));
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [burgerOpen, setBurgerOpen] = useState(false);

  const stations = [spots.slice(0, 2), spots.slice(2, 4), spots.slice(4, 6)];

  const stationAssetGroups = [
    // Station 1 Layout
    [
      { taken: takenImg, free: freeImg },         // Left Slot
      { taken: takenImgPair, free: freeImgPair }  // Right Slot
    ],
    // Station 2 Layout
    [
      { taken: takenImg, free: freeImg },         // Left Slot
      { taken: takenImgPair, free: freeImgPair }  // Right Slot
    ],
    // Station 3 Layout
    [
      { taken: takenImg, free: freeImg },         // Left Slot
      { taken: takenImgPair, free: freeImgPair }  // Right Slot
    ]
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

  return (
    <div className="mobile-shell">
      {/* HEADER NAVBAR */}
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
        <span className="navbar-brand">⚡ SMART HUB</span>
        <div className="status-dot">Live</div>
      </header>

      {/* BURGER PANEL NAVIGATION */}
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
          <div className="drawer-header">Account</div>
          <li>
            <button
              className="drawer-nav-btn"
              onClick={() => setBurgerOpen(false)}
            >
              👤 Profile
            </button>
          </li>
          <li>
            <button
              className="drawer-nav-btn"
              onClick={() => setBurgerOpen(false)}
            >
              💳 Billing
            </button>
          </li>
        </ul>
        <div
          className="drawer-overlay-tap"
          onClick={() => setBurgerOpen(false)}
        ></div>
      </nav>

      {/* DASHBOARD RENDER FRAME */}
      <div className="page-content-viewport">
        {activePage === "prices" ? (
          <div className="sub-page">
            <div className="hours-interactive-list">
              {hours.length === 0 && <div className="loading">Syncing...</div>}
              {hours.map((h, i) => {
                const totalCt = (h.spot_ct_kwh || 0) + surchargeCt;
                const isLowPrice = totalCt <= lowThreshold;
                const isHighPrice = totalCt > highThreshold;

                const formattedTime = h.dt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const finalPrice = formatPriceCtToEur(totalCt);

                let priceStatusLabel = "Standard";
                let badgeClass = "price-tag-badge";
                if (isLowPrice) {
                  priceStatusLabel = "⚡ ECO SAVE";
                  badgeClass = "price-tag-badge price-tag-badge--low";
                } else if (isHighPrice) {
                  priceStatusLabel = "🔥 PEAK";
                  badgeClass = "price-tag-badge price-tag-badge--high";
                }

                return (
                  <button
                    key={i}
                    className={`hour-booking-btn ${isLowPrice ? "hour-booking-btn--best" : isHighPrice ? "hour-booking-btn--peak" : ""}`}
                    onClick={() =>
                      setSelectedBooking({
                        time: formattedTime,
                        price: finalPrice,
                        label: priceStatusLabel,
                      })
                    }
                  >
                    <div className="btn-left">
                      <span className="time-lbl">{formattedTime}</span>
                      <span className={badgeClass}>{priceStatusLabel}</span>
                    </div>
                    <div className="btn-right">
                      <span
                        className={`price-lbl ${isLowPrice ? "price-lbl--neon" : isHighPrice ? "price-lbl--alert" : ""}`}
                      >
                        €{finalPrice}
                        <small>/kWh</small>
                      </span>
                      <span className="action-lbl">Book hour →</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="sub-page">
            <div className="stations-vertical-stack">
              {stations.map((stationSpots, stationIndex) => {
                // Count how many slots are true (taken) at this specific station
                const takenCount = stationSpots.filter(Boolean).length;

                // If 2 are taken -> OCCUPIED. Otherwise, at least one is free -> AVAILABLE.
                const isOccupied = takenCount === 2;

                return (
                  <div className="station-card" key={stationIndex}>
                    <div className="station-card-header">
                      <h3>Station {stationIndex + 1}</h3>
                      <span
                        className={`badge ${isOccupied ? "badge--busy" : "badge--avail"}`}
                      >
                        {isOccupied ? "OCCUPIED" : "AVAILABLE"}
                      </span>
                    </div>

                    <div className="station-row-track">
                      {stationSpots.map((taken, spotIndex) => {
                        const currentAssetPair =
                          stationAssetGroups[stationIndex][spotIndex];
                        const displayedImage = taken
                          ? currentAssetPair.taken
                          : currentAssetPair.free;

                        return (
                          <div
                            className={`spot-bay ${taken ? "spot-bay--active" : ""}`}
                            key={spotIndex}
                          >
                            <img
                              src={displayedImage}
                              alt="Telemetry tracking"
                            />
                            <div className="spot-bay-footer">
                              <span className="indicator-light"></span>
                              <span className="lbl">Slot {spotIndex + 1}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* RESERVATION CONFIRMATION DIALOG MODAL */}
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
