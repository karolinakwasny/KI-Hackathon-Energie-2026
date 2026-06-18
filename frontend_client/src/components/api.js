// src/api.js

const BASE_URL = "http://localhost:8001";

const TARIFF_2025 = {
  ne_energy_ct_kwh: 8.24,
  concession_ct_kwh: 0.11,
  electricity_tax_ct_kwh: 2.05,
  surcharges_ct_kwh: 0.0,
  supplier_markup_ct_kwh: 0.0,
};

const getSurchargeCost = () => {
  return (
    TARIFF_2025.ne_energy_ct_kwh +
    TARIFF_2025.concession_ct_kwh +
    TARIFF_2025.electricity_tax_ct_kwh +
    TARIFF_2025.surcharges_ct_kwh +
    TARIFF_2025.supplier_markup_ct_kwh
  );
};

export const fetchDashboardData = async (timeframe, selectedYear = 2025) => {
  try {
    const staticSurcharge = getSurchargeCost();
    // 1. NEXT 24 HOURS VIEW (Hourly Load Profile)
    if (timeframe === "day") {
      const response = await fetch(
        `${BASE_URL}/load-profile/hourly?year=${selectedYear}`,
      );
      if (!response.ok) throw new Error("Network error");
      const json = await response.json();

      return json.hours.map((item) => {
        const costCt = (staticSurcharge + item.spot_ct_kwh) * item.avg_kw;
        const priceCt = costCt * 1.3;
        const profitCt = priceCt - costCt;
        return {
          time: `${String(item.hour).padStart(2, "0")}:00`,
          price: parseFloat((priceCt / 100).toFixed(2)),
          cost: parseFloat((costCt / 100).toFixed(2)),
          profit: parseFloat((profitCt / 100).toFixed(2)),
          kw: parseFloat(item.avg_kw.toFixed(2)),
        };
      });
    }

    if (timeframe === "month") {
      const response = await fetch(
        `${BASE_URL}/timeseries?year=${selectedYear}&freq=D`,
      );
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const json = await response.json();

      // FIX: Take the 365 daily points and slice the last 30 points (approx 1 month of history)
      // If your data runs through June, this gives you mid-May to mid-June.
      const last30Days = json.points.slice(-30);

      return last30Days.map((item) => {
        const cleanDate = new Date(item.ts).toLocaleDateString([], {
          month: "short",
          day: "numeric",
        });
        const costCt = (staticSurcharge + item.spot_ct_kwh) * item.grid_kwh;
        const priceCt = costCt * 1.3;
        const profitCt = priceCt - costCt;

        return {
          time: cleanDate,
          price: parseFloat((priceCt / 100).toFixed(2)),
          cost: parseFloat((costCt / 100).toFixed(2)),
          profit: parseFloat((profitCt / 100).toFixed(2)),
          kw: parseFloat(item.sold_kwh.toFixed(2)),
        };
      });
    }
    // 3. HISTORIC YEAR VIEW (Aggregated Monthly)
    if (timeframe === "year") {
      const response = await fetch(
        `${BASE_URL}/timeseries?year=${selectedYear}&freq=M`,
      );
      if (!response.ok) throw new Error("Network error");
      const json = await response.json();

      return json.points.map((item) => {
        const cleanMonth = new Date(item.ts).toLocaleDateString([], {
          month: "short",
        });
        const costCt = (staticSurcharge + item.spot_ct_kwh) * item.grid_kwh;
        const priceCt = costCt * 1.3;
        const profitCt = priceCt - costCt;

        return {
          time: cleanMonth,
          price: parseFloat((priceCt / 100).toFixed(2)),
          cost: parseFloat((costCt / 100).toFixed(2)),
          profit: parseFloat((profitCt / 100).toFixed(2)),
          kw: item.grid_kwh,
        };
      });
    }

    return [];
  } catch (error) {
    console.error("Error communicating with FastAPI server:", error);
    return [];
  }
};
