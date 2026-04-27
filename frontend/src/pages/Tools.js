import React, { useEffect, useState } from "react";
import {
  createConnector,
  createRule,
  getConnectors,
  getLookupAuthTypes,
  getLookupConnectorStatuses,
  getLookupIngestionModes,
  getLookupProviders,
  getLookupRuleMetrics,
  getLookupRuleOperators,
  getLookupRuleScopes,
  getLookupScopeReferences,
  getLookupSeverities,
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
  auth_type: "",
  ingestion_mode: "",
  status: "",
};

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

  // Dynamic dropdown options sourced from backend lookups
  const [authTypes, setAuthTypes] = useState([]);
  const [ingestionModes, setIngestionModes] = useState([]);
  const [connectorStatuses, setConnectorStatuses] = useState([]);
  const [providers, setProviders] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [operators, setOperators] = useState([]);
  const [severities, setSeverities] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [scopeRefs, setScopeRefs] = useState([]);

  const load = async () => {
    const [
      connectorRes,
      rulesRes,
      usageRes,
      authRes,
      modeRes,
      statusRes,
      provRes,
      metricRes,
      opRes,
      sevRes,
      scopeRes,
    ] = await Promise.all([
      getConnectors(),
      getRules(),
      getToolsUsage(),
      getLookupAuthTypes(),
      getLookupIngestionModes(),
      getLookupConnectorStatuses(),
      getLookupProviders(),
      getLookupRuleMetrics(),
      getLookupRuleOperators(),
      getLookupSeverities(),
      getLookupRuleScopes(),
    ]);
    setConnectors(connectorRes.data || []);
    setRules(rulesRes.data || []);
    setUsage(usageRes.data || []);
    setAuthTypes(authRes.data || []);
    setIngestionModes(modeRes.data || []);
    setConnectorStatuses(statusRes.data || []);
    setProviders(provRes.data || []);
    setMetrics(metricRes.data || []);
    setOperators(opRes.data || []);
    setSeverities(sevRes.data || []);
    setScopes(scopeRes.data || []);

    // Pre-fill defaults from the first option of each list (no hardcoding).
    setConnectorForm((prev) => ({
      ...prev,
      auth_type: prev.auth_type || (authRes.data || [])[0] || "",
      ingestion_mode: prev.ingestion_mode || (modeRes.data || [])[0] || "",
      status: prev.status || (statusRes.data || [])[0] || "",
    }));
    setRuleForm((prev) => ({
      ...prev,
      metric_name: prev.metric_name || (metricRes.data || [])[0] || "",
      operator: prev.operator || (opRes.data || [])[0] || "",
      severity: prev.severity || (sevRes.data || [])[0] || "",
      scope_level: prev.scope_level || (scopeRes.data || [])[0] || "",
    }));
  };

  useEffect(() => {
    load().catch(() => setMessage("Unable to load controls right now."));
  }, []);

  // Re-fetch scope references whenever the chosen scope changes.
  useEffect(() => {
    if (!ruleForm.scope_level) {
      setScopeRefs([]);
      return;
    }
    getLookupScopeReferences(ruleForm.scope_level)
      .then((res) => setScopeRefs(res.data || []))
      .catch(() => setScopeRefs([]));
  }, [ruleForm.scope_level]);

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
                <label>Connector Name</label>
                <input
                  value={connectorForm.connector_name}
                  onChange={(e) =>
                    setConnectorForm({
                      ...connectorForm,
                      connector_name: e.target.value,
                    })
                  }
                  required
                />
              </div>
              <div className="field">
                <label>Tool Name</label>
                <input
                  value={connectorForm.tool_name}
                  onChange={(e) =>
                    setConnectorForm({
                      ...connectorForm,
                      tool_name: e.target.value,
                    })
                  }
                  required
                />
              </div>
              <div className="field">
                <label>Provider</label>
                <select
                  value={connectorForm.provider}
                  onChange={(e) =>
                    setConnectorForm({
                      ...connectorForm,
                      provider: e.target.value,
                    })
                  }
                >
                  <option value="">Select provider…</option>
                  {providers.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Auth Type</label>
                <select
                  value={connectorForm.auth_type}
                  onChange={(e) =>
                    setConnectorForm({
                      ...connectorForm,
                      auth_type: e.target.value,
                    })
                  }
                >
                  {authTypes.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Ingestion Mode</label>
                <select
                  value={connectorForm.ingestion_mode}
                  onChange={(e) =>
                    setConnectorForm({
                      ...connectorForm,
                      ingestion_mode: e.target.value,
                    })
                  }
                >
                  {ingestionModes.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Status</label>
                <select
                  value={connectorForm.status}
                  onChange={(e) =>
                    setConnectorForm({
                      ...connectorForm,
                      status: e.target.value,
                    })
                  }
                >
                  {connectorStatuses.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-grid full">
              <div className="field">
                <label>Endpoint URL</label>
                <input
                  value={connectorForm.endpoint_url}
                  onChange={(e) =>
                    setConnectorForm({
                      ...connectorForm,
                      endpoint_url: e.target.value,
                    })
                  }
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
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, rule_name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="field">
                <label>Metric</label>
                <select
                  value={ruleForm.metric_name}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, metric_name: e.target.value })
                  }
                >
                  {metrics.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Operator</label>
                <select
                  value={ruleForm.operator}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, operator: e.target.value })
                  }
                >
                  {operators.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Threshold</label>
                <input
                  value={ruleForm.threshold_value}
                  onChange={(e) =>
                    setRuleForm({
                      ...ruleForm,
                      threshold_value: e.target.value,
                    })
                  }
                  required
                />
              </div>
              <div className="field">
                <label>Severity</label>
                <select
                  value={ruleForm.severity}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, severity: e.target.value })
                  }
                >
                  {severities.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Scope</label>
                <select
                  value={ruleForm.scope_level}
                  onChange={(e) =>
                    setRuleForm({
                      ...ruleForm,
                      scope_level: e.target.value,
                      scope_reference: "",
                    })
                  }
                >
                  {scopes.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Scope Reference</label>
                <select
                  value={ruleForm.scope_reference}
                  onChange={(e) =>
                    setRuleForm({
                      ...ruleForm,
                      scope_reference: e.target.value,
                    })
                  }
                >
                  <option value="">All {ruleForm.scope_level || "scopes"}</option>
                  {scopeRefs.map((ref) => (
                    <option key={ref.id} value={ref.id}>
                      {ref.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label>Description</label>
              <textarea
                value={ruleForm.description}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, description: e.target.value })
                }
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
                      <span className={`status-pill ${item.status}`}>
                        {item.status}
                      </span>
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
