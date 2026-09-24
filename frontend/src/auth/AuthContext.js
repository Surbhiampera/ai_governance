import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { authLogin, authLogout, authMe, authRegister } from "../api";

// Login gate is opt-in until the backend /auth endpoints are live, so the
// dashboard keeps working exactly as before. Set VITE_AUTH_ENABLED=true to enforce.
export const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED === "true";

const IDLE_MINUTES = Number(import.meta.env.VITE_AUTH_IDLE_MINUTES) || 30;
const REVALIDATE_MS = 5 * 60 * 1000;
const CHANNEL_NAME = "aigov-auth";
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];

const AuthContext = createContext(null);

// A user object only counts as signed-in if it identifies someone — guards
// against a stub /auth/me that returns 200 with empty fields.
function asUser(data) {
  const user = data?.user ?? data;
  return user && (user.email || user.id) ? user : null;
}

function openChannel() {
  try {
    return typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(AUTH_ENABLED ? "loading" : "disabled");
  // Why the last session ended — shown on the login screen.
  const [signOutReason, setSignOutReason] = useState("");
  const channelRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const statusRef = useRef(status);
  statusRef.current = status;

  const clearSession = useCallback((reason = "") => {
    setUser(null);
    setStatus("anonymous");
    setSignOutReason(reason);
  }, []);

  const refresh = useCallback(async () => {
    if (!AUTH_ENABLED) return null;
    try {
      const res = await authMe();
      const u = asUser(res.data);
      if (u) {
        setUser(u);
        setStatus("authenticated");
        return u;
      }
      clearSession();
    } catch (err) {
      // Only a definitive auth failure ends the session; a network blip or 5xx
      // keeps the current state instead of kicking the user out.
      const code = err?.response?.status;
      if (code === 401 || code === 403 || code === 404) {
        clearSession(code === 401 && statusRef.current === "authenticated" ? "Your session has expired. Please sign in again." : "");
      } else if (statusRef.current === "loading") {
        setStatus("anonymous");
      }
    }
    return null;
  }, [clearSession]);

  // Initial session check.
  useEffect(() => {
    if (AUTH_ENABLED) refresh();
  }, [refresh]);

  // Cross-tab sync: signing in/out in one tab updates every other tab.
  useEffect(() => {
    if (!AUTH_ENABLED) return undefined;
    const channel = openChannel();
    channelRef.current = channel;
    if (!channel) return undefined;
    channel.onmessage = (e) => {
      if (e.data?.type === "logout") clearSession(e.data.reason || "You were signed out in another tab.");
      if (e.data?.type === "login") refresh();
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [clearSession, refresh]);

  const broadcast = (msg) => {
    try {
      channelRef.current?.postMessage(msg);
    } catch {
      /* channel closed */
    }
  };

  const login = useCallback(async (email, password) => {
    const res = await authLogin(email, password);
    const u = asUser(res.data) || (await refresh());
    if (!u) throw new Error("Sign-in succeeded but no session was created.");
    setUser(u);
    setStatus("authenticated");
    setSignOutReason("");
    lastActivityRef.current = Date.now();
    broadcast({ type: "login" });
    return u;
  }, [refresh]);

  const register = useCallback(async (name, email, password) => {
    const res = await authRegister(name, email, password);
    const u = asUser(res.data) || (await refresh());
    if (u) {
      setUser(u);
      setStatus("authenticated");
      setSignOutReason("");
      lastActivityRef.current = Date.now();
      broadcast({ type: "login" });
    }
    return u;
  }, [refresh]);

  const logout = useCallback(async (reason = "") => {
    try {
      await authLogout(); // server clears the httpOnly cookie
    } catch {
      /* still clear locally */
    }
    clearSession(reason);
    broadcast({ type: "logout", reason: reason || "You were signed out in another tab." });
  }, [clearSession]);

  // Re-validate periodically and when the tab regains focus, so a revoked or
  // expired session (e.g. after a password reset elsewhere) is noticed quickly.
  useEffect(() => {
    if (!AUTH_ENABLED || status !== "authenticated") return undefined;
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = setInterval(refresh, REVALIDATE_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, refresh]);

  // Idle timeout — sign out after IDLE_MINUTES without user activity.
  useEffect(() => {
    if (!AUTH_ENABLED || status !== "authenticated") return undefined;
    lastActivityRef.current = Date.now();
    const mark = () => {
      lastActivityRef.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, mark, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - lastActivityRef.current > IDLE_MINUTES * 60 * 1000) {
        logout(`You were signed out after ${IDLE_MINUTES} minutes of inactivity.`);
      }
    }, 30 * 1000);
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, mark));
      clearInterval(timer);
    };
  }, [status, logout]);

  const value = useMemo(
    () => ({ user, status, signOutReason, enabled: AUTH_ENABLED, login, register, logout, refresh }),
    [user, status, signOutReason, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
