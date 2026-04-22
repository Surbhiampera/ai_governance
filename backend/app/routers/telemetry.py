from datetime import date, datetime, timedelta
from decimal import Decimal
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
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
from app.celery_app import celery_app
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


@router.post("/import/excel")
async def import_events_from_excel(
    file: UploadFile = File(...),
    org_id: str = Form("default"),
    project_id: Optional[str] = Form(None),
    async_ingest: bool = Form(True),
    db: Session = Depends(get_db),
):
    """
    Upload an Excel file (.xlsx) containing telemetry rows.
    Expected columns (case-insensitive):
      event_id, request_id, trace_id, user_id, api_key_id,
      tool_name, provider, model_name, component_name, service_type, execution_type,
      status, latency_ms,
      prompt_tokens, completion_tokens,
      input_data_size_mb, output_data_size_mb,
      input_data_count, output_data_count
    org_id/project_id from the form act as defaults when not present in the sheet.
    """
    filename = (file.filename or "").lower()
    if not (filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx/.xls) are supported")

    try:
        import pandas as pd  # type: ignore
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Excel parsing dependency missing: {e}")

    raw = await file.read()
    try:
        df = pd.read_excel(BytesIO(raw))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unable to read Excel: {e}")

    if df.empty:
        return {"status": "completed", "ingested_count": 0, "event_ids": []}

    df.columns = [str(c).strip().lower() for c in df.columns]

    def _get(row, key, default=None):
        if key in row and row[key] is not None:
            val = row[key]
            if isinstance(val, float) and pd.isna(val):
                return default
            return val
        return default

    events: list[TelemetryEventCreate] = []
    now_ms = int(datetime.utcnow().timestamp() * 1000)
    for idx, r in df.iterrows():
        row = r.to_dict()
        event_id = str(_get(row, "event_id", f"xl-{now_ms}-{idx}"))
        prompt_tokens = int(_get(row, "prompt_tokens", 0) or 0)
        completion_tokens = int(_get(row, "completion_tokens", 0) or 0)
        latency_ms = int(_get(row, "latency_ms", 0) or 0)
        input_mb = Decimal(str(_get(row, "input_data_size_mb", 0) or 0))
        output_mb = Decimal(str(_get(row, "output_data_size_mb", 0) or 0))
        in_count = _get(row, "input_data_count", None)
        out_count = _get(row, "output_data_count", None)
        in_count = int(in_count) if in_count not in (None, "", 0) else None
        out_count = int(out_count) if out_count not in (None, "", 0) else None

        events.append(
            TelemetryEventCreate(
                event_id=event_id,
                request_id=_get(row, "request_id", None),
                trace_id=_get(row, "trace_id", None),
                org_id=str(_get(row, "org_id", org_id)),
                project_id=_get(row, "project_id", project_id),
                user_id=_get(row, "user_id", None),
                api_key_id=_get(row, "api_key_id", None),
                tool_name=str(_get(row, "tool_name", "")),
                provider=_get(row, "provider", None),
                model_name=_get(row, "model_name", None),
                component_name=_get(row, "component_name", None),
                service_type=_get(row, "service_type", None),
                execution_type=_get(row, "execution_type", None),
                status=str(_get(row, "status", "success") or "success"),
                latency_ms=latency_ms,
                input_data_size_mb=input_mb,
                output_data_size_mb=output_mb,
                input_data_count=in_count,
                output_data_count=out_count,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                tags=[],
                metadata_json={},
            )
        )

    # Ingest in parallel via Celery if requested; fall back to sync ingestion.
    if async_ingest:
        ingested_ids = [e.event_id for e in events]
        celery_app.send_task("app.workers.tasks.ingest_events_batch_task", args=[[e.model_dump() for e in events]])
        return {"status": "queued", "ingested_count": len(ingested_ids), "event_ids": ingested_ids}

    ingested: list[str] = []
    for e in events:
        event = _ingest_event(db, e)
        ingested.append(event.event_id)
    db.commit()
    return {"status": "completed", "ingested_count": len(ingested), "event_ids": ingested}


