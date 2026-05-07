import React, { useEffect, useState } from "react";
import {
  classifyEmailText,
  draftEmailText,
  listEmails,
  refreshEmails,
} from "../api";

function Emails() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [top, setTop] = useState("");
  const [limit, setLimit] = useState("");

  const [selected, setSelected] = useState(null);
  const [classifyResult, setClassifyResult] = useState(null);
  const [draftResult, setDraftResult] = useState(null);

  const load = async () => {
    if (!String(limit).trim()) {
      setMsg("Enter list limit first.");
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await listEmails({ limit: Number(limit) });
      setRows(res.data || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const doRefresh = async () => {
    setMsg("");
    try {
      if (!String(top).trim()) {
        setMsg("Enter fetch top first.");
        return;
      }
      const res = await refreshEmails(Number(top));
      setMsg(`Refresh completed: ${res.data.processed_count || 0} emails processed.`);
      await load();
    } catch {
      setMsg("Refresh failed. Check Microsoft Graph + provider credentials.");
    }
  };

  const doClassify = async () => {
    if (!selected?.masked_body && !selected?.raw_body) return;
    setClassifyResult(null);
    const text = selected.masked_body || selected.raw_body;
    const res = await classifyEmailText(text);
    setClassifyResult(res.data);
  };

  const doDraft = async () => {
    if (!selected?.masked_body && !selected?.raw_body) return;
    setDraftResult(null);
    const text = selected.masked_body || selected.raw_body;
    const intent = selected.intent || classifyResult?.intent || null;
    const res = await draftEmailText(text, intent);
    setDraftResult(res.data);
  };

  return (
    <div className="page-shell">
      <section className="panel" style={{ padding: "18px 24px" }}>
        <h2 style={{ margin: 0 }}>AI Email Support Agent</h2>
        <p style={{ margin: "6px 0 0", color: "var(--gray-500)", fontSize: 14 }}>
          Fetch unread Outlook emails (Microsoft Graph), sanitize, classify, draft replies, persist for audit, and finalize.
        </p>
        {msg && <div className="feedback-msg" style={{ marginTop: 10 }}>{msg}</div>}
        <div className="action-row" style={{ marginTop: 12 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Fetch top</label>
            <input
              type="number"
              min="1"
              max="200"
              value={top}
              onChange={(e) => setTop(e.target.value)}
              style={{ width: 120 }}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>List limit</label>
            <input
              type="number"
              min="1"
              max="500"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              style={{ width: 120 }}
            />
          </div>
          <button className="btn btn-primary" onClick={doRefresh}>POST /refresh</button>
          <button className="btn btn-ghost" onClick={load}>Reload</button>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Archived Emails</h3>
            <p style={{ margin: "2px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
              Click an email to view masked content, intent, and draft.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">No archived emails yet. Run refresh.</div>
        ) : (
          <div className="list-grid">
            {rows.map((r) => (
              <div
                key={r.id}
                className="timeline-card"
                style={{ cursor: "pointer", borderColor: selected?.id === r.id ? "var(--brand-primary)" : undefined }}
                onClick={() => { setSelected(r); setClassifyResult(null); setDraftResult(null); }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.subject || "(no subject)"}
                    </strong>
                    <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 4 }}>
                      {r.sender_email || "—"} · {r.pipeline_status || "—"}
                    </div>
                    <div className="metric-chip-row" style={{ marginTop: 6 }}>
                      <span className="metric-chip">{r.intent || "UNCLASSIFIED"}</span>
                      <span className="metric-chip">PII {r.pii_masked ? "masked" : "none"}</span>
                      {r.trace_id && <span className="metric-chip" style={{ fontFamily: "monospace" }}>{r.trace_id.slice(0, 12)}…</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, color: "var(--gray-500)" }}>
                    {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>Selected Email</h3>
              <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>
                ID {selected.id} · Trace {selected.trace_id || "—"}
              </div>
            </div>
            <div className="action-row">
              <button className="btn btn-secondary" onClick={doClassify}>POST /classify</button>
              <button className="btn btn-secondary" onClick={doDraft}>POST /draft</button>
              <button className="btn btn-ghost" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label>Intent</label>
              <input value={selected.intent || ""} readOnly />
            </div>
            <div className="field">
              <label>Confidence</label>
              <input value={selected.intent_confidence ?? ""} readOnly />
            </div>
            <div className="field">
              <label>Masking Types</label>
              <input value={(selected.masking_types || []).join(", ")} readOnly />
            </div>
          </div>

          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", color: "var(--gray-500)", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600 }}>
              Masked Body
            </summary>
            <pre style={{ marginTop: 8, padding: 14, borderRadius: 14, background: "var(--gray-50)", border: "1px solid rgba(124,112,174,0.16)", fontSize: 13, overflow: "auto", maxHeight: 260 }}>
              {selected.masked_body || selected.raw_body || ""}
            </pre>
          </details>

          {classifyResult && (
            <details open style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", color: "var(--gray-500)", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600 }}>
                Classify Result
              </summary>
              <pre style={{ marginTop: 8 }}>{JSON.stringify(classifyResult, null, 2)}</pre>
            </details>
          )}

          {draftResult && (
            <details open style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", color: "var(--gray-500)", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600 }}>
                Draft Result
              </summary>
              <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{draftResult.draft}</pre>
            </details>
          )}
        </section>
      )}
    </div>
  );
}

export default Emails;
