import React, { useCallback, useEffect, useState } from "react";
import {
  getDecoratorRegistrations,
  getDecoratorInventory,
  getDecoratorUsage,
  getDecoratorLogs,
  getDecoratorStats,
} from "../api";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
const pct = (n) => (n == null ? "—" : `${Number(n).toFixed(1)}%`);

const TYPE_CLASS = {
  trace:     "",
  llm_call:  "warning",
  pipeline:  "success",
  tool_call: "medium",
};

const badge = (type) => (
  <span className={`status-pill ${TYPE_CLASS[type] ?? ""}`.trim()}>
    {type || "trace"}
  </span>
);

const fmtDate = (v) =>
  v ? new Date(v).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—";

const TABS = ["Overview", "Registry", "Inventory", "Model Usage", "Audit Logs"];

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

  const [orgId,      setOrgId]      = useState("");
  const [projectId,  setProjectId]  = useState("");
  const [toolName,   setToolName]   = useState("");
  const [knownTools, setKnownTools] = useState([]);

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
      const params = {
        org_id:     orgId     || undefined,
        project_id: projectId || undefined,
        tool_name:  toolName  || undefined,
      };
      const [s, r, i, u, l] = await Promise.all([
        getDecoratorStats(params.org_id),
        getDecoratorRegistrations(params),
        getDecoratorInventory(params),
        getDecoratorUsage(params),
        getDecoratorLogs({}),
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
      setError(e.message || "Failed to load decorator data");
    } finally {
      setLoading(false);
    }
  }, [orgId, projectId, toolName]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page-shell">
      {/* ─── header + filters ── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h2 style={{ margin: 0 }}>Decorator Framework</h2>
            <p>
              Auto-populated telemetry from <code>@gov.trace()</code>,{" "}
              <code>@gov.llm_call()</code>, <code>@gov.pipeline()</code>, and{" "}
              <code>@gov.tool_call()</code> decorators across all connected tools.
            </p>
          </div>
          <button className="btn btn-primary" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        <div className="action-row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          {[
            ["Org ID",     orgId,     setOrgId],
            ["Project ID", projectId, setProjectId],
          ].map(([label, val, setter]) => (
            <div key={label} className="field" style={{ minWidth: 180 }}>
              <label>{label}</label>
              <input
                value={val}
                onChange={(e) => setter(e.target.value)}
                placeholder={`Filter by ${label.toLowerCase()}`}
              />
            </div>
          ))}

          <div className="field" style={{ minWidth: 200 }}>
            <label>
              Tool Name
              {knownTools.length === 0 && (
                <span style={{ marginLeft: 6, fontWeight: 400, opacity: 0.6 }}>
                  (none registered yet)
                </span>
              )}
            </label>
            <select value={toolName} onChange={(e) => setToolName(e.target.value)}>
              <option value="">All tools</option>
              {knownTools.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </section>

      {error && <div className="error-message">{error}</div>}

      {/* ─── tabs ── */}
      <div style={{ display: "flex", borderBottom: "2px solid rgba(124,112,174,0.14)" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 20px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? "var(--brand-primary)" : "var(--gray-500)",
              borderBottom: tab === t ? "2px solid var(--brand-primary)" : "2px solid transparent",
              marginBottom: -2,
              fontSize: 14,
              transition: "color 0.18s ease",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ─── tab panels ── */}
      {tab === "Overview"    && <OverviewPanel stats={stats} registrations={registrations} inventory={inventory} />}
      {tab === "Registry"    && <RegistryPanel rows={registrations} />}
      {tab === "Inventory"   && <InventoryPanel rows={inventory} />}
      {tab === "Model Usage" && <UsagePanel rows={usage} />}
      {tab === "Audit Logs"  && <LogsPanel rows={logs} />}
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function OverviewPanel({ stats, registrations, inventory }) {
  const cards = [
    { label: "Registered Functions", value: fmt(stats?.registered_functions) },
    { label: "Inventory Functions",  value: fmt(stats?.inventory_functions)  },
    { label: "Usage Records",        value: fmt(stats?.usage_records)        },
    { label: "Audit Log Entries",    value: fmt(stats?.audit_log_entries)    },
  ];

  const toolMap = {};
  inventory.forEach((r) => {
    if (!toolMap[r.tool_name]) toolMap[r.tool_name] = { tool: r.tool_name, calls: 0, errors: 0, fns: 0 };
    toolMap[r.tool_name].calls  += Number(r.total_calls || 0);
    toolMap[r.tool_name].errors += Number(r.error_calls || 0);
    toolMap[r.tool_name].fns    += 1;
  });
  const topTools = Object.values(toolMap).sort((a, b) => b.calls - a.calls).slice(0, 5);

  return (
    <>
      <div className="stats-grid">
        {cards.map((c) => (
          <div key={c.label} className="metric-card">
            <div className="metric-eyebrow">{c.label}</div>
            <div className="metric-value">{c.value}</div>
          </div>
        ))}
      </div>

      <section className="panel">
        <div className="section-head">
          <div><h3>Top Tools by Call Volume</h3></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {["Tool", "Functions", "Total Calls", "Errors", "Error Rate"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topTools.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--gray-500)" }}>
                    No data yet
                  </td>
                </tr>
              ) : topTools.map((t) => (
                <tr key={t.tool}>
                  <td><strong>{t.tool}</strong></td>
                  <td>{fmt(t.fns)}</td>
                  <td>{fmt(t.calls)}</td>
                  <td style={{ color: t.errors > 0 ? "var(--brand-primary)" : "var(--gray-300)" }}>
                    {fmt(t.errors)}
                  </td>
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
      subtitle="Auto-discovered function catalog. Upserted on every SDK call with live call stats."
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
      subtitle="Daily aggregations per project and model. Built by the governance worker."
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
          <td style={{ textAlign: "right" }}>${Number(r.total_cost).toFixed(4)}</td>
          <td style={{ textAlign: "right" }}>{fmt(r.avg_latency_ms)} ms</td>
        </tr>
      ))}
    </TableWrapper>
  );
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────
function LogsPanel({ rows }) {
  const totalCost = rows.reduce((s, r) => s + Number(r.estimated_cost_usd || 0), 0);
  const totalPrompt = rows.reduce((s, r) => s + Number(r.prompt_tokens || 0), 0);
  const totalCompletion = rows.reduce((s, r) => s + Number(r.completion_tokens || 0), 0);
  const totalTokens = rows.reduce((s, r) => s + Number(r.total_tokens || 0), 0);

  const HEADERS = [
    "Timestamp", "Route", "Model", "Provider",
    "Prompt Tokens", "Completion Tokens", "Total Tokens",
    "Latency (s)", "Cost (USD)", "PII",
  ];

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Per-Call Decorator Logs</h3>
          <p>Every decorated invocation — one row per call. Token counts and cost accumulate dynamically as usage grows.</p>
        </div>
      </div>

      {/* summary strip */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", padding: "12px 0 16px" }}>
        {[
          { label: "Total Calls", value: fmt(rows.length) },
          { label: "Prompt Tokens", value: fmt(totalPrompt) },
          { label: "Completion Tokens", value: fmt(totalCompletion) },
          { label: "Total Tokens", value: fmt(totalTokens) },
          { label: "Total Cost", value: `$${totalCost.toFixed(6)}` },
        ].map((c) => (
          <div key={c.label} className="metric-card" style={{ flex: "1 1 140px", minWidth: 120 }}>
            <div className="metric-eyebrow">{c.label}</div>
            <div className="metric-value" style={{ fontSize: 20 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {HEADERS.map((h) => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={HEADERS.length} style={{ textAlign: "center", color: "var(--gray-500)", padding: 32 }}>
                  No data yet — decorate a function with <code>@gov.trace()</code> to get started.
                </td>
              </tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmtDate(r.created_at)}</td>
                <td><code style={{ fontSize: 12 }}>{r.route || r.function_name || "—"}</code></td>
                <td>{r.model_name || <span style={{ color: "var(--gray-300)" }}>—</span>}</td>
                <td>{r.provider || <span style={{ color: "var(--gray-300)" }}>—</span>}</td>
                <td style={{ textAlign: "right" }}>{fmt(r.prompt_tokens)}</td>
                <td style={{ textAlign: "right" }}>{fmt(r.completion_tokens)}</td>
                <td style={{ textAlign: "right" }}>{fmt(r.total_tokens)}</td>
                <td style={{ textAlign: "right" }}>{Number(r.latency_seconds).toFixed(4)}</td>
                <td style={{ textAlign: "right" }}>${Number(r.estimated_cost_usd).toFixed(6)}</td>
                <td style={{ textAlign: "center" }}>
                  {r.pii_detected
                    ? <span className="status-pill critical">YES</span>
                    : <span style={{ color: "var(--gray-300)" }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: "2px solid rgba(124,112,174,0.2)" }}>
                <td colSpan={4} style={{ paddingTop: 8 }}>Totals ({rows.length} calls)</td>
                <td style={{ textAlign: "right", paddingTop: 8 }}>{fmt(totalPrompt)}</td>
                <td style={{ textAlign: "right", paddingTop: 8 }}>{fmt(totalCompletion)}</td>
                <td style={{ textAlign: "right", paddingTop: 8 }}>{fmt(totalTokens)}</td>
                <td style={{ paddingTop: 8 }}>—</td>
                <td style={{ textAlign: "right", paddingTop: 8 }}>${totalCost.toFixed(6)}</td>
                <td style={{ paddingTop: 8 }} />
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
          <thead>
            <tr>
              {headers.map((h) => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {empty ? (
              <tr>
                <td colSpan={headers.length} style={{ textAlign: "center", color: "var(--gray-500)", padding: 32 }}>
                  No data yet — decorate a function with <code>@gov.trace()</code> to get started.
                </td>
              </tr>
            ) : children}
          </tbody>
        </table>
      </div>
    </section>
  );
}
