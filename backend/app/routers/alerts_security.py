from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import Alert, DataSecurityLog, UsageAnomaly
from app.schemas import AlertResponse, DataSecurityLogResponse, UsageAnomalyResponse

router = APIRouter(prefix="/alerts-security", tags=["alerts & security"])


# ── Alerts ──────────────────────────────────────────────

@router.get("/alerts", response_model=list[AlertResponse])
def list_alerts(
    status: Optional[str] = Query("active"),
    db: Session = Depends(get_db),
):
    query = db.query(Alert)
    if status:
        query = query.filter(Alert.status == status)
    return query.order_by(Alert.created_at.desc()).all()


@router.patch("/alerts/{alert_id}/resolve", response_model=AlertResponse)
def resolve_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "resolved"
    db.commit()
    db.refresh(alert)
    return alert


# ── Security ────────────────────────────────────────────

@router.get("/logs", response_model=list[DataSecurityLogResponse])
def list_security_logs(
    pii_detected: Optional[bool] = Query(None),
    misuse_detected: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(DataSecurityLog)
    if pii_detected is not None:
        query = query.filter(DataSecurityLog.pii_detected == pii_detected)
    if misuse_detected is not None:
        query = query.filter(DataSecurityLog.misuse_pattern_detected == misuse_detected)
    return query.order_by(DataSecurityLog.created_at.desc()).limit(100).all()


@router.get("/anomalies", response_model=list[UsageAnomalyResponse])
def list_usage_anomalies(status: Optional[str] = Query("open"), db: Session = Depends(get_db)):
    query = db.query(UsageAnomaly)
    if status:
        query = query.filter(UsageAnomaly.status == status)
    return query.order_by(UsageAnomaly.created_at.desc()).limit(100).all()


@router.get("/summary")
def get_security_summary(db: Session = Depends(get_db)):
    total_events = db.query(func.count(DataSecurityLog.id)).scalar() or 0
    total_with_pii = db.query(func.count(DataSecurityLog.id)).filter(DataSecurityLog.pii_detected.is_(True)).scalar() or 0
    misuse_events = (
        db.query(func.count(DataSecurityLog.id))
        .filter(DataSecurityLog.misuse_pattern_detected.is_(True))
        .scalar()
        or 0
    )
    data_out_events = (
        db.query(func.count(DataSecurityLog.id))
        .filter(DataSecurityLog.data_out_violation.is_(True))
        .scalar()
        or 0
    )
    avg_risk = db.query(func.coalesce(func.avg(DataSecurityLog.risk_score), 0)).scalar() or 0
    highest_risk = db.query(func.coalesce(func.max(DataSecurityLog.risk_score), 0)).scalar() or 0
    anomaly_open = db.query(func.count(UsageAnomaly.id)).filter(UsageAnomaly.status == "open").scalar() or 0
    active_alerts = db.query(func.count(Alert.id)).filter(Alert.status == "active").scalar() or 0

    return {
        "total_events": total_events,
        "total_with_pii": total_with_pii,
        "misuse_events": misuse_events,
        "data_out_events": data_out_events,
        "average_risk_score": Decimal(str(avg_risk)).quantize(Decimal("0.01")),
        "highest_risk_score": Decimal(str(highest_risk)).quantize(Decimal("0.01")),
        "open_anomalies": anomaly_open,
        "active_alerts": active_alerts,
    }
