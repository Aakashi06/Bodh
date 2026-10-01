"""Application settings loaded from environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    cors_origins: str = "http://localhost:5173"

    llm_provider: str = "sarvam"
    llm_model: str = "sarvam-105b-conversations"
    llm_api_key: str = ""
    llm_base_url: str = "https://api.sarvam.ai"
    llm_timeout_seconds: float = 120.0

    sarvam_api_key: str = ""
    sarvam_base_url: str = "https://api.sarvam.ai"
    sarvam_stt_model: str = "saaras:v4"
    sarvam_stt_mode: str = "codemix"
    sarvam_tts_model: str = "bulbul:v3"
    sarvam_tts_speaker: str = "shubh"
    sarvam_language_code: str = "hi-IN"
    sarvam_timeout_seconds: float = 60.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def resolved_llm_key(self) -> str:
        key = (self.llm_api_key or "").strip()
        if key:
            return key
        if (self.llm_provider or "").strip().lower() in {"sarvam", "servum"}:
            return (self.sarvam_api_key or "").strip()
        return ""

    @property
    def llm_chat_url(self) -> str:
        base = (self.llm_base_url or self.sarvam_base_url).rstrip("/")
        return f"{base}/v1/chat/completions"


settings = Settings()
