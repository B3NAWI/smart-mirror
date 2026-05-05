from datetime import date as date_type
from datetime import datetime, time as time_type
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

TodoPriority = Literal["low", "medium", "high"]
MusicSource = Literal["spotify", "youtube", "apple_music", "local", "other"]


def _clean_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None

    return value


def _normalize_datetime(value: Optional[datetime]) -> Optional[datetime]:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone().replace(tzinfo=None)


def _normalize_music_source(value: Optional[str]) -> str:
    cleaned = (_clean_optional_text(value) or "other").lower()
    aliases = {
        "apple music": "apple_music",
        "apple-music": "apple_music",
        "yt": "youtube",
    }
    return aliases.get(cleaned, cleaned)


class DeleteResponse(BaseModel):
    status: str
    id: int


class CalendarEventBase(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    location: Optional[str] = None
    source: str = "mobile"

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, value: str) -> str:
        if value is None:
            raise ValueError("title cannot be empty")
        cleaned = str(value).strip()
        if not cleaned:
            raise ValueError("title cannot be empty")
        return cleaned

    @field_validator("description", "location", mode="before")
    @classmethod
    def clean_optional_text(cls, value: Optional[str]) -> Optional[str]:
        return _clean_optional_text(value)

    @field_validator("source", mode="before")
    @classmethod
    def default_source(cls, value: Optional[str]) -> str:
        cleaned = _clean_optional_text(value)
        return cleaned or "mobile"

    @field_validator("start_time", "end_time", mode="after")
    @classmethod
    def normalize_datetime(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _normalize_datetime(value)

    @model_validator(mode="after")
    def validate_times(self):
        if self.end_time and self.end_time < self.start_time:
            raise ValueError("end_time cannot be before start_time")
        return self


class CalendarEventCreate(CalendarEventBase):
    pass


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    location: Optional[str] = None
    source: Optional[str] = None

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = str(value).strip()
        if not cleaned:
            raise ValueError("title cannot be empty")
        return cleaned

    @field_validator("description", "location", mode="before")
    @classmethod
    def clean_optional_text(cls, value: Optional[str]) -> Optional[str]:
        return _clean_optional_text(value)

    @field_validator("source", mode="before")
    @classmethod
    def default_source(cls, value: Optional[str]) -> str:
        cleaned = _clean_optional_text(value)
        return cleaned or "mobile"

    @field_validator("start_time", "end_time", mode="after")
    @classmethod
    def normalize_datetime(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _normalize_datetime(value)

    @model_validator(mode="after")
    def validate_times(self):
        if self.start_time and self.end_time and self.end_time < self.start_time:
            raise ValueError("end_time cannot be before start_time")
        return self


class CalendarEventRead(CalendarEventBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class TodoTaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    date: date_type
    due_time: Optional[time_type] = None
    priority: TodoPriority = "medium"
    completed: bool = False
    source: str = "mobile"

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, value: str) -> str:
        if value is None:
            raise ValueError("title cannot be empty")
        cleaned = str(value).strip()
        if not cleaned:
            raise ValueError("title cannot be empty")
        return cleaned

    @field_validator("description", mode="before")
    @classmethod
    def clean_optional_text(cls, value: Optional[str]) -> Optional[str]:
        return _clean_optional_text(value)

    @field_validator("priority", mode="before")
    @classmethod
    def normalize_priority(cls, value: str) -> str:
        if value is None:
            return "medium"
        return str(value).lower()

    @field_validator("source", mode="before")
    @classmethod
    def default_source(cls, value: Optional[str]) -> str:
        cleaned = _clean_optional_text(value)
        return cleaned or "mobile"


class TodoTaskCreate(TodoTaskBase):
    pass


class TodoTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    date: Optional[date_type] = None
    due_time: Optional[time_type] = None
    priority: Optional[TodoPriority] = None
    completed: Optional[bool] = None
    source: Optional[str] = None

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = str(value).strip()
        if not cleaned:
            raise ValueError("title cannot be empty")
        return cleaned

    @field_validator("description", mode="before")
    @classmethod
    def clean_optional_text(cls, value: Optional[str]) -> Optional[str]:
        return _clean_optional_text(value)

    @field_validator("priority", mode="before")
    @classmethod
    def normalize_priority(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return str(value).lower()

    @field_validator("source", mode="before")
    @classmethod
    def default_source(cls, value: Optional[str]) -> str:
        cleaned = _clean_optional_text(value)
        return cleaned or "mobile"


class TodoTaskRead(TodoTaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class DailyPlanResponse(BaseModel):
    date: date_type
    calendar_events: List[CalendarEventRead]
    todos: List[TodoTaskRead]
    completed_todos_count: int
    remaining_todos_count: int
    high_priority_count: int
    next_event: Optional[CalendarEventRead] = None
    next_todo: Optional[TodoTaskRead] = None


class SeedCalendarResponse(BaseModel):
    date: date_type
    events_created: int
    todos_created: int
    calendar_events: List[CalendarEventRead]
    todos: List[TodoTaskRead]
    message: str


class NowPlayingBase(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    source: MusicSource = "other"
    is_playing: bool = False
    progress_seconds: int = 0
    duration_seconds: Optional[int] = None
    artwork_url: Optional[str] = None
    track_url: Optional[str] = None

    @field_validator("title", "artist", "album", "artwork_url", "track_url", mode="before")
    @classmethod
    def clean_text_fields(cls, value: Optional[str]) -> Optional[str]:
        return _clean_optional_text(value)

    @field_validator("source", mode="before")
    @classmethod
    def normalize_source(cls, value: Optional[str]) -> str:
        return _normalize_music_source(value)

    @field_validator("progress_seconds", mode="before")
    @classmethod
    def validate_progress_seconds(cls, value: Optional[int]) -> int:
        if value is None:
            return 0
        progress = int(value)
        if progress < 0:
            raise ValueError("progress_seconds cannot be negative")
        return progress

    @field_validator("duration_seconds", mode="before")
    @classmethod
    def validate_duration_seconds(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return value
        duration = int(value)
        if duration <= 0:
            raise ValueError("duration_seconds must be greater than zero")
        return duration

    @model_validator(mode="after")
    def validate_playback_state(self):
        if self.is_playing and not self.title:
            raise ValueError("title is required when is_playing is true")
        if (
            self.duration_seconds is not None
            and self.progress_seconds > self.duration_seconds
        ):
            raise ValueError("progress_seconds cannot exceed duration_seconds")
        return self


class NowPlayingUpsert(NowPlayingBase):
    pass


class NowPlayingUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    source: Optional[MusicSource] = None
    is_playing: Optional[bool] = None
    progress_seconds: Optional[int] = None
    duration_seconds: Optional[int] = None
    artwork_url: Optional[str] = None
    track_url: Optional[str] = None

    @field_validator("title", "artist", "album", "artwork_url", "track_url", mode="before")
    @classmethod
    def clean_text_fields(cls, value: Optional[str]) -> Optional[str]:
        return _clean_optional_text(value)

    @field_validator("source", mode="before")
    @classmethod
    def normalize_source(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return _normalize_music_source(value)

    @field_validator("progress_seconds", mode="before")
    @classmethod
    def validate_progress_seconds(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return value
        progress = int(value)
        if progress < 0:
            raise ValueError("progress_seconds cannot be negative")
        return progress

    @field_validator("duration_seconds", mode="before")
    @classmethod
    def validate_duration_seconds(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return value
        duration = int(value)
        if duration <= 0:
            raise ValueError("duration_seconds must be greater than zero")
        return duration


class NowPlayingRead(NowPlayingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    effective_progress_seconds: int = 0
    progress_percent: float = 0
