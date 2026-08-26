import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api-proxy",
  timeout: 120000,
});

// Retry up to 3 times on 503 (backend restarting / proxy not yet connected)
API.interceptors.response.use(null, async (error) => {
  const config = error.config;
  if (!config) return Promise.reject(error);

  const status = error.response?.status;
  if (status !== 503) return Promise.reject(error);

  config._retryCount = (config._retryCount || 0) + 1;
  if (config._retryCount > 3) return Promise.reject(error);

  await new Promise((res) => setTimeout(res, config._retryCount * 1000));
  return API(config);
});

// ─────────────────────── Summary / Dashboard ───────────────────────
export const getGovernanceOverview = (orgId, days = 14, range = "all") =>
  API.get("/summary/overview", {
    params: { org_id: orgId || undefined, days, range: range || undefined },
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

// ─────────────────────── Alerts ───────────────────────
export const getAlerts = (status) =>
  API.get("/alerts/", { params: { status: status || undefined } });
export const resolveAlert = (id) => API.patch(`/alerts/${id}/resolve`);

// ─────────────────────── Security ───────────────────────
export const getSecuritySummary = (startDate) =>
  API.get("/security/summary", {
    params: { start_date: startDate || undefined },
  });
export const getSecurityLogs = (piiDetected, misuseDetected, startDate) =>
  API.get("/security/logs", {
    params: {
      pii_detected: piiDetected,
      misuse_detected: misuseDetected,
      start_date: startDate || undefined,
    },
  });
export const getUsageAnomalies = (status = "open", startDate) =>
  API.get("/security/anomalies", {
    params: { status, start_date: startDate || undefined },
  });

// Combined alerts & security
export const getAlertsSecurity = (status, orgId, projectId, startDate) =>
  API.get("/alerts-security/alerts", {
    params: {
      status: status || undefined,
      org_id: orgId || undefined,
      project_id: projectId || undefined,
      start_date: startDate || undefined,
    },
  });
export const resolveAlertCombined = (id) =>
  API.patch(`/alerts-security/alerts/${id}/resolve`);
export const getSecuritySummaryCombined = (orgId, projectId, startDate) =>
  API.get("/alerts-security/summary", {
    params: {
      org_id: orgId || undefined,
      project_id: projectId || undefined,
      start_date: startDate || undefined,
    },
  });
export const getSecurityLogsCombined = (
  piiDetected,
  misuseDetected,
  orgId,
  projectId,
  startDate,
) =>
  API.get("/alerts-security/logs", {
    params: {
      pii_detected: piiDetected,
      misuse_detected: misuseDetected,
      org_id: orgId || undefined,
      project_id: projectId || undefined,
      start_date: startDate || undefined,
    },
  });
export const getAnomaliesCombined = (
  status = "open",
  orgId,
  projectId,
  startDate,
) =>
  API.get("/alerts-security/anomalies", {
    params: {
      status,
      org_id: orgId || undefined,
      project_id: projectId || undefined,
      start_date: startDate || undefined,
    },
  });
export const resolveAnomaly = (id) =>
  API.patch(`/alerts-security/anomalies/${id}/resolve`);
export const getOpenAnomalyCount = (orgId, projectId) =>
  API.get("/alerts-security/anomalies/open-count", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });

// ─────────────────────── Telemetry / Tracing ───────────────────────
export const getTelemetryLogs = (params) =>
  API.get("/telemetry/logs", { params });
export const getTrace = (eventId) => API.get(`/telemetry/traces/${eventId}`);
export const postTelemetryEvent = (data) => API.post("/telemetry/event", data);
export const postTelemetryBatch = (events) =>
  API.post("/telemetry/events/batch", { events });
export const updateTelemetryEvent = (eventId, data) =>
  API.put(`/telemetry/event/${eventId}`, data);
export const deleteTelemetryEvent = (eventId) =>
  API.delete(`/telemetry/event/${eventId}`);
export const trackEvent = (data) => API.post("/telemetry/track", data);

// ─────────────────────── Decorator Framework ───────────────────────
export const getDecoratorStats = (orgId) =>
  API.get("/decorator/stats", { params: { org_id: orgId || undefined } });
export const getDecoratorRegistrations = (params) =>
  API.get("/decorator/registrations", { params });
export const getDecoratorInventory = (params) =>
  API.get("/decorator/inventory", { params });
export const getDecoratorInventoryByTool = (toolName, orgId) =>
  API.get(`/decorator/inventory/${toolName}`, {
    params: { org_id: orgId || undefined },
  });
export const getDecoratorUsage = (params) =>
  API.get("/decorator/usage", { params });
export const getDecoratorLogs = (params) =>
  API.get("/decorator/logs", { params });

// Super Admin
export const getSuperAdminLogs = (params) =>
  API.get("/telemetry/admin/logs", { params });
export const getSuperAdminAggregate = (params) =>
  API.get("/telemetry/admin/aggregate", { params });
export const getSuperAdminRegisteredTools = (params) =>
  API.get("/telemetry/admin/registered-tools", { params });
export const getSuperAdminInsights = (params) =>
  API.get("/telemetry/admin/insights", { params });
export const getAdminPIIDetail = (eventId) =>
  API.get(`/telemetry/admin/pii-detail/${eventId}`);

// ─────────────────────── Control (vendor-agnostic ingestion) ───────────────────────
export const controlIngest = (data) => API.post("/control/ingest", data);
export const controlIngestBatch = (events) =>
  API.post("/control/ingest/batch", { events });
export const controlIngestTrace = (data) =>
  API.post("/control/ingest/trace", data);
export const getControlQuota = (orgId, projectId) =>
  API.get(`/control/quota/${orgId}`, {
    params: { project_id: projectId || undefined },
  });
export const getProjectTrace = (projectId, orgId) =>
  API.get(`/control/project/${projectId}/trace`, {
    params: { org_id: orgId || undefined },
  });
export const getControlTraceDetail = (traceId, orgId) =>
  API.get(`/control/trace/${traceId}`, {
    params: { org_id: orgId || undefined },
  });
export const getControlCostBreakdown = (orgId, projectId) =>
  API.get("/control/cost-breakdown", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });
