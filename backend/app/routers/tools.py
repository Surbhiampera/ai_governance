from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import CostBreakdown, TelemetryEvent, ToolRegistry
from app.schemas import ToolRegistryCreate, ToolRegistryResponse, ToolUsageResponse

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("/", response_model=list[ToolRegistryResponse])
def list_tools(db: Session = Depends(get_db)):
    return db.query(ToolRegistry).all()


@router.post("/register", response_model=ToolRegistryResponse)
def register_tool(tool_data: ToolRegistryCreate, db: Session = Depends(get_db)):
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


@router.get("/usage", response_model=list[ToolUsageResponse])
def get_tool_usage(db: Session = Depends(get_db)):
    tools = db.query(ToolRegistry).all()
    results = []

    for tool in tools:
        # Count events
        event_count = db.query(func.count(TelemetryEvent.event_id)).filter(
            TelemetryEvent.tool_name == tool.tool_name
        ).scalar() or 0

        # Sum total cost
        total_cost = db.query(func.coalesce(func.sum(CostBreakdown.total_cost), 0)).join(
            TelemetryEvent, CostBreakdown.event_id == TelemetryEvent.event_id
        ).filter(
            TelemetryEvent.tool_name == tool.tool_name
        ).scalar() or Decimal("0")

        # Sum tokens from LLM cost_breakdown quantity
        token_qty = db.query(func.coalesce(func.sum(CostBreakdown.quantity), 0)).join(
            TelemetryEvent, CostBreakdown.event_id == TelemetryEvent.event_id
        ).filter(
            TelemetryEvent.tool_name == tool.tool_name,
            CostBreakdown.cost_type == "llm",
        ).scalar() or Decimal("0")

        results.append(ToolUsageResponse(
            tool_name=tool.tool_name,
            vendor=tool.vendor,
            total_events=event_count,
            total_cost=Decimal(str(total_cost)),
            total_tokens=Decimal(str(token_qty)),
            total_tokens_in=Decimal(str(token_qty)),
            total_tokens_out=Decimal("0"),
        ))

    return results
