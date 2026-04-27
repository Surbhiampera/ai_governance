from fastapi import APIRouter

from app.workers.tasks import run_alert_scan, run_anomaly_detection, run_connector_poll, run_daily_aggregation, run_monthly_aggregation

router = APIRouter(prefix="/workers", tags=["workers"])


@router.post("/daily-aggregation")
def trigger_daily_aggregation():
    run_daily_aggregation.delay()
    return {"status": "queued", "task": "daily_aggregation"}


@router.post("/monthly-aggregation")
def trigger_monthly_aggregation():
    run_monthly_aggregation.delay()
    return {"status": "queued", "task": "monthly_aggregation"}


@router.post("/daily-aggregation/sync")
def trigger_daily_aggregation_sync():
    result = run_daily_aggregation()
    return {"status": "completed", "result": result}


@router.post("/monthly-aggregation/sync")
def trigger_monthly_aggregation_sync():
    result = run_monthly_aggregation()
    return {"status": "completed", "result": result}


@router.post("/anomaly-detection")
def trigger_anomaly_detection():
    run_anomaly_detection.delay()
    return {"status": "queued", "task": "anomaly_detection"}


@router.post("/anomaly-detection/sync")
def trigger_anomaly_detection_sync():
    result = run_anomaly_detection()
    return {"status": "completed", "result": result}


@router.post("/alert-scan")
def trigger_alert_scan():
    run_alert_scan.delay()
    return {"status": "queued", "task": "alert_scan"}


@router.post("/alert-scan/sync")
def trigger_alert_scan_sync():
    result = run_alert_scan()
    return {"status": "completed", "result": result}


@router.post("/connector-poll")
def trigger_connector_poll():
    run_connector_poll.delay()
    return {"status": "queued", "task": "connector_poll"}


@router.post("/connector-poll/sync")
def trigger_connector_poll_sync():
    result = run_connector_poll()
    return {"status": "completed", "result": result}
