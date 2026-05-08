import React, { useEffect, useState } from "react";
import {
  getSecurityLogsCombined,
  getSecuritySummaryCombined,
  getAnomaliesCombined,
  getAdminPIIDetail,
  getOrganizations,
  getProjects,
} from "../api";
import { RANGE_OPTIONS as RANGE_OPTIONS_S, rangeToStartDate as rangeToStartDateS } from "../utils/filters";

const RISK_COLOR_S = (score) => {
  if (score >= 80) return "#ef4444";
  if (score >= 60) return "#f97316";
  if (score >= 30) return "#eab308";
  return "#22c55e";
};

function SDetailRow({ label, value, valueStyle }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border,#f0f0f0)" }}>
      <span style={{ fontSize: 12, color: "var(--gray-500)", minWidth: 160, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, ...valueStyle }}>{value ?? "—"}</span>
    </div>
  );
}

function SPBar({ pct }) {
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

function SecurityPIIModal({ eventId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    detail?.usage_pct >= 100 ? "critical"
    : detail?.usage_pct >= 90 ? "high"
    : detail?.usage_pct >= 75 ? "medium"
    : "";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", maxWidth: 740, width: "100%", maxHeight: "88vh", overflowY: "auto", position: "relative", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--gray-500)" }}>×</button>
        <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>PII Detection — Event Detail</h3>
        <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--gray-500)" }}>{eventId}</p>

        {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "var(--gray-400)" }}>Loading…</div>}
        {error && <div style={{ color: "#ef4444", fontSize: 13 }}>{error}</div>}

        {detail && (
          <>
            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>Context</h4>
              <SDetailRow label="Organization" value={`${detail.org_name}${detail.org_id !== detail.org_name ? ` (${detail.org_id})` : ""}`} />
              <SDetailRow label="Project" value={detail.project_name ? `${detail.project_name}${detail.project_id !== detail.project_name ? ` (${detail.project_id})` : ""}` : detail.project_id} />
              {detail.project_environment && <SDetailRow label="Environment" value={detail.project_environment} />}
              <SDetailRow label="Model / Tool" value={detail.model_name} />
              <SDetailRow label="Provider" value={detail.provider} />
              <SDetailRow label="Service Type" value={detail.service_type} />
              <SDetailRow label="Status" value={detail.status} />
              <SDetailRow label="Timestamp" value={detail.created_at ? new Date(detail.created_at).toLocaleString() : null} />
            </section>

            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>PII Detection</h4>
              <SDetailRow label="PII Detected" value={detail.pii_detected ? "Yes" : "No"} valueStyle={{ color: detail.pii_detected ? "#ef4444" : "#22c55e" }} />
              {detail.pii_type && <SDetailRow label="PII Type" value={detail.pii_type} valueStyle={{ fontFamily: "monospace", background: "#fef9c3", padding: "1px 6px", borderRadius: 4 }} />}
              <SDetailRow label="Risk Score" value={
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: RISK_COLOR_S(detail.risk_score), flexShrink: 0 }} />
                  {detail.risk_score?.toFixed(1)} — {detail.risk_label}
                </span>
              } />
              <SDetailRow label="Misuse Pattern" value={detail.misuse_pattern_detected ? "Detected" : "None"} valueStyle={{ color: detail.misuse_pattern_detected ? "#ef4444" : undefined }} />
              <SDetailRow label="Data Out Violation" value={detail.data_out_violation ? "Yes" : "No"} valueStyle={{ color: detail.data_out_violation ? "#ef4444" : undefined }} />
              <SDetailRow label="Abnormal Spike" value={detail.abnormal_usage_spike ? "Yes" : "No"} valueStyle={{ color: detail.abnormal_usage_spike ? "#f97316" : undefined }} />
              <SDetailRow label="Masking Applied" value={detail.masking_applied ? "Yes" : "No"} valueStyle={{ color: detail.masking_applied ? "#22c55e" : "var(--gray-500)" }} />
            </section>

            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>Usage Metrics</h4>
              <SDetailRow label="Prompt Tokens" value={Number(detail.prompt_tokens || 0).toLocaleString()} />
              <SDetailRow label="Completion Tokens" value={Number(detail.completion_tokens || 0).toLocaleString()} />
              <SDetailRow label="Total Tokens" value={Number(detail.total_tokens || 0).toLocaleString()} />
              <SDetailRow label="Total Cost" value={`$${Number(detail.total_cost || 0).toFixed(4)}`} />
              <SDetailRow label="Latency" value={`${Number(detail.latency_ms || 0).toLocaleString()} ms`} />
              <SDetailRow label="Token Limit (daily)" value={detail.token_limit !== null ? Number(detail.token_limit).toLocaleString() : "No limit configured"} />
              {detail.token_limit !== null && (
                <SDetailRow label="Remaining Tokens" value={
                  <span className={`status-pill ${tokenStatusClass}`}>
                    {detail.remaining_tokens < 0 ? `-${Number(Math.abs(detail.remaining_tokens)).toLocaleString()}` : Number(detail.remaining_tokens).toLocaleString()}
                  </span>
                } />
              )}
              {detail.usage_pct !== null && (
                <div style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border,#f0f0f0)" }}>
                  <span style={{ fontSize: 12, color: "var(--gray-500)", minWidth: 160, flexShrink: 0 }}>Token Usage</span>
                  <div style={{ flex: 1 }}><SPBar pct={detail.usage_pct} /></div>
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

            {detail.related_anomalies && detail.related_anomalies.length > 0 && (
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

function Security() {
  const [summary, setSummary] = useState(null);
  const [logs, setLogs] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [piiModalEventId, setPiiModalEventId] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [range, setRange] = useState("all");

  useEffect(() => {
    getOrganizations().then((r) => setOrgs(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedOrg) {
      getProjects(selectedOrg).then((r) => setProjects(r.data || [])).catch(() => setProjects([]));
    } else {
      setProjects([]);
      setSelectedProject("");
    }
  }, [selectedOrg]);

  useEffect(() => {
    const load = async () => {
      const startDate = rangeToStartDateS(range);
      const org = selectedOrg || undefined;
      const proj = selectedProject || undefined;
      const [summaryRes, logsRes, anomaliesRes] = await Promise.all([
        getSecuritySummaryCombined(org, proj, startDate),
        getSecurityLogsCombined(undefined, undefined, org, proj, startDate),
        getAnomaliesCombined("open", org, proj, startDate),
      ]);
      setSummary(summaryRes.data);
      setLogs(logsRes.data || []);
      setAnomalies(anomaliesRes.data || []);
      setLoading(false);
    };

    load().catch(() => setLoading(false));
  }, [range, selectedOrg, selectedProject]);

  if (loading) {
    return <div className="loading">Loading security layer...</div>;
  }

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <h2>Security monitoring for risky prompts, PII exposure, and misuse patterns.</h2>
          <p>
            Risk scores are attached to each event, with anomaly and misuse detection
            feeding the alerting and governance layers automatically.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <select
              value={selectedOrg}
              onChange={(e) => { setSelectedOrg(e.target.value); setSelectedProject(""); }}
              style={{ fontSize: 13, padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.15)", color: "#fff", minWidth: 160 }}
            >
              <option value="" style={{ color: "#333" }}>All Organizations</option>
              {orgs.map((o) => <option key={o.id} value={o.id} style={{ color: "#333" }}>{o.org_name || o.id}</option>)}
            </select>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              disabled={!selectedOrg}
              style={{ fontSize: 13, padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.15)", color: "#fff", minWidth: 160, opacity: selectedOrg ? 1 : 0.5 }}
            >
              <option value="" style={{ color: "#333" }}>All Projects</option>
              {projects.map((p) => <option key={p.id} value={p.id} style={{ color: "#333" }}>{p.project_name || p.id}</option>)}
            </select>
          </div>
          <div className="action-row" style={{ marginTop: 12 }}>
            {RANGE_OPTIONS_S.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`btn ${range === opt.value ? "btn-primary" : "btn-ghost"}`}
                style={
                  range === opt.value
                    ? { background: "#fff", color: "#9E2A97", fontWeight: 600 }
                    : { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.92)", border: "1px solid rgba(255,255,255,0.25)" }
                }
                onClick={() => setRange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h2>Security Snapshot</h2>
              <p>Current state of risk, violations, and abnormal activity.</p>
            </div>
          </div>

          <div className="mini-grid">
            <div className="list-item">
              <strong>Total Security Events</strong>
              <div className="list-meta">{summary?.total_events || 0}</div>
            </div>
            <div className="list-item">
              <strong>PII Detections</strong>
              <div className="list-meta">{summary?.total_with_pii || 0}</div>
            </div>
            <div className="list-item">
              <strong>Misuse Patterns</strong>
              <div className="list-meta">{summary?.misuse_events || 0}</div>
            </div>
            <div className="list-item">
              <strong>Data Out Violations</strong>
              <div className="list-meta">{summary?.data_out_events || 0}</div>
            </div>
            <div className="list-item">
              <strong>Average Risk</strong>
              <div className="list-meta">{Number(summary?.average_risk_score || 0).toFixed(1)}</div>
            </div>
            <div className="list-item">
              <strong>Highest Risk</strong>
              <div className="list-meta">{Number(summary?.highest_risk_score || 0).toFixed(1)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Open Anomalies</h3>
              <p>Usage spikes and suspicious changes identified by background detection.</p>
            </div>
          </div>
          <div className="list-grid">
            {anomalies.length ? (
              anomalies.map((item) => (
                <div key={item.id} className="list-item">
                  <strong>{item.anomaly_type}</strong>
                  <div className="list-meta">
                    <span className={`status-pill ${item.severity}`}>{item.severity}</span>
                    {"  "} {item.message}
                  </div>
                  <div className="list-meta" style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 4 }}>
                    Org: <strong>{item.org_name || item.org_id || "—"}</strong>
                    {" · "}Project: <strong>{item.project_name || item.project_id || "—"}</strong>
                    {" · "}Tool: <strong>{item.tool_name || "—"}</strong>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">No open anomalies.</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Security Logs</h3>
              <p>Event-level records for PII, data out, misuse, and masking decisions.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>PII</th>
                  <th>Type</th>
                  <th>Data Out</th>
                  <th>Misuse</th>
                  <th>Spike</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((item) => {
                  const isPII = !!item.pii_detected;
                  return (
                    <tr
                      key={item.id}
                      onClick={isPII ? () => setPiiModalEventId(item.event_id) : undefined}
                      style={isPII ? { cursor: "pointer", background: "rgba(239,68,68,0.04)" } : undefined}
                      title={isPII ? "Click to view org/project/model detail" : undefined}
                    >
                      <td style={{ fontFamily: "monospace", fontSize: 11 }}>{item.event_id}</td>
                      <td>
                        {isPII ? (
                          <span style={{ color: "#ef4444", fontWeight: 600, textDecoration: "underline dotted", cursor: "pointer" }}>yes</span>
                        ) : "no"}
                      </td>
                      <td>{item.pii_type || "-"}</td>
                      <td>{item.data_out_violation ? "yes" : "no"}</td>
                      <td>{item.misuse_pattern_detected ? "yes" : "no"}</td>
                      <td>{item.abnormal_usage_spike ? "yes" : "no"}</td>
                      <td>{Number(item.risk_score || 0).toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {piiModalEventId && (
        <SecurityPIIModal
          eventId={piiModalEventId}
          onClose={() => setPiiModalEventId(null)}
        />
      )}
    </div>
  );
}

export default Security;
