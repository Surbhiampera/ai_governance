from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass
class ClassificationResult:
    intent: str
    confidence: float
    provider: str
    model: str
    raw: dict[str, Any]


class LLMClient:
    async def classify(self, *, text: str, model: str, intents: list[str]) -> ClassificationResult:  # pragma: no cover
        raise NotImplementedError

    async def draft(self, *, text: str, intent: str | None, model: str) -> tuple[str, dict[str, Any]]:  # pragma: no cover
        raise NotImplementedError


class AzureOpenAIClient(LLMClient):
    def __init__(self, *, endpoint: str, api_key: str, api_version: str, deployment: str) -> None:
        self._endpoint = endpoint.rstrip("/")
        self._api_key = api_key
        self._api_version = api_version
        self._deployment = deployment

    async def _chat(self, *, messages: list[dict[str, str]]) -> dict[str, Any]:
        url = f"{self._endpoint}/openai/deployments/{self._deployment}/chat/completions"
        params = {"api-version": self._api_version}
        headers = {"api-key": self._api_key, "Content-Type": "application/json"}
        payload = {"messages": messages, "temperature": 0.2}
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, params=params, headers=headers, json=payload)
            resp.raise_for_status()
            return resp.json()

    async def classify(self, *, text: str, model: str, intents: list[str]) -> ClassificationResult:
        intents_csv = ", ".join(intents)
        prompt = (
            "Classify the customer email into one intent label.\n"
            "Return JSON with keys: intent, confidence (0-1).\n"
            f"Allowed intents: {intents_csv}\n\n"
            f"EMAIL:\n{text}"
        )
        raw = await self._chat(messages=[{"role": "user", "content": prompt}])
        content = (((raw.get("choices") or [{}])[0].get("message") or {}).get("content")) or "{}"
        try:
            parsed = json.loads(content)
        except Exception:
            parsed = {"intent": (intents[0] if intents else ""), "confidence": 0.0, "raw_text": content}
        intent = str(parsed.get("intent") or (intents[0] if intents else ""))
        confidence = float(parsed.get("confidence") or 0.0)
        return ClassificationResult(intent=intent, confidence=confidence, provider="azure_openai", model=model, raw={"response": raw, "parsed": parsed})

    async def draft(self, *, text: str, intent: str | None, model: str) -> tuple[str, dict[str, Any]]:
        system = "You are a helpful customer support agent. Draft a professional response email."
        user = f"Intent: {intent or ''}\n\nCustomer email:\n{text}\n\nDraft a reply."
        raw = await self._chat(messages=[{"role": "system", "content": system}, {"role": "user", "content": user}])
        content = (((raw.get("choices") or [{}])[0].get("message") or {}).get("content")) or ""
        return content, {"response": raw}


class GeminiClient(LLMClient):
    def __init__(self, *, api_key: str) -> None:
        self._api_key = api_key

    async def _generate(self, *, model: str, prompt: str) -> dict[str, Any]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        params = {"key": self._api_key}
        payload = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.2}}
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, params=params, json=payload)
            resp.raise_for_status()
            return resp.json()

    async def classify(self, *, text: str, model: str, intents: list[str]) -> ClassificationResult:
        intents_csv = ", ".join(intents)
        prompt = (
            "Classify the customer email into one intent label.\n"
            "Return JSON with keys: intent, confidence (0-1).\n"
            f"Allowed intents: {intents_csv}\n\n"
            f"EMAIL:\n{text}"
        )
        raw = await self._generate(model=model, prompt=prompt)
        text_out = (((raw.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [{}])[0].get("text") or "{}"
        try:
            parsed = json.loads(text_out)
        except Exception:
            parsed = {"intent": (intents[0] if intents else ""), "confidence": 0.0, "raw_text": text_out}
        intent = str(parsed.get("intent") or (intents[0] if intents else ""))
        confidence = float(parsed.get("confidence") or 0.0)
        return ClassificationResult(intent=intent, confidence=confidence, provider="gemini", model=model, raw={"response": raw, "parsed": parsed})

    async def draft(self, *, text: str, intent: str | None, model: str) -> tuple[str, dict[str, Any]]:
        prompt = (
            "You are a helpful customer support agent. Draft a professional response email.\n"
            f"Intent: {intent or ''}\n\nCustomer email:\n{text}\n\nDraft a reply."
        )
        raw = await self._generate(model=model, prompt=prompt)
        draft = (((raw.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [{}])[0].get("text") or ""
        return draft, {"response": raw}


def build_llm_client(
    *,
    provider: str,
    azure_openai_endpoint: str | None,
    azure_openai_api_key: str | None,
    azure_openai_api_version: str | None,
    azure_openai_deployment: str | None,
    gemini_api_key: str | None,
) -> LLMClient:
    p = (provider or "").strip().lower()
    if p == "azure_openai":
        if not (azure_openai_endpoint and azure_openai_api_key and azure_openai_api_version and azure_openai_deployment):
            raise RuntimeError("Azure OpenAI provider selected but AZURE_OPENAI_* variables are missing")
        return AzureOpenAIClient(
            endpoint=azure_openai_endpoint,
            api_key=azure_openai_api_key,
            api_version=azure_openai_api_version,
            deployment=azure_openai_deployment,
        )
    if p == "gemini":
        if not gemini_api_key:
            raise RuntimeError("Gemini provider selected but GEMINI_API_KEY is missing")
        return GeminiClient(api_key=gemini_api_key)
    raise RuntimeError(f"Unsupported LLM provider: {provider}")

