import React, { useCallback, useEffect, useState } from "react";
import {
  getOptimizationTips, getOptimizationTipsSummary,
  dismissOptimizationTip, applyOptimizationTip, rebuildOptimizationTips,
  getProjects, getProxyRequests, getProxyRequestPiiDetail,
} from "../api";
import { displayName } from "../utils/displayName";

// ── Formatters ────────────────────────────────────────────────────────────────
const num   = (v) => Number(v || 0).toLocaleString();
const money = (v) => `$${Number(v || 0).toFixed(2)}`;
const PAGE_SIZE = 20;

const TIP_TYPE_META = {
  response_length:    { label: "Response Length",    action: "Cap max_tokens",     color: "#f59e0b" },
  model_substitution: { label: "Model Substitution",  action: "Switch model",       color: "#9E2A97" },
  oversized_prompt:   { label: "Oversized Prompt",    action: "Trim prompt",        color: "#3FB6D4" },
  response_truncated: { label: "Response Truncated",  action: "Raise max_tokens",   color: "#ef4444" },
  cache_opportunity:  { label: "Cache Opportunity",   action: "Add caching",        color: "#10b981" },
};

const SEV_COLOR = { high: "#ef4444", medium: "#f59e0b" };
function SeverityChip({ value }) {
  if (!value) return null;
  const v = value.toLowerCase();
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, textTransform: "capitalize",
      background: `${SEV_COLOR[v] || "#6b7280"}18`,
      color: SEV_COLOR[v] || "#6b7280",
      border: `1px solid ${SEV_COLOR[v] || "#6b7280"}40`,
    }}>{value}</span>
  );
}

const CONF_COLOR = { high: "#15803d", medium: "#92400e", low: "#64748b" };
function ConfidenceChip({ value }) {
  if (!value) return null;
  const v = value.toLowerCase();
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: CONF_COLOR[v] || "var(--gray-500)" }}>
      {value} confidence
    </span>
  );
}

const STATUS_PILL = { open: "open", dismissed: "closed", applied: "success" };

