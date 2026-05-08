import React, { useEffect, useRef, useState } from "react";
import {
  getLookupEventStatuses,
  getTelemetryLogs,
  getTrace,
  postTelemetryEvent,
  updateTelemetryEvent,
  deleteTelemetryEvent,
} from "../api";

// ─── Preset scenarios ─────────────────────────────────────────────────────────
const PRESETS = [
  {
    id: "email-classify-order",
    label: "Classify · ORDER_ISSUE",
    models: [{ model_name: "gpt-5-nano", provider: "openai", prompt_tokens: 420, completion_tokens: 85 }],
    tools:  [{ tool_name: "email-classifier", tool_type: "llm", vendor: "OpenAI" }],
    service_type: "email-classification", execution_type: "classify",
    latency_ms: 380, tags: "email-agent,classification",
    emailMeta: { intent: "ORDER_ISSUE", intent_confidence: 0.94, pii_masked: true, masking_types: ["order_id", "phone"], classification_model: "gpt-5-nano", pipeline_status: "completed" },
  },
  {
    id: "email-classify-prospect",
    label: "Classify · PROSPECT_QUERY",
    models: [{ model_name: "gpt-5-nano", provider: "openai", prompt_tokens: 310, completion_tokens: 72 }],
    tools:  [{ tool_name: "email-classifier", tool_type: "llm", vendor: "OpenAI" }],
    service_type: "email-classification", execution_type: "classify",
    latency_ms: 290, tags: "email-agent,classification,prospect",
    emailMeta: { intent: "PROSPECT_QUERY", intent_confidence: 0.88, pii_masked: false, masking_types: [], classification_model: "gpt-5-nano", auto_replied: true, pipeline_status: "completed" },
  },
  {
    id: "email-draft-azure",
    label: "Draft · Azure OpenAI",
    models: [{ model_name: "gpt-4o", provider: "azure-openai", prompt_tokens: 980, completion_tokens: 440 }],
    tools:  [{ tool_name: "email-drafter", tool_type: "llm", vendor: "Azure OpenAI" }],
    service_type: "email-draft", execution_type: "draft",
    latency_ms: 1640, tags: "email-agent,drafting",
    emailMeta: { draft_generated: true, draft_model: "gpt-4o (Azure)", pipeline_status: "completed" },
  },
  {
    id: "email-draft-gemini",
    label: "Draft · Gemini",
    models: [{ model_name: "gemini-1.5-pro", provider: "google", prompt_tokens: 1100, completion_tokens: 520 }],
    tools:  [{ tool_name: "email-drafter-gemini", tool_type: "llm", vendor: "Google" }],
    service_type: "email-draft", execution_type: "draft",
    latency_ms: 1920, tags: "email-agent,drafting,gemini",
    emailMeta: { draft_generated: true, draft_model: "gemini-1.5-pro", pipeline_status: "completed" },
  },
  {
    id: "email-full-pipeline",
    label: "Full Pipeline · PII Masked",
    models: [
      { model_name: "gpt-5-nano", provider: "openai", prompt_tokens: 420, completion_tokens: 85 },
      { model_name: "gpt-4o", provider: "azure-openai", prompt_tokens: 980, completion_tokens: 440 },
    ],
    tools: [
      { tool_name: "ms-graph-connector", tool_type: "api", vendor: "Microsoft" },
      { tool_name: "pii-sanitizer", tool_type: "security", vendor: "custom" },
      { tool_name: "email-classifier", tool_type: "llm", vendor: "OpenAI" },
      { tool_name: "email-drafter", tool_type: "llm", vendor: "Azure OpenAI" },
    ],
    service_type: "email-pipeline", execution_type: "full-pipeline",
    latency_ms: 3200, tags: "email-agent,pipeline,pii",
    emailMeta: { intent: "REFUND_REQUEST", intent_confidence: 0.91, pii_masked: true, masking_types: ["order_id", "tracking_id", "phone"], draft_generated: true, classification_model: "gpt-5-nano", draft_model: "gpt-4o (Azure)", pipeline_status: "completed" },
  },
  {
    id: "email-autoreply",
    label: "Auto-Reply · Prospect",
    models: [{ model_name: "gemini-1.5-pro", provider: "google", prompt_tokens: 860, completion_tokens: 380 }],
    tools:  [
      { tool_name: "email-drafter-gemini", tool_type: "llm", vendor: "Google" },
      { tool_name: "ms-graph-sender", tool_type: "api", vendor: "Microsoft" },
    ],
    service_type: "email-autoreply", execution_type: "auto-reply",
    latency_ms: 2100, tags: "email-agent,autoreply,prospect",
    emailMeta: { intent: "PROSPECT_QUERY", auto_replied: true, draft_generated: true, draft_model: "gemini-1.5-pro", pipeline_status: "completed" },
  },
  {
    id: "email-fetch",
    label: "MS Graph · Fetch Emails",
    models: [],
    tools:  [{ tool_name: "ms-graph-connector", tool_type: "api", vendor: "Microsoft" }],
    service_type: "email-fetch", execution_type: "fetch",
    latency_ms: 620, tags: "email-agent,fetch,msgraph",
    emailMeta: { pipeline_status: "completed" },
  },
  {
    id: "email-pii-high-risk",
    label: "PII Alert · High Risk",
    models: [{ model_name: "gpt-5-nano", provider: "openai", prompt_tokens: 650, completion_tokens: 90 }],
    tools:  [{ tool_name: "pii-sanitizer", tool_type: "security", vendor: "custom" }],
    service_type: "email-sanitization", execution_type: "sanitize",
    latency_ms: 480, tags: "email-agent,pii,high-risk",
    pii_type: "order_id",
    emailMeta: { pii_masked: true, masking_types: ["order_id", "tracking_id", "phone", "email_address"], pipeline_status: "completed" },
  },
];

