"""Request and response models for the chat and voice APIs."""

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    conversation_id: str = Field(..., min_length=1, max_length=128)


class ChatResponse(BaseModel):
    response: str
    conversation_id: str


class VoiceResponse(BaseModel):
    transcript: str
    response: str
    conversation_id: str
    audio_base64: str
    audio_format: str = "wav"
