// src/Dashboard.jsx
import React, { useState, useEffect } from 'react';
// import { fetchDashboardData } from './mockData';
import { fetchDashboardData } from './api';
import AnalyticsChart from './AnalyticsChart';
import CombinedChart from './CombinedChart';

const NAVY = '#0d2461';
const FONT = "'Segoe UI', Arial, sans-serif";

export default function Dashboard() {
  // 1. Split timeframes so the top and bottom can change independently
  const [overviewTimeframe, setOverviewTimeframe] = useState('day');
  const [detailTimeframe, setDetailTimeframe] = useState('day');
  
  const [overviewData, setOverviewData] = useState([]);
  const [detailData, setDetailData] = useState([]);
  
  const [activeChart, setActiveChart] = useState('all'); // 'all', 'price', 'cost', 'profit', 'kw'
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(true);

  // Fetch data for the Master Overview Chart at the top
  useEffect(() => {
    setLoadingOverview(true);
    fetchDashboardData(overviewTimeframe).then((result) => {
      setOverviewData(result);
      setLoadingOverview(false);
    });
  }, [overviewTimeframe]);

  // Fetch data for the Split / Expanded Charts at the bottom
  useEffect(() => {
    setLoadingDetail(true);
    fetchDashboardData(detailTimeframe).then((result) => {
      setDetailData(result);
      setLoadingDetail(false);
    });
  }, [detailTimeframe]);

  // Helper component for the timeframe buttons to keep layout clean
  const TimeframeSelector = ({ current, onChange }) => (
    <div style={{ background: '#f4f6fb', padding: '4px', borderRadius: '8px', border: `1px solid #dde3f0`, display: 'inline-flex' }}>
      {['day', 'month', 'year'].map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          style={{
            padding: '6px 16px',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontFamily: FONT,
            textTransform: 'capitalize',
            background: current === tf ? NAVY : 'transparent',
            color: current === tf ? '#fff' : NAVY,
            fontWeight: '600',
            letterSpacing: '0.02em',
          }}
        >
          {tf === 'day' ? '24 Hours' : tf.charAt(0).toUpperCase() + tf.slice(1)}
        </button>
      ))}
    </div>
  );

  const renderChartContainer = (id, title, color) => {
    if (activeChart !== 'all' && activeChart !== id) return null;

    const isMaximized = activeChart === id;

    const containerStyle = {
      border: '1px solid #dde3f0',
      padding: '24px',
      borderRadius: '0',
      backgroundColor: '#ffffff',
      boxShadow: '0 2px 12px rgba(13,36,97,0.07)',
      flex: isMaximized ? '1 1 100%' : '1 1 calc(50% - 20px)',
      minWidth: '350px',
      transition: 'all 0.3s ease',
      boxSizing: 'border-box'
    };

    return (
      <div style={containerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div>
            <h3 style={{ margin: 0, color: NAVY, fontFamily: FONT, fontWeight: '700', fontSize: '16px' }}>{title}</h3>
            <small style={{ color: '#7a8ab0', fontFamily: FONT }}>Viewing: {detailTimeframe === 'day' ? '24 Hours' : detailTimeframe.charAt(0).toUpperCase() + detailTimeframe.slice(1)}</small>
          </div>
          <button
            onClick={() => setActiveChart(isMaximized ? 'all' : id)}
            style={{ padding: '6px 14px', cursor: 'pointer', borderRadius: '4px', border: `1px solid ${NAVY}`, background: '#fff', fontWeight: '600', color: NAVY, fontFamily: FONT, fontSize: '13px' }}
          >
            {isMaximized ? '← Zurück' : '🔍'}
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
    <div style={{ fontFamily: FONT, backgroundColor: '#f4f6fb', minHeight: '100vh' }}>

      {/* ── HERO STRIP ── */}
      <div style={{ background: NAVY, padding: '28px 40px' }}>
        <h1 style={{ margin: 0, color: '#fff', fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px' }}>Performance Analytics Workspace</h1>
        <p style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.65)', fontSize: '14px' }}>Real-time charging infrastructure analytics</p>
      </div>

      <div style={{ padding: '36px 40px' }}>

        {/* ================= MASTER OVERVIEW SECTION ================= */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: NAVY, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Charging Hub Overview</h2>
            <TimeframeSelector current={overviewTimeframe} onChange={setOverviewTimeframe} />
          </div>

          {loadingOverview ? (
            <div style={{ height: '390px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #dde3f0', boxShadow: '0 2px 12px rgba(13,36,97,0.07)' }}>
              <span style={{ color: NAVY, fontWeight: '600' }}>Loading...</span>
            </div>
          ) : (
            <CombinedChart data={overviewData} timeframe={overviewTimeframe} />
          )}
        </div>

        {/* ── DIVIDER ── */}
        <div style={{ borderTop: `3px solid ${NAVY}`, marginBottom: '36px', opacity: 0.12 }} />

        {/* ================= METRIC BREAKDOWN SECTION ================= */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: NAVY, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {activeChart === 'all' ? 'Component Breakdowns' : 'Focused Analysis View'}
            </h2>
            <TimeframeSelector current={detailTimeframe} onChange={setDetailTimeframe} />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
            {renderChartContainer('price', 'Customer Prices', '#0d2461')}
            {renderChartContainer('cost', 'Production Cost', '#2e6be6')}
            {renderChartContainer('profit', 'Net Profit', '#16a34a')}
            {renderChartContainer('kw', 'Load Demand (kW)', '#1a9488')}
          </div>
        </div>

      </div>
    </div>
  );
}