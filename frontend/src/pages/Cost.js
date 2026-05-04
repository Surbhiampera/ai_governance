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
import { getTracingOrgs, getTracingProjects, getControlQuota } from "../api";

const money = (v) => `$${Number(v || 0).toFixed(2)}`;
const money4 = (v) => `$${Number(v || 0).toFixed(4)}`;
const num = (v) => Number(v || 0).toLocaleString();

function Cost() {
  const [totals, setTotals] = useState(null);
  const [byModel, setByModel] = useState([]);
  const [byProject, setByProject] = useState([]);
  const [byOrg, setByOrg] = useState([]);
  const [byTool, setByTool] = useState([]);
  const [byProvider, setByProvider] = useState([]);
  const [byExecutionType, setByExecutionType] = useState([]);
  const [byServiceType, setByServiceType] = useState([]);
  const [breakdown, setBreakdown] = useState(null);
  const [dailyCost, setDailyCost] = useState([]);
  const [monthlyCost, setMonthlyCost] = useState([]);
  const [activeMetric, setActiveMetric] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orgs, setOrgs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [quota, setQuota] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const scope = { org_id: selectedOrg || undefined, project_id: selectedProject || undefined };
      const [
        totalsRes,
        modelRes,
        projectRes,
        orgRes,
        dailyRes,
        monthlyRes,
        orgsRes,
        toolRes,
        providerRes,
        execRes,
        serviceRes,
        breakdownRes,
      ] = await Promise.all([
        API.get("/costs/totals"),
        API.get("/costs/by-model", { params: scope }),
        API.get("/costs/by-project", { params: { org_id: selectedOrg || undefined } }),
        API.get("/costs/by-org"),
        API.get("/costs/daily", { params: { days: 14, ...scope } }),
        API.get("/costs/monthly", { params: scope }),
        getTracingOrgs(),
        API.get("/costs/by-tool", { params: scope }),
        API.get("/costs/by-provider", { params: scope }),
        API.get("/costs/by-execution-type", { params: scope }),
        API.get("/costs/by-service-type", { params: scope }),
        API.get("/costs/breakdown", { params: scope }),
      ]);
      setTotals(totalsRes.data);
      setByModel(modelRes.data || []);
      setByProject(projectRes.data || []);
      setByOrg(orgRes.data || []);
      setDailyCost(dailyRes.data || []);
      setMonthlyCost(monthlyRes.data || []);
      setOrgs(orgsRes.data || []);
      setByTool(toolRes.data || []);
      setByProvider(providerRes.data || []);
      setByExecutionType(execRes.data || []);
      setByServiceType(serviceRes.data || []);
      setBreakdown(breakdownRes.data || null);
      setError("");
      if (selectedOrg) {
        getControlQuota(selectedOrg, selectedProject || undefined)
          .then((r) => setQuota(r.data))
          .catch(() => setQuota(null));
      } else {
        setQuota(null);
      }
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
    getTracingProjects(selectedOrg || "").then((res) => setProjects(res.data || []));
    setSelectedProject("");
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
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 180 }}>
            <label style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 4 }}>Project</label>
            <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
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

      {/* ── Token Usage & Limits ── */}
      {quota && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>Token Usage &amp; Limits</h3>
              <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                Month-to-date token consumption, daily quota, and budget forecast for the selected organization.
              </p>
            </div>
            {quota.will_exceed_budget && (
              <span className="status-pill critical" style={{ fontSize: 12 }}>Budget Overrun Risk</span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {/* Cost budget */}
            <div className="panel" style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)", padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Cost Budget</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{money(quota.month_cost)}</div>
              <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 6 }}>
                of {quota.budget_limit ? money(quota.budget_limit) : "no limit set"} this month
              </div>
              {quota.budget_limit > 0 && (
                <>
                  <div style={{ background: "var(--gray-100)", borderRadius: 6, height: 8, overflow: "hidden" }}>
                    <div style={{
                      width: `${Math.min(Number(quota.usage_percent || 0), 100)}%`,
                      height: "100%",
                      background: Number(quota.usage_percent || 0) >= 100 ? "#c0392b" : Number(quota.usage_percent || 0) >= 90 ? "#e67e22" : "#9E2A97",
                      borderRadius: 6,
                    }} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 4 }}>
                    {Number(quota.usage_percent || 0).toFixed(1)}% used
                    {quota.cost_remaining != null && ` · ${money(quota.cost_remaining)} remaining`}
                  </div>
                </>
              )}
              {quota.will_exceed_budget && (
                <div style={{ fontSize: 12, color: "#c0392b", marginTop: 4 }}>
                  Forecast ${Number(quota.forecast_month_cost || 0).toFixed(2)} — {quota.days_remaining_in_month}d left
                </div>
              )}
            </div>

            {/* Token usage */}
            <div className="panel" style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)", padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Token Usage</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{num(quota.month_tokens)}</div>
              <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 6 }}>tokens this month</div>
              <div className="metric-chip-row" style={{ flexWrap: "wrap", gap: 6 }}>
                <span className="metric-chip">Today <b>{num(quota.today_tokens)}</b></span>
                {quota.token_quota_daily && (
                  <span className="metric-chip">Daily limit <b>{num(quota.token_quota_daily)}</b></span>
                )}
              </div>
              {quota.token_quota_daily > 0 && (
                <>
                  <div style={{ background: "var(--gray-100)", borderRadius: 6, height: 8, overflow: "hidden", marginTop: 8 }}>
                    <div style={{
                      width: `${Math.min(Number(quota.token_quota_percent || 0), 100)}%`,
                      height: "100%",
                      background: Number(quota.token_quota_percent || 0) >= 100 ? "#c0392b" : Number(quota.token_quota_percent || 0) >= 80 ? "#e67e22" : "#3FB6D4",
                      borderRadius: 6,
                    }} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 4 }}>
                    {Number(quota.token_quota_percent || 0).toFixed(1)}% of daily quota used
                  </div>
                </>
              )}
            </div>

            {/* Velocity */}
            <div className="panel" style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)", padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Velocity &amp; Forecast</div>
              <div className="metric-chip-row" style={{ flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                <div className="tool-cost-chip" style={{ width: "100%" }}>
                  <strong>Spend / day</strong>
                  <div>${Number(quota.daily_velocity_cost || 0).toFixed(4)}</div>
                </div>
                <div className="tool-cost-chip" style={{ width: "100%" }}>
                  <strong>Tokens / day</strong>
                  <div>{num(Math.round(quota.daily_velocity_tokens || 0))}</div>
                </div>
                <div className="tool-cost-chip" style={{ width: "100%" }}>
                  <strong>Month forecast</strong>
                  <div style={{ color: quota.will_exceed_budget ? "#c0392b" : "inherit" }}>
                    {money(quota.forecast_month_cost)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

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

      {breakdown && breakdown.total_cost > 0 ? (
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>Where the cost goes</h3>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
                Total spend
              </div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>
                {money4(breakdown.total_cost)}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              height: 14,
              borderRadius: 8,
              overflow: "hidden",
              background: "rgba(124,112,174,0.12)",
            }}
          >
            {breakdown.components.map((c, i) => {
              const colors = ["#9E2A97", "#3FB6D4", "#F2A33C"];
              const width = breakdown.total_cost
                ? (c.amount / breakdown.total_cost) * 100
                : 0;
              if (width <= 0) return null;
              return (
                <div
                  key={c.name}
                  title={`${c.name}: ${money4(c.amount)} (${c.percent}%)`}
                  style={{ width: `${width}%`, background: colors[i % colors.length] }}
                />
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 18,
              marginTop: 12,
              fontSize: 13,
            }}
          >
            {breakdown.components.map((c, i) => {
              const colors = ["#9E2A97", "#3FB6D4", "#F2A33C"];
              return (
                <div
                  key={c.name}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: colors[i % colors.length],
                    }}
                  />
                  <span>
                    <strong>{c.name}</strong>{" "}
                    <span style={{ color: "var(--gray-500)" }}>
                      {money4(c.amount)} · {c.percent}%
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Cost by Tool</h3>
            <p
              style={{
                margin: "2px 0 0",
                color: "var(--gray-500)",
                fontSize: 13,
              }}
            >
              LLM + Infrastructure + External split for every tool registered
              through the Control Module.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tool</th>
                <th>Vendor</th>
                <th>Cost Model</th>
                <th>Events</th>
                <th>Tokens</th>
                <th>LLM</th>
                <th>Infra</th>
                <th>External</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {byTool.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    style={{ textAlign: "center", color: "var(--gray-500)" }}
                  >
                    No tool data yet.
                  </td>
                </tr>
              )}
              {byTool.map((r) => (
                <tr key={r.tool_name}>
                  <td>
                    <strong>{r.tool_name}</strong>
                  </td>
                  <td>{r.vendor}</td>
                  <td>{r.cost_model}</td>
                  <td>{num(r.total_events)}</td>
                  <td>{num(r.total_tokens)}</td>
                  <td>{money4(r.llm_cost)}</td>
                  <td>{money4(r.infra_cost)}</td>
                  <td>{money4(r.external_cost)}</td>
                  <td>
                    <strong>{money(r.total_cost)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Cost by Provider</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Events</th>
                <th>Tokens</th>
                <th>LLM</th>
                <th>Infra</th>
                <th>External</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {byProvider.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ textAlign: "center", color: "var(--gray-500)" }}
                  >
                    No provider data yet.
                  </td>
                </tr>
              )}
              {byProvider.map((r) => (
                <tr key={r.provider}>
                  <td>
                    <strong>{r.provider}</strong>
                  </td>
                  <td>{num(r.total_events)}</td>
                  <td>{num(r.total_tokens)}</td>
                  <td>{money4(r.llm_cost)}</td>
                  <td>{money4(r.infra_cost)}</td>
                  <td>{money4(r.external_cost)}</td>
                  <td>
                    <strong>{money(r.total_cost)}</strong>
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
              <h3>Cost by Execution Type</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Execution Type</th>
                  <th>Events</th>
                  <th>Tokens</th>
                  <th>Avg Latency</th>
                  <th>Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {byExecutionType.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{ textAlign: "center", color: "var(--gray-500)" }}
                    >
                      No execution-type data yet.
                    </td>
                  </tr>
                )}
                {byExecutionType.map((r) => (
                  <tr key={r.execution_type}>
                    <td>
                      <strong>{r.execution_type}</strong>
                    </td>
                    <td>{num(r.total_events)}</td>
                    <td>{num(r.total_tokens)}</td>
                    <td>{r.avg_latency_ms} ms</td>
                    <td>{money(r.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Cost by Service Type</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Service Type</th>
                  <th>Events</th>
                  <th>Tokens</th>
                  <th>Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {byServiceType.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      style={{ textAlign: "center", color: "var(--gray-500)" }}
                    >
                      No service-type data yet.
                    </td>
                  </tr>
                )}
                {byServiceType.map((r) => (
                  <tr key={r.service_type}>
                    <td>
                      <strong>{r.service_type}</strong>
                    </td>
                    <td>{num(r.total_events)}</td>
                    <td>{num(r.total_tokens)}</td>
                    <td>{money(r.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

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
