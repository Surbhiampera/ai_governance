// Shared time-range and scope-filter helpers used across all dashboard pages.
// Keeping these in one place ensures every module computes the same start_date
// and `days` window for the same range value, and treats "all time" identically
// (no start_date filter sent to the backend).

export const RANGE_OPTIONS = [
  { value: "all", label: "All Time", days: 365 },
  { value: "today", label: "Today", days: 1 },
  { value: "7d", label: "Last 7 Days", days: 7 },
  { value: "30d", label: "Last 30 Days", days: 30 },
  { value: "90d", label: "Last 90 Days", days: 90 },
];

const RANGE_OFFSET_DAYS = {
  today: 0,
  "7d": 6,
  "30d": 29,
  "90d": 89,
};

// Returns ISO date string (YYYY-MM-DD) for the start of the selected range,
// or `undefined` for "all time" (no lower bound — backend should not filter).
export const rangeToStartDate = (rangeValue) => {
  if (!rangeValue || rangeValue === "all") return undefined;
  const offset = RANGE_OFFSET_DAYS[rangeValue];
  if (offset == null) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().split("T")[0];
};

// Returns the integer number of days for a range value (used by APIs that take
// a numeric `days` window such as `getUsageTrends`, `getCostDaily`).
export const rangeToDays = (rangeValue) => {
  const opt = RANGE_OPTIONS.find((r) => r.value === rangeValue);
  return (opt || RANGE_OPTIONS[0]).days;
};

// Returns the human-readable label for a range value.
export const rangeLabelOf = (rangeValue) => {
  const opt = RANGE_OPTIONS.find((r) => r.value === rangeValue);
  return (opt || RANGE_OPTIONS[0]).label;
};

// Builds a normalized filter param object usable by most list/aggregate
// endpoints. Empty values become `undefined` so axios omits them entirely.
export const buildScopeParams = ({ orgId, projectId, range } = {}) => ({
  org_id: orgId || undefined,
  project_id: projectId || undefined,
  start_date: rangeToStartDate(range),
});
