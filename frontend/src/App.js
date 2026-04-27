import React from "react";
import {
  BrowserRouter as Router,
  NavLink,
  Route,
  Routes,
} from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Cost from "./pages/Cost";
import Tools from "./pages/Tools";
import AlertsSecurity from "./pages/AlertsSecurity";
import TestEvent from "./pages/TestEvent";
import Organizations from "./pages/Organizations";
import SuperAdminLogs from "./pages/SuperAdminLogs";

const navItems = [
  { to: "/", label: "Overview", end: true },
  { to: "/cost", label: "Cost" },
  { to: "/controls", label: "Controls" },
  { to: "/alerts-security", label: "Alerts & Security" },
  { to: "/tracing", label: "Tracing" },
  { to: "/admin-logs", label: "Super Admin Logs" },
  { to: "/organizations", label: "Organizations" },
];

function App() {
  return (
    <Router>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand-block">
            <p className="brand-kicker">AI Governance</p>
            {/* <h1>PulseBoard</h1> */}
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
        </aside>

        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/cost" element={<Cost />} />
            <Route path="/controls" element={<Tools />} />
            <Route path="/alerts-security" element={<AlertsSecurity />} />
            <Route path="/tracing" element={<TestEvent />} />
            <Route path="/admin-logs" element={<SuperAdminLogs />} />
            <Route path="/organizations" element={<Organizations />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
