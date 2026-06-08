import React, { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getProxyOverview,
  getProxyTrends,
  getProxyByProject,
  getProxyByModel,
  getProxyByProjectModel,
  getProxyRequests,
  getTracingOrgs,
  getTracingProjects,
} from "../api";

const CHART_COLORS = ["#9E2A97", "#7C70AE", "#b565b0", "#9a8fbf", "#c97dc4", "#3FB6D4"];
const money  = (v) => `$${Number(v || 0).toFixed(6)}`;
const money4 = (v) => `$${Number(v || 0).toFixed(4)}`;
const money2 = (v) => {
  const n = Number(v || 0);
  return n > 0 && n < 0.01 ? `$${n.toFixed(6)}` : `$${n.toFixed(2)}`;
};
const num    = (v) => Number(v || 0).toLocaleString();

const MODEL_COLOR_MAP = {
  "gpt-4o-mini":            "#6366f1",
  "gpt-5-nano":             "#8b5cf6",
  "text-embedding-3-small": "#3b82f6",
  "gpt-4o":                 "#9E2A97",
  "gpt-5":                  "#ec4899",
};
function modelBadgeColor(name = "") {
  for (const [k, c] of Object.entries(MODEL_COLOR_MAP)) {
    if (name.includes(k)) return c;
  }
  return "#7C70AE";
}
function fmtTokens(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

const RANGE_OPTIONS = [
  { label: "7d",  value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

// ── Expand chevron icon ─────────────────────────────────────────────────────
function ChevronIcon({ open }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5"
      style={{ transition: "transform 0.18s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── Token bar (visual split of input vs output) ─────────────────────────────
function TokenBar({ inputTokens, outputTokens }) {
  const total = (inputTokens || 0) + (outputTokens || 0);
  if (!total) return <span style={{ color: "var(--gray-400)" }}>—</span>;
  const inputPct = Math.round(((inputTokens || 0) / total) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", gap: 4, fontSize: 11, color: "var(--gray-500)" }}>
        <span style={{ color: "#7C70AE" }}>{fmtTokens(inputTokens)} in</span>
        <span>/</span>
        <span style={{ color: "#9E2A97" }}>{fmtTokens(outputTokens)} out</span>
      </div>
      <div style={{ display: "flex", height: 5, borderRadius: 4, overflow: "hidden", background: "rgba(124,112,174,0.12)" }}>
        <div style={{ width: `${inputPct}%`, background: "#7C70AE" }} />
        <div style={{ flex: 1, background: "#9E2A97" }} />
      </div>
    </div>
  );
}

function Cost() {
  const [orgs, setOrgs]               = useState([]);
  const [projects, setProjects]       = useState([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [days, setDays]               = useState(30);

  const [overview, setOverview]   = useState(null);
  const [trends, setTrends]       = useState([]);
  const [byProject, setByProject]           = useState([]);
  const [byModel, setByModel]               = useState([]);
  const [byProjectModel, setByProjectModel] = useState([]);
  const [requests, setRequests]   = useState([]);
  const [reqTotal, setReqTotal]   = useState(0);
  const [reqPage, setReqPage]     = useState(0);
  const PAGE_SIZE = 25;

  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  // Track which project rows are expanded
  const [expandedProjects, setExpandedProjects] = useState(new Set());

  // Load orgs on mount
  useEffect(() => {
    getTracingOrgs().then(r => setOrgs(r.data || [])).catch(() => {});
  }, []);

  // Load projects when org changes
  useEffect(() => {
    if (!selectedOrg) { setProjects([]); setSelectedProject(""); return; }
    getTracingProjects(selectedOrg).then(r => setProjects(r.data || [])).catch(() => setProjects([]));
    setSelectedProject("");
  }, [selectedOrg]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const org  = selectedOrg || undefined;
      const proj = selectedProject || undefined;

      const [ovRes, trRes, prjRes, modRes, pmRes, reqRes] = await Promise.allSettled([
        getProxyOverview(org, days),
        getProxyTrends(org, days),
        getProxyByProject(org, days),
        getProxyByModel(org, days),
        getProxyByProjectModel(org, days),
        getProxyRequests({ org_id: org, project_id: proj, limit: PAGE_SIZE, offset: reqPage * PAGE_SIZE }),
      ]);

      const val = (r, fb) => r.status === "fulfilled" ? (r.value?.data ?? fb) : fb;
      setOverview(val(ovRes, null));
      setTrends(val(trRes, []));
      setByProject(val(prjRes, []));
      setByModel(val(modRes, []));
      setByProjectModel(val(pmRes, []));
      const reqData = val(reqRes, { items: [], total: 0 });
      setRequests(reqData.items || []);
      setReqTotal(reqData.total || 0);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to load cost data.");
    } finally {
      setLoading(false);
    }
  }, [selectedOrg, selectedProject, days, reqPage]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading">Loading proxy cost data…</div>;

  const grandTotal = byProject.reduce((s, r) => s + Number(r.total_cost || 0), 0);
  const totalPages = Math.ceil(reqTotal / PAGE_SIZE);

  // Build per-project token/cost aggregates from byProjectModel for the detail columns
  const projectModelMap = byProjectModel.reduce((acc, r) => {
    const key = r.project_id || "unassigned";
    if (!acc[key]) {
      acc[key] = {
        input_tokens: 0, output_tokens: 0,
        input_cost: 0, output_cost: 0,
        rows: [],
      };
    }
    acc[key].input_tokens  += Number(r.input_tokens  || 0);
    acc[key].output_tokens += Number(r.output_tokens || 0);
    acc[key].input_cost    += Number(r.input_cost    || 0);
    acc[key].output_cost   += Number(r.output_cost   || 0);
    acc[key].rows.push(r);
    return acc;
  }, {});

  function toggleProject(pid) {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  }

  return (
    <div className="page-shell">

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <section className="panel" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Cost</span>

          <select
            value={selectedOrg}
            onChange={e => setSelectedOrg(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13 }}
          >
            <option value="">All Orgs</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name || o.id}</option>)}
          </select>

          {selectedOrg && (
            <select
              value={selectedProject}
              onChange={e => setSelectedProject(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13 }}
            >
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
            </select>
          )}

          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`btn ${days === opt.value ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="error-message">{error}</div>}

      {/* ── KPI Summary ───────────────────────────────────────────────────── */}
      <section className="stats-grid stats-grid-overview">
        {[
          { label: "Total Cost",        value: money2(overview?.total_cost),     sub: `${days}d window` },
          { label: "LLM Cost",          value: money2(overview?.llm_cost),       sub: "model inference only" },
          { label: "Total Requests",    value: num(overview?.total_requests),    sub: `${num(overview?.completed)} completed` },
          { label: "Avg Cost/Request",  value: money4((overview?.total_cost || 0) / Math.max(overview?.total_requests || 1, 1)), sub: "per proxied call" },
          { label: "Total Tokens",      value: num(overview?.total_tokens),      sub: "input + output" },
          { label: "Prompt Tokens",     value: num(overview?.prompt_tokens),     sub: "input" },
          { label: "Completion Tokens", value: num(overview?.completion_tokens), sub: "output" },
          { label: "Avg Latency",       value: `${num(overview?.avg_latency_ms)} ms`, sub: "end-to-end proxy" },
        ].map(card => (
          <div key={card.label} className="metric-card">
            <div className="metric-eyebrow">{card.label}</div>
            <div className="metric-value">{card.value}</div>
            <div style={{ fontSize: 12, color: "var(--gray-400)", marginTop: 4 }}>{card.sub}</div>
          </div>
        ))}
      </section>

      {/* ── Cost Trend ───────────────────────────────────────────────────── */}
      <section className="panel">
        <div className="section-head"><div><h3>Daily Cost Trend</h3></div></div>
        <div className="chart-box" style={{ height: 220, width: "100%", minHeight: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trends}>
              <defs>
                <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#9E2A97" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#9E2A97" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(124,112,174,0.12)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#6d6782", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6d6782", fontSize: 11 }} tickFormatter={v => `$${Number(v).toFixed(4)}`} />
              <Tooltip formatter={v => money(v)} />
              <Area type="monotone" dataKey="total_cost" stroke="#9E2A97" fill="url(#costFill)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── By Model + By Provider ────────────────────────────────────────── */}
      <section className="two-column">
        <div className="panel">
          <div className="section-head"><div><h3>Cost by Model</h3></div></div>
          {byModel.length > 0 ? (
            <>
              <div className="chart-box" style={{ height: 200, width: "100%", minHeight: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byModel.slice(0, 8)}>
                    <CartesianGrid stroke="rgba(124,112,174,0.12)" vertical={false} />
                    <XAxis dataKey="model_name" tick={{ fill: "#6d6782", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#6d6782", fontSize: 10 }} tickFormatter={v => `$${Number(v).toFixed(4)}`} />
                    <Tooltip formatter={(v, name) => name === "total_cost" ? money(v) : num(v)} />
                    <Bar dataKey="total_cost" fill="#9E2A97" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Provider</th>
                      <th>Requests</th>
                      <th>Tokens</th>
                      <th>Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byModel.map(r => (
                      <tr key={`${r.model_name}-${r.provider}`}>
                        <td><strong>{r.model_name}</strong></td>
                        <td>{r.provider}</td>
                        <td>{num(r.total_requests)}</td>
                        <td>{num(r.total_tokens)}</td>
                        <td><strong>{money(r.total_cost)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty-state">No model cost data yet.</div>
          )}
        </div>

        <div className="panel">
          <div className="section-head"><div><h3>Cost Mix</h3></div></div>
          {byModel.length > 0 ? (
            <div className="chart-box" style={{ height: 300, width: "100%", minHeight: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byModel}
                    dataKey="total_cost"
                    nameKey="model_name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={60}
                  >
                    {byModel.map((entry, i) => (
                      <Cell key={entry.model_name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => money(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state">No model data yet.</div>
          )}
        </div>
      </section>

      {/* ── Project Breakdown (expandable) ───────────────────────────────── */}
      {byProject.length > 0 && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>Project Breakdown</h3>
              <p style={{ color: "var(--gray-500)", fontSize: 13 }}>
                Click a row to expand per-model token and cost details.
              </p>
            </div>
            <span style={{ fontSize: 13, color: "var(--gray-500)" }}>
              {byProject.length} project{byProject.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {byProject.map(r => {
              const pid   = r.project_id || "unassigned";
              const pm    = projectModelMap[pid] || {};
              const share = grandTotal > 0 ? ((r.total_cost / grandTotal) * 100).toFixed(1) : 0;
              const isOpen = expandedProjects.has(pid);
              const infraCost = Number(r.total_cost || 0) - Number(r.llm_cost || 0);
              const inputTokens  = pm.input_tokens  || 0;
              const outputTokens = pm.output_tokens || 0;
              const totalTokens  = inputTokens + outputTokens || Number(r.total_tokens || 0);

              return (
                <div
                  key={pid}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    overflow: "hidden",
                    transition: "box-shadow 0.15s",
                  }}
                >
                  {/* ── Project summary row ───────────────────────────────── */}
                  <div
                    onClick={() => toggleProject(pid)}
                    style={{
                      padding: "14px 18px",
                      cursor: "pointer",
                      background: isOpen ? "rgba(158,42,151,0.04)" : "var(--surface)",
                      borderBottom: isOpen ? "1px solid var(--border)" : "none",
                      display: "grid",
                      gridTemplateColumns: "22px 1fr auto",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    {/* Chevron */}
                    <span style={{ color: "var(--gray-400)", display: "flex" }}>
                      <ChevronIcon open={isOpen} />
                    </span>

                    {/* Main info grid */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                      gap: "10px 24px",
                      alignItems: "start",
                    }}>
                      {/* Project name */}
                      <div style={{ gridColumn: "1 / -1", marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>
                          {r.project_name || pid}
                        </span>
                        <span style={{
                          marginLeft: 10, fontSize: 11, color: "var(--gray-400)",
                          fontFamily: "monospace",
                        }}>
                          {r.org_id}
                        </span>
                        {r.pii_hits > 0 && (
                          <span className="status-pill critical" style={{ marginLeft: 8 }}>
                            {r.pii_hits} PII
                          </span>
                        )}
                      </div>

                      <StatCell label="Requests"      value={num(r.total_requests)} />
                      <StatCell label="Input Tokens"  value={fmtTokens(inputTokens)} accent="#7C70AE" />
                      <StatCell label="Output Tokens" value={fmtTokens(outputTokens)} accent="#9E2A97" />
                      <StatCell label="Total Tokens"  value={fmtTokens(totalTokens)} bold />
                      <StatCell label="Input Cost"    value={money(pm.input_cost)}  mono />
                      <StatCell label="Output Cost"   value={money(pm.output_cost)} mono />
                      <StatCell label="LLM Cost"      value={money(r.llm_cost)}     mono />
                      <StatCell label="Infra Cost"    value={money(infraCost)}       mono accent="#3FB6D4" />
                      <StatCell label="Total Cost"    value={money2(r.total_cost)}  mono bold accent="#9E2A97" />
                    </div>

                    {/* Share badge + bar */}
                    <div style={{ textAlign: "right", minWidth: 80 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#9E2A97" }}>
                        {share}%
                      </div>
                      <div style={{
                        marginTop: 4, height: 5, borderRadius: 4,
                        background: "rgba(124,112,174,0.12)", overflow: "hidden",
                      }}>
                        <div style={{
                          width: `${share}%`, height: "100%",
                          background: "#9E2A97", borderRadius: 4,
                        }} />
                      </div>
                      <div style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 4 }}>
                        of total
                      </div>
                    </div>
                  </div>

                  {/* ── Expanded per-model detail ─────────────────────────── */}
                  {isOpen && (
                    <div>
                      {/* Token distribution bar */}
                      {(inputTokens + outputTokens) > 0 && (
                        <div style={{ padding: "10px 18px", background: "rgba(124,112,174,0.04)", borderBottom: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ fontSize: 12, color: "var(--gray-500)", whiteSpace: "nowrap" }}>
                              Token split:
                            </span>
                            <div style={{ flex: 1, height: 10, borderRadius: 5, overflow: "hidden", display: "flex" }}>
                              <div style={{
                                width: `${Math.round((inputTokens / (inputTokens + outputTokens)) * 100)}%`,
                                background: "#7C70AE",
                              }} />
                              <div style={{ flex: 1, background: "#9E2A97" }} />
                            </div>
                            <span style={{ fontSize: 12, color: "#7C70AE", whiteSpace: "nowrap" }}>
                              {fmtTokens(inputTokens)} input ({Math.round((inputTokens / (inputTokens + outputTokens)) * 100)}%)
                            </span>
                            <span style={{ fontSize: 12, color: "#9E2A97", whiteSpace: "nowrap" }}>
                              {fmtTokens(outputTokens)} output ({Math.round((outputTokens / (inputTokens + outputTokens)) * 100)}%)
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Per-model table */}
                      {pm.rows && pm.rows.length > 0 ? (
                        <div className="table-wrap" style={{ margin: 0 }}>
                          <table>
                            <thead>
                              <tr style={{ background: "rgba(124,112,174,0.06)" }}>
                                <th>Model</th>
                                <th style={{ textAlign: "right" }}>Requests</th>
                                <th style={{ textAlign: "right" }}>Input Tokens</th>
                                <th style={{ textAlign: "right" }}>Output Tokens</th>
                                <th style={{ textAlign: "right" }}>Total Tokens</th>
                                <th style={{ textAlign: "right" }}>Input Cost</th>
                                <th style={{ textAlign: "right" }}>Output Cost</th>
                                <th style={{ textAlign: "right" }}>Total Cost</th>
                                <th style={{ textAlign: "right" }}>Avg Cost/Req</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pm.rows.map((mr, i) => {
                                const avgCostPerReq = mr.total_requests
                                  ? Number(mr.total_cost || 0) / Number(mr.total_requests)
                                  : 0;
                                return (
                                  <tr key={i}>
                                    <td>
                                      <span style={{
                                        fontSize: 12, padding: "2px 10px", borderRadius: 20,
                                        background: `${modelBadgeColor(mr.model_name)}15`,
                                        border: `1px solid ${modelBadgeColor(mr.model_name)}40`,
                                        color: modelBadgeColor(mr.model_name),
                                        fontWeight: 600, fontFamily: "monospace",
                                      }}>
                                        {mr.model_name}
                                      </span>
                                    </td>
                                    <td style={{ textAlign: "right" }}>{num(mr.total_requests)}</td>
                                    <td style={{ textAlign: "right", color: "#7C70AE", fontWeight: 500 }}>
                                      {fmtTokens(mr.input_tokens)}
                                    </td>
                                    <td style={{ textAlign: "right", color: "#9E2A97", fontWeight: 500 }}>
                                      {fmtTokens(mr.output_tokens)}
                                    </td>
                                    <td style={{ textAlign: "right", fontWeight: 600 }}>
                                      {fmtTokens(mr.total_tokens)}
                                    </td>
                                    <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12 }}>
                                      {money(mr.input_cost)}
                                    </td>
                                    <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12 }}>
                                      {money(mr.output_cost)}
                                    </td>
                                    <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#9E2A97" }}>
                                      {money(mr.total_cost)}
                                    </td>
                                    <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 11, color: "var(--gray-500)" }}>
                                      {money4(avgCostPerReq)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr style={{ borderTop: "2px solid rgba(124,112,174,0.2)", background: "rgba(158,42,151,0.03)" }}>
                                <td><strong>Subtotal</strong></td>
                                <td style={{ textAlign: "right" }}>{num(pm.rows.reduce((s, x) => s + (x.total_requests || 0), 0))}</td>
                                <td style={{ textAlign: "right", color: "#7C70AE", fontWeight: 600 }}>{fmtTokens(pm.input_tokens)}</td>
                                <td style={{ textAlign: "right", color: "#9E2A97", fontWeight: 600 }}>{fmtTokens(pm.output_tokens)}</td>
                                <td style={{ textAlign: "right", fontWeight: 700 }}>{fmtTokens(pm.input_tokens + pm.output_tokens)}</td>
                                <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{money(pm.input_cost)}</td>
                                <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{money(pm.output_cost)}</td>
                                <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#9E2A97" }}>{money(r.total_cost)}</td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : (
                        <div style={{ padding: "20px 18px", color: "var(--gray-500)", fontSize: 13 }}>
                          No per-model detail available for this project.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Grand total footer */}
            <div style={{
              padding: "12px 18px",
              border: "1px solid rgba(158,42,151,0.3)",
              borderRadius: 10,
              background: "rgba(158,42,151,0.04)",
              display: "grid",
              gridTemplateColumns: "22px 1fr auto",
              alignItems: "center",
              gap: 12,
            }}>
              <span />
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: "10px 24px",
              }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#9E2A97" }}>Grand Total</span>
                  <span style={{ marginLeft: 10, fontSize: 12, color: "var(--gray-500)" }}>
                    {byProject.length} projects
                  </span>
                </div>
                <StatCell label="Requests" value={num(byProject.reduce((s, r) => s + (r.total_requests || 0), 0))} bold />
                <StatCell
                  label="Input Tokens"
                  value={fmtTokens(Object.values(projectModelMap).reduce((s, pm) => s + pm.input_tokens, 0))}
                  accent="#7C70AE" bold
                />
                <StatCell
                  label="Output Tokens"
                  value={fmtTokens(Object.values(projectModelMap).reduce((s, pm) => s + pm.output_tokens, 0))}
                  accent="#9E2A97" bold
                />
                <StatCell
                  label="Total Tokens"
                  value={fmtTokens(byProject.reduce((s, r) => s + (r.total_tokens || 0), 0))}
                  bold
                />
                <StatCell
                  label="LLM Cost"
                  value={money(byProject.reduce((s, r) => s + (r.llm_cost || 0), 0))}
                  mono bold
                />
                <StatCell
                  label="Total Cost"
                  value={money2(grandTotal)}
                  mono bold accent="#9E2A97"
                />
              </div>
              <div style={{ textAlign: "right", minWidth: 80 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#9E2A97" }}>100%</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Request Log ──────────────────────────────────────────────────── */}
      <section className="panel">
        <div className="section-head">
          <div><h3>Request Cost Log</h3><p style={{ color: "var(--gray-500)", fontSize: 13 }}>{num(reqTotal)} total</p></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Org</th>
                <th>Project</th>
                <th>Model</th>
                <th>Status</th>
                <th>Prompt Tokens</th>
                <th>Completion Tokens</th>
                <th>LLM Cost</th>
                <th>Total Cost</th>
                <th>PII</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", color: "var(--gray-500)" }}>
                    No requests yet.
                  </td>
                </tr>
              ) : null}
              {requests.map(row => (
                <tr key={row.request_id}>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>{row.request_id}</td>
                  <td>{row.org_id || "—"}</td>
                  <td>{row.project_id || "—"}</td>
                  <td><strong>{row.model_name || "—"}</strong></td>
                  <td>
                    <span className={`status-pill ${
                      row.request_status === "completed" ? "low" :
                      row.request_status === "blocked"   ? "critical" :
                      row.request_status === "failed"    ? "high" : "medium"
                    }`}>
                      {row.request_status}
                    </span>
                  </td>
                  <td>{num(row.prompt_tokens)}</td>
                  <td>{num(row.completion_tokens)}</td>
                  <td>{money(row.llm_cost)}</td>
                  <td><strong>{money(row.total_cost)}</strong></td>
                  <td>
                    {row.pii_detected
                      ? <span className="status-pill critical">{(row.pii_types || []).join(", ")}</span>
                      : <span style={{ color: "var(--gray-400)" }}>none</span>}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--gray-500)" }}>
                    {row.received_at ? new Date(row.received_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
            <button
              className="btn btn-ghost"
              disabled={reqPage === 0}
              onClick={() => setReqPage(p => p - 1)}
            >
              ← Prev
            </button>
            <span style={{ padding: "6px 12px", fontSize: 13 }}>
              Page {reqPage + 1} of {totalPages}
            </span>
            <button
              className="btn btn-ghost"
              disabled={reqPage >= totalPages - 1}
              onClick={() => setReqPage(p => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Small stat cell used inside project rows ────────────────────────────────
function StatCell({ label, value, bold, mono, accent }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--gray-400)", marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 13,
        fontWeight: bold ? 700 : 500,
        fontFamily: mono ? "monospace" : undefined,
        color: accent || "var(--text)",
      }}>
        {value}
      </div>
    </div>
  );
}

export default Cost;
