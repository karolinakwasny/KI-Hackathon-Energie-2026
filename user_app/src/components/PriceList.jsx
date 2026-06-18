import React from "react";

export default function PriceList({ hours, calculateMetrics, onSelectBooking }) {
  if (hours.length === 0) return <div className="loading">Syncing spot data...</div>;

  // 1. Capture the exact hour right now from the client machine
  const now = new Date();
  const currentHourNum = now.getHours();

  return (
    <div className="hours-interactive-list">
      {hours.map((h, i) => {
        // 2. Dynamically calculate the precise rolling hour offset forward
        const targetHour = (currentHourNum + i) % 24;
        
        // Format it cleanly to look like a premium digital clock (e.g., "14:00")
        const dynamicTimeLabel = `${String(targetHour).padStart(2, "0")}:00`;

        // 3. Inject this specific chronological window into your backend metric evaluator
        // We override the internal date parameters so the logic tier flags PEAK vs ECO correctly
        const workingHourDate = new Date(h.dt);
        workingHourDate.setHours(targetHour);
        h.dt = workingHourDate;

        const metrics = calculateMetrics(h);
        const isLowPrice = metrics.tier === "⚡ ECO SAVE";
        const isHighPrice = metrics.tier === "🔥 PEAK";

        let layoutBtnClass = "hour-booking-btn";
        if (isLowPrice) layoutBtnClass += " hour-booking-btn--best";
        if (isHighPrice) layoutBtnClass += " hour-booking-btn--peak";

        return (
          <button
            key={i}
            id={`hour-row-${i}`}
            className={layoutBtnClass}
            style={{ transition: "border-color 0.4s ease" }}
            onClick={() => onSelectBooking({ 
              time: dynamicTimeLabel, // Use our rolling string override
              price: metrics.priceEur, 
              label: metrics.tier 
            })}
          >
            <div className="btn-left">
              {/* DISPLAY THE CORRECT SHIFTED TIME STRING */}
              <span className="time-lbl">{dynamicTimeLabel}</span>
              <span className={`price-tag-badge ${isLowPrice ? "price-tag-badge--low" : isHighPrice ? "price-tag-badge--high" : ""}`}>
                {metrics.tier}
              </span>
            </div>
            <div className="btn-right">
              <span className={`price-lbl ${isLowPrice ? "price-lbl--neon" : isHighPrice ? "price-lbl--alert" : ""}`}>
                €{metrics.priceEur.toFixed(4)}<small>/kWh</small>
              </span>
              <span className="action-lbl">Book hour →</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}