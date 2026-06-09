import React, { useCallback, useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  getProxyRequests, getProxyPiiSummary, getProxyOverview,
  getSecurityLogsCombined, getSecuritySummaryCombined,
  getAnomaliesCombined, getAdminPIIDetail, getProjects,
} from "../api";

// ── Formatters ────────────────────────────────────────────────────────────────
const num   = (v) => Number(v || 0).toLocaleString();
const money = (v) => `$${Number(v || 0).toFixed(6)}`;

const RANGE_OPTIONS = [
  { label: "7d",  value: 7  },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

const ACTION_COLOR = {
  block: "critical", mask: "high", alert: "medium", allow: "low",
};

const riskColor = (score) => {
  if (score >= 80) return "#ef4444";
  if (score >= 60) return "#f97316";
  if (score >= 30) return "#eab308";
  return "#22c55e";
};

function daysToStartDate(d) {
  if (!d) return undefined;
  const dt = new Date();
  dt.setDate(dt.getDate() - d + 1);
  return dt.toISOString().split("T")[0];
}

// ── PII Detail Modal ──────────────────────────────────────────────────────────
function DetailRow({ label, value, valueStyle }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border,#f0f0f0)" }}>
      <span style={{ fontSize: 12, color: "var(--gray-500)", minWidth: 160, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, ...valueStyle }}>{value ?? "—"}</span>
    </div>
  );
}

