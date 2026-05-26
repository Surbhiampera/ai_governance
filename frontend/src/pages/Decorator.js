import React, { useCallback, useEffect, useState } from "react";
import {
  getDecoratorRegistrations,
  getDecoratorInventory,
  getDecoratorUsage,
  getDecoratorLogs,
  getDecoratorStats,
} from "../api";

const fmt      = (n) => (n == null ? "—" : Number(n).toLocaleString());
const pct      = (n) => (n == null ? "—" : `${Number(n).toFixed(1)}%`);
const fmtCost  = (v) => (v == null || Number(v) === 0 ? "—" : `$${Number(v).toFixed(6)}`);
const fmtDate  = (v) =>
  v ? new Date(v).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—";
const fmtBytes = (b) => {
  if (!b) return "—";
  if (b >= 1048576) return `${(b / 1048576).toFixed(2)} MB`;
  if (b >= 1024)    return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
};
const fmtMs = (ms) => (ms == null ? "—" : `${Number(ms).toLocaleString()} ms`);

const TYPE_CLASS = { trace: "", llm_call: "warning", pipeline: "success", tool_call: "medium" };
const badge = (type) => (
  <span className={`status-pill ${TYPE_CLASS[type] ?? ""}`.trim()}>{type || "trace"}</span>
);

const TABS = ["Overview", "Registry", "Inventory", "Model Usage", "History Logs"];

