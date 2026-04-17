from decimal import Decimal

from app.schemas import TelemetryEventCreate


class SecurityEngine:
    def analyze(self, event_data: TelemetryEventCreate) -> dict:
        input_mb = float(event_data.input_data_size_mb)
        output_mb = float(event_data.output_data_size_mb)

        risk_score = min(100, input_mb * 10 + output_mb * 15)
        pii_detected = risk_score > 50

        pii_type = None
        if pii_detected:
            if input_mb > 5:
                pii_type = "high_volume_input"
            else:
                pii_type = "elevated_output"

        masking_applied = pii_detected

        return {
            "pii_detected": pii_detected,
            "pii_type": pii_type,
            "risk_score": risk_score,
            "masking_applied": masking_applied,
        }
