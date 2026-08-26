import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  getProxyOverview, getProxyTrends, getProxyByProject,
  getProxyByModel, getProxyRequests, getProxyPiiSummary,
  getOpenAnomalyCount, getProjects,
} from "../api";
import { statusPillClass } from "../failureCodes";
import { displayName } from "../utils/displayName";

const money2 = (v) => { const n = Number(v || 0); return n > 0 && n < 0.01 ? `$${n.toFixed(6)}` : `$${n.toFixed(2)}`; };
const money  = (v) => `$${Number(v || 0).toFixed(4)}`;
const num    = (v) => Number(v || 0).toLocaleString();
const pct    = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

function fmtTokens(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function projLabel(r, fallback = "Unassigned") {
  return displayName(r.project_name) || displayName(r.project_id) || fallback;
}

const RANGE_OPTIONS = [
  { label: "7d", value: 7 }, { label: "14d", value: 14 },
  { label: "30d", value: 30 }, { label: "90d", value: 90 },
  { label: "All", value: "all" },
];

function rangeLabel(days) {
  return days === "all" ? "all time" : `${days}d window`;
}

function windowPhrase(days) {
  return days === "all" ? "all time" : `the last ${days} days`;
}

// Caps the number of rendered date-axis ticks regardless of series length, so
// an "All" range (which can span a handful of days or a year+) doesn't render
// an unreadable wall of overlapping labels.
function dateAxisTicks(length) {
  if (!length || length <= 12) return { interval: 0 };
  return { interval: Math.ceil(length / 10) - 1, angle: -35, textAnchor: "end", height: 46 };
}

// ── Key Insights engine ──────────────────────────────────────────────────────
function computeInsights(byProject, byModel, trends, overview, piiSummary, days) {
  const insights = [];
  const grandTotal = byProject.reduce((s, r) => s + Number(r.total_cost || 0), 0);

  // Top project by cost
  if (byProject.length > 0) {
    const top  = [...byProject].sort((a, b) => Number(b.total_cost || 0) - Number(a.total_cost || 0))[0];
    const share = pct(top.total_cost, grandTotal);
    if (share > 0) insights.push({
      text: `${projLabel(top)} contributed ${share}% of total cost.`,
      level: "info",
    });
  }

  // Top model by tokens
  if (byModel.length > 0) {
    const totalTok = byModel.reduce((s, m) => s + Number(m.total_tokens || 0), 0);
    const top = [...byModel].sort((a, b) => Number(b.total_tokens || 0) - Number(a.total_tokens || 0))[0];
    const share = pct(top.total_tokens, totalTok);
    if (share > 0) insights.push({
      text: `${top.model_name} generated ${share}% of all tokens.`,
      level: "info",
    });
  }

  // Cost trend: compare first vs second half
  if (trends.length >= 4) {
    const half   = Math.floor(trends.length / 2);
    const avgFirst  = trends.slice(0, half).reduce((s, t) => s + Number(t.total_cost || 0), 0) / half;
    const avgSecond = trends.slice(half).reduce((s, t) => s + Number(t.total_cost || 0), 0) / (trends.length - half);
    if (avgFirst > 0) {
      const change = Math.round(((avgSecond - avgFirst) / avgFirst) * 100);
      if (Math.abs(change) >= 5) insights.push({
        text: `Cost ${change > 0 ? "increased" : "decreased"} ${Math.abs(change)}% in the latter half of ${days === "all" ? "the selected window" : `the ${days}d window`}.`,
        level: change > 0 ? "warn" : "good",
      });
    }
  }

  // PII
  const piiCount = piiSummary?.total_pii_requests || overview?.pii_detections || 0;
  if (piiCount > 0) {
    insights.push({ text: `${piiCount} PII incident${piiCount !== 1 ? "s" : ""} detected — review flagged requests.`, level: "warn" });
  } else {
    insights.push({ text: "No PII incidents detected in this period.", level: "good" });
  }

  // Blocked
  const blocked = overview?.blocked || 0;
  if (blocked > 0) insights.push({
    text: `${blocked} request${blocked !== 1 ? "s" : ""} blocked by governance policies.`,
    level: "critical",
  });

  // Success rate
  const sr = Number(overview?.success_rate || 0);
  if (sr > 0 && sr < 95) insights.push({
    text: `Success rate is ${sr}% — below healthy threshold (95%).`,
    level: "warn",
  });

  return insights;
}

const INSIGHT_STYLES = {
  info:     { border: "#7C70AE", bg: "rgba(124,112,174,0.07)", dot: "#7C70AE" },
  good:     { border: "#10b981", bg: "rgba(16,185,129,0.07)",  dot: "#10b981" },
  warn:     { border: "#f59e0b", bg: "rgba(245,158,11,0.07)",  dot: "#f59e0b" },
  critical: { border: "#ef4444", bg: "rgba(239,68,68,0.07)",   dot: "#ef4444" },
};

// ── Card Detail Modal helpers ─────────────────────────────────────────────────
function MRow({ label, value, accent }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ fontSize: 13, color: "#64748b" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: accent || "#0f172a" }}>{value}</span>
    </div>
  );
}

