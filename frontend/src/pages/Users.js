import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminCreateUser,
  adminDeleteUser,
  adminListUsers,
  adminResendInvite,
  adminUpdateUser,
  getLookupUserRoles,
} from "../api";
import { useAuth } from "../auth/AuthContext";
import { EMAIL_MAX_LENGTH, NAME_MAX_LENGTH, authErrorMessage, isValidEmail, normalizeEmail } from "../auth/authUtils";

// Used only if /lookups/user-roles is unavailable — mirrors ROLES in the backend's app/core/deps.py.
const FALLBACK_ROLES = ["viewer", "security_reviewer", "admin"];

const roleLabel = (role) =>
  String(role || "viewer")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

// Backend may send `status`, or just whether a password has been set.
const isPending = (u) => u.status === "invited" || u.status === "pending" || u.has_password === false;

function adminError(err, fallback) {
  const code = err?.response?.status;
  if (code === 401) return "Your session has expired. Please sign in again.";
  if (code === 403) return "You need admin access to manage users.";
  if (code === 404 || code === 405) return "User management isn't available on this server yet.";
  if (code === 409) return "A user with this email already exists.";
  return authErrorMessage(err, fallback);
}

function Modal({ title, onClose, children, maxWidth = 520 }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div onClick={onClose} className="modal-backdrop" style={{ zIndex: 2000 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-dialog"
        style={{ maxWidth }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Shown when the backend returns the invite link itself (e.g. no SMTP), so the
// admin can pass it on over a trusted channel.
function InviteResult({ result, onDone }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.invite_link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      {result.invite_sent !== false ? (
        <div className="users-note users-note--success">
          An invite was emailed to <strong>{result.email}</strong>. They'll choose their own password from the link.
        </div>
      ) : (
        <div className="users-note users-note--warn">
          The invite email couldn't be sent to <strong>{result.email}</strong>.
          {result.invite_link ? " Share the link below with them directly." : " Check the server's email settings, then resend the invite."}
        </div>
      )}
      {result.invite_link && (
        <div className="field">
          <label htmlFor="invite-link">One-time setup link</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input id="invite-link" readOnly value={result.invite_link} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-secondary" onClick={copy} style={{ whiteSpace: "nowrap" }}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <span className="users-hint">
            Anyone with this link can set this account's password. Share it only with the user, over a trusted channel. It expires and works once.
          </span>
        </div>
      )}
      <div className="action-row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-primary" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

function AddUserModal({ roles, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles.includes("viewer") ? "viewer" : roles[0] || "");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const errors = {
    name: !name.trim() ? "Enter the user's name." : "",
    email: !isValidEmail(email) ? "Enter a valid email address." : "",
    role: !role ? "Choose a role." : "",
  };
  const show = (k) => (touched ? errors[k] : "");

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setTouched(true);
    setError("");
    if (Object.values(errors).some(Boolean)) return;
    setSaving(true);
    try {
      const cleanEmail = normalizeEmail(email);
      const res = await adminCreateUser({ name: name.trim(), email: cleanEmail, role });
      onCreated();
      setResult({ email: cleanEmail, ...res.data });
    } catch (err) {
      setError(adminError(err, "Couldn't create the user. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={result ? "User added" : "Add user"} onClose={onClose}>
      {result ? (
        <InviteResult result={result} onDone={onClose} />
      ) : (
        <form className="stack" style={{ gap: 14 }} onSubmit={submit} noValidate>
          <p className="users-hint" style={{ margin: 0 }}>
            The user gets an email invite to set their own password — you never see or choose it.
          </p>
          {error && <div className="users-note users-note--error" role="alert">{error}</div>}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="new-user-name">Full name</label>
              <input
                id="new-user-name"
                value={name}
                maxLength={NAME_MAX_LENGTH}
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
                aria-invalid={show("name") ? "true" : undefined}
                autoFocus
              />
              {show("name") && <span className="field-error">{show("name")}</span>}
            </div>
            <div className="field">
              <label htmlFor="new-user-email">Work email</label>
              <input
                id="new-user-email"
                type="email"
                value={email}
                maxLength={EMAIL_MAX_LENGTH}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={show("email") ? "true" : undefined}
              />
              {show("email") && <span className="field-error">{show("email")}</span>}
            </div>
          </div>
          <div className="field">
            <label htmlFor="new-user-role">Role</label>
            <select id="new-user-role" value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select>
            {show("role") && <span className="field-error">{show("role")}</span>}
            {role === "admin" && (
              <span className="users-hint">Admins can add, change and remove every user.</span>
            )}
          </div>
          <div className="action-row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Adding…" : "Add user & send invite"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ConfirmRemoveModal({ user, onClose, onRemoved }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const remove = async () => {
    setSaving(true);
    setError("");
    try {
      await adminDeleteUser(user.id);
      onRemoved();
      onClose();
    } catch (err) {
      setError(adminError(err, "Couldn't remove the user. Please try again."));
      setSaving(false);
    }
  };

  return (
    <Modal title="Remove user" onClose={onClose} maxWidth={460}>
      <div className="stack" style={{ gap: 14 }}>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          Remove <strong>{user.name || user.email}</strong> ({user.email})? They'll be signed out and won't be able to sign in again.
        </p>
        {error && <div className="users-note users-note--error" role="alert">{error}</div>}
        <div className="action-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={remove} disabled={saving}>
            {saving ? "Removing…" : "Remove user"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState(FALLBACK_ROLES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [inviteResult, setInviteResult] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminListUsers();
      const list = Array.isArray(res.data) ? res.data : res.data?.users || [];
      setUsers(list);
    } catch (err) {
      setError(adminError(err, "Couldn't load users."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    getLookupUserRoles()
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data.filter(Boolean) : [];
        if (list.length) setRoles(list);
      })
      .catch(() => {});
  }, [load]);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 5000);
  };

  const changeRole = async (u, role) => {
    if (role === u.role) return;
    setBusyId(u.id);
    setError("");
    try {
      await adminUpdateUser(u.id, { role });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
      flash(`${u.name || u.email} is now ${roleLabel(role)}.`);
    } catch (err) {
      setError(adminError(err, "Couldn't change the role."));
    } finally {
      setBusyId(null);
    }
  };

  const resend = async (u) => {
    setBusyId(u.id);
    setError("");
    try {
      const res = await adminResendInvite(u.id);
      const data = res.data || {};
      if (data.invite_link || data.invite_sent === false) {
        setInviteResult({ email: u.email, ...data });
      } else {
        flash(isPending(u) ? `Invite re-sent to ${u.email}.` : `Password reset link sent to ${u.email}.`);
      }
    } catch (err) {
      setError(adminError(err, "Couldn't send the email."));
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? users.filter((u) => `${u.name || ""} ${u.email || ""} ${u.role || ""}`.toLowerCase().includes(q))
      : users;
    return [...list].sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || ""));
  }, [users, search]);

  const adminCount = users.filter((u) => u.role === "admin").length;
  const pendingCount = users.filter(isPending).length;
  // Include any role already assigned to a user even if the lookup omits it.
  const roleOptions = useMemo(
    () => Array.from(new Set([...roles, ...users.map((u) => u.role).filter(Boolean)])),
    [roles, users],
  );

  return (
    <>
      <div className="page-filter-bar">
        <span style={{ fontWeight: 600, fontSize: 14 }}>Users</span>
        <input
          type="search"
          className="users-search"
          placeholder="Search name, email or role"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search users"
        />
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={load}>Refresh</button>
          <button type="button" className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add user</button>
        </div>
      </div>

      <div className="page-body" style={{ padding: "16px 20px" }}>
        <div className="stack" style={{ gap: 14 }}>
          {error && <div className="error-message">{error}</div>}
          {notice && <div className="users-note users-note--success" role="status">{notice}</div>}

          <div className="panel">
            <div className="section-head">
              <div>
                <h3>Team members</h3>
                <p style={{ color: "var(--gray-500)", fontSize: 13 }}>
                  {users.length} user{users.length !== 1 ? "s" : ""} · {adminCount} admin{adminCount !== 1 ? "s" : ""}
                  {pendingCount > 0 && ` · ${pendingCount} invite${pendingCount !== 1 ? "s" : ""} pending`}
                </p>
              </div>
            </div>

            {loading ? (
              <p className="users-empty">Loading users…</p>
            ) : filtered.length === 0 ? (
              <p className="users-empty">
                {search ? "No users match your search." : "No users yet. Add the first one with “Add user”."}
              </p>
            ) : (
              <div className="table-wrap" style={{ maxHeight: "none" }}>
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Added</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => {
                      const isMe = me && (u.id === me.id || u.email === me.email);
                      const pending = isPending(u);
                      const busy = busyId === u.id;
                      return (
                        <tr key={u.id}>
                          <td>
                            <div className="users-name">
                              {u.name || "—"}
                              {isMe && <span className="users-you">You</span>}
                            </div>
                            <div className="users-email">{u.email}</div>
                          </td>
                          <td>
                            {isMe ? (
                              <span title="You can't change your own role">{roleLabel(u.role)}</span>
                            ) : (
                              <select
                                className="users-role"
                                value={u.role || ""}
                                disabled={busy}
                                onChange={(e) => changeRole(u, e.target.value)}
                                aria-label={`Role for ${u.email}`}
                              >
                                {roleOptions.map((r) => (
                                  <option key={r} value={r}>{roleLabel(r)}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td>
                            <span className={`status-pill ${pending ? "warning" : "success"}`} style={{ padding: "4px 10px", fontSize: 11 }}>
                              {pending ? "Invite pending" : "Active"}
                            </span>
                          </td>
                          <td style={{ color: "var(--gray-500)", fontSize: 13 }}>{formatDate(u.created_at)}</td>
                          <td>
                            <div className="users-actions">
                              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => resend(u)}>
                                {pending ? "Resend invite" : "Send reset link"}
                              </button>
                              {!isMe && (
                                <button type="button" className="btn btn-ghost btn-sm users-remove" disabled={busy} onClick={() => setRemoving(u)}>
                                  Remove
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAdd && (
        <AddUserModal roles={roleOptions} onClose={() => setShowAdd(false)} onCreated={load} />
      )}
      {removing && (
        <ConfirmRemoveModal
          user={removing}
          onClose={() => setRemoving(null)}
          onRemoved={() => {
            flash(`${removing.name || removing.email} was removed.`);
            load();
          }}
        />
      )}
      {inviteResult && (
        <Modal title="Invite link" onClose={() => setInviteResult(null)}>
          <InviteResult result={inviteResult} onDone={() => setInviteResult(null)} />
        </Modal>
      )}
    </>
  );
}
