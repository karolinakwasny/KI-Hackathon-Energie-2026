// src/Dashboard.jsx
import React, { useState, useEffect } from 'react';
// import { fetchDashboardData } from './mockData';
import { fetchDashboardData } from './api';
import AnalyticsChart from './AnalyticsChart';
import CombinedChart from './CombinedChart';

export default function Dashboard() {
  // 1. Split timeframes so the top and bottom can change independently
  const [overviewTimeframe, setOverviewTimeframe] = useState('day');
  const [detailTimeframe, setDetailTimeframe] = useState('day');
  const [selectedYear] = useState(2025);
  const [selectedDate, setSelectedDate] = useState('2025-01-01');
  
  const selectedDateParts = selectedDate.split('-');
  const selectedMonth = Number(selectedDateParts[1]) - 1;
  const selectedDay = Number(selectedDateParts[2]);

  const [overviewData, setOverviewData] = useState([]);
  const [detailData, setDetailData] = useState([]);
  
  const [activeChart, setActiveChart] = useState('all'); // 'all', 'price', 'cost', 'profit', 'kw'
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(true);

  // Fetch data for the Master Overview Chart at the top
  useEffect(() => {
    setLoadingOverview(true);
    fetchDashboardData(overviewTimeframe, {
      selectedYear,
      selectedMonth,
      selectedDay,
    }).then((result) => {
      setOverviewData(result);
      setLoadingOverview(false);
    });
  }, [overviewTimeframe, selectedYear, selectedMonth, selectedDay]);

  // Fetch data for the Split / Expanded Charts at the bottom
  useEffect(() => {
    setLoadingDetail(true);
    fetchDashboardData(detailTimeframe, {
      selectedYear,
      selectedMonth,
      selectedDay,
    }).then((result) => {
      setDetailData(result);
      setLoadingDetail(false);
    });
  }, [detailTimeframe, selectedYear, selectedMonth, selectedDay]);

  // Helper component for the timeframe buttons to keep layout clean
  const TimeframeSelector = ({ current, onChange }) => (
    <div style={{ background: '#fff', padding: '4px', borderRadius: '8px', border: '1px solid #e0e0e0', display: 'inline-flex' }}>
      {['day', 'month', 'year'].map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            textTransform: 'capitalize',
            background: current === tf ? '#0070f3' : 'transparent',
            color: current === tf ? '#fff' : '#333',
            fontWeight: 'bold',
          }}
        >
          {tf === 'day' ? '24 Hours' : tf}
        </button>
      ))}
    </div>
  );

  const renderChartContainer = (id, title, color) => {
    if (activeChart !== 'all' && activeChart !== id) return null;

    const isMaximized = activeChart === id;

    const containerStyle = {
      border: '1px solid #e0e0e0',
      padding: '20px',
      borderRadius: '12px',
      backgroundColor: '#ffffff',
      boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
      flex: isMaximized ? '1 1 100%' : '1 1 calc(50% - 20px)',
      minWidth: '350px',
      transition: 'all 0.3s ease',
      boxSizing: 'border-box'
    };

    return (
      <div style={containerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#333' }}>{title}</h3>
            <small style={{ color: '#777' }}>Viewing: {detailTimeframe === 'day' ? '24 Hours' : detailTimeframe}</small>
          </div>
          <button 
            onClick={() => setActiveChart(isMaximized ? 'all' : id)}
            style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', border: '1px solid #ccc', background: '#fff', fontWeight: '500' }}
          >
            {isMaximized ? '⬅️ Back to Grid' : '🔍 View Separately'}
          </button>
        </div>
        
        <div style={{ height: '280px', width: '100%' }}>
          {loadingDetail ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Updating...</div>
          ) : (
            <AnalyticsChart data={detailData} metricId={id} color={color} timeframe={detailTimeframe} />
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '30px', fontFamily: 'system-ui, sans-serif', backgroundColor: '#f0f2f5', minHeight: '100vh' }}>
      
      <h1 style={{ margin: '0 0 30px 0', color: '#1a1a1a', fontSize: '26px' }}>Performance Analytics Workspace</h1>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '24px', padding: '16px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e0e0e0' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '6px' }}>Pick a date in 2025</label>
          <input
            type="date"
            min="2025-01-01"
            max="2025-12-31"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #ccc', background: '#fff' }}
          />
        </div>
        <div style={{ color: '#666', fontSize: '13px' }}>
          Showing hourly data for {selectedDate}
        </div>
      </div>

      {/* ================= MASTER OVERVIEW SECTION ================= */}
      <div style={{ marginBottom: '35px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#444' }}>System-Wide Trends</h2>
          {/* Master Overview Timeframe Controls */}
          <TimeframeSelector current={overviewTimeframe} onChange={setOverviewTimeframe} />
        </div>
        
        {loadingOverview ? (
          <div style={{ height: '390px', background: '#fff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e0e0e0' }}>
            <h3>Loading global overview...</h3>
          </div>
        ) : (
          <CombinedChart data={overviewData} timeframe={overviewTimeframe} />
        )}
      </div>

      <hr style={{ border: 'none', height: '1px', backgroundColor: '#ddd', margin: '40px 0' }} />

      {/* ================= METRIC BREAKDOWN SECTION ================= */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#444' }}>
            {activeChart === 'all' ? 'Component Breakdowns' : 'Focused Analysis View'}
          </h2>
          {/* Component Metrics Timeframe Controls - changes the 4 charts below */}
          <TimeframeSelector current={detailTimeframe} onChange={setDetailTimeframe} />
        </div>

        {/* CHARTS GRID */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
          {renderChartContainer('price', 'Customer Prices', '#6366f1')}
          {renderChartContainer('cost', 'Production Cost', '#10b981')}
          {renderChartContainer('profit', 'Net Profit Margin', '#f59e0b')}
          {renderChartContainer('kw', 'Load Demand (kW)', '#ef4444')}
        </div>
      </div>

    </div>
  );
}