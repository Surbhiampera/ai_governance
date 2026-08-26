import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import {
  getProxyOverview, getProxyTrends, getProxyByProject,
  getProxyByModel, getProxyByProjectModel, getProxyRequests,
  getOrganizations, getBudgetUtilization, getProjects,
  createBudget, updateBudget, deleteBudget,
  exportProjectReport,
} from "../api";
import { failureLabel, statusPillClass } from "../failureCodes";
import { displayName } from "../utils/displayName";

// ── Formatters ──────────────────────────────────────────────────────────────
const CHART_COLORS = ["#9E2A97", "#7C70AE", "#b565b0", "#9a8fbf", "#c97dc4", "#3FB6D4", "#f59e0b", "#10b981"];
const money  = (v) => `$${Number(v || 0).toFixed(6)}`;
const money4 = (v) => `$${Number(v || 0).toFixed(4)}`;
const money2 = (v) => { const n = Number(v || 0); return n > 0 && n < 0.01 ? `$${n.toFixed(6)}` : `$${n.toFixed(2)}`; };
const num    = (v) => Number(v || 0).toLocaleString();
const pct    = (a, b) => b > 0 ? ((a / b) * 100).toFixed(1) : "0.0";

const MODEL_COLOR_MAP = {
  "gpt-4o-mini": "#6366f1", "gpt-5-nano": "#8b5cf6",
  "text-embedding-3-small": "#3b82f6", "gpt-4o": "#9E2A97", "gpt-5": "#ec4899",
};
function modelColor(name) {
  name = name || "";
  for (const [k, c] of Object.entries(MODEL_COLOR_MAP)) { if (name.includes(k)) return c; }
  return "#7C70AE";
}
function fmtTokens(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
function projLabel(r) { return displayName(r.project_name) || displayName(r.project_id) || "unassigned"; }
function orgLabel(orgId, orgNameMap = {}) { return displayName(orgNameMap[orgId]) || displayName(orgId) || "—"; }
function rangeFromDays(days) {
  if (days === "all") return { start: undefined, end: undefined };
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

function rangeLabel(days) {
  return days === "all" ? "all time" : `${days}d window`;
}

// Caps the number of rendered date-axis ticks regardless of series length, so
// an "All" range (which can span a handful of days or a year+) doesn't render
// an unreadable wall of overlapping labels.
function dateAxisTicks(length) {
  if (!length || length <= 12) return { interval: 0 };
  return { interval: Math.ceil(length / 10) - 1, angle: -35, textAnchor: "end", height: 46 };
}

const RANGE_OPTIONS = [
  { label: "7d", value: 7 }, { label: "14d", value: 14 },
  { label: "30d", value: 30 }, { label: "90d", value: 90 },
  { label: "All", value: "all" },
];

// ── Small helpers ────────────────────────────────────────────────────────────
function StatCell({ label, value, bold, mono, accent, sub }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--gray-400)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: bold ? 700 : 500, fontFamily: mono ? "monospace" : undefined, color: accent || "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ transition: "transform 0.18s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: "spin 0.8s linear infinite" }}>
      <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
    </svg>
  );
}

const REPORT_FORMATS = [
  { value: "pdf",  label: "PDF" },
  { value: "xlsx", label: "Excel" },
  { value: "docx", label: "Word" },
];

function parseFilename(disposition, fallback) {
  if (!disposition) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return match ? decodeURIComponent(match[1]) : fallback;
}

// ── Export menu: per-project report download (PDF / Excel / Word) ───────────
function ExportMenu({ projectId, projectLabel, days }) {
  const [open, setOpen]   = useState(false);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const handleExport = async (format) => {
    setOpen(false);
    setBusy(true);
    setError("");
    try {
      const { start, end } = rangeFromDays(days);
      const res = await exportProjectReport(projectId, format, start, end);
      const fallback = `${(projectLabel || projectId || "project").replace(/[^a-z0-9-_]+/gi, "_")}-report.${format}`;
      const filename = parseFilename(res.headers?.["content-disposition"], fallback);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.response?.status === 404 ? "Project not found." : "Export failed.");
      setTimeout(() => setError(""), 4000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} onClick={(e) => e.stopPropagation()} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        title="Export report"
        aria-label="Export report"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 28, borderRadius: 6, border: "1px solid var(--border, #e2e8f0)",
          background: "#fff", cursor: busy ? "default" : "pointer",
          color: "#9E2A97",
        }}
      >
        {busy ? <SpinnerIcon /> : <DownloadIcon />}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
          background: "#fff", border: "1px solid var(--border, #e2e8f0)",
          borderRadius: 8, boxShadow: "0 4px 14px rgba(0,0,0,0.15)", minWidth: 110, overflow: "hidden",
        }}>
          {REPORT_FORMATS.map(f => (
            <button key={f.value} type="button" onClick={() => handleExport(f.value)}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
                fontSize: 12.5, border: "none", background: "transparent", cursor: "pointer",
                color: "var(--gray-700, #0f172a)", fontWeight: 500,
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(158,42,151,0.08)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
          background: "#fef2f2", border: "1px solid #fca5a5", color: "#ef4444",
          fontSize: 11, padding: "6px 10px", borderRadius: 6, whiteSpace: "nowrap",
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, color = "#9E2A97", icon }) {
  return (
    <div style={{
      background: "var(--surface, #fff)", border: `1px solid ${color}25`,
      borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "14px 18px",
    }}>
      <div style={{ fontSize: 11, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--gray-400)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Project Intelligence (no project selected) ───────────────────────────────
function ProjectIntelligence({ byProject, projectModelMap, grandTotal, orgNameMap }) {
  if (byProject.length < 2) return null;

  const sorted     = [...byProject].sort((a, b) => (b.total_cost || 0) - (a.total_cost || 0));
  const byTokens   = [...byProject].sort((a, b) => (b.total_tokens || 0) - (a.total_tokens || 0));
  const byReqs     = [...byProject].sort((a, b) => (b.total_requests || 0) - (a.total_requests || 0));
  const low        = [...byProject].filter(r => (r.total_cost || 0) > 0).sort((a, b) => (a.total_cost || 0) - (b.total_cost || 0));

  const RankRow = ({ r, metric, fmt, color = "#9E2A97" }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{projLabel(r)}</div>
        <div style={{ fontSize: 11, color: "var(--gray-400)", fontFamily: "monospace" }}>{orgLabel(r.org_id, orgNameMap)}</div>
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, color, fontFamily: "monospace" }}>{fmt(metric(r))}</div>
    </div>
  );

  const Card = ({ title, rows, metric, fmt, color, note }) => (
    <div style={{ background: "var(--surface,#fff)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px", flex: 1, minWidth: 200 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color }}>{title}</div>
      {rows.slice(0, 3).map((r, i) => <RankRow key={i} r={r} metric={metric} fmt={fmt} color={color} />)}
      {note && <div style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 8 }}>{note}</div>}
    </div>
  );

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Project Intelligence</h3>
          <p style={{ color: "var(--gray-500)", fontSize: 13 }}>Ranked insights across {byProject.length} projects.</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Card title="Highest Cost"   rows={sorted}   metric={r => r.total_cost}     fmt={money2}    color="#9E2A97" note="Top cost consumers" />
        <Card title="Most Tokens"    rows={byTokens} metric={r => r.total_tokens}   fmt={fmtTokens} color="#7C70AE" note="Highest token consumption" />
        <Card title="Most Requests"  rows={byReqs}   metric={r => r.total_requests} fmt={num}       color="#3FB6D4" note="Highest request volume" />
        <Card title="Minimal Usage"  rows={low}      metric={r => r.total_cost}     fmt={money2}    color="#6b7280" note="Lowest-activity projects" />
      </div>
    </section>
  );
}

