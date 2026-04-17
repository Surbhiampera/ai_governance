from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import DailyOrgSummary, MonthlyOrgSummary
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
    return [DailySummaryResponse.model_validate(r) for r in rows]


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
    return [MonthlySummaryResponse.model_validate(r) for r in rows]


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
