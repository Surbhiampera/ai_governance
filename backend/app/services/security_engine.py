from decimal import Decimal

from app.schemas import TelemetryEventCreate


class SecurityEngine:
    def analyze(self, event_data: TelemetryEventCreate) -> dict:
        input_mb = Decimal(str(event_data.input_data_size_mb or 0))
        output_mb = Decimal(str(event_data.output_data_size_mb or 0))
        total_tokens = event_data.prompt_tokens + event_data.completion_tokens

        risk_score = Decimal("0")
        risk_score += min(input_mb * Decimal("8"), Decimal("25"))
        risk_score += min(output_mb * Decimal("12"), Decimal("25"))
        risk_score += min(Decimal(str(total_tokens)) / Decimal("500"), Decimal("20"))

        pii_detected = bool(event_data.contains_pii or (event_data.pii_type and event_data.pii_type != "none"))
        if pii_detected:
            risk_score += Decimal("20")

        data_out_violation = bool(event_data.data_out_violation or output_mb > Decimal("12"))
        if data_out_violation:
            risk_score += Decimal("15")

        suspicious_tags = {"exfiltration", "credential_abuse", "prompt_injection", "scraping"}
        misuse_pattern_detected = any(tag in suspicious_tags for tag in event_data.tags)
        if misuse_pattern_detected:
            risk_score += Decimal("20")

        if event_data.status and event_data.status.lower() not in {"success", "completed"}:
            risk_score += Decimal("5")

        risk_score = min(risk_score, Decimal("100"))
        masking_applied = pii_detected or data_out_violation

        return {
            "pii_detected": pii_detected,
            "pii_type": event_data.pii_type if pii_detected else None,
            "data_out_violation": data_out_violation,
            "misuse_pattern_detected": misuse_pattern_detected,
            "risk_score": risk_score.quantize(Decimal("0.01")),
            "masking_applied": masking_applied,
        }
