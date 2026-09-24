import React, { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  authErrorMessage,
  checkPassword,
  isValidEmail,
  normalizeEmail,
} from "../../auth/authUtils";
import { AuthAlert, AuthLayout, PasswordChecklist, PasswordField } from "./AuthLayout";

export default function Register() {
  const { register, status } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pwCheck = useMemo(() => checkPassword(password, { email, name }), [password, email, name]);

  if (status === "authenticated") return <Navigate to="/" replace />;

  const fieldErrors = {
    name: !name.trim() ? "Enter your name." : "",
    email: !isValidEmail(email) ? "Enter a valid email address." : "",
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
      const user = await register(name.trim(), normalizeEmail(email), password);
      setPassword("");
      setConfirm("");
      if (user) {
        navigate("/", { replace: true });
      } else {
        // Backend created the account but didn't start a session (e.g. email
        // verification required) — send them to sign in.
        navigate("/login", { replace: true, state: { notice: "Account created. Please sign in." } });
      }
    } catch (err) {
      const code = err?.response?.status;
      if (code === 409) {
        // Don't confirm the address is registered beyond what's needed to proceed.
        setError("We couldn't create an account with those details. If you already have one, sign in or reset your password.");
      } else if (code === 404 || code === 405) {
        setError("Registration isn't available on this server yet.");
      } else if (code === 403) {
        setError("Self-registration is disabled. Ask an administrator for access.");
      } else {
        setError(authErrorMessage(err, "Registration failed. Please try again."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create account"
      subtitle="Get access to your organization's AI governance dashboard."
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <AuthAlert>{error}</AuthAlert>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="reg-name">Full name</label>
          <input
            id="reg-name"
            name="name"
            type="text"
            autoComplete="name"
            maxLength={NAME_MAX_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={show("name") ? "true" : undefined}
            autoFocus
            required
          />
          {show("name") && <span className="field-error">{show("name")}</span>}
        </div>
        <div className="field">
          <label htmlFor="reg-email">Work email</label>
          <input
            id="reg-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={EMAIL_MAX_LENGTH}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={show("email") ? "true" : undefined}
            required
          />
          {show("email") && <span className="field-error">{show("email")}</span>}
        </div>
        <PasswordField
          label="Password"
          name="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          error={show("password")}
          describedBy="reg-pw-rules"
        />
        {password && <PasswordChecklist result={pwCheck} id="reg-pw-rules" />}
        <PasswordField
          label="Confirm password"
          name="confirm-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          error={show("confirm")}
        />
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}
