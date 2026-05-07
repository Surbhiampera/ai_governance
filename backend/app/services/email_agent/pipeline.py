from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.models import EmailAgentLog, EmailRecord, TraceSpan
from app.routers.telemetry import _ingest_event
from app.schemas import TelemetryEventCreate
from app.services.email_agent.config import EmailAgentConfig
from app.services.email_agent.graph_client import GraphMessage, MicrosoftGraphClient
from app.services.email_agent.llm_clients import build_llm_client
from app.services.email_agent.sanitizer import mask_pii


@dataclass
class ProcessedEmail:
    trace_id: str
    email_db_id: int
    graph_message_id: str
    intent: str | None
    intent_confidence: float | None
    draft_generated: bool
    auto_replied: bool
    status: str


def _sender_domain(addr: str | None) -> str | None:
    if not addr or "@" not in addr:
        return None
    return addr.split("@", 1)[1].lower().strip()


def _span(
    db: Session,
    *,
    org_id: str,
    project_id: str,
    trace_id: str,
    parent_span_id: str | None,
    span_type: str,
    span_name: str,
    status: str,
    provider: str | None = None,
    model_name: str | None = None,
    tool_name: str | None = None,
    latency_ms: int = 0,
    retry_count: int = 0,
    metadata: dict | None = None,
) -> str:
    span_id = str(uuid.uuid4())
    db.add(
        TraceSpan(
            span_id=span_id,
            trace_id=trace_id,
            parent_span_id=parent_span_id,
            org_id=org_id,
            project_id=project_id,
            span_type=span_type,
            span_name=span_name,
            status=status,
            provider=provider,
            model_name=model_name,
            tool_name=tool_name,
            latency_ms=latency_ms,
            retry_count=retry_count,
            metadata_json=metadata or {},
            started_at=datetime.utcnow(),
            ended_at=datetime.utcnow(),
        )
    )
    return span_id


