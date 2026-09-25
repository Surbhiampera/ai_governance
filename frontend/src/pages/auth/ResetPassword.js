import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authResetPassword } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { PASSWORD_MAX_LENGTH, authErrorMessage, checkPassword } from "../../auth/authUtils";
import { AuthAlert, AuthLayout, PasswordChecklist, PasswordField } from "./AuthLayout";

// Reset links look like /reset-password?token=… (or #token=…). Read once on
// first render — the effect below then strips it from the address bar.
function readTokenFromUrl() {
  const fromQuery = new URLSearchParams(window.location.search).get("token");
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
  const token = (fromQuery || fromHash || "").trim();
  // Tokens are opaque URL-safe strings; reject anything else outright.
  return /^[A-Za-z0-9._~+/=-]{16,2048}$/.test(token) ? token : "";
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const { status, logout } = useAuth();
  const [token] = useState(readTokenFromUrl);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pwCheck = useMemo(() => checkPassword(password), [password]);

  // Keep the one-time token out of browser history, the address bar and any
  // Referer header sent while this page is open.
  useEffect(() => {
    if (window.location.search || window.location.hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const fieldErrors = {
    password: !pwCheck.valid ? "Password doesn't meet all requirements." : "",
    confirm: confirm !== password || !confirm ? "Passwords don't match." : "",
  };
  const show = (k) => (touched ? fieldErrors[k] : "");

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setTouched(true);
    setError("");
    if (Object.values(fieldErrors).some(Boolean)) return;

    setSubmitting(true);
    try {
      await authResetPassword(token, password);
      setPassword("");
      setConfirm("");
      // A reset invalidates every existing session — end this one too.
      if (status === "authenticated") await logout();
      navigate("/login", {
        replace: true,
        state: { notice: "Your password has been reset. Sign in with your new password." },
      });
    } catch (err) {
      const code = err?.response?.status;
      if (code === 400 || code === 401 || code === 403 || code === 410) {
        setError("This reset link is invalid, expired or already used. Request a new one.");
      } else if (code === 404 || code === 405) {
        setError("Password reset isn't available on this server yet.");
      } else {
        setError(authErrorMessage(err, "Couldn't reset your password. Please try again."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout
        title="Link invalid"
        subtitle="This password reset link is missing or malformed."
        footer={<Link to="/login">Back to sign in</Link>}
      >
        <Link to="/forgot-password" className="btn btn-primary auth-link-btn">
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Your new password will sign you out everywhere else."
      footer={<Link to="/login">Back to sign in</Link>}
    >
      <AuthAlert>{error}</AuthAlert>
      {error.startsWith("This reset link") && (
        <Link to="/forgot-password" className="btn btn-secondary auth-link-btn">
          Request a new link
        </Link>
      )}
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {/* Hidden username field lets password managers attach the new password to the right account. */}
        <input type="text" name="username" autoComplete="username" hidden readOnly value="" />
        <div className="form-grid">
          <PasswordField
            label="New password"
            name="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            error={show("password")}
            describedBy="reset-pw-rules"
            autoFocus
          />
          <PasswordField
            label="Confirm new password"
            name="confirm-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            error={show("confirm")}
          />
        </div>
        {password && <PasswordChecklist result={pwCheck} id="reset-pw-rules" />}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Saving…" : "Reset password"}
        </button>
      </form>
    </AuthLayout>
  );
}
