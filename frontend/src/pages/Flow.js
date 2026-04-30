import React from "react";
import { Link } from "react-router-dom";

const steps = [
  {
    n: 1,
    title: "Create Organization",
    to: "/tracing",
    cta: "Open Tracing",
    desc: "Organizations and projects are created automatically when an event is injected.",
  },
  {
    n: 2,
    title: "Register Vendor Connectors",
    to: "/controls",
    cta: "Open Controls",
    desc: "Add OpenAI, Anthropic, Google, or generic feeds with an API key or webhook.",
  },
  {
    n: 3,
    title: "Logs Auto-Ingest",
    to: "/controls",
    cta: "Ingestion status",
    desc: "API pull, webhook, or file upload — runs automatically.",
  },
  {
    n: 4,
    title: "Cost · Risk · Governance",
    to: "/cost",
    cta: "Open Cost",
    desc: "Every event scored for cost, PII, and policy breaches.",
  },
  {
    n: 5,
    title: "Rule Engine",
    to: "/controls",
    cta: "Open Controls",
    desc: "Define rules in Controls, then the Alert Engine evaluates every event in real time and triggers scoped alerts based on thresholds A 30-min scheduled scan also converts anomalies into alerts (manual trigger: Run Alert Scan).",
  },
  {
    n: 6,
    title: "Unified Monitoring",
    to: "/admin-logs",
    cta: "Super Admin Logs",
    desc: "Cross-vendor logs and per-tool aggregation in one view.",
  },
];

function Flow() {
  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <h2>Flow</h2>
          <p>End-to-end governance flow. Click any step to jump to it.</p>
        </div>
      </section>

      <section className="flow-stack">
        {steps.map((s, i) => (
          <React.Fragment key={s.n}>
            <div className="panel flow-step">
              <div className="flow-step-grid">
                <div className="flow-step-number">{s.n}</div>
                <div className="flow-step-body">
                  <div className="flow-step-head">
                    <h3 style={{ margin: 0 }}>{s.title}</h3>
                  </div>
                  <p style={{ margin: "6px 0 12px", color: "var(--gray-700)" }}>
                    {s.desc}
                  </p>
                  <div className="action-row">
                    <Link to={s.to} className="btn btn-primary">
                      {s.cta} →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="flow-arrow" aria-hidden="true">
                <span>▼</span>
              </div>
            )}
          </React.Fragment>
        ))}
      </section>
    </div>
  );
}

export default Flow;
