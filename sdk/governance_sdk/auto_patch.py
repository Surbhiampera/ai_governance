"""
Auto-instrumentation wiring.

This module is responsible for:
- Patching core provider SDKs (OpenAI, Anthropic, Gemini, LiteLLM).
- Patching request/trace context propagation (FastAPI).
- Patching common agent/workflow frameworks (LangChain).

All patches are best-effort: if a dependency is not installed, that patch is
silently skipped.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from governance_sdk.client import GovernanceSDK


def auto_patch(sdk: "GovernanceSDK") -> None:
    # Providers (HTTP SDK level)
    try:
        sdk.patch_openai()
    except Exception:
        pass

    try:
        sdk.patch_anthropic()
    except Exception:
        pass

    try:
        from governance_sdk.interceptors.gemini_patch import patch as patch_gemini

        patch_gemini(sdk)
    except Exception:
        pass

    try:
        from governance_sdk.interceptors.litellm_patch import patch as patch_litellm

        patch_litellm(sdk)
    except Exception:
        pass

    # Frameworks / context propagation
    try:
        from governance_sdk.interceptors.fastapi_patch import patch as patch_fastapi

        patch_fastapi(sdk)
    except Exception:
        pass

    try:
        from governance_sdk.interceptors.langchain_patch import patch as patch_langchain

        patch_langchain(sdk)
    except Exception:
        pass

