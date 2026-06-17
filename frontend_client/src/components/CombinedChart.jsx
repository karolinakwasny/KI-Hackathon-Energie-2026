// src/CombinedChart.jsx
import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

export default function CombinedChart({ data, timeframe }) {
  return (
    <div style={{
      border: '1px solid #dde3f0',
      padding: '20px',
      borderRadius: '0',
      backgroundColor: '#ffffff',
      boxShadow: '0 2px 12px rgba(13,36,97,0.07)',
      marginBottom: '25px',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      <h3 style={{ margin: '0 0 15px 0', color: '#0d2461', fontFamily: "'Segoe UI', Arial, sans-serif", fontWeight: '700' }}>Combined View</h3>
      
      <div style={{ height: '350px', width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: -10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" stroke="#888" tickLine={false} />
            
            {/* LEFT Y-AXIS (For monetary metrics) */}
            <YAxis
              yAxisId="left"
              orientation="left"
              stroke="#0d2461"
              tickFormatter={(v) => `€${v}`}
              tickLine={false}
            />

            {/* RIGHT Y-AXIS (Specifically for energy load) */}
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#1a9488"
              tickFormatter={(v) => `${v}kW`}
              tickLine={false}
            />
            
            <Tooltip formatter={(value, name) => [
              name === 'kw' ? `${value} kW` : `$${value}`, 
              name.toUpperCase()
            ]} />
            <Legend verticalAlign="top" height={36} />

            {/* Area block for profits to create a nice visual baseline */}
            <Area yAxisId="left" type="monotone" dataKey="profit" name="profit" fill="#16a34a" stroke="#16a34a" fillOpacity={0.15} strokeWidth={1.5} />

            {/* Main structural trends */}
            <Line yAxisId="left" type="monotone" dataKey="price" name="price" stroke="#0d2461" strokeWidth={3} dot={false} />
            <Line yAxisId="left" type="monotone" dataKey="cost" name="cost" stroke="#2e6be6" strokeWidth={2} dot={false} strokeDasharray="4 4" />

            {/* Energy load pinned securely to the right axis */}
            <Line yAxisId="right" type="monotone" dataKey="kw" name="kw" stroke="#1a9488" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}