import React from "react";

export default function ProfileManager() {
  // Static mock telemetry structured for the hackathon showcase
  const mockUser = {
    name: "Alex Fischer",
    tier: "Premium Eco-Member",
    memberSince: "Aug 2025",
    vehicle: "VW ID.4 Pro",
    batteryCapacity: "77 kWh",
    stats: {
      totalCharged: "1,240 kWh",
      co2Saved: "420 kg",
      avgCostPerKwh: "€0.245"
    },
    payment: {
      provider: "Visa",
      last4: "8842",
      expiry: "11/28"
    }
  };

  return (
    <div className="profile-container">
      {/* USER HERO AVATAR BADGE */}
      <div className="profile-hero-card">
        <div className="profile-avatar">⚡</div>
        <div className="profile-meta">
          <h3>{mockUser.name}</h3>
          <span className="profile-tier-tag">{mockUser.tier}</span>
        </div>
      </div>

      {/* DRIVER INFRASTRUCTURE SUMMARY BLOCK */}
      <div className="metric-summary-card">
        <h4>Telemetry Overview</h4>
        <div className="profile-stats-grid">
          <div className="stat-node">
            <span className="stat-val">{mockUser.stats.totalCharged}</span>
            <span className="stat-lbl">Energy Drawn</span>
          </div>
          <div className="stat-node">
            <span className="stat-val" style={{ color: "#4ade80" }}>{mockUser.stats.co2Saved}</span>
            <span className="stat-lbl">CO₂ Prevented</span>
          </div>
        </div>
      </div>

      {/* HARDWARE REGISTRATION SPECIFICATIONS */}
      <div className="profile-details-list">
        <div className="detail-row">
          <span className="lbl">Vehicle Profile</span>
          <span className="val">{mockUser.vehicle} ({mockUser.batteryCapacity})</span>
        </div>
        <div className="detail-row">
          <span className="lbl">Account Tenure</span>
          <span className="val">{mockUser.memberSince}</span>
        </div>
        <div className="detail-row">
          <span className="lbl">Avg. Charging Rate</span>
          <span className="val" style={{ color: "#38bdf8" }}>{mockUser.stats.avgCostPerKwh}</span>
        </div>
      </div>

      {/* SECURE CREDIT CARD RENDER BLOCK */}
      <h4 className="section-title-sub">Default Payment Method</h4>
      <div className="credit-card-wireframe" onClick={() => alert("Payment profile updates disabled during demo mode.")}>
        <div className="card-top">
          <span className="card-brand-lbl">{mockUser.payment.provider}</span>
          <span className="card-chip"></span>
        </div>
        <div className="card-middle">
          <span className="card-number-mask">••••  ••••  ••••  {mockUser.payment.last4}</span>
        </div>
        <div className="card-bottom">
          <div className="card-holder">
            <span className="card-sub-lbl">Card Holder</span>
            <span className="card-val-lbl">{mockUser.name.toUpperCase()}</span>
          </div>
          <div className="card-expiry">
            <span className="card-sub-lbl">Expires</span>
            <span className="card-val-lbl">{mockUser.payment.expiry}</span>
          </div>
        </div>
      </div>
    </div>
  );
}