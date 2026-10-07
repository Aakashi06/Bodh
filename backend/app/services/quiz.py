"""Generate validated quiz data instead of parsing presentation text."""
import json

import httpx
from pydantic import BaseModel, Field, ValidationError

from app.config import settings
from app.services.llm import LLMError, _auth_headers, _extract_text, _build_messages


class Question(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    options: list[str] = Field(min_length=4, max_length=4)
    correct_index: int = Field(ge=0, le=3, strict=True)
    explanation: str = Field(min_length=1, max_length=2000)


class Quiz(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    questions: list[Question] = Field(min_length=4, max_length=5)


def generate_quiz(message, history):
    messages = _build_messages(message, history, spoken=False)
    messages[0]["content"] = (
        'Create a quiz about the concept in the conversation, in the learner\'s language. '
        'Return ONLY JSON: {"title":"...","questions":[{"question":"...",'
        '"options":["...","...","...","..."],"correct_index":0,"explanation":"..."}]}. '
        'Include 4 or 5 questions, each with four distinct nonempty options and exactly one '
        'unambiguous correct answer. correct_index is zero-based. Check factual accuracy, '
        'avoid trick wording, and distinguish net force from individual forces. '
        'Do not include markdown or suggestions.'
    )
    try:
        with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
            response = client.post(settings.llm_chat_url, headers=_auth_headers(), json={
                "model": settings.sarvam_chat_model, "messages": messages, "stream": False,
            })
        response.raise_for_status()
        raw = _extract_text(response.json()).strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        quiz = Quiz.model_validate(json.loads(raw))
        for question in quiz.questions:
            question.options = [option.strip() for option in question.options]
            if any(not option for option in question.options) or len(set(question.options)) != 4:
                raise ValueError("Invalid options")
        return quiz.model_dump()
    except httpx.TimeoutException as exc:
        raise LLMError("Quiz generation timed out. Please try again.", 504) from exc
    except (httpx.HTTPError, ValueError, ValidationError) as exc:
        raise LLMError("Could not generate a valid quiz. Please try again.") from exc