// ── Request drill-down modal ──────────────────────────────────────────────────
function RequestDrilldownModal({ requestId, onClose }) {
  const [request, setRequest]     = useState(null);
  const [detail, setDetail]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    if (!requestId) return;
    setRequest(null); setDetail(null); setError(""); setLoading(true);
    getProxyRequests({ request_id: requestId })
      .then((res) => setRequest((res.data?.items || res.data || [])[0] || null))
      .catch(() => setError("Failed to load request detail."))
      .finally(() => setLoading(false));
  }, [requestId]);

  if (!requestId) return null;

  const loadPrompt = () => {
    setDetailLoading(true);
    getProxyRequestPiiDetail(requestId)
      .then((res) => setDetail(res.data))
      .catch(() => setError("Failed to load prompt text."))
      .finally(() => setDetailLoading(false));
  };

  return (
    <div onClick={onClose} className="modal-backdrop" style={{ zIndex: 2200 }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-dialog"
        style={{ maxWidth: 760, padding: "24px 28px", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="modal-header" style={{ marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>Request Detail</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--gray-500)", fontFamily: "monospace" }}>{requestId}</p>
          </div>
          <button onClick={onClose} className="btn-close">×</button>
        </div>

        {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "var(--gray-400)" }}>Loading…</div>}
        {error   && <div style={{ color: "#ef4444", fontSize: 13 }}>{error}</div>}

        {request && (
          <div style={{
            display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap",
            padding: "12px 16px", borderRadius: 10, marginBottom: 20,
            background: "var(--gray-50)", border: "1px solid var(--gray-200)",
          }}>
            <div>
              <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Model</span>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{request.model_name || "—"}</div>
            </div>
            <div style={{ borderLeft: "1px solid var(--gray-200)", paddingLeft: 24 }}>
              <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Tokens</span>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{num(request.total_tokens)}</div>
            </div>
            <div style={{ borderLeft: "1px solid var(--gray-200)", paddingLeft: 24 }}>
              <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cost</span>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{money(request.total_cost)}</div>
            </div>
            <div style={{ borderLeft: "1px solid var(--gray-200)", paddingLeft: 24 }}>
              <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Latency</span>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{num(request.latency_ms)} ms</div>
            </div>
            <div style={{ borderLeft: "1px solid var(--gray-200)", paddingLeft: 24 }}>
              <span style={{ fontSize: 11, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Status</span>
              <div style={{ marginTop: 4 }}>
                <span className={`status-pill ${request.request_status === "completed" ? "success" : "medium"}`}>{request.request_status || "—"}</span>
              </div>
            </div>
          </div>
        )}

        {!detail && (
          <button type="button" className="btn btn-ghost" disabled={detailLoading} onClick={loadPrompt}>
            {detailLoading ? "Loading…" : "Show prompt & response"}
          </button>
        )}

        {detail && (
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gray-500)", marginBottom: 6, textTransform: "uppercase" }}>Prompt</div>
              <pre style={{
                margin: 0, padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6,
                background: "var(--gray-50)", border: "1px solid var(--gray-200)",
                whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 260, overflowY: "auto",
              }}>{detail.sanitized_prompt_text || detail.original_prompt_text || "—"}</pre>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gray-500)", marginBottom: 6, textTransform: "uppercase" }}>Response</div>
              <pre style={{
                margin: 0, padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6,
                background: "var(--gray-50)", border: "1px solid var(--gray-200)",
                whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 260, overflowY: "auto",
              }}>{detail.response_text || "—"}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Evidence drill-down panel ─────────────────────────────────────────────────
function EvidencePanel({ tip, onOpenRequest }) {
  const ev = tip.evidence_json || {};
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--gray-200)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
        {ev.observed && (
          <div>
            <div style={{ fontSize: 10, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Observed</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{num(ev.observed.value)} <span style={{ fontSize: 11, fontWeight: 400, color: "var(--gray-500)" }}>{ev.observed.unit}</span></div>
          </div>
        )}
        {ev.baseline && (
          <div>
            <div style={{ fontSize: 10, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Baseline</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{num(ev.baseline.value)} <span style={{ fontSize: 11, fontWeight: 400, color: "var(--gray-500)" }}>{ev.baseline.unit}</span></div>
          </div>
        )}
        {ev.sample_size != null && (
          <div>
            <div style={{ fontSize: 10, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Sample Size</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{num(ev.sample_size)}</div>
          </div>
        )}
        {ev.window_days != null && (
          <div>
            <div style={{ fontSize: 10, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Window</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{ev.window_days}d</div>
          </div>
        )}
      </div>

      {ev.params && Object.keys(ev.params).length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {Object.entries(ev.params).map(([k, v]) => (
            <span key={k} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "var(--gray-100)", color: "var(--gray-700)" }}>
              <strong style={{ fontWeight: 700 }}>{k}:</strong> {String(v)}
            </span>
          ))}
        </div>
      )}

      {ev.sample_request_ids?.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Sample Requests</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ev.sample_request_ids.map((id) => (
              <button key={id} type="button" className="btn btn-ghost"
                style={{ fontSize: 10, padding: "3px 10px", fontFamily: "monospace" }}
                onClick={() => onOpenRequest(id)}>
                {id}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tip card ───────────────────────────────────────────────────────────────────
function TipCard({ tip, expanded, onToggle, onDismiss, onApply, onOpenRequest }) {
  const meta = TIP_TYPE_META[tip.tip_type] || { label: tip.tip_type, action: "", color: "#6b7280" };
  const savings = Number(tip.estimated_monthly_savings || 0);

  return (
    <div className="panel" style={{ padding: "14px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
              background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}40`,
            }}>{meta.label}</span>
            <SeverityChip value={tip.severity} />
            <ConfidenceChip value={tip.confidence} />
            <span className={`status-pill ${STATUS_PILL[tip.status] || ""}`} style={{ fontSize: 10, padding: "1px 8px" }}>{tip.status}</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--gray-700)", marginBottom: 4 }}>{tip.title}</div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--gray-500)", lineHeight: 1.6 }}>{tip.message}</p>
          <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: "var(--gray-500)" }}>
            {tip.model_name && <span>Model: <strong style={{ color: "var(--gray-700)" }}>{tip.model_name}</strong></span>}
            <span>Project: <strong style={{ color: "var(--gray-700)" }}>{displayName(tip.project_name) || displayName(tip.project_id) || "org-wide"}</strong></span>
            <span>{tip.period_start} → {tip.period_end}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          {savings > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#10b981" }}>{money(savings)}/mo</div>
              <div style={{ fontSize: 10, color: "var(--gray-500)" }}>est. savings</div>
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }}
              disabled={tip.status !== "open"} onClick={() => onDismiss(tip.id)}>
              Dismiss
            </button>
            <button type="button" className="btn btn-primary" style={{ fontSize: 11, padding: "4px 10px" }}
              disabled={tip.status !== "open"} onClick={() => onApply(tip.id)}>
              Apply
            </button>
          </div>
        </div>
      </div>

      <button type="button" onClick={onToggle}
        style={{ marginTop: 10, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#9E2A97", fontWeight: 600, padding: 0 }}>
        {expanded ? "Hide evidence ▲" : "View evidence ▼"}
      </button>

      {expanded && <EvidencePanel tip={tip} onOpenRequest={onOpenRequest} />}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
function OptimizationTips() {
  const [projects, setProjects]             = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [tipTypeFilter, setTipTypeFilter]   = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter]     = useState("open");
  const [page, setPage]                     = useState(0);

  const [tips, setTips]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [summary, setSummary] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [drilldownId, setDrilldownId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState("");

  useEffect(() => {
    getProjects().then((r) => setProjects(r.data || [])).catch(() => {});
  }, []);

  const loadTips = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getOptimizationTips({
        status: statusFilter || "",
        project_id: selectedProject || undefined,
        tip_type: tipTypeFilter || undefined,
        severity: severityFilter || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setTips(res.data?.items || []);
      setTotal(res.data?.total || 0);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to load optimization tips.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedProject, tipTypeFilter, severityFilter, page]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await getOptimizationTipsSummary(undefined, selectedProject || undefined);
      setSummary(res.data);
    } catch {
      setSummary(null);
    }
  }, [selectedProject]);

  useEffect(() => { loadTips(); }, [loadTips]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { setPage(0); }, [selectedProject, tipTypeFilter, severityFilter, statusFilter]);

  const applyStatusChange = (id, newStatus, updater) => {
    updater(id).then((res) => {
      // Once a tip leaves "open" it drops out of an open-only view; elsewhere just patch its status in place.
      if (statusFilter === "open" && newStatus !== "open") {
        setTips((prev) => prev.filter((t) => t.id !== id));
        setTotal((prev) => Math.max(0, prev - 1));
      } else {
        setTips((prev) => prev.map((t) => (t.id === id ? res.data : t)));
      }
      loadSummary();
    }).catch((err) => {
      setError(err?.response?.data?.detail || "Action failed.");
    });
  };

  const handleDismiss = (id) => applyStatusChange(id, "dismissed", dismissOptimizationTip);
  const handleApply   = (id) => applyStatusChange(id, "applied", applyOptimizationTip);

  const handleRebuild = async () => {
    setRebuilding(true);
    setRebuildMsg("");
    try {
      const res = await rebuildOptimizationTips();
      setRebuildMsg(`Inserted ${res.data?.inserted ?? 0} new tip${res.data?.inserted === 1 ? "" : "s"}.`);
      loadTips();
      loadSummary();
    } catch (err) {
      setRebuildMsg(err?.response?.data?.detail || "Rebuild failed.");
    } finally {
      setRebuilding(false);
    }
  };

  const pages = Math.ceil(total / PAGE_SIZE);
  const byType = summary?.by_tip_type || {};

  return (
    <>
      {/* ── Fixed filter bar ─────────────────────────────────────────────── */}
      <div className="page-filter-bar">
        <span style={{ fontWeight: 600, fontSize: 14 }}>Optimization Tips</span>

        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--gray-200)", fontSize: 13 }}
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{displayName(p.project_name) || displayName(p.id)}</option>
          ))}
        </select>

        <select
          value={tipTypeFilter}
          onChange={(e) => setTipTypeFilter(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--gray-200)", fontSize: 13 }}
        >
          <option value="">All Tip Types</option>
          {Object.entries(TIP_TYPE_META).map(([key, m]) => (
            <option key={key} value={key}>{m.label}</option>
          ))}
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--gray-200)", fontSize: 13 }}
        >
          <option value="">All Severities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
        </select>

        {["open", "dismissed", "applied"].map((s) => (
          <button key={s} type="button"
            className={`btn ${statusFilter === s ? "btn-primary" : "btn-ghost"}`}
            style={{ fontSize: 12, padding: "6px 12px", textTransform: "capitalize" }}
            onClick={() => setStatusFilter(s)}>
            {s}
          </button>
        ))}

        <button type="button" className="btn btn-ghost" onClick={() => { loadTips(); loadSummary(); }}>Refresh</button>
        <button type="button" className="btn btn-ghost" disabled={rebuilding} onClick={handleRebuild}>
          {rebuilding ? "Rebuilding…" : "Rebuild now"}
        </button>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className="page-body" style={{ padding: "12px 16px", overflow: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {error && <div className="error-message">{error}</div>}
          {rebuildMsg && <div className="list-meta">{rebuildMsg}</div>}

          {/* ── Header stat row ─────────────────────────────────────────── */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div className="metric-card" style={{ padding: "16px 20px", minWidth: 160 }}>
              <div className="metric-eyebrow">Open Tips</div>
              <div className="metric-value">{num(summary?.total_open)}</div>
            </div>
            <div className="metric-card" style={{ padding: "16px 20px", minWidth: 200 }}>
              <div className="metric-eyebrow">Potential Monthly Savings</div>
              <div className="metric-value" style={{ color: "#10b981" }}>{money(summary?.total_estimated_monthly_savings)}</div>
            </div>
            {Object.entries(byType).map(([type, v]) => {
              const meta = TIP_TYPE_META[type] || { label: type, color: "#6b7280" };
              return (
                <div key={type} className="metric-card" style={{ padding: "12px 16px", minWidth: 150 }}>
                  <div className="metric-eyebrow" style={{ color: meta.color }}>{meta.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{v.count}</div>
                  {v.estimated_monthly_savings > 0 && (
                    <div style={{ fontSize: 11, color: "var(--gray-500)" }}>{money(v.estimated_monthly_savings)}/mo</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Tip list ─────────────────────────────────────────────────── */}
          {loading ? (
            <div className="loading">Loading optimization tips…</div>
          ) : tips.length === 0 ? (
            <div className="panel" style={{ padding: "40px 20px", textAlign: "center", color: "var(--gray-500)" }}>
              No optimization tips right now — usage looks efficient for the selected filters.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {tips.map((tip) => (
                <TipCard
                  key={tip.id}
                  tip={tip}
                  expanded={expandedId === tip.id}
                  onToggle={() => setExpandedId((prev) => (prev === tip.id ? null : tip.id))}
                  onDismiss={handleDismiss}
                  onApply={handleApply}
                  onOpenRequest={setDrilldownId}
                />
              ))}
            </div>
          )}

          {pages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 6, paddingTop: 6 }}>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
              <span style={{ padding: "4px 10px", fontSize: 12 }}>Page {page + 1} of {pages}</span>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          )}
        </div>
      </div>

      {drilldownId && <RequestDrilldownModal requestId={drilldownId} onClose={() => setDrilldownId(null)} />}
    </>
  );
}

export default OptimizationTips;
