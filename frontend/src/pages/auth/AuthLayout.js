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
    <div className="auth-shell">
      <div className="auth-split">
        <aside className="auth-aside">
          <div className="brand-block">
            <p className="brand-kicker">AI Governance</p>
            <p className="brand-copy">Cost Intelligence Hub</p>
          </div>
          <div className="auth-aside-body">
            <h2>Every AI call, governed in one place.</h2>
            <p>Track LLM spend, catch sensitive data before it leaves, and enforce policy across your organization's AI tools.</p>
            <ul className="auth-points">
              {ASIDE_POINTS.map((point) => (
                <li key={point.title}>
                  <span className="auth-point-icon" aria-hidden="true">{point.icon}</span>
                  <div>
                    <strong>{point.title}</strong>
                    <span>{point.copy}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="auth-aside-foot">Encrypted sessions · rate-limited sign-in</div>
        </aside>

        <main className="auth-main">
          <div className="auth-main-inner">
            <h1>{title}</h1>
            {subtitle && <p className="auth-subtitle">{subtitle}</p>}
            {children}
            {footer && <div className="auth-footer">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}

const ICON_PROPS = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

const ASIDE_POINTS = [
  {
    title: "Cost visibility",
    copy: "Spend by model, project and team in real time.",
    icon: (
      <svg {...ICON_PROPS}>
        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    title: "Security & PII alerts",
    copy: "Sensitive data detected and blocked at the proxy.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    title: "Optimization tips",
    copy: "Actionable ways to cut cost without losing quality.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /><circle cx="12" cy="12" r="4" />
      </svg>
    ),
  },
];

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
      <div className="auth-strength-head">
        <div className="auth-strength-bar" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i < score ? `on s${score}` : ""} />
          ))}
        </div>
        <p className="auth-strength-label">
          Strength: <strong>{STRENGTH_LABELS[score]}</strong>
        </p>
      </div>
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
