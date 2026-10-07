"""Request and response models for the chat and voice APIs."""

from pydantic import BaseModel, Field


class ChatTurn(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    conversation_id: str = Field(..., min_length=1, max_length=128)
    history: list[ChatTurn] = Field(default_factory=list, max_length=12)
    spoken: bool = False


class ChatResponse(BaseModel):
    response: str
    conversation_id: str
    suggestions: list[str] = Field(default_factory=list)


class TranscribeResponse(BaseModel):
    transcript: str
    conversation_id: str
    language_code: str | None = None


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2500)
    language_code: str | None = None


class SpeakResponse(BaseModel):
    audio_base64: str
    audio_format: str = "wav"