async def process_unread_emails(
    *,
    db: Session,
    cfg: EmailAgentConfig,
    top: int,
) -> list[ProcessedEmail]:
    trace_id = str(uuid.uuid4())
    root_span = _span(
        db,
        org_id=cfg.org_id,
        project_id=cfg.project_id,
        trace_id=trace_id,
        parent_span_id=None,
        span_type="agent",
        span_name="email-support-agent",
        status="success",
        metadata={"pipeline": "refresh", "mailbox": cfg.graph_mailbox_user},
    )

    graph = MicrosoftGraphClient(
        tenant_id=cfg.graph_tenant_id,
        client_id=cfg.graph_client_id,
        client_secret=cfg.graph_client_secret,
        mailbox_user=cfg.graph_mailbox_user,
    )

    extraction_span = _span(
        db,
        org_id=cfg.org_id,
        project_id=cfg.project_id,
        trace_id=trace_id,
        parent_span_id=root_span,
        span_type="tool",
        span_name="ms-graph-fetch-unread",
        status="success",
        tool_name="microsoft-graph",
    )

    messages = await graph.fetch_unread(top=top)
    results: list[ProcessedEmail] = []

    # LLM clients
    classifier = build_llm_client(
        provider=cfg.classifier_provider,
        azure_openai_endpoint=cfg.azure_openai_endpoint,
        azure_openai_api_key=cfg.azure_openai_api_key,
        azure_openai_api_version=cfg.azure_openai_api_version,
        azure_openai_deployment=cfg.azure_openai_deployment,
        gemini_api_key=cfg.gemini_api_key,
    )
    drafter = build_llm_client(
        provider=cfg.drafter_provider,
        azure_openai_endpoint=cfg.azure_openai_endpoint,
        azure_openai_api_key=cfg.azure_openai_api_key,
        azure_openai_api_version=cfg.azure_openai_api_version,
        azure_openai_deployment=cfg.azure_openai_deployment,
        gemini_api_key=cfg.gemini_api_key,
    )

    for msg in messages:
        per_email_trace = str(uuid.uuid4())
        email_root = _span(
            db,
            org_id=cfg.org_id,
            project_id=cfg.project_id,
            trace_id=per_email_trace,
            parent_span_id=None,
            span_type="agent",
            span_name="email-processing",
            status="success",
            metadata={"graph_message_id": msg.id},
        )

        raw_body = msg.body_content or msg.body_preview or ""
        san = mask_pii(raw_body)
        _span(
            db,
            org_id=cfg.org_id,
            project_id=cfg.project_id,
            trace_id=per_email_trace,
            parent_span_id=email_root,
            span_type="policy",
            span_name="sanitization-mask",
            status="success",
            metadata={"pii_masked": san.pii_masked, "masking_types": san.masking_types},
        )

        # Persist archived record early for auditability
        rec = EmailRecord(
            org_id=cfg.org_id,
            project_id=cfg.project_id,
            trace_id=per_email_trace,
            graph_message_id=msg.id,
            mailbox=cfg.graph_mailbox_user,
            subject=msg.subject,
            sender_email=msg.from_email,
            sender_domain=_sender_domain(msg.from_email),
            received_at=None,
            raw_body=raw_body,
            masked_body=san.masked_text,
            pii_masked=san.pii_masked,
            masking_types=san.masking_types,
            pipeline_status="processing",
            metadata_json={"body_preview": msg.body_preview, "received_at": msg.received_at},
        )
        db.add(rec)
        db.flush()

        # Classify
        cls_span = _span(
            db,
            org_id=cfg.org_id,
            project_id=cfg.project_id,
            trace_id=per_email_trace,
            parent_span_id=email_root,
            span_type="llm",
            span_name="intent-classification",
            status="success",
            provider=cfg.classifier_provider,
            model_name=cfg.classifier_model,
        )
        cls = await classifier.classify(text=san.masked_text, model=cfg.classifier_model, intents=cfg.intents)
        rec.intent = cls.intent
        rec.intent_confidence = Decimal(str(cls.confidence))
        rec.classification_provider = cls.provider
        rec.classification_model = cls.model

        # Draft
        draft_span = _span(
            db,
            org_id=cfg.org_id,
            project_id=cfg.project_id,
            trace_id=per_email_trace,
            parent_span_id=email_root,
            span_type="llm",
            span_name="draft-response",
            status="success",
            provider=cfg.drafter_provider,
            model_name=cfg.drafter_model,
        )
        draft_text, draft_meta = await drafter.draft(text=san.masked_text, intent=cls.intent, model=cfg.drafter_model)
        rec.draft_text = draft_text
        rec.draft_provider = cfg.drafter_provider
        rec.draft_model = cfg.drafter_model

        # Auto-reply if enabled and intent matches (rule-driven via env or future DB)
        auto_replied = False
        if cfg.auto_reply_enabled and cls.intent in set(cfg.auto_reply_intents) and msg.from_email:
            _span(
                db,
                org_id=cfg.org_id,
                project_id=cfg.project_id,
                trace_id=per_email_trace,
                parent_span_id=email_root,
                span_type="tool",
                span_name="auto-reply-send",
                status="success",
                tool_name="microsoft-graph-sendMail",
                metadata={"to": msg.from_email},
            )
            await graph.send_mail(to_email=msg.from_email, subject=f"Re: {msg.subject or ''}".strip(), body_html=draft_text)
            auto_replied = True
            rec.auto_replied = True

        # Finalize: mark read
        _span(
            db,
            org_id=cfg.org_id,
            project_id=cfg.project_id,
            trace_id=per_email_trace,
            parent_span_id=email_root,
            span_type="tool",
            span_name="mark-read",
            status="success",
            tool_name="microsoft-graph-markRead",
            metadata={"graph_message_id": msg.id},
        )
        await graph.mark_read(msg.id)

        rec.pipeline_status = "completed"

        # Emit telemetry event for this email processing
        event_id = str(uuid.uuid4())
        telemetry_create = TelemetryEventCreate(
            event_id=event_id,
            trace_id=per_email_trace,
            org_id=cfg.org_id,
            project_id=cfg.project_id,
            user_id=None,
            tool_name="email-support-agent",
            provider=cls.provider,
            model_name=cls.model,
            service_type="email-pipeline",
            execution_type="refresh",
            status="success",
            latency_ms=0,
            prompt_tokens=0,
            completion_tokens=0,
            metadata_json={
                "email": {
                    "graph_message_id": msg.id,
                    "subject": msg.subject,
                    "from": msg.from_email,
                },
                "intent": cls.intent,
                "confidence": cls.confidence,
                "pii_masked": san.pii_masked,
                "masking_types": san.masking_types,
            },
            tags=["email-agent"],
            raw_usage_json={
                "classifier_provider": cls.provider,
                "classifier_model": cls.model,
                "drafter_provider": cfg.drafter_provider,
                "drafter_model": cfg.drafter_model,
            },
        )
        telemetry_row = _ingest_event(db, telemetry_create)

        db.add(
            EmailAgentLog(
                event_id=telemetry_row.event_id,
                email_id=msg.id,
                sender_domain=_sender_domain(msg.from_email),
                intent=cls.intent,
                intent_confidence=Decimal(str(cls.confidence)),
                pii_masked=san.pii_masked,
                masking_types=san.masking_types,
                draft_generated=bool(draft_text),
                auto_replied=auto_replied,
                classification_model=f"{cls.provider}:{cls.model}",
                draft_model=f"{cfg.drafter_provider}:{cfg.drafter_model}",
                stage_latencies={},
                pipeline_status=rec.pipeline_status,
            )
        )

        db.commit()

        results.append(
            ProcessedEmail(
                trace_id=per_email_trace,
                email_db_id=rec.id,
                graph_message_id=msg.id,
                intent=cls.intent,
                intent_confidence=cls.confidence,
                draft_generated=bool(draft_text),
                auto_replied=auto_replied,
                status=rec.pipeline_status or "completed",
            )
        )

    # Link refresh root to child email traces for visualization
    db.query(TraceSpan).filter(TraceSpan.span_id == extraction_span).update(
        {"metadata_json": {"fetched_count": len(messages), "child_traces": [r.trace_id for r in results]}}
    )
    db.commit()

    return results

