import React from "react";

export default function PriceList({ hours, calculateMetrics, onSelectBooking }) {
  if (hours.length === 0) return <div className="loading">Syncing spot data...</div>;

  return (
    <div className="hours-interactive-list">
      {hours.map((h, i) => {
        // Call the parent calculator engine to apply margins and discount shares dynamically
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
              time: metrics.timeLabel, 
              price: metrics.priceEur, 
              label: metrics.tier 
            })}
          >
            <div className="btn-left">
              <span className="time-lbl">{metrics.timeLabel}</span>
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