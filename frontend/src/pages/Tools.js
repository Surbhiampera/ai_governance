import React, { useEffect, useState } from "react";
import {
  createConnector,
  createRule,
  getConnectors,
  getIngestionStatus,
  getRules,
  getToolsUsage,
  triggerAlertScan,
  triggerAnomalyDetection,
  triggerConnectorPull,
  triggerDailyAggregation,
  triggerMonthlyAggregation,
  uploadFileToConnector,
} from "../api";

const defaultConnector = {
  connector_name: "",
  tool_name: "",
  provider: "",
  endpoint_url: "",
  auth_type: "",
  ingestion_mode: "",
  status: "",
  org_id: "",
  api_key: "",
};

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";

const defaultRule = {
  rule_name: "",
  description: "",
  metric_name: "",
  operator: "",
  threshold_value: "75",
  severity: "",
  scope_level: "",
  scope_reference: "",
  is_active: true,
};

function Tools() {
  const [connectors, setConnectors] = useState([]);
  const [rules, setRules] = useState([]);
  const [usage, setUsage] = useState([]);
  const [connectorForm, setConnectorForm] = useState(defaultConnector);
  const [ruleForm, setRuleForm] = useState(defaultRule);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState("");
  const [pulling, setPulling] = useState("");
  const [statusMap, setStatusMap] = useState({});
  const [uploadConnector, setUploadConnector] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const [connectorRes, rulesRes, usageRes, ingestionRes] = await Promise.all([
      getConnectors(),
      getRules(),
      getToolsUsage(),
      getIngestionStatus().catch(() => ({ data: [] })),
    ]);
    setConnectors(connectorRes.data || []);
    setRules(rulesRes.data || []);
    setUsage(usageRes.data || []);
    const map = {};
    for (const s of ingestionRes.data || []) map[s.connector_name] = s;
    setStatusMap(map);
  };

  useEffect(() => {
    load().catch(() => setMessage("Unable to load controls right now."));
  }, []);

  const saveConnector = async (event) => {
    event.preventDefault();
    await createConnector(connectorForm);
    setConnectorForm(defaultConnector);
    setMessage("Connector saved.");
    await load();
  };

  const saveRule = async (event) => {
    event.preventDefault();
    await createRule({
      ...ruleForm,
      threshold_value: Number(ruleForm.threshold_value),
    });
    setRuleForm(defaultRule);
    setMessage("Rule saved.");
    await load();
  };

  const runWorker = async (type, action) => {
    setRunning(type);
    try {
      const res = await action();
      const result = res.data?.result || {};
      const details = [];
      if (result.rows_processed !== undefined) details.push(`${result.rows_processed} rows processed`);
      if (result.anomalies_created !== undefined) details.push(`${result.anomalies_created} anomalies created`);
      if (result.alerts_created !== undefined) details.push(`${result.alerts_created} alerts created`);
      const summary = details.length ? ` (${details.join(", ")})` : "";
      setMessage(`${type} completed successfully${summary}.`);
      await load();
    } catch {
      setMessage(`${type} failed. Check backend worker connectivity.`);
    } finally {
      setRunning("");
    }
  };

  const pullConnector = async (connectorName) => {
    setPulling(connectorName);
    try {
      const res = await triggerConnectorPull(connectorName);
      const { ingested } = res.data || {};
      setMessage(`Pull complete for "${connectorName}": ${ingested ?? 0} event(s) ingested.`);
      await load();
    } catch {
      setMessage(`Pull failed for "${connectorName}". Check connector config and API key.`);
    } finally {
      setPulling("");
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadConnector || !uploadFile) return;
    setUploading(true);
    try {
      const res = await uploadFileToConnector(uploadConnector, uploadFile);
      const { ingested } = res.data || {};
      setMessage(`Upload complete: ${ingested ?? 0} event(s) ingested via "${uploadConnector}".`);
      setUploadFile(null);
      e.target.reset();
      await load();
    } catch (err) {
      const detail = err?.response?.data?.detail || "Upload failed. Check file format and connector.";
      setMessage(detail);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <h2>Control Plane</h2>
          <p>
            Automated governance workflow for connectors, background jobs, and
            the rule engine.
          </p>

          <div className="action-row" style={{ marginTop: 18 }}>
            <button
              type="button"
              className="btn"
              style={{ background: "#fff", color: "#9E2A97", fontWeight: 600, border: "1px solid rgba(255,255,255,0.5)" }}
              onClick={() =>
                runWorker("Daily aggregation", triggerDailyAggregation)
              }
              disabled={running === "Daily aggregation"}
            >
              Run daily aggregation
            </button>
            <button
              type="button"
              className="btn"
              style={{ background: "rgba(255,255,255,0.2)", color: "#fff", fontWeight: 600, border: "1px solid rgba(255,255,255,0.4)" }}
              onClick={() =>
                runWorker("Monthly aggregation", triggerMonthlyAggregation)
              }
              disabled={running === "Monthly aggregation"}
            >
              Run monthly aggregation
            </button>
            <button
              type="button"
              className="btn"
              style={{ background: "rgba(255,255,255,0.2)", color: "#fff", fontWeight: 600, border: "1px solid rgba(255,255,255,0.4)" }}
              onClick={() =>
                runWorker("Anomaly detection", triggerAnomalyDetection)
              }
              disabled={running === "Anomaly detection"}
            >
              Run anomaly detection
            </button>
            <button
              type="button"
              className="btn"
              style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)", fontWeight: 600, border: "1px solid rgba(255,255,255,0.25)" }}
              onClick={() => runWorker("Alert scan", triggerAlertScan)}
              disabled={running === "Alert scan"}
            >
              Run alert scan
            </button>
          </div>

          {message ? (
            <div style={{ marginTop: 12, color: "rgba(255,255,255,0.9)", fontSize: 14 }}>
              {message}
            </div>
          ) : null}
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Connectors</h3>
            </div>
          </div>

          <form className="stack" onSubmit={saveConnector}>
            <div className="form-grid">
              <div className="field">
                <label>Connector Name *</label>
                <input
                  value={connectorForm.connector_name}
                  onChange={(e) => setConnectorForm({ ...connectorForm, connector_name: e.target.value })}
                  placeholder="e.g. openai-prod"
                  required
                />
              </div>
              <div className="field">
                <label>Tool Name *</label>
                <input
                  value={connectorForm.tool_name}
                  onChange={(e) => setConnectorForm({ ...connectorForm, tool_name: e.target.value })}
                  placeholder="e.g. LangChain"
                  required
                />
              </div>
              <div className="field">
                <label>Provider *</label>
                <input
                  value={connectorForm.provider}
                  onChange={(e) => setConnectorForm({ ...connectorForm, provider: e.target.value })}
                  placeholder="e.g. OpenAI, Anthropic"
                  required
                />
              </div>
              <div className="field">
                <label>Auth Type *</label>
                <input
                  value={connectorForm.auth_type}
                  onChange={(e) => setConnectorForm({ ...connectorForm, auth_type: e.target.value })}
                  placeholder="e.g. API Key, Bearer Token"
                  required
                />
              </div>
              <div className="field">
                <label>Ingestion Mode *</label>
                <input
                  value={connectorForm.ingestion_mode}
                  onChange={(e) => setConnectorForm({ ...connectorForm, ingestion_mode: e.target.value })}
                  placeholder="e.g. api, webhook, batch"
                  required
                />
              </div>
              <div className="field">
                <label>Status *</label>
                <input
                  value={connectorForm.status}
                  onChange={(e) => setConnectorForm({ ...connectorForm, status: e.target.value })}
                  placeholder="e.g. active, paused"
                  required
                />
              </div>
              <div className="field">
                <label>Org ID *</label>
                <input
                  value={connectorForm.org_id}
                  onChange={(e) => setConnectorForm({ ...connectorForm, org_id: e.target.value })}
                  placeholder="e.g. org-abc"
                  required
                />
              </div>
              <div className="field">
                <label>API Key / Webhook Secret *</label>
                <input
                  type="password"
                  value={connectorForm.api_key}
                  onChange={(e) => setConnectorForm({ ...connectorForm, api_key: e.target.value })}
                  placeholder="Vendor credential or webhook token"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <div className="form-grid full">
              <div className="field">
                <label>Endpoint URL *</label>
                <input
                  value={connectorForm.endpoint_url}
                  onChange={(e) => setConnectorForm({ ...connectorForm, endpoint_url: e.target.value })}
                  placeholder="https://api.vendor.com/logs"
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary">
              Save connector
            </button>
          </form>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Rule Engine</h3>
            </div>
          </div>

          <form className="stack" onSubmit={saveRule}>
            <div className="form-grid">
              <div className="field">
                <label>Rule Name *</label>
                <input
                  value={ruleForm.rule_name}
                  onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })}
                  placeholder="e.g. High Cost Alert"
                  required
                />
              </div>
              <div className="field">
                <label>Metric *</label>
                <input
                  value={ruleForm.metric_name}
                  onChange={(e) => setRuleForm({ ...ruleForm, metric_name: e.target.value })}
                  placeholder="e.g. cost, tokens, latency"
                  required
                />
              </div>
              <div className="field">
                <label>Operator *</label>
                <input
                  value={ruleForm.operator}
                  onChange={(e) => setRuleForm({ ...ruleForm, operator: e.target.value })}
                  placeholder="e.g. >, >=, <, =="
                  required
                />
              </div>
              <div className="field">
                <label>Threshold *</label>
                <input
                  value={ruleForm.threshold_value}
                  onChange={(e) => setRuleForm({ ...ruleForm, threshold_value: e.target.value })}
                  placeholder="e.g. 75"
                  required
                />
              </div>
              <div className="field">
                <label>Severity *</label>
                <input
                  value={ruleForm.severity}
                  onChange={(e) => setRuleForm({ ...ruleForm, severity: e.target.value })}
                  placeholder="e.g. critical, high, medium, low"
                  required
                />
              </div>
              <div className="field">
                <label>Scope *</label>
                <input
                  value={ruleForm.scope_level}
                  onChange={(e) => setRuleForm({ ...ruleForm, scope_level: e.target.value })}
                  placeholder="e.g. organization, project, user"
                  required
                />
              </div>
              <div className="field">
                <label>Scope Reference *</label>
                <input
                  value={ruleForm.scope_reference}
                  onChange={(e) => setRuleForm({ ...ruleForm, scope_reference: e.target.value })}
                  placeholder="e.g. org-abc, proj-001"
                  required
                />
              </div>
            </div>

            <div className="field">
              <label>Description *</label>
              <textarea
                value={ruleForm.description}
                onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                placeholder="Describe what this rule monitors and when it fires"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary">
              Save rule
            </button>
          </form>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Registered Connectors</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Tool</th>
                  <th>Provider</th>
                  <th>Mode</th>
                  <th>Org</th>
                  <th>Status</th>
                  <th>Last Ingested</th>
                  <th>Events</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {connectors.map((item) => {
                  const info = statusMap[item.connector_name] || {};
                  return (
                    <tr key={item.id}>
                      <td>{item.connector_name}</td>
                      <td>{item.tool_name}</td>
                      <td>{item.provider || "-"}</td>
                      <td>{item.ingestion_mode}</td>
                      <td>{item.org_id || "-"}</td>
                      <td>
                        <span className={`status-pill ${item.status}`}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {fmtDate(item.last_ingested_at)}
                      </td>
                      <td>{info.event_count ?? "-"}</td>
                      <td>
                        {item.ingestion_mode === "api" && (
                          <button
                            type="button"
                            className="btn"
                            style={{ fontSize: 11, padding: "3px 10px", fontWeight: 600 }}
                            onClick={() => pullConnector(item.connector_name)}
                            disabled={pulling === item.connector_name}
                          >
                            {pulling === item.connector_name ? "…" : "Pull Now"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Active Rules</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Metric</th>
                  <th>Operator</th>
                  <th>Threshold</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((item) => (
                  <tr key={item.id}>
                    <td>{item.rule_name}</td>
                    <td>{item.metric_name}</td>
                    <td>{item.operator}</td>
                    <td>{item.threshold_value}</td>
                    <td>
                      <span className={`status-pill ${item.severity}`}>
                        {item.severity}
                      </span>
                    </td>
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
            <h3>Upload Log File</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted, #888)", marginTop: 2 }}>
              Import a JSON, NDJSON, CSV, or Excel (.xlsx) file through a registered connector.
            </p>
          </div>
        </div>
        <form className="stack" onSubmit={handleUpload} style={{ maxWidth: 560 }}>
          <div className="form-grid">
            <div className="field">
              <label>Connector</label>
              <select
                value={uploadConnector}
                onChange={(e) => setUploadConnector(e.target.value)}
                required
              >
                <option value="">Select connector…</option>
                {connectors.map((c) => (
                  <option key={c.id} value={c.connector_name}>
                    {c.connector_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>File</label>
              <input
                type="file"
                accept=".json,.jsonl,.ndjson,.csv,.xlsx,.xls"
                required
                onChange={(e) => setUploadFile(e.target.files[0] || null)}
              />
              <span style={{ fontSize: 12, color: "var(--text-muted, #888)", marginTop: 4 }}>
                Accepted: .json, .jsonl, .ndjson, .csv, .xlsx, .xls
              </span>
            </div>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={uploading || !uploadConnector || !uploadFile}
          >
            {uploading ? "Uploading…" : "Upload & Ingest"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Tool Usage Summary</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tool</th>
                <th>Vendor</th>
                <th>Events</th>
                <th>Total Cost</th>
                <th>Total Tokens</th>
                <th>Prompt Tokens</th>
                <th>Completion Tokens</th>
                <th>Latency</th>
                <th>Success Rate</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((item) => (
                <tr key={item.tool_name}>
                  <td>{item.tool_name}</td>
                  <td>{item.vendor || "-"}</td>
                  <td>{item.total_events}</td>
                  <td>${Number(item.total_cost || 0).toFixed(2)}</td>
                  <td>{Number(item.total_tokens || 0).toFixed(0)}</td>
                  <td>{Number(item.total_prompt_tokens || 0).toFixed(0)}</td>
                  <td>
                    {Number(item.total_completion_tokens || 0).toFixed(0)}
                  </td>
                  <td>{Number(item.avg_latency_ms || 0).toFixed(1)} ms</td>
                  <td>{Number(item.success_rate || 0).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default Tools;
