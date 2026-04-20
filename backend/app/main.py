from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import alerts, apikeys, budgets, governance, organizations, projects, security, summary, telemetry, tools, workers

app = FastAPI(title="AI Governance Tool", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(telemetry.router)
app.include_router(summary.router)
app.include_router(tools.router)
app.include_router(alerts.router)
app.include_router(security.router)
app.include_router(governance.router)
app.include_router(organizations.router)
app.include_router(projects.router)
app.include_router(budgets.router)
app.include_router(apikeys.router)
app.include_router(workers.router)


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.on_event("startup")
def on_startup():
    from app.database import Base, engine
    Base.metadata.create_all(bind=engine)
