// src/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { fetchDashboardData } from './mockData';
import AnalyticsChart from './AnalyticsChart'; // 1. IMPORT THE NEW CHART

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [timeframe, setTimeframe] = useState('day'); 
  const [activeChart, setActiveChart] = useState('all'); 
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchDashboardData(timeframe).then((result) => {
      setData(result);
      setLoading(false);
    });
  }, [timeframe]);

  const renderChartContainer = (id, title, color) => {
    if (activeChart !== 'all' && activeChart !== id) return null;

    const containerStyle = {
      border: '1px solid #e0e0e0',
      padding: '20px',
      borderRadius: '12px',
      backgroundColor: '#ffffff',
      boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
      flex: activeChart === 'all' ? '1 1 calc(50% - 20px)' : '1 1 100%',
      minWidth: '350px',
      transition: 'all 0.3s ease'
    };

    return (
      <div style={containerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0, color: '#333' }}>{title}</h3>
          <button 
            onClick={() => setActiveChart(activeChart === 'all' ? id : 'all')}
            style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', border: '1px solid #ccc', background: '#fff', fontWeight: '500' }}
          >
            {activeChart === 'all' ? '🔍 Zoom In' : '⬅️ Show All Charts'}
          </button>
        </div>
        
        {/* 2. REAL CHART REPLACES THE OLD PLACEHOLDER DIV */}
        <div style={{ height: '280px', width: '100%' }}>
          <AnalyticsChart 
            data={data} 
            metricId={id} 
            color={color} 
            timeframe={timeframe} 
          />
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '30px', fontFamily: 'system-ui, sans-serif', backgroundColor: '#f0f2f5', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ margin: 0, color: '#1a1a1a', fontSize: '24px' }}>Energy Management Workspace</h1>
        
        {/* ZOOM CONTROLS */}
        <div style={{ background: '#fff', padding: '4px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', border: '1px solid #e0e0e0' }}>
          <button 
            onClick={() => setTimeframe('day')} 
            style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: timeframe === 'day' ? '#0070f3' : 'transparent', color: timeframe === 'day' ? '#fff' : '#333', fontWeight: 'bold' }}
          >
            24 Hours
          </button>
          <button 
            onClick={() => setTimeframe('month')} 
            style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: timeframe === 'month' ? '#0070f3' : 'transparent', color: timeframe === 'month' ? '#fff' : '#333', fontWeight: 'bold' }}
          >
            Month
          </button>
          <button 
            onClick={() => setTimeframe('year')} 
            style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: timeframe === 'year' ? '#0070f3' : 'transparent', color: timeframe === 'year' ? '#fff' : '#333', fontWeight: 'bold' }}
          >
            Year
          </button>
        </div>
      </div>

      {loading ? (
        <h3 style={{ color: '#666' }}>Loading live feeds...</h3>
      ) : (
        /* CHARTS GRID */
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
          {renderChartContainer('price', 'Customer Prices', '#6366f1')}
          {renderChartContainer('cost', 'Production Cost', '#10b981')}
          {renderChartContainer('profit', 'Net Profit Margin', '#f59e0b')}
          {renderChartContainer('kw', 'Load Demand (kW)', '#ef4444')}
        </div>
      )}
    </div>
  );
}