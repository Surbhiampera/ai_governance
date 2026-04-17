import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Organizations from './pages/Organizations';
import Tools from './pages/Tools';
import Alerts from './pages/Alerts';
import Security from './pages/Security';
import TestEvent from './pages/TestEvent';

function App() {
  return (
    <Router>
      <div className="app-container">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2>AI Governance</h2>
            <span>Monitoring Dashboard</span>
          </div>
          <ul className="sidebar-nav">
            <li>
              <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon">📊</span> Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink to="/organizations" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon">🏢</span> Organizations
              </NavLink>
            </li>
            <li>
              <NavLink to="/tools" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon">🔧</span> Tools
              </NavLink>
            </li>
            <li>
              <NavLink to="/alerts" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon">🔔</span> Alerts
              </NavLink>
            </li>
            <li>
              <NavLink to="/security" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon">🛡️</span> Security
              </NavLink>
            </li>
            <li>
              <NavLink to="/test" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon">🧪</span> Test Event
              </NavLink>
            </li>
          </ul>
        </aside>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/organizations" element={<Organizations />} />
            <Route path="/tools" element={<Tools />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/security" element={<Security />} />
            <Route path="/test" element={<TestEvent />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
