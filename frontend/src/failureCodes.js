// Human-readable labels for the proxy's machine-readable failure_code values.
export const FAILURE_CODE_LABELS = {
  rate_limited: "Rate Limited",
  budget_exceeded: "Budget Exceeded",
  pii_block: "PII Blocked",
  invalid_request: "Invalid Request",
  model_not_authorized: "Model Not Authorized",
  upstream_unreachable: "Upstream Unreachable",
  stream_incomplete: "Stream Incomplete",
};

export function failureLabel(code) {
  if (!code) return "—";
  if (FAILURE_CODE_LABELS[code]) return FAILURE_CODE_LABELS[code];
  if (code.startsWith("upstream_error")) return "Upstream Error";
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Maps request_status to the existing .status-pill modifier classes.
// Covers both vocabularies seen in this codebase: completed/blocked/failed/partial
// (proxy request log) and success/error/partial (telemetry event status).
export function statusPillClass(status) {
  switch (status) {
    case "completed":
    case "success":   return "success";
    case "blocked":    return "critical";
    case "failed":
    case "error":      return "high";
    case "partial":    return "warning";
    default:           return "medium";
  }
}
