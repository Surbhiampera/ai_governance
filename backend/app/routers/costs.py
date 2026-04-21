from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import DailyOrgSummary, MonthlyOrgSummary, TelemetryEvent

router = APIRouter(prefix="/costs", tags=["costs"])


@router.get("/by-model")
def cost_by_model(
    org_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(
            TelemetryEvent.model_name,
            TelemetryEvent.provider,
            func.count(TelemetryEvent.id).label("total_events"),
            func.sum(TelemetryEvent.prompt_tokens).label("prompt_tokens"),
            func.sum(TelemetryEvent.completion_tokens).label("completion_tokens"),
            func.sum(TelemetryEvent.total_tokens).label("total_tokens"),
            func.sum(TelemetryEvent.total_cost).label("total_cost"),
            func.avg(TelemetryEvent.latency_ms).label("avg_latency_ms"),
            func.sum(case((TelemetryEvent.status.in_(["success", "completed"]), 1), else_=0)).label("success_count"),
        )
        .filter(TelemetryEvent.model_name.isnot(None), TelemetryEvent.model_name != "")
        .group_by(TelemetryEvent.model_name, TelemetryEvent.provider)
        .order_by(func.sum(TelemetryEvent.total_cost).desc())
    )
    if org_id:
        rows = rows.filter(TelemetryEvent.org_id == org_id)

    results = []
    for r in rows.all():
        total = r.total_events or 0
        success_rate = Decimal("100") if total == 0 else (Decimal(str(r.success_count or 0)) / Decimal(str(total))) * Decimal("100")
        results.append({
            "model_name": r.model_name,
            "provider": r.provider or "—",
            "total_events": total,
            "prompt_tokens": r.prompt_tokens or 0,
            "completion_tokens": r.completion_tokens or 0,
            "total_tokens": r.total_tokens or 0,
            "total_cost": float(r.total_cost or 0),
            "avg_latency_ms": round(float(r.avg_latency_ms or 0), 1),
            "success_rate": round(float(success_rate), 1),
        })
    return results


@router.get("/by-project")
def cost_by_project(
    org_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(
            TelemetryEvent.project_id,
            TelemetryEvent.org_id,
            func.count(TelemetryEvent.id).label("total_events"),
            func.sum(TelemetryEvent.total_tokens).label("total_tokens"),
            func.sum(TelemetryEvent.total_cost).label("total_cost"),
            func.avg(TelemetryEvent.latency_ms).label("avg_latency_ms"),
        )
        .filter(TelemetryEvent.project_id.isnot(None), TelemetryEvent.project_id != "")
        .group_by(TelemetryEvent.project_id, TelemetryEvent.org_id)
        .order_by(func.sum(TelemetryEvent.total_cost).desc())
    )
    if org_id:
        rows = rows.filter(TelemetryEvent.org_id == org_id)

    return [
        {
            "project_id": r.project_id,
            "org_id": r.org_id,
            "total_events": r.total_events or 0,
            "total_tokens": r.total_tokens or 0,
            "total_cost": float(r.total_cost or 0),
            "avg_latency_ms": round(float(r.avg_latency_ms or 0), 1),
        }
        for r in rows.all()
    ]


@router.get("/daily")
def cost_daily(
    days: int = Query(14, ge=1, le=90),
    org_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    cutoff = date.today() - timedelta(days=days - 1)
    query = (
        db.query(
            DailyOrgSummary.date,
            DailyOrgSummary.tool_name,
            func.sum(DailyOrgSummary.total_cost).label("total_cost"),
            func.sum(DailyOrgSummary.total_tokens).label("total_tokens"),
            func.sum(DailyOrgSummary.total_events).label("total_events"),
        )
        .filter(DailyOrgSummary.date >= cutoff)
        .group_by(DailyOrgSummary.date, DailyOrgSummary.tool_name)
        .order_by(DailyOrgSummary.date.desc())
    )
    if org_id:
        query = query.filter(DailyOrgSummary.org_id == org_id)

    return [
        {
            "date": str(r.date),
            "tool_name": r.tool_name,
            "total_cost": float(r.total_cost or 0),
            "total_tokens": r.total_tokens or 0,
            "total_events": r.total_events or 0,
        }
        for r in query.all()
    ]


@router.get("/monthly")
def cost_monthly(
    org_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = (
        db.query(
            MonthlyOrgSummary.month,
            MonthlyOrgSummary.tool_name,
            func.sum(MonthlyOrgSummary.total_cost).label("total_cost"),
            func.sum(MonthlyOrgSummary.total_tokens).label("total_tokens"),
            func.sum(MonthlyOrgSummary.total_events).label("total_events"),
        )
        .group_by(MonthlyOrgSummary.month, MonthlyOrgSummary.tool_name)
        .order_by(MonthlyOrgSummary.month.desc())
    )
    if org_id:
        query = query.filter(MonthlyOrgSummary.org_id == org_id)

    return [
        {
            "month": str(r.month),
            "tool_name": r.tool_name,
            "total_cost": float(r.total_cost or 0),
            "total_tokens": r.total_tokens or 0,
            "total_events": r.total_events or 0,
        }
        for r in query.all()
    ]


@router.get("/totals")
def cost_totals(db: Session = Depends(get_db)):
    today = date.today()
    first_of_month = today.replace(day=1)

    daily_row = (
        db.query(
            func.sum(DailyOrgSummary.total_cost).label("cost"),
            func.sum(DailyOrgSummary.total_tokens).label("tokens"),
            func.sum(DailyOrgSummary.total_events).label("events"),
        )
        .filter(DailyOrgSummary.date == today)
        .first()
    )

    monthly_row = (
        db.query(
            func.sum(DailyOrgSummary.total_cost).label("cost"),
            func.sum(DailyOrgSummary.total_tokens).label("tokens"),
            func.sum(DailyOrgSummary.total_events).label("events"),
        )
        .filter(DailyOrgSummary.date >= first_of_month)
        .first()
    )

    all_time = (
        db.query(
            func.sum(TelemetryEvent.total_cost).label("cost"),
            func.sum(TelemetryEvent.total_tokens).label("tokens"),
            func.count(TelemetryEvent.id).label("events"),
        )
        .first()
    )

    return {
        "today": {
            "cost": float(daily_row.cost or 0) if daily_row else 0,
            "tokens": int(daily_row.tokens or 0) if daily_row else 0,
            "events": int(daily_row.events or 0) if daily_row else 0,
        },
        "this_month": {
            "cost": float(monthly_row.cost or 0) if monthly_row else 0,
            "tokens": int(monthly_row.tokens or 0) if monthly_row else 0,
            "events": int(monthly_row.events or 0) if monthly_row else 0,
        },
        "all_time": {
            "cost": float(all_time.cost or 0) if all_time else 0,
            "tokens": int(all_time.tokens or 0) if all_time else 0,
            "events": int(all_time.events or 0) if all_time else 0,
        },
    }
