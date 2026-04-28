import React, { useCallback, useEffect, useState } from "react";
import {
  getLookupEventStatuses,
  getLookupProviders,
  getSuperAdminAggregate,
  getSuperAdminLogs,
  getToolsUsage,
  getTracingOrgs,
} from "../api";
const money = (v) => `$${Number(v || 0).toFixed(4)}`;
const num = (v) => Number(v || 0).toLocaleString();

function SuperAdminLogs() {
  const [logs, setLogs] = useState([]);
  const [aggregate, setAggregate] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [tools, setTools] = useState([]);
  const [providers, setProviders] = useState([]);
  const [eventStatuses, setEventStatuses] = useState([]);
  const [filters, setFilters] = useState({
    org_id: "",
    tool_name: "",
    provider: "",
    status: "",
    start_date: "",
    end_date: "",
    limit: 200,
  });
  const [loading, setLoading] = useState(true);
  const [loadingAggregate, setLoadingAggregate] = useState(true);
  const [error, setError] = useState("");

  const loadFilters = async () => {
    const [orgRes, toolRes, provRes, statusRes] = await Promise.all([
      getTracingOrgs(),
      getToolsUsage(),
      getLookupProviders(),
      getLookupEventStatuses(),
    ]);
    setOrgs(orgRes.data || []);
    setTools(toolRes.data || []);
    setProviders(provRes.data || []);
    setEventStatuses(["", ...(statusRes.data || [])]);
  };

  const fetchAggregate = useCallback(async (orgId) => {
    setLoadingAggregate(true);
    try {
      const params = orgId ? { org_id: orgId } : {};
      const res = await getSuperAdminAggregate(params);
      setAggregate(res.data || []);
    } catch {
      setAggregate([]);
    } finally {
      setLoadingAggregate(false);
    }
  }, []);

  const fetchLogs = useCallback(async (currentFilters) => {
    setLoading(true);
    try {
      const params = Object.fromEntries(
        Object.entries(currentFilters).filter(
          ([, v]) => v !== "" && v !== null,
        ),
      );
      const res = await getSuperAdminLogs(params);
      setLogs(res.data || []);
      setError("");
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          "Unable to load super-admin logs. Check backend connectivity.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFilters().catch(() => {});
  }, []);

  useEffect(() => {
    fetchLogs(filters);
    fetchAggregate(filters.org_id);
    // intentionally only run on mount; subsequent fetches go through Apply/Reset
  }, [fetchLogs, fetchAggregate]); // eslint-disable-line

  const apply = (e) => {
    e.preventDefault();
    fetchLogs(filters);
    fetchAggregate(filters.org_id);
  };

  const reset = () => {
    const cleared = {
      org_id: "",
      tool_name: "",
      provider: "",
      status: "",
      start_date: "",
      end_date: "",
      limit: 200,
    };
    setFilters(cleared);
    fetchLogs(cleared);
    fetchAggregate("");
  };

  const totalCost = logs.reduce((s, r) => s + Number(r.total_cost || 0), 0);
  const totalTokens = logs.reduce((s, r) => s + Number(r.total_tokens || 0), 0);
  const avgRisk = logs.length
    ? logs.reduce((s, r) => s + Number(r.risk_score || 0), 0) / logs.length
    : 0;

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <h2>Super Admin · Centralized Logs</h2>
          <p>
            Unified read-only access to logs across all AI tools for monitoring,
            auditing, and compliance no code or prompt access.
          </p>

          <div className="hero-metrics">
            <div className="hero-chip">
              <span>Records</span>
              <strong>{logs.length}</strong>
            </div>
            <div className="hero-chip">
              <span>Total Cost</span>
              <strong>${totalCost.toFixed(2)}</strong>
            </div>
            <div className="hero-chip">
              <span>Total Tokens</span>
              <strong>{totalTokens.toLocaleString()}</strong>
            </div>
            <div className="hero-chip">
              <span>Avg Risk</span>
              <strong>{avgRisk.toFixed(1)}</strong>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Filters</h3>
              <p
                style={{
                  margin: "2px 0 0",
                  color: "var(--gray-500)",
                  fontSize: 13,
                }}
              >
                Narrow logs by organization, tool, provider or time window.
              </p>
            </div>
          </div>

          <form className="stack" onSubmit={apply}>
            <div className="form-grid">
              <div className="field">
                <label>Organization</label>
                <select
                  value={filters.org_id}
                  onChange={(e) =>
                    setFilters({ ...filters, org_id: e.target.value })
                  }
                >
                  <option value="">All organizations</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Tool</label>
                <select
                  value={filters.tool_name}
                  onChange={(e) =>
                    setFilters({ ...filters, tool_name: e.target.value })
                  }
                >
                  <option value="">All tools</option>
                  {tools.map((t) => (
                    <option key={t.tool_name} value={t.tool_name}>
                      {t.tool_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Provider</label>
                <select
                  value={filters.provider}
                  onChange={(e) =>
                    setFilters({ ...filters, provider: e.target.value })
                  }
                >
                  <option value="">All providers</option>
                  {providers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Status</label>
                <select
                  value={filters.status}
                  onChange={(e) =>
                    setFilters({ ...filters, status: e.target.value })
                  }
                >
                  {eventStatuses.map((s) => (
                    <option key={s || "all"} value={s}>
                      {s || "All statuses"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>From</label>
                <input
                  type="date"
                  value={filters.start_date}
                  onChange={(e) =>
                    setFilters({ ...filters, start_date: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>To</label>
                <input
                  type="date"
                  value={filters.end_date}
                  onChange={(e) =>
                    setFilters({ ...filters, end_date: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="action-row">
              <button type="submit" className="btn btn-primary">
                Apply filters
              </button>
              <button type="button" className="btn btn-ghost" onClick={reset}>
                Reset
              </button>
            </div>
          </form>
        </div>
      </section>

      {error && <div className="error-message">{error}</div>}

      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Usage Aggregation by Tool</h3>
            <p
              style={{
                margin: "2px 0 0",
                color: "var(--gray-500)",
                fontSize: 13,
              }}
            >
              Centralized computation of token usage, cost consumption, and
              remaining budget across all tools and projects — sourced from
              tracing data.
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Org</th>
                <th>Tool / Model</th>
                <th>Events</th>
                <th>Tokens In</th>
                <th>Tokens Out</th>
                <th>Total Tokens</th>
                <th>Total Cost</th>
                <th>Avg Risk</th>
                <th>Budget Limit</th>
                <th>Remaining</th>
              </tr>
            </thead>
            <tbody>
              {loadingAggregate && (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center" }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loadingAggregate && aggregate.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    style={{ textAlign: "center", color: "var(--gray-500)" }}
                  >
                    No aggregated data available.
                  </td>
                </tr>
              )}
              {aggregate.map((row, i) => {
                const remaining = row.remaining_budget;
                const remainingClass =
                  remaining !== null && remaining < 0
                    ? "critical"
                    : remaining !== null && remaining < row.budget_limit * 0.1
                      ? "high"
                      : "";
                return (
                  <tr key={`${row.org_id}-${row.tool_name}-${i}`}>
                    <td>{row.org_id}</td>
                    <td>
                      <strong>{row.tool_name}</strong>
                    </td>
                    <td>{num(row.total_events)}</td>
                    <td>{num(row.prompt_tokens)}</td>
                    <td>{num(row.completion_tokens)}</td>
                    <td>{num(row.total_tokens)}</td>
                    <td>{money(row.total_cost)}</td>
                    <td>{row.avg_risk_score.toFixed(2)}</td>
                    <td>
                      {row.budget_limit !== null
                        ? `$${row.budget_limit.toFixed(2)}`
                        : "—"}
                    </td>
                    <td>
                      {remaining !== null ? (
                        <span className={`status-pill ${remainingClass}`}>
                          ${remaining.toFixed(2)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Cross-Tool Log Stream</h3>
            <p
              style={{
                margin: "2px 0 0",
                color: "var(--gray-500)",
                fontSize: 13,
              }}
            >
              Auto-ingested from every connected vendor — normalized for
              org-wide cost tracking and governance.
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Org</th>
                <th>Project</th>
                <th>Provider</th>
                <th>Tool</th>
                <th>Service</th>
                <th>Status</th>
                <th>Tokens</th>
                <th>Cost</th>
                <th>Latency</th>
                <th>Risk</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={12} style={{ textAlign: "center" }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td
                    colSpan={12}
                    style={{ textAlign: "center", color: "var(--gray-500)" }}
                  >
                    No log records match the current filters.
                  </td>
                </tr>
              )}
              {logs.map((row) => (
                <tr key={row.event_id}>
                  <td>
                    {row.created_at
                      ? new Date(row.created_at).toLocaleString()
                      : "-"}
                  </td>
                  <td>{row.org_id || "-"}</td>
                  <td>{row.project_id || "-"}</td>
                  <td>{row.provider || "-"}</td>
                  <td>{row.tool_name || "-"}</td>
                  <td>{row.service_type || "-"}</td>
                  <td>
                    <span
                      className={`status-pill ${(row.status || "").toLowerCase()}`}
                    >
                      {row.status || "-"}
                    </span>
                  </td>
                  <td>{Number(row.total_tokens || 0).toLocaleString()}</td>
                  <td>${Number(row.total_cost || 0).toFixed(4)}</td>
                  <td>{row.latency_ms} ms</td>
                  <td>{Number(row.risk_score || 0).toFixed(1)}</td>
                  <td>
                    {row.misuse_detected && (
                      <span className="status-pill critical">misuse</span>
                    )}{" "}
                    {row.abnormal_usage_spike && (
                      <span className="status-pill high">spike</span>
                    )}
                    {!row.misuse_detected && !row.abnormal_usage_spike && "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default SuperAdminLogs;
