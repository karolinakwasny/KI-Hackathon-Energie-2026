// src/api.js

const BASE_URL = "http://localhost:8000";

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

      // Transform FastAPI keys into format expected by Recharts
      return json.hours.map((item) => {
        const calculatedCost = item.spot_ct_kwh * 0.8; // Baseline generation estimate
        return {
          time: `${String(item.hour).padStart(2, "0")}:00`,
          price: item.spot_ct_kwh,
          cost: parseFloat(calculatedCost.toFixed(2)),
          profit: parseFloat((item.spot_ct_kwh - calculatedCost).toFixed(2)),
          kw: item.avg_kw,
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
        const totalCostCt = item.spot_ct_kwh + staticSurcharge;
        const consumerPriceCt = totalCostCt * 1.3;
        const profitCt = consumerPriceCt - totalCostCt;

        return {
          time: cleanDate,
          price: parseFloat((consumerPriceCt / 100).toFixed(2)),
          cost: parseFloat((totalCostCt / 100).toFixed(2)),
          profit: parseFloat((profitCt / 100).toFixed(2)),
          kw: item.peak_kw,
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
        const calculatedCost = item.spot_ct_kwh * 0.85;

        return {
          time: cleanMonth,
          price: item.spot_ct_kwh,
          cost: parseFloat(calculatedCost.toFixed(2)),
          profit: parseFloat((item.spot_ct_kwh - calculatedCost).toFixed(2)),
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
