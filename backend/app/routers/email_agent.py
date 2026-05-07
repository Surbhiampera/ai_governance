from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import EmailRecord
from app.schemas import (
    EmailClassifyRequest,
    EmailClassifyResponse,
    EmailDraftRequest,
    EmailDraftResponse,
    EmailRecordResponse,
)
from app.services.email_agent.config import load_email_agent_config
from app.services.email_agent.llm_clients import build_llm_client
from app.services.email_agent.pipeline import process_unread_emails
from app.services.email_agent.sanitizer import mask_pii

router = APIRouter(prefix="/email-agent", tags=["email-agent"])


@router.post("/refresh")
async def refresh_unread(
    top: int = Query(..., ge=1, le=200),
    db: Session = Depends(get_db),
):
    cfg = load_email_agent_config()
    processed = await process_unread_emails(db=db, cfg=cfg, top=top)
    return {
        "status": "completed",
        "processed_count": len(processed),
        "results": [p.__dict__ for p in processed],
    }


@router.get("/emails", response_model=list[EmailRecordResponse])
def list_emails(
    limit: int = Query(..., ge=1, le=500),
    org_id: str | None = Query(None),
    project_id: str | None = Query(None),
    status: str | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(EmailRecord)
    if org_id:
        q = q.filter(EmailRecord.org_id == org_id)
    if project_id:
        q = q.filter(EmailRecord.project_id == project_id)
    if status:
        q = q.filter(EmailRecord.pipeline_status == status)
    return q.order_by(EmailRecord.created_at.desc()).limit(limit).all()


@router.post("/classify", response_model=EmailClassifyResponse)
async def classify(payload: EmailClassifyRequest):
    cfg = load_email_agent_config()
    client = build_llm_client(
        provider=cfg.classifier_provider,
        azure_openai_endpoint=cfg.azure_openai_endpoint,
        azure_openai_api_key=cfg.azure_openai_api_key,
        azure_openai_api_version=cfg.azure_openai_api_version,
        azure_openai_deployment=cfg.azure_openai_deployment,
        gemini_api_key=cfg.gemini_api_key,
    )
    masked = mask_pii(payload.text)
    res = await client.classify(text=masked.masked_text, model=cfg.classifier_model, intents=cfg.intents)
    return EmailClassifyResponse(
        intent=res.intent,
        confidence=res.confidence,
        provider=res.provider,
        model=res.model,
    )


@router.post("/draft", response_model=EmailDraftResponse)
async def draft(payload: EmailDraftRequest):
    cfg = load_email_agent_config()
    client = build_llm_client(
        provider=cfg.drafter_provider,
        azure_openai_endpoint=cfg.azure_openai_endpoint,
        azure_openai_api_key=cfg.azure_openai_api_key,
        azure_openai_api_version=cfg.azure_openai_api_version,
        azure_openai_deployment=cfg.azure_openai_deployment,
        gemini_api_key=cfg.gemini_api_key,
    )
    masked = mask_pii(payload.text)
    draft_text, _meta = await client.draft(text=masked.masked_text, intent=payload.intent, model=cfg.drafter_model)
    return EmailDraftResponse(draft=draft_text, provider=cfg.drafter_provider, model=cfg.drafter_model)

