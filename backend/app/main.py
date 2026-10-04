"""Bodh FastAPI app — text chat and voice (Sarvam STT → chat → TTS)."""

import json

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.config import settings
from app.schemas import ChatRequest, ChatResponse, SpeakRequest, SpeakResponse, TranscribeResponse, VoiceResponse
from app.services.llm import LLMError, complete_chat, stream_chat
from app.services.speech import SpeechError, synthesize, transcribe

MAX_AUDIO_BYTES = 8 * 1024 * 1024

app = FastAPI(title="Bodh", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    try:
        reply, suggestions = complete_chat(request.message, request.history, spoken=False)
    except LLMError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return ChatResponse(
        response=reply,
        conversation_id=request.conversation_id,
        suggestions=suggestions,
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.post("/api/chat/stream")
def chat_stream(request: ChatRequest) -> StreamingResponse:
    def events():
        try:
            for kind, text, suggestions in stream_chat(
                request.message,
                request.history,
                spoken=request.spoken,
            ):
                if kind == "delta":
                    yield _sse({"delta": text})
                elif kind == "done":
                    yield _sse(
                        {
                            "done": True,
                            "response": text,
                            "suggestions": suggestions,
                            "conversation_id": request.conversation_id,
                        }
                    )
        except LLMError as exc:
            yield _sse({"error": exc.message, "status": exc.status_code})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    conversation_id: str = Form(..., min_length=1, max_length=128),
    file: UploadFile = File(...),
) -> TranscribeResponse:
    audio = await file.read()
    if not audio:
        raise HTTPException(status_code=400, detail="Audio upload is empty.")
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="Audio file is too large (max 8MB).")
    try:
        transcript, _detected = transcribe(
            audio,
            file.filename or "audio.webm",
            file.content_type,
        )
    except SpeechError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    if not (transcript or "").strip():
        raise HTTPException(status_code=400, detail="Could not hear a question. Try again.")
    return TranscribeResponse(
        transcript=transcript.strip(),
        conversation_id=conversation_id,
        language_code=_detected,
    )


@app.post("/api/speak", response_model=SpeakResponse)
def speak(request: SpeakRequest) -> SpeakResponse:
    try:
        audio_b64 = synthesize(request.text, language_code=request.language_code)
    except SpeechError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return SpeakResponse(audio_base64=audio_b64)


@app.post("/api/voice", response_model=VoiceResponse)
async def voice(
    conversation_id: str = Form(..., min_length=1, max_length=128),
    file: UploadFile = File(...),
) -> VoiceResponse:
    audio = await file.read()
    if not audio:
        raise HTTPException(status_code=400, detail="Audio upload is empty.")
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="Audio file is too large (max 8MB).")

    try:
        transcript, detected_language = transcribe(
            audio,
            file.filename or "audio.webm",
            file.content_type,
        )
        reply, suggestions = complete_chat(transcript)
        audio_b64 = synthesize(reply, language_code=detected_language)
    except SpeechError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except LLMError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return VoiceResponse(
        transcript=transcript,
        response=reply,
        conversation_id=conversation_id,
        audio_base64=audio_b64,
        audio_format="wav",
        suggestions=suggestions,
    )
