"""Auto-instrumentation for LiteLLM.

Best-effort support:
- tokens via response.usage or response["usage"]
- streaming duration via wrapper around streaming iterator
- latency + failures and governance rule evaluation

LiteLLM is a multi-provider router; we infer provider/model from the `model`
string (e.g. "openai/gpt-4o" -> provider="openai", model="gpt-4o").
"""

from __future__ import annotations

import time
import uuid
from typing import TYPE_CHECKING, Any, Iterator, Optional

from governance_sdk.context import get_active_session_name, get_active_trace_id

if TYPE_CHECKING:
    from governance_sdk.client import GovernanceSDK


def _infer_provider_and_model(litellm_model: Any) -> tuple[str, Optional[str]]:
    if not litellm_model:
        return "litellm", None
    s = str(litellm_model)
    if "/" in s:
        provider, model = s.split("/", 1)
        return provider.lower() or "litellm", model
    return "litellm", s


def _extract_usage(resp: Any) -> tuple[int, int]:
    # Common shapes:
    # - resp.usage with prompt_tokens/completion_tokens
    # - resp["usage"] dict
    usage = getattr(resp, "usage", None)
    if usage is None and isinstance(resp, dict):
        usage = resp.get("usage")
    if not usage:
        return 0, 0
    prompt_tokens = getattr(usage, "prompt_tokens", None) or (usage.get("prompt_tokens") if isinstance(usage, dict) else None)
    completion_tokens = getattr(usage, "completion_tokens", None) or (usage.get("completion_tokens") if isinstance(usage, dict) else None)
    # Some providers use different keys.
    if completion_tokens is None and isinstance(usage, dict):
        completion_tokens = usage.get("output_tokens") or usage.get("candidates_token_count")
    return int(prompt_tokens or 0), int(completion_tokens or 0)


def _extract_messages(kwargs: dict[str, Any]) -> list[dict[str, Any]]:
    # LiteLLM supports both `messages` and `prompt`.
    if "messages" in kwargs and isinstance(kwargs["messages"], list):
        return kwargs["messages"]
    if "prompt" in kwargs and isinstance(kwargs["prompt"], str):
        return [{"content": kwargs["prompt"]}]
    return []


