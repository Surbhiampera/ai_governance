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
  const groups = groupByProvider(catalog);
  const providers = Object.keys(groups).sort();

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
      selected.includes(name)
        ? selected.filter((s) => s !== name)
        : [...selected, name],
    );
  };

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : `${selected.length} models selected`;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
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
          color: selected.length === 0 ? "var(--gray-400)" : "inherit",
          fontSize: 13,
          fontFamily: selected.length === 1 ? "monospace" : "inherit",
          cursor: disabled ? "default" : "pointer",
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
        </span>
        <span style={{ fontSize: 10, color: "var(--gray-400)", flexShrink: 0 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && !disabled && (
        <div style={{ ...PANEL_STYLE, maxHeight, overflowY: "auto" }}>
          {providers.length === 0 && (
            <div
              style={{ fontSize: 12, color: "var(--gray-400)", padding: "10px 12px" }}
            >
              No deployed models available.
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
                    checked={selected.includes(m.model_name)}
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
        </div>
      )}
    </div>
  );
}

// Single-select constrained to the currently chosen allowed models, grouped
// by provider via <optgroup> for a clean, structured dropdown.
export function ModelDefaultSelect({
  catalog,
  allowed,
  value,
  onChange,
  disabled = false,
  placeholder = "— select default —",
}) {
  const options = (catalog || []).filter((m) =>
    (allowed || []).includes(m.model_name),
  );
  const groups = groupByProvider(options);
  const providers = Object.keys(groups).sort();

  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || options.length === 0}
      style={{
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        fontSize: 13,
        width: "100%",
        background: disabled || options.length === 0 ? "var(--gray-50, #f9fafb)" : "var(--white, #fff)",
      }}
    >
      <option value="">
        {options.length === 0 ? "Select allowed models first" : placeholder}
      </option>
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
  );
}
