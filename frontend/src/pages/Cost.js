import React, { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import API from "../api";

const money = (v) => `$${Number(v || 0).toFixed(2)}`;
const num = (v) => Number(v || 0).toLocaleString();

function Cost() {
  const [totals, setTotals] = useState(null);
  const [byModel, setByModel] = useState([]);
  const [byProject, setByProject] = useState([]);
  const [dailyCost, setDailyCost] = useState([]);
  const [monthlyCost, setMonthlyCost] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const [totalsRes, modelRes, projectRes, dailyRes, monthlyRes] =
        await Promise.all([
          API.get("/costs/totals"),
          API.get("/costs/by-model"),
          API.get("/costs/by-project"),
          API.get("/costs/daily", { params: { days: 14 } }),
          API.get("/costs/monthly"),
        ]);
      setTotals(totalsRes.data);
      setByModel(modelRes.data || []);
      setByProject(projectRes.data || []);
      setDailyCost(dailyRes.data || []);
      setMonthlyCost(monthlyRes.data || []);
      setError("");
    } catch {
      setError("Unable to load cost data. Check backend connectivity.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="loading">Loading cost analytics…</div>;
  if (error) return <div className="error-message">{error}</div>;

  /* aggregate daily costs by date for chart */
  const dailyByDate = Object.values(
    dailyCost.reduce((acc, r) => {
      if (!acc[r.date]) acc[r.date] = { date: r.date, cost: 0, tokens: 0 };
      acc[r.date].cost += r.total_cost;
      acc[r.date].tokens += r.total_tokens;
      return acc;
    }, {}),
  ).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="page-shell">
      {/* ── KPI cards ── */}
      <section className="stats-grid">
        <div className="metric-card">
          <div className="metric-eyebrow">Today</div>
          <div className="metric-value">{money(totals?.today?.cost)}</div>
          <div className="metric-note">
            {num(totals?.today?.tokens)} tokens · {num(totals?.today?.events)}{" "}
            events
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-eyebrow">This Month</div>
          <div className="metric-value">{money(totals?.this_month?.cost)}</div>
          <div className="metric-note">
            {num(totals?.this_month?.tokens)} tokens ·{" "}
            {num(totals?.this_month?.events)} events
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-eyebrow">All Time</div>
          <div className="metric-value">{money(totals?.all_time?.cost)}</div>
          <div className="metric-note">
            {num(totals?.all_time?.tokens)} tokens ·{" "}
            {num(totals?.all_time?.events)} events
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-eyebrow">Models Tracked</div>
          <div className="metric-value">{byModel.length}</div>
          <div className="metric-note">
            {byProject.length} projects active
          </div>
        </div>
      </section>

      {/* ── Cost by Model ── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Cost by Model</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Provider</th>
                <th>Events</th>
                <th>Tokens In</th>
                <th>Tokens Out</th>
                <th>Total Tokens</th>
                <th>Total Cost</th>
                <th>Avg Latency</th>
                <th>Success %</th>
              </tr>
            </thead>
            <tbody>
              {byModel.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    style={{ textAlign: "center", color: "var(--gray-500)" }}
                  >
                    No model data yet.
                  </td>
                </tr>
              )}
              {byModel.map((r) => (
                <tr key={`${r.model_name}-${r.provider}`}>
                  <td>
                    <strong>{r.model_name}</strong>
                  </td>
                  <td>{r.provider}</td>
                  <td>{num(r.total_events)}</td>
                  <td>{num(r.prompt_tokens)}</td>
                  <td>{num(r.completion_tokens)}</td>
                  <td>{num(r.total_tokens)}</td>
                  <td>{money(r.total_cost)}</td>
                  <td>{r.avg_latency_ms} ms</td>
                  <td>{r.success_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Cost by Project ── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Cost by Project</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Org</th>
                <th>Events</th>
                <th>Tokens</th>
                <th>Total Cost</th>
                <th>Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {byProject.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{ textAlign: "center", color: "var(--gray-500)" }}
                  >
                    No project data yet.
                  </td>
                </tr>
              )}
              {byProject.map((r) => (
                <tr key={`${r.project_id}-${r.org_id}`}>
                  <td>
                    <strong>{r.project_id}</strong>
                  </td>
                  <td>{r.org_id}</td>
                  <td>{num(r.total_events)}</td>
                  <td>{num(r.total_tokens)}</td>
                  <td>{money(r.total_cost)}</td>
                  <td>{r.avg_latency_ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Charts row ── */}
      <section className="two-column">
        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Daily Cost (14 days)</h3>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyByDate}>
                <CartesianGrid
                  stroke="rgba(124,112,174,0.12)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#6d6782", fontSize: 12 }}
                />
                <YAxis tick={{ fill: "#6d6782", fontSize: 12 }} />
                <Tooltip formatter={(v) => money(v)} />
                <Bar dataKey="cost" fill="#9E2A97" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Monthly Cost</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Tool</th>
                  <th>Cost</th>
                  <th>Tokens</th>
                  <th>Events</th>
                </tr>
              </thead>
              <tbody>
                {monthlyCost.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{ textAlign: "center", color: "var(--gray-500)" }}
                    >
                      No monthly data yet.
                    </td>
                  </tr>
                )}
                {monthlyCost.map((r, i) => (
                  <tr key={`${r.month}-${r.tool_name}-${i}`}>
                    <td>{r.month}</td>
                    <td>{r.tool_name}</td>
                    <td>{money(r.total_cost)}</td>
                    <td>{num(r.total_tokens)}</td>
                    <td>{num(r.total_events)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Cost;
