from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Optional

import requests


@dataclass
class TelemetryEvent:
    event_id: str
    org_id: str
    project_id: Optional[str]
    user_id: Optional[str]
    tool_name: str
    provider: Optional[str] = None
    model_name: Optional[str] = None
    status: str = "success"
    latency_ms: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    input_data_size_mb: float = 0.0
    output_data_size_mb: float = 0.0
    input_data_count: Optional[int] = None
    output_data_count: Optional[int] = None
    metadata_json: dict[str, Any] | None = None
    tags: list[str] | None = None


def track_event(
    *,
    api_base_url: str,
    api_key: Optional[str],
    event: TelemetryEvent | dict[str, Any],
    timeout_s: float = 5.0,
) -> dict[str, Any]:
    """
    SDK integration method (client-side).
    Sends the event to POST /v1/telemetry/events as a single-item batch.
    """
    payload = asdict(event) if isinstance(event, TelemetryEvent) else dict(event)
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key

    res = requests.post(
        f"{api_base_url.rstrip('/')}/v1/telemetry/events",
        json={"events": [payload]},
        headers=headers,
        timeout=timeout_s,
    )
    res.raise_for_status()
    return res.json()