export const getProjectCostBreakdown = (projectId, orgId) =>
  API.get("/costs/project-breakdown", {
    params: { project_id: projectId, org_id: orgId || undefined },
  });
export const getNotificationStatus = () =>
  API.get("/control/notifications/status");

// ─────────────────────── Tools / Models ───────────────────────
export const getTools = () => API.get("/tools");
export const registerTool = (data) => API.post("/tools/register", data);
export const assignToolProject = (toolName, projectId) =>
  API.patch(`/tools/${encodeURIComponent(toolName)}/project`, null, {
    params: { project_id: projectId || undefined },
  });
export const getToolsUsage = () => API.get("/tools/usage");
export const getConnectors = () => API.get("/tools/connectors");
export const createConnector = (data) => API.post("/tools/connectors", data);
export const updateConnector = (id, data) =>
  API.patch(`/tools/connectors/${id}`, data);
export const deleteConnector = (id) => API.delete(`/tools/connectors/${id}`);
export const getConnectorSyncLogs = (connectorId, limit = 50) =>
  API.get("/tools/connectors/sync-logs", {
    params: { connector_id: connectorId || undefined, limit },
  });
export const triggerConnectorSync = (id) =>
  API.post(`/tools/connectors/${id}/trigger-sync`);

// Response fields: model_name, provider, input_cost_per_1k, output_cost_per_1k, currency
export const getModels = () => API.get("/models/");
// registerModel removed — POST /models/register returns 404; use POST /pricing instead

// Response: array of { model_name, provider, category, input_per_1m, output_per_1m, context_window, max_output_tokens }
export const getModelCatalog = () => API.get("/models/catalog");

// ─────────────────────── Governance rules ───────────────────────
export const getRules = (orgId) =>
  API.get("/governance/rules", { params: { org_id: orgId || undefined } });
export const createRule = (data) => API.post("/governance/rules", data);

// ─────────────────────── Organizations / Projects ───────────────────────
export const getOrganizations = () => API.get("/organizations");
export const getOrganization = (id) => API.get(`/organizations/${id}`);
export const createOrganization = (data) =>
  API.post("/organizations", data, {
    headers: { "Cache-Control": "no-cache" },
  });
export const updateOrganization = (id, data) =>
  API.put(`/organizations/${id}`, data);
export const deleteOrganization = (id) => API.delete(`/organizations/${id}`);

// Response: { allowed_models: string[], default_model: string | null }
export const getOrganizationModels = (id) =>
  API.get(`/organizations/${id}/models`);
export const updateOrganizationModels = (id, data) =>
  API.put(`/organizations/${id}/models`, data);

export const getProjects = (orgId) =>
  API.get("/projects", { params: { org_id: orgId || undefined } });
export const getProject = (id) => API.get(`/projects/${id}`);
export const createProject = (data) =>
  API.post("/projects", data, {
    headers: { "Cache-Control": "no-cache" },
  });
export const updateProject = (id, data) => API.put(`/projects/${id}`, data);
export const deleteProject = (id) => API.delete(`/projects/${id}`);

// Response: { allowed_models: string[], default_model: string | null }
export const getProjectModels = (id) => API.get(`/projects/${id}/models`);
export const updateProjectModels = (id, data) =>
  API.put(`/projects/${id}/models`, data);

