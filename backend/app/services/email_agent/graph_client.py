from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass
class GraphMessage:
    id: str
    subject: str | None
    from_email: str | None
    received_at: str | None
    body_preview: str | None
    body_content: str | None


class MicrosoftGraphClient:
    def __init__(
        self,
        *,
        tenant_id: str,
        client_id: str,
        client_secret: str,
        mailbox_user: str,
    ) -> None:
        self._tenant_id = tenant_id
        self._client_id = client_id
        self._client_secret = client_secret
        self._mailbox_user = mailbox_user
        self._token: str | None = None
        self._token_exp: float = 0.0

    @property
    def mailbox_user(self) -> str:
        return self._mailbox_user

    async def _get_token(self) -> str:
        now = time.time()
        if self._token and (now + 30) < self._token_exp:
            return self._token

        token_url = f"https://login.microsoftonline.com/{self._tenant_id}/oauth2/v2.0/token"
        data = {
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            "grant_type": "client_credentials",
            "scope": "https://graph.microsoft.com/.default",
        }
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(token_url, data=data)
            resp.raise_for_status()
            payload = resp.json()
            self._token = payload.get("access_token")
            expires_in = int(payload.get("expires_in") or 3599)
            self._token_exp = now + expires_in

        if not self._token:
            raise RuntimeError("Microsoft Graph token acquisition returned empty token")
        return self._token

    async def _request(self, method: str, url: str, *, params: dict | None = None, json: dict | None = None) -> dict[str, Any]:
        token = await self._get_token()
        headers = {"Authorization": f"Bearer {token}"}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.request(method, url, headers=headers, params=params, json=json)
            resp.raise_for_status()
            return resp.json() if resp.content else {}

    async def fetch_unread(self, *, top: int) -> list[GraphMessage]:
        url = f"https://graph.microsoft.com/v1.0/users/{self._mailbox_user}/mailFolders/Inbox/messages"
        params = {
            "$top": str(top),
            "$filter": "isRead eq false",
            "$orderby": "receivedDateTime desc",
            "$select": "id,subject,from,receivedDateTime,bodyPreview,body,isRead",
        }
        data = await self._request("GET", url, params=params)
        items = data.get("value") or []
        out: list[GraphMessage] = []
        for it in items:
            out.append(
                GraphMessage(
                    id=str(it.get("id")),
                    subject=it.get("subject"),
                    from_email=((it.get("from") or {}).get("emailAddress") or {}).get("address"),
                    received_at=it.get("receivedDateTime"),
                    body_preview=it.get("bodyPreview"),
                    body_content=((it.get("body") or {}).get("content")),
                )
            )
        return out

    async def mark_read(self, message_id: str) -> None:
        url = f"https://graph.microsoft.com/v1.0/users/{self._mailbox_user}/messages/{message_id}"
        await self._request("PATCH", url, json={"isRead": True})

    async def send_mail(self, *, to_email: str, subject: str, body_html: str) -> None:
        url = f"https://graph.microsoft.com/v1.0/users/{self._mailbox_user}/sendMail"
        payload = {
            "message": {
                "subject": subject,
                "body": {"contentType": "HTML", "content": body_html},
                "toRecipients": [{"emailAddress": {"address": to_email}}],
            },
            "saveToSentItems": "true",
        }
        await self._request("POST", url, json=payload)

