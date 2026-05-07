import json
import os
import urllib.request
import uuid

event = {
    "event_id": str(uuid.uuid4()),
    "tool_name": "seo_tool",
    "component_name": "gpt-4",
    "service_type": "llm",
    "execution_type": "inference",
    "user_id": "user1",
    "org_id": (os.getenv("DEFAULT_ORG_ID") or "").strip(),
    "input_data_size_mb": 0.2,
    "output_data_size_mb": 1.5,
    "tokens": {"input": 1200, "output": 300},
    "external_tools": [{"name": "serpapi", "cost": 0.01}],
    "latency_ms": 450,
}

data = json.dumps(event).encode()
endpoint = (os.getenv("GOVERNANCE_ENDPOINT") or os.getenv("API_ENDPOINT") or "").strip().rstrip("/")
if not endpoint:
    raise RuntimeError("Set GOVENANCE_ENDPOINT or API_ENDPOINT (no hardcoded defaults)")
req = urllib.request.Request(f"{endpoint}/telemetry/event", data=data, headers={"Content-Type": "application/json"})
resp = urllib.request.urlopen(req)
print("Status:", resp.status)
print(json.dumps(json.loads(resp.read().decode()), indent=2))
