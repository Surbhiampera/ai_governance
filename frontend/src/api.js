import axios from "axios";

const API = axios.create({
  // No hardcoded localhost defaults. Prefer explicit env, otherwise same-origin.
  baseURL: process.env.REACT_APP_API_URL || window.location.origin,
  timeout: 8000,
});

// ─────────────────────── Summary / Dashboard ───────────────────────
export const getGovernanceOverview = (orgId, days = 14, range = "all") =>
  API.get("/summary/overview", {
    params: { org_id: orgId || undefined, days, range: range || undefined },
  });

export const getTodaySummary = () => API.get("/summary/today");
export const getDailySummary = (start, end, orgId) =>
  API.get("/summary/daily", { params: { start, end, org_id: orgId || undefined } });
export const getMonthlySummary = (orgId, projectId) =>
  API.get("/summary/monthly", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });
export const getUsageTrends = (orgId, days) =>
  API.get("/summary/trends", { params: { org_id: orgId || undefined, days: days || 30 } });

// ─────────────────────── Alerts ───────────────────────
export const getAlerts = (status) =>
  API.get("/alerts/", { params: { status: status || undefined } });
export const resolveAlert = (id) => API.patch(`/alerts/${id}/resolve`);

// ─────────────────────── Security ───────────────────────
export const getSecuritySummary = (startDate) =>
  API.get("/security/summary", { params: { start_date: startDate || undefined } });
export const getSecurityLogs = (piiDetected, misuseDetected, startDate) =>
  API.get("/security/logs", { params: { pii_detected: piiDetected, misuse_detected: misuseDetected, start_date: startDate || undefined } });
export const getUsageAnomalies = (status = "open", startDate) =>
  API.get("/security/anomalies", { params: { status, start_date: startDate || undefined } });

// Combined alerts & security
export const getAlertsSecurity = (status, orgId, projectId, startDate) =>
  API.get("/alerts-security/alerts", { params: { status: status || undefined, org_id: orgId || undefined, project_id: projectId || undefined, start_date: startDate || undefined } });
export const resolveAlertCombined = (id) =>
  API.patch(`/alerts-security/alerts/${id}/resolve`);
export const getSecuritySummaryCombined = (orgId, projectId, startDate) =>
  API.get("/alerts-security/summary", { params: { org_id: orgId || undefined, project_id: projectId || undefined, start_date: startDate || undefined } });
export const getSecurityLogsCombined = (piiDetected, misuseDetected, orgId, projectId, startDate) =>
  API.get("/alerts-security/logs", { params: { pii_detected: piiDetected, misuse_detected: misuseDetected, org_id: orgId || undefined, project_id: projectId || undefined, start_date: startDate || undefined } });
export const getAnomaliesCombined = (status = "open", orgId, projectId, startDate) =>
  API.get("/alerts-security/anomalies", { params: { status, org_id: orgId || undefined, project_id: projectId || undefined, start_date: startDate || undefined } });

// ─────────────────────── Telemetry / Tracing ───────────────────────
export const getTelemetryLogs = (params) => API.get("/telemetry/logs", { params });
export const getTrace = (eventId) => API.get(`/telemetry/traces/${eventId}`);
export const postTelemetryEvent = (data) => API.post("/telemetry/event", data);
export const postTelemetryBatch = (events) =>
  API.post("/telemetry/events/batch", { events });
export const updateTelemetryEvent = (eventId, data) =>
  API.put(`/telemetry/event/${eventId}`, data);
export const deleteTelemetryEvent = (eventId) =>
  API.delete(`/telemetry/event/${eventId}`);
export const trackEvent = (data) => API.post("/telemetry/track", data);

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
export const controlIngestBatch = (events) => API.post("/control/ingest/batch", { events });
export const controlIngestTrace = (data) => API.post("/control/ingest/trace", data);
export const getControlQuota = (orgId, projectId) =>
  API.get(`/control/quota/${orgId}`, { params: { project_id: projectId || undefined } });
export const getProjectTrace = (projectId, orgId) =>
  API.get(`/control/project/${projectId}/trace`, { params: { org_id: orgId || undefined } });
export const getControlTraceDetail = (traceId, orgId) =>
  API.get(`/control/trace/${traceId}`, { params: { org_id: orgId || undefined } });
