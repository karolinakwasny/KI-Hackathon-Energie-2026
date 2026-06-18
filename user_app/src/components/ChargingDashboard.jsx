import { useEffect, useState } from "react";
import PriceChart from "./PriceChart";
import PriceList from "./PriceList";
import StationManager from "./StationManager";
import ProfileManager from "./ProfileManager";

import takenImg from "../assets/car_red.png";
import freeImg from "../assets/electric_car.png";
import takenImgPair from "../assets/car_red_mirror.png";
import freeImgPair from "../assets/electric_car_mirror.png";

const BASE_URL = "http://localhost:8000";
const CONTRACT_ID = "DE-LDK-C19746643-5";

export default function ChargingDashboard() {
  const [activePage, setActivePage] = useState("prices");
  const [hours, setHours] = useState([]);
  const [tariff, setTariff] = useState(null);
  const [contractOffer, setContractOffer] = useState(null); // Holds dynamic contract metadata
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
      { taken: takenImgPair, free: freeImgPair },
    ],
  ];

  // src/ChargingDashboard.jsx

useEffect(() => {
  let mounted = true;
  async function loadData() {
    try {
      // Pipeline 1: Fetch Contract-Specific Offer Constraints
      const contractRes = await fetch(`${BASE_URL}/users/${CONTRACT_ID}/offers`);
      const contractData = contractRes.ok ? await contractRes.json() : null;
      if (mounted && contractData) setContractOffer(contractData);

      // Pipeline 2: Fetch Base Tariff Meta Surcharges
      const metaRes = await fetch(`${BASE_URL}/meta`);
      const meta = metaRes.ok ? await metaRes.json() : null;
      if (mounted && meta?.tariff) setTariff(meta.tariff);

      // =========================================================================
      // PIPELINE 3: SYNC CLOCK SYNC VIA SERVER EPOCH MS
      // =========================================================================
      let serverEpoch = Date.now();
      try {
        const timeRes = await fetch(`${BASE_URL}/time/now`);
        if (timeRes.ok) {
          const timeJson = await timeRes.json();
          serverEpoch = timeJson.epoch_ms; // Exact numeric reference point
        }
      } catch (err) {
        console.warn("Server clock sync failed, using browser clock fallback", err);
      }

      // Roll back to the top of the current hour using mathematical rounding
      const oneHourInMs = 60 * 60 * 1000;
      const currentServerHourStartMs = Math.floor(serverEpoch / oneHourInMs) * oneHourInMs;

      // Pipeline 4: Fetch Environmental Spot Timeseries
      const tsRes = await fetch(`${BASE_URL}/timeseries?year=2025&freq=H`);
      if (!tsRes.ok) throw new Error("Failed to load timeseries");
      const tsJson = await tsRes.json();

      const points = tsJson.points || [];
      const rollingWindow = points
        .map((p) => {
          // Parse the item timestamp into numerical milliseconds for calculation
          const parsedMs = typeof p.ts === "number" ? p.ts : new Date(p.ts).getTime();
          return { ...p, tsMs: parsedMs, dt: new Date(parsedMs) };
        })
        // Look directly at numerical values: item time >= current rounded server hour
        .filter((p) => p.tsMs >= currentServerHourStartMs)
        // Extract precisely the next 24 hours of data
        .slice(0, 24);

      // Safeguard fallback slice if bounds overflow data constraints
      const final = rollingWindow.length 
        ? rollingWindow 
        : points.slice(-24).map((p) => ({ ...p, dt: new Date(p.ts) }));
      
      if (mounted) setHours(final);
    } catch (e) {
      console.error("Data pipeline sync error:", e);
    }
  }
  loadData();
  return () => (mounted = false);
}, []);

  // Live real-time occupancy simulation loop
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

  // Compute standard baseline grid surcharges
  const surchargeCt = tariff
    ? (tariff.ne_energy_ct_kwh || 0) +
      (tariff.concession_ct_kwh || 0) +
      (tariff.electricity_tax_ct_kwh || 0) +
      (tariff.surcharges_ct_kwh || 0) +
      (tariff.supplier_markup_ct_kwh || 0)
    : 0;

  // =========================================================================
  // CONTRACT TIER PRICING CALCULATOR LOGIC ENGINE
  // =========================================================================
  const calculateDerivedContractMetrics = (h) => {
    const currentHourNum = h.dt.getHours();

    // 1. Establish hard fallback price defaults matching your new JSON payload structure
    const cheapHours = contractOffer?.cheap_hours || [11, 12, 13, 14];
    const peakHours = contractOffer?.expensive_hours || [18, 19, 20, 21];
    
    const pricingData = contractOffer?.pricing || {
      standard_price_ct_kwh: 22.19,
      offer_price_ct_kwh: 16.17,
      usual_evening_price_ct_kwh: 32.93
    };

    let finalPriceCt = pricingData.standard_price_ct_kwh ;
    let pricingTier = "Standard";

    // 2. Map directly to pre-calculated backend targets depending on active hour window
    if (cheapHours.includes(currentHourNum)) {
      finalPriceCt = pricingData.offer_price_ct_kwh; // Pre-calculated discount rate (€0.1617)
      pricingTier = "⚡ ECO SAVE";
    } else if (peakHours.includes(currentHourNum)) {
      finalPriceCt = pricingData.usual_evening_price_ct_kwh; // Pre-calculated evening surge rate (€0.3293)
      pricingTier = "🔥 PEAK";
    }

    // Convert total Cents directly into Euro decimal representation parameters
    const priceEur = +(finalPriceCt / 100).toFixed(4);
    const timeString = h.dt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    return {
      timeLabel: timeString,
      priceEur: priceEur,
      tier: pricingTier,
    };
  };

  // Compile calculated parameters for downstream graphing layers
  const computedTimelineData = hours.map((h, i) => {
    // Determine rolling hour string to enforce time shift parity between list and graph
    const now = new Date();
    const targetHour = (now.getHours() + i) % 24;
    
    const workingHourDate = new Date(h.dt);
    workingHourDate.setHours(targetHour);
    
    // Evaluate metrics using the chronologically shifted date instance
    const metrics = calculateDerivedContractMetrics({ ...h, dt: workingHourDate });
    const dynamicTimeLabel = `${String(targetHour).padStart(2, "0")}:00`;

    return {
      name: dynamicTimeLabel,
      price: metrics.priceEur,
      rawItem: {
        time: dynamicTimeLabel,
        price: metrics.priceEur,
        label: metrics.tier,
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
          <div className="drawer-header">Account</div>
          <li>
            <button
              className={`drawer-nav-btn ${activePage === "profile" ? "active" : ""}`}
              onClick={() => {
                setActivePage("profile");
                setBurgerOpen(false);
              }}
            >
              👤 Profile
            </button>
          </li>
        </ul>
        <div
          className="drawer-overlay-tap"
          onClick={() => setBurgerOpen(false)}
        ></div>
      </nav>

      <div className="page-content-viewport">
        {activePage === "prices" && (
          <div className="sub-page">
            <PriceChart chartData={computedTimelineData} hours={hours} />
            <PriceList
              hours={hours}
              calculateMetrics={calculateDerivedContractMetrics}
              onSelectBooking={setSelectedBooking}
            />
          </div>
        )}
        {activePage === "bays" && (
          <div className="sub-page">
            <StationManager
              stations={stations}
              stationAssetGroups={stationAssetGroups}
            />
          </div>
        )}
        {activePage === "profile" && (
          <div className="sub-page">
            <ProfileManager />
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
              <span>Rate ({selectedBooking.label}):</span>
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
                  alert(`Reserved successfully at ${selectedBooking.time}!`);
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