function MSection({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#9E2A97", marginBottom: 10, paddingBottom: 6, borderBottom: "2px solid rgba(158,42,151,0.15)" }}>{title}</div>
      {children}
    </div>
  );
}

// ── PII Action Requests Modal (shows requests for a single action only) ───────
function ActionRequestsModal({ action, rows, total, loading, error, onClose, projectNameMap = {} }) {
  return (
    <div onClick={onClose} className="modal-backdrop" style={{ zIndex: 2200 }}>
      <div onClick={e => e.stopPropagation()} className="modal-dialog" style={{ maxWidth: 860 }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: "0 0 2px", textTransform: "capitalize" }}>{action} — Requests</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--gray-500)" }}>
              {loading
                ? "Loading…"
                : `${total} request${total !== 1 ? "s" : ""}${rows.length < total ? ` (showing first ${rows.length})` : ""}`}
            </p>
          </div>
          <button onClick={onClose} className="btn-close">×</button>
        </div>
        {loading && <div style={{ textAlign: "center", padding: "32px 0", color: "var(--gray-400)" }}>Loading…</div>}
        {error  && <div style={{ color: "#ef4444", fontSize: 13, padding: "12px 0" }}>Failed to load requests.</div>}
        {!loading && !error && (
          rows.length === 0
            ? <p style={{ color: "var(--gray-400)", fontSize: 13, textAlign: "center", padding: "24px 0" }}>No matching requests found.</p>
            : <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Request ID</th><th>Project</th><th>Model</th><th>Route</th><th>Status</th>
                      <th>PII Types</th><th>Tokens</th><th>Cost</th><th>Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.request_id}>
                        <td style={{ fontFamily: "monospace", fontSize: 11 }}>{row.request_id}</td>
                        <td>{displayName(projectNameMap[row.project_id] || row.project_id) || "—"}</td>
                        <td><strong>{row.model_name || "—"}</strong></td>
                        <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--gray-500)" }}>{row.entry_point || "—"}</td>
                        <td>
                          <span className={`status-pill ${statusPillClass(row.request_status)}`} style={{ fontSize: 11 }}>{row.request_status || "—"}</span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {(row.pii_types || []).map(t => <span key={t} className="status-pill critical" style={{ fontSize: 11 }}>{t}</span>)}
                            {!row.pii_types?.length && <span style={{ color: "var(--gray-400)" }}>—</span>}
                          </div>
                        </td>
                        <td>{Number(row.total_tokens || 0).toLocaleString()}</td>
                        <td style={{ fontFamily: "monospace", fontSize: 12 }}>${Number(row.total_cost || 0).toFixed(6)}</td>
                        <td style={{ fontSize: 12, color: "var(--gray-500)" }}>
                          {row.received_at ? new Date(row.received_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
        )}
      </div>
    </div>
  );
}

async function fetchActionRows(action, extraParams = {}) {
  const res = await getProxyRequests({ pii_action_taken: action, limit: 200, ...extraParams });
  const data = res.data || {};
  const items = data.items || (Array.isArray(data) ? data : []);
  return { rows: items, total: data.total ?? items.length };
}

