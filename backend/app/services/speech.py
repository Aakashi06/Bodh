"""Sarvam speech-to-text and text-to-speech. Isolated from the LLM."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import httpx

from app.config import settings

TTS_MAX_CHARS = 2500
TTS_LANGUAGE_CODES = {
    "bn-IN",
    "en-IN",
    "gu-IN",
    "hi-IN",
    "kn-IN",
    "ml-IN",
    "mr-IN",
    "od-IN",
    "pa-IN",
    "ta-IN",
    "te-IN",
}


class SpeechError(Exception):
    """Raised when Sarvam STT or TTS cannot be completed."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _headers() -> dict[str, str]:
    key = (settings.sarvam_api_key or "").strip()
    if not key:
        raise SpeechError(
            "Sarvam API key is missing. Set SARVAM_API_KEY in .env.",
            status_code=503,
        )
    return {
        "api-subscription-key": key,
        "Authorization": f"Bearer {key}",
    }


def _base_mime(content_type: str | None) -> str:
    return (content_type or "").split(";")[0].strip().lower()


def _prepare_audio(audio: bytes, filename: str, content_type: str | None) -> tuple[bytes, str, str]:
    """Strip codec suffixes and convert browser recordings to WAV when needed."""
    mime = _base_mime(content_type)
    if mime in {"audio/wav", "audio/x-wav", "audio/wave"}:
        return audio, "audio.wav", "audio/wav"
    if mime in {"audio/webm", "video/webm"}:
        return audio, "audio.webm", "audio/webm"
    if mime in {"audio/ogg", "audio/opus"}:
        return audio, filename or "audio.ogg", mime

    suffix = Path(filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as src:
        src.write(audio)
        src_path = src.name
    dst_path = src_path + ".wav"
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", src_path, "-ac", "1", "-ar", "16000", dst_path],
            check=True,
            capture_output=True,
        )
        return Path(dst_path).read_bytes(), "audio.wav", "audio/wav"
    except (FileNotFoundError, subprocess.CalledProcessError):
        return audio, filename or "audio.webm", mime or "audio/webm"
    finally:
        Path(src_path).unlink(missing_ok=True)
        Path(dst_path).unlink(missing_ok=True)


def transcribe(audio: bytes, filename: str, content_type: str | None) -> tuple[str, str | None]:
    """Convert speech audio to text via Sarvam STT."""
    if not audio:
        raise SpeechError("Audio upload is empty.", status_code=400)

    audio, filename, mime = _prepare_audio(audio, filename, content_type)
    url = f"{settings.sarvam_base_url.rstrip('/')}/speech-to-text"
    data = {
        "model": settings.sarvam_stt_model,
        "mode": settings.sarvam_stt_mode or "codemix",
        "language_code": "unknown",
    }

    try:
        with httpx.Client(timeout=settings.sarvam_timeout_seconds) as client:
            response = client.post(
                url,
                headers=_headers(),
                data=data,
                files={"file": (filename, audio, mime)},
            )
    except httpx.TimeoutException as exc:
        raise SpeechError("Speech-to-text timed out.", status_code=504) from exc
    except httpx.RequestError as exc:
        raise SpeechError(f"Could not reach Sarvam STT: {exc}", status_code=502) from exc

    if response.status_code >= 400:
        detail = response.text[:500] if response.text else "no response body"
        raise SpeechError(f"Sarvam STT error ({response.status_code}): {detail}")

    try:
        payload = response.json()
    except ValueError as exc:
        raise SpeechError("Sarvam STT returned a non-JSON response.") from exc

    transcript = (payload.get("transcript") or "").strip() if isinstance(payload, dict) else ""
    if not transcript:
        raise SpeechError("No speech was recognized. Try speaking again.", status_code=400)
    language = payload.get("language_code") if isinstance(payload, dict) else None
    return transcript, language if isinstance(language, str) else None


def tts_language_for(detected: str | None, text: str) -> str:
    """Pick a Bulbul language that can speak Hindi, English, or a mix."""
    if detected in TTS_LANGUAGE_CODES:
        return detected
    if any("\u0900" <= ch <= "\u097f" for ch in text):
        return "hi-IN"
    return settings.sarvam_language_code if settings.sarvam_language_code in TTS_LANGUAGE_CODES else "hi-IN"


def synthesize(text: str, language_code: str | None = None) -> str:
    """Convert text to a base64 WAV string via Sarvam TTS."""
    clipped = (text or "").strip()[:TTS_MAX_CHARS]
    if not clipped:
        raise SpeechError("Nothing to speak.", status_code=400)

    url = f"{settings.sarvam_base_url.rstrip('/')}/text-to-speech"
    body = {
        "text": clipped,
        "model": settings.sarvam_tts_model,
        "speaker": settings.sarvam_tts_speaker,
        "language_code": tts_language_for(language_code, clipped),
        "output_audio_codec": "wav",
    }

    try:
        with httpx.Client(timeout=settings.sarvam_timeout_seconds) as client:
            response = client.post(url, headers={**_headers(), "Content-Type": "application/json"}, json=body)
    except httpx.TimeoutException as exc:
        raise SpeechError("Text-to-speech timed out.", status_code=504) from exc
    except httpx.RequestError as exc:
        raise SpeechError(f"Could not reach Sarvam TTS: {exc}", status_code=502) from exc

    if response.status_code >= 400:
        detail = response.text[:500] if response.text else "no response body"
        raise SpeechError(f"Sarvam TTS error ({response.status_code}): {detail}")

    try:
        payload = response.json()
    except ValueError as exc:
        raise SpeechError("Sarvam TTS returned a non-JSON response.") from exc

    audios = payload.get("audios") if isinstance(payload, dict) else None
    if not audios or not audios[0]:
        raise SpeechError("Sarvam TTS returned no audio.")
    return audios[0]
