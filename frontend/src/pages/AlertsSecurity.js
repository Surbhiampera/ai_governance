import React, { useCallback, useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  getProxyRequests, getProxyPiiSummary, getProxyOverview,
  getSecurityLogsCombined, getSecuritySummaryCombined,
  getAnomaliesCombined, resolveAnomaly, getAdminPIIDetail, getProjects,
  getProxyRequestPiiDetail,
} from "../api";
import { failureLabel, statusPillClass } from "../failureCodes";

// ── Formatters ────────────────────────────────────────────────────────────────
const num   = (v) => Number(v || 0).toLocaleString();
const money = (v) => `$${Number(v || 0).toFixed(6)}`;

const CHART_COLORS = ["#9E2A97", "#7C70AE", "#b565b0", "#9a8fbf", "#c97dc4", "#3FB6D4", "#f59e0b", "#10b981"];

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

// ── Severity chip ─────────────────────────────────────────────────────────────
const SEV_COLOR = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };
function SeverityChip({ value }) {
  if (!value) return <span style={{ color: "var(--gray-400)" }}>—</span>;
  const v = value.toLowerCase();
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, textTransform: "capitalize",
      background: `${SEV_COLOR[v] || "#6b7280"}18`,
      color: SEV_COLOR[v] || "#6b7280",
      border: `1px solid ${SEV_COLOR[v] || "#6b7280"}40`,
    }}>{value}</span>
  );
}

