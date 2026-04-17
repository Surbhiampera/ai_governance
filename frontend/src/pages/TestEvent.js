import React, { useState, useEffect } from 'react';
import { postTelemetryEvent, getOrganizations, getProjects, getTools } from '../api';

const SERVICE_TYPES = ['llm', 'ml_model', 'api', 'worker', 'database', 'queue'];
const EXECUTION_TYPES = ['inference', 'prediction', 'api_call', 'batch_job', 'training', 'embedding', 'fine_tune'];
const STATUSES = ['success', 'failure', 'timeout', 'error'];

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const EMPTY_FORM = {
  tool_name: '',
  component_name: '',
  service_type: 'llm',
  execution_type: 'inference',
  user_id: '',
  org_id: '',
  project_id: '',
  api_key_id: '',
  input_data_size_mb: 0,
  output_data_size_mb: 0,
  tokens_input: 0,
  tokens_output: 0,
  latency_ms: 0,
  status: 'success',
};

const TEMPLATES = {
  llm: {
    tool_name: 'seo_tool', component_name: 'gpt-4', service_type: 'llm',
    execution_type: 'inference', user_id: 'user1', org_id: 'default', project_id: '',
    api_key_id: '', input_data_size_mb: 0.2, output_data_size_mb: 1.5,
    tokens_input: 1200, tokens_output: 300, latency_ms: 450, status: 'success',
  },
  ml_model: {
    tool_name: 'fraud_detector', component_name: 'xgboost-v2', service_type: 'ml_model',
    execution_type: 'prediction', user_id: 'user2', org_id: 'default', project_id: '',
    api_key_id: '', input_data_size_mb: 0.5, output_data_size_mb: 0.01,
    tokens_input: 0, tokens_output: 0, latency_ms: 120, status: 'success',
  },
  celery: {
    tool_name: 'report_generator', component_name: 'celery-worker', service_type: 'worker',
    execution_type: 'batch_job', user_id: 'system', org_id: 'default', project_id: '',
    api_key_id: '', input_data_size_mb: 5.0, output_data_size_mb: 12.0,
    tokens_input: 0, tokens_output: 0, latency_ms: 15000, status: 'success',
  },
  api: {
    tool_name: 'payment_gateway', component_name: 'stripe-api', service_type: 'api',
    execution_type: 'api_call', user_id: 'user3', org_id: 'default', project_id: '',
    api_key_id: '', input_data_size_mb: 0.01, output_data_size_mb: 0.02,
    tokens_input: 0, tokens_output: 0, latency_ms: 320, status: 'success',
  },
};

const TEMPLATE_TOOLS = {
  llm: [{ name: 'serpapi', cost: 0.01 }],
  ml_model: [],
  celery: [],
  api: [{ name: 'stripe', cost: 0.03 }],
};

