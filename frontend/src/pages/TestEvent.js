import React, { useEffect, useState } from "react";
import {
  getTelemetryLogs,
  getTrace,
  postTelemetryEvent,
  uploadTelemetryExcel,
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
  input_data_count: "",
  output_data_count: "",
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
  const [importFile, setImportFile] = useState(null);
  const [importOrgId, setImportOrgId] = useState("");
  const [importProjectId, setImportProjectId] = useState("");
  const [importAsync, setImportAsync] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  const loadEvents = async () => {
    const response = await getTelemetryLogs({ limit: 12 });
    setEvents(response.data || []);
  };

  useEffect(() => {
    loadEvents().catch(() => setMessage("Unable to load data."));
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
      input_data_count: evt.input_data_count ?? "",
      output_data_count: evt.output_data_count ?? "",
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
        input_data_count:
          form.input_data_count === "" || form.input_data_count == null
            ? null
            : Number(form.input_data_count),
        output_data_count:
          form.output_data_count === "" || form.output_data_count == null
            ? null
            : Number(form.output_data_count),
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

  /* ── Excel import ── */
  const importExcel = async () => {
    if (!importFile) {
      setMessage("Pick an Excel file first.");
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("org_id", importOrgId || "default");
      if (importProjectId) fd.append("project_id", importProjectId);
      fd.append("async_ingest", String(importAsync));

      const res = await uploadTelemetryExcel(fd);
      setMessage(
        res.data?.status === "queued"
          ? `Import queued (${res.data.ingested_count} rows).`
          : `Import completed (${res.data.ingested_count} rows).`
      );
      setImportFile(null);
      await loadEvents();
    } catch {
      setMessage("Excel import failed. Check backend connectivity and file format.");
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
      ? { border: "1px solid #c0392b" }
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
          <div className="list-meta" style={{ marginTop: 10 }}>{message}</div>
        )}
      </section>

      {/* ── Excel import panel ── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Upload Excel Logs</h3>
            <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
              Upload an .xlsx file to ingest telemetry events and calculate costs server-side.
            </p>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Organization</label>
            <input value={importOrgId} onChange={(e) => setImportOrgId(e.target.value)} placeholder="default" />
          </div>
          <div className="field">
            <label>Project (default)</label>
            <input value={importProjectId} onChange={(e) => setImportProjectId(e.target.value)} placeholder="optional" />
          </div>
          <div className="field">
            <label>Async ingest</label>
            <select value={importAsync ? "true" : "false"} onChange={(e) => setImportAsync(e.target.value === "true")}>
              <option value="true">true (parallel)</option>
              <option value="false">false (sync)</option>
            </select>
          </div>
          <div className="field">
            <label>Excel file</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>
        <div className="action-row">
          <button type="button" className="btn btn-primary" onClick={importExcel}>
            Upload &amp; Ingest
          </button>
        </div>
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
              <p style={{ margin: 0, fontSize: 12, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                Required fields
              </p>
              <div className="form-grid">
                <div className="field">
                  <label>Organization *</label>
                  <input value={form.org_id} onChange={(e) => setForm({ ...form, org_id: e.target.value })} placeholder="e.g. org-acme" style={fieldError("org_id")} />
                  {validationErrors.org_id && <span style={{ color: "#c0392b", fontSize: 12 }}>{validationErrors.org_id}</span>}
                </div>
                <div className="field">
                  <label>Project *</label>
                  <input value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} placeholder="e.g. proj-main" style={fieldError("project_id")} />
                  {validationErrors.project_id && <span style={{ color: "#c0392b", fontSize: 12 }}>{validationErrors.project_id}</span>}
                </div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Tool *</label>
                  <input value={form.tool_name} onChange={(e) => setForm({ ...form, tool_name: e.target.value })} placeholder="e.g. LangChain, OpenAI" style={fieldError("tool_name")} />
                  {validationErrors.tool_name && <span style={{ color: "#c0392b", fontSize: 12 }}>{validationErrors.tool_name}</span>}
                </div>
                <div className="field">
                  <label>Model *</label>
                  <input value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} placeholder="e.g. gpt-4, claude-3" style={fieldError("model_name")} />
                  {validationErrors.model_name && <span style={{ color: "#c0392b", fontSize: 12 }}>{validationErrors.model_name}</span>}
                </div>
              </div>

              {/* ── Optional Details ── */}
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                Optional details
              </p>
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
                    <option value="success">success</option>
                    <option value="completed">completed</option>
                    <option value="failed">failed</option>
                    <option value="error">error</option>
                    <option value="timeout">timeout</option>
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
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                Metrics
              </p>
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
                <div className="field">
                  <label>Input Count</label>
                  <input type="number" min="0" value={form.input_data_count} onChange={(e) => setForm({ ...form, input_data_count: e.target.value })} placeholder="optional" />
                </div>
                <div className="field">
                  <label>Output Count</label>
                  <input type="number" min="0" value={form.output_data_count} onChange={(e) => setForm({ ...form, output_data_count: e.target.value })} placeholder="optional" />
                </div>
              </div>

              {/* ── Security & Tags ── */}
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                Security &amp; tags
              </p>
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
          <button type="button" className="btn btn-primary" onClick={openAddModal}>
            ＋ Add Event
          </button>
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
                  <div className="list-meta">
                    {item.event_id} &nbsp;·&nbsp; {item.total_tokens} tokens &nbsp;·&nbsp; $
                    {Number(item.total_cost || 0).toFixed(2)} &nbsp;·&nbsp; {item.latency_ms} ms
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
                  style={{ color: "#c0392b" }}
                  onClick={() => setDeleteConfirm(item.event_id)}
                >
                  ✕ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Selected Trace ── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Selected Trace</h3>
            <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>Request-level view of tokens, cost, latency, pipeline stages, and security.</p>
          </div>
          {selectedTrace && (
            <button type="button" className="btn btn-ghost" onClick={() => setSelectedTrace(null)}>
              ✕ Close
            </button>
          )}
        </div>

        {selectedTrace ? (
          <div className="stack">
            <div className="mini-grid">
              <div className="list-item">
                <strong>Event</strong>
                <div className="list-meta">{selectedTrace.event.event_id}</div>
              </div>
              <div className="list-item">
                <strong>Total Cost</strong>
                <div className="list-meta">${Number(selectedTrace.event.total_cost || 0).toFixed(2)}</div>
              </div>
              <div className="list-item">
                <strong>Latency</strong>
                <div className="list-meta">{selectedTrace.event.latency_ms} ms</div>
              </div>
              <div className="list-item">
                <strong>Risk Score</strong>
                <div className="list-meta">{Number(selectedTrace.event.risk_score || 0).toFixed(1)}</div>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
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
                      <td>{stage.stage_name}</td>
                      <td>{stage.system_name || "-"}</td>
                      <td>{stage.status}</td>
                      <td>{stage.stage_latency_ms} ms</td>
                      <td>{stage.retry_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="empty-state">Pick a recent event to inspect its full trace.</div>
        )}
      </section>
    </div>
  );
}

export default TestEvent;
