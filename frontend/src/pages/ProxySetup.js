import React, { useCallback, useEffect, useState } from "react";
import {
  getOrganizations,
  createOrganization,
  getProjects,
  createProject,
  createGovernanceKey,
  listGovernanceKeys,
  revokeGovernanceKey,
  rotateGovernanceKey,
  getRules,
  getRateLimits,
  createRateLimit,
  deleteRateLimit,
} from "../api";
import { displayName } from "../utils/displayName";

const INPUT_STYLE = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

const PROXY_BASE = import.meta.env.REACT_APP_API_URL;
// ─── Organization ────────────────────────────────────────────────────────────
function OrgStep({ orgs, setOrgs, selectedOrg, setSelectedOrg }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Sync input text when selectedOrg changes from parent (e.g. auto-select on load)
  useEffect(() => {
    if (selectedOrg && orgs.length > 0) {
      const found = orgs.find((o) => o.id === selectedOrg);
      if (found) setName(displayName(found.org_name) || displayName(found.id));
    }
  }, [selectedOrg, orgs]);

  const filtered = orgs.filter((o) =>
    (displayName(o.org_name) || displayName(o.id))
      .toLowerCase()
      .includes(name.toLowerCase()),
  );

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setMsg("");
    const orgName = name.trim();
    const orgId =
      orgName
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "") +
      "_" +
      Date.now();
    try {
      const r = await createOrganization({ id: orgId, org_name: orgName });
      const newOrg = r.data;
      // Extract created ID — backend may return id, org_id, or use our provided orgId
      const createdId = newOrg?.id || newOrg?.org_id || orgId;
      const refreshed = await getOrganizations();
      const list = refreshed.data?.organizations || refreshed.data || [];
      setOrgs(list);
      // Find the org in refreshed list; fall back to whatever the backend returned
      const found =
        list.find((o) => o.id === createdId) ||
        list.find((o) => o.org_name === orgName);
      setSelectedOrg(found?.id || createdId);
      setName(orgName);
      setMsg(`Organization "${orgName}" created.`);
    } catch (e) {
      const detail = e.response?.data?.detail;
      const errMsg = Array.isArray(detail)
        ? detail.map((d) => d.msg || JSON.stringify(d)).join("; ")
        : detail || e.message;
      setMsg("Error: " + errMsg);
    }
    setSaving(false);
    setShowSuggestions(false);
  };

  const handleSelect = (o) => {
    setSelectedOrg(o.id);
    setName(displayName(o.org_name) || displayName(o.id));
    setShowSuggestions(false);
  };

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Organization</h3>
          <p className="panel-muted">
            Type a new organization name or select an existing one.
          </p>
        </div>
        {selectedOrg && (
          <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>
            ✓ Selected:{" "}
            {displayName(orgs.find((o) => o.id === selectedOrg)?.org_name) ||
              displayName(selectedOrg)}
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 10,
          position: "relative",
        }}
      >
        <div style={{ flex: 1, position: "relative" }}>
          <input
            style={{ ...INPUT_STYLE }}
            placeholder="Organization name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          {showSuggestions && filtered.length > 0 && (
            <ul
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                zIndex: 100,
                background: "var(--white, #fff)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                margin: "2px 0 0",
                padding: 0,
                listStyle: "none",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                maxHeight: 180,
                overflowY: "auto",
              }}
            >
              {filtered.map((o) => (
                <li
                  key={o.id}
                  onMouseDown={() => handleSelect(o)}
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background:
                      selectedOrg === o.id
                        ? "rgba(34,197,94,0.06)"
                        : "transparent",
                  }}
                >
                  <span>{displayName(o.org_name) || displayName(o.id)}</span>
                  {selectedOrg === o.id && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#22c55e",
                        fontWeight: 600,
                      }}
                    >
                      selected
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={saving || !name.trim()}
          style={{ whiteSpace: "nowrap" }}
        >
          {saving ? "Creating…" : "Create Org"}
        </button>
      </div>

      {msg && (
        <p
          style={{
            fontSize: 13,
            color: msg.startsWith("Error") ? "#ef4444" : "#22c55e",
            marginBottom: 10,
          }}
        >
          {msg}
        </p>
      )}
    </section>
  );
}

