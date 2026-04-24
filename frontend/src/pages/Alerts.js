import React, { useEffect, useState } from "react";
import { getAlerts, resolveAlert } from "../api";

function Alerts() {
  const [status, setStatus] = useState("active");
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = async (nextStatus = status) => {
    setLoading(true);
    try {
      const response = await getAlerts(nextStatus === "all" ? undefined : nextStatus);
      setAlerts(response.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(status);
  }, [status]);

  const handleResolve = async (id) => {
    await resolveAlert(id);
    setMessage(`Alert ${id} resolved.`);
    await load(status);
  };

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <h2>Governance alerts triggered by system controls and custom rules.</h2>
          <p>
            Every alert can be traced back to a security signal, anomaly detector,
            budget threshold, or rule-engine condition for fast incident review.
          </p>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <h2>Alert Filters</h2>
              <p>Switch between active investigation items and resolved history.</p>
            </div>
          </div>

          <div className="action-row">
            <button type="button" className="btn btn-primary" onClick={() => setStatus("active")}>
              Active
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setStatus("resolved")}>
              Resolved
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setStatus("all")}>
              All
            </button>
          </div>

          {message ? <div className="list-meta" style={{ marginTop: 16 }}>{message}</div> : null}
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Alert Stream</h3>
            <p>Source, threshold, observed value, and lifecycle state for every triggered alert.</p>
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading alerts...</div>
        ) : (
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
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>{alert.id}</td>
                    <td>{alert.alert_type}</td>
                    <td>
                      <span className={`status-pill ${alert.severity}`}>{alert.severity}</span>
                    </td>
                    <td>{alert.telemetry_id ?? "-"}</td>
                    <td>{alert.message}</td>
                    <td>{alert.threshold_value ?? "-"}</td>
                    <td>{alert.actual_value ?? "-"}</td>
                    <td>
                      <span className={`status-pill ${alert.status}`}>{alert.status}</span>
                    </td>
                    <td>
                      {alert.status === "active" ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleResolve(alert.id)}
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
        )}
      </section>
    </div>
  );
}

export default Alerts;
