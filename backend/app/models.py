from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)

from app.database import Base


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


class TelemetryEvent(Base):
    __tablename__ = "telemetry_events"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    event_id = Column(String(120), unique=True, nullable=False)
    org_id = Column(String, nullable=False)
    project_id = Column(String, nullable=True)
    user_id = Column(String, nullable=True)
    tool_name = Column(String, nullable=False)
    service_type = Column(String, nullable=True)
    component_name = Column(String, nullable=True)
    execution_type = Column(String, nullable=True)
    status = Column(String, nullable=True)
    input_data_size_mb = Column(Numeric, default=0)
    output_data_size_mb = Column(Numeric, default=0)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    latency_ms = Column(Integer, default=0)
    api_key_id = Column(String(120), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class CostBreakdown(Base):
    __tablename__ = "cost_breakdown"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    event_id = Column(String(120), ForeignKey("telemetry_events.event_id"))
    cost_type = Column(String, nullable=False)
    component_name = Column(String, nullable=True)
    unit_cost = Column(Numeric, default=0)
    quantity = Column(Numeric, default=0)
    total_cost = Column(Numeric, default=0)
    created_at = Column(DateTime, server_default=func.now())


class ToolRegistry(Base):
    __tablename__ = "tool_registry"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    tool_name = Column(String, unique=True, nullable=False)
    tool_type = Column(String, nullable=True)
    vendor = Column(String, nullable=True)
    cost_model = Column(String, nullable=True)
    base_cost = Column(Numeric, default=0)
    created_at = Column(DateTime, server_default=func.now())


class ExecutionPipeline(Base):
    __tablename__ = "execution_pipeline"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    event_id = Column(String(120), ForeignKey("telemetry_events.event_id"))
    stage_name = Column(String, nullable=True)
    system_name = Column(String, nullable=True)
    status = Column(String, nullable=True)
    retry_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    org_id = Column(String, nullable=True)
    tool_name = Column(String, nullable=True)
    alert_type = Column(String, nullable=True)
    severity = Column(String, nullable=True)
    message = Column(String, nullable=True)
    threshold_value = Column(Numeric, nullable=True)
    actual_value = Column(Numeric, nullable=True)
    status = Column(String, default="active")
    created_at = Column(DateTime, server_default=func.now())


class DataSecurityLog(Base):
    __tablename__ = "data_security_logs"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True)
    event_id = Column(String(120), ForeignKey("telemetry_events.event_id"))
    pii_detected = Column(Boolean, default=False)
    pii_type = Column(String, nullable=True)
    masking_applied = Column(Boolean, default=False)
    risk_score = Column(Numeric, default=0)
    data_in_mb = Column(Numeric, default=0)
    data_out_mb = Column(Numeric, default=0)
    created_at = Column(DateTime, server_default=func.now())


class DailyOrgSummary(Base):
    __tablename__ = "daily_org_summary"
    __table_args__ = (
        UniqueConstraint("org_id", "project_id", "tool_name", "date"),
        {"extend_existing": True},
    )

    id = Column(BigInteger, primary_key=True)
    org_id = Column(String, nullable=False)
    project_id = Column(String(100), nullable=True)
    tool_name = Column(String, nullable=False)
    date = Column(Date, nullable=False)
    total_events = Column(Integer, default=0)
    total_cost = Column(Numeric, default=0)
    llm_cost = Column(Numeric, default=0)
    ml_cost = Column(Numeric, default=0)
    infra_cost = Column(Numeric, default=0)
    external_cost = Column(Numeric, default=0)
    avg_latency_ms = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)
    total_input_mb = Column(Numeric(12, 4), default=0)
    total_output_mb = Column(Numeric(12, 4), default=0)
    created_at = Column(DateTime, server_default=func.now())


class MonthlyOrgSummary(Base):
    __tablename__ = "monthly_org_summary"
    __table_args__ = (
        UniqueConstraint("org_id", "project_id", "tool_name", "month"),
        {"extend_existing": True},
    )

    id = Column(BigInteger, primary_key=True)
    org_id = Column(String(100), nullable=True)
    project_id = Column(String(100), nullable=True)
    tool_name = Column(String(150), nullable=True)
    month = Column(Date, nullable=False)
    total_events = Column(Integer, default=0)
    total_cost = Column(Numeric(14, 6), default=0)
    llm_cost = Column(Numeric(14, 6), default=0)
    ml_cost = Column(Numeric(14, 6), default=0)
    infra_cost = Column(Numeric(14, 6), default=0)
    external_cost = Column(Numeric(14, 6), default=0)
    avg_latency_ms = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)
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
