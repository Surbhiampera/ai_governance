import React, { useCallback, useEffect, useState } from "react";
import {
  getOrganizations,
  createOrganization,
  getProjects,
  createProject,
  createGovernanceKey,
  listGovernanceKeys,
  revokeGovernanceKey,
  getProxyPiiSummary,
  getProxyRequests,
  getProxyByProjectModel,
} from "../api";

const INPUT_STYLE = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

const PII_COLOR = {
  email: "#6366f1", phone: "#8b5cf6", ssn: "#ef4444", aadhar: "#ef4444",
  national_id: "#ef4444", credit_card: "#ef4444", name: "#f59e0b",
  ip_address: "#3b82f6", date_of_birth: "#f97316",
};
const ACTION_COLOR = { mask: "#f59e0b", block: "#ef4444", alert: "#f97316", allow: "#22c55e" };

const PROXY_BASE = import.meta.env.VITE_API_URL || "https://aigovernance-backend-1.onrender.com";

// ─── Organization ────────────────────────────────────────────────────────────
function OrgStep({ orgs, setOrgs, selectedOrg, setSelectedOrg }) {
  const [name, setName]         = useState("");
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filtered = orgs.filter((o) =>
    (o.name || o.id).toLowerCase().includes(name.toLowerCase())
  );

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const orgName = name.trim();
    const orgId = orgName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") + "_" + Date.now();
    try {
      const r = await createOrganization({ id: orgId, org_name: orgName });
      const newOrg = r.data;
      const refreshed = await getOrganizations();
      const list = refreshed.data?.organizations || refreshed.data || [];
      setOrgs(list);
      setSelectedOrg(newOrg.id || newOrg.org_id);
      setName(orgName);
      setMsg(`Organization "${orgName}" created.`);
    } catch (e) {
      const detail = e.response?.data?.detail;
      const errMsg = Array.isArray(detail)
        ? detail.map((d) => d.msg || JSON.stringify(d)).join("; ")
        : (detail || e.message);
      setMsg("Error: " + errMsg);
    }
    setSaving(false);
    setShowSuggestions(false);
  };

  const handleSelect = (o) => {
    setSelectedOrg(o.id);
    setName(o.name || o.id);
    setShowSuggestions(false);
  };

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Organization</h3>
          <p className="panel-muted">Type a new organization name or select an existing one.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, position: "relative" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            style={{ ...INPUT_STYLE }}
            placeholder="Organization name"
            value={name}
            onChange={(e) => { setName(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          {showSuggestions && filtered.length > 0 && (
            <ul style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
              background: "var(--white, #fff)", border: "1px solid var(--border)",
              borderRadius: 6, margin: "2px 0 0", padding: 0, listStyle: "none",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 180, overflowY: "auto",
            }}>
              {filtered.map((o) => (
                <li
                  key={o.id}
                  onMouseDown={() => handleSelect(o)}
                  style={{
                    padding: "8px 12px", fontSize: 13, cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    background: selectedOrg === o.id ? "var(--gray-50, #f9fafb)" : "transparent",
                  }}
                >
                  {o.name || o.id}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !name.trim()}
          style={{ whiteSpace: "nowrap" }}>
          {saving ? "Creating…" : "Create Org"}
        </button>
      </div>

      {msg && (
        <p style={{ fontSize: 13, color: msg.startsWith("Error") ? "#ef4444" : "#22c55e", marginBottom: 10 }}>
          {msg}
        </p>
      )}
    </section>
  );
}

// ─── Project ─────────────────────────────────────────────────────────────────
function ProjectStep({ orgId, projects, setProjects, selectedProject, setSelectedProject }) {
  const [name, setName]             = useState("");
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const load = useCallback(() => {
    if (!orgId) return;
    getProjects(orgId).then((r) => {
      const list = r.data?.projects || r.data || [];
      setProjects(list);
    }).catch(() => {});
  }, [orgId, setProjects]);

  useEffect(() => { load(); }, [load]);

  const filtered = projects.filter((p) =>
    (p.project_name || p.id).toLowerCase().includes(name.toLowerCase())
  );

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const projName = name.trim();
    const projId = projName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") + "_" + Date.now();
    try {
      const r = await createProject({ id: projId, org_id: orgId, project_name: projName });
      const newProj = r.data;
      load();
      setSelectedProject(newProj.id);
      setName(projName);
      setMsg(`Project "${projName}" created.`);
    } catch (e) {
      const detail = e.response?.data?.detail;
      const errMsg = Array.isArray(detail)
        ? detail.map((d) => d.msg || JSON.stringify(d)).join("; ")
        : (detail || e.message);
      setMsg("Error: " + errMsg);
    }
    setSaving(false);
    setShowSuggestions(false);
  };

  const handleSelect = (p) => {
    setSelectedProject(p.id);
    setName(p.project_name || p.id);
    setShowSuggestions(false);
  };

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Project</h3>
          <p className="panel-muted">Type a new project name or select an existing one.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, position: "relative" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            style={{ ...INPUT_STYLE }}
            placeholder="Project name"
            value={name}
            onChange={(e) => { setName(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          {showSuggestions && filtered.length > 0 && (
            <ul style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
              background: "var(--white, #fff)", border: "1px solid var(--border)",
              borderRadius: 6, margin: "2px 0 0", padding: 0, listStyle: "none",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 180, overflowY: "auto",
            }}>
              {filtered.map((p) => (
                <li
                  key={p.id}
                  onMouseDown={() => handleSelect(p)}
                  style={{
                    padding: "8px 12px", fontSize: 13, cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    background: selectedProject === p.id ? "var(--gray-50, #f9fafb)" : "transparent",
                  }}
                >
                  {p.project_name || p.id}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !name.trim()}
          style={{ whiteSpace: "nowrap" }}>
          {saving ? "Creating…" : "Create Project"}
        </button>
      </div>

      {msg && (
        <p style={{ fontSize: 13, color: msg.startsWith("Error") ? "#ef4444" : "#22c55e", marginBottom: 10 }}>
          {msg}
        </p>
      )}
    </section>
  );
}

// ─── Integration Guide ───────────────────────────────────────────────────────
function IntegrationGuide({ proxyBase }) {
  const [tab, setTab] = useState("python");

  const TAB_STYLE = (active) => ({
    padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 600,
    background: active ? "var(--brand-primary, #6366f1)" : "transparent",
    color: active ? "#fff" : "var(--gray-500)",
  });

  const snippets = {
    python: {
      label: "Python",
      note: "2 lines added — nothing else changes",
      code: `from openai import OpenAI

client = OpenAI(
    api_key="sk-...",                             # unchanged
    base_url="${proxyBase}/proxy/openai",  # ← add this
    default_headers={"X-Governance-Key": "gov-..."}, # ← add this
)

# All existing code stays exactly the same ↓
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)`,
    },
    node: {
      label: "Node.js",
      note: "2 lines added — nothing else changes",
      code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-...",                                    // unchanged
  baseURL: "${proxyBase}/proxy/openai",       // ← add this
  defaultHeaders: { "X-Governance-Key": "gov-..." },  // ← add this
});

// All existing code stays exactly the same ↓
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});`,
    },
    env: {
      label: "Env vars",
      note: "Zero code change — set once in .env",
      code: `# .env  (or CI/CD secrets)
OPENAI_BASE_URL=${proxyBase}/proxy/openai
GOVERNANCE_KEY=gov-...

# In code — read from env, no hardcoded changes
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["OPENAI_API_KEY"],          # unchanged
    base_url=os.environ["OPENAI_BASE_URL"],        # from .env
    default_headers={"X-Governance-Key": os.environ["GOVERNANCE_KEY"]},
)`,
    },
  };

  const current = snippets[tab];

  return (
    <div style={{ marginTop: 20 }}>
      {/* Tabs */}
      <div style={{
        background: "var(--gray-50)", borderRadius: 12,
        border: "1px solid rgba(124,112,174,0.16)", overflow: "hidden",
      }}>
        <div style={{
          display: "flex", gap: 4, padding: "10px 10px 0",
          borderBottom: "1px solid var(--border)", background: "var(--gray-100,#f3f4f6)",
        }}>
          {Object.entries(snippets).map(([key, s]) => (
            <button key={key} style={TAB_STYLE(tab === key)} onClick={() => setTab(key)}>
              {s.label}
            </button>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#22c55e", fontWeight: 600,
            alignSelf: "center", paddingRight: 8 }}>
            ✓ {current.note}
          </span>
        </div>
        <pre style={{
          color: "var(--brand-primary)", fontSize: 12, margin: 0,
          padding: "16px", overflowX: "auto", lineHeight: 1.6,
        }}>{current.code}</pre>
      </div>
    </div>
  );
}

// ─── Secret Key ──────────────────────────────────────────────────────────────
function KeyStep({ orgId, projectId }) {
  const [keys, setKeys]     = useState([]);
  const [name, setName]     = useState("");
  const [newKey, setNewKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");

  const load = useCallback(() => {
    if (!orgId) return;
    listGovernanceKeys(orgId).then((r) => setKeys(r.data || [])).catch(() => {});
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const r = await createGovernanceKey({
        org_id: orgId,
        key_name: name.trim(),
        project_id: projectId || undefined,
      });
      setNewKey(r.data);
      setName("");
      setMsg("");
      load();
    } catch (e) {
      const detail = e.response?.data?.detail;
      const errMsg = Array.isArray(detail)
        ? detail.map((d) => d.msg || JSON.stringify(d)).join("; ")
        : (detail || e.message);
      setMsg("Error: " + errMsg);
    }
    setSaving(false);
  };

  const handleRevoke = async (keyId) => {
    await revokeGovernanceKey(keyId);
    load();
  };

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Secret Key (share with external team)</h3>
          <p className="panel-muted">
            Create a governance key and hand it to the external team. That's all they need.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          style={{ ...INPUT_STYLE, flex: 1 }}
          placeholder="Key name  (e.g. Team Alpha – Production)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <button className="btn btn-primary" onClick={handleCreate}
          disabled={saving || !name.trim()} style={{ whiteSpace: "nowrap" }}>
          {saving ? "Creating…" : "Create Key"}
        </button>
      </div>

      {msg && (
        <p style={{ fontSize: 13, color: msg.startsWith("Error") ? "#ef4444" : "#22c55e", marginBottom: 10 }}>
          {msg}
        </p>
      )}

      {/* New key reveal */}
      {newKey && (
        <div style={{
          background: "rgba(34,197,94,0.07)", border: "1px solid #22c55e",
          borderRadius: 10, padding: 16, marginBottom: 16,
        }}>
          <p style={{ fontWeight: 600, margin: "0 0 8px", color: "#166534" }}>
            Key created — copy it now, it won't be shown again
          </p>
          <code style={{
            display: "block", fontFamily: "monospace", fontSize: 13,
            wordBreak: "break-all", background: "#f0fdf4",
            padding: "8px 12px", borderRadius: 6, color: "#166534", marginBottom: 10,
          }}>
            {newKey.raw_key}
          </code>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setNewKey(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Existing keys table */}
      {keys.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: 20 }}>
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Key hint</th><th>Project</th>
                <th>Last used</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.key_id}>
                  <td><strong>{k.key_name}</strong></td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{k.raw_key_hint}</td>
                  <td>{k.project_id || <span style={{ color: "var(--gray-400)" }}>—</span>}</td>
                  <td style={{ fontSize: 12, color: "var(--gray-500)" }}>
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}
                  </td>
                  <td>
                    <span className={`status-pill ${k.is_active ? "success" : "low"}`}>
                      {k.is_active ? "active" : "revoked"}
                    </span>
                  </td>
                  <td>
                    {k.is_active && (
                      <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => handleRevoke(k.key_id)}>Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Integration guide */}
      <IntegrationGuide proxyBase={PROXY_BASE} />
    </section>
  );
}

// ─── Automated: PII Activity ─────────────────────────────────────────────────
function PiiActivity({ orgId }) {
  const [summary, setSummary] = useState(null);
  const [recent, setRecent]   = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!orgId) return;
    setLoading(true);
    Promise.all([
      getProxyPiiSummary(orgId, 30),
      getProxyRequests({ org_id: orgId, pii_only: true, limit: 20 }),
    ])
      .then(([s, r]) => {
        setSummary(s.data || null);
        setRecent(r.data?.items || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const total   = summary?.total_pii_requests || 0;
  const blocked = summary?.blocked_requests || 0;
  const masked  = (summary?.action_breakdown || []).find((a) => a.action === "mask")?.count || 0;
  const types   = summary?.pii_type_breakdown || [];

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>PII Detection  <span style={{ fontSize: 12, fontWeight: 400, color: "var(--gray-500)" }}>— automated</span></h3>
          <p className="panel-muted">
            Every request is scanned automatically. Nothing to configure.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading} style={{ fontSize: 12 }}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { label: "PII Detected (30d)", value: total,   color: "#f59e0b" },
          { label: "Requests Blocked",   value: blocked, color: "#ef4444" },
          { label: "Fields Masked",      value: masked,  color: "#6366f1" },
        ].map((c) => (
          <div key={c.label} style={{
            background: "var(--surface-1,#fff)",
            border: `1px solid ${c.color}30`,
            borderLeft: `4px solid ${c.color}`,
            borderRadius: 10, padding: "12px 18px", minWidth: 160,
          }}>
            <div style={{ fontSize: 11, color: "var(--gray-500)", marginBottom: 4,
              textTransform: "uppercase", letterSpacing: "0.1em" }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {types.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-500)", marginBottom: 8,
            textTransform: "uppercase", letterSpacing: "0.1em" }}>Detected PII Types</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {types.map((t) => (
              <div key={t.pii_type} style={{
                background: `${PII_COLOR[t.pii_type] || "#6366f1"}15`,
                border: `1px solid ${PII_COLOR[t.pii_type] || "#6366f1"}40`,
                borderRadius: 20, padding: "5px 14px",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "monospace",
                  color: PII_COLOR[t.pii_type] || "#6366f1" }}>{t.pii_type}</span>
                <span style={{ fontSize: 13, fontWeight: 700,
                  color: PII_COLOR[t.pii_type] || "#6366f1" }}>{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Request ID</th><th>Project</th><th>Model</th>
              <th>PII Found</th><th>Action</th><th>Status</th><th>Time</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.request_id}>
                <td style={{ fontFamily: "monospace", fontSize: 11 }}>{r.request_id}</td>
                <td>{r.project_id || <span style={{ color: "var(--gray-400)" }}>—</span>}</td>
                <td>{r.model_name || "—"}</td>
                <td>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(r.pii_types || []).map((pt) => (
                      <span key={pt} style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 10,
                        fontFamily: "monospace",
                        background: `${PII_COLOR[pt] || "#6366f1"}18`,
                        color: PII_COLOR[pt] || "#6366f1",
                        border: `1px solid ${PII_COLOR[pt] || "#6366f1"}40`,
                      }}>{pt}</span>
                    ))}
                  </div>
                </td>
                <td>
                  {r.pii_action_taken ? (
                    <span style={{
                      fontSize: 11, padding: "2px 10px", borderRadius: 10, fontWeight: 600,
                      background: `${ACTION_COLOR[r.pii_action_taken] || "#6b7280"}18`,
                      color: ACTION_COLOR[r.pii_action_taken] || "#6b7280",
                      border: `1px solid ${ACTION_COLOR[r.pii_action_taken] || "#6b7280"}40`,
                    }}>{r.pii_action_taken}</span>
                  ) : "—"}
                </td>
                <td>
                  <span className={`status-pill ${r.request_status === "blocked" ? "critical" : r.request_status === "completed" ? "success" : "monitor"}`}>
                    {r.request_status}
                  </span>
                </td>
                <td style={{ fontSize: 11, color: "var(--gray-500)", whiteSpace: "nowrap" }}>
                  {r.received_at ? new Date(r.received_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {recent.length === 0 && !loading && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--gray-500)", padding: "24px 0" }}>
                  No PII detected in the last 30 days.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Project × Model Usage ────────────────────────────────────────────────────
const DAYS_OPTIONS = [7, 30, 90];

function fmt(n) {
  if (n === null || n === undefined) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function fmtCost(v) {
  if (!v) return "$0.000000";
  return "$" + Number(v).toFixed(6);
}

const MODEL_COLORS = {
  "gpt-4o-mini":           "#6366f1",
  "gpt-5-nano":            "#8b5cf6",
  "text-embedding-3-small":"#3b82f6",
  "gpt-4o":                "#f59e0b",
  "gpt-5":                 "#ec4899",
};
function modelColor(name) {
  if (!name) return "#6b7280";
  for (const [k, c] of Object.entries(MODEL_COLORS)) {
    if (name.includes(k)) return c;
  }
  return "#6b7280";
}

function ProjectModelUsageSection({ orgId }) {
  const [rows, setRows]     = useState([]);
  const [days, setDays]     = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  const load = useCallback(() => {
    if (!orgId) return;
    setLoading(true);
    setError("");
    getProxyByProjectModel(orgId, days)
      .then((r) => setRows(r.data || []))
      .catch(() => setError("Could not load usage data."))
      .finally(() => setLoading(false));
  }, [orgId, days]);

  useEffect(() => { load(); }, [load]);

  // Group rows by project for summary cards
  const byProject = rows.reduce((acc, r) => {
    const key = r.project_id || "unassigned";
    if (!acc[key]) acc[key] = { project_name: r.project_name, models: [] };
    acc[key].models.push(r);
    return acc;
  }, {});

  const totalRequests = rows.reduce((s, r) => s + (r.total_requests || 0), 0);
  const totalTokens   = rows.reduce((s, r) => s + (r.total_tokens || 0), 0);
  const totalCost     = rows.reduce((s, r) => s + (r.total_cost || 0), 0);
  const uniqueModels  = [...new Set(rows.map((r) => r.model_name).filter(Boolean))];

  return (
    <section className="panel">
      <div className="section-head" style={{ marginBottom: 16 }}>
        <div>
          <h3>Usage by Project &amp; Model</h3>
          <p className="panel-muted">
            Input tokens, output tokens, total tokens and cost tracked per project for every model.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              className={`btn ${days === d ? "btn-primary" : "btn-ghost"}`}
              style={{ padding: "5px 12px", fontSize: 12 }}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
          <button className="btn btn-ghost" onClick={load} disabled={loading} style={{ fontSize: 12 }}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}

      {/* Summary stat chips */}
      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          {[
            { label: "Total Requests",   value: fmt(totalRequests), color: "#6366f1" },
            { label: "Total Tokens",     value: fmt(totalTokens),   color: "#8b5cf6" },
            { label: "Total Cost",       value: fmtCost(totalCost), color: "#f59e0b" },
            { label: "Models Tracked",   value: uniqueModels.length, color: "#3b82f6" },
          ].map((c) => (
            <div key={c.label} style={{
              background: "var(--surface-1,#fff)",
              border: `1px solid ${c.color}30`,
              borderLeft: `4px solid ${c.color}`,
              borderRadius: 10, padding: "10px 16px", minWidth: 150,
            }}>
              <div style={{ fontSize: 11, color: "var(--gray-500)", marginBottom: 4,
                textTransform: "uppercase", letterSpacing: "0.1em" }}>{c.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Model legend */}
      {uniqueModels.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {uniqueModels.map((m) => (
            <span key={m} style={{
              fontSize: 12, padding: "3px 12px", borderRadius: 20,
              background: `${modelColor(m)}15`,
              border: `1px solid ${modelColor(m)}40`,
              color: modelColor(m), fontWeight: 600, fontFamily: "monospace",
            }}>{m}</span>
          ))}
        </div>
      )}

      {/* Per-project groups */}
      {Object.entries(byProject).map(([pid, pdata]) => {
        const projTotal = pdata.models.reduce((s, r) => s + (r.total_cost || 0), 0);
        const projTokens = pdata.models.reduce((s, r) => s + (r.total_tokens || 0), 0);
        return (
          <div key={pid} style={{
            border: "1px solid var(--border)", borderRadius: 10,
            marginBottom: 16, overflow: "hidden",
          }}>
            <div style={{
              padding: "10px 16px",
              background: "var(--gray-50,#f9fafb)",
              borderBottom: "1px solid var(--border)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "var(--gray-700)" }}>
                {pdata.project_name || pid}
              </span>
              <span style={{ fontSize: 12, color: "var(--gray-500)" }}>
                {fmt(projTokens)} tokens &nbsp;·&nbsp; {fmtCost(projTotal)}
              </span>
            </div>
            <div className="table-wrap" style={{ margin: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th style={{ textAlign: "right" }}>Requests</th>
                    <th style={{ textAlign: "right" }}>Input Tokens</th>
                    <th style={{ textAlign: "right" }}>Output Tokens</th>
                    <th style={{ textAlign: "right" }}>Total Tokens</th>
                    <th style={{ textAlign: "right" }}>Input Cost</th>
                    <th style={{ textAlign: "right" }}>Output Cost</th>
                    <th style={{ textAlign: "right" }}>Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {pdata.models.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <span style={{
                          fontSize: 12, padding: "2px 10px", borderRadius: 20,
                          background: `${modelColor(r.model_name)}15`,
                          border: `1px solid ${modelColor(r.model_name)}40`,
                          color: modelColor(r.model_name),
                          fontWeight: 600, fontFamily: "monospace",
                        }}>{r.model_name}</span>
                      </td>
                      <td style={{ textAlign: "right" }}>{r.total_requests}</td>
                      <td style={{ textAlign: "right" }}>{fmt(r.input_tokens)}</td>
                      <td style={{ textAlign: "right" }}>{fmt(r.output_tokens)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(r.total_tokens)}</td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12 }}>
                        {fmtCost(r.input_cost)}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12 }}>
                        {fmtCost(r.output_cost)}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12,
                        fontWeight: 700, color: "#f59e0b" }}>
                        {fmtCost(r.total_cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {rows.length === 0 && !loading && (
        <p style={{ textAlign: "center", color: "var(--gray-500)", padding: "32px 0" }}>
          No proxy requests recorded in the last {days} days.
          Point your SDK at the proxy with an <code>X-Governance-Key</code> header to start tracking.
        </p>
      )}
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProxySetup() {
  const [orgs, setOrgs]                   = useState([]);
  const [selectedOrg, setSelectedOrg]     = useState("");
  const [projects, setProjects]           = useState([]);
  const [selectedProject, setSelectedProject] = useState("");

  useEffect(() => {
    getOrganizations().then((r) => {
      const list = r.data?.organizations || r.data || [];
      setOrgs(list);
      if (list.length > 0) setSelectedOrg(list[0].id);
    }).catch(() => {});
  }, []);

  // Reset project selection when org changes
  useEffect(() => {
    setProjects([]);
    setSelectedProject("");
  }, [selectedOrg]);

  return (
    <div className="page-shell">
      <OrgStep
        orgs={orgs}
        setOrgs={setOrgs}
        selectedOrg={selectedOrg}
        setSelectedOrg={setSelectedOrg}
      />

      {selectedOrg && (
        <ProjectStep
          orgId={selectedOrg}
          projects={projects}
          setProjects={setProjects}
          selectedProject={selectedProject}
          setSelectedProject={setSelectedProject}
        />
      )}

      {selectedOrg && selectedProject && (
        <>
          <KeyStep orgId={selectedOrg} projectId={selectedProject} />
          <PiiActivity orgId={selectedOrg} />
        </>
      )}

      {selectedOrg && (
        <ProjectModelUsageSection orgId={selectedOrg} />
      )}
    </div>
  );
}
