"""Notification Service — email (SMTP) and WhatsApp (Twilio) alert delivery.

Configuration is entirely via environment variables — zero hardcoded credentials.

Required env vars:
  SMTP_HOST            SMTP server hostname (e.g. smtp.gmail.com)
  SMTP_PORT            SMTP port, default 587
  SMTP_USER            SMTP login username
  SMTP_PASSWORD        SMTP login password
  SMTP_FROM_EMAIL      Sender address (defaults to SMTP_USER)
  NOTIFICATION_EMAIL   Comma-separated recipient email addresses

Optional (WhatsApp via Twilio):
  TWILIO_ACCOUNT_SID   Twilio Account SID
  TWILIO_AUTH_TOKEN    Twilio Auth Token
  TWILIO_WHATSAPP_FROM WhatsApp-enabled number, e.g. whatsapp:+14155238886
  TWILIO_WHATSAPP_TO   Comma-separated recipient numbers, e.g. whatsapp:+1234567890
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

_EMOJI = {"critical": "🔴", "high": "🟠", "medium": "🟡", "low": "🟢"}


class NotificationService:
    def __init__(self) -> None:
        self.smtp_host = os.getenv("SMTP_HOST", "")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER", "")
        self.smtp_password = os.getenv("SMTP_PASSWORD", "")
        self.from_email = os.getenv("SMTP_FROM_EMAIL", "") or self.smtp_user or "noreply@aigovernance.local"
        self.notification_emails = [
            e.strip() for e in os.getenv("NOTIFICATION_EMAIL", "").split(",") if e.strip()
        ]
        self.twilio_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
        self.twilio_token = os.getenv("TWILIO_AUTH_TOKEN", "")
        self.twilio_from = os.getenv("TWILIO_WHATSAPP_FROM", "")
        self.twilio_to_numbers = [
            n.strip() for n in os.getenv("TWILIO_WHATSAPP_TO", "").split(",") if n.strip()
        ]

    def notify(
        self,
        alert_type: str,
        severity: str,
        message: str,
        org_id: str = "",
        project_id: str | None = None,
    ) -> None:
        """Dispatch email + WhatsApp for high/critical alerts; silently skip lower severities."""
        if severity not in ("critical", "high"):
            return

        emoji = _EMOJI.get(severity, "⚠️")
        title = alert_type.replace("_", " ").title()
        subject = f"{emoji} [{severity.upper()}] AI Governance — {title}"

        context = f"Organization: {org_id}"
        if project_id:
            context += f"  |  Project: {project_id}"
        body = f"{context}\nAlert: {alert_type}\nSeverity: {severity.upper()}\n\n{message}"

        self._send_email(subject, body)
        self._send_whatsapp(f"{emoji} {subject}\n{message[:400]}")

    # ─────────────────── email ───────────────────

    def _send_email(self, subject: str, body: str) -> None:
        if not self.smtp_host or not self.notification_emails:
            return
        try:
            msg = MIMEMultipart()
            msg["From"] = self.from_email
            msg["To"] = ", ".join(self.notification_emails)
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.ehlo()
                if self.smtp_user:
                    server.starttls()
                    server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.from_email, self.notification_emails, msg.as_string())
            logger.info("Alert email sent: %s", subject)
        except Exception as exc:
            logger.error("Email notification failed: %s", exc)

    # ─────────────────── whatsapp ───────────────────

    def _send_whatsapp(self, message: str) -> None:
        if not self.twilio_sid or not self.twilio_to_numbers:
            return
        try:
            from twilio.rest import Client  # optional dependency
            client = Client(self.twilio_sid, self.twilio_token)
            for to_num in self.twilio_to_numbers:
                normalized = to_num if to_num.startswith("whatsapp:") else f"whatsapp:{to_num}"
                client.messages.create(body=message, from_=self.twilio_from, to=normalized)
            logger.info("WhatsApp alert sent to %d recipient(s)", len(self.twilio_to_numbers))
        except ImportError:
            logger.warning("twilio package not installed — WhatsApp notifications disabled. pip install twilio")
        except Exception as exc:
            logger.error("WhatsApp notification failed: %s", exc)


notification_service = NotificationService()
