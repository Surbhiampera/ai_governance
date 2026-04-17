import React, { useState, useEffect } from 'react';
import { getTools, getToolsUsage, registerTool } from '../api';

const TOOL_TYPES = ['ai_model', 'ml_model', 'api', 'worker', 'database', 'queue'];
const COST_MODELS = ['per_token', 'per_call', 'per_ms', 'per_job', 'per_mb'];

function Tools() {
  const [tools, setTools] = useState([]);
  const [usage, setUsage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState({
    tool_name: '',
    tool_type: 'ai_model',
    vendor: '',
    cost_model: 'per_token',
    base_cost: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [toolsRes, usageRes] = await Promise.allSettled([getTools(), getToolsUsage()]);
      if (toolsRes.status === 'fulfilled') setTools(toolsRes.value.data);
      if (usageRes.status === 'fulfilled') setUsage(usageRes.value.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const payload = { ...form, base_cost: parseFloat(form.base_cost) || 0 };
      await registerTool(payload);
      setSuccess(`Tool "${form.tool_name}" registered successfully!`);
      setForm({ tool_name: '', tool_type: 'ai_model', vendor: '', cost_model: 'per_token', base_cost: '' });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const usageMap = {};
  if (Array.isArray(usage)) {
    usage.forEach((u) => { usageMap[u.tool_name] = u; });
  }

  if (loading) return <div className="loading">Loading tools...</div>;

  return (
    <div>
      <h1 className="page-title">Tools</h1>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="card">
        <div className="card-title">Register New Tool</div>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Tool Name</label>
              <input name="tool_name" value={form.tool_name} onChange={handleChange} required placeholder="e.g., gpt-4" />
            </div>
            <div className="form-group">
              <label>Tool Type</label>
              <select name="tool_type" value={form.tool_type} onChange={handleChange}>
                {TOOL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Vendor</label>
              <input name="vendor" value={form.vendor} onChange={handleChange} placeholder="e.g., OpenAI" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Cost Model</label>
              <select name="cost_model" value={form.cost_model} onChange={handleChange}>
                {COST_MODELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Base Cost ($)</label>
              <input name="base_cost" type="number" step="any" value={form.base_cost} onChange={handleChange} required placeholder="0.0001" />
            </div>
          </div>
          <button type="submit" className="btn btn-primary">Register Tool</button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Registered Tools & Usage</div>
        {Array.isArray(tools) && tools.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Vendor</th>
                  <th>Cost Model</th>
                  <th>Base Cost</th>
                  <th>Total Events</th>
                  <th>Total Cost</th>
                  <th>Total Tokens</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((tool) => {
                  const u = usageMap[tool.tool_name] || {};
                  return (
                    <tr key={tool.tool_name}>
                      <td><strong>{tool.tool_name}</strong></td>
                      <td>{tool.tool_type}</td>
                      <td>{tool.vendor || '—'}</td>
                      <td>{tool.cost_model}</td>
                      <td>${(Number(tool.base_cost) || 0).toFixed(4)}</td>
                      <td>{u.total_events ?? 0}</td>
                      <td>${(Number(u.total_cost) || 0).toFixed(4)}</td>
                      <td>{u.total_tokens ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No tools registered yet</div>
        )}
      </div>
    </div>
  );
}

export default Tools;
