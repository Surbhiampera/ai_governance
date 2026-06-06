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
const money2 = (v) => `$${Number(v || 0).toFixed(2)}`;
const money4 = (v) => `$${Number(v || 0).toFixed(4)}`;
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
        <div className="chart-box" style={{ height: 220 }}>
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
              <div className="chart-box" style={{ height: 200 }}>
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
            <div className="chart-box" style={{ height: 300 }}>
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

      {/* ── Cost by Project ───────────────────────────────────────────────── */}
      {byProject.length > 0 && (
        <section className="panel">
          <div className="section-head"><div><h3>Cost by Project</h3></div></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Org</th>
                  <th>Requests</th>
                  <th>Tokens</th>
                  <th>PII Hits</th>
                  <th>LLM Cost</th>
                  <th>Total Cost</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {byProject.map(r => {
                  const share = grandTotal > 0 ? Math.round((r.total_cost / grandTotal) * 100) : 0;
                  return (
                    <tr key={`${r.org_id}-${r.project_id}`}>
                      <td><strong>{r.project_name || r.project_id || "—"}</strong></td>
                      <td>{r.org_id}</td>
                      <td>{num(r.total_requests)}</td>
                      <td>{num(r.total_tokens)}</td>
                      <td>
                        {r.pii_hits > 0
                          ? <span className="status-pill critical">{r.pii_hits}</span>
                          : <span style={{ color: "var(--gray-400)" }}>0</span>}
                      </td>
                      <td>{money(r.llm_cost)}</td>
                      <td><strong>{money(r.total_cost)}</strong></td>
                      <td style={{ minWidth: 100 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, background: "rgba(124,112,174,0.12)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                            <div style={{ width: `${share}%`, height: "100%", background: "#9E2A97", borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 12, color: "var(--gray-500)" }}>{share}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid rgba(124,112,174,0.2)" }}>
                  <td colSpan={2}><strong>Grand Total</strong></td>
                  <td>{num(byProject.reduce((s, r) => s + r.total_requests, 0))}</td>
                  <td>{num(byProject.reduce((s, r) => s + r.total_tokens, 0))}</td>
                  <td>{num(byProject.reduce((s, r) => s + r.pii_hits, 0))}</td>
                  <td>{money(byProject.reduce((s, r) => s + r.llm_cost, 0))}</td>
                  <td><strong>{money(grandTotal)}</strong></td>
                  <td><span style={{ fontSize: 12, color: "var(--gray-500)" }}>100%</span></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* ── Usage by Project & Model ─────────────────────────────────────── */}
      {byProjectModel.length > 0 && (() => {
        const grouped = byProjectModel.reduce((acc, r) => {
          const key = r.project_id || "unassigned";
          if (!acc[key]) acc[key] = { project_name: r.project_name, rows: [] };
          acc[key].rows.push(r);
          return acc;
        }, {});
        const uniqueModels = [...new Set(byProjectModel.map(r => r.model_name).filter(Boolean))];

        return (
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>Usage by Project &amp; Model</h3>
                <p style={{ color: "var(--gray-500)", fontSize: 13 }}>
                  Input / output tokens and cost for every model, broken down per project.
                </p>
              </div>
            </div>

            {/* Model legend */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {uniqueModels.map(m => (
                <span key={m} style={{
                  fontSize: 12, padding: "3px 12px", borderRadius: 20,
                  background: `${modelBadgeColor(m)}15`,
                  border: `1px solid ${modelBadgeColor(m)}40`,
                  color: modelBadgeColor(m), fontWeight: 600, fontFamily: "monospace",
                }}>{m}</span>
              ))}
            </div>

            {Object.entries(grouped).map(([pid, pdata]) => {
              const projCost   = pdata.rows.reduce((s, r) => s + (r.total_cost  || 0), 0);
              const projTokens = pdata.rows.reduce((s, r) => s + (r.total_tokens || 0), 0);
              return (
                <div key={pid} style={{
                  border: "1px solid var(--border)", borderRadius: 10,
                  marginBottom: 16, overflow: "hidden",
                }}>
                  <div style={{
                    padding: "10px 16px", background: "var(--gray-50,#f9fafb)",
                    borderBottom: "1px solid var(--border)",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>
                      {pdata.project_name || pid}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--gray-500)" }}>
                      {fmtTokens(projTokens)} tokens &nbsp;·&nbsp; {money(projCost)}
                    </span>
                  </div>
                  <div className="table-wrap" style={{ margin: 0 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Model</th>
                          <th style={{ textAlign: "right" }}>Requests</th>
                          <th style={{ textAlign: "right" }}>Input Tokens</th>
                          <th style={{ textAlign: "right" }}>Output Tokens</th>
                          <th style={{ textAlign: "right" }}>Total Tokens</th>
                          <th style={{ textAlign: "right" }}>Input Cost</th>
                          <th style={{ textAlign: "right" }}>Output Cost</th>
                          <th style={{ textAlign: "right" }}>Total Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pdata.rows.map((r, i) => (
                          <tr key={i}>
                            <td>
                              <span style={{
                                fontSize: 12, padding: "2px 10px", borderRadius: 20,
                                background: `${modelBadgeColor(r.model_name)}15`,
                                border: `1px solid ${modelBadgeColor(r.model_name)}40`,
                                color: modelBadgeColor(r.model_name),
                                fontWeight: 600, fontFamily: "monospace",
                              }}>{r.model_name}</span>
                            </td>
                            <td style={{ textAlign: "right" }}>{num(r.total_requests)}</td>
                            <td style={{ textAlign: "right" }}>{fmtTokens(r.input_tokens)}</td>
                            <td style={{ textAlign: "right" }}>{fmtTokens(r.output_tokens)}</td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtTokens(r.total_tokens)}</td>
                            <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12 }}>{money(r.input_cost)}</td>
                            <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12 }}>{money(r.output_cost)}</td>
                            <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#9E2A97" }}>
                              {money(r.total_cost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: "2px solid rgba(124,112,174,0.2)" }}>
                          <td><strong>Total</strong></td>
                          <td style={{ textAlign: "right" }}>{num(pdata.rows.reduce((s, r) => s + r.total_requests, 0))}</td>
                          <td style={{ textAlign: "right" }}>{fmtTokens(pdata.rows.reduce((s, r) => s + r.input_tokens, 0))}</td>
                          <td style={{ textAlign: "right" }}>{fmtTokens(pdata.rows.reduce((s, r) => s + r.output_tokens, 0))}</td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtTokens(projTokens)}</td>
                          <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12 }}>{money(pdata.rows.reduce((s, r) => s + r.input_cost, 0))}</td>
                          <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12 }}>{money(pdata.rows.reduce((s, r) => s + r.output_cost, 0))}</td>
                          <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#9E2A97" }}>
                            {money(projCost)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })()}

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

export default Cost;
