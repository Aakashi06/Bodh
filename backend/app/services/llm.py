"""OpenAI-compatible chat client. Sarvam by default for Indic/Hinglish voice."""

from __future__ import annotations

import re

import httpx

from app.config import settings

CHAT_SYSTEM_PROMPT = (
    "You are NIB, a voice-first AI learning assistant for Indian students. "
    "Match the user's language exactly. "
    "If they use casual Hindi+English (Hinglish), reply in the same casual Hinglish — "
    "not shuddh Hindi, not English-only. Keep English technical words when that is natural. "
    "If they speak or type only English, reply in simple spoken English. "
    "If they speak or type only Hindi, reply in simple spoken Hindi. "
    "Keep answers short enough to speak, about 4 to 8 sentences. "
    "Do not use markdown, bullets, headings, or emoji. Write like natural speech."
)

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


class LLMError(Exception):
    """Raised when the chat model call cannot be completed."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _auth_headers() -> dict[str, str]:
    provider = (settings.llm_provider or "").strip().lower()
    key = settings.resolved_llm_key
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
        if provider in {"sarvam", "servum"}:
            headers["api-subscription-key"] = key
        return headers
    if provider in {"ollama", "local"}:
        return headers
    raise LLMError(
        f"LLM API key is missing. Set LLM_API_KEY or SARVAM_API_KEY for '{settings.llm_provider}'.",
        status_code=503,
    )


def _extract_text(payload: dict) -> str:
    choices = payload.get("choices") or []
    if not choices:
        raise LLMError("The LLM returned no choices.")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return _THINK_RE.sub("", content).strip()
    if isinstance(content, list):
        parts = [
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and part.get("type") in (None, "text")
        ]
        joined = _THINK_RE.sub("", "".join(parts)).strip()
        if joined:
            return joined
    raise LLMError("The LLM returned an empty response.")


def complete_chat(user_message: str) -> str:
    """Send a user turn to the configured LLM and return assistant text."""
    body = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": CHAT_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        "stream": False,
    }

    try:
        with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
            response = client.post(
                settings.llm_chat_url,
                json=body,
                headers=_auth_headers(),
            )
    except httpx.TimeoutException as exc:
        raise LLMError("The LLM request timed out.", status_code=504) from exc
    except httpx.RequestError as exc:
        raise LLMError(
            f"Could not reach the LLM at {settings.llm_base_url}: {exc}",
            status_code=502,
        ) from exc

    if response.status_code >= 400:
        detail = response.text[:500] if response.text else "no response body"
        raise LLMError(
            f"LLM error ({response.status_code}): {detail}",
            status_code=502,
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise LLMError("The LLM returned a non-JSON response.") from exc

    if not isinstance(payload, dict):
        raise LLMError("The LLM returned an unexpected payload.")

    return _extract_text(payload)
