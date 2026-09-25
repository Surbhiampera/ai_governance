import React, { useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import Login from "./pages/auth/Login";
import Dashboard from "./pages/Dashboard";
import Cost from "./pages/Cost";
import AlertsSecurity from "./pages/AlertsSecurity";
import ProxySetup from "./pages/ProxySetup";
import OptimizationTips from "./pages/OptimizationTips";
import Users from "./pages/Users";
// import ChatBot from "./components/ChatBot";

const navItems = [
  { to: "/", label: "Overview", end: true },
  { to: "/alerts-security", label: "Alerts & Security" },
  { to: "/cost", label: "Cost" },
  { to: "/optimization-tips", label: "Optimization Tips" },
  { to: "/proxy-setup", label: "Proxy Setup" },
];

// Shown only to admins (see DashboardShell).
const adminNavItems = [{ to: "/users", label: "Users" }];

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
  "/users": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  "/optimization-tips": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="4"/>
    </svg>
  ),
};

function ScrollReset({ contentRef }) {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!contentRef.current) return;
    const body = contentRef.current.querySelector(".page-body");
    (body || contentRef.current).scrollTo(0, 0);
  }, [pathname, contentRef]);
  return null;
}

// Gates the dashboard behind a session when auth is enabled; a no-op otherwise.
function RequireAuth({ children }) {
  const { enabled, status } = useAuth();
  const location = useLocation();
  if (!enabled) return children;
  if (status === "loading") {
    return (
      <div className="auth-shell">
        <div className="auth-loading" role="status">Checking your session…</div>
      </div>
    );
  }
  if (status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}

// Admin-only screens. A UI guard only — the backend enforces admin on /admin/*.
function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/" replace />;
}

function SidebarUser() {
  const { enabled, user, logout } = useAuth();
  if (!enabled || !user) return null;
  return (
    <div className="sidebar-user">
      <div className="sidebar-user-name" title={user.name || user.email}>{user.name || user.email}</div>
      {user.name && <div className="sidebar-user-email" title={user.email}>{user.email}</div>}
      <button type="button" className="sidebar-signout" onClick={() => logout()}>
        Sign out
      </button>
    </div>
  );
}

function SidebarNav({ items }) {
  return (
    <nav className="nav-stack">
      {items.map((item) => (
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
  );
}

function DashboardShell() {
  const contentRef = useRef(null);
  const { isAdmin } = useAuth();
  const visibleNav = isAdmin ? [...navItems, ...adminNavItems] : navItems;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="brand-kicker">AI Governance</p>
          <p className="brand-copy">Cost Intelligence Hub</p>
        </div>

        <SidebarNav items={visibleNav} />

        <div className="sidebar-footer">
          <SidebarUser />
        </div>
      </aside>

      <main className="content" ref={contentRef}>
        <ScrollReset contentRef={contentRef} />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/alerts-security" element={<AlertsSecurity />} />
          <Route path="/cost" element={<Cost />} />
          <Route path="/optimization-tips" element={<OptimizationTips />} />
          <Route path="/proxy-setup" element={<ProxySetup />} />
          <Route
            path="/users"
            element={
              <RequireAdmin>
                <Users />
              </RequireAdmin>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* No public sign-up — accounts are created by admins on the Users page. */}
          <Route path="/register" element={<Navigate to="/login" replace />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <DashboardShell />
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>

      {/* <ChatBot /> */}
    </Router>
  );
}

export default App;
