from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import case, func

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import DailyOrgSummary, MonthlyOrgSummary, TelemetryEvent, UsageAnomaly
from app.services.alert_engine import AlertEngine


def _rebuild_daily_summary(db, summary_date: date) -> int:
    rows = (
        db.query(
            TelemetryEvent.org_id,
            TelemetryEvent.project_id,
            TelemetryEvent.model_name,
            func.count(TelemetryEvent.id).label("total_events"),
            func.sum(TelemetryEvent.total_cost).label("total_cost"),
            func.sum(TelemetryEvent.llm_cost).label("llm_cost"),
            func.sum(TelemetryEvent.infra_cost).label("infra_cost"),
            func.sum(TelemetryEvent.external_cost).label("external_cost"),
            func.sum(TelemetryEvent.prompt_tokens).label("total_prompt_tokens"),
            func.sum(TelemetryEvent.completion_tokens).label("total_completion_tokens"),
            func.sum(TelemetryEvent.total_tokens).label("total_tokens"),
            func.avg(TelemetryEvent.latency_ms).label("avg_latency_ms"),
            func.sum(case((TelemetryEvent.status.in_(["success", "completed"]), 1), else_=0)).label("success_count"),
            func.sum(case((TelemetryEvent.status.in_(["success", "completed"]), 0), else_=1)).label("failure_count"),
            func.sum(case((TelemetryEvent.abnormal_usage_spike.is_(True), 1), else_=0)).label("anomaly_count"),
            func.sum(case((TelemetryEvent.misuse_detected.is_(True), 1), else_=0)).label("misuse_count"),
            func.sum(TelemetryEvent.input_data_size_mb).label("total_input_mb"),
            func.sum(TelemetryEvent.output_data_size_mb).label("total_output_mb"),
            func.avg(TelemetryEvent.risk_score).label("avg_risk_score"),
        )
        .filter(func.date(TelemetryEvent.created_at) == summary_date)
        .group_by(TelemetryEvent.org_id, TelemetryEvent.project_id, TelemetryEvent.model_name)
        .all()
    )

    db.query(DailyOrgSummary).filter(DailyOrgSummary.date == summary_date).delete(synchronize_session=False)

    for row in rows:
        db.add(
            DailyOrgSummary(
                org_id=row.org_id,
                project_id=row.project_id,
                tool_name=row.model_name or "",
                date=summary_date,
                total_events=row.total_events or 0,
                total_cost=row.total_cost or Decimal("0"),
                llm_cost=row.llm_cost or Decimal("0"),
                infra_cost=row.infra_cost or Decimal("0"),
                external_cost=row.external_cost or Decimal("0"),
                total_prompt_tokens=row.total_prompt_tokens or 0,
                total_completion_tokens=row.total_completion_tokens or 0,
                total_tokens=row.total_tokens or 0,
                avg_latency_ms=int(row.avg_latency_ms or 0),
                success_count=row.success_count or 0,
                failure_count=row.failure_count or 0,
                anomaly_count=row.anomaly_count or 0,
                misuse_count=row.misuse_count or 0,
                total_input_mb=row.total_input_mb or Decimal("0"),
                total_output_mb=row.total_output_mb or Decimal("0"),
                avg_risk_score=Decimal(str(row.avg_risk_score or 0)).quantize(Decimal("0.01")),
            )
        )
    db.flush()
    return len(rows)