const AUTO_INTERVAL_MS = 4000;

// ─── helpers ─────────────────────────────────────────────────────────────────

const jitter = (n) => Math.max(1, Math.round(n * (0.75 + Math.random() * 0.5)));

const freshIds = () => ({
  event_id:   `evt-${Date.now()}`,
  request_id: `req-${Date.now()}`,
  trace_id:   `trace-${Date.now()}`,
});

const buildPayload = (preset, orgId, projectId) => {
  const models       = (preset.models || []).map((m) => ({
    ...m,
    prompt_tokens:     jitter(m.prompt_tokens || 0),
    completion_tokens: jitter(Math.max(m.completion_tokens || 0, 0)),
  }));
  const primaryModel = models[0] || {};
  const primaryTool  = preset.tools[0] || {};
  const hasPii       = !!(preset.pii_type || preset.emailMeta?.pii_masked);
  return {
    ...freshIds(),
    org_id:              orgId,
    project_id:          projectId,
    tool_name:           primaryTool.tool_name || "",
    provider:            primaryModel.provider || null,
    model_name:          primaryModel.model_name || null,
    service_type:        preset.service_type || null,
    execution_type:      preset.execution_type || null,
    status:              "success",
    latency_ms:          jitter(preset.latency_ms || 500),
    prompt_tokens:       models.reduce((s, m) => s + m.prompt_tokens, 0),
    completion_tokens:   models.reduce((s, m) => s + m.completion_tokens, 0),
    infra_cost:          0,
    input_data_size_mb:  0,
    output_data_size_mb: 0,
    contains_pii:        hasPii,
    pii_type:            preset.pii_type || (preset.emailMeta?.masking_types || [])[0] || null,
    external_tools:      preset.tools.map((t) => ({ name: t.tool_name, cost: 0 })),
    metadata_json:       { models, tools: preset.tools, email_agent: preset.emailMeta || {} },
    stages:              [],
    tags: (preset.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
  };
};

const blankModelRow = () => ({ model_name: "", provider: "", prompt_tokens: "", completion_tokens: "" });
const blankToolRow  = () => ({ tool_name: "", tool_type: "", vendor: "" });

const BLANK = {
  org_id: "", project_id: "", user_id: "", service_type: "", execution_type: "",
  status: "success", latency_ms: "", pii_type: "", tags: "", stages: [],
  models: [blankModelRow()], tools: [blankToolRow()],
};

const BLANK_FILTER = { org_id: "", tool_name: "", status: "", limit: 25, start_date: "", end_date: "" };

const fmtTs = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const truncate = (str, len = 24) =>
  str && str.length > len ? str.slice(0, len) + "…" : str || "—";

// ─── component ───────────────────────────────────────────────────────────────

function TestEvent() {
  const formRef = useRef(null);

  /* filter state — committed pattern: raw inputs → applied on Search click */
  const [filterOrg,       setFilterOrg]       = useState("");
  const [filterTool,      setFilterTool]      = useState("");
  const [filterStatus,    setFilterStatus]    = useState("");
  const [filterLimit,     setFilterLimit]     = useState(25);
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate,   setFilterEndDate]   = useState("");
  const [appliedFilter,   setAppliedFilter]   = useState(BLANK_FILTER);
  const filterRef = useRef(BLANK_FILTER);

  /* auto-inject */
  const [orgId,        setOrgId]        = useState("");
  const [projectId,    setProjectId]    = useState("");
  const [autoRunning,  setAutoRunning]  = useState(false);
  const [autoCount,    setAutoCount]    = useState(0);
  const [currentLabel, setCurrentLabel] = useState("");
  const [countdown,    setCountdown]    = useState(AUTO_INTERVAL_MS / 1000);
  const autoTimerRef   = useRef(null);
  const countdownRef   = useRef(null);
  const presetIndexRef = useRef(0);

  /* edit */
  const [editingEventId,   setEditingEventId]   = useState(null);
  const [form,             setForm]             = useState({ ...BLANK, models: [blankModelRow()], tools: [blankToolRow()] });
  const [validationErrors, setValidationErrors] = useState({});
  const [submitting,       setSubmitting]       = useState(false);

  /* shared */
  const [events,        setEvents]        = useState([]);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [message,       setMessage]       = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [eventStatuses, setEventStatuses] = useState([]);
  const [oneLoading,    setOneLoading]    = useState(false);
  const [loadingEv,     setLoadingEv]     = useState(false);

  /* keep filterRef in sync so loadEvents inside timers gets current filter */
  useEffect(() => { filterRef.current = appliedFilter; }, [appliedFilter]);

  const loadEvents = async () => {
    const f = filterRef.current;
    const params = { limit: f.limit || 25 };
    if (f.org_id)     params.org_id     = f.org_id;
    if (f.tool_name)  params.tool_name  = f.tool_name;
    if (f.status)     params.status     = f.status;
    if (f.start_date) params.start_date = f.start_date;
    if (f.end_date)   params.end_date   = f.end_date;
    setLoadingEv(true);
    try {
      const res = await getTelemetryLogs(params);
      setEvents(res.data || []);
    } catch {
      setEvents([]);
    } finally {
      setLoadingEv(false);
    }
  };

  useEffect(() => {
    loadEvents().catch(() => {});
    getLookupEventStatuses().then((r) => setEventStatuses(r.data || [])).catch(() => {});
  }, []); // eslint-disable-line

  /* re-fetch whenever committed filter changes */
  useEffect(() => {
    loadEvents().catch(() => {});
  }, [appliedFilter]); // eslint-disable-line

  const handleSearch = () => {
    const f = { org_id: filterOrg, tool_name: filterTool, status: filterStatus, limit: filterLimit, start_date: filterStartDate, end_date: filterEndDate };
    filterRef.current = f;
    setAppliedFilter(f);
  };

  const handleReset = () => {
    setFilterOrg(""); setFilterTool(""); setFilterStatus("");
    setFilterLimit(25); setFilterStartDate(""); setFilterEndDate("");
    filterRef.current = BLANK_FILTER;
    setAppliedFilter(BLANK_FILTER);
  };

  // ── auto-inject engine ────────────────────────────────────────────────────

  const runOneAuto = async () => {
    const preset = PRESETS[presetIndexRef.current % PRESETS.length];
    presetIndexRef.current += 1;
    setCurrentLabel(preset.label);
    try {
      await postTelemetryEvent(buildPayload(preset, orgId.trim(), projectId.trim()));
      setAutoCount((c) => c + 1);
      await loadEvents();
    } catch {}
    setCountdown(AUTO_INTERVAL_MS / 1000);
  };

  useEffect(() => {
    if (!autoRunning) {
      clearInterval(autoTimerRef.current);
      clearInterval(countdownRef.current);
      setCountdown(AUTO_INTERVAL_MS / 1000);
      return;
    }
    runOneAuto();
    autoTimerRef.current = setInterval(runOneAuto, AUTO_INTERVAL_MS);
    countdownRef.current = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => {
      clearInterval(autoTimerRef.current);
      clearInterval(countdownRef.current);
    };
  }, [autoRunning]); // eslint-disable-line

  const startAuto = () => {
    if (!orgId.trim() || !projectId.trim()) { setMessage("Enter Organization and Project first."); return; }
    setMessage("");
    setAutoCount(0);
    presetIndexRef.current = 0;
    setAutoRunning(true);
  };

  const stopAuto = () => setAutoRunning(false);

  const injectAll = async () => {
    if (!orgId.trim() || !projectId.trim()) { setMessage("Enter Organization and Project first."); return; }
    setOneLoading(true);
    setMessage("");
    let count = 0;
    for (const p of PRESETS) {
      try {
        await postTelemetryEvent(buildPayload(p, orgId.trim(), projectId.trim()));
        count++;
        await new Promise((r) => setTimeout(r, 80));
      } catch {}
    }
    setMessage(`Injected ${count} events across all ${PRESETS.length} scenarios.`);
    setOneLoading(false);
    await loadEvents();
  };

  // ── edit helpers ──────────────────────────────────────────────────────────

  const cancelEdit = () => {
    setEditingEventId(null);
    setForm({ ...BLANK, models: [blankModelRow()], tools: [blankToolRow()] });
    setValidationErrors({});
  };

  const openEditModal = (evt) => {
    setEditingEventId(evt.event_id);
    setValidationErrors({});
    const metaModels = evt.metadata_json?.models || [];
    const seedModels = metaModels.length
      ? metaModels.map((m) => ({ model_name: m.model_name || "", provider: m.provider || "", prompt_tokens: m.prompt_tokens ?? "", completion_tokens: m.completion_tokens ?? "" }))
      : [{ model_name: evt.model_name || "", provider: evt.provider || "", prompt_tokens: evt.prompt_tokens ?? "", completion_tokens: evt.completion_tokens ?? "" }];
    const externalTools = evt.external_tools || evt.metadata_json?.tools || [];
    const seedTools = externalTools.length
      ? externalTools.map((t) => ({ tool_name: t.tool_name || t.name || "", tool_type: t.tool_type || "", vendor: t.vendor || "" }))
      : [{ tool_name: evt.tool_name || "", tool_type: "", vendor: "" }];
    setForm({
      ...BLANK,
      org_id: evt.org_id || "", project_id: evt.project_id || "", user_id: evt.user_id || "",
      service_type: evt.service_type || "", execution_type: evt.execution_type || "",
      status: evt.status || "success", latency_ms: evt.latency_ms ?? "",
      pii_type: evt.pii_type || "",
      tags: Array.isArray(evt.tags) ? evt.tags.join(", ") : evt.tags || "",
      stages: evt.stages || [], models: seedModels, tools: seedTools,
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const updateModelRow = (idx, patch) => setForm((f) => { const next = [...f.models]; next[idx] = { ...next[idx], ...patch }; return { ...f, models: next }; });
  const addModelRow    = () => setForm((f) => ({ ...f, models: [...f.models, blankModelRow()] }));
  const removeModelRow = (idx) => setForm((f) => ({ ...f, models: f.models.length > 1 ? f.models.filter((_, i) => i !== idx) : f.models }));

  const updateToolRow  = (idx, patch) => setForm((f) => { const next = [...f.tools]; next[idx] = { ...next[idx], ...patch }; return { ...f, tools: next }; });
  const addToolRow     = () => setForm((f) => ({ ...f, tools: [...f.tools, blankToolRow()] }));
  const removeToolRow  = (idx) => setForm((f) => ({ ...f, tools: f.tools.length > 1 ? f.tools.filter((_, i) => i !== idx) : f.tools }));

  const validate = () => {
    const errors = {};
    if (!form.org_id)     errors.org_id     = "Required";
    if (!form.project_id) errors.project_id = "Required";
    if (!(form.models || []).some((m) => m.model_name?.trim())) errors.models = "At least one model required";
    if (!(form.tools  || []).some((t) => t.tool_name?.trim()))  errors.tools  = "At least one tool required";
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const validModels  = form.models.filter((m) => m.model_name?.trim());
      const validTools   = form.tools.filter((t) => t.tool_name?.trim());
      const primaryModel = validModels[0] || {};
      const primaryTool  = validTools[0] || {};
      await updateTelemetryEvent(editingEventId, {
        org_id: form.org_id, project_id: form.project_id,
        tool_name: primaryTool.tool_name || "", provider: primaryModel.provider || null,
        model_name: primaryModel.model_name || null,
        service_type: form.service_type || null, execution_type: form.execution_type || null,
        status: form.status, latency_ms: Number(form.latency_ms) || 0,
        prompt_tokens:    validModels.reduce((s, m) => s + (Number(m.prompt_tokens)    || 0), 0),
        completion_tokens: validModels.reduce((s, m) => s + (Number(m.completion_tokens) || 0), 0),
        infra_cost: 0, input_data_size_mb: 0, output_data_size_mb: 0,
        contains_pii: false, pii_type: form.pii_type || null,
        external_tools: validTools.map((t) => ({ name: t.tool_name, cost: 0 })),
        metadata_json: {
          models: validModels.map((m) => ({ model_name: m.model_name.trim(), provider: m.provider || null, prompt_tokens: Number(m.prompt_tokens) || 0, completion_tokens: Number(m.completion_tokens) || 0 })),
          tools:  validTools.map((t) => ({ tool_name: t.tool_name.trim(), tool_type: t.tool_type || null, vendor: t.vendor || null })),
        },
        stages: form.stages || [],
        tags: typeof form.tags === "string" ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : form.tags,
      });
      setMessage(`Event ${editingEventId} updated.`);
      cancelEdit();
      await loadEvents();
    } catch { setMessage("Update failed. Check backend."); }
    finally   { setSubmitting(false); }
  };

  // ── delete + trace ────────────────────────────────────────────────────────

  const handleDelete = async (eventId) => {
    try {
      await deleteTelemetryEvent(eventId);
      setMessage(`Event ${eventId} deleted.`);
      setDeleteConfirm(null);
      if (selectedTrace?.event?.event_id === eventId) setSelectedTrace(null);
      await loadEvents();
    } catch { setMessage("Delete failed."); }
  };

  const openTrace = async (eventId) => {
    const res = await getTrace(eventId);
    setSelectedTrace(res.data);
  };

  const fieldError = (n) => validationErrors[n] ? { borderColor: "var(--brand-primary)" } : {};

  const activeFilterCount = [
    appliedFilter.org_id, appliedFilter.tool_name, appliedFilter.status,
    appliedFilter.start_date, appliedFilter.end_date,
  ].filter(Boolean).length;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="page-shell">

      {/* Header */}
      <section className="panel" style={{ padding: "18px 24px" }}>
        <div>
          <h2 style={{ margin: 0 }}>Event Tracing</h2>
          <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 14 }}>
            Inspect live telemetry events, drill into trace details, and simulate multi-tool AI pipeline scenarios.
          </p>
        </div>
        {message && <div className="feedback-msg" style={{ marginTop: 10 }}>{message}</div>}
      </section>

      {/* ── Edit form (only when editing) ── */}
      {editingEventId && (
        <section className="panel" ref={formRef}>
          <div className="section-head">
            <div>
              <h3>Edit Event</h3>
              <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>
                {editingEventId}
              </div>
            </div>
            <button type="button" className="btn btn-ghost" onClick={cancelEdit}>✕ Cancel</button>
          </div>

          <form className="stack" onSubmit={submitEdit}>
            <div className="form-grid">
              <div className="field">
                <label>Organization *</label>
                <input value={form.org_id} onChange={(e) => setForm({ ...form, org_id: e.target.value })} style={fieldError("org_id")} />
                {validationErrors.org_id && <span className="field-error">{validationErrors.org_id}</span>}
              </div>
              <div className="field">
                <label>Project *</label>
                <input value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} style={fieldError("project_id")} />
                {validationErrors.project_id && <span className="field-error">{validationErrors.project_id}</span>}
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
                <label>Latency (ms)</label>
                <input type="number" min="0" value={form.latency_ms} onChange={(e) => setForm({ ...form, latency_ms: e.target.value })} />
              </div>
              <div className="field">
                <label>Service Type</label>
                <input value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} />
              </div>
              <div className="field">
                <label>Execution Type</label>
                <input value={form.execution_type} onChange={(e) => setForm({ ...form, execution_type: e.target.value })} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <p className="form-section-label" style={{ margin: 0 }}>Models</p>
              <button type="button" className="btn btn-secondary" onClick={addModelRow}>＋ Add Model</button>
            </div>
            {validationErrors.models && <span className="field-error">{validationErrors.models}</span>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {form.models.map((m, idx) => (
                <div key={`m-${idx}`} style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <strong style={{ fontSize: 13 }}>Model #{idx + 1}</strong>
                    {form.models.length > 1 && <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => removeModelRow(idx)}>✕</button>}
                  </div>
                  <div className="form-grid">
                    <div className="field"><label>Model Name</label><input value={m.model_name} onChange={(e) => updateModelRow(idx, { model_name: e.target.value })} placeholder="e.g. gpt-4o" /></div>
                    <div className="field"><label>Provider</label><input value={m.provider} onChange={(e) => updateModelRow(idx, { provider: e.target.value })} placeholder="openai / anthropic" /></div>
                    <div className="field"><label>Prompt Tokens</label><input type="number" min="0" value={m.prompt_tokens} onChange={(e) => updateModelRow(idx, { prompt_tokens: e.target.value })} /></div>
                    <div className="field"><label>Completion Tokens</label><input type="number" min="0" value={m.completion_tokens} onChange={(e) => updateModelRow(idx, { completion_tokens: e.target.value })} /></div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <p className="form-section-label" style={{ margin: 0 }}>Tools</p>
              <button type="button" className="btn btn-secondary" onClick={addToolRow}>＋ Add Tool</button>
            </div>
            {validationErrors.tools && <span className="field-error">{validationErrors.tools}</span>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {form.tools.map((t, idx) => (
                <div key={`t-${idx}`} style={{ background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.18)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <strong style={{ fontSize: 13 }}>Tool #{idx + 1}</strong>
                    {form.tools.length > 1 && <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => removeToolRow(idx)}>✕</button>}
                  </div>
                  <div className="form-grid">
                    <div className="field"><label>Tool Name</label><input value={t.tool_name} onChange={(e) => updateToolRow(idx, { tool_name: e.target.value })} /></div>
                    <div className="field"><label>Tool Type</label><input value={t.tool_type} onChange={(e) => updateToolRow(idx, { tool_type: e.target.value })} /></div>
                    <div className="field"><label>Vendor</label><input value={t.vendor} onChange={(e) => updateToolRow(idx, { vendor: e.target.value })} /></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="form-grid">
              <div className="field"><label>PII Type</label><input value={form.pii_type} onChange={(e) => setForm({ ...form, pii_type: e.target.value })} placeholder="e.g. email, ssn" /></div>
              <div className="field"><label>Tags</label><input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="comma-separated" /></div>
            </div>

            <div className="action-row">
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Saving…" : "Save Changes"}</button>
              <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      {/* ── Auto-Inject Engine ── */}
      {!editingEventId && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>Auto-Inject</h3>
              <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
                Cycles through {PRESETS.length} preset scenarios every {AUTO_INTERVAL_MS / 1000}s to simulate real-world AI pipeline activity.
              </p>
            </div>
          </div>

          {/* Scope */}
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>Organization *</label>
              <input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="e.g. org-acme" disabled={autoRunning} />
            </div>
            <div className="field">
              <label>Project *</label>
              <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="e.g. proj-chatbot" disabled={autoRunning} />
            </div>
          </div>

          {/* Status bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "12px 16px", borderRadius: 10,
            background: autoRunning ? "rgba(39,174,96,0.06)" : "var(--gray-50)",
            border: `1px solid ${autoRunning ? "rgba(39,174,96,0.3)" : "rgba(124,112,174,0.18)"}`,
            marginBottom: 16,
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
              background: autoRunning ? "#27ae60" : "var(--gray-400)",
              boxShadow: autoRunning ? "0 0 0 3px rgba(39,174,96,0.2)" : "none",
            }} />
            <div style={{ flex: 1, fontSize: 13 }}>
              {autoRunning ? (
                <>
                  <strong style={{ color: "#27ae60" }}>Running</strong>
                  {" · "}<strong>{autoCount}</strong> events injected
                  {currentLabel && <> · <span style={{ color: "var(--gray-500)" }}>last: {currentLabel}</span></>}
                  <span style={{ color: "var(--gray-400)", marginLeft: 8 }}>next in {countdown}s</span>
                </>
              ) : (
                <span style={{ color: "var(--gray-500)" }}>
                  {autoCount > 0 ? `Stopped · ${autoCount} events injected` : "Ready — set Org and Project, then start"}
                </span>
              )}
            </div>
          </div>

          {/* Scenario chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {PRESETS.map((p, i) => (
              <span key={p.id} style={{
                fontSize: 12, padding: "4px 10px", borderRadius: 20,
                background: autoRunning && (presetIndexRef.current % PRESETS.length) === i
                  ? "rgba(124,112,174,0.15)" : "var(--gray-100)",
                border: "1px solid rgba(124,112,174,0.2)",
                color: "var(--gray-700)",
              }}>
                {p.label}
              </span>
            ))}
          </div>

          {/* Actions */}
          <div className="action-row">
            {!autoRunning ? (
              <>
                <button type="button" className="btn btn-primary" onClick={startAuto}>
                  Start Auto-Inject
                </button>
                <button type="button" className="btn btn-secondary" onClick={injectAll} disabled={oneLoading}>
                  {oneLoading ? "Injecting…" : `Inject All Once (${PRESETS.length}×)`}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={stopAuto}>
                Stop
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Recent Events ── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>
              Recent Events
              {activeFilterCount > 0 && (
                <span style={{
                  marginLeft: 10, fontSize: 11, padding: "2px 8px", borderRadius: 12,
                  background: "rgba(124,112,174,0.12)", color: "var(--brand-secondary)",
                  fontWeight: 600, verticalAlign: "middle",
                }}>
                  {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
                </span>
              )}
            </h3>
          </div>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => loadEvents()}>
            ↺ Refresh
          </button>
        </div>

        {/* Filter bar */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto auto auto auto",
          gap: 10, marginBottom: 18, alignItems: "end",
        }}>
          <div className="field" style={{ margin: 0 }}>
            <label style={{ fontSize: 11 }}>Org ID</label>
            <input
              value={filterOrg}
              onChange={(e) => setFilterOrg(e.target.value)}
              placeholder="Filter by org"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label style={{ fontSize: 11 }}>Tool / Model</label>
            <input
              value={filterTool}
              onChange={(e) => setFilterTool(e.target.value)}
              placeholder="Filter by tool or model"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label style={{ fontSize: 11 }}>Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ minWidth: 110 }}>
              <option value="">All</option>
              {(eventStatuses.length ? eventStatuses : ["success", "error", "partial"]).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label style={{ fontSize: 11 }}>Limit</label>
            <select value={filterLimit} onChange={(e) => setFilterLimit(Number(e.target.value))} style={{ minWidth: 80 }}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleSearch} style={{ marginTop: 18 }}>
            Search
          </button>
          {activeFilterCount > 0 && (
            <button type="button" className="btn btn-ghost" onClick={handleReset} style={{ marginTop: 18, fontSize: 12 }}>
              Reset
            </button>
          )}
        </div>

        {/* Date range row */}
        <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "end" }}>
          <div className="field" style={{ margin: 0, flex: 1 }}>
            <label style={{ fontSize: 11 }}>Start Date</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
            />
          </div>
          <div className="field" style={{ margin: 0, flex: 1 }}>
            <label style={{ fontSize: 11 }}>End Date</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
            />
          </div>
          <div style={{ flex: 3 }} />
        </div>

        {loadingEv && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--gray-500)", fontSize: 13 }}>
            Loading events…
          </div>
        )}

        {!loadingEv && (
          <div className="list-grid">
            {events.length === 0 && (
              <div className="empty-state">
                {activeFilterCount > 0
                  ? "No events match your filters. Try adjusting or resetting."
                  : "No events yet. Use Auto-Inject to simulate AI pipeline telemetry."}
              </div>
            )}
            {events.map((item) => (
              <div key={item.event_id} className="timeline-card">
                {/* Top row: tool + status */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 15 }}>{item.tool_name || item.model_name || "—"}</strong>
                    {item.provider && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: "var(--gray-500)", fontWeight: 400 }}>
                        via {item.provider}
                      </span>
                    )}
                  </div>
                  <span className={`status-pill ${(item.status || "").toLowerCase()}`} style={{ flexShrink: 0, marginLeft: 12 }}>
                    {item.status || "—"}
                  </span>
                </div>

                {/* Event ID + timestamp */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--gray-500)", fontFamily: "monospace" }}>
                    {truncate(item.event_id, 32)}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--gray-500)", flexShrink: 0 }}>
                    {fmtTs(item.created_at)}
                  </span>
                </div>

                {/* Org / Project badges */}
                {(item.org_id || item.project_id) && (
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {item.org_id && (
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 10,
                        background: "rgba(124,112,174,0.1)", color: "var(--brand-secondary)",
                        fontWeight: 600,
                      }}>
                        {item.org_id}
                      </span>
                    )}
                    {item.project_id && (
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 10,
                        background: "rgba(124,112,174,0.06)", color: "var(--gray-700)",
                      }}>
                        {item.project_id}
                      </span>
                    )}
                    {item.service_type && (
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 10,
                        background: "var(--gray-100)", color: "var(--gray-500)",
                      }}>
                        {item.service_type}
                      </span>
                    )}
                  </div>
                )}

                {/* Metric chips */}
                <div className="metric-chip-row" style={{ marginTop: 10 }}>
                  <span className="metric-chip">In <b>{item.prompt_tokens ?? 0}</b></span>
                  <span className="metric-chip">Out <b>{item.completion_tokens ?? 0}</b></span>
                  <span className="metric-chip">$<b>{Number(item.total_cost || 0).toFixed(4)}</b></span>
                  <span className="metric-chip"><b>{item.latency_ms ?? 0}</b> ms</span>
                  {Number(item.risk_score || 0) > 0 && (
                    <span className="metric-chip" style={{ color: "var(--brand-primary)" }}>
                      Risk <b>{Number(item.risk_score).toFixed(1)}</b>
                    </span>
                  )}
                </div>

                {/* Anomaly / misuse flags */}
                {(item.misuse_detected || item.abnormal_usage_spike) && (
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    {item.misuse_detected && (
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 10,
                        background: "rgba(158,42,151,0.1)", color: "var(--brand-primary)",
                        fontWeight: 600, border: "1px solid rgba(158,42,151,0.2)",
                      }}>
                        Misuse Detected
                      </span>
                    )}
                    {item.abnormal_usage_spike && (
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 10,
                        background: "rgba(230,126,34,0.1)", color: "#e67e22",
                        fontWeight: 600, border: "1px solid rgba(230,126,34,0.2)",
                      }}>
                        Usage Spike
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="action-row" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => openTrace(item.event_id)}>Trace</button>
                  <button type="button" className="btn btn-secondary" onClick={() => openEditModal(item)}>✎ Edit</button>
                  <button type="button" className="btn btn-ghost" style={{ color: "var(--brand-primary)" }} onClick={() => setDeleteConfirm(item.event_id)}>✕ Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loadingEv && events.length > 0 && (
          <div style={{ marginTop: 16, textAlign: "center", fontSize: 12, color: "var(--gray-500)" }}>
            Showing {events.length} event{events.length !== 1 ? "s" : ""}
            {activeFilterCount > 0 ? " (filtered)" : ""}
          </div>
        )}
      </section>

      {/* ── Delete confirm ── */}
      {deleteConfirm && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-dialog" style={{ maxWidth: 440, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ justifyContent: "center" }}><h3>Delete Event?</h3></div>
            <p style={{ color: "var(--gray-500)", margin: "0 0 8px" }}>This permanently removes the event and all related records.</p>
            <p style={{ fontWeight: 700, wordBreak: "break-all", margin: "0 0 20px" }}>{deleteConfirm}</p>
            <div className="action-row" style={{ justifyContent: "center" }}>
              <button type="button" className="btn btn-primary" style={{ background: "#c0392b" }} onClick={() => handleDelete(deleteConfirm)}>Yes, Delete</button>
              <button type="button" className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Trace modal ── */}
      {selectedTrace && (
        <div className="modal-backdrop" onClick={() => setSelectedTrace(null)}>
          <div className="modal-dialog" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Trace Details</h3>
                {selectedTrace.event?.trace_id && (
                  <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--gray-500)", marginTop: 2 }}>
                    {selectedTrace.event.trace_id}
                  </div>
                )}
              </div>
              <button type="button" className="btn-close" onClick={() => setSelectedTrace(null)}>✕</button>
            </div>

            <div className="stack">
              {/* Identity row */}
              <div className="trace-summary-bar">
                <div className="trace-summary-item" style={{ minWidth: 180, flex: 2 }}>
                  <span>Event ID</span>
                  <strong style={{ fontSize: 12, wordBreak: "break-all", fontFamily: "monospace" }}>
                    {selectedTrace.event.event_id}
                  </strong>
                </div>
                {selectedTrace.event.org_id && (
                  <div className="trace-summary-item">
                    <span>Organization</span>
                    <strong>{selectedTrace.event.org_id}</strong>
                  </div>
                )}
                {selectedTrace.event.project_id && (
                  <div className="trace-summary-item">
                    <span>Project</span>
                    <strong>{selectedTrace.event.project_id}</strong>
                  </div>
                )}
                <div className="trace-summary-item">
                  <span>Created</span>
                  <strong style={{ fontSize: 12 }}>{fmtTs(selectedTrace.event.created_at)}</strong>
                </div>
              </div>

              {/* Tool & model row */}
              <div className="trace-summary-bar" style={{ marginTop: 0 }}>
                <div className="trace-summary-item">
                  <span>Status</span>
                  <strong>
                    <span className={`status-pill ${(selectedTrace.event.status || "").toLowerCase()}`} style={{ fontSize: 11 }}>
                      {selectedTrace.event.status || "—"}
                    </span>
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
                {selectedTrace.event.provider && (
                  <div className="trace-summary-item">
                    <span>Provider</span>
                    <strong>{selectedTrace.event.provider}</strong>
                  </div>
                )}
                {selectedTrace.event.service_type && (
                  <div className="trace-summary-item">
                    <span>Service</span>
                    <strong>{selectedTrace.event.service_type}</strong>
                  </div>
                )}
              </div>

              {/* Tokens row */}
              <div className="trace-summary-bar" style={{ marginTop: 0 }}>
                <div className="trace-summary-item">
                  <span>Prompt Tokens</span>
                  <strong>{(selectedTrace.event.prompt_tokens ?? 0).toLocaleString()}</strong>
                </div>
                <div className="trace-summary-item">
                  <span>Completion Tokens</span>
                  <strong>{(selectedTrace.event.completion_tokens ?? 0).toLocaleString()}</strong>
                </div>
                <div className="trace-summary-item">
                  <span>Total Tokens</span>
                  <strong>{(selectedTrace.event.total_tokens ?? 0).toLocaleString()}</strong>
                </div>
                <div className="trace-summary-item">
                  <span>Latency</span>
                  <strong>{selectedTrace.event.latency_ms ?? "—"} ms</strong>
                </div>
              </div>

              {/* Cost row */}
              <div className="trace-summary-bar" style={{ marginTop: 0 }}>
                <div className="trace-summary-item">
                  <span>Total Cost</span>
                  <strong>${Number(selectedTrace.event.total_cost || 0).toFixed(6)}</strong>
                </div>
                <div className="trace-summary-item">
                  <span>LLM Cost</span>
                  <strong>${Number(selectedTrace.event.llm_cost || 0).toFixed(6)}</strong>
                </div>
                <div className="trace-summary-item">
                  <span>Infra Cost</span>
                  <strong>${Number(selectedTrace.event.infra_cost || 0).toFixed(6)}</strong>
                </div>
                <div className="trace-summary-item">
                  <span>Risk Score</span>
                  <strong style={{ color: Number(selectedTrace.event.risk_score || 0) > 0.6 ? "var(--brand-primary)" : "inherit" }}>
                    {Number(selectedTrace.event.risk_score || 0).toFixed(2)}
                  </strong>
                </div>
              </div>

              {/* Flags row — only if any flag is set */}
              {(selectedTrace.event.misuse_detected || selectedTrace.event.abnormal_usage_spike || selectedTrace.event.pii_type) && (
                <div style={{
                  display: "flex", gap: 10, flexWrap: "wrap",
                  padding: "10px 14px", borderRadius: 10,
                  background: "rgba(158,42,151,0.05)",
                  border: "1px solid rgba(158,42,151,0.15)",
                }}>
                  {selectedTrace.event.misuse_detected && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--brand-primary)" }}>
                      Misuse Detected
                    </span>
                  )}
                  {selectedTrace.event.abnormal_usage_spike && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#e67e22" }}>
                      Abnormal Usage Spike
                    </span>
                  )}
                  {selectedTrace.event.pii_type && (
                    <span style={{ fontSize: 12, color: "var(--gray-700)" }}>
                      PII: <strong>{selectedTrace.event.pii_type}</strong>
                    </span>
                  )}
                </div>
              )}

              {/* Stages table */}
              {(selectedTrace.event.stages || []).length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>#</th><th>Stage</th><th>System</th><th>Status</th><th>Latency</th><th>Retry</th></tr>
                    </thead>
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

              {/* Cost breakdown table */}
              {(selectedTrace.event.cost_breakdown || []).length > 0 && (
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600 }}>
                    Cost Breakdown ({selectedTrace.event.cost_breakdown.length})
                  </summary>
                  <div className="table-wrap" style={{ marginTop: 8 }}>
                    <table>
                      <thead>
                        <tr><th>Type</th><th>Component</th><th>Cost</th><th>Units</th></tr>
                      </thead>
                      <tbody>
                        {selectedTrace.event.cost_breakdown.map((cb, i) => (
                          <tr key={i}>
                            <td>{cb.cost_type || "—"}</td>
                            <td>{cb.component_name || "—"}</td>
                            <td>${Number(cb.cost || 0).toFixed(6)}</td>
                            <td>{cb.units ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              {/* Raw usage audit */}
              {selectedTrace.event.raw_usage_json && Object.keys(selectedTrace.event.raw_usage_json).length > 0 && (
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600 }}>
                    Raw Usage (Audit)
                  </summary>
                  <pre style={{ marginTop: 8, padding: 14, borderRadius: 14, background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.16)", fontSize: 12, overflow: "auto", maxHeight: 220 }}>
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
    </div>
  );
}

export default TestEvent;
