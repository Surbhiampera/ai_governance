import axios from "axios";

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:8000",
  timeout: 8000,
});

export const getGovernanceOverview = (orgId, days = 14) =>
  API.get("/summary/overview", {
    params: { org_id: orgId || undefined, days },
  });

export const getTodaySummary = () => API.get("/summary/today");
export const getDailySummary = (start, end, orgId) =>
  API.get("/summary/daily", {
    params: { start, end, org_id: orgId || undefined },
  });
export const getMonthlySummary = (orgId, projectId) =>
  API.get("/summary/monthly", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });
export const getUsageTrends = (orgId, days) =>
  API.get("/summary/trends", {
    params: { org_id: orgId || undefined, days: days || 30 },
  });

export const getAlerts = (status) =>
  API.get("/alerts/", { params: { status: status || undefined } });
export const resolveAlert = (id) => API.patch(`/alerts/${id}/resolve`);

export const getSecuritySummary = () => API.get("/security/summary");
export const getSecurityLogs = (piiDetected, misuseDetected) =>
  API.get("/security/logs", {
    params: {
      pii_detected: piiDetected,
      misuse_detected: misuseDetected,
    },
  });
export const getUsageAnomalies = (status = "open") =>
  API.get("/security/anomalies", { params: { status } });

export const getTelemetryLogs = (params) =>
  API.get("/telemetry/logs", { params });
export const getTrace = (eventId) => API.get(`/telemetry/traces/${eventId}`);
export const postTelemetryEvent = (data) => API.post("/telemetry/event", data);
export const postTelemetryBatch = (events) =>
  API.post("/telemetry/events/batch", { events });

export const getTools = () => API.get("/tools/");
export const registerTool = (data) => API.post("/tools/register", data);
export const getToolsUsage = () => API.get("/tools/usage");
export const getConnectors = () => API.get("/tools/connectors");
export const createConnector = (data) => API.post("/tools/connectors", data);

export const getRules = () => API.get("/governance/rules");
export const createRule = (data) => API.post("/governance/rules", data);

export const getOrganizations = () => API.get("/organizations/");
export const getOrganization = (id) => API.get(`/organizations/${id}`);
export const createOrganization = (data) => API.post("/organizations/", data);
export const updateOrganization = (id, data) =>
  API.put(`/organizations/${id}`, data);
export const deleteOrganization = (id) => API.delete(`/organizations/${id}`);

export const getProjects = (orgId) =>
  API.get("/projects/", { params: { org_id: orgId || undefined } });
export const getProject = (id) => API.get(`/projects/${id}`);
export const createProject = (data) => API.post("/projects/", data);
export const updateProject = (id, data) => API.put(`/projects/${id}`, data);
export const deleteProject = (id) => API.delete(`/projects/${id}`);

export const getBudgets = (orgId) =>
  API.get("/budgets/", { params: { org_id: orgId || undefined } });
export const createBudget = (data) => API.post("/budgets/", data);
export const updateBudget = (id, data) => API.put(`/budgets/${id}`, data);
export const deleteBudget = (id) => API.delete(`/budgets/${id}`);

export const getApiKeys = (orgId, projectId) =>
  API.get("/api-keys/", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });
export const createApiKey = (data) => API.post("/api-keys/", data);
export const deleteApiKey = (id) => API.delete(`/api-keys/${id}`);

export const triggerDailyAggregation = () =>
  API.post("/workers/daily-aggregation/sync");
export const triggerMonthlyAggregation = () =>
  API.post("/workers/monthly-aggregation/sync");
export const triggerAnomalyDetection = () =>
  API.post("/workers/anomaly-detection/sync");
export const triggerAlertScan = () => API.post("/workers/alert-scan/sync");

export default API;
