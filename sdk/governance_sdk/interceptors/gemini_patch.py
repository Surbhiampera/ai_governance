"""Auto-instrumentation for Google Gemini (google-generativeai).

Best-effort support:
- tokens via `response.usage_metadata`
- latency + retries/failures (failure events only; retries depend on caller/framework)
- PII scan (from best-effort prompt text)
- governance policy pre/post evaluation
"""

from __future__ import annotations

import time
import uuid
from typing import TYPE_CHECKING, Any, Iterable, Iterator, Optional

from governance_sdk.context import get_active_session_name, get_active_trace_id

if TYPE_CHECKING:
    from governance_sdk.client import GovernanceSDK


def _stringify_prompt(args: tuple[Any, ...], kwargs: dict[str, Any]) -> str:
    # google.generativeai.generate_content signature commonly accepts `contents`.
    # We'll do a safe, low-information extraction for PII scanning / policy checks.
    if args:
        first = args[0]
        if isinstance(first, str):
            return first
        return str(first)
    if "contents" in kwargs:
        val = kwargs.get("contents")
        if isinstance(val, str):
            return val
        return str(val)
    if "prompt" in kwargs:
        val = kwargs.get("prompt")
        if isinstance(val, str):
            return val
        return str(val)
    return ""


def _extract_usage(response: Any) -> tuple[int, int]:
    # Expected shape: response.usage_metadata.prompt_token_count, candidates_token_count
    usage = getattr(response, "usage_metadata", None) or getattr(response, "usage", None)
    if not usage:
        return 0, 0
    prompt_tokens = getattr(usage, "prompt_token_count", None)
    candidates_tokens = getattr(usage, "candidates_token_count", None)
    # Some SDK versions use different attribute names.
    if prompt_tokens is None:
        prompt_tokens = getattr(usage, "prompt_tokens", None)
    if candidates_tokens is None:
        candidates_tokens = getattr(usage, "completion_tokens", None)
    return int(prompt_tokens or 0), int(candidates_tokens or 0)


def patch(sdk: "GovernanceSDK") -> None:
    try:
        import google.generativeai as genai
    except ImportError:
        raise ImportError("google-generativeai package not installed. Run: pip install google-generativeai")

    # Instance method on GenerativeModel.
    original = genai.GenerativeModel.generate_content

    def _patched(self_model: Any, *args: Any, **kwargs: Any):
        model_name = getattr(self_model, "model_name", None) or getattr(self_model, "model", None) or kwargs.get("model") or "gemini"
        provider = "gemini"

        active_trace_id = get_active_trace_id()
        call_trace_id = str(uuid.uuid4())
        trace_id = active_trace_id or call_trace_id
        session_name = get_active_session_name()

        # ── Build best-effort "messages" for PII scan/policy gate ──────────
        prompt_text = _stringify_prompt(args, kwargs)
        messages = [{"content": prompt_text}] if prompt_text else []

        contains_pii, pii_type, risk_score = False, None, 0
        if sdk._detect_pii and sdk._pii_scanner and messages:
            contains_pii, pii_type, risk_score = sdk._pii_scanner.scan_messages(messages)
            if contains_pii and sdk._redact_pii:
                # Gemini SDK expects contents; we only redact the string prompt case.
                redacted = sdk._pii_scanner.redact(prompt_text)
                if args:
                    args = (redacted, *args[1:])
                else:
                    kwargs["contents"] = redacted
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

        # We still allow the call when enforce_policy=False; we just record the violation.
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

        is_stream = bool(kwargs.get("stream"))
        start = time.time()

        if not is_stream:
            try:
                response = original(self_model, *args, **kwargs)
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

        # ── Streaming: return an iterator proxy ───────────────────────────────
        stream_iter = original(self_model, *args, **kwargs)

        def _iter() -> Iterator[Any]:
            last_chunk: Any = None
            try:
                for chunk in stream_iter:  # type: ignore[assignment]
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

    genai.GenerativeModel.generate_content = _patched

