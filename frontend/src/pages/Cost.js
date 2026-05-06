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
import { getTracingOrgs, getTracingProjects, getControlQuota, getProjectCostBreakdown, controlIngest, getCostDaily, getCostPerToolDaily, getCostSpendCapStatus, createBudget, deleteBudget } from "../api";

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
  const [projectBreakdown, setProjectBreakdown] = useState(null);
  const [expandedProjectRow, setExpandedProjectRow] = useState(null);
  const [rowBreakdown, setRowBreakdown] = useState({});
  const [toolModal, setToolModal] = useState(null);
  const [toolModalTab, setToolModalTab] = useState("overview");
  const [injectForm, setInjectForm] = useState({});
  const [injectMsg, setInjectMsg] = useState("");
  const [injectSubmitting, setInjectSubmitting] = useState(false);
  const [toolHistory, setToolHistory] = useState([]);
  const [toolHistoryLoading, setToolHistoryLoading] = useState(false);
  const [perToolDaily, setPerToolDaily] = useState([]);
  const [toolDailyFilter, setToolDailyFilter] = useState("");
  const [spendCaps, setSpendCaps] = useState([]);
  const [showAddCap, setShowAddCap] = useState(false);
  const [addCapForm, setAddCapForm] = useState({ org_id: "", project_id: "", budget_type: "monthly", limit_amount: "", alert_threshold_percent: 80 });
  const [addCapMsg, setAddCapMsg] = useState("");
  const [addCapSubmitting, setAddCapSubmitting] = useState(false);
  const [range, setRange] = useState("30d");

  const RANGE_OPTIONS_C = [
    { value: "all", label: "All Time", days: 365 },
    { value: "today", label: "Today", days: 1 },
    { value: "7d", label: "Last 7 Days", days: 7 },
    { value: "30d", label: "Last 30 Days", days: 30 },
    { value: "90d", label: "Last 90 Days", days: 90 },
  ];

  const load = async () => {
    try {
      setLoading(true);
      const opt = RANGE_OPTIONS_C.find((r) => r.value === range) || RANGE_OPTIONS_C[2];
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
        perToolDailyRes,
        spendCapsRes,
      ] = await Promise.all([
        API.get("/costs/totals"),
        API.get("/costs/by-model", { params: scope }),
        API.get("/costs/by-project", { params: { org_id: selectedOrg || undefined } }),
        API.get("/costs/by-org"),
        API.get("/costs/daily", { params: { days: opt.days, ...scope } }),
        API.get("/costs/monthly", { params: scope }),
        getTracingOrgs(),
        API.get("/costs/by-tool", { params: scope }),
        API.get("/costs/by-provider", { params: scope }),
        API.get("/costs/by-execution-type", { params: scope }),
        API.get("/costs/by-service-type", { params: scope }),
        API.get("/costs/breakdown", { params: scope }),
        getCostPerToolDaily(opt.days, selectedOrg || undefined, selectedProject || undefined),
        getCostSpendCapStatus(selectedOrg || undefined, selectedProject || undefined),
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
      setPerToolDaily(perToolDailyRes.data || []);
      setSpendCaps(spendCapsRes.data || []);
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
  }, [selectedOrg, selectedProject, range]);

  useEffect(() => {
    getTracingProjects(selectedOrg || "").then((res) => setProjects(res.data || []));
    setSelectedProject("");
  }, [selectedOrg]);

  useEffect(() => {
    if (selectedProject) {
      getProjectCostBreakdown(selectedProject, selectedOrg || undefined)
        .then((r) => setProjectBreakdown(r.data))
        .catch(() => setProjectBreakdown(null));
    } else {
      setProjectBreakdown(null);
    }
  }, [selectedProject, selectedOrg]);

  const toggleProjectRow = async (projectId, orgId) => {
    if (expandedProjectRow === projectId) {
      setExpandedProjectRow(null);
      return;
    }
    setExpandedProjectRow(projectId);
    if (!rowBreakdown[projectId]) {
      try {
        const r = await getProjectCostBreakdown(projectId, orgId);
        setRowBreakdown((prev) => ({ ...prev, [projectId]: r.data }));
      } catch {
        setRowBreakdown((prev) => ({ ...prev, [projectId]: null }));
      }
    }
  };

  const openToolModal = (tool, projectId, orgId) => {
    setToolModal({ tool, projectId, orgId });
    setToolModalTab("overview");
    setInjectMsg("");
    setInjectForm({
      provider: "",
      model_name: tool.tool_name,
      input_tokens: "",
      output_tokens: "",
      latency_ms: "500",
      status: "success",
      pii_type: "",
      tags: "",
    });
    setToolHistory([]);
  };

  const closeToolModal = () => {
    setToolModal(null);
    setInjectMsg("");
    setToolHistory([]);
  };

  const handleToolModalTab = async (tab) => {
    setToolModalTab(tab);
    if (tab === "history" && toolModal && toolHistory.length === 0) {
      setToolHistoryLoading(true);
      try {
        const res = await getCostDaily(14, toolModal.orgId || undefined, toolModal.projectId);
        const rows = (res.data || []).filter((r) => r.tool_name === toolModal.tool.tool_name);
        setToolHistory(rows);
      } catch {
        setToolHistory([]);
      } finally {
        setToolHistoryLoading(false);
      }
    }
  };

  const handleInjectEvent = async (e) => {
    e.preventDefault();
    if (!injectForm.model_name) { setInjectMsg("Model / tool name is required."); return; }
    setInjectSubmitting(true);
    setInjectMsg("");
    try {
      await controlIngest({
        org_id: toolModal.orgId || "default",
        project_id: toolModal.projectId || undefined,
        provider: injectForm.provider || "custom",
        model_name: injectForm.model_name,
        input_tokens: Number(injectForm.input_tokens) || 0,
        output_tokens: Number(injectForm.output_tokens) || 0,
        latency_ms: Number(injectForm.latency_ms) || 0,
        status: injectForm.status || "success",
        pii_type: injectForm.pii_type || undefined,
        tags: injectForm.tags ? injectForm.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      });
      setInjectMsg("Event injected successfully.");
    } catch {
      setInjectMsg("Injection failed. Check backend connectivity.");
    } finally {
      setInjectSubmitting(false);
    }
  };

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
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
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
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingBottom: 2 }}>
            {RANGE_OPTIONS_C.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`btn ${range === opt.value ? "btn-primary" : "btn-ghost"}`}
                style={{ fontSize: 12, padding: "5px 12px" }}
                onClick={() => setRange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
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

      {/* ── Spend Cap & Alerts ── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Spend Cap &amp; Alerts</h3>
            <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
              Configure spend limits per org or project. Alerts fire at your threshold%, 90%, and 100%, plus a predictive overrun warning.
            </p>
          </div>
          <button type="button" className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => { setShowAddCap(!showAddCap); setAddCapMsg(""); }}>
            {showAddCap ? "Cancel" : "+ Add Spend Cap"}
          </button>
        </div>

        {showAddCap && (
          <form
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, padding: "14px 0 4px", borderBottom: "1px solid var(--gray-100)", marginBottom: 18 }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!addCapForm.org_id || !addCapForm.limit_amount) { setAddCapMsg("Org ID and limit are required."); return; }
              setAddCapSubmitting(true); setAddCapMsg("");
              try {
                await createBudget({
                  org_id: addCapForm.org_id,
                  project_id: addCapForm.project_id || null,
                  budget_type: addCapForm.budget_type,
                  limit_amount: parseFloat(addCapForm.limit_amount),
                  alert_threshold_percent: parseInt(addCapForm.alert_threshold_percent, 10) || 80,
                });
                setAddCapMsg("Spend cap created.");
                setShowAddCap(false);
                const r = await getCostSpendCapStatus(selectedOrg || undefined, selectedProject || undefined);
                setSpendCaps(r.data || []);
              } catch { setAddCapMsg("Failed to create spend cap."); }
              finally { setAddCapSubmitting(false); }
            }}
          >
            <div className="field">
              <label>Org ID *</label>
              <input value={addCapForm.org_id} onChange={(e) => setAddCapForm({ ...addCapForm, org_id: e.target.value })} placeholder="e.g. org-acme" />
            </div>
            <div className="field">
              <label>Project ID</label>
              <input value={addCapForm.project_id} onChange={(e) => setAddCapForm({ ...addCapForm, project_id: e.target.value })} placeholder="optional" />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={addCapForm.budget_type} onChange={(e) => setAddCapForm({ ...addCapForm, budget_type: e.target.value })}>
                <option value="monthly">Monthly</option>
                <option value="daily">Daily</option>
              </select>
            </div>
            <div className="field">
              <label>Limit ($) *</label>
              <input type="number" min="0.01" step="0.01" value={addCapForm.limit_amount} onChange={(e) => setAddCapForm({ ...addCapForm, limit_amount: e.target.value })} placeholder="e.g. 500" />
            </div>
            <div className="field">
              <label>Alert at (%)</label>
              <input type="number" min="1" max="100" value={addCapForm.alert_threshold_percent} onChange={(e) => setAddCapForm({ ...addCapForm, alert_threshold_percent: e.target.value })} />
            </div>
            <div className="field" style={{ display: "flex", alignItems: "flex-end" }}>
              <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={addCapSubmitting}>
                {addCapSubmitting ? "Saving…" : "Save Cap"}
              </button>
            </div>
            {addCapMsg && <div style={{ gridColumn: "1/-1", fontSize: 13, color: addCapMsg.includes("created") ? "var(--success)" : "#c0392b" }}>{addCapMsg}</div>}
          </form>
        )}

        {spendCaps.length === 0 ? (
          <div style={{ color: "var(--gray-500)", fontSize: 13, padding: "12px 0" }}>
            No spend caps configured yet. Click "+ Add Spend Cap" to set a daily or monthly budget limit.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 16 }}>
            {spendCaps.map((cap) => {
              const STATUS_COLOR = { ok: "#22c55e", warning: "#f59e0b", critical: "#f97316", exceeded: "#ef4444" };
              const barColor = STATUS_COLOR[cap.status] || "#22c55e";
              const fcPct = cap.forecast != null ? Math.min((cap.forecast / cap.limit_amount) * 100, 150) : null;
              const budgetAlerts = cap.active_alerts.filter((a) => a.alert_type.startsWith("budget") || a.alert_type.includes("cost"));
              return (
                <div
                  key={cap.budget_id}
                  style={{ background: "var(--gray-50)", border: `1px solid ${cap.status === "ok" ? "rgba(124,112,174,0.18)" : barColor + "55"}`, borderRadius: 10, padding: 16 }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{cap.org_id}</div>
                      {cap.project_id && <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{cap.project_id}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "rgba(124,112,174,0.12)", color: "var(--gray-500)", fontWeight: 600, textTransform: "uppercase" }}>
                        {cap.budget_type}
                      </span>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: barColor + "22", color: barColor, fontWeight: 700, textTransform: "uppercase" }}>
                        {cap.status}
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: 22, fontWeight: 700 }}>{money(cap.spent)}</div>
                  <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 8 }}>of {money(cap.limit_amount)} limit · {money(cap.remaining)} remaining</div>

                  {/* Spend bar */}
                  <div style={{ background: "var(--gray-100)", borderRadius: 6, height: 8, overflow: "hidden", position: "relative", marginBottom: 4 }}>
                    <div style={{ width: `${Math.min(cap.pct_used, 100)}%`, height: "100%", background: barColor, borderRadius: 6, transition: "width 0.4s" }} />
                    {fcPct != null && fcPct > cap.pct_used && (
                      <div style={{
                        position: "absolute", top: 0, left: `${Math.min(cap.pct_used, 100)}%`,
                        width: `${Math.min(fcPct - cap.pct_used, 100 - Math.min(cap.pct_used, 100))}%`,
                        height: "100%", background: "rgba(239,68,68,0.25)", borderRight: "2px dashed #ef4444",
                      }} />
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--gray-500)", marginBottom: 8 }}>
                    <span>Used {cap.pct_used.toFixed(1)}%</span>
                    {cap.forecast != null && (
                      <span style={{ color: cap.forecast > cap.limit_amount ? "#ef4444" : "var(--gray-500)" }}>
                        Forecast {money(cap.forecast)}
                      </span>
                    )}
                  </div>

                  {/* Alert threshold marker */}
                  <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 6 }}>
                    Alert threshold: <strong>{cap.threshold_pct}%</strong>
                    {cap.today_tokens > 0 && <span style={{ marginLeft: 8 }}>· {num(cap.today_tokens)} tokens today</span>}
                  </div>

                  {/* Active alerts */}
                  {budgetAlerts.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {budgetAlerts.slice(0, 3).map((a, i) => (
                        <div key={i} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: a.severity === "critical" ? "#fef2f2" : a.severity === "high" ? "#fff7ed" : "#fefce8", color: a.severity === "critical" ? "#ef4444" : a.severity === "high" ? "#f97316" : "#ca8a04", fontWeight: 500 }}>
                          {a.message}
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    style={{ marginTop: 10, fontSize: 11, padding: "3px 10px", border: "1px solid var(--gray-200)", borderRadius: 6, background: "none", color: "var(--gray-500)", cursor: "pointer" }}
                    onClick={async () => {
                      if (!window.confirm(`Delete spend cap for ${cap.org_id}?`)) return;
                      try { await deleteBudget(cap.budget_id); const r = await getCostSpendCapStatus(selectedOrg || undefined, selectedProject || undefined); setSpendCaps(r.data || []); } catch {}
                    }}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Project Cost Summary (shown when a project is selected) ── */}
      {projectBreakdown && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>Project Cost Summary — {projectBreakdown.project_id}</h3>
              <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                Total spend aggregated across all models and tools used in this project.
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "var(--gray-500)" }}>Total project cost</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{money4(projectBreakdown.total_cost)}</div>
              <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>
                {num(projectBreakdown.total_events)} events · {num(projectBreakdown.total_tokens)} tokens · {projectBreakdown.tool_count} tool{projectBreakdown.tool_count !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* Cost component bar */}
          {projectBreakdown.total_cost > 0 && (
            <>
              <div style={{ display: "flex", height: 12, borderRadius: 8, overflow: "hidden", background: "rgba(124,112,174,0.12)", margin: "12px 0 8px" }}>
                {projectBreakdown.llm_pct > 0 && (
                  <div title={`LLM: ${money4(projectBreakdown.llm_cost)} (${projectBreakdown.llm_pct}%)`}
                    style={{ width: `${projectBreakdown.llm_pct}%`, background: "#9E2A97" }} />
                )}
                {projectBreakdown.infra_pct > 0 && (
                  <div title={`Infra: ${money4(projectBreakdown.infra_cost)} (${projectBreakdown.infra_pct}%)`}
                    style={{ width: `${projectBreakdown.infra_pct}%`, background: "#3FB6D4" }} />
                )}
                {projectBreakdown.external_pct > 0 && (
                  <div title={`External: ${money4(projectBreakdown.external_cost)} (${projectBreakdown.external_pct}%)`}
                    style={{ width: `${projectBreakdown.external_pct}%`, background: "#F2A33C" }} />
                )}
              </div>
              <div style={{ display: "flex", gap: 18, fontSize: 13, marginBottom: 16 }}>
                {[
                  { label: "LLM", amount: projectBreakdown.llm_cost, pct: projectBreakdown.llm_pct, color: "#9E2A97" },
                  { label: "Infra", amount: projectBreakdown.infra_cost, pct: projectBreakdown.infra_pct, color: "#3FB6D4" },
                  { label: "External", amount: projectBreakdown.external_cost, pct: projectBreakdown.external_pct, color: "#F2A33C" },
                ].map((c) => (
                  <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                    <span><strong>{c.label}</strong> <span style={{ color: "var(--gray-500)" }}>{money4(c.amount)} · {c.pct}%</span></span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Tool-wise breakdown table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tool / Model</th>
                  <th>Vendor</th>
                  <th>Events</th>
                  <th>Tokens</th>
                  <th>LLM</th>
                  <th>Infra</th>
                  <th>External</th>
                  <th>Total</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {projectBreakdown.tools.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--gray-500)" }}>No tool data for this project.</td></tr>
                )}
                {projectBreakdown.tools.map((t) => (
                  <tr key={t.tool_name} style={{ cursor: "pointer" }} onClick={() => openToolModal(t, projectBreakdown.project_id, projectBreakdown.org_id)}>
                    <td><strong style={{ color: "var(--brand-primary)" }}>{t.tool_name}</strong></td>
                    <td>{t.vendor}</td>
                    <td>{num(t.total_events)}</td>
                    <td>{num(t.total_tokens)}</td>
                    <td>{money4(t.llm_cost)}</td>
                    <td>{money4(t.infra_cost)}</td>
                    <td>{money4(t.external_cost)}</td>
                    <td><strong>{money(t.total_cost)}</strong></td>
                    <td style={{ minWidth: 110 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1, background: "rgba(124,112,174,0.12)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                          <div style={{ width: `${t.cost_share_pct}%`, height: "100%", background: "#9E2A97", borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 12, color: "var(--gray-500)", whiteSpace: "nowrap" }}>{t.cost_share_pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {projectBreakdown.tools.length > 1 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid rgba(124,112,174,0.2)" }}>
                    <td colSpan={4}><strong>Project Total</strong></td>
                    <td>{money4(projectBreakdown.llm_cost)}</td>
                    <td>{money4(projectBreakdown.infra_cost)}</td>
                    <td>{money4(projectBreakdown.external_cost)}</td>
                    <td><strong>{money(projectBreakdown.total_cost)}</strong></td>
                    <td><span style={{ fontSize: 12, color: "var(--gray-500)" }}>100%</span></td>
                  </tr>
                </tfoot>
              )}
            </table>
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
            <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
              Click any row to expand tool-wise cost breakdown for that project.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Org</th>
                <th>Tools</th>
                <th>Events</th>
                <th>Tokens</th>
                <th>LLM</th>
                <th>Infra</th>
                <th>External</th>
                <th>Total Cost</th>
                <th>Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {byProject.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", color: "var(--gray-500)" }}>
                    No project data yet.
                  </td>
                </tr>
              )}
              {byProject.map((r) => {
                const isExpanded = expandedProjectRow === r.project_id;
                const bd = rowBreakdown[r.project_id];
                return (
                  <React.Fragment key={`${r.project_id}-${r.org_id}`}>
                    <tr
                      style={{ cursor: "pointer", background: isExpanded ? "rgba(158,42,151,0.06)" : undefined }}
                      onClick={() => toggleProjectRow(r.project_id, r.org_id)}
                    >
                      <td>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, color: "var(--gray-500)", lineHeight: 1 }}>{isExpanded ? "▲" : "▶"}</span>
                          <strong>{r.project_id}</strong>
                        </span>
                      </td>
                      <td>{r.org_id}</td>
                      <td>{r.tool_count}</td>
                      <td>{num(r.total_events)}</td>
                      <td>{num(r.total_tokens)}</td>
                      <td>{money4(r.llm_cost)}</td>
                      <td>{money4(r.infra_cost)}</td>
                      <td>{money4(r.external_cost)}</td>
                      <td><strong>{money(r.total_cost)}</strong></td>
                      <td>{r.avg_latency_ms} ms</td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={10} style={{ padding: 0, background: "rgba(158,42,151,0.03)" }}>
                          {!bd ? (
                            <div style={{ padding: "12px 24px", color: "var(--gray-500)", fontSize: 13 }}>Loading breakdown…</div>
                          ) : bd.tools.length === 0 ? (
                            <div style={{ padding: "12px 24px", color: "var(--gray-500)", fontSize: 13 }}>No tool data for this project.</div>
                          ) : (
                            <div style={{ padding: "12px 24px" }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-500)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Tool-wise Cost Breakdown
                              </div>
                              <table style={{ width: "100%" }}>
                                <thead>
                                  <tr>
                                    <th>Tool / Model</th>
                                    <th>Vendor</th>
                                    <th>Events</th>
                                    <th>LLM</th>
                                    <th>Infra</th>
                                    <th>External</th>
                                    <th>Total</th>
                                    <th>Share of Project</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {bd.tools.map((t) => (
                                    <tr key={t.tool_name} style={{ cursor: "pointer" }} onClick={() => openToolModal(t, r.project_id, r.org_id)}>
                                      <td><strong style={{ color: "var(--brand-primary)" }}>{t.tool_name}</strong></td>
                                      <td>{t.vendor}</td>
                                      <td>{num(t.total_events)}</td>
                                      <td>{money4(t.llm_cost)}</td>
                                      <td>{money4(t.infra_cost)}</td>
                                      <td>{money4(t.external_cost)}</td>
                                      <td><strong>{money(t.total_cost)}</strong></td>
                                      <td style={{ minWidth: 120 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                          <div style={{ flex: 1, background: "rgba(124,112,174,0.15)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                                            <div style={{ width: `${t.cost_share_pct}%`, height: "100%", background: "#9E2A97", borderRadius: 4 }} />
                                          </div>
                                          <span style={{ fontSize: 12, color: "var(--gray-500)", whiteSpace: "nowrap" }}>{t.cost_share_pct}%</span>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr style={{ borderTop: "1px solid rgba(124,112,174,0.2)" }}>
                                    <td colSpan={3}><strong>Project Total</strong></td>
                                    <td>{money4(bd.llm_cost)}</td>
                                    <td>{money4(bd.infra_cost)}</td>
                                    <td>{money4(bd.external_cost)}</td>
                                    <td><strong>{money(bd.total_cost)}</strong></td>
                                    <td><span style={{ fontSize: 12, color: "var(--gray-500)" }}>100%</span></td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
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

      {/* ── Per-Tool Daily Cost Monitoring ── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Per-Tool Daily Cost Monitoring</h3>
            <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
              Input/output token usage, cost, and email volume for each AI tool — last 14 days.
            </p>
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <select value={toolDailyFilter} onChange={(e) => setToolDailyFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="">All Tools</option>
              {[...new Set(perToolDaily.map((r) => r.tool_name))].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Tool</th>
                <th>Input Tokens</th>
                <th>Output Tokens</th>
                <th>Total Tokens</th>
                <th>Cost</th>
                <th>Email Volume</th>
                <th>Events</th>
              </tr>
            </thead>
            <tbody>
              {perToolDaily.filter((r) => !toolDailyFilter || r.tool_name === toolDailyFilter).length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", color: "var(--gray-500)" }}>
                    No per-tool daily data yet.
                  </td>
                </tr>
              ) : (
                perToolDaily
                  .filter((r) => !toolDailyFilter || r.tool_name === toolDailyFilter)
                  .map((r, i) => {
                    const inputPct = r.total_tokens > 0 ? Math.round((r.input_tokens / r.total_tokens) * 100) : 0;
                    const outputPct = 100 - inputPct;
                    return (
                      <tr key={`${r.date}-${r.tool_name}-${i}`}>
                        <td style={{ whiteSpace: "nowrap" }}>{r.date}</td>
                        <td><strong>{r.tool_name}</strong></td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 40, height: 5, borderRadius: 3, background: "rgba(124,112,174,0.15)", overflow: "hidden" }}>
                              <div style={{ width: `${inputPct}%`, height: "100%", background: "#9E2A97", borderRadius: 3 }} />
                            </div>
                            <span>{num(r.input_tokens)}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 40, height: 5, borderRadius: 3, background: "rgba(124,112,174,0.15)", overflow: "hidden" }}>
                              <div style={{ width: `${outputPct}%`, height: "100%", background: "#3FB6D4", borderRadius: 3 }} />
                            </div>
                            <span>{num(r.output_tokens)}</span>
                          </div>
                        </td>
                        <td>{num(r.total_tokens)}</td>
                        <td><strong>{money(r.total_cost)}</strong></td>
                        <td>
                          {r.email_volume > 0 ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "2px 8px", borderRadius: 10, background: "rgba(63,182,212,0.12)", color: "#3FB6D4", fontWeight: 600 }}>
                              {num(r.email_volume)} emails
                            </span>
                          ) : (
                            <span style={{ color: "var(--gray-400)", fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td>{num(r.total_events)}</td>
                      </tr>
                    );
                  })
              )}
            </tbody>
            {perToolDaily.filter((r) => !toolDailyFilter || r.tool_name === toolDailyFilter).length > 1 && (() => {
              const rows = perToolDaily.filter((r) => !toolDailyFilter || r.tool_name === toolDailyFilter);
              return (
                <tfoot>
                  <tr style={{ borderTop: "2px solid rgba(124,112,174,0.2)" }}>
                    <td colSpan={2}><strong>14-day Total</strong></td>
                    <td>{num(rows.reduce((s, r) => s + r.input_tokens, 0))}</td>
                    <td>{num(rows.reduce((s, r) => s + r.output_tokens, 0))}</td>
                    <td>{num(rows.reduce((s, r) => s + r.total_tokens, 0))}</td>
                    <td><strong>{money(rows.reduce((s, r) => s + r.total_cost, 0))}</strong></td>
                    <td>{num(rows.reduce((s, r) => s + r.email_volume, 0))}</td>
                    <td>{num(rows.reduce((s, r) => s + r.total_events, 0))}</td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </section>

      {/* ── Tool Actions Modal ── */}
      {toolModal && (
        <div className="modal-backdrop metric-modal-backdrop" onClick={closeToolModal}>
          <div className="modal-dialog" style={{ maxWidth: 680, width: "95%" }} onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="modal-header">
              <div>
                <div className="metric-eyebrow">Tool · {toolModal.projectId}</div>
                <h3 style={{ marginTop: 4 }}>{toolModal.tool.tool_name}</h3>
                <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>
                  {toolModal.tool.vendor !== "—" && <span>{toolModal.tool.vendor} · </span>}
                  {toolModal.tool.cost_model} · {num(toolModal.tool.total_events)} events
                </div>
              </div>
              <button type="button" className="btn-close" onClick={closeToolModal}>×</button>
            </div>

            {/* Tab bar */}
            <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--gray-200)", marginBottom: 18, flexWrap: "wrap" }}>
              {[
                { key: "overview",  label: "Overview" },
                { key: "inject",    label: "Inject Telemetry Event" },
                { key: "snippet",   label: "API Snippet" },
                { key: "history",   label: "Cost History" },
                { key: "config",    label: "Tool Config" },
              ].map(({ key, label }) => (
                <button key={key} type="button" onClick={() => handleToolModalTab(key)} style={{
                  padding: "8px 14px", border: "none", background: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: toolModalTab === key ? 700 : 400,
                  color: toolModalTab === key ? "var(--brand-primary)" : "var(--gray-500)",
                  borderBottom: toolModalTab === key ? "2px solid var(--brand-primary)" : "2px solid transparent",
                  marginBottom: -1, whiteSpace: "nowrap",
                }}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── Tab: Overview ── */}
            {toolModalTab === "overview" && (
              <div className="stack">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                  {[
                    { label: "Total Cost",   value: money(toolModal.tool.total_cost) },
                    { label: "LLM Cost",     value: money4(toolModal.tool.llm_cost) },
                    { label: "Infra Cost",   value: money4(toolModal.tool.infra_cost) },
                    { label: "External",     value: money4(toolModal.tool.external_cost) },
                    { label: "Events",       value: num(toolModal.tool.total_events) },
                    { label: "Tokens",       value: num(toolModal.tool.total_tokens) },
                    { label: "Cost Share",   value: `${toolModal.tool.cost_share_pct}%` },
                    { label: "Avg / Event",  value: toolModal.tool.total_events > 0
                        ? money4(toolModal.tool.total_cost / toolModal.tool.total_events)
                        : "$0.00" },
                  ].map(({ label, value }) => (
                    <div key={label} className="tool-cost-chip">
                      <strong>{label}</strong>
                      <div>{value}</div>
                    </div>
                  ))}
                </div>

                {toolModal.tool.total_cost > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Cost composition</div>
                    <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", background: "rgba(124,112,174,0.12)" }}>
                      {toolModal.tool.llm_cost > 0 && <div style={{ width: `${(toolModal.tool.llm_cost / toolModal.tool.total_cost) * 100}%`, background: "#9E2A97" }} />}
                      {toolModal.tool.infra_cost > 0 && <div style={{ width: `${(toolModal.tool.infra_cost / toolModal.tool.total_cost) * 100}%`, background: "#3FB6D4" }} />}
                      {toolModal.tool.external_cost > 0 && <div style={{ width: `${(toolModal.tool.external_cost / toolModal.tool.total_cost) * 100}%`, background: "#F2A33C" }} />}
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                      {[["LLM", "#9E2A97"], ["Infra", "#3FB6D4"], ["External", "#F2A33C"]].map(([l, c]) => (
                        <span key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                          {l}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Tab: Inject Telemetry Event ── */}
            {toolModalTab === "inject" && (
              <form className="stack" onSubmit={handleInjectEvent}>
                <p style={{ margin: "0 0 12px", color: "var(--gray-500)", fontSize: 13 }}>
                  Inject a new telemetry event for <strong>{toolModal.tool.tool_name}</strong> in project <strong>{toolModal.projectId}</strong>.
                  Org and tool are pre-filled — add provider, tokens, and latency.
                </p>
                <div className="form-grid">
                  <div className="field">
                    <label>Organization</label>
                    <input value={toolModal.orgId || ""} disabled style={{ opacity: 0.7 }} />
                  </div>
                  <div className="field">
                    <label>Project</label>
                    <input value={toolModal.projectId || ""} disabled style={{ opacity: 0.7 }} />
                  </div>
                  <div className="field">
                    <label>Tool / Model *</label>
                    <input value={injectForm.model_name} onChange={(e) => setInjectForm({ ...injectForm, model_name: e.target.value })} placeholder="e.g. gpt-4o" />
                  </div>
                  <div className="field">
                    <label>Provider</label>
                    <input value={injectForm.provider} onChange={(e) => setInjectForm({ ...injectForm, provider: e.target.value })} placeholder="e.g. openai, anthropic" />
                  </div>
                  <div className="field">
                    <label>Input Tokens</label>
                    <input type="number" min="0" value={injectForm.input_tokens} onChange={(e) => setInjectForm({ ...injectForm, input_tokens: e.target.value })} placeholder="0" />
                  </div>
                  <div className="field">
                    <label>Output Tokens</label>
                    <input type="number" min="0" value={injectForm.output_tokens} onChange={(e) => setInjectForm({ ...injectForm, output_tokens: e.target.value })} placeholder="0" />
                  </div>
                  <div className="field">
                    <label>Latency (ms)</label>
                    <input type="number" min="0" value={injectForm.latency_ms} onChange={(e) => setInjectForm({ ...injectForm, latency_ms: e.target.value })} placeholder="500" />
                  </div>
                  <div className="field">
                    <label>Status</label>
                    <select value={injectForm.status} onChange={(e) => setInjectForm({ ...injectForm, status: e.target.value })}>
                      {["success", "error", "partial"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>PII Type</label>
                    <input value={injectForm.pii_type} onChange={(e) => setInjectForm({ ...injectForm, pii_type: e.target.value })} placeholder="email, ssn (leave empty if none)" />
                  </div>
                  <div className="field">
                    <label>Tags</label>
                    <input value={injectForm.tags} onChange={(e) => setInjectForm({ ...injectForm, tags: e.target.value })} placeholder="comma-separated tags" />
                  </div>
                </div>
                {injectMsg && (
                  <div className="feedback-msg" style={{ color: injectMsg.includes("success") ? "var(--success)" : "var(--brand-primary)" }}>
                    {injectMsg}
                  </div>
                )}
                <div className="action-row">
                  <button type="submit" className="btn btn-primary" disabled={injectSubmitting}>
                    {injectSubmitting ? "Injecting…" : "Inject Telemetry Event"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setInjectForm({ ...injectForm, provider: "", input_tokens: "", output_tokens: "", latency_ms: "500", pii_type: "", tags: "" })}>
                    ↺ Reset
                  </button>
                </div>
              </form>
            )}

            {/* ── Tab: API Snippet ── */}
            {toolModalTab === "snippet" && (
              <div className="stack">
                <p style={{ margin: "0 0 8px", color: "var(--gray-500)", fontSize: 13 }}>
                  Ready-to-use payload for <code>POST /control/ingest</code>. Copy and adapt as needed.
                </p>
                <pre style={{ fontSize: 12, padding: 16, borderRadius: 10, background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)", overflow: "auto", margin: 0, lineHeight: 1.8 }}>
{`POST /control/ingest

{
  "org_id":        "${toolModal.orgId || "your-org-id"}",
  "project_id":    "${toolModal.projectId || "your-project-id"}",
  "provider":      "${toolModal.tool.vendor !== "—" ? toolModal.tool.vendor.toLowerCase() : "openai"}",
  "model_name":    "${toolModal.tool.tool_name}",
  "input_tokens":  1200,
  "output_tokens": 380,
  "latency_ms":    740,
  "status":        "success",
  "tool_usages": [
    { "name": "${toolModal.tool.tool_name}", "cost": ${Number(toolModal.tool.total_cost / Math.max(toolModal.tool.total_events, 1)).toFixed(6)} }
  ]
}`}
                </pre>
                <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 4 }}>
                  Cost model: <strong>{toolModal.tool.cost_model}</strong> ·
                  Avg cost/event: <strong>{money4(toolModal.tool.total_cost / Math.max(toolModal.tool.total_events, 1))}</strong>
                </div>
              </div>
            )}

            {/* ── Tab: Cost History ── */}
            {toolModalTab === "history" && (
              <div>
                {toolHistoryLoading ? (
                  <div style={{ color: "var(--gray-500)", fontSize: 13, padding: "12px 0" }}>Loading cost history…</div>
                ) : toolHistory.length === 0 ? (
                  <div style={{ color: "var(--gray-500)", fontSize: 13, padding: "12px 0" }}>No daily cost data for this tool in project <strong>{toolModal.projectId}</strong> (last 14 days).</div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Total Cost</th>
                          <th>Tokens</th>
                          <th>Events</th>
                        </tr>
                      </thead>
                      <tbody>
                        {toolHistory.map((r) => (
                          <tr key={r.date}>
                            <td>{r.date}</td>
                            <td><strong>{money(r.total_cost)}</strong></td>
                            <td>{num(r.total_tokens)}</td>
                            <td>{num(r.total_events)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: "2px solid rgba(124,112,174,0.2)" }}>
                          <td><strong>14-day Total</strong></td>
                          <td><strong>{money(toolHistory.reduce((s, r) => s + Number(r.total_cost || 0), 0))}</strong></td>
                          <td>{num(toolHistory.reduce((s, r) => s + Number(r.total_tokens || 0), 0))}</td>
                          <td>{num(toolHistory.reduce((s, r) => s + Number(r.total_events || 0), 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Tool Config ── */}
            {toolModalTab === "config" && (
              <div className="stack">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                  {[
                    { label: "Tool Name",    value: toolModal.tool.tool_name },
                    { label: "Vendor",       value: toolModal.tool.vendor },
                    { label: "Cost Model",   value: toolModal.tool.cost_model },
                    { label: "Linked Project", value: toolModal.projectId },
                    { label: "Org",          value: toolModal.orgId || "—" },
                    { label: "Total Events", value: num(toolModal.tool.total_events) },
                    { label: "Total Tokens", value: num(toolModal.tool.total_tokens) },
                    { label: "Total Cost",   value: money(toolModal.tool.total_cost) },
                  ].map(({ label, value }) => (
                    <div key={label} className="tool-cost-chip">
                      <strong>{label}</strong>
                      <div style={{ wordBreak: "break-all" }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 8, padding: "10px 14px", background: "var(--gray-50)", borderRadius: 8, border: "1px solid rgba(124,112,174,0.15)" }}>
                  To update pricing or cost model for this tool, go to <strong>Tracing → Model-Tool Configuration</strong> and register or modify the entry for <code>{toolModal.tool.tool_name}</code>.
                </div>
              </div>
            )}

            <div className="action-row" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={closeToolModal}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Cost;
