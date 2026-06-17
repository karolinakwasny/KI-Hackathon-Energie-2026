const generateRawTimeSeriesData = () => {
  const data = [];
  // Set a fixed anchor point for "now" (June 17, 2026)
  const now = new Date("2026-06-17T12:00:00Z");
  
  // We generate data from 365 days ago up to 1 day in the future (+24 hours forecast)
  const totalHours = 365 * 24 + 24; 
  const startDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));

  for (let i = 0; i < totalHours; i++) {
    const currentHourDate = new Date(startDate.getTime() + i * 60 * 60 * 1000);
    const month = currentHourDate.getMonth();
    const hour = currentHourDate.getHours();
    const isWeekend = currentHourDate.getDay() === 0 || currentHourDate.getDay() === 6;

    // Simulate natural baselines based on seasons/hours
    let seasonalMultiplier = 1.0;
    if (month >= 5 && month <= 7) seasonalMultiplier = 1.3; // Summer AC Spike
    if (month === 11 || month === 0) seasonalMultiplier = 1.2; // Winter Heating Spike
    if (month >= 2 && month <= 3) seasonalMultiplier = 0.8; // Spring Low Demand

    let dailyMultiplier = 0.6;
    if (hour >= 8 && hour <= 20) dailyMultiplier = 1.4; // Mid-day business hours demand

    const weekendReduction = isWeekend ? 0.75 : 1.0;

    // Generate correlated metrics
    const baseKw = 1.5 * seasonalMultiplier * dailyMultiplier * weekendReduction + (Math.random() * 0.3);
    const cost = 0.08 * seasonalMultiplier * dailyMultiplier + (Math.random() * 0.02);
    // Forecasted price goes up during peak demand hours
    const price = cost + 0.05 + (hour >= 16 && hour <= 20 ? 0.06 : 0.01); 
    const profit = price - cost;

    data.push({
      timestamp: currentHourDate.toISOString(),
      price: parseFloat(price.toFixed(3)),
      cost: parseFloat(cost.toFixed(3)),
      profit: parseFloat(profit.toFixed(3)),
      kw: parseFloat(baseKw.toFixed(1))
    });
  }
  return data;
};

// This is our simulated massive central database
const globalDatabase = generateRawTimeSeriesData();


// ==========================================
// 2. BACKEND COMPRESSION/FILTERING ENGINE
// ==========================================
export const fetchDashboardData = (timeframe) => {
  return new Promise((resolve) => {
    const now = new Date("2026-06-17T12:00:00Z"); // Sync anchor point

    // --- NEXT 24 HOURS FORECAST ---
    if (timeframe === 'day') {
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const filtered = globalDatabase.filter(d => {
        const dDate = new Date(d.timestamp);
        return dDate >= now && dDate <= tomorrow;
      });

      // Format X-axis label to clean hours "14:00"
      const formatted = filtered.map(d => ({
        ...d,
        time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      }));
      return resolve(formatted);
    }

    // --- PAST 30 DAYS HISTORY (Aggregated to 1 point per day) ---
    if (timeframe === 'month') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const filtered = globalDatabase.filter(d => {
        const dDate = new Date(d.timestamp);
        return dDate >= thirtyDaysAgo && dDate <= now;
      });

      // Group the 720 hours into 30 calendar days
      const dailyGroups = {};
      filtered.forEach(d => {
        const dateKey = d.timestamp.split('T')[0]; // "2026-06-15"
        if (!dailyGroups[dateKey]) dailyGroups[dateKey] = [];
        dailyGroups[dateKey].push(d);
      });

      const aggregated = Object.keys(dailyGroups).sort().map(dateStr => {
        const records = dailyGroups[dateStr];
        const count = records.length;
        
        // Sum and average totals for that day
        const avgPrice = records.reduce((sum, r) => sum + r.price, 0) / count;
        const avgCost = records.reduce((sum, r) => sum + r.cost, 0) / count;
        const avgProfit = records.reduce((sum, r) => sum + r.profit, 0) / count;
        // Total load consumed during that entire day
        const totalKw = records.reduce((sum, r) => sum + r.kw, 0); 

        // Clean label: "Jun 15"
        const displayLabel = new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });

        return {
          time: displayLabel,
          price: parseFloat(avgPrice.toFixed(2)),
          cost: parseFloat(avgCost.toFixed(2)),
          profit: parseFloat(avgProfit.toFixed(2)),
          kw: parseFloat(totalKw.toFixed(1))
        };
      });

      return resolve(aggregated);
    }

    // --- PAST 1 YEAR HISTORY (Aggregated to 1 point per month) ---
    if (timeframe === 'year') {
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      const filtered = globalDatabase.filter(d => {
        const dDate = new Date(d.timestamp);
        return dDate >= oneYearAgo && dDate <= now;
      });

      // Group the 8,760 hours into 12 months
      const monthlyGroups = {};
      filtered.forEach(d => {
        const dateObj = new Date(d.timestamp);
        const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`; // "2026-05"
        if (!monthlyGroups[monthKey]) monthlyGroups[monthKey] = [];
        monthlyGroups[monthKey].push(d);
      });

      const aggregated = Object.keys(monthlyGroups).sort().map(monthStr => {
        const records = monthlyGroups[monthStr];
        const count = records.length;

        const avgPrice = records.reduce((sum, r) => sum + r.price, 0) / count;
        const avgCost = records.reduce((sum, r) => sum + r.cost, 0) / count;
        const avgProfit = records.reduce((sum, r) => sum + r.profit, 0) / count;
        const totalKw = records.reduce((sum, r) => sum + r.kw, 0);

        const displayLabel = new Date(monthStr + "-02").toLocaleDateString([], { month: 'short' });

        return {
          time: displayLabel,
          price: parseFloat((avgPrice * 24 * 30).toFixed(0)),   // Monthly scale estimation
          cost: parseFloat((avgCost * 24 * 30).toFixed(0)),
          profit: parseFloat((avgProfit * 24 * 30).toFixed(0)),
          kw: parseFloat((totalKw).toFixed(0))
        };
      });

      return resolve(aggregated);
    }

    return resolve([]);
  });
};