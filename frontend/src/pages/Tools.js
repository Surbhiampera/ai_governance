import React, { useEffect, useState } from "react";
import { getToolsUsage, getTelemetryLogs } from "../api";

// Email Support Agent processing pipeline
const PIPELINE_STEPS = [
  { label: "MS Graph · Fetch",    detail: "GET unread emails via Microsoft Graph API",         service: "email-fetch",          vendor: "Microsoft" },
  { label: "PII Sanitization",    detail: "Mask Order IDs, Tracking IDs, Phone Numbers",       service: "email-sanitization",   vendor: "Custom" },
  { label: "Intent Classification", detail: "GPT-5 Nano → ORDER_ISSUE / PROSPECT_QUERY / …", service: "email-classification", vendor: "OpenAI" },
  { label: "Response Drafting",   detail: "Azure OpenAI / Gemini via LangChain",               service: "email-draft",          vendor: "Azure / Google" },
  { label: "Auto-Reply Dispatch", detail: "Send draft for qualified prospect emails",          service: "email-autoreply",      vendor: "Microsoft Graph" },
  { label: "Persist & Finalize",  detail: "SQLAlchemy commit → mark email as read in Outlook", service: "email-pipeline",       vendor: "SQLAlchemy" },
];

function Tools() {
  const [usage,     setUsage]     = useState([]);
  const [events,    setEvents]    = useState([]);
  const [loadingEv, setLoadingEv] = useState(false);
  const [message,   setMessage]   = useState("");
  const [activeTab, setActiveTab] = useState("usage");

  useEffect(() => {
    getToolsUsage()
      .then(r => setUsage(r.data || []))
      .catch(() => setMessage("Unable to load tool usage. Check backend connectivity."));
  }, []);

  useEffect(() => {
    if (activeTab !== "sdk") return;
    setLoadingEv(true);
    getTelemetryLogs({ limit: 20 })
      .then(r => setEvents(r.data?.events || r.data || []))
      .catch(() => setEvents([]))
      .finally(() => setLoadingEv(false));
  }, [activeTab]);

  const projects  = [...new Set(events.map(e => e.project_id).filter(Boolean))];
  const models    = [...new Set(events.map(e => e.model_name).filter(Boolean))];
  const toolNames = [...new Set(events.map(e => e.tool_name).filter(Boolean))];

  return (
    <div className="page-shell">

      {/* Header */}
      <section className="panel" style={{ padding: "18px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Control Plane</h2>
            <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 14 }}>
              AI Email Support Agent — pipeline overview, telemetry ingest APIs, and live tool usage.
            </p>
          </div>
          <div className="pill-row" style={{ gap: 8 }}>
            <span className="pill">Tools active <span className="highlight">{usage.length}</span></span>
          </div>
        </div>
        {message && <div className="feedback-msg" style={{ marginTop: 10 }}>{message}</div>}
      </section>

      {/* Tab bar */}
      <section className="panel" style={{ padding: "6px 24px 0" }}>
        <div className="action-row" style={{ gap: 4 }}>
          {[{ id: "usage", label: "Tool Usage" }, { id: "sdk", label: "SDK Core" }].map(t => (
            <button
              key={t.id}
              type="button"
              className={`btn ${activeTab === t.id ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Tool Usage ── */}
      {activeTab === "usage" && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>Tool Usage Summary</h3>
              <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                Aggregated cost, token, and latency metrics per AI tool.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tool / Model</th><th>Vendor</th><th>Events</th><th>Total Cost</th>
                  <th>Total Tokens</th><th>Input Tokens</th><th>Output Tokens</th>
                  <th>Avg Latency</th><th>Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {usage.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", color: "var(--gray-500)" }}>
                      No events yet. Install the SDK or use the Tracing module to send data.
                    </td>
                  </tr>
                )}
                {usage.map(item => (
                  <tr key={item.tool_name}>
                    <td><strong>{item.tool_name || "—"}</strong></td>
                    <td>{item.vendor || "—"}</td>
                    <td>{item.total_events}</td>
                    <td>${Number(item.total_cost || 0).toFixed(4)}</td>
                    <td>{Number(item.total_tokens || 0).toLocaleString()}</td>
                    <td>{Number(item.total_prompt_tokens || 0).toLocaleString()}</td>
                    <td>{Number(item.total_completion_tokens || 0).toLocaleString()}</td>
                    <td>{Number(item.avg_latency_ms || 0).toFixed(1)} ms</td>
                    <td>
                      <span className={`status-pill ${Number(item.success_rate || 0) >= 90 ? "success" : "warning"}`}>
                        {Number(item.success_rate || 0).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── SDK Core ── */}
      {activeTab === "sdk" && (
        <>
          {/* Pipeline */}
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>Email Agent Pipeline</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  Every inbound email flows through this 6-stage pipeline — fetch, sanitize, classify, draft, reply, finalize.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", overflowX: "auto", paddingBottom: 4, gap: 0 }}>
              {PIPELINE_STEPS.map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}>
                  <div style={{
                    textAlign: "center", padding: "12px 16px",
                    background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)",
                    borderRadius: 10, minWidth: 130,
                  }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: "var(--brand-primary)",
                      textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4,
                    }}>
                      Stage {i + 1}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{step.label}</div>
                    <div style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 4, lineHeight: 1.4 }}>{step.detail}</div>
                    <div style={{
                      marginTop: 6, fontSize: 10, padding: "2px 8px",
                      background: "rgba(124,112,174,0.08)", borderRadius: 20,
                      color: "var(--gray-600)", display: "inline-block",
                    }}>
                      {step.vendor}
                    </div>
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <div style={{ color: "var(--gray-400)", fontSize: 18, padding: "0 6px" }}>→</div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Live telemetry */}
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>Live Email Agent Telemetry</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  Real-time email processing events — classification, drafting, and pipeline runs.
                </p>
              </div>
              <div className="pill-row" style={{ gap: 8 }}>
                <span className="pill">Projects <span className="highlight">{projects.length}</span></span>
                <span className="pill">Models <span className="highlight">{models.length}</span></span>
                <span className="pill">Tools <span className="highlight">{toolNames.length}</span></span>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Project</th>
                    <th>Tool</th>
                    <th>Model</th>
                    <th>Provider</th>
                    <th>In Tokens</th>
                    <th>Out Tokens</th>
                    <th>Latency</th>
                    <th>PII</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingEv && (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", color: "var(--gray-500)" }}>Loading…</td>
                    </tr>
                  )}
                  {!loadingEv && events.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", color: "var(--gray-500)" }}>
                        No events yet. Install the SDK and make an LLM call to see data here.
                      </td>
                    </tr>
                  )}
                  {events.map((e, i) => (
                    <tr key={e.id || i}>
                      <td style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                        {e.created_at ? new Date(e.created_at).toLocaleTimeString() : "—"}
                      </td>
                      <td>{e.project_id || "—"}</td>
                      <td>{e.tool_name || "—"}</td>
                      <td>{e.model_name || "—"}</td>
                      <td>{e.provider || "—"}</td>
                      <td>{Number(e.input_tokens || 0).toLocaleString()}</td>
                      <td>{Number(e.output_tokens || 0).toLocaleString()}</td>
                      <td>{e.latency_ms != null ? `${e.latency_ms} ms` : "—"}</td>
                      <td>
                        {e.contains_pii
                          ? <span className="status-pill warning">Yes</span>
                          : <span className="status-pill success">No</span>}
                      </td>
                      <td>
                        <span className={`status-pill ${e.status === "success" ? "success" : "error"}`}>
                          {e.status || "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

        </>
      )}
    </div>
  );
}

export default Tools;
