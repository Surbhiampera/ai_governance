import React, { useCallback, useEffect, useState } from "react";
import {
  createConnector,
  deleteConnector,
  getConnectors,
  getConnectorSyncLogs,
  getControlQuota,
  getControlTraceDetail,
  getLookupAuthTypes,
  getLookupConnectorStatuses,
  getLookupEventStatuses,
  getLookupIngestionModes,
  getNotificationStatus,
  getTelemetryLogs,
  getToolsUsage,
  triggerConnectorPoll,
  triggerConnectorSync,
  updateConnector,
} from "../api";
import { RANGE_OPTIONS, rangeToStartDate } from "../utils/filters";


const EMPTY_FORM = {
  connector_name: "",
  tool_name: "",
  provider: "",
  endpoint_url: "",
  auth_type: "",
  api_key: "",
  ingestion_mode: "api",
  status: "active",
  org_id: "",
  project_id: "",
  sync_enabled: true,
  pull_interval_minutes: 15,
};

function syncStatusClass(status) {
  if (!status) return "";
  if (status === "success") return "success";
  if (status === "no_data") return "medium";
  return "active";
}

function relativeTime(dt) {
  if (!dt) return "Never";
  const diff = Math.floor((Date.now() - new Date(dt).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Connector Form Modal ─────────────────────────────────────────────────────

function ConnectorModal({ initial, authTypes, ingestionModes, statuses, onSave, onClose }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.connector_name.trim()) { setError("Connector name is required."); return; }
    if (!form.tool_name.trim()) { setError("Tool name is required."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to save connector.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h3>{initial?.id ? "Edit Connector" : "Add Connector"}</h3>
          <button type="button" className="btn-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gap: 20 }}>

            <div className="form-grid">
              <div className="field">
                <label>Connector Name</label>
                <input
                  value={form.connector_name}
                  onChange={(e) => set("connector_name", e.target.value)}
                  placeholder="email-agent-prod"
                  disabled={!!initial?.id}
                />
              </div>
              <div className="field">
                <label>Tool Name</label>
                <input
                  value={form.tool_name}
                  onChange={(e) => set("tool_name", e.target.value)}
                  placeholder="email-agent"
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label>Provider</label>
                <input
                  value={form.provider}
                  onChange={(e) => set("provider", e.target.value)}
                  placeholder="OpenAI, Azure, Custom…"
                />
              </div>
              <div className="field">
                <label>Ingestion Mode</label>
                <select value={form.ingestion_mode} onChange={(e) => set("ingestion_mode", e.target.value)}>
                  {ingestionModes.length
                    ? ingestionModes.map((m) => <option key={m} value={m}>{m}</option>)
                    : ["api", "webhook", "file"].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div className="field">
              <label>Endpoint URL</label>
              <input
                value={form.endpoint_url}
                onChange={(e) => set("endpoint_url", e.target.value)}
                placeholder="https://your-tool.example.com/api/events"
              />
            </div>

            <div className="form-grid">
              <div className="field">
                <label>Auth Type</label>
                <select value={form.auth_type} onChange={(e) => set("auth_type", e.target.value)}>
                  <option value="">None</option>
                  {authTypes.length
                    ? authTypes.map((t) => <option key={t} value={t}>{t}</option>)
                    : ["bearer", "api_key", "x-api-key"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label>API Key / Token</label>
                <input
                  type="password"
                  value={form.api_key}
                  onChange={(e) => set("api_key", e.target.value)}
                  placeholder="sk-…"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label>Org ID</label>
                <input
                  value={form.org_id}
                  onChange={(e) => set("org_id", e.target.value)}
                  placeholder="org-royal-sundaram"
                />
              </div>
              <div className="field">
                <label>Project ID</label>
                <input
                  value={form.project_id}
                  onChange={(e) => set("project_id", e.target.value)}
                  placeholder="proj-email-support"
                />
              </div>
            </div>

            <p className="form-section-label">Pull Schedule</p>

            <div className="form-grid">
              <div className="field">
                <label>Pull Interval (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={form.pull_interval_minutes}
                  onChange={(e) => set("pull_interval_minutes", Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>Status</label>
                <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                  {statuses.length
                    ? statuses.map((s) => <option key={s} value={s}>{s}</option>)
                    : ["active", "inactive", "error"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 12, display: "flex" }}>
              <input
                id="sync-enabled"
                type="checkbox"
                checked={form.sync_enabled}
                onChange={(e) => set("sync_enabled", e.target.checked)}
                style={{ width: "auto", accentColor: "var(--brand-primary)" }}
              />
              <label htmlFor="sync-enabled" style={{ textTransform: "none", letterSpacing: 0, fontSize: 14, color: "var(--gray-700)", cursor: "pointer" }}>
                Enable automated pull (runs every {form.pull_interval_minutes} min via scheduler)
              </label>
            </div>

            {error && <p style={{ color: "var(--brand-primary)", fontSize: 13, margin: 0 }}>{error}</p>}

            <div className="action-row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save Connector"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Sync Log Drawer ──────────────────────────────────────────────────────────

function SyncLogDrawer({ connector, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getConnectorSyncLogs(connector.id, 30)
      .then((r) => setLogs(r.data || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [connector.id]);

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>Sync History</h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--gray-500)" }}>{connector.connector_name}</p>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <p style={{ color: "var(--gray-500)", fontSize: 14 }}>Loading…</p>
        ) : logs.length === 0 ? (
          <p style={{ color: "var(--gray-500)", fontSize: 14 }}>No sync runs recorded yet. Trigger a sync or wait for the scheduler.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Events</th>
                  <th>Duration</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                    </td>
                    <td>
                      <span className={`status-pill ${syncStatusClass(log.sync_status)}`}>
                        {log.sync_status}
                      </span>
                    </td>
                    <td>{log.events_pulled}</td>
                    <td>{log.duration_ms} ms</td>
                    <td style={{ fontSize: 12, color: "var(--brand-primary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.error_message || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Trace Detail Modal ───────────────────────────────────────────────────────

function TraceDetailModal({ detail, onClose }) {
  const d = detail.data;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog" style={{ maxWidth: 780 }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>{detail.error ? "Trace Not Found" : "Trace Detail"}</h3>
            {d && (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--gray-500)", fontFamily: "monospace" }}>
                {d.trace_id}
              </p>
            )}
          </div>
          <button type="button" className="btn-close" onClick={onClose}>×</button>
        </div>

        {detail.loading && (
          <p style={{ color: "var(--gray-500)", fontSize: 14 }}>Loading trace…</p>
        )}

        {detail.error && (
          <p style={{ color: "var(--brand-primary)", fontSize: 14 }}>{detail.error}</p>
        )}

        {d && (
          <>
            <div className="trace-summary-bar" style={{ margin: "16px 0 20px" }}>
              {[
                { label: "Status",       value: d.status || "—" },
                { label: "In Tokens",    value: (d.total_input_tokens || 0).toLocaleString() },
                { label: "Out Tokens",   value: (d.total_output_tokens || 0).toLocaleString() },
                { label: "Total Cost",   value: `$${Number(d.total_cost || 0).toFixed(6)}` },
                { label: "LLM Cost",     value: `$${Number(d.total_llm_cost || 0).toFixed(6)}` },
                { label: "Infra Cost",   value: `$${Number(d.infra_cost || 0).toFixed(6)}` },
                { label: "Latency",      value: `${d.total_execution_time_ms || 0} ms` },
                { label: "Risk Score",   value: Number(d.risk_score || 0).toFixed(2) },
              ].map((item) => (
                <div key={item.label} className="trace-summary-item">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>

            {d.workflow_name && (
              <p style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 12 }}>
                Workflow: <strong>{d.workflow_name}</strong>
                {d.is_unified_trace && (
                  <span className="metric-chip" style={{ marginLeft: 8 }}>unified trace</span>
                )}
              </p>
            )}

            {d.models && d.models.length > 0 && (
              <>
                <h4 style={{ fontSize: 13, color: "var(--gray-700)", margin: "0 0 8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Models ({d.models.length})
                </h4>
                <div className="table-wrap" style={{ marginBottom: 16 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th>Provider</th>
                        <th>In Tokens</th>
                        <th>Out Tokens</th>
                        <th>Cost</th>
                        <th>Latency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.models.map((m, i) => (
                        <tr key={i}>
                          <td><strong style={{ fontSize: 13 }}>{m.model_name}</strong></td>
                          <td style={{ fontSize: 12, color: "var(--gray-500)" }}>{m.provider}</td>
                          <td>{(m.input_tokens || 0).toLocaleString()}</td>
                          <td>{(m.output_tokens || 0).toLocaleString()}</td>
                          <td style={{ fontFamily: "monospace", fontSize: 12 }}>${Number(m.cost || 0).toFixed(6)}</td>
                          <td>{m.latency_ms || 0} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {d.tools && d.tools.length > 0 && (
              <>
                <h4 style={{ fontSize: 13, color: "var(--gray-700)", margin: "0 0 8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Tools ({d.tools.length})
                </h4>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tool</th>
                        <th>Type</th>
                        <th>Invocations</th>
                        <th>Exec Time</th>
                        <th>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.tools.map((t, i) => (
                        <tr key={i}>
                          <td><strong style={{ fontSize: 13 }}>{t.tool_name}</strong></td>
                          <td style={{ fontSize: 12, color: "var(--gray-500)" }}>{t.tool_type || "—"}</td>
                          <td>{t.invocation_count || 1}</td>
                          <td>{t.execution_time_ms || 0} ms</td>
                          <td style={{ fontFamily: "monospace", fontSize: 12 }}>${Number(t.cost || 0).toFixed(6)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}


// ─── Main Component ───────────────────────────────────────────────────────────

function Tools() {
  const [activeTab, setActiveTab] = useState("connectors");

  // Tool usage tab
  const [usage, setUsage] = useState([]);

  // Connectors tab
  const [connectors, setConnectors] = useState([]);
  const [authTypes, setAuthTypes] = useState([]);
  const [ingestionModes, setIngestionModes] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingConnector, setEditingConnector] = useState(null);
  const [logConnector, setLogConnector] = useState(null);
  const [syncing, setSyncing] = useState({});
  const [pollingAll, setPollingAll] = useState(false);
  const [connectorMsg, setConnectorMsg] = useState("");

  // SDK Core tab
  const [events, setEvents] = useState([]);
  const [loadingEv, setLoadingEv] = useState(false);
  const [sdkOrgId, setSdkOrgId] = useState("");
  const [sdkProjectId, setSdkProjectId] = useState("");
  const [sdkProvider, setSdkProvider] = useState("");
  const [sdkStatus, setSdkStatus] = useState("");
  const [sdkLimit, setSdkLimit] = useState(20);
  const [sdkRange, setSdkRange] = useState("all");
  const [sdkApplied, setSdkApplied] = useState({ org_id: "", project_id: "", provider: "", status: "", limit: 20, range: "all" });
  const [sdkEventStatuses, setSdkEventStatuses] = useState([]);
  const [notifStatus, setNotifStatus] = useState(null);
  const [quota, setQuota] = useState(null);
  const [quotaOrgId, setQuotaOrgId] = useState("");
  const [quotaProjectId, setQuotaProjectId] = useState("");
  const [loadingQuota, setLoadingQuota] = useState(false);
  const [traceDetail, setTraceDetail] = useState(null);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadConnectors = useCallback(() => {
    return getConnectors()
      .then((r) => setConnectors(r.data || []))
      .catch(() => setConnectorMsg("Unable to load connectors."));
  }, []);

  useEffect(() => {
    Promise.all([
      getToolsUsage().then((r) => setUsage(r.data || [])).catch(() => {}),
      loadConnectors(),
      getLookupAuthTypes().then((r) => setAuthTypes(r.data || [])).catch(() => {}),
      getLookupIngestionModes().then((r) => setIngestionModes(r.data || [])).catch(() => {}),
      getLookupConnectorStatuses().then((r) => setStatuses(r.data || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [loadConnectors]);

  useEffect(() => {
    if (activeTab !== "sdk") return;
    getNotificationStatus().then((r) => setNotifStatus(r.data)).catch(() => {});
    getLookupEventStatuses().then((r) => setSdkEventStatuses(r.data || [])).catch(() => {});
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "sdk") return;
    setLoadingEv(true);
    const params = { limit: sdkApplied.limit };
    if (sdkApplied.org_id) params.org_id = sdkApplied.org_id;
    if (sdkApplied.project_id) params.project_id = sdkApplied.project_id;
    if (sdkApplied.provider) params.provider = sdkApplied.provider;
    if (sdkApplied.status) params.status = sdkApplied.status;
    const startDate = rangeToStartDate(sdkApplied.range);
    if (startDate) params.start_date = startDate;
    getTelemetryLogs(params)
      .then((r) => setEvents(r.data?.events || r.data || []))
      .catch(() => setEvents([]))
      .finally(() => setLoadingEv(false));
  }, [activeTab, sdkApplied]);

  const handleSave = async (form) => {
    if (editingConnector?.id) {
      await updateConnector(editingConnector.id, form);
    } else {
      await createConnector(form);
    }
    await loadConnectors();
    setEditingConnector(null);
  };

  const handleDelete = async (connector) => {
    if (!window.confirm(`Delete connector "${connector.connector_name}"? This also removes its sync history.`)) return;
    try {
      await deleteConnector(connector.id);
      await loadConnectors();
      setConnectorMsg(`Connector "${connector.connector_name}" deleted.`);
      setTimeout(() => setConnectorMsg(""), 3000);
    } catch {
      setConnectorMsg("Failed to delete connector.");
    }
  };

  const handleTriggerSync = async (connector) => {
    setSyncing((s) => ({ ...s, [connector.id]: true }));
    setConnectorMsg("");
    try {
      const res = await triggerConnectorSync(connector.id);
      const d = res.data;
      setConnectorMsg(`Sync complete — ${d.events_pulled} event(s) pulled in ${d.duration_ms} ms.`);
      await loadConnectors();
    } catch {
      setConnectorMsg("Sync failed. Check endpoint URL and credentials.");
    } finally {
      setSyncing((s) => ({ ...s, [connector.id]: false }));
      setTimeout(() => setConnectorMsg(""), 5000);
    }
  };

  const handlePollAll = async () => {
    setPollingAll(true);
    setConnectorMsg("");
    try {
      const res = await triggerConnectorPoll();
      const r = res.data?.result || {};
      setConnectorMsg(`Poll complete — ${r.connectors_polled || 0} connectors, ${r.events_pulled || 0} events pulled.`);
      await loadConnectors();
    } catch {
      setConnectorMsg("Poll failed.");
    } finally {
      setPollingAll(false);
      setTimeout(() => setConnectorMsg(""), 5000);
    }
  };

  const handleSdkSearch = () => {
    setSdkApplied({
      org_id: sdkOrgId,
      project_id: sdkProjectId,
      provider: sdkProvider,
      status: sdkStatus,
      limit: sdkLimit,
      range: sdkRange,
    });
  };

  const handleCheckQuota = async () => {
    if (!quotaOrgId.trim()) return;
    setLoadingQuota(true);
    setQuota(null);
    try {
      const r = await getControlQuota(quotaOrgId.trim(), quotaProjectId.trim() || undefined);
      setQuota(r.data);
    } catch {
      setQuota({ error: "Could not load quota. Verify the Org ID and try again." });
    } finally {
      setLoadingQuota(false);
    }
  };

  const handleOpenTrace = async (traceId, orgId) => {
    if (!traceId) return;
    setTraceDetail({ loading: true, data: null, error: null });
    try {
      const r = await getControlTraceDetail(traceId, orgId || undefined);
      setTraceDetail({ loading: false, data: r.data, error: null });
    } catch {
      setTraceDetail({ loading: false, data: null, error: "Trace not found or not yet available." });
    }
  };

  const projects  = [...new Set(events.map((e) => e.project_id).filter(Boolean))];
  const models    = [...new Set(events.map((e) => e.model_name).filter(Boolean))];
  const toolNames = [...new Set(events.map((e) => e.tool_name).filter(Boolean))];

  const TABS = [
    { id: "connectors", label: "Connectors" },
    { id: "usage",      label: "Tool Usage" },
    { id: "sdk",        label: "SDK Core" },
  ];

  return (
    <div className="page-shell">

      {/* ── Header ── */}
      <section className="panel" style={{ padding: "18px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Control Plane</h2>
            <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 14 }}>
              Connector health, automated pull scheduling, tool usage metrics, and live telemetry.
            </p>
          </div>
          <div className="pill-row" style={{ gap: 8 }}>
            <span className="pill">
              Connectors <span className="highlight">{connectors.length}</span>
            </span>
            <span className="pill">
              Tools active <span className="highlight">{usage.length}</span>
            </span>
          </div>
        </div>
        {message && <div className="feedback-msg" style={{ marginTop: 10 }}>{message}</div>}
      </section>

      {/* ── Tab Bar ── */}
      <section className="panel" style={{ padding: "6px 24px 0" }}>
        <div className="action-row" style={{ gap: 4 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`btn ${activeTab === t.id ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* ════════════════════ CONNECTORS TAB ════════════════════ */}
      {activeTab === "connectors" && (
        <>
          {/* Health Summary Strip */}
          <section className="panel" style={{ padding: 0, overflow: "hidden" }}>
            <div className="trace-summary-bar">
              {[
                {
                  label: "Total Connectors",
                  value: connectors.length,
                },
                {
                  label: "Active",
                  value: connectors.filter((c) => c.status === "active").length,
                },
                {
                  label: "Pull-Enabled",
                  value: connectors.filter((c) => c.sync_enabled && c.ingestion_mode === "api").length,
                },
                {
                  label: "Last-Sync Errors",
                  value: connectors.filter((c) => c.last_sync_status === "error").length,
                },
                {
                  label: "Total Events Pulled",
                  value: connectors.reduce((s, c) => s + (c.total_events_pulled || 0), 0).toLocaleString(),
                },
              ].map((item) => (
                <div key={item.label} className="trace-summary-item">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>

          {/* Connector Table */}
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>Data Connectors</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  Register each AI tool as a connector. Pull-mode connectors are polled every 15 minutes by the scheduler.
                </p>
              </div>
              <div className="action-row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handlePollAll}
                  disabled={pollingAll}
                >
                  {pollingAll ? "Polling…" : "Poll All Now"}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => { setEditingConnector(null); setShowModal(true); }}
                >
                  Add Connector
                </button>
              </div>
            </div>

            {connectorMsg && (
              <div className="feedback-msg" style={{ marginBottom: 16 }}>{connectorMsg}</div>
            )}

            {loading ? (
              <p style={{ color: "var(--gray-500)", fontSize: 14 }}>Loading connectors…</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Connector</th>
                      <th>Tool</th>
                      <th>Mode</th>
                      <th>Auth</th>
                      <th>Status</th>
                      <th>Pull</th>
                      <th>Last Sync</th>
                      <th>Sync Status</th>
                      <th>Events Pulled</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connectors.length === 0 && (
                      <tr>
                        <td colSpan={10} style={{ textAlign: "center", color: "var(--gray-500)", padding: "32px 16px" }}>
                          No connectors yet. Add one to start pulling telemetry from your AI tools automatically.
                        </td>
                      </tr>
                    )}
                    {connectors.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.connector_name}</div>
                          {c.provider && (
                            <div style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 2 }}>{c.provider}</div>
                          )}
                        </td>
                        <td style={{ fontSize: 13 }}>{c.tool_name}</td>
                        <td>
                          <span className="metric-chip">{c.ingestion_mode}</span>
                        </td>
                        <td style={{ fontSize: 12, color: "var(--gray-500)" }}>{c.auth_type || "—"}</td>
                        <td>
                          <span className={`status-pill ${c.status === "active" ? "success" : "medium"}`}>
                            {c.status}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            display: "inline-block",
                            width: 10, height: 10, borderRadius: "50%",
                            background: c.sync_enabled ? "var(--brand-primary)" : "var(--gray-300)",
                            marginRight: 6,
                          }} />
                          {c.sync_enabled ? `Every ${c.pull_interval_minutes}m` : "Off"}
                        </td>
                        <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                          {relativeTime(c.last_ingested_at)}
                        </td>
                        <td>
                          {c.last_sync_status ? (
                            <span className={`status-pill ${syncStatusClass(c.last_sync_status)}`}>
                              {c.last_sync_status}
                            </span>
                          ) : (
                            <span style={{ color: "var(--gray-300)", fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          {(c.total_events_pulled || 0).toLocaleString()}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: "6px 12px", fontSize: 12 }}
                              onClick={() => handleTriggerSync(c)}
                              disabled={syncing[c.id]}
                            >
                              {syncing[c.id] ? "Syncing…" : "Sync"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: "6px 12px", fontSize: 12 }}
                              onClick={() => setLogConnector(c)}
                            >
                              History
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: "6px 12px", fontSize: 12 }}
                              onClick={() => { setEditingConnector(c); setShowModal(true); }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: "6px 12px", fontSize: 12, color: "var(--brand-primary)" }}
                              onClick={() => handleDelete(c)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* How It Works */}
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>How Automated Pull Works</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  Each pull-mode connector is called on a schedule. Returned events are ingested through the full governance pipeline.
                </p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              {[
                { step: "1", title: "Register Connector", desc: "Add the tool's API endpoint and auth credentials. Set pull interval and org routing." },
                { step: "2", title: "Scheduler Polls",     desc: "APScheduler calls each active pull connector on its configured interval (default 15 min)." },
                { step: "3", title: "Events Ingested",     desc: "Returned events flow through Cost Engine, Security Engine, and Alert Engine automatically." },
                { step: "4", title: "Health Tracked",      desc: "Each sync attempt is logged. Last-sync status and error details are shown per connector." },
              ].map((item) => (
                <div key={item.step} className="workflow-step">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="flow-step-number" style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: "linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))",
                      color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, fontWeight: 700, flexShrink: 0,
                    }}>{item.step}</span>
                    <strong style={{ fontSize: 13 }}>{item.title}</strong>
                  </div>
                  <span style={{ fontSize: 13, color: "var(--gray-500)", lineHeight: 1.5 }}>{item.desc}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ════════════════════ TOOL USAGE TAB ════════════════════ */}
      {activeTab === "usage" && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>Tool Usage Summary</h3>
              <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                Aggregated cost, token, and latency metrics per AI tool.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tool / Model</th>
                  <th>Vendor</th>
                  <th>Events</th>
                  <th>Total Cost</th>
                  <th>Total Tokens</th>
                  <th>Input Tokens</th>
                  <th>Output Tokens</th>
                  <th>Avg Latency</th>
                  <th>Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {usage.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", color: "var(--gray-500)", padding: "32px 16px" }}>
                      No events yet. Install the SDK or configure a pull connector to ingest data.
                    </td>
                  </tr>
                )}
                {usage.map((item) => (
                  <tr key={item.tool_name}>
                    <td><strong>{item.tool_name || "—"}</strong></td>
                    <td>{item.vendor || "—"}</td>
                    <td>{item.total_events}</td>
                    <td>${Number(item.total_cost || 0).toFixed(4)}</td>
                    <td>{Number(item.total_tokens || 0).toLocaleString()}</td>
                    <td>{Number(item.total_prompt_tokens || 0).toLocaleString()}</td>
                    <td>{Number(item.total_completion_tokens || 0).toLocaleString()}</td>
                    <td>{Number(item.avg_latency_ms || 0).toFixed(1)} ms</td>
                    <td>
                      <span className={`status-pill ${Number(item.success_rate || 0) >= 90 ? "success" : "warning"}`}>
                        {Number(item.success_rate || 0).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ════════════════════ SDK CORE TAB ════════════════════ */}
      {activeTab === "sdk" && (
        <>
          {/* ── Notification Channels ── */}
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>Notification Channels</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  Alert delivery configuration. Critical and high severity events are dispatched automatically across configured channels.
                </p>
              </div>
            </div>
            {notifStatus ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                {Object.entries(notifStatus.channels || {}).map(([key, ch]) => (
                  <div
                    key={key}
                    style={{
                      padding: "16px 18px",
                      background: "var(--gray-50)",
                      border: "1px solid rgba(124,112,174,0.15)",
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <strong style={{ fontSize: 13, textTransform: "capitalize" }}>{key}</strong>
                      <span className={`status-pill ${ch.status === "active" ? "success" : "warning"}`}>
                        {ch.status === "active" ? "Active" : "Not configured"}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--gray-500)", lineHeight: 1.5 }}>{ch.description}</p>
                    {ch.recipients != null && (
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--gray-400)" }}>
                        {ch.recipients} recipient{ch.recipients !== 1 ? "s" : ""}
                      </p>
                    )}
                    {ch.webhooks != null && (
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--gray-400)" }}>
                        {ch.webhooks} webhook{ch.webhooks !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--gray-400)", fontSize: 13 }}>Loading channel status…</p>
            )}
          </section>

          {/* ── Quota & Budget Monitor ── */}
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>Quota & Budget Monitor</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  Real-time month-to-date spend vs budget with velocity-based end-of-month forecast. Enter an org ID to check.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 20 }}>
              <div className="field" style={{ margin: 0, flex: "1 1 180px" }}>
                <label>Org ID</label>
                <input
                  value={quotaOrgId}
                  onChange={(e) => setQuotaOrgId(e.target.value)}
                  placeholder="org-royal-sundaram"
                  onKeyDown={(e) => e.key === "Enter" && handleCheckQuota()}
                />
              </div>
              <div className="field" style={{ margin: 0, flex: "1 1 180px" }}>
                <label>Project ID (optional)</label>
                <input
                  value={quotaProjectId}
                  onChange={(e) => setQuotaProjectId(e.target.value)}
                  placeholder="proj-email-support"
                  onKeyDown={(e) => e.key === "Enter" && handleCheckQuota()}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCheckQuota}
                disabled={loadingQuota || !quotaOrgId.trim()}
                style={{ alignSelf: "flex-end" }}
              >
                {loadingQuota ? "Checking…" : "Check Quota"}
              </button>
            </div>

            {quota && !quota.error && (
              <>
                <div className="trace-summary-bar">
                  {[
                    { label: "Month Cost",    value: `$${Number(quota.month_cost || 0).toFixed(4)}` },
                    { label: "Budget Limit",  value: quota.budget_limit != null ? `$${Number(quota.budget_limit).toFixed(2)}` : "No limit" },
                    { label: "Usage",         value: quota.usage_percent != null ? `${quota.usage_percent}%` : "—" },
                    { label: "Forecast",      value: `$${Number(quota.forecast_month_cost || 0).toFixed(4)}` },
                    { label: "Velocity/day",  value: `$${Number(quota.daily_velocity_cost || 0).toFixed(4)}` },
                    { label: "Days Left",     value: quota.days_remaining_in_month ?? "—" },
                    { label: "Token Quota %", value: quota.token_quota_percent != null ? `${quota.token_quota_percent}%` : "—" },
                  ].map((item) => (
                    <div key={item.label} className="trace-summary-item">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>

                {quota.will_exceed_budget && (
                  <div style={{
                    marginTop: 12, padding: "10px 16px",
                    background: "rgba(158, 42, 151, 0.07)",
                    border: "1px solid rgba(158, 42, 151, 0.22)",
                    borderRadius: 8, fontSize: 13, color: "var(--brand-primary)",
                  }}>
                    Forecast exceeds budget. At current velocity the monthly spend will reach{" "}
                    <strong>${Number(quota.forecast_month_cost || 0).toFixed(4)}</strong> against a limit of{" "}
                    <strong>${Number(quota.budget_limit || 0).toFixed(2)}</strong>. Review usage or adjust the budget limit.
                  </div>
                )}
              </>
            )}

            {quota?.error && (
              <p style={{ color: "var(--brand-primary)", fontSize: 13, margin: 0 }}>{quota.error}</p>
            )}
          </section>

          {/* ── Live Telemetry ── */}
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>Live Telemetry</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  Real-time ingestion events across all tools. Click a Trace ID to drill into the full trace.
                </p>
              </div>
              <div className="pill-row" style={{ gap: 8 }}>
                <span className="pill">Projects <span className="highlight">{projects.length}</span></span>
                <span className="pill">Models <span className="highlight">{models.length}</span></span>
                <span className="pill">Tools <span className="highlight">{toolNames.length}</span></span>
              </div>
            </div>

            {/* Filter bar */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
              <div className="field" style={{ margin: 0, flex: "1 1 140px" }}>
                <label>Org ID</label>
                <input
                  value={sdkOrgId}
                  onChange={(e) => setSdkOrgId(e.target.value)}
                  placeholder="Filter by org…"
                />
              </div>
              <div className="field" style={{ margin: 0, flex: "1 1 140px" }}>
                <label>Project ID</label>
                <input
                  value={sdkProjectId}
                  onChange={(e) => setSdkProjectId(e.target.value)}
                  placeholder="Filter by project…"
                />
              </div>
              <div className="field" style={{ margin: 0, flex: "0 0 140px" }}>
                <label>Range</label>
                <select value={sdkRange} onChange={(e) => setSdkRange(e.target.value)}>
                  {RANGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0, flex: "1 1 130px" }}>
                <label>Provider</label>
                <input
                  value={sdkProvider}
                  onChange={(e) => setSdkProvider(e.target.value)}
                  placeholder="openai, azure…"
                />
              </div>
              <div className="field" style={{ margin: 0, flex: "0 0 130px" }}>
                <label>Status</label>
                <select value={sdkStatus} onChange={(e) => setSdkStatus(e.target.value)}>
                  <option value="">All statuses</option>
                  {sdkEventStatuses.length
                    ? sdkEventStatuses.map((s) => <option key={s} value={s}>{s}</option>)
                    : ["success", "completed", "error", "failed"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field" style={{ margin: 0, flex: "0 0 90px" }}>
                <label>Limit</label>
                <select value={sdkLimit} onChange={(e) => setSdkLimit(Number(e.target.value))}>
                  {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSdkSearch}
                style={{ alignSelf: "flex-end" }}
              >
                Search
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Org</th>
                    <th>Project</th>
                    <th>Tool</th>
                    <th>Model</th>
                    <th>Provider</th>
                    <th>In Tokens</th>
                    <th>Out Tokens</th>
                    <th>Cost</th>
                    <th>Latency</th>
                    <th>Misuse</th>
                    <th>Status</th>
                    <th>Trace</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingEv && (
                    <tr>
                      <td colSpan={13} style={{ textAlign: "center", color: "var(--gray-500)" }}>Loading…</td>
                    </tr>
                  )}
                  {!loadingEv && events.length === 0 && (
                    <tr>
                      <td colSpan={13} style={{ textAlign: "center", color: "var(--gray-500)", padding: "32px 16px" }}>
                        No events match the current filter. Adjust filters or install the SDK to start ingesting events.
                      </td>
                    </tr>
                  )}
                  {events.map((e, i) => (
                    <tr key={e.event_id || i}>
                      <td style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                        {e.created_at ? new Date(e.created_at).toLocaleTimeString() : "—"}
                      </td>
                      <td style={{ fontSize: 12 }}>{e.org_id || "—"}</td>
                      <td style={{ fontSize: 12 }}>{e.project_id || "—"}</td>
                      <td>{e.tool_name || "—"}</td>
                      <td>{e.model_name || "—"}</td>
                      <td style={{ fontSize: 12, color: "var(--gray-500)" }}>{e.provider || "—"}</td>
                      <td>{Number(e.prompt_tokens || 0).toLocaleString()}</td>
                      <td>{Number(e.completion_tokens || 0).toLocaleString()}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                        ${Number(e.total_cost || 0).toFixed(4)}
                      </td>
                      <td>{e.latency_ms != null ? `${e.latency_ms} ms` : "—"}</td>
                      <td>
                        {e.misuse_detected
                          ? <span className="status-pill active">Yes</span>
                          : <span className="status-pill success">No</span>}
                      </td>
                      <td>
                        <span className={`status-pill ${e.status === "success" || e.status === "completed" ? "success" : "active"}`}>
                          {e.status || "—"}
                        </span>
                      </td>
                      <td>
                        {e.trace_id ? (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: "4px 10px", fontSize: 11, fontFamily: "monospace" }}
                            onClick={() => handleOpenTrace(e.trace_id, e.org_id)}
                          >
                            {e.trace_id.slice(0, 8)}…
                          </button>
                        ) : (
                          <span style={{ color: "var(--gray-300)", fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ── Modals ── */}
      {showModal && (
        <ConnectorModal
          initial={editingConnector}
          authTypes={authTypes}
          ingestionModes={ingestionModes}
          statuses={statuses}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingConnector(null); }}
        />
      )}
      {logConnector && (
        <SyncLogDrawer connector={logConnector} onClose={() => setLogConnector(null)} />
      )}
      {traceDetail && (
        <TraceDetailModal detail={traceDetail} onClose={() => setTraceDetail(null)} />
      )}
    </div>
  );
}

export default Tools;
