// src/api.js

const BASE_URL = "http://localhost:8000";

// Statutory values directly from BACKEND.md §5.4
const TARIFF_2025 = {
  ne_energy_ct_kwh: 0.0,
  concession_ct_kwh: 0.11,
  electricity_tax_ct_kwh: 2.05,
  surcharges_ct_kwh: 0.0,
  supplier_markup_ct_kwh: 0.0,
};

// Total statutory surcharges added to the wholesale spot price
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

    // ==========================================
    // 1. NEXT 24 HOURS VIEW (Hourly Load Profile)
    // ==========================================
    if (timeframe === "day") {
      const response = await fetch(
        `${BASE_URL}/load-profile/hourly?year=${selectedYear}`,
      );
      if (!response.ok) throw new Error("Network error");
      const json = await response.json();

      return json.hours.map((item) => {
        console.log("print object", item);
        const totalCostCt = item.spot_ct_kwh + staticSurcharge;
        const consumerPriceCt = totalCostCt * 1.3; // 30% margin rule from backend KPI target
        const profitCt = consumerPriceCt - totalCostCt;

        return {
          time: `${String(item.hour).padStart(2, "0")}:00`,
          price: parseFloat((consumerPriceCt / 100).toFixed(4)), // Convert cents -> EUR
          cost: parseFloat((totalCostCt / 100).toFixed(4)),
          profit: parseFloat((profitCt / 100).toFixed(4)),
          kw: item.sold_kwh,
        };
      });
    }

    // ==========================================
    // 2. HISTORIC MONTH VIEW (Last 30 Days)
    // ==========================================
    if (timeframe === "month") {
      const response = await fetch(
        `${BASE_URL}/timeseries?year=${selectedYear}&freq=D`,
      );
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const json = await response.json();

      // Slice out the trailing 30 days of the dataset
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
          kw: item.peak_kw, // Daily maximum load
        };
      });
    }

    // ==========================================
    // 3. HISTORIC YEAR VIEW (12 Months)
    // ==========================================
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
        const totalCostCt = item.spot_ct_kwh + staticSurcharge;
        const consumerPriceCt = totalCostCt * 1.3;
        const profitCt = consumerPriceCt - totalCostCt;

        return {
          time: cleanMonth,
          price: parseFloat((consumerPriceCt / 100).toFixed(2)),
          cost: parseFloat((totalCostCt / 100).toFixed(2)),
          profit: parseFloat((profitCt / 100).toFixed(2)),
          kw: item.peak_kw, // Monthly peak demand load
        };
      });
    }

    return [];
  } catch (error) {
    console.error("Error communicating with FastAPI server:", error);
    return [];
  }
};
