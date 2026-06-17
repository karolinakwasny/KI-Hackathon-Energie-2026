// src/api.js

const BASE_URL = "http://localhost:8000";

// Helper function to fetch the live tariff directly from the backend /meta endpoint
const getLiveSurchargeCost = async () => {
  try {
    const response = await fetch(`${BASE_URL}/meta`);
    if (!response.ok) throw new Error("Failed to fetch backend metadata");
    const json = await response.json();
    
    const t = json.tariff;
    // Sum the dynamic values from your Python backend TARIFF dictionary
    return (
      t.ne_energy_ct_kwh +
      t.concession_ct_kwh +
      t.electricity_tax_ct_kwh +
      t.surcharges_ct_kwh +
      t.supplier_markup_ct_kwh
    );
  } catch (error) {
    console.error("Could not fetch live tariff from backend /meta, using fallback:", error);
    return 0.0 + 0.11 + 2.05 + 0.0 + 0.0; // Fail-safe emergency fallback
  }
};

export const fetchDashboardData = async (
  timeframe,
  { selectedYear = 2025, selectedMonth = 0, selectedDay = 1 } = {},
) => {
  try {
    // Dynamically retrieve the tariff directly from the backend server
    const staticSurcharge = await getLiveSurchargeCost();

    const targetMonth = String(selectedMonth + 1).padStart(2, "0");
    const targetDay = String(selectedDay).padStart(2, "0");
    const targetDatePrefix = `${selectedYear}-${targetMonth}-${targetDay}`;

    // ==========================================
    // 1. NEXT 24 HOURS VIEW (Hourly Load Profile)
    // ==========================================
    if (timeframe === "day") {
      const response = await fetch(
        `${BASE_URL}/timeseries?year=${selectedYear}&freq=H`,
      );
      if (!response.ok) throw new Error("Network error");
      const json = await response.json();
      const selectedDayPoints = json.points.filter((item) =>
        String(item.ts).startsWith(targetDatePrefix),
      );

      const sourcePoints = selectedDayPoints.length ? selectedDayPoints : json.points.slice(-24);

      return sourcePoints.map((item) => {
        const totalCostCt = item.spot_ct_kwh + staticSurcharge;
        const consumerPriceCt = totalCostCt * 1.3; // 30% margin rule from backend KPI target
        const profitCt = consumerPriceCt - totalCostCt;
    
        const cleanHourLabel = new Date(item.ts).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
    
        return {
          time: cleanHourLabel,
          price: parseFloat((consumerPriceCt / 100).toFixed(4)), // Convert cents -> EUR
          cost: parseFloat((totalCostCt / 100).toFixed(4)),
          profit: parseFloat((profitCt / 100).toFixed(4)),
          kw: item.grid_kwh, // Fallback safety for column naming
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

      const monthPrefix = `${selectedYear}-${targetMonth}`;
      const monthPoints = json.points.filter((item) =>
        String(item.ts).startsWith(monthPrefix),
      );

      return monthPoints.map((item) => {
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
          kw: item.grid_kwh || 0, 
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
          kw: item.grid_kwh || 0, 
        };
      });
    }

    return [];
  } catch (error) {
    console.error("Error communicating with FastAPI server:", error);
    return [];
  }
};