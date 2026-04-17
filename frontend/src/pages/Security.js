import React, { useState, useEffect } from 'react';
import { getSecuritySummary, getSecurityLogs } from '../api';

function Security() {
  const [data, setData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [piiFilter, setPiiFilter] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [summaryRes, logsRes] = await Promise.allSettled([
        getSecuritySummary(),
        getSecurityLogs(piiFilter === '' ? undefined : piiFilter === 'true'),
      ]);
      if (summaryRes.status === 'fulfilled') setData(summaryRes.value.data);
      if (logsRes.status === 'fulfilled') setLogs(logsRes.value.data || []);
    } catch (err) {
      setError(err.code === 'ECONNABORTED' || err.message?.includes('Network')
        ? 'Cannot connect to backend. Make sure the server is running on port 8000.'
        : err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [piiFilter]);

  if (loading) return <div className="loading">Loading security data...</div>;
  if (error) return <div className="error-message">Error: {error}</div>;

  const totalScanned = data?.total_events ?? 0;
  const piiCount = data?.total_with_pii ?? 0;
  const avgRisk = Number(data?.average_risk_score) || 0;

  const riskColor = avgRisk > 70 ? '#d63031' : avgRisk > 40 ? '#fdcb6e' : '#00b894';
  const riskLabel = avgRisk > 70 ? 'High Risk' : avgRisk > 40 ? 'Medium Risk' : 'Low Risk';

  return (
    <div>
      <h1 className="page-title">Security</h1>

      <div className="metrics-grid">
        <div className="metric-card info">
          <span className="metric-icon">🔍</span>
          <span className="metric-label">Events Scanned</span>
          <span className="metric-value">{totalScanned}</span>
        </div>
        <div className="metric-card warning">
          <span className="metric-icon">⚠️</span>
          <span className="metric-label">PII Detected</span>
          <span className="metric-value">{piiCount}</span>
        </div>
        <div className="metric-card danger">
          <span className="metric-icon">📊</span>
          <span className="metric-label">Avg Risk Score</span>
          <span className="metric-value">{avgRisk.toFixed(1)}</span>
        </div>
        <div className="metric-card success">
          <span className="metric-icon">🛡️</span>
          <span className="metric-label">Security Score</span>
          <span className="metric-value">{(100 - avgRisk).toFixed(1)}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Risk Assessment</div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: riskColor, marginBottom: '8px' }}>
          {riskLabel} — {avgRisk.toFixed(1)} / 100
        </div>
        <div className="risk-bar-container">
          <div className="risk-bar-bg">
            <div
              className="risk-bar-fill"
              style={{ width: `${Math.min(avgRisk, 100)}%`, background: riskColor }}
            />
          </div>
          <div className="risk-label">
            <span>0 — Safe</span>
            <span>100 — Critical</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Data Security Logs</div>
        <div className="form-group" style={{ maxWidth: '200px', marginBottom: '16px' }}>
          <select value={piiFilter} onChange={(e) => setPiiFilter(e.target.value)}>
            <option value="">All Events</option>
            <option value="true">PII Detected</option>
            <option value="false">No PII</option>
          </select>
        </div>
        {Array.isArray(logs) && logs.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Event ID</th>
                  <th>PII Detected</th>
                  <th>PII Type</th>
                  <th>Masking</th>
                  <th>Risk Score</th>
                  <th>Data In (MB)</th>
                  <th>Data Out (MB)</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{log.event_id || '—'}</td>
                    <td>
                      <span className={`badge ${log.pii_detected ? 'badge-danger' : 'badge-success'}`}>
                        {log.pii_detected ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>{log.pii_type || '—'}</td>
                    <td>
                      <span className={`badge ${log.masking_applied ? 'badge-success' : 'badge-danger'}`}>
                        {log.masking_applied ? 'Applied' : 'Missing'}
                      </span>
                    </td>
                    <td>{Number(log.risk_score || 0).toFixed(1)}</td>
                    <td>{Number(log.data_in_mb || 0).toFixed(4)}</td>
                    <td>{Number(log.data_out_mb || 0).toFixed(4)}</td>
                    <td>{log.created_at ? new Date(log.created_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No security logs found</div>
        )}
      </div>
    </div>
  );
}

export default Security;
