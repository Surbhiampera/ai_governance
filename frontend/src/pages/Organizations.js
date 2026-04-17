import React, { useState, useEffect } from 'react';
import { getOrganizations, createOrganization, deleteOrganization, getProjects, createProject, deleteProject, getApiKeys, createApiKey, deleteApiKey, getBudgets, createBudget, deleteBudget } from '../api';

function Organizations() {
  const [orgs, setOrgs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Forms
  const [orgForm, setOrgForm] = useState({ id: '', org_name: '', plan_type: 'free', budget_limit: '' });
  const [projForm, setProjForm] = useState({ id: '', org_id: '', project_name: '', environment: 'development' });
  const [keyForm, setKeyForm] = useState({ id: '', org_id: '', project_id: '', key_name: '', provider: '' });
  const [budgetForm, setBudgetForm] = useState({ org_id: '', project_id: '', budget_type: 'monthly', limit_amount: '', alert_threshold_percent: 80 });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [orgRes, projRes, keyRes, budgetRes] = await Promise.allSettled([
        getOrganizations(),
        getProjects(selectedOrg),
        getApiKeys(selectedOrg),
        getBudgets(selectedOrg),
      ]);
      if (orgRes.status === 'fulfilled') setOrgs(orgRes.value.data);
      if (projRes.status === 'fulfilled') setProjects(projRes.value.data);
      if (keyRes.status === 'fulfilled') setApiKeys(keyRes.value.data);
      if (budgetRes.status === 'fulfilled') setBudgets(budgetRes.value.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [selectedOrg]);

  const generateId = () => Math.random().toString(36).substring(2, 15);

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    try {
      const payload = { ...orgForm, id: orgForm.id || generateId(), budget_limit: parseFloat(orgForm.budget_limit) || null };
      await createOrganization(payload);
      setSuccess('Organization created!');
      setOrgForm({ id: '', org_name: '', plan_type: 'free', budget_limit: '' });
      fetchData();
    } catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  const handleDeleteOrg = async (id) => {
    if (!window.confirm('Delete this organization?')) return;
    try { await deleteOrganization(id); fetchData(); }
    catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    try {
      const payload = { ...projForm, id: projForm.id || generateId() };
      await createProject(payload);
      setSuccess('Project created!');
      setProjForm({ id: '', org_id: '', project_name: '', environment: 'development' });
      fetchData();
    } catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  const handleDeleteProject = async (id) => {
    try { await deleteProject(id); fetchData(); }
    catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  const handleCreateKey = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    try {
      const payload = { ...keyForm, id: keyForm.id || `key-${generateId()}` };
      await createApiKey(payload);
      setSuccess('API Key created!');
      setKeyForm({ id: '', org_id: '', project_id: '', key_name: '', provider: '' });
      fetchData();
    } catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  const handleDeleteKey = async (id) => {
    try { await deleteApiKey(id); fetchData(); }
    catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  const handleCreateBudget = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    try {
      const payload = { ...budgetForm, limit_amount: parseFloat(budgetForm.limit_amount) || 0, alert_threshold_percent: parseInt(budgetForm.alert_threshold_percent) || 80 };
      await createBudget(payload);
      setSuccess('Budget created!');
      setBudgetForm({ org_id: '', project_id: '', budget_type: 'monthly', limit_amount: '', alert_threshold_percent: 80 });
      fetchData();
    } catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  const handleDeleteBudget = async (id) => {
    try { await deleteBudget(id); fetchData(); }
    catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  if (loading) return <div className="loading">Loading organizations...</div>;

  return (
    <div>
      <h1 className="page-title">Organizations & Management</h1>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* Org Filter */}
      <div className="card">
        <div className="card-title">Filter by Organization</div>
        <div className="form-group">
          <select value={selectedOrg} onChange={(e) => setSelectedOrg(e.target.value)}>
            <option value="">All Organizations</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.org_name} ({o.id})</option>)}
          </select>
        </div>
      </div>

      {/* Create Organization */}
      <div className="card">
        <div className="card-title">Create Organization</div>
        <form onSubmit={handleCreateOrg}>
          <div className="form-row">
            <div className="form-group">
              <label>ID (auto-generated if empty)</label>
              <input value={orgForm.id} onChange={(e) => setOrgForm({...orgForm, id: e.target.value})} placeholder="org-001" />
            </div>
            <div className="form-group">
              <label>Name *</label>
              <input value={orgForm.org_name} onChange={(e) => setOrgForm({...orgForm, org_name: e.target.value})} required placeholder="Acme Corp" />
            </div>
            <div className="form-group">
              <label>Plan Type</label>
              <select value={orgForm.plan_type} onChange={(e) => setOrgForm({...orgForm, plan_type: e.target.value})}>
                <option value="free">Free</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="form-group">
              <label>Budget Limit ($)</label>
              <input type="number" step="any" value={orgForm.budget_limit} onChange={(e) => setOrgForm({...orgForm, budget_limit: e.target.value})} placeholder="1000.00" />
            </div>
          </div>
          <button type="submit" className="btn btn-primary">Create Organization</button>
        </form>
      </div>

      {/* Organizations Table */}
      <div className="card">
        <div className="card-title">Organizations ({orgs.length})</div>
        {orgs.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr><th>ID</th><th>Name</th><th>Plan</th><th>Budget Limit</th><th>Created</th><th>Action</th></tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id}>
                    <td><strong>{o.id}</strong></td>
                    <td>{o.org_name}</td>
                    <td><span className="badge badge-low">{o.plan_type || 'free'}</span></td>
                    <td>{o.budget_limit ? `$${Number(o.budget_limit).toFixed(2)}` : '—'}</td>
                    <td>{o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => handleDeleteOrg(o.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No organizations yet</div>}
      </div>

      {/* Create Project */}
      <div className="card">
        <div className="card-title">Create Project</div>
        <form onSubmit={handleCreateProject}>
          <div className="form-row">
            <div className="form-group">
              <label>Project ID (auto if empty)</label>
              <input value={projForm.id} onChange={(e) => setProjForm({...projForm, id: e.target.value})} placeholder="proj-001" />
            </div>
            <div className="form-group">
              <label>Organization *</label>
              <select value={projForm.org_id} onChange={(e) => setProjForm({...projForm, org_id: e.target.value})} required>
                <option value="">Select org...</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.org_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Project Name</label>
              <input value={projForm.project_name} onChange={(e) => setProjForm({...projForm, project_name: e.target.value})} placeholder="AI Chatbot" />
            </div>
            <div className="form-group">
              <label>Environment</label>
              <select value={projForm.environment} onChange={(e) => setProjForm({...projForm, environment: e.target.value})}>
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary">Create Project</button>
        </form>
      </div>

      {/* Projects Table */}
      <div className="card">
        <div className="card-title">Projects ({projects.length})</div>
        {projects.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr><th>ID</th><th>Org</th><th>Name</th><th>Environment</th><th>Created</th><th>Action</th></tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.id}</strong></td>
                    <td>{p.org_id}</td>
                    <td>{p.project_name || '—'}</td>
                    <td><span className={`badge ${p.environment === 'production' ? 'badge-danger' : p.environment === 'staging' ? 'badge-medium' : 'badge-success'}`}>{p.environment}</span></td>
                    <td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => handleDeleteProject(p.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No projects yet</div>}
      </div>

      {/* Create API Key */}
      <div className="card">
        <div className="card-title">Create API Key</div>
        <form onSubmit={handleCreateKey}>
          <div className="form-row">
            <div className="form-group">
              <label>Key ID (auto if empty)</label>
              <input value={keyForm.id} onChange={(e) => setKeyForm({...keyForm, id: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Organization</label>
              <select value={keyForm.org_id} onChange={(e) => setKeyForm({...keyForm, org_id: e.target.value})}>
                <option value="">Select org...</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.org_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Project</label>
              <select value={keyForm.project_id} onChange={(e) => setKeyForm({...keyForm, project_id: e.target.value})}>
                <option value="">Select project...</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name || p.id}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Key Name</label>
              <input value={keyForm.key_name} onChange={(e) => setKeyForm({...keyForm, key_name: e.target.value})} placeholder="Production GPT Key" />
            </div>
            <div className="form-group">
              <label>Provider</label>
              <input value={keyForm.provider} onChange={(e) => setKeyForm({...keyForm, provider: e.target.value})} placeholder="OpenAI" />
            </div>
          </div>
          <button type="submit" className="btn btn-primary">Create API Key</button>
        </form>
      </div>

      {/* API Keys Table */}
      <div className="card">
        <div className="card-title">API Keys ({apiKeys.length})</div>
        {apiKeys.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr><th>ID</th><th>Org</th><th>Project</th><th>Name</th><th>Provider</th><th>Action</th></tr>
              </thead>
              <tbody>
                {apiKeys.map((k) => (
                  <tr key={k.id}>
                    <td style={{fontFamily: 'monospace', fontSize: '12px'}}>{k.id}</td>
                    <td>{k.org_id || '—'}</td>
                    <td>{k.project_id || '—'}</td>
                    <td>{k.key_name || '—'}</td>
                    <td>{k.provider || '—'}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => handleDeleteKey(k.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No API keys yet</div>}
      </div>

      {/* Create Budget */}
      <div className="card">
        <div className="card-title">Create Budget</div>
        <form onSubmit={handleCreateBudget}>
          <div className="form-row">
            <div className="form-group">
              <label>Organization *</label>
              <select value={budgetForm.org_id} onChange={(e) => setBudgetForm({...budgetForm, org_id: e.target.value})} required>
                <option value="">Select org...</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.org_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Project (optional)</label>
              <select value={budgetForm.project_id} onChange={(e) => setBudgetForm({...budgetForm, project_id: e.target.value})}>
                <option value="">All projects</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name || p.id}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Budget Type</label>
              <select value={budgetForm.budget_type} onChange={(e) => setBudgetForm({...budgetForm, budget_type: e.target.value})}>
                <option value="daily">Daily</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="form-group">
              <label>Limit Amount ($) *</label>
              <input type="number" step="any" value={budgetForm.limit_amount} onChange={(e) => setBudgetForm({...budgetForm, limit_amount: e.target.value})} required placeholder="500.00" />
            </div>
            <div className="form-group">
              <label>Alert Threshold (%)</label>
              <input type="number" value={budgetForm.alert_threshold_percent} onChange={(e) => setBudgetForm({...budgetForm, alert_threshold_percent: e.target.value})} placeholder="80" />
            </div>
          </div>
          <button type="submit" className="btn btn-primary">Create Budget</button>
        </form>
      </div>

      {/* Budgets Table */}
      <div className="card">
        <div className="card-title">Budgets ({budgets.length})</div>
        {budgets.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr><th>ID</th><th>Org</th><th>Project</th><th>Type</th><th>Limit</th><th>Alert %</th><th>Action</th></tr>
              </thead>
              <tbody>
                {budgets.map((b) => (
                  <tr key={b.id}>
                    <td>{b.id}</td>
                    <td>{b.org_id}</td>
                    <td>{b.project_id || 'All'}</td>
                    <td><span className={`badge ${b.budget_type === 'daily' ? 'badge-medium' : 'badge-low'}`}>{b.budget_type}</span></td>
                    <td>${Number(b.limit_amount || 0).toFixed(2)}</td>
                    <td>{b.alert_threshold_percent}%</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => handleDeleteBudget(b.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No budgets set</div>}
      </div>
    </div>
  );
}

export default Organizations;
