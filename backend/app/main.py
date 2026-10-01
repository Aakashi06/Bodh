"""NIB FastAPI app — text chat and voice (STT → LLM → TTS)."""

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.schemas import ChatRequest, ChatResponse, VoiceResponse
from app.services.llm import LLMError, complete_chat
from app.services.speech import SpeechError, synthesize, transcribe

MAX_AUDIO_BYTES = 8 * 1024 * 1024

app = FastAPI(title="NIB", version="0.1.0")

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
        reply = complete_chat(request.message)
    except LLMError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return ChatResponse(response=reply, conversation_id=request.conversation_id)


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
        reply = complete_chat(transcript)
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
    )
