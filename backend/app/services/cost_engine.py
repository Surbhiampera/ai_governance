from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import ToolRegistry
from app.schemas import CostSummary, TelemetryEventCreate


class CostEngine:
    def calculate(self, event_data: TelemetryEventCreate, db: Session) -> CostSummary:
        llm_cost = Decimal("0")
        external_cost = Decimal("0")
        infra_cost = Decimal("0")

        # LLM cost
        if event_data.tokens:
            tool = db.query(ToolRegistry).filter(
                (ToolRegistry.tool_name == event_data.tool_name)
                | (ToolRegistry.tool_name == event_data.component_name)
            ).first()

            rate = Decimal(str(tool.base_cost)) if tool and tool.base_cost else Decimal("0.002")
            total_tokens = event_data.tokens.input + event_data.tokens.output
            llm_cost = Decimal(str(total_tokens)) / Decimal("1000") * rate

        # External cost
        for ext in event_data.external_tools:
            external_cost += ext.cost

        # Infra cost
        infra_cost = Decimal(str(event_data.latency_ms)) * Decimal("0.0001")

        total_cost = llm_cost + external_cost + infra_cost

        return CostSummary(
            llm_cost=llm_cost,
            external_cost=external_cost,
            infra_cost=infra_cost,
            total_cost=total_cost,
        )
