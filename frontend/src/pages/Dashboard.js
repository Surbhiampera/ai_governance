import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  getTodaySummary,
  getDailySummary,
  getAlerts,
  getSecuritySummary,
  getMonthlySummary,
  getUsageTrends,
} from "../api";

const COLORS = [
  "#6c5ce7",
  "#0984e3",
  "#00b894",
  "#fdcb6e",
  "#e17055",
  "#d63031",
];

function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [security, setSecurity] = useState(null);
  const [dailyData, setDailyData] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const end = new Date().toISOString().split("T")[0];
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const [
        summaryRes,
        alertsRes,
        securityRes,
        dailyRes,
        monthlyRes,
        trendsRes,
      ] = await Promise.allSettled([
        getTodaySummary(),
        getAlerts(),
        getSecuritySummary(),
        getDailySummary(start, end),
        getMonthlySummary(),
        getUsageTrends(null, 30),
      ]);

      if (summaryRes.status === "fulfilled") setSummary(summaryRes.value.data);
      if (alertsRes.status === "fulfilled") setAlerts(alertsRes.value.data);
      if (securityRes.status === "fulfilled")
        setSecurity(securityRes.value.data);
      if (dailyRes.status === "fulfilled") setDailyData(dailyRes.value.data);
      if (monthlyRes.status === "fulfilled")
        setMonthlyData(monthlyRes.value.data);
      if (trendsRes.status === "fulfilled") setTrends(trendsRes.value.data);
      setError(null);
    } catch (err) {
      setError(
        err.code === "ECONNABORTED" || err.message?.includes("Network")
          ? "Cannot connect to backend. Make sure the server is running on port 8000."
          : err.message,
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (error) return <div className="error-message">Error: {error}</div>;

  const activeAlerts = Array.isArray(alerts)
    ? alerts.filter((a) => a.status === "active").length
    : 0;
  const totalCost = Number(summary?.total_cost ?? 0);
  const totalEvents = summary?.total_events ?? 0;
  const securityScore =
    security?.average_risk_score != null
      ? (100 - Number(security.average_risk_score)).toFixed(1)
      : "N/A";

  const monthlyCost = Array.isArray(monthlyData)
    ? monthlyData.reduce((sum, m) => sum + Number(m.total_cost || 0), 0)
    : 0;

  const trendData = Array.isArray(trends) ? trends : [];
  const totalSuccess = trendData.reduce(
    (s, d) => s + (d.success_count || 0),
    0,
  );
  const totalFail = trendData.reduce((s, d) => s + (d.failure_count || 0), 0);
  const successRate =
    totalSuccess + totalFail > 0
      ? ((totalSuccess / (totalSuccess + totalFail)) * 100).toFixed(1)
      : "100.0";

  const dailyChartData = Array.isArray(dailyData)
    ? (() => {
        const byDate = {};
        dailyData.forEach((d) => {
          const dt = d.date;
          if (!byDate[dt]) byDate[dt] = { date: dt, cost: 0, events: 0 };
          byDate[dt].cost += Number(d.total_cost ?? 0);
          byDate[dt].events += d.total_events ?? 0;
        });
        return Object.values(byDate).sort((a, b) =>
          a.date.localeCompare(b.date),
        );
      })()
    : [];

  const monthlyCostBreakdown = Array.isArray(monthlyData)
    ? monthlyData.map((m) => ({
        month: m.month,
        tool: m.tool_name,
        llm: Number(m.llm_cost || 0),
        infra: Number(m.infra_cost || 0),
        external: Number(m.external_cost || 0),
        total: Number(m.total_cost || 0),
      }))
    : [];

  const monthlyAgg = {};
  monthlyCostBreakdown.forEach((m) => {
    if (!monthlyAgg[m.month])
      monthlyAgg[m.month] = {
        month: m.month,
        llm: 0,
        infra: 0,
        external: 0,
        total: 0,
      };
    monthlyAgg[m.month].llm += m.llm;
    monthlyAgg[m.month].infra += m.infra;
    monthlyAgg[m.month].external += m.external;
    monthlyAgg[m.month].total += m.total;
  });
  const monthlyAggData = Object.values(monthlyAgg);

  const recentAlerts = Array.isArray(alerts) ? alerts.slice(0, 5) : [];

  const severityClass = (s) => {
    const m = {
      critical: "badge-critical",
      high: "badge-high",
      medium: "badge-medium",
      low: "badge-low",
    };
    return m[s] || "badge-low";
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          Dashboard
        </h1>
        <button
          className="btn btn-outline"
          onClick={() => fetchData(true)}
          disabled={refreshing}
        >
          {refreshing ? "⏳ Refreshing..." : "🔄 Refresh"}
        </button>
      </div>

      <div className="metrics-grid">
        <div className="metric-card primary">
          <span className="metric-icon">💰</span>
          <span className="metric-label">Total Cost Today</span>
          <span className="metric-value">${totalCost.toFixed(4)}</span>
        </div>
        <div className="metric-card info">
          <span className="metric-icon">📈</span>
          <span className="metric-label">Total Events Today</span>
          <span className="metric-value">{totalEvents}</span>
        </div>
        <div className="metric-card danger">
          <span className="metric-icon">🚨</span>
          <span className="metric-label">Active Alerts</span>
          <span className="metric-value">{activeAlerts}</span>
        </div>
        <div className="metric-card success">
          <span className="metric-icon">🛡️</span>
          <span className="metric-label">Security Score</span>
          <span className="metric-value">{securityScore}</span>
        </div>
        <div className="metric-card warning">
          <span className="metric-icon">📅</span>
          <span className="metric-label">Monthly Cost</span>
          <span className="metric-value">${monthlyCost.toFixed(2)}</span>
        </div>
        <div className="metric-card success">
          <span className="metric-icon">✅</span>
          <span className="metric-label">Success Rate</span>
          <span className="metric-value">{successRate}%</span>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-title">Daily Cost Trend (30 Days)</div>
          {dailyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `$${(Number(v) || 0).toFixed(2)}`}
                />
                <Tooltip
                  formatter={(v, name) =>
                    name === "cost" ? `$${Number(v).toFixed(4)}` : v
                  }
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="#0984e3"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="events"
                  stroke="#00b894"
                  strokeWidth={2}
                  dot={false}
                  yAxisId={0}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">No daily data available</div>
          )}
        </div>
      </div>

      {monthlyAggData.length > 0 && (
        <div className="card">
          <div className="card-title">Monthly Cost Breakdown</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyAggData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
              />
              <Tooltip formatter={(v) => `$${Number(v).toFixed(4)}`} />
              <Legend />
              <Bar dataKey="llm" stackId="a" fill="#6c5ce7" name="LLM Cost" />
              <Bar
                dataKey="infra"
                stackId="a"
                fill="#0984e3"
                name="Infra Cost"
              />
              <Bar
                dataKey="external"
                stackId="a"
                fill="#00b894"
                name="External Cost"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card">
        <div className="card-title">Recent Alerts</div>
        {recentAlerts.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {recentAlerts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.tool_name}</strong>
                    </td>
                    <td>{a.alert_type}</td>
                    <td>
                      <span className={`badge ${severityClass(a.severity)}`}>
                        {a.severity}
                      </span>
                    </td>
                    <td>{a.message}</td>
                    <td>
                      <span
                        className={`badge ${a.status === "resolved" ? "badge-resolved" : "badge-active"}`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td>
                      {a.created_at
                        ? new Date(a.created_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No alerts</div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
