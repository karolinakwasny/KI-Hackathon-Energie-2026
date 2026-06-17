// mockData.js

export const mockBackendData = {
  day: [
    { time: "00:00", price: 0.12, cost: 0.08, profit: 0.04, kw: 1.2 },
    { time: "01:00", price: 0.11, cost: 0.07, profit: 0.04, kw: 0.9 },
    { time: "02:00", price: 0.10, cost: 0.06, profit: 0.04, kw: 0.8 },
    { time: "03:00", price: 0.09, cost: 0.05, profit: 0.04, kw: 0.7 },
    { time: "04:00", price: 0.09, cost: 0.05, profit: 0.04, kw: 0.6 },
    { time: "05:00", price: 0.11, cost: 0.06, profit: 0.05, kw: 0.8 },
    { time: "06:00", price: 0.14, cost: 0.09, profit: 0.05, kw: 1.4 },
    { time: "07:00", price: 0.18, cost: 0.12, profit: 0.06, kw: 2.1 },
    { time: "08:00", price: 0.22, cost: 0.15, profit: 0.07, kw: 2.5 },
    { time: "09:00", price: 0.25, cost: 0.17, profit: 0.08, kw: 2.3 },
    { time: "10:00", price: 0.24, cost: 0.16, profit: 0.08, kw: 2.0 },
    { time: "11:00", price: 0.22, cost: 0.14, profit: 0.08, kw: 1.8 },
    { time: "12:00", price: 0.20, cost: 0.12, profit: 0.08, kw: 1.9 },
    { time: "13:00", price: 0.19, cost: 0.11, profit: 0.08, kw: 1.7 },
    { time: "14:00", price: 0.18, cost: 0.11, profit: 0.07, kw: 1.6 },
    { time: "15:00", price: 0.21, cost: 0.13, profit: 0.08, kw: 1.8 },
    { time: "16:00", price: 0.24, cost: 0.15, profit: 0.09, kw: 2.2 },
    { time: "17:00", price: 0.28, cost: 0.19, profit: 0.09, kw: 2.7 },
    { time: "18:00", price: 0.30, cost: 0.21, profit: 0.09, kw: 2.9 },
    { time: "19:00", price: 0.29, cost: 0.20, profit: 0.09, kw: 2.8 },
    { time: "20:00", price: 0.25, cost: 0.17, profit: 0.08, kw: 2.4 },
    { time: "21:00", price: 0.20, cost: 0.14, profit: 0.06, kw: 1.9 },
    { time: "22:00", price: 0.16, cost: 0.11, profit: 0.05, kw: 1.6 },
    { time: "23:00", price: 0.13, cost: 0.09, profit: 0.04, kw: 1.3 }
  ],
  month: [
    { time: "Day 1", price: 3.40, cost: 2.10, profit: 1.30, kw: 32.4 },
    { time: "Day 2", price: 3.10, cost: 1.95, profit: 1.15, kw: 28.9 },
    { time: "Day 3", price: 3.25, cost: 2.00, profit: 1.25, kw: 30.1 },
    { time: "Day 4", price: 3.60, cost: 2.20, profit: 1.40, kw: 34.8 },
    { time: "Day 5", price: 3.80, cost: 2.40, profit: 1.40, kw: 36.2 },
    { time: "Day 6", price: 2.90, cost: 1.80, profit: 1.10, kw: 25.4 }, // Weekend dip
    { time: "Day 7", price: 2.80, cost: 1.75, profit: 1.05, kw: 24.1 }, 
    { time: "Day 8", price: 3.35, cost: 2.05, profit: 1.30, kw: 31.9 },
    { time: "Day 9", price: 3.50, cost: 2.15, profit: 1.35, kw: 33.0 },
    { time: "Day 10", price: 3.42, cost: 2.10, profit: 1.32, kw: 32.7 },
    { time: "Day 11", price: 3.65, cost: 2.25, profit: 1.40, kw: 35.0 },
    { time: "Day 12", price: 3.90, cost: 2.50, profit: 1.40, kw: 38.6 }, // Peak heat/cold spike
    { time: "Day 13", price: 3.10, cost: 1.90, profit: 1.20, kw: 27.2 },
    { time: "Day 14", price: 2.95, cost: 1.85, profit: 1.10, kw: 26.0 },
    { time: "Day 15", price: 3.30, cost: 2.00, profit: 1.30, kw: 31.5 },
    { time: "Day 16", price: 3.45, cost: 2.10, profit: 1.35, kw: 33.1 },
    { time: "Day 17", price: 3.55, cost: 2.18, profit: 1.37, kw: 34.2 },
    { time: "Day 18", price: 3.70, cost: 2.30, profit: 1.40, kw: 35.9 },
    { time: "Day 19", price: 3.85, cost: 2.45, profit: 1.40, kw: 37.4 },
    { time: "Day 20", price: 3.00, cost: 1.85, profit: 1.15, kw: 26.8 },
    { time: "Day 21", price: 2.85, cost: 1.70, profit: 1.15, kw: 24.9 },
    { time: "Day 22", price: 3.40, cost: 2.08, profit: 1.32, kw: 32.0 },
    { time: "Day 23", price: 3.50, cost: 2.15, profit: 1.35, kw: 33.5 },
    { time: "Day 24", price: 3.62, cost: 2.22, profit: 1.40, kw: 34.9 },
    { time: "Day 25", price: 3.75, cost: 2.35, profit: 1.40, kw: 36.1 },
    { time: "Day 26", price: 3.95, cost: 2.55, profit: 1.40, kw: 39.2 },
    { time: "Day 27", price: 3.20, cost: 1.95, profit: 1.25, kw: 28.5 },
    { time: "Day 28", price: 3.05, cost: 1.80, profit: 1.25, kw: 27.0 },
    { time: "Day 29", price: 3.50, cost: 2.15, profit: 1.35, kw: 33.3 },
    { time: "Day 30", price: 3.65, cost: 2.30, profit: 1.35, kw: 35.1 }
  ],
  year: [
    { time: "Jan", price: 105.0, cost: 70.0, profit: 35.0, kw: 980 },
    { time: "Feb", price: 98.0, cost: 62.0, profit: 36.0, kw: 890 },
    { time: "Mar", price: 90.0, cost: 58.0, profit: 32.0, kw: 820 },  // Mild weather drop
    { time: "Apr", price: 85.0, cost: 55.0, profit: 30.0, kw: 790 },
    { time: "May", price: 110.0, cost: 72.0, profit: 38.0, kw: 1010 },
    { time: "Jun", price: 135.0, cost: 90.0, profit: 45.0, kw: 1240 }, // Summer AC spike
    { time: "Jul", price: 150.0, cost: 102.0, profit: 48.0, kw: 1390 },
    { time: "Aug", price: 145.0, cost: 98.0, profit: 47.0, kw: 1350 },
    { time: "Sep", price: 115.0, cost: 75.0, profit: 40.0, kw: 1050 },
    { time: "Oct", price: 95.0, cost: 60.0, profit: 35.0, kw: 860 },
    { time: "Nov", price: 108.0, cost: 71.0, profit: 37.0, kw: 990 },
    { time: "Dec", price: 120.0, cost: 85.0, profit: 35.0, kw: 1100 }  // Winter heating spike
  ]
};

// Simulated API helper for your hackathon
export const fetchDashboardData = (timeframe) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockBackendData[timeframe] || mockBackendData.day);
    }, 300); // 300ms simulated network delay
  });
};