from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AssistantTextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=500)
    user_id: str = Field(default="mirror-local", min_length=1, max_length=128)
    account_name: str | None = Field(default=None, max_length=120)

    @field_validator("text", "user_id", "account_name", mode="before")
    @classmethod
    def clean_text_fields(cls, value: Any) -> Any:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None


class AssistantTextResponse(BaseModel):
    wake_detected: bool
    intent: str
    tool_result: dict[str, Any] = Field(default_factory=dict)
    response: str
    selected_tool: str | None = None


class AssistantCalendarEvent(BaseModel):
    id: int
    title: str
    start_datetime: datetime
    end_datetime: datetime | None = None
    notes: str | None = None
    created_at: datetime


class AssistantReminder(BaseModel):
    id: int
    title: str
    remind_at: datetime | None = None
    notes: str | None = None
    created_at: datetime

