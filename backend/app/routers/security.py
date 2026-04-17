from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import DataSecurityLog
from app.schemas import DataSecurityLogResponse

router = APIRouter(prefix="/security", tags=["security"])


@router.get("/logs", response_model=list[DataSecurityLogResponse])
def list_security_logs(
    pii_detected: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(DataSecurityLog)
    if pii_detected is not None:
        query = query.filter(DataSecurityLog.pii_detected == pii_detected)
    return query.order_by(DataSecurityLog.created_at.desc()).all()


@router.get("/summary")
def get_security_summary(db: Session = Depends(get_db)):
    total_events = db.query(func.count(DataSecurityLog.id)).scalar() or 0
    total_with_pii = db.query(func.count(DataSecurityLog.id)).filter(
        DataSecurityLog.pii_detected.is_(True)
    ).scalar() or 0
    avg_risk = db.query(func.coalesce(func.avg(DataSecurityLog.risk_score), 0)).scalar()

    return {
        "total_events": total_events,
        "total_with_pii": total_with_pii,
        "average_risk_score": round(float(avg_risk), 2),
    }
