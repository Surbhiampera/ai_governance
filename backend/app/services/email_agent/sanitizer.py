from __future__ import annotations

import re
from dataclasses import dataclass


_MASK_PATTERNS: dict[str, re.Pattern] = {
    "order_id": re.compile(r"\b(?:order\s*#?\s*)?(\d{6,12})\b", re.IGNORECASE),
    "tracking_id": re.compile(r"\b(?:tracking\s*#?\s*)?([A-Z0-9]{8,20})\b", re.IGNORECASE),
    "phone": re.compile(r"\b(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
    "email_address": re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),
}


@dataclass
class SanitizationResult:
    masked_text: str
    pii_masked: bool
    masking_types: list[str]


def mask_pii(text: str) -> SanitizationResult:
    if not text:
        return SanitizationResult(masked_text="", pii_masked=False, masking_types=[])

    masked = text
    hits: list[str] = []
    for name, pat in _MASK_PATTERNS.items():
        if pat.search(masked):
            hits.append(name)
            masked = pat.sub(f"[MASKED:{name.upper()}]", masked)

    return SanitizationResult(masked_text=masked, pii_masked=bool(hits), masking_types=hits)