function KpiModal({ cardKey, overview, byProject, byModel, piiSummary, days, onClose, projectNameMap = {} }) {
  const grandTotal = byProject.reduce((s, r) => s + Number(r.total_cost || 0), 0);
  const totalTok   = byModel.reduce((s, m) => s + Number(m.total_tokens || 0), 0);
  const [actionModal, setActionModal] = useState(null); // { action, rows, loading, error }

  const TITLES = {
    total_cost:     "Cost Overview",
    llm_cost:       "LLM Model Costs",
    total_requests: "Request Breakdown",
    total_tokens:   "Token Usage",
    avg_latency:    "Performance",
    success_rate:   "Request Outcomes",
    pii_detections: "PII Security",
    blocked:        "Blocked Requests",
    failed:         "Failed Requests",
  };

  function renderContent() {
    if (cardKey === "total_cost") {
      return (
        <>
          <MSection title="Cost Breakdown">
            <MRow label="LLM / Inference Cost"  value={money2(overview?.llm_cost)}      accent="#9E2A97" />
            <MRow label="Infrastructure Cost"   value={money2(overview?.infra_cost)}     />
            <MRow label="External Tool Cost"    value={money2(overview?.external_cost)}  />
            <MRow label="Total Cost"            value={money2(overview?.total_cost)}     accent="#0f172a" />
          </MSection>
          <MSection title={`Top Projects by Cost (${days === "all" ? "All time" : `${days}d`})`}>
            <div style={{ display: "grid", gap: 6 }}>
              {[...byProject].sort((a, b) => Number(b.total_cost || 0) - Number(a.total_cost || 0)).slice(0, 5).map(p => {
                const share = grandTotal > 0 ? Math.round((Number(p.total_cost || 0) / grandTotal) * 100) : 0;
                return (
                  <div key={p.project_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{projLabel(p)}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>{share}%</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#9E2A97", fontFamily: "monospace" }}>{money2(p.total_cost)}</span>
                    </div>
                  </div>
                );
              })}
              {byProject.length === 0 && <p style={{ color: "#94a3b8", fontSize: 13 }}>No project data available.</p>}
            </div>
          </MSection>
        </>
      );
    }
    if (cardKey === "llm_cost") {
      return (
        <>
          <MSection title="Cost Category Breakdown">
            <MRow label="LLM / Inference"   value={money2(overview?.llm_cost)}      accent="#9E2A97" />
            <MRow label="Infrastructure"    value={money2(overview?.infra_cost)}    />
            <MRow label="External Tools"    value={money2(overview?.external_cost)} />
          </MSection>
          <MSection title="Top Models by LLM Cost">
            <div style={{ display: "grid", gap: 6 }}>
              {[...byModel].sort((a, b) => Number(b.total_cost || 0) - Number(a.total_cost || 0)).slice(0, 6).map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                  <div>
                    <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600, background: "rgba(158,42,151,0.08)", color: "#9E2A97", padding: "2px 8px", borderRadius: 10 }}>{m.model_name}</span>
                    {m.provider && <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>{m.provider}</span>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#7C70AE", fontFamily: "monospace" }}>{money2(m.total_cost)}</span>
                </div>
              ))}
              {byModel.length === 0 && <p style={{ color: "#94a3b8", fontSize: 13 }}>No model data available.</p>}
            </div>
          </MSection>
        </>
      );
    }
    if (cardKey === "total_requests") {
      return (
        <>
          <MSection title="Request Summary">
            <MRow label="Total Requests" value={num(overview?.total_requests)} />
            <MRow label="Completed"      value={num(overview?.completed)}      accent="#22c55e" />
            <MRow label="Blocked"        value={num(overview?.blocked)}        accent="#ef4444" />
            <MRow label="Failed"         value={num(overview?.failed)}         accent="#ef4444" />
            <MRow label="Success Rate"   value={`${overview?.success_rate ?? 0}%`} accent={Number(overview?.success_rate || 0) >= 95 ? "#22c55e" : "#f97316"} />
          </MSection>
          <MSection title="By Project">
            <div style={{ display: "grid", gap: 6 }}>
              {[...byProject].sort((a, b) => Number(b.total_requests || 0) - Number(a.total_requests || 0)).slice(0, 5).map(p => (
                <div key={p.project_id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{projLabel(p)}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{num(p.total_requests)} req</span>
                </div>
              ))}
              {byProject.length === 0 && <p style={{ color: "#94a3b8", fontSize: 13 }}>No project data available.</p>}
            </div>
          </MSection>
        </>
      );
    }
    if (cardKey === "total_tokens") {
      const avgPerReq = Math.round(Number(overview?.total_tokens || 0) / Math.max(Number(overview?.total_requests || 1), 1));
      return (
        <>
          <MSection title="Token Summary">
            <MRow label="Total Tokens"       value={fmtTokens(overview?.total_tokens)} />
            <MRow label="Avg Tokens/Request" value={fmtTokens(avgPerReq)} />
            <MRow label="Total Cost"         value={money2(overview?.total_cost)} accent="#9E2A97" />
          </MSection>
          <MSection title="By Model">
            <div style={{ display: "grid", gap: 8 }}>
              {[...byModel].sort((a, b) => Number(b.total_tokens || 0) - Number(a.total_tokens || 0)).slice(0, 6).map((m, i) => {
                const share = totalTok > 0 ? Math.round((Number(m.total_tokens || 0) / totalTok) * 100) : 0;
                return (
                  <div key={i} style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600 }}>{m.model_name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{fmtTokens(m.total_tokens)}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: "#e2e8f0" }}>
                      <div style={{ width: `${share}%`, height: "100%", background: "#7C70AE", borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, display: "block" }}>{share}% of total</span>
                  </div>
                );
              })}
              {byModel.length === 0 && <p style={{ color: "#94a3b8", fontSize: 13 }}>No model data available.</p>}
            </div>
          </MSection>
        </>
      );
    }
    if (cardKey === "avg_latency") {
      const latency = Number(overview?.avg_latency_ms || 0);
      const latencyStatus = latency > 2000 ? { color: "#ef4444", label: "High" }
                          : latency > 1000 ? { color: "#f97316", label: "Moderate" }
                          : { color: "#22c55e", label: "Good" };
      return (
        <>
          <MSection title="Latency Overview">
            <MRow label="Average Latency" value={`${num(latency)} ms`}  accent={latencyStatus.color} />
            <MRow label="Status"          value={latencyStatus.label}   accent={latencyStatus.color} />
            <MRow label="Total Requests"  value={num(overview?.total_requests)} />
            <MRow label="Completed"       value={num(overview?.completed)} accent="#22c55e" />
          </MSection>
          <MSection title="Most Used Models">
            <div style={{ display: "grid", gap: 6 }}>
              {[...byModel].sort((a, b) => Number(b.total_requests || 0) - Number(a.total_requests || 0)).slice(0, 5).map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                  <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600 }}>{m.model_name}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{num(m.total_requests)} req</span>
                </div>
              ))}
              {byModel.length === 0 && <p style={{ color: "#94a3b8", fontSize: 13 }}>No model data available.</p>}
            </div>
          </MSection>
        </>
      );
    }
    if (cardKey === "success_rate") {
      const sr        = Number(overview?.success_rate || 0);
      const total     = Number(overview?.total_requests || 0);
      const completed = Number(overview?.completed || 0);
      const blocked   = Number(overview?.blocked || 0);
      const other     = Math.max(total - completed - blocked, 0);
      const srColor   = sr >= 95 ? "#22c55e" : sr >= 80 ? "#f97316" : "#ef4444";
      const srLabel   = sr >= 95 ? "Healthy — above 95% threshold" : sr >= 80 ? "Warning — below 95% threshold" : "Critical — below 80% threshold";
      return (
        <MSection title="Request Outcomes">
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: "#64748b" }}>Current Rate</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: srColor }}>{sr}%</span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: "#f1f5f9", overflow: "hidden" }}>
              <div style={{ width: `${sr}%`, height: "100%", background: srColor, borderRadius: 5, transition: "width 0.6s ease" }} />
            </div>
            <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, display: "block" }}>{srLabel}</span>
          </div>
          <MRow label="Completed"      value={`${num(completed)} (${total > 0 ? Math.round((completed / total) * 100) : 0}%)`} accent="#22c55e" />
          <MRow label="Blocked"        value={`${num(blocked)} (${total > 0 ? Math.round((blocked / total) * 100) : 0}%)`}     accent="#ef4444" />
          {other > 0 && <MRow label="Other / Failed" value={num(other)} />}
          <MRow label="Total Requests" value={num(total)} />
        </MSection>
      );
    }
    if (cardKey === "pii_detections") {
      const piiCount = Number(overview?.pii_detections || 0);
      const total    = Number(overview?.total_requests || 0);
      const piiRate  = total > 0 ? ((piiCount / total) * 100).toFixed(1) : "0.0";
      return (
        <>
          <MSection title="PII Detection Summary">
            <MRow label="PII Incidents"  value={num(piiCount)}  accent={piiCount > 0 ? "#ef4444" : "#22c55e"} />
            <MRow label="Total Requests" value={num(total)} />
            <MRow label="PII Rate"       value={`${piiRate}%`}  accent={Number(piiRate) > 0 ? "#f97316" : "#22c55e"} />
          </MSection>
          {piiSummary?.pii_type_breakdown?.length > 0 && (
            <MSection title="PII Types">
              <div style={{ display: "grid", gap: 6 }}>
                {piiSummary.pii_type_breakdown.map(item => (
                  <div key={item.pii_type} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#fef2f2", borderRadius: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{item.pii_type}</span>
                    <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 700 }}>{item.count} hit{item.count !== 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            </MSection>
          )}
          {piiSummary?.action_breakdown?.length > 0 && (
            <MSection title="Actions Taken">
              <div style={{ display: "grid", gap: 6 }}>
                {piiSummary.action_breakdown.map(item => (
                  <div
                    key={item.action}
                    onClick={async () => {
                      setActionModal({ action: item.action, rows: [], total: 0, loading: true, error: false });
                      try {
                        const { rows, total } = await fetchActionRows(item.action);
                        setActionModal({ action: item.action, rows, total, loading: false, error: false });
                      } catch {
                        setActionModal(prev => ({ ...prev, loading: false, error: true }));
                      }
                    }}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: 8, cursor: "pointer", transition: "background 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(158,42,151,0.06)"}
                    onMouseLeave={e => e.currentTarget.style.background = "#f8fafc"}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{item.action}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#9E2A97", background: "rgba(158,42,151,0.1)", padding: "2px 10px", borderRadius: 20 }}>{item.count}</span>
                  </div>
                ))}
              </div>
            </MSection>
          )}
        </>
      );
    }
    if (cardKey === "blocked") {
      const blockedCount = Number(overview?.blocked || 0);
      const totalReqs    = Number(overview?.total_requests || 0);
      const blockedPct   = totalReqs > 0 ? ((blockedCount / totalReqs) * 100).toFixed(1) : "0.0";
      const piiProjects  = byProject.filter(p => Number(p.pii_hits || 0) > 0);
      return (
        <>
          <MSection title="Blocked Request Summary">
            <MRow label="Blocked Count"  value={num(blockedCount)}   accent="#ef4444" />
            <MRow label="Total Requests" value={num(totalReqs)} />
            <MRow label="Block Rate"     value={`${blockedPct}%`}    accent={Number(blockedPct) > 5 ? "#ef4444" : "#f97316"} />
            <MRow label="PII Detections" value={num(overview?.pii_detections)} accent="#f97316" />
          </MSection>
          <MSection title="Projects with PII Incidents">
            <div style={{ display: "grid", gap: 6 }}>
              {piiProjects.slice(0, 5).map(p => (
                <div key={p.project_id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#fef2f2", borderRadius: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{projLabel(p)}</span>
                  <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 700 }}>{num(p.pii_hits)} PII hit{p.pii_hits !== 1 ? "s" : ""}</span>
                </div>
              ))}
              {piiProjects.length === 0 && <p style={{ fontSize: 13, color: "#22c55e", margin: 0 }}>No PII incidents recorded by project.</p>}
            </div>
          </MSection>
        </>
      );
    }
    if (cardKey === "failed") {
      const failedCount  = Number(overview?.failed || 0);
      const partialCount = Number(overview?.partial || 0);
      const total        = Number(overview?.total_requests || 0);
      const failedTotal  = failedCount + partialCount;
      const failedPct    = total > 0 ? ((failedTotal / total) * 100).toFixed(1) : "0.0";
      return (
        <MSection title="Failed & Partial Requests">
          <MRow label="Failed"         value={num(failedCount)}  accent="#ef4444" />
          <MRow label="Partial Streams" value={num(partialCount)} accent="#f97316" />
          <MRow label="Total Requests" value={num(total)} />
          <MRow label="Failure Rate"   value={`${failedPct}%`} accent={Number(failedPct) > 5 ? "#ef4444" : "#f97316"} />
        </MSection>
      );
    }
    return <p style={{ fontSize: 14, color: "#64748b" }}>No detail available for this metric.</p>;
  }

  return (
    <>
      <div onClick={onClose} className="modal-backdrop" style={{ zIndex: 2000 }}>
        <div onClick={e => e.stopPropagation()} className="modal-dialog" style={{ maxWidth: 560 }}>
          <div className="modal-header">
            <h3>{TITLES[cardKey] || cardKey}</h3>
            <button onClick={onClose} className="btn-close">×</button>
          </div>
          {renderContent()}
        </div>
      </div>

      {actionModal && (
        <ActionRequestsModal
          action={actionModal.action}
          rows={actionModal.rows}
          total={actionModal.total}
          loading={actionModal.loading}
          error={actionModal.error}
          onClose={() => setActionModal(null)}
          projectNameMap={projectNameMap}
        />
      )}
    </>
  );
}

