"""Sarvam chat completions client."""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from typing import Any

import httpx

from app.config import settings

VOICE_SYSTEM_PROMPT = (
    "You are Bodh, a multilingual voice-first learning assistant. "
    "Anyone can ask you anything. Reply in the same language the user used, "
    "including casual mixed languages such as Hinglish. "
    "Keep answers short enough to speak, about 4 to 8 sentences. "
    "If the user asks for a quiz, speak a multiple-choice quiz: question, then option A, B, C, and D, then the next question. "
    "Do not speak the answer key. "
    "Do not use markdown, bullets, headings, or emoji. Write like natural speech. "
    "After the spoken answer, add a machine footer on its own line in this exact shape: "
    "<<SUGGESTIONS>>follow-up 1|follow-up 2|follow-up 3<<END>> "
    "Include Generate a quiz for me as one follow-up when the topic can be practiced. "
    "Each follow-up must continue the same concept. Never mention the footer out loud."
)

TEXT_SYSTEM_PROMPT = (
    "You are Bodh, a multilingual learning assistant. "
    "Reply in the same language the user used, including casual mixed languages such as Hinglish. "
    "When the user asks for a quiz, or says Generate a quiz for me, ALWAYS write a multiple-choice quiz. "
    "Start with one short intro sentence, then 4 or 5 numbered questions. "
    "Each question must have exactly four options on their own lines, labeled A. B. C. D. "
    "Do not reveal the correct answers in that quiz message. "
    "When the user asks you to generate questions that are not a quiz, write a short intro then a numbered list. "
    "Check factual accuracy and distinguish net force from individual forces. "
    "For ordinary explanations, write short clear paragraphs. Numbered lists are allowed when they help. "
    "Do not use markdown headings, tables, or emoji. "
    "After the full answer, add a machine footer on its own line in this exact shape: "
    "<<SUGGESTIONS>>follow-up 1|follow-up 2|follow-up 3<<END>> "
    "One follow-up should be Generate a quiz for me whenever the topic can be practiced. "
    "Follow-ups must stay on the same concept. Never mention the footer."
)

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)
_SUGGEST_BLOCK = re.compile(
    r"<<SUGGESTIONS>>\s*(.*?)\s*<<END>>",
    re.DOTALL | re.IGNORECASE,
)


class LLMError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _auth_headers() -> dict[str, str]:
    key = (settings.sarvam_api_key or "").strip()
    if not key:
        raise LLMError("Sarvam API key is missing. Set SARVAM_API_KEY in .env.", status_code=503)
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}",
        "api-subscription-key": key,
    }


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


def _parse_suggestion_items(blob: str) -> list[str]:
    parts = [part.strip(" \t-•") for part in re.split(r"[|\n]+", blob or "") if part.strip()]
    clean: list[str] = []
    for part in parts:
        if part.lower() in {"suggestions", "end"}:
            continue
        if 2 <= len(part) <= 80:
            clean.append(part)
    return clean[:3]


def split_spoken_and_suggestions(raw: str) -> tuple[str, list[str]]:
    text = (raw or "").strip()
    match = _SUGGEST_BLOCK.search(text)
    if not match:
        return text.split("<<SUGGESTIONS", 1)[0].strip(), []
    spoken = f"{text[: match.start()]} {text[match.end():]}".strip()
    return spoken, _parse_suggestion_items(match.group(1))


def _turn_payload(turn: Any) -> dict[str, str] | None:
    if isinstance(turn, dict):
        role, content = turn.get("role"), turn.get("content")
    else:
        role, content = getattr(turn, "role", None), getattr(turn, "content", None)
    if role not in {"user", "assistant"}:
        return None
    text = (content or "").strip()
    if not text:
        return None
    return {"role": role, "content": text}


