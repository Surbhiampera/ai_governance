import React, { useEffect, useId, useState } from "react";
import { STRENGTH_LABELS } from "../../auth/authUtils";

export function AuthLayout({ title, subtitle, children, footer }) {
  // Auth pages must never be framed (clickjacking) — bail out if we are.
  useEffect(() => {
    if (window.top !== window.self) {
      try {
        window.top.location = window.self.location.href;
      } catch {
        document.body.innerHTML = "";
      }
    }
  }, []);

  return (
    <div className="login-shell">
      <div className="login-card auth-card">
        <div className="auth-brand">
          <p className="brand-kicker">AI Governance</p>
          <p className="auth-brand-copy">Cost Intelligence Hub</p>
        </div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
        {children}
        {footer && <div className="auth-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function AuthAlert({ kind = "error", children }) {
  if (!children) return null;
  return (
    <div className={`auth-alert auth-alert--${kind}`} role={kind === "error" ? "alert" : "status"} aria-live="polite">
      {children}
    </div>
  );
}

export function PasswordField({ label, value, onChange, autoComplete, name, autoFocus, error, maxLength, describedBy }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-wrap">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          maxLength={maxLength}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          required
        />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function PasswordChecklist({ result, id }) {
  const { rules, score } = result;
  return (
    <div className="auth-strength" id={id}>
      <div className="auth-strength-bar" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < score ? `on s${score}` : ""} />
        ))}
      </div>
      <p className="auth-strength-label">
        Strength: <strong>{STRENGTH_LABELS[score]}</strong>
      </p>
      <ul className="auth-rules">
        {rules.map((r) => (
          <li key={r.key} className={r.ok ? "ok" : ""}>
            <span aria-hidden="true">{r.ok ? "✓" : "•"}</span> {r.label}
            <span className="sr-only">{r.ok ? " (met)" : " (not met)"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
