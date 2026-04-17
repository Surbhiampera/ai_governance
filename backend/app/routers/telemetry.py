from datetime import datetime, timedelta, date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import CostBreakdown, DataSecurityLog, DailyOrgSummary, TelemetryEvent
from app.schemas import (
    CostBreakdownResponse,
    TelemetryEventCreate,
    TelemetryEventResponse,
)
from app.services.alert_engine import AlertEngine
from app.services.cost_engine import CostEngine
from app.services.security_engine import SecurityEngine

router = APIRouter(prefix="/telemetry", tags=["telemetry"])

cost_engine = CostEngine()
security_engine = SecurityEngine()
alert_engine = AlertEngine()


@router.post("/event", response_model=TelemetryEventResponse)
def create_event(event_data: TelemetryEventCreate, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    end_time = now + timedelta(milliseconds=event_data.latency_ms)

    # 1. Save telemetry event
    telemetry = TelemetryEvent(
        event_id=event_data.event_id,
        org_id=event_data.org_id,
        project_id=event_data.project_id,
        user_id=event_data.user_id,
        tool_name=event_data.tool_name,
        service_type=event_data.service_type,
        component_name=event_data.component_name,
        execution_type=event_data.execution_type,
        status=event_data.status,
        input_data_size_mb=event_data.input_data_size_mb,
        output_data_size_mb=event_data.output_data_size_mb,
        start_time=now,
        end_time=end_time,
        latency_ms=event_data.latency_ms,
    )
    db.add(telemetry)
    db.flush()

    # 2. Calculate costs
    cost_summary = cost_engine.calculate(event_data, db)

    # 3. Insert cost_breakdown rows
    cost_rows = []

    if cost_summary.llm_cost > 0:
        token_qty = Decimal("0")
        if event_data.tokens:
            token_qty = Decimal(str(event_data.tokens.input + event_data.tokens.output))
        row = CostBreakdown(
            event_id=event_data.event_id,
            cost_type="llm",
            component_name=event_data.component_name,
            unit_cost=cost_summary.llm_cost / token_qty * Decimal("1000") if token_qty > 0 else Decimal("0"),
            quantity=token_qty,
            total_cost=cost_summary.llm_cost,
        )
        db.add(row)
        cost_rows.append(row)

    if cost_summary.external_cost > 0:
        row = CostBreakdown(
            event_id=event_data.event_id,
            cost_type="external",
            component_name="external_tools",
            unit_cost=cost_summary.external_cost,
            quantity=Decimal(str(len(event_data.external_tools))),
            total_cost=cost_summary.external_cost,
        )
        db.add(row)
        cost_rows.append(row)

    if cost_summary.infra_cost > 0:
        row = CostBreakdown(
            event_id=event_data.event_id,
            cost_type="infra",
            component_name="compute",
            unit_cost=Decimal("0.0001"),
            quantity=Decimal(str(event_data.latency_ms)),
            total_cost=cost_summary.infra_cost,
        )
        db.add(row)
        cost_rows.append(row)

    db.flush()

    # 4. Security analysis
    security_result = security_engine.analyze(event_data)
    security_log = DataSecurityLog(
        event_id=event_data.event_id,
        pii_detected=security_result["pii_detected"],
        pii_type=security_result["pii_type"],
        masking_applied=security_result["masking_applied"],
        risk_score=security_result["risk_score"],
        data_in_mb=event_data.input_data_size_mb,
        data_out_mb=event_data.output_data_size_mb,
    )
    db.add(security_log)
    db.flush()

    # 5. Alert evaluation
    alert_engine.evaluate(db, event_data, cost_summary, security_result)

    # 6. Upsert daily_org_summary
    today = date.today()
    is_success = 1 if event_data.status == "success" else 0
    is_failure = 1 if event_data.status != "success" else 0
    stmt = insert(DailyOrgSummary).values(
        org_id=event_data.org_id,
        project_id=event_data.project_id,
        tool_name=event_data.tool_name,
        date=today,
        total_events=1,
        total_cost=cost_summary.total_cost,
        llm_cost=cost_summary.llm_cost,
        ml_cost=Decimal("0"),
        infra_cost=cost_summary.infra_cost,
        external_cost=cost_summary.external_cost,
        avg_latency_ms=event_data.latency_ms,
        success_count=is_success,
        failure_count=is_failure,
        total_input_mb=event_data.input_data_size_mb,
        total_output_mb=event_data.output_data_size_mb,
    ).on_conflict_do_update(
        index_elements=["org_id", "project_id", "tool_name", "date"],
        set_={
            "total_events": DailyOrgSummary.total_events + 1,
            "total_cost": DailyOrgSummary.total_cost + cost_summary.total_cost,
            "llm_cost": DailyOrgSummary.llm_cost + cost_summary.llm_cost,
            "infra_cost": DailyOrgSummary.infra_cost + cost_summary.infra_cost,
            "external_cost": DailyOrgSummary.external_cost + cost_summary.external_cost,
            "success_count": DailyOrgSummary.success_count + is_success,
            "failure_count": DailyOrgSummary.failure_count + is_failure,
            "total_input_mb": DailyOrgSummary.total_input_mb + event_data.input_data_size_mb,
            "total_output_mb": DailyOrgSummary.total_output_mb + event_data.output_data_size_mb,
        },
    )
    db.execute(stmt)
    db.commit()
    db.refresh(telemetry)

    # 7. Build response
    breakdown_responses = [
        CostBreakdownResponse(
            cost_type=r.cost_type,
            component_name=r.component_name,
            unit_cost=r.unit_cost,
            quantity=r.quantity,
            total_cost=r.total_cost,
        )
        for r in cost_rows
    ]

    return TelemetryEventResponse(
        event_id=telemetry.event_id,
        org_id=telemetry.org_id,
        project_id=telemetry.project_id,
        user_id=telemetry.user_id,
        tool_name=telemetry.tool_name,
        service_type=telemetry.service_type,
        component_name=telemetry.component_name,
        execution_type=telemetry.execution_type,
        status=telemetry.status,
        input_data_size_mb=telemetry.input_data_size_mb,
        output_data_size_mb=telemetry.output_data_size_mb,
        start_time=telemetry.start_time,
        end_time=telemetry.end_time,
        latency_ms=telemetry.latency_ms,
        created_at=telemetry.created_at,
        cost_breakdown=breakdown_responses,
    )


@router.get("/logs", response_model=list[TelemetryEventResponse])
def list_telemetry_logs(
    org_id: Optional[str] = Query(None),
    tool_name: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(TelemetryEvent)
    if org_id:
        query = query.filter(TelemetryEvent.org_id == org_id)
    if tool_name:
        query = query.filter(TelemetryEvent.tool_name == tool_name)
    if start_date:
        query = query.filter(TelemetryEvent.created_at >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        query = query.filter(TelemetryEvent.created_at <= datetime.combine(end_date, datetime.max.time()))
    rows = query.order_by(TelemetryEvent.created_at.desc()).all()
    return [TelemetryEventResponse.model_validate(r) for r in rows]
