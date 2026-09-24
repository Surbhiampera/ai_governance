import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { authForgotPassword } from "../../api";
import { EMAIL_MAX_LENGTH, authErrorMessage, isValidEmail, normalizeEmail } from "../../auth/authUtils";
import { AuthAlert, AuthLayout } from "./AuthLayout";

// Minimum time between resend clicks on this screen.
const RESEND_COOLDOWN_S = 60;

export default function ForgotPassword() {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting || cooldown > 0) return;
    setError("");
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      await authForgotPassword(normalizeEmail(email));
      setSent(true);
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      const code = err?.response?.status;
      if (code === 429 || !err?.response || code >= 500) {
        setError(authErrorMessage(err));
      } else if (code === 404 || code === 405) {
        setError("Password reset isn't available on this server yet.");
      } else {
        // Any other client error: show the same neutral confirmation so the
        // response never reveals whether an account exists.
        setSent(true);
        setCooldown(RESEND_COOLDOWN_S);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset password"
      subtitle={
        sent
          ? "Check your inbox for the next step."
          : "Enter your account email and we'll send you a link to reset your password."
      }
      footer={
        <>
          Remembered it? <Link to="/login">Back to sign in</Link>
        </>
      }
    >
      <AuthAlert>{error}</AuthAlert>
      {sent && (
        <AuthAlert kind="success">
          If an account exists for <strong>{normalizeEmail(email)}</strong>, you'll receive a reset link shortly.
          The link expires soon and can only be used once. Check your spam folder if it doesn't arrive.
        </AuthAlert>
      )}
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="forgot-email">Email</label>
          <input
            id="forgot-email"
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
        <button type="submit" className="btn btn-primary" disabled={submitting || cooldown > 0}>
          {submitting
            ? "Sending…"
            : cooldown > 0
              ? `Resend in ${cooldown}s`
              : sent
                ? "Resend reset link"
                : "Send reset link"}
        </button>
      </form>
    </AuthLayout>
  );
}
