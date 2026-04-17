from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ExternalToolCost(BaseModel):
    name: str
    cost: Decimal


class TokenInfo(BaseModel):
    input: int
    output: int


class TelemetryEventCreate(BaseModel):
    event_id: str
    tool_name: str
    component_name: str
    service_type: str
    execution_type: str
    user_id: str
    org_id: str = "default"
    project_id: Optional[str] = None
    input_data_size_mb: Decimal = Decimal("0")
    output_data_size_mb: Decimal = Decimal("0")
    external_tools: list[ExternalToolCost] = []
    tokens: Optional[TokenInfo] = None
    status: str = "success"
    latency_ms: int = 0
    api_key_id: Optional[str] = None


class CostBreakdownResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    cost_type: str
    component_name: Optional[str] = None
    unit_cost: Decimal
    quantity: Decimal
    total_cost: Decimal


class TelemetryEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: str
    org_id: str
    project_id: Optional[str] = None
    user_id: Optional[str] = None
    tool_name: str
    service_type: Optional[str] = None
    component_name: Optional[str] = None
    execution_type: Optional[str] = None
    status: Optional[str] = None
    input_data_size_mb: Optional[Decimal] = None
    output_data_size_mb: Optional[Decimal] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    latency_ms: Optional[int] = None
    created_at: Optional[datetime] = None
    cost_breakdown: list[CostBreakdownResponse] = []


class CostSummary(BaseModel):
    llm_cost: Decimal = Decimal("0")
    external_cost: Decimal = Decimal("0")
    infra_cost: Decimal = Decimal("0")
    total_cost: Decimal = Decimal("0")


class ToolRegistryCreate(BaseModel):
    tool_name: str
    tool_type: str
    vendor: str
    cost_model: str
    base_cost: Decimal


class ToolRegistryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tool_name: str
    tool_type: Optional[str] = None
    vendor: Optional[str] = None
    cost_model: Optional[str] = None
    base_cost: Optional[Decimal] = None
    created_at: Optional[datetime] = None


class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    org_id: Optional[str] = None
    tool_name: Optional[str] = None
    alert_type: Optional[str] = None
    severity: Optional[str] = None
    message: Optional[str] = None
    threshold_value: Optional[Decimal] = None
    actual_value: Optional[Decimal] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None


class DailySummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    org_id: str
    project_id: Optional[str] = None
    tool_name: str
    date: date
    total_events: int
    total_cost: Decimal
    llm_cost: Decimal
    ml_cost: Decimal
    infra_cost: Decimal
    external_cost: Decimal
    total_tokens: Optional[Decimal] = None
    avg_latency_ms: int = 0
    success_count: int = 0
    failure_count: int = 0
    total_input_mb: Optional[Decimal] = None
    total_output_mb: Optional[Decimal] = None


class TodaySummaryResponse(BaseModel):
    total_cost: Decimal
    total_events: int
    tools: list[DailySummaryResponse]


class ToolUsageResponse(BaseModel):
    tool_name: str
    vendor: Optional[str] = None
    total_events: int
    total_cost: Decimal
    total_tokens: Decimal = Decimal("0")
    total_tokens_in: Decimal
    total_tokens_out: Decimal


class DataSecurityLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: Optional[str] = None
    pii_detected: Optional[bool] = None
    pii_type: Optional[str] = None
    masking_applied: Optional[bool] = None
    risk_score: Optional[Decimal] = None
    data_in_mb: Optional[Decimal] = None
    data_out_mb: Optional[Decimal] = None
    created_at: Optional[datetime] = None


class OrganizationCreate(BaseModel):
    id: str
    org_name: str
    plan_type: Optional[str] = None
    budget_limit: Optional[Decimal] = None


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    org_name: str
    plan_type: Optional[str] = None
    budget_limit: Optional[Decimal] = None
    created_at: Optional[datetime] = None


class ProjectCreate(BaseModel):
    id: str
    org_id: str
    project_name: Optional[str] = None
    environment: Optional[str] = None


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    org_id: str
    project_name: Optional[str] = None
    environment: Optional[str] = None
    created_at: Optional[datetime] = None


class UserCreate(BaseModel):
    id: str
    org_id: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    org_id: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    created_at: Optional[datetime] = None


class ApiKeyCreate(BaseModel):
    id: str
    org_id: Optional[str] = None
    project_id: Optional[str] = None
    key_name: Optional[str] = None
    provider: Optional[str] = None


class ApiKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    org_id: Optional[str] = None
    project_id: Optional[str] = None
    key_name: Optional[str] = None
    provider: Optional[str] = None
    created_at: Optional[datetime] = None


class BudgetCreate(BaseModel):
    org_id: str
    project_id: Optional[str] = None
    budget_type: str
    limit_amount: Decimal
    alert_threshold_percent: int = 80


class BudgetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    org_id: Optional[str] = None
    project_id: Optional[str] = None
    budget_type: Optional[str] = None
    limit_amount: Optional[Decimal] = None
    alert_threshold_percent: Optional[int] = None
    created_at: Optional[datetime] = None


class MonthlySummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    org_id: str
    project_id: Optional[str] = None
    tool_name: str
    month: date
    total_events: int
    total_cost: Decimal
    llm_cost: Decimal
    ml_cost: Decimal
    infra_cost: Decimal
    external_cost: Decimal
    total_tokens: Optional[Decimal] = None
    avg_latency_ms: int = 0
    success_count: int = 0
    failure_count: int = 0
