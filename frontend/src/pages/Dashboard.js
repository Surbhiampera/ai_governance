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
  getGovernanceOverview,
  getSecuritySummary,
  getTelemetryLogs,
  getToolsUsage,
  getUsageTrends,
} from "../api";

const CHART_COLORS = ["#9E2A97", "#7C70AE", "#b565b0", "#9a8fbf", "#c97dc4"];

const money = (value) => `$${Number(value || 0).toFixed(2)}`;
const num = (value, decimals = 0) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const RANGE_OPTIONS = [
  { value: "all", label: "All Time", days: 90 },
  { value: "today", label: "Today", days: 1 },
  { value: "7d", label: "Last 7 Days", days: 7 },
  { value: "30d", label: "Last 30 Days", days: 30 },
  { value: "90d", label: "Last 90 Days", days: 90 },
];

function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState([]);
  const [security, setSecurity] = useState(null);
  const [toolUsage, setToolUsage] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [activeMetric, setActiveMetric] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [activeSnapshot, setActiveSnapshot] = useState(null);
  // Default = overall system activity (all-time) per spec.
  const [range, setRange] = useState("all");

  const load = useCallback(
    async (isRefresh = false, currentRange = range) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        const opt =
          RANGE_OPTIONS.find((r) => r.value === currentRange) ||
          RANGE_OPTIONS[0];

        const [overviewRes, trendsRes, securityRes, usageRes, logsRes] =
          await Promise.all([
            getGovernanceOverview(null, opt.days, opt.value),
            getUsageTrends(null, opt.days),
            getSecuritySummary(),
            getToolsUsage(),
            getTelemetryLogs({ limit: 20 }),
          ]);

        setOverview(overviewRes.data);
        setTrends(trendsRes.data || []);
        setSecurity(securityRes.data);
        setToolUsage(usageRes.data || []);
        setRecentLogs(logsRes.data || []);
        setError("");
      } catch (err) {
        setError(
          err?.response?.data?.detail ||
            "Unable to load governance data. Check whether the backend is running.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range],
  );

  useEffect(() => {
    load(false, range);
  }, [range, load]);

  const rangeLabel = (
    RANGE_OPTIONS.find((r) => r.value === range) || RANGE_OPTIONS[0]
  ).label;

  if (loading) {
    return (
      <div className="loading">Loading centralized governance dashboard...</div>
    );
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  const alertsBySeverity = Object.entries(
    overview?.alerts_by_severity || {},
  ).map(([name, value]) => ({ name, value }));

  const costMix = Object.entries(overview?.cost_by_type || {}).map(
    ([name, value]) => ({ name, value: Number(value || 0) }),
  );

  const topTools = (toolUsage || []).slice(0, 6).map((item) => ({
    tool: item.tool_name,
    cost: Number(item.total_cost || 0),
    tokens: Number(item.total_tokens || 0),
  }));

  const recentAlerts = overview?.recent_alerts || [];
  const recentAnomalies = overview?.recent_anomalies || [];
  const securitySignals =
    (security?.open_anomalies || 0) +
    (security?.total_with_pii || 0) +
    (security?.misuse_events || 0) +
    (security?.data_out_events || 0);

  const metricCards = [
    {
      id: "latency",
      title: "Avg Latency",
      value: `${Number(overview?.avg_latency_today || 0).toFixed(0)} ms`,
      detailRows: [
        {
          label: "Today average",
          value: `${Number(overview?.avg_latency_today || 0).toFixed(0)} ms`,
        },
        {
          label: "Health average",
          value: `${Number(overview?.health?.avg_latency_ms || 0).toFixed(0)} ms`,
        },
        {
          label: "Success rate",
          value: `${Number(overview?.health?.success_rate || 0).toFixed(1)}%`,
        },
        {
          label: "Failure rate",
          value: `${Number(overview?.health?.failure_rate || 0).toFixed(1)}%`,
        },
      ],
    },
    {
      id: "rules",
      title: "Active Rules",
      value: num(overview?.rules_active || 0),
      detailRows: [
        { label: "Active rules", value: num(overview?.rules_active || 0) },
        { label: "Active alerts", value: num(overview?.active_alerts || 0) },
        {
          label: "Highest risk score",
          value: Number(overview?.highest_risk_score || 0).toFixed(1),
        },
        {
          label: "Average risk score",
          value: Number(overview?.avg_risk_score || 0).toFixed(1),
        },
      ],
    },
    {
      id: "connectors",
      title: "Connectors",
      value: num(overview?.connectors_active || 0),
      detailRows: [
        {
          label: "Active connectors",
          value: num(overview?.connectors_active || 0),
        },
        { label: "Tools tracked", value: num(toolUsage.length) },
        { label: "Recent events loaded", value: num(recentLogs.length) },
        {
          label: "Refresh state",
          value: refreshing ? "Refreshing data" : "Live snapshot ready",
        },
      ],
    },
    {
      id: "security",
      title: "Security Signals",
      value: num(securitySignals),
      detailRows: [
        { label: "Combined signals", value: num(securitySignals) },
        { label: "PII events", value: num(security?.total_with_pii || 0) },
        { label: "Misuse events", value: num(security?.misuse_events || 0) },
        {
          label: "Data-out violations",
          value: num(security?.data_out_events || 0),
        },
      ],
    },
  ];

  const activeMetricData = metricCards.find((card) => card.id === activeMetric);

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <h2>AI Governance Overview</h2>
          <p>
            {/* Comprehensive view of cost, tokens, latency, and security across
            every integrated AI tool. Default scope is the full system
            activity — adjust the range below to focus on a window. */}
          </p>

          <div className="action-row" style={{ marginTop: 16 }}>
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`btn ${range === opt.value ? "btn-primary" : "btn-ghost"}`}
                style={
                  range === opt.value
                    ? { background: "#fff", color: "#9E2A97", fontWeight: 600 }
                    : {
                        background: "rgba(255,255,255,0.12)",
                        color: "rgba(255,255,255,0.92)",
                        border: "1px solid rgba(255,255,255,0.25)",
                      }
                }
                onClick={() => setRange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="hero-metrics">
            <div className="hero-chip">
              <span>Cost · {rangeLabel}</span>
              <strong>{money(overview?.total_cost_today)}</strong>
            </div>
            <div className="hero-chip">
              <span>Events · {rangeLabel}</span>
              <strong>{num(overview?.total_events_today)}</strong>
            </div>
            <div className="hero-chip">
              <span>Tokens · {rangeLabel}</span>
              <strong>{num(overview?.total_tokens_today)}</strong>
            </div>
            <div className="hero-chip">
              <span>Success Rate</span>
              <strong>
                {Number(overview?.success_rate_today || 0).toFixed(1)}%
              </strong>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h2>Control Snapshot</h2>
              <p>Live operating state across governance controls.</p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => load(true)}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="pill-row">
            {[
              { id: "alerts", label: "Active alerts", value: overview?.active_alerts || 0 },
              { id: "anomalies", label: "Open anomalies", value: overview?.anomalies_open || 0 },
              { id: "connectors", label: "Connectors", value: overview?.connectors_active || 0 },
              { id: "rules", label: "Rules", value: overview?.rules_active || 0 },
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                className="pill pill-btn"
                onClick={() => setActiveSnapshot(pill.id)}
              >
                {pill.label}{" "}
                <span className="highlight">{pill.value}</span>
              </button>
            ))}
          </div>

          <div className="stack" style={{ marginTop: 18 }}>
            <div className="list-item">
              <strong>Health</strong>
              <div className="list-meta">
                Success {Number(overview?.health?.success_rate || 0).toFixed(1)}
                % · Failure{" "}
                {Number(overview?.health?.failure_rate || 0).toFixed(1)}% · Avg
                latency{" "}
                {Number(overview?.health?.avg_latency_ms || 0).toFixed(0)} ms
              </div>
            </div>
            <div className="list-item">
              <strong>Security</strong>
              <div className="list-meta">
                PII events {security?.total_with_pii || 0} · Misuse{" "}
                {security?.misuse_events || 0} · Data-out violations{" "}
                {security?.data_out_events || 0}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="stats-grid stats-grid-overview">
        {metricCards.map((card) => (
          <button
            key={card.id}
            type="button"
            className="metric-card metric-card-button"
            onClick={() => setActiveMetric(card.id)}
          >
            <div className="metric-eyebrow">{card.title}</div>
            <div className="metric-value">{card.value}</div>
          </button>
        ))}
      </section>

      {activeMetricData ? (
        <div
          className="modal-backdrop metric-modal-backdrop"
          onClick={() => setActiveMetric(null)}
        >
          <div
            className="modal-dialog metric-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="metric-eyebrow">{activeMetricData.title}</div>
                <h3 style={{ marginTop: 8 }}>{activeMetricData.value}</h3>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setActiveMetric(null)}
              >
                ×
              </button>
            </div>
            <div className="metric-modal-grid">
              {activeMetricData.detailRows.map((row) => (
                <div key={row.label} className="tool-cost-chip">
                  <strong>{row.label}</strong>
                  <div>{row.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {activeSnapshot && (
        <div
          className="modal-backdrop metric-modal-backdrop"
          onClick={() => setActiveSnapshot(null)}
        >
          <div
            className="modal-dialog metric-modal"
            style={{ maxWidth: 720 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="metric-eyebrow">Control Snapshot</div>
                <h3 style={{ marginTop: 8 }}>
                  {activeSnapshot === "alerts" && `Active Alerts · ${overview?.active_alerts || 0}`}
                  {activeSnapshot === "anomalies" && `Open Anomalies · ${overview?.anomalies_open || 0}`}
                  {activeSnapshot === "connectors" && `Connectors · ${overview?.connectors_active || 0}`}
                  {activeSnapshot === "rules" && `Governance Rules · ${overview?.rules_active || 0}`}
                </h3>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setActiveSnapshot(null)}
              >
                ×
              </button>
            </div>

            {activeSnapshot === "alerts" && (
              <>
                <div className="metric-modal-grid" style={{ marginBottom: 18 }}>
                  <div className="tool-cost-chip">
                    <strong>Total Active</strong>
                    <div>{overview?.active_alerts || 0}</div>
                  </div>
                  {Object.entries(overview?.alerts_by_severity || {}).map(([sev, count]) => (
                    <div key={sev} className="tool-cost-chip">
                      <strong style={{ textTransform: "capitalize" }}>{sev}</strong>
                      <div>
                        <span className={`status-pill ${sev}`}>{count} alert{count !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="metric-eyebrow" style={{ marginBottom: 12 }}>Recent Alerts</div>
                <div className="list-grid">
                  {recentAlerts.length ? (
                    recentAlerts.map((a) => (
                      <div key={a.id} className="list-item">
                        <strong>{a.alert_type}</strong>
                        <div className="list-meta">
                          <span className={`status-pill ${a.severity}`}>{a.severity}</span>{" "}
                          {a.message}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">No recent alerts.</div>
                  )}
                </div>
              </>
            )}

            {activeSnapshot === "anomalies" && (
              <>
                <div className="metric-modal-grid" style={{ marginBottom: 18 }}>
                  <div className="tool-cost-chip">
                    <strong>Total Open</strong>
                    <div>{overview?.anomalies_open || 0}</div>
                  </div>
                </div>
                <div className="metric-eyebrow" style={{ marginBottom: 12 }}>Recent Anomalies</div>
                <div className="list-grid">
                  {recentAnomalies.length ? (
                    recentAnomalies.map((a) => (
                      <div key={a.id} className="list-item">
                        <strong>{a.anomaly_type}</strong>
                        <div className="list-meta">
                          <span className={`status-pill ${a.severity}`}>{a.severity}</span>{" "}
                          {a.message}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">No open anomalies.</div>
                  )}
                </div>
              </>
            )}

            {activeSnapshot === "connectors" && (
              <>
                <div className="metric-modal-grid" style={{ marginBottom: 18 }}>
                  <div className="tool-cost-chip">
                    <strong>Active Connectors</strong>
                    <div>{overview?.connectors_active || 0}</div>
                  </div>
                  <div className="tool-cost-chip">
                    <strong>Tools Tracked</strong>
                    <div>{toolUsage.length}</div>
                  </div>
                </div>
                <div className="metric-eyebrow" style={{ marginBottom: 12 }}>Tool Breakdown</div>
                {toolUsage.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Tool</th>
                          <th>Total Cost</th>
                          <th>Tokens</th>
                        </tr>
                      </thead>
                      <tbody>
                        {toolUsage.map((t) => (
                          <tr key={t.tool_name}>
                            <td><strong>{t.tool_name}</strong></td>
                            <td>{money(t.total_cost)}</td>
                            <td>{num(t.total_tokens)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">No tools tracked.</div>
                )}
              </>
            )}

            {activeSnapshot === "rules" && (
              <>
                <div className="metric-modal-grid" style={{ marginBottom: 18 }}>
                  <div className="tool-cost-chip">
                    <strong>Active Rules</strong>
                    <div>{overview?.rules_active || 0}</div>
                  </div>
                  <div className="tool-cost-chip">
                    <strong>Active Alerts</strong>
                    <div>{overview?.active_alerts || 0}</div>
                  </div>
                  <div className="tool-cost-chip">
                    <strong>Avg Risk Score</strong>
                    <div>{Number(overview?.avg_risk_score || 0).toFixed(1)}</div>
                  </div>
                  <div className="tool-cost-chip">
                    <strong>Highest Risk Score</strong>
                    <div>{Number(overview?.highest_risk_score || 0).toFixed(1)}</div>
                  </div>
                </div>
                {Object.keys(overview?.alerts_by_severity || {}).length > 0 && (
                  <>
                    <div className="metric-eyebrow" style={{ marginBottom: 12 }}>Alerts by Severity</div>
                    <div className="list-grid">
                      {Object.entries(overview?.alerts_by_severity || {}).map(([sev, count]) => (
                        <div key={sev} className="list-item">
                          <strong style={{ textTransform: "capitalize" }}>{sev}</strong>
                          <div className="list-meta">
                            <span className={`status-pill ${sev}`}>{count} alert{count !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Recent Events</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Org</th>
                <th>Project</th>
                <th>Tool</th>
                <th>Provider</th>
                <th>Model</th>
                <th>Status</th>
                <th>Service</th>
                <th>Exec Type</th>
                <th>User</th>
                <th>Tokens In</th>
                <th>Tokens Out</th>
                <th>Latency</th>
                <th>Cost</th>
                <th>Input MB</th>
                <th>Output MB</th>
                <th>PII</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.length === 0 ? (
                <tr>
                  <td
                    colSpan={17}
                    style={{ textAlign: "center", color: "var(--gray-500)" }}
                  >
                    No events recorded yet.
                  </td>
                </tr>
              ) : null}
              {recentLogs.map((row) => (
                <tr key={row.event_id}>
                  <td>{row.org_id || "-"}</td>
                  <td>{row.project_id || "-"}</td>
                  <td>
                    <strong>{row.tool_name || "-"}</strong>
                  </td>
                  <td>{row.provider || "-"}</td>
                  <td>{row.model_name || "-"}</td>
                  <td>
                    <span
                      className={`status-pill ${(row.status || "").toLowerCase()}`}
                    >
                      {row.status || "-"}
                    </span>
                  </td>
                  <td>{row.service_type || "-"}</td>
                  <td>{row.execution_type || "-"}</td>
                  <td>{row.user_id || "-"}</td>
                  <td>{num(row.prompt_tokens)}</td>
                  <td>{num(row.completion_tokens)}</td>
                  <td>{num(row.latency_ms)} ms</td>
                  <td>{money(row.total_cost)}</td>
                  <td>{num(row.input_data_size_mb, 2)}</td>
                  <td>{num(row.output_data_size_mb, 2)}</td>
                  <td>
                    {row.pii_type ? (
                      <span className="status-pill critical">
                        {row.pii_type}
                      </span>
                    ) : (
                      <span style={{ color: "var(--gray-500)" }}>none</span>
                    )}
                  </td>
                  <td>
                    {Array.isArray(row.tags) && row.tags.length > 0
                      ? row.tags.join(", ")
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Cost &amp; Events Trend</h3>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#9E2A97" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#9E2A97" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="rgba(124,112,174,0.12)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#6d6782", fontSize: 12 }}
                />
                <YAxis tick={{ fill: "#6d6782", fontSize: 12 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="total_cost"
                  stroke="#9E2A97"
                  fill="url(#costFill)"
                  strokeWidth={3}
                />
                <Area
                  type="monotone"
                  dataKey="total_events"
                  stroke="#7C70AE"
                  fill="transparent"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Cost Composition</h3>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={costMix}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={96}
                  innerRadius={58}
                >
                  {costMix.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => money(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Top Tools by Cost &amp; Tokens</h3>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topTools}>
                <CartesianGrid
                  stroke="rgba(124,112,174,0.12)"
                  vertical={false}
                />
                <XAxis
                  dataKey="tool"
                  tick={{ fill: "#6d6782", fontSize: 12 }}
                />
                <YAxis tick={{ fill: "#6d6782", fontSize: 12 }} />
                <Tooltip
                  formatter={(value, name) =>
                    name === "cost" ? money(value) : value
                  }
                />
                <Bar dataKey="cost" fill="#9E2A97" radius={[8, 8, 0, 0]} />
                <Bar dataKey="tokens" fill="#7C70AE" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Alert Severity</h3>
            </div>
          </div>
          <div className="list-grid">
            {alertsBySeverity.length ? (
              alertsBySeverity.map((item) => (
                <div key={item.name} className="list-item">
                  <strong>{item.name}</strong>
                  <div className="list-meta">
                    <span className={`status-pill ${item.name}`}>
                      {item.value} active
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">No active alerts.</div>
            )}
          </div>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Recent Alerts</h3>
            </div>
          </div>
          <div className="list-grid">
            {recentAlerts.length ? (
              recentAlerts.map((alert) => (
                <div key={alert.id} className="list-item">
                  <strong>{alert.alert_type}</strong>
                  <div className="list-meta">
                    <span className={`status-pill ${alert.severity}`}>
                      {alert.severity}
                    </span>{" "}
                    {alert.message}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">No recent alerts.</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Open Anomalies</h3>
            </div>
          </div>
          <div className="list-grid">
            {recentAnomalies.length ? (
              recentAnomalies.map((item) => (
                <div key={item.id} className="list-item">
                  <strong>{item.anomaly_type}</strong>
                  <div className="list-meta">
                    <span className={`status-pill ${item.severity}`}>
                      {item.severity}
                    </span>{" "}
                    {item.message}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">No anomalies are open.</div>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Tool Rollup · {rangeLabel}</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tool</th>
                <th>Events</th>
                <th>Total Cost</th>
                <th>Tokens</th>
                <th>Success</th>
                <th>Failure</th>
                <th>Avg Latency</th>
                <th>Avg Risk</th>
                <th>Anomalies</th>
                <th>Misuse</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.tool_rollup || []).length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    style={{ textAlign: "center", color: "var(--gray-500)" }}
                  >
                    No tool data for {rangeLabel.toLowerCase()}.
                  </td>
                </tr>
              ) : null}
              {(overview?.tool_rollup || []).map((row) => (
                <tr key={`${row.tool_name}-${row.date}`}>
                  <td>
                    <strong>{row.tool_name}</strong>
                  </td>
                  <td>{num(row.total_events)}</td>
                  <td>{money(row.total_cost)}</td>
                  <td>{num(row.total_tokens)}</td>
                  <td>{num(row.success_count)}</td>
                  <td>{num(row.failure_count)}</td>
                  <td>{num(row.avg_latency_ms)} ms</td>
                  <td>{Number(row.avg_risk_score || 0).toFixed(1)}</td>
                  <td>{num(row.anomaly_count)}</td>
                  <td>{num(row.misuse_count)}</td>
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
