import React from "react";
import {
  BrowserRouter as Router,
  NavLink,
  Route,
  Routes,
} from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Tools from "./pages/Tools";
import Alerts from "./pages/Alerts";
import Security from "./pages/Security";
import TestEvent from "./pages/TestEvent";

const navItems = [
  { to: "/", label: "Overview", end: true },
  { to: "/controls", label: "Controls" },
  { to: "/alerts", label: "Alerts" },
  { to: "/security", label: "Security" },
  { to: "/tracing", label: "Tracing" },
];

function App() {
  return (
    <Router>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand-block">
            <p className="brand-kicker">Centralized AI Governance</p>
            <h1>PulseBoard</h1>
            <p className="brand-copy">Multi-tool monitoring </p>
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
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-footer">
            <span>Palette</span>
            {/* <strong>#9E2A97 / #7C70AE</strong> */}
          </div>
        </aside>

        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/controls" element={<Tools />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/security" element={<Security />} />
            <Route path="/tracing" element={<TestEvent />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
