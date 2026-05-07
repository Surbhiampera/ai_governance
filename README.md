# AI Governance Tool — Super Admin Layer

A centralized AI governance platform that monitors **all** AI tools in an organization in real-time: LLMs, ML models, Celery workers, Redis caches, external APIs — all treated as unified telemetry events.

## Architecture

```
ai_governance/
├── backend/          # FastAPI + SQLAlchemy + PostgreSQL
│   ├── app/
│   │   ├── core/         # Dependencies (get_db)
│   │   ├── routers/      # API endpoints
│   │   │   ├── telemetry.py   # POST /telemetry/event
│   │   │   ├── summary.py     # GET /summary/today, /summary/daily
│   │   │   ├── tools.py       # GET/POST /tools/, GET /tools/usage
│   │   │   ├── alerts.py      # GET /alerts/, PATCH /alerts/{id}/resolve
│   │   │   └── security.py    # GET /security/logs, /security/summary
│   │   ├── services/     # Business logic
│   │   │   ├── cost_engine.py      # LLM + external + infra cost calculation
│   │   │   ├── security_engine.py  # PII detection (mock)
│   │   │   └── alert_engine.py     # Threshold-based alerting
│   │   ├── models.py     # SQLAlchemy ORM (7 tables)
│   │   ├── schemas.py    # Pydantic v2 request/response models
│   │   ├── database.py   # DB connection
│   │   └── main.py       # FastAPI app
│   ├── requirements.txt
│   └── .env.example
├── frontend/         # React dashboard
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.js   # Metrics + charts
│       │   ├── Tools.js       # Tool registry + usage
│       │   ├── Alerts.js      # Alert management
│       │   ├── Security.js    # PII & risk monitoring
│       │   └── TestEvent.js   # Send test telemetry events
│       ├── api.js             # Axios API client
│       ├── App.js             # Router + sidebar layout
│       └── App.css            # Styling
```

## Database Tables (PostgreSQL — already created)

| Table                | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| `telemetry_events`   | Universal event log (heart of system)          |
| `cost_breakdown`     | LLM + external + infra cost split per event    |
| `tool_registry`      | Registry of all tools/models/vendors           |
| `execution_pipeline` | Pipeline stage tracking                        |
| `alerts`             | Cost, usage, latency, PII alerts               |
| `data_security_logs` | PII detection & risk scoring per event         |
| `daily_org_summary`  | Pre-aggregated daily stats for fast dashboards |

## Quick Start

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env       # Edit with your DB credentials
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm start                    # Runs on your configured frontend origin
```

## Core API Flow

```
ANY TOOL → POST /telemetry/event → telemetry_events
                                 → cost_engine → cost_breakdown
                                 → security_engine → data_security_logs
                                 → alert_engine → alerts
                                 → upsert daily_org_summary
```

## New Governance Capabilities

- Live per-tool daily cost monitoring including LLM token spend and infrastructure cost
- Same-day spend-cap alerts for token volume and cost thresholds
- Data security tracking for data-out MB and PII detection with critical alerts
- Super-admin log access via `/telemetry/logs` for cross-tool audit and root-cause analysis
- Multi-vendor tool registry with pluggable tool onboarding and vendor-aware usage metrics
- Pilot-ready design for Royal Sundaram with client isolation and enterprise deployment in mind

## Cost Engine

| Cost Type | Calculation                                                                           |
| --------- | ------------------------------------------------------------------------------------- |
| LLM       | `(input_tokens + output_tokens) / 1000 × rate` (from tool_registry / model_pricing) |
| External  | Sum of `external_tools[].cost`                                                        |
| Infra     | `latency_ms × INFRA_COST_PER_MS_USD`                                                  |

## Sample Telemetry Event

```json
{
  "event_id": "550e8400-e29b-41d4-a716-446655440000",
  "tool_name": "seo_tool",
  "component_name": "gpt-4",
  "service_type": "llm",
  "execution_type": "inference",
  "user_id": "user1",
  "org_id": "<DEFAULT_ORG_ID>",
  "input_data_size_mb": 0.2,
  "output_data_size_mb": 1.5,
  "tokens": { "input": 1200, "output": 300 },
  "external_tools": [{ "name": "serpapi", "cost": 0.01 }],
  "latency_ms": 450
}
```
