import React, { useEffect, useRef, useState } from "react";
import {
  getLookupEventStatuses,
  getTelemetryLogs,
  getTrace,
  postTelemetryEvent,
  updateTelemetryEvent,
  deleteTelemetryEvent,
} from "../api";

// ─────────────────────── constants ───────────────────────

const freshIds = () => ({
  event_id: `evt-${Date.now()}`,
  request_id: `req-${Date.now()}`,
  trace_id: `trace-${Date.now()}`,
});

const blankModelRow = () => ({
  model_name: "", provider: "", prompt_tokens: "", completion_tokens: "", cost: "",
});

const blankToolRow = () => ({
  tool_name: "", tool_type: "", vendor: "", cost: "",
});

const blankEvent = {
  org_id: "", project_id: "", user_id: "",
  component_name: "", service_type: "", execution_type: "",
  status: "success", latency_ms: "", input_data_size_mb: "", output_data_size_mb: "",
  infra_cost: "",
  contains_pii: false, pii_type: "", data_out_violation: false, tags: "", stages: [],
  models: [blankModelRow()],
  tools: [blankToolRow()],
};

// ─────────────────────── component ───────────────────────

function TestEvent() {
  const formRef = useRef(null);

  /* ── Event state ── */
  const [form, setForm] = useState({
    ...blankEvent,
    models: [blankModelRow()],
    tools: [blankToolRow()],
  });
  const [events, setEvents] = useState([]);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [eventStatuses, setEventStatuses] = useState([]);

  // ─────────────────────── data loaders ───────────────────────

  const loadEvents = async () => {
    const res = await getTelemetryLogs({ limit: 12 });
    setEvents(res.data || []);
  };

  useEffect(() => {
    loadEvents().catch(() => setMessage("Unable to load data."));
    getLookupEventStatuses().then((r) => setEventStatuses(r.data || [])).catch(() => {});
  }, []);

  // ─────────────────────── single event helpers ───────────────────────

  const cancelEdit = () => {
    setEditingEventId(null);
    setForm({ ...blankEvent, models: [blankModelRow()], tools: [blankToolRow()] });
    setValidationErrors({});
  };

  const openEditModal = (evt) => {
    setEditingEventId(evt.event_id);
    setValidationErrors({});
    const metaModels =
      evt.metadata_json?.models ||
      evt.raw_usage_json?.models ||
      [];
    const seedModels = metaModels.length
      ? metaModels.map((m) => ({
          model_name: m.model_name || "",
          provider: m.provider || "",
          prompt_tokens: m.prompt_tokens ?? m.input_tokens ?? "",
          completion_tokens: m.completion_tokens ?? m.output_tokens ?? "",
          cost: m.cost ?? "",
        }))
      : [{
          model_name: evt.model_name || "",
          provider: evt.provider || "",
          prompt_tokens: evt.prompt_tokens ?? "",
          completion_tokens: evt.completion_tokens ?? "",
          cost: "",
        }];
    const externalTools = evt.external_tools || evt.metadata_json?.tools || [];
    const seedTools = externalTools.length
      ? externalTools.map((t) => ({
          tool_name: t.tool_name || t.name || "",
          tool_type: t.tool_type || "",
          vendor: t.vendor || "",
          cost: t.cost ?? "",
        }))
      : [{ tool_name: evt.tool_name || "", tool_type: "", vendor: "", cost: "" }];
    setForm({
      ...blankEvent,
      event_id: evt.event_id, request_id: evt.request_id || "",
      trace_id: evt.trace_id || "", org_id: evt.org_id || "",
      project_id: evt.project_id || "", user_id: evt.user_id || "",
      component_name: evt.component_name || "",
      service_type: evt.service_type || "", execution_type: evt.execution_type || "",
      status: evt.status || "success", latency_ms: evt.latency_ms ?? "",
      input_data_size_mb: evt.input_data_size_mb ?? "",
      output_data_size_mb: evt.output_data_size_mb ?? "",
      infra_cost: evt.infra_cost ?? "", pii_type: evt.pii_type || "",
      tags: Array.isArray(evt.tags) ? evt.tags.join(", ") : evt.tags || "",
      stages: evt.stages || [],
      models: seedModels,
      tools: seedTools,
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const validate = () => {
    const errors = {};
    if (!form.org_id) errors.org_id = "Organization is required";
    if (!form.project_id) errors.project_id = "Project is required";
    const validModels = (form.models || []).filter((m) => m.model_name?.trim());
    if (validModels.length === 0) errors.models = "At least one model is required";
    const validTools = (form.tools || []).filter((t) => t.tool_name?.trim());
    if (validTools.length === 0) errors.tools = "At least one tool is required";
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // dynamic row helpers
  const updateModelRow = (idx, patch) => {
    setForm((f) => {
      const next = [...f.models];
      next[idx] = { ...next[idx], ...patch };
      return { ...f, models: next };
    });
  };
  const addModelRow = () =>
    setForm((f) => ({ ...f, models: [...f.models, blankModelRow()] }));
  const removeModelRow = (idx) =>
    setForm((f) => ({
      ...f,
      models: f.models.length > 1 ? f.models.filter((_, i) => i !== idx) : f.models,
    }));

  const updateToolRow = (idx, patch) => {
    setForm((f) => {
      const next = [...f.tools];
      next[idx] = { ...next[idx], ...patch };
      return { ...f, tools: next };
    });
  };
  const addToolRow = () =>
    setForm((f) => ({ ...f, tools: [...f.tools, blankToolRow()] }));
  const removeToolRow = (idx) =>
    setForm((f) => ({
      ...f,
      tools: f.tools.length > 1 ? f.tools.filter((_, i) => i !== idx) : f.tools,
    }));

  const submitEvent = async (e) => {
    e.preventDefault();
    if (!editingEventId && !validate()) return;
    setSubmitting(true);
    try {
      const ids = editingEventId ? {} : freshIds();
      const validModels = (form.models || []).filter((m) => m.model_name?.trim());
      const validTools = (form.tools || []).filter((t) => t.tool_name?.trim());
      const primaryModel = validModels[0] || {};
      const primaryTool = validTools[0] || {};
      const totalPrompt = validModels.reduce(
        (s, m) => s + (Number(m.prompt_tokens) || 0),
        0,
      );
      const totalCompletion = validModels.reduce(
        (s, m) => s + (Number(m.completion_tokens) || 0),
        0,
      );
      const modelsArr = validModels.map((m) => ({
        model_name: m.model_name.trim(),
        provider: m.provider || null,
        prompt_tokens: Number(m.prompt_tokens) || 0,
        completion_tokens: Number(m.completion_tokens) || 0,
        cost: m.cost === "" ? null : Number(m.cost) || 0,
      }));
      const toolsArr = validTools.map((t) => ({
        tool_name: t.tool_name.trim(),
        tool_type: t.tool_type || null,
        vendor: t.vendor || null,
        cost: t.cost === "" ? 0 : Number(t.cost) || 0,
      }));
      const payload = {
        ...ids,
        org_id: form.org_id,
        project_id: form.project_id,
        user_id: form.user_id || null,
        tool_name: primaryTool.tool_name || "",
        provider: primaryModel.provider || null,
        model_name: primaryModel.model_name || null,
        component_name: form.component_name || null,
        service_type: form.service_type || null,
        execution_type: form.execution_type || null,
        status: form.status,
        input_data_size_mb: Number(form.input_data_size_mb) || 0,
        output_data_size_mb: Number(form.output_data_size_mb) || 0,
        latency_ms: Number(form.latency_ms) || 0,
        prompt_tokens: totalPrompt,
        completion_tokens: totalCompletion,
        infra_cost: Number(form.infra_cost) || 0,
        contains_pii: !!form.contains_pii,
        pii_type: form.pii_type || null,
        data_out_violation: !!form.data_out_violation,
        external_tools: toolsArr.map((t) => ({ name: t.tool_name, cost: t.cost })),
        metadata_json: { models: modelsArr, tools: toolsArr },
        stages: form.stages || [],
        tags: typeof form.tags === "string"
          ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : form.tags,
      };
      if (editingEventId) {
        await updateTelemetryEvent(editingEventId, payload);
        setMessage(`Event ${editingEventId} updated successfully.`);
      } else {
        await postTelemetryEvent(payload);
        setMessage(
          `Telemetry event ingested · ${modelsArr.length} model${modelsArr.length === 1 ? "" : "s"}, ${toolsArr.length} tool${toolsArr.length === 1 ? "" : "s"}.`,
        );
      }
      cancelEdit();
      await loadEvents();
    } catch {
      setMessage(editingEventId
        ? "Update failed. Check backend connectivity."
        : "Telemetry ingest failed. Check backend connectivity.");
    } finally {
      setSubmitting(false);
    }
  };

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

  const openTrace = async (eventId) => {
    const res = await getTrace(eventId);
    setSelectedTrace(res.data);
  };

  const isEditing = !!editingEventId;
  const fieldError = (name) => validationErrors[name] ? { borderColor: "var(--brand-primary)" } : {};

  // ─────────────────────── render ───────────────────────

  return (
    <div className="page-shell">
      {/* ── Header ── */}
      <section className="panel" style={{ padding: "18px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Event Tracing &amp; Simulator</h2>
            <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 14 }}>
              Inject telemetry events with structured inputs for multiple models and tools — track usage,
              cost, and performance for an entire multi-model, multi-tool project from a single event.
            </p>
          </div>
        </div>

        {message && <div className="feedback-msg" style={{ marginTop: 10 }}>{message}</div>}
      </section>

      {/* ══════════════════ INJECT TELEMETRY EVENT ══════════════════ */}
      <>
          {deleteConfirm && (
            <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
              <div className="modal-dialog" style={{ maxWidth: 440, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header" style={{ justifyContent: "center" }}>
                  <h3>Delete Event?</h3>
                </div>
                <p style={{ color: "var(--gray-500)", margin: "0 0 8px" }}>
                  This will permanently remove the event and all related cost, security, and alert records.
                </p>
                <p style={{ fontWeight: 700, wordBreak: "break-all", margin: "0 0 20px" }}>{deleteConfirm}</p>
                <div className="action-row" style={{ justifyContent: "center" }}>
                  <button type="button" className="btn btn-primary" style={{ background: "#c0392b" }} onClick={() => handleDelete(deleteConfirm)}>
                    Yes, Delete
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Inject / Edit Form — inline ── */}
          <section className="panel" ref={formRef}>
            <div className="section-head">
              <div>
                <h3>{isEditing ? "Edit Event" : "Inject Telemetry Event"}</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  {isEditing
                    ? "Modify the fields below and save changes."
                    : "Fill in fields below to inject a new telemetry event into the governance pipeline."}
                </p>
              </div>
              {isEditing && (
                <button type="button" className="btn btn-ghost" onClick={cancelEdit}>✕ Cancel Edit</button>
              )}
            </div>

            {isEditing && (
              <div className="tool-cost-chip" style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 12 }}>
                Editing: <strong style={{ color: "var(--gray-700)" }}>{editingEventId}</strong>
              </div>
            )}

            <form className="stack" onSubmit={submitEvent}>
              <p className="form-section-label">Project context</p>
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
                <div className="field">
                  <label>User ID</label>
                  <input value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} placeholder="e.g. analyst-01" />
                </div>
                <div className="field">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {(eventStatuses.length ? eventStatuses : ["success", "error", "partial"]).map((s) => (
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
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <p className="form-section-label" style={{ margin: 0 }}>
                  Models <span style={{ color: "var(--gray-500)", fontWeight: 400, fontSize: 12 }}>· add 5 or more — usage rolls up under one project</span>
                </p>
                <button type="button" className="btn btn-secondary" onClick={addModelRow}>＋ Add Model</button>
              </div>
              {validationErrors.models && <span className="field-error">{validationErrors.models}</span>}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {form.models.map((m, idx) => (
                  <div key={`m-${idx}`} style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <strong style={{ fontSize: 13 }}>Model #{idx + 1}{idx === 0 && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--gray-500)", fontWeight: 400 }}>(primary)</span>}</strong>
                      {form.models.length > 1 && (
                        <button type="button" className="btn btn-ghost" style={{ color: "var(--brand-primary)", fontSize: 12, padding: "2px 8px" }} onClick={() => removeModelRow(idx)}>✕ Remove</button>
                      )}
                    </div>
                    <div className="form-grid">
                      <div className="field">
                        <label>Model Name {idx === 0 && "*"}</label>
                        <input value={m.model_name} onChange={(e) => updateModelRow(idx, { model_name: e.target.value })} placeholder="e.g. gpt-4o, claude-3-5-sonnet" />
                      </div>
                      <div className="field">
                        <label>Provider</label>
                        <input value={m.provider} onChange={(e) => updateModelRow(idx, { provider: e.target.value })} placeholder="e.g. openai, anthropic, google" />
                      </div>
                      <div className="field">
                        <label>Prompt Tokens</label>
                        <input type="number" min="0" value={m.prompt_tokens} onChange={(e) => updateModelRow(idx, { prompt_tokens: e.target.value })} placeholder="0" />
                      </div>
                      <div className="field">
                        <label>Completion Tokens</label>
                        <input type="number" min="0" value={m.completion_tokens} onChange={(e) => updateModelRow(idx, { completion_tokens: e.target.value })} placeholder="0" />
                      </div>
                      <div className="field">
                        <label>Cost ($)</label>
                        <input type="number" step="0.000001" min="0" value={m.cost} onChange={(e) => updateModelRow(idx, { cost: e.target.value })} placeholder="auto" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <p className="form-section-label" style={{ margin: 0 }}>
                  Tools <span style={{ color: "var(--gray-500)", fontWeight: 400, fontSize: 12 }}>· add 5 or more — costs aggregate per event</span>
                </p>
                <button type="button" className="btn btn-secondary" onClick={addToolRow}>＋ Add Tool</button>
              </div>
              {validationErrors.tools && <span className="field-error">{validationErrors.tools}</span>}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {form.tools.map((t, idx) => (
                  <div key={`t-${idx}`} style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <strong style={{ fontSize: 13 }}>Tool #{idx + 1}{idx === 0 && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--gray-500)", fontWeight: 400 }}>(primary)</span>}</strong>
                      {form.tools.length > 1 && (
                        <button type="button" className="btn btn-ghost" style={{ color: "var(--brand-primary)", fontSize: 12, padding: "2px 8px" }} onClick={() => removeToolRow(idx)}>✕ Remove</button>
                      )}
                    </div>
                    <div className="form-grid">
                      <div className="field">
                        <label>Tool Name {idx === 0 && "*"}</label>
                        <input value={t.tool_name} onChange={(e) => updateToolRow(idx, { tool_name: e.target.value })} placeholder="e.g. web-search, code-executor" />
                      </div>
                      <div className="field">
                        <label>Tool Type</label>
                        <input value={t.tool_type} onChange={(e) => updateToolRow(idx, { tool_type: e.target.value })} placeholder="e.g. retrieval, code, browser" />
                      </div>
                      <div className="field">
                        <label>Vendor</label>
                        <input value={t.vendor} onChange={(e) => updateToolRow(idx, { vendor: e.target.value })} placeholder="e.g. OpenAI, custom" />
                      </div>
                      <div className="field">
                        <label>Cost ($)</label>
                        <input type="number" step="0.000001" min="0" value={t.cost} onChange={(e) => updateToolRow(idx, { cost: e.target.value })} placeholder="0.00" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="form-section-label">Performance metrics</p>
              <div className="form-grid">
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

              <div className="action-row">
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? (isEditing ? "Saving…" : "Submitting…") : (isEditing ? "Save Changes" : "Inject Event")}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setValidationErrors({}); setForm({ ...blankEvent, models: [blankModelRow()], tools: [blankToolRow()] }); }}>↺ Reset</button>
                {isEditing && <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>}
              </div>
            </form>
          </section>

          {/* ── Recent Events ── */}
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>Recent Events</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  Select an event to inspect, edit, or delete.
                </p>
              </div>
            </div>
            <div className="list-grid">
              {events.length === 0 && <div className="empty-state">No events yet. Inject one above to get started.</div>}
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
                    <span className={`status-pill ${(item.status || "").toLowerCase()}`} style={{ flexShrink: 0, marginLeft: 12 }}>
                      {item.status || "—"}
                    </span>
                  </div>
                  <div className="action-row" style={{ marginTop: 12 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => openTrace(item.event_id)}>Trace</button>
                    <button type="button" className="btn btn-secondary" onClick={() => openEditModal(item)}>✎ Edit</button>
                    <button type="button" className="btn btn-ghost" style={{ color: "var(--brand-primary)" }} onClick={() => setDeleteConfirm(item.event_id)}>✕ Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {selectedTrace && (
            <div className="modal-backdrop" onClick={() => setSelectedTrace(null)}>
              <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Trace Details</h3>
                  <button type="button" className="btn-close" onClick={() => setSelectedTrace(null)}>✕</button>
                </div>
                <div className="stack">
                  <div className="trace-summary-bar">
                    <div className="trace-summary-item" style={{ minWidth: 160, flex: 2 }}>
                      <span>Event ID</span>
                      <strong style={{ fontSize: 13, wordBreak: "break-all", fontFamily: "monospace" }}>{selectedTrace.event.event_id}</strong>
                    </div>
                    {[
                      ["Total Cost", `$${Number(selectedTrace.event.total_cost || 0).toFixed(4)}`],
                      ["Latency", `${selectedTrace.event.latency_ms ?? "—"} ms`],
                      ["Risk Score", Number(selectedTrace.event.risk_score || 0).toFixed(1)],
                    ].map(([l, v]) => (
                      <div key={l} className="trace-summary-item"><span>{l}</span><strong>{v}</strong></div>
                    ))}
                    {selectedTrace.event.tool_name && <div className="trace-summary-item"><span>Tool</span><strong>{selectedTrace.event.tool_name}</strong></div>}
                    {selectedTrace.event.model_name && <div className="trace-summary-item"><span>Model</span><strong>{selectedTrace.event.model_name}</strong></div>}
                  </div>
                  {(selectedTrace.event.stages || []).length > 0 && (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>#</th><th>Stage</th><th>System</th><th>Status</th><th>Latency</th><th>Retry</th></tr></thead>
                        <tbody>
                          {selectedTrace.event.stages.map((s) => (
                            <tr key={`${s.stage_order}-${s.stage_name}`}>
                              <td><span className="stage-num">{s.stage_order ?? "·"}</span></td>
                              <td>{s.stage_name}</td>
                              <td style={{ color: s.system_name ? "var(--gray-700)" : "var(--gray-300)" }}>{s.system_name || "—"}</td>
                              <td><span className={`status-pill ${(s.status || "").toLowerCase()}`}>{s.status}</span></td>
                              <td>{s.stage_latency_ms} ms</td>
                              <td>{s.retry_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {selectedTrace.event.raw_usage_json && Object.keys(selectedTrace.event.raw_usage_json).length > 0 && (
                    <details style={{ marginTop: 4 }}>
                      <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600 }}>Raw Usage (Audit)</summary>
                      <pre style={{ marginTop: 8, padding: 14, borderRadius: 14, background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.16)", fontSize: 13, overflow: "auto", maxHeight: 220 }}>
                        {JSON.stringify(selectedTrace.event.raw_usage_json, null, 2)}
                      </pre>
                    </details>
                  )}
                  <div className="action-row">
                    <button type="button" className="btn btn-ghost" onClick={() => setSelectedTrace(null)}>Close</button>
                  </div>
                </div>
              </div>
            </div>
          )}
      </>
    </div>
  );
}

export default TestEvent;
