import os
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Alert, Budget, DailyOrgSummary, TelemetryEvent
from app.schemas import CostSummary, TelemetryEventCreate


class AlertEngine:
    def evaluate(
        self,
        db: Session,
        event_data: TelemetryEventCreate,
        cost_summary: CostSummary,
        security_result: dict,
    ) -> None:
        cost_threshold = Decimal(os.getenv("ALERT_COST_THRESHOLD", "50.0"))
        data_out_threshold = float(os.getenv("ALERT_DATA_OUT_THRESHOLD_MB", "10.0"))
        spike_percent = float(os.getenv("ALERT_USAGE_SPIKE_PERCENT", "30.0"))

        # Cost spike check
        if cost_summary.total_cost > cost_threshold:
            db.add(Alert(
                org_id=event_data.org_id,
                tool_name=event_data.tool_name,
                alert_type="cost_spike",
                severity="high",
                message=f"Total cost {cost_summary.total_cost} exceeds threshold {cost_threshold}",
                threshold_value=cost_threshold,
                actual_value=cost_summary.total_cost,
            ))

        # Data output spike check
        if float(event_data.output_data_size_mb) > data_out_threshold:
            db.add(Alert(
                org_id=event_data.org_id,
                tool_name=event_data.tool_name,
                alert_type="usage_spike",
                severity="medium",
                message=f"Output data {event_data.output_data_size_mb} MB exceeds threshold {data_out_threshold} MB",
                threshold_value=Decimal(str(data_out_threshold)),
                actual_value=event_data.output_data_size_mb,
            ))

        # PII detected check
        if security_result.get("pii_detected"):
            db.add(Alert(
                org_id=event_data.org_id,
                tool_name=event_data.tool_name,
                alert_type="pii_detected",
                severity="critical",
                message=f"PII detected with risk score {security_result['risk_score']}",
                threshold_value=Decimal("50"),
                actual_value=Decimal(str(security_result["risk_score"])),
            ))

        # Usage spike: compare today vs yesterday event count
        today = date.today()
        yesterday = today - timedelta(days=1)

        today_count = db.query(func.count(TelemetryEvent.event_id)).filter(
            TelemetryEvent.tool_name == event_data.tool_name,
            func.date(TelemetryEvent.created_at) == today,
        ).scalar() or 0

        yesterday_count = db.query(func.count(TelemetryEvent.event_id)).filter(
            TelemetryEvent.tool_name == event_data.tool_name,
            func.date(TelemetryEvent.created_at) == yesterday,
        ).scalar() or 0

        if yesterday_count > 0:
            increase_pct = ((today_count - yesterday_count) / yesterday_count) * 100
            if increase_pct > spike_percent:
                db.add(Alert(
                    org_id=event_data.org_id,
                    tool_name=event_data.tool_name,
                    alert_type="usage_spike",
                    severity="medium",
                    message=f"Usage spike: {increase_pct:.1f}% increase vs yesterday",
                    threshold_value=Decimal(str(spike_percent)),
                    actual_value=Decimal(str(increase_pct)),
                ))

        # Budget threshold check
        budgets = db.query(Budget).filter(Budget.org_id == event_data.org_id).all()
        for budget in budgets:
            if budget.budget_type == "daily":
                spent = db.query(func.coalesce(func.sum(DailyOrgSummary.total_cost), 0)).filter(
                    DailyOrgSummary.org_id == event_data.org_id,
                    DailyOrgSummary.date == today,
                ).scalar()
            else:  # monthly
                month_start = today.replace(day=1)
                spent = db.query(func.coalesce(func.sum(DailyOrgSummary.total_cost), 0)).filter(
                    DailyOrgSummary.org_id == event_data.org_id,
                    DailyOrgSummary.date >= month_start,
                ).scalar()

            spent = float(spent or 0)
            limit_val = float(budget.limit_amount or 0)
            if limit_val > 0:
                pct = (spent / limit_val) * 100
                if pct >= (budget.alert_threshold_percent or 80):
                    db.add(Alert(
                        org_id=event_data.org_id,
                        tool_name=event_data.tool_name,
                        alert_type="budget_threshold",
                        severity="high",
                        message=f"Budget {budget.budget_type} threshold reached: {pct:.1f}% of ${limit_val:.2f} limit (spent ${spent:.2f})",
                        threshold_value=Decimal(str(limit_val)),
                        actual_value=Decimal(str(spent)),
                    ))

        db.flush()
