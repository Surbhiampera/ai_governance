import React, { useEffect, useState } from "react";
import {
  createConnector,
  createRule,
  getConnectors,
  getRules,
  getToolsUsage,
  triggerAlertScan,
  triggerAnomalyDetection,
  triggerDailyAggregation,
  triggerMonthlyAggregation,
} from "../api";

const defaultConnector = {
  connector_name: "",
  tool_name: "",
  provider: "",
  endpoint_url: "",
  auth_type: "api_key",
  ingestion_mode: "api",
  status: "active",
};

const defaultRule = {
  rule_name: "",
  description: "",
  metric_name: "risk_score",
  operator: ">",
  threshold_value: "75",
  severity: "high",
  scope_level: "organization",
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

  const load = async () => {
    const [connectorRes, rulesRes, usageRes] = await Promise.all([
      getConnectors(),
      getRules(),
      getToolsUsage(),
    ]);
    setConnectors(connectorRes.data || []);
    setRules(rulesRes.data || []);
    setUsage(usageRes.data || []);
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
      await action();
      setMessage(`${type} completed successfully.`);
      await load();
    } catch {
      setMessage(`${type} failed. Check backend worker connectivity.`);
    } finally {
      setRunning("");
    }
  };

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <h2>Control Plane</h2>
          <p>Connectors, rules, and background jobs.</p>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h2>Background Jobs</h2>
            </div>
          </div>

          <div className="action-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => runWorker("Daily aggregation", triggerDailyAggregation)}
              disabled={running === "Daily aggregation"}
            >
              Run daily aggregation
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => runWorker("Monthly aggregation", triggerMonthlyAggregation)}
              disabled={running === "Monthly aggregation"}
            >
              Run monthly aggregation
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => runWorker("Anomaly detection", triggerAnomalyDetection)}
              disabled={running === "Anomaly detection"}
            >
              Run anomaly detection
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => runWorker("Alert scan", triggerAlertScan)}
              disabled={running === "Alert scan"}
            >
              Run alert scan
            </button>
          </div>

          {message ? <div className="list-meta" style={{ marginTop: 16 }}>{message}</div> : null}
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
                <label>Connector Name</label>
                <input
                  value={connectorForm.connector_name}
                  onChange={(e) => setConnectorForm({ ...connectorForm, connector_name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Tool Name</label>
                <input
                  value={connectorForm.tool_name}
                  onChange={(e) => setConnectorForm({ ...connectorForm, tool_name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Provider</label>
                <input
                  value={connectorForm.provider}
                  onChange={(e) => setConnectorForm({ ...connectorForm, provider: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Auth Type</label>
                <select
                  value={connectorForm.auth_type}
                  onChange={(e) => setConnectorForm({ ...connectorForm, auth_type: e.target.value })}
                >
                  <option value="api_key">api_key</option>
                  <option value="oauth">oauth</option>
                  <option value="service_account">service_account</option>
                </select>
              </div>
            </div>

            <div className="form-grid full">
              <div className="field">
                <label>Endpoint URL</label>
                <input
                  value={connectorForm.endpoint_url}
                  onChange={(e) => setConnectorForm({ ...connectorForm, endpoint_url: e.target.value })}
                  placeholder="https://api.vendor.com/logs"
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
                <label>Rule Name</label>
                <input
                  value={ruleForm.rule_name}
                  onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Metric</label>
                <select
                  value={ruleForm.metric_name}
                  onChange={(e) => setRuleForm({ ...ruleForm, metric_name: e.target.value })}
                >
                  <option value="risk_score">risk_score</option>
                  <option value="total_cost">total_cost</option>
                  <option value="latency_ms">latency_ms</option>
                  <option value="total_tokens">total_tokens</option>
                  <option value="data_out_mb">data_out_mb</option>
                  <option value="anomaly_score">anomaly_score</option>
                </select>
              </div>
              <div className="field">
                <label>Operator</label>
                <select
                  value={ruleForm.operator}
                  onChange={(e) => setRuleForm({ ...ruleForm, operator: e.target.value })}
                >
                  <option value=">">&gt;</option>
                  <option value=">=">&gt;=</option>
                  <option value="<">&lt;</option>
                  <option value="<=">&lt;=</option>
                </select>
              </div>
              <div className="field">
                <label>Threshold</label>
                <input
                  value={ruleForm.threshold_value}
                  onChange={(e) => setRuleForm({ ...ruleForm, threshold_value: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Severity</label>
                <select
                  value={ruleForm.severity}
                  onChange={(e) => setRuleForm({ ...ruleForm, severity: e.target.value })}
                >
                  <option value="critical">critical</option>
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
              </div>
              <div className="field">
                <label>Scope</label>
                <select
                  value={ruleForm.scope_level}
                  onChange={(e) => setRuleForm({ ...ruleForm, scope_level: e.target.value })}
                >
                  <option value="organization">organization</option>
                  <option value="project">project</option>
                  <option value="tool">tool</option>
                </select>
              </div>
            </div>

            <div className="field">
              <label>Description</label>
              <textarea
                value={ruleForm.description}
                onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
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
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {connectors.map((item) => (
                  <tr key={item.id}>
                    <td>{item.connector_name}</td>
                    <td>{item.tool_name}</td>
                    <td>{item.provider || "-"}</td>
                    <td>{item.ingestion_mode}</td>
                    <td>
                      <span className={`status-pill ${item.status}`}>{item.status}</span>
                    </td>
                  </tr>
                ))}
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
                      <span className={`status-pill ${item.severity}`}>{item.severity}</span>
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
                  <td>{Number(item.total_completion_tokens || 0).toFixed(0)}</td>
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
