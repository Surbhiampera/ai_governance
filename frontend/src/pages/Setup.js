import React, { useCallback, useEffect, useState } from "react";
import {
  createApiKey,
  createOrganization,
  createProject,
  deleteApiKey,
  deleteOrganization,
  deleteProject,
  getApiKeys,
  getOrganizations,
  getProjects,
} from "../api";

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ["Organization", "Project", "API Key", "Done"];

function StepBar({ current }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 32 }}>
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={label}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 14,
                  background: done
                    ? "linear-gradient(135deg,#9e2a97,#7c70ae)"
                    : active
                    ? "linear-gradient(135deg,#9e2a97,#7c70ae)"
                    : "rgba(124,112,174,0.12)",
                  color: done || active ? "#fff" : "#6d6782",
                  border: active ? "2px solid #9e2a97" : "2px solid transparent",
                  transition: "all 0.22s ease",
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: active ? "#9e2a97" : done ? "#7c70ae" : "#6d6782",
                  fontWeight: active ? 700 : 400,
                }}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  margin: "0 8px",
                  marginBottom: 22,
                  background: i < current
                    ? "linear-gradient(90deg,#9e2a97,#7c70ae)"
                    : "rgba(124,112,174,0.18)",
                  transition: "background 0.3s ease",
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Inline alert ─────────────────────────────────────────────────────────────

