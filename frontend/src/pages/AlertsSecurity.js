import React, { useEffect, useState } from "react";
import {
  getAlertsSecurity,
  getAnomaliesCombined,
  getSecurityLogsCombined,
  getSecuritySummaryCombined,
  resolveAlertCombined,
  getControlQuota,
  getOrganizations,
  getProjects,
  getNotificationStatus,
  getAdminPIIDetail,
} from "../api";
import { rangeToStartDate } from "../utils/filters";

function QuotaBar({ pct, forecast }) {
  const safe = Math.min(Number(pct || 0), 100);
  const fcSafe = Math.min(Number(forecast || 0), 100);
  const color = safe >= 100 ? "#c0392b" : safe >= 90 ? "#e67e22" : safe >= 80 ? "#f39c12" : "#27ae60";
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: "var(--gray-500)" }}>Used {safe.toFixed(1)}%</span>
        {forecast !== null && forecast !== undefined && (
          <span style={{ color: fcSafe >= 100 ? "#c0392b" : "var(--gray-500)" }}>
            Forecast {fcSafe.toFixed(1)}%
          </span>
        )}
      </div>
      <div style={{ background: "var(--gray-100)", borderRadius: 6, height: 8, position: "relative", overflow: "hidden" }}>
        <div style={{ width: `${safe}%`, height: "100%", background: color, borderRadius: 6, transition: "width 0.4s" }} />
        {forecast !== null && forecast !== undefined && fcSafe > safe && (
          <div
            style={{
              position: "absolute", top: 0, left: `${safe}%`, width: `${Math.min(fcSafe - safe, 100 - safe)}%`,
              height: "100%", background: "rgba(231,76,60,0.25)", borderRight: "2px dashed #e74c3c",
            }}
          />
        )}
      </div>
    </div>
  );
}

const RISK_COLOR = (score) => {
  if (score >= 80) return "#ef4444";
  if (score >= 60) return "#f97316";
  if (score >= 30) return "#eab308";
  return "#22c55e";
};

function DetailRow({ label, value, valueStyle }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border, #f0f0f0)" }}>
      <span style={{ fontSize: 12, color: "var(--gray-500)", minWidth: 160, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, ...valueStyle }}>{value ?? "—"}</span>
    </div>
  );
}

