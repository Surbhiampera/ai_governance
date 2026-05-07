from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)

from app.database import Base


class Provider(Base):
    __tablename__ = "providers"
    __table_args__ = {"extend_existing": True}

    id = Column(String(100), primary_key=True)
    provider_name = Column(String(150), nullable=True)


class Organization(Base):
    __tablename__ = "organizations"
    __table_args__ = {"extend_existing": True}

    id = Column(String(100), primary_key=True)
    org_name = Column(String(150), nullable=False)
    plan_type = Column(String(50), nullable=True)
    budget_limit = Column(Numeric(14, 6), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = {"extend_existing": True}

    id = Column(String(100), primary_key=True)
    org_id = Column(String(100), ForeignKey("organizations.id"), nullable=False)
    project_name = Column(String(150), nullable=True)
    environment = Column(String(50), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"extend_existing": True}

    id = Column(String(100), primary_key=True)
    org_id = Column(String(100), ForeignKey("organizations.id"), nullable=True)
    email = Column(String(150), nullable=True)
    role = Column(String(50), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class ApiKey(Base):
    __tablename__ = "api_keys"
    __table_args__ = {"extend_existing": True}

    id = Column(String(120), primary_key=True)
    org_id = Column(String(100), ForeignKey("organizations.id"), nullable=True)
    project_id = Column(String(100), ForeignKey("projects.id"), nullable=True)
    key_name = Column(String(150), nullable=True)
    provider = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class UserProject(Base):
    __tablename__ = "user_projects"
    __table_args__ = {"extend_existing": True}

    user_id = Column(String(100), ForeignKey("users.id"), primary_key=True)
    project_id = Column(String(100), ForeignKey("projects.id"), primary_key=True)
    role = Column(String(50), nullable=True)


class UploadData(Base):
    __tablename__ = "upload_data"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    org_id = Column(String(100), ForeignKey("organizations.id"), nullable=True)
    project_id = Column(String(100), ForeignKey("projects.id"), nullable=True)
    user_id = Column(String(100), ForeignKey("users.id"), nullable=True)
    file_name = Column(Text, nullable=True)
    file_type = Column(String(50), nullable=True)
    file_size_mb = Column(Numeric(10, 2), nullable=True)
    storage_path = Column(Text, nullable=True)
    upload_source = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class ToolRegistry(Base):
    __tablename__ = "tool_registry"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    tool_name = Column(String(150), unique=True, nullable=False)
    tool_type = Column(String(50), nullable=True)
    vendor = Column(String(100), nullable=True)
    cost_model = Column(String(50), nullable=True)
    base_cost = Column(Numeric(12, 6), default=0)
    created_at = Column(DateTime, server_default=func.now())


class ModelRegistry(Base):
    __tablename__ = "model_registry"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    model_name = Column(String(120), unique=True, nullable=False)
    provider = Column(String(100), nullable=True)
    model_type = Column(String(50), nullable=True)
    cost_per_1k_tokens = Column(Numeric(12, 6), default=0)
    created_at = Column(DateTime, server_default=func.now())


class ToolConnector(Base):
    __tablename__ = "tool_connectors"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    connector_name = Column(String(150), unique=True, nullable=False)
    tool_name = Column(String(150), nullable=False)
    provider = Column(String(100), nullable=True)
    endpoint_url = Column(String(255), nullable=True)
    auth_type = Column(String(50), nullable=True)
    ingestion_mode = Column(String(50), nullable=False, default="api")
    status = Column(String(30), nullable=False, default="active")
    # Routing context — org/project for events ingested through this connector
    org_id = Column(String(100), nullable=True)
    project_id = Column(String(100), nullable=True)
    # Vendor credential (stored as-is; production deployments should encrypt)
    api_key = Column(String(500), nullable=True)
    last_ingested_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class GovernanceRule(Base):
    __tablename__ = "governance_rules"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    rule_name = Column(String(150), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    metric_name = Column(String(100), nullable=False)
    operator = Column(String(20), nullable=False, default=">")
    threshold_value = Column(Numeric(14, 6), nullable=False, default=0)
    severity = Column(String(20), nullable=False, default="medium")
    scope_level = Column(String(30), nullable=False, default="organization")
    scope_reference = Column(String(150), nullable=True)
    is_active = Column(Boolean, default=True)
    org_id = Column(String(100), nullable=True)
    project_id = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class TelemetryEvent(Base):
    __tablename__ = "telemetry_events"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    event_id = Column(String(120), unique=True, nullable=False)
    request_id = Column(String(120), nullable=True)
    trace_id = Column(String(120), nullable=True)
    org_id = Column(String(100), nullable=False)
    project_id = Column(String(100), nullable=True)
    user_id = Column(String(100), nullable=True)
    api_key_id = Column(String(120), nullable=True)
    provider = Column(String(100), nullable=True)
    model_name = Column(String(100), nullable=True)
    service_type = Column(String(50), nullable=True)
    component_name = Column(String(150), nullable=True)
    execution_type = Column(String(50), nullable=True)
    status = Column(String(30), nullable=True)
    input_data_size_mb = Column(Numeric(12, 4), default=0)
    output_data_size_mb = Column(Numeric(12, 4), default=0)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    llm_cost = Column(Numeric(14, 6), default=0)
    infra_cost = Column(Numeric(14, 6), default=0)
    external_cost = Column(Numeric(14, 6), default=0)
    total_cost = Column(Numeric(14, 6), default=0)
    risk_score = Column(Numeric(8, 2), default=0)
    anomaly_score = Column(Numeric(8, 2), default=0)
    misuse_detected = Column(Boolean, default=False)
    abnormal_usage_spike = Column(Boolean, default=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    latency_ms = Column(Integer, default=0)
    tags = Column(JSON, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    raw_usage_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class CostBreakdown(Base):
    __tablename__ = "cost_breakdown"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    event_id = Column(String(120), ForeignKey("telemetry_events.event_id"), nullable=False)
    cost_type = Column(String(50), nullable=False)
    component_name = Column(String(150), nullable=True)
    unit_cost = Column(Numeric(12, 6), default=0)
    quantity = Column(Numeric(12, 6), default=0)
    total_cost = Column(Numeric(12, 6), default=0)
    created_at = Column(DateTime, server_default=func.now())


class ExecutionPipeline(Base):
    __tablename__ = "execution_pipeline"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    event_id = Column(String(120), ForeignKey("telemetry_events.event_id"), nullable=False)
    stage_order = Column(Integer, default=0)
    stage_name = Column(String(150), nullable=False)
    system_name = Column(String(150), nullable=True)
    status = Column(String(30), nullable=True)
    stage_latency_ms = Column(Integer, default=0)
    retry_count = Column(Integer, default=0)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class DataSecurityLog(Base):
    __tablename__ = "data_security_logs"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    event_id = Column(String(120), ForeignKey("telemetry_events.event_id"), nullable=False)
    org_id = Column(String(100), nullable=True)
    project_id = Column(String(100), nullable=True)
    pii_detected = Column(Boolean, default=False)
    pii_type = Column(String(100), nullable=True)
    data_out_violation = Column(Boolean, default=False)
    misuse_pattern_detected = Column(Boolean, default=False)
    abnormal_usage_spike = Column(Boolean, default=False)
    masking_applied = Column(Boolean, default=False)
    risk_score = Column(Numeric(8, 2), default=0)
    data_in_mb = Column(Numeric(12, 4), default=0)
    data_out_mb = Column(Numeric(12, 4), default=0)
    created_at = Column(DateTime, server_default=func.now())


class UsageAnomaly(Base):
    __tablename__ = "usage_anomalies"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    org_id = Column(String(100), nullable=False)
    project_id = Column(String(100), nullable=True)
    tool_name = Column(String(150), nullable=False)
    event_id = Column(String(120), nullable=True)
    anomaly_type = Column(String(60), nullable=False)
    severity = Column(String(20), nullable=False, default="medium")
    anomaly_score = Column(Numeric(8, 2), default=0)
    baseline_value = Column(Numeric(14, 6), default=0)
    observed_value = Column(Numeric(14, 6), default=0)
    message = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="open")
    created_at = Column(DateTime, server_default=func.now())


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    org_id = Column(String(100), nullable=True)
    project_id = Column(String(100), nullable=True)
    rule_id = Column(BigInteger, nullable=True)
    alert_type = Column(String(100), nullable=True)
    severity = Column(String(50), nullable=True)
    message = Column(Text, nullable=True)
    threshold_value = Column(Numeric(10, 2), nullable=True)
    actual_value = Column(Numeric(10, 2), nullable=True)
    status = Column(String(50), default="active")
    telemetry_id = Column(BigInteger, ForeignKey("telemetry_events.id"), nullable=True)
    tool_name = Column(String(150), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class DailyOrgSummary(Base):
    __tablename__ = "daily_org_summary"
    __table_args__ = (
        UniqueConstraint("org_id", "project_id", "tool_name", "date"),
        {"extend_existing": True},
    )

    id = Column(BigInteger, primary_key=True)
    org_id = Column(String(100), nullable=False)
    project_id = Column(String(100), nullable=True)
    tool_name = Column(String(150), nullable=False)
    date = Column(Date, nullable=False)
    total_events = Column(Integer, default=0)
    total_cost = Column(Numeric(14, 6), default=0)
    llm_cost = Column(Numeric(14, 6), default=0)
    infra_cost = Column(Numeric(14, 6), default=0)
    external_cost = Column(Numeric(14, 6), default=0)
    total_prompt_tokens = Column(Integer, default=0)
    total_completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    avg_latency_ms = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)
    anomaly_count = Column(Integer, default=0)
    misuse_count = Column(Integer, default=0)
    total_input_mb = Column(Numeric(12, 4), default=0)
    total_output_mb = Column(Numeric(12, 4), default=0)
    avg_risk_score = Column(Numeric(8, 2), default=0)
    created_at = Column(DateTime, server_default=func.now())


class MonthlyOrgSummary(Base):
    __tablename__ = "monthly_org_summary"
    __table_args__ = (
        UniqueConstraint("org_id", "project_id", "tool_name", "month"),
        {"extend_existing": True},
    )

    id = Column(BigInteger, primary_key=True)
    org_id = Column(String(100), nullable=False)
    project_id = Column(String(100), nullable=True)
    tool_name = Column(String(150), nullable=False)
    month = Column(Date, nullable=False)
    total_events = Column(Integer, default=0)
    total_cost = Column(Numeric(14, 6), default=0)
    llm_cost = Column(Numeric(14, 6), default=0)
    infra_cost = Column(Numeric(14, 6), default=0)
    external_cost = Column(Numeric(14, 6), default=0)
    total_tokens = Column(Integer, default=0)
    total_prompt_tokens = Column(Integer, default=0)
    total_completion_tokens = Column(Integer, default=0)
    avg_latency_ms = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)
    anomaly_count = Column(Integer, default=0)
    misuse_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    org_id = Column(String(100), ForeignKey("organizations.id"), nullable=True)
    project_id = Column(String(100), ForeignKey("projects.id"), nullable=True)
    budget_type = Column(String(50), nullable=True)
    limit_amount = Column(Numeric(14, 6), nullable=True)
    alert_threshold_percent = Column(Integer, default=80)
    created_at = Column(DateTime, server_default=func.now())


class RateLimit(Base):
    __tablename__ = "rate_limits"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    org_id = Column(String(100), nullable=True)
    tool_name = Column(String(150), nullable=True)
    max_requests_per_min = Column(Integer, nullable=True)
    max_tokens_per_day = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class RateLimitViolation(Base):
    __tablename__ = "rate_limit_violations"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    org_id = Column(String(100), nullable=True)
    project_id = Column(String(100), nullable=True)
    tool_name = Column(String(150), nullable=True)
    violation_type = Column(String(50), nullable=True)
    observed_value = Column(Integer, nullable=True)
    limit_value = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class TraceModelUsage(Base):
    __tablename__ = "trace_model_usage"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    event_id = Column(String(120), ForeignKey("telemetry_events.event_id"), nullable=False)
    trace_id = Column(String(120), nullable=True)
    org_id = Column(String(100), nullable=False)
    project_id = Column(String(100), nullable=True)
    model_name = Column(String(120), nullable=False)
    provider = Column(String(100), nullable=True)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    llm_cost = Column(Numeric(14, 6), default=0)
    latency_ms = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())


class TraceToolUsage(Base):
    __tablename__ = "trace_tool_usage"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    event_id = Column(String(120), ForeignKey("telemetry_events.event_id"), nullable=False)
    trace_id = Column(String(120), nullable=True)
    org_id = Column(String(100), nullable=False)
    project_id = Column(String(100), nullable=True)
    tool_name = Column(String(150), nullable=False)
    tool_type = Column(String(50), nullable=True)
    invocation_count = Column(Integer, default=1)
    execution_time_ms = Column(Integer, default=0)
    cost = Column(Numeric(14, 6), default=0)
    created_at = Column(DateTime, server_default=func.now())


class EmailAgentLog(Base):
    __tablename__ = "email_agent_logs"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    event_id = Column(String(120), ForeignKey("telemetry_events.event_id"), nullable=False)
    email_id = Column(String(255), nullable=True)
    sender_domain = Column(String(150), nullable=True)
    intent = Column(String(100), nullable=True)
    intent_confidence = Column(Numeric(5, 3), nullable=True)
    pii_masked = Column(Boolean, default=False)
    masking_types = Column(JSON, nullable=True)
    draft_generated = Column(Boolean, default=False)
    auto_replied = Column(Boolean, default=False)
    classification_model = Column(String(100), nullable=True)
    draft_model = Column(String(100), nullable=True)
    stage_latencies = Column(JSON, nullable=True)
    pipeline_status = Column(String(30), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class ModelPricing(Base):
    __tablename__ = "model_pricing"
    __table_args__ = (
        UniqueConstraint("provider", "model_name"),
        {"extend_existing": True},
    )

    id = Column(BigInteger, primary_key=True)
    provider = Column(String(100), nullable=True)
    model_name = Column(String(120), nullable=True)
    input_cost_per_1k = Column(Numeric(12, 6), default=0)
    output_cost_per_1k = Column(Numeric(12, 6), default=0)
    currency = Column(String(10), default="USD")
    effective_from = Column(DateTime, server_default=func.now())


class TraceSpan(Base):
    __tablename__ = "trace_spans"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    span_id = Column(String(120), unique=True, nullable=False)
    trace_id = Column(String(120), nullable=False)
    parent_span_id = Column(String(120), nullable=True)
    org_id = Column(String(100), nullable=False)
    project_id = Column(String(100), nullable=True)
    span_type = Column(String(60), nullable=False)  # agent/tool/llm/retrieval/gateway/policy
    span_name = Column(String(200), nullable=False)
    status = Column(String(30), nullable=False, default="success")
    provider = Column(String(100), nullable=True)
    model_name = Column(String(120), nullable=True)
    tool_name = Column(String(150), nullable=True)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    latency_ms = Column(Integer, default=0)
    retry_count = Column(Integer, default=0)
    metadata_json = Column(JSON, nullable=True)
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class StreamingTokenEvent(Base):
    __tablename__ = "streaming_token_events"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    trace_id = Column(String(120), nullable=False)
    span_id = Column(String(120), nullable=True)
    event_id = Column(String(120), nullable=True)
    org_id = Column(String(100), nullable=False)
    project_id = Column(String(100), nullable=True)
    provider = Column(String(100), nullable=True)
    model_name = Column(String(120), nullable=True)
    token_type = Column(String(30), nullable=False, default="completion")  # prompt|completion
    token_count = Column(Integer, default=1)
    token_text = Column(Text, nullable=True)
    sequence_no = Column(Integer, default=0)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class PromptResponseVersion(Base):
    __tablename__ = "prompt_response_versions"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    version_id = Column(String(120), unique=True, nullable=False)
    trace_id = Column(String(120), nullable=False)
    event_id = Column(String(120), nullable=True)
    org_id = Column(String(100), nullable=False)
    project_id = Column(String(100), nullable=True)
    prompt_hash = Column(String(120), nullable=False)
    response_hash = Column(String(120), nullable=True)
    parent_version_id = Column(String(120), nullable=True)
    prompt_text = Column(Text, nullable=True)
    response_text = Column(Text, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class EmailRecord(Base):
    """Archived email + agent outputs for audit and replay."""

    __tablename__ = "emails"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    org_id = Column(String(100), nullable=False)
    project_id = Column(String(100), nullable=True)
    trace_id = Column(String(120), nullable=True)
    graph_message_id = Column(String(255), unique=True, nullable=True)  # Microsoft Graph message id
    mailbox = Column(String(255), nullable=True)
    subject = Column(Text, nullable=True)
    sender_email = Column(String(255), nullable=True)
    sender_domain = Column(String(150), nullable=True)
    received_at = Column(DateTime, nullable=True)
    raw_body = Column(Text, nullable=True)
    masked_body = Column(Text, nullable=True)
    pii_masked = Column(Boolean, default=False)
    masking_types = Column(JSON, nullable=True)
    intent = Column(String(100), nullable=True)
    intent_confidence = Column(Numeric(5, 3), nullable=True)
    classification_provider = Column(String(100), nullable=True)
    classification_model = Column(String(120), nullable=True)
    draft_provider = Column(String(100), nullable=True)
    draft_model = Column(String(120), nullable=True)
    draft_text = Column(Text, nullable=True)
    auto_replied = Column(Boolean, default=False)
    pipeline_status = Column(String(30), nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
