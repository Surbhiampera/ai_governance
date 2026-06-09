import React, { useCallback, useEffect, useState } from "react";
import {
  Area, AreaChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  getProxyOverview, getProxyTrends, getProxyByProject,
  getProxyByModel, getProxyRequests, getProxyPiiSummary,
} from "../api";

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

const RANGE_OPTIONS = [
  { label: "7d", value: 7 }, { label: "14d", value: 14 },
  { label: "30d", value: 30 }, { label: "90d", value: 90 },
];

// ── Key Insights engine ──────────────────────────────────────────────────────
function computeInsights(byProject, byModel, trends, overview, piiSummary, days) {
  const insights = [];
  const grandTotal = byProject.reduce((s, r) => s + Number(r.total_cost || 0), 0);

  // Top project by cost
  if (byProject.length > 0) {
    const top  = [...byProject].sort((a, b) => Number(b.total_cost || 0) - Number(a.total_cost || 0))[0];
    const share = pct(top.total_cost, grandTotal);
    if (share > 0) insights.push({
      text: `${top.project_name || top.project_id || "Unassigned"} contributed ${share}% of total cost.`,
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
        text: `Cost ${change > 0 ? "increased" : "decreased"} ${Math.abs(change)}% in the latter half of the ${days}d window.`,
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

// ── Main Component ───────────────────────────────────────────────────────────
function Dashboard() {
  const [selProject, setSelProject]   = useState("");
  const [selProvider, setSelProvider] = useState("");
  const [selModel, setSelModel]       = useState("");
  const [days, setDays]               = useState(30);

  const [overview, setOverview]       = useState(null);
  const [trends, setTrends]           = useState([]);
  const [byProject, setByProject]     = useState([]);
  const [byModel, setByModel]         = useState([]);
  const [piiSummary, setPiiSummary]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState("");

  const load = useCallback(async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      const [ovRes, trRes, prjRes, modRes, reqRes, piiRes] = await Promise.allSettled([
        getProxyOverview(undefined, days),
        getProxyTrends(undefined, days),
        getProxyByProject(undefined, days),
        getProxyByModel(undefined, days),
        getProxyRequests({ limit: 10 }),
        getProxyPiiSummary(undefined, days),
      ]);
      const val = (r, fb) => r.status === "fulfilled" ? (r.value?.data ?? fb) : fb;
      setOverview(val(ovRes, null));
      setTrends(val(trRes, []));
      setByProject(val(prjRes, []));
      setByModel(val(modRes, []));
      setPiiSummary(val(piiRes, null));
      setError("");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to load data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

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
    <div className="page-shell">

      {/* ── Page title + filters ─────────────────────────────────────────── */}
      <section className="panel" style={{ padding: "18px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>AI Governance Dashboard</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--gray-500)" }}>Executive summary — platform health, usage and costs at a glance.</p>
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
                {r.project_name || r.project_id || "unassigned"}
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
      </section>

      {error && <div className="error-message">{error}</div>}

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <section className="stats-grid stats-grid-overview">
        {[
          { label: "Total Cost",       value: money2(overview?.total_cost),          sub: `${days}d window` },
          { label: "LLM Cost",         value: money2(overview?.llm_cost),            sub: "model inference" },
          { label: "Total Requests",   value: num(overview?.total_requests),         sub: `${num(overview?.completed)} completed` },
          { label: "Total Tokens",     value: fmtTokens(overview?.total_tokens),    sub: "input + output" },
          { label: "Avg Latency",      value: `${num(overview?.avg_latency_ms)} ms`,sub: "end-to-end" },
          { label: "Success Rate",     value: `${overview?.success_rate ?? 0}%`,    sub: "completed / total" },
          { label: "PII Detections",   value: num(overview?.pii_detections),        sub: "this period" },
          { label: "Blocked",          value: num(overview?.blocked),               sub: "by governance policies" },
        ].map(card => (
          <div key={card.label} className="metric-card">
            <div className="metric-eyebrow">{card.label}</div>
            <div className="metric-value">{card.value}</div>
            <div style={{ fontSize: 12, color: "var(--gray-400)", marginTop: 4 }}>{card.sub}</div>
          </div>
        ))}
      </section>

      {/* ── Key Insights ─────────────────────────────────────────────────── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Key Insights</h3>
            <p style={{ fontSize: 13, color: "var(--gray-500)" }}>Automatically derived from your data for the last {days} days.</p>
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
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.project_name || r.project_id || "Unassigned"}</div>
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
        <div className="section-head"><div><h3>Cost Trend</h3><p style={{ fontSize: 13, color: "var(--gray-500)" }}>Daily cost over the last {days} days</p></div></div>
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
                <XAxis dataKey="date" tick={{ fill: "#6d6782", fontSize: 11 }} />
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
        <section className="panel">
          <div className="section-head">
            <div><h3>PII Security Summary</h3></div>
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
                    <div key={item.action} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
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

    </div>
  );
}

export default Dashboard;
