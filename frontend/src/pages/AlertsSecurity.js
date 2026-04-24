import React, { useEffect, useState } from "react";
import {
  getAlertsSecurity,
  getAnomaliesCombined,
  getSecurityLogsCombined,
  getSecuritySummaryCombined,
  resolveAlertCombined,
} from "../api";

function AlertsSecurity() {
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [alertFilter, setAlertFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [summaryRes, alertsRes, logsRes, anomaliesRes] = await Promise.all([
        getSecuritySummaryCombined(),
        getAlertsSecurity(alertFilter === "all" ? undefined : alertFilter),
        getSecurityLogsCombined(),
        getAnomaliesCombined("open"),
      ]);
      setSummary(summaryRes.data);
      setAlerts(alertsRes.data || []);
      setLogs(logsRes.data || []);
      setAnomalies(anomaliesRes.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [alertFilter]);

  const handleResolve = async (id) => {
    await resolveAlertCombined(id);
    setMessage(`Alert ${id} resolved.`);
    await load();
  };

  if (loading) {
    return <div className="loading">Loading alerts &amp; security…</div>;
  }

  return (
    <div className="page-shell">
      {/* ── Compact Header + Snapshot ── */}
      <section className="panel" style={{ padding: "18px 24px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Alerts &amp; Security</h2>
            <p
              style={{
                margin: "4px 0 0",
                color: "var(--gray-500)",
                fontSize: 14,
              }}
            >
              Governance alerts, security signals, PII exposure, and anomaly
              detection.
            </p>
          </div>
          <div className="pill-row" style={{ gap: 10, flexWrap: "wrap" }}>
            <div className="pill">
              Active Alerts{" "}
              <span className="highlight">{summary?.active_alerts || 0}</span>
            </div>
            <div className="pill">
              Anomalies{" "}
              <span className="highlight">{summary?.open_anomalies || 0}</span>
            </div>
            <div className="pill">
              PII{" "}
              <span className="highlight">{summary?.total_with_pii || 0}</span>
            </div>
            <div className="pill">
              Misuse{" "}
              <span className="highlight">{summary?.misuse_events || 0}</span>
            </div>
            <div className="pill">
              Data Out{" "}
              <span className="highlight">{summary?.data_out_events || 0}</span>
            </div>
            <div className="pill">
              Risk {Number(summary?.average_risk_score || 0).toFixed(1)} /{" "}
              {Number(summary?.highest_risk_score || 0).toFixed(1)}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ ALERTS SECTION ═══════════ */}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Alerts</h3>
            <p
              style={{
                margin: "2px 0 0",
                color: "var(--gray-500)",
                fontSize: 13,
              }}
            >
              Triggered by rules, budgets, anomalies, and security signals.
            </p>
          </div>
          <div className="action-row">
            <button
              type="button"
              className={`btn ${alertFilter === "active" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setAlertFilter("active")}
            >
              Active
            </button>
            <button
              type="button"
              className={`btn ${alertFilter === "resolved" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setAlertFilter("resolved")}
            >
              Resolved
            </button>
            <button
              type="button"
              className={`btn ${alertFilter === "all" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setAlertFilter("all")}
            >
              All
            </button>
          </div>
        </div>
        {message && (
          <div className="list-meta" style={{ marginBottom: 12 }}>
            {message}
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Telemetry ID</th>
                <th>Message</th>
                <th>Threshold</th>
                <th>Actual</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    style={{ textAlign: "center", color: "var(--gray-500)" }}
                  >
                    No alerts.
                  </td>
                </tr>
              )}
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>{a.alert_type}</td>
                  <td>
                    <span className={`status-pill ${a.severity}`}>
                      {a.severity}
                    </span>
                  </td>
                  <td>{a.telemetry_id ?? "-"}</td>
                  <td>{a.message}</td>
                  <td>{a.threshold_value ?? "-"}</td>
                  <td>{a.actual_value ?? "-"}</td>
                  <td>
                    <span className={`status-pill ${a.status}`}>
                      {a.status}
                    </span>
                  </td>
                  <td>
                    {a.status === "active" ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleResolve(a.id)}
                      >
                        Resolve
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ═══════════ SECURITY SECTION ═══════════ */}
      <section className="two-column">
        <div className="panel">
          <div className="section-head">
            <div>
              <h3> Open Anomalies</h3>
              <p
                style={{
                  margin: "2px 0 0",
                  color: "var(--gray-500)",
                  fontSize: 13,
                }}
              >
                Usage spikes and suspicious changes from background detection.
              </p>
            </div>
          </div>
          <div className="list-grid">
            {anomalies.length ? (
              anomalies.map((item) => (
                <div key={item.id} className="list-item">
                  <strong>{item.anomaly_type}</strong>
                  <div className="list-meta">
                    <span className={`status-pill ${item.severity}`}>
                      {item.severity}
                    </span>
                    {"  "}
                    {item.message}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">No open anomalies.</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h3> Security Logs</h3>
              <p
                style={{
                  margin: "2px 0 0",
                  color: "var(--gray-500)",
                  fontSize: 13,
                }}
              >
                PII, data-out, misuse, and risk scoring per event.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>PII</th>
                  <th>Type</th>
                  <th>Data Out</th>
                  <th>Misuse</th>
                  <th>Spike</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ textAlign: "center", color: "var(--gray-500)" }}
                    >
                      No security logs.
                    </td>
                  </tr>
                )}
                {logs.map((item) => (
                  <tr key={item.id}>
                    <td>{item.event_id}</td>
                    <td>{item.pii_detected ? "yes" : "no"}</td>
                    <td>{item.pii_type || "-"}</td>
                    <td>{item.data_out_violation ? "yes" : "no"}</td>
                    <td>{item.misuse_pattern_detected ? "yes" : "no"}</td>
                    <td>{item.abnormal_usage_spike ? "yes" : "no"}</td>
                    <td>{Number(item.risk_score || 0).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AlertsSecurity;
