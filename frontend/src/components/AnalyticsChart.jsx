// src/AnalyticsChart.jsx
import React from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  BarChart,
  LineChart,
  Area, 
  Bar,
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';

export default function AnalyticsChart({ data, metricId, color, timeframe }) {
  
  // Customizing labels based on what we are looking at
  const formatYAxis = (value) => {
    if (metricId === 'kw') return `${value} kW`;
    return `$${value}`;
  };

  // 1. YEAR ZOOM: Use a Bar Chart (Good for monthly high-level overviews)
  if (timeframe === 'year') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="time" stroke="#888" tickLine={false} />
          <YAxis tickFormatter={formatYAxis} stroke="#888" tickLine={false} />
          <Tooltip formatter={(value) => [formatYAxis(value), metricId.toUpperCase()]} />
          <Bar dataKey={metricId} fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // 2. DAY ZOOM: Use an Area Chart (Looks beautiful for 24h continuous data)
  if (timeframe === 'day') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id={`gradient-${metricId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="time" stroke="#888" tickLine={false} />
          <YAxis tickFormatter={formatYAxis} stroke="#888" tickLine={false} />
          <Tooltip formatter={(value) => [formatYAxis(value), metricId.toUpperCase()]} />
          <Area type="monotone" dataKey={metricId} stroke={color} strokeWidth={2} fillOpacity={1} fill={`url(#gradient-${metricId})`} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // 3. MONTH ZOOM: Use a clean Line Chart
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="time" stroke="#888" tickLine={false} />
        <YAxis tickFormatter={formatYAxis} stroke="#888" tickLine={false} />
        <Tooltip formatter={(value) => [formatYAxis(value), metricId.toUpperCase()]} />
        <Line type="monotone" dataKey={metricId} stroke={color} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}