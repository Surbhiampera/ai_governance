from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Alert, Budget, DailyOrgSummary, GovernanceRule, TelemetryEvent, UsageAnomaly
from app.schemas import CostSummary, TelemetryEventCreate


class AlertEngine:
    def evaluate(
        self,
        db: Session,
        event_data: TelemetryEventCreate,
        cost_summary: CostSummary,
        security_result: dict,
        anomaly_score: Decimal,
        abnormal_usage_spike: bool,
    ) -> None:
        event_metrics = {
            "total_cost": Decimal(str(cost_summary.total_cost)),
            "risk_score": Decimal(str(security_result["risk_score"])),
            "latency_ms": Decimal(str(event_data.latency_ms)),
            "prompt_tokens": Decimal(str(event_data.prompt_tokens)),
            "completion_tokens": Decimal(str(event_data.completion_tokens)),
            "total_tokens": Decimal(str(event_data.prompt_tokens + event_data.completion_tokens)),
            "data_out_mb": Decimal(str(event_data.output_data_size_mb)),
            "anomaly_score": Decimal(str(anomaly_score)),
        }

        if security_result["pii_detected"]:
            self._create_alert(
                db=db,
                org_id=event_data.org_id,
                tool_name=event_data.tool_name,
                event_id=event_data.event_id,
                alert_type="pii_detected",
                severity="critical",
                message=f"PII detected for event {event_data.event_id} with risk score {security_result['risk_score']}.",
                threshold=Decimal("50"),
                actual=Decimal(str(security_result["risk_score"])),
            )

        if security_result["data_out_violation"]:
            self._create_alert(
                db=db,
                org_id=event_data.org_id,
                tool_name=event_data.tool_name,
                event_id=event_data.event_id,
                alert_type="data_out_violation",
                severity="high",
                message=f"Data out policy threshold exceeded for {event_data.event_id}.",
                threshold=Decimal("12"),
                actual=Decimal(str(event_data.output_data_size_mb)),
            )

        if security_result["misuse_pattern_detected"]:
            self._create_alert(
                db=db,
                org_id=event_data.org_id,
                tool_name=event_data.tool_name,
                event_id=event_data.event_id,
                alert_type="misuse_pattern",
                severity="critical",
                message=f"Potential misuse pattern detected for event {event_data.event_id}.",
                threshold=Decimal("1"),
                actual=Decimal("1"),
            )

        if abnormal_usage_spike:
            self._create_alert(
                db=db,
                org_id=event_data.org_id,
                tool_name=event_data.tool_name,
                event_id=event_data.event_id,
                alert_type="usage_spike",
                severity="high",
                message=f"Abnormal usage spike detected for {event_data.tool_name}.",
                threshold=Decimal("1.50"),
                actual=Decimal(str(anomaly_score)),
            )

        self._evaluate_budgets(db, event_data.org_id, event_data.project_id, event_data.tool_name)
        self._evaluate_custom_rules(db, event_data, event_metrics)
        db.flush()

    def _evaluate_budgets(self, db: Session, org_id: str, project_id: str | None, tool_name: str) -> None:
        today = date.today()
        budgets = db.query(Budget).filter(Budget.org_id == org_id).all()
        for budget in budgets:
            spent_query = db.query(func.coalesce(func.sum(DailyOrgSummary.total_cost), 0)).filter(
                DailyOrgSummary.org_id == org_id
            )
            if budget.project_id:
                spent_query = spent_query.filter(DailyOrgSummary.project_id == budget.project_id)

            if budget.budget_type == "daily":
                spent_query = spent_query.filter(DailyOrgSummary.date == today)
            else:
                spent_query = spent_query.filter(DailyOrgSummary.date >= today.replace(day=1))

            spent = Decimal(str(spent_query.scalar() or 0))
            limit_amount = Decimal(str(budget.limit_amount or 0))
            threshold_percent = Decimal(str(budget.alert_threshold_percent or 80))
            if limit_amount <= 0:
                continue
            percentage = (spent / limit_amount) * Decimal("100")
            if percentage >= threshold_percent:
                self._create_alert(
                    db=db,
                    org_id=org_id,
                    tool_name=tool_name,
                    event_id=None,
                    alert_type="budget_threshold",
                    severity="high",
                    message=f"{budget.budget_type.capitalize()} budget is at {percentage:.1f}% of limit.",
                    threshold=limit_amount,
                    actual=spent,
                )

    def _evaluate_custom_rules(
        self,
        db: Session,
        event_data: TelemetryEventCreate,
        metrics: dict[str, Decimal],
    ) -> None:
        rules = db.query(GovernanceRule).filter(GovernanceRule.is_active.is_(True)).all()
        for rule in rules:
            metric_value = metrics.get(rule.metric_name)
            if metric_value is None:
                continue

            if rule.scope_level == "tool" and rule.scope_reference and rule.scope_reference != event_data.tool_name:
                continue
            if rule.scope_level == "project" and rule.scope_reference and rule.scope_reference != event_data.project_id:
                continue
            if rule.scope_level == "organization" and rule.scope_reference and rule.scope_reference != event_data.org_id:
                continue

            if self._compare(metric_value, Decimal(str(rule.threshold_value)), rule.operator):
                self._create_alert(
                    db=db,
                    org_id=event_data.org_id,
                    tool_name=event_data.tool_name,
                    event_id=event_data.event_id,
                    alert_type=f"rule:{rule.metric_name}",
                    severity=rule.severity,
                    message=f"Rule '{rule.rule_name}' triggered on {rule.metric_name}.",
                    threshold=Decimal(str(rule.threshold_value)),
                    actual=metric_value,
                    rule_id=rule.id,
                    source="rule_engine",
                )

    def create_daily_anomaly_alerts(self, db: Session) -> int:
        recent = (
            db.query(UsageAnomaly)
            .filter(UsageAnomaly.status == "open")
            .order_by(UsageAnomaly.created_at.desc())
            .limit(20)
            .all()
        )
        created = 0
        for anomaly in recent:
            self._create_alert(
                db=db,
                org_id=anomaly.org_id,
                tool_name=anomaly.tool_name,
                event_id=anomaly.event_id,
                alert_type=anomaly.anomaly_type,
                severity=anomaly.severity,
                message=anomaly.message or "Anomaly detected during scheduled scan.",
                threshold=Decimal(str(anomaly.baseline_value)),
                actual=Decimal(str(anomaly.observed_value)),
                source="anomaly_scan",
            )
            created += 1
        db.flush()
        return created

    def _compare(self, left: Decimal, right: Decimal, operator: str) -> bool:
        if operator == ">":
            return left > right
        if operator == ">=":
            return left >= right
        if operator == "<":
            return left < right
        if operator == "<=":
            return left <= right
        if operator == "=":
            return left == right
        return False

    def _create_alert(
        self,
        db: Session,
        org_id: str | None,
        tool_name: str | None,
        event_id: str | None,
        alert_type: str,
        severity: str,
        message: str,
        threshold: Decimal | None,
        actual: Decimal | None,
        rule_id: int | None = None,
        source: str = "system",
    ) -> None:
        recent_cutoff = date.today() - timedelta(days=1)
        existing = (
            db.query(Alert)
            .filter(
                Alert.org_id == org_id,
                Alert.tool_name == tool_name,
                Alert.alert_type == alert_type,
                Alert.status == "active",
                func.date(Alert.created_at) >= recent_cutoff,
            )
            .first()
        )
        if existing:
            return

        db.add(
            Alert(
                org_id=org_id,
                tool_name=tool_name,
                event_id=event_id,
                rule_id=rule_id,
                alert_type=alert_type,
                severity=severity,
                source=source,
                message=message,
                threshold_value=threshold,
                actual_value=actual,
                status="active",
            )
        )
