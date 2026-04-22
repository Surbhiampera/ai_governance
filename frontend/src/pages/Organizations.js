import React, { useState, useEffect } from "react";
import {
  getOrganizations,
  createOrganization,
  deleteOrganization,
  getProjects,
  createProject,
  deleteProject,
  getApiKeys,
  createApiKey,
  deleteApiKey,
  getBudgets,
  createBudget,
  deleteBudget,
} from "../api";

const blankOrg = { id: "", org_name: "", plan_type: "free", budget_limit: "" };
const blankProject = { id: "", org_id: "", project_name: "", environment: "development" };
const blankKey = { id: "", org_id: "", project_id: "", key_name: "", provider: "" };
const blankBudget = { org_id: "", project_id: "", budget_type: "monthly", limit_amount: "", alert_threshold_percent: 80 };

function Organizations() {
  const [orgs, setOrgs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [orgForm, setOrgForm] = useState({ ...blankOrg });
  const [projForm, setProjForm] = useState({ ...blankProject });
  const [keyForm, setKeyForm] = useState({ ...blankKey });
  const [budgetForm, setBudgetForm] = useState({ ...blankBudget });

  const [activeTab, setActiveTab] = useState("orgs");

  const fetchData = async () => {
    try {
      setLoading(true);
      const [orgRes, projRes, keyRes, budgetRes] = await Promise.allSettled([
        getOrganizations(),
        getProjects(selectedOrg),
        getApiKeys(selectedOrg),
        getBudgets(selectedOrg),
      ]);
      if (orgRes.status === "fulfilled") setOrgs(orgRes.value.data);
      if (projRes.status === "fulfilled") setProjects(projRes.value.data);
      if (keyRes.status === "fulfilled") setApiKeys(keyRes.value.data);
      if (budgetRes.status === "fulfilled") setBudgets(budgetRes.value.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedOrg]);

  const generateId = () => Math.random().toString(36).substring(2, 15);

  const flash = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await createOrganization({ ...orgForm, id: orgForm.id || generateId(), budget_limit: parseFloat(orgForm.budget_limit) || null });
      flash("Organization created");
      setOrgForm({ ...blankOrg });
      fetchData();
    } catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  const handleDeleteOrg = async (id) => {
    if (!window.confirm("Delete this organization?")) return;
    try { await deleteOrganization(id); fetchData(); }
    catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await createProject({ ...projForm, id: projForm.id || generateId() });
      flash("Project created");
      setProjForm({ ...blankProject });
      fetchData();
    } catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  const handleDeleteProject = async (id) => {
    try { await deleteProject(id); fetchData(); }
    catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  const handleCreateKey = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await createApiKey({ ...keyForm, id: keyForm.id || `key-${generateId()}` });
      flash("API Key created");
      setKeyForm({ ...blankKey });
      fetchData();
    } catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  const handleDeleteKey = async (id) => {
    try { await deleteApiKey(id); fetchData(); }
    catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  const handleCreateBudget = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await createBudget({ ...budgetForm, limit_amount: parseFloat(budgetForm.limit_amount) || 0, alert_threshold_percent: parseInt(budgetForm.alert_threshold_percent) || 80 });
      flash("Budget created");
      setBudgetForm({ ...blankBudget });
      fetchData();
    } catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  const handleDeleteBudget = async (id) => {
    try { await deleteBudget(id); fetchData(); }
    catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  if (loading) return <div className="loading">Loading organizations...</div>;

  const tabs = [
    { id: "orgs", label: "Organizations", count: orgs.length },
    { id: "projects", label: "Projects", count: projects.length },
    { id: "keys", label: "API Keys", count: apiKeys.length },
    { id: "budgets", label: "Budgets", count: budgets.length },
  ];

  return (
    <div className="page-shell">
      {/* ── Header + Org Filter ── */}
      <section className="panel" style={{ padding: "18px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Organizations</h2>
            <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 14 }}>
              Manage orgs, projects, API keys, and budgets. All telemetry, costs, and alerts are scoped to these entities.
            </p>
          </div>
          <div className="pill-row" style={{ gap: 10, flexWrap: "wrap" }}>
            <div className="pill">Orgs <span className="highlight">{orgs.length}</span></div>
            <div className="pill">Projects <span className="highlight">{projects.length}</span></div>
            <div className="pill">Keys <span className="highlight">{apiKeys.length}</span></div>
            <div className="pill">Budgets <span className="highlight">{budgets.length}</span></div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div className="field" style={{ minWidth: 220 }}>
            <label style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 4 }}>Filter by Organization</label>
            <select value={selectedOrg} onChange={(e) => setSelectedOrg(e.target.value)}>
              <option value="">All Organizations</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.org_name} ({o.id})</option>)}
            </select>
          </div>
        </div>
      </section>

      {error && <div className="error-message">{error}</div>}
      {success && <div style={{ padding: "10px 20px", background: "rgba(46,204,113,0.12)", color: "#27ae60", borderRadius: 10, marginBottom: 12, fontSize: 14 }}>{success}</div>}

      {/* ── Tab Navigation ── */}
      <section className="panel" style={{ padding: "0 24px" }}>
        <div className="action-row" style={{ padding: "14px 0", gap: 4 }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`btn ${activeTab === tab.id ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </section>

      {/* ══════════ ORGANIZATIONS TAB ══════════ */}
      {activeTab === "orgs" && (
        <>
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>Create Organization</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  Each org groups projects, keys, budgets, and all telemetry data.
                </p>
              </div>
            </div>
            <form className="stack" onSubmit={handleCreateOrg}>
              <div className="form-grid">
                <div className="field">
                  <label>ID (auto if empty)</label>
                  <input value={orgForm.id} onChange={(e) => setOrgForm({ ...orgForm, id: e.target.value })} placeholder="org-001" />
                </div>
                <div className="field">
                  <label>Name *</label>
                  <input value={orgForm.org_name} onChange={(e) => setOrgForm({ ...orgForm, org_name: e.target.value })} required placeholder="Acme Corp" />
                </div>
                <div className="field">
                  <label>Plan Type</label>
                  <select value={orgForm.plan_type} onChange={(e) => setOrgForm({ ...orgForm, plan_type: e.target.value })}>
                    <option value="free">Free</option>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div className="field">
                  <label>Budget Limit ($)</label>
                  <input type="number" step="any" value={orgForm.budget_limit} onChange={(e) => setOrgForm({ ...orgForm, budget_limit: e.target.value })} placeholder="1000.00" />
                </div>
              </div>
              <button type="submit" className="btn btn-primary">Create Organization</button>
            </form>
          </section>

          <section className="panel">
            <div className="section-head">
              <div><h3>Organizations ({orgs.length})</h3></div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Plan</th>
                    <th>Budget Limit</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--gray-500)" }}>No organizations yet.</td></tr>
                  )}
                  {orgs.map((o) => (
                    <tr key={o.id}>
                      <td><strong>{o.id}</strong></td>
                      <td>{o.org_name}</td>
                      <td><span className={`status-pill ${o.plan_type === "enterprise" ? "critical" : o.plan_type === "pro" ? "high" : "medium"}`}>{o.plan_type || "free"}</span></td>
                      <td>{o.budget_limit ? `$${Number(o.budget_limit).toFixed(2)}` : "—"}</td>
                      <td>{o.created_at ? new Date(o.created_at).toLocaleDateString() : "—"}</td>
                      <td>
                        <button type="button" className="btn btn-ghost" style={{ color: "#c0392b", fontSize: 13 }} onClick={() => handleDeleteOrg(o.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ══════════ PROJECTS TAB ══════════ */}
      {activeTab === "projects" && (
        <>
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>Create Project</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  Projects belong to an org. Telemetry, cost, and budget tracking are per-project.
                </p>
              </div>
            </div>
            <form className="stack" onSubmit={handleCreateProject}>
              <div className="form-grid">
                <div className="field">
                  <label>Project ID (auto if empty)</label>
                  <input value={projForm.id} onChange={(e) => setProjForm({ ...projForm, id: e.target.value })} placeholder="proj-001" />
                </div>
                <div className="field">
                  <label>Organization *</label>
                  <select value={projForm.org_id} onChange={(e) => setProjForm({ ...projForm, org_id: e.target.value })} required>
                    <option value="">Select org...</option>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.org_name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Project Name</label>
                  <input value={projForm.project_name} onChange={(e) => setProjForm({ ...projForm, project_name: e.target.value })} placeholder="AI Chatbot" />
                </div>
                <div className="field">
                  <label>Environment</label>
                  <select value={projForm.environment} onChange={(e) => setProjForm({ ...projForm, environment: e.target.value })}>
                    <option value="development">Development</option>
                    <option value="staging">Staging</option>
                    <option value="production">Production</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="btn btn-primary">Create Project</button>
            </form>
          </section>

          <section className="panel">
            <div className="section-head">
              <div><h3>Projects ({projects.length})</h3></div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Org</th>
                    <th>Name</th>
                    <th>Environment</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--gray-500)" }}>No projects yet.</td></tr>
                  )}
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.id}</strong></td>
                      <td>{p.org_id}</td>
                      <td>{p.project_name || "—"}</td>
                      <td>
                        <span className={`status-pill ${p.environment === "production" ? "critical" : p.environment === "staging" ? "high" : "medium"}`}>
                          {p.environment}
                        </span>
                      </td>
                      <td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</td>
                      <td>
                        <button type="button" className="btn btn-ghost" style={{ color: "#c0392b", fontSize: 13 }} onClick={() => handleDeleteProject(p.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ══════════ API KEYS TAB ══════════ */}
      {activeTab === "keys" && (
        <>
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>Create API Key</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  API keys link to an org and project. Each telemetry event tracks which key made the call.
                </p>
              </div>
            </div>
            <form className="stack" onSubmit={handleCreateKey}>
              <div className="form-grid">
                <div className="field">
                  <label>Key ID (auto if empty)</label>
                  <input value={keyForm.id} onChange={(e) => setKeyForm({ ...keyForm, id: e.target.value })} placeholder="key-..." />
                </div>
                <div className="field">
                  <label>Organization</label>
                  <select value={keyForm.org_id} onChange={(e) => setKeyForm({ ...keyForm, org_id: e.target.value })}>
                    <option value="">Select org...</option>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.org_name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Project</label>
                  <select value={keyForm.project_id} onChange={(e) => setKeyForm({ ...keyForm, project_id: e.target.value })}>
                    <option value="">Select project...</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name || p.id}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Key Name</label>
                  <input value={keyForm.key_name} onChange={(e) => setKeyForm({ ...keyForm, key_name: e.target.value })} placeholder="Production GPT Key" />
                </div>
                <div className="field">
                  <label>Provider</label>
                  <input value={keyForm.provider} onChange={(e) => setKeyForm({ ...keyForm, provider: e.target.value })} placeholder="openai" />
                </div>
              </div>
              <button type="submit" className="btn btn-primary">Create API Key</button>
            </form>
          </section>

          <section className="panel">
            <div className="section-head">
              <div><h3>API Keys ({apiKeys.length})</h3></div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Org</th>
                    <th>Project</th>
                    <th>Name</th>
                    <th>Provider</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--gray-500)" }}>No API keys yet.</td></tr>
                  )}
                  {apiKeys.map((k) => (
                    <tr key={k.id}>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{k.id}</td>
                      <td>{k.org_id || "—"}</td>
                      <td>{k.project_id || "—"}</td>
                      <td>{k.key_name || "—"}</td>
                      <td>{k.provider || "—"}</td>
                      <td>
                        <button type="button" className="btn btn-ghost" style={{ color: "#c0392b", fontSize: 13 }} onClick={() => handleDeleteKey(k.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ══════════ BUDGETS TAB ══════════ */}
      {activeTab === "budgets" && (
        <>
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>Create Budget</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  Set daily or monthly spending limits. Alerts trigger when usage hits the threshold percentage.
                </p>
              </div>
            </div>
            <form className="stack" onSubmit={handleCreateBudget}>
              <div className="form-grid">
                <div className="field">
                  <label>Organization *</label>
                  <select value={budgetForm.org_id} onChange={(e) => setBudgetForm({ ...budgetForm, org_id: e.target.value })} required>
                    <option value="">Select org...</option>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.org_name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Project (optional)</label>
                  <select value={budgetForm.project_id} onChange={(e) => setBudgetForm({ ...budgetForm, project_id: e.target.value })}>
                    <option value="">All projects</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name || p.id}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Budget Type</label>
                  <select value={budgetForm.budget_type} onChange={(e) => setBudgetForm({ ...budgetForm, budget_type: e.target.value })}>
                    <option value="daily">Daily</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="field">
                  <label>Limit Amount ($) *</label>
                  <input type="number" step="any" value={budgetForm.limit_amount} onChange={(e) => setBudgetForm({ ...budgetForm, limit_amount: e.target.value })} required placeholder="500.00" />
                </div>
                <div className="field">
                  <label>Alert Threshold (%)</label>
                  <input type="number" value={budgetForm.alert_threshold_percent} onChange={(e) => setBudgetForm({ ...budgetForm, alert_threshold_percent: e.target.value })} placeholder="80" />
                </div>
              </div>
              <button type="submit" className="btn btn-primary">Create Budget</button>
            </form>
          </section>

          <section className="panel">
            <div className="section-head">
              <div><h3>Budgets ({budgets.length})</h3></div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Org</th>
                    <th>Project</th>
                    <th>Type</th>
                    <th>Limit</th>
                    <th>Alert %</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {budgets.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--gray-500)" }}>No budgets set.</td></tr>
                  )}
                  {budgets.map((b) => (
                    <tr key={b.id}>
                      <td>{b.id}</td>
                      <td>{b.org_id}</td>
                      <td>{b.project_id || "All"}</td>
                      <td>
                        <span className={`status-pill ${b.budget_type === "daily" ? "high" : "medium"}`}>{b.budget_type}</span>
                      </td>
                      <td>${Number(b.limit_amount || 0).toFixed(2)}</td>
                      <td>{b.alert_threshold_percent}%</td>
                      <td>
                        <button type="button" className="btn btn-ghost" style={{ color: "#c0392b", fontSize: 13 }} onClick={() => handleDeleteBudget(b.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default Organizations;
