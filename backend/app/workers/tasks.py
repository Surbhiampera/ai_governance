from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import DailyOrgSummary, MonthlyOrgSummary, TelemetryEvent, CostBreakdown


@celery_app.task(name="app.workers.tasks.run_daily_aggregation")
def run_daily_aggregation():
    """Aggregate telemetry_events into daily_org_summary for today."""
    db = SessionLocal()
    try:
        today = date.today()
        rows = (
            db.query(
                TelemetryEvent.org_id,
                TelemetryEvent.project_id,
                TelemetryEvent.tool_name,
                func.count(TelemetryEvent.id).label("total_events"),
                func.avg(TelemetryEvent.latency_ms).label("avg_latency_ms"),
                func.sum(TelemetryEvent.input_data_size_mb).label("total_input_mb"),
                func.sum(TelemetryEvent.output_data_size_mb).label("total_output_mb"),
                func.count(TelemetryEvent.id).filter(TelemetryEvent.status == "success").label("success_count"),
                func.count(TelemetryEvent.id).filter(TelemetryEvent.status != "success").label("failure_count"),
            )
            .filter(func.date(TelemetryEvent.created_at) == today)
            .group_by(TelemetryEvent.org_id, TelemetryEvent.project_id, TelemetryEvent.tool_name)
            .all()
        )

        for row in rows:
            # Get cost totals from cost_breakdown
            event_ids = [
                e.event_id
                for e in db.query(TelemetryEvent.event_id)
                .filter(
                    TelemetryEvent.org_id == row.org_id,
                    TelemetryEvent.project_id == row.project_id,
                    TelemetryEvent.tool_name == row.tool_name,
                    func.date(TelemetryEvent.created_at) == today,
                )
                .all()
            ]

            cost_query = (
                db.query(
                    CostBreakdown.cost_type,
                    func.coalesce(func.sum(CostBreakdown.total_cost), 0).label("cost"),
                )
                .filter(CostBreakdown.event_id.in_(event_ids))
                .group_by(CostBreakdown.cost_type)
                .all()
            )

            cost_map = {c.cost_type: Decimal(str(c.cost)) for c in cost_query}
            total_cost = sum(cost_map.values(), Decimal("0"))

            stmt = insert(DailyOrgSummary).values(
                org_id=row.org_id,
                project_id=row.project_id,
                tool_name=row.tool_name,
                date=today,
                total_events=row.total_events or 0,
                total_cost=total_cost,
                llm_cost=cost_map.get("llm", Decimal("0")),
                ml_cost=cost_map.get("ml", Decimal("0")),
                infra_cost=cost_map.get("infra", Decimal("0")),
                external_cost=cost_map.get("external", Decimal("0")),
                avg_latency_ms=int(row.avg_latency_ms or 0),
                success_count=row.success_count or 0,
                failure_count=row.failure_count or 0,
                total_input_mb=row.total_input_mb or Decimal("0"),
                total_output_mb=row.total_output_mb or Decimal("0"),
            ).on_conflict_do_update(
                index_elements=["org_id", "project_id", "tool_name", "date"],
                set_={
                    "total_events": row.total_events or 0,
                    "total_cost": total_cost,
                    "llm_cost": cost_map.get("llm", Decimal("0")),
                    "ml_cost": cost_map.get("ml", Decimal("0")),
                    "infra_cost": cost_map.get("infra", Decimal("0")),
                    "external_cost": cost_map.get("external", Decimal("0")),
                    "avg_latency_ms": int(row.avg_latency_ms or 0),
                    "success_count": row.success_count or 0,
                    "failure_count": row.failure_count or 0,
                    "total_input_mb": row.total_input_mb or Decimal("0"),
                    "total_output_mb": row.total_output_mb or Decimal("0"),
                },
            )
            db.execute(stmt)

        db.commit()
        return {"status": "ok", "rows_processed": len(rows)}
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.run_monthly_aggregation")
def run_monthly_aggregation():
    """Aggregate daily_org_summary into monthly_org_summary for the current month."""
    db = SessionLocal()
    try:
        today = date.today()
        month_start = today.replace(day=1)

        rows = (
            db.query(
                DailyOrgSummary.org_id,
                DailyOrgSummary.project_id,
                DailyOrgSummary.tool_name,
                func.sum(DailyOrgSummary.total_events).label("total_events"),
                func.sum(DailyOrgSummary.total_cost).label("total_cost"),
                func.sum(DailyOrgSummary.llm_cost).label("llm_cost"),
                func.sum(DailyOrgSummary.ml_cost).label("ml_cost"),
                func.sum(DailyOrgSummary.infra_cost).label("infra_cost"),
                func.sum(DailyOrgSummary.external_cost).label("external_cost"),
                func.avg(DailyOrgSummary.avg_latency_ms).label("avg_latency_ms"),
                func.sum(DailyOrgSummary.success_count).label("success_count"),
                func.sum(DailyOrgSummary.failure_count).label("failure_count"),
            )
            .filter(DailyOrgSummary.date >= month_start)
            .group_by(DailyOrgSummary.org_id, DailyOrgSummary.project_id, DailyOrgSummary.tool_name)
            .all()
        )

        for row in rows:
            stmt = insert(MonthlyOrgSummary).values(
                org_id=row.org_id,
                project_id=row.project_id,
                tool_name=row.tool_name,
                month=month_start,
                total_events=row.total_events or 0,
                total_cost=row.total_cost or Decimal("0"),
                llm_cost=row.llm_cost or Decimal("0"),
                ml_cost=row.ml_cost or Decimal("0"),
                infra_cost=row.infra_cost or Decimal("0"),
                external_cost=row.external_cost or Decimal("0"),
                avg_latency_ms=int(row.avg_latency_ms or 0),
                success_count=row.success_count or 0,
                failure_count=row.failure_count or 0,
            ).on_conflict_do_update(
                index_elements=["org_id", "project_id", "tool_name", "month"],
                set_={
                    "total_events": row.total_events or 0,
                    "total_cost": row.total_cost or Decimal("0"),
                    "llm_cost": row.llm_cost or Decimal("0"),
                    "ml_cost": row.ml_cost or Decimal("0"),
                    "infra_cost": row.infra_cost or Decimal("0"),
                    "external_cost": row.external_cost or Decimal("0"),
                    "avg_latency_ms": int(row.avg_latency_ms or 0),
                    "success_count": row.success_count or 0,
                    "failure_count": row.failure_count or 0,
                },
            )
            db.execute(stmt)

        db.commit()
        return {"status": "ok", "rows_processed": len(rows)}
    finally:
        db.close()
