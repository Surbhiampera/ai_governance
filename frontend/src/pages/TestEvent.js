import React, { useEffect, useRef, useState } from "react";
import {
  getLookupEventStatuses,
  getTelemetryLogs,
  getTrace,
  postTelemetryEvent,
  updateTelemetryEvent,
  deleteTelemetryEvent,
  controlIngestTrace,
  getControlTraceDetail,
  getModelPricing,
  createModelPricing,
  deleteModelPricing,
  getTools,
  registerTool,
} from "../api";

// ─────────────────────── constants ───────────────────────

const freshIds = () => ({
  event_id: `evt-${Date.now()}`,
  request_id: `req-${Date.now()}`,
  trace_id: `trace-${Date.now()}`,
});

const blankEvent = {
  org_id: "", project_id: "", user_id: "", tool_name: "", provider: "",
  model_name: "", component_name: "", service_type: "", execution_type: "",
  status: "success", latency_ms: "", input_data_size_mb: "", output_data_size_mb: "",
  prompt_tokens: "", completion_tokens: "", infra_cost: "",
  contains_pii: false, pii_type: "", data_out_violation: false, tags: "", stages: [],
};

const blankModel = () => ({
  model_name: "", provider: "", input_tokens: "", output_tokens: "", cost: "", latency_ms: "",
});

const blankTool = () => ({
  tool_name: "", tool_type: "", invocation_count: "1", execution_time_ms: "", cost: "",
});

const blankTraceForm = {
  org_id: "", project_id: "", user_id: "", trace_id: "", workflow_name: "",
  status: "success", tags: "", contains_pii: false, pii_type: "",
  data_out_violation: false, input_data_size_mb: "", output_data_size_mb: "",
};

const blankAddModel = {
  provider: "", model_name: "", input_cost_per_1k: "", output_cost_per_1k: "", currency: "USD",
};

const blankAddTool = {
  tool_name: "", tool_type: "", vendor: "", cost_model: "per_request", base_cost: "",
};

const COST_MODELS = ["per_request", "per_token", "per_second", "fixed", "custom"];

// ─────────────────────── component ───────────────────────

