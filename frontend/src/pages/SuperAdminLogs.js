import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getAdminPIIDetail,
  getLookupEventStatuses,
  getLookupProviders,
  getSuperAdminAggregate,
  getSuperAdminInsights,
  getSuperAdminLogs,
  getToolsUsage,
  getTracingOrgs,
} from "../api";
import { RANGE_OPTIONS, rangeToStartDate } from "../utils/filters";

const money = (v) => `$${Number(v || 0).toFixed(4)}`;
const num = (v) => Number(v || 0).toLocaleString();

const SEV_CLASS = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

const SEV_LABEL = {
  token_limit_exhausted: "Token Exhausted",
  token_limit_approaching: "Token Limit",
  cost_threshold_exceeded: "Budget Exceeded",
  cost_threshold_approaching: "Budget Alert",
  abnormal_usage: "Anomaly",
  governance_alert: "Alert",
};

const RISK_COLOR = (score) => {
  if (score >= 80) return "#ef4444";
  if (score >= 60) return "#f97316";
  if (score >= 30) return "#eab308";
  return "#22c55e";
};

function NotificationBanner({ notifications, onDismiss, onOrgClick }) {
  if (!notifications || notifications.length === 0) return null;

  const critical = notifications.filter((n) => n.severity === "critical");
  const high = notifications.filter((n) => n.severity === "high");
  const rest = notifications.filter(
    (n) => n.severity !== "critical" && n.severity !== "high",
  );
  const ordered = [...critical, ...high, ...rest];

  return (
    <div className="panel" style={{ borderLeft: "4px solid var(--red-500, #ef4444)" }}>
      <div className="section-head">
        <div>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Real-Time Governance Notifications</span>
            {critical.length > 0 && (
              <span className="status-pill critical">{critical.length} critical</span>
            )}
            {high.length > 0 && (
              <span className="status-pill high">{high.length} high</span>
            )}
          </h3>
          <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
            Live alerts for token limits, cost thresholds, and abnormal usage — auto-refreshed every 30 s.
          </p>
        </div>
        {onDismiss && (
          <button className="btn btn-ghost" onClick={onDismiss} style={{ alignSelf: "flex-start" }}>
            Dismiss all
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {ordered.map((n, i) => {
          const ctxBits = [];
          if (n.project_name || n.project_id) {
            ctxBits.push(`Project: ${n.project_name || n.project_id}`);
          }
          if (n.tool_name || n.model_name) {
            ctxBits.push(`Tool: ${n.tool_name || n.model_name}`);
          }
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 8,
                background: "var(--surface-2, #f8f9fa)",
                border: "1px solid var(--border, #e5e7eb)",
              }}
            >
              <span className={`status-pill ${SEV_CLASS[n.severity] || ""}`} style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                {SEV_LABEL[n.type] || n.type}
              </span>
              <span style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>
                {n.message}
                {ctxBits.length > 0 && (
                  <span style={{ display: "block", fontSize: 11, color: "var(--gray-500)", marginTop: 2 }}>
                    {ctxBits.join(" · ")}
                  </span>
                )}
              </span>
              {n.org_id && onOrgClick ? (
                <button
                  type="button"
                  onClick={() => onOrgClick(n.org_id)}
                  title="View organization details"
                  style={{
                    fontSize: 11,
                    color: "var(--brand-primary, #6366f1)",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    fontWeight: 600,
                    textDecoration: "underline",
                  }}
                >
                  {n.org_name || n.org_id}
                </button>
              ) : (
                <span style={{ fontSize: 11, color: "var(--gray-400)", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {n.org_name || n.org_id}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TokenBar({ pct }) {
  const color =
    pct >= 100
      ? "var(--red-500, #ef4444)"
      : pct >= 90
        ? "var(--orange-500, #f97316)"
        : pct >= 75
          ? "var(--yellow-500, #eab308)"
          : "var(--green-500, #22c55e)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: "var(--border, #e5e7eb)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(pct, 100)}%`,
            height: "100%",
            background: color,
            borderRadius: 3,
            transition: "width 0.3s",
          }}
        />
      </div>
      <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", minWidth: 38 }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function DetailRow({ label, value, valueStyle }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border, #f0f0f0)" }}>
      <span style={{ fontSize: 12, color: "var(--gray-500)", minWidth: 160, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, ...valueStyle }}>{value ?? "—"}</span>
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
      .catch(() => setError("Failed to load PII detail. Check backend connectivity."))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (!eventId) return null;

  const tokenStatusClass =
    detail?.usage_pct >= 100
      ? "critical"
      : detail?.usage_pct >= 90
        ? "high"
        : detail?.usage_pct >= 75
          ? "medium"
          : "";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: "24px 28px",
          maxWidth: 740,
          width: "100%",
          maxHeight: "88vh",
          overflowY: "auto",
          position: "relative",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            background: "none",
            border: "none",
            fontSize: 22,
            lineHeight: 1,
            cursor: "pointer",
            color: "var(--gray-500)",
          }}
        >
          ×
        </button>

        <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>
          PII Detection — Event Detail
        </h3>
        <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--gray-500)" }}>
          {eventId}
        </p>

        {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "var(--gray-400)" }}>Loading…</div>}
        {error && <div style={{ color: "#ef4444", fontSize: 13 }}>{error}</div>}

        {detail && (
          <>
            {/* ── Context ─────────────────────────────────── */}
            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>
                Context
              </h4>
              <DetailRow label="Organization" value={`${detail.org_name}${detail.org_id !== detail.org_name ? ` (${detail.org_id})` : ""}`} />
              <DetailRow label="Project" value={detail.project_name ? `${detail.project_name}${detail.project_id !== detail.project_name ? ` (${detail.project_id})` : ""}` : detail.project_id} />
              {detail.project_environment && <DetailRow label="Environment" value={detail.project_environment} />}
              <DetailRow label="Model / Tool" value={detail.model_name} />
              <DetailRow label="Provider" value={detail.provider} />
              <DetailRow label="Service Type" value={detail.service_type} />
              <DetailRow label="Status" value={detail.status} />
              <DetailRow label="Timestamp" value={detail.created_at ? new Date(detail.created_at).toLocaleString() : null} />
            </section>

            {/* ── PII Detection ────────────────────────────── */}
            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>
                PII Detection
              </h4>
              <DetailRow
                label="PII Detected"
                value={detail.pii_detected ? "Yes" : "No"}
                valueStyle={{ color: detail.pii_detected ? "#ef4444" : "#22c55e" }}
              />
              {detail.pii_type && <DetailRow label="PII Type" value={detail.pii_type} valueStyle={{ fontFamily: "monospace", background: "#fef9c3", padding: "1px 6px", borderRadius: 4 }} />}
              <DetailRow
                label="Risk Score"
                value={
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: RISK_COLOR(detail.risk_score),
                        flexShrink: 0,
                      }}
                    />
                    {detail.risk_score?.toFixed(1)} — {detail.risk_label}
                  </span>
                }
              />
              <DetailRow label="Misuse Pattern" value={detail.misuse_pattern_detected ? "Detected" : "None"} valueStyle={{ color: detail.misuse_pattern_detected ? "#ef4444" : undefined }} />
              <DetailRow label="Data Out Violation" value={detail.data_out_violation ? "Yes" : "No"} valueStyle={{ color: detail.data_out_violation ? "#ef4444" : undefined }} />
              <DetailRow label="Abnormal Spike" value={detail.abnormal_usage_spike ? "Yes" : "No"} valueStyle={{ color: detail.abnormal_usage_spike ? "#f97316" : undefined }} />
              <DetailRow label="Masking Applied" value={detail.masking_applied ? "Yes" : "No"} valueStyle={{ color: detail.masking_applied ? "#22c55e" : "var(--gray-500)" }} />
            </section>

            {/* ── Usage Metrics ────────────────────────────── */}
            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>
                Usage Metrics
              </h4>
              <DetailRow label="Prompt Tokens" value={num(detail.prompt_tokens)} />
              <DetailRow label="Completion Tokens" value={num(detail.completion_tokens)} />
              <DetailRow label="Total Tokens" value={num(detail.total_tokens)} />
              <DetailRow label="Total Cost" value={money(detail.total_cost)} />
              <DetailRow label="Latency" value={`${num(detail.latency_ms)} ms`} />
              <DetailRow label="Data In" value={`${Number(detail.data_in_mb || 0).toFixed(3)} MB`} />
              <DetailRow label="Data Out" value={`${Number(detail.data_out_mb || 0).toFixed(3)} MB`} />
              <DetailRow
                label="Token Limit (daily)"
                value={detail.token_limit !== null ? num(detail.token_limit) : "No limit configured"}
              />
              {detail.token_limit !== null && (
                <DetailRow
                  label="Remaining Tokens"
                  value={
                    <span className={`status-pill ${tokenStatusClass}`}>
                      {detail.remaining_tokens < 0
                        ? `-${num(Math.abs(detail.remaining_tokens))}`
                        : num(detail.remaining_tokens)}
                    </span>
                  }
                />
              )}
              {detail.usage_pct !== null && (
                <div style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border, #f0f0f0)" }}>
                  <span style={{ fontSize: 12, color: "var(--gray-500)", minWidth: 160, flexShrink: 0 }}>Token Usage</span>
                  <div style={{ flex: 1 }}>
                    <TokenBar pct={detail.usage_pct} />
                  </div>
                </div>
              )}
            </section>

            {/* ── Root Cause Analysis ─────────────────────── */}
            <section style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>
                Root Cause Analysis
              </h4>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(detail.root_causes || []).map((rc, i) => (
                  <li key={i} style={{ fontSize: 13, lineHeight: 1.7, color: "var(--gray-700, #374151)" }}>{rc}</li>
                ))}
              </ul>
            </section>

            {/* ── Related Anomalies ───────────────────────── */}
            {detail.related_anomalies && detail.related_anomalies.length > 0 && (
              <section>
                <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>
                  Related Anomalies
                </h4>
                {detail.related_anomalies.map((a, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "var(--surface-2, #f8f9fa)",
                      border: "1px solid var(--border, #e5e7eb)",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span className={`status-pill ${SEV_CLASS[a.severity] || ""}`}>{a.severity}</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{a.anomaly_type}</span>
                      <span style={{ fontSize: 11, color: "var(--gray-400)", marginLeft: "auto" }}>score: {a.anomaly_score?.toFixed(2)}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--gray-600)" }}>{a.message}</p>
                    {(a.baseline_value > 0 || a.observed_value > 0) && (
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--gray-400)" }}>
                        Baseline: {a.baseline_value?.toFixed(2)} → Observed: {a.observed_value?.toFixed(2)}
                      </p>
                    )}
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

function OrgDetailModal({ orgId, notifications, aggregate, logs, onClose, onApplyFilter }) {
  if (!orgId) return null;

  const orgNotifs = (notifications || []).filter((n) => n.org_id === orgId);
  const orgAggregate = (aggregate || []).filter((a) => a.org_id === orgId);
  const orgLogs = (logs || []).filter((l) => l.org_id === orgId).slice(0, 25);

  const totalCost = orgAggregate.reduce((s, a) => s + Number(a.total_cost || 0), 0);
  const totalTokens = orgAggregate.reduce((s, a) => s + Number(a.total_tokens || 0), 0);
  const totalEvents = orgAggregate.reduce((s, a) => s + Number(a.total_events || 0), 0);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: "24px 28px",
          maxWidth: 920,
          width: "100%",
          maxHeight: "88vh",
          overflowY: "auto",
          position: "relative",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            background: "none",
            border: "none",
            fontSize: 22,
            lineHeight: 1,
            cursor: "pointer",
            color: "var(--gray-500)",
          }}
        >
          ×
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>Organization Detail</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--gray-500)", fontFamily: "monospace" }}>{orgId}</p>
          </div>
          {onApplyFilter && (
            <button type="button" className="btn btn-secondary" onClick={() => { onApplyFilter(orgId); onClose(); }}>
              Filter logs by this org
            </button>
          )}
        </div>

        {/* Summary chips */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 22 }}>
          {[
            ["Active Notifications", orgNotifs.length],
            ["Tools / Models", orgAggregate.length],
            ["Events", num(totalEvents)],
            ["Tokens", num(totalTokens)],
            ["Total Cost", `$${totalCost.toFixed(2)}`],
          ].map(([label, value]) => (
            <div key={label} style={{ background: "var(--surface-2, #f8f9fa)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
              <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Active notifications for this org */}
        <section style={{ marginBottom: 22 }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>
            Active Notifications
          </h4>
          {orgNotifs.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--gray-500)" }}>No active notifications for this organization.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {orgNotifs.map((n, i) => {
                const ctxBits = [];
                if (n.project_name || n.project_id) ctxBits.push(`Project: ${n.project_name || n.project_id}`);
                if (n.tool_name || n.model_name) ctxBits.push(`Tool: ${n.tool_name || n.model_name}`);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", background: "var(--surface-2, #f8f9fa)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 6 }}>
                    <span className={`status-pill ${SEV_CLASS[n.severity] || ""}`} style={{ flexShrink: 0 }}>
                      {SEV_LABEL[n.type] || n.type}
                    </span>
                    <span style={{ fontSize: 13, flex: 1 }}>
                      {n.message}
                      {ctxBits.length > 0 && (
                        <span style={{ display: "block", fontSize: 11, color: "var(--gray-500)", marginTop: 2 }}>
                          {ctxBits.join(" · ")}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Tool / model usage breakdown */}
        <section style={{ marginBottom: 22 }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>
            Usage by Tool / Model
          </h4>
          {orgAggregate.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--gray-500)" }}>No aggregated usage available.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tool / Model</th>
                    <th>Events</th>
                    <th>Tokens</th>
                    <th>Total Cost</th>
                    <th>Avg Risk</th>
                    <th>Remaining Budget</th>
                  </tr>
                </thead>
                <tbody>
                  {orgAggregate.map((row, i) => (
                    <tr key={`${row.tool_name}-${i}`}>
                      <td><strong>{row.tool_name}</strong></td>
                      <td>{num(row.total_events)}</td>
                      <td>{num(row.total_tokens)}</td>
                      <td>{money(row.total_cost)}</td>
                      <td>{Number(row.avg_risk_score || 0).toFixed(2)}</td>
                      <td>{row.remaining_budget !== null && row.remaining_budget !== undefined ? `$${Number(row.remaining_budget).toFixed(2)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent log entries */}
        <section>
          <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gray-500)" }}>
            Recent Events <span style={{ color: "var(--gray-400)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(latest {orgLogs.length})</span>
          </h4>
          {orgLogs.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--gray-500)" }}>No recent events for this organization in the current view.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Project</th>
                    <th>Tool</th>
                    <th>Status</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {orgLogs.map((row) => (
                    <tr key={row.event_id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                        {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                      </td>
                      <td>{row.project_id || "—"}</td>
                      <td>{row.tool_name || "—"}</td>
                      <td><span className={`status-pill ${(row.status || "").toLowerCase()}`}>{row.status || "—"}</span></td>
                      <td>{num(row.total_tokens)}</td>
                      <td>{money(row.total_cost)}</td>
                      <td>{Number(row.risk_score || 0).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SuperAdminLogs() {
  const location = useLocation();
  const initialOrgId = (() => {
    try {
      return new URLSearchParams(location.search).get("org") || "";
    } catch {
      return "";
    }
  })();
  const [logs, setLogs] = useState([]);
  const [aggregate, setAggregate] = useState([]);
  const [insights, setInsights] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [tools, setTools] = useState([]);
  const [providers, setProviders] = useState([]);
  const [eventStatuses, setEventStatuses] = useState([]);
  const [dismissedNotifications, setDismissedNotifications] = useState(false);
  const [piiModalEventId, setPiiModalEventId] = useState(null);
  const [orgModalId, setOrgModalId] = useState(initialOrgId || null);
  const [filters, setFilters] = useState({
    org_id: initialOrgId,
    tool_name: "",
    provider: "",
    status: "",
    start_date: "",
    end_date: "",
    limit: 200,
  });
  const [loading, setLoading] = useState(true);
  const [loadingAggregate, setLoadingAggregate] = useState(true);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [error, setError] = useState("");
  const insightsPollRef = useRef(null);

  const loadFilters = async () => {
    const [orgRes, toolRes, provRes, statusRes] = await Promise.all([
      getTracingOrgs(),
      getToolsUsage(),
      getLookupProviders(),
      getLookupEventStatuses(),
    ]);
    setOrgs(orgRes.data || []);
    setTools(toolRes.data || []);
    setProviders(provRes.data || []);
    setEventStatuses(["", ...(statusRes.data || [])]);
  };

  const fetchInsights = useCallback(async (orgId) => {
    setLoadingInsights(true);
    try {
      const params = orgId ? { org_id: orgId } : {};
      const res = await getSuperAdminInsights(params);
      setInsights(res.data || null);
      setDismissedNotifications(false);
    } catch {
      setInsights(null);
    } finally {
      setLoadingInsights(false);
    }
  }, []);

  const fetchAggregate = useCallback(async (orgId) => {
    setLoadingAggregate(true);
    try {
      const params = orgId ? { org_id: orgId } : {};
      const res = await getSuperAdminAggregate(params);
      setAggregate(res.data || []);
    } catch {
      setAggregate([]);
    } finally {
      setLoadingAggregate(false);
    }
  }, []);

  const fetchLogs = useCallback(async (currentFilters) => {
    setLoading(true);
    try {
      const params = Object.fromEntries(
        Object.entries(currentFilters).filter(([, v]) => v !== "" && v !== null),
      );
      const res = await getSuperAdminLogs(params);
      setLogs(res.data || []);
      setError("");
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          "Unable to load super-admin logs. Check backend connectivity.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFilters().catch(() => {});
  }, []);

  useEffect(() => {
    fetchLogs(filters);
    fetchAggregate(filters.org_id);
    fetchInsights(filters.org_id);
    // intentionally only run on mount; subsequent fetches go through Apply/Reset
  }, [fetchLogs, fetchAggregate, fetchInsights]); // eslint-disable-line

  // Poll insights every 30 s for real-time notifications
  useEffect(() => {
    const orgId = filters.org_id;
    insightsPollRef.current = setInterval(() => {
      fetchInsights(orgId);
    }, 30000);
    return () => clearInterval(insightsPollRef.current);
  }, [filters.org_id, fetchInsights]);

  const apply = (e) => {
    e.preventDefault();
    fetchLogs(filters);
    fetchAggregate(filters.org_id);
    fetchInsights(filters.org_id);
  };

  const reset = () => {
    const cleared = {
      org_id: "",
      tool_name: "",
      provider: "",
      status: "",
      start_date: "",
      end_date: "",
      limit: 200,
    };
    setFilters(cleared);
    fetchLogs(cleared);
    fetchAggregate("");
    fetchInsights("");
  };

  const totalCost = logs.reduce((s, r) => s + Number(r.total_cost || 0), 0);
  const totalTokens = logs.reduce((s, r) => s + Number(r.total_tokens || 0), 0);
  const avgRisk = logs.length
    ? logs.reduce((s, r) => s + Number(r.risk_score || 0), 0) / logs.length
    : 0;

  const notifications = insights?.notifications || [];
  const toolCosts = insights?.tool_costs || [];
  const modelUsage = insights?.model_usage || [];

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <h2>Super Admin · Centralized Logs</h2>
          <p>
            Unified read-only access to logs across all AI tools for monitoring,
            auditing, and compliance — no code or prompt access.
          </p>

          <div className="hero-metrics">
            <div className="hero-chip">
              <span>Records</span>
              <strong>{logs.length}</strong>
            </div>
            <div className="hero-chip">
              <span>Total Cost</span>
              <strong>${totalCost.toFixed(2)}</strong>
            </div>
            <div className="hero-chip">
              <span>Total Tokens</span>
              <strong>{totalTokens.toLocaleString()}</strong>
            </div>
            <div className="hero-chip">
              <span>Avg Risk</span>
              <strong>{avgRisk.toFixed(1)}</strong>
            </div>
            <div className="hero-chip">
              <span>PII Events</span>
              <strong style={{ color: logs.some((r) => r.pii_detected) ? "#ef4444" : undefined }}>
                {logs.filter((r) => r.pii_detected).length}
              </strong>
            </div>
            {insights && (
              <div className="hero-chip">
                <span>Active Alerts</span>
                <strong style={{ color: insights.critical_count > 0 ? "var(--red-500, #ef4444)" : undefined }}>
                  {insights.notification_count}
                </strong>
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Filters</h3>
              <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                Narrow logs by organization, tool, provider or time window.
              </p>
            </div>
          </div>

          <form className="stack" onSubmit={apply}>
            <div className="form-grid">
              <div className="field">
                <label>Organization</label>
                <select
                  value={filters.org_id}
                  onChange={(e) => setFilters({ ...filters, org_id: e.target.value })}
                >
                  <option value="">All organizations</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Tool</label>
                <select
                  value={filters.tool_name}
                  onChange={(e) => setFilters({ ...filters, tool_name: e.target.value })}
                >
                  <option value="">All tools</option>
                  {tools.map((t) => (
                    <option key={t.tool_name} value={t.tool_name}>{t.tool_name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Provider</label>
                <select
                  value={filters.provider}
                  onChange={(e) => setFilters({ ...filters, provider: e.target.value })}
                >
                  <option value="">All providers</option>
                  {providers.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                >
                  {eventStatuses.map((s) => (
                    <option key={s || "all"} value={s}>{s || "All statuses"}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Range preset</label>
                <select
                  value={(() => {
                    // Match the current start_date back to a preset value
                    if (!filters.start_date && !filters.end_date) return "all";
                    for (const opt of RANGE_OPTIONS) {
                      if (opt.value === "all") continue;
                      if (rangeToStartDate(opt.value) === filters.start_date && !filters.end_date) {
                        return opt.value;
                      }
                    }
                    return "";
                  })()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    setFilters({
                      ...filters,
                      start_date: rangeToStartDate(v) || "",
                      end_date: "",
                    });
                  }}
                >
                  <option value="">Custom</option>
                  {RANGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>From</label>
                <input
                  type="date"
                  value={filters.start_date}
                  onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                />
              </div>
              <div className="field">
                <label>To</label>
                <input
                  type="date"
                  value={filters.end_date}
                  onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="action-row">
              <button type="submit" className="btn btn-primary">Apply filters</button>
              <button type="button" className="btn btn-ghost" onClick={reset}>Reset</button>
            </div>
          </form>
        </div>
      </section>

      {error && <div className="error-message">{error}</div>}

      {/* ── Notification Panel ─────────────────────────────────────────── */}
      {!loadingInsights && !dismissedNotifications && notifications.length > 0 && (
        <section>
          <NotificationBanner
            notifications={notifications}
            onDismiss={() => setDismissedNotifications(true)}
            onOrgClick={(orgId) => setOrgModalId(orgId)}
          />
        </section>
      )}
      {!loadingInsights && notifications.length === 0 && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>Real-Time Governance Notifications</h3>
              <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                No active alerts — all token limits and cost budgets are within acceptable thresholds.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── Tool Cost Summary ──────────────────────────────────────────── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Tool Cost Summary</h3>
            <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
              Total cost per integrated tool across all projects and organizations — sourced from all telemetry events.
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tool / Model</th>
                <th>Provider</th>
                <th>Events</th>
                <th>Tokens In</th>
                <th>Tokens Out</th>
                <th>Total Tokens</th>
                <th>LLM Cost</th>
                <th>Infra Cost</th>
                <th>External Cost</th>
                <th>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {loadingInsights && (
                <tr><td colSpan={10} style={{ textAlign: "center" }}>Loading…</td></tr>
              )}
              {!loadingInsights && toolCosts.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", color: "var(--gray-500)" }}>
                    No tool usage data available.
                  </td>
                </tr>
              )}
              {toolCosts.map((row, i) => (
                <tr key={`${row.tool_name}-${i}`}>
                  <td><strong>{row.tool_name}</strong></td>
                  <td>{row.provider}</td>
                  <td>{num(row.total_events)}</td>
                  <td>{num(row.prompt_tokens)}</td>
                  <td>{num(row.completion_tokens)}</td>
                  <td>{num(row.total_tokens)}</td>
                  <td>{money(row.llm_cost)}</td>
                  <td>{money(row.infra_cost)}</td>
                  <td>{money(row.external_cost)}</td>
                  <td><strong>{money(row.total_cost)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Model Token Usage vs Limits ────────────────────────────────── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Model Token Usage &amp; Limits</h3>
            <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
              Token consumption per model per organization — compared against configured daily token limits.
              Status turns warning at 75%, critical at 90%, and exhausted at 100%.
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Provider</th>
                <th>Org</th>
                <th>Events</th>
                <th>Tokens In</th>
                <th>Tokens Out</th>
                <th>Total Tokens</th>
                <th>Token Limit</th>
                <th>Remaining</th>
                <th>Usage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingInsights && (
                <tr><td colSpan={11} style={{ textAlign: "center" }}>Loading…</td></tr>
              )}
              {!loadingInsights && modelUsage.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", color: "var(--gray-500)" }}>
                    No model usage data available.
                  </td>
                </tr>
              )}
              {modelUsage.map((row, i) => {
                const statusClass =
                  row.token_status === "exhausted"
                    ? "critical"
                    : row.token_status === "critical"
                      ? "high"
                      : row.token_status === "warning"
                        ? "medium"
                        : "";
                return (
                  <tr key={`${row.org_id}-${row.model_name}-${i}`}>
                    <td><strong>{row.model_name}</strong></td>
                    <td>{row.provider}</td>
                    <td>{row.org_id}</td>
                    <td>{num(row.total_events)}</td>
                    <td>{num(row.prompt_tokens)}</td>
                    <td>{num(row.completion_tokens)}</td>
                    <td>{num(row.total_tokens)}</td>
                    <td>{row.token_limit !== null ? num(row.token_limit) : "—"}</td>
                    <td>
                      {row.remaining_tokens !== null ? (
                        <span className={`status-pill ${statusClass}`}>
                          {row.remaining_tokens < 0
                            ? `-${num(Math.abs(row.remaining_tokens))}`
                            : num(row.remaining_tokens)}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ minWidth: 160 }}>
                      {row.usage_pct !== null ? (
                        <TokenBar pct={row.usage_pct} />
                      ) : (
                        <span style={{ color: "var(--gray-400)", fontSize: 12 }}>no limit set</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${statusClass}`}>
                        {row.token_status === "no_limit" ? "no limit" : row.token_status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Usage Aggregation by Tool ──────────────────────────────────── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Usage Aggregation by Tool</h3>
            <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
              Centralized computation of token usage, cost consumption, and remaining budget
              across all tools and projects — sourced from tracing data.
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Org</th>
                <th>Tool / Model</th>
                <th>Events</th>
                <th>Tokens In</th>
                <th>Tokens Out</th>
                <th>Total Tokens</th>
                <th>Total Cost</th>
                <th>Avg Risk</th>
                <th>Budget Limit</th>
                <th>Remaining</th>
              </tr>
            </thead>
            <tbody>
              {loadingAggregate && (
                <tr><td colSpan={10} style={{ textAlign: "center" }}>Loading…</td></tr>
              )}
              {!loadingAggregate && aggregate.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", color: "var(--gray-500)" }}>
                    No aggregated data available.
                  </td>
                </tr>
              )}
              {aggregate.map((row, i) => {
                const remaining = row.remaining_budget;
                const remainingClass =
                  remaining !== null && remaining < 0
                    ? "critical"
                    : remaining !== null && remaining < row.budget_limit * 0.1
                      ? "high"
                      : "";
                return (
                  <tr key={`${row.org_id}-${row.tool_name}-${i}`}>
                    <td>{row.org_id}</td>
                    <td><strong>{row.tool_name}</strong></td>
                    <td>{num(row.total_events)}</td>
                    <td>{num(row.prompt_tokens)}</td>
                    <td>{num(row.completion_tokens)}</td>
                    <td>{num(row.total_tokens)}</td>
                    <td>{money(row.total_cost)}</td>
                    <td>{row.avg_risk_score.toFixed(2)}</td>
                    <td>{row.budget_limit !== null ? `$${row.budget_limit.toFixed(2)}` : "—"}</td>
                    <td>
                      {remaining !== null ? (
                        <span className={`status-pill ${remainingClass}`}>
                          ${remaining.toFixed(2)}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Cross-Tool Log Stream ──────────────────────────────────────── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Cross-Tool Log Stream</h3>
            <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
              Auto-ingested from every connected vendor — normalized for org-wide cost tracking and governance.
              Click a <strong style={{ color: "#ef4444" }}>PII</strong> row to view full detection detail.
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Org</th>
                <th>Project</th>
                <th>Provider</th>
                <th>Tool / Model</th>
                <th>Service</th>
                <th>Status</th>
                <th>Tokens</th>
                <th>Cost</th>
                <th>Latency</th>
                <th>Risk</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={12} style={{ textAlign: "center" }}>Loading…</td></tr>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ textAlign: "center", color: "var(--gray-500)" }}>
                    No log records match the current filters.
                  </td>
                </tr>
              )}
              {logs.map((row) => {
                const isPII = !!row.pii_detected;
                return (
                  <tr
                    key={row.event_id}
                    onClick={isPII ? () => setPiiModalEventId(row.event_id) : undefined}
                    style={isPII ? { cursor: "pointer", background: "rgba(239,68,68,0.04)" } : undefined}
                    title={isPII ? "Click to view PII detection detail" : undefined}
                  >
                    <td>{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</td>
                    <td>
                      <span title={row.org_id}>{row.org_name || row.org_id || "-"}</span>
                    </td>
                    <td>
                      <span title={row.project_id}>{row.project_name || row.project_id || "-"}</span>
                    </td>
                    <td>{row.provider || "-"}</td>
                    <td>
                      <strong>{row.tool_name || "-"}</strong>
                    </td>
                    <td>{row.service_type || "-"}</td>
                    <td>
                      <span className={`status-pill ${(row.status || "").toLowerCase()}`}>
                        {row.status || "-"}
                      </span>
                    </td>
                    <td>{Number(row.total_tokens || 0).toLocaleString()}</td>
                    <td>${Number(row.total_cost || 0).toFixed(4)}</td>
                    <td>{row.latency_ms} ms</td>
                    <td>{Number(row.risk_score || 0).toFixed(1)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {isPII && (
                        <span
                          className="status-pill critical"
                          style={{ marginRight: 4 }}
                          title={row.pii_type ? `PII type: ${row.pii_type}` : "PII detected"}
                        >
                          PII{row.pii_type ? `: ${row.pii_type}` : ""}
                        </span>
                      )}
                      {row.misuse_detected && (
                        <span className="status-pill critical" style={{ marginRight: 4 }}>misuse</span>
                      )}
                      {row.abnormal_usage_spike && (
                        <span className="status-pill high">spike</span>
                      )}
                      {!isPII && !row.misuse_detected && !row.abnormal_usage_spike && "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── PII Detail Modal ───────────────────────────────────────────── */}
      {piiModalEventId && (
        <PIIDetailModal
          eventId={piiModalEventId}
          onClose={() => setPiiModalEventId(null)}
        />
      )}

      {/* ── Organization Detail Modal ─────────────────────────────────── */}
      {orgModalId && (
        <OrgDetailModal
          orgId={orgModalId}
          notifications={notifications}
          aggregate={aggregate}
          logs={logs}
          onClose={() => setOrgModalId(null)}
          onApplyFilter={(orgId) => {
            const next = { ...filters, org_id: orgId };
            setFilters(next);
            fetchLogs(next);
            fetchAggregate(orgId);
            fetchInsights(orgId);
          }}
        />
      )}
    </div>
  );
}

export default SuperAdminLogs;
