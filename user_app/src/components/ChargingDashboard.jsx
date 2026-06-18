import { useEffect, useState } from "react";
// Import Recharts components to handle interactive touch/click tracking vectors
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import freeImg from "../assets/electric_car.png";
import takenImg from "../assets/car_red.png";
import freeImgPair from "../assets/electric_car_mirror.png";
import takenImgPair from "../assets/electric_car_mirror.png";

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
      { taken: takenImg, free: freeImg }, // Left Slot
      { taken: takenImgPair, free: freeImgPair }, // Right Slot
    ],
    // Station 2 Layout
    [
      { taken: takenImg, free: freeImg }, // Left Slot
      { taken: takenImgPair, free: freeImgPair }, // Right Slot
    ],
    // Station 3 Layout
    [
      { taken: takenImg, free: freeImg }, // Left Slot
      { taken: takenImgPair, free: takenImgPair }, // Right Slot
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

  // =========================================================================
  // PREPARING CHART DATA STRIPS FOR DYNAMIC INTERACTIVE TRIGGER COUPLING
  // =========================================================================
  const chartData = hours.map((h) => {
    const totalCt = (h.spot_ct_kwh || 0) + surchargeCt;
    const isLowPrice = totalCt <= lowThreshold;
    const isHighPrice = totalCt > highThreshold;
    const formattedTime = h.dt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const finalPrice = formatPriceCtToEur(totalCt);

    let label = "Standard";
    if (isLowPrice) label = "⚡ ECO SAVE";
    if (isHighPrice) label = "🔥 PEAK";

    return {
      name: formattedTime,
      price: finalPrice,
      label: label,
      rawItem: { time: formattedTime, price: finalPrice, label: label },
    };
  });

  // Handler capturing data point mouse events inside chart layers
  const handleChartClick = (state) => {
    if (state && state.activePayload && state.activePayload[0]) {
      const dataPoint = state.activePayload[0].payload.rawItem;
      setSelectedBooking(dataPoint);
    }
  };

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
        <span className="navbar-brand">⚡ SPOT ON</span>
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
            {/* =========================================================================
               NEW INTERACTIVE RATES TREND GRAPH CONTAINER OVERLAY BLOCK
               ========================================================================= */}
            {hours.length > 0 && (
              <div className="chart-overview-panel">
                <div className="chart-panel-header">
                  24h Price Trend{" "}
                  <span className="action-hint">(Tap curve to book)</span>
                </div>
                <div style={{ width: "100%", height: 130 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 10, right: 5, left: -25, bottom: 0 }}
                      // Handles general background grid clicks as a fallback safety
                      onClick={(state) => {
                        if (
                          state &&
                          typeof state.activeIndex === "number" &&
                          hours[state.activeIndex]
                        ) {
                          const target = hours[state.activeIndex];
                          const totalCt =
                            (target.spot_ct_kwh || 0) + surchargeCt;
                          const isLowPrice = totalCt <= lowThreshold;
                          const isHighPrice = totalCt > highThreshold;
                          setSelectedBooking({
                            time: target.dt.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            }),
                            price: formatPriceCtToEur(totalCt),
                            label: isLowPrice
                              ? "⚡ ECO SAVE"
                              : isHighPrice
                                ? "🔥 PEAK"
                                : "Standard",
                          });
                        }
                      }}
                    >
                      <defs>
                        <linearGradient
                          id="cyberNeonGlow"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#38bdf8"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#38bdf8"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="name"
                        stroke="#4b5563"
                        fontSize={9}
                        tickLine={false}
                        interval={4}
                      />
                      <YAxis
                        stroke="#4b5563"
                        fontSize={9}
                        tickLine={false}
                        domain={["auto", "auto"]}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#141822",
                          borderColor: "#1f293d",
                          borderRadius: "8px",
                        }}
                        labelStyle={{
                          color: "#9ca3af",
                          fontSize: "11px",
                          fontWeight: "bold",
                        }}
                        itemStyle={{
                          color: "#4ade80",
                          fontSize: "12px",
                          fontWeight: "bold",
                        }}
                        formatter={(value) => [`€${value}/kWh`]}
                      />
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke="#38bdf8"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#cyberNeonGlow)"
                        // ATTACHES CLICK LIFECYCLE HOOKS DIRECTLY TO MOBILE DOT TARGETS
                        activeDot={{
                          r: 6,
                          stroke: "#0d0f14",
                          strokeWidth: 2,
                          fill: "#4ade80",
                          onClick: (e, payload) => {
                            if (payload && payload.payload?.rawItem) {
                              setSelectedBooking(payload.payload.rawItem);
                            }
                          },
                        }}
                        style={{ cursor: "pointer" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

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
                const takenCount = stationSpots.filter(Boolean).length;
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
