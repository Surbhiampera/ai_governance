import React, { useEffect, useRef, useState } from "react";

export function formatPricing(m) {
  if (!m) return "";
  const parts = [];
  if (m.input_per_1m != null)
    parts.push(`$${Number(m.input_per_1m).toFixed(2)}/1M in`);
  if (m.output_per_1m != null)
    parts.push(`$${Number(m.output_per_1m).toFixed(2)}/1M out`);
  if (m.context_window != null)
    parts.push(`${Number(m.context_window).toLocaleString()} ctx`);
  return parts.join(" · ");
}

function groupByProvider(catalog) {
  const groups = {};
  for (const m of catalog || []) {
    if (!groups[m.provider]) groups[m.provider] = [];
    groups[m.provider].push(m);
  }
  return groups;
}

const EMPTY_CATALOG_MSG =
  "No models available — configure a provider API key first.";

const PANEL_STYLE = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  zIndex: 100,
  background: "var(--white, #fff)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  overflow: "hidden",
};

// Structured, collapsible dropdown for selecting one or more catalog models,
// grouped by provider. Closed state shows a single-line summary like a
// normal <select>; the open panel lists only what's in the catalog passed in
// (the deployed-model list), never every model the platform knows about.
//
// Also self-contained for the two edge cases around a shrinking catalog:
//  - empty catalog → shows a message instead of a blank control
//  - a previously-saved selection that dropped out of the catalog → listed
//    in its own "unavailable" section (never silently hidden) with a way to
//    remove it, instead of letting a re-save fail validation unexplained.
export function ModelMultiSelect({
  catalog,
  selected,
  onChange,
  disabled = false,
  maxHeight = 260,
  placeholder = "Select allowed models",
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const list = catalog || [];
  const sel = selected || [];
  const groups = groupByProvider(list);
  const providers = Object.keys(groups).sort();
  const unavailable = sel.filter(
    (name) => !list.some((m) => m.model_name === name),
  );
  const catalogEmpty = list.length === 0;

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const toggle = (name) => {
    if (disabled) return;
    onChange(
      sel.includes(name) ? sel.filter((s) => s !== name) : [...sel, name],
    );
  };

  const remove = (name) => {
    if (disabled) return;
    onChange(sel.filter((s) => s !== name));
  };

  const summary = catalogEmpty
    ? sel.length === 0
      ? EMPTY_CATALOG_MSG
      : `${sel.length} unavailable`
    : sel.length === 0
      ? placeholder
      : sel.length === 1
        ? sel[0]
        : `${sel.length} models selected`;

  const canOpen = !disabled && !(catalogEmpty && unavailable.length === 0);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => canOpen && setOpen((v) => !v)}
        disabled={!canOpen}
        style={{
          width: "100%",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 6,
          border: "1px solid var(--border)",
          background: disabled ? "var(--gray-50, #f9fafb)" : "var(--white, #fff)",
          color:
            catalogEmpty && sel.length === 0
              ? "#92400e"
              : sel.length === 0
                ? "var(--gray-400)"
                : "inherit",
          fontSize: 13,
          fontFamily: sel.length === 1 && !catalogEmpty ? "monospace" : "inherit",
          cursor: canOpen ? "pointer" : "default",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {summary}
          {!catalogEmpty && unavailable.length > 0 && (
            <span style={{ color: "#ef4444", marginLeft: 6 }}>
              ⚠ {unavailable.length} unavailable
            </span>
          )}
        </span>
        <span style={{ fontSize: 10, color: "var(--gray-400)", flexShrink: 0 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && canOpen && (
        <div style={{ ...PANEL_STYLE, maxHeight, overflowY: "auto" }}>
          {catalogEmpty && (
            <div
              style={{
                fontSize: 12,
                color: "#92400e",
                background: "rgba(245,158,11,0.1)",
                padding: "10px 12px",
              }}
            >
              {EMPTY_CATALOG_MSG}
            </div>
          )}
          {providers.map((provider) => (
            <div key={provider}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--gray-500)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "8px 12px 4px",
                  background: "var(--gray-50, #f9fafb)",
                  position: "sticky",
                  top: 0,
                }}
              >
                {provider}
              </div>
              {groups[provider].map((m) => (
                <label
                  key={m.model_name}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "6px 12px",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sel.includes(m.model_name)}
                    onChange={() => toggle(m.model_name)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <span style={{ fontFamily: "monospace" }}>{m.model_name}</span>
                    {formatPricing(m) && (
                      <div style={{ fontSize: 11, color: "var(--gray-500)" }}>
                        {formatPricing(m)}
                      </div>
                    )}
                  </span>
                </label>
              ))}
            </div>
          ))}

          {unavailable.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#991b1b",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "8px 12px 4px",
                  background: "rgba(239,68,68,0.06)",
                  position: "sticky",
                  top: 0,
                }}
              >
                No longer available
              </div>
              {unavailable.map((name) => (
                <div
                  key={name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 12px",
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "monospace",
                      color: "#991b1b",
                      textDecoration: "line-through",
                      opacity: 0.8,
                    }}
                  >
                    {name}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(name)}
                    title={`Remove ${name}`}
                    style={{
                      border: "1px solid #fca5a5",
                      background: "transparent",
                      color: "#991b1b",
                      borderRadius: 5,
                      fontSize: 11,
                      padding: "2px 8px",
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Single-select constrained to the currently chosen allowed models, grouped
// by provider via <optgroup> for a clean, structured dropdown. Self-contained
// for a shrinking catalog: an empty catalog disables with a clear message,
// and a saved default that fell out of the catalog stays visible (flagged,
// not silently dropped) so the admin can see why it needs to be replaced.
export function ModelDefaultSelect({
  catalog,
  allowed,
  value,
  onChange,
  disabled = false,
  placeholder = "— select default —",
}) {
  const list = catalog || [];
  const options = list.filter((m) => (allowed || []).includes(m.model_name));
  const groups = groupByProvider(options);
  const providers = Object.keys(groups).sort();
  const valueUnavailable = !!value && !list.some((m) => m.model_name === value);
  const catalogEmpty = list.length === 0;

  return (
    <div>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || (options.length === 0 && !valueUnavailable)}
        style={{
          padding: "8px 10px",
          borderRadius: 6,
          border: valueUnavailable ? "1px solid #ef4444" : "1px solid var(--border)",
          fontSize: 13,
          width: "100%",
          background:
            disabled || (options.length === 0 && !valueUnavailable)
              ? "var(--gray-50, #f9fafb)"
              : "var(--white, #fff)",
        }}
      >
        <option value="">
          {catalogEmpty
            ? EMPTY_CATALOG_MSG
            : options.length === 0
              ? "Select allowed models first"
              : placeholder}
        </option>
        {valueUnavailable && (
          <option value={value}>{value} — unavailable</option>
        )}
        {providers.map((provider) => (
          <optgroup key={provider} label={provider}>
            {groups[provider].map((m) => (
              <option key={m.model_name} value={m.model_name}>
                {m.model_name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {valueUnavailable && (
        <p style={{ fontSize: 11, color: "#ef4444", marginTop: 6 }}>
          ⚠ "{value}" is no longer available — choose a new default.
        </p>
      )}
    </div>
  );
}
