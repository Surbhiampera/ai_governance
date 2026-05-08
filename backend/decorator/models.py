"""
ORM models for the Decorator Framework.

These four tables are created automatically at startup via Base.metadata.create_all().
They are imported into backend/app/models.py so SQLAlchemy registers them with Base.

Table summary
─────────────
decorator_registrations  — every decorated function ever seen; powers the registry UI
project_model_usage      — daily per-project/per-model aggregation (filled by worker)
tool_api_inventory       — live function catalog upserted on every SDK call
request_response_logs    — PII-masked input/output audit trail per function call
"""

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
    Text,
    UniqueConstraint,
    func,
)

from app.database import Base


class DecoratorRegistration(Base):
    """
    Registry of every decorated function that has ever emitted telemetry.

    Updated on first invocation of each decorated function.
    Powers the Decorator Registry dashboard — shows which functions across all
    tools are governed, when they were first/last seen, and how many times
    they've been called.
    """
    __tablename__ = "decorator_registrations"
    __table_args__ = {"extend_existing": True}

    id             = Column(BigInteger, primary_key=True)
    org_id         = Column(String(100), nullable=False)
    project_id     = Column(String(100), nullable=True)
    tool_name      = Column(String(150), nullable=False)
    function_name  = Column(String(255), nullable=False)
    module_path    = Column(String(500), nullable=True)
    decorator_type = Column(String(50),  nullable=False, default="trace")
    sdk_version    = Column(String(20),  nullable=True)
    python_version = Column(String(20),  nullable=True)
    execution_env  = Column(String(50),  nullable=True, default="production")
    first_seen     = Column(DateTime, server_default=func.now())
    last_seen      = Column(DateTime, server_default=func.now())
    call_count     = Column(BigInteger, default=0)


class ProjectModelUsage(Base):
    """
    Daily per-project, per-model aggregation.

    Built by the daily-aggregation APScheduler worker; also updated inline
    when an @gov.llm_call() decorated function completes.
    Queried by the project-level governance dashboard and the Decorator
    monitoring page for model-level token/cost tracking.
    """
    __tablename__ = "project_model_usage"
    __table_args__ = (
        UniqueConstraint("org_id", "project_id", "model_name", "date"),
        {"extend_existing": True},
    )

    id                      = Column(BigInteger, primary_key=True)
    org_id                  = Column(String(100), nullable=False)
    project_id              = Column(String(100), nullable=True)
    model_name              = Column(String(120), nullable=False)
    provider                = Column(String(100), nullable=True)
    date                    = Column(Date,        nullable=False)
    call_count              = Column(Integer,     default=0)
    total_prompt_tokens     = Column(Integer,     default=0)
    total_completion_tokens = Column(Integer,     default=0)
    total_tokens            = Column(Integer,     default=0)
    total_cost              = Column(Numeric(14, 6), default=0)
    avg_latency_ms          = Column(Integer,     default=0)
    success_count           = Column(Integer,     default=0)
    error_count             = Column(Integer,     default=0)
    created_at              = Column(DateTime, server_default=func.now())


class ToolApiInventory(Base):
    """
    Auto-discovered catalog of every decorated function per tool.

    Upserted on each SDK call via POST /tools/inventory/upsert.
    Tracks lifetime call stats (total / success / error) and average latency
    per function.  Used for tool-level audit, monitoring, and the function
    inventory dashboard.
    """
    __tablename__ = "tool_api_inventory"
    __table_args__ = (
        UniqueConstraint("org_id", "tool_name", "function_name"),
        {"extend_existing": True},
    )

    id             = Column(BigInteger, primary_key=True)
    org_id         = Column(String(100), nullable=False)
    project_id     = Column(String(100), nullable=True)
    tool_name      = Column(String(150), nullable=False)
    function_name  = Column(String(255), nullable=False)
    module_path    = Column(String(500), nullable=True)
    decorator_type = Column(String(50),  nullable=True)
    description    = Column(Text,        nullable=True)
    first_seen     = Column(DateTime, server_default=func.now())
    last_seen      = Column(DateTime, server_default=func.now())
    total_calls    = Column(BigInteger, default=0)
    success_calls  = Column(BigInteger, default=0)
    error_calls    = Column(BigInteger, default=0)
    avg_latency_ms = Column(Integer,    default=0)


class RequestResponseLog(Base):
    """
    Per-call input/output audit trail.

    Stored when capture_io=True on the decorator (default on).
    Text is PII-masked by the SDK before transmission so [EMAIL], [SSN],
    [PHONE] etc. are never stored in plain text.
    """
    __tablename__ = "request_response_logs"
    __table_args__ = {"extend_existing": True}

    id                = Column(BigInteger, primary_key=True)
    event_id          = Column(String(120), ForeignKey("telemetry_events.event_id"), nullable=True)
    function_name     = Column(String(255), nullable=True)
    input_preview     = Column(Text,        nullable=True)
    output_preview    = Column(Text,        nullable=True)
    input_size_bytes  = Column(Integer,     default=0)
    output_size_bytes = Column(Integer,     default=0)
    input_keys        = Column(String(500), nullable=True)
    output_keys       = Column(String(500), nullable=True)
    pii_detected      = Column(Boolean,     default=False)
    pii_fields        = Column(String(500), nullable=True)
    created_at        = Column(DateTime, server_default=func.now())
