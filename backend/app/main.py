import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_cors_origins, get_log_level
from app.routers import alerts, alerts_security, apikeys, budgets, costs, governance, models, organizations, projects, security, summary, telemetry, tools, workers
from app.routers.telemetry_v1 import router as telemetry_v1_router

logging.basicConfig(
    level=get_log_level(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.database import Base, engine
    logger.info("Starting AI Governance API")
    Base.metadata.create_all(bind=engine)
    try:
        yield
    finally:
        logger.info("Shutting down AI Governance API")
        engine.dispose()


app = FastAPI(
    title="AI Governance Tool",
    version="1.0.0",
    description="Centralized AI governance platform for monitoring all AI tools.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Unversioned routes (backward compatible) ---
app.include_router(telemetry.router)
app.include_router(telemetry_v1_router)
app.include_router(summary.router)
app.include_router(tools.router)
app.include_router(models.router)
app.include_router(alerts.router)
app.include_router(costs.router)
app.include_router(security.router)
app.include_router(alerts_security.router)
app.include_router(governance.router)
app.include_router(organizations.router)
app.include_router(projects.router)
app.include_router(budgets.router)
app.include_router(apikeys.router)
app.include_router(workers.router)

# --- Versioned API aliases (/api/v1/...) ---
api_v1 = APIRouter(prefix="/api/v1")
for _router in [
    telemetry.router, summary.router, tools.router, models.router, alerts.router,
    costs.router, security.router, alerts_security.router, governance.router, organizations.router,
    projects.router, budgets.router, apikeys.router, workers.router,
]:
    api_v1.include_router(_router)
app.include_router(api_v1)


@app.get("/health")
def health_check():
    return {"status": "healthy"}