@router.get("/logs", response_model=list[TelemetryEventResponse])
def list_telemetry_logs(
    org_id: Optional[str] = Query(None),
    tool_name: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(TelemetryEvent)
    if org_id:
        query = query.filter(TelemetryEvent.org_id == org_id)
    if tool_name:
        query = query.filter(TelemetryEvent.tool_name == tool_name)
    if status:
        query = query.filter(TelemetryEvent.status == status)
    if start_date:
        query = query.filter(TelemetryEvent.created_at >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        query = query.filter(TelemetryEvent.created_at <= datetime.combine(end_date, datetime.max.time()))

    rows = query.order_by(TelemetryEvent.created_at.desc()).limit(limit).all()
    return [_build_event_response(db, row) for row in rows]


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
    db.query(Alert).filter(Alert.event_id == event_id).delete()
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
    # data count fields are stored in metadata_json (no schema migration required)
    if "input_data_count" in update_fields or "output_data_count" in update_fields:
        meta = dict(event.metadata_json or {})
        if "input_data_count" in update_fields:
            meta["input_data_count"] = update_fields.pop("input_data_count")
        if "output_data_count" in update_fields:
            meta["output_data_count"] = update_fields.pop("output_data_count")
        event.metadata_json = meta
    for field, value in update_fields.items():
        setattr(event, field, value)

    if "prompt_tokens" in update_fields or "completion_tokens" in update_fields:
        event.total_tokens = event.prompt_tokens + event.completion_tokens

    db.commit()
    db.refresh(event)
    return _build_event_response(db, event)


def _ingest_event(db: Session, event_data: TelemetryEventCreate) -> TelemetryEvent:
    existing = db.query(TelemetryEvent).filter(TelemetryEvent.event_id == event_data.event_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="event_id already exists")

    started_at = event_data.started_at or datetime.utcnow()
    completed_at = event_data.completed_at or (started_at + timedelta(milliseconds=event_data.latency_ms))
    total_tokens = event_data.prompt_tokens + event_data.completion_tokens

    cost_summary = cost_engine.calculate(event_data, db)
    security_result = security_engine.analyze(event_data)
    anomaly_score, abnormal_usage_spike = _detect_event_spike(db, event_data)

    meta = dict(event_data.metadata_json or {})
    if event_data.input_data_count is not None:
        meta["input_data_count"] = int(event_data.input_data_count)
    if event_data.output_data_count is not None:
        meta["output_data_count"] = int(event_data.output_data_count)

    telemetry = TelemetryEvent(
        event_id=event_data.event_id,
        request_id=event_data.request_id,
        trace_id=event_data.trace_id or event_data.event_id,
        org_id=event_data.org_id,
        project_id=event_data.project_id,
        user_id=event_data.user_id,
        api_key_id=event_data.api_key_id,
        tool_name=event_data.tool_name,
        provider=event_data.provider,
        model_name=event_data.model_name,
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
        metadata_json=meta,
    )
    db.add(telemetry)
    db.flush()

    _save_cost_breakdown(db, event_data, cost_summary)
    _save_pipeline_stages(db, event_data)
    _save_security_log(db, event_data, security_result, abnormal_usage_spike)
    _upsert_daily_summary(db, telemetry)
    alert_engine.evaluate(db, event_data, cost_summary, security_result, anomaly_score, abnormal_usage_spike)
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
            DailyOrgSummary.tool_name == event.tool_name,
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
            tool_name=event.tool_name,
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
            TelemetryEvent.tool_name == event_data.tool_name,
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
            TelemetryEvent.tool_name == event_data.tool_name,
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
    meta = event.metadata_json or {}
    return TelemetryEventResponse(
        event_id=event.event_id,
        request_id=event.request_id,
        trace_id=event.trace_id,
        org_id=event.org_id,
        project_id=event.project_id,
        user_id=event.user_id,
        api_key_id=event.api_key_id,
        tool_name=event.tool_name,
        provider=event.provider,
        model_name=event.model_name,
        service_type=event.service_type,
        component_name=event.component_name,
        execution_type=event.execution_type,
        status=event.status,
        input_data_size_mb=Decimal(str(event.input_data_size_mb or 0)),
        output_data_size_mb=Decimal(str(event.output_data_size_mb or 0)),
        input_data_count=meta.get("input_data_count"),
        output_data_count=meta.get("output_data_count"),
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
        created_at=event.created_at,
        cost_breakdown=[CostBreakdownResponse.model_validate(item) for item in breakdown],
        stages=stages,
    )
