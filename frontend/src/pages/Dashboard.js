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
  getProxyRequests,
  getProxyPiiSummary,
  getTracingOrgs,
} from "../api";

const CHART_COLORS = ["#9E2A97", "#7C70AE", "#b565b0", "#9a8fbf", "#c97dc4", "#3FB6D4"];
const money = (v) => `$${Number(v || 0).toFixed(4)}`;
const money2 = (v) => `$${Number(v || 0).toFixed(2)}`;
const num = (v) => Number(v || 0).toLocaleString();

const RANGE_OPTIONS = [
  { label: "7d",  value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

function Dashboard() {
  const [orgs, setOrgs]           = useState([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [days, setDays]           = useState(30);
  const [overview, setOverview]   = useState(null);
  const [trends, setTrends]       = useState([]);
  const [byProject, setByProject] = useState([]);
  const [byModel, setByModel]     = useState([]);
  const [requests, setRequests]   = useState([]);
  const [piiSummary, setPiiSummary] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const org = selectedOrg || undefined;
      const [ovRes, trRes, prjRes, modRes, reqRes, piiRes] = await Promise.allSettled([
        getProxyOverview(org, days),
        getProxyTrends(org, days),
        getProxyByProject(org, days),
        getProxyByModel(org, days),
        getProxyRequests({ org_id: org, limit: 20 }),
        getProxyPiiSummary(org, days),
      ]);

      const val = (r, fb) => r.status === "fulfilled" ? (r.value?.data ?? fb) : fb;
      setOverview(val(ovRes, null));
      setTrends(val(trRes, []));
      setByProject(val(prjRes, []));
      setByModel(val(modRes, []));
      setRequests(val(reqRes, { items: [] }).items || []);
      setPiiSummary(val(piiRes, null));
      setError("");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to load proxy data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedOrg, days]);

  useEffect(() => {
    getTracingOrgs().then(r => setOrgs(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading">Loading proxy governance data…</div>;

  const grandTotal = byProject.reduce((s, r) => s + Number(r.total_cost || 0), 0);

  return (
    <div className="page-shell">

      {/* ── Header + Filters ─────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-card">
          <h2>AI Governance — Proxy Dashboard</h2>
          <p style={{ color: "rgba(255,255,255,0.75)", marginTop: 6, fontSize: 14 }}>
            All data sourced from the proxy wrapper layer only.
          </p>

          <div className="action-row" style={{ marginTop: 16, flexWrap: "wrap", gap: 8 }}>
            <select
              value={selectedOrg}
              onChange={e => setSelectedOrg(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 13 }}
            >
              <option value="">All Orgs</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name || o.id}</option>)}
            </select>

            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`btn ${days === opt.value ? "btn-primary" : "btn-ghost"}`}
                style={
                  days === opt.value
                    ? { background: "#fff", color: "#9E2A97", fontWeight: 600 }
                    : { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)",
                        border: "1px solid rgba(255,255,255,0.25)" }
                }
                onClick={() => setDays(opt.value)}
              >
                {opt.label}
              </button>
            ))}

            <button
              type="button"
              className="btn btn-ghost"
              style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)",
                border: "1px solid rgba(255,255,255,0.25)" }}
              onClick={() => load(true)}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {/* KPI chips */}
          <div className="hero-metrics" style={{ marginTop: 18 }}>
            <div className="hero-chip">
              <span>Total Requests</span>
              <strong>{num(overview?.total_requests)}</strong>
            </div>
            <div className="hero-chip">
              <span>Total Cost</span>
              <strong>{money2(overview?.total_cost)}</strong>
            </div>
            <div className="hero-chip">
              <span>Total Tokens</span>
              <strong>{num(overview?.total_tokens)}</strong>
            </div>
            <div className="hero-chip">
              <span>Success Rate</span>
              <strong>{overview?.success_rate ?? 0}%</strong>
            </div>
          </div>
        </div>

        {/* Quick stats panel */}
        <div className="panel">
          <div className="section-head">
            <div><h2>Proxy Stats · {days}d</h2></div>
          </div>
          <div className="pill-row">
            {[
              { label: "Completed",  value: num(overview?.completed) },
              { label: "Blocked",    value: num(overview?.blocked) },
              { label: "PII Hits",   value: num(overview?.pii_detections) },
              { label: "Avg Latency",value: `${num(overview?.avg_latency_ms)} ms` },
            ].map(p => (
              <div key={p.label} className="pill">{p.label} <span className="highlight">{p.value}</span></div>
            ))}
          </div>
          <div className="stack" style={{ marginTop: 16 }}>
            <div className="list-item">
              <strong>LLM Cost</strong>
              <div className="list-meta">{money2(overview?.llm_cost)}</div>
            </div>
            <div className="list-item">
              <strong>Prompt Tokens</strong>
              <div className="list-meta">{num(overview?.prompt_tokens)}</div>
            </div>
            <div className="list-item">
              <strong>Completion Tokens</strong>
              <div className="list-meta">{num(overview?.completion_tokens)}</div>
            </div>
          </div>
        </div>
      </section>

      {error && <div className="error-message">{error}</div>}

      {/* ── Trend Charts ──────────────────────────────────────────────────── */}
      <section className="two-column">
        <div className="panel">
          <div className="section-head"><div><h3>Cost Trend</h3></div></div>
          <div className="chart-box">
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
                <YAxis tick={{ fill: "#6d6782", fontSize: 11 }} tickFormatter={v => `$${v.toFixed(3)}`} />
                <Tooltip formatter={v => money(v)} />
                <Area type="monotone" dataKey="total_cost" stroke="#9E2A97" fill="url(#costFill)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="section-head"><div><h3>Token Usage Trend</h3></div></div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="tokenFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3FB6D4" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#3FB6D4" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(124,112,174,0.12)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#6d6782", fontSize: 11 }} />
                <YAxis tick={{ fill: "#6d6782", fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip formatter={v => num(v)} />
                <Area type="monotone" dataKey="total_tokens" stroke="#3FB6D4" fill="url(#tokenFill)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-head"><div><h3>Request Volume Trend</h3></div></div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="reqFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10B981" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(124,112,174,0.12)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#6d6782", fontSize: 11 }} />
                <YAxis tick={{ fill: "#6d6782", fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="total_requests" stroke="#10B981" fill="url(#reqFill)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="section-head"><div><h3>Latency Trend</h3></div></div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="latFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#F2A33C" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#F2A33C" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(124,112,174,0.12)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#6d6782", fontSize: 11 }} />
                <YAxis tick={{ fill: "#6d6782", fontSize: 11 }} unit=" ms" />
                <Tooltip formatter={v => `${Number(v).toFixed(0)} ms`} />
                <Area type="monotone" dataKey="avg_latency_ms" stroke="#F2A33C" fill="url(#latFill)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ── Cost by Model + PII Summary ────────────────────────────────────── */}
      <section className="two-column">
        <div className="panel">
          <div className="section-head"><div><h3>Cost by Model</h3></div></div>
          {byModel.length > 0 ? (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byModel.slice(0, 8)}>
                  <CartesianGrid stroke="rgba(124,112,174,0.12)" vertical={false} />
                  <XAxis dataKey="model_name" tick={{ fill: "#6d6782", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#6d6782", fontSize: 11 }} tickFormatter={v => `$${v.toFixed(3)}`} />
                  <Tooltip formatter={(v, name) => name === "total_cost" ? money(v) : num(v)} />
                  <Bar dataKey="total_cost" fill="#9E2A97" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="total_tokens" fill="#7C70AE" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state">No model data yet. Send requests through the proxy.</div>
          )}
        </div>

        <div className="panel">
          <div className="section-head"><div><h3>PII Security Summary</h3></div></div>
          {piiSummary ? (
            <div>
              <div className="pill-row" style={{ marginBottom: 16 }}>
                <div className="pill">
                  PII Detected <span className="highlight">{num(piiSummary.total_pii_requests)}</span>
                </div>
                <div className="pill">
                  Blocked <span className="highlight" style={{ color: "#ef4444" }}>{num(piiSummary.blocked_requests)}</span>
                </div>
              </div>

              {piiSummary.pii_type_breakdown?.length > 0 && (
                <>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "var(--gray-600)" }}>
                    By PII Type
                  </div>
                  <div className="list-grid">
                    {piiSummary.pii_type_breakdown.map(item => (
                      <div key={item.pii_type} className="list-item">
                        <strong>{item.pii_type}</strong>
                        <div className="list-meta">
                          <span className="status-pill high">{item.count} hit{item.count !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {piiSummary.action_breakdown?.length > 0 && (
                <>
                  <div style={{ fontWeight: 600, fontSize: 13, marginTop: 16, marginBottom: 8, color: "var(--gray-600)" }}>
                    Actions Taken
                  </div>
                  <div className="list-grid">
                    {piiSummary.action_breakdown.map(item => (
                      <div key={item.action} className="list-item">
                        <strong>{item.action}</strong>
                        <div className="list-meta">
                          <span className={`status-pill ${item.action === "block" ? "critical" : item.action === "mask" ? "medium" : "low"}`}>
                            {item.count}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {piiSummary.total_pii_requests === 0 && (
                <div className="empty-state">No PII detections in this period.</div>
              )}
            </div>
          ) : (
            <div className="empty-state">No PII data yet.</div>
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
            </table>
          </div>
        </section>
      )}

      {/* ── Recent Proxy Requests ─────────────────────────────────────────── */}
      <section className="panel">
        <div className="section-head"><div><h3>Recent Proxy Requests</h3></div></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Org</th>
                <th>Project</th>
                <th>Provider</th>
                <th>Model</th>
                <th>Status</th>
                <th>Prompt Tokens</th>
                <th>Completion Tokens</th>
                <th>Cost</th>
                <th>PII</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", color: "var(--gray-500)" }}>
                    No proxy requests yet. External teams need to point their AI client at the proxy endpoint.
                  </td>
                </tr>
              ) : null}
              {requests.map(row => (
                <tr key={row.request_id}>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>{row.request_id}</td>
                  <td>{row.org_id || "—"}</td>
                  <td>{row.project_id || "—"}</td>
                  <td>{row.provider || "—"}</td>
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
                  <td>{money(row.total_cost)}</td>
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
      </section>
    </div>
  );
}

export default Dashboard;
