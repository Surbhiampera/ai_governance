import axios from 'axios';

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
  timeout: 5000,
});

export const getTodaySummary = () => API.get('/summary/today');
export const getDailySummary = (start, end) => API.get(`/summary/daily?start=${start}&end=${end}`);
export const getToolsUsage = () => API.get('/tools/usage');
export const getAlerts = () => API.get('/alerts/');
export const getTools = () => API.get('/tools/');
export const getSecuritySummary = () => API.get('/security/summary');
export const postTelemetryEvent = (data) => API.post('/telemetry/event', data);
export const registerTool = (data) => API.post('/tools/register', data);
export const resolveAlert = (id) => API.patch(`/alerts/${id}/resolve`);

// Organizations
export const getOrganizations = () => API.get('/organizations/');
export const getOrganization = (id) => API.get(`/organizations/${id}`);
export const createOrganization = (data) => API.post('/organizations/', data);
export const updateOrganization = (id, data) => API.put(`/organizations/${id}`, data);
export const deleteOrganization = (id) => API.delete(`/organizations/${id}`);

// Projects
export const getProjects = (orgId) => API.get('/projects/', { params: { org_id: orgId || undefined } });
export const getProject = (id) => API.get(`/projects/${id}`);
export const createProject = (data) => API.post('/projects/', data);
export const updateProject = (id, data) => API.put(`/projects/${id}`, data);
export const deleteProject = (id) => API.delete(`/projects/${id}`);

// Budgets
export const getBudgets = (orgId) => API.get('/budgets/', { params: { org_id: orgId || undefined } });
export const createBudget = (data) => API.post('/budgets/', data);
export const updateBudget = (id, data) => API.put(`/budgets/${id}`, data);
export const deleteBudget = (id) => API.delete(`/budgets/${id}`);

// API Keys
export const getApiKeys = (orgId, projectId) => API.get('/api-keys/', { params: { org_id: orgId || undefined, project_id: projectId || undefined } });
export const createApiKey = (data) => API.post('/api-keys/', data);
export const deleteApiKey = (id) => API.delete(`/api-keys/${id}`);

// Monthly Summary
export const getMonthlySummary = (orgId, projectId) => API.get('/summary/monthly', { params: { org_id: orgId || undefined, project_id: projectId || undefined } });

// Trends
export const getUsageTrends = (orgId, days) => API.get('/summary/trends', { params: { org_id: orgId || undefined, days: days || 30 } });

// Security Logs
export const getSecurityLogs = (piiDetected) => API.get('/security/logs', { params: { pii_detected: piiDetected } });

// Workers
export const triggerDailyAggregation = () => API.post('/workers/daily-aggregation/sync');
export const triggerMonthlyAggregation = () => API.post('/workers/monthly-aggregation/sync');

export default API;
