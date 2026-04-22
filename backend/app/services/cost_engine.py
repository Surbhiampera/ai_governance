from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import ModelPricing, ToolRegistry
from app.schemas import CostSummary, TelemetryEventCreate


class CostEngine:
    def calculate(self, event_data: TelemetryEventCreate, db: Session) -> CostSummary:
        llm_cost = Decimal("0")
        external_cost = Decimal("0")
        infra_cost = Decimal(str(event_data.infra_cost or 0))

        total_tokens = event_data.prompt_tokens + event_data.completion_tokens
        if total_tokens > 0:
            pricing = None
            if event_data.provider and event_data.model_name:
                pricing = (
                    db.query(ModelPricing)
                    .filter(
                        ModelPricing.provider == event_data.provider,
                        ModelPricing.model_name == event_data.model_name,
                    )
                    .first()
                )
            if pricing:
                llm_cost = (
                    Decimal(str(event_data.prompt_tokens)) / Decimal("1000") * Decimal(str(pricing.input_cost_per_1k))
                    + Decimal(str(event_data.completion_tokens)) / Decimal("1000") * Decimal(str(pricing.output_cost_per_1k))
                )
            else:
                tool = (
                    db.query(ToolRegistry)
                    .filter(
                        (ToolRegistry.tool_name == event_data.tool_name)
                        | (ToolRegistry.tool_name == event_data.component_name)
                    )
                    .first()
                )
                rate = Decimal(str(tool.base_cost)) if tool and tool.base_cost else Decimal("0.0025")
                llm_cost = Decimal(str(total_tokens)) / Decimal("1000") * rate

        if infra_cost == 0 and event_data.latency_ms > 0:
            infra_cost = Decimal(str(event_data.latency_ms)) * Decimal("0.00008")

        for ext in event_data.external_tools:
            external_cost += Decimal(str(ext.cost))

        total_cost = llm_cost + infra_cost + external_cost
        return CostSummary(
            llm_cost=llm_cost.quantize(Decimal("0.000001")),
            infra_cost=infra_cost.quantize(Decimal("0.000001")),
            external_cost=external_cost.quantize(Decimal("0.000001")),
            total_cost=total_cost.quantize(Decimal("0.000001")),
        )
