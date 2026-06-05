import React from "react";
import {
  BrowserRouter as Router,
  NavLink,
  Route,
  Routes,
} from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Cost from "./pages/Cost";
import AlertsSecurity from "./pages/AlertsSecurity";
import ProxySetup from "./pages/ProxySetup";

const navItems = [
  { to: "/", label: "Overview", end: true },
  { to: "/alerts-security", label: "Alerts & Security" },
  { to: "/cost", label: "Cost" },
  { to: "/proxy-setup", label: "Proxy Setup" },
];

const NAV_ICONS = {
  "/": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  "/alerts-security": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  "/cost": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
  "/proxy-setup": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
    </svg>
  ),
};

function App() {
  return (
    <Router>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand-block">
            <p className="brand-kicker">AI Governance</p>
            <p className="brand-copy">Cost Intelligence Hub</p>
          </div>

          <nav className="nav-stack">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
              >
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {NAV_ICONS[item.to]}
                  {item.label}
                </span>
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-footer">
            <span>Platform</span>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>
              3 active modules
            </div>
          </div>
        </aside>

        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/alerts-security" element={<AlertsSecurity />} />
            <Route path="/cost" element={<Cost />} />
            <Route path="/proxy-setup" element={<ProxySetup />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
