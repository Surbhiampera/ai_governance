from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import CostBreakdown, DailyOrgSummary, MonthlyOrgSummary, TelemetryEvent
from app.schemas import DailySummaryResponse, MonthlySummaryResponse, TodaySummaryResponse

router = APIRouter(prefix="/summary", tags=["summary"])


@router.get("/today", response_model=TodaySummaryResponse)
def get_today_summary(db: Session = Depends(get_db)):
    today = date.today()
    rows = db.query(DailyOrgSummary).filter(DailyOrgSummary.date == today).all()

    total_cost = sum((r.total_cost or Decimal("0")) for r in rows)
    total_events = sum((r.total_events or 0) for r in rows)

    tools = [DailySummaryResponse.model_validate(r) for r in rows]

    return TodaySummaryResponse(
        total_cost=total_cost,
        total_events=total_events,
        tools=tools,
    )


@router.get("/daily", response_model=list[DailySummaryResponse])
def get_daily_summary(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    org_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(DailyOrgSummary)
    if start:
        query = query.filter(DailyOrgSummary.date >= start)
    if end:
        query = query.filter(DailyOrgSummary.date <= end)
    if org_id:
        query = query.filter(DailyOrgSummary.org_id == org_id)
    if project_id:
        query = query.filter(DailyOrgSummary.project_id == project_id)
    rows = query.order_by(DailyOrgSummary.date).all()
    results = []
    for row in rows:
        token_total = db.query(func.coalesce(func.sum(CostBreakdown.quantity), 0)).join(
            TelemetryEvent, CostBreakdown.event_id == TelemetryEvent.event_id
        ).filter(
            TelemetryEvent.org_id == row.org_id,
            TelemetryEvent.project_id == row.project_id,
            TelemetryEvent.tool_name == row.tool_name,
            func.date(TelemetryEvent.created_at) == row.date,
            CostBreakdown.cost_type == "llm",
        ).scalar() or Decimal("0")
        row_data = {
            "org_id": row.org_id,
            "project_id": row.project_id,
            "tool_name": row.tool_name,
            "date": row.date,
            "total_events": row.total_events,
            "total_cost": row.total_cost,
            "llm_cost": row.llm_cost,
            "ml_cost": row.ml_cost,
            "infra_cost": row.infra_cost,
            "external_cost": row.external_cost,
            "total_tokens": Decimal(str(token_total)),
            "avg_latency_ms": row.avg_latency_ms,
            "success_count": row.success_count,
            "failure_count": row.failure_count,
            "total_input_mb": row.total_input_mb,
            "total_output_mb": row.total_output_mb,
        }
        results.append(DailySummaryResponse.model_validate(row_data))
    return results


@router.get("/monthly", response_model=list[MonthlySummaryResponse])
def get_monthly_summary(
    org_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(MonthlyOrgSummary)
    if org_id:
        query = query.filter(MonthlyOrgSummary.org_id == org_id)
    if project_id:
        query = query.filter(MonthlyOrgSummary.project_id == project_id)
    rows = query.order_by(MonthlyOrgSummary.month.desc()).all()
    results = []
    for row in rows:
        month_start = row.month.replace(day=1)
        if month_start.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1)

        token_total = db.query(func.coalesce(func.sum(CostBreakdown.quantity), 0)).join(
            TelemetryEvent, CostBreakdown.event_id == TelemetryEvent.event_id
        ).filter(
            TelemetryEvent.org_id == row.org_id,
            TelemetryEvent.project_id == row.project_id,
            TelemetryEvent.tool_name == row.tool_name,
            TelemetryEvent.created_at >= month_start,
            TelemetryEvent.created_at < month_end,
            CostBreakdown.cost_type == "llm",
        ).scalar() or Decimal("0")
        row_data = {
            "org_id": row.org_id,
            "project_id": row.project_id,
            "tool_name": row.tool_name,
            "month": row.month,
            "total_events": row.total_events,
            "total_cost": row.total_cost,
            "llm_cost": row.llm_cost,
            "ml_cost": row.ml_cost,
            "infra_cost": row.infra_cost,
            "external_cost": row.external_cost,
            "total_tokens": Decimal(str(token_total)),
            "avg_latency_ms": row.avg_latency_ms,
            "success_count": row.success_count,
            "failure_count": row.failure_count,
        }
        results.append(MonthlySummaryResponse.model_validate(row_data))
    return results


@router.get("/trends")
def get_usage_trends(
    org_id: Optional[str] = Query(None),
    days: int = Query(30),
    db: Session = Depends(get_db),
):
    from datetime import timedelta
    cutoff = date.today() - timedelta(days=days)
    query = db.query(
        DailyOrgSummary.date,
        func.sum(DailyOrgSummary.total_events).label("total_events"),
        func.sum(DailyOrgSummary.total_cost).label("total_cost"),
        func.avg(DailyOrgSummary.avg_latency_ms).label("avg_latency_ms"),
        func.sum(DailyOrgSummary.success_count).label("success_count"),
        func.sum(DailyOrgSummary.failure_count).label("failure_count"),
    ).filter(DailyOrgSummary.date >= cutoff)
    if org_id:
        query = query.filter(DailyOrgSummary.org_id == org_id)
    rows = query.group_by(DailyOrgSummary.date).order_by(DailyOrgSummary.date).all()
    return [
        {
            "date": str(r.date),
            "total_events": r.total_events or 0,
            "total_cost": float(r.total_cost or 0),
            "avg_latency_ms": round(float(r.avg_latency_ms or 0)),
            "success_count": r.success_count or 0,
            "failure_count": r.failure_count or 0,
        }
        for r in rows
    ]
