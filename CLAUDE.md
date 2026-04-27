# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

An AI governance and observability platform that tracks LLM usage, costs, security risks, and policy compliance across an organization's AI tooling. It ingests telemetry events from any AI tool, computes costs in real-time, detects PII, evaluates governance rules, and surfaces everything in a React dashboard.

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
docker-compose up --build      # PostgreSQL + Redis + FastAPI + Celery worker
```

### Database Migrations

No Alembic — SQLAlchemy creates all tables at startup via `Base.metadata.create_all()`. For schema changes that can't be done automatically, apply `backend/migrations/001_align_schema.sql` manually.

## Architecture

### Event Ingestion Pipeline

Every `POST /telemetry/event` (or `/api/v1/telemetry/event`) flows through `_ingest_event()` in [backend/app/routers/telemetry.py](backend/app/routers/telemetry.py):

1. Insert row into `telemetry_events`
2. `CostEngine` → computes LLM token cost + external tool cost + infra cost → upserts `cost_breakdown`
3. `SecurityEngine` → PII detection, risk scoring → inserts `data_security_logs`
4. `AlertEngine` → evaluates thresholds against `governance_rules` → inserts `alerts`
5. Upsert `daily_org_summary` (also rebuilt hourly by Celery beat)

### Background Tasks (Celery)

Configured in [backend/app/celery_app.py](backend/app/celery_app.py) with Redis as broker:

| Task | Schedule | Purpose |
|------|----------|---------|
| `daily-aggregation` | hourly | Aggregate costs/metrics into `daily_org_summary` |
| `monthly-aggregation` | daily | Pre-aggregate monthly stats |
| `anomaly-detection` | every 30 min | Detect usage spikes |
| `alert-scan` | every 30 min | Re-evaluate governance rules |

### API Routes

Routers live in [backend/app/routers/](backend/app/routers/). All routes are registered **twice** — unversioned (`/telemetry/*`) and versioned (`/api/v1/telemetry/*`) — in [backend/app/main.py](backend/app/main.py).

Key routers: `telemetry`, `summary`, `costs`, `security`, `alerts`, `alerts_security`, `tools`, `governance`, `organizations`, `projects`, `apikeys`, `budgets`, `pricing`, `models`, `workers`, `lookups`.

### Multi-Tenancy

All data is scoped by `org_id` (required) → `project_id` (optional) → `user_id` / `api_key_id`. The hierarchy is enforced via foreign keys: Organizations → Projects → Users → API Keys.

### Services (Business Logic)

- [backend/app/services/cost_engine.py](backend/app/services/cost_engine.py) — token-based LLM cost + latency-based infra cost + per-call tool cost
- [backend/app/services/alert_engine.py](backend/app/services/alert_engine.py) — threshold evaluation against `governance_rules`
- [backend/app/services/security_engine.py](backend/app/services/security_engine.py) — PII detection and risk scoring (currently mock patterns)

### Frontend Structure

- [frontend/src/api.js](frontend/src/api.js) — single Axios client file with 50+ typed endpoint functions; all backend calls go through here
- [frontend/src/App.js](frontend/src/App.js) — sidebar layout and react-router routes
- [frontend/src/pages/](frontend/src/pages/) — one file per dashboard page: `Dashboard`, `Cost`, `Tools`, `AlertsSecurity`, `Security`, `Organizations`, `SuperAdminLogs`, `TestEvent`

### Database Models

All ORM models are in [backend/app/models.py](backend/app/models.py). Core tables:

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
| `organizations`, `projects`, `users`, `api_keys` | Multi-tenancy hierarchy |

### Environment Variables

Copy [backend/.env.example](backend/.env.example) to `backend/.env`. Key vars:

- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis for Celery
- `CORS_ORIGINS` — comma-separated allowed origins (defaults to `*`)
- `ALERT_COST_THRESHOLD`, `ALERT_DATA_OUT_THRESHOLD_MB` — alert thresholds
- `LOOKUP_*` — comma-separated enums powering frontend dropdowns (auth types, tool types, providers, rule metrics, etc.)
