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
    // 30 days
    { time: "Day 1", price: 3.40, cost: 2.10, profit: 1.30, kw: 32.4 },
    { time: "Day 2", price: 3.10, cost: 1.95, profit: 1.15, kw: 28.9 },
    // ...
    { time: "Day 30", price: 3.65, cost: 2.30, profit: 1.35, kw: 35.1 }
  ],
  year: [
    // 12 months
    { time: "Jan", price: 105.0, cost: 70.0, profit: 35.0, kw: 980 },
    { time: "Feb", price: 98.0, cost: 62.0, profit: 36.0, kw: 890 },
    // ...
    { time: "Dec", price: 120.0, cost: 85.0, profit: 35.0, kw: 1100 }
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