import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

export default function PriceChart({ chartData, hours, onPointSelect }) {
  const handleChartClick = (state) => {
    if (
      state &&
      typeof state.activeIndex === "number" &&
      hours[state.activeIndex]
    ) {
      const element = document.getElementById(`hour-row-${state.activeIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.style.borderColor = "#38bdf8";
        setTimeout(() => {
          element.style.borderColor = "";
        }, 1000);
      }
    }
  };

  return (
    <div className="chart-overview-panel">
      <div className="chart-panel-header">
        24h Price Trend{" "}
        <span className="action-hint">(Tap curve to find hour)</span>
      </div>
      <div style={{ width: "100%", height: 130 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 5, left: -25, bottom: 0 }}
            onClick={handleChartClick}
          >
            <defs>
              <linearGradient id="cyberNeonGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
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
              activeDot={{
                r: 6,
                stroke: "#0d0f14",
                strokeWidth: 2,
                fill: "#4ade80",
                onClick: (e, payload) => {
                  if (payload && typeof payload.index === "number") {
                    const element = document.getElementById(
                      `hour-row-${payload.index}`,
                    );
                    if (element)
                      element.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                  }
                },
              }}
              style={{ cursor: "pointer" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