// ── Proxy PII Detail Modal ────────────────────────────────────────────────────
function ProxyPiiDetailModal({ requestId, onClose }) {
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!requestId) return;
    setLoading(true);
    setError("");
    getProxyRequestPiiDetail(requestId)
      .then((res) => setDetail(res.data))
      .catch(() => setError("Failed to load PII detail."))
      .finally(() => setLoading(false));
  }, [requestId]);

  if (!requestId) return null;

  const sanitizedText = detail?.sanitized_prompt_text || "";
  const originalText  = detail?.original_prompt_text  || "";

  // Highlight [PLACEHOLDER] tokens in the sanitized text
  function highlightMasked(text) {
    if (!text) return text;
    const parts = text.split(/(\[[A-Z_]+\])/g);
    return parts.map((part, i) =>
      /^\[[A-Z_]+\]$/.test(part)
        ? <mark key={i} style={{ background: "#fef3c7", color: "#92400e", borderRadius: 3, padding: "0 2px" }}>{part}</mark>
        : part
    );
  }

  return (
    <div onClick={onClose} className="modal-backdrop" style={{ zIndex: 2100 }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-dialog"
        style={{ maxWidth: 860, padding: "24px 28px", maxHeight: "90vh", overflowY: "auto" }}>

        <div className="modal-header" style={{ marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>PII Request Detail</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--gray-500)", fontFamily: "monospace" }}>{requestId}</p>
          </div>
          <button onClick={onClose} className="btn-close">×</button>
        </div>

        {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "var(--gray-400)" }}>Loading…</div>}
        {error   && <div style={{ color: "#ef4444", fontSize: 13 }}>{error}</div>}

        {detail && !detail.pii_detected && detail.failure_code && (
          <>
            {/* ── Non-PII failure: no entity detail to show, surface the failure code/reason instead ── */}
            <div style={{
              display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap",
              padding: "12px 16px", borderRadius: 10, marginBottom: 20,
              background: "var(--gray-50)", border: "1px solid var(--gray-200)",
            }}>
              <div>
                <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Status</span>
                <div style={{ marginTop: 4 }}>
                  <span className={`status-pill ${statusPillClass(detail.request_status)}`}>{detail.request_status || "—"}</span>
                </div>
              </div>
              <div style={{ borderLeft: "1px solid var(--gray-200)", paddingLeft: 24 }}>
                <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Failure Code</span>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#9E2A97", marginTop: 4 }}>{failureLabel(detail.failure_code)}</div>
              </div>
              {detail.failure_reason && (
                <div style={{ borderLeft: "1px solid var(--gray-200)", paddingLeft: 24, flex: 1, minWidth: 200 }}>
                  <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Reason</span>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{detail.failure_reason}</div>
                </div>
              )}
            </div>

            {detail.request_payload && (
              <section>
                <h4 style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9E2A97" }}>
                  Request Payload
                </h4>
                <pre style={{
                  margin: 0, padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6,
                  background: "var(--gray-50)", border: "1px solid var(--gray-200)",
                  whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 320, overflowY: "auto",
                }}>{JSON.stringify(detail.request_payload, null, 2)}</pre>
              </section>
            )}
          </>
        )}

        {detail && detail.pii_detected && (
          <>
            {/* ── Section A: Summary ────────────────────────────────── */}
            <div style={{
              display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap",
              padding: "12px 16px", borderRadius: 10, marginBottom: 20,
              background: "var(--gray-50)", border: "1px solid var(--gray-200)",
            }}>
              <div>
                <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Severity</span>
                <div style={{ marginTop: 4 }}><SeverityChip value={detail.pii_severity} /></div>
              </div>
              <div style={{ borderLeft: "1px solid var(--gray-200)", paddingLeft: 24 }}>
                <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Entities Detected</span>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#f59e0b", marginTop: 2 }}>{detail.pii_entities_detected || 0}</div>
              </div>
              <div style={{ borderLeft: "1px solid var(--gray-200)", paddingLeft: 24 }}>
                <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Entities Masked</span>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#9E2A97", marginTop: 2 }}>{detail.pii_entities_masked || 0}</div>
              </div>
              <div style={{ borderLeft: "1px solid var(--gray-200)", paddingLeft: 24 }}>
                <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Action</span>
                <div style={{ marginTop: 4 }}>
                  <span className={`status-pill ${detail.pii_action_taken === "block" ? "critical" : detail.pii_action_taken === "mask" ? "high" : "medium"}`}>
                    {detail.pii_action_taken || "—"}
                  </span>
                </div>
              </div>
              <div style={{ borderLeft: "1px solid var(--gray-200)", paddingLeft: 24, flex: 1, minWidth: 120 }}>
                <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>PII Types</span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                  {(detail.pii_types || []).map((t) => (
                    <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "rgba(158,42,151,0.1)", color: "#9E2A97", fontFamily: "monospace", fontWeight: 600 }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Section B: Before/After table ────────────────────── */}
            {(detail.pii_detail || []).length > 0 && (
              <section style={{ marginBottom: 20 }}>
                <h4 style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9E2A97" }}>
                  Entity Detail — Before &amp; After
                </h4>
                <div className="table-wrap" style={{ margin: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>PII Type</th>
                        <th>Original Value</th>
                        <th>Masked As</th>
                        <th>Risk Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.pii_detail.map((e, i) => (
                        <tr key={i}>
                          <td>
                            <span style={{ fontSize: 11, fontFamily: "monospace", padding: "2px 8px", borderRadius: 20, background: "rgba(158,42,151,0.1)", color: "#9E2A97", fontWeight: 600 }}>
                              {(e.pii_type || "").toUpperCase()}
                            </span>
                          </td>
                          <td style={{ fontFamily: "monospace", fontSize: 12, color: "#b91c1c", wordBreak: "break-all" }}>
                            {e.original_value || "—"}
                          </td>
                          <td style={{ fontFamily: "monospace", fontSize: 12, color: "#9E2A97" }}>
                            {e.masked_value || "—"}
                          </td>
                          <td><SeverityChip value={e.risk_level} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ── Section C: Diff view ─────────────────────────────── */}
            {sanitizedText && (
              <section>
                <h4 style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9E2A97" }}>
                  Prompt Diff
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gray-500)", marginBottom: 6, textTransform: "uppercase" }}>Original</div>
                    <pre style={{
                      margin: 0, padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6,
                      background: "#fef2f2", border: "1px solid #fca5a5",
                      whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 300, overflowY: "auto",
                    }}>{originalText}</pre>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gray-500)", marginBottom: 6, textTransform: "uppercase" }}>Sanitized</div>
                    <pre style={{
                      margin: 0, padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6,
                      background: "#f0fdf4", border: "1px solid #86efac",
                      whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 300, overflowY: "auto",
                    }}>{highlightMasked(sanitizedText)}</pre>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
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
    <div onClick={onClose} className="modal-backdrop" style={{ zIndex: 2000 }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-dialog" style={{ maxWidth: 740, padding: "24px 28px" }}>
        <div className="modal-header" style={{ marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>PII Detection — Event Detail</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--gray-500)" }}>{eventId}</p>
          </div>
          <button onClick={onClose} className="btn-close">×</button>
        </div>

        {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "var(--gray-400)" }}>Loading…</div>}
        {error   && <div style={{ color: "#ef4444", fontSize: 13 }}>{error}</div>}

        {detail && (
          <>
            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9E2A97", paddingBottom: 6, borderBottom: "1px solid var(--gray-200)" }}>Context</h4>
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
              <h4 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9E2A97", paddingBottom: 6, borderBottom: "1px solid var(--gray-200)" }}>PII Detection</h4>
              <DetailRow label="PII Detected"       value={detail.pii_detected ? "Yes" : "No"} valueStyle={{ color: detail.pii_detected ? "#b91c1c" : "#15803d" }} />
              {detail.pii_type && <DetailRow label="PII Type" value={detail.pii_type} valueStyle={{ fontFamily: "monospace", background: "rgba(158,42,151,0.08)", padding: "1px 8px", borderRadius: 6, color: "#9E2A97" }} />}
              <DetailRow label="Risk Score" value={
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: riskColor(detail.risk_score), flexShrink: 0 }} />
                  {detail.risk_score?.toFixed(1)} — {detail.risk_label}
                </span>
              } />
              <DetailRow label="Misuse Pattern"     value={detail.misuse_pattern_detected ? "Detected" : "None"} valueStyle={{ color: detail.misuse_pattern_detected ? "#b91c1c" : undefined }} />
              <DetailRow label="Data Out Violation" value={detail.data_out_violation ? "Yes" : "No"}             valueStyle={{ color: detail.data_out_violation ? "#b91c1c" : undefined }} />
              <DetailRow label="Abnormal Spike"     value={detail.abnormal_usage_spike ? "Yes" : "No"}           valueStyle={{ color: detail.abnormal_usage_spike ? "#92400e" : undefined }} />
              <DetailRow label="Masking Applied"    value={detail.masking_applied ? "Yes" : "No"}                valueStyle={{ color: detail.masking_applied ? "#15803d" : "var(--gray-500)" }} />
            </section>

            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9E2A97", paddingBottom: 6, borderBottom: "1px solid var(--gray-200)" }}>Usage Metrics</h4>
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
                <div style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--gray-200)" }}>
                  <span style={{ fontSize: 12, color: "var(--gray-500)", minWidth: 160, flexShrink: 0 }}>Token Usage</span>
                  <div style={{ flex: 1 }}><UsageBar pct={detail.usage_pct} /></div>
                </div>
              )}
            </section>

            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9E2A97", paddingBottom: 6, borderBottom: "1px solid var(--gray-200)" }}>Root Cause Analysis</h4>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(detail.root_causes || []).map((rc, i) => (
                  <li key={i} style={{ fontSize: 13, lineHeight: 1.7, color: "var(--gray-700)" }}>{rc}</li>
                ))}
              </ul>
            </section>

            {detail.related_anomalies?.length > 0 && (
              <section>
                <h4 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9E2A97", paddingBottom: 6, borderBottom: "1px solid var(--gray-200)" }}>Related Anomalies</h4>
                {detail.related_anomalies.map((a, i) => (
                  <div key={i} style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--gray-50)", border: "1px solid var(--gray-200)", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span className={`status-pill ${a.severity || ""}`}>{a.severity}</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{a.anomaly_type}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--gray-500)" }}>{a.message}</p>
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

// ── Card Detail Modal ─────────────────────────────────────────────────────────
function ARow({ label, value, accent }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--gray-200)" }}>
      <span style={{ fontSize: 13, color: "var(--gray-500)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: accent || "var(--gray-700)" }}>{value}</span>
    </div>
  );
}
function ASection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9E2A97", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid var(--gray-200)" }}>{title}</div>
      {children}
    </div>
  );
}

function CardDetailModal({ cardKey, overview, piiSummary, secSummary, secLogs, anomalies, piiRequests = [], onActionClick, onClose }) {
  const TITLES = {
    total_requests:             "Total Requests",
    blocked:                    "Blocked Requests",
    pii_detections:             "PII Detections",
    success_rate:               "Success Rate",
    completed:                  "Completed Requests",
    avg_latency:                "Average Latency",
    sec_total_security_events:  "Security Events",
    sec_pii_detections:         "PII in Security Logs",
    sec_misuse_patterns:        "Misuse Patterns",
    sec_data_out_violations:    "Data Out Violations",
    sec_avg_risk_score:         "Risk Score Overview",
    sec_highest_risk_score:     "Highest Risk Events",
  };

  function renderContent() {
    if (cardKey === "total_requests") {
      return (
        <ASection title="Request Overview">
          <ARow label="Total Requests"  value={num(overview?.total_requests)} />
          <ARow label="Completed"       value={num(overview?.completed)}       accent="#22c55e" />
          <ARow label="Blocked"         value={num(overview?.blocked)}         accent="#ef4444" />
          <ARow label="PII Detections"  value={num(overview?.pii_detections)} accent="#f97316" />
          <ARow label="Success Rate"    value={`${overview?.success_rate ?? 0}%`} accent="#7C70AE" />
        </ASection>
      );
    }
    if (cardKey === "blocked") {
      const blockedPct = Number(overview?.total_requests || 0) > 0
        ? ((Number(overview?.blocked || 0) / Number(overview?.total_requests)) * 100).toFixed(1) : "0.0";
      return (
        <ASection title="Blocked Requests Detail">
          <ARow label="Blocked Count"  value={num(overview?.blocked)}         accent="#ef4444" />
          <ARow label="Total Requests" value={num(overview?.total_requests)} />
          <ARow label="Block Rate"     value={`${blockedPct}%`}              accent="#ef4444" />
          <ARow label="PII-Related"    value={num(overview?.pii_detections)} accent="#f97316" />
        </ASection>
      );
    }
    if (cardKey === "pii_detections") {
      return (
        <>
          <ASection title="PII Overview">
            <ARow label="PII Incidents" value={num(overview?.pii_detections)} accent="#ef4444" />
            <ARow label="Blocked"       value={num(overview?.blocked)}        accent="#ef4444" />
            <ARow label="Success Rate"  value={`${overview?.success_rate ?? 0}%`} />
          </ASection>
          {piiSummary?.pii_type_breakdown?.length > 0 && (
            <ASection title="By PII Type">
              <div style={{ display: "grid", gap: 6 }}>
                {piiSummary.pii_type_breakdown.map((item, i) => (
                  <div key={item.pii_type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: `${CHART_COLORS[i % CHART_COLORS.length]}10`, border: `1px solid ${CHART_COLORS[i % CHART_COLORS.length]}30`, borderRadius: "var(--radius-sm)" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: `${CHART_COLORS[i % CHART_COLORS.length]}18`, color: CHART_COLORS[i % CHART_COLORS.length], fontFamily: "monospace" }}>{item.pii_type}</span>
                    <span style={{ fontSize: 13, color: CHART_COLORS[i % CHART_COLORS.length], fontWeight: 700 }}>{item.count} hit{item.count !== 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            </ASection>
          )}
          {piiSummary?.action_breakdown?.length > 0 && (
            <ASection title="Actions Taken">
              <div style={{ display: "grid", gap: 6 }}>
                {piiSummary.action_breakdown.map(item => {
                  return (
                    <div
                      key={item.action}
                      onClick={() => onActionClick && onActionClick(item.action)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--gray-50)", border: "1px solid var(--gray-200)", borderRadius: "var(--radius-sm)", cursor: "pointer", transition: "background 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(158,42,151,0.06)"}
                      onMouseLeave={e => e.currentTarget.style.background = "var(--gray-50)"}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize", color: "var(--gray-700)" }}>{item.action}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#9E2A97", background: "rgba(158,42,151,0.1)", padding: "2px 10px", borderRadius: 20 }}>{item.count}</span>
                    </div>
                  );
                })}
              </div>
            </ASection>
          )}
        </>
      );
    }
    if (cardKey === "success_rate") {
      const sr        = Number(overview?.success_rate || 0);
      const total     = Number(overview?.total_requests || 0);
      const completed = Number(overview?.completed || 0);
      const blocked   = Number(overview?.blocked || 0);
      const srColor   = sr >= 95 ? "#22c55e" : sr >= 80 ? "#f97316" : "#ef4444";
      return (
        <ASection title="Request Outcomes">
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: "var(--gray-500)" }}>Success Rate</span>
              <span style={{ fontWeight: 800, fontSize: 16, color: srColor }}>{sr}%</span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: "#f1f5f9", overflow: "hidden" }}>
              <div style={{ width: `${sr}%`, height: "100%", background: srColor, borderRadius: 5 }} />
            </div>
          </div>
          <ARow label="Completed"      value={`${num(completed)} (${total > 0 ? Math.round((completed / total) * 100) : 0}%)`} accent="#22c55e" />
          <ARow label="Blocked"        value={`${num(blocked)} (${total > 0 ? Math.round((blocked / total) * 100) : 0}%)`}     accent="#ef4444" />
          <ARow label="Total Requests" value={num(total)} />
        </ASection>
      );
    }
    if (cardKey === "completed") {
      const total     = Number(overview?.total_requests || 0);
      const completed = Number(overview?.completed || 0);
      const compPct   = total > 0 ? Math.round((completed / total) * 100) : 0;
      return (
        <ASection title="Completed Requests">
          <ARow label="Completed"       value={num(completed)}     accent="#22c55e" />
          <ARow label="Total Requests"  value={num(total)} />
          <ARow label="Completion Rate" value={`${compPct}%`}      accent="#22c55e" />
          <ARow label="Avg Latency"     value={`${num(overview?.avg_latency_ms)} ms`} />
        </ASection>
      );
    }
    if (cardKey === "avg_latency") {
      const latency = Number(overview?.avg_latency_ms || 0);
      const status  = latency > 2000 ? { color: "#ef4444", label: "High — investigate slow models" }
                    : latency > 1000 ? { color: "#f97316", label: "Moderate" }
                    : { color: "#22c55e", label: "Good" };
      return (
        <ASection title="Latency & Performance">
          <ARow label="Average Latency" value={`${num(latency)} ms`} accent={status.color} />
          <ARow label="Status"          value={status.label}         accent={status.color} />
          <ARow label="Total Requests"  value={num(overview?.total_requests)} />
          <ARow label="Success Rate"    value={`${overview?.success_rate ?? 0}%`} />
        </ASection>
      );
    }
    if (cardKey === "sec_total_security_events") {
      return (
        <ASection title="Security Event Breakdown">
          <ARow label="Total Events"         value={secSummary?.total_events      || 0} />
          <ARow label="PII Detections"       value={secSummary?.total_with_pii    || 0} accent="#ef4444" />
          <ARow label="Misuse Patterns"      value={secSummary?.misuse_events     || 0} accent="#f97316" />
          <ARow label="Data Out Violations"  value={secSummary?.data_out_events   || 0} accent="#f97316" />
          <ARow label="Avg Risk Score"       value={Number(secSummary?.average_risk_score || 0).toFixed(1)} />
          <ARow label="Highest Risk Score"   value={Number(secSummary?.highest_risk_score || 0).toFixed(1)} accent="#ef4444" />
        </ASection>
      );
    }
    if (cardKey === "sec_pii_detections") {
      const piiLogs = secLogs.filter(l => l.pii_detected);
      return (
        <>
          <ASection title="PII in Security Logs">
            <ARow label="PII Events"           value={secSummary?.total_with_pii || 0} accent="#ef4444" />
            <ARow label="Total Security Events" value={secSummary?.total_events   || 0} />
          </ASection>
          {piiLogs.length > 0 && (
            <ASection title="Recent PII Events">
              <div style={{ display: "grid", gap: 6 }}>
                {piiLogs.slice(0, 5).map((l, i) => (
                  <div key={i} style={{ padding: "8px 12px", background: "rgba(158,42,151,0.05)", border: "1px solid rgba(158,42,151,0.15)", borderRadius: "var(--radius-sm)" }}>
                    <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--gray-500)", marginBottom: 4 }}>{l.event_id}</div>
                    <div style={{ display: "flex", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
                      {l.pii_type && <span style={{ fontWeight: 600, color: "#9E2A97", padding: "1px 6px", background: "rgba(158,42,151,0.1)", borderRadius: 4 }}>{l.pii_type}</span>}
                      <span style={{ color: riskColor(l.risk_score || 0), fontWeight: 600 }}>Risk: {Number(l.risk_score || 0).toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ASection>
          )}
        </>
      );
    }
    if (cardKey === "sec_misuse_patterns") {
      const misuseLogs = secLogs.filter(l => l.misuse_pattern_detected);
      return (
        <>
          <ASection title="Misuse Pattern Summary">
            <ARow label="Misuse Events"          value={secSummary?.misuse_events || 0} accent="#f97316" />
            <ARow label="Total Security Events"   value={secSummary?.total_events  || 0} />
          </ASection>
          {misuseLogs.length > 0 ? (
            <ASection title="Recent Misuse Events">
              <div style={{ display: "grid", gap: 6 }}>
                {misuseLogs.slice(0, 5).map((l, i) => (
                  <div key={i} style={{ padding: "8px 12px", background: "var(--gray-50)", border: "1px solid var(--gray-200)", borderRadius: "var(--radius-sm)" }}>
                    <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--gray-500)", marginBottom: 4 }}>{l.event_id}</div>
                    <span style={{ fontSize: 12, color: riskColor(l.risk_score || 0), fontWeight: 600 }}>Risk: {Number(l.risk_score || 0).toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </ASection>
          ) : <p style={{ fontSize: 13, color: "#15803d", margin: 0 }}>No misuse events in recent logs.</p>}
        </>
      );
    }
    if (cardKey === "sec_data_out_violations") {
      const dataOutLogs = secLogs.filter(l => l.data_out_violation);
      return (
        <>
          <ASection title="Data Out Violation Summary">
            <ARow label="Violation Events"      value={secSummary?.data_out_events || 0} accent="#f97316" />
            <ARow label="Total Security Events"  value={secSummary?.total_events    || 0} />
          </ASection>
          {dataOutLogs.length > 0 ? (
            <ASection title="Recent Violations">
              <div style={{ display: "grid", gap: 6 }}>
                {dataOutLogs.slice(0, 5).map((l, i) => (
                  <div key={i} style={{ padding: "8px 12px", background: "var(--gray-50)", border: "1px solid var(--gray-200)", borderRadius: "var(--radius-sm)" }}>
                    <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--gray-500)" }}>{l.event_id}</div>
                  </div>
                ))}
              </div>
            </ASection>
          ) : <p style={{ fontSize: 13, color: "#15803d", margin: 0 }}>No data out violations in recent logs.</p>}
        </>
      );
    }
    if (cardKey === "sec_avg_risk_score" || cardKey === "sec_highest_risk_score") {
      const sorted = [...secLogs].sort((a, b) => Number(b.risk_score || 0) - Number(a.risk_score || 0));
      return (
        <>
          <ASection title="Risk Score Overview">
            <ARow label="Average Risk Score" value={Number(secSummary?.average_risk_score || 0).toFixed(1)} accent={Number(secSummary?.average_risk_score || 0) >= 60 ? "#ef4444" : "#f97316"} />
            <ARow label="Highest Risk Score" value={Number(secSummary?.highest_risk_score || 0).toFixed(1)} accent="#ef4444" />
            <ARow label="Total Events"       value={secSummary?.total_events || 0} />
          </ASection>
          {sorted.length > 0 && (
            <ASection title="Top Risk Events">
              <div style={{ display: "grid", gap: 6 }}>
                {sorted.slice(0, 5).map((l, i) => (
                  <div key={i} style={{ padding: "8px 12px", background: Number(l.risk_score || 0) >= 60 ? "rgba(158,42,151,0.05)" : "var(--gray-50)", border: "1px solid var(--gray-200)", borderRadius: "var(--radius-sm)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--gray-500)" }}>{l.event_id}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: riskColor(l.risk_score || 0) }}>{Number(l.risk_score || 0).toFixed(1)}</span>
                    </div>
                    {l.pii_type && <span style={{ fontSize: 12, color: "#9E2A97", display: "block", marginTop: 3, fontWeight: 600 }}>{l.pii_type}</span>}
                  </div>
                ))}
              </div>
            </ASection>
          )}
        </>
      );
    }
    return <p style={{ fontSize: 13, color: "var(--gray-500)" }}>No detail available.</p>;
  }

  return (
    <div onClick={onClose} className="modal-backdrop" style={{ zIndex: 2000 }}>
      <div onClick={e => e.stopPropagation()} className="modal-dialog" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{TITLES[cardKey] || cardKey}</h3>
          <button onClick={onClose} className="btn-close">×</button>
        </div>
        {renderContent()}
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
  const [failureRequests, setFailureRequests]   = useState([]);
  const [failureTotal, setFailureTotal]         = useState(0);

  // Security data
  const [secSummary, setSecSummary]             = useState(null);
  const [secLogs, setSecLogs]                   = useState([]);
  const [anomalies, setAnomalies]               = useState([]);
  const [piiModalEventId, setPiiModalEventId]   = useState(null);

  const [activeKpi, setActiveKpi]               = useState(null);
  const [piiTypesModal, setPiiTypesModal]       = useState(null);
  const [actionModal, setActionModal]           = useState(null);
  const [activeTab, setActiveTab]               = useState("pii");
  const [piiPage, setPiiPage]                   = useState(0);
  const [blockedPage, setBlockedPage]           = useState(0);
  const [failurePage, setFailurePage]           = useState(0);
  const [piiSeverityFilter, setPiiSeverityFilter] = useState([]);
  const [proxyPiiModalId, setProxyPiiModalId]   = useState(null);
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

      const [ovRes, piiSumRes, piiReqRes, blockedRes, failureRes, secSumRes, secLogRes, anomalyRes] =
        await Promise.allSettled([
          getProxyOverview(undefined, days),
          getProxyPiiSummary(undefined, days),
          getProxyRequests({ project_id: proj, pii_only: true, pii_severity: piiSeverityFilter.length ? piiSeverityFilter.join(",") : undefined, limit: PAGE_SIZE, offset: piiPage * PAGE_SIZE }),
          getProxyRequests({ project_id: proj, status: "blocked", pii_only: true, limit: PAGE_SIZE, offset: blockedPage * PAGE_SIZE }),
          getProxyRequests({ project_id: proj, failure_only: true, limit: PAGE_SIZE, offset: failurePage * PAGE_SIZE }),
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

      const failureData = val(failureRes, { items: [], total: 0 });
      setFailureRequests(failureData.items || []);
      setFailureTotal(failureData.total   || 0);

      setSecSummary(val(secSumRes,   null));
      setSecLogs(val(secLogRes,      []));
      setAnomalies(val(anomalyRes,   []));
      setError("");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to load data.");
    } finally {
      setLoading(false);
    }
  }, [days, selectedProject, piiPage, blockedPage, failurePage, piiSeverityFilter]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading">Loading alerts &amp; security data…</div>;

  const piiPages     = Math.ceil(piiTotal     / PAGE_SIZE);
  const blockedPages = Math.ceil(blockedTotal / PAGE_SIZE);
  const failurePages = Math.ceil(failureTotal / PAGE_SIZE);

  return (
    <>
      {/* ── Fixed filter bar ─────────────────────────────────────────────── */}
      <div className="page-filter-bar">
        <span style={{ fontWeight: 600, fontSize: 14 }}>Alerts &amp; Security</span>

        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--gray-200)", fontSize: 13 }}
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

        {/* Severity filter */}
        <select
          value={piiSeverityFilter[0] || ""}
          onChange={(e) => {
            const val = e.target.value;
            setPiiSeverityFilter(val ? [val] : []);
            setPiiPage(0);
          }}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--gray-200)", fontSize: 13 }}
        >
          <option value="">All Severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        {selectedProject && (
          <button className="btn btn-ghost" style={{ fontSize: 12, color: "#9E2A97" }}
            onClick={() => setSelectedProject("")}>
            ✕ Clear project
          </button>
        )}

        <button type="button" className="btn btn-ghost" onClick={load}>Refresh</button>
      </div>

      {/* ── Scrollable dashboard body ────────────────────────────────────── */}
      <div className="page-body" style={{ padding: "12px 16px", overflow: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {error && <div className="error-message" style={{ flexShrink: 0 }}>{error}</div>}

          {/* ── Row 1: Compact KPI strip ─────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 8, flexShrink: 0 }}>
            {[
              { label: "Total Requests", value: num(overview?.total_requests),         sub: `${days}d` },
              { label: "Blocked",        value: num(overview?.blocked),                 sub: "violations" },
              { label: "PII Detections", value: num(overview?.pii_detections),         sub: "flagged" },
              { label: "Success Rate",   value: `${overview?.success_rate ?? 0}%`,     sub: "completion" },
              { label: "Completed",      value: num(overview?.completed),               sub: "passed" },
              { label: "Avg Latency",    value: `${num(overview?.avg_latency_ms)} ms`, sub: "end-to-end" },
            ].map(card => {
              const cardKey = card.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, "");
              return (
                <div key={card.label} className="metric-card metric-card-interactive"
                  onClick={() => setActiveKpi(cardKey)}
                  style={{ padding: "18px 20px", minHeight: 90 }}>
                  <div className="metric-eyebrow" style={{ fontSize: 11 }}>{card.label}</div>
                  <div className="metric-value" style={{ fontSize: 28, marginTop: 8 }}>{card.value}</div>
                  <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 4 }}>{card.sub}</div>
                </div>
              );
            })}
          </div>

          {/* ── Row 2: 2×2 panel grid ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gridTemplateRows: "repeat(2, minmax(220px, auto))", gap: 10 }}>

            {/* Panel 1 — PII Type Breakdown */}
            <div className="panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9E2A97", marginBottom: 8, flexShrink: 0 }}>
                PII Type Breakdown
              </div>
              {piiSummary?.pii_type_breakdown?.length > 0 ? (
                <div style={{ flex: 1, minHeight: 180 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={piiSummary.pii_type_breakdown} margin={{ top: 2, right: 6, left: -20, bottom: 2 }}>
                      <CartesianGrid stroke="rgba(124,112,174,0.12)" vertical={false} />
                      <XAxis dataKey="pii_type" tick={{ fill: "#6d6782", fontSize: 9 }} />
                      <YAxis tick={{ fill: "#6d6782", fontSize: 10 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: "var(--white)", border: "1px solid var(--gray-200)", borderRadius: 8, fontSize: 11 }}
                        formatter={(v) => [v, "Count"]}
                      />
                      <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                        {piiSummary.pii_type_breakdown.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--gray-400)", padding: "12px 0" }}>No PII detections in this period.</div>
              )}
            </div>

            {/* Panel 2 — Actions Taken on PII */}
            <div className="panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9E2A97", marginBottom: 8, flexShrink: 0 }}>
                Actions Taken on PII
              </div>
              <div style={{ overflow: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                {piiSummary?.action_breakdown?.length ? piiSummary.action_breakdown.map(item => (
                  <div
                    key={item.action}
                    onClick={async () => {
                      try {
                        const res = await getProxyRequests({ pii_only: true, pii_action_taken: item.action, limit: 100 });
                        setActionModal({ action: item.action, rows: res.data?.items || [] });
                      } catch {
                        setActionModal({ action: item.action, rows: [] });
                      }
                    }}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 12px", borderRadius: 10, cursor: "pointer", flexShrink: 0,
                      background: "var(--gray-50)", border: "1px solid var(--gray-200)",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(158,42,151,0.05)"}
                    onMouseLeave={e => e.currentTarget.style.background = "var(--gray-50)"}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{item.action}</span>
                    <span className={`status-pill ${ACTION_COLOR[item.action] || "medium"}`} style={{ fontSize: 11 }}>
                      {item.count} req{item.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                )) : (
                  <div style={{ fontSize: 12, color: "var(--gray-400)" }}>No PII actions in this period.</div>
                )}
              </div>
            </div>

            {/* Panel 3 — Security Snapshot */}
            <div className="panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9E2A97", marginBottom: 10, flexShrink: 0 }}>
                Security Snapshot
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8, overflow: "auto", flex: 1 }}>
                {secSummary ? [
                  { label: "Security Events", value: secSummary.total_events || 0,                                    key: "sec_total_security_events" },
                  { label: "PII Detections",   value: secSummary.total_with_pii || 0,                                 key: "sec_pii_detections" },
                  { label: "Misuse",           value: secSummary.misuse_events || 0,                                  key: "sec_misuse_patterns" },
                  { label: "Data Out",          value: secSummary.data_out_events || 0,                               key: "sec_data_out_violations" },
                  { label: "Avg Risk",          value: Number(secSummary.average_risk_score || 0).toFixed(1),         key: "sec_avg_risk_score" },
                  { label: "Peak Risk",         value: Number(secSummary.highest_risk_score || 0).toFixed(1),         key: "sec_highest_risk_score" },
                ].map(item => (
                  <div key={item.key}
                    className="metric-card-interactive"
                    onClick={() => setActiveKpi(item.key)}
                    style={{
                      padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                      background: "var(--gray-50)", border: "1px solid var(--gray-200)",
                    }}>
                    <div style={{ fontSize: 10, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{item.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "var(--gray-700)", marginTop: 4 }}>{item.value}</div>
                  </div>
                )) : (
                  <div style={{ gridColumn: "1/-1", fontSize: 12, color: "var(--gray-400)" }}>No security data.</div>
                )}
              </div>
            </div>

            {/* Panel 4 — Open Anomalies */}
            <div className="panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9E2A97", marginBottom: 8, flexShrink: 0 }}>
                Open Anomalies <span style={{ fontSize: 11, fontWeight: 400, color: "var(--gray-500)", textTransform: "none" }}>({anomalies.length})</span>
              </div>
              <div style={{ overflow: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                {anomalies.length ? anomalies.map((item) => (
                  <div key={item.id} style={{ padding: "8px 12px", borderRadius: 10, background: "var(--gray-50)", border: "1px solid var(--gray-200)", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>
                        {item.anomaly_type.replace(/_/g, " ")}
                      </span>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 10, padding: "1px 8px", color: "#9E2A97", border: "1px solid rgba(158,42,151,0.3)" }}
                        onClick={async () => {
                          try { await resolveAnomaly(item.id); setAnomalies(prev => prev.filter(a => a.id !== item.id)); } catch {/* ignore */}
                        }}
                      >Resolve</button>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 3 }}>
                      <span className={`status-pill ${item.severity}`} style={{ fontSize: 10, padding: "1px 7px" }}>{item.severity}</span>
                      {" "}{Number(item.anomaly_score || 0).toFixed(2)}× spike · {item.project_name || item.project_id || "—"}
                    </div>
                  </div>
                )) : <div style={{ fontSize: 12, color: "var(--gray-400)" }}>No open anomalies.</div>}
              </div>
            </div>

          </div>

          {/* ── Row 3: Tabs — PII Detections | Blocked | Security Logs ──────── */}
          <div className="panel" style={{ flexShrink: 0, padding: "12px 16px", display: "flex", flexDirection: "column", height: 340, overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 10, borderBottom: "1px solid var(--gray-200)", paddingBottom: 8, flexShrink: 0 }}>
              {[
                { key: "pii",      label: `PII Detections (${num(piiTotal)})` },
                { key: "blocked",  label: `Blocked (${num(blockedTotal)})` },
                { key: "failures", label: `Failures (${num(failureTotal)})` },
                { key: "logs",     label: `Security Logs (${secLogs.length})` },
              ].map(tab => (
                <button key={tab.key} type="button"
                  className={`btn ${activeTab === tab.key ? "btn-primary" : "btn-ghost"}`}
                  style={{ fontSize: 12, padding: "6px 12px" }}
                  onClick={() => setActiveTab(tab.key)}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* PII Detections table */}
            {activeTab === "pii" && (
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div className="table-wrap table-wrap--fill">
                  <table>
                    <thead>
                      <tr>
                        <th>Request ID</th><th>Project</th><th>Model</th><th>Route</th>
                        <th>PII Types</th><th>Action</th><th>Status</th>
                        <th>Detected</th><th>Masked</th><th>Severity</th>
                        <th>Tokens</th><th>Cost</th><th>Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {piiRequests.length === 0
                        ? <tr><td colSpan={13} style={{ textAlign: "center", color: "var(--gray-500)", padding: "20px 0" }}>No PII detections in this period.</td></tr>
                        : piiRequests.map(row => (
                          <tr
                            key={row.request_id}
                            onClick={() => row.pii_detected && setProxyPiiModalId(row.request_id)}
                            style={row.pii_detected ? { cursor: "pointer" } : undefined}
                            title={row.pii_detected ? "Click to view PII detail" : undefined}
                          >
                            <td style={{ fontFamily: "monospace", fontSize: 10 }}>{row.request_id}</td>
                            <td style={{ fontSize: 12 }}>{row.project_id || "—"}</td>
                            <td><strong style={{ fontSize: 12 }}>{row.model_name || "—"}</strong></td>
                            <td style={{ fontFamily: "monospace", fontSize: 10, color: "var(--gray-500)" }}>{row.entry_point || "—"}</td>
                            <td>
                              {(row.pii_types || []).length > 0 ? (
                                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                  <span className="status-pill critical" style={{ fontSize: 10, padding: "1px 6px" }}>{row.pii_types[0]}</span>
                                  {row.pii_types.length > 1 && (
                                    <span
                                      onClick={(e) => { e.stopPropagation(); setPiiTypesModal(row.pii_types); }}
                                      style={{ fontSize: 10, fontWeight: 600, color: "#9E2A97", background: "rgba(158,42,151,0.1)", padding: "1px 6px", borderRadius: 8, cursor: "pointer", border: "1px solid rgba(158,42,151,0.25)" }}
                                    >+{row.pii_types.length - 1}</span>
                                  )}
                                </span>
                              ) : "—"}
                            </td>
                            <td>
                              <span className={`status-pill ${ACTION_COLOR[row.pii_action_taken] || "medium"}`} style={{ fontSize: 10, padding: "1px 7px" }}>
                                {row.pii_action_taken || "—"}
                              </span>
                            </td>
                            <td>
                              <span className={`status-pill ${statusPillClass(row.request_status)}`} style={{ fontSize: 10, padding: "1px 7px" }}>
                                {row.request_status}
                              </span>
                            </td>
                            <td>
                              {row.pii_detected
                                ? <span style={{ display: "inline-block", minWidth: 20, padding: "1px 6px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "#fef3c718", color: "#92400e", border: "1px solid #fde68a" }}>{row.pii_entities_detected ?? 0}</span>
                                : <span style={{ color: "var(--gray-400)" }}>—</span>}
                            </td>
                            <td>
                              {row.pii_detected
                                ? <span style={{ display: "inline-block", minWidth: 20, padding: "1px 6px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "rgba(158,42,151,0.1)", color: "#9E2A97", border: "1px solid rgba(158,42,151,0.25)" }}>{row.pii_entities_masked ?? 0}</span>
                                : <span style={{ color: "var(--gray-400)" }}>—</span>}
                            </td>
                            <td>{row.pii_detected ? <SeverityChip value={row.pii_severity} /> : <span style={{ color: "var(--gray-400)" }}>—</span>}</td>
                            <td style={{ fontSize: 12 }}>{num(row.total_tokens)}</td>
                            <td style={{ fontSize: 12 }}>{money(row.total_cost)}</td>
                            <td style={{ fontSize: 11, color: "var(--gray-500)" }}>
                              {row.received_at ? new Date(row.received_at).toLocaleString() : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {piiPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 6, paddingTop: 6, flexShrink: 0 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} disabled={piiPage === 0} onClick={() => setPiiPage(p => p - 1)}>← Prev</button>
                    <span style={{ padding: "4px 10px", fontSize: 12 }}>Page {piiPage + 1} of {piiPages}</span>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} disabled={piiPage >= piiPages - 1} onClick={() => setPiiPage(p => p + 1)}>Next →</button>
                  </div>
                )}
              </div>
            )}

            {/* Blocked Requests table */}
            {activeTab === "blocked" && (
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div className="table-wrap table-wrap--fill">
                  <table>
                    <thead>
                      <tr>
                        <th>Request ID</th><th>Org</th><th>Project</th><th>Model</th>
                        <th>PII Types</th><th>Provider</th><th>Route</th><th>Client IP</th><th>Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blockedRequests.length === 0
                        ? <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--gray-500)", padding: "20px 0" }}>No blocked requests in this period.</td></tr>
                        : blockedRequests.map(row => (
                          <tr key={row.request_id}>
                            <td style={{ fontFamily: "monospace", fontSize: 10 }}>{row.request_id}</td>
                            <td style={{ fontSize: 12 }}>{row.org_id || "—"}</td>
                            <td style={{ fontSize: 12 }}>{row.project_id || "—"}</td>
                            <td><strong style={{ fontSize: 12 }}>{row.model_name || "—"}</strong></td>
                            <td>
                              {(row.pii_types || []).map(t => (
                                <span key={t} className="status-pill critical" style={{ marginRight: 3, fontSize: 10, padding: "1px 6px" }}>{t}</span>
                              ))}
                              {!row.pii_types?.length && <span style={{ color: "var(--gray-400)" }}>—</span>}
                            </td>
                            <td style={{ fontSize: 12 }}>{row.provider || "—"}</td>
                            <td style={{ fontFamily: "monospace", fontSize: 10, color: "var(--gray-500)" }}>{row.entry_point || row.source_system || "—"}</td>
                            <td style={{ fontSize: 11, color: "var(--gray-500)" }}>{row.client_ip || "—"}</td>
                            <td style={{ fontSize: 11, color: "var(--gray-500)" }}>
                              {row.received_at ? new Date(row.received_at).toLocaleString() : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {blockedPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 6, paddingTop: 6, flexShrink: 0 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} disabled={blockedPage === 0} onClick={() => setBlockedPage(p => p - 1)}>← Prev</button>
                    <span style={{ padding: "4px 10px", fontSize: 12 }}>Page {blockedPage + 1} of {blockedPages}</span>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} disabled={blockedPage >= blockedPages - 1} onClick={() => setBlockedPage(p => p + 1)}>Next →</button>
                  </div>
                )}
              </div>
            )}

            {/* Failures tab — non-PII blocks + failed/partial requests */}
            {activeTab === "failures" && (
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div className="table-wrap table-wrap--fill">
                  <table>
                    <thead>
                      <tr>
                        <th>Request ID</th><th>Project</th><th>Model</th><th>Route</th>
                        <th>Status</th><th>Failure Code</th><th>Reason</th><th>Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failureRequests.length === 0
                        ? <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--gray-500)", padding: "20px 0" }}>No failures in this period.</td></tr>
                        : failureRequests.map(row => (
                          <tr
                            key={row.request_id}
                            onClick={() => setProxyPiiModalId(row.request_id)}
                            style={{ cursor: "pointer" }}
                            title="Click to view failure detail"
                          >
                            <td style={{ fontFamily: "monospace", fontSize: 10 }}>{row.request_id}</td>
                            <td style={{ fontSize: 12 }}>{row.project_id || "—"}</td>
                            <td><strong style={{ fontSize: 12 }}>{row.model_name || "—"}</strong></td>
                            <td style={{ fontFamily: "monospace", fontSize: 10, color: "var(--gray-500)" }}>{row.entry_point || "—"}</td>
                            <td>
                              <span className={`status-pill ${statusPillClass(row.request_status)}`} style={{ fontSize: 10, padding: "1px 7px" }}>
                                {row.request_status}
                              </span>
                            </td>
                            <td style={{ fontSize: 12 }}>{row.failure_code ? failureLabel(row.failure_code) : "—"}</td>
                            <td style={{ fontSize: 11, color: "var(--gray-500)" }}>{row.failure_reason || "—"}</td>
                            <td style={{ fontSize: 11, color: "var(--gray-500)" }}>
                              {row.received_at ? new Date(row.received_at).toLocaleString() : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {failurePages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 6, paddingTop: 6, flexShrink: 0 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} disabled={failurePage === 0} onClick={() => setFailurePage(p => p - 1)}>← Prev</button>
                    <span style={{ padding: "4px 10px", fontSize: 12 }}>Page {failurePage + 1} of {failurePages}</span>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} disabled={failurePage >= failurePages - 1} onClick={() => setFailurePage(p => p + 1)}>Next →</button>
                  </div>
                )}
              </div>
            )}

            {/* Security Logs tab */}
            {activeTab === "logs" && (
              <div className="table-wrap table-wrap--fill">
                <table>
                  <thead>
                    <tr>
                      <th>Event</th><th>PII</th><th>Type</th>
                      <th>Data Out</th><th>Misuse</th><th>Spike</th><th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secLogs.length === 0
                      ? <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--gray-500)", padding: "20px 0" }}>No security events in this period.</td></tr>
                      : secLogs.map((item) => {
                        const isPII = !!item.pii_detected;
                        const openPiiDetail = isPII ? () => {
                          if (item.event_id?.startsWith("req-")) setProxyPiiModalId(item.event_id);
                          else setPiiModalEventId(item.event_id);
                        } : undefined;
                        return (
                          <tr
                            key={item.id}
                            onClick={openPiiDetail}
                            style={isPII ? { cursor: "pointer", background: "rgba(158,42,151,0.04)" } : undefined}
                            title={isPII ? "Click to view PII detail" : undefined}
                          >
                            <td style={{ fontFamily: "monospace", fontSize: 10 }}>{item.event_id}</td>
                            <td>
                              {isPII
                                ? <span className="badge-yes" style={{ cursor: "pointer", textDecoration: "underline dotted" }}>yes</span>
                                : <span className="badge-no">no</span>}
                            </td>
                            <td>
                              {item.pii_type
                                ? <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: "rgba(158,42,151,0.1)", color: "#9E2A97", fontWeight: 600, fontFamily: "monospace" }}>{item.pii_type}</span>
                                : <span style={{ color: "var(--gray-400)" }}>—</span>}
                            </td>
                            <td>{item.data_out_violation      ? <span className="badge-yes">yes</span> : <span className="badge-no">no</span>}</td>
                            <td>{item.misuse_pattern_detected ? <span className="badge-yes">yes</span> : <span className="badge-no">no</span>}</td>
                            <td>{item.abnormal_usage_spike    ? <span className="badge-yes">yes</span> : <span className="badge-no">no</span>}</td>
                            <td>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                <span style={{ width: 7, height: 7, borderRadius: "50%", background: riskColor(item.risk_score || 0), display: "inline-block" }} />
                                <span style={{ color: riskColor(item.risk_score || 0), fontWeight: 700, fontSize: 12 }}>{Number(item.risk_score || 0).toFixed(1)}</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

          </div>

          {/* ── Security Logs — standalone risk-grouped table ──────────────── */}
          <div className="panel">
          <div className="section-head">
            <div>
              <h3>Security Logs</h3>
              <p style={{ color: "var(--gray-500)", fontSize: 13 }}>
                {secLogs.length} event{secLogs.length !== 1 ? "s" : ""} · grouped by risk level
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { label: "High",   color: "#ef4444", count: secLogs.filter(l => Number(l.risk_score || 0) >= 0.7).length },
                { label: "Medium", color: "#f97316", count: secLogs.filter(l => { const s = Number(l.risk_score || 0); return s >= 0.4 && s < 0.7; }).length },
                { label: "Low",    color: "#22c55e", count: secLogs.filter(l => Number(l.risk_score || 0) < 0.4).length },
              ].map(b => b.count > 0 && (
                <span key={b.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: b.color }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: b.color, display: "inline-block" }} />
                  {b.label} ({b.count})
                </span>
              ))}
            </div>
          </div>

          {secLogs.length === 0 ? (
            <p style={{ color: "var(--gray-500)", fontSize: 13, padding: "12px 0" }}>No security events in this period.</p>
          ) : (
            <>
              {[
                { label: "High Risk",   color: "#ef4444", bg: "rgba(239,68,68,0.04)",   filter: l => Number(l.risk_score || 0) >= 0.7 },
                { label: "Medium Risk", color: "#f97316", bg: "rgba(249,115,22,0.04)",  filter: l => { const s = Number(l.risk_score || 0); return s >= 0.4 && s < 0.7; } },
                { label: "Low Risk",    color: "#22c55e", bg: "rgba(34,197,94,0.03)",   filter: l => Number(l.risk_score || 0) < 0.4 },
              ].map(band => {
                const rows = [...secLogs]
                  .filter(band.filter)
                  .sort((a, b) => Number(b.risk_score || 0) - Number(a.risk_score || 0));
                if (rows.length === 0) return null;
                return (
                  <div key={band.label} style={{ marginBottom: 24 }}>
                    {/* Band header */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                      background: band.bg, borderLeft: `3px solid ${band.color}`,
                      borderRadius: "6px 6px 0 0", marginBottom: 0,
                    }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: band.color, display: "inline-block" }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: band.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {band.label}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--gray-400)", marginLeft: 2 }}>— {rows.length} event{rows.length !== 1 ? "s" : ""}</span>
                    </div>

                    <div className="table-wrap" style={{ borderRadius: "0 0 8px 8px", marginTop: 0 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Event</th>
                            <th>PII</th>
                            <th>PII Types</th>
                            <th>Data Out</th>
                            <th>Misuse</th>
                            <th>Spike</th>
                            <th>Risk</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(item => {
                            const isPII    = !!item.pii_detected;
                            const score    = Number(item.risk_score || 0);
                            const piiTypes = item.pii_type
                              ? item.pii_type.split(",").map(s => s.trim()).filter(Boolean)
                              : [];
                            const openPiiDetail = isPII ? () => {
                              if (item.event_id?.startsWith("req-")) setProxyPiiModalId(item.event_id);
                              else setPiiModalEventId(item.event_id);
                            } : undefined;
                            return (
                              <tr
                                key={item.id}
                                onClick={openPiiDetail}
                                style={isPII ? { cursor: "pointer" } : undefined}
                                title={isPII ? "Click to view PII detail" : undefined}
                              >
                                <td style={{ fontFamily: "monospace", fontSize: 11 }}>{item.event_id}</td>
                                <td>
                                  {isPII
                                    ? <span className="badge-yes" style={{ cursor: "pointer", textDecoration: "underline dotted" }}>yes</span>
                                    : <span className="badge-no">no</span>}
                                </td>
                                <td>
                                  {piiTypes.length > 0 ? (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                                      <span style={{
                                        fontSize: 11, padding: "2px 8px", borderRadius: 20,
                                        background: "rgba(158,42,151,0.1)", color: "#9E2A97",
                                        fontWeight: 600, fontFamily: "monospace",
                                      }}>{piiTypes[0]}</span>
                                      {piiTypes.length > 1 && (
                                        <span
                                          onClick={e => { e.stopPropagation(); setPiiTypesModal(piiTypes); }}
                                          style={{
                                            fontSize: 10, fontWeight: 700, color: "#9E2A97",
                                            background: "rgba(158,42,151,0.12)", padding: "2px 7px",
                                            borderRadius: 20, cursor: "pointer",
                                            border: "1px solid rgba(158,42,151,0.3)",
                                          }}
                                        >+{piiTypes.length - 1}</span>
                                      )}
                                    </span>
                                  ) : <span style={{ color: "var(--gray-400)" }}>—</span>}
                                </td>
                                <td>{item.data_out_violation      ? <span className="badge-yes">yes</span> : <span className="badge-no">no</span>}</td>
                                <td>{item.misuse_pattern_detected ? <span className="badge-yes">yes</span> : <span className="badge-no">no</span>}</td>
                                <td>{item.abnormal_usage_spike    ? <span className="badge-yes">yes</span> : <span className="badge-no">no</span>}</td>
                                <td>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: band.color, display: "inline-block" }} />
                                    <span style={{ color: band.color, fontWeight: 700, fontSize: 13 }}>{score.toFixed(1)}</span>
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        </div>{/* close inner flex column */}
      </div>{/* close page-body */}

      {piiModalEventId && (
        <PIIDetailModal eventId={piiModalEventId} onClose={() => setPiiModalEventId(null)} />
      )}

      {proxyPiiModalId && (
        <ProxyPiiDetailModal requestId={proxyPiiModalId} onClose={() => setProxyPiiModalId(null)} />
      )}

      {activeKpi && (
        <CardDetailModal
          cardKey={activeKpi}
          overview={overview}
          piiSummary={piiSummary}
          secSummary={secSummary}
          secLogs={secLogs}
          anomalies={anomalies}
          piiRequests={piiRequests}
          onActionClick={async (action) => {
            try {
              const res = await getProxyRequests({ pii_only: true, pii_action_taken: action, limit: 100 });
              setActionModal({ action, rows: res.data?.items || [] });
            } catch {
              setActionModal({ action, rows: [] });
            }
          }}
          onClose={() => setActiveKpi(null)}
        />
      )}

      {actionModal && (
        <div onClick={() => setActionModal(null)} className="modal-backdrop" style={{ zIndex: 2100 }}>
          <div onClick={e => e.stopPropagation()} className="modal-dialog" style={{ maxWidth: 860 }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: "0 0 2px", textTransform: "capitalize" }}>{actionModal.action} — Requests</h3>
                <p style={{ margin: 0, fontSize: 12, color: "var(--gray-500)" }}>
                  {actionModal.rows.length} request{actionModal.rows.length !== 1 ? "s" : ""} in current page
                </p>
              </div>
              <button onClick={() => setActionModal(null)} className="btn-close">×</button>
            </div>
            {actionModal.rows.length === 0 ? (
              <p style={{ color: "var(--gray-400)", fontSize: 13, textAlign: "center", padding: "24px 0" }}>No matching requests in the current page.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Request ID</th><th>Project</th><th>Model</th><th>Route</th>
                      <th>PII Types</th><th>Tokens</th><th>Cost</th><th>Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionModal.rows.map(row => (
                      <tr key={row.request_id}>
                        <td style={{ fontFamily: "monospace", fontSize: 11 }}>{row.request_id}</td>
                        <td>{row.project_id || "—"}</td>
                        <td><strong>{row.model_name || "—"}</strong></td>
                        <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--gray-500)" }}>{row.entry_point || "—"}</td>
                        <td>
                          {(row.pii_types || []).length > 0 ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <span className="status-pill critical" style={{ fontSize: 11 }}>{row.pii_types[0]}</span>
                              {row.pii_types.length > 1 && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#9E2A97", background: "rgba(158,42,151,0.1)", padding: "1px 6px", borderRadius: 8, border: "1px solid rgba(158,42,151,0.25)", cursor: "default" }}
                                  title={row.pii_types.slice(1).join(", ")}>
                                  +{row.pii_types.length - 1}
                                </span>
                              )}
                            </span>
                          ) : <span style={{ color: "var(--gray-400)" }}>—</span>}
                        </td>
                        <td>{num(row.total_tokens)}</td>
                        <td style={{ fontFamily: "monospace", fontSize: 12 }}>{money(row.total_cost)}</td>
                        <td style={{ fontSize: 12, color: "var(--gray-500)" }}>
                          {row.received_at ? new Date(row.received_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {piiTypesModal && (
        <div onClick={() => setPiiTypesModal(null)} className="modal-backdrop" style={{ zIndex: 2100 }}>
          <div onClick={(e) => e.stopPropagation()} className="modal-dialog" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>All PII Types Detected</h3>
              <button onClick={() => setPiiTypesModal(null)} className="btn-close">×</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 4 }}>
              {piiTypesModal.map((t, i) => (
                <span key={i} className="status-pill critical" style={{ fontSize: 13, padding: "4px 12px" }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AlertsSecurity;