export const getControlCostBreakdown = (orgId, projectId) =>
  API.get("/control/cost-breakdown", {
    params: { org_id: orgId || undefined, project_id: projectId || undefined },
  });
export const getProjectCostBreakdown = (projectId, orgId) =>
  API.get("/costs/project-breakdown", {
    params: { project_id: projectId, org_id: orgId || undefined },
  });
export const getNotificationStatus = () => API.get("/control/notifications/status");

// ─────────────────────── Advanced Observability / Gateway ───────────────────────
export const ingestSpan = (data) => API.post("/advanced/spans", data);
export const ingestStreamToken = (data) => API.post("/advanced/stream/tokens", data);
export const getLiveStream = (params) => API.get("/advanced/stream/live", { params });
export const getTraceGraph = (traceId) => API.get(`/advanced/trace/${traceId}/graph`);
export const getTraceReplay = (traceId) => API.get(`/advanced/trace/${traceId}/replay`);
export const enforcePolicy = (data) => API.post("/advanced/policy/enforce", data);
export const gatewayRoute = (data) => API.post("/advanced/gateway/route", data);
export const getTraceOtel = (traceId) => API.get(`/advanced/otel/trace/${traceId}`);
export const registerPromptVersion = (data) => API.post("/advanced/prompt-version", data);
export const getPromptVersions = (traceId) => API.get(`/advanced/prompt-version/${traceId}`);
export const getRagAudit = (params) => API.get("/advanced/rag/audit", { params });

// ─────────────────────── Email Support Agent ───────────────────────
export const refreshEmails = (top) => API.post("/email-agent/refresh", null, { params: { top } });
export const listEmails = (params) => API.get("/email-agent/emails", { params });
export const classifyEmailText = (text) => API.post("/email-agent/classify", { text });
export const draftEmailText = (text, intent) => API.post("/email-agent/draft", { text, intent: intent || null });

// ─────────────────────── Tools / Models ───────────────────────
export const getTools = () => API.get("/tools/");
export const registerTool = (data) => API.post("/tools/register", data);
export const getToolsUsage = () => API.get("/tools/usage");
export const getConnectors = () => API.get("/tools/connectors");
export const createConnector = (data) => API.post("/tools/connectors", data);

export const getModels = () => API.get("/models/");
export const registerModel = (data) => API.post("/models/register", data);

// ─────────────────────── Governance rules ───────────────────────
export const getRules = () => API.get("/governance/rules");
export const createRule = (data) => API.post("/governance/rules", data);

// ─────────────────────── Organizations / Projects ───────────────────────
export const getOrganizations = () => API.get("/organizations/");
export const getOrganization = (id) => API.get(`/organizations/${id}`);
export const createOrganization = (data) => API.post("/organizations/", data);
export const updateOrganization = (id, data) => API.put(`/organizations/${id}`, data);
export const deleteOrganization = (id) => API.delete(`/organizations/${id}`);

export const getProjects = (orgId) =>
  API.get("/projects/", { params: { org_id: orgId || undefined } });
export const getProject = (id) => API.get(`/projects/${id}`);
export const createProject = (data) => API.post("/projects/", data);
export const updateProject = (id, data) => API.put(`/projects/${id}`, data);
export const deleteProject = (id) => API.delete(`/projects/${id}`);

// ─────────────────────── Budgets / API Keys ───────────────────────
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

// ─────────────────────── Costs ───────────────────────
export const getCostByOrg = () => API.get("/costs/by-org");
export const getCostByProject = (orgId) =>
  API.get("/costs/by-project", { params: { org_id: orgId || undefined } });
export const getCostDaily = (days, orgId, projectId) =>
  API.get("/costs/daily", {
    params: { days, org_id: orgId || undefined, project_id: projectId || undefined },
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
    params: { days: days || 14, org_id: orgId || undefined, project_id: projectId || undefined },
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
  API.get("/lookups/tracing-projects", { params: { org_id: orgId || undefined } });
export const getLookupAuthTypes = () => API.get("/lookups/auth-types");
export const getLookupIngestionModes = () => API.get("/lookups/ingestion-modes");
export const getLookupConnectorStatuses = () => API.get("/lookups/connector-statuses");
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

export default API;
