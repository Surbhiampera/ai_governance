import React, { useEffect, useState } from "react";
import { getTelemetryLogs, getTrace, postTelemetryEvent } from "../api";

const defaultEvent = {
  event_id: `evt-${Date.now()}`,
  request_id: `req-${Date.now()}`,
  trace_id: `trace-${Date.now()}`,
  org_id: "default",
  project_id: "governance-hub",
  user_id: "analyst-01",
  tool_name: "openai",
  provider: "OpenAI",
  model_name: "gpt-4.1",
  component_name: "answer-pipeline",
  service_type: "llm",
  execution_type: "chat",
  status: "success",
  latency_ms: 920,
  input_data_size_mb: 2.4,
  output_data_size_mb: 1.1,
  prompt_tokens: 2800,
  completion_tokens: 1100,
  infra_cost: 0.18,
  contains_pii: false,
  pii_type: "",
  data_out_violation: false,
  tags: "monitoring,production",
  stages: [
    { stage_order: 1, stage_name: "ingest", system_name: "gateway", status: "success", stage_latency_ms: 120, retry_count: 0, details: { queue: "api" } },
    { stage_order: 2, stage_name: "policy-check", system_name: "guardrail", status: "success", stage_latency_ms: 180, retry_count: 0, details: { rule_pack: "baseline" } },
    { stage_order: 3, stage_name: "model-execution", system_name: "llm", status: "success", stage_latency_ms: 620, retry_count: 0, details: { region: "us" } },
  ],
};

function TestEvent() {
  const [form, setForm] = useState(defaultEvent);
  const [events, setEvents] = useState([]);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadEvents = async () => {
    const response = await getTelemetryLogs({ limit: 12 });
    setEvents(response.data || []);
  };

  useEffect(() => {
    loadEvents().catch(() => setMessage("Unable to load recent traces."));
  }, []);

  const submitEvent = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await postTelemetryEvent({
        ...form,
        input_data_size_mb: Number(form.input_data_size_mb),
        output_data_size_mb: Number(form.output_data_size_mb),
        latency_ms: Number(form.latency_ms),
        prompt_tokens: Number(form.prompt_tokens),
        completion_tokens: Number(form.completion_tokens),
        infra_cost: Number(form.infra_cost),
        pii_type: form.pii_type || null,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      setMessage("Telemetry event ingested.");
      setForm({
        ...defaultEvent,
        event_id: `evt-${Date.now()}`,
        request_id: `req-${Date.now()}`,
        trace_id: `trace-${Date.now()}`,
      });
      await loadEvents();
    } catch {
      setMessage("Telemetry ingest failed. Check backend connectivity.");
    } finally {
      setSubmitting(false);
    }
  };

  const openTrace = async (eventId) => {
    const response = await getTrace(eventId);
    setSelectedTrace(response.data);
  };

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <h2>Event tracing and simulator for full request visibility.</h2>
          <p>
            Post a sample request with tokens, cost, latency, security attributes,
            and pipeline stages to validate the entire governance workflow end to end.
          </p>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h2>Simulator Status</h2>
              <p>Use this to generate telemetry and verify cost, alert, and tracing behavior.</p>
            </div>
          </div>
          <div className="list-item">
            <strong>Live feedback</strong>
            <div className="list-meta">{message || "No simulator actions yet."}</div>
          </div>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Ingest Test Event</h3>
              <p>Creates one full telemetry record with trace stages and governance signals.</p>
            </div>
          </div>

          <form className="stack" onSubmit={submitEvent}>
            <div className="form-grid">
              <div className="field">
                <label>Event ID</label>
                <input value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })} />
              </div>
              <div className="field">
                <label>Request ID</label>
                <input value={form.request_id} onChange={(e) => setForm({ ...form, request_id: e.target.value })} />
              </div>
              <div className="field">
                <label>Trace ID</label>
                <input value={form.trace_id} onChange={(e) => setForm({ ...form, trace_id: e.target.value })} />
              </div>
              <div className="field">
                <label>Tool Name</label>
                <input value={form.tool_name} onChange={(e) => setForm({ ...form, tool_name: e.target.value })} />
              </div>
              <div className="field">
                <label>Provider</label>
                <input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
              </div>
              <div className="field">
                <label>Model</label>
                <input value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} />
              </div>
              <div className="field">
                <label>Prompt Tokens</label>
                <input value={form.prompt_tokens} onChange={(e) => setForm({ ...form, prompt_tokens: e.target.value })} />
              </div>
              <div className="field">
                <label>Completion Tokens</label>
                <input value={form.completion_tokens} onChange={(e) => setForm({ ...form, completion_tokens: e.target.value })} />
              </div>
              <div className="field">
                <label>Latency ms</label>
                <input value={form.latency_ms} onChange={(e) => setForm({ ...form, latency_ms: e.target.value })} />
              </div>
              <div className="field">
                <label>Infra Cost</label>
                <input value={form.infra_cost} onChange={(e) => setForm({ ...form, infra_cost: e.target.value })} />
              </div>
              <div className="field">
                <label>Input MB</label>
                <input value={form.input_data_size_mb} onChange={(e) => setForm({ ...form, input_data_size_mb: e.target.value })} />
              </div>
              <div className="field">
                <label>Output MB</label>
                <input value={form.output_data_size_mb} onChange={(e) => setForm({ ...form, output_data_size_mb: e.target.value })} />
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label>PII Type</label>
                <input value={form.pii_type} onChange={(e) => setForm({ ...form, pii_type: e.target.value })} />
              </div>
              <div className="field">
                <label>Tags</label>
                <input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="monitoring,production"
                />
              </div>
            </div>

            <div className="action-row">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Submitting..." : "Ingest event"}
              </button>
            </div>
          </form>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Recent Traces</h3>
              <p>Select an event to inspect pipeline stages, security score, and costs.</p>
            </div>
          </div>
          <div className="list-grid">
            {events.map((item) => (
              <div key={item.event_id} className="timeline-card">
                <strong>{item.tool_name}</strong>
                <div className="list-meta">
                  {item.event_id} | {item.total_tokens} tokens | ${Number(item.total_cost || 0).toFixed(2)} |{" "}
                  {item.latency_ms} ms
                </div>
                <div className="action-row" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => openTrace(item.event_id)}>
                    Open trace
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Selected Trace</h3>
            <p>Request-level view of tokens, cost, latency, pipeline stages, and security controls.</p>
          </div>
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
