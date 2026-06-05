import React, { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getProxyRequests,
  getProxyPiiSummary,
  getProxyOverview,
  getTracingOrgs,
} from "../api";

const num   = (v) => Number(v || 0).toLocaleString();
const money = (v) => `$${Number(v || 0).toFixed(6)}`;

const RANGE_OPTIONS = [
  { label: "7d",  value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

const ACTION_COLOR = {
  block: "critical",
  mask:  "high",
  alert: "medium",
  allow: "low",
};

function AlertsSecurity() {
  const [orgs, setOrgs]               = useState([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [days, setDays]               = useState(30);

  const [overview, setOverview]         = useState(null);
  const [piiSummary, setPiiSummary]     = useState(null);
  const [piiRequests, setPiiRequests]   = useState([]);
  const [piiTotal, setPiiTotal]         = useState(0);
  const [blockedRequests, setBlockedRequests] = useState([]);
  const [blockedTotal, setBlockedTotal] = useState(0);

  const [activeTab, setActiveTab]   = useState("pii");
  const [piiPage, setPiiPage]       = useState(0);
  const [blockedPage, setBlockedPage] = useState(0);
  const PAGE_SIZE = 25;

  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  useEffect(() => {
    getTracingOrgs().then(r => setOrgs(r.data || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const org = selectedOrg || undefined;

      const [ovRes, piiSumRes, piiReqRes, blockedRes] = await Promise.allSettled([
        getProxyOverview(org, days),
        getProxyPiiSummary(org, days),
        getProxyRequests({ org_id: org, pii_only: true,  limit: PAGE_SIZE, offset: piiPage     * PAGE_SIZE }),
        getProxyRequests({ org_id: org, status: "blocked", limit: PAGE_SIZE, offset: blockedPage * PAGE_SIZE }),
      ]);

      const val = (r, fb) => r.status === "fulfilled" ? (r.value?.data ?? fb) : fb;
      setOverview(val(ovRes, null));
      setPiiSummary(val(piiSumRes, null));

      const piiData = val(piiReqRes, { items: [], total: 0 });
      setPiiRequests(piiData.items || []);
      setPiiTotal(piiData.total || 0);

      const blockedData = val(blockedRes, { items: [], total: 0 });
      setBlockedRequests(blockedData.items || []);
      setBlockedTotal(blockedData.total || 0);

      setError("");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to load security data.");
    } finally {
      setLoading(false);
    }
  }, [selectedOrg, days, piiPage, blockedPage]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading">Loading proxy security data…</div>;

  const piiPages     = Math.ceil(piiTotal / PAGE_SIZE);
  const blockedPages = Math.ceil(blockedTotal / PAGE_SIZE);

  return (
    <div className="page-shell">

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <section className="panel" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Alerts &amp; Security</span>

          <select
            value={selectedOrg}
            onChange={e => setSelectedOrg(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13 }}
          >
            <option value="">All Orgs</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name || o.id}</option>)}
          </select>

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

          <button type="button" className="btn btn-ghost" onClick={load}>Refresh</button>
        </div>
      </section>

      {error && <div className="error-message">{error}</div>}

      {/* ── KPI Row ───────────────────────────────────────────────────────── */}
      <section className="stats-grid stats-grid-overview">
        {[
          { label: "Total Requests",  value: num(overview?.total_requests),  color: undefined },
          { label: "Blocked",         value: num(overview?.blocked),          color: "#ef4444" },
          { label: "PII Detections",  value: num(overview?.pii_detections),  color: "#f97316" },
          { label: "Success Rate",    value: `${overview?.success_rate ?? 0}%`, color: undefined },
          { label: "Completed",       value: num(overview?.completed),        color: "#22c55e" },
          { label: "Avg Latency",     value: `${num(overview?.avg_latency_ms)} ms`, color: undefined },
        ].map(card => (
          <div key={card.label} className="metric-card">
            <div className="metric-eyebrow">{card.label}</div>
            <div className="metric-value" style={card.color ? { color: card.color } : {}}>{card.value}</div>
          </div>
        ))}
      </section>

      {/* ── PII Summary charts ────────────────────────────────────────────── */}
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

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <section className="panel">
        <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
          {[
            { key: "pii",     label: `PII Detections (${num(piiTotal)})` },
            { key: "blocked", label: `Blocked Requests (${num(blockedTotal)})` },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              className={`btn ${activeTab === tab.key ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── PII Detections table ─────────────────────────────────────────── */}
        {activeTab === "pii" && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Org</th>
                    <th>Project</th>
                    <th>Model</th>
                    <th>PII Types</th>
                    <th>Action Taken</th>
                    <th>Status</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                    <th>Client IP</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {piiRequests.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: "center", color: "var(--gray-500)" }}>
                        No PII detections in this period.
                      </td>
                    </tr>
                  ) : null}
                  {piiRequests.map(row => (
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
                        }`}>
                          {row.request_status}
                        </span>
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

        {/* ── Blocked Requests table ───────────────────────────────────────── */}
        {activeTab === "blocked" && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Org</th>
                    <th>Project</th>
                    <th>Model</th>
                    <th>PII Types Detected</th>
                    <th>Provider</th>
                    <th>Source</th>
                    <th>Client IP</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {blockedRequests.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: "center", color: "var(--gray-500)" }}>
                        No blocked requests in this period.
                      </td>
                    </tr>
                  ) : null}
                  {blockedRequests.map(row => (
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
    </div>
  );
}

export default AlertsSecurity;