// ─── main component ───────────────────────────────────────────────────────────
export default function Decorator() {
  const [tab,           setTab]           = useState("Overview");
  const [stats,         setStats]         = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [inventory,     setInventory]     = useState([]);
  const [usage,         setUsage]         = useState([]);
  const [logs,          setLogs]          = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);

  // shared filters
  const [orgId,      setOrgId]      = useState("");
  const [projectId,  setProjectId]  = useState("");
  const [toolName,   setToolName]   = useState("");
  const [knownTools, setKnownTools] = useState([]);

  // log-specific filters
  const [logFnFilter,    setLogFnFilter]    = useState("");
  const [logTraceFilter, setLogTraceFilter] = useState("");
  const [logPiiFilter,   setLogPiiFilter]   = useState("");

  useEffect(() => {
    Promise.all([
      getDecoratorRegistrations({ limit: 1000 }),
      getDecoratorInventory({ limit: 1000 }),
    ]).then(([r, i]) => {
      const names = new Set();
      (r.data?.items || []).forEach((x) => x.tool_name && names.add(x.tool_name));
      (i.data?.items || []).forEach((x) => x.tool_name && names.add(x.tool_name));
      setKnownTools([...names].sort());
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = {
        org_id:     orgId     || undefined,
        project_id: projectId || undefined,
        tool_name:  toolName  || undefined,
      };
      const logParams = {
        ...base,
        function_name: logFnFilter    || undefined,
        trace_id:      logTraceFilter || undefined,
        pii_detected:  logPiiFilter === "yes" ? true : logPiiFilter === "no" ? false : undefined,
        limit: 500,
      };
      const [s, r, i, u, l] = await Promise.all([
        getDecoratorStats(base.org_id),
        getDecoratorRegistrations({ ...base, limit: 500 }),
        getDecoratorInventory({ ...base, limit: 500 }),
        getDecoratorUsage(base),
        getDecoratorLogs(logParams),
      ]);
      setStats(s.data);
      const regs = r.data?.items || [];
      const invs = i.data?.items || [];
      setRegistrations(regs);
      setInventory(invs);
      setUsage(u.data?.items || []);
      setLogs(l.data?.items || []);
      setKnownTools((prev) => {
        const names = new Set(prev);
        regs.forEach((x) => x.tool_name && names.add(x.tool_name));
        invs.forEach((x) => x.tool_name && names.add(x.tool_name));
        return [...names].sort();
      });
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [orgId, projectId, toolName, logFnFilter, logTraceFilter, logPiiFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page-shell">
      {/* header + shared filters */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h2 style={{ margin: 0 }}>Tool Logger — Governance Telemetry</h2>
            <p>
              Auto-populated from <code>@governance_logger()</code> on any tool, function, or
              FastAPI route. Cost is calculated from the platform's model pricing table —
              no rates are hardcoded.
            </p>
          </div>
          <button className="btn btn-primary" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        <div className="action-row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          {[["Org ID", orgId, setOrgId], ["Project ID", projectId, setProjectId]].map(
            ([label, val, setter]) => (
              <div key={label} className="field" style={{ minWidth: 180 }}>
                <label>{label}</label>
                <input value={val} onChange={(e) => setter(e.target.value)}
                  placeholder={`Filter by ${label.toLowerCase()}`} />
              </div>
            )
          )}
          <div className="field" style={{ minWidth: 200 }}>
            <label>Tool Name</label>
            <select value={toolName} onChange={(e) => setToolName(e.target.value)}>
              <option value="">All tools</option>
              {knownTools.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </section>

      {error && <div className="error-message">{error}</div>}

      {/* tabs */}
      <div style={{ display: "flex", borderBottom: "2px solid rgba(124,112,174,0.14)" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "10px 20px", border: "none", background: "none", cursor: "pointer",
            fontWeight: tab === t ? 700 : 400,
            color: tab === t ? "var(--brand-primary)" : "var(--gray-500)",
            borderBottom: tab === t ? "2px solid var(--brand-primary)" : "2px solid transparent",
            marginBottom: -2, fontSize: 14, transition: "color 0.18s ease",
          }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview"      && <OverviewPanel stats={stats} registrations={registrations} inventory={inventory} logs={logs} />}
      {tab === "Registry"      && <RegistryPanel rows={registrations} />}
      {tab === "Inventory"     && <InventoryPanel rows={inventory} />}
      {tab === "Model Usage"   && <UsagePanel rows={usage} />}
      {tab === "History Logs"  && (
        <LogsPanel
          rows={logs}
          fnFilter={logFnFilter}    setFnFilter={setLogFnFilter}
          traceFilter={logTraceFilter} setTraceFilter={setLogTraceFilter}
          piiFilter={logPiiFilter}  setPiiFilter={setLogPiiFilter}
          onApply={load}
        />
      )}
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function OverviewPanel({ stats, registrations, inventory, logs }) {
  // cost by tool from logs
  const toolCostMap = {};
  logs.forEach((r) => {
    const key = r.tool_name || r.function_name || "unknown";
    if (!toolCostMap[key]) toolCostMap[key] = { tool: key, cost: 0, calls: 0 };
    toolCostMap[key].cost  += Number(r.estimated_cost_usd || 0);
    toolCostMap[key].calls += 1;
  });
  const toolCosts = Object.values(toolCostMap).sort((a, b) => b.cost - a.cost);

  const toolMap = {};
  inventory.forEach((r) => {
    if (!toolMap[r.tool_name]) toolMap[r.tool_name] = { tool: r.tool_name, calls: 0, errors: 0, fns: 0 };
    toolMap[r.tool_name].calls  += Number(r.total_calls || 0);
    toolMap[r.tool_name].errors += Number(r.error_calls || 0);
    toolMap[r.tool_name].fns   += 1;
  });
  const topTools = Object.values(toolMap).sort((a, b) => b.calls - a.calls).slice(0, 10);

  const totalCost = toolCosts.reduce((s, t) => s + t.cost, 0);

  return (
    <>
      <div className="stats-grid">
        {[
          { label: "Registered Functions", value: fmt(stats?.registered_functions) },
          { label: "Inventory Functions",  value: fmt(stats?.inventory_functions)  },
          { label: "Usage Records",        value: fmt(stats?.usage_records)        },
          { label: "Audit Log Entries",    value: fmt(stats?.audit_log_entries)    },
          { label: "Total Cost (logs)",    value: totalCost > 0 ? `$${totalCost.toFixed(4)}` : "—" },
        ].map((c) => (
          <div key={c.label} className="metric-card">
            <div className="metric-eyebrow">{c.label}</div>
            <div className="metric-value">{c.value}</div>
          </div>
        ))}
      </div>

      {/* cost by tool */}
      {toolCosts.length > 0 && (
        <section className="panel">
          <div className="section-head"><div><h3>Cost by Tool</h3></div></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{["Tool / Function", "Calls", "Total Cost (USD)", "Avg Cost/Call"].map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {toolCosts.map((t) => (
                  <tr key={t.tool}>
                    <td><strong>{t.tool}</strong></td>
                    <td style={{ textAlign: "right" }}>{fmt(t.calls)}</td>
                    <td style={{ textAlign: "right" }}>{fmtCost(t.cost)}</td>
                    <td style={{ textAlign: "right" }}>{fmtCost(t.calls ? t.cost / t.calls : null)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td>Total</td>
                  <td style={{ textAlign: "right" }}>{fmt(logs.length)}</td>
                  <td style={{ textAlign: "right" }}>{fmtCost(totalCost)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-head"><div><h3>Top Tools by Call Volume</h3></div></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{["Tool", "Functions", "Total Calls", "Errors", "Error Rate"].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {topTools.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--gray-500)" }}>No data yet</td></tr>
              ) : topTools.map((t) => (
                <tr key={t.tool}>
                  <td><strong>{t.tool}</strong></td>
                  <td>{fmt(t.fns)}</td>
                  <td>{fmt(t.calls)}</td>
                  <td style={{ color: t.errors > 0 ? "var(--brand-primary)" : "var(--gray-300)" }}>{fmt(t.errors)}</td>
                  <td>{pct(t.calls ? (t.errors / t.calls) * 100 : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ─── Registry ─────────────────────────────────────────────────────────────────
function RegistryPanel({ rows }) {
  return (
    <TableWrapper
      title="Decorator Registry"
      subtitle="Every decorated function that has emitted telemetry. Updated on first invocation."
      headers={["Function", "Tool", "Module", "Type", "Env", "SDK Ver", "First Seen", "Last Seen", "Calls"]}
      empty={rows.length === 0}
    >
      {rows.map((r) => (
        <tr key={r.id}>
          <td><code style={{ fontSize: 12 }}>{r.function_name}</code></td>
          <td>{r.tool_name}</td>
          <td style={{ color: "var(--gray-500)", fontSize: 12 }}>{r.module_path || "—"}</td>
          <td>{badge(r.decorator_type)}</td>
          <td>{r.execution_env || "—"}</td>
          <td>{r.sdk_version || "—"}</td>
          <td>{fmtDate(r.first_seen)}</td>
          <td>{fmtDate(r.last_seen)}</td>
          <td style={{ textAlign: "right" }}>{fmt(r.call_count)}</td>
        </tr>
      ))}
    </TableWrapper>
  );
}

// ─── Inventory ────────────────────────────────────────────────────────────────
function InventoryPanel({ rows }) {
  return (
    <TableWrapper
      title="Tool API Inventory"
      subtitle="Auto-discovered function catalog. Upserted on every call with live call stats."
      headers={["Function", "Tool", "Type", "Total", "Success", "Errors", "Error %", "Avg Latency", "Last Seen"]}
      empty={rows.length === 0}
    >
      {rows.map((r) => (
        <tr key={r.id}>
          <td><code style={{ fontSize: 12 }}>{r.function_name}</code></td>
          <td>{r.tool_name}</td>
          <td>{badge(r.decorator_type)}</td>
          <td style={{ textAlign: "right" }}>{fmt(r.total_calls)}</td>
          <td style={{ textAlign: "right", color: "#228b62" }}>{fmt(r.success_calls)}</td>
          <td style={{ textAlign: "right", color: r.error_calls > 0 ? "var(--brand-primary)" : "var(--gray-300)" }}>
            {fmt(r.error_calls)}
          </td>
          <td style={{ textAlign: "right" }}>{pct(r.error_rate)}</td>
          <td style={{ textAlign: "right" }}>{fmt(r.avg_latency_ms)} ms</td>
          <td>{fmtDate(r.last_seen)}</td>
        </tr>
      ))}
    </TableWrapper>
  );
}

// ─── Model Usage ──────────────────────────────────────────────────────────────
function UsagePanel({ rows }) {
  return (
    <TableWrapper
      title="Project × Model Daily Usage"
      subtitle="Daily aggregations per project and model. Cost comes from the platform's model_pricing table."
      headers={["Date", "Project", "Model", "Provider", "Calls", "Prompt Tokens", "Completion Tokens", "Total Cost", "Avg Latency"]}
      empty={rows.length === 0}
    >
      {rows.map((r) => (
        <tr key={r.id}>
          <td>{r.date}</td>
          <td>{r.project_id || <span style={{ color: "var(--gray-300)" }}>—</span>}</td>
          <td><strong>{r.model_name}</strong></td>
          <td>{r.provider || "—"}</td>
          <td style={{ textAlign: "right" }}>{fmt(r.call_count)}</td>
          <td style={{ textAlign: "right" }}>{fmt(r.total_prompt_tokens)}</td>
          <td style={{ textAlign: "right" }}>{fmt(r.total_completion_tokens)}</td>
          <td style={{ textAlign: "right" }}>{fmtCost(r.total_cost)}</td>
          <td style={{ textAlign: "right" }}>{fmt(r.avg_latency_ms)} ms</td>
        </tr>
      ))}
    </TableWrapper>
  );
}

// ─── History / Audit Logs ─────────────────────────────────────────────────────
function LogsPanel({ rows, fnFilter, setFnFilter, traceFilter, setTraceFilter, piiFilter, setPiiFilter, onApply }) {
  const [expanded, setExpanded] = useState({});

  const toggle = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const totalCost       = rows.reduce((s, r) => s + Number(r.estimated_cost_usd || 0), 0);
  const totalPrompt     = rows.reduce((s, r) => s + Number(r.prompt_tokens     || 0), 0);
  const totalCompletion = rows.reduce((s, r) => s + Number(r.completion_tokens || 0), 0);
  const totalTokens     = rows.reduce((s, r) => s + Number(r.total_tokens      || 0), 0);
  const hasAnyCost      = rows.some((r) => r.estimated_cost_usd != null && Number(r.estimated_cost_usd) > 0);
  const hasAnyTokens    = rows.some((r) => Number(r.prompt_tokens || 0) + Number(r.total_tokens || 0) > 0);

  // cost by tool for the current filtered view
  const toolCostMap = {};
  rows.forEach((r) => {
    const key = r.tool_name || r.function_name || "unknown";
    if (!toolCostMap[key]) toolCostMap[key] = { tool: key, cost: 0, calls: 0 };
    toolCostMap[key].cost  += Number(r.estimated_cost_usd || 0);
    toolCostMap[key].calls += 1;
  });
  const toolCosts = Object.values(toolCostMap).sort((a, b) => b.cost - a.cost);

  const HEADERS = [
    "Timestamp", "Tool", "Function", "Trace ID", "User",
    "Model", "Provider",
    "In Tokens", "Out Tokens", "Total Tokens",
    "Latency", "Cost (USD)", "In Size", "Out Size", "PII", "",
  ];

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>History Log</h3>
          <p>
            Every decorated invocation — one row per call. Cost is calculated by the platform's
            CostEngine from <code>model_pricing</code> — no rates are hardcoded.
          </p>
        </div>
      </div>

      {/* log-level filters */}
      <div className="action-row" style={{ alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <div className="field" style={{ minWidth: 200 }}>
          <label>Function Name</label>
          <input value={fnFilter} onChange={(e) => setFnFilter(e.target.value)}
            placeholder="Filter by function…" />
        </div>
        <div className="field" style={{ minWidth: 240 }}>
          <label>Trace ID</label>
          <input value={traceFilter} onChange={(e) => setTraceFilter(e.target.value)}
            placeholder="Filter by trace ID…" />
        </div>
        <div className="field" style={{ minWidth: 140 }}>
          <label>PII</label>
          <select value={piiFilter} onChange={(e) => setPiiFilter(e.target.value)}>
            <option value="">All</option>
            <option value="yes">PII detected</option>
            <option value="no">No PII</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={onApply} style={{ alignSelf: "flex-end" }}>
          Apply
        </button>
      </div>

      {/* summary strip */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "0 0 16px" }}>
        {[
          { label: "Total Calls",       value: fmt(rows.length) },
          { label: "Prompt Tokens",     value: hasAnyTokens ? fmt(totalPrompt)     : "—" },
          { label: "Completion Tokens", value: hasAnyTokens ? fmt(totalCompletion) : "—" },
          { label: "Total Tokens",      value: hasAnyTokens ? fmt(totalTokens)     : "—" },
          { label: "Total Cost",        value: hasAnyCost   ? `$${totalCost.toFixed(6)}` : "—" },
        ].map((c) => (
          <div key={c.label} className="metric-card" style={{ flex: "1 1 120px", minWidth: 110 }}>
            <div className="metric-eyebrow">{c.label}</div>
            <div className="metric-value" style={{ fontSize: 18 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* cost by tool strip */}
      {toolCosts.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "var(--gray-600)" }}>
            Cost by Tool (current view)
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {toolCosts.map((t) => (
              <div key={t.tool} style={{
                background: "var(--gray-50)", border: "1px solid var(--gray-100)",
                borderRadius: 8, padding: "8px 14px", minWidth: 140,
              }}>
                <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 2 }}>{t.tool}</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{fmtCost(t.cost)}</div>
                <div style={{ fontSize: 11, color: "var(--gray-400)" }}>{t.calls} call{t.calls !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>{HEADERS.map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={HEADERS.length} style={{ textAlign: "center", color: "var(--gray-500)", padding: 32 }}>
                  No logs yet — decorate any function with <code>@governance_logger()</code> to start logging.
                </td>
              </tr>
            ) : rows.map((r) => (
              <>
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmtDate(r.created_at)}</td>
                  <td><strong style={{ fontSize: 12 }}>{r.tool_name || r.route || "—"}</strong></td>
                  <td><code style={{ fontSize: 11 }}>{r.function_name || "—"}</code></td>
                  <td>
                    {r.trace_id
                      ? <code style={{ fontSize: 10, color: "var(--gray-500)" }}>{r.trace_id.slice(0, 12)}…</code>
                      : <span style={{ color: "var(--gray-300)" }}>—</span>}
                  </td>
                  <td style={{ fontSize: 12 }}>{r.user_id || <span style={{ color: "var(--gray-300)" }}>—</span>}</td>
                  <td>{r.model_name || <span style={{ color: "var(--gray-300)" }}>—</span>}</td>
                  <td>{r.provider   || <span style={{ color: "var(--gray-300)" }}>—</span>}</td>
                  <td style={{ textAlign: "right" }}>{fmt(r.prompt_tokens)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(r.completion_tokens)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(r.total_tokens)}</td>
                  <td style={{ textAlign: "right" }}>{fmtMs(r.latency_ms)}</td>
                  <td style={{ textAlign: "right" }}>{fmtCost(r.estimated_cost_usd)}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>{fmtBytes(r.input_size_bytes)}</td>
                  <td style={{ textAlign: "right", fontSize: 12 }}>{fmtBytes(r.output_size_bytes)}</td>
                  <td style={{ textAlign: "center" }}>
                    {r.pii_detected
                      ? <span className="status-pill critical" title={r.pii_fields || ""}>YES</span>
                      : <span style={{ color: "var(--gray-300)" }}>—</span>}
                  </td>
                  <td>
                    {(r.input_preview || r.output_preview) && (
                      <button
                        onClick={() => toggle(r.id)}
                        style={{ fontSize: 11, padding: "2px 8px", cursor: "pointer",
                          border: "1px solid var(--gray-200)", borderRadius: 4, background: "none" }}
                      >
                        {expanded[r.id] ? "▲ Hide" : "▼ I/O"}
                      </button>
                    )}
                  </td>
                </tr>
                {expanded[r.id] && (
                  <tr key={`${r.id}-preview`} style={{ background: "var(--gray-50)" }}>
                    <td colSpan={HEADERS.length} style={{ padding: "10px 16px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gray-500)", marginBottom: 4 }}>
                            INPUT PREVIEW
                          </div>
                          <pre style={{ fontSize: 11, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
                            background: "var(--gray-100)", padding: 8, borderRadius: 4, maxHeight: 120, overflow: "auto" }}>
                            {r.input_preview || "—"}
                          </pre>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gray-500)", marginBottom: 4 }}>
                            OUTPUT PREVIEW
                          </div>
                          <pre style={{ fontSize: 11, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
                            background: "var(--gray-100)", padding: 8, borderRadius: 4, maxHeight: 120, overflow: "auto" }}>
                            {r.output_preview || "—"}
                          </pre>
                        </div>
                      </div>
                      {r.trace_id && (
                        <div style={{ marginTop: 8, fontSize: 11, color: "var(--gray-500)" }}>
                          <strong>Trace:</strong> <code>{r.trace_id}</code>
                          {r.user_id && <> &nbsp;|&nbsp; <strong>User:</strong> {r.user_id}</>}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: "2px solid rgba(124,112,174,0.2)" }}>
                <td colSpan={7} style={{ paddingTop: 8 }}>Totals ({rows.length} calls)</td>
                <td style={{ textAlign: "right", paddingTop: 8 }}>{hasAnyTokens ? fmt(totalPrompt)     : "—"}</td>
                <td style={{ textAlign: "right", paddingTop: 8 }}>{hasAnyTokens ? fmt(totalCompletion) : "—"}</td>
                <td style={{ textAlign: "right", paddingTop: 8 }}>{hasAnyTokens ? fmt(totalTokens)     : "—"}</td>
                <td style={{ paddingTop: 8 }}>—</td>
                <td style={{ textAlign: "right", paddingTop: 8 }}>{hasAnyCost ? `$${totalCost.toFixed(6)}` : "—"}</td>
                <td colSpan={4} style={{ paddingTop: 8 }} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

// ─── shared table wrapper ─────────────────────────────────────────────────────
function TableWrapper({ title, subtitle, headers, empty, children }) {
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {empty ? (
              <tr>
                <td colSpan={headers.length} style={{ textAlign: "center", color: "var(--gray-500)", padding: 32 }}>
                  No data yet — add <code>@governance_logger()</code> to any function to start logging.
                </td>
              </tr>
            ) : children}
          </tbody>
        </table>
      </div>
    </section>
  );
}