// ── PII Summary Modal ─────────────────────────────────────────────────────────
function PiiSummaryModal({ piiSummary, overview, onClose }) {
  const total   = piiSummary?.total_pii_requests || overview?.pii_detections || 0;
  const blocked = piiSummary?.blocked_requests   || overview?.blocked        || 0;

  return (
    <div onClick={onClose} className="modal-backdrop" style={{ zIndex: 2000 }}>
      <div onClick={e => e.stopPropagation()} className="modal-dialog" style={{ maxWidth: 540, padding: "24px 28px" }}>
        <div className="modal-header" style={{ marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>PII Security Summary</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--gray-500)" }}>
              {total} detection{total !== 1 ? "s" : ""} in current period
            </p>
          </div>
          <button onClick={onClose} className="btn-close">×</button>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          {[
            { label: "PII Detected",    value: num(total),   color: "#ef4444" },
            { label: "Blocked",         value: num(blocked), color: "#f97316" },
            { label: "Total Requests",  value: num(overview?.total_requests), color: "#7C70AE" },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, padding: "12px 14px", borderRadius: 10, background: "var(--gray-50)", border: "1px solid var(--gray-200)" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gray-500)", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* PII type breakdown */}
        {piiSummary?.pii_type_breakdown?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9E2A97", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--gray-200)" }}>
              By PII Type
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {piiSummary.pii_type_breakdown.map((item, i) => {
                const maxCount = Math.max(...piiSummary.pii_type_breakdown.map(x => x.count));
                const barPct   = maxCount > 0 ? Math.round((item.count / maxCount) * 100) : 0;
                return (
                  <div key={item.pii_type} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, minWidth: 110, fontFamily: "monospace", color: "#9E2A97" }}>{item.pii_type}</span>
                    <div style={{ flex: 1, height: 7, borderRadius: 4, background: "var(--gray-100)", overflow: "hidden" }}>
                      <div style={{ width: `${barPct}%`, height: "100%", background: `rgba(158,42,151,${0.4 + 0.6 * (barPct / 100)})`, borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, minWidth: 50, textAlign: "right", color: "#9E2A97" }}>{item.count} hit{item.count !== 1 ? "s" : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions breakdown */}
        {piiSummary?.action_breakdown?.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9E2A97", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--gray-200)" }}>
              Actions Taken
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {piiSummary.action_breakdown.map(item => {
                const color = item.action === "block" ? "#ef4444" : item.action === "mask" ? "#f97316" : "#22c55e";
                return (
                  <div key={item.action} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 16px", borderRadius: 10, flex: 1, minWidth: 120,
                    background: `${color}0d`, border: `1px solid ${color}30`,
                  }}>
                    <div>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color, fontWeight: 700 }}>{item.action}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 2 }}>{item.count}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
function Dashboard() {
  const [selProject, setSelProject]   = useState("");
  const [selProvider, setSelProvider] = useState("");
  const [selModel, setSelModel]       = useState("");
  const [days, setDays]               = useState(30);

  const [overview, setOverview]       = useState(null);
  const [trends, setTrends]           = useState([]);
  const [byProjectRaw, setByProject]   = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [byModel, setByModel]         = useState([]);
  const [piiSummary, setPiiSummary]         = useState(null);
  const [openAnomalyCount, setOpenAnomalyCount] = useState(0);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState("");
  const [activeCard, setActiveCard]   = useState(null);
  const [piiSummaryModal, setPiiSummaryModal] = useState(false);
  const [pillAction, setPillAction]   = useState(null); // { action, rows, loading, error }

  const openPillAction = useCallback(async (action, e) => {
    e.stopPropagation();
    setPillAction({ action, rows: [], total: 0, loading: true, error: false });
    try {
      const { rows, total } = await fetchActionRows(action, selProject ? { project_id: selProject } : {});
      setPillAction({ action, rows, total, loading: false, error: false });
    } catch {
      setPillAction(prev => ({ ...prev, loading: false, error: true }));
    }
  }, [selProject]);

  const load = useCallback(async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      const proj  = selProject  || undefined;
      const prov  = selProvider || undefined;
      const model = selModel    || undefined;
      const [ovRes, trRes, prjRes, modRes, reqRes, piiRes, anomalyRes] = await Promise.allSettled([
        getProxyOverview(undefined, days, proj, prov, model),
        getProxyTrends(undefined, days, proj, prov, model),
        getProxyByProject(undefined, days, proj),
        getProxyByModel(undefined, days, proj, prov, model),
        getProxyRequests({ limit: 10, project_id: proj, provider: prov, model_name: model }),
        getProxyPiiSummary(undefined, days, proj, prov, model),
        getOpenAnomalyCount(),
      ]);
      const val = (r, fb) => r.status === "fulfilled" ? (r.value?.data ?? fb) : fb;
      const valArr = (r, fb) => { const v = val(r, fb); return Array.isArray(v) ? v : fb; };
      setOverview(val(ovRes, null));
      setTrends(valArr(trRes, []));
      setByProject(valArr(prjRes, []));
      setByModel(valArr(modRes, []));
      setPiiSummary(val(piiRes, null));
      setOpenAnomalyCount(val(anomalyRes, { open_anomalies: 0 }).open_anomalies || 0);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to load data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days, selProject, selProvider, selModel]);

  useEffect(() => {
    if (overview !== null) load(true);
    else load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // Cost aggregates are keyed by project_id but don't carry a reliable project_name,
  // so resolve display names from the canonical project list instead of showing raw ids.
  useEffect(() => {
    getProjects()
      .then(r => setAllProjects(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAllProjects([]));
  }, []);

  const projectNameMap = useMemo(() => {
    const m = {};
    allProjects.forEach(p => { m[p.id] = p.project_name; });
    return m;
  }, [allProjects]);

  const byProject = useMemo(
    () => byProjectRaw.map(r => ({ ...r, project_name: r.project_name || projectNameMap[r.project_id] })),
    [byProjectRaw, projectNameMap]
  );

  if (loading) return <div className="loading">Loading AI Governance Dashboard…</div>;

  // ── Derived filter options ─────────────────────────────────────────────────
  const grandTotal  = byProject.reduce((s, r) => s + Number(r.total_cost || 0), 0);
  const providers   = [...new Set(byModel.map(m => m.provider).filter(Boolean))];
  const modelNames  = [...new Set(byModel.map(m => m.model_name).filter(Boolean))];

  const filteredProjects = byProject
    .filter(r => !selProject || (r.project_id || "unassigned") === selProject)
    .sort((a, b) => Number(b.total_cost || 0) - Number(a.total_cost || 0));

  const filteredModels = byModel
    .filter(m => !selProvider || m.provider === selProvider)
    .filter(m => !selModel   || m.model_name === selModel)
    .sort((a, b) => Number(b.total_cost || 0) - Number(a.total_cost || 0));

  const insights = computeInsights(byProject, byModel, trends, overview, piiSummary, days);

  return (
    <>
      {/* ── Fixed filter bar ─────────────────────────────────────────────── */}
      <div className="page-filter-bar page-filter-bar--tall">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>AI Governance Dashboard</h2>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--gray-500)" }}>Executive summary — platform health, usage and costs at a glance.</p>
          </div>
          <button className="btn btn-ghost" onClick={() => load(true)} disabled={refreshing} style={{ fontSize: 13 }}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {/* Filter row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Date range */}
          <div style={{ display: "flex", gap: 4, background: "rgba(124,112,174,0.08)", borderRadius: 8, padding: 3 }}>
            {RANGE_OPTIONS.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => setDays(opt.value)}
                style={{
                  padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  background: days === opt.value ? "#9E2A97" : "transparent",
                  color: days === opt.value ? "#fff" : "var(--gray-500)",
                  transition: "all 0.15s",
                }}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Project */}
          <select value={selProject} onChange={e => setSelProject(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13 }}>
            <option value="">All Projects</option>
            {byProject.map(r => (
              <option key={r.project_id || "unassigned"} value={r.project_id || "unassigned"}>
                {projLabel(r, "unassigned")}
              </option>
            ))}
          </select>

          {/* Provider */}
          <select value={selProvider} onChange={e => setSelProvider(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13 }}>
            <option value="">All Providers</option>
            {providers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          {/* Model */}
          <select value={selModel} onChange={e => setSelModel(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13 }}>
            <option value="">All Models</option>
            {modelNames.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          {(selProject || selProvider || selModel) && (
            <button className="btn btn-ghost" style={{ fontSize: 12, color: "#9E2A97" }}
              onClick={() => { setSelProject(""); setSelProvider(""); setSelModel(""); }}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Scrollable page body ──────────────────────────────────────────── */}
      <div className="page-body"><div className="page-shell">

      {error && <div className="error-message">{error}</div>}

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <section className="stats-grid stats-grid-overview">
        {[
          { label: "Total Cost",       value: money2(overview?.total_cost),           sub: rangeLabel(days),
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
          { label: "LLM Cost",         value: money2(overview?.llm_cost),             sub: "model inference",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/></svg> },
          { label: "Total Requests",   value: num(overview?.total_requests),          sub: `${num(overview?.completed)} completed`,
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg> },
          { label: "Total Tokens",     value: fmtTokens(overview?.total_tokens),     sub: "input + output",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> },
          { label: "Avg Latency",      value: `${num(overview?.avg_latency_ms)} ms`, sub: "end-to-end",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
          { label: "Success Rate",     value: `${overview?.success_rate ?? 0}%`,     sub: "completed / total",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
          { label: "PII Detections",   value: num(overview?.pii_detections),         sub: "this period",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
          { label: "Blocked",          value: num(overview?.blocked),                sub: "by governance policies",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> },
          { label: "Failed",           value: num((overview?.failed || 0) + (overview?.partial || 0)), sub: `${num(overview?.partial || 0)} partial streams`,
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
          { label: "Open Anomalies",   value: num(openAnomalyCount),                  sub: "unresolved spikes",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
        ].map(card => {
          const cardKey = card.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, "");
          return (
          <div key={card.label} className="kpi-card" onClick={() => setActiveCard(cardKey)} style={{
            background: "linear-gradient(160deg, #1a0a2e 0%, #2d1b4e 100%)",
            borderRadius: 14,
            padding: "20px 20px 16px",
            border: "1px solid rgba(158,42,151,0.2)",
            boxShadow: "0 4px 20px rgba(26,10,46,0.25)",
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}>
            {/* Header row: label + icon */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                {card.label}
              </span>
              <span style={{ color: "rgba(255,255,255,0.25)", display: "flex" }}>
                {card.icon}
              </span>
            </div>
            {/* Value */}
            <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", lineHeight: 1.05, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", marginBottom: 14 }}>
              {card.value}
            </div>
            {/* Divider */}
            <div style={{ height: 1, background: "rgba(158,42,151,0.25)", marginBottom: 12 }} />
            {/* Sub */}
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 500, letterSpacing: "0.03em" }}>
              {card.sub}
            </div>
          </div>
          );
        })}
      </section>

      {/* ── Key Insights ─────────────────────────────────────────────────── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Key Insights</h3>
            <p style={{ fontSize: 13, color: "var(--gray-500)" }}>Automatically derived from your data for {windowPhrase(days)}.</p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
          {insights.map((ins, i) => {
            const s = INSIGHT_STYLES[ins.level] || INSIGHT_STYLES.info;
            return (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "12px 14px", borderRadius: 8,
                background: s.bg, border: `1px solid ${s.border}30`,
                borderLeft: `3px solid ${s.border}`,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, flexShrink: 0, marginTop: 4 }} />
                <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{ins.text}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Top Projects + Top Models ─────────────────────────────────────── */}
      <section className="two-column">
        {/* Top Projects table */}
        <div className="panel">
          <div className="section-head">
            <div><h3>Top Projects</h3><p style={{ fontSize: 13, color: "var(--gray-500)" }}>Ranked by cost</p></div>
            <span style={{ fontSize: 13, color: "var(--gray-500)" }}>{filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""}</span>
          </div>
          {filteredProjects.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th style={{ textAlign: "right" }}>Cost</th>
                    <th style={{ textAlign: "right" }}>Requests</th>
                    <th style={{ textAlign: "right" }}>Tokens</th>
                    <th style={{ textAlign: "right" }}>% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((r, i) => {
                    const share = pct(r.total_cost, grandTotal);
                    return (
                      <tr key={r.project_id || i}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{projLabel(r)}</div>
                          {r.pii_hits > 0 && <span className="status-pill critical" style={{ fontSize: 10, marginTop: 2 }}>{r.pii_hits} PII</span>}
                        </td>
                        <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#9E2A97" }}>{money2(r.total_cost)}</td>
                        <td style={{ textAlign: "right" }}>{num(r.total_requests)}</td>
                        <td style={{ textAlign: "right" }}>{fmtTokens(r.total_tokens)}</td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                            <div style={{ width: 48, height: 5, borderRadius: 3, background: "rgba(124,112,174,0.15)", overflow: "hidden" }}>
                              <div style={{ width: `${share}%`, height: "100%", background: "#9E2A97" }} />
                            </div>
                            <span style={{ fontSize: 12, color: "var(--gray-500)", minWidth: 30 }}>{share}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state">No project data for this period.</div>}
        </div>

        {/* Top Models table */}
        <div className="panel">
          <div className="section-head">
            <div><h3>Top Models</h3><p style={{ fontSize: 13, color: "var(--gray-500)" }}>Ranked by cost</p></div>
            <span style={{ fontSize: 13, color: "var(--gray-500)" }}>{filteredModels.length} model{filteredModels.length !== 1 ? "s" : ""}</span>
          </div>
          {filteredModels.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Provider</th>
                    <th style={{ textAlign: "right" }}>Requests</th>
                    <th style={{ textAlign: "right" }}>Tokens</th>
                    <th style={{ textAlign: "right" }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModels.slice(0, 8).map((m, i) => {
                    const totalModelCost = filteredModels.reduce((s, x) => s + Number(x.total_cost || 0), 0);
                    const share = pct(m.total_cost, totalModelCost);
                    return (
                      <tr key={`${m.model_name}-${m.provider}-${i}`}>
                        <td>
                          <span style={{
                            fontSize: 12, padding: "2px 8px", borderRadius: 20, fontFamily: "monospace", fontWeight: 600,
                            background: "rgba(158,42,151,0.08)", color: "#9E2A97", border: "1px solid rgba(158,42,151,0.2)",
                          }}>
                            {m.model_name}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: "var(--gray-500)" }}>{m.provider || "—"}</td>
                        <td style={{ textAlign: "right" }}>{num(m.total_requests)}</td>
                        <td style={{ textAlign: "right" }}>{fmtTokens(m.total_tokens)}</td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                            <div style={{ width: 36, height: 5, borderRadius: 3, background: "rgba(124,112,174,0.15)", overflow: "hidden" }}>
                              <div style={{ width: `${share}%`, height: "100%", background: "#7C70AE" }} />
                            </div>
                            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#7C70AE", fontSize: 13 }}>{money2(m.total_cost)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state">No model data for this period.</div>}
        </div>
      </section>

      {/* ── Cost Trend ───────────────────────────────────────────────────── */}
      <section className="panel">
        <div className="section-head"><div><h3>Cost Trend</h3><p style={{ fontSize: 13, color: "var(--gray-500)" }}>Daily cost over {windowPhrase(days)}</p></div></div>
        {trends.length > 0 ? (
          <div style={{ width: "100%", minHeight: 200 }}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="dashCostFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#9E2A97" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#9E2A97" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(124,112,174,0.1)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#6d6782", fontSize: 11 }} {...dateAxisTicks(trends.length)} />
                <YAxis tick={{ fill: "#6d6782", fontSize: 11 }} tickFormatter={v => `$${Number(v).toFixed(4)}`} />
                <Tooltip formatter={v => money(v)} />
                <Area type="monotone" dataKey="total_cost" stroke="#9E2A97" fill="url(#dashCostFill)" strokeWidth={2.5} name="Cost" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="empty-state">No trend data yet.</div>}
      </section>

      {/* ── PII Summary ──────────────────────────────────────────────────── */}
      {piiSummary && (piiSummary.total_pii_requests > 0) && (
        <section
          className="panel"
          onClick={() => setPiiSummaryModal(true)}
          style={{ cursor: "pointer", transition: "box-shadow 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = "0 0 0 2px rgba(158,42,151,0.25)"}
          onMouseLeave={e => e.currentTarget.style.boxShadow = ""}
          title="Click to view PII security details"
        >
          <div className="section-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0 }}>PII Security Summary</h3>
              <span style={{ fontSize: 11, color: "#9E2A97", fontWeight: 600 }}>→ Alerts &amp; Security</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span className="status-pill critical">{num(piiSummary.total_pii_requests)} detected</span>
              {piiSummary.blocked_requests > 0 && <span className="status-pill high">{num(piiSummary.blocked_requests)} blocked</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {piiSummary.pii_type_breakdown?.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>By Type</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {piiSummary.pii_type_breakdown.slice(0, 5).map(item => (
                    <div key={item.pii_type} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                      <span style={{ fontWeight: 600, minWidth: 100 }}>{item.pii_type}</span>
                      <span className="status-pill high">{item.count} hit{item.count !== 1 ? "s" : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {piiSummary.action_breakdown?.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Actions</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {piiSummary.action_breakdown.map(item => (
                    <div
                      key={item.action}
                      onClick={e => openPillAction(item.action, e)}
                      style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer" }}
                      title={`View ${item.action} requests only`}
                    >
                      <span style={{ fontWeight: 600, minWidth: 60 }}>{item.action}</span>
                      <span className={`status-pill ${item.action === "block" ? "critical" : item.action === "mask" ? "medium" : "low"}`}>{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      </div></div>{/* close page-shell + page-body */}

      {activeCard && (
        <KpiModal
          cardKey={activeCard}
          overview={overview}
          byProject={byProject}
          byModel={byModel}
          piiSummary={piiSummary}
          days={days}
          projectNameMap={projectNameMap}
          onClose={() => setActiveCard(null)}
        />
      )}

      {piiSummaryModal && (
        <PiiSummaryModal
          piiSummary={piiSummary}
          overview={overview}
          onClose={() => setPiiSummaryModal(false)}
        />
      )}

      {pillAction && (
        <ActionRequestsModal
          action={pillAction.action}
          rows={pillAction.rows}
          total={pillAction.total}
          loading={pillAction.loading}
          error={pillAction.error}
          onClose={() => setPillAction(null)}
          projectNameMap={projectNameMap}
        />
      )}
    </>
  );
}

export default Dashboard;
