import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH, authErrorMessage, normalizeEmail, safeRedirectPath } from "../../auth/authUtils";
import { AuthAlert, AuthLayout, PasswordField } from "./AuthLayout";

export default function Login() {
  const { login, status, signOutReason } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = safeRedirectPath(location.state?.from);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (status === "authenticated") return <Navigate to={redirectTo} replace />;

  const notice = location.state?.notice || signOutReason;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    const normalized = normalizeEmail(email);
    if (!normalized || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await login(normalized, password);
      setPassword("");
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setPassword("");
      const code = err?.response?.status;
      // One generic message for bad email *or* bad password — never reveal which.
      if (code === 401 || code === 400 || code === 422) setError("Invalid email or password.");
      else if (code === 404 || code === 405) setError("Sign-in isn't available on this server yet.");
      else setError(authErrorMessage(err, "Sign-in failed. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back. Sign in to your governance dashboard."
      footer={
        <>
          Don't have an account? <Link to="/register">Create one</Link>
        </>
      }
    >
      <AuthAlert kind="info">{!error && notice}</AuthAlert>
      <AuthAlert>{error}</AuthAlert>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={EMAIL_MAX_LENGTH}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
        </div>
        <PasswordField
          label="Password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          maxLength={PASSWORD_MAX_LENGTH}
        />
        <div className="auth-row-end">
          <Link to="/forgot-password" state={{ email: normalizeEmail(email) }}>
            Forgot password?
          </Link>
        </div>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthLayout>
  );
}
