import React, { useEffect, useState } from "react";
import { getToolsUsage } from "../api";

const SDK_FIELDS = [
  ["model_name", "Which LLM model was invoked (e.g. gpt-4o, claude-3-5-sonnet)"],
  ["tool_name", "The AI tool or framework (e.g. LangChain, Copilot, custom)"],
  ["provider", "Vendor — openai, anthropic, google, azure, custom"],
  ["input_tokens", "Prompt / context token count"],
  ["output_tokens", "Completion / generation token count"],
  ["latency_ms", "End-to-end request duration in milliseconds"],
  ["org_id", "Organization scope — required for all governance rules"],
  ["project_id", "Project scope — enables per-project cost and quota tracking"],
  ["user_id", "User attribution — optional, for per-user analytics"],
  ["trace_id", "Cross-request correlation ID for multi-step workflows"],
  ["status", "success / error / partial"],
  ["tool_usages", "Per-tool cost overrides for multi-tool calls"],
  ["contains_pii", "Flag PII presence — triggers security engine"],
  ["tags", "Arbitrary key labels for filtering and governance rules"],
  ["stages", "Pipeline stage breakdown for multi-step execution tracking"],
];

function Tools() {
  const [usage, setUsage] = useState([]);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("usage");

  useEffect(() => {
    getToolsUsage()
      .then((r) => setUsage(r.data || []))
      .catch(() => setMessage("Unable to load tool usage. Check backend connectivity."));
  }, []);

  return (
    <div className="page-shell">
      {/* Header */}
      <section className="panel" style={{ padding: "18px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Control Plane</h2>
            <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 14 }}>
              SDK core responsibilities, telemetry capture reference, and tool usage analytics.
              Model and tool management lives in the <strong>Tracing</strong> module.
            </p>
          </div>
          <div className="pill-row" style={{ gap: 8 }}>
            <span className="pill">
              Tools active <span className="highlight">{usage.length}</span>
            </span>
          </div>
        </div>
        {message && <div className="feedback-msg" style={{ marginTop: 10 }}>{message}</div>}
      </section>

      {/* Tab bar */}
      <section className="panel" style={{ padding: "6px 24px 0" }}>
        <div className="action-row" style={{ gap: 4 }}>
          {[
            { id: "usage", label: "Tool Usage" },
            { id: "sdk", label: "SDK Core" },
          ].map((t) => (
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
                Aggregated cost, token, and latency metrics per AI tool. Data flows in via the SDK ingest endpoints.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tool / Model</th>
                  <th>Vendor</th>
                  <th>Events</th>
                  <th>Total Cost</th>
                  <th>Total Tokens</th>
                  <th>Input Tokens</th>
                  <th>Output Tokens</th>
                  <th>Avg Latency</th>
                  <th>Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {usage.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", color: "var(--gray-500)" }}>
                      No events ingested yet. Use the SDK endpoints or the Tracing module to send data.
                    </td>
                  </tr>
                )}
                {usage.map((item) => (
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
          {/* Responsibilities */}
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>SDK Core Responsibilities</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  The SDK has one job: capture telemetry from every AI request and transmit it here.
                  The backend handles cost calculation, aggregation, and alert triggering — the SDK does not.
                </p>
              </div>
            </div>

            <div className="two-column" style={{ gap: 20 }}>
              <div className="panel" style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)" }}>
                <h4 style={{ marginTop: 0, marginBottom: 12 }}>Capture Per Request</h4>
                <div className="table-wrap" style={{ margin: 0 }}>
                  <table>
                    <thead>
                      <tr><th>Field</th><th>Description</th></tr>
                    </thead>
                    <tbody>
                      {SDK_FIELDS.map(([field, desc]) => (
                        <tr key={field}>
                          <td><code style={{ fontSize: 12 }}>{field}</code></td>
                          <td style={{ fontSize: 13, color: "var(--gray-600)" }}>{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="panel" style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)" }}>
                  <h4 style={{ marginTop: 0 }}>Multi-Model &amp; Multi-Tool per Project</h4>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "var(--gray-600)", lineHeight: 1.8 }}>
                    <li>A single project can use <strong>any number of models</strong> from different providers simultaneously.</li>
                    <li>A single project can call <strong>multiple tools</strong> (web search, code executor, embeddings) in one workflow.</li>
                    <li>Models and tools are registered <strong>dynamically</strong> — no static config required.</li>
                    <li>Cost is resolved automatically from <code>model_pricing</code> and <code>tool_registry</code> DB tables.</li>
                    <li>Per-model and per-tool cost breakdown is stored in <code>trace_model_usage</code> / <code>trace_tool_usage</code> for drill-down queries.</li>
                  </ul>
                </div>

                <div className="panel" style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)" }}>
                  <h4 style={{ marginTop: 0 }}>Standardization Before Transmission</h4>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "var(--gray-600)", lineHeight: 1.8 }}>
                    <li>Normalize vendor-specific token field names to <code>input_tokens</code> / <code>output_tokens</code>.</li>
                    <li>Resolve cost: caller override → per-token rates → DB lookup → zero.</li>
                    <li>Attach <code>org_id</code>, <code>project_id</code>, <code>trace_id</code> to every event.</li>
                    <li>Tag PII flags and data-out sizes before sending — the security engine acts on them.</li>
                  </ul>
                </div>

                <div className="panel" style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)" }}>
                  <h4 style={{ marginTop: 0 }}>Dynamic Registration APIs</h4>
                  <p style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 0 }}>
                    Register models and tools at runtime — no restart required. Use the <strong>Tracing → Model &amp; Tool Config</strong> tab for UI-based registration.
                  </p>
                  <div style={{ fontSize: 12, fontFamily: "monospace", lineHeight: 2 }}>
                    <div><code>POST /pricing/</code> — register a model with per-token pricing</div>
                    <div><code>POST /tools/register</code> — register a tool with cost model</div>
                    <div><code>GET  /models/</code> — list all registered models</div>
                    <div><code>GET  /tools/</code> — list all registered tools</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Ingest API reference */}
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>Telemetry Ingest API</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  Vendor-agnostic endpoints — mix OpenAI, Anthropic, Google, and custom models in one governance layer.
                </p>
              </div>
            </div>

            <div className="two-column" style={{ gap: 20 }}>
              <div className="panel" style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)" }}>
                <h4 style={{ marginTop: 0 }}>Single Event — <code>POST /control/ingest</code></h4>
                <pre style={{ fontSize: 12, overflow: "auto", margin: 0 }}>{`{
  "org_id":        "org-acme",
  "project_id":    "proj-chatbot",
  "provider":      "openai",
  "model_name":    "gpt-4o",
  "input_tokens":  1200,
  "output_tokens": 380,
  "latency_ms":    740,
  "status":        "success",
  "tool_usages": [
    { "name": "web-search", "cost": 0.002 }
  ]
}`}</pre>
                <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 0 }}>
                  Cost resolved from <code>model_pricing</code> automatically.
                  Pass <code>cost_per_call</code> or <code>input_cost_per_1k</code> to override.
                </p>
              </div>

              <div className="panel" style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)" }}>
                <h4 style={{ marginTop: 0 }}>Unified Multi-Model Trace — <code>POST /control/ingest/trace</code></h4>
                <pre style={{ fontSize: 12, overflow: "auto", margin: 0 }}>{`{
  "org_id":        "org-acme",
  "project_id":    "proj-rag",
  "workflow_name": "rag-pipeline",
  "models": [
    { "model_name": "text-embedding-3-small",
      "provider": "openai",
      "input_tokens": 3200, "output_tokens": 0 },
    { "model_name": "gpt-4o",
      "provider": "openai",
      "input_tokens": 1800, "output_tokens": 420 }
  ],
  "tools": [
    { "tool_name": "vector-search",
      "invocation_count": 5, "cost": 0.001 }
  ]
}`}</pre>
                <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 0 }}>
                  One parent event + per-model and per-tool breakdown stored automatically.
                </p>
              </div>
            </div>

            <div className="two-column" style={{ gap: 20, marginTop: 0 }}>
              <div className="panel" style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)" }}>
                <h4 style={{ marginTop: 0 }}>Batch — <code>POST /control/ingest/batch</code></h4>
                <pre style={{ fontSize: 12, overflow: "auto", margin: 0 }}>{`{
  "events": [
    {
      "org_id": "org-acme",
      "provider": "anthropic",
      "model_name": "claude-3-5-sonnet",
      "input_tokens": 800,
      "output_tokens": 220
    },
    {
      "org_id": "org-acme",
      "provider": "openai",
      "model_name": "gpt-4o-mini",
      "input_tokens": 400,
      "output_tokens": 180,
      "cost_per_call": 0.0012
    }
  ]
}`}</pre>
                <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 0 }}>
                  Mix vendors in one batch. Each event is independently priced and scored.
                </p>
              </div>

              <div className="panel" style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)" }}>
                <h4 style={{ marginTop: 0 }}>Token Quota — <code>GET /control/quota/{"{org_id}"}</code></h4>
                <pre style={{ fontSize: 12, overflow: "auto", margin: 0 }}>{`GET /control/quota/org-acme?project_id=proj-chatbot

Response:
{
  "month_cost":       142.80,
  "month_tokens":     2400000,
  "budget_limit":     500.00,
  "usage_percent":    28.6,
  "forecast_month_cost": 485.50,
  "will_exceed_budget":  false,
  "token_quota_daily":   1000000,
  "token_quota_used_today": 612000,
  "token_quota_percent": 61.2
}`}</pre>
                <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 0 }}>
                  Velocity-based forecast. All limits from <code>budgets</code> + <code>rate_limits</code> tables.
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default Tools;
