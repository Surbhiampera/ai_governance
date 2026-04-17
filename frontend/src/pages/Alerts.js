import React, { useState, useEffect, useCallback } from 'react';
import { getAlerts, resolveAlert } from '../api';

function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resolving, setResolving] = useState(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await getAlerts();
      setAlerts(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (err) {
      setError(err.code === 'ECONNABORTED' || err.message?.includes('Network')
        ? 'Cannot connect to backend. Make sure the server is running on port 8000.'
        : err.response?.data?.detail || err.message);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const handleResolve = async (id) => {
    setResolving(id);
    try {
      await resolveAlert(id);
      fetchAlerts();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setResolving(null);
    }
  };

  const severityClass = (severity) => {
    const map = { critical: 'badge-critical', high: 'badge-high', medium: 'badge-medium', low: 'badge-low' };
    return map[severity] || 'badge-low';
  };

  if (loading) return <div className="loading">Loading alerts...</div>;

  return (
    <div>
      <h1 className="page-title">Alerts</h1>

      {error && <div className="error-message">{error}</div>}

      <div className="card">
        <div className="card-title">All Alerts</div>
        {Array.isArray(alerts) && alerts.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Created At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id || alert._id}>
                    <td><strong>{alert.tool_name}</strong></td>
                    <td>{alert.alert_type}</td>
                    <td>
                      <span className={`badge ${severityClass(alert.severity)}`}>
                        {alert.severity}
                      </span>
                    </td>
                    <td>{alert.message}</td>
                    <td>
                      <span className={`badge ${alert.status === 'resolved' ? 'badge-resolved' : 'badge-active'}`}>
                        {alert.status}
                      </span>
                    </td>
                    <td>{alert.created_at ? new Date(alert.created_at).toLocaleString() : '—'}</td>
                    <td>
                      {alert.status === 'active' && (
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleResolve(alert.id || alert._id)}
                          disabled={resolving === (alert.id || alert._id)}
                        >
                          {resolving === (alert.id || alert._id) ? 'Resolving...' : 'Resolve'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No alerts found</div>
        )}
      </div>
    </div>
  );
}

export default Alerts;
