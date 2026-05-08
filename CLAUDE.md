# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

A multi-tenant AI governance and observability platform that tracks LLM usage, costs, security risks, and policy compliance across an organization's AI tooling. It ingests telemetry events from any AI tool, computes costs in real-time, detects PII, evaluates governance rules, and surfaces everything in a React dashboard.

## Commands

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Dev server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Tests
python -m pytest tests/
python -m pytest tests/test_telemetry.py  # single file

# Database
python check_db.py             # inspect DB state
python test_event.py           # send a test event
```

### Frontend

```bash
cd frontend
npm install
npm start          # dev server → http://localhost:3000
npm run build
npm test
```

### Full Stack (Docker)

```bash
docker-compose up --build      # PostgreSQL + FastAPI
```

### Database Migrations

No Alembic — SQLAlchemy creates all tables at startup via `Base.metadata.create_all()`. Additionally, `_SAFE_ALTERS` in [backend/app/main.py](backend/app/main.py) runs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on startup to handle columns added after initial creation. For other schema changes, apply `backend/migrations/001_align_schema.sql` manually.

## Architecture

### Event Ingestion Pipeline

Every `POST /telemetry/event` (or `/api/v1/telemetry/event`) flows through `_ingest_event()` in [backend/app/routers/telemetry.py](backend/app/routers/telemetry.py):

1. Insert row into `telemetry_events`
2. `CostEngine` → computes LLM token cost + external tool cost + infra cost → upserts `cost_breakdown`
3. `SecurityEngine` → PII detection, risk scoring → inserts `data_security_logs`
4. `AlertEngine` → evaluates thresholds against `governance_rules` → inserts `alerts`
5. Upsert `daily_org_summary` (also rebuilt hourly by APScheduler)

### Cost Model Selection Priority

`CostEngine` in [backend/app/services/cost_engine.py](backend/app/services/cost_engine.py) tries each level in order:

1. **Pre-computed** — caller supplies cost directly in the event payload
2. **Model pricing** — lookup `model_pricing` table by model name
3. **Tool registry fallback** — use `tool_registry.cost_model_type` + `base_cost`

Six cost model types: `per_token`, `per_request`, `per_second`, `fixed`, `custom`, `pre-computed`. Infra cost defaults to `latency_ms × $0.00008`.

### Background Tasks (APScheduler)

APScheduler runs inside the FastAPI process (no broker/Redis required). Tasks are defined in [backend/app/celery_app.py](backend/app/celery_app.py):

| Task | Schedule | Purpose |
|------|----------|---------|
| `daily-aggregation` | hourly | Aggregate costs/metrics into `daily_org_summary` |
| `monthly-aggregation` | daily | Pre-aggregate monthly stats |
| `anomaly-detection` | every 30 min | Detect usage spikes into `usage_anomalies` |
| `alert-scan` | every 30 min | Re-evaluate governance rules |

Tasks can also be triggered on-demand via the `workers` router.

### API Routes

Routers live in [backend/app/routers/](backend/app/routers/). All routes are registered **twice** — unversioned (`/telemetry/*`) and versioned (`/api/v1/telemetry/*`) — in [backend/app/main.py](backend/app/main.py).

Key routers: `telemetry`, `control`, `summary`, `costs`, `security`, `alerts`, `alerts_security`, `tools`, `governance`, `organizations`, `projects`, `apikeys`, `budgets`, `pricing`, `models`, `workers`, `lookups`, `ingestion`, `auth`.

The `control` router handles vendor-agnostic ingestion, unified trace processing, and quota/cost breakdown for SDK clients.

### Ingestion Adapters

[backend/app/routers/ingestion.py](backend/app/routers/ingestion.py) accepts webhook POST and file uploads (JSON, JSONL, CSV, Excel). Events are normalized through `IngestionNormalizer` and vendor-specific adapters in `backend/app/services/ingestion/` before flowing into the same `_ingest_event()` pipeline. Webhooks authenticate via `X-Webhook-Token` header or Bearer token.

### Multi-Tenancy

All data is scoped by `org_id` (required) → `project_id` (optional) → `user_id` / `api_key_id`. The hierarchy is enforced via foreign keys: Organizations → Projects → Users → API Keys. API keys can be org-level or project-level.

### Services (Business Logic)

- [backend/app/services/cost_engine.py](backend/app/services/cost_engine.py) — 6 cost model types, token-based LLM cost + latency-based infra cost
- [backend/app/services/alert_engine.py](backend/app/services/alert_engine.py) — threshold evaluation against `governance_rules`; creates cost/PII/misuse alerts
- [backend/app/services/security_engine.py](backend/app/services/security_engine.py) — PII detection and risk scoring; all risk weights come from `RISK_WEIGHT_*` env vars, not hardcoded
- [backend/app/services/control_ingest.py](backend/app/services/control_ingest.py) — unified trace processing and SDK event normalization
- [backend/app/services/langfuse_bridge.py](backend/app/services/langfuse_bridge.py) — optional Langfuse integration; gracefully no-ops if package absent
- [backend/app/services/notification_service.py](backend/app/services/notification_service.py) — alert notifications (email/webhooks)

### Governance SDK

[governance_sdk/](governance_sdk/) is a Python client library for embedding governance in any application:
- Patches OpenAI and Anthropic SDKs at runtime via monkey-patching
- Groups multi-step LLM calls into sessions via shared `trace_id`
- Batch buffering, client-side cost calculation, and policy enforcement
- `Tracer` captures multi-step workflows

### Frontend Structure

- [frontend/src/api.js](frontend/src/api.js) — single Axios client file with 50+ endpoint functions; all backend calls go through here
- [frontend/src/App.js](frontend/src/App.js) — sidebar layout and react-router routes
- [frontend/src/pages/](frontend/src/pages/) — one file per dashboard page: `Dashboard`, `Cost`, `Tools`, `AlertsSecurity`, `Security`, `Organizations`, `SuperAdminLogs`, `TestEvent`

### Database Models

All ORM models are in [backend/app/models.py](backend/app/models.py). All models use `extend_existing=True` to survive schema drift. Core tables:

| Table | Role |
|-------|------|
| `telemetry_events` | Append-only event log — the source of truth |
| `cost_breakdown` | Per-event cost split (LLM / external / infra) |
| `tool_registry` | Tool/vendor catalog with cost model type |
| `model_registry` / `model_pricing` | LLM model pricing config |
| `data_security_logs` | PII hits, data-out volumes, risk scores |
| `alerts` | Triggered alerts with severity and status |
| `governance_rules` | Dynamic threshold rules per scope |
| `daily_org_summary` / `monthly_org_summary` | Pre-aggregated rollups |
| `execution_pipeline` / `trace_model_usage` / `trace_tool_usage` | Per-step trace records linked to parent `telemetry_events.event_id` |
| `usage_anomalies` | Detected usage spikes (separate from alerts) |
| `rate_limits` / `rate_limit_violations` | Rate limiting config and violations |
| `organizations`, `projects`, `users`, `api_keys` | Multi-tenancy hierarchy |

### Zero-Hardcode Philosophy

Enumerated values (dropdown options, risk weights, alert thresholds) are never hardcoded in SQL or Python. Instead:
- Frontend dropdowns query `/lookups/*` endpoints which read from `LOOKUP_*` env vars
- Risk scoring weights are all `RISK_WEIGHT_*` env vars with `RISK_CAP_*` caps
- Cost models are stored in DB tables

### Environment Variables

Copy [backend/.env.example](backend/.env.example) to `backend/.env`. Key vars:

- `DATABASE_URL` — PostgreSQL connection string
- `CORS_ORIGINS` — comma-separated allowed origins (defaults to `*`)
- `ALERT_COST_THRESHOLD`, `ALERT_DATA_OUT_THRESHOLD_MB` — alert thresholds
- `RISK_WEIGHT_PII`, `RISK_WEIGHT_DATA_OUT`, `RISK_CAP_*` — risk scoring weights (all configurable)
- `LOOKUP_*` — comma-separated enums powering frontend dropdowns (auth types, tool types, providers, rule metrics, etc.)
- `LANGFUSE_*` — optional Langfuse observability integration
