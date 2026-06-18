import React from "react";

export default function PriceList({
  hours,
  surchargeCt,
  lowThreshold,
  highThreshold,
  formatPriceCtToEur,
  onSelectBooking,
}) {
  if (hours.length === 0) return <div className="loading">Syncing...</div>;

  return (
    <div className="hours-interactive-list">
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
            id={`hour-row-${i}`}
            className={`hour-booking-btn ${isLowPrice ? "hour-booking-btn--best" : isHighPrice ? "hour-booking-btn--peak" : ""}`}
            style={{ transition: "border-color 0.4s ease" }}
            onClick={() =>
              onSelectBooking({
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
  );
}