function UsageBar({ pct }) {
  const color = pct >= 100 ? "#ef4444" : pct >= 90 ? "#f97316" : pct >= 75 ? "#eab308" : "#22c55e";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--border,#e5e7eb)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, minWidth: 38 }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

function PIIDetailModal({ eventId, onClose }) {
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    setError("");
    getAdminPIIDetail(eventId)
      .then((res) => setDetail(res.data))
      .catch(() => setError("Failed to load PII detail."))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (!eventId) return null;

  const tokenStatusClass =
    detail?.usage_pct >= 100 ? "critical" :
    detail?.usage_pct >= 90  ? "high"     :
    detail?.usage_pct >= 75  ? "medium"   : "";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", maxWidth: 740, width: "100%", maxHeight: "88vh", overflowY: "auto", position: "relative", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--gray-500)" }}>×</button>
        <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>PII Detection — Event Detail</h3>
        <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--gray-500)" }}>{eventId}</p>

        {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "var(--gray-400)" }}>Loading…</div>}
        {error   && <div style={{ color: "#ef4444", fontSize: 13 }}>{error}</div>}

        {detail && (
          <>
            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>Context</h4>
              <DetailRow label="Organization" value={`${detail.org_name}${detail.org_id !== detail.org_name ? ` (${detail.org_id})` : ""}`} />
              <DetailRow label="Project" value={detail.project_name ? `${detail.project_name}${detail.project_id !== detail.project_name ? ` (${detail.project_id})` : ""}` : detail.project_id} />
              {detail.project_environment && <DetailRow label="Environment" value={detail.project_environment} />}
              <DetailRow label="Model / Tool"  value={detail.model_name} />
              <DetailRow label="Provider"       value={detail.provider} />
              <DetailRow label="Service Type"   value={detail.service_type} />
              <DetailRow label="Status"         value={detail.status} />
              <DetailRow label="Timestamp"      value={detail.created_at ? new Date(detail.created_at).toLocaleString() : null} />
            </section>

            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>PII Detection</h4>
              <DetailRow label="PII Detected"       value={detail.pii_detected ? "Yes" : "No"} valueStyle={{ color: detail.pii_detected ? "#ef4444" : "#22c55e" }} />
              {detail.pii_type && <DetailRow label="PII Type" value={detail.pii_type} valueStyle={{ fontFamily: "monospace", background: "#fef9c3", padding: "1px 6px", borderRadius: 4 }} />}
              <DetailRow label="Risk Score" value={
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: riskColor(detail.risk_score), flexShrink: 0 }} />
                  {detail.risk_score?.toFixed(1)} — {detail.risk_label}
                </span>
              } />
              <DetailRow label="Misuse Pattern"     value={detail.misuse_pattern_detected ? "Detected" : "None"} valueStyle={{ color: detail.misuse_pattern_detected ? "#ef4444" : undefined }} />
              <DetailRow label="Data Out Violation" value={detail.data_out_violation ? "Yes" : "No"}             valueStyle={{ color: detail.data_out_violation ? "#ef4444" : undefined }} />
              <DetailRow label="Abnormal Spike"     value={detail.abnormal_usage_spike ? "Yes" : "No"}           valueStyle={{ color: detail.abnormal_usage_spike ? "#f97316" : undefined }} />
              <DetailRow label="Masking Applied"    value={detail.masking_applied ? "Yes" : "No"}                valueStyle={{ color: detail.masking_applied ? "#22c55e" : "var(--gray-500)" }} />
            </section>

            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>Usage Metrics</h4>
              <DetailRow label="Prompt Tokens"      value={Number(detail.prompt_tokens     || 0).toLocaleString()} />
              <DetailRow label="Completion Tokens"  value={Number(detail.completion_tokens || 0).toLocaleString()} />
              <DetailRow label="Total Tokens"       value={Number(detail.total_tokens      || 0).toLocaleString()} />
              <DetailRow label="Total Cost"         value={`$${Number(detail.total_cost    || 0).toFixed(4)}`} />
              <DetailRow label="Latency"            value={`${Number(detail.latency_ms     || 0).toLocaleString()} ms`} />
              <DetailRow label="Token Limit (daily)" value={detail.token_limit !== null ? Number(detail.token_limit).toLocaleString() : "No limit configured"} />
              {detail.token_limit !== null && (
                <DetailRow label="Remaining Tokens" value={
                  <span className={`status-pill ${tokenStatusClass}`}>
                    {detail.remaining_tokens < 0
                      ? `-${Number(Math.abs(detail.remaining_tokens)).toLocaleString()}`
                      : Number(detail.remaining_tokens).toLocaleString()}
                  </span>
                } />
              )}
              {detail.usage_pct !== null && (
                <div style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border,#f0f0f0)" }}>
                  <span style={{ fontSize: 12, color: "var(--gray-500)", minWidth: 160, flexShrink: 0 }}>Token Usage</span>
                  <div style={{ flex: 1 }}><UsageBar pct={detail.usage_pct} /></div>
                </div>
              )}
            </section>

            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>Root Cause Analysis</h4>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(detail.root_causes || []).map((rc, i) => (
                  <li key={i} style={{ fontSize: 13, lineHeight: 1.7, color: "var(--gray-700)" }}>{rc}</li>
                ))}
              </ul>
            </section>

            {detail.related_anomalies?.length > 0 && (
              <section>
                <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>Related Anomalies</h4>
                {detail.related_anomalies.map((a, i) => (
                  <div key={i} style={{ padding: "10px 14px", borderRadius: 8, background: "var(--surface-2,#f8f9fa)", border: "1px solid var(--border,#e5e7eb)", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span className={`status-pill ${a.severity || ""}`}>{a.severity}</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{a.anomaly_type}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--gray-600)" }}>{a.message}</p>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
function AlertsSecurity() {
  const [days, setDays]                         = useState(30);
  const [projects, setProjects]                 = useState([]);
  const [selectedProject, setSelectedProject]   = useState("");

  // Alerts data
  const [overview, setOverview]                 = useState(null);
  const [piiSummary, setPiiSummary]             = useState(null);
  const [piiRequests, setPiiRequests]           = useState([]);
  const [piiTotal, setPiiTotal]                 = useState(0);
  const [blockedRequests, setBlockedRequests]   = useState([]);
  const [blockedTotal, setBlockedTotal]         = useState(0);

  // Security data
  const [secSummary, setSecSummary]             = useState(null);
  const [secLogs, setSecLogs]                   = useState([]);
  const [anomalies, setAnomalies]               = useState([]);
  const [piiModalEventId, setPiiModalEventId]   = useState(null);

  const [activeTab, setActiveTab]               = useState("pii");
  const [piiPage, setPiiPage]                   = useState(0);
  const [blockedPage, setBlockedPage]           = useState(0);
  const PAGE_SIZE = 25;

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    getProjects().then((r) => setProjects(r.data || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const proj      = selectedProject || undefined;
      const startDate = daysToStartDate(days);

      const [ovRes, piiSumRes, piiReqRes, blockedRes, secSumRes, secLogRes, anomalyRes] =
        await Promise.allSettled([
          getProxyOverview(undefined, days),
          getProxyPiiSummary(undefined, days),
          getProxyRequests({ project_id: proj, pii_only: true,    limit: PAGE_SIZE, offset: piiPage     * PAGE_SIZE }),
          getProxyRequests({ project_id: proj, status: "blocked", limit: PAGE_SIZE, offset: blockedPage * PAGE_SIZE }),
          getSecuritySummaryCombined(undefined, proj, startDate),
          getSecurityLogsCombined(undefined, undefined, undefined, proj, startDate),
          getAnomaliesCombined("open", undefined, proj, startDate),
        ]);

      const val = (r, fb) => r.status === "fulfilled" ? (r.value?.data ?? fb) : fb;

      setOverview(val(ovRes, null));
      setPiiSummary(val(piiSumRes, null));

      const piiData = val(piiReqRes, { items: [], total: 0 });
      setPiiRequests(piiData.items || []);
      setPiiTotal(piiData.total   || 0);

      const blockedData = val(blockedRes, { items: [], total: 0 });
      setBlockedRequests(blockedData.items || []);
      setBlockedTotal(blockedData.total   || 0);

      setSecSummary(val(secSumRes,   null));
      setSecLogs(val(secLogRes,      []));
      setAnomalies(val(anomalyRes,   []));
      setError("");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to load data.");
    } finally {
      setLoading(false);
    }
  }, [days, selectedProject, piiPage, blockedPage]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading">Loading alerts &amp; security data…</div>;

  const piiPages     = Math.ceil(piiTotal     / PAGE_SIZE);
  const blockedPages = Math.ceil(blockedTotal / PAGE_SIZE);

  return (
    <div className="page-shell">

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <section className="panel" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Alerts &amp; Security</span>

          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13 }}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.project_name || p.id}</option>
            ))}
          </select>

          {RANGE_OPTIONS.map(opt => (
            <button key={opt.value} type="button"
              className={`btn ${days === opt.value ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setDays(opt.value)}>
              {opt.label}
            </button>
          ))}

          {selectedProject && (
            <button className="btn btn-ghost" style={{ fontSize: 12, color: "#9E2A97" }}
              onClick={() => setSelectedProject("")}>
              ✕ Clear project
            </button>
          )}

          <button type="button" className="btn btn-ghost" onClick={load}>Refresh</button>
        </div>
      </section>

      {error && <div className="error-message">{error}</div>}

      {/* ── KPI Row ──────────────────────────────────────────────────────── */}
      <section className="stats-grid stats-grid-overview">
        {[
          { label: "Total Requests", value: num(overview?.total_requests),         color: undefined },
          { label: "Blocked",        value: num(overview?.blocked),                 color: "#ef4444" },
          { label: "PII Detections", value: num(overview?.pii_detections),         color: "#f97316" },
          { label: "Success Rate",   value: `${overview?.success_rate ?? 0}%`,     color: undefined },
          { label: "Completed",      value: num(overview?.completed),               color: "#22c55e" },
          { label: "Avg Latency",    value: `${num(overview?.avg_latency_ms)} ms`, color: undefined },
        ].map(card => (
          <div key={card.label} className="metric-card">
            <div className="metric-eyebrow">{card.label}</div>
            <div className="metric-value" style={card.color ? { color: card.color } : {}}>{card.value}</div>
          </div>
        ))}
      </section>

      {/* ── Security Snapshot ────────────────────────────────────────────── */}
      {secSummary && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>Security Snapshot</h3>
              <p style={{ fontSize: 13, color: "var(--gray-500)" }}>Risk scores, violations, and abnormal activity.</p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {[
              { label: "Total Security Events", value: secSummary.total_events      || 0 },
              { label: "PII Detections",         value: secSummary.total_with_pii   || 0, color: "#ef4444" },
              { label: "Misuse Patterns",         value: secSummary.misuse_events    || 0, color: "#f97316" },
              { label: "Data Out Violations",     value: secSummary.data_out_events  || 0, color: "#f97316" },
              { label: "Avg Risk Score",          value: Number(secSummary.average_risk_score || 0).toFixed(1) },
              { label: "Highest Risk Score",      value: Number(secSummary.highest_risk_score || 0).toFixed(1), color: "#ef4444" },
            ].map(item => (
              <div key={item.label} className="metric-card">
                <div className="metric-eyebrow">{item.label}</div>
                <div className="metric-value" style={item.color ? { color: item.color } : {}}>{item.value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── PII Breakdown charts ─────────────────────────────────────────── */}
      {piiSummary && (piiSummary.pii_type_breakdown?.length > 0 || piiSummary.action_breakdown?.length > 0) && (
        <section className="two-column">
          <div className="panel">
            <div className="section-head"><div><h3>PII Type Breakdown</h3></div></div>
            {piiSummary.pii_type_breakdown?.length > 0 ? (
              <div className="chart-box" style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={piiSummary.pii_type_breakdown}>
                    <CartesianGrid stroke="rgba(124,112,174,0.12)" vertical={false} />
                    <XAxis dataKey="pii_type" tick={{ fill: "#6d6782", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#6d6782", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty-state">No PII detections in this period.</div>
            )}
          </div>

          <div className="panel">
            <div className="section-head"><div><h3>Actions Taken on PII</h3></div></div>
            <div className="list-grid" style={{ marginTop: 8 }}>
              {piiSummary.action_breakdown?.map(item => (
                <div key={item.action} className="list-item">
                  <strong style={{ textTransform: "capitalize" }}>{item.action}</strong>
                  <div className="list-meta">
                    <span className={`status-pill ${ACTION_COLOR[item.action] || "medium"}`}>
                      {item.count} request{item.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              ))}
              {!piiSummary.action_breakdown?.length && (
                <div className="empty-state">No PII actions in this period.</div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Anomalies + Security Logs ────────────────────────────────────── */}
      <section className="two-column">
        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Open Anomalies</h3>
              <p style={{ fontSize: 13, color: "var(--gray-500)" }}>Usage spikes and suspicious changes.</p>
            </div>
          </div>
          <div className="list-grid">
            {anomalies.length ? anomalies.map((item) => (
              <div key={item.id} className="list-item">
                <strong>{item.anomaly_type}</strong>
                <div className="list-meta">
                  <span className={`status-pill ${item.severity}`}>{item.severity}</span>
                  {"  "}{item.message}
                </div>
                <div className="list-meta" style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 4 }}>
                  Project: <strong>{item.project_name || item.project_id || "—"}</strong>
                  {" · "}Tool: <strong>{item.tool_name || "—"}</strong>
                </div>
              </div>
            )) : <div className="empty-state">No open anomalies.</div>}
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Security Logs</h3>
              <p style={{ fontSize: 13, color: "var(--gray-500)" }}>PII, data out, misuse, and masking events. Click a PII row for detail.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th><th>PII</th><th>Type</th>
                  <th>Data Out</th><th>Misuse</th><th>Spike</th><th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {secLogs.length === 0
                  ? <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--gray-500)", padding: "24px 0" }}>No security events in this period.</td></tr>
                  : secLogs.map((item) => {
                    const isPII = !!item.pii_detected;
                    return (
                      <tr
                        key={item.id}
                        onClick={isPII ? () => setPiiModalEventId(item.event_id) : undefined}
                        style={isPII ? { cursor: "pointer", background: "rgba(239,68,68,0.04)" } : undefined}
                        title={isPII ? "Click to view PII detail" : undefined}
                      >
                        <td style={{ fontFamily: "monospace", fontSize: 11 }}>{item.event_id}</td>
                        <td>
                          {isPII
                            ? <span style={{ color: "#ef4444", fontWeight: 600, textDecoration: "underline dotted", cursor: "pointer" }}>yes</span>
                            : "no"}
                        </td>
                        <td>{item.pii_type || "—"}</td>
                        <td>{item.data_out_violation      ? "yes" : "no"}</td>
                        <td>{item.misuse_pattern_detected ? "yes" : "no"}</td>
                        <td>{item.abnormal_usage_spike    ? "yes" : "no"}</td>
                        <td style={{ color: riskColor(item.risk_score || 0), fontWeight: 600 }}>
                          {Number(item.risk_score || 0).toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Tabs: PII Detections | Blocked Requests ──────────────────────── */}
      <section className="panel">
        <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
          {[
            { key: "pii",     label: `PII Detections (${num(piiTotal)})` },
            { key: "blocked", label: `Blocked Requests (${num(blockedTotal)})` },
          ].map(tab => (
            <button key={tab.key} type="button"
              className={`btn ${activeTab === tab.key ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* PII Detections table */}
        {activeTab === "pii" && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Request ID</th><th>Org</th><th>Project</th><th>Model</th>
                    <th>PII Types</th><th>Action Taken</th><th>Status</th>
                    <th>Tokens</th><th>Cost</th><th>Client IP</th><th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {piiRequests.length === 0
                    ? <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--gray-500)", padding: "24px 0" }}>No PII detections in this period.</td></tr>
                    : piiRequests.map(row => (
                      <tr key={row.request_id}>
                        <td style={{ fontFamily: "monospace", fontSize: 11 }}>{row.request_id}</td>
                        <td>{row.org_id || "—"}</td>
                        <td>{row.project_id || "—"}</td>
                        <td><strong>{row.model_name || "—"}</strong></td>
                        <td>
                          {(row.pii_types || []).map(t => (
                            <span key={t} className="status-pill critical" style={{ marginRight: 4 }}>{t}</span>
                          ))}
                        </td>
                        <td>
                          <span className={`status-pill ${ACTION_COLOR[row.pii_action_taken] || "medium"}`}>
                            {row.pii_action_taken || "—"}
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill ${
                            row.request_status === "blocked"   ? "critical" :
                            row.request_status === "completed" ? "low"      : "medium"
                          }`}>{row.request_status}</span>
                        </td>
                        <td>{num(row.total_tokens)}</td>
                        <td>{money(row.total_cost)}</td>
                        <td style={{ fontSize: 12, color: "var(--gray-500)" }}>{row.client_ip || "—"}</td>
                        <td style={{ fontSize: 12, color: "var(--gray-500)" }}>
                          {row.received_at ? new Date(row.received_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {piiPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
                <button className="btn btn-ghost" disabled={piiPage === 0} onClick={() => setPiiPage(p => p - 1)}>← Prev</button>
                <span style={{ padding: "6px 12px", fontSize: 13 }}>Page {piiPage + 1} of {piiPages}</span>
                <button className="btn btn-ghost" disabled={piiPage >= piiPages - 1} onClick={() => setPiiPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </>
        )}

        {/* Blocked Requests table */}
        {activeTab === "blocked" && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Request ID</th><th>Org</th><th>Project</th><th>Model</th>
                    <th>PII Types Detected</th><th>Provider</th><th>Source</th>
                    <th>Client IP</th><th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {blockedRequests.length === 0
                    ? <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--gray-500)", padding: "24px 0" }}>No blocked requests in this period.</td></tr>
                    : blockedRequests.map(row => (
                      <tr key={row.request_id}>
                        <td style={{ fontFamily: "monospace", fontSize: 11 }}>{row.request_id}</td>
                        <td>{row.org_id || "—"}</td>
                        <td>{row.project_id || "—"}</td>
                        <td><strong>{row.model_name || "—"}</strong></td>
                        <td>
                          {(row.pii_types || []).map(t => (
                            <span key={t} className="status-pill critical" style={{ marginRight: 4 }}>{t}</span>
                          ))}
                          {!row.pii_types?.length && <span style={{ color: "var(--gray-400)" }}>—</span>}
                        </td>
                        <td>{row.provider || "—"}</td>
                        <td style={{ fontSize: 12 }}>{row.source_system || "—"}</td>
                        <td style={{ fontSize: 12, color: "var(--gray-500)" }}>{row.client_ip || "—"}</td>
                        <td style={{ fontSize: 12, color: "var(--gray-500)" }}>
                          {row.received_at ? new Date(row.received_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {blockedPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
                <button className="btn btn-ghost" disabled={blockedPage === 0} onClick={() => setBlockedPage(p => p - 1)}>← Prev</button>
                <span style={{ padding: "6px 12px", fontSize: 13 }}>Page {blockedPage + 1} of {blockedPages}</span>
                <button className="btn btn-ghost" disabled={blockedPage >= blockedPages - 1} onClick={() => setBlockedPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </section>

      {piiModalEventId && (
        <PIIDetailModal eventId={piiModalEventId} onClose={() => setPiiModalEventId(null)} />
      )}
    </div>
  );
}

export default AlertsSecurity;