// ─────────────────────── Budgets / API Keys ───────────────────────
export const getBudgets = (orgId) =>
  API.get("/budgets/", { params: { org_id: orgId || undefined } });
export const getBudgetUtilization = (orgId) =>
  API.get("/budgets/utilization", { params: { org_id: orgId || undefined } });

export const getRateLimits = (orgId) =>
  API.get("/rate-limits/", { params: { org_id: orgId || undefined } });
export const createRateLimit = (data) => API.post("/rate-limits/", data);
export const updateRateLimit = (id, data) =>
  API.put(`/rate-limits/${id}`, data);
export const deleteRateLimit = (id) => API.delete(`/rate-limits/${id}`);
export const createBudget = (data) => API.post("/budgets/", data);
export const updateBudget = (id, data) => API.put(`/budgets/${id}`, data);
export const deleteBudget = (id) => API.delete(`/budgets/${id}`);

export const getApiKeys = (orgId, projectId) =>
  API.get("/api-keys/", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });
export const createApiKey = (data) => API.post("/api-keys/", data);
export const deleteApiKey = (id) => API.delete(`/api-keys/${id}`);

// ─────────────────────── Costs ───────────────────────
export const getCostByOrg = () => API.get("/costs/by-org");
export const getCostByProject = (orgId) =>
  API.get("/costs/by-project", { params: { org_id: orgId || undefined } });
export const getCostDaily = (days, orgId, projectId) =>
  API.get("/costs/daily", {
    params: {
      days,
      org_id: orgId || undefined,
      project_id: projectId || undefined,
    },
  });
export const getCostMonthly = (orgId, projectId) =>
  API.get("/costs/monthly", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });
export const getCostByModel = (orgId, projectId) =>
  API.get("/costs/by-model", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });
export const getCostTotals = () => API.get("/costs/totals");
export const getCostByTool = (orgId, projectId) =>
  API.get("/costs/by-tool", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });
export const getCostByProvider = (orgId, projectId) =>
  API.get("/costs/by-provider", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });
export const getCostByExecutionType = (orgId, projectId) =>
  API.get("/costs/by-execution-type", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });
export const getCostByServiceType = (orgId, projectId) =>
  API.get("/costs/by-service-type", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });
export const getCostBreakdown = (orgId, projectId) =>
  API.get("/costs/breakdown", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });
export const getCostPerToolDaily = (days, orgId, projectId) =>
  API.get("/costs/per-tool-daily", {
    params: {
      days: days || 14,
      org_id: orgId || undefined,
      project_id: projectId || undefined,
    },
  });
export const getCostSpendCapStatus = (orgId, projectId) =>
  API.get("/costs/spend-cap-status", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });

// ─────────────────────── Pricing ───────────────────────
export const getModelPricing = () => API.get("/pricing/");
export const createModelPricing = (data) => API.post("/pricing/", data);
export const deleteModelPricing = (id) => API.delete(`/pricing/${id}`);

// ─────────────────────── Lookups (dynamic dropdowns) ───────────────────────
export const getTracingOrgs = () => API.get("/lookups/tracing-orgs");
export const getTracingProjects = (orgId) =>
  API.get("/lookups/tracing-projects", {
    params: { org_id: orgId || undefined },
  });
export const getLookupAuthTypes = () => API.get("/lookups/auth-types");
export const getLookupIngestionModes = () =>
  API.get("/lookups/ingestion-modes");
export const getLookupConnectorStatuses = () =>
  API.get("/lookups/connector-statuses");
export const getLookupToolTypes = () => API.get("/lookups/tool-types");
export const getLookupProviders = () => API.get("/lookups/providers");
export const getLookupRuleMetrics = () => API.get("/lookups/rule-metrics");
export const getLookupRuleScopes = () => API.get("/lookups/rule-scopes");
export const getLookupRuleOperators = () => API.get("/lookups/rule-operators");
export const getLookupSeverities = () => API.get("/lookups/severities");
export const getLookupScopeReferences = (scope) =>
  API.get("/lookups/scope-references", { params: { scope } });
export const getLookupEventStatuses = () => API.get("/lookups/event-statuses");
export const getLookupPlanTypes = () => API.get("/lookups/plan-types");
export const getLookupEnvironments = () => API.get("/lookups/environments");
export const getLookupBudgetPeriods = () => API.get("/lookups/budget-periods");

// Workers (on-demand triggers — scheduler runs these automatically)
export const triggerDailyAggregation = () =>
  API.post("/workers/daily-aggregation/sync");
export const triggerMonthlyAggregation = () =>
  API.post("/workers/monthly-aggregation/sync");
export const triggerAnomalyDetection = () =>
  API.post("/workers/anomaly-detection/sync");
export const triggerAlertScan = () => API.post("/workers/alert-scan/sync");
export const triggerConnectorPoll = () =>
  API.post("/workers/connector-poll/sync");

