import React from "react";
import {
  BrowserRouter as Router,
  NavLink,
  Route,
  Routes,
} from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Emails from "./pages/Emails";
import Cost from "./pages/Cost";
import Tools from "./pages/Tools";
import AlertsSecurity from "./pages/AlertsSecurity";
import TestEvent from "./pages/TestEvent";
import SuperAdminLogs from "./pages/SuperAdminLogs";
import TraceOps from "./pages/TraceOps";

const navItems = [
  { to: "/", label: "Overview", end: true },
  { to: "/emails", label: "Emails" },
  { to: "/cost", label: "Cost" },
  { to: "/controls", label: "Controls" },
  { to: "/alerts-security", label: "Alerts & Security" },
  { to: "/tracing", label: "Tracing" },
  { to: "/trace-ops", label: "Trace Ops" },
  { to: "/admin-logs", label: "Super Admin Logs" },
];

function App() {
  return (
    <Router>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand-block">
            <p className="brand-kicker">AI Governance</p>
            <p className="brand-copy">Email Support Agent</p>
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
        </aside>

        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/emails" element={<Emails />} />
            <Route path="/cost" element={<Cost />} />
            <Route path="/controls" element={<Tools />} />
            <Route path="/alerts-security" element={<AlertsSecurity />} />
            <Route path="/tracing" element={<TestEvent />} />
            <Route path="/trace-ops" element={<TraceOps />} />
            <Route path="/admin-logs" element={<SuperAdminLogs />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
