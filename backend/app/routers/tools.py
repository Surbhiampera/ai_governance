from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import TelemetryEvent, ToolConnector, ToolRegistry
from app.schemas import (
    ToolConnectorCreate,
    ToolConnectorResponse,
    ToolRegistryCreate,
    ToolRegistryResponse,
    ToolUsageResponse,
)

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("/", response_model=list[ToolRegistryResponse])
def list_tools(db: Session = Depends(get_db)):
    return db.query(ToolRegistry).order_by(ToolRegistry.tool_name.asc()).all()


@router.post("/register", response_model=ToolRegistryResponse)
def register_tool(tool_data: ToolRegistryCreate, db: Session = Depends(get_db)):
    tool = db.query(ToolRegistry).filter(ToolRegistry.tool_name == tool_data.tool_name).first()
    if tool:
        tool.tool_type = tool_data.tool_type
        tool.vendor = tool_data.vendor
        tool.cost_model = tool_data.cost_model
        tool.base_cost = tool_data.base_cost
    else:
        tool = ToolRegistry(
            tool_name=tool_data.tool_name,
            tool_type=tool_data.tool_type,
            vendor=tool_data.vendor,
            cost_model=tool_data.cost_model,
            base_cost=tool_data.base_cost,
        )
        db.add(tool)
    db.commit()
    db.refresh(tool)
    return tool


@router.get("/connectors", response_model=list[ToolConnectorResponse])
def list_connectors(db: Session = Depends(get_db)):
    return db.query(ToolConnector).order_by(ToolConnector.created_at.desc()).all()


@router.post("/connectors", response_model=ToolConnectorResponse)
def create_connector(connector_data: ToolConnectorCreate, db: Session = Depends(get_db)):
    connector = db.query(ToolConnector).filter(ToolConnector.connector_name == connector_data.connector_name).first()
    if connector:
        connector.tool_name = connector_data.tool_name
        connector.provider = connector_data.provider
        connector.endpoint_url = connector_data.endpoint_url
        connector.auth_type = connector_data.auth_type
        connector.ingestion_mode = connector_data.ingestion_mode
        connector.status = connector_data.status
        connector.org_id = connector_data.org_id
        connector.project_id = connector_data.project_id
        if connector_data.api_key is not None:
            connector.api_key = connector_data.api_key
    else:
        connector = ToolConnector(**connector_data.model_dump())
        db.add(connector)
    db.commit()
    db.refresh(connector)
    return connector


@router.get("/usage", response_model=list[ToolUsageResponse])
def get_tool_usage(db: Session = Depends(get_db)):
    rows = (
        db.query(
            TelemetryEvent.model_name,
            func.max(ToolRegistry.vendor).label("vendor"),
            func.count(TelemetryEvent.id).label("total_events"),
            func.sum(TelemetryEvent.total_cost).label("total_cost"),
            func.sum(TelemetryEvent.total_tokens).label("total_tokens"),
            func.sum(TelemetryEvent.prompt_tokens).label("total_prompt_tokens"),
            func.sum(TelemetryEvent.completion_tokens).label("total_completion_tokens"),
            func.avg(TelemetryEvent.latency_ms).label("avg_latency_ms"),
            func.sum(case((TelemetryEvent.status.in_(["success", "completed"]), 1), else_=0)).label("success_count"),
        )
        .outerjoin(ToolRegistry, ToolRegistry.tool_name == TelemetryEvent.model_name)
        .group_by(TelemetryEvent.model_name)
        .order_by(func.sum(TelemetryEvent.total_cost).desc())
        .all()
    )

    results = []
    for row in rows:
        total_events = row.total_events or 0
        success_rate = Decimal("100") if total_events == 0 else (Decimal(str(row.success_count or 0)) / Decimal(str(total_events))) * Decimal("100")
        results.append(
            ToolUsageResponse(
                tool_name=row.model_name or "",
                vendor=row.vendor,
                total_events=total_events,
                total_cost=Decimal(str(row.total_cost or 0)),
                total_tokens=Decimal(str(row.total_tokens or 0)),
                total_prompt_tokens=Decimal(str(row.total_prompt_tokens or 0)),
                total_completion_tokens=Decimal(str(row.total_completion_tokens or 0)),
                avg_latency_ms=Decimal(str(row.avg_latency_ms or 0)).quantize(Decimal("0.01")),
                success_rate=success_rate.quantize(Decimal("0.01")),
            )
        )
    return results
