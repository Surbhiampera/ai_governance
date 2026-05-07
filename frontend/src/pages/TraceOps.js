import React, { useState } from "react";
import {
  enforcePolicy,
  gatewayRoute,
  getLiveStream,
  getPromptVersions,
  getRagAudit,
  getTraceGraph,
  getTraceOtel,
  getTraceReplay,
  registerPromptVersion,
} from "../api";

function TraceOps() {
  const [traceId, setTraceId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [policyProvider, setPolicyProvider] = useState("");
  const [policyModel, setPolicyModel] = useState("");
  const [policyPrompt, setPolicyPrompt] = useState("");
  const [gwPreferredProvider, setGwPreferredProvider] = useState("");
  const [gwPreferredModel, setGwPreferredModel] = useState("");
  const [gwFailProvider, setGwFailProvider] = useState("");
  const [gwFallbackChain, setGwFallbackChain] = useState("");
  const [graph, setGraph] = useState(null);
  const [replay, setReplay] = useState(null);
  const [live, setLive] = useState([]);
  const [otel, setOtel] = useState(null);
  const [policyResult, setPolicyResult] = useState(null);
  const [gatewayResult, setGatewayResult] = useState(null);
  const [ragRows, setRagRows] = useState([]);
  const [versions, setVersions] = useState([]);
  const [msg, setMsg] = useState("");

  const loadTrace = async () => {
    if (!traceId.trim()) return;
    const [g, r, o, v] = await Promise.all([
      getTraceGraph(traceId.trim()),
      getTraceReplay(traceId.trim()),
      getTraceOtel(traceId.trim()),
      getPromptVersions(traceId.trim()),
    ]);
    setGraph(g.data);
    setReplay(r.data);
    setOtel(o.data);
    setVersions(v.data || []);
  };

  const loadLive = async () => {
    const res = await getLiveStream({
      org_id: orgId || undefined,
      project_id: projectId || undefined,
      trace_id: traceId || undefined,
      limit: 200,
    });
    setLive(res.data || []);
  };

  const runPolicyCheck = async () => {
    if (!orgId.trim() || !policyProvider.trim() || !policyModel.trim()) {
      setMsg("Enter org + policy provider + policy model first.");
      return;
    }
    const res = await enforcePolicy({
      org_id: orgId.trim(),
      project_id: projectId.trim() || null,
      provider: policyProvider.trim(),
      model_name: policyModel.trim(),
      prompt: policyPrompt || "",
    });
    setPolicyResult(res.data);
  };

  const runGatewaySimulation = async () => {
    if (!orgId.trim() || !gwPreferredProvider.trim() || !gwPreferredModel.trim()) {
      setMsg("Enter org + gateway preferred provider + gateway preferred model first.");
      return;
    }
    let fallback_chain = [];
    if (gwFallbackChain.trim()) {
      try {
        fallback_chain = JSON.parse(gwFallbackChain);
      } catch {
        setMsg("Fallback chain must be valid JSON array like [{\"provider\":\"x\",\"model\":\"y\"}]");
        return;
      }
    }
    const res = await gatewayRoute({
      org_id: orgId.trim(),
      project_id: projectId.trim() || null,
      preferred_provider: gwPreferredProvider.trim(),
      preferred_model: gwPreferredModel.trim(),
      fallback_chain,
      simulate_failure_for_provider: gwFailProvider.trim() || null,
      trace_id: traceId || undefined,
    });
    setGatewayResult(res.data);
    setTraceId(res.data.trace_id || traceId);
  };

  const loadRagAudit = async () => {
    const res = await getRagAudit({
      org_id: orgId || undefined,
      project_id: projectId || undefined,
      trace_id: traceId || undefined,
      limit: 100,
    });
    setRagRows(res.data || []);
  };

  const addPromptVersion = async () => {
    if (!traceId.trim()) {
      setMsg("Enter trace id first.");
      return;
    }
    const res = await registerPromptVersion({
      trace_id: traceId.trim(),
      org_id: orgId.trim(),
      project_id: projectId.trim() || null,
      prompt_text: policyPrompt || "",
      response_text: null,
      metadata_json: { source: "trace-ops-ui" },
    });
    setMsg(`Prompt version added: ${res.data.version_id}`);
    await loadTrace();
  };

  return (
    <div className="page-shell">
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Advanced Trace Ops</h2>
        <p style={{ color: "var(--gray-500)", marginTop: 4 }}>
          Workflow graph, distributed trace replay, streaming telemetry, policy enforcement, gateway routing, OTel export, and RAG audit.
        </p>
        <div className="form-grid">
          <div className="field"><label>Org ID</label><input value={orgId} onChange={(e) => setOrgId(e.target.value)} /></div>
          <div className="field"><label>Project ID</label><input value={projectId} onChange={(e) => setProjectId(e.target.value)} /></div>
          <div className="field"><label>Trace ID</label><input value={traceId} onChange={(e) => setTraceId(e.target.value)} /></div>
        </div>
        <div className="form-grid" style={{ marginTop: 10 }}>
          <div className="field"><label>Policy Provider</label><input value={policyProvider} onChange={(e) => setPolicyProvider(e.target.value)} placeholder="e.g. openai" /></div>
          <div className="field"><label>Policy Model</label><input value={policyModel} onChange={(e) => setPolicyModel(e.target.value)} placeholder="e.g. gpt-4o" /></div>
          <div className="field"><label>Policy Prompt</label><input value={policyPrompt} onChange={(e) => setPolicyPrompt(e.target.value)} placeholder="prompt to evaluate" /></div>
        </div>
        <div className="form-grid" style={{ marginTop: 10 }}>
          <div className="field"><label>Gateway Preferred Provider</label><input value={gwPreferredProvider} onChange={(e) => setGwPreferredProvider(e.target.value)} /></div>
          <div className="field"><label>Gateway Preferred Model</label><input value={gwPreferredModel} onChange={(e) => setGwPreferredModel(e.target.value)} /></div>
          <div className="field"><label>Simulate Fail Provider</label><input value={gwFailProvider} onChange={(e) => setGwFailProvider(e.target.value)} placeholder="optional" /></div>
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>Gateway Fallback Chain (JSON)</label>
          <input value={gwFallbackChain} onChange={(e) => setGwFallbackChain(e.target.value)} placeholder='[{"provider":"anthropic","model":"..."},{"provider":"google","model":"..."}]' />
        </div>
        <div className="action-row">
          <button className="btn btn-primary" onClick={loadTrace}>Load Graph + Replay + OTel</button>
          <button className="btn btn-secondary" onClick={loadLive}>Live Stream</button>
          <button className="btn btn-secondary" onClick={runPolicyCheck}>Policy Enforce Check</button>
          <button className="btn btn-secondary" onClick={runGatewaySimulation}>Gateway Failover Sim</button>
          <button className="btn btn-secondary" onClick={loadRagAudit}>RAG Audit</button>
          <button className="btn btn-ghost" onClick={addPromptVersion}>Add Prompt Version</button>
        </div>
        {msg && <div className="feedback-msg" style={{ marginTop: 10 }}>{msg}</div>}
      </section>

      {graph && (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Workflow Execution Graph</h3>
          <p style={{ color: "var(--gray-500)" }}>Nodes: {graph.nodes?.length || 0} · Edges: {graph.edges?.length || 0}</p>
          <pre style={{ maxHeight: 260, overflow: "auto" }}>{JSON.stringify(graph, null, 2)}</pre>
        </section>
      )}

      {replay && (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Step-by-Step Replay</h3>
          <pre style={{ maxHeight: 260, overflow: "auto" }}>{JSON.stringify(replay.timeline || [], null, 2)}</pre>
        </section>
      )}

      {live.length > 0 && (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Real-Time Streaming Telemetry</h3>
          <pre style={{ maxHeight: 240, overflow: "auto" }}>{JSON.stringify(live, null, 2)}</pre>
        </section>
      )}

      {policyResult && (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Policy Enforcement Result</h3>
          <pre>{JSON.stringify(policyResult, null, 2)}</pre>
        </section>
      )}

      {gatewayResult && (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Gateway Routing Result</h3>
          <pre>{JSON.stringify(gatewayResult, null, 2)}</pre>
        </section>
      )}

      {otel && (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>OpenTelemetry Export</h3>
          <pre style={{ maxHeight: 200, overflow: "auto" }}>{JSON.stringify(otel, null, 2)}</pre>
        </section>
      )}

      {ragRows.length > 0 && (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Retrieval / RAG Governance Audit</h3>
          <pre style={{ maxHeight: 220, overflow: "auto" }}>{JSON.stringify(ragRows, null, 2)}</pre>
        </section>
      )}

      {versions.length > 0 && (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Prompt/Response Version Lineage</h3>
          <pre style={{ maxHeight: 220, overflow: "auto" }}>{JSON.stringify(versions, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}

export default TraceOps;
