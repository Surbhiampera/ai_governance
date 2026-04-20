import React, { useEffect, useState } from "react";
import { getSecurityLogs, getSecuritySummary, getUsageAnomalies } from "../api";

function Security() {
  const [summary, setSummary] = useState(null);
  const [logs, setLogs] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [summaryRes, logsRes, anomaliesRes] = await Promise.all([
        getSecuritySummary(),
        getSecurityLogs(),
        getUsageAnomalies("open"),
      ]);
      setSummary(summaryRes.data);
      setLogs(logsRes.data || []);
      setAnomalies(anomaliesRes.data || []);
      setLoading(false);
    };

    load().catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading">Loading security layer...</div>;
  }

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <h2>Security monitoring for risky prompts, PII exposure, and misuse patterns.</h2>
          <p>
            Risk scores are attached to each event, with anomaly and misuse detection
            feeding the alerting and governance layers automatically.
          </p>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h2>Security Snapshot</h2>
              <p>Current state of risk, violations, and abnormal activity.</p>
            </div>
          </div>

          <div className="mini-grid">
            <div className="list-item">
              <strong>Total Security Events</strong>
              <div className="list-meta">{summary?.total_events || 0}</div>
            </div>
            <div className="list-item">
              <strong>PII Detections</strong>
              <div className="list-meta">{summary?.total_with_pii || 0}</div>
            </div>
            <div className="list-item">
              <strong>Misuse Patterns</strong>
              <div className="list-meta">{summary?.misuse_events || 0}</div>
            </div>
            <div className="list-item">
              <strong>Data Out Violations</strong>
              <div className="list-meta">{summary?.data_out_events || 0}</div>
            </div>
            <div className="list-item">
              <strong>Average Risk</strong>
              <div className="list-meta">{Number(summary?.average_risk_score || 0).toFixed(1)}</div>
            </div>
            <div className="list-item">
              <strong>Highest Risk</strong>
              <div className="list-meta">{Number(summary?.highest_risk_score || 0).toFixed(1)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-head">
            <div>
              <h3>Open Anomalies</h3>
              <p>Usage spikes and suspicious changes identified by background detection.</p>
            </div>
          </div>
          <div className="list-grid">
            {anomalies.length ? (
              anomalies.map((item) => (
                <div key={item.id} className="list-item">
                  <strong>{item.anomaly_type}</strong>
                  <div className="list-meta">
                    <span className={`status-pill ${item.severity}`}>{item.severity}</span>
                    {"  "} {item.message}
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
              <h3>Security Logs</h3>
              <p>Event-level records for PII, data out, misuse, and masking decisions.</p>
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

export default Security;
