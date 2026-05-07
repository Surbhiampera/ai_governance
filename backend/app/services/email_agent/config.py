from __future__ import annotations

from dataclasses import dataclass

from app.config import require_env


@dataclass(frozen=True)
class EmailAgentConfig:
    # Multi-tenant scope for agent events
    org_id: str
    project_id: str

    # Microsoft Graph
    graph_tenant_id: str
    graph_client_id: str
    graph_client_secret: str
    graph_mailbox_user: str

    # LLM routing (classification + drafting)
    classifier_provider: str
    classifier_model: str
    drafter_provider: str
    drafter_model: str

    # Provider credentials (optional per provider, but required by chosen provider)
    azure_openai_endpoint: str | None
    azure_openai_api_key: str | None
    azure_openai_api_version: str | None
    azure_openai_deployment: str | None

    gemini_api_key: str | None

    # Auto-reply behavior (enforced via env, not hardcoded)
    auto_reply_enabled: bool
    auto_reply_intents: list[str]

    # Intent taxonomy (drives classification contract)
    intents: list[str]


def load_email_agent_config() -> EmailAgentConfig:
    org_id = require_env("EMAIL_AGENT_ORG_ID")
    project_id = require_env("EMAIL_AGENT_PROJECT_ID")

    graph_tenant_id = require_env("MSGRAPH_TENANT_ID")
    graph_client_id = require_env("MSGRAPH_CLIENT_ID")
    graph_client_secret = require_env("MSGRAPH_CLIENT_SECRET")
    graph_mailbox_user = require_env("MSGRAPH_MAILBOX_USER")

    classifier_provider = require_env("EMAIL_AGENT_CLASSIFIER_PROVIDER")
    classifier_model = require_env("EMAIL_AGENT_CLASSIFIER_MODEL")
    drafter_provider = require_env("EMAIL_AGENT_DRAFTER_PROVIDER")
    drafter_model = require_env("EMAIL_AGENT_DRAFTER_MODEL")

    # Provider-specific
    azure_openai_endpoint = (require_env("AZURE_OPENAI_ENDPOINT") if classifier_provider == "azure_openai" or drafter_provider == "azure_openai" else None)
    azure_openai_api_key = (require_env("AZURE_OPENAI_API_KEY") if classifier_provider == "azure_openai" or drafter_provider == "azure_openai" else None)
    azure_openai_api_version = (require_env("AZURE_OPENAI_API_VERSION") if classifier_provider == "azure_openai" or drafter_provider == "azure_openai" else None)
    azure_openai_deployment = (require_env("AZURE_OPENAI_DEPLOYMENT") if classifier_provider == "azure_openai" or drafter_provider == "azure_openai" else None)

    gemini_api_key = (require_env("GEMINI_API_KEY") if classifier_provider == "gemini" or drafter_provider == "gemini" else None)

    auto_reply_enabled = require_env("EMAIL_AGENT_AUTO_REPLY_ENABLED").strip().lower() in {"1", "true", "yes"}
    auto_reply_intents = [x.strip() for x in require_env("EMAIL_AGENT_AUTO_REPLY_INTENTS").split(",") if x.strip()]
    intents = [x.strip() for x in require_env("EMAIL_AGENT_INTENTS").split(",") if x.strip()]

    return EmailAgentConfig(
        org_id=org_id,
        project_id=project_id,
        graph_tenant_id=graph_tenant_id,
        graph_client_id=graph_client_id,
        graph_client_secret=graph_client_secret,
        graph_mailbox_user=graph_mailbox_user,
        classifier_provider=classifier_provider,
        classifier_model=classifier_model,
        drafter_provider=drafter_provider,
        drafter_model=drafter_model,
        azure_openai_endpoint=azure_openai_endpoint,
        azure_openai_api_key=azure_openai_api_key,
        azure_openai_api_version=azure_openai_api_version,
        azure_openai_deployment=azure_openai_deployment,
        gemini_api_key=gemini_api_key,
        auto_reply_enabled=auto_reply_enabled,
        auto_reply_intents=auto_reply_intents,
        intents=intents,
    )

