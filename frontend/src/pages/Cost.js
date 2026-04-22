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
import { getOrganizations, getProjects } from "../api";

const money = (v) => `$${Number(v || 0).toFixed(2)}`;
const num = (v) => Number(v || 0).toLocaleString();

function Cost() {
  const [totals, setTotals] = useState(null);
  const [byModel, setByModel] = useState([]);
  const [byProject, setByProject] = useState([]);
  const [byOrg, setByOrg] = useState([]);
  const [dailyCost, setDailyCost] = useState([]);
  const [monthlyCost, setMonthlyCost] = useState([]);
  const [activeMetric, setActiveMetric] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orgs, setOrgs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [selectedProject, setSelectedProject] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const [totalsRes, modelRes, projectRes, orgRes, dailyRes, monthlyRes, orgsRes] =
        await Promise.all([
          API.get("/costs/totals"),
          API.get("/costs/by-model", { params: { org_id: selectedOrg || undefined, project_id: selectedProject || undefined } }),
          API.get("/costs/by-project", { params: { org_id: selectedOrg || undefined } }),
          API.get("/costs/by-org"),
          API.get("/costs/daily", { params: { days: 14, org_id: selectedOrg || undefined, project_id: selectedProject || undefined } }),
          API.get("/costs/monthly", { params: { org_id: selectedOrg || undefined, project_id: selectedProject || undefined } }),
          getOrganizations(),
        ]);
      setTotals(totalsRes.data);
      setByModel(modelRes.data || []);
      setByProject(projectRes.data || []);
      setByOrg(orgRes.data || []);
      setDailyCost(dailyRes.data || []);
      setMonthlyCost(monthlyRes.data || []);
      setOrgs(orgsRes.data || []);
      setError("");
    } catch {
      setError("Unable to load cost data. Check backend connectivity.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [selectedOrg, selectedProject]);

  useEffect(() => {
    if (selectedOrg) {
      getProjects(selectedOrg).then((res) => setProjects(res.data || []));
    } else {
      setProjects([]);
      setSelectedProject("");
    }
  }, [selectedOrg]);

  if (loading) return <div className="loading">Loading cost analytics...</div>;
  if (error) return <div className="error-message">{error}</div>;

  const dailyByDate = Object.values(
    dailyCost.reduce((acc, r) => {
      if (!acc[r.date]) acc[r.date] = { date: r.date, cost: 0, tokens: 0 };
      acc[r.date].cost += r.total_cost;
      acc[r.date].tokens += r.total_tokens;
      return acc;
    }, {}),
  ).sort((a, b) => a.date.localeCompare(b.date));

  const metricCards = [
    {
      id: "today",
      title: "Today",
      value: money(totals?.today?.cost),
      detailRows: [
        { label: "Total cost", value: money(totals?.today?.cost) },
        { label: "Tokens", value: num(totals?.today?.tokens) },
        { label: "Events", value: num(totals?.today?.events) },
        { label: "Daily rows", value: num(dailyCost.length) },
      ],
    },
    {
      id: "this-month",
      title: "This Month",
      value: money(totals?.this_month?.cost),
      detailRows: [
        { label: "Total cost", value: money(totals?.this_month?.cost) },
        { label: "Tokens", value: num(totals?.this_month?.tokens) },
        { label: "Events", value: num(totals?.this_month?.events) },
        { label: "Monthly rows", value: num(monthlyCost.length) },
      ],
    },
    {
      id: "all-time",
      title: "All Time",
      value: money(totals?.all_time?.cost),
      detailRows: [
        { label: "Total cost", value: money(totals?.all_time?.cost) },
        { label: "Tokens", value: num(totals?.all_time?.tokens) },
        { label: "Events", value: num(totals?.all_time?.events) },
        { label: "Tracked projects", value: num(byProject.length) },
      ],
    },
    {
      id: "models",
      title: "Models Tracked",
      value: num(byModel.length),
      detailRows: [
        { label: "Models tracked", value: num(byModel.length) },
        { label: "Projects active", value: num(byProject.length) },
        {
          label: "Top model",
          value: byModel[0]?.model_name || "No model data",
        },
        {
          label: "Top provider",
          value: byModel[0]?.provider || "Provider not set",
        },
      ],
    },
  ];

  const activeMetricData = metricCards.find((card) => card.id === activeMetric);

  return (
    <div className="page-shell">
      <section className="panel" style={{ padding: "14px 24px" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div className="field" style={{ minWidth: 180 }}>
            <label style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 4 }}>Organization</label>
            <select value={selectedOrg} onChange={(e) => { setSelectedOrg(e.target.value); setSelectedProject(""); }}>
              <option value="">All Organizations</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.org_name || o.id}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 180 }}>
            <label style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 4 }}>Project</label>
            <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} disabled={!selectedOrg}>
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.project_name || p.id}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="stats-grid">
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
        <div className="modal-backdrop metric-modal-backdrop" onClick={() => setActiveMetric(null)}>
          <div className="modal-dialog metric-modal" onClick={(event) => event.stopPropagation()}>
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
                x
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

      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Cost by Organization</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Events</th>
                <th>Tokens</th>
                <th>Total Cost</th>
                <th>Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {byOrg.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: "center", color: "var(--gray-500)" }}
                  >
                    No organization data yet.
                  </td>
                </tr>
              )}
              {byOrg.map((r) => (
                <tr key={r.org_id}>
                  <td>
                    <strong>{r.org_id}</strong>
                  </td>
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
                <CartesianGrid stroke="rgba(124,112,174,0.12)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#6d6782", fontSize: 12 }} />
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