@celery_app.task(name="app.workers.tasks.run_daily_aggregation")
def run_daily_aggregation():
    db = SessionLocal()
    try:
        rows_processed = _rebuild_daily_summary(db, date.today())
        db.commit()
        return {"status": "ok", "rows_processed": rows_processed}
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.run_monthly_aggregation")
def run_monthly_aggregation():
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
                func.sum(DailyOrgSummary.infra_cost).label("infra_cost"),
                func.sum(DailyOrgSummary.external_cost).label("external_cost"),
                func.sum(DailyOrgSummary.total_tokens).label("total_tokens"),
                func.sum(DailyOrgSummary.total_prompt_tokens).label("total_prompt_tokens"),
                func.sum(DailyOrgSummary.total_completion_tokens).label("total_completion_tokens"),
                func.avg(DailyOrgSummary.avg_latency_ms).label("avg_latency_ms"),
                func.sum(DailyOrgSummary.success_count).label("success_count"),
                func.sum(DailyOrgSummary.failure_count).label("failure_count"),
                func.sum(DailyOrgSummary.anomaly_count).label("anomaly_count"),
                func.sum(DailyOrgSummary.misuse_count).label("misuse_count"),
            )
            .filter(DailyOrgSummary.date >= month_start, DailyOrgSummary.date <= today)
            .group_by(DailyOrgSummary.org_id, DailyOrgSummary.project_id, DailyOrgSummary.tool_name)
            .all()
        )

        db.query(MonthlyOrgSummary).filter(MonthlyOrgSummary.month == month_start).delete(synchronize_session=False)

        for row in rows:
            db.add(
                MonthlyOrgSummary(
                    org_id=row.org_id,
                    project_id=row.project_id,
                    tool_name=row.tool_name,
                    month=month_start,
                    total_events=row.total_events or 0,
                    total_cost=row.total_cost or Decimal("0"),
                    llm_cost=row.llm_cost or Decimal("0"),
                    infra_cost=row.infra_cost or Decimal("0"),
                    external_cost=row.external_cost or Decimal("0"),
                    total_tokens=row.total_tokens or 0,
                    total_prompt_tokens=row.total_prompt_tokens or 0,
                    total_completion_tokens=row.total_completion_tokens or 0,
                    avg_latency_ms=int(row.avg_latency_ms or 0),
                    success_count=row.success_count or 0,
                    failure_count=row.failure_count or 0,
                    anomaly_count=row.anomaly_count or 0,
                    misuse_count=row.misuse_count or 0,
                )
            )
        db.commit()
        return {"status": "ok", "rows_processed": len(rows)}
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.run_anomaly_detection")
def run_anomaly_detection():
    db = SessionLocal()
    try:
        today = date.today()
        tool_rows = (
            db.query(
                DailyOrgSummary.org_id,
                DailyOrgSummary.tool_name,
                func.sum(DailyOrgSummary.total_events).label("events_today"),
                func.sum(DailyOrgSummary.total_cost).label("cost_today"),
                func.avg(DailyOrgSummary.avg_latency_ms).label("latency_today"),
            )
            .filter(DailyOrgSummary.date == today)
            .group_by(DailyOrgSummary.org_id, DailyOrgSummary.tool_name)
            .all()
        )

        created = 0
        for row in tool_rows:
            baseline_rows = (
                db.query(
                    func.avg(DailyOrgSummary.total_events).label("avg_events"),
                    func.avg(DailyOrgSummary.total_cost).label("avg_cost"),
                    func.avg(DailyOrgSummary.avg_latency_ms).label("avg_latency"),
                )
                .filter(
                    DailyOrgSummary.org_id == row.org_id,
                    DailyOrgSummary.tool_name == row.tool_name,
                    DailyOrgSummary.date >= today - timedelta(days=7),
                    DailyOrgSummary.date < today,
                )
                .first()
            )
            if not baseline_rows or not baseline_rows.avg_events:
                continue

            checks = [
                ("usage_spike", Decimal(str(baseline_rows.avg_events or 0)), Decimal(str(row.events_today or 0))),
                ("cost_spike", Decimal(str(baseline_rows.avg_cost or 0)), Decimal(str(row.cost_today or 0))),
                ("latency_spike", Decimal(str(baseline_rows.avg_latency or 0)), Decimal(str(row.latency_today or 0))),
            ]
            for anomaly_type, baseline, observed in checks:
                if baseline <= 0:
                    continue
                score = observed / baseline
                if score >= Decimal("1.8"):
                    db.add(
                        UsageAnomaly(
                            org_id=row.org_id,
                            tool_name=row.tool_name,
                            anomaly_type=anomaly_type,
                            severity="high" if score >= Decimal("2.5") else "medium",
                            anomaly_score=score.quantize(Decimal("0.01")),
                            baseline_value=baseline.quantize(Decimal("0.01")),
                            observed_value=observed.quantize(Decimal("0.01")),
                            message=f"{anomaly_type.replace('_', ' ')} detected for {row.tool_name}: {observed:.2f} vs baseline {baseline:.2f}.",
                        )
                    )
                    created += 1

        db.commit()
        return {"status": "ok", "anomalies_created": created}
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.run_alert_scan")
def run_alert_scan():
    db = SessionLocal()
    try:
        engine = AlertEngine()
        created = engine.create_daily_anomaly_alerts(db)
        db.commit()
        return {"status": "ok", "alerts_created": created}
    finally:
        db.close()
