import React, { useEffect, useState } from "react";
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
  getToolsUsage,
  getUsageTrends,
} from "../api";

const CHART_COLORS = ["#9E2A97", "#7C70AE"];

const money = (value) => `$${Number(value || 0).toFixed(2)}`;

function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState([]);
  const [security, setSecurity] = useState(null);
  const [toolUsage, setToolUsage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [overviewRes, trendsRes, securityRes, usageRes] = await Promise.all([
        getGovernanceOverview(),
        getUsageTrends(null, 14),
        getSecuritySummary(),
        getToolsUsage(),
      ]);

      setOverview(overviewRes.data);
      setTrends(trendsRes.data || []);
      setSecurity(securityRes.data);
      setToolUsage(usageRes.data || []);
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
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className="loading">Loading centralized governance dashboard...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  const alertsBySeverity = Object.entries(overview?.alerts_by_severity || {}).map(
    ([name, value]) => ({
      name,
      value,
    }),
  );

  const costMix = Object.entries(overview?.cost_by_type || {}).map(([name, value]) => ({
    name,
    value: Number(value || 0),
  }));

  const topTools = (toolUsage || []).slice(0, 6).map((item) => ({
    tool: item.tool_name,
    cost: Number(item.total_cost || 0),
    tokens: Number(item.total_tokens || 0),
  }));

  const recentEvents = overview?.recent_events || [];
  const recentAlerts = overview?.recent_alerts || [];
  const recentAnomalies = overview?.recent_anomalies || [];

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <h2>Real-time AI governance across tools, teams, and pipelines.</h2>
          <p>
            This screen unifies cost tracking, AI health monitoring, event tracing,
            security posture, anomaly detection, and rule-driven alerts so the
            organization can see and control every request path.
          </p>

          <div className="hero-metrics">
            <div className="hero-chip">
              <span>Cost Today</span>
              <strong>{money(overview?.total_cost_today)}</strong>
            </div>
            <div className="hero-chip">
              <span>Events Today</span>
              <strong>{overview?.total_events_today || 0}</strong>
            </div>
            <div className="hero-chip">
              <span>Tokens Today</span>
              <strong>{overview?.total_tokens_today || 0}</strong>
            </div>
            <div className="hero-chip">
              <span>Success Rate</span>
              <strong>{Number(overview?.success_rate_today || 0).toFixed(1)}%</strong>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h2>Control Snapshot</h2>
              <p>Fast view of the live operating state across governance controls.</p>
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
            <div className="pill">
              Active alerts <span className="highlight">{overview?.active_alerts || 0}</span>
            </div>
            <div className="pill">
              Open anomalies <span className="highlight">{overview?.anomalies_open || 0}</span>
            </div>
            <div className="pill">
              Active connectors <span className="highlight">{overview?.connectors_active || 0}</span>
            </div>
            <div className="pill">
              Active rules <span className="highlight">{overview?.rules_active || 0}</span>
            </div>
            <div className="pill">
              Avg risk <span className="highlight">{Number(overview?.avg_risk_score || 0).toFixed(1)}</span>
            </div>
            <div className="pill">
              Peak risk <span className="highlight">{Number(overview?.highest_risk_score || 0).toFixed(1)}</span>
            </div>
          </div>

          <div className="stack" style={{ marginTop: 20 }}>
            <div className="list-item">
              <strong>AI Health Monitoring</strong>
              <div className="list-meta">
                Success {Number(overview?.health?.success_rate || 0).toFixed(1)}% | Failure{" "}
                {Number(overview?.health?.failure_rate || 0).toFixed(1)}% | Avg latency{" "}
                {Number(overview?.health?.avg_latency_ms || 0).toFixed(1)} ms | Anomaly score{" "}
                {Number(overview?.health?.anomaly_score || 0).toFixed(2)}
              </div>
            </div>
            <div className="list-item">
              <strong>Security Layer</strong>
              <div className="list-meta">
                PII events {security?.total_with_pii || 0} | Misuse patterns{" "}
                {security?.misuse_events || 0} | Data out violations{" "}
                {security?.data_out_events || 0} | Highest risk{" "}
                {Number(security?.highest_risk_score || 0).toFixed(1)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <div className="metric-card">
          <div className="metric-eyebrow">Latency Today</div>
          <div className="metric-value">{Number(overview?.avg_latency_today || 0).toFixed(1)} ms</div>
          <div className="metric-note">Tracks end-to-end responsiveness across all AI pipelines.</div>
        </div>
        <div className="metric-card">
          <div className="metric-eyebrow">Rule Coverage</div>
          <div className="metric-value">{overview?.rules_active || 0}</div>
          <div className="metric-note">Automated conditions watching cost, data out, and risk events.</div>
        </div>
        <div className="metric-card">
          <div className="metric-eyebrow">Multi-Tool Connectors</div>
          <div className="metric-value">{overview?.connectors_active || 0}</div>
          <div className="metric-note">API ingestion points for multiple AI platforms and workflows.</div>
        </div>
        <div className="metric-card">
          <div className="metric-eyebrow">Open Security Signals</div>
          <div className="metric-value">{security?.open_anomalies || 0}</div>
          <div className="metric-note">Pending anomalies and abnormal usage patterns needing review.</div>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Usage and Cost Trend</h3>
              <p>Daily movement of requests and spend over the last two weeks.</p>
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
                <CartesianGrid stroke="rgba(124,112,174,0.12)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#6d6782", fontSize: 12 }} />
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
              <p>LLM, infrastructure, and external service spend in today&apos;s footprint.</p>
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
                    <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
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
              <h3>Top Tool Consumption</h3>
              <p>Per tool event volume and cost concentration across the estate.</p>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topTools}>
                <CartesianGrid stroke="rgba(124,112,174,0.12)" vertical={false} />
                <XAxis dataKey="tool" tick={{ fill: "#6d6782", fontSize: 12 }} />
                <YAxis tick={{ fill: "#6d6782", fontSize: 12 }} />
                <Tooltip formatter={(value, name) => (name === "cost" ? money(value) : value)} />
                <Bar dataKey="cost" fill="#9E2A97" radius={[8, 8, 0, 0]} />
                <Bar dataKey="tokens" fill="#7C70AE" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Alert Severity Mix</h3>
              <p>Live risk load for the rule engine, health monitors, and security detectors.</p>
            </div>
          </div>
          <div className="list-grid">
            {alertsBySeverity.length ? (
              alertsBySeverity.map((item, index) => (
                <div key={item.name} className="list-item">
                  <strong>{item.name}</strong>
                  <div className="list-meta">
                    <span
                      className={`status-pill ${item.name}`}
                      style={{
                        background:
                          index % 2 === 0 ? "rgba(158, 42, 151, 0.12)" : "rgba(124, 112, 174, 0.12)",
                      }}
                    >
                      {item.value} active
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">No active alerts at the moment.</div>
            )}
          </div>
        </div>
      </section>

      <section className="three-column">
        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Recent Alerts</h3>
              <p>Automatically triggered governance alerts.</p>
            </div>
          </div>
          <div className="list-grid">
            {recentAlerts.length ? (
              recentAlerts.map((alert) => (
                <div key={alert.id} className="list-item">
                  <strong>{alert.alert_type}</strong>
                  <div className="list-meta">
                    <span className={`status-pill ${alert.severity}`}>{alert.severity}</span>
                    {"  "} {alert.message}
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
              <p>Detected usage spikes, cost anomalies, and latency drift.</p>
            </div>
          </div>
          <div className="list-grid">
            {recentAnomalies.length ? (
              recentAnomalies.map((item) => (
                <div key={item.id} className="list-item">
                  <strong>{item.anomaly_type}</strong>
                  <div className="list-meta">
                    <span className={`status-pill ${item.severity}`}>{item.severity}</span>
                    {"  "} {item.message}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">No anomalies are open.</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Recent Event Traces</h3>
              <p>Last requests with tokens, cost, latency, and pipeline detail.</p>
            </div>
          </div>
          <div className="list-grid">
            {recentEvents.length ? (
              recentEvents.map((event) => (
                <div key={event.event_id} className="timeline-card">
                  <strong>{event.tool_name}</strong>
                  <div className="list-meta">
                    Event {event.event_id} | {event.total_tokens} tokens | {money(event.total_cost)} |{" "}
                    {event.latency_ms} ms
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">No recent trace data yet.</div>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Today&apos;s Tool Rollup</h3>
            <p>One-screen operational view of cost, reliability, risk, and anomalies per tool.</p>
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
              {(overview?.tool_rollup || []).map((row) => (
                <tr key={`${row.tool_name}-${row.date}`}>
                  <td>{row.tool_name}</td>
                  <td>{row.total_events}</td>
                  <td>{money(row.total_cost)}</td>
                  <td>{row.total_tokens}</td>
                  <td>{row.success_count}</td>
                  <td>{row.failure_count}</td>
                  <td>{row.avg_latency_ms} ms</td>
                  <td>{Number(row.avg_risk_score || 0).toFixed(1)}</td>
                  <td>{row.anomaly_count}</td>
                  <td>{row.misuse_count}</td>
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
