from fastapi import APIRouter

from app.workers.tasks import run_daily_aggregation, run_monthly_aggregation

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
