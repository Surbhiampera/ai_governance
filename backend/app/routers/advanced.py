from __future__ import annotations

import hashlib
import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_policy_secret_keywords
from app.core.deps import get_db
from app.models import (
    GovernanceRule,
    PromptResponseVersion,
    StreamingTokenEvent,
    TelemetryEvent,
    TraceModelUsage,
    TraceSpan,
    TraceToolUsage,
)
from app.services.security_engine import SecurityEngine

router = APIRouter(prefix="/advanced", tags=["advanced-observability"])
security_engine = SecurityEngine()


class SpanIngestRequest(BaseModel):
    trace_id: str
    span_id: Optional[str] = None
    parent_span_id: Optional[str] = None
    org_id: str
    project_id: Optional[str] = None
    span_type: str
    span_name: str
    status: str = "success"
    provider: Optional[str] = None
    model_name: Optional[str] = None
    tool_name: Optional[str] = None
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    retry_count: int = 0
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class StreamingTokenRequest(BaseModel):
    trace_id: str
    org_id: str
    project_id: Optional[str] = None
    span_id: Optional[str] = None
    event_id: Optional[str] = None
    provider: Optional[str] = None
    model_name: Optional[str] = None
    token_type: str = "completion"
    token_count: int = 1
    token_text: Optional[str] = None
    sequence_no: int = 0
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class PolicyEnforcementRequest(BaseModel):
    org_id: str
    project_id: Optional[str] = None
    team: Optional[str] = None
    provider: str
    model_name: str
    prompt: str = ""
    tool_name: Optional[str] = None


class GatewayRouteRequest(BaseModel):
    org_id: str
    project_id: Optional[str] = None
    preferred_provider: Optional[str] = None
    preferred_model: Optional[str] = None
    fallback_chain: list[dict[str, str]] = Field(default_factory=list)
    simulate_failure_for_provider: Optional[str] = None
    trace_id: Optional[str] = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class PromptVersionRequest(BaseModel):
    trace_id: str
    org_id: str
    project_id: Optional[str] = None
    event_id: Optional[str] = None
    prompt_text: str
    response_text: Optional[str] = None
    parent_version_id: Optional[str] = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)


def _scope_rules(
    db: Session,
    *,
    org_id: str,
    project_id: Optional[str],
) -> list[GovernanceRule]:
    query = db.query(GovernanceRule).filter(GovernanceRule.is_active.is_(True))
    rows = query.order_by(GovernanceRule.created_at.desc()).all()
    out = []
    for r in rows:
        if r.scope_level == "organization" and (not r.org_id or r.org_id == org_id):
            out.append(r)
        elif r.scope_level == "project" and r.project_id and project_id and r.project_id == project_id:
            out.append(r)
        elif r.scope_level not in {"organization", "project"}:
            out.append(r)
    return out


@router.post("/spans")
def ingest_span(payload: SpanIngestRequest, db: Session = Depends(get_db)):
    span_id = payload.span_id or str(uuid.uuid4())
    span = TraceSpan(
        span_id=span_id,
        trace_id=payload.trace_id,
        parent_span_id=payload.parent_span_id,
        org_id=payload.org_id,
        project_id=payload.project_id,
        span_type=payload.span_type,
        span_name=payload.span_name,
        status=payload.status,
        provider=payload.provider,
        model_name=payload.model_name,
        tool_name=payload.tool_name,
        input_tokens=payload.input_tokens,
        output_tokens=payload.output_tokens,
        latency_ms=payload.latency_ms,
        retry_count=payload.retry_count,
        metadata_json=payload.metadata_json,
        started_at=payload.started_at,
        ended_at=payload.ended_at,
    )
    db.add(span)
    db.commit()
    return {"status": "ingested", "span_id": span_id}


@router.post("/stream/tokens")
def ingest_stream_token(payload: StreamingTokenRequest, db: Session = Depends(get_db)):
    row = StreamingTokenEvent(**payload.model_dump())
    db.add(row)
    db.commit()
    return {"status": "ingested", "id": row.id}