function InlineError({ msg }) {
  if (!msg) return null;
  return (
    <div className="error-message" style={{ marginTop: 12, fontSize: 14 }}>
      {msg}
    </div>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyBtn({ value }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={copy}
      style={{ padding: "6px 12px", fontSize: 12, borderRadius: 10 }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ─── Step 1: Organization ─────────────────────────────────────────────────────

function OrgStep({ onNext }) {
  const [form, setForm] = useState({ id: "", org_name: "", plan_type: "", budget_limit: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.id.trim()) { setError("Organization ID is required."); return; }
    if (!form.org_name.trim()) { setError("Organization name is required."); return; }
    setSaving(true);
    setError("");
    try {
      const payload = { id: form.id.trim(), org_name: form.org_name.trim() };
      if (form.plan_type.trim()) payload.plan_type = form.plan_type.trim();
      if (form.budget_limit.trim()) payload.budget_limit = parseFloat(form.budget_limit);
      const res = await createOrganization(payload);
      onNext(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to create organization.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="panel-muted" style={{ marginBottom: 24, marginTop: 0 }}>
        Register the external team's organization on your governance server.
      </p>
      <div className="stack">
        <div className="form-grid">
          <div className="field">
            <label>Organization ID</label>
            <input
              value={form.id}
              onChange={(e) => set("id", e.target.value)}
              placeholder="acme-corp"
              required
            />
          </div>
          <div className="field">
            <label>Organization Name</label>
            <input
              value={form.org_name}
              onChange={(e) => set("org_name", e.target.value)}
              placeholder="Acme Corp"
              required
            />
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Plan Type <span style={{ opacity: 0.6 }}>(optional)</span></label>
            <input
              value={form.plan_type}
              onChange={(e) => set("plan_type", e.target.value)}
              placeholder="enterprise"
            />
          </div>
          <div className="field">
            <label>Budget Limit <span style={{ opacity: 0.6 }}>(USD, optional)</span></label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.budget_limit}
              onChange={(e) => set("budget_limit", e.target.value)}
              placeholder="5000.00"
            />
          </div>
        </div>
      </div>
      <InlineError msg={error} />
      <div className="action-row" style={{ marginTop: 24, justifyContent: "flex-end" }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Creating…" : "Create Organization & Continue"}
        </button>
      </div>
    </form>
  );
}

// ─── Step 2: Project ──────────────────────────────────────────────────────────

function ProjectStep({ org, onNext, onBack }) {
  const [form, setForm] = useState({ id: "", project_name: "", environment: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.id.trim()) { setError("Project ID is required."); return; }
    setSaving(true);
    setError("");
    try {
      const payload = { id: form.id.trim(), org_id: org.id };
      if (form.project_name.trim()) payload.project_name = form.project_name.trim();
      if (form.environment.trim()) payload.environment = form.environment.trim();
      const res = await createProject(payload);
      onNext(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to create project.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="panel-muted" style={{ marginBottom: 24, marginTop: 0 }}>
        Register a project under <strong>{org.org_name}</strong> ({org.id}).
      </p>
      <div className="stack">
        <div className="form-grid">
          <div className="field">
            <label>Project ID</label>
            <input
              value={form.id}
              onChange={(e) => set("id", e.target.value)}
              placeholder="acme-chatbot"
              required
            />
          </div>
          <div className="field">
            <label>Org ID <span style={{ opacity: 0.6 }}>(auto-filled)</span></label>
            <input value={org.id} disabled style={{ background: "var(--gray-100)" }} />
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Project Name <span style={{ opacity: 0.6 }}>(optional)</span></label>
            <input
              value={form.project_name}
              onChange={(e) => set("project_name", e.target.value)}
              placeholder="Support Chatbot"
            />
          </div>
          <div className="field">
            <label>Environment <span style={{ opacity: 0.6 }}>(optional)</span></label>
            <input
              value={form.environment}
              onChange={(e) => set("environment", e.target.value)}
              placeholder="production"
            />
          </div>
        </div>
      </div>
      <InlineError msg={error} />
      <div className="action-row" style={{ marginTop: 24, justifyContent: "space-between" }}>
        <button type="button" className="btn btn-ghost" onClick={onBack}>Back</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Creating…" : "Create Project & Continue"}
        </button>
      </div>
    </form>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function generateKeyId(orgId) {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const slug = (orgId || "org").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return `gvk-${slug}-${rand}`;
}

// ─── Step 3: API Key ──────────────────────────────────────────────────────────

function ApiKeyStep({ org, project, onNext, onBack }) {
  const [generatedId, setGeneratedId] = useState(() => generateKeyId(org.id));
  const [keyName, setKeyName] = useState(`${org.id}-prod`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const regenerate = () => setGeneratedId(generateKeyId(org.id));

  const submit = async (e) => {
    e.preventDefault();
    if (!keyName.trim()) { setError("Key name is required."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await createApiKey({
        id: generatedId,
        org_id: org.id,
        project_id: project.id,
        key_name: keyName.trim(),
      });
      onNext(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to create API key.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="panel-muted" style={{ marginBottom: 24, marginTop: 0 }}>
        Create an API key for <strong>{org.org_name}</strong> / <strong>{project.project_name || project.id}</strong>.
        The secret token is auto-generated — share it with the external team so their SDK can authenticate.
      </p>

      <div className="stack">

        {/* ── Secret token (generated, read-only) ── */}
        <div className="field">
          <label>
            Secret Token
            <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--gray-500)", textTransform: "none", letterSpacing: 0 }}>
              — this IS the key; the external team sends it as the{" "}
              <code style={{ padding: "1px 5px", background: "var(--gray-100)", borderRadius: 4, fontSize: 12 }}>
                X-API-Key
              </code>{" "}
              request header
            </span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={generatedId}
              readOnly
              style={{
                flex: 1,
                background: "var(--gray-100)",
                fontFamily: "monospace",
                fontSize: 13,
                color: "var(--brand-primary)",
                letterSpacing: "0.04em",
              }}
            />
            <CopyBtn value={generatedId} />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={regenerate}
              title="Generate a new secret"
              style={{ padding: "0 14px", borderRadius: 14, whiteSpace: "nowrap" }}
            >
              Regenerate
            </button>
          </div>
        </div>

        {/* ── Key name (human label) ── */}
        <div className="form-grid">
          <div className="field">
            <label>
              Key Name
              <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--gray-500)", textTransform: "none", letterSpacing: 0 }}>
                — a label so you can identify this key in the table
              </span>
            </label>
            <input
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="acme-prod"
              required
            />
          </div>
          <div className="field">
            <label>Scoped to</label>
            <input
              value={`${org.id} / ${project.id}`}
              disabled
              style={{ background: "var(--gray-100)" }}
            />
          </div>
        </div>

      </div>
      <InlineError msg={error} />
      <div className="action-row" style={{ marginTop: 24, justifyContent: "space-between" }}>
        <button type="button" className="btn btn-ghost" onClick={onBack}>Back</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Creating…" : "Create API Key & Finish"}
        </button>
      </div>
    </form>
  );
}

// ─── Step 4: Done ─────────────────────────────────────────────────────────────

function DoneStep({ org, project, apiKey, onReset }) {
  const summaryRows = [
    { label: "Organization ID", hint: "pass as org_id in every event body", value: org.id },
    { label: "Project ID",      hint: "pass as project_id in every event body", value: project.id },
    { label: "Key Name",        hint: "display label only — not used in requests", value: apiKey.key_name || "—" },
  ];

  const usageRows = [
    {
      where: "Telemetry events  (POST /telemetry/event)",
      field: "api_key_id",
      example: `{ "api_key_id": "${apiKey.id}", "org_id": "${org.id}", "project_id": "${project.id}", … }`,
    },
    {
      where: "Decorator / SDK endpoints  (POST /decorator/ingest)",
      field: "X-API-Key header",
      example: `X-API-Key: ${apiKey.id}`,
    },
  ];

  return (
    <div className="stack">
      <p className="panel-muted" style={{ marginTop: 0 }}>
        Setup complete. The secret token below is what the external team must use — copy it now,
        it cannot be retrieved again from this UI.
      </p>

      {/* ── Secret token — highlighted prominently ── */}
      <div
        style={{
          padding: "18px 20px",
          borderRadius: 14,
          background: "rgba(158,42,151,0.06)",
          border: "2px solid rgba(158,42,151,0.22)",
        }}
      >
        <span style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--gray-500)", marginBottom: 8 }}>
          Secret Token  (API Key ID)
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <code style={{ flex: 1, fontSize: 15, color: "var(--brand-primary)", fontWeight: 700, letterSpacing: "0.04em", wordBreak: "break-all" }}>
            {apiKey.id}
          </code>
          <CopyBtn value={apiKey.id} />
        </div>
      </div>

      {/* ── Other IDs ── */}
      {summaryRows.map(({ label, hint, value }) => (
        <div
          key={label}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderRadius: 14,
            background: "var(--gray-50)",
            border: "1px solid rgba(124,112,174,0.16)",
          }}
        >
          <div>
            <span style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--gray-500)", marginBottom: 3 }}>
              {label}
            </span>
            <code style={{ fontSize: 13, color: "var(--gray-700)", fontWeight: 600 }}>{value}</code>
            <span style={{ marginLeft: 10, fontSize: 11, color: "var(--gray-500)" }}>{hint}</span>
          </div>
          {value !== "—" && <CopyBtn value={value} />}
        </div>
      ))}

      {/* ── How to use ── */}
      <div style={{ marginTop: 8 }}>
        <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "var(--gray-700)" }}>
          How the external team uses the secret token:
        </p>
        <div className="stack">
          {usageRows.map(({ where, field, example }) => (
            <div
              key={where}
              style={{
                padding: "14px 16px",
                borderRadius: 14,
                background: "var(--gray-50)",
                border: "1px solid rgba(124,112,174,0.14)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--gray-700)", marginBottom: 2 }}>{where}</span>
                  <span style={{ fontSize: 11, color: "var(--gray-500)" }}>
                    Token goes in: <code style={{ padding: "1px 5px", background: "var(--gray-200)", borderRadius: 4 }}>{field}</code>
                  </span>
                </div>
                <CopyBtn value={example} />
              </div>
              <code style={{ display: "block", fontSize: 11, color: "var(--brand-secondary)", wordBreak: "break-all", lineHeight: 1.7 }}>
                {example}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: "14px 16px",
          borderRadius: 14,
          background: "rgba(34,139,98,0.07)",
          border: "1px solid rgba(34,139,98,0.18)",
          color: "#228b62",
          fontSize: 14,
        }}
      >
        All three resources are live. Share the secret token with the external team — they embed it in every request.
      </div>

      <div className="action-row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-secondary" onClick={onReset}>
          Set up another tenant
        </button>
      </div>
    </div>
  );
}

// ─── Existing resources table ─────────────────────────────────────────────────

function ResourceRow({ label, value, onDelete, deleting }) {
  return (
    <tr>
      <td>
        <code style={{ color: "var(--brand-primary)", fontSize: 13 }}>{value.id}</code>
      </td>
      <td>{label === "org" ? value.org_name : label === "project" ? (value.project_name || "—") : (value.key_name || "—")}</td>
      <td>
        {label === "project" ? <code style={{ fontSize: 12 }}>{value.org_id}</code> : null}
        {label === "key" ? <code style={{ fontSize: 12 }}>{value.org_id || "—"}</code> : null}
        {label === "org" ? (value.plan_type || "—") : null}
      </td>
      <td>
        <button
          className="btn btn-ghost"
          style={{ padding: "5px 12px", fontSize: 12, borderRadius: 10, color: "var(--brand-primary)" }}
          onClick={() => onDelete(value.id)}
          disabled={deleting}
        >
          {deleting ? "…" : "Delete"}
        </button>
      </td>
    </tr>
  );
}

function ExistingResources({ orgs, projects, apiKeys, onRefresh }) {
  const [deletingOrg, setDeletingOrg] = useState(null);
  const [deletingProject, setDeletingProject] = useState(null);
  const [deletingKey, setDeletingKey] = useState(null);

  const doDelete = async (fn, setDeleting, id) => {
    setDeleting(id);
    try { await fn(id); await onRefresh(); }
    finally { setDeleting(null); }
  };

  return (
    <div className="stack" style={{ marginTop: 40 }}>
      <h3 style={{ margin: 0, color: "var(--gray-700)" }}>Registered Tenants</h3>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Org ID</th>
              <th>Name</th>
              <th>Plan</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 ? (
              <tr><td colSpan={4} style={{ color: "var(--gray-500)", fontStyle: "italic" }}>No organizations yet.</td></tr>
            ) : orgs.map((o) => (
              <ResourceRow
                key={o.id}
                label="org"
                value={o}
                onDelete={(id) => doDelete(deleteOrganization, setDeletingOrg, id)}
                deleting={deletingOrg === o.id}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Project ID</th>
              <th>Name</th>
              <th>Org</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr><td colSpan={4} style={{ color: "var(--gray-500)", fontStyle: "italic" }}>No projects yet.</td></tr>
            ) : projects.map((p) => (
              <ResourceRow
                key={p.id}
                label="project"
                value={p}
                onDelete={(id) => doDelete(deleteProject, setDeletingProject, id)}
                deleting={deletingProject === p.id}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>API Key ID</th>
              <th>Name</th>
              <th>Org</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.length === 0 ? (
              <tr><td colSpan={4} style={{ color: "var(--gray-500)", fontStyle: "italic" }}>No API keys yet.</td></tr>
            ) : apiKeys.map((k) => (
              <ResourceRow
                key={k.id}
                label="key"
                value={k}
                onDelete={(id) => doDelete(deleteApiKey, setDeletingKey, id)}
                deleting={deletingKey === k.id}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Setup() {
  const [step, setStep] = useState(0);
  const [org, setOrg] = useState(null);
  const [project, setProject] = useState(null);
  const [apiKey, setApiKey] = useState(null);

  const [orgs, setOrgs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [loadError, setLoadError] = useState("");

  const loadAll = useCallback(async () => {
    setLoadError("");
    try {
      const [o, p, k] = await Promise.all([
        getOrganizations(),
        getProjects(),
        getApiKeys(),
      ]);
      setOrgs(o.data || []);
      setProjects(p.data || []);
      setApiKeys(k.data || []);
    } catch {
      setLoadError("Could not load existing resources.");
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const reset = () => {
    setStep(0);
    setOrg(null);
    setProject(null);
    setApiKey(null);
    loadAll();
  };

  return (
    <div className="page-shell">
      <div className="hero-card" style={{ borderRadius: "var(--radius-lg)", padding: 28 }}>
        <h2>Tenant Setup Wizard</h2>
        <p>
          Register an external team's organization, project, and API key on your governance server
          so their AI tools can start sending telemetry.
        </p>
      </div>

      <div className="panel">
        <StepBar current={step} />

        {step === 0 && (
          <OrgStep onNext={(data) => { setOrg(data); setStep(1); }} />
        )}
        {step === 1 && org && (
          <ProjectStep
            org={org}
            onNext={(data) => { setProject(data); setStep(2); }}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && org && project && (
          <ApiKeyStep
            org={org}
            project={project}
            onNext={(data) => { setApiKey(data); setStep(3); loadAll(); }}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && org && project && apiKey && (
          <DoneStep org={org} project={project} apiKey={apiKey} onReset={reset} />
        )}
      </div>

      {loadError && <div className="error-message">{loadError}</div>}
      <ExistingResources
        orgs={orgs}
        projects={projects}
        apiKeys={apiKeys}
        onRefresh={loadAll}
      />
    </div>
  );
}