// ─────────────────────── Proxy — Governance Keys ───────────────────────
export const listGovernanceKeys = (orgId) =>
  API.get("/governance-keys/", { params: { org_id: orgId } });
export const createGovernanceKey = (payload) =>
  API.post("/governance-keys/", payload);
export const revokeGovernanceKey = (keyId) =>
  API.delete(`/governance-keys/${keyId}`);
export const rotateGovernanceKey = (keyId) =>
  API.post(`/governance-keys/${keyId}/rotate`);

// ─────────────────────── Proxy — Provider Configs ──────────────────────
export const listProviderConfigs = (orgId) =>
  API.get(`/proxy/provider-configs/${orgId}`);
export const createProviderConfig = (payload) =>
  API.post("/proxy/provider-configs", payload);
export const deleteProviderConfig = (configId) =>
  API.delete(`/proxy/provider-configs/${configId}`);

// ─────────────────────── Proxy — PII Policies ──────────────────────────
export const listPiiPolicies = (orgId) =>
  API.get(`/proxy/pii-policies/${orgId}`);
export const createPiiPolicy = (payload) =>
  API.post("/proxy/pii-policies", payload);

// ─────────────────────── Proxy — Reporting (proxy-only data) ────────────
// `days` may be the string "all" (from an "All" range control) — in that case
// we omit `days` and send `period=all` instead, which overrides it server-side.
const daysOrPeriod = (days) => ({
  days: days === "all" ? undefined : days,
  period: days === "all" ? "all" : undefined,
});

export const getProxyOverview = (
  orgId,
  days = 30,
  projectId,
  provider,
  modelName,
) =>
  API.get("/proxy/stats/overview", {
    params: {
      org_id: orgId || undefined,
      ...daysOrPeriod(days),
      project_id: projectId || undefined,
      provider: provider || undefined,
      model_name: modelName || undefined,
    },
  });
export const getProxyTrends = (
  orgId,
  days = 30,
  projectId,
  provider,
  modelName,
) =>
  API.get("/proxy/stats/trends", {
    params: {
      org_id: orgId || undefined,
      ...daysOrPeriod(days),
      project_id: projectId || undefined,
      provider: provider || undefined,
      model_name: modelName || undefined,
    },
  });
export const getProxyByProject = (orgId, days = 30, projectId) =>
  API.get("/costs/by-project", {
    params: {
      org_id: orgId || undefined,
      ...daysOrPeriod(days),
      project_id: projectId || undefined,
    },
  });
export const getProxyByModel = (
  orgId,
  days = 30,
  projectId,
  provider,
  modelName,
) =>
  API.get("/costs/by-model", {
    params: {
      org_id: orgId || undefined,
      ...daysOrPeriod(days),
      project_id: projectId || undefined,
      provider: provider || undefined,
      model_name: modelName || undefined,
    },
  });
export const getProxyRequests = (params) =>
  API.get("/proxy/v1/requests", { params });
export const getProxyRequestPiiDetail = (requestId) =>
  API.get(`/proxy/v1/requests/${requestId}/pii-detail`);
export const getProxyPiiSummary = (
  orgId,
  days = 30,
  projectId,
  provider,
  modelName,
) =>
  API.get("/proxy/stats/pii", {
    params: {
      org_id: orgId || undefined,
      ...daysOrPeriod(days),
      project_id: projectId || undefined,
      provider: provider || undefined,
      model_name: modelName || undefined,
    },
  });
export const getProxyByProjectModel = (orgId, days = 30) =>
  API.get("/proxy/stats/by-project-model", {
    params: { org_id: orgId || undefined, ...daysOrPeriod(days) },
  });

// ─────────────────────── Optimization Tips ───────────────────────
export const getOptimizationTips = (params) =>
  API.get("/optimization-tips/", { params });
export const getOptimizationTipsSummary = (orgId, projectId) =>
  API.get("/optimization-tips/summary", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });
export const dismissOptimizationTip = (id) =>
  API.patch(`/optimization-tips/${id}/dismiss`);
export const applyOptimizationTip = (id) =>
  API.patch(`/optimization-tips/${id}/apply`);
export const rebuildOptimizationTips = (windowEnd) =>
  API.post("/optimization-tips/admin/rebuild", null, {
    params: { window_end: windowEnd || undefined },
  });

// ─────────────────────────── Reports ───────────────────────────
export const getProjectReport = (projectId, start, end) =>
  API.get(`/reports/projects/${projectId}`, {
    params: { start: start || undefined, end: end || undefined },
  });

export const exportProjectReport = (projectId, format, start, end) =>
  API.get(`/reports/projects/${projectId}/export`, {
    params: { format, start: start || undefined, end: end || undefined },
    responseType: "blob",
  });

export default API;