def _build_messages(user_message: str, history: list[Any] | None, *, spoken: bool) -> list[dict[str, str]]:
    messages = [
        {
            "role": "system",
            "content": VOICE_SYSTEM_PROMPT if spoken else TEXT_SYSTEM_PROMPT,
        }
    ]
    for turn in (history or [])[-12:]:
        payload = _turn_payload(turn)
        if payload:
            messages.append(payload)
    messages.append({"role": "user", "content": user_message})
    return messages


def _visible_text(raw: str) -> str:
    """Withhold incomplete control markers without stripping word boundaries."""
    cleaned = _THINK_RE.sub("", raw or "")
    for marker in ("<think>", "<<SUGGESTIONS>>"):
        if marker in cleaned:
            cleaned = cleaned.split(marker, 1)[0]
        for length in range(len(marker) - 1, 0, -1):
            if cleaned.endswith(marker[:length]):
                cleaned = cleaned[:-length]
                break
    return cleaned


def _sse_content_delta(line: str) -> str:
    if not line.startswith("data:"):
        return ""
    data = line[5:].strip()
    if not data or data == "[DONE]":
        return ""
    try:
        payload = json.loads(data)
    except ValueError:
        return ""
    choices = payload.get("choices") or []
    if not choices:
        return ""
    delta = (choices[0].get("delta") or {}).get("content")
    return delta if isinstance(delta, str) else ""


def stream_chat(
    user_message: str,
    history: list[Any] | None = None,
    *,
    spoken: bool = False,
) -> Iterator[tuple[str, str, list[str]]]:
    """Yield ("delta", text, []) then a final ("done", spoken, suggestions)."""
    body = {
        "model": settings.sarvam_chat_model,
        "messages": _build_messages(user_message, history, spoken=spoken),
        "stream": True,
    }
    raw = ""
    visible = ""
    try:
        with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
            with client.stream(
                "POST",
                settings.llm_chat_url,
                json=body,
                headers=_auth_headers(),
            ) as response:
                if response.status_code >= 400:
                    raise LLMError(
                        f"The chat provider could not complete the request ({response.status_code}).",
                        status_code=502,
                    )
                for line in response.iter_lines():
                    if not line:
                        continue
                    piece = _sse_content_delta(line)
                    if not piece:
                        continue
                    raw += piece
                    next_visible = _visible_text(raw)
                    if next_visible != visible:
                        visible = next_visible
                        yield ("delta", visible, [])

    except httpx.TimeoutException as exc:
        raise LLMError("The LLM request timed out.", status_code=504) from exc
    except httpx.RequestError as exc:
        raise LLMError("Could not reach the chat provider. Please try again.", status_code=502) from exc

    spoken_text, suggestions = split_spoken_and_suggestions(_THINK_RE.sub("", raw))
    if not spoken_text:
        spoken_text, suggestions = complete_chat(user_message, history, spoken=spoken)
        if spoken_text:
            yield ("delta", spoken_text, [])
    yield ("done", spoken_text, suggestions)


def complete_chat(
    user_message: str,
    history: list[Any] | None = None,
    *,
    spoken: bool = True,
) -> tuple[str, list[str]]:
    body = {
        "model": settings.sarvam_chat_model,
        "messages": _build_messages(user_message, history, spoken=spoken),
        "stream": False,
    }
    try:
        with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
            response = client.post(settings.llm_chat_url, json=body, headers=_auth_headers())
    except httpx.TimeoutException as exc:
        raise LLMError("The LLM request timed out.", status_code=504) from exc
    except httpx.RequestError as exc:
        raise LLMError("Could not reach the chat provider. Please try again.", status_code=502) from exc

    if response.status_code >= 400:
        raise LLMError(f"The chat provider could not complete the request ({response.status_code}).", status_code=502)

    try:
        payload = response.json()
    except ValueError as exc:
        raise LLMError("Sarvam returned a non-JSON response.") from exc
    if not isinstance(payload, dict):
        raise LLMError("Sarvam returned an unexpected payload.")
    return split_spoken_and_suggestions(_extract_text(payload))