def patch(sdk: "GovernanceSDK") -> None:
    try:
        import litellm
    except ImportError:
        raise ImportError("litellm package not installed. Run: pip install litellm")

    # Patch sync completion.
    original_completion = litellm.completion

    def _patched_completion(*args: Any, **kwargs: Any):
        litellm_model = kwargs.get("model")
        provider, model_name = _infer_provider_and_model(litellm_model)
        model_name = model_name or str(litellm_model or "unknown")

        active_trace_id = get_active_trace_id()
        call_trace_id = str(uuid.uuid4())
        trace_id = active_trace_id or call_trace_id
        session_name = get_active_session_name()

        messages = _extract_messages(kwargs)

        contains_pii, pii_type, risk_score = False, None, 0
        if sdk._detect_pii and sdk._pii_scanner and messages:
            contains_pii, pii_type, risk_score = sdk._pii_scanner.scan_messages(messages)
            if contains_pii and sdk._redact_pii:
                redacted = sdk._pii_scanner.redact_messages(messages)
                if "messages" in kwargs:
                    kwargs["messages"] = redacted
                else:
                    kwargs["prompt"] = sdk._pii_scanner.redact(str(kwargs.get("prompt") or ""))
            if contains_pii:
                sdk._fire(
                    "on_pii_detected",
                    {"pii_type": pii_type, "risk_score": risk_score, "model": model_name, "provider": provider},
                )

        decision = sdk._policy.evaluate_pre_call(
            model=model_name,
            provider=provider,
            messages=messages,
            project_id=sdk.project_id,
        )

        if not decision.allowed and sdk._enforce_policy:
            sdk._send(
                {
                    "org_id": sdk.org_id,
                    "project_id": sdk.project_id,
                    "provider": provider,
                    "model_name": model_name,
                    "tool_name": sdk.tool_name,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "latency_ms": 0,
                    "status": "blocked",
                    "trace_id": trace_id,
                    "contains_pii": contains_pii,
                    "pii_type": pii_type,
                    "metadata": {
                        "policy_action": decision.action,
                        "policy_reason": decision.reason,
                        "risk_score": risk_score,
                        "call_trace_id": call_trace_id,
                        **({"parent_trace_id": active_trace_id} if active_trace_id else {}),
                        **({"session_name": session_name} if session_name else {}),
                    },
                }
            )
            raise RuntimeError(f"[GovernanceSDK] Blocked by policy: {decision.reason}")

        start = time.time()
        try:
            response = original_completion(*args, **kwargs)
            latency_ms = int((time.time() - start) * 1000)
            input_tokens, output_tokens = _extract_usage(response)

            cost = sdk._cost_engine.compute(model_name, input_tokens, output_tokens)
            alerts = sdk._policy.evaluate_post_call(
                model=model_name,
                cost=cost,
                total_tokens=input_tokens + output_tokens,
                contains_pii=contains_pii,
                pii_type=pii_type,
                latency_ms=latency_ms,
            )
            for alert in alerts:
                sdk._fire("on_alert", alert)

            sdk._send(
                {
                    "org_id": sdk.org_id,
                    "project_id": sdk.project_id,
                    "provider": provider,
                    "model_name": model_name,
                    "tool_name": sdk.tool_name,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "latency_ms": latency_ms,
                    "status": "success",
                    "trace_id": trace_id,
                    "contains_pii": contains_pii,
                    "pii_type": pii_type,
                    "metadata": {
                        "policy_action": decision.action,
                        "risk_score": risk_score,
                        "alerts_triggered": len(alerts),
                        "call_trace_id": call_trace_id,
                        **({"parent_trace_id": active_trace_id} if active_trace_id else {}),
                        **({"session_name": session_name} if session_name else {}),
                    },
                }
            )
            return response
        except Exception as exc:
            latency_ms = int((time.time() - start) * 1000)
            sdk._send(
                {
                    "org_id": sdk.org_id,
                    "project_id": sdk.project_id,
                    "provider": provider,
                    "model_name": model_name,
                    "tool_name": sdk.tool_name,
                    "latency_ms": latency_ms,
                    "status": "error",
                    "trace_id": trace_id,
                    "metadata": {
                        "error": str(exc),
                        "call_trace_id": call_trace_id,
                        **({"parent_trace_id": active_trace_id} if active_trace_id else {}),
                        **({"session_name": session_name} if session_name else {}),
                    },
                }
            )
            raise

    litellm.completion = _patched_completion

    # Patch streaming if available.
    original_completion_stream = getattr(litellm, "completion_stream", None)
    if original_completion_stream is not None:
        def _patched_completion_stream(*args: Any, **kwargs: Any) -> Iterator[Any]:
            litellm_model = kwargs.get("model")
            provider, model_name = _infer_provider_and_model(litellm_model)
            model_name = model_name or str(litellm_model or "unknown")

            active_trace_id = get_active_trace_id()
            call_trace_id = str(uuid.uuid4())
            trace_id = active_trace_id or call_trace_id
            session_name = get_active_session_name()

            messages = _extract_messages(kwargs)

            contains_pii, pii_type, risk_score = False, None, 0
            if sdk._detect_pii and sdk._pii_scanner and messages:
                contains_pii, pii_type, risk_score = sdk._pii_scanner.scan_messages(messages)
                if contains_pii and sdk._redact_pii:
                    redacted = sdk._pii_scanner.redact_messages(messages)
                    if "messages" in kwargs:
                        kwargs["messages"] = redacted

            decision = sdk._policy.evaluate_pre_call(
                model=model_name,
                provider=provider,
                messages=messages,
                project_id=sdk.project_id,
            )
            if not decision.allowed and sdk._enforce_policy:
                sdk._send(
                    {
                        "org_id": sdk.org_id,
                        "project_id": sdk.project_id,
                        "provider": provider,
                        "model_name": model_name,
                        "tool_name": sdk.tool_name,
                        "input_tokens": 0,
                        "output_tokens": 0,
                        "latency_ms": 0,
                        "status": "blocked",
                        "trace_id": trace_id,
                        "contains_pii": contains_pii,
                        "pii_type": pii_type,
                        "metadata": {"policy_action": decision.action, "policy_reason": decision.reason, "risk_score": risk_score},
                    }
                )
                raise RuntimeError(f"[GovernanceSDK] Blocked by policy: {decision.reason}")

            start = time.time()
            stream_iter = original_completion_stream(*args, **kwargs)

            def _iter() -> Iterator[Any]:
                last_chunk: Any = None
                try:
                    for chunk in stream_iter:
                        last_chunk = chunk
                        yield chunk
                    latency_ms = int((time.time() - start) * 1000)
                    input_tokens, output_tokens = _extract_usage(last_chunk)
                    cost = sdk._cost_engine.compute(model_name, input_tokens, output_tokens)
                    alerts = sdk._policy.evaluate_post_call(
                        model=model_name,
                        cost=cost,
                        total_tokens=input_tokens + output_tokens,
                        contains_pii=contains_pii,
                        pii_type=pii_type,
                        latency_ms=latency_ms,
                    )
                    for alert in alerts:
                        sdk._fire("on_alert", alert)
                    sdk._send(
                        {
                            "org_id": sdk.org_id,
                            "project_id": sdk.project_id,
                            "provider": provider,
                            "model_name": model_name,
                            "tool_name": sdk.tool_name,
                            "input_tokens": input_tokens,
                            "output_tokens": output_tokens,
                            "latency_ms": latency_ms,
                            "status": "success",
                            "trace_id": trace_id,
                            "contains_pii": contains_pii,
                            "pii_type": pii_type,
                            "metadata": {
                                "policy_action": decision.action,
                                "risk_score": risk_score,
                                "alerts_triggered": len(alerts),
                                "call_trace_id": call_trace_id,
                                **({"parent_trace_id": active_trace_id} if active_trace_id else {}),
                                **({"session_name": session_name} if session_name else {}),
                            },
                        }
                    )
                except Exception as exc:
                    latency_ms = int((time.time() - start) * 1000)
                    sdk._send(
                        {
                            "org_id": sdk.org_id,
                            "project_id": sdk.project_id,
                            "provider": provider,
                            "model_name": model_name,
                            "tool_name": sdk.tool_name,
                            "latency_ms": latency_ms,
                            "status": "error",
                            "trace_id": trace_id,
                            "metadata": {
                                "error": str(exc),
                                "call_trace_id": call_trace_id,
                                **({"parent_trace_id": active_trace_id} if active_trace_id else {}),
                                **({"session_name": session_name} if session_name else {}),
                            },
                        }
                    )
                    raise

            return _iter()

        litellm.completion_stream = _patched_completion_stream