@router.get("/stream/live")
def get_live_stream(
    org_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    trace_id: Optional[str] = Query(None),
    limit: int = Query(200, le=1000),
    db: Session = Depends(get_db),
):
    q = db.query(StreamingTokenEvent)
    if org_id:
        q = q.filter(StreamingTokenEvent.org_id == org_id)
    if project_id:
        q = q.filter(StreamingTokenEvent.project_id == project_id)
    if trace_id:
        q = q.filter(StreamingTokenEvent.trace_id == trace_id)
    rows = q.order_by(StreamingTokenEvent.created_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "trace_id": r.trace_id,
            "span_id": r.span_id,
            "event_id": r.event_id,
            "org_id": r.org_id,
            "project_id": r.project_id,
            "provider": r.provider,
            "model_name": r.model_name,
            "token_type": r.token_type,
            "token_count": r.token_count,
            "token_text": r.token_text,
            "sequence_no": r.sequence_no,
            "metadata_json": r.metadata_json or {},
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/trace/{trace_id}/graph")
def get_trace_graph(trace_id: str, db: Session = Depends(get_db)):
    spans = (
        db.query(TraceSpan)
        .filter(TraceSpan.trace_id == trace_id)
        .order_by(TraceSpan.created_at.asc())
        .all()
    )
    model_rows = db.query(TraceModelUsage).filter(TraceModelUsage.trace_id == trace_id).all()
    tool_rows = db.query(TraceToolUsage).filter(TraceToolUsage.trace_id == trace_id).all()
    events = db.query(TelemetryEvent).filter(TelemetryEvent.trace_id == trace_id).order_by(TelemetryEvent.created_at.asc()).all()

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    for s in spans:
        nodes.append(
            {
                "id": s.span_id,
                "type": s.span_type,
                "label": s.span_name,
                "status": s.status,
                "provider": s.provider,
                "model_name": s.model_name,
                "tool_name": s.tool_name,
                "latency_ms": s.latency_ms,
                "retry_count": s.retry_count,
                "metadata": s.metadata_json or {},
            }
        )
        if s.parent_span_id:
            edges.append({"source": s.parent_span_id, "target": s.span_id, "kind": "parent_child"})

    for e in events:
        eid = f"event:{e.event_id}"
        nodes.append(
            {
                "id": eid,
                "type": "event",
                "label": e.model_name or e.component_name or "telemetry-event",
                "status": e.status,
                "provider": e.provider,
                "latency_ms": e.latency_ms,
                "total_tokens": e.total_tokens,
                "total_cost": float(e.total_cost or 0),
            }
        )

    for m in model_rows:
        mid = f"model:{m.id}"
        nodes.append(
            {
                "id": mid,
                "type": "model_usage",
                "label": m.model_name,
                "provider": m.provider,
                "input_tokens": m.input_tokens,
                "output_tokens": m.output_tokens,
                "cost": float(m.llm_cost or 0),
                "latency_ms": m.latency_ms,
            }
        )
        if events:
            edges.append({"source": f"event:{events[0].event_id}", "target": mid, "kind": "contains_model"})

    for t in tool_rows:
        tid = f"tool:{t.id}"
        nodes.append(
            {
                "id": tid,
                "type": "tool_usage",
                "label": t.tool_name,
                "tool_type": t.tool_type,
                "invocation_count": t.invocation_count,
                "execution_time_ms": t.execution_time_ms,
                "cost": float(t.cost or 0),
            }
        )
        if events:
            edges.append({"source": f"event:{events[0].event_id}", "target": tid, "kind": "contains_tool"})

    return {"trace_id": trace_id, "nodes": nodes, "edges": edges}


@router.get("/trace/{trace_id}/replay")
def get_trace_replay(trace_id: str, db: Session = Depends(get_db)):
    spans = db.query(TraceSpan).filter(TraceSpan.trace_id == trace_id).all()
    events = db.query(TelemetryEvent).filter(TelemetryEvent.trace_id == trace_id).all()
    streams = db.query(StreamingTokenEvent).filter(StreamingTokenEvent.trace_id == trace_id).all()

    timeline: list[dict[str, Any]] = []
    for s in spans:
        timeline.append(
            {
                "time": (s.started_at or s.created_at).isoformat() if (s.started_at or s.created_at) else None,
                "kind": "span",
                "id": s.span_id,
                "name": s.span_name,
                "type": s.span_type,
                "status": s.status,
                "latency_ms": s.latency_ms,
                "metadata": s.metadata_json or {},
            }
        )
    for e in events:
        timeline.append(
            {
                "time": e.created_at.isoformat() if e.created_at else None,
                "kind": "telemetry_event",
                "id": e.event_id,
                "name": e.model_name or e.component_name,
                "status": e.status,
                "tokens": e.total_tokens,
                "cost": float(e.total_cost or 0),
            }
        )
    for st in streams:
        timeline.append(
            {
                "time": st.created_at.isoformat() if st.created_at else None,
                "kind": "stream_token",
                "id": st.id,
                "span_id": st.span_id,
                "token_type": st.token_type,
                "token_count": st.token_count,
                "sequence_no": st.sequence_no,
                "text_preview": (st.token_text or "")[:120],
            }
        )
    timeline.sort(key=lambda x: x.get("time") or "")
    return {"trace_id": trace_id, "timeline": timeline}


@router.post("/policy/enforce")
def enforce_policy(payload: PolicyEnforcementRequest, db: Session = Depends(get_db)):
    rules = _scope_rules(db, org_id=payload.org_id, project_id=payload.project_id)
    violations: list[dict[str, Any]] = []

    sec = security_engine.analyze(
        type(
            "Obj",
            (),
            {
                "contains_pii": False,
                "pii_type": None,
                "output_data_size_mb": 0,
                "status": "success",
                "tool_name": payload.tool_name or payload.model_name,
                "provider": payload.provider,
                "model_name": payload.model_name,
                "metadata_json": {"prompt": payload.prompt},
            },
        )
    )
    prompt_lower = (payload.prompt or "").lower()
    secret_keywords = get_policy_secret_keywords()

    for r in rules:
        metric = (r.metric_name or "").strip().lower()
        action = "block" if (r.operator or "").lower() == "block" else "warn"
        threshold = str(r.threshold_value or "").strip().lower()

        if metric in {"model_allowlist", "allowed_models"}:
            allowed = {x.strip() for x in threshold.split(",") if x.strip()}
            if allowed and payload.model_name not in allowed:
                violations.append({"rule": r.rule_name, "metric": metric, "action": action, "reason": f"Model '{payload.model_name}' not allowed"})
        elif metric in {"provider_allowlist", "allowed_providers"}:
            allowed = {x.strip() for x in threshold.split(",") if x.strip()}
            if allowed and payload.provider not in allowed:
                violations.append({"rule": r.rule_name, "metric": metric, "action": action, "reason": f"Provider '{payload.provider}' not allowed"})
        elif metric in {"pii_detected", "pii_prevention"}:
            if sec.get("pii_detected"):
                violations.append({"rule": r.rule_name, "metric": metric, "action": action, "reason": f"PII detected: {sec.get('pii_type')}"})
        elif metric in {"secret_prompt_block", "prompt_secret"}:
            if any(s in prompt_lower for s in secret_keywords):
                violations.append({"rule": r.rule_name, "metric": metric, "action": action, "reason": "Prompt appears to contain secrets"})

    blocked = any(v["action"] == "block" for v in violations)
    return {
        "allowed": not blocked,
        "blocked": blocked,
        "violations": violations,
        "risk_score": float(sec.get("risk_score", 0)),
        "pii_detected": bool(sec.get("pii_detected")),
        "pii_type": sec.get("pii_type"),
    }


@router.post("/gateway/route")
def gateway_route(payload: GatewayRouteRequest, db: Session = Depends(get_db)):
    trace_id = payload.trace_id or str(uuid.uuid4())

    candidates = []
    if payload.preferred_provider and payload.preferred_model:
        candidates.append({"provider": payload.preferred_provider, "model": payload.preferred_model, "priority": 0})
    for i, item in enumerate(payload.fallback_chain):
        candidates.append({"provider": item.get("provider"), "model": item.get("model"), "priority": i + 1})
    if not candidates:
        raise HTTPException(status_code=400, detail="No routing candidates provided")

    selected = None
    attempts = []
    for c in candidates:
        simulated_failure = payload.simulate_failure_for_provider and c["provider"] == payload.simulate_failure_for_provider
        attempts.append({"provider": c["provider"], "model": c["model"], "failed": bool(simulated_failure)})
        if not simulated_failure:
            selected = c
            break

    if not selected:
        selected = candidates[-1]

    span = TraceSpan(
        span_id=str(uuid.uuid4()),
        trace_id=trace_id,
        parent_span_id=None,
        org_id=payload.org_id,
        project_id=payload.project_id,
        span_type="gateway",
        span_name="ai-gateway-routing",
        status="success",
        provider=selected.get("provider"),
        model_name=selected.get("model"),
        retry_count=max(len(attempts) - 1, 0),
        latency_ms=0,
        metadata_json={"attempts": attempts, **payload.metadata_json},
    )
    db.add(span)
    db.commit()

    return {
        "trace_id": trace_id,
        "selected_provider": selected.get("provider"),
        "selected_model": selected.get("model"),
        "attempts": attempts,
        "fallback_used": len(attempts) > 1,
    }


@router.get("/otel/trace/{trace_id}")
def export_trace_otel(trace_id: str, db: Session = Depends(get_db)):
    spans = db.query(TraceSpan).filter(TraceSpan.trace_id == trace_id).all()
    if not spans:
        raise HTTPException(status_code=404, detail="Trace not found")

    otel_spans = []
    for s in spans:
        attrs = [
            {"key": "span.type", "value": {"stringValue": s.span_type}},
            {"key": "org.id", "value": {"stringValue": s.org_id or ""}},
            {"key": "project.id", "value": {"stringValue": s.project_id or ""}},
            {"key": "provider", "value": {"stringValue": s.provider or ""}},
            {"key": "model.name", "value": {"stringValue": s.model_name or ""}},
            {"key": "tool.name", "value": {"stringValue": s.tool_name or ""}},
            {"key": "retry.count", "value": {"intValue": int(s.retry_count or 0)}},
            {"key": "latency.ms", "value": {"intValue": int(s.latency_ms or 0)}},
        ]
        otel_spans.append(
            {
                "traceId": trace_id.replace("-", ""),
                "spanId": (s.span_id or "").replace("-", "")[:16],
                "parentSpanId": (s.parent_span_id or "").replace("-", "")[:16] if s.parent_span_id else None,
                "name": s.span_name,
                "kind": "SPAN_KIND_INTERNAL",
                "startTimeUnixNano": int((s.started_at.timestamp() if s.started_at else datetime.utcnow().timestamp()) * 1_000_000_000),
                "endTimeUnixNano": int((s.ended_at.timestamp() if s.ended_at else datetime.utcnow().timestamp()) * 1_000_000_000),
                "attributes": attrs,
                "status": {"code": "STATUS_CODE_OK" if s.status == "success" else "STATUS_CODE_ERROR"},
            }
        )
    return {"resourceSpans": [{"scopeSpans": [{"spans": otel_spans}]}]}


@router.post("/prompt-version")
def register_prompt_version(payload: PromptVersionRequest, db: Session = Depends(get_db)):
    prompt_hash = hashlib.sha256(payload.prompt_text.encode("utf-8")).hexdigest()
    response_hash = hashlib.sha256((payload.response_text or "").encode("utf-8")).hexdigest() if payload.response_text else None
    version_id = str(uuid.uuid4())
    row = PromptResponseVersion(
        version_id=version_id,
        trace_id=payload.trace_id,
        event_id=payload.event_id,
        org_id=payload.org_id,
        project_id=payload.project_id,
        prompt_hash=prompt_hash,
        response_hash=response_hash,
        parent_version_id=payload.parent_version_id,
        prompt_text=payload.prompt_text,
        response_text=payload.response_text,
        metadata_json=payload.metadata_json,
    )
    db.add(row)
    db.commit()
    return {
        "version_id": version_id,
        "trace_id": payload.trace_id,
        "prompt_hash": prompt_hash,
        "response_hash": response_hash,
        "parent_version_id": payload.parent_version_id,
    }


@router.get("/prompt-version/{trace_id}")
def list_prompt_versions(trace_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(PromptResponseVersion)
        .filter(PromptResponseVersion.trace_id == trace_id)
        .order_by(PromptResponseVersion.created_at.asc())
        .all()
    )
    return [
        {
            "version_id": r.version_id,
            "trace_id": r.trace_id,
            "event_id": r.event_id,
            "org_id": r.org_id,
            "project_id": r.project_id,
            "prompt_hash": r.prompt_hash,
            "response_hash": r.response_hash,
            "parent_version_id": r.parent_version_id,
            "metadata_json": r.metadata_json or {},
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/rag/audit")
def rag_audit(
    org_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    trace_id: Optional[str] = Query(None),
    limit: int = Query(200, le=1000),
    db: Session = Depends(get_db),
):
    q = db.query(TraceSpan).filter(TraceSpan.span_type.in_(["retrieval", "rag_retrieval"]))
    if org_id:
        q = q.filter(TraceSpan.org_id == org_id)
    if project_id:
        q = q.filter(TraceSpan.project_id == project_id)
    if trace_id:
        q = q.filter(TraceSpan.trace_id == trace_id)
    rows = q.order_by(TraceSpan.created_at.desc()).limit(limit).all()
    return [
        {
            "trace_id": r.trace_id,
            "span_id": r.span_id,
            "span_name": r.span_name,
            "status": r.status,
            "latency_ms": r.latency_ms,
            "vector_db": (r.metadata_json or {}).get("vector_db"),
            "retrieved_doc_ids": (r.metadata_json or {}).get("doc_ids", []),
            "access_scope": (r.metadata_json or {}).get("access_scope"),
            "query_hash": (r.metadata_json or {}).get("query_hash"),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