function TestEvent() {
  const [form, setForm] = useState({ ...EMPTY_FORM, org_id: 'default' });
  const [externalTools, setExternalTools] = useState([]);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState('form'); // 'form' or 'json'
  const [json, setJson] = useState('');
  const [orgs, setOrgs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tools, setTools] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    Promise.allSettled([getOrganizations(), getProjects(), getTools()])
      .then(([orgRes, projRes, toolRes]) => {
        if (orgRes.status === 'fulfilled') setOrgs(orgRes.value.data || []);
        if (projRes.status === 'fulfilled') setProjects(projRes.value.data || []);
        if (toolRes.status === 'fulfilled') setTools(toolRes.value.data || []);
      });
  }, []);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setForm({ ...form, [name]: type === 'number' ? (value === '' ? '' : parseFloat(value)) : value });
  };

  const loadTemplate = (key) => {
    setResponse(null); setError(null); setSuccess(null);
    setForm({ ...TEMPLATES[key] });
    setExternalTools([...(TEMPLATE_TOOLS[key] || [])]);
  };

  // --- External Tools (AI tools) management ---
  const addExternalTool = () => {
    setExternalTools([...externalTools, { name: '', cost: 0 }]);
  };

  const updateExternalTool = (index, field, value) => {
    const updated = [...externalTools];
    updated[index] = { ...updated[index], [field]: field === 'cost' ? (parseFloat(value) || 0) : value };
    setExternalTools(updated);
  };

  const removeExternalTool = (index) => {
    setExternalTools(externalTools.filter((_, i) => i !== index));
  };

  // Build payload from form
  const buildPayload = () => {
    return {
      event_id: generateUUID(),
      tool_name: form.tool_name,
      component_name: form.component_name,
      service_type: form.service_type,
      execution_type: form.execution_type,
      user_id: form.user_id,
      org_id: form.org_id || 'default',
      project_id: form.project_id || null,
      api_key_id: form.api_key_id || null,
      input_data_size_mb: parseFloat(form.input_data_size_mb) || 0,
      output_data_size_mb: parseFloat(form.output_data_size_mb) || 0,
      tokens: { input: parseInt(form.tokens_input) || 0, output: parseInt(form.tokens_output) || 0 },
      external_tools: externalTools.filter((t) => t.name.trim() !== ''),
      latency_ms: parseInt(form.latency_ms) || 0,
      status: form.status,
    };
  };

  const handleSendForm = async () => {
    setError(null); setResponse(null); setSuccess(null); setSending(true);
    try {
      const payload = buildPayload();
      const res = await postTelemetryEvent(payload);
      setResponse(res.data);
      setSuccess('Event sent successfully!');
      setHistory((prev) => [{ payload, response: res.data, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSending(false);
    }
  };

  const handleSendJson = async () => {
    setError(null); setResponse(null); setSuccess(null); setSending(true);
    try {
      const parsed = JSON.parse(json);
      if (!parsed.event_id) parsed.event_id = generateUUID();
      setJson(JSON.stringify(parsed, null, 2));
      const res = await postTelemetryEvent(parsed);
      setResponse(res.data);
      setSuccess('Event sent successfully!');
      setHistory((prev) => [{ payload: parsed, response: res.data, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON: ' + err.message);
      } else {
        setError(err.response?.data?.detail || err.message);
      }
    } finally {
      setSending(false);
    }
  };

  const copyToJson = () => {
    setJson(JSON.stringify(buildPayload(), null, 2));
    setMode('json');
  };

  const filteredProjects = form.org_id
    ? projects.filter((p) => p.org_id === form.org_id)
    : projects;

  return (
    <div>
      <h1 className="page-title">Test Event</h1>

      {/* Mode Toggle */}
      <div className="card">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            className={`btn ${mode === 'form' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setMode('form')}
          >
            📝 Form Mode
          </button>
          <button
            className={`btn ${mode === 'json' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setMode('json')}
          >
            { '{ }' } JSON Mode
          </button>
          {mode === 'form' && (
            <button className="btn btn-outline" onClick={copyToJson}>
              Copy to JSON →
            </button>
          )}
        </div>
      </div>

      {/* Quick Templates */}
      <div className="card">
        <div className="card-title">Quick Templates</div>
        <div className="quick-buttons">
          <button className="btn btn-primary" onClick={() => loadTemplate('llm')}>🤖 LLM Event</button>
          <button className="btn btn-outline" onClick={() => loadTemplate('ml_model')}>🧠 ML Model</button>
          <button className="btn btn-outline" onClick={() => loadTemplate('celery')}>⚙️ Celery Job</button>
          <button className="btn btn-outline" onClick={() => loadTemplate('api')}>🔌 API Call</button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {mode === 'form' ? (
        <>
          {/* Event Details */}
          <div className="card">
            <div className="card-title">Event Details</div>
            <div className="form-row">
              <div className="form-group">
                <label>Tool Name *</label>
                {tools.length > 0 ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      name="tool_name"
                      value={tools.some((t) => t.tool_name === form.tool_name) ? form.tool_name : '__custom__'}
                      onChange={(e) => {
                        if (e.target.value !== '__custom__') setForm({ ...form, tool_name: e.target.value });
                      }}
                      style={{ flex: 1 }}
                    >
                      <option value="__custom__">Custom...</option>
                      {tools.map((t) => (
                        <option key={t.tool_name} value={t.tool_name}>{t.tool_name} ({t.vendor || t.tool_type})</option>
                      ))}
                    </select>
                    <input
                      name="tool_name"
                      value={form.tool_name}
                      onChange={handleChange}
                      placeholder="or type custom name"
                      style={{ flex: 1 }}
                    />
                  </div>
                ) : (
                  <input name="tool_name" value={form.tool_name} onChange={handleChange} required placeholder="e.g., seo_tool" />
                )}
              </div>
              <div className="form-group">
                <label>Component / Model Name</label>
                <input name="component_name" value={form.component_name} onChange={handleChange} placeholder="e.g., gpt-4, xgboost-v2" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Service Type</label>
                <select name="service_type" value={form.service_type} onChange={handleChange}>
                  {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Execution Type</label>
                <select name="execution_type" value={form.execution_type} onChange={handleChange}>
                  {EXECUTION_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select name="status" value={form.status} onChange={handleChange}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Latency (ms)</label>
                <input name="latency_ms" type="number" value={form.latency_ms} onChange={handleChange} />
              </div>
            </div>
          </div>

          {/* Organization & User */}
          <div className="card">
            <div className="card-title">Organization & User</div>
            <div className="form-row">
              <div className="form-group">
                <label>Organization</label>
                {orgs.length > 0 ? (
                  <select name="org_id" value={form.org_id} onChange={handleChange}>
                    <option value="default">default</option>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.org_name} ({o.id})</option>)}
                  </select>
                ) : (
                  <input name="org_id" value={form.org_id} onChange={handleChange} placeholder="org-001" />
                )}
              </div>
              <div className="form-group">
                <label>Project</label>
                {filteredProjects.length > 0 ? (
                  <select name="project_id" value={form.project_id} onChange={handleChange}>
                    <option value="">None</option>
                    {filteredProjects.map((p) => <option key={p.id} value={p.id}>{p.project_name || p.id}</option>)}
                  </select>
                ) : (
                  <input name="project_id" value={form.project_id} onChange={handleChange} placeholder="proj-001 (optional)" />
                )}
              </div>
              <div className="form-group">
                <label>User ID</label>
                <input name="user_id" value={form.user_id} onChange={handleChange} placeholder="user1" />
              </div>
              <div className="form-group">
                <label>API Key ID</label>
                <input name="api_key_id" value={form.api_key_id} onChange={handleChange} placeholder="(optional)" />
              </div>
            </div>
          </div>

          {/* Data & Tokens */}
          <div className="card">
            <div className="card-title">Data & Tokens</div>
            <div className="form-row">
              <div className="form-group">
                <label>Input Data (MB)</label>
                <input name="input_data_size_mb" type="number" step="any" value={form.input_data_size_mb} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Output Data (MB)</label>
                <input name="output_data_size_mb" type="number" step="any" value={form.output_data_size_mb} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Tokens Input</label>
                <input name="tokens_input" type="number" value={form.tokens_input} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Tokens Output</label>
                <input name="tokens_output" type="number" value={form.tokens_output} onChange={handleChange} />
              </div>
            </div>
          </div>

          {/* External AI Tools — Dynamic Add/Remove */}
          <div className="card">
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>External AI Tools / Models</span>
              <button className="btn btn-primary btn-sm" onClick={addExternalTool}>+ Add New</button>
            </div>

            {externalTools.length === 0 && (
              <div className="empty-state" style={{ padding: '20px' }}>
                No external tools added. Click <strong>"+ Add New"</strong> to add AI tools, models, or APIs.
              </div>
            )}

            {externalTools.map((tool, index) => (
              <div key={index} style={{
                display: 'flex', gap: '12px', alignItems: 'flex-end',
                padding: '12px', marginBottom: '8px',
                background: '#f8f9fa', borderRadius: '8px', border: '1px solid #eee',
              }}>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#666', display: 'block', marginBottom: '4px' }}>
                    Tool / Model Name
                  </label>
                  <input
                    value={tool.name}
                    onChange={(e) => updateExternalTool(index, 'name', e.target.value)}
                    placeholder="e.g., serpapi, gpt-4-turbo, whisper-api"
                    style={{
                      width: '100%', padding: '8px 12px', border: '1px solid #ddd',
                      borderRadius: '6px', fontSize: '14px',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#666', display: 'block', marginBottom: '4px' }}>
                    Cost ($)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={tool.cost}
                    onChange={(e) => updateExternalTool(index, 'cost', e.target.value)}
                    placeholder="0.01"
                    style={{
                      width: '100%', padding: '8px 12px', border: '1px solid #ddd',
                      borderRadius: '6px', fontSize: '14px',
                    }}
                  />
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => removeExternalTool(index)}
                  style={{ marginBottom: '2px' }}
                >
                  ✕ Remove
                </button>
              </div>
            ))}

            {externalTools.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn btn-outline btn-sm" onClick={addExternalTool}>+ Add Another Tool</button>
                <span style={{ fontSize: '13px', color: '#888' }}>
                  Total external cost: <strong>${externalTools.reduce((s, t) => s + (t.cost || 0), 0).toFixed(4)}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Send */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
            <button className="btn btn-success" onClick={handleSendForm} disabled={sending}>
              {sending ? 'Sending...' : '🚀 Send Event'}
            </button>
            <button className="btn btn-outline" onClick={() => { setForm({ ...EMPTY_FORM }); setExternalTools([]); setResponse(null); setError(null); setSuccess(null); }}>
              Reset Form
            </button>
          </div>
        </>
      ) : (
        /* JSON Mode */
        <div className="card">
          <div className="card-title">Telemetry Event JSON</div>
          <textarea
            className="code-textarea"
            value={json}
            onChange={(e) => setJson(e.target.value)}
            spellCheck={false}
          />
          <div style={{ marginTop: '16px' }}>
            <button className="btn btn-success" onClick={handleSendJson} disabled={sending}>
              {sending ? 'Sending...' : '🚀 Send Event'}
            </button>
          </div>
        </div>
      )}

      {/* Response */}
      {response && (
        <div className="card">
          <div className="card-title">Response</div>
          <div className="response-box">{JSON.stringify(response, null, 2)}</div>
        </div>
      )}

      {/* Event History */}
      {history.length > 0 && (
        <div className="card">
          <div className="card-title">Recent Event History ({history.length})</div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Tool</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>External Tools</th>
                  <th>Cost</th>
                  <th>Event ID</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => {
                  const totalCost = (h.response?.cost_breakdown || []).reduce((s, c) => s + Number(c.total_cost || 0), 0);
                  return (
                    <tr key={i}>
                      <td>{h.time}</td>
                      <td><strong>{h.payload.tool_name}</strong></td>
                      <td>{h.payload.service_type}</td>
                      <td>
                        <span className={`badge ${h.payload.status === 'success' ? 'badge-success' : 'badge-danger'}`}>
                          {h.payload.status}
                        </span>
                      </td>
                      <td>
                        {(h.payload.external_tools || []).length > 0
                          ? h.payload.external_tools.map((t) => t.name).join(', ')
                          : '—'}
                      </td>
                      <td>${totalCost.toFixed(4)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{h.response?.event_id || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default TestEvent;
