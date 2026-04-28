import React, { useEffect, useState } from "react";
import {
  getLookupEventStatuses,
  getTelemetryLogs,
  getTrace,
  postTelemetryEvent,
  updateTelemetryEvent,
  deleteTelemetryEvent,
} from "../api";

const freshIds = () => ({
  event_id: `evt-${Date.now()}`,
  request_id: `req-${Date.now()}`,
  trace_id: `trace-${Date.now()}`,
});

const blankEvent = {
  org_id: "",
  project_id: "",
  user_id: "",
  tool_name: "",
  provider: "",
  model_name: "",
  component_name: "",
  service_type: "",
  execution_type: "",
  status: "success",
  latency_ms: "",
  input_data_size_mb: "",
  output_data_size_mb: "",
  prompt_tokens: "",
  completion_tokens: "",
  infra_cost: "",
  contains_pii: false,
  pii_type: "",
  data_out_violation: false,
  tags: "",
  stages: [],
};

const REQUIRED_FIELDS = ["org_id", "tool_name", "project_id", "model_name"];

function TestEvent() {
  const [form, setForm] = useState({ ...blankEvent });
  const [events, setEvents] = useState([]);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [eventStatuses, setEventStatuses] = useState([]);

  const loadEvents = async () => {
    const response = await getTelemetryLogs({ limit: 12 });
    setEvents(response.data || []);
  };

  useEffect(() => {
    loadEvents().catch(() => setMessage("Unable to load data."));
    getLookupEventStatuses()
      .then((res) => setEventStatuses(res.data || []))
      .catch(() => {});
  }, []);

  /* ── Modal helpers ── */
  const openAddModal = () => {
    setEditingEventId(null);
    setForm({ ...blankEvent });
    setValidationErrors({});
    setModalOpen(true);
  };

  const openEditModal = (evt) => {
    setEditingEventId(evt.event_id);
    setValidationErrors({});
    setForm({
      ...blankEvent,
      event_id: evt.event_id,
      request_id: evt.request_id || "",
      trace_id: evt.trace_id || "",
      org_id: evt.org_id || "",
      project_id: evt.project_id || "",
      user_id: evt.user_id || "",
      tool_name: evt.tool_name || "",
      provider: evt.provider || "",
      model_name: evt.model_name || "",
      component_name: evt.component_name || "",
      service_type: evt.service_type || "",
      execution_type: evt.execution_type || "",
      status: evt.status || "success",
      latency_ms: evt.latency_ms ?? "",
      input_data_size_mb: evt.input_data_size_mb ?? "",
      output_data_size_mb: evt.output_data_size_mb ?? "",
      prompt_tokens: evt.prompt_tokens ?? "",
      completion_tokens: evt.completion_tokens ?? "",
      infra_cost: evt.infra_cost ?? "",
      pii_type: evt.pii_type || "",
      tags: Array.isArray(evt.tags) ? evt.tags.join(", ") : evt.tags || "",
      stages: evt.stages || [],
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingEventId(null);
    setValidationErrors({});
  };

  const resetForm = () => {
    setValidationErrors({});
    if (editingEventId) {
      const evt = events.find((e) => e.event_id === editingEventId);
      if (evt) { openEditModal(evt); return; }
    }
    setForm({ ...blankEvent });
  };

  /* ── Validate mandatory fields ── */
  const validate = () => {
    const errors = {};
    if (!form.org_id) errors.org_id = "Organization is required";
    if (!form.tool_name) errors.tool_name = "Tool is required";
    if (!form.project_id) errors.project_id = "Project is required";
    if (!form.model_name || !form.model_name.trim()) errors.model_name = "Model is required";
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /* ── Submit (add or edit) ── */
  const submitEvent = async (e) => {
    e.preventDefault();
    if (!editingEventId && !validate()) return;
    setSubmitting(true);
    try {
      const ids = editingEventId ? {} : freshIds();
      const payload = {
        ...form,
        ...ids,
        input_data_size_mb: Number(form.input_data_size_mb) || 0,
        output_data_size_mb: Number(form.output_data_size_mb) || 0,
        latency_ms: Number(form.latency_ms) || 0,
        prompt_tokens: Number(form.prompt_tokens) || 0,
        completion_tokens: Number(form.completion_tokens) || 0,
        infra_cost: Number(form.infra_cost) || 0,
        pii_type: form.pii_type || null,
        component_name: form.component_name || null,
        service_type: form.service_type || null,
        execution_type: form.execution_type || null,
        user_id: form.user_id || null,
        tags: typeof form.tags === "string"
          ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : form.tags,
      };

      if (editingEventId) {
        await updateTelemetryEvent(editingEventId, payload);
        setMessage(`Event ${editingEventId} updated successfully.`);
      } else {
        await postTelemetryEvent(payload);
        setMessage("Telemetry event ingested successfully.");
      }
      closeModal();
      await loadEvents();
    } catch {
      setMessage(
        editingEventId
          ? "Update failed. Check backend connectivity."
          : "Telemetry ingest failed. Check backend connectivity."
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Delete ── */
  const handleDelete = async (eventId) => {
    try {
      await deleteTelemetryEvent(eventId);
      setMessage(`Event ${eventId} deleted.`);
      setDeleteConfirm(null);
      if (selectedTrace?.event?.event_id === eventId) setSelectedTrace(null);
      await loadEvents();
    } catch {
      setMessage("Delete failed. Check backend connectivity.");
    }
  };

  /* ── Trace viewer ── */
  const openTrace = async (eventId) => {
    const response = await getTrace(eventId);
    setSelectedTrace(response.data);
  };

  const isEditing = !!editingEventId;

  const fieldError = (name) =>
    validationErrors[name]
      ? { borderColor: "var(--brand-primary)" }
      : {};

  return (
    <div className="page-shell">
      {/* ── Compact Header ── */}
      <section className="panel" style={{ padding: "18px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Event Tracing &amp; Simulator</h2>
            <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 14 }}>
              Inject, edit, or remove telemetry events. Inspect traces with tokens, cost, latency, and security.
            </p>
          </div>
          <div className="action-row">
            <button type="button" className="btn btn-primary" onClick={openAddModal}>
              ＋ Add Event
            </button>
          </div>
        </div>
        {message && (
          <div className="feedback-msg" style={{ marginTop: 10 }}>{message}</div>
        )}
      </section>

      {/* ── Inject / Edit Modal ── */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{isEditing ? "Edit Event" : "Inject Telemetry Event"}</h3>
              <button type="button" className="btn-close" onClick={closeModal}>
                ✕
              </button>
            </div>

            <form className="stack" onSubmit={submitEvent}>
              {isEditing && (
                <div className="tool-cost-chip" style={{ fontSize: 13, color: "var(--gray-500)" }}>
                  Editing: <strong style={{ color: "var(--gray-700)" }}>{editingEventId}</strong>
                </div>
              )}

              {/* ── Required Fields ── */}
              <p className="form-section-label">Required fields</p>
              <div className="form-grid">
                <div className="field">
                  <label>Organization *</label>
                  <input value={form.org_id} onChange={(e) => setForm({ ...form, org_id: e.target.value })} placeholder="e.g. org-acme" style={fieldError("org_id")} />
                  {validationErrors.org_id && <span className="field-error">{validationErrors.org_id}</span>}
                </div>
                <div className="field">
                  <label>Project *</label>
                  <input value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} placeholder="e.g. proj-main" style={fieldError("project_id")} />
                  {validationErrors.project_id && <span className="field-error">{validationErrors.project_id}</span>}
                </div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Tool *</label>
                  <input value={form.tool_name} onChange={(e) => setForm({ ...form, tool_name: e.target.value })} placeholder="e.g. LangChain, OpenAI" style={fieldError("tool_name")} />
                  {validationErrors.tool_name && <span className="field-error">{validationErrors.tool_name}</span>}
                </div>
                <div className="field">
                  <label>Model *</label>
                  <input value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} placeholder="e.g. gpt-4, claude-3" style={fieldError("model_name")} />
                  {validationErrors.model_name && <span className="field-error">{validationErrors.model_name}</span>}
                </div>
              </div>

              {/* ── Optional Details ── */}
              <p className="form-section-label">Optional details</p>
              <div className="form-grid">
                <div className="field">
                  <label>Provider</label>
                  <input
                    value={form.provider}
                    onChange={(e) => setForm({ ...form, provider: e.target.value })}
                    placeholder="e.g. openai, anthropic"
                  />
                </div>
                <div className="field">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {eventStatuses.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Service Type</label>
                  <input value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} placeholder="e.g. llm, embedding" />
                </div>
                <div className="field">
                  <label>Execution Type</label>
                  <input value={form.execution_type} onChange={(e) => setForm({ ...form, execution_type: e.target.value })} placeholder="e.g. chat, completion" />
                </div>
                <div className="field">
                  <label>Component</label>
                  <input value={form.component_name} onChange={(e) => setForm({ ...form, component_name: e.target.value })} placeholder="e.g. answer-pipeline" />
                </div>
                <div className="field">
                  <label>User ID</label>
                  <input value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} placeholder="e.g. analyst-01" />
                </div>
              </div>

              {/* ── Metrics ── */}
              <p className="form-section-label">Metrics</p>
              <div className="form-grid">
                <div className="field">
                  <label>Prompt Tokens</label>
                  <input type="number" min="0" value={form.prompt_tokens} onChange={(e) => setForm({ ...form, prompt_tokens: e.target.value })} placeholder="0" />
                </div>
                <div className="field">
                  <label>Completion Tokens</label>
                  <input type="number" min="0" value={form.completion_tokens} onChange={(e) => setForm({ ...form, completion_tokens: e.target.value })} placeholder="0" />
                </div>
                <div className="field">
                  <label>Latency (ms)</label>
                  <input type="number" min="0" value={form.latency_ms} onChange={(e) => setForm({ ...form, latency_ms: e.target.value })} placeholder="0" />
                </div>
                <div className="field">
                  <label>Infra Cost ($)</label>
                  <input type="number" step="0.0001" min="0" value={form.infra_cost} onChange={(e) => setForm({ ...form, infra_cost: e.target.value })} placeholder="0.00" />
                </div>
                <div className="field">
                  <label>Input Size (MB)</label>
                  <input type="number" step="0.01" min="0" value={form.input_data_size_mb} onChange={(e) => setForm({ ...form, input_data_size_mb: e.target.value })} placeholder="0.00" />
                </div>
                <div className="field">
                  <label>Output Size (MB)</label>
                  <input type="number" step="0.01" min="0" value={form.output_data_size_mb} onChange={(e) => setForm({ ...form, output_data_size_mb: e.target.value })} placeholder="0.00" />
                </div>
              </div>

              {/* ── Security & Tags ── */}
              <p className="form-section-label">Security &amp; tags</p>
              <div className="form-grid">
                <div className="field">
                  <label>PII Type</label>
                  <input value={form.pii_type} onChange={(e) => setForm({ ...form, pii_type: e.target.value })} placeholder="e.g. email, ssn (leave empty if none)" />
                </div>
                <div className="field">
                  <label>Tags</label>
                  <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="comma-separated, e.g. monitoring, prod" />
                </div>
              </div>

              {/* ── Action buttons ── */}
              <div className="action-row">
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting
                    ? isEditing ? "Saving…" : "Submitting…"
                    : isEditing ? "Save Changes" : "Inject Event"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  ↺ Reset
                </button>
                <button type="button" className="btn btn-ghost" onClick={closeModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteConfirm && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div
            className="modal-dialog"
            style={{ maxWidth: 440, textAlign: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ justifyContent: "center" }}>
              <h3>Delete Event?</h3>
            </div>
            <p style={{ color: "var(--gray-500)", margin: "0 0 8px" }}>
              This will permanently remove the event and all related traces,
              cost breakdowns, security logs, and alerts.
            </p>
            <p style={{ fontWeight: 700, wordBreak: "break-all", margin: "0 0 20px" }}>
              {deleteConfirm}
            </p>
            <div className="action-row" style={{ justifyContent: "center" }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: "#c0392b" }}
                onClick={() => handleDelete(deleteConfirm)}
              >
                Yes, Delete
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recent Events ── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Recent Events</h3>
            <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>Select an event to inspect, edit, or delete.</p>
          </div>
        </div>
        <div className="list-grid">
          {events.length === 0 && (
            <div className="empty-state">No events yet. Inject one to get started.</div>
          )}
          {events.map((item) => (
            <div key={item.event_id} className="timeline-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <strong>{item.tool_name || "—"}</strong>
                  <div className="list-meta" style={{ fontSize: 12 }}>{item.event_id}</div>
                  <div className="metric-chip-row">
                    <span className="metric-chip"><b>{item.total_tokens ?? 0}</b> tokens</span>
                    <span className="metric-chip">$<b>{Number(item.total_cost || 0).toFixed(4)}</b></span>
                    <span className="metric-chip"><b>{item.latency_ms ?? 0}</b> ms</span>
                  </div>
                </div>
                <span
                  className={`status-pill ${(item.status || "").toLowerCase()}`}
                  style={{ flexShrink: 0, marginLeft: 12 }}
                >
                  {item.status || "—"}
                </span>
              </div>
              <div className="action-row" style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => openTrace(item.event_id)}>
                  Trace
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => openEditModal(item)}>
                  ✎ Edit
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ color: "var(--brand-primary)" }}
                  onClick={() => setDeleteConfirm(item.event_id)}
                >
                  ✕ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trace Modal ── */}
      {selectedTrace && (
        <div className="modal-backdrop" onClick={() => setSelectedTrace(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Trace Details</h3>
              <button type="button" className="btn-close" onClick={() => setSelectedTrace(null)}>
                ✕
              </button>
            </div>

            <div className="stack">
              <div className="trace-summary-bar">
                <div className="trace-summary-item" style={{ minWidth: 160, flex: 2 }}>
                  <span>Event ID</span>
                  <strong style={{ fontSize: 13, wordBreak: "break-all", fontFamily: "monospace" }}>
                    {selectedTrace.event.event_id}
                  </strong>
                </div>
                <div className="trace-summary-item">
                  <span>Total Cost</span>
                  <strong>${Number(selectedTrace.event.total_cost || 0).toFixed(4)}</strong>
                </div>
                <div className="trace-summary-item">
                  <span>Latency</span>
                  <strong>{selectedTrace.event.latency_ms ?? "—"} ms</strong>
                </div>
                <div className="trace-summary-item">
                  <span>Risk Score</span>
                  <strong className={`risk-${Number(selectedTrace.event.risk_score || 0) >= 7 ? "high" : Number(selectedTrace.event.risk_score || 0) >= 4 ? "med" : "low"}`}>
                    {Number(selectedTrace.event.risk_score || 0).toFixed(1)}
                  </strong>
                </div>
                {selectedTrace.event.tool_name && (
                  <div className="trace-summary-item">
                    <span>Tool</span>
                    <strong>{selectedTrace.event.tool_name}</strong>
                  </div>
                )}
                {selectedTrace.event.model_name && (
                  <div className="trace-summary-item">
                    <span>Model</span>
                    <strong>{selectedTrace.event.model_name}</strong>
                  </div>
                )}
              </div>

              {(selectedTrace.event.stages || []).length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>Stage</th>
                        <th>System</th>
                        <th>Status</th>
                        <th>Latency</th>
                        <th>Retry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedTrace.event.stages || []).map((stage) => (
                        <tr key={`${stage.stage_order}-${stage.stage_name}`}>
                          <td><span className="stage-num">{stage.stage_order ?? "·"}</span></td>
                          <td>{stage.stage_name}</td>
                          <td style={{ color: stage.system_name ? "var(--gray-700)" : "var(--gray-300)" }}>
                            {stage.system_name || "—"}
                          </td>
                          <td>
                            <span className={`status-pill ${(stage.status || "").toLowerCase()}`}>
                              {stage.status}
                            </span>
                          </td>
                          <td>{stage.stage_latency_ms} ms</td>
                          <td>{stage.retry_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedTrace.event.raw_usage_json &&
                Object.keys(selectedTrace.event.raw_usage_json).length > 0 && (
                  <details style={{ marginTop: 4 }}>
                    <summary
                      style={{
                        cursor: "pointer",
                        fontSize: 13,
                        color: "var(--gray-500)",
                        textTransform: "uppercase",
                        letterSpacing: "0.14em",
                        fontWeight: 600,
                      }}
                    >
                      Raw Usage (Audit)
                    </summary>
                    <pre
                      style={{
                        marginTop: 8,
                        padding: 14,
                        borderRadius: 14,
                        background: "var(--gray-50)",
                        border: "1px solid rgba(124,112,174,0.16)",
                        fontSize: 13,
                        overflow: "auto",
                        maxHeight: 220,
                      }}
                    >
                      {JSON.stringify(selectedTrace.event.raw_usage_json, null, 2)}
                    </pre>
                  </details>
                )}

              <div className="action-row">
                <button type="button" className="btn btn-ghost" onClick={() => setSelectedTrace(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TestEvent;