// ── Full Project Detail View ─────────────────────────────────────────────────
function ProjectDetailView({ projData, modelData, allProjects, trends, requests, reqTotal, reqPage, setReqPage, days, grandTotal, orgNameMap }) {
  const [expandedRequests, setExpandedRequests] = useState({});

  const toggleRequestRow = async (requestId) => {
    const cur = expandedRequests[requestId];
    if (cur?.open) {
      setExpandedRequests(prev => ({ ...prev, [requestId]: { ...cur, open: false } }));
      return;
    }
    if (cur?.children) {
      setExpandedRequests(prev => ({ ...prev, [requestId]: { ...cur, open: true } }));
      return;
    }
    setExpandedRequests(prev => ({ ...prev, [requestId]: { open: true, loading: true, children: null } }));
    try {
      const res = await getProxyRequests({ parent_request_id: requestId });
      const children = res.data?.items || res.data || [];
      setExpandedRequests(prev => ({ ...prev, [requestId]: { open: true, loading: false, children } }));
    } catch {
      setExpandedRequests(prev => ({ ...prev, [requestId]: { open: true, loading: false, children: [], error: true } }));
    }
  };

  if (!projData) return <div className="panel" style={{ padding: 24, color: "var(--gray-500)" }}>No data for this project yet.</div>;

  const pid          = projData.project_id || "unassigned";
  const models       = modelData?.rows || [];
  const inputTok     = modelData?.input_tokens  || 0;
  const outputTok    = modelData?.output_tokens || 0;
  const totalTok     = inputTok + outputTok || Number(projData.total_tokens || 0);
  const avgCost      = projData.total_requests ? Number(projData.total_cost || 0) / Number(projData.total_requests) : 0;
  const topModel     = models.length > 0 ? models.reduce((a, b) => b.total_requests > a.total_requests ? b : a, models[0]) : null;
  const infraCost    = Number(projData.total_cost || 0) - Number(projData.llm_cost || 0);
  const PAGE_SIZE    = 25;
  const totalPages   = Math.ceil(reqTotal / PAGE_SIZE);

  // Comparison data: this project vs all others
  const compData = allProjects.map(r => ({
    name: projLabel(r).slice(0, 18),
    cost: Number(r.total_cost || 0),
    tokens: Number(r.total_tokens || 0),
    requests: Number(r.total_requests || 0),
    isSelected: (r.project_id || "unassigned") === pid,
  })).sort((a, b) => b.cost - a.cost);

  // Token trend from daily trends (org-level)
  const tokenTrend = trends.map(t => ({
    date: t.date,
    prompt_tokens: t.prompt_tokens || 0,
    completion_tokens: t.completion_tokens || 0,
    total_cost: t.total_cost || 0,
  }));

  return (
    <>
      {/* ── Project Header ──────────────────────────────────────────────── */}
      <section style={{
        background: "linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 60%, #9E2A97 100%)",
        borderRadius: 14, padding: "24px 28px", color: "#fff", marginBottom: 0,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Project Deep Dive · {days === "all" ? "All time" : `${days}d`}</div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{projLabel(projData)}</h2>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4, fontFamily: "monospace" }}>{orgLabel(projData.org_id, orgNameMap)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {projData.pii_hits > 0 && <span className="status-pill critical">{projData.pii_hits} PII hits</span>}
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", padding: "4px 12px", background: "rgba(255,255,255,0.12)", borderRadius: 20 }}>
              {pct(projData.total_cost, grandTotal)}% of total spend
            </span>
            <ExportMenu projectId={pid} projectLabel={projLabel(projData)} days={days} />
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 20 }}>
          {[
            { label: "Total Cost",      value: money2(projData.total_cost),  color: "#f9a8d4" },
            { label: "LLM Cost",        value: money2(projData.llm_cost),    color: "#c4b5fd" },
            { label: "Infra Cost",      value: money2(infraCost),            color: "#93c5fd" },
            { label: "Requests",        value: num(projData.total_requests), color: "#6ee7b7" },
            { label: "Avg Cost/Req",    value: money4(avgCost),              color: "#fcd34d" },
            { label: "Input Tokens",    value: fmtTokens(inputTok),          color: "#a5b4fc" },
            { label: "Output Tokens",   value: fmtTokens(outputTok),         color: "#f0abfc" },
            { label: "Total Tokens",    value: fmtTokens(totalTok),          color: "#fff" },
            { label: "Top Model",       value: topModel?.model_name || "—",  color: "#fde68a" },
          ].map(k => (
            <div key={k.label} style={{ minWidth: 110 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{k.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: k.color, fontFamily: "monospace", marginTop: 3 }}>{k.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Model Usage Charts ───────────────────────────────────────────── */}
      <section className="two-column">
        {/* Pie: model cost mix */}
        <div className="panel">
          <div className="section-head"><div><h3>Model Cost Distribution</h3></div></div>
          {models.length > 0 ? (
            <div style={{ width: "100%", minHeight: 260 }}>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={models} dataKey="total_cost" nameKey="model_name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} label={({ name, percent }) => `${name?.slice(0,10)} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {models.map((m, i) => <Cell key={m.model_name} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => money(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 8 }}>
                {models.map((m, i) => (
                  <span key={m.model_name} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: CHART_COLORS[i % CHART_COLORS.length], display: "inline-block" }} />
                    {m.model_name}
                  </span>
                ))}
              </div>
            </div>
          ) : <div className="empty-state">No model data for this project.</div>}
        </div>

        {/* Bar: model requests */}
        <div className="panel">
          <div className="section-head"><div><h3>Requests by Model</h3></div></div>
          {models.length > 0 ? (
            <div style={{ width: "100%", minHeight: 260 }}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={models} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid stroke="rgba(124,112,174,0.12)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#6d6782", fontSize: 10 }} />
                  <YAxis type="category" dataKey="model_name" width={120} tick={{ fill: "#6d6782", fontSize: 10 }} />
                  <Tooltip formatter={(v, n) => n === "total_requests" ? num(v) : money(v)} />
                  <Bar dataKey="total_requests" name="Requests" radius={[0, 4, 4, 0]}>
                    {models.map((m, i) => <Cell key={m.model_name} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="empty-state">No model data for this project.</div>}
        </div>
      </section>

      {/* ── Token Split + Trend ──────────────────────────────────────────── */}
      <section className="two-column">
        {/* Token split visual */}
        <div className="panel">
          <div className="section-head"><div><h3>Token Consumption</h3></div></div>
          {totalTok > 0 ? (
            <>
              <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
                <KpiCard label="Input Tokens"  value={fmtTokens(inputTok)}  color="#7C70AE" sub={`${pct(inputTok, totalTok)}% of total`} />
                <KpiCard label="Output Tokens" value={fmtTokens(outputTok)} color="#9E2A97" sub={`${pct(outputTok, totalTok)}% of total`} />
                <KpiCard label="Total Tokens"  value={fmtTokens(totalTok)}  color="#3FB6D4" sub="combined" />
              </div>
              {/* Stack bar */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", height: 18, borderRadius: 9, overflow: "hidden" }}>
                  <div style={{ width: `${pct(inputTok, totalTok)}%`, background: "#7C70AE", transition: "width 0.4s" }} />
                  <div style={{ flex: 1, background: "#9E2A97" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--gray-400)", marginTop: 4 }}>
                  <span style={{ color: "#7C70AE" }}>Input {pct(inputTok, totalTok)}%</span>
                  <span style={{ color: "#9E2A97" }}>Output {pct(outputTok, totalTok)}%</span>
                </div>
              </div>
              {/* Per-model token table */}
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead><tr><th>Model</th><th style={{textAlign:"right"}}>Input</th><th style={{textAlign:"right"}}>Output</th><th style={{textAlign:"right"}}>Total</th><th style={{textAlign:"right"}}>Input Cost</th><th style={{textAlign:"right"}}>Output Cost</th></tr></thead>
                  <tbody>
                    {models.map((m, i) => (
                      <tr key={i}>
                        <td><span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: `${CHART_COLORS[i % CHART_COLORS.length]}18`, color: CHART_COLORS[i % CHART_COLORS.length], fontWeight: 600, fontFamily: "monospace" }}>{m.model_name}</span></td>
                        <td style={{ textAlign: "right", color: "#7C70AE" }}>{fmtTokens(m.input_tokens)}</td>
                        <td style={{ textAlign: "right", color: "#9E2A97" }}>{fmtTokens(m.output_tokens)}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtTokens(m.total_tokens)}</td>
                        <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12 }}>{money(m.input_cost)}</td>
                        <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12 }}>{money(m.output_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <div className="empty-state">No token data for this project.</div>}
        </div>

        {/* Cost + token trend */}
        <div className="panel">
          <div className="section-head"><div><h3>Daily Cost &amp; Token Trend</h3><p style={{fontSize:12,color:"var(--gray-400)"}}>This project · selected period</p></div></div>
          {tokenTrend.length > 0 ? (
            <>
              <div style={{ width: "100%", minHeight: 130 }}>
                <ResponsiveContainer width="100%" height={130}>
                  <AreaChart data={tokenTrend}>
                    <defs>
                      <linearGradient id="projCostFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#9E2A97" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#9E2A97" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(124,112,174,0.1)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "#6d6782", fontSize: 9 }} {...dateAxisTicks(tokenTrend.length)} />
                    <YAxis tick={{ fill: "#6d6782", fontSize: 9 }} tickFormatter={v => `$${Number(v).toFixed(3)}`} />
                    <Tooltip formatter={v => money(v)} />
                    <Area type="monotone" dataKey="total_cost" stroke="#9E2A97" fill="url(#projCostFill)" strokeWidth={2} name="Cost" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div style={{ width: "100%", minHeight: 130, marginTop: 8 }}>
                <ResponsiveContainer width="100%" height={130}>
                  <AreaChart data={tokenTrend}>
                    <defs>
                      <linearGradient id="inFill"  x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#7C70AE" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#7C70AE" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="outFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#9E2A97" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#9E2A97" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(124,112,174,0.1)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "#6d6782", fontSize: 9 }} {...dateAxisTicks(tokenTrend.length)} />
                    <YAxis tick={{ fill: "#6d6782", fontSize: 9 }} tickFormatter={v => fmtTokens(v)} />
                    <Tooltip formatter={(v, n) => [fmtTokens(v), n]} />
                    <Area type="monotone" dataKey="prompt_tokens"     stroke="#7C70AE" fill="url(#inFill)"  strokeWidth={2} name="Input Tokens" />
                    <Area type="monotone" dataKey="completion_tokens" stroke="#9E2A97" fill="url(#outFill)" strokeWidth={2} name="Output Tokens" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : <div className="empty-state">No trend data available.</div>}
        </div>
      </section>

      {/* ── Request-wise Breakdown ──────────────────────────────────────────── */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Request-wise Breakdown</h3>
            <p style={{ color: "var(--gray-500)", fontSize: 13 }}>Detailed per-request token and cost breakdown for this project.</p>
          </div>
          <span style={{ fontSize: 13, color: "var(--gray-500)" }}>{num(reqTotal)} request{reqTotal !== 1 ? "s" : ""}</span>
        </div>
        {requests.length === 0 ? (
          <div className="empty-state">No requests for this project yet.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Model</th>
                    <th>Route</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th style={{textAlign:"right"}}>Input Tokens</th>
                    <th style={{textAlign:"right"}}>Output Tokens</th>
                    <th style={{textAlign:"right"}}>Total Tokens</th>
                    <th style={{textAlign:"right"}}>Input Cost</th>
                    <th style={{textAlign:"right"}}>Output Cost</th>
                    <th style={{textAlign:"right"}}>Total Cost</th>
                    <th style={{textAlign:"right"}}>Cost Share (%)</th>
                    <th>Received At</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((row, i) => {
                    const inTok    = Number(row.prompt_tokens     || 0);
                    const outTok   = Number(row.completion_tokens || 0);
                    const totTok   = inTok + outTok;
                    const llmCost  = Number(row.llm_cost   || 0);
                    const totCost  = Number(row.total_cost || 0);
                    // Use exact per-request costs from request_cost table; fall back to proportional split
                    const inCost   = row.input_cost  != null ? Number(row.input_cost)  : (totTok > 0 ? (inTok  / totTok) * llmCost : 0);
                    const outCost  = row.output_cost != null ? Number(row.output_cost) : (totTok > 0 ? (outTok / totTok) * llmCost : 0);
                    const share    = projData.total_cost > 0 ? pct(totCost, projData.total_cost) : "0.0";
                    const barColor = CHART_COLORS[i % CHART_COLORS.length];
                    const reqCount = Number(row.request_count || 1);
                    const isGroup  = reqCount > 1;
                    const expState = expandedRequests[row.request_id];
                    const isOpen   = !!expState?.open;
                    return (
                      <React.Fragment key={row.request_id || i}>
                        <tr style={isGroup ? { fontWeight: 600 } : undefined}>
                          <td style={{ fontFamily: "monospace", fontSize: 11, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.request_id}>
                            {isGroup && (
                              <button onClick={() => toggleRequestRow(row.request_id)} aria-label={isOpen ? "Collapse calls" : "Expand calls"}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginRight: 6, color: "var(--gray-400)", verticalAlign: "middle" }}>
                                <ChevronIcon open={isOpen} />
                              </button>
                            )}
                            {row.request_id || "—"}
                          </td>
                          <td>
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: `${modelColor(row.model_name)}15`, border: `1px solid ${modelColor(row.model_name)}40`, color: modelColor(row.model_name), fontWeight: 600, fontFamily: "monospace" }}>
                              {row.model_name || "—"}
                            </span>
                            {isGroup && (
                              <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 7px", borderRadius: 10, background: "rgba(124,112,174,0.15)", color: "#7C70AE", fontWeight: 700 }}>
                                {reqCount} calls
                              </span>
                            )}
                          </td>
                          <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--gray-500)" }}>{row.entry_point || "—"}</td>
                          <td>
                            <span className={`status-pill ${statusPillClass(row.request_status)}`} style={{ fontSize: 10, padding: "1px 7px" }}>
                              {row.request_status || "—"}
                            </span>
                          </td>
                          <td style={{ fontSize: 11, maxWidth: 220 }}>
                            {row.failure_code
                              ? (
                                <>
                                  <div style={{ fontWeight: 600, color: "var(--gray-700)" }}>{failureLabel(row.failure_code)}</div>
                                  {row.failure_reason && <div style={{ color: "var(--gray-500)" }}>{row.failure_reason}</div>}
                                </>
                              )
                              : <span style={{ color: "var(--gray-400)" }}>—</span>}
                          </td>
                          <td style={{textAlign:"right", color:"#7C70AE", fontWeight:500}}>{num(inTok)}</td>
                          <td style={{textAlign:"right", color:"#9E2A97", fontWeight:500}}>{num(outTok)}</td>
                          <td style={{textAlign:"right", fontWeight:600}}>{num(totTok)}</td>
                          <td style={{textAlign:"right", fontFamily:"monospace", fontSize:12}}>{money(inCost)}</td>
                          <td style={{textAlign:"right", fontFamily:"monospace", fontSize:12}}>{money(outCost)}</td>
                          <td style={{textAlign:"right", fontFamily:"monospace", fontSize:12, fontWeight:700, color:"#9E2A97"}}>{money(totCost)}</td>
                          <td style={{textAlign:"right"}}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                              <div style={{ width: 50, height: 5, borderRadius: 3, background: "rgba(124,112,174,0.15)", overflow: "hidden" }}>
                                <div style={{ width: `${share}%`, height: "100%", background: barColor }} />
                              </div>
                              <span style={{ fontSize: 11, color: "var(--gray-500)" }}>{share}%</span>
                            </div>
                          </td>
                          <td style={{ fontSize: 12, color: "var(--gray-500)", whiteSpace: "nowrap" }}>{row.received_at ? new Date(row.received_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</td>
                        </tr>
                        {isGroup && isOpen && (
                          expState?.loading ? (
                            <tr><td colSpan={13} style={{ padding: "8px 18px", fontSize: 12, color: "var(--gray-500)" }}>Loading calls…</td></tr>
                          ) : expState?.error ? (
                            <tr><td colSpan={13} style={{ padding: "8px 18px", fontSize: 12, color: "#ef4444" }}>Failed to load calls.</td></tr>
                          ) : (expState?.children || []).length === 0 ? (
                            <tr><td colSpan={13} style={{ padding: "8px 18px", fontSize: 12, color: "var(--gray-500)" }}>No child calls found.</td></tr>
                          ) : expState.children.map((child, ci) => {
                            const cInTok   = Number(child.prompt_tokens     || 0);
                            const cOutTok  = Number(child.completion_tokens || 0);
                            const cTotTok  = cInTok + cOutTok;
                            const cLlmCost = Number(child.llm_cost   || 0);
                            const cTotCost = Number(child.total_cost || 0);
                            const cInCost  = child.input_cost  != null ? Number(child.input_cost)  : (cTotTok > 0 ? (cInTok  / cTotTok) * cLlmCost : 0);
                            const cOutCost = child.output_cost != null ? Number(child.output_cost) : (cTotTok > 0 ? (cOutTok / cTotTok) * cLlmCost : 0);
                            return (
                              <tr key={child.request_id || ci} style={{ background: "rgba(124,112,174,0.04)" }}>
                                <td style={{ fontFamily: "monospace", fontSize: 11, paddingLeft: 28, color: "var(--gray-500)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={child.request_id}>
                                  ↳ {child.request_id || "—"}
                                </td>
                                <td>
                                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: `${modelColor(child.model_name)}15`, color: modelColor(child.model_name), fontWeight: 500, fontFamily: "monospace" }}>
                                    {child.model_name || "—"}
                                  </span>
                                </td>
                                <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--gray-500)" }}>{child.entry_point || "—"}</td>
                                <td>
                                  <span className={`status-pill ${statusPillClass(child.request_status)}`} style={{ fontSize: 10, padding: "1px 7px" }}>
                                    {child.request_status || "—"}
                                  </span>
                                </td>
                                <td style={{ fontSize: 11, maxWidth: 220 }}>
                                  {child.failure_code
                                    ? (
                                      <>
                                        <div style={{ fontWeight: 600, color: "var(--gray-700)" }}>{failureLabel(child.failure_code)}</div>
                                        {child.failure_reason && <div style={{ color: "var(--gray-500)" }}>{child.failure_reason}</div>}
                                      </>
                                    )
                                    : <span style={{ color: "var(--gray-400)" }}>—</span>}
                                </td>
                                <td style={{textAlign:"right", color:"#7C70AE"}}>{num(cInTok)}</td>
                                <td style={{textAlign:"right", color:"#9E2A97"}}>{num(cOutTok)}</td>
                                <td style={{textAlign:"right"}}>{num(cTotTok)}</td>
                                <td style={{textAlign:"right", fontFamily:"monospace", fontSize:11}}>{money(cInCost)}</td>
                                <td style={{textAlign:"right", fontFamily:"monospace", fontSize:11}}>{money(cOutCost)}</td>
                                <td style={{textAlign:"right", fontFamily:"monospace", fontSize:11, color:"#9E2A97"}}>{money(cTotCost)}</td>
                                <td />
                                <td style={{ fontSize: 11, color: "var(--gray-500)", whiteSpace: "nowrap" }}>{child.received_at ? new Date(child.received_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</td>
                              </tr>
                            );
                          })
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid rgba(124,112,174,0.2)", background: "rgba(158,42,151,0.03)" }}>
                    <td><strong>Total</strong></td>
                    <td />
                    <td />
                    <td />
                    <td />
                    <td style={{textAlign:"right", color:"#7C70AE", fontWeight:700}}>{num(requests.reduce((s,r)=>s+(Number(r.prompt_tokens)||0),0))}</td>
                    <td style={{textAlign:"right", color:"#9E2A97", fontWeight:700}}>{num(requests.reduce((s,r)=>s+(Number(r.completion_tokens)||0),0))}</td>
                    <td style={{textAlign:"right", fontWeight:700}}>{num(requests.reduce((s,r)=>s+(Number(r.prompt_tokens)||0)+(Number(r.completion_tokens)||0),0))}</td>
                    <td style={{textAlign:"right", fontFamily:"monospace", fontWeight:700}}>{money(requests.reduce((s,r)=>s+(Number(r.input_cost)||0),0))}</td>
                    <td style={{textAlign:"right", fontFamily:"monospace", fontWeight:700}}>{money(requests.reduce((s,r)=>s+(Number(r.output_cost)||0),0))}</td>
                    <td style={{textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#9E2A97"}}>{money2(projData.total_cost)}</td>
                    <td style={{textAlign:"right", fontSize:11, color:"var(--gray-500)"}}>100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
                <button className="btn btn-ghost" disabled={reqPage === 0} onClick={() => setReqPage(p => p - 1)}>← Prev</button>
                <span style={{ padding: "6px 12px", fontSize: 13 }}>Page {reqPage + 1} of {totalPages}</span>
                <button className="btn btn-ghost" disabled={reqPage >= totalPages - 1} onClick={() => setReqPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

// ── Shared request table ─────────────────────────────────────────────────────
function RequestTable({ requests, projectNameMap = {} }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Request ID</th><th>Project</th><th>Model</th><th>Route</th><th>Status</th><th>Reason</th>
            <th>Prompt Tokens</th><th>Completion Tokens</th>
            <th>LLM Cost</th><th>Total Cost</th><th>PII</th><th>Received</th>
          </tr>
        </thead>
        <tbody>
          {requests.length === 0
            ? <tr><td colSpan={12} style={{ textAlign: "center", color: "var(--gray-500)", padding: "24px 0" }}>No requests yet.</td></tr>
            : requests.map(row => (
              <tr key={row.request_id}>
                <td style={{ fontFamily: "monospace", fontSize: 11 }}>{row.request_id}</td>
                <td>{displayName(projectNameMap[row.project_id] || row.project_id) || "—"}</td>
                <td><strong>{row.model_name || "—"}</strong></td>
                <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--gray-500)" }}>{row.entry_point || "—"}</td>
                <td>
                  <span className={`status-pill ${statusPillClass(row.request_status)}`}>
                    {row.request_status}
                  </span>
                </td>
                <td style={{ fontSize: 11, maxWidth: 220 }}>
                  {row.failure_code
                    ? (
                      <>
                        <div style={{ fontWeight: 600, color: "var(--gray-700)" }}>{failureLabel(row.failure_code)}</div>
                        {row.failure_reason && <div style={{ color: "var(--gray-500)" }}>{row.failure_reason}</div>}
                      </>
                    )
                    : <span style={{ color: "var(--gray-400)" }}>—</span>}
                </td>
                <td>{num(row.prompt_tokens)}</td>
                <td>{num(row.completion_tokens)}</td>
                <td>{money(row.llm_cost)}</td>
                <td><strong>{money(row.total_cost)}</strong></td>
                <td>{row.pii_detected ? <span className="status-pill critical">{(row.pii_types || []).join(", ")}</span> : <span style={{ color: "var(--gray-400)" }}>none</span>}</td>
                <td style={{ fontSize: 12, color: "var(--gray-500)" }}>{row.received_at ? new Date(row.received_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  );
}

// ── Cost KPI Modal ────────────────────────────────────────────────────────────
function CRow({ label, value, accent, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 13, color: "var(--gray-500)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: accent || "var(--text)", fontFamily: mono ? "monospace" : undefined }}>{value}</span>
    </div>
  );
}

function CSection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9E2A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function CostKpiModal({ cardKey, overview, byProject, byModel, grandTotal, onClose }) {
  const totalCost      = Number(overview?.total_cost        || 0);
  const llmCost        = Number(overview?.llm_cost          || 0);
  const infraCost      = totalCost - llmCost;
  const totalReqs      = Number(overview?.total_requests    || 0);
  const completed      = Number(overview?.completed         || 0);
  const totalToks      = Number(overview?.total_tokens      || 0);
  const promptToks     = Number(overview?.prompt_tokens     || 0);
  const completionToks = Number(overview?.completion_tokens || 0);
  const avgLatency     = Number(overview?.avg_latency_ms    || 0);
  const avgCostReq     = totalReqs > 0 ? totalCost / totalReqs : 0;

  const ModelPill = ({ name }) => (
    <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 20, background: `${modelColor(name)}15`, color: modelColor(name), fontWeight: 600, fontFamily: "monospace" }}>{name}</span>
  );

  let title = "";
  let body  = null;

  if (cardKey === "total_cost") {
    title = "Total Cost Breakdown";
    const top5 = [...byProject].sort((a, b) => (b.total_cost || 0) - (a.total_cost || 0)).slice(0, 5);
    body = (
      <>
        <CSection title="Cost Split">
          <CRow label="LLM Cost"    value={money2(llmCost)}   accent="#9E2A97" mono />
          <CRow label="Infra Cost"  value={money2(infraCost)} accent="#3FB6D4" mono />
          <CRow label="Total Cost"  value={money2(totalCost)} accent="#9E2A97" mono />
          <CRow label="LLM Share"   value={`${pct(llmCost, totalCost)}%`} />
          <CRow label="Infra Share" value={`${pct(infraCost, totalCost)}%`} />
        </CSection>
        {top5.length > 0 && (
          <CSection title="Top Projects by Cost">
            {top5.map((r, i) => <CRow key={i} label={projLabel(r)} value={money2(r.total_cost)} accent="#9E2A97" mono />)}
          </CSection>
        )}
      </>
    );
  } else if (cardKey === "llm_cost") {
    title = "LLM Cost Details";
    const topModels = [...byModel].sort((a, b) => (b.total_cost || 0) - (a.total_cost || 0)).slice(0, 6);
    body = (
      <>
        <CSection title="LLM vs Total">
          <CRow label="LLM Cost"    value={money2(llmCost)}                                         accent="#9E2A97" mono />
          <CRow label="Total Cost"  value={money2(totalCost)}                                        mono />
          <CRow label="LLM Share"   value={`${pct(llmCost, totalCost)}%`} />
          <CRow label="Avg LLM/Req" value={money4(totalReqs > 0 ? llmCost / totalReqs : 0)}          mono />
        </CSection>
        {topModels.length > 0 && (
          <CSection title="Top Models by Cost">
            {topModels.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                <ModelPill name={r.model_name} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#9E2A97", fontFamily: "monospace" }}>{money(r.total_cost)}</span>
              </div>
            ))}
          </CSection>
        )}
      </>
    );
  } else if (cardKey === "total_requests") {
    title = "Request Volume Details";
    const blocked = Math.max(totalReqs - completed, 0);
    const top5    = [...byProject].sort((a, b) => (b.total_requests || 0) - (a.total_requests || 0)).slice(0, 5);
    body = (
      <>
        <CSection title="Request Summary">
          <CRow label="Total Requests"  value={num(totalReqs)} />
          <CRow label="Completed"       value={num(completed)}  accent="#10b981" />
          <CRow label="Blocked / Other" value={num(blocked)}    accent="#ef4444" />
          <CRow label="Success Rate"    value={`${totalReqs > 0 ? ((completed / totalReqs) * 100).toFixed(1) : 0}%`} accent="#10b981" />
        </CSection>
        {top5.length > 0 && (
          <CSection title="Top Projects by Requests">
            {top5.map((r, i) => <CRow key={i} label={projLabel(r)} value={num(r.total_requests)} />)}
          </CSection>
        )}
      </>
    );
  } else if (cardKey === "avg_costrequest") {
    title = "Avg Cost per Request";
    const perProj = [...byProject]
      .filter(r => r.total_requests > 0)
      .map(r => ({ ...r, avg: Number(r.total_cost || 0) / Number(r.total_requests) }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);
    body = (
      <>
        <CSection title="Cost Efficiency">
          <CRow label="Avg Cost / Request" value={money4(avgCostReq)} accent="#9E2A97" mono />
          <CRow label="Total Cost"         value={money2(totalCost)} mono />
          <CRow label="Total Requests"     value={num(totalReqs)} />
        </CSection>
        {perProj.length > 0 && (
          <CSection title="Per-Project Avg Cost">
            {perProj.map((r, i) => <CRow key={i} label={projLabel(r)} value={money4(r.avg)} mono />)}
          </CSection>
        )}
      </>
    );
  } else if (cardKey === "total_tokens") {
    title = "Total Token Consumption";
    const topModels = [...byModel].sort((a, b) => (b.total_tokens || 0) - (a.total_tokens || 0)).slice(0, 6);
    body = (
      <>
        <CSection title="Token Summary">
          <CRow label="Total Tokens"      value={fmtTokens(totalToks)} />
          <CRow label="Prompt Tokens"     value={fmtTokens(promptToks)}     accent="#7C70AE" />
          <CRow label="Completion Tokens" value={fmtTokens(completionToks)} accent="#9E2A97" />
          <CRow label="Input Share"       value={`${pct(promptToks, totalToks)}%`} />
          <CRow label="Output Share"      value={`${pct(completionToks, totalToks)}%`} />
        </CSection>
        {topModels.length > 0 && (
          <CSection title="Top Models by Tokens">
            {topModels.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                <ModelPill name={r.model_name} />
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>{fmtTokens(r.total_tokens)}</span>
              </div>
            ))}
          </CSection>
        )}
      </>
    );
  } else if (cardKey === "prompt_tokens") {
    title = "Input (Prompt) Tokens";
    const topModels = [...byModel].sort((a, b) => (b.input_tokens || 0) - (a.input_tokens || 0)).slice(0, 6);
    body = (
      <>
        <CSection title="Prompt Token Summary">
          <CRow label="Prompt Tokens" value={fmtTokens(promptToks)} accent="#7C70AE" />
          <CRow label="Total Tokens"  value={fmtTokens(totalToks)} />
          <CRow label="Input Share"   value={`${pct(promptToks, totalToks)}%`} />
          <CRow label="Avg Input/Req" value={fmtTokens(totalReqs > 0 ? Math.round(promptToks / totalReqs) : 0)} />
        </CSection>
        {topModels.length > 0 && (
          <CSection title="Top Models by Input Tokens">
            {topModels.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                <ModelPill name={r.model_name} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#7C70AE", fontFamily: "monospace" }}>{fmtTokens(r.input_tokens)}</span>
              </div>
            ))}
          </CSection>
        )}
      </>
    );
  } else if (cardKey === "completion_tokens") {
    title = "Output (Completion) Tokens";
    const topModels = [...byModel].sort((a, b) => (b.output_tokens || 0) - (a.output_tokens || 0)).slice(0, 6);
    body = (
      <>
        <CSection title="Completion Token Summary">
          <CRow label="Completion Tokens" value={fmtTokens(completionToks)} accent="#9E2A97" />
          <CRow label="Total Tokens"      value={fmtTokens(totalToks)} />
          <CRow label="Output Share"      value={`${pct(completionToks, totalToks)}%`} />
          <CRow label="Avg Output/Req"    value={fmtTokens(totalReqs > 0 ? Math.round(completionToks / totalReqs) : 0)} />
        </CSection>
        {topModels.length > 0 && (
          <CSection title="Top Models by Output Tokens">
            {topModels.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                <ModelPill name={r.model_name} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#9E2A97", fontFamily: "monospace" }}>{fmtTokens(r.output_tokens)}</span>
              </div>
            ))}
          </CSection>
        )}
      </>
    );
  } else if (cardKey === "avg_latency") {
    title = "Avg Latency Details";
    const latStatus = avgLatency < 500  ? { label: "Excellent", color: "#10b981" }
                    : avgLatency < 1500 ? { label: "Good",      color: "#3FB6D4" }
                    : avgLatency < 3000 ? { label: "Moderate",  color: "#f59e0b" }
                    :                     { label: "High",       color: "#ef4444" };
    const topModels = [...byModel].sort((a, b) => (b.total_requests || 0) - (a.total_requests || 0)).slice(0, 5);
    body = (
      <>
        <CSection title="Latency Overview">
          <CRow label="Avg Latency" value={`${num(avgLatency)} ms`} accent={latStatus.color} />
          <CRow label="Status"      value={latStatus.label}          accent={latStatus.color} />
          <CRow label="Requests"    value={num(totalReqs)} />
        </CSection>
        {topModels.length > 0 && (
          <CSection title="Most-Used Models">
            {topModels.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                <ModelPill name={r.model_name} />
                <span style={{ fontSize: 13, color: "var(--gray-500)" }}>{num(r.total_requests)} reqs</span>
              </div>
            ))}
          </CSection>
        )}
      </>
    );
  }

  return (
    <div onClick={onClose} className="modal-backdrop" style={{ zIndex: 2000 }}>
      <div onClick={e => e.stopPropagation()} className="modal-dialog" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <button onClick={onClose} className="btn-close">×</button>
        </div>
        <div>{body}</div>
      </div>
    </div>
  );
}

// ── Budget Status ─────────────────────────────────────────────────────────────
const EMPTY_BUDGET_FORM = { project_id: "", budget_type: "monthly", limit_amount: "", alert_threshold_percent: 80 };

function BudgetStatusSection() {
  const [orgs, setOrgs]               = useState([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [projects, setProjects]       = useState([]);
  const [budgets, setBudgets]         = useState([]);
  const [loading, setLoading]         = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [editId, setEditId]           = useState(null);
  const [form, setForm]               = useState(EMPTY_BUDGET_FORM);
  const [saving, setSaving]           = useState(false);
  const [msg, setMsg]                 = useState("");

  useEffect(() => {
    getOrganizations()
      .then(r => {
        const list = r.data?.organizations || r.data || [];
        setOrgs(list);
        if (list.length > 0) setSelectedOrg(list[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedOrg) return;
    setLoading(true);
    getBudgetUtilization(selectedOrg)
      .then(r => setBudgets(r.data || []))
      .catch(() => setBudgets([]))
      .finally(() => setLoading(false));
    getProjects(selectedOrg)
      .then(r => setProjects(r.data || []))
      .catch(() => setProjects([]));
  }, [selectedOrg]);

  const refresh = () => {
    if (!selectedOrg) return;
    getBudgetUtilization(selectedOrg)
      .then(r => setBudgets(r.data || []))
      .catch(() => setBudgets([]));
  };

  const statusColor = (status, rawPct) => {
    if (status === "exceeded" || rawPct > 100) return "#ef4444";
    if (status === "warning"  || rawPct >= 80) return "#f59e0b";
    return "#22c55e";
  };

  const openCreate = () => { setEditId(null); setForm(EMPTY_BUDGET_FORM); setMsg(""); setShowForm(true); };
  const openEdit   = (b) => {
    setEditId(b.id);
    setForm({
      project_id: b.project_id || "",
      budget_type: b.budget_type || "monthly",
      limit_amount: b.limit_amount != null ? String(b.limit_amount) : "",
      alert_threshold_percent: b.alert_threshold_percent ?? 80,
    });
    setMsg("");
    setShowForm(true);
  };
  const closeForm  = () => { setShowForm(false); setEditId(null); setMsg(""); };

  const handleSave = async () => {
    if (!form.limit_amount || isNaN(Number(form.limit_amount))) { setMsg("Enter a valid limit amount."); return; }
    setSaving(true); setMsg("");
    const payload = {
      org_id: selectedOrg,
      project_id: form.project_id || null,
      budget_type: form.budget_type,
      limit_amount: Number(form.limit_amount),
      alert_threshold_percent: Number(form.alert_threshold_percent) || 80,
    };
    try {
      if (editId) await updateBudget(editId, payload);
      else        await createBudget(payload);
      closeForm();
      refresh();
    } catch (e) {
      setMsg(e.response?.data?.detail || "Save failed.");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this budget?")) return;
    try { await deleteBudget(id); refresh(); }
    catch (e) { alert(e.response?.data?.detail || "Delete failed."); }
  };

  const orgBudgets  = budgets.filter(b => !b.project_id);
  const projBudgets = budgets.filter(b =>  b.project_id);

  const BudgetCard = ({ b }) => {
    const spent  = Number(b.current_spend || 0);
    const limit  = Number(b.limit_amount || 0);
    const rawPct = limit > 0 ? (spent / limit) * 100 : 0;
    const barPct = Math.min(rawPct, 100);
    const color  = statusColor(b.status, rawPct);
    const label  = b.project_id ? (displayName(b.project_name) || displayName(b.project_id)) : "Org-level";

    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
            {b.budget_type && (
              <span style={{ marginLeft: 8, fontSize: 11, color: "var(--gray-400)", textTransform: "capitalize" }}>{b.budget_type}</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color, padding: "2px 10px", borderRadius: 20, background: `${color}15` }}>
              {rawPct.toFixed(1)}%
            </span>
            {b.id && (
              <>
                <button onClick={() => openEdit(b)} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "var(--gray-500)" }}>Edit</button>
                <button onClick={() => handleDelete(b.id)} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, border: "1px solid #fca5a5", background: "transparent", cursor: "pointer", color: "#ef4444" }}>Delete</button>
              </>
            )}
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "rgba(124,112,174,0.12)", overflow: "hidden", marginBottom: 8 }}>
          <div style={{ width: `${barPct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.4s" }} />
        </div>
        <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
          ${spent.toFixed(2)} spent of ${limit.toFixed(2)} limit ({rawPct.toFixed(1)}%)
        </div>
      </div>
    );
  };

  const SEL = { padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, width: "100%" };
  const INP = { ...SEL };

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Budget Status</h3>
          <p style={{ color: "var(--gray-500)", fontSize: 13 }}>Spend vs limit by organization.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {orgs.length > 0 && (
            <select value={selectedOrg} onChange={e => setSelectedOrg(e.target.value)} style={{ ...SEL, width: "auto" }}>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.org_name}</option>)}
            </select>
          )}
          {selectedOrg && (
            <button onClick={openCreate} style={{ padding: "6px 14px", borderRadius: 6, background: "#9E2A97", color: "#fff", border: "none", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
              + Set Budget
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 18, marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{editId ? "Edit Budget" : "New Budget"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 4 }}>Project (leave blank for org-level)</div>
              <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} style={SEL}>
                <option value="">— Org-level —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 4 }}>Budget Type</div>
              <select value={form.budget_type} onChange={e => setForm(f => ({ ...f, budget_type: e.target.value }))} style={SEL}>
                <option value="monthly">Monthly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 4 }}>Limit Amount ($)</div>
              <input type="number" min="0" step="0.01" value={form.limit_amount} onChange={e => setForm(f => ({ ...f, limit_amount: e.target.value }))} style={INP} placeholder="e.g. 500" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 4 }}>Alert Threshold (%)</div>
              <input type="number" min="1" max="100" value={form.alert_threshold_percent} onChange={e => setForm(f => ({ ...f, alert_threshold_percent: e.target.value }))} style={INP} placeholder="80" />
            </div>
          </div>
          {msg && <div style={{ fontSize: 12, color: "#ef4444" }}>{msg}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: "7px 18px", borderRadius: 6, background: "#9E2A97", color: "#fff", border: "none", fontSize: 13, cursor: "pointer" }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={closeForm} style={{ padding: "7px 14px", borderRadius: 6, background: "transparent", border: "1px solid var(--border)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {!selectedOrg ? (
        <p style={{ fontSize: 13, color: "var(--gray-400)" }}>Select an organization above.</p>
      ) : loading ? (
        <p style={{ fontSize: 13, color: "var(--gray-400)" }}>Loading…</p>
      ) : budgets.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--gray-500)", padding: "12px 0" }}>No budget configured for this organization.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {orgBudgets.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9E2A97", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Org-level</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {orgBudgets.map((b, i) => <BudgetCard key={i} b={b} />)}
              </div>
            </div>
          )}
          {projBudgets.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7C70AE", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Project-level</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {projBudgets.map((b, i) => <BudgetCard key={i} b={b} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
function Cost() {
  const [selectedProject, setSelectedProject]     = useState("");
  const [days, setDays]                           = useState(30);

  const [overview, setOverview]                   = useState(null);
  const [trends, setTrends]                       = useState([]);
  const [byProjectRaw, setByProject]               = useState([]);
  const [allProjects, setAllProjects]             = useState([]);
  const [allOrgs, setAllOrgs]                     = useState([]);
  const [byModel, setByModel]                     = useState([]);
  const [byProjectModel, setByProjectModel]       = useState([]);
  const [requests, setRequests]                   = useState([]);
  const [reqTotal, setReqTotal]                   = useState(0);
  const [reqPage, setReqPage]                     = useState(0);
  const [reqLoading, setReqLoading]               = useState(false);
  const [loading, setLoading]                     = useState(true);
  const [error, setError]                         = useState("");
  const [expandedProjects, setExpandedProjects]   = useState(new Set());
  const [activeCard, setActiveCard]               = useState(null);
  const PAGE_SIZE = 25;

  // Main aggregates (overview/trends/by-project/by-model) — only need to refetch
  // when the project/date filters change, not when paging through requests.
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [ovRes, prjRes, modRes, pmRes] = await Promise.allSettled([
        getProxyOverview(undefined, days),
        getProxyByProject(undefined, days),
        getProxyByModel(undefined, days),
        getProxyByProjectModel(undefined, days),
      ]);
      const val = (r, fb) => r.status === "fulfilled" ? (r.value?.data ?? fb) : fb;
      setOverview(val(ovRes, null));
      setByProject(val(prjRes, []));
      setByModel(val(modRes, []));
      setByProjectModel(val(pmRes, []));
      setError("");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to load cost data.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // Trends are scoped to the selected project (falls back to org-wide when
  // no project is selected), so they're fetched independently of the other
  // aggregates above which are always org-wide and filtered client-side.
  useEffect(() => {
    let cancelled = false;
    getProxyTrends(undefined, days, selectedProject || undefined)
      .then(res => { if (!cancelled) setTrends(res.data || []); })
      .catch(() => { if (!cancelled) setTrends([]); });
    return () => { cancelled = true; };
  }, [days, selectedProject]);

  // Request log — paginated independently so clicking Next/Prev only hits the
  // one cheap endpoint instead of re-running every aggregate query above.
  useEffect(() => { setReqPage(0); }, [selectedProject]);

  useEffect(() => {
    let cancelled = false;
    setReqLoading(true);
    getProxyRequests({ project_id: selectedProject || undefined, limit: PAGE_SIZE, offset: reqPage * PAGE_SIZE })
      .then(res => {
        if (cancelled) return;
        setRequests(res.data?.items || []);
        setReqTotal(res.data?.total || 0);
      })
      .catch(() => {
        if (cancelled) return;
        setRequests([]);
        setReqTotal(0);
      })
      .finally(() => { if (!cancelled) setReqLoading(false); });
    return () => { cancelled = true; };
  }, [selectedProject, reqPage]);

  // Cost aggregates are keyed by project_id/org_id but don't carry reliable names,
  // so resolve display names from the canonical lists instead of showing raw ids.
  useEffect(() => {
    getProjects()
      .then(r => setAllProjects(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAllProjects([]));
    getOrganizations()
      .then(r => setAllOrgs(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAllOrgs([]));
  }, []);

  const projectNameMap = useMemo(() => {
    const m = {};
    allProjects.forEach(p => { m[p.id] = p.project_name; });
    return m;
  }, [allProjects]);

  const orgNameMap = useMemo(() => {
    const m = {};
    allOrgs.forEach(o => { m[o.id] = o.org_name; });
    return m;
  }, [allOrgs]);

  const byProject = useMemo(
    () => byProjectRaw.map(r => ({ ...r, project_name: r.project_name || projectNameMap[r.project_id] })),
    [byProjectRaw, projectNameMap]
  );

  if (loading) return <div className="loading">Loading cost data…</div>;

  const grandTotal = byProject.reduce((s, r) => s + Number(r.total_cost || 0), 0);
  const totalPages = Math.ceil(reqTotal / PAGE_SIZE);

  // Build per-project token/cost aggregates from byProjectModel
  const projectModelMap = byProjectModel.reduce((acc, r) => {
    const key = r.project_id || "unassigned";
    if (!acc[key]) acc[key] = { input_tokens: 0, output_tokens: 0, input_cost: 0, output_cost: 0, rows: [] };
    acc[key].input_tokens  += Number(r.input_tokens  || 0);
    acc[key].output_tokens += Number(r.output_tokens || 0);
    acc[key].input_cost    += Number(r.input_cost    || 0);
    acc[key].output_cost   += Number(r.output_cost   || 0);
    acc[key].rows.push(r);
    return acc;
  }, {});

  const selProjData  = selectedProject ? byProject.find(r => (r.project_id || "unassigned") === selectedProject) : null;
  const selModelData = selectedProject ? projectModelMap[selectedProject] : null;

  const effectiveOverview = selectedProject && selProjData ? {
    total_cost:        selProjData.total_cost,
    llm_cost:          selProjData.llm_cost,
    total_requests:    selProjData.total_requests,
    completed:         selProjData.total_requests,
    total_tokens:      selProjData.total_tokens,
    prompt_tokens:     selModelData?.input_tokens  || 0,
    completion_tokens: selModelData?.output_tokens || 0,
    avg_latency_ms:    overview?.avg_latency_ms,
  } : overview;

  function toggleProject(pid) {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  }

  return (
    <>
      {/* ── Fixed filter bar ──────────────────────────────────────────────── */}
      <div className="page-filter-bar">
        <span style={{ fontWeight: 600, fontSize: 14 }}>Cost</span>

        {/* Project dropdown */}
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--gray-200)", fontSize: 13 }}>
          <option value="">All Projects</option>
          {byProject.map(r => (
            <option key={r.project_id || "unassigned"} value={r.project_id || "unassigned"}>
              {projLabel(r)}
            </option>
          ))}
        </select>

        {RANGE_OPTIONS.map(opt => (
          <button key={opt.value} type="button"
            className={`btn ${days === opt.value ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setDays(opt.value)}>
            {opt.label}
          </button>
        ))}

        {selectedProject && (
          <button className="btn btn-ghost" style={{ fontSize: 12, color: "#9E2A97" }}
            onClick={() => setSelectedProject("")}>
            ✕ Clear project
          </button>
        )}
      </div>

      {/* ── Scrollable page body ──────────────────────────────────────────── */}
      <div className="page-body"><div className="page-shell">

      {error && <div className="error-message">{error}</div>}

      {/* ── KPI Summary (always shown) ───────────────────────────────────── */}
      <section className="stats-grid stats-grid-overview">
        {[
          { label: "Total Cost",        value: money2(effectiveOverview?.total_cost),     sub: selectedProject ? "this project" : rangeLabel(days) },
          { label: "LLM Cost",          value: money2(effectiveOverview?.llm_cost),       sub: "model inference" },
          { label: "Total Requests",    value: num(effectiveOverview?.total_requests),    sub: `${num(effectiveOverview?.completed)} completed` },
          { label: "Avg Cost/Request",  value: money4((effectiveOverview?.total_cost || 0) / Math.max(effectiveOverview?.total_requests || 1, 1)), sub: "per proxied call" },
          { label: "Total Tokens",      value: num(effectiveOverview?.total_tokens),      sub: "input + output" },
          { label: "Prompt Tokens",     value: num(effectiveOverview?.prompt_tokens),     sub: "input" },
          { label: "Completion Tokens", value: num(effectiveOverview?.completion_tokens), sub: "output" },
          { label: "Avg Latency",       value: `${num(effectiveOverview?.avg_latency_ms)} ms`, sub: "end-to-end" },
        ].map(card => {
          const cardKey = card.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, "");
          return (
            <div key={card.label} className="metric-card metric-card-interactive" onClick={() => setActiveCard(cardKey)}>
              <div className="metric-eyebrow">{card.label}</div>
              <div className="metric-value">{card.value}</div>
              <div style={{ fontSize: 12, color: "var(--gray-400)", marginTop: 4 }}>{card.sub}</div>
            </div>
          );
        })}
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PROJECT SELECTED → Full detail view
          ════════════════════════════════════════════════════════════════════ */}
      {selectedProject ? (
        <ProjectDetailView
          projData={selProjData}
          modelData={selModelData}
          allProjects={byProject}
          trends={trends}
          requests={requests}
          reqTotal={reqTotal}
          reqPage={reqPage}
          setReqPage={setReqPage}
          days={days}
          grandTotal={grandTotal}
          orgNameMap={orgNameMap}
        />
      ) : (
        /* ════════════════════════════════════════════════════════════════════
           NO PROJECT SELECTED → Intelligence + overview
           ════════════════════════════════════════════════════════════════ */
        <>
          {/* 1 ── Project Intelligence */}
          <ProjectIntelligence byProject={byProject} projectModelMap={projectModelMap} grandTotal={grandTotal} orgNameMap={orgNameMap} />

          {/* 2 ── Project Breakdown (expandable table) */}
          {byProject.length > 0 && (
            <section className="panel">
              <div style={{ maxHeight: 1360, overflowY: "auto" }}>
                <div className="section-head" style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--white)", paddingBottom: 12 }}>
                  <div>
                    <h3>Project Breakdown</h3>
                    <p style={{ color: "var(--gray-500)", fontSize: 13 }}>Click a row to expand per-model details. Select a project above for the full deep-dive view.</p>
                  </div>
                  <span style={{ fontSize: 13, color: "var(--gray-500)" }}>{byProject.length} project{byProject.length !== 1 ? "s" : ""}</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {byProject.map(r => {
                  const pid        = r.project_id || "unassigned";
                  const pm         = projectModelMap[pid] || {};
                  const share      = grandTotal > 0 ? ((r.total_cost / grandTotal) * 100).toFixed(1) : 0;
                  const isOpen     = expandedProjects.has(pid);
                  const infraCost  = Number(r.total_cost || 0) - Number(r.llm_cost || 0);
                  const inputTok   = pm.input_tokens  || 0;
                  const outputTok  = pm.output_tokens || 0;
                  const totalTok   = inputTok + outputTok || Number(r.total_tokens || 0);

                  return (
                    <div key={pid} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                      <div onClick={() => toggleProject(pid)} style={{
                        padding: "14px 18px", cursor: "pointer",
                        background: isOpen ? "rgba(158,42,151,0.04)" : "var(--surface)",
                        borderBottom: isOpen ? "1px solid var(--border)" : "none",
                        display: "grid", gridTemplateColumns: "22px 1fr auto", alignItems: "center", gap: 12,
                      }}>
                        <span style={{ color: "var(--gray-400)", display: "flex" }}><ChevronIcon open={isOpen} /></span>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px 24px", alignItems: "start" }}>
                          <div style={{ gridColumn: "1 / -1", marginBottom: 2 }}>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>{projLabel(r)}</span>
                            <span style={{ marginLeft: 10, fontSize: 11, color: "var(--gray-400)", fontFamily: "monospace" }}>{orgLabel(r.org_id, orgNameMap)}</span>
                            {r.pii_hits > 0 && <span className="status-pill critical" style={{ marginLeft: 8 }}>{r.pii_hits} PII</span>}
                          </div>
                          <StatCell label="Requests"      value={num(r.total_requests)} />
                          <StatCell label="Input Tokens"  value={fmtTokens(inputTok)}  accent="#7C70AE" />
                          <StatCell label="Output Tokens" value={fmtTokens(outputTok)} accent="#9E2A97" />
                          <StatCell label="Total Tokens"  value={fmtTokens(totalTok)}  bold />
                          <StatCell label="Input Cost"    value={money(pm.input_cost)}  mono />
                          <StatCell label="Output Cost"   value={money(pm.output_cost)} mono />
                          <StatCell label="LLM Cost"      value={money(r.llm_cost)}     mono />
                          <StatCell label="Infra Cost"    value={money(infraCost)}       mono accent="#3FB6D4" />
                          <StatCell label="Total Cost"    value={money2(r.total_cost)}  mono bold accent="#9E2A97" />
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <div style={{ textAlign: "right", minWidth: 80 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: "#9E2A97" }}>{share}%</div>
                            <div style={{ marginTop: 4, height: 5, borderRadius: 4, background: "rgba(124,112,174,0.12)", overflow: "hidden" }}>
                              <div style={{ width: `${share}%`, height: "100%", background: "#9E2A97", borderRadius: 4 }} />
                            </div>
                            <div style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 4 }}>of total</div>
                          </div>
                          <ExportMenu projectId={pid} projectLabel={projLabel(r)} days={days} />
                        </div>
                      </div>

                      {isOpen && (
                        <div>
                          {(inputTok + outputTok) > 0 && (
                            <div style={{ padding: "10px 18px", background: "rgba(124,112,174,0.04)", borderBottom: "1px solid var(--border)" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <span style={{ fontSize: 12, color: "var(--gray-500)", whiteSpace: "nowrap" }}>Token split:</span>
                                <div style={{ flex: 1, height: 10, borderRadius: 5, overflow: "hidden", display: "flex" }}>
                                  <div style={{ width: `${Math.round((inputTok / (inputTok + outputTok)) * 100)}%`, background: "#7C70AE" }} />
                                  <div style={{ flex: 1, background: "#9E2A97" }} />
                                </div>
                                <span style={{ fontSize: 12, color: "#7C70AE", whiteSpace: "nowrap" }}>{fmtTokens(inputTok)} input ({Math.round((inputTok / (inputTok + outputTok)) * 100)}%)</span>
                                <span style={{ fontSize: 12, color: "#9E2A97", whiteSpace: "nowrap" }}>{fmtTokens(outputTok)} output ({Math.round((outputTok / (inputTok + outputTok)) * 100)}%)</span>
                              </div>
                            </div>
                          )}
                          {pm.rows && pm.rows.length > 0 ? (
                            <div className="table-wrap" style={{ margin: 0 }}>
                              <table>
                                <thead>
                                  <tr style={{ background: "rgba(124,112,174,0.06)" }}>
                                    <th>Model</th>
                                    <th>Route</th>
                                    <th style={{textAlign:"right"}}>Requests</th><th style={{textAlign:"right"}}>Input Tokens</th><th style={{textAlign:"right"}}>Output Tokens</th>
                                    <th style={{textAlign:"right"}}>Total Tokens</th><th style={{textAlign:"right"}}>Input Cost</th><th style={{textAlign:"right"}}>Output Cost</th>
                                    <th style={{textAlign:"right"}}>Total Cost</th><th style={{textAlign:"right"}}>Avg/Req</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pm.rows.map((mr, i) => {
                                    const avg = mr.total_requests ? Number(mr.total_cost || 0) / Number(mr.total_requests) : 0;
                                    return (
                                      <tr key={i}>
                                        <td><span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 20, background: `${modelColor(mr.model_name)}15`, border: `1px solid ${modelColor(mr.model_name)}40`, color: modelColor(mr.model_name), fontWeight: 600, fontFamily: "monospace" }}>{mr.model_name}</span></td>
                                        <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--gray-500)" }}>{mr.entry_point || "—"}</td>
                                        <td style={{textAlign:"right"}}>{num(mr.total_requests)}</td>
                                        <td style={{textAlign:"right", color:"#7C70AE", fontWeight:500}}>{fmtTokens(mr.input_tokens)}</td>
                                        <td style={{textAlign:"right", color:"#9E2A97", fontWeight:500}}>{fmtTokens(mr.output_tokens)}</td>
                                        <td style={{textAlign:"right", fontWeight:600}}>{fmtTokens(mr.total_tokens)}</td>
                                        <td style={{textAlign:"right", fontFamily:"monospace", fontSize:12}}>{money(mr.input_cost)}</td>
                                        <td style={{textAlign:"right", fontFamily:"monospace", fontSize:12}}>{money(mr.output_cost)}</td>
                                        <td style={{textAlign:"right", fontFamily:"monospace", fontSize:12, fontWeight:700, color:"#9E2A97"}}>{money(mr.total_cost)}</td>
                                        <td style={{textAlign:"right", fontFamily:"monospace", fontSize:11, color:"var(--gray-500)"}}>{money4(avg)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr style={{ borderTop: "2px solid rgba(124,112,174,0.2)", background: "rgba(158,42,151,0.03)" }}>
                                    <td><strong>Subtotal</strong></td>
                                    <td />
                                    <td style={{textAlign:"right"}}>{num(pm.rows.reduce((s,x)=>s+(x.total_requests||0),0))}</td>
                                    <td style={{textAlign:"right", color:"#7C70AE", fontWeight:600}}>{fmtTokens(pm.input_tokens)}</td>
                                    <td style={{textAlign:"right", color:"#9E2A97", fontWeight:600}}>{fmtTokens(pm.output_tokens)}</td>
                                    <td style={{textAlign:"right", fontWeight:700}}>{fmtTokens(pm.input_tokens + pm.output_tokens)}</td>
                                    <td style={{textAlign:"right", fontFamily:"monospace", fontSize:12, fontWeight:600}}>{money(pm.input_cost)}</td>
                                    <td style={{textAlign:"right", fontFamily:"monospace", fontSize:12, fontWeight:600}}>{money(pm.output_cost)}</td>
                                    <td style={{textAlign:"right", fontFamily:"monospace", fontSize:12, fontWeight:700, color:"#9E2A97"}}>{money(r.total_cost)}</td>
                                    <td />
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          ) : (
                            <div style={{ padding: "20px 18px", color: "var(--gray-500)", fontSize: 13 }}>No per-model detail available.</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Grand total footer */}
                <div style={{ padding: "12px 18px", border: "1px solid rgba(158,42,151,0.3)", borderRadius: 10, background: "rgba(158,42,151,0.04)", display: "grid", gridTemplateColumns: "22px 1fr auto", alignItems: "center", gap: 12 }}>
                  <span />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px 24px" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "#9E2A97" }}>Grand Total</span>
                      <span style={{ marginLeft: 10, fontSize: 12, color: "var(--gray-500)" }}>{byProject.length} projects</span>
                    </div>
                    <StatCell label="Requests"      value={num(byProject.reduce((s,r)=>s+(r.total_requests||0),0))} bold />
                    <StatCell label="Input Tokens"  value={fmtTokens(Object.values(projectModelMap).reduce((s,pm)=>s+pm.input_tokens,0))} accent="#7C70AE" bold />
                    <StatCell label="Output Tokens" value={fmtTokens(Object.values(projectModelMap).reduce((s,pm)=>s+pm.output_tokens,0))} accent="#9E2A97" bold />
                    <StatCell label="Total Tokens"  value={fmtTokens(byProject.reduce((s,r)=>s+(r.total_tokens||0),0))} bold />
                    <StatCell label="LLM Cost"      value={money(byProject.reduce((s,r)=>s+(r.llm_cost||0),0))} mono bold />
                    <StatCell label="Total Cost"    value={money2(grandTotal)} mono bold accent="#9E2A97" />
                  </div>
                  <div style={{ textAlign: "right", minWidth: 80 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#9E2A97" }}>100%</div>
                  </div>
                </div>
                </div>
              </div>
            </section>
          )}

          {/* 3 ── Daily Cost Trend */}
          <section className="panel">
            <div className="section-head"><div><h3>Daily Cost Trend</h3></div></div>
            <div style={{ width: "100%", minHeight: 220 }}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trends}>
                  <defs>
                    <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#9E2A97" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#9E2A97" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(124,112,174,0.12)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#6d6782", fontSize: 11 }} {...dateAxisTicks(trends.length)} />
                  <YAxis tick={{ fill: "#6d6782", fontSize: 11 }} tickFormatter={v => `$${Number(v).toFixed(4)}`} />
                  <Tooltip formatter={v => money(v)} />
                  <Area type="monotone" dataKey="total_cost" stroke="#9E2A97" fill="url(#costFill)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* 4 ── Cost by Model */}
          <section className="panel">
            <div className="section-head"><div><h3>Cost by Model</h3></div></div>
            {byModel.length > 0 ? (
              <>
                <div style={{ width: "100%", minHeight: 200 }}>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={byModel.slice(0, 8)}>
                      <CartesianGrid stroke="rgba(124,112,174,0.12)" vertical={false} />
                      <XAxis dataKey="model_name" tick={{ fill: "#6d6782", fontSize: 10 }} />
                      <YAxis tick={{ fill: "#6d6782", fontSize: 10 }} tickFormatter={v => `$${Number(v).toFixed(4)}`} />
                      <Tooltip formatter={(v, name) => name === "total_cost" ? money(v) : num(v)} />
                      <Bar dataKey="total_cost" fill="#9E2A97" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead><tr><th>Model</th><th>Provider</th><th>Requests</th><th>Tokens</th><th>Total Cost</th></tr></thead>
                    <tbody>
                      {byModel.map(r => (
                        <tr key={`${r.model_name}-${r.provider}`}>
                          <td><strong>{r.model_name}</strong></td>
                          <td>{r.provider}</td>
                          <td>{num(r.total_requests)}</td>
                          <td>{num(r.total_tokens)}</td>
                          <td><strong>{money(r.total_cost)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <div className="empty-state">No model cost data yet.</div>}
          </section>

          {/* 5 ── Comparative Analysis */}
          {byProject.length > 1 && (() => {
            const compData = byProject
              .map(r => ({
                name:     projLabel(r).slice(0, 20),
                cost:     Number(r.total_cost     || 0),
                tokens:   Number(r.total_tokens   || 0),
                requests: Number(r.total_requests || 0),
              }))
              .sort((a, b) => b.cost - a.cost);
            const compTotal = compData.reduce((s, d) => s + d.cost, 0);
            return (
              <section className="panel">
                <div className="section-head">
                  <div>
                    <h3>Comparative Analysis</h3>
                    <p style={{ fontSize: 13, color: "var(--gray-500)" }}>Cost, tokens and requests across all projects.</p>
                  </div>
                </div>
                <div style={{ width: "100%", minHeight: 240 }}>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={compData} margin={{ top: 4, right: 10, left: 0, bottom: 30 }}>
                      <CartesianGrid stroke="rgba(124,112,174,0.1)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: "#6d6782", fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                      <YAxis tick={{ fill: "#6d6782", fontSize: 10 }} tickFormatter={v => `$${Number(v).toFixed(4)}`} />
                      <Tooltip formatter={v => money2(v)} />
                      <Bar dataKey="cost" name="Total Cost" radius={[4, 4, 0, 0]}>
                        {compData.map((d, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr><th>Project</th><th style={{textAlign:"right"}}>Cost</th><th style={{textAlign:"right"}}>Tokens</th><th style={{textAlign:"right"}}>Requests</th><th style={{textAlign:"right"}}>Cost Share</th></tr>
                    </thead>
                    <tbody>
                      {compData.map((d, i) => (
                        <tr key={i}>
                          <td>
                            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: CHART_COLORS[i % CHART_COLORS.length], marginRight: 8, verticalAlign: "middle" }} />
                            {d.name}
                          </td>
                          <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money2(d.cost)}</td>
                          <td style={{ textAlign: "right" }}>{fmtTokens(d.tokens)}</td>
                          <td style={{ textAlign: "right" }}>{num(d.requests)}</td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                              <div style={{ width: 60, height: 5, borderRadius: 3, background: "rgba(124,112,174,0.15)", overflow: "hidden" }}>
                                <div style={{ width: `${compTotal > 0 ? pct(d.cost, compTotal) : 0}%`, height: "100%", background: CHART_COLORS[i % CHART_COLORS.length] }} />
                              </div>
                              <span style={{ fontSize: 11, color: "var(--gray-500)" }}>{compTotal > 0 ? pct(d.cost, compTotal) : "0.0"}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })()}

          {/* 6 ── Request log */}
          <section className="panel">
            <div className="section-head">
              <div><h3>Request Log</h3><p style={{ color: "var(--gray-500)", fontSize: 13 }}>{num(reqTotal)} total</p></div>
            </div>
            <RequestTable requests={requests} projectNameMap={projectNameMap} />
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
                <button className="btn btn-ghost" disabled={reqPage === 0} onClick={() => setReqPage(p => p - 1)}>← Prev</button>
                <span style={{ padding: "6px 12px", fontSize: 13 }}>Page {reqPage + 1} of {totalPages}</span>
                <button className="btn btn-ghost" disabled={reqPage >= totalPages - 1} onClick={() => setReqPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </section>

          {/* 7 ── Budget Status */}
          <BudgetStatusSection />
        </>
      )}

      </div></div>{/* close page-shell + page-body */}

      {activeCard && (
        <CostKpiModal
          cardKey={activeCard}
          overview={effectiveOverview}
          byProject={byProject}
          byModel={byModel}
          grandTotal={grandTotal}
          onClose={() => setActiveCard(null)}
        />
      )}
    </>
  );
}

export default Cost;
