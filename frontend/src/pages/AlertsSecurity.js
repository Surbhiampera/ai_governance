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
  const [activeModal, setActiveModal] = useState(null);

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
            {[
              { id: "alerts", label: "Active Alerts", value: summary?.active_alerts || 0 },
              { id: "anomalies", label: "Anomalies", value: summary?.open_anomalies || 0 },
              { id: "pii", label: "PII", value: summary?.total_with_pii || 0 },
              { id: "misuse", label: "Misuse", value: summary?.misuse_events || 0 },
              { id: "dataout", label: "Data Out", value: summary?.data_out_events || 0 },
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                className="pill pill-btn"
                onClick={() => setActiveModal(pill.id)}
              >
                {pill.label}{" "}
                <span className="highlight">{pill.value}</span>
              </button>
            ))}
            <button
              type="button"
              className="pill pill-btn"
              onClick={() => setActiveModal("risk")}
            >
              Risk{" "}
              <span className="highlight">
                {Number(summary?.average_risk_score || 0).toFixed(1)} /{" "}
                {Number(summary?.highest_risk_score || 0).toFixed(1)}
              </span>
            </button>
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
          <div className="feedback-msg" style={{ marginBottom: 12 }}>
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

      {/* ═══════════ SNAPSHOT MODALS ═══════════ */}
      {activeModal && (() => {
        const piiLogs = logs.filter((l) => l.pii_detected);
        const misuseLogs = logs.filter((l) => l.misuse_pattern_detected);
        const dataOutLogs = logs.filter((l) => l.data_out_violation);
        const riskLow = logs.filter((l) => Number(l.risk_score || 0) < 4).length;
        const riskMed = logs.filter((l) => { const s = Number(l.risk_score || 0); return s >= 4 && s < 7; }).length;
        const riskHigh = logs.filter((l) => Number(l.risk_score || 0) >= 7).length;

        const modalTitles = {
          alerts: `Active Alerts · ${summary?.active_alerts || 0}`,
          anomalies: `Open Anomalies · ${summary?.open_anomalies || 0}`,
          pii: `PII Detections · ${summary?.total_with_pii || 0}`,
          misuse: `Misuse Events · ${summary?.misuse_events || 0}`,
          dataout: `Data-Out Violations · ${summary?.data_out_events || 0}`,
          risk: `Risk Summary`,
        };

        const SecurityLogsTable = ({ rows, emptyMsg }) => (
          rows.length ? (
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
                  {rows.map((item) => {
                    const score = Number(item.risk_score || 0);
                    const cls = score >= 7 ? "risk-high" : score >= 4 ? "risk-med" : "risk-low";
                    return (
                      <tr key={item.id}>
                        <td style={{ fontFamily: "monospace", fontSize: 12 }}>{item.event_id}</td>
                        <td><span className={item.pii_detected ? "badge-yes" : "badge-no"}>{item.pii_detected ? "Yes" : "—"}</span></td>
                        <td style={{ color: item.pii_type ? "var(--gray-700)" : "var(--gray-300)" }}>{item.pii_type || "—"}</td>
                        <td><span className={item.data_out_violation ? "badge-yes" : "badge-no"}>{item.data_out_violation ? "Yes" : "—"}</span></td>
                        <td><span className={item.misuse_pattern_detected ? "badge-yes" : "badge-no"}>{item.misuse_pattern_detected ? "Yes" : "—"}</span></td>
                        <td><span className={item.abnormal_usage_spike ? "badge-yes" : "badge-no"}>{item.abnormal_usage_spike ? "Yes" : "—"}</span></td>
                        <td><span className={cls}>{score.toFixed(1)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state">{emptyMsg}</div>
        );

        return (
          <div
            className="modal-backdrop metric-modal-backdrop"
            onClick={() => setActiveModal(null)}
          >
            <div
              className="modal-dialog metric-modal"
              style={{ maxWidth: 860 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <div className="metric-eyebrow">Alerts &amp; Security</div>
                  <h3 style={{ marginTop: 8 }}>{modalTitles[activeModal]}</h3>
                </div>
                <button type="button" className="btn-close" onClick={() => setActiveModal(null)}>×</button>
              </div>

              {activeModal === "alerts" && (
                alerts.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Severity</th>
                          <th>Message</th>
                          <th>Threshold</th>
                          <th>Actual</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alerts.map((a) => (
                          <tr key={a.id}>
                            <td>{a.alert_type}</td>
                            <td><span className={`status-pill ${a.severity}`}>{a.severity}</span></td>
                            <td>{a.message}</td>
                            <td>{a.threshold_value ?? "—"}</td>
                            <td>{a.actual_value ?? "—"}</td>
                            <td><span className={`status-pill ${a.status}`}>{a.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="empty-state">No alerts.</div>
              )}

              {activeModal === "anomalies" && (
                anomalies.length ? (
                  <div className="list-grid">
                    {anomalies.map((item) => (
                      <div key={item.id} className="list-item">
                        <strong>{item.anomaly_type}</strong>
                        <div className="list-meta">
                          <span className={`status-pill ${item.severity}`}>{item.severity}</span>{"  "}{item.message}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="empty-state">No open anomalies.</div>
              )}

              {activeModal === "pii" && (
                <SecurityLogsTable rows={piiLogs} emptyMsg="No PII detections." />
              )}

              {activeModal === "misuse" && (
                <SecurityLogsTable rows={misuseLogs} emptyMsg="No misuse events." />
              )}

              {activeModal === "dataout" && (
                <SecurityLogsTable rows={dataOutLogs} emptyMsg="No data-out violations." />
              )}

              {activeModal === "risk" && (
                <>
                  <div className="metric-modal-grid" style={{ marginBottom: 18 }}>
                    <div className="tool-cost-chip">
                      <strong>Avg Risk Score</strong>
                      <div>{Number(summary?.average_risk_score || 0).toFixed(1)}</div>
                    </div>
                    <div className="tool-cost-chip">
                      <strong>Highest Risk Score</strong>
                      <div>{Number(summary?.highest_risk_score || 0).toFixed(1)}</div>
                    </div>
                    <div className="tool-cost-chip">
                      <strong>Low Risk</strong>
                      <div><span className="risk-low">{riskLow} event{riskLow !== 1 ? "s" : ""}</span></div>
                    </div>
                    <div className="tool-cost-chip">
                      <strong>Medium Risk</strong>
                      <div><span className="risk-med">{riskMed} event{riskMed !== 1 ? "s" : ""}</span></div>
                    </div>
                    <div className="tool-cost-chip">
                      <strong>High Risk</strong>
                      <div><span className="risk-high">{riskHigh} event{riskHigh !== 1 ? "s" : ""}</span></div>
                    </div>
                    <div className="tool-cost-chip">
                      <strong>Total Events Scored</strong>
                      <div>{logs.length}</div>
                    </div>
                  </div>
                  {logs.length > 0 && (
                    <>
                      <div className="metric-eyebrow" style={{ marginBottom: 12 }}>All Events by Risk</div>
                      <SecurityLogsTable rows={[...logs].sort((a, b) => Number(b.risk_score || 0) - Number(a.risk_score || 0))} emptyMsg="No logs." />
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ═══════════ SECURITY SECTION ═══════════ */}
      <section className="two-column">
        <div className="panel">
          <div className="section-head">
            <div>
              <h3>
                Open Anomalies{" "}
                {anomalies.length > 0 && (
                  <span className="status-pill open" style={{ fontSize: 11, padding: "3px 9px", verticalAlign: "middle" }}>
                    {anomalies.length}
                  </span>
                )}
              </h3>
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
              <h3>
                Security Logs{" "}
                {logs.length > 0 && (
                  <span className="status-pill" style={{ fontSize: 11, padding: "3px 9px", verticalAlign: "middle" }}>
                    {logs.length}
                  </span>
                )}
              </h3>
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
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{item.event_id}</td>
                    <td>
                      <span className={item.pii_detected ? "badge-yes" : "badge-no"}>
                        {item.pii_detected ? "Yes" : "—"}
                      </span>
                    </td>
                    <td style={{ color: item.pii_type ? "var(--gray-700)" : "var(--gray-300)" }}>
                      {item.pii_type || "—"}
                    </td>
                    <td>
                      <span className={item.data_out_violation ? "badge-yes" : "badge-no"}>
                        {item.data_out_violation ? "Yes" : "—"}
                      </span>
                    </td>
                    <td>
                      <span className={item.misuse_pattern_detected ? "badge-yes" : "badge-no"}>
                        {item.misuse_pattern_detected ? "Yes" : "—"}
                      </span>
                    </td>
                    <td>
                      <span className={item.abnormal_usage_spike ? "badge-yes" : "badge-no"}>
                        {item.abnormal_usage_spike ? "Yes" : "—"}
                      </span>
                    </td>
                    <td>
                      {(() => {
                        const score = Number(item.risk_score || 0);
                        const cls = score >= 7 ? "risk-high" : score >= 4 ? "risk-med" : "risk-low";
                        return <span className={cls}>{score.toFixed(1)}</span>;
                      })()}
                    </td>
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
