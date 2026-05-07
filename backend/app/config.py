"""Application configuration loaded from environment variables."""
import os

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))


def get_log_level() -> str:
    return os.getenv("LOG_LEVEL", "INFO").upper()


def get_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "*")
    if raw.strip() == "*":
        return ["*"]
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def get_lookup_defaults(name: str) -> list[str]:
    """Return injected lookup defaults from env vars (no hardcoded enums in source).

    Format: env var ``LOOKUP_<NAME>`` is a comma-separated list, e.g.
    ``LOOKUP_AUTH_TYPES="API Key,OAuth,Basic Auth"``.
    Anything not configured returns an empty list — DB values still drive the
    dropdown.
    """
    env_key = f"LOOKUP_{name.upper().replace('-', '_')}"
    raw = os.getenv(env_key, "")
    return [item.strip() for item in raw.split(",") if item and item.strip()]


def require_env(name: str) -> str:
    """Return env var value or raise (no silent hardcoded defaults)."""
    val = os.getenv(name, "").strip()
    if not val:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return val


def get_default_org_id() -> str:
    return require_env("DEFAULT_ORG_ID")


def get_frontend_url() -> str:
    return require_env("FRONTEND_URL")


def get_infra_cost_per_ms_usd() -> str:
    # Kept as string to preserve Decimal parsing at call sites.
    return require_env("INFRA_COST_PER_MS_USD")


def get_policy_secret_keywords() -> list[str]:
    raw = require_env("POLICY_SECRET_KEYWORDS")
    return [x.strip().lower() for x in raw.split(",") if x and x.strip()]
