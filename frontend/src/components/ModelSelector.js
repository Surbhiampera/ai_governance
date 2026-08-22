import React from "react";

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

// Multi-select of catalog models, grouped by provider, with pricing/context helper text.
export function ModelMultiSelect({
  catalog,
  selected,
  onChange,
  disabled = false,
  maxHeight = 220,
}) {
  const groups = groupByProvider(catalog);
  const providers = Object.keys(groups);

  const toggle = (name) => {
    if (disabled) return;
    onChange(
      selected.includes(name)
        ? selected.filter((s) => s !== name)
        : [...selected, name],
    );
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 6,
        maxHeight,
        overflowY: "auto",
        padding: "4px 10px",
        background: disabled ? "var(--gray-50, #f9fafb)" : "transparent",
      }}
    >
      {providers.length === 0 && (
        <div
          style={{ fontSize: 12, color: "var(--gray-400)", padding: "8px 2px" }}
        >
          Loading model catalog…
        </div>
      )}
      {providers.map((provider) => (
        <div key={provider} style={{ marginBottom: 4 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--gray-500)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              margin: "8px 0 2px",
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
                padding: "3px 2px",
                cursor: disabled ? "default" : "pointer",
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={selected.includes(m.model_name)}
                disabled={disabled}
                onChange={() => toggle(m.model_name)}
                style={{ marginTop: 3 }}
              />
              <span>
                <span style={{ fontFamily: "monospace" }}>{m.model_name}</span>
                <div style={{ fontSize: 11, color: "var(--gray-500)" }}>
                  {formatPricing(m)}
                </div>
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

// Single-select constrained to the currently chosen allowed models.
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
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || options.length === 0}
      style={{
        padding: "7px 10px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        fontSize: 13,
        width: "100%",
      }}
    >
      <option value="">
        {options.length === 0 ? "Select allowed models first" : placeholder}
      </option>
      {options.map((m) => (
        <option key={m.model_name} value={m.model_name}>
          {m.model_name} ({m.provider})
        </option>
      ))}
    </select>
  );
}
