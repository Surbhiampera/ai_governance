"""FastAPI middleware injection for trace correlation.

When governance.init() is called before FastAPI app construction, we monkey
patch FastAPI.__init__ to automatically add a small middleware that:
- creates or propagates `X-Governance-Trace-Id`
- pushes that trace_id into governance_sdk contextvars
- returns the trace id in the response headers

This enables automatic correlation between incoming requests and subsequent
LLM/tool calls instrumented by the SDK interceptors.
"""

from __future__ import annotations

import time
import uuid
from typing import TYPE_CHECKING

from governance_sdk.context import push_context

if TYPE_CHECKING:
    from governance_sdk.client import GovernanceSDK

_TRACE_HEADER = "X-Governance-Trace-Id"


def patch(sdk: "GovernanceSDK") -> None:
    try:
        from fastapi import FastAPI
        from starlette.middleware.base import BaseHTTPMiddleware
    except ImportError:
        raise ImportError("fastapi and/or starlette not installed. Run: pip install fastapi")

    # Idempotence: avoid stacking middleware + re-wrapping FastAPI.__init__.
    if getattr(FastAPI, "_governance_patched", False):
        return

    class _GovernanceTraceMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            trace_id = request.headers.get(_TRACE_HEADER) or str(uuid.uuid4())
            session_name = "fastapi-request"
            frame = push_context(trace_id, session_name=session_name)
            start = time.time()
            try:
                response = await call_next(request)
                response.headers[_TRACE_HEADER] = trace_id
                return response
            finally:
                elapsed_ms = int((time.time() - start) * 1000)
                # We intentionally do not emit an additional HTTP telemetry event by default;
                # the important part is request -> trace correlation for LLM calls.
                frame.restore()

    original_init = FastAPI.__init__

    def _patched_init(self: FastAPI, *args, **kwargs):  # type: ignore[no-untyped-def]
        original_init(self, *args, **kwargs)
        try:
            self.add_middleware(_GovernanceTraceMiddleware)
        except Exception:
            # Fail open: tracing still works if middleware can't be installed.
            pass

    FastAPI.__init__ = _patched_init  # type: ignore[assignment]
    FastAPI._governance_patched = True  # type: ignore[attr-defined]