function TestEvent() {
  const [activeTab, setActiveTab] = useState("single");
  const formRef = useRef(null);

  /* ── Single event state ── */
  const [form, setForm] = useState({ ...blankEvent });
  const [events, setEvents] = useState([]);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [eventStatuses, setEventStatuses] = useState([]);

  /* ── Multi-model trace state ── */
  const [traceForm, setTraceForm] = useState({ ...blankTraceForm });
  const [traceModels, setTraceModels] = useState([blankModel()]);
  const [traceTools, setTraceTools] = useState([]);
  const [traceModalOpen, setTraceModalOpen] = useState(false);
  const [traceSubmitting, setTraceSubmitting] = useState(false);
  const [traceResult, setTraceResult] = useState(null);
  const [traceValidationErrors, setTraceValidationErrors] = useState({});
  const [traceDetailId, setTraceDetailId] = useState("");
  const [traceDetail, setTraceDetail] = useState(null);
  const [traceDetailLoading, setTraceDetailLoading] = useState(false);

  /* ── Model & Tool config state ── */
  const [pricing, setPricing] = useState([]);
  const [registeredTools, setRegisteredTools] = useState([]);
  const [configMsg, setConfigMsg] = useState("");
  const [addModelForm, setAddModelForm] = useState({ ...blankAddModel });
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [addModelSubmitting, setAddModelSubmitting] = useState(false);
  const [addModelErrors, setAddModelErrors] = useState({});
  const [addToolForm, setAddToolForm] = useState({ ...blankAddTool });
  const [addToolOpen, setAddToolOpen] = useState(false);
  const [addToolSubmitting, setAddToolSubmitting] = useState(false);
  const [addToolErrors, setAddToolErrors] = useState({});
  const [deleteModelConfirm, setDeleteModelConfirm] = useState(null);

  // ─────────────────────── data loaders ───────────────────────

  const loadEvents = async () => {
    const res = await getTelemetryLogs({ limit: 12 });
    setEvents(res.data || []);
  };

  const loadConfig = async () => {
    try {
      const [pricingRes, toolsRes] = await Promise.all([getModelPricing(), getTools()]);
      setPricing(pricingRes.data || []);
      setRegisteredTools(toolsRes.data || []);
    } catch {
      setConfigMsg("Unable to load model/tool registry. Check backend connectivity.");
    }
  };

  useEffect(() => {
    loadEvents().catch(() => setMessage("Unable to load data."));
    getLookupEventStatuses().then((r) => setEventStatuses(r.data || [])).catch(() => {});
    loadConfig();
  }, []);

  // ─────────────────────── single event helpers ───────────────────────

  const cancelEdit = () => {
    setEditingEventId(null);
    setForm({ ...blankEvent });
    setValidationErrors({});
  };

  const openEditModal = (evt) => {
    setEditingEventId(evt.event_id);
    setValidationErrors({});
    setForm({
      ...blankEvent,
      event_id: evt.event_id, request_id: evt.request_id || "",
      trace_id: evt.trace_id || "", org_id: evt.org_id || "",
      project_id: evt.project_id || "", user_id: evt.user_id || "",
      tool_name: evt.tool_name || "", provider: evt.provider || "",
      model_name: evt.model_name || "", component_name: evt.component_name || "",
      service_type: evt.service_type || "", execution_type: evt.execution_type || "",
      status: evt.status || "success", latency_ms: evt.latency_ms ?? "",
      input_data_size_mb: evt.input_data_size_mb ?? "",
      output_data_size_mb: evt.output_data_size_mb ?? "",
      prompt_tokens: evt.prompt_tokens ?? "", completion_tokens: evt.completion_tokens ?? "",
      infra_cost: evt.infra_cost ?? "", pii_type: evt.pii_type || "",
      tags: Array.isArray(evt.tags) ? evt.tags.join(", ") : evt.tags || "",
      stages: evt.stages || [],
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const validate = () => {
    const errors = {};
    if (!form.org_id) errors.org_id = "Organization is required";
    if (!form.tool_name) errors.tool_name = "Tool is required";
    if (!form.project_id) errors.project_id = "Project is required";
    if (!form.model_name?.trim()) errors.model_name = "Model is required";
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitEvent = async (e) => {
    e.preventDefault();
    if (!editingEventId && !validate()) return;
    setSubmitting(true);
    try {
      const ids = editingEventId ? {} : freshIds();
      const payload = {
        ...form, ...ids,
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

  // ─────────────────────── multi-model trace helpers ───────────────────────

  const addModel = () => setTraceModels([...traceModels, blankModel()]);
  const removeModel = (i) => setTraceModels(traceModels.filter((_, idx) => idx !== i));
  const updateModel = (i, f, v) => setTraceModels(traceModels.map((m, idx) => idx === i ? { ...m, [f]: v } : m));

  const addTool = () => setTraceTools([...traceTools, blankTool()]);
  const removeTool = (i) => setTraceTools(traceTools.filter((_, idx) => idx !== i));
  const updateTool = (i, f, v) => setTraceTools(traceTools.map((t, idx) => idx === i ? { ...t, [f]: v } : t));

  const openTraceModal = () => {
    setTraceForm({ ...blankTraceForm });
    setTraceModels([blankModel()]);
    setTraceTools([]);
    setTraceValidationErrors({});
    setTraceModalOpen(true);
  };
  const closeTraceModal = () => { setTraceModalOpen(false); setTraceValidationErrors({}); };

  const validateTrace = () => {
    const errors = {};
    if (!traceForm.org_id) errors.org_id = "Organization is required";
    if (!traceForm.project_id) errors.project_id = "Project is required";
    if (!traceModels.filter((m) => m.model_name.trim()).length) errors.models = "At least one model is required";
    setTraceValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitTrace = async (e) => {
    e.preventDefault();
    if (!validateTrace()) return;
    setTraceSubmitting(true);
    try {
      const payload = {
        org_id: traceForm.org_id,
        project_id: traceForm.project_id || undefined,
        user_id: traceForm.user_id || undefined,
        trace_id: traceForm.trace_id || `trace-${Date.now()}`,
        event_id: `evt-${Date.now()}`,
        workflow_name: traceForm.workflow_name || undefined,
        status: traceForm.status,
        contains_pii: traceForm.contains_pii,
        pii_type: traceForm.pii_type || undefined,
        data_out_violation: traceForm.data_out_violation,
        input_data_size_mb: Number(traceForm.input_data_size_mb) || 0,
        output_data_size_mb: Number(traceForm.output_data_size_mb) || 0,
        tags: traceForm.tags ? traceForm.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        models: traceModels.filter((m) => m.model_name.trim()).map((m) => ({
          model_name: m.model_name, provider: m.provider || undefined,
          input_tokens: Number(m.input_tokens) || 0, output_tokens: Number(m.output_tokens) || 0,
          cost: m.cost !== "" && m.cost !== undefined ? Number(m.cost) : undefined,
          latency_ms: Number(m.latency_ms) || 0,
        })),
        tools: traceTools.filter((t) => t.tool_name.trim()).map((t) => ({
          tool_name: t.tool_name, tool_type: t.tool_type || undefined,
          invocation_count: Number(t.invocation_count) || 1,
          execution_time_ms: Number(t.execution_time_ms) || 0,
          cost: t.cost !== "" && t.cost !== undefined ? Number(t.cost) : undefined,
        })),
      };
      const res = await controlIngestTrace(payload);
      setTraceResult(res.data);
      setTraceDetailId(res.data.trace_id);
      setMessage(`Unified trace ingested: ${res.data.event_id} (${res.data.model_count} models, ${res.data.tool_count} tools)`);
      closeTraceModal();
    } catch {
      setMessage("Trace injection failed. Check backend connectivity.");
    } finally {
      setTraceSubmitting(false);
    }
  };

  const loadTraceDetail = async () => {
    if (!traceDetailId.trim()) return;
    setTraceDetailLoading(true);
    try {
      const res = await getControlTraceDetail(traceDetailId.trim());
      setTraceDetail(res.data);
    } catch {
      setMessage("Trace detail fetch failed. Check the trace ID.");
    } finally {
      setTraceDetailLoading(false);
    }
  };

  const traceFieldError = (name) => traceValidationErrors[name] ? { borderColor: "var(--brand-primary)" } : {};

  // ─────────────────────── model/tool config helpers ───────────────────────

  const validateAddModel = () => {
    const errors = {};
    if (!addModelForm.provider.trim()) errors.provider = "Provider is required";
    if (!addModelForm.model_name.trim()) errors.model_name = "Model name is required";
    if (addModelForm.input_cost_per_1k !== "" && isNaN(Number(addModelForm.input_cost_per_1k)))
      errors.input_cost_per_1k = "Must be a number";
    if (addModelForm.output_cost_per_1k !== "" && isNaN(Number(addModelForm.output_cost_per_1k)))
      errors.output_cost_per_1k = "Must be a number";
    setAddModelErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitAddModel = async (e) => {
    e.preventDefault();
    if (!validateAddModel()) return;
    setAddModelSubmitting(true);
    try {
      await createModelPricing({
        provider: addModelForm.provider.trim(),
        model_name: addModelForm.model_name.trim(),
        input_cost_per_1k: Number(addModelForm.input_cost_per_1k) || 0,
        output_cost_per_1k: Number(addModelForm.output_cost_per_1k) || 0,
        currency: addModelForm.currency || "USD",
      });
      setConfigMsg(`Model "${addModelForm.model_name}" registered successfully.`);
      setAddModelForm({ ...blankAddModel });
      setAddModelOpen(false);
      await loadConfig();
    } catch {
      setConfigMsg("Failed to register model. Check if this provider/model combination already exists.");
    } finally {
      setAddModelSubmitting(false);
    }
  };

  const handleDeleteModel = async (id) => {
    try {
      await deleteModelPricing(id);
      setConfigMsg("Model pricing entry removed.");
      setDeleteModelConfirm(null);
      await loadConfig();
    } catch {
      setConfigMsg("Delete failed.");
    }
  };

  const validateAddTool = () => {
    const errors = {};
    if (!addToolForm.tool_name.trim()) errors.tool_name = "Tool name is required";
    if (addToolForm.base_cost !== "" && isNaN(Number(addToolForm.base_cost)))
      errors.base_cost = "Must be a number";
    setAddToolErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitAddTool = async (e) => {
    e.preventDefault();
    if (!validateAddTool()) return;
    setAddToolSubmitting(true);
    try {
      await registerTool({
        tool_name: addToolForm.tool_name.trim(),
        tool_type: addToolForm.tool_type || undefined,
        vendor: addToolForm.vendor || undefined,
        cost_model: addToolForm.cost_model,
        base_cost: Number(addToolForm.base_cost) || 0,
      });
      setConfigMsg(`Tool "${addToolForm.tool_name}" registered successfully.`);
      setAddToolForm({ ...blankAddTool });
      setAddToolOpen(false);
      await loadConfig();
    } catch {
      setConfigMsg("Failed to register tool. Check if the tool name already exists.");
    } finally {
      setAddToolSubmitting(false);
    }
  };

  const modelFieldError = (name) => addModelErrors[name] ? { borderColor: "var(--brand-primary)" } : {};
  const toolFieldError = (name) => addToolErrors[name] ? { borderColor: "var(--brand-primary)" } : {};

  // ─────────────────────── render ───────────────────────

  return (
    <div className="page-shell">
      {/* ── Header ── */}
      <section className="panel" style={{ padding: "18px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Event Tracing &amp; Simulator</h2>
            <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 14 }}>
              Inject single events or unified multi-model traces. Configure models and tools inline.
            </p>
          </div>
          {activeTab === "trace" && (
            <div className="action-row">
              <button type="button" className="btn btn-primary" onClick={openTraceModal}>
                ＋ Inject Unified Trace
              </button>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 4, marginTop: 16, borderBottom: "1px solid var(--gray-200)" }}>
          {[
            { key: "single", label: "Single Event" },
            { key: "trace", label: "Multi-Model Trace" },
            { key: "config", label: "Model & Tool Config" },
          ].map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setActiveTab(key)} style={{
              padding: "8px 18px", border: "none", background: "none", cursor: "pointer",
              fontSize: 14, fontWeight: activeTab === key ? 700 : 400,
              color: activeTab === key ? "var(--brand-primary)" : "var(--gray-500)",
              borderBottom: activeTab === key ? "2px solid var(--brand-primary)" : "2px solid transparent",
              marginBottom: -1,
            }}>
              {label}
            </button>
          ))}
        </div>

        {message && <div className="feedback-msg" style={{ marginTop: 10 }}>{message}</div>}
      </section>

      {/* ══════════════════ SINGLE EVENT TAB ══════════════════ */}
      {activeTab === "single" && (
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
                <div className="field">
                  <label>Tool *</label>
                  <input value={form.tool_name} onChange={(e) => setForm({ ...form, tool_name: e.target.value })} placeholder="e.g. LangChain, OpenAI" style={fieldError("tool_name")} />
                  {validationErrors.tool_name && <span className="field-error">{validationErrors.tool_name}</span>}
                </div>
                <div className="field">
                  <label>Model *</label>
                  <input value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} placeholder="e.g. gpt-4o, claude-3-5-sonnet" style={fieldError("model_name")} />
                  {validationErrors.model_name && <span className="field-error">{validationErrors.model_name}</span>}
                </div>
              </div>

              <p className="form-section-label">Optional details</p>
              <div className="form-grid">
                <div className="field">
                  <label>Provider</label>
                  <input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="e.g. openai, anthropic" />
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
                <div className="field">
                  <label>User ID</label>
                  <input value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} placeholder="e.g. analyst-01" />
                </div>
              </div>

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
                <button type="button" className="btn btn-secondary" onClick={() => { setValidationErrors({}); setForm({ ...blankEvent }); }}>↺ Reset</button>
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
      )}

      {/* ══════════════════ MULTI-MODEL TRACE TAB ══════════════════ */}
      {activeTab === "trace" && (
        <>
          {traceModalOpen && (
            <div className="modal-backdrop" onClick={closeTraceModal}>
              <div className="modal-dialog" style={{ maxWidth: 780 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Inject Unified Multi-Model Trace</h3>
                  <button type="button" className="btn-close" onClick={closeTraceModal}>✕</button>
                </div>
                <form className="stack" onSubmit={submitTrace}>
                  <p className="form-section-label">Trace context</p>
                  <div className="form-grid">
                    <div className="field">
                      <label>Organization *</label>
                      <input value={traceForm.org_id} onChange={(e) => setTraceForm({ ...traceForm, org_id: e.target.value })} placeholder="e.g. org-acme" style={traceFieldError("org_id")} />
                      {traceValidationErrors.org_id && <span className="field-error">{traceValidationErrors.org_id}</span>}
                    </div>
                    <div className="field">
                      <label>Project *</label>
                      <input value={traceForm.project_id} onChange={(e) => setTraceForm({ ...traceForm, project_id: e.target.value })} placeholder="e.g. proj-chatbot" style={traceFieldError("project_id")} />
                      {traceValidationErrors.project_id && <span className="field-error">{traceValidationErrors.project_id}</span>}
                    </div>
                    <div className="field">
                      <label>Workflow Name</label>
                      <input value={traceForm.workflow_name} onChange={(e) => setTraceForm({ ...traceForm, workflow_name: e.target.value })} placeholder="e.g. rag-pipeline" />
                    </div>
                    <div className="field">
                      <label>Trace ID</label>
                      <input value={traceForm.trace_id} onChange={(e) => setTraceForm({ ...traceForm, trace_id: e.target.value })} placeholder="auto-generated if empty" />
                    </div>
                    <div className="field">
                      <label>User ID</label>
                      <input value={traceForm.user_id} onChange={(e) => setTraceForm({ ...traceForm, user_id: e.target.value })} placeholder="e.g. analyst-01" />
                    </div>
                    <div className="field">
                      <label>Status</label>
                      <select value={traceForm.status} onChange={(e) => setTraceForm({ ...traceForm, status: e.target.value })}>
                        {(eventStatuses.length ? eventStatuses : ["success", "error", "partial"]).map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <p className="form-section-label" style={{ margin: 0 }}>Models *</p>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: "4px 12px" }} onClick={addModel}>＋ Add Model</button>
                  </div>
                  {traceValidationErrors.models && <span className="field-error">{traceValidationErrors.models}</span>}
                  {traceModels.map((m, i) => (
                    <div key={i} style={{ background: "var(--gray-50)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--gray-200)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Model {i + 1}</span>
                        {traceModels.length > 1 && <button type="button" onClick={() => removeModel(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gray-400)", fontSize: 16, padding: "0 4px" }}>✕</button>}
                      </div>
                      <div className="form-grid">
                        <div className="field"><label>Model Name *</label><input value={m.model_name} onChange={(e) => updateModel(i, "model_name", e.target.value)} placeholder="e.g. gpt-4o" /></div>
                        <div className="field"><label>Provider</label><input value={m.provider} onChange={(e) => updateModel(i, "provider", e.target.value)} placeholder="e.g. openai" /></div>
                        <div className="field"><label>Input Tokens</label><input type="number" min="0" value={m.input_tokens} onChange={(e) => updateModel(i, "input_tokens", e.target.value)} placeholder="0" /></div>
                        <div className="field"><label>Output Tokens</label><input type="number" min="0" value={m.output_tokens} onChange={(e) => updateModel(i, "output_tokens", e.target.value)} placeholder="0" /></div>
                        <div className="field"><label>Cost ($) <span style={{ fontWeight: 400, color: "var(--gray-400)" }}>optional</span></label><input type="number" step="0.000001" min="0" value={m.cost} onChange={(e) => updateModel(i, "cost", e.target.value)} placeholder="auto from DB" /></div>
                        <div className="field"><label>Latency (ms)</label><input type="number" min="0" value={m.latency_ms} onChange={(e) => updateModel(i, "latency_ms", e.target.value)} placeholder="0" /></div>
                      </div>
                    </div>
                  ))}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <p className="form-section-label" style={{ margin: 0 }}>Tools <span style={{ fontWeight: 400, color: "var(--gray-400)" }}>optional</span></p>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: "4px 12px" }} onClick={addTool}>＋ Add Tool</button>
                  </div>
                  {traceTools.map((t, i) => (
                    <div key={i} style={{ background: "var(--gray-50)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--gray-200)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Tool {i + 1}</span>
                        <button type="button" onClick={() => removeTool(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gray-400)", fontSize: 16, padding: "0 4px" }}>✕</button>
                      </div>
                      <div className="form-grid">
                        <div className="field"><label>Tool Name *</label><input value={t.tool_name} onChange={(e) => updateTool(i, "tool_name", e.target.value)} placeholder="e.g. web-search" /></div>
                        <div className="field"><label>Tool Type</label><input value={t.tool_type} onChange={(e) => updateTool(i, "tool_type", e.target.value)} placeholder="e.g. retrieval, code" /></div>
                        <div className="field"><label>Invocations</label><input type="number" min="1" value={t.invocation_count} onChange={(e) => updateTool(i, "invocation_count", e.target.value)} placeholder="1" /></div>
                        <div className="field"><label>Exec Time (ms)</label><input type="number" min="0" value={t.execution_time_ms} onChange={(e) => updateTool(i, "execution_time_ms", e.target.value)} placeholder="0" /></div>
                        <div className="field"><label>Cost ($) <span style={{ fontWeight: 400, color: "var(--gray-400)" }}>optional</span></label><input type="number" step="0.000001" min="0" value={t.cost} onChange={(e) => updateTool(i, "cost", e.target.value)} placeholder="auto from DB" /></div>
                      </div>
                    </div>
                  ))}

                  <p className="form-section-label">Security &amp; tags</p>
                  <div className="form-grid">
                    <div className="field"><label>PII Type</label><input value={traceForm.pii_type} onChange={(e) => setTraceForm({ ...traceForm, pii_type: e.target.value })} placeholder="e.g. email, ssn" /></div>
                    <div className="field"><label>Tags</label><input value={traceForm.tags} onChange={(e) => setTraceForm({ ...traceForm, tags: e.target.value })} placeholder="comma-separated" /></div>
                    <div className="field"><label>Input Size (MB)</label><input type="number" step="0.01" min="0" value={traceForm.input_data_size_mb} onChange={(e) => setTraceForm({ ...traceForm, input_data_size_mb: e.target.value })} placeholder="0.00" /></div>
                    <div className="field"><label>Output Size (MB)</label><input type="number" step="0.01" min="0" value={traceForm.output_data_size_mb} onChange={(e) => setTraceForm({ ...traceForm, output_data_size_mb: e.target.value })} placeholder="0.00" /></div>
                  </div>

                  <div className="action-row">
                    <button type="submit" className="btn btn-primary" disabled={traceSubmitting}>{traceSubmitting ? "Injecting…" : "Inject Trace"}</button>
                    <button type="button" className="btn btn-ghost" onClick={closeTraceModal}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {traceResult && (
            <section className="panel">
              <div className="section-head">
                <div><h3>Last Injected Trace</h3><p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>Summary of the most recently submitted unified trace.</p></div>
                <button type="button" className="btn btn-ghost" onClick={() => setTraceResult(null)}>Clear</button>
              </div>
              <div className="trace-summary-bar" style={{ marginBottom: 16 }}>
                {[
                  ["Event ID", traceResult.event_id], ["Trace ID", traceResult.trace_id],
                  ["Workflow", traceResult.workflow_name || "—"], ["Models", traceResult.model_count],
                  ["Tools", traceResult.tool_count], ["Total Tokens", (traceResult.total_tokens || 0).toLocaleString()],
                  ["LLM Cost", `$${Number(traceResult.total_llm_cost || 0).toFixed(4)}`],
                  ["Tool Cost", `$${Number(traceResult.total_tool_cost || 0).toFixed(4)}`],
                  ["Total Cost", `$${Number(traceResult.total_cost || 0).toFixed(4)}`],
                ].map(([label, val]) => (
                  <div key={label} className="trace-summary-item">
                    <span>{label}</span>
                    <strong style={{ fontSize: label === "Event ID" || label === "Trace ID" ? 11 : undefined, fontFamily: label === "Event ID" || label === "Trace ID" ? "monospace" : undefined, wordBreak: "break-all" }}>{val}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel">
            <div className="section-head">
              <div><h3>Trace Detail Lookup</h3><p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>Fetch full model &amp; tool breakdown for any trace by ID.</p></div>
            </div>
            <div className="action-row" style={{ marginBottom: 16 }}>
              <input value={traceDetailId} onChange={(e) => setTraceDetailId(e.target.value)} placeholder="Enter Trace ID" style={{ flex: 1, maxWidth: 400 }} onKeyDown={(e) => e.key === "Enter" && loadTraceDetail()} />
              <button type="button" className="btn btn-primary" onClick={loadTraceDetail} disabled={traceDetailLoading || !traceDetailId.trim()}>{traceDetailLoading ? "Loading…" : "Load Detail"}</button>
              {traceDetail && <button type="button" className="btn btn-ghost" onClick={() => setTraceDetail(null)}>Clear</button>}
            </div>
            {traceDetail && (
              <>
                <div className="trace-summary-bar" style={{ marginBottom: 16 }}>
                  {[
                    ["Org", traceDetail.org_id], ["Project", traceDetail.project_id || "—"],
                    ["Workflow", traceDetail.workflow_name || "—"], ["Status", traceDetail.status],
                    ["Models", traceDetail.model_count], ["Tools", traceDetail.tool_count],
                    ["Total Tokens", (traceDetail.total_tokens || 0).toLocaleString()],
                    ["LLM Cost", `$${Number(traceDetail.total_llm_cost || 0).toFixed(4)}`],
                    ["Tool Cost", `$${Number(traceDetail.total_tool_cost || 0).toFixed(4)}`],
                    ["Infra Cost", `$${Number(traceDetail.infra_cost || 0).toFixed(4)}`],
                    ["Total Cost", `$${Number(traceDetail.total_cost || 0).toFixed(4)}`],
                    ["Exec Time", `${traceDetail.total_execution_time_ms} ms`],
                    ["Risk Score", Number(traceDetail.risk_score || 0).toFixed(1)],
                  ].map(([l, v]) => (
                    <div key={l} className="trace-summary-item"><span>{l}</span><strong>{v}</strong></div>
                  ))}
                </div>
                {(traceDetail.models || []).length > 0 && (
                  <>
                    <p className="form-section-label" style={{ marginBottom: 8 }}>Models used</p>
                    <div className="table-wrap" style={{ marginBottom: 16 }}>
                      <table>
                        <thead><tr><th>Model</th><th>Provider</th><th>Input Tokens</th><th>Output Tokens</th><th>Total Tokens</th><th>Cost</th><th>Latency</th></tr></thead>
                        <tbody>
                          {traceDetail.models.map((m, idx) => (
                            <tr key={idx}>
                              <td><strong>{m.model_name}</strong></td><td>{m.provider || "—"}</td>
                              <td>{(m.input_tokens || 0).toLocaleString()}</td><td>{(m.output_tokens || 0).toLocaleString()}</td>
                              <td>{(m.total_tokens || 0).toLocaleString()}</td>
                              <td>${Number(m.cost || 0).toFixed(6)}</td><td>{m.latency_ms} ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {(traceDetail.tools || []).length > 0 && (
                  <>
                    <p className="form-section-label" style={{ marginBottom: 8 }}>Tools used</p>
                    <div className="table-wrap" style={{ marginBottom: 16 }}>
                      <table>
                        <thead><tr><th>Tool</th><th>Type</th><th>Invocations</th><th>Exec Time</th><th>Cost</th></tr></thead>
                        <tbody>
                          {traceDetail.tools.map((t, idx) => (
                            <tr key={idx}>
                              <td><strong>{t.tool_name}</strong></td><td>{t.tool_type || "—"}</td>
                              <td>{t.invocation_count}</td><td>{(t.execution_time_ms || 0).toLocaleString()} ms</td>
                              <td>${Number(t.cost || 0).toFixed(6)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {!(traceDetail.models || []).length && !(traceDetail.tools || []).length && (
                  <div className="empty-state" style={{ marginTop: 8 }}>Single-model event — no per-model/tool breakdown available.</div>
                )}
              </>
            )}
            {!traceDetail && !traceDetailLoading && (
              <div className="empty-state">Enter a trace ID above to inspect its full model and tool breakdown.</div>
            )}
          </section>
        </>
      )}

      {/* ══════════════════ MODEL & TOOL CONFIG TAB ══════════════════ */}
      {activeTab === "config" && (
        <>
          {/* Delete model pricing confirm */}
          {deleteModelConfirm && (
            <div className="modal-backdrop" onClick={() => setDeleteModelConfirm(null)}>
              <div className="modal-dialog" style={{ maxWidth: 420, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header" style={{ justifyContent: "center" }}><h3>Remove Pricing Entry?</h3></div>
                <p style={{ color: "var(--gray-500)", margin: "0 0 20px" }}>This removes the pricing entry for <strong>{deleteModelConfirm.model_name}</strong> ({deleteModelConfirm.provider}). Cost lookups for new events using this model will fall back to the tool registry.</p>
                <div className="action-row" style={{ justifyContent: "center" }}>
                  <button type="button" className="btn btn-primary" style={{ background: "#c0392b" }} onClick={() => handleDeleteModel(deleteModelConfirm.id)}>Remove</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setDeleteModelConfirm(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {configMsg && (
            <section className="panel" style={{ padding: "10px 24px" }}>
              <div className="feedback-msg">{configMsg}</div>
            </section>
          )}

          {/* ── AI Models ── */}
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>AI Models</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  Register models and their token pricing. The cost engine uses these rates at ingest time.
                  A single project can register multiple models from different providers.
                </p>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => { setAddModelOpen((v) => !v); setAddModelErrors({}); }}>
                {addModelOpen ? "↑ Hide" : "＋ Add Model"}
              </button>
            </div>

            {/* Add model inline form */}
            {addModelOpen && (
              <form className="stack" onSubmit={submitAddModel} style={{ background: "var(--gray-50)", borderRadius: 10, padding: "16px 18px", border: "1px solid rgba(124,112,174,0.18)", marginBottom: 16 }}>
                <p className="form-section-label" style={{ marginTop: 0 }}>New model pricing entry</p>
                <div className="form-grid">
                  <div className="field">
                    <label>Provider *</label>
                    <input value={addModelForm.provider} onChange={(e) => setAddModelForm({ ...addModelForm, provider: e.target.value })} placeholder="e.g. openai, anthropic, google" style={modelFieldError("provider")} />
                    {addModelErrors.provider && <span className="field-error">{addModelErrors.provider}</span>}
                  </div>
                  <div className="field">
                    <label>Model Name *</label>
                    <input value={addModelForm.model_name} onChange={(e) => setAddModelForm({ ...addModelForm, model_name: e.target.value })} placeholder="e.g. gpt-4o, claude-3-5-sonnet" style={modelFieldError("model_name")} />
                    {addModelErrors.model_name && <span className="field-error">{addModelErrors.model_name}</span>}
                  </div>
                  <div className="field">
                    <label>Input Cost / 1k tokens ($)</label>
                    <input type="number" step="0.000001" min="0" value={addModelForm.input_cost_per_1k} onChange={(e) => setAddModelForm({ ...addModelForm, input_cost_per_1k: e.target.value })} placeholder="e.g. 0.005" style={modelFieldError("input_cost_per_1k")} />
                    {addModelErrors.input_cost_per_1k && <span className="field-error">{addModelErrors.input_cost_per_1k}</span>}
                  </div>
                  <div className="field">
                    <label>Output Cost / 1k tokens ($)</label>
                    <input type="number" step="0.000001" min="0" value={addModelForm.output_cost_per_1k} onChange={(e) => setAddModelForm({ ...addModelForm, output_cost_per_1k: e.target.value })} placeholder="e.g. 0.015" style={modelFieldError("output_cost_per_1k")} />
                    {addModelErrors.output_cost_per_1k && <span className="field-error">{addModelErrors.output_cost_per_1k}</span>}
                  </div>
                  <div className="field">
                    <label>Currency</label>
                    <input value={addModelForm.currency} onChange={(e) => setAddModelForm({ ...addModelForm, currency: e.target.value })} placeholder="USD" />
                  </div>
                </div>
                <div className="action-row">
                  <button type="submit" className="btn btn-primary" disabled={addModelSubmitting}>{addModelSubmitting ? "Registering…" : "Register Model"}</button>
                  <button type="button" className="btn btn-ghost" onClick={() => { setAddModelOpen(false); setAddModelForm({ ...blankAddModel }); setAddModelErrors({}); }}>Cancel</button>
                </div>
              </form>
            )}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Model</th>
                    <th>Input / 1k tokens</th>
                    <th>Output / 1k tokens</th>
                    <th>Currency</th>
                    <th>Effective From</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--gray-500)" }}>No models registered yet. Use "+ Add Model" to register your first model.</td></tr>
                  )}
                  {pricing.map((p) => (
                    <tr key={p.id}>
                      <td>{p.provider}</td>
                      <td><strong>{p.model_name}</strong></td>
                      <td>${Number(p.input_cost_per_1k || 0).toFixed(6)}</td>
                      <td>${Number(p.output_cost_per_1k || 0).toFixed(6)}</td>
                      <td>{p.currency || "USD"}</td>
                      <td style={{ fontSize: 12, color: "var(--gray-500)" }}>{p.effective_from ? new Date(p.effective_from).toLocaleDateString() : "—"}</td>
                      <td>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 12, color: "var(--brand-primary)", padding: "2px 8px" }} onClick={() => setDeleteModelConfirm(p)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Tools ── */}
          <section className="panel">
            <div className="section-head">
              <div>
                <h3>Tools</h3>
                <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                  Register external tools and their cost model. A single project can use multiple tools from different vendors.
                  Cost is resolved automatically at ingest time.
                </p>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => { setAddToolOpen((v) => !v); setAddToolErrors({}); }}>
                {addToolOpen ? "↑ Hide" : "＋ Add Tool"}
              </button>
            </div>

            {/* Add tool inline form */}
            {addToolOpen && (
              <form className="stack" onSubmit={submitAddTool} style={{ background: "var(--gray-50)", borderRadius: 10, padding: "16px 18px", border: "1px solid rgba(124,112,174,0.18)", marginBottom: 16 }}>
                <p className="form-section-label" style={{ marginTop: 0 }}>New tool registration</p>
                <div className="form-grid">
                  <div className="field">
                    <label>Tool Name *</label>
                    <input value={addToolForm.tool_name} onChange={(e) => setAddToolForm({ ...addToolForm, tool_name: e.target.value })} placeholder="e.g. web-search, code-executor" style={toolFieldError("tool_name")} />
                    {addToolErrors.tool_name && <span className="field-error">{addToolErrors.tool_name}</span>}
                  </div>
                  <div className="field">
                    <label>Tool Type</label>
                    <input value={addToolForm.tool_type} onChange={(e) => setAddToolForm({ ...addToolForm, tool_type: e.target.value })} placeholder="e.g. retrieval, code, browser, embedding" />
                  </div>
                  <div className="field">
                    <label>Vendor</label>
                    <input value={addToolForm.vendor} onChange={(e) => setAddToolForm({ ...addToolForm, vendor: e.target.value })} placeholder="e.g. OpenAI, Anthropic, custom" />
                  </div>
                  <div className="field">
                    <label>Cost Model</label>
                    <select value={addToolForm.cost_model} onChange={(e) => setAddToolForm({ ...addToolForm, cost_model: e.target.value })}>
                      {COST_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Base Cost ($)</label>
                    <input type="number" step="0.000001" min="0" value={addToolForm.base_cost} onChange={(e) => setAddToolForm({ ...addToolForm, base_cost: e.target.value })} placeholder="e.g. 0.002" style={toolFieldError("base_cost")} />
                    {addToolErrors.base_cost && <span className="field-error">{addToolErrors.base_cost}</span>}
                  </div>
                </div>
                <div className="action-row">
                  <button type="submit" className="btn btn-primary" disabled={addToolSubmitting}>{addToolSubmitting ? "Registering…" : "Register Tool"}</button>
                  <button type="button" className="btn btn-ghost" onClick={() => { setAddToolOpen(false); setAddToolForm({ ...blankAddTool }); setAddToolErrors({}); }}>Cancel</button>
                </div>
              </form>
            )}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tool Name</th>
                    <th>Type</th>
                    <th>Vendor</th>
                    <th>Cost Model</th>
                    <th>Base Cost</th>
                    <th>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {registeredTools.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--gray-500)" }}>No tools registered yet. Use "+ Add Tool" to register your first tool.</td></tr>
                  )}
                  {registeredTools.map((t) => (
                    <tr key={t.id}>
                      <td><strong>{t.tool_name}</strong></td>
                      <td>{t.tool_type || "—"}</td>
                      <td>{t.vendor || "—"}</td>
                      <td><span className="pill">{t.cost_model || "per_request"}</span></td>
                      <td>${Number(t.base_cost || 0).toFixed(6)}</td>
                      <td style={{ fontSize: 12, color: "var(--gray-500)" }}>{t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default TestEvent;
