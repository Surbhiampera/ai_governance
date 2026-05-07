"""LangChain patching for agent/tool/vector retrieval observability.

This is a best-effort integration that focuses on the pieces that are hard to
get from raw LLM SDK calls:
- tool execution latency/failures (wrap BaseTool.run / arun)
- vector retrieval latency/failures (wrap retriever methods when available)
- agent workflow correlation (wrap AgentExecutor.invoke / ainvoke with sdk.session())

If LangChain is not installed, this patch is skipped.
"""

from __future__ import annotations

import time
import uuid
from typing import TYPE_CHECKING, Any, Awaitable, Callable, Optional

from governance_sdk.context import get_active_trace_id, get_active_session_name

if TYPE_CHECKING:
    from governance_sdk.client import GovernanceSDK


def patch(sdk: "GovernanceSDK") -> None:
    try:
        from langchain_core.tools import BaseTool
    except ImportError:
        BaseTool = None  # type: ignore[assignment]

    # Tool execution instrumentation
    if BaseTool is not None:
        if not getattr(BaseTool, "_governance_patched", False):
            original_run = getattr(BaseTool, "run", None)
            original_arun = getattr(BaseTool, "arun", None)

            def _tool_trace_payload(*, tool_name: str, provider: str, latency_ms: int, status: str, metadata: dict[str, Any]) -> dict[str, Any]:
                trace_id = get_active_trace_id()
                return {
                    "org_id": sdk.org_id,
                    "project_id": sdk.project_id,
                    "provider": provider,
                    "model_name": tool_name,
                    "tool_name": sdk.tool_name,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "latency_ms": latency_ms,
                    "status": status,
                    "trace_id": trace_id,
                    "metadata": {
                        **metadata,
                        **({"session_name": get_active_session_name()} if get_active_session_name() else {}),
                    },
                }

            if original_run is not None:
                def _patched_run(self_tool: Any, *args: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
                    start = time.time()
                    status = "success"
                    tool_name = getattr(self_tool, "name", None) or self_tool.__class__.__name__
                    try:
                        return original_run(self_tool, *args, **kwargs)
                    except Exception as exc:
                        status = "error"
                        metadata = {"error": str(exc), "framework": "langchain", "tool_kind": "BaseTool.run"}
                        raise
                    finally:
                        latency_ms = int((time.time() - start) * 1000)
                        metadata = locals().get("metadata", {})
                        if status == "success":
                            metadata = {"framework": "langchain", "tool_kind": "BaseTool.run"}
                        sdk._send(_tool_trace_payload(tool_name=tool_name, provider="internal", latency_ms=latency_ms, status=status, metadata=metadata))

                BaseTool.run = _patched_run  # type: ignore[assignment]

            if original_arun is not None:
                async def _patched_arun(self_tool: Any, *args: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
                    start = time.time()
                    status = "success"
                    tool_name = getattr(self_tool, "name", None) or self_tool.__class__.__name__
                    metadata: dict[str, Any] = {"framework": "langchain", "tool_kind": "BaseTool.arun"}
                    try:
                        return await original_arun(self_tool, *args, **kwargs)
                    except Exception as exc:
                        status = "error"
                        metadata = {"error": str(exc), **metadata}
                        raise
                    finally:
                        latency_ms = int((time.time() - start) * 1000)
                        sdk._send(_tool_trace_payload(tool_name=tool_name, provider="internal", latency_ms=latency_ms, status=status, metadata=metadata))

                BaseTool.arun = _patched_arun  # type: ignore[assignment]

            BaseTool._governance_patched = True  # type: ignore[attr-defined]

    # Vector retrieval instrumentation
    try:
        from langchain_core.retrievers import BaseRetriever
    except ImportError:
        BaseRetriever = None  # type: ignore[assignment]

    if BaseRetriever is not None and not getattr(BaseRetriever, "_governance_patched", False):
        original_get_relevant_documents = getattr(BaseRetriever, "get_relevant_documents", None)
        original_aget_relevant_documents = getattr(BaseRetriever, "aget_relevant_documents", None)

        def _retrieval_payload(*, retriever_name: str, latency_ms: int, status: str, metadata: dict[str, Any]) -> dict[str, Any]:
            trace_id = get_active_trace_id()
            return {
                "org_id": sdk.org_id,
                "project_id": sdk.project_id,
                "provider": "vector_retrieval",
                "model_name": retriever_name,
                "tool_name": sdk.tool_name,
                "input_tokens": 0,
                "output_tokens": 0,
                "latency_ms": latency_ms,
                "status": status,
                "trace_id": trace_id,
                "metadata": {
                    **metadata,
                    "framework": "langchain",
                    **({"session_name": get_active_session_name()} if get_active_session_name() else {}),
                },
            }

        if original_get_relevant_documents is not None:
            def _patched_get_relevant_documents(self_retriever: Any, *args: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
                start = time.time()
                status = "success"
                retriever_name = self_retriever.__class__.__name__
                metadata: dict[str, Any] = {}
                try:
                    return original_get_relevant_documents(self_retriever, *args, **kwargs)
                except Exception as exc:
                    status = "error"
                    metadata = {"error": str(exc)}
                    raise
                finally:
                    latency_ms = int((time.time() - start) * 1000)
                    sdk._send(_retrieval_payload(retriever_name=retriever_name, latency_ms=latency_ms, status=status, metadata=metadata))

            BaseRetriever.get_relevant_documents = _patched_get_relevant_documents  # type: ignore[assignment]

        if original_aget_relevant_documents is not None:
            async def _patched_aget_relevant_documents(self_retriever: Any, *args: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
                start = time.time()
                status = "success"
                retriever_name = self_retriever.__class__.__name__
                metadata: dict[str, Any] = {}
                try:
                    return await original_aget_relevant_documents(self_retriever, *args, **kwargs)
                except Exception as exc:
                    status = "error"
                    metadata = {"error": str(exc)}
                    raise
                finally:
                    latency_ms = int((time.time() - start) * 1000)
                    sdk._send(_retrieval_payload(retriever_name=retriever_name, latency_ms=latency_ms, status=status, metadata=metadata))

            BaseRetriever.aget_relevant_documents = _patched_aget_relevant_documents  # type: ignore[assignment]

        BaseRetriever._governance_patched = True  # type: ignore[attr-defined]

    # Agent workflow correlation
    try:
        from langchain.agents import AgentExecutor
    except ImportError:
        AgentExecutor = None  # type: ignore[assignment]

    if AgentExecutor is not None and not getattr(AgentExecutor, "_governance_patched", False):
        original_invoke = getattr(AgentExecutor, "invoke", None)
        original_ainvoke = getattr(AgentExecutor, "ainvoke", None)

        if original_invoke is not None:
            def _patched_invoke(self_agent: Any, *args: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
                # Wrap the top-level agent run in a trace/session so nested LLM calls inherit it.
                agent_name = self_agent.__class__.__name__
                with sdk.session(name=f"langchain-agent:{agent_name}"):
                    return original_invoke(self_agent, *args, **kwargs)

            AgentExecutor.invoke = _patched_invoke  # type: ignore[assignment]

        if original_ainvoke is not None:
            async def _patched_ainvoke(self_agent: Any, *args: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
                agent_name = self_agent.__class__.__name__
                with sdk.session(name=f"langchain-agent:{agent_name}"):
                    return await original_ainvoke(self_agent, *args, **kwargs)

            AgentExecutor.ainvoke = _patched_ainvoke  # type: ignore[assignment]

        AgentExecutor._governance_patched = True  # type: ignore[attr-defined]