// ─── Project ─────────────────────────────────────────────────────────────────
function ProjectStep({
  orgId,
  projects,
  setProjects,
  selectedProject,
  setSelectedProject,
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const load = useCallback(() => {
    if (!orgId) return;
    getProjects(orgId)
      .then((r) => {
        const list = r.data?.projects || r.data || [];
        setProjects(list);
      })
      .catch(() => {});
  }, [orgId, setProjects]);

  // Sync input text when selectedProject changes from parent
  useEffect(() => {
    if (selectedProject && projects.length > 0) {
      const found = projects.find((p) => p.id === selectedProject);
      if (found)
        setName(displayName(found.project_name) || displayName(found.id));
    }
    if (!selectedProject) setName("");
  }, [selectedProject, projects]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = projects.filter((p) =>
    (displayName(p.project_name) || displayName(p.id))
      .toLowerCase()
      .includes(name.toLowerCase()),
  );

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setMsg("");
    const projName = name.trim();
    const projId =
      projName
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "") +
      "_" +
      Date.now();
    try {
      const r = await createProject({
        id: projId,
        org_id: orgId,
        project_name: projName,
      });
      const newProj = r.data;
      // Extract created ID — backend may return id, project_id, or use our provided projId
      const createdId = newProj?.id || newProj?.project_id || projId;
      const refreshed = await getProjects(orgId);
      const list = refreshed.data?.projects || refreshed.data || [];
      setProjects(list);
      const found =
        list.find((p) => p.id === createdId) ||
        list.find((p) => p.project_name === projName);
      setSelectedProject(found?.id || createdId);
      setName(projName);
      setMsg(`Project "${projName}" created.`);
    } catch (e) {
      const detail = e.response?.data?.detail;
      const errMsg = Array.isArray(detail)
        ? detail.map((d) => d.msg || JSON.stringify(d)).join("; ")
        : detail || e.message;
      setMsg("Error: " + errMsg);
    }
    setSaving(false);
    setShowSuggestions(false);
  };

  const handleSelect = (p) => {
    setSelectedProject(p.id);
    setName(displayName(p.project_name) || displayName(p.id));
    setShowSuggestions(false);
  };

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Project</h3>
          <p className="panel-muted">
            Type a new project name or select an existing one.
          </p>
        </div>
        {selectedProject && (
          <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>
            ✓ Selected:{" "}
            {displayName(
              projects.find((p) => p.id === selectedProject)?.project_name,
            ) || displayName(selectedProject)}
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 10,
          position: "relative",
        }}
      >
        <div style={{ flex: 1, position: "relative" }}>
          <input
            style={{ ...INPUT_STYLE }}
            placeholder="Project name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          {showSuggestions && filtered.length > 0 && (
            <ul
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                zIndex: 100,
                background: "var(--white, #fff)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                margin: "2px 0 0",
                padding: 0,
                listStyle: "none",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                maxHeight: 180,
                overflowY: "auto",
              }}
            >
              {filtered.map((p) => (
                <li
                  key={p.id}
                  onMouseDown={() => handleSelect(p)}
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background:
                      selectedProject === p.id
                        ? "rgba(34,197,94,0.06)"
                        : "transparent",
                  }}
                >
                  <span>
                    {displayName(p.project_name) || displayName(p.id)}
                  </span>
                  {selectedProject === p.id && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#22c55e",
                        fontWeight: 600,
                      }}
                    >
                      selected
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={saving || !name.trim()}
          style={{ whiteSpace: "nowrap" }}
        >
          {saving ? "Creating…" : "Create Project"}
        </button>
      </div>

      {msg && (
        <p
          style={{
            fontSize: 13,
            color: msg.startsWith("Error") ? "#ef4444" : "#22c55e",
            marginBottom: 10,
          }}
        >
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
    padding: "6px 14px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
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
      <div
        style={{
          background: "var(--gray-50)",
          borderRadius: 12,
          border: "1px solid rgba(124,112,174,0.16)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: "10px 10px 0",
            borderBottom: "1px solid var(--border)",
            background: "var(--gray-100,#f3f4f6)",
          }}
        >
          {Object.entries(snippets).map(([key, s]) => (
            <button
              key={key}
              style={TAB_STYLE(tab === key)}
              onClick={() => setTab(key)}
            >
              {s.label}
            </button>
          ))}
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "#22c55e",
              fontWeight: 600,
              alignSelf: "center",
              paddingRight: 8,
            }}
          >
            ✓ {current.note}
          </span>
        </div>
        <pre
          style={{
            color: "var(--brand-primary)",
            fontSize: 12,
            margin: 0,
            padding: "16px",
            overflowX: "auto",
            lineHeight: 1.6,
          }}
        >
          {current.code}
        </pre>
      </div>
    </div>
  );
}

