from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.schemas import BatchTelemetryIngest

router = APIRouter(prefix="/v1/telemetry", tags=["telemetry"])


@router.post("/events")
def ingest_events_v1(batch: BatchTelemetryIngest, db: Session = Depends(get_db)):
    # Reuse the canonical ingestion pipeline (cost engine, governance, alerts, summaries).
    from app.routers.telemetry import _ingest_event  # local import to avoid import cycles

    ingested = []
    for event_data in batch.events:
        event = _ingest_event(db, event_data)
        ingested.append(event.event_id)
    db.commit()
    return {"status": "completed", "ingested_count": len(ingested), "event_ids": ingested}

