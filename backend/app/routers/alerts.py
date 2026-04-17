from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import Alert
from app.schemas import AlertResponse

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/", response_model=list[AlertResponse])
def list_alerts(
    status: Optional[str] = Query("active"),
    db: Session = Depends(get_db),
):
    query = db.query(Alert)
    if status:
        query = query.filter(Alert.status == status)
    return query.order_by(Alert.created_at.desc()).all()


@router.patch("/{alert_id}/resolve", response_model=AlertResponse)
def resolve_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "resolved"
    db.commit()
    db.refresh(alert)
    return alert