// ─── Secret Key ──────────────────────────────────────────────────────────────
function KeyStep({ orgId, projectId }) {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [rotateConfirm, setRotateConfirm] = useState(null); // key object pending rotation
  const [rotatedKey, setRotatedKey] = useState(null); // raw key from rotation reveal
  const [rotating, setRotating] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (text) => {
    setToast(text);
    setTimeout(() => setToast(""), 4000);
  };

  const load = useCallback(() => {
    if (!orgId) return;
    listGovernanceKeys(orgId)
      .then((r) => setKeys(r.data || []))
      .catch(() => {});
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!name.trim() || !orgId) return;
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
        : detail || e.message;
      setMsg("Error: " + errMsg);
    }
    setSaving(false);
  };

  const handleRevoke = async (keyId) => {
    try {
      await revokeGovernanceKey(keyId);
      load();
    } catch (e) {
      const detail = e.response?.data?.detail;
      const errMsg = Array.isArray(detail)
        ? detail.map((d) => d.msg || JSON.stringify(d)).join("; ")
        : detail || e.message;
      setMsg("Error revoking key: " + errMsg);
    }
  };

  const confirmRotate = async () => {
    if (!rotateConfirm) return;
    setRotating(true);
    try {
      const r = await rotateGovernanceKey(rotateConfirm.key_id);
      setRotateConfirm(null);
      setRotatedKey(r.data);
      load();
      showToast("Key rotated. Share the new key with your team.");
    } catch (e) {
      const detail = e.response?.data?.detail;
      const errMsg = Array.isArray(detail)
        ? detail.map((d) => d.msg || JSON.stringify(d)).join("; ")
        : detail || e.message;
      setMsg("Error rotating key: " + errMsg);
      setRotateConfirm(null);
    }
    setRotating(false);
  };

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Secret Key (share with external team)</h3>
          <p className="panel-muted">
            Create a governance key and hand it to the external team. That's all
            they need.
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
        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={saving || !name.trim() || !orgId}
          style={{ whiteSpace: "nowrap" }}
        >
          {saving ? "Creating…" : "Create Key"}
        </button>
      </div>

      {msg && (
        <p
          style={{
            fontSize: 13,
            color: msg.startsWith("Error") ? "#ef4444" : "#22c55e",
            marginBottom: 10,
          }}
        >
          {msg}
        </p>
      )}

      {/* New key reveal (creation) */}
      {newKey && (
        <KeyRevealBanner
          title="Key created — copy it now, it won't be shown again"
          rawKey={newKey.raw_key}
          onDismiss={() => setNewKey(null)}
        />
      )}

      {/* Existing keys table */}
      {keys.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: 20 }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Key hint</th>
                <th>Project</th>
                <th>Last used</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.key_id}>
                  <td>
                    <strong>{k.key_name}</strong>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {k.raw_key_hint}
                  </td>
                  <td>
                    {k.project_id || (
                      <span style={{ color: "var(--gray-400)" }}>—</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--gray-500)" }}>
                    {k.last_used_at
                      ? new Date(k.last_used_at).toLocaleString()
                      : "Never"}
                  </td>
                  <td>
                    <span
                      className={`status-pill ${k.is_active ? "low" : "medium"}`}
                    >
                      {k.is_active ? "active" : "revoked"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {k.is_active && (
                        <button
                          className="btn btn-ghost"
                          style={{
                            padding: "4px 10px",
                            fontSize: 12,
                            color: "#7C70AE",
                            border: "1px solid #7C70AE60",
                          }}
                          onClick={() => setRotateConfirm(k)}
                        >
                          Rotate Key
                        </button>
                      )}
                      {k.is_active && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => handleRevoke(k.key_id)}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Integration guide */}
      <IntegrationGuide proxyBase={PROXY_BASE} />

      {/* ── Rotate confirmation modal ── */}
      {rotateConfirm && (
        <div className="modal-backdrop" onClick={() => setRotateConfirm(null)}>
          <div
            className="modal-dialog"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Rotate Key?</h3>
              <button
                className="btn-close"
                onClick={() => setRotateConfirm(null)}
              >
                ×
              </button>
            </div>
            <div style={{ padding: "4px 0 20px" }}>
              <p style={{ fontSize: 14, margin: "0 0 8px" }}>
                You are about to rotate{" "}
                <strong>{rotateConfirm.key_name}</strong>.
              </p>
              <div
                style={{
                  background: "rgba(239,68,68,0.06)",
                  border: "1px solid #fca5a5",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "#b91c1c",
                  marginBottom: 16,
                }}
              >
                The old key stops working <strong>immediately</strong>. Any
                integration currently using it will break until updated.
              </div>
              <div
                style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
              >
                <button
                  className="btn btn-ghost"
                  onClick={() => setRotateConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  style={{ background: "#7C70AE", borderColor: "#7C70AE" }}
                  disabled={rotating}
                  onClick={confirmRotate}
                >
                  {rotating ? "Rotating…" : "Yes, Rotate Key"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Rotated key reveal modal ── */}
      {rotatedKey && (
        <div className="modal-backdrop" onClick={() => setRotatedKey(null)}>
          <div
            className="modal-dialog"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>New Key — Copy Now</h3>
              <button className="btn-close" onClick={() => setRotatedKey(null)}>
                ×
              </button>
            </div>
            <KeyRevealBanner
              title="Store this now — it won't be shown again"
              rawKey={rotatedKey.raw_key}
              onDismiss={() => setRotatedKey(null)}
              inline
            />
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 28,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#166534",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 15 }}>✓</span> {toast}
        </div>
      )}
    </section>
  );
}

// ─── Key reveal banner (shared by creation + rotation) ───────────────────────
function KeyRevealBanner({ title, rawKey, onDismiss, inline = false }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(rawKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const inner = (
    <div
      style={{
        background: inline ? "transparent" : "rgba(34,197,94,0.07)",
        border: inline ? "none" : "1px solid #22c55e",
        borderRadius: inline ? 0 : 10,
        padding: inline ? "4px 0 0" : 16,
        marginBottom: inline ? 0 : 16,
      }}
    >
      <p
        style={{
          fontWeight: 600,
          margin: "0 0 8px",
          color: "#166534",
          fontSize: 13,
        }}
      >
        {title}
      </p>
      <code
        style={{
          display: "block",
          fontFamily: "monospace",
          fontSize: 13,
          wordBreak: "break-all",
          background: "#f0fdf4",
          padding: "8px 12px",
          borderRadius: 6,
          color: "#166534",
          marginBottom: 10,
        }}
      >
        {rawKey}
      </code>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary"
          style={{
            fontSize: 12,
            background: "#166534",
            borderColor: "#166534",
          }}
          onClick={handleCopy}
        >
          {copied ? "Copied!" : "Copy Key"}
        </button>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 12 }}
          onClick={onDismiss}
        >
          {inline ? "Done" : "Dismiss"}
        </button>
      </div>
    </div>
  );

  return inner;
}

// ─── Policy Enforcement ───────────────────────────────────────────────────────
function PolicyEnforcementSection({ orgId }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    getRules(orgId)
      .then((r) => setRules(r.data || []))
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }, [orgId]);

  const active = rules.filter((r) => r.is_active !== false);

  const parseModels = (rule) => {
    const t = rule.threshold;
    if (Array.isArray(t)) return t;
    if (typeof t === "string")
      return t
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return t != null ? [String(t)] : [];
  };

  const allowedNames = active
    .filter((r) => /allowed.model/i.test(r.metric))
    .flatMap(parseModels);
  const blockedNames = active
    .filter((r) => /blocked.model/i.test(r.metric))
    .flatMap(parseModels);
  const maxInput = active.find((r) => /max.input.token/i.test(r.metric));
  const maxOutput = active.find((r) => /max.output.token/i.test(r.metric));

  const BadgeList = ({ values, color = "#7C70AE" }) =>
    values.length > 0 ? (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {values.map((v, i) => (
          <span
            key={i}
            style={{
              fontSize: 11,
              padding: "2px 10px",
              borderRadius: 20,
              background: `${color}15`,
              color,
              fontWeight: 600,
              fontFamily: "monospace",
            }}
          >
            {v}
          </span>
        ))}
      </div>
    ) : (
      <span style={{ color: "var(--gray-400)" }}>—</span>
    );

  const SubBox = ({ title, color, children }) => (
    <div
      style={{
        border: `1px solid ${color}30`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Policy Enforcement</h3>
          <p className="panel-muted">
            Active governance rules for this organization.
          </p>
        </div>
        {!loading && active.length > 0 && (
          <span style={{ fontSize: 12, color: "#7C70AE", fontWeight: 600 }}>
            {active.length} active rule{active.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--gray-400)" }}>Loading…</p>
      ) : active.length === 0 ? (
        <p
          style={{ fontSize: 13, color: "var(--gray-500)", padding: "12px 0" }}
        >
          No active governance rules.
        </p>
      ) : (
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <SubBox title="Allowed Models" color="#22c55e">
            <BadgeList values={allowedNames} color="#22c55e" />
          </SubBox>
          <SubBox title="Blocked Models" color="#ef4444">
            <BadgeList values={blockedNames} color="#ef4444" />
          </SubBox>
          <SubBox title="Max Input Tokens" color="#7C70AE">
            {maxInput ? (
              <span
                style={{
                  fontFamily: "monospace",
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                {Number(maxInput.threshold).toLocaleString()}
              </span>
            ) : (
              <span style={{ color: "var(--gray-400)" }}>—</span>
            )}
          </SubBox>
          <SubBox title="Max Output Tokens" color="#9E2A97">
            {maxOutput ? (
              <span
                style={{
                  fontFamily: "monospace",
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                {Number(maxOutput.threshold).toLocaleString()}
              </span>
            ) : (
              <span style={{ color: "var(--gray-400)" }}>—</span>
            )}
          </SubBox>
        </div>
      )}
    </section>
  );
}

// ─── Rate Limits ──────────────────────────────────────────────────────────────
const EMPTY_RL_FORM = {
  project_id: "",
  max_requests_per_min: "",
  max_tokens_per_day: "",
};

function RateLimitsSection({ orgId, projects }) {
  const [limits, setLimits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_RL_FORM);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = () => {
    if (!orgId) return;
    getRateLimits(orgId)
      .then((r) => setLimits(r.data || []))
      .catch(() => setLimits([]));
  };

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    getRateLimits(orgId)
      .then((r) => setLimits(r.data || []))
      .catch(() => setLimits([]))
      .finally(() => setLoading(false));
  }, [orgId]);

  const handleSave = async () => {
    if (!form.max_requests_per_min && !form.max_tokens_per_day) {
      setMsg("Enter at least one limit value.");
      return;
    }
    setSaving(true);
    setMsg("");
    const payload = {
      org_id: orgId,
      project_id: form.project_id || null,
      max_requests_per_min: form.max_requests_per_min
        ? Number(form.max_requests_per_min)
        : null,
      max_tokens_per_day: form.max_tokens_per_day
        ? Number(form.max_tokens_per_day)
        : null,
    };
    try {
      await createRateLimit(payload);
      setShowForm(false);
      setForm(EMPTY_RL_FORM);
      setMsg("");
      refresh();
    } catch (e) {
      setMsg(e.response?.data?.detail || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this rate limit?")) return;
    try {
      await deleteRateLimit(id);
      refresh();
    } catch (e) {
      alert(e.response?.data?.detail || "Delete failed.");
    }
  };

  const SEL = {
    padding: "7px 10px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    fontSize: 13,
    width: "100%",
  };
  const INP = { ...SEL };

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Rate Limits</h3>
          <p className="panel-muted">
            Request and token rate limits for this organization.
          </p>
        </div>
        {orgId && (
          <button
            onClick={() => {
              setShowForm((v) => !v);
              setMsg("");
            }}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              background: "#9E2A97",
              color: "#fff",
              border: "none",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            + Add Limit
          </button>
        )}
      </div>

      {showForm && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 18,
            marginBottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13 }}>New Rate Limit</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 10,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--gray-500)",
                  marginBottom: 4,
                }}
              >
                Project (optional)
              </div>
              <select
                value={form.project_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, project_id: e.target.value }))
                }
                style={SEL}
              >
                <option value="">— Org-level —</option>
                {(projects || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayName(p.project_name) || displayName(p.id)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--gray-500)",
                  marginBottom: 4,
                }}
              >
                Max Requests / min
              </div>
              <input
                type="number"
                min="0"
                value={form.max_requests_per_min}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    max_requests_per_min: e.target.value,
                  }))
                }
                style={INP}
                placeholder="e.g. 60"
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--gray-500)",
                  marginBottom: 4,
                }}
              >
                Max Tokens / day
              </div>
              <input
                type="number"
                min="0"
                value={form.max_tokens_per_day}
                onChange={(e) =>
                  setForm((f) => ({ ...f, max_tokens_per_day: e.target.value }))
                }
                style={INP}
                placeholder="e.g. 1000000"
              />
            </div>
          </div>
          {msg && <div style={{ fontSize: 12, color: "#ef4444" }}>{msg}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "7px 18px",
                borderRadius: 6,
                background: "#9E2A97",
                color: "#fff",
                border: "none",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setMsg("");
              }}
              style={{
                padding: "7px 14px",
                borderRadius: 6,
                background: "transparent",
                border: "1px solid var(--border)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--gray-400)" }}>Loading…</p>
      ) : limits.length === 0 ? (
        <p
          style={{ fontSize: 13, color: "var(--gray-500)", padding: "12px 0" }}
        >
          No rate limits configured.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Scope</th>
                <th>Max Requests/min</th>
                <th>Max Tokens/day</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {limits.map((l, i) => (
                <tr key={i}>
                  <td>
                    <span className="status-pill low">
                      {l.project_id ? "project" : "org"}
                    </span>
                  </td>
                  <td>
                    {l.max_requests_per_min != null ? (
                      Number(l.max_requests_per_min).toLocaleString()
                    ) : (
                      <span style={{ color: "var(--gray-400)" }}>—</span>
                    )}
                  </td>
                  <td>
                    {l.max_tokens_per_day != null ? (
                      Number(l.max_tokens_per_day).toLocaleString()
                    ) : (
                      <span style={{ color: "var(--gray-400)" }}>—</span>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => handleDelete(l.id)}
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 5,
                        border: "1px solid #fca5a5",
                        background: "transparent",
                        cursor: "pointer",
                        color: "#ef4444",
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProxySetup() {
  const [orgs, setOrgs] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgsError, setOrgsError] = useState("");

  useEffect(() => {
    setOrgsLoading(true);
    setOrgsError("");
    getOrganizations()
      .then((r) => {
        const list = r.data?.organizations || r.data || [];
        setOrgs(list);
        if (list.length > 0) setSelectedOrg(list[0].id);
      })
      .catch((e) => {
        const detail = e.response?.data?.detail || e.message;
        setOrgsError("Could not load organizations: " + detail);
      })
      .finally(() => setOrgsLoading(false));
  }, []);

  // Reset project selection when org changes
  useEffect(() => {
    setProjects([]);
    setSelectedProject("");
  }, [selectedOrg]);

  return (
    <div className="page-body">
      <div className="page-shell">
        {orgsLoading && (
          <p
            style={{ color: "var(--gray-500)", fontSize: 13, marginBottom: 12 }}
          >
            Connecting to backend… (first load may take up to 30 s)
          </p>
        )}
        {orgsError && (
          <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>
            {orgsError}
          </p>
        )}
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
          <KeyStep orgId={selectedOrg} projectId={selectedProject} />
        )}

        {selectedOrg && (
          <>
            <PolicyEnforcementSection orgId={selectedOrg} />
            <RateLimitsSection orgId={selectedOrg} projects={projects} />
          </>
        )}
      </div>
    </div>
  );
}
