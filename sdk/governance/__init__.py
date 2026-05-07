"""
User-facing SDK entrypoint.

Goal: Developers only call:

    governance.init(org_id="org_123", project_id="support-agent")

Everything else is auto-instrumented (provider SDK monkey patches, tracing
context propagation, and basic framework hooks when installed).
"""

from __future__ import annotations

import os
import threading
from typing import Optional

from governance_sdk.auto_patch import auto_patch
from governance_sdk.client import GovernanceSDK

_active_sdk: Optional[GovernanceSDK] = None
_lock = threading.RLock()


def init(
    *,
    org_id: str,
    project_id: str,
    endpoint: Optional[str] = None,
    api_key: Optional[str] = None,
    tool_name: Optional[str] = None,
    detect_pii: bool = True,
    redact_pii: bool = False,
    enforce_policy: bool = False,
    batch_size: int = 1,
    flush_interval: float = 5.0,
    auto_patch_libs: bool = True,
) -> GovernanceSDK:
    """
    Initialize and globally instrument the governance SDK.

    Notes:
    - `endpoint` defaults to `GOVERNANCE_ENDPOINT` or the local backend.
    - `api_key` defaults to `GOVERNANCE_API_KEY` when set.
    """

    global _active_sdk
    with _lock:
        if _active_sdk is not None:
            # Re-init is allowed; we treat it as "rotate to a new org/project".
            # This is intentionally lenient to avoid surprising crashes in
            # dynamic environments (tests, notebooks, hot-reload).
            pass

        resolved_endpoint = (endpoint or os.getenv("GOVERNANCE_ENDPOINT") or "http://localhost:8000").rstrip("/")
        resolved_api_key = api_key or os.getenv("GOVERNANCE_API_KEY")
        resolved_tool_name = tool_name or project_id

        sdk = GovernanceSDK(
            org_id=org_id,
            project_id=project_id,
            tool_name=resolved_tool_name,
            endpoint=resolved_endpoint,
            api_key=resolved_api_key,
            batch_size=batch_size,
            flush_interval=flush_interval,
            detect_pii=detect_pii,
            redact_pii=redact_pii,
            enforce_policy=enforce_policy,
        )

        if auto_patch_libs:
            auto_patch(sdk)

        _active_sdk = sdk
        return sdk


def get_sdk() -> Optional[GovernanceSDK]:
    """Return the active SDK created by `governance.init()`."""

    return _active_sdk

