import React, { useCallback, useEffect, useState } from "react";
import {
  getDecoratorRegistrations,
  getDecoratorInventory,
  getDecoratorUsage,
  getDecoratorLogs,
  getDecoratorStats,
} from "../api";

// ─── tiny helpers ─────────────────────────────────────────────────────────────
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
const pct = (n) => (n == null ? "—" : `${Number(n).toFixed(1)}%`);
const badge = (type) => {
  const colours = {
    trace:     { background: "#e0f2fe", color: "#0369a1" },
    llm_call:  { background: "#fef9c3", color: "#854d0e" },
    pipeline:  { background: "#f0fdf4", color: "#166534" },
    tool_call: { background: "#faf5ff", color: "#6b21a8" },
  };
  const s = colours[type] || { background: "#f1f5f9", color: "#475569" };
  return (
    <span
      style={{
        ...s,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {type || "trace"}
    </span>
  );
};

const TABS = ["Overview", "Registry", "Inventory", "Model Usage", "Audit Logs"];

// ─── main component ───────────────────────────────────────────────────────────
export default function Decorator() {
  const [tab,          setTab]          = useState("Overview");
  const [stats,        setStats]        = useState(null);
  const [registrations,setRegistrations]= useState([]);
  const [inventory,    setInventory]    = useState([]);
  const [usage,        setUsage]        = useState([]);
  const [logs,         setLogs]         = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  // filters
  const [orgId,     setOrgId]     = useState("");
  const [projectId, setProjectId] = useState("");
  const [toolName,  setToolName]  = useState("");

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
      setRegistrations(r.data?.items || []);
      setInventory(i.data?.items || []);
      setUsage(u.data?.items || []);
      setLogs(l.data?.items || []);
    } catch (e) {
      setError(e.message || "Failed to load decorator data");
    } finally {
      setLoading(false);
    }
  }, [orgId, projectId, toolName]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: "24px 32px", fontFamily: "inherit" }}>
      {/* ─── header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Decorator Framework
        </h1>
        <p style={{ color: "#64748b", margin: "4px 0 0" }}>
          Auto-populated telemetry from <code>@gov.trace()</code>,{" "}
          <code>@gov.llm_call()</code>, <code>@gov.pipeline()</code>, and{" "}
          <code>@gov.tool_call()</code> decorators across all connected tools.
        </p>
      </div>

      {/* ─── filters ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          ["Org ID",     orgId,     setOrgId],
          ["Project ID", projectId, setProjectId],
          ["Tool Name",  toolName,  setToolName],
        ].map(([label, val, setter]) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{label}</label>
            <input
              value={val}
              onChange={(e) => setter(e.target.value)}
              placeholder={`Filter by ${label.toLowerCase()}`}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 13,
                width: 180,
              }}
            />
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: "#1e40af",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "7px 16px",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: "#dc2626", background: "#fef2f2", padding: "10px 14px", borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ─── tabs ── */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2e8f0", marginBottom: 24 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 18px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? "#1e40af" : "#64748b",
              borderBottom: tab === t ? "2px solid #1e40af" : "2px solid transparent",
              marginBottom: -2,
              fontSize: 14,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ─── tab panels ── */}
      {tab === "Overview" && <OverviewPanel stats={stats} registrations={registrations} inventory={inventory} />}
      {tab === "Registry" && <RegistryPanel rows={registrations} />}
      {tab === "Inventory" && <InventoryPanel rows={inventory} />}
      {tab === "Model Usage" && <UsagePanel rows={usage} />}
      {tab === "Audit Logs" && <LogsPanel rows={logs} />}
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function OverviewPanel({ stats, registrations, inventory }) {
  const cards = [
    { label: "Registered Functions", value: fmt(stats?.registered_functions), colour: "#1e40af" },
    { label: "Inventory Functions",  value: fmt(stats?.inventory_functions),  colour: "#059669" },
    { label: "Usage Records",        value: fmt(stats?.usage_records),        colour: "#d97706" },
    { label: "Audit Log Entries",    value: fmt(stats?.audit_log_entries),    colour: "#7c3aed" },
  ];

  // top tools by call count
  const toolMap = {};
  inventory.forEach((r) => {
    if (!toolMap[r.tool_name]) toolMap[r.tool_name] = { tool: r.tool_name, calls: 0, errors: 0, fns: 0 };
    toolMap[r.tool_name].calls  += Number(r.total_calls   || 0);
    toolMap[r.tool_name].errors += Number(r.error_calls   || 0);
    toolMap[r.tool_name].fns    += 1;
  });
  const topTools = Object.values(toolMap).sort((a, b) => b.calls - a.calls).slice(0, 5);

  return (
    <div>
      {/* stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        {cards.map((c) => (
          <div
            key={c.label}
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              padding: "18px 20px",
              borderTop: `3px solid ${c.colour}`,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 700, color: c.colour }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* top tools table */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Top Tools by Call Volume</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
              {["Tool", "Functions", "Total Calls", "Errors", "Error Rate"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 12px", color: "#64748b", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topTools.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 20, color: "#94a3b8", textAlign: "center" }}>No data yet</td></tr>
            ) : topTools.map((t) => (
              <tr key={t.tool} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "8px 12px", fontWeight: 600 }}>{t.tool}</td>
                <td style={{ padding: "8px 12px" }}>{fmt(t.fns)}</td>
                <td style={{ padding: "8px 12px" }}>{fmt(t.calls)}</td>
                <td style={{ padding: "8px 12px", color: t.errors > 0 ? "#dc2626" : "#94a3b8" }}>{fmt(t.errors)}</td>
                <td style={{ padding: "8px 12px" }}>{pct(t.calls ? (t.errors / t.calls) * 100 : 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
        <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
          <td style={td}><code style={{ fontSize: 12 }}>{r.function_name}</code></td>
          <td style={td}>{r.tool_name}</td>
          <td style={{ ...td, color: "#94a3b8", fontSize: 11 }}>{r.module_path || "—"}</td>
          <td style={td}>{badge(r.decorator_type)}</td>
          <td style={td}>{r.execution_env || "—"}</td>
          <td style={td}>{r.sdk_version || "—"}</td>
          <td style={td}>{fmtDate(r.first_seen)}</td>
          <td style={td}>{fmtDate(r.last_seen)}</td>
          <td style={{ ...td, textAlign: "right" }}>{fmt(r.call_count)}</td>
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
        <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
          <td style={td}><code style={{ fontSize: 12 }}>{r.function_name}</code></td>
          <td style={td}>{r.tool_name}</td>
          <td style={td}>{badge(r.decorator_type)}</td>
          <td style={{ ...td, textAlign: "right" }}>{fmt(r.total_calls)}</td>
          <td style={{ ...td, textAlign: "right", color: "#059669" }}>{fmt(r.success_calls)}</td>
          <td style={{ ...td, textAlign: "right", color: r.error_calls > 0 ? "#dc2626" : "#94a3b8" }}>{fmt(r.error_calls)}</td>
          <td style={{ ...td, textAlign: "right" }}>{pct(r.error_rate)}</td>
          <td style={{ ...td, textAlign: "right" }}>{fmt(r.avg_latency_ms)} ms</td>
          <td style={td}>{fmtDate(r.last_seen)}</td>
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
        <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
          <td style={td}>{r.date}</td>
          <td style={td}>{r.project_id || <span style={{ color: "#94a3b8" }}>—</span>}</td>
          <td style={{ ...td, fontWeight: 600 }}>{r.model_name}</td>
          <td style={td}>{r.provider || "—"}</td>
          <td style={{ ...td, textAlign: "right" }}>{fmt(r.call_count)}</td>
          <td style={{ ...td, textAlign: "right" }}>{fmt(r.total_prompt_tokens)}</td>
          <td style={{ ...td, textAlign: "right" }}>{fmt(r.total_completion_tokens)}</td>
          <td style={{ ...td, textAlign: "right" }}>${Number(r.total_cost).toFixed(4)}</td>
          <td style={{ ...td, textAlign: "right" }}>{fmt(r.avg_latency_ms)} ms</td>
        </tr>
      ))}
    </TableWrapper>
  );
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────
function LogsPanel({ rows }) {
  return (
    <TableWrapper
      title="Request / Response Audit Logs"
      subtitle="PII-masked input/output previews captured by the decorator. [EMAIL], [SSN] etc. are redacted."
      headers={["Function", "PII", "Input Preview", "Output Preview", "Input Size", "Output Size", "Timestamp"]}
      empty={rows.length === 0}
    >
      {rows.map((r) => (
        <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
          <td style={td}><code style={{ fontSize: 11 }}>{r.function_name || "—"}</code></td>
          <td style={{ ...td, textAlign: "center" }}>
            {r.pii_detected ? (
              <span style={{ background: "#fef2f2", color: "#dc2626", padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>YES</span>
            ) : (
              <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
            )}
          </td>
          <td style={{ ...td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "#475569" }}>
            {r.input_preview || "—"}
          </td>
          <td style={{ ...td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "#475569" }}>
            {r.output_preview || "—"}
          </td>
          <td style={{ ...td, textAlign: "right" }}>{fmt(r.input_size_bytes)} B</td>
          <td style={{ ...td, textAlign: "right" }}>{fmt(r.output_size_bytes)} B</td>
          <td style={td}>{fmtDate(r.created_at)}</td>
        </tr>
      ))}
    </TableWrapper>
  );
}

// ─── shared table wrapper ─────────────────────────────────────────────────────
function TableWrapper({ title, subtitle, headers, empty, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>{title}</h3>
      {subtitle && <p style={{ margin: "0 0 16px", fontSize: 12, color: "#64748b" }}>{subtitle}</p>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
              {headers.map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 12px", color: "#64748b", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {empty ? (
              <tr>
                <td colSpan={headers.length} style={{ padding: 32, color: "#94a3b8", textAlign: "center" }}>
                  No data yet — decorate a function with <code>@gov.trace()</code> to get started.
                </td>
              </tr>
            ) : children}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────
const td = { padding: "8px 12px", verticalAlign: "middle" };
const fmtDate = (v) =>
  v ? new Date(v).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—";
