from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import Alert, CostBreakdown, DataSecurityLog, DailyOrgSummary, ExecutionPipeline, TelemetryEvent, UsageAnomaly
from app.schemas import (
    BatchTelemetryIngest,
    CostBreakdownResponse,
    TelemetryEventCreate,
    TelemetryEventResponse,
    TelemetryEventUpdate,
    TraceDetailResponse,
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
    event = _ingest_event(db, event_data)
    db.commit()
    return _build_event_response(db, event)


@router.post("/events/batch")
def ingest_events_batch(batch: BatchTelemetryIngest, db: Session = Depends(get_db)):
    ingested = []
    for event_data in batch.events:
        event = _ingest_event(db, event_data)
        ingested.append(event.event_id)
    db.commit()
    return {"status": "completed", "ingested_count": len(ingested), "event_ids": ingested}


@router.get("/logs", response_model=list[TelemetryEventResponse])
def list_telemetry_logs(
    org_id: Optional[str] = Query(None),
    tool_name: Optional[str] = Query(None),
    provider: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(50, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(TelemetryEvent)
    if org_id:
        query = query.filter(TelemetryEvent.org_id == org_id)
    if tool_name:
        query = query.filter(TelemetryEvent.model_name == tool_name)
    if provider:
        query = query.filter(TelemetryEvent.provider == provider)
    if status:
        query = query.filter(TelemetryEvent.status == status)
    if start_date:
        query = query.filter(TelemetryEvent.created_at >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        query = query.filter(TelemetryEvent.created_at <= datetime.combine(end_date, datetime.max.time()))

    rows = query.order_by(TelemetryEvent.created_at.desc()).limit(limit).all()
    return [_build_event_response(db, row) for row in rows]


@router.get("/admin/logs")
def super_admin_logs(
    org_id: Optional[str] = Query(None),
    tool_name: Optional[str] = Query(None),
    provider: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(200, le=1000),
    db: Session = Depends(get_db),
):
    """Super-admin centralised log access across every integrated AI tool.

    Returns redacted log records (no raw payloads, no code) for monitoring,
    auditing and compliance.
    """
    query = db.query(TelemetryEvent)
    if org_id:
        query = query.filter(TelemetryEvent.org_id == org_id)
    if tool_name:
        query = query.filter(TelemetryEvent.model_name == tool_name)
    if provider:
        query = query.filter(TelemetryEvent.provider == provider)
    if status:
        query = query.filter(TelemetryEvent.status == status)
    if start_date:
        query = query.filter(TelemetryEvent.created_at >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        query = query.filter(TelemetryEvent.created_at <= datetime.combine(end_date, datetime.max.time()))

    rows = query.order_by(TelemetryEvent.created_at.desc()).limit(limit).all()
    return [
        {
            "event_id": row.event_id,
            "created_at": row.created_at,
            "org_id": row.org_id,
            "project_id": row.project_id,
            "user_id": row.user_id,
            "provider": row.provider,
            "tool_name": row.model_name,
            "service_type": row.service_type,
            "status": row.status,
            "latency_ms": row.latency_ms,
            "total_tokens": row.total_tokens,
            "total_cost": float(row.total_cost or 0),
            "risk_score": float(row.risk_score or 0),
            "misuse_detected": bool(row.misuse_detected),
            "abnormal_usage_spike": bool(row.abnormal_usage_spike),
        }
        for row in rows
    ]


@router.get("/traces/{event_id}", response_model=TraceDetailResponse)
def get_event_trace(event_id: str, db: Session = Depends(get_db)):
    event = db.query(TelemetryEvent).filter(TelemetryEvent.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    security = db.query(DataSecurityLog).filter(DataSecurityLog.event_id == event_id).first()
    return TraceDetailResponse(event=_build_event_response(db, event), security=security)


@router.delete("/event/{event_id}")
def delete_event(event_id: str, db: Session = Depends(get_db)):
    event = db.query(TelemetryEvent).filter(TelemetryEvent.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    db.query(CostBreakdown).filter(CostBreakdown.event_id == event_id).delete()
    db.query(ExecutionPipeline).filter(ExecutionPipeline.event_id == event_id).delete()
    db.query(DataSecurityLog).filter(DataSecurityLog.event_id == event_id).delete()
    db.query(Alert).filter(Alert.telemetry_id == event.id).delete()
    db.query(UsageAnomaly).filter(UsageAnomaly.event_id == event_id).delete()
    db.delete(event)
    db.commit()
    return {"status": "deleted", "event_id": event_id}


@router.put("/event/{event_id}", response_model=TelemetryEventResponse)
def update_event(event_id: str, update_data: TelemetryEventUpdate, db: Session = Depends(get_db)):
    event = db.query(TelemetryEvent).filter(TelemetryEvent.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    update_fields = update_data.model_dump(exclude_none=True)
    for field, value in update_fields.items():
        setattr(event, field, value)

    if "prompt_tokens" in update_fields or "completion_tokens" in update_fields:
        event.total_tokens = event.prompt_tokens + event.completion_tokens

    db.commit()
    db.refresh(event)
    return _build_event_response(db, event)


@router.post("/track", response_model=TelemetryEventResponse)
def track_event(event_data: TelemetryEventCreate, db: Session = Depends(get_db)):
    event = _ingest_event(db, event_data)
    db.commit()
    return _build_event_response(db, event)


def _ingest_event(db: Session, event_data: TelemetryEventCreate) -> TelemetryEvent:
    existing = db.query(TelemetryEvent).filter(TelemetryEvent.event_id == event_data.event_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="event_id already exists")

    # --- org_id handling fix ---
    # Never persist an empty org_id. Fall back to "default" so the telemetry
    # event is still ingested for super-admin/cross-tool monitoring.
    if not (event_data.org_id and str(event_data.org_id).strip()):
        event_data.org_id = "default"

    started_at = event_data.started_at or datetime.utcnow()
    completed_at = event_data.completed_at or (started_at + timedelta(milliseconds=event_data.latency_ms))
    total_tokens = event_data.prompt_tokens + event_data.completion_tokens

    cost_summary = cost_engine.calculate(event_data, db)
    security_result = security_engine.analyze(event_data)
    anomaly_score, abnormal_usage_spike = _detect_event_spike(db, event_data)

    telemetry = TelemetryEvent(
        event_id=event_data.event_id,
        request_id=event_data.request_id,
        trace_id=event_data.trace_id or event_data.event_id,
        org_id=event_data.org_id,
        project_id=event_data.project_id,
        user_id=event_data.user_id,
        api_key_id=event_data.api_key_id,
        provider=event_data.provider,
        model_name=event_data.model_name or event_data.tool_name,
        service_type=event_data.service_type,
        component_name=event_data.component_name,
        execution_type=event_data.execution_type,
        status=event_data.status,
        input_data_size_mb=event_data.input_data_size_mb,
        output_data_size_mb=event_data.output_data_size_mb,
        prompt_tokens=event_data.prompt_tokens,
        completion_tokens=event_data.completion_tokens,
        total_tokens=total_tokens,
        llm_cost=cost_summary.llm_cost,
        infra_cost=cost_summary.infra_cost,
        external_cost=cost_summary.external_cost,
        total_cost=cost_summary.total_cost,
        risk_score=security_result["risk_score"],
        anomaly_score=anomaly_score,
        misuse_detected=security_result["misuse_pattern_detected"],
        abnormal_usage_spike=abnormal_usage_spike,
        started_at=started_at,
        completed_at=completed_at,
        latency_ms=event_data.latency_ms,
        tags=event_data.tags,
        metadata_json=event_data.metadata_json,
        raw_usage_json=event_data.raw_usage_json if event_data.raw_usage_json else {
            "prompt_tokens": event_data.prompt_tokens,
            "completion_tokens": event_data.completion_tokens,
            "total_tokens": total_tokens,
            "provider": event_data.provider,
            "model_name": event_data.model_name,
            "latency_ms": event_data.latency_ms,
        },
    )
    db.add(telemetry)
    db.flush()

    _save_cost_breakdown(db, event_data, cost_summary)
    _save_pipeline_stages(db, event_data)
    _save_security_log(db, event_data, security_result, abnormal_usage_spike)
    _upsert_daily_summary(db, telemetry)
    alert_engine.evaluate(db, event_data, cost_summary, security_result, anomaly_score, abnormal_usage_spike, telemetry_id=telemetry.id)
    db.flush()
    return telemetry


def _save_cost_breakdown(db: Session, event_data: TelemetryEventCreate, cost_summary) -> None:
    total_tokens = Decimal(str(event_data.prompt_tokens + event_data.completion_tokens))
    if total_tokens > 0:
        db.add(
            CostBreakdown(
                event_id=event_data.event_id,
                cost_type="llm",
                component_name=event_data.model_name or event_data.component_name or event_data.tool_name,
                unit_cost=(cost_summary.llm_cost / total_tokens).quantize(Decimal("0.000001")),
                quantity=total_tokens,
                total_cost=cost_summary.llm_cost,
            )
        )
    if cost_summary.infra_cost > 0:
        db.add(
            CostBreakdown(
                event_id=event_data.event_id,
                cost_type="infra",
                component_name="compute",
                unit_cost=Decimal("0.000080"),
                quantity=Decimal(str(max(event_data.latency_ms, 1))),
                total_cost=cost_summary.infra_cost,
            )
        )
    for item in event_data.external_tools:
        db.add(
            CostBreakdown(
                event_id=event_data.event_id,
                cost_type="external",
                component_name=item.name,
                unit_cost=Decimal(str(item.cost)),
                quantity=Decimal("1"),
                total_cost=Decimal(str(item.cost)),
            )
        )


def _save_pipeline_stages(db: Session, event_data: TelemetryEventCreate) -> None:
    for index, stage in enumerate(event_data.stages):
        db.add(
            ExecutionPipeline(
                event_id=event_data.event_id,
                stage_order=stage.stage_order if stage.stage_order is not None else index,
                stage_name=stage.stage_name,
                system_name=stage.system_name,
                status=stage.status,
                stage_latency_ms=stage.stage_latency_ms,
                retry_count=stage.retry_count,
                details=stage.details,
            )
        )


def _save_security_log(
    db: Session,
    event_data: TelemetryEventCreate,
    security_result: dict,
    abnormal_usage_spike: bool,
) -> None:
    db.add(
        DataSecurityLog(
            event_id=event_data.event_id,
            pii_detected=security_result["pii_detected"],
            pii_type=security_result["pii_type"],
            data_out_violation=security_result["data_out_violation"],
            misuse_pattern_detected=security_result["misuse_pattern_detected"],
            abnormal_usage_spike=abnormal_usage_spike,
            masking_applied=security_result["masking_applied"],
            risk_score=security_result["risk_score"],
            data_in_mb=event_data.input_data_size_mb,
            data_out_mb=event_data.output_data_size_mb,
        )
    )


def _upsert_daily_summary(db: Session, event: TelemetryEvent) -> None:
    summary_date = (event.completed_at or event.created_at or datetime.utcnow()).date()
    summary = (
        db.query(DailyOrgSummary)
        .filter(
            DailyOrgSummary.org_id == event.org_id,
            DailyOrgSummary.project_id == event.project_id,
            DailyOrgSummary.tool_name == (event.model_name or ""),
            DailyOrgSummary.date == summary_date,
        )
        .first()
    )

    success_count = 1 if (event.status or "").lower() in {"success", "completed"} else 0
    failure_count = 0 if success_count else 1
    anomaly_count = 1 if event.abnormal_usage_spike else 0
    misuse_count = 1 if event.misuse_detected else 0

    if not summary:
        summary = DailyOrgSummary(
            org_id=event.org_id,
            project_id=event.project_id,
            tool_name=event.model_name or "",
            date=summary_date,
            total_events=1,
            total_cost=event.total_cost,
            llm_cost=event.llm_cost,
            infra_cost=event.infra_cost,
            external_cost=event.external_cost,
            total_prompt_tokens=event.prompt_tokens,
            total_completion_tokens=event.completion_tokens,
            total_tokens=event.total_tokens,
            avg_latency_ms=event.latency_ms,
            success_count=success_count,
            failure_count=failure_count,
            anomaly_count=anomaly_count,
            misuse_count=misuse_count,
            total_input_mb=event.input_data_size_mb,
            total_output_mb=event.output_data_size_mb,
            avg_risk_score=event.risk_score,
        )
        db.add(summary)
        return

    previous_events = summary.total_events or 0
    summary.total_events = previous_events + 1
    summary.total_cost = Decimal(str(summary.total_cost or 0)) + Decimal(str(event.total_cost or 0))
    summary.llm_cost = Decimal(str(summary.llm_cost or 0)) + Decimal(str(event.llm_cost or 0))
    summary.infra_cost = Decimal(str(summary.infra_cost or 0)) + Decimal(str(event.infra_cost or 0))
    summary.external_cost = Decimal(str(summary.external_cost or 0)) + Decimal(str(event.external_cost or 0))
    summary.total_prompt_tokens = (summary.total_prompt_tokens or 0) + (event.prompt_tokens or 0)
    summary.total_completion_tokens = (summary.total_completion_tokens or 0) + (event.completion_tokens or 0)
    summary.total_tokens = (summary.total_tokens or 0) + (event.total_tokens or 0)
    summary.avg_latency_ms = int(
        (((summary.avg_latency_ms or 0) * previous_events) + (event.latency_ms or 0)) / (previous_events + 1)
    )
    summary.success_count = (summary.success_count or 0) + success_count
    summary.failure_count = (summary.failure_count or 0) + failure_count
    summary.anomaly_count = (summary.anomaly_count or 0) + anomaly_count
    summary.misuse_count = (summary.misuse_count or 0) + misuse_count
    summary.total_input_mb = Decimal(str(summary.total_input_mb or 0)) + Decimal(str(event.input_data_size_mb or 0))
    summary.total_output_mb = Decimal(str(summary.total_output_mb or 0)) + Decimal(str(event.output_data_size_mb or 0))
    summary.avg_risk_score = Decimal(
        str((((Decimal(str(summary.avg_risk_score or 0)) * previous_events) + Decimal(str(event.risk_score or 0))) / (previous_events + 1)))
    ).quantize(Decimal("0.01"))


def _detect_event_spike(db: Session, event_data: TelemetryEventCreate) -> tuple[Decimal, bool]:
    today = date.today()
    recent_counts = (
        db.query(func.date(TelemetryEvent.created_at), func.count(TelemetryEvent.id))
        .filter(
            TelemetryEvent.org_id == event_data.org_id,
            TelemetryEvent.model_name == (event_data.model_name or event_data.tool_name),
            TelemetryEvent.created_at >= datetime.combine(today - timedelta(days=7), datetime.min.time()),
            TelemetryEvent.created_at < datetime.combine(today, datetime.min.time()),
        )
        .group_by(func.date(TelemetryEvent.created_at))
        .all()
    )
    baseline = Decimal(str(sum(row[1] for row in recent_counts) / len(recent_counts))) if recent_counts else Decimal("1")
    today_count = (
        db.query(func.count(TelemetryEvent.id))
        .filter(
            TelemetryEvent.org_id == event_data.org_id,
            TelemetryEvent.model_name == (event_data.model_name or event_data.tool_name),
            func.date(TelemetryEvent.created_at) == today,
        )
        .scalar()
        or 0
    )
    observed = Decimal(str(today_count + 1))
    anomaly_ratio = observed / baseline if baseline > 0 else Decimal("1")
    abnormal_usage_spike = anomaly_ratio >= Decimal("1.5")
    return anomaly_ratio.quantize(Decimal("0.01")), abnormal_usage_spike


def _build_event_response(db: Session, event: TelemetryEvent) -> TelemetryEventResponse:
    breakdown = (
        db.query(CostBreakdown)
        .filter(CostBreakdown.event_id == event.event_id)
        .order_by(CostBreakdown.id.asc())
        .all()
    )
    stages = (
        db.query(ExecutionPipeline)
        .filter(ExecutionPipeline.event_id == event.event_id)
        .order_by(ExecutionPipeline.stage_order.asc(), ExecutionPipeline.id.asc())
        .all()
    )
    return TelemetryEventResponse(
        event_id=event.event_id,
        request_id=event.request_id,
        trace_id=event.trace_id,
        org_id=event.org_id,
        project_id=event.project_id,
        user_id=event.user_id,
        api_key_id=event.api_key_id,
        tool_name=event.model_name or "",
        provider=event.provider,
        model_name=event.model_name,
        service_type=event.service_type,
        component_name=event.component_name,
        execution_type=event.execution_type,
        status=event.status,
        input_data_size_mb=Decimal(str(event.input_data_size_mb or 0)),
        output_data_size_mb=Decimal(str(event.output_data_size_mb or 0)),
        prompt_tokens=event.prompt_tokens or 0,
        completion_tokens=event.completion_tokens or 0,
        total_tokens=event.total_tokens or 0,
        llm_cost=Decimal(str(event.llm_cost or 0)),
        infra_cost=Decimal(str(event.infra_cost or 0)),
        external_cost=Decimal(str(event.external_cost or 0)),
        total_cost=Decimal(str(event.total_cost or 0)),
        risk_score=Decimal(str(event.risk_score or 0)),
        anomaly_score=Decimal(str(event.anomaly_score or 0)),
        misuse_detected=bool(event.misuse_detected),
        abnormal_usage_spike=bool(event.abnormal_usage_spike),
        started_at=event.started_at,
        completed_at=event.completed_at,
        latency_ms=event.latency_ms or 0,
        tags=event.tags or [],
        metadata_json=event.metadata_json or {},
        raw_usage_json=event.raw_usage_json,
        created_at=event.created_at,
        cost_breakdown=[CostBreakdownResponse.model_validate(item) for item in breakdown],
        stages=stages,
    )
