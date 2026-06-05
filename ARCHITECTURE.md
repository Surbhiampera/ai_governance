# AI Governance Platform — Advanced Architecture

> Generated: 2026-06-03  
> Scope: Full-stack analysis of `aigovernance_backend/` + `frontend/` with current state and improvement roadmap.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Current Architecture](#2-current-architecture)
   - [High-Level Component Map](#21-high-level-component-map)
   - [Event Ingestion Pipeline](#22-event-ingestion-pipeline)
   - [Database Schema](#23-database-schema)
   - [API Surface](#24-api-surface)
   - [Services Layer](#25-services-layer)
   - [Background Tasks](#26-background-tasks)
   - [Frontend](#27-frontend)
   - [Multi-Tenancy Model](#28-multi-tenancy-model)
   - [Security Model](#29-security-model)
3. [Gap Analysis](#3-gap-analysis)
4. [Advanced Architecture — Improvements](#4-advanced-architecture--improvements)
   - [Authentication & RBAC](#41-authentication--rbac)
   - [Real-Time Event Bus](#42-real-time-event-bus)
   - [Scalable Ingestion Layer](#43-scalable-ingestion-layer)
   - [Observability Stack](#44-observability-stack)
   - [Policy Enforcement Engine](#45-policy-enforcement-engine)
   - [Data Retention & Archival](#46-data-retention--archival)
   - [Frontend Improvements](#47-frontend-improvements)
   - [Testing Strategy](#48-testing-strategy)
   - [Deployment & Scaling](#49-deployment--scaling)
5. [Target Architecture Diagram](#5-target-architecture-diagram)
6. [Implementation Roadmap](#6-implementation-roadmap)

---

## 1. System Overview

A multi-tenant AI governance and observability platform that:

- Ingests LLM telemetry events from any AI tool or vendor
- Computes costs in real-time (token, infra, external) with 6 cost model types
- Detects PII and scores data security risk
- Evaluates governance rules and fires threshold-based alerts
- Surfaces everything via a React dashboard

**Technology Stack**

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI (Python 3.11+) |
| Database | PostgreSQL 15 |
| Task Scheduler | APScheduler (in-process) |
| Frontend | React 18, Recharts, Axios |
| ORM | SQLAlchemy 2.x |
| Deployment | Render / Docker Compose |
| Notifications | SMTP, WhatsApp, MS Teams (env-driven) |
| Optional | Langfuse bridge (graceful no-op) |

---

## 2. Current Architecture

### 2.1 High-Level Component Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENTS / PRODUCERS                               │
│  SDK (GovernanceDecorator)  │  Direct API Calls  │  Webhooks / File Upload  │
└──────────┬──────────────────┴──────────┬──────────┴──────────┬──────────────┘
           │                             │                      │
           ▼                             ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FastAPI Backend (single process)                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Router Layer (20 routers, all dual-registered /x and /api/v1/x)   │   │
│  │  telemetry │ control │ costs │ summary │ security │ alerts          │   │
│  │  governance │ tools │ budgets │ pricing │ models │ organizations    │   │
│  │  projects │ users │ api-keys │ ingestion │ decorator │ workers      │   │
│  │  lookups │ auth (stub) │ health                                     │   │
│  └─────────────────────────────────┬───────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────▼───────────────────────────────────┐   │
│  │  _ingest_event() — Central Event Processing Kernel                  │   │
│  │  1. INSERT telemetry_events                                         │   │
│  │  2. CostEngine  →  upsert cost_breakdown                           │   │
│  │  3. SecurityEngine  →  insert data_security_logs                   │   │
│  │  4. AlertEngine  →  insert alerts                                  │   │
│  │  5. Upsert daily_org_summary                                       │   │
│  │  6. Mirror to Langfuse (optional)                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌───────────────────┐  ┌───────────────────┐  ┌──────────────────────┐   │
│  │   CostEngine      │  │  SecurityEngine   │  │   AlertEngine        │   │
│  │ - 6 cost models   │  │ - PII detection   │  │ - threshold eval     │   │
│  │ - 100+ LLM prices │  │ - risk scoring    │  │ - budget/quota alert │   │
│  │ - infra / external│  │ - all env-driven  │  │ - anomaly → alert    │   │
│  └───────────────────┘  └───────────────────┘  └──────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  APScheduler (in-process)                                           │   │
│  │  hourly: daily_org_summary rebuild                                  │   │
│  │  daily:  monthly_org_summary rebuild                                │   │
│  │  every 30m: anomaly detection scan                                  │   │
│  │  every 30m: governance rule alert scan                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ psycopg2 / SQLAlchemy
┌──────────────────────────────────▼──────────────────────────────────────────┐
│                            PostgreSQL Database (30+ tables)                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                   ▲
┌──────────────────────────────────┴──────────────────────────────────────────┐
│                           React Frontend                                    │
│  Dashboard │ Cost │ AlertsSecurity │ Tools │ Decorator │ Security           │
│  (axios → /api/v1/*)                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.2 Event Ingestion Pipeline

Every event entering the system follows this exact path regardless of entry point:

```
Producer
  │
  ├─ POST /telemetry/event          (direct SDK / API call)
  ├─ POST /control/ingest           (vendor-agnostic unified trace)
  ├─ POST /ingestion/webhook/{name} (webhook from 3rd-party tool)
  └─ POST /ingestion/upload/{name}  (file: JSON/JSONL/CSV/Excel)
                │
                ▼
     [IngestionNormalizer]  ←──  VendorAdapters (OpenAI, Anthropic, Google, generic)
                │
                ▼
     _ingest_event(db, event_data)
         │
         ├── INSERT → telemetry_events          (append-only source of truth)
         │
         ├── CostEngine.compute()
         │     ├── Level 1: pre-computed cost from payload?
         │     ├── Level 2: model_pricing lookup (provider + model_name)
         │     └── Level 3: tool_registry fallback (cost_model_type + base_cost)
         │           Cost types: per_token | per_request | per_second | fixed | custom
         │           Infra cost: latency_ms × $0.00008/ms + MB × $0.00001/MB
         │   → UPSERT cost_breakdown
         │
         ├── SecurityEngine.analyze()
         │     ├── PII detection (regex + pattern matching on pii_type field)
         │     ├── Data-out violation check
         │     ├── Misuse tag detection
         │     └── Risk score = sum of weighted factors (all weights from env vars)
         │   → INSERT data_security_logs
         │
         ├── AlertEngine.evaluate()
         │     ├── PII alert (if pii_detected=true)
         │     ├── Data-out alert (if data_out_violation=true)
         │     ├── Misuse alert (if misuse tag present)
         │     ├── Budget alerts (at 80%, 90%, 100% + predictive)
         │     ├── Token quota alerts (at 80%)
         │     └── Governance rule alerts (evaluated from governance_rules table)
         │   → INSERT alerts (with deduplication — ALERT_DEDUP_DAYS)
         │
         └── UPSERT daily_org_summary (also rebuilt hourly by scheduler)
```

**Cost Model Selection Priority (CostEngine)**

```
Event payload
  │
  ├─ precomputed_llm_cost supplied?  ──YES──→  Use directly
  │
  ├─ model_pricing has (provider, model_name)?  ──YES──→  
  │    llm_cost = (prompt_tokens/1M × input_cost) + (completion_tokens/1M × output_cost)
  │
  └─ tool_registry has tool_name?  ──YES──→
       ├─ per_token: (total_tokens/1000) × base_cost
       ├─ per_request: flat base_cost
       ├─ per_second: (latency_ms/1000) × rate_per_second
       ├─ fixed: base_cost constant
       └─ custom: multiplier + per-MB input/output rates from metadata_json
```

---

### 2.3 Database Schema

**30+ tables across 6 logical domains:**

```
EVENTS DOMAIN
├── telemetry_events          — Append-only event log (source of truth)
├── cost_breakdown            — Per-event cost split (LLM / external / infra)
├── execution_pipeline        — Multi-step trace stages per event
├── trace_model_usage         — Per-model row within unified trace
└── trace_tool_usage          — Per-tool row within unified trace

SECURITY DOMAIN
├── data_security_logs        — PII hits, risk scores, data-out per event
├── alerts                    — Triggered alerts (immutable, status-tracked)
└── usage_anomalies           — Spike detections (separate from rule-based alerts)

GOVERNANCE & CONFIG DOMAIN
├── governance_rules          — Custom metric thresholds (dynamic, per-org/project)
├── budgets                   — Cost caps with multi-tier alert percents
└── rate_limits               — Token quota config per org/tool

REGISTRY DOMAIN
├── tool_registry             — Tool/vendor catalog with cost model type
├── tool_connectors           — Webhook/API-pull source configs
├── connector_sync_logs       — Ingestion audit trail
├── model_registry            — LLM model catalog (fallback)
└── model_pricing             — Per-1M pricing (primary, updated as rates change)

MULTI-TENANCY DOMAIN
├── organizations             — Top-level tenant
├── projects                  — Sub-tenant within org
├── users                     — User records (minimal, auth not implemented)
└── api_keys                  — SDK/webhook authentication (org or project scoped)

AGGREGATION DOMAIN
├── daily_org_summary         — Pre-aggregated daily rollup (rebuilt hourly)
├── monthly_org_summary       — Monthly rollup
├── decorator_registrations   — SDK function registry
├── tool_api_inventory        — Tool-level function catalog with call stats
├── request_response_logs     — Per-call audit trail (decorator-instrumented)
└── project_model_usage       — Daily model usage rollup per project
```

**Key Relationships**

```
Organization (1) ──→ (N) Project
Organization (1) ──→ (N) ApiKey
Organization (1) ──→ (N) Budget
Project (1) ──→ (N) ApiKey
Project (1) ──→ (N) Budget
telemetry_events (1) ──→ (1) cost_breakdown
telemetry_events (1) ──→ (1) data_security_logs
telemetry_events (1) ──→ (N) execution_pipeline
telemetry_events (1) ──→ (N) alerts
governance_rules (1) ──→ (N) alerts
tool_connectors (1) ──→ (N) connector_sync_logs
```

---

### 2.4 API Surface

**20 routers, all registered dual-path: `/x` and `/api/v1/x`**

| Router | Key Endpoints | Purpose |
|--------|--------------|---------|
| `telemetry` | POST /event, GET /logs, GET /traces/{id} | Core event ingestion + retrieval |
| `control` | POST /ingest, /ingest/trace, GET /quota, /cost-breakdown | Vendor-agnostic unified traces |
| `summary` | GET /today, /daily, /monthly, /overview | Pre-aggregated rollup endpoints |
| `costs` | GET /by-model, /by-project, /daily, /project-breakdown | Cost drill-downs |
| `security` | GET /logs, /anomalies, /summary | PII + risk data |
| `alerts` | GET /, PATCH /{id}/resolve | Alert management |
| `alerts_security` | GET /alerts, /logs, /anomalies, /summary | Combined hydrated view |
| `governance` | GET /rules, POST /rules | Custom rule CRUD |
| `tools` | GET /, POST /register, GET /connectors, POST /connectors | Tool + connector management |
| `decorator` | GET /registrations, /inventory, /usage, /logs, /stats | Decorator framework |
| `ingestion` | POST /webhook/{name}, POST /upload/{name}, POST /pull | External data ingestion |
| `organizations` | Full CRUD | Tenant management |
| `projects` | Full CRUD | Sub-tenant management |
| `budgets` | Full CRUD | Spend caps |
| `pricing` | GET /, POST /, PUT /{provider}/{model} | LLM pricing management |
| `models` | GET /, POST /register | Model catalog |
| `lookups` | GET /auth-types, /ingestion-modes, /event-statuses, … | Env-driven dropdown values |
| `auth` | POST /login | **STUB — not implemented** |
| `workers` | POST /daily-aggregation, /anomaly-detection, /alert-scan | Manual scheduler triggers |
| `health` | GET /health | Liveness check |

---

### 2.5 Services Layer

**CostEngine** (`app/services/cost_engine.py`)
- 6 cost model types with fallback hierarchy
- 100+ LLM models priced (OpenAI GPT-5/4o/3.5, Anthropic Claude 4/3, Google Gemini 2.5, Llama, Mistral, Cohere, DeepSeek, Perplexity, Grok)
- Infra cost: `latency_ms × $0.00008/ms + MB × $0.00001/MB`
- All rates configurable via env vars

**SecurityEngine** (`app/services/security_engine.py`)
- PII detection via regex + pattern matching on `pii_type` field
- Risk score = weighted sum of 7 factors (all weights from `RISK_WEIGHT_*` env vars)
- Risk factors: input_mb, output_mb, token_count, PII present, data-out violation, misuse tag, non-success status
- Caps per factor (`RISK_CAP_*`) to prevent runaway scores

**AlertEngine** (`app/services/alert_engine.py`)
- 7 alert trigger types: PII, data-out, misuse, budget (3 levels), token quota, governance rules, anomaly escalation
- Budget alerts: at threshold%, at 90%, at 100%, predictive (burn rate × remaining days)
- Deduplication within `ALERT_DEDUP_DAYS` (default: 1 day per alert type per scope)
- Governance rules: metric + operator + threshold evaluated against current window values

**ControlIngestService** (`app/services/control_ingest.py`)
- Unified trace processing: single `trace_id` links multi-model/multi-tool calls
- Writes to `trace_model_usage` and `trace_tool_usage` for per-step drill-down
- Supports batch ingestion

**NotificationService** (`app/services/notification_service.py`)
- Channels: Email (SMTP), WhatsApp, MS Teams webhooks
- Config-driven: all credentials via env vars
- Called by AlertEngine after alert creation

**IngestionNormalizer + VendorAdapters** (`app/services/ingestion/`)
- Normalizes webhook/file payloads to `TelemetryEventCreate`
- Adapters: `openai_adapter`, `anthropic_adapter`, `google_adapter`, `generic_adapter`
- Adapter interface: `normalize(raw, connector) → list[TelemetryEventCreate]`, `pull(connector) → list[dict]`

---

### 2.6 Background Tasks

| Task | Schedule | Function | Writes to |
|------|----------|----------|----------|
| `daily-aggregation` | Every hour | Rebuild `daily_org_summary` for today | `daily_org_summary` |
| `monthly-aggregation` | Daily at midnight | Rebuild `monthly_org_summary` | `monthly_org_summary` |
| `anomaly-detection` | Every 30 min | Detect usage spikes vs. 7-day baseline | `usage_anomalies` |
| `alert-scan` | Every 30 min | Re-evaluate governance rules, escalate anomalies | `alerts` |

APScheduler runs **in-process** inside FastAPI (no Redis/Celery required for current scale).

---

### 2.7 Frontend

**Pages and Responsibilities**

| Page | Route | Key Data Shown |
|------|-------|----------------|
| Dashboard | `/` | Cost today, events, alerts, anomalies, trends, decorator stats |
| AlertsSecurity | `/alerts-security` | Alerts table + resolve, security logs, anomalies, PII modal, quota |
| Cost | `/cost` | Cost by model/project/org, daily chart, budgets CRUD, decorator audit |
| Tools | `/tools` | Connector list + CRUD, sync logs, manual trigger |
| Decorator | `/decorator` | Function registry, inventory, usage, per-call audit |
| Security | `/security` | PII logs, anomalies, risk dashboard |
| TestEvent | `/test` | Manual event injection for dev/testing |
| SuperAdminLogs | `/admin` | Full audit trail across all orgs |

**Data Access Pattern**
- Single `api.js` file exports 50+ Axios functions — all backend calls go through here
- No state management library (no Redux/Zustand) — local `useState` + `useEffect`
- Charts: Recharts `AreaChart`, `BarChart`, `PieChart`
- No component library (custom CSS in `App.css`)

---

### 2.8 Multi-Tenancy Model

```
Organization (org_id)
  ├── Projects  (project_id, optional sub-scoping)
  ├── Users     (email, role — stored but not enforced)
  ├── API Keys  (can be org-level or project-level)
  └── Budgets   (can be org-level or project-level)

All telemetry_events carry org_id (required) + project_id (optional).
All aggregation tables include org_id + project_id columns.
Cascade delete: deleting org removes all child records.
Default org_id: "default" if not supplied in event payload.
```

---

### 2.9 Security Model

| Mechanism | Status |
|-----------|--------|
| API Key auth (X-API-Key header) | ✅ Implemented |
| Webhook token auth (X-Webhook-Token) | ✅ Implemented |
| Master key for bootstrap | ✅ Implemented |
| JWT / session auth for UI users | ❌ Not implemented (auth router is a stub) |
| Role-based access control (RBAC) | ❌ Not implemented |
| API rate limiting (per org / per IP) | ❌ Not implemented |
| Audit log of config changes | ❌ Not implemented |
| Encryption at rest | ❌ Not implemented |
| GDPR / data deletion | ❌ Not implemented |

---

## 3. Gap Analysis

### Critical Gaps (Production Blockers)

| Gap | Impact | Effort |
|-----|--------|--------|
| No user authentication (JWT) | Any UI user can access any org's data | Medium |
| No RBAC | Org admins, viewers, editors have identical access | Medium |
| No API rate limiting | Malicious clients can spam events, fill DB | Low |
| No data retention / TTL | `telemetry_events` grows unbounded forever | Low |
| No query indexes documented | Dashboard queries will slow as data grows | Low |

### Significant Gaps (Production Quality)

| Gap | Impact | Effort |
|-----|--------|--------|
| No structured logging | Hard to debug production issues | Low |
| No OpenTelemetry instrumentation | Backend itself has zero observability | Medium |
| No integration tests | Regressions in core pipeline go undetected | Medium |
| No config validation at startup | Misconfigured env vars fail silently | Low |
| APScheduler in-process | Bottlenecks / drops tasks under load | High |
| No caching layer | Repeated dashboard queries hit PostgreSQL every time | Medium |
| No real-time push to frontend | Dashboard only refreshes on page load/manual | Medium |
| Policy enforcement only alerts — no blocking | Violations detected but not prevented | High |

### Enhancement Opportunities

| Opportunity | Business Value | Effort |
|------------|----------------|--------|
| ML-based anomaly detection (ARIMA / Isolation Forest) | Better anomaly quality, fewer false positives | High |
| Scheduled report emails (daily/weekly digest) | Reduces need for human to open dashboard | Medium |
| PDF/CSV export from dashboard | Enterprise compliance requirement | Low |
| LLM prompt content storage + replay | Debug governance violations at prompt level | High |
| Slack / PagerDuty / OpsGenie alert channels | Meet enterprise alert routing expectations | Medium |
| Dark mode + mobile responsive UI | UX polish | Medium |
| WebSocket real-time dashboard updates | Live governance view without polling | Medium |
| GDPR right-to-delete API | Regulatory compliance | Medium |
| Secrets management (Vault/Doppler) | Operational security | Medium |
| Read replica for dashboard queries | Decouple read load from write path | High |

---

## 4. Advanced Architecture — Improvements

### 4.1 Authentication & RBAC

**Current:** API key auth only. No user sessions. No roles.

**Target:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Auth Layer                                    │
│                                                                  │
│  ┌──────────────────┐   ┌──────────────────┐                   │
│  │   UI Users       │   │   SDK / Webhooks  │                  │
│  │   JWT (RS256)    │   │   API Keys        │                  │
│  │   15min + refresh│   │   HMAC-verified   │                  │
│  └────────┬─────────┘   └────────┬──────────┘                  │
│           │                      │                               │
│           ▼                      ▼                               │
│  FastAPI dependency: get_current_user()                         │
│     → verifies JWT / api_key                                    │
│     → returns User(id, org_id, role)                           │
│     → inject into every route handler                           │
│                                                                  │
│  Roles: super_admin | org_admin | project_admin | viewer        │
│                                                                  │
│  Permission matrix:                                             │
│  super_admin  → all orgs, all operations                       │
│  org_admin    → own org, all operations                        │
│  project_admin→ assigned projects, all operations              │
│  viewer       → own org/projects, read-only                    │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation steps:**
1. Add `password_hash`, `role` columns to `users` table
2. Implement `/auth/login` → returns `{access_token, refresh_token}`
3. Implement `/auth/refresh` → rotates tokens
4. Create `get_current_user()` FastAPI dependency (inject into all routes)
5. Add `require_role(min_role)` decorator for endpoint-level checks
6. Scope all queries to `current_user.org_id` / `current_user.project_ids`

---

### 4.2 Real-Time Event Bus

**Current:** Synchronous inline processing in `_ingest_event()` blocks the HTTP response until all engines run.

**Problem:** Under burst load, one slow database write in AlertEngine delays the entire ingestion response.

**Target:**

```
POST /telemetry/event
    │
    ├── 1. Validate + INSERT telemetry_events    ← fast, synchronous
    ├── 2. Return 202 Accepted + event_id        ← unblock client immediately
    │
    └── Background queue consumer (per org_id):
           ├── CostEngine.compute()
           ├── SecurityEngine.analyze()
           ├── AlertEngine.evaluate()
           └── daily_org_summary upsert
```

**Options (ascending complexity):**

| Option | Latency to client | Infrastructure added | Recommended for |
|--------|------------------|--------------------|-----------------|
| **FastAPI BackgroundTasks** | ~0ms | Nothing | <10k events/day |
| **asyncio.Queue (in-process)** | ~0ms | Nothing | <100k events/day |
| **Redis Streams** | ~0ms | Redis | <1M events/day |
| **Kafka / Redpanda** | ~0ms | Kafka cluster | >1M events/day |

**Recommended starting point:** Replace synchronous call chain with `BackgroundTasks.add_task()` in FastAPI. Zero new infrastructure. Adds processing latency visibility via a `processing_status` column on `telemetry_events`.

```python
# In the router
@router.post("/event")
async def ingest_event(event: TelemetryEventCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    row = db.add(TelemetryEvent(**event.dict()))
    db.commit()
    background_tasks.add_task(_run_engines, db_session_factory, row.event_id)
    return {"event_id": row.event_id, "status": "accepted"}
```

---

### 4.3 Scalable Ingestion Layer

**Current:** Single FastAPI process handles both API requests and background APScheduler tasks. No queue, no workers.

**Target (medium scale):**

```
                      ┌────────────────────────┐
                      │   Load Balancer (nginx) │
                      └───────────┬────────────┘
                                  │
               ┌──────────────────┴──────────────────┐
               │                                      │
    ┌──────────▼─────────┐               ┌────────────▼──────────┐
    │  API Pods (×N)     │               │  Worker Pods (×M)     │
    │  FastAPI + Uvicorn │               │  APScheduler or       │
    │  HTTP only         │               │  Celery + Redis       │
    └──────────┬─────────┘               └────────────┬──────────┘
               │                                      │
               └──────────────────┬───────────────────┘
                                  │
                     ┌────────────▼────────────┐
                     │  PostgreSQL             │
                     │  Primary (writes)       │
                     │  Read Replica (reads)   │
                     └─────────────────────────┘
```

**Database Indexes to add immediately** (no code change, just SQL):

```sql
-- Most queried columns
CREATE INDEX idx_telemetry_org_created ON telemetry_events(org_id, created_at DESC);
CREATE INDEX idx_telemetry_project ON telemetry_events(project_id, created_at DESC);
CREATE INDEX idx_telemetry_tool ON telemetry_events(tool_name, created_at DESC);
CREATE INDEX idx_cost_breakdown_event ON cost_breakdown(event_id);
CREATE INDEX idx_security_logs_org ON data_security_logs(org_id, created_at DESC);
CREATE INDEX idx_alerts_org_status ON alerts(org_id, status, created_at DESC);
CREATE INDEX idx_anomalies_org ON usage_anomalies(org_id, status, created_at DESC);
CREATE INDEX idx_daily_summary_org_date ON daily_org_summary(org_id, date DESC);
CREATE INDEX idx_governance_rules_active ON governance_rules(org_id, is_active);
```

**Connection Pool tuning** (`app/database.py`):

```python
engine = create_engine(
    DATABASE_URL,
    pool_size=10,         # was 3
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=300,
)
```

---

### 4.4 Observability Stack

**Current:** Basic Python logging only. No metrics, no tracing, no health details.

**Target:**

```
FastAPI Backend
    │
    ├── Structured logging (structlog / loguru)
    │     JSON lines to stdout → picked up by log aggregator
    │     Fields: event_id, org_id, latency_ms, status, error
    │
    ├── OpenTelemetry SDK
    │     Auto-instrument: FastAPI routes, SQLAlchemy queries
    │     Export: OTLP → Jaeger (traces) + Prometheus (metrics)
    │
    └── /metrics endpoint (prometheus_fastapi_instrumentator)
          Exposes: request_count, request_latency_p99,
                   events_ingested_total, cost_computed_total,
                   alerts_fired_total, anomalies_detected_total
```

**Quick win — add to `app/main.py`:**

```python
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)
```

**Grafana Dashboard panels to add:**
- Events ingested/min by org
- P99 ingestion latency
- Alert fire rate by severity
- Cost engine error rate
- PII detection rate trend
- Database connection pool utilization

---

### 4.5 Policy Enforcement Engine

**Current:** Governance rules fire alerts but take no action. Violations are detected after the fact.

**Target — 3 enforcement levels:**

```
Level 1: Advisory (current)
  → Alert created, logged, notified
  → No impact on the caller

Level 2: Soft-block (new)
  → Event accepted, but response includes:
    {"event_id": "...", "governance": {"blocked": false, "warnings": ["budget 92% used"]}}
  → SDK can surface this to the user

Level 3: Hard-block (new)
  → Event rejected with 429 / 403
  → Response: {"error": "governance_violation", "rule": "monthly_cost_limit", "limit": 500}
  → SDK must handle this gracefully
```

**Implementation in `_ingest_event()`:**

```python
# Before inserting event, check enforcement rules
enforcement_result = GovernanceEnforcer(db).check(event)
if enforcement_result.hard_block:
    raise HTTPException(status_code=429, detail=enforcement_result.reason)
```

**New `governance_rules` columns needed:**

```sql
ALTER TABLE governance_rules
  ADD COLUMN enforcement_level VARCHAR(20) DEFAULT 'advisory'
    CHECK (enforcement_level IN ('advisory', 'soft_block', 'hard_block'));
```

---

### 4.6 Data Retention & Archival

**Current:** `telemetry_events` grows forever. No cleanup, no archival.

**Target:**

```
Retention Policy (configurable per org via governance config):
  - telemetry_events:       90 days hot  →  cold archive (S3 Parquet)
  - data_security_logs:     180 days hot  →  cold archive
  - alerts:                 365 days hot  →  never delete (compliance)
  - cost_breakdown:         90 days hot  →  cold archive
  - daily_org_summary:      keep forever (small, pre-aggregated)
  - connector_sync_logs:    30 days

Archival job (new APScheduler task, daily):
  1. SELECT events older than retention_days
  2. Export to S3 as Parquet (partitioned by org_id/date)
  3. DELETE from PostgreSQL
  4. Log archival stats to connector_sync_logs (reuse existing table)
```

**New `data_retention_policies` table:**

```sql
CREATE TABLE data_retention_policies (
    id SERIAL PRIMARY KEY,
    org_id VARCHAR(255) REFERENCES organizations(id),
    table_name VARCHAR(100) NOT NULL,
    hot_days INTEGER NOT NULL DEFAULT 90,
    archive_enabled BOOLEAN DEFAULT false,
    archive_destination VARCHAR(500),   -- S3 URI prefix
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Quick win — add scheduled delete for old `connector_sync_logs`:**

```python
# In celery_app.py (APScheduler)
def _job_cleanup_sync_logs():
    db.execute("DELETE FROM connector_sync_logs WHERE created_at < NOW() - INTERVAL '30 days'")
```

---

### 4.7 Frontend Improvements

**Current:** Local state only, no real-time, custom CSS, no error boundaries.

#### A. Real-Time Dashboard via WebSocket

```
FastAPI: Add WebSocket endpoint at /ws/events/{org_id}
  → Authenticated by JWT token in query param
  → Broadcasts: new alerts, anomaly detections, cost thresholds crossed

React: useWebSocket() hook
  → On message: update local state with new alert/anomaly
  → Show "Live" badge when connected
  → Graceful fallback to polling if WS fails
```

#### B. Global State Management

Replace scattered `useState` + `useEffect` with React Query (`@tanstack/react-query`):

```javascript
// Before:
const [data, setData] = useState(null);
useEffect(() => { fetchData().then(setData); }, []);

// After:
const { data, isLoading, refetch } = useQuery({
  queryKey: ['alerts', orgId],
  queryFn: () => getAlertsSecurityAlerts(orgId),
  refetchInterval: 30_000,   // auto-refresh every 30s
  staleTime: 10_000,
});
```

Benefits: deduped requests, automatic background refresh, cache, loading/error states.

#### C. Error Boundaries + Proper Error UI

```javascript
// Wrap each page in ErrorBoundary
<ErrorBoundary fallback={<PageError />}>
  <AlertsSecurity />
</ErrorBoundary>
```

#### D. Component Library

Replace custom CSS with **shadcn/ui** (Radix UI + Tailwind CSS):
- Zero runtime overhead (CSS-in-JS-free)
- Accessible by default (ARIA)
- Dark mode via `class="dark"` toggle

#### E. Export Functionality

```javascript
// Add to each data table
<button onClick={() => exportToCSV(tableData, 'alerts-export.csv')}>
  Export CSV
</button>
```

---

### 4.8 Testing Strategy

**Current:** Minimal tests in `tests/`. No integration tests, no frontend tests.

**Target test pyramid:**

```
                    ┌──────────────┐
                    │   E2E Tests  │  (Playwright: 5 critical flows)
                    └──────┬───────┘
               ┌───────────┴────────────┐
               │   Integration Tests     │  (pytest + real PostgreSQL)
               │   - Full event pipeline │
               │   - CostEngine accuracy │
               │   - AlertEngine rules   │
               └───────────┬────────────┘
          ┌─────────────────┴───────────────────┐
          │           Unit Tests                │  (pytest, mocked DB)
          │  - SecurityEngine risk scoring      │
          │  - VendorAdapter normalization      │
          │  - Cost model type calculations     │
          │  - Alert deduplication logic        │
          └─────────────────────────────────────┘
```

**Priority integration tests to write first:**

```python
# tests/test_ingestion_pipeline.py
def test_event_creates_cost_breakdown(test_db, test_org):
    event = send_test_event(org_id=test_org.id, model_name="gpt-4o", tokens=1000)
    breakdown = test_db.query(CostBreakdown).filter_by(event_id=event.event_id).first()
    assert breakdown.llm_cost > 0

def test_pii_event_creates_alert(test_db, test_org):
    event = send_test_event(org_id=test_org.id, pii_type="email_address")
    alert = test_db.query(Alert).filter_by(telemetry_id=event.event_id).first()
    assert alert is not None
    assert alert.alert_type == "pii_detected"

def test_budget_exhaustion_alert(test_db, test_org):
    create_budget(test_org.id, limit_amount=1.00)  # $1 budget
    for _ in range(20):
        send_test_event(test_org.id, precomputed_cost=0.06)  # total $1.20
    alerts = test_db.query(Alert).filter(Alert.alert_type.like("budget%")).all()
    assert any(a.alert_type == "budget_exhausted" for a in alerts)
```

---

### 4.9 Deployment & Scaling

**Current:** Single Render service (FastAPI) + managed PostgreSQL.

**Phase 1 — Optimized Single-Server (0–500k events/day)**

```yaml
# docker-compose.yml improvements
services:
  api:
    image: ai-governance-api
    replicas: 2
    environment:
      - WORKERS=4           # uvicorn workers
      - DB_POOL_SIZE=10
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]

  postgres:
    image: postgres:15
    volumes:
      - pgdata:/var/lib/postgresql/data
    command: >
      postgres
        -c max_connections=100
        -c shared_buffers=256MB
        -c effective_cache_size=768MB
        -c maintenance_work_mem=64MB
        -c wal_buffers=16MB
```

**Phase 2 — Kubernetes (500k–5M events/day)**

```
                          Ingress (nginx)
                               │
                  ┌────────────┴────────────┐
                  │                         │
           API Deployment (×3)    Worker Deployment (×2)
           FastAPI only           APScheduler / Celery
                  │                         │
                  └────────────┬────────────┘
                               │
                  ┌────────────┴────────────┐
                  │                         │
          PostgreSQL Primary       PostgreSQL Read Replica
          (writes + migrations)    (dashboard queries)
                  │
             Redis (cache + session)
```

**Phase 3 — Event Streaming (5M+ events/day)**

```
Producers → Kafka Topic (ai-governance.events)
                │
        Consumer Group (workers)
                │
     ┌──────────┴──────────┐
     │  CostEngine workers  │  (auto-scale on topic lag)
     │  SecurityWorkers     │
     │  AlertWorkers        │
     └──────────┬───────────┘
                │
          PostgreSQL (time-series optimized: TimescaleDB)
```

---

## 5. Target Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              PRODUCER ECOSYSTEM                                  │
│  GovernanceSDK (Python)  │  Direct API  │  OpenAI/Anthropic/Google Adapters      │
│  HMAC-signed batch       │  JWT/APIKey  │  Webhooks + File Upload                │
└────────────────────────────────────┬─────────────────────────────────────────────┘
                                     │ HTTPS
                          ┌──────────▼──────────┐
                          │   Load Balancer      │
                          └──────────┬───────────┘
                    ┌────────────────┴─────────────────┐
                    │                                   │
        ┌───────────▼───────────┐           ┌──────────▼──────────────┐
        │  API Pods (×N)        │           │  Worker Pods (×M)        │
        │  FastAPI (async)      │           │  Background tasks        │
        │  Auth middleware      │           │  Anomaly detection       │
        │  RBAC enforcement     │           │  Alert scan              │
        │  Rate limiting        │           │  Summary aggregation     │
        │  OTel tracing         │           │  Data archival           │
        │  /ws WebSocket        │           │  OTel tracing            │
        └───────────┬───────────┘           └──────────┬──────────────┘
                    │                                   │
                    └──────────┬────────────────────────┘
                               │
               ┌───────────────┼───────────────┐
               │               │               │
   ┌───────────▼──┐    ┌───────▼──────┐   ┌──▼──────────────┐
   │  PostgreSQL  │    │   Redis       │   │  Object Store   │
   │  Primary     │    │  - Cache      │   │  (S3 / GCS)     │
   │  (writes)    │    │  - Sessions   │   │  Cold archive   │
   └──────────────┘    │  - Rate limit │   │  Parquet files  │
   ┌──────────────┐    │  - WS pubsub  │   └─────────────────┘
   │  PostgreSQL  │    └───────────────┘
   │  Read Replica│
   │  (reads)     │
   └──────────────┘
               │
   ┌───────────▼──────────────────────────────────────────────┐
   │                   Observability Stack                     │
   │  Prometheus (metrics)  Jaeger (traces)  ELK (logs)       │
   │  Grafana dashboards    PagerDuty alerts                   │
   └───────────────────────────────────────────────────────────┘
               │
   ┌───────────▼──────────────────────────────────────────────┐
   │                    React Frontend                         │
   │  React Query (data fetching + cache)                      │
   │  WebSocket hook (real-time alerts)                        │
   │  shadcn/ui + Tailwind CSS (component system)              │
   │  React Router (routing)                                   │
   │  Recharts (visualization)                                 │
   │  Dark mode / mobile responsive                            │
   └───────────────────────────────────────────────────────────┘
```

---

## 6. Implementation Roadmap

### Phase 0 — Hardening (1–2 weeks, no new features)

| # | Task | File(s) to Change | Priority |
|---|------|------------------|----------|
| P0-1 | Add DB indexes for all hot query columns | New migration SQL | Critical |
| P0-2 | Increase connection pool_size to 10 | `app/database.py` | Critical |
| P0-3 | Add `/health` readiness check (DB ping) | `app/main.py` | Critical |
| P0-4 | Add structured logging (structlog) | All services | High |
| P0-5 | Add startup env var validation | `app/config.py` (new) | High |
| P0-6 | Add `BackgroundTasks` to decouple ingestion | `routers/telemetry.py` | High |
| P0-7 | Cleanup scheduled delete for `connector_sync_logs` | `app/scheduler.py` | Medium |
| P0-8 | Add `prometheus_fastapi_instrumentator` | `app/main.py` | Medium |

### Phase 1 — Auth & RBAC (2–3 weeks)

| # | Task | Notes |
|---|------|-------|
| P1-1 | Add `password_hash`, `role` to `users` table | Migration |
| P1-2 | Implement `/auth/login` + `/auth/refresh` (JWT RS256) | `routers/auth.py` |
| P1-3 | Create `get_current_user()` dependency | `app/dependencies.py` |
| P1-4 | Add `require_role()` to all routes | All routers |
| P1-5 | Scope all queries by `current_user.org_id` | All query functions |
| P1-6 | Frontend: login page + JWT storage (httpOnly cookie) | `frontend/src/` |
| P1-7 | Frontend: protected routes (`<PrivateRoute>`) | `App.js` |

### Phase 2 — Data Quality & Retention (1–2 weeks)

| # | Task | Notes |
|---|------|-------|
| P2-1 | Add `data_retention_policies` table | Migration |
| P2-2 | Add archival background task (APScheduler daily) | `app/scheduler.py` |
| P2-3 | Add rate limiting middleware (per org_id) | `app/middleware.py` |
| P2-4 | Add config audit log table + API | Migration + new router |

### Phase 3 — Policy Enforcement (2–3 weeks)

| # | Task | Notes |
|---|------|-------|
| P3-1 | Add `enforcement_level` to `governance_rules` | Migration |
| P3-2 | Implement `GovernanceEnforcer` service | `app/services/enforcer.py` |
| P3-3 | Hook enforcer into `_ingest_event()` pre-insert | `routers/telemetry.py` |
| P3-4 | Return enforcement context in response | `schemas.py` |
| P3-5 | SDK: handle `governance_violation` error gracefully | `governance_sdk/` |

### Phase 4 — Frontend Upgrade (2–3 weeks)

| # | Task | Notes |
|---|------|-------|
| P4-1 | Add React Query (`@tanstack/react-query`) | `package.json`, `App.js` |
| P4-2 | Migrate all `useEffect(fetch)` calls to `useQuery` | All pages |
| P4-3 | Add WebSocket hook + live alert stream | New `useWebSocket.js` |
| P4-4 | Add CSV export to all tables | Shared util + all pages |
| P4-5 | Add error boundaries | `App.js` + pages |
| P4-6 | Add shadcn/ui + Tailwind (incremental, alongside CSS) | `package.json` |
| P4-7 | Dark mode toggle | `App.js` + CSS |

### Phase 5 — Scale Preparation (ongoing)

| # | Task | Notes |
|---|------|-------|
| P5-1 | Add Redis (session, cache, rate limiting) | Docker Compose + `requirements.txt` |
| P5-2 | Add read replica routing for dashboard queries | `app/database.py` |
| P5-3 | Dockerize properly (multi-stage, non-root user) | `Dockerfile` |
| P5-4 | Add Kubernetes manifests (Deployment, Service, HPA) | `k8s/` |
| P5-5 | Migrate APScheduler → Celery + Redis (worker pods) | `app/tasks.py` |
| P5-6 | Add OpenTelemetry SDK (traces + metrics) | `app/telemetry.py` |

---

## Appendix: Environment Variable Reference

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `CORS_ORIGINS` | `*` | Allowed CORS origins |
| `GOVERNANCE_MASTER_KEY` | — | Bootstrap API key |
| `COST_DEFAULT_RATE_PER_1K` | `0.0025` | Fallback token rate ($/1k tokens) |
| `COST_INFRA_RATE_PER_MS` | `0.00008` | Infra cost per ms of latency |
| `COST_INFRA_RATE_PER_MB` | `0.00001` | Infra cost per MB transferred |
| `COST_DEFAULT_PER_SECOND_RATE` | — | per_second cost model rate |
| `RISK_WEIGHT_PII` | `20` | Risk score added when PII detected |
| `RISK_WEIGHT_DATA_OUT` | `15` | Risk score for data-out violation |
| `RISK_WEIGHT_MISUSE` | `20` | Risk score for misuse tag |
| `RISK_WEIGHT_INPUT_MB` | `8` | Risk score per MB input |
| `RISK_WEIGHT_OUTPUT_MB` | `12` | Risk score per MB output |
| `RISK_WEIGHT_TOKEN_PER_500` | `4` | Risk score per 500 tokens |
| `RISK_WEIGHT_ERROR` | `5` | Risk score for non-success status |
| `RISK_CAP_INPUT_MB` | `25` | Max risk contribution from input MB |
| `RISK_CAP_OUTPUT_MB` | `25` | Max risk contribution from output MB |
| `RISK_CAP_TOKEN` | `20` | Max risk contribution from tokens |
| `ALERT_BUDGET_DEFAULT_THRESHOLD_PCT` | `80` | Budget alert at N% |
| `ALERT_BUDGET_MID_PCT` | `90` | Budget alert at N% |
| `ALERT_TOKEN_QUOTA_WARNING_PCT` | `80` | Quota alert at N% |
| `ALERT_DEDUP_DAYS` | `1` | Suppress duplicate alerts within N days |
| `ALERT_COST_THRESHOLD` | — | Per-event cost alert threshold |
| `ALERT_DATA_OUT_THRESHOLD_MB` | — | Data-out volume alert threshold |
| `ANOMALY_SPIKE_RATIO` | `1.8` | Multiplier over baseline to flag spike |
| `ANOMALY_BASELINE_DAYS` | `7` | Days of history for baseline |
| `ANOMALY_SPIKE_THRESHOLD` | `1.5` | Absolute spike detection threshold |
| `LOOKUP_AUTH_TYPES` | comma-separated | Dropdown values for auth type |
| `LOOKUP_INGESTION_MODES` | comma-separated | Dropdown values for ingestion mode |
| `SMTP_HOST` / `SMTP_PORT` | — | Email notification SMTP config |
| `SMTP_USER` / `SMTP_PASSWORD` | — | SMTP credentials |
| `NOTIFICATION_EMAIL` | — | Target email for alerts |
| `LANGFUSE_HOST` / `LANGFUSE_PUBLIC_KEY` | — | Optional Langfuse integration |