function PBarInline({ pct }) {
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
              <DetailRow label="Organization" value={`${detail.org_name}${detail.org_id !== detail.org_name ? ` (${detail.org_id})` : ""}`} />
              <DetailRow label="Project" value={detail.project_name ? `${detail.project_name}${detail.project_id !== detail.project_name ? ` (${detail.project_id})` : ""}` : detail.project_id} />
              {detail.project_environment && <DetailRow label="Environment" value={detail.project_environment} />}
              <DetailRow label="Model / Tool" value={detail.model_name} />
              <DetailRow label="Provider" value={detail.provider} />
              <DetailRow label="Service Type" value={detail.service_type} />
              <DetailRow label="Status" value={detail.status} />
              <DetailRow label="Timestamp" value={detail.created_at ? new Date(detail.created_at).toLocaleString() : null} />
            </section>

            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>PII Detection</h4>
              <DetailRow label="PII Detected" value={detail.pii_detected ? "Yes" : "No"} valueStyle={{ color: detail.pii_detected ? "#ef4444" : "#22c55e" }} />
              {detail.pii_type && <DetailRow label="PII Type" value={detail.pii_type} valueStyle={{ fontFamily: "monospace", background: "#fef9c3", padding: "1px 6px", borderRadius: 4 }} />}
              <DetailRow label="Risk Score" value={
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: RISK_COLOR(detail.risk_score), flexShrink: 0 }} />
                  {detail.risk_score?.toFixed(1)} — {detail.risk_label}
                </span>
              } />
              <DetailRow label="Misuse Pattern" value={detail.misuse_pattern_detected ? "Detected" : "None"} valueStyle={{ color: detail.misuse_pattern_detected ? "#ef4444" : undefined }} />
              <DetailRow label="Data Out Violation" value={detail.data_out_violation ? "Yes" : "No"} valueStyle={{ color: detail.data_out_violation ? "#ef4444" : undefined }} />
              <DetailRow label="Abnormal Spike" value={detail.abnormal_usage_spike ? "Yes" : "No"} valueStyle={{ color: detail.abnormal_usage_spike ? "#f97316" : undefined }} />
              <DetailRow label="Masking Applied" value={detail.masking_applied ? "Yes" : "No"} valueStyle={{ color: detail.masking_applied ? "#22c55e" : "var(--gray-500)" }} />
            </section>

            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>Usage Metrics</h4>
              <DetailRow label="Prompt Tokens" value={Number(detail.prompt_tokens || 0).toLocaleString()} />
              <DetailRow label="Completion Tokens" value={Number(detail.completion_tokens || 0).toLocaleString()} />
              <DetailRow label="Total Tokens" value={Number(detail.total_tokens || 0).toLocaleString()} />
              <DetailRow label="Total Cost" value={`$${Number(detail.total_cost || 0).toFixed(4)}`} />
              <DetailRow label="Latency" value={`${Number(detail.latency_ms || 0).toLocaleString()} ms`} />
              <DetailRow label="Data In" value={`${Number(detail.data_in_mb || 0).toFixed(3)} MB`} />
              <DetailRow label="Data Out" value={`${Number(detail.data_out_mb || 0).toFixed(3)} MB`} />
              <DetailRow label="Token Limit (daily)" value={detail.token_limit !== null ? Number(detail.token_limit).toLocaleString() : "No limit configured"} />
              {detail.token_limit !== null && (
                <DetailRow label="Remaining Tokens" value={
                  <span className={`status-pill ${tokenStatusClass}`}>
                    {detail.remaining_tokens < 0 ? `-${Number(Math.abs(detail.remaining_tokens)).toLocaleString()}` : Number(detail.remaining_tokens).toLocaleString()}
                  </span>
                } />
              )}
              {detail.usage_pct !== null && (
                <div style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border,#f0f0f0)" }}>
                  <span style={{ fontSize: 12, color: "var(--gray-500)", minWidth: 160, flexShrink: 0 }}>Token Usage</span>
                  <div style={{ flex: 1 }}><PBarInline pct={detail.usage_pct} /></div>
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
                      <span style={{ fontSize: 11, color: "var(--gray-400)", marginLeft: "auto" }}>score: {a.anomaly_score?.toFixed(2)}</span>
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

function AlertsSecurity() {
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [alertFilter, setAlertFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [activeModal, setActiveModal] = useState(null);
  const [piiModalEventId, setPiiModalEventId] = useState(null);
  const [quotaList, setQuotaList] = useState([]);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [notifStatus, setNotifStatus] = useState(null);
  const [tokenPopupDismissed, setTokenPopupDismissed] = useState(false);
  const [orgs, setOrgs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [range, setRange] = useState("all");

  const load = async () => {
    setLoading(true);
    const org = selectedOrg || undefined;
    const proj = selectedProject || undefined;
    const startDate = rangeToStartDate(range);
    try {
      const [summaryRes, alertsRes, logsRes, anomaliesRes] = await Promise.all([
        getSecuritySummaryCombined(org, proj, startDate),
        getAlertsSecurity(alertFilter === "all" ? undefined : alertFilter, org, proj, startDate),
        getSecurityLogsCombined(undefined, undefined, org, proj, startDate),
        getAnomaliesCombined("open", org, proj, startDate),
      ]);
      setSummary(summaryRes.data);
      setAlerts(alertsRes.data || []);
      setLogs(logsRes.data || []);
      setAnomalies(anomaliesRes.data || []);
    } finally {
      setLoading(false);
    }
  };

  const loadQuotas = async () => {
    setQuotaLoading(true);
    try {
      const orgsRes = await getOrganizations();
      const orgs = orgsRes.data || [];
      const quotas = await Promise.all(
        orgs.map((o) =>
          getControlQuota(o.id).then((r) => ({ org: o.org_name || o.id, ...r.data })).catch(() => null)
        )
      );
      setQuotaList(quotas.filter(Boolean));
    } catch {
      setQuotaList([]);
    } finally {
      setQuotaLoading(false);
    }
  };

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
    load();
    loadQuotas();
    getNotificationStatus().then((r) => setNotifStatus(r.data)).catch(() => {});
  }, [alertFilter, selectedOrg, selectedProject, range]);

  const handleResolve = async (id) => {
    await resolveAlertCombined(id);
    setMessage(`Alert ${id} resolved.`);
    await load();
  };

  if (loading) return <div className="loading">Loading alerts &amp; security…</div>;

  const criticalQuotas = quotaList.filter(
    (q) => Number(q.usage_percent || 0) >= 80 || Number(q.token_quota_percent || 0) >= 80
  );

  return (
    <div className="page-shell">
      {/* ── Token Exhaustion Popup Banner ── */}
      {!tokenPopupDismissed && criticalQuotas.length > 0 && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 9999,
          background: "#fff3cd", border: "2px solid #e67e22",
          borderRadius: 12, padding: "14px 18px", maxWidth: 380,
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#92400e", marginBottom: 6 }}>
                Token / Budget Limit Warning
              </div>
              {criticalQuotas.map((q) => {
                const costPct = Number(q.usage_percent || 0);
                const tokPct = Number(q.token_quota_percent || 0);
                return (
                  <div key={q.org_id} style={{ fontSize: 13, color: "#78350f", marginBottom: 4 }}>
                    <strong>{q.org}</strong>
                    {costPct >= 80 && (
                      <span style={{ marginLeft: 6, background: costPct >= 100 ? "#fee2e2" : "#fef3c7", color: costPct >= 100 ? "#991b1b" : "#92400e", borderRadius: 6, padding: "1px 7px", fontSize: 11 }}>
                        Budget {costPct.toFixed(0)}%
                      </span>
                    )}
                    {tokPct >= 80 && (
                      <span style={{ marginLeft: 4, background: tokPct >= 100 ? "#fee2e2" : "#fef3c7", color: tokPct >= 100 ? "#991b1b" : "#92400e", borderRadius: 6, padding: "1px 7px", fontSize: 11 }}>
                        Tokens {tokPct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                );
              })}
              <div style={{ fontSize: 12, color: "#92400e", marginTop: 6 }}>
                Alerts dispatched via configured channels.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTokenPopupDismissed(true)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#92400e", fontSize: 18, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Header + Snapshot ── */}
      <section className="panel" style={{ padding: "18px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Alerts &amp; Security</h2>
            <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 14 }}>
              Token quota monitoring, budget forecasting, governance alerts, and security signals.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <select
                value={selectedOrg}
                onChange={(e) => { setSelectedOrg(e.target.value); setSelectedProject(""); }}
                style={{ fontSize: 13, padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border,#ddd)", background: "#fff", minWidth: 160 }}
              >
                <option value="">All Organizations</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.org_name || o.id}</option>)}
              </select>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                disabled={!selectedOrg}
                style={{ fontSize: 13, padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border,#ddd)", background: "#fff", minWidth: 160, opacity: selectedOrg ? 1 : 0.5 }}
              >
                <option value="">All Projects</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name || p.id}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {[
                { value: "all", label: "All Time" },
                { value: "today", label: "Today" },
                { value: "7d", label: "Last 7 Days" },
                { value: "30d", label: "Last 30 Days" },
                { value: "90d", label: "Last 90 Days" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`btn ${range === opt.value ? "btn-primary" : "btn-ghost"}`}
                  style={{ fontSize: 12, padding: "4px 10px" }}
                  onClick={() => setRange(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="pill-row" style={{ gap: 10, flexWrap: "wrap" }}>
            {[
              { id: "alerts", label: "Active Alerts", value: summary?.active_alerts || 0 },
              { id: "anomalies", label: "Anomalies", value: summary?.open_anomalies || 0 },
              { id: "pii", label: "PII", value: summary?.total_with_pii || 0 },
              { id: "misuse", label: "Misuse", value: summary?.misuse_events || 0 },
              { id: "dataout", label: "Data Out", value: summary?.data_out_events || 0 },
            ].map((pill) => (
              <button key={pill.id} type="button" className="pill pill-btn" onClick={() => setActiveModal(pill.id)}>
                {pill.label} <span className="highlight">{pill.value}</span>
              </button>
            ))}
            <button type="button" className="pill pill-btn" onClick={() => setActiveModal("risk")}>
              Risk <span className="highlight">
                {Number(summary?.average_risk_score || 0).toFixed(1)} / {Number(summary?.highest_risk_score || 0).toFixed(1)}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* ══════════ TOKEN QUOTA & BUDGET SECTION ══════════ */}
      <section className="panel">
        <div className="section-head" style={{ alignItems: "center" }}>
          <h3 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", margin: 0 }}>
            Token Quota &amp; Budget Status
          </h3>
          <button type="button" className="btn btn-ghost" onClick={loadQuotas} disabled={quotaLoading}>
            {quotaLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {quotaLoading ? (
          <div className="empty-state">Loading quota data…</div>
        ) : quotaList.length === 0 ? (
          <div className="empty-state">No organizations with budget config found.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16, marginTop: 8 }}>
            {quotaList.map((q) => {
              const willExceed = q.will_exceed_budget;
              const usagePct = Number(q.usage_percent || 0);
              const forecastPct = Number(q.forecast_usage_percent || 0);
              const tokenPct = Number(q.token_quota_percent || 0);
              const borderColor = willExceed ? "#e74c3c" : usagePct >= 90 ? "#e67e22" : "rgba(124,112,174,0.18)";

              return (
                <div
                  key={q.org_id}
                  style={{
                    background: "#fff",
                    border: `1px solid ${borderColor}`,
                    borderRadius: 10,
                    padding: 18,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em" }}>{q.org}</div>
                    {willExceed && (
                      <span className="status-pill critical" style={{ fontSize: 11, fontWeight: 700 }}>Overrun Risk</span>
                    )}
                    {!willExceed && usagePct >= 90 && (
                      <span className="status-pill high" style={{ fontSize: 11, fontWeight: 700 }}>Near Limit</span>
                    )}
                  </div>

                  {/* Cost budget bar */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                      <span style={{ fontWeight: 700 }}>Cost Budget</span>
                      <span style={{ fontWeight: 600, color: "var(--gray-700)" }}>
                        ${Number(q.month_cost || 0).toFixed(2)} / ${Number(q.budget_limit || 0).toFixed(2)}
                      </span>
                    </div>
                    <QuotaBar pct={usagePct} forecast={forecastPct} />
                  </div>

                  {/* Token quota bar */}
                  {q.token_quota_daily && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700 }}>Daily Token Quota</span>
                        <span style={{ fontWeight: 600, color: "var(--gray-700)" }}>
                          {(q.token_quota_used_today || 0).toLocaleString()} / {(q.token_quota_daily || 0).toLocaleString()}
                        </span>
                      </div>
                      <QuotaBar pct={tokenPct} forecast={null} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ══════════ ALERTS TABLE ══════════ */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Alerts</h3>
            <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
              Triggered by budget thresholds, token quotas, anomalies, and security signals.
            </p>
          </div>
          <div className="action-row">
            {["active", "resolved", "all"].map((f) => (
              <button
                key={f}
                type="button"
                className={`btn ${alertFilter === f ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setAlertFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {message && <div className="feedback-msg" style={{ marginBottom: 12 }}>{message}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Org</th>
                <th>Project</th>
                <th>Message</th>
                <th>Threshold</th>
                <th>Actual</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", color: "var(--gray-500)" }}>No alerts.</td>
                </tr>
              )}
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td><code style={{ fontSize: 11 }}>{a.alert_type}</code></td>
                  <td><span className={`status-pill ${a.severity}`}>{a.severity}</span></td>
                  <td style={{ fontSize: 12, color: "var(--gray-600)" }}>{a.org_id || "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--gray-600)" }}>{a.project_id || "—"}</td>
                  <td style={{ maxWidth: 300 }}>{a.message}</td>
                  <td>{a.threshold_value ?? "—"}</td>
                  <td>{a.actual_value ?? "—"}</td>
                  <td><span className={`status-pill ${a.status}`}>{a.status}</span></td>
                  <td>
                    {a.status === "active" ? (
                      <button type="button" className="btn btn-secondary" onClick={() => handleResolve(a.id)}>
                        Resolve
                      </button>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ══════════ ANOMALIES + SECURITY LOGS ══════════ */}
      <section className="two-column">
        <div className="panel">
          <div className="section-head">
            <div>
              <h3>
                Open Anomalies{" "}
                {anomalies.length > 0 && (
                  <span className="status-pill open" style={{ fontSize: 11, padding: "3px 9px", verticalAlign: "middle" }}>
                    {anomalies.length}
                  </span>
                )}
              </h3>
              <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                Usage spikes and cost anomalies from velocity analysis.
              </p>
            </div>
          </div>
          <div className="list-grid">
            {anomalies.length ? (
              anomalies.map((item) => (
                <div key={item.id} className="list-item">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <strong>{item.anomaly_type}</strong>
                    <span style={{ fontSize: 11, color: "var(--gray-400)" }}>
                      {item.org_id}{item.project_id ? ` / ${item.project_id}` : ""}
                    </span>
                  </div>
                  <div className="list-meta">
                    <span className={`status-pill ${item.severity}`}>{item.severity}</span>
                    {"  "}{item.message}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">No open anomalies.</div>
            )}
          </div>
        </div>

      </section>

      {/* ══════════ NOTIFICATION CHANNELS ══════════ */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Notification Channels</h3>
            <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
              When usage approaches limits, alerts are dispatched via these channels.
              Email and WhatsApp fire for <strong>critical</strong> and <strong>high</strong> severity only.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {/* Dashboard channel — always active */}
          <div className="panel" style={{ background: "var(--gray-50)", border: "1px solid #27ae60", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Dashboard</div>
                <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>Real-time alerts in this UI</div>
              </div>
              <span className="status-pill success" style={{ fontSize: 11 }}>Active</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--gray-600)" }}>
              All severities visible here — critical, high, medium, low.
              No configuration required.
            </div>
          </div>

          {/* Email channel */}
          {notifStatus ? (
            <div className="panel" style={{
              background: "var(--gray-50)",
              border: `1px solid ${notifStatus.channels.email.enabled ? "#27ae60" : "rgba(124,112,174,0.2)"}`,
              padding: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Email (SMTP)</div>
                  <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>
                    {notifStatus.channels.email.enabled
                      ? `${notifStatus.channels.email.recipients} recipient(s) configured`
                      : "Not configured"}
                  </div>
                </div>
                <span className={`status-pill ${notifStatus.channels.email.enabled ? "success" : "warning"}`} style={{ fontSize: 11 }}>
                  {notifStatus.channels.email.enabled ? "Active" : "Inactive"}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 8 }}>
                {notifStatus.channels.email.description}
              </div>
              {!notifStatus.channels.email.enabled && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 12, cursor: "pointer", color: "var(--gray-500)", fontWeight: 600 }}>
                    Required env vars
                  </summary>
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                    {notifStatus.channels.email.config_vars.map((v) => (
                      <code key={v} style={{ fontSize: 11, background: "var(--gray-100)", padding: "2px 6px", borderRadius: 4 }}>{v}</code>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ) : (
            <div className="panel" style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.2)", padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Email (SMTP)</div>
              <div style={{ fontSize: 13, color: "var(--gray-400)" }}>Loading channel status…</div>
            </div>
          )}

          {/* WhatsApp channel */}
          {notifStatus ? (
            <div className="panel" style={{
              background: "var(--gray-50)",
              border: `1px solid ${notifStatus.channels.whatsapp.enabled ? "#27ae60" : "rgba(124,112,174,0.2)"}`,
              padding: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>WhatsApp (Twilio)</div>
                  <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>
                    {notifStatus.channels.whatsapp.enabled
                      ? `${notifStatus.channels.whatsapp.recipients} recipient(s) configured`
                      : "Not configured"}
                  </div>
                </div>
                <span className={`status-pill ${notifStatus.channels.whatsapp.enabled ? "success" : "warning"}`} style={{ fontSize: 11 }}>
                  {notifStatus.channels.whatsapp.enabled ? "Active" : "Inactive"}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 8 }}>
                {notifStatus.channels.whatsapp.description}
              </div>
              {!notifStatus.channels.whatsapp.enabled && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 12, cursor: "pointer", color: "var(--gray-500)", fontWeight: 600 }}>
                    Required env vars
                  </summary>
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                    {notifStatus.channels.whatsapp.config_vars.map((v) => (
                      <code key={v} style={{ fontSize: 11, background: "var(--gray-100)", padding: "2px 6px", borderRadius: 4 }}>{v}</code>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ) : (
            <div className="panel" style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.2)", padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>WhatsApp (Twilio)</div>
              <div style={{ fontSize: 13, color: "var(--gray-400)" }}>Loading channel status…</div>
            </div>
          )}

          {/* Microsoft Teams channel */}
          {notifStatus ? (
            <div className="panel" style={{
              background: "var(--gray-50)",
              border: `1px solid ${notifStatus.channels.teams.enabled ? "#27ae60" : "rgba(124,112,174,0.2)"}`,
              padding: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Microsoft Teams</div>
                  <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>
                    {notifStatus.channels.teams.enabled
                      ? `${notifStatus.channels.teams.webhooks} webhook(s) configured`
                      : "Not configured"}
                  </div>
                </div>
                <span className={`status-pill ${notifStatus.channels.teams.enabled ? "success" : "warning"}`} style={{ fontSize: 11 }}>
                  {notifStatus.channels.teams.enabled ? "Active" : "Inactive"}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 8 }}>
                {notifStatus.channels.teams.description}
              </div>
              {!notifStatus.channels.teams.enabled && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 12, cursor: "pointer", color: "var(--gray-500)", fontWeight: 600 }}>
                    Required env vars
                  </summary>
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                    {notifStatus.channels.teams.config_vars.map((v) => (
                      <code key={v} style={{ fontSize: 11, background: "var(--gray-100)", padding: "2px 6px", borderRadius: 4 }}>{v}</code>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 6 }}>
                    Comma-separate multiple webhook URLs to notify multiple channels.
                  </div>
                </details>
              )}
            </div>
          ) : (
            <div className="panel" style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.2)", padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Microsoft Teams</div>
              <div style={{ fontSize: 13, color: "var(--gray-400)" }}>Loading channel status…</div>
            </div>
          )}
        </div>

        {notifStatus && (
          <p style={{ fontSize: 12, color: "var(--gray-400)", marginTop: 12, marginBottom: 0 }}>
            {notifStatus.note}
          </p>
        )}
      </section>

      {/* ══════════ MODALS ══════════ */}
      {activeModal && (() => {
        const piiLogs = logs.filter((l) => l.pii_detected);
        const misuseLogs = logs.filter((l) => l.misuse_pattern_detected);
        const dataOutLogs = logs.filter((l) => l.data_out_violation);

        const modalTitles = {
          alerts: `Active Alerts · ${summary?.active_alerts || 0}`,
          anomalies: `Open Anomalies · ${summary?.open_anomalies || 0}`,
          pii: `PII Detections · ${summary?.total_with_pii || 0}`,
          misuse: `Misuse Events · ${summary?.misuse_events || 0}`,
          dataout: `Data-Out Violations · ${summary?.data_out_events || 0}`,
          risk: "Risk Summary",
        };

        const LogTable = ({ rows, emptyMsg }) =>
          rows.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Org</th><th>Project</th><th>Model</th><th>Event</th><th>PII</th><th>Type</th><th>Data Out</th><th>Misuse</th><th>Spike</th><th>Risk</th></tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const score = Number(item.risk_score || 0);
                    const cls = score >= 7 ? "risk-high" : score >= 4 ? "risk-med" : "risk-low";
                    const isPII = !!item.pii_detected;
                    return (
                      <tr
                        key={item.id}
                        onClick={isPII ? () => setPiiModalEventId(item.event_id) : undefined}
                        style={isPII ? { cursor: "pointer", background: "rgba(239,68,68,0.04)" } : undefined}
                        title={isPII ? "Click to view PII detection detail" : undefined}
                      >
                        <td style={{ fontSize: 12 }}>{item.org_name || item.org_id || "—"}</td>
                        <td title={item.project_id || ""}>{item.project_name || item.project_id || "—"}</td>
                        <td><strong>{item.model_name || "—"}</strong></td>
                        <td style={{ fontFamily: "monospace", fontSize: 11 }}>{item.event_id}</td>
                        <td>
                          {isPII ? (
                            <span className="badge-yes" style={{ textDecoration: "underline dotted", cursor: "pointer" }} title="Click row to view org/project details">
                              Yes{item.pii_type ? ` · ${item.pii_type}` : ""}
                            </span>
                          ) : (
                            <span className="badge-no">—</span>
                          )}
                        </td>
                        <td>{item.pii_type || "—"}</td>
                        <td><span className={item.data_out_violation ? "badge-yes" : "badge-no"}>{item.data_out_violation ? "Yes" : "—"}</span></td>
                        <td><span className={item.misuse_pattern_detected ? "badge-yes" : "badge-no"}>{item.misuse_pattern_detected ? "Yes" : "—"}</span></td>
                        <td><span className={item.abnormal_usage_spike ? "badge-yes" : "badge-no"}>{item.abnormal_usage_spike ? "Yes" : "—"}</span></td>
                        <td><span className={cls}>{score.toFixed(1)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state">{emptyMsg}</div>;

        return (
          <div className="modal-backdrop metric-modal-backdrop" onClick={() => setActiveModal(null)}>
            <div className="modal-dialog metric-modal" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <div className="metric-eyebrow">Alerts &amp; Security</div>
                  <h3 style={{ marginTop: 8 }}>{modalTitles[activeModal]}</h3>
                </div>
                <button type="button" className="btn-close" onClick={() => setActiveModal(null)}>×</button>
              </div>

              {activeModal === "alerts" && (
                alerts.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Type</th><th>Severity</th><th>Org</th><th>Project</th><th>Tool / Model</th><th>Message</th><th>Threshold</th><th>Actual</th><th>Status</th></tr></thead>
                      <tbody>
                        {alerts.map((a) => (
                          <tr key={a.id}>
                            <td><code style={{ fontSize: 11 }}>{a.alert_type}</code></td>
                            <td><span className={`status-pill ${a.severity}`}>{a.severity}</span></td>
                            <td style={{ fontSize: 12, color: "var(--gray-600)" }} title={a.org_id || ""}>
                              {a.org_name || a.org_id || "—"}
                            </td>
                            <td style={{ fontSize: 12, color: "var(--gray-600)" }} title={a.project_id || ""}>
                              {a.project_name || a.project_id || "—"}
                            </td>
                            <td style={{ fontSize: 12 }}>
                              <strong>{a.tool_name || a.model_name || "—"}</strong>
                            </td>
                            <td style={{ maxWidth: 280 }}>{a.message}</td>
                            <td>{a.threshold_value ?? "—"}</td>
                            <td>{a.actual_value ?? "—"}</td>
                            <td><span className={`status-pill ${a.status}`}>{a.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="empty-state">No alerts.</div>
              )}
              {activeModal === "anomalies" && (
                anomalies.length ? (
                  <div className="list-grid">
                    {anomalies.map((item) => (
                      <div key={item.id} className="list-item">
                        <strong>{item.anomaly_type}</strong>
                        <div className="list-meta">
                          <span className={`status-pill ${item.severity}`}>{item.severity}</span>{"  "}{item.message}
                        </div>
                        <div className="list-meta" style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 4 }}>
                          Org: <strong>{item.org_name || item.org_id || "—"}</strong>
                          {" · "}Project: <strong>{item.project_name || item.project_id || "—"}</strong>
                          {" · "}Tool: <strong>{item.tool_name || "—"}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="empty-state">No open anomalies.</div>
              )}
              {activeModal === "pii" && <LogTable rows={piiLogs} emptyMsg="No PII detections." />}
              {activeModal === "misuse" && <LogTable rows={misuseLogs} emptyMsg="No misuse events." />}
              {activeModal === "dataout" && <LogTable rows={dataOutLogs} emptyMsg="No data-out violations." />}
              {activeModal === "risk" && (
                <>
                  <div className="metric-modal-grid" style={{ marginBottom: 18 }}>
                    {[
                      ["Avg Risk Score", Number(summary?.average_risk_score || 0).toFixed(1)],
                      ["Highest Risk Score", Number(summary?.highest_risk_score || 0).toFixed(1)],
                      ["Low Risk", `${logs.filter((l) => Number(l.risk_score || 0) < 4).length} events`],
                      ["Medium Risk", `${logs.filter((l) => { const s = Number(l.risk_score || 0); return s >= 4 && s < 7; }).length} events`],
                      ["High Risk", `${logs.filter((l) => Number(l.risk_score || 0) >= 7).length} events`],
                      ["Total Scored", logs.length],
                    ].map(([label, val]) => (
                      <div key={label} className="tool-cost-chip"><strong>{label}</strong><div>{val}</div></div>
                    ))}
                  </div>
                  {logs.length > 0 && (
                    <LogTable
                      rows={[...logs].sort((a, b) => Number(b.risk_score || 0) - Number(a.risk_score || 0))}
                      emptyMsg="No logs."
                    />
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {piiModalEventId && (
        <PIIDetailModal
          eventId={piiModalEventId}
          onClose={() => setPiiModalEventId(null)}
        />
      )}
    </div>
  );
}

export default AlertsSecurity;
