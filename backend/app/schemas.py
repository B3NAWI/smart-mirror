from datetime import date as date_type
from datetime import datetime, time as time_type
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

TodoPriority = Literal["low", "medium", "high"]
MusicSource = Literal["spotify", "youtube", "apple_music", "local", "other"]
MirrorScreenName = Literal["today", "calendar", "weather", "sensors", "youtube"]


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


class NowPlayingAdvanceRequest(BaseModel):
    exclude_track_urls: List[str] = Field(default_factory=list)

    @field_validator("exclude_track_urls", mode="before")
    @classmethod
    def clean_exclude_track_urls(cls, value):
        if value is None:
            return []
        if not isinstance(value, list):
            return []
        cleaned = []
        for item in value:
            if item is None:
                continue
            text = str(item).strip()
            if text:
                cleaned.append(text)
        return cleaned


class NowPlayingRead(NowPlayingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    effective_progress_seconds: int = 0
    progress_percent: float = 0
    video_stream_url: Optional[str] = None
    video_thumbnail_url: Optional[str] = None
    playback_note: Optional[str] = None


class PlannerSegmentBase(BaseModel):
    id: str
    title: str
    start_time: time_type
    end_time: Optional[time_type] = None
    is_done: bool = False
    alarm_at_start: bool = False
    alarm_at_end: bool = False

    @field_validator("id", "title", mode="before")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        if value is None:
            raise ValueError("value cannot be empty")
        cleaned = str(value).strip()
        if not cleaned:
            raise ValueError("value cannot be empty")
        return cleaned

    @model_validator(mode="after")
    def validate_times(self):
        if self.end_time and self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class PlannerSegmentUpsert(PlannerSegmentBase):
    pass


class PlannerSegmentUpdate(BaseModel):
    title: Optional[str] = None
    start_time: Optional[time_type] = None
    end_time: Optional[time_type] = None
    is_done: Optional[bool] = None
    alarm_at_start: Optional[bool] = None
    alarm_at_end: Optional[bool] = None

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = str(value).strip()
        if not cleaned:
            raise ValueError("title cannot be empty")
        return cleaned

    @model_validator(mode="after")
    def validate_times(self):
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class PlannerSegmentRead(PlannerSegmentBase):
    model_config = ConfigDict(from_attributes=True)

    backend_event_id: str = ""
    created_at: datetime
    updated_at: datetime


class PlannerPlanBase(BaseModel):
    id: str
    title: str
    date: date_type
    source: str = "mobile"
    segments: List[PlannerSegmentUpsert] = Field(default_factory=list)

    @field_validator("id", "title", mode="before")
    @classmethod
    def validate_plan_text(cls, value: str) -> str:
        if value is None:
            raise ValueError("value cannot be empty")
        cleaned = str(value).strip()
        if not cleaned:
            raise ValueError("value cannot be empty")
        return cleaned

    @field_validator("source", mode="before")
    @classmethod
    def default_source(cls, value: Optional[str]) -> str:
        cleaned = _clean_optional_text(value)
        return cleaned or "mobile"


class PlannerPlanUpsert(PlannerPlanBase):
    pass


class PlannerPlanRead(BaseModel):
    id: str
    title: str
    date: date_type
    source: str = "mobile"
    segments: List[PlannerSegmentRead]
    created_at: datetime
    updated_at: datetime


class MirrorModuleSettingsBase(BaseModel):
    weather_enabled: bool = True
    date_enabled: bool = True
    reminders_enabled: bool = True
    calendar_enabled: bool = True
    temperature_enabled: bool = True
    humidity_enabled: bool = True
    pressure_enabled: bool = True
    spotify_enabled: bool = True
    youtube_enabled: bool = True
    gesture_camera_enabled: bool = False


class MirrorModuleSettingsUpdate(BaseModel):
    weather_enabled: Optional[bool] = None
    date_enabled: Optional[bool] = None
    reminders_enabled: Optional[bool] = None
    calendar_enabled: Optional[bool] = None
    temperature_enabled: Optional[bool] = None
    humidity_enabled: Optional[bool] = None
    pressure_enabled: Optional[bool] = None
    spotify_enabled: Optional[bool] = None
    youtube_enabled: Optional[bool] = None
    gesture_camera_enabled: Optional[bool] = None


class MirrorModuleSettingsRead(MirrorModuleSettingsBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    weather_refresh_requested_at: Optional[datetime] = None
    mirror_refresh_requested_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class MirrorStateResponse(BaseModel):
    temperature: Optional[float] = None
    humidity: Optional[int] = None
    pressure: Optional[int] = None
    motion: bool = False
    gesture: str = "none"
    mirror_state_updated_at: Optional[datetime] = None
    weather_temperature_c: Optional[float] = None
    weather_description: str = ""
    weather_location_label: str = ""
    weather_region: str = ""
    weather_source: str = ""
    weather_is_day: Optional[int] = None
    weather_updated_at: Optional[datetime] = None
    active_account_id: str = ""
    active_account_name: str = ""
    profile_updated_at: Optional[datetime] = None
    screen_name: MirrorScreenName = "today"
    brightness_level: int = 70
    volume_level: int = 50
    sleeping: bool = False
    control_updated_at: Optional[datetime] = None
    modules: MirrorModuleSettingsRead


class MirrorRuntimeStateUpdate(BaseModel):
    temperature: Optional[float] = None
    humidity: Optional[int] = None
    pressure: Optional[int] = None
    motion: Optional[bool] = None
    gesture: Optional[str] = None
    weather_temperature_c: Optional[float] = None
    weather_description: Optional[str] = None
    weather_location_label: Optional[str] = None
    weather_region: Optional[str] = None
    weather_source: Optional[str] = None
    weather_is_day: Optional[int] = None
    active_account_id: Optional[str] = None
    active_account_name: Optional[str] = None
    screen_name: Optional[MirrorScreenName] = None
    brightness_level: Optional[int] = None
    volume_level: Optional[int] = None
    sleeping: Optional[bool] = None

    @field_validator("brightness_level", "volume_level", mode="before")
    @classmethod
    def validate_control_level(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return value
        numeric_value = int(value)
        if numeric_value < 0 or numeric_value > 100:
            raise ValueError("control levels must be between 0 and 100")
        return numeric_value


class MirrorRefreshRequest(BaseModel):
    weather: bool = False
    mirror_data: bool = False


class HaloCommandRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    command: str
    user_id: Optional[str] = None
    account_name: Optional[str] = None

    @field_validator("command", mode="before")
    @classmethod
    def validate_command(cls, value: str) -> str:
        if value is None:
            raise ValueError("command cannot be empty")
        cleaned = str(value).strip()
        if not cleaned:
            raise ValueError("command cannot be empty")
        return cleaned

    @field_validator("user_id", "account_name", mode="before")
    @classmethod
    def clean_optional_command_text(cls, value: Optional[str]) -> Optional[str]:
        return _clean_optional_text(value)


class HaloCommandResponse(BaseModel):
    status: Literal["success", "error"]
    intent: str
    reply: str
    tool: str
    data: Dict[str, Any] = Field(default_factory=dict)


VoiceSessionClient = Literal["mirror", "mobile", "unknown"]
VoiceSessionOutputModality = Literal["audio", "text"]


class VoiceSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client: VoiceSessionClient = "unknown"
    output_modality: VoiceSessionOutputModality = "audio"
    voice: Optional[str] = None

    @field_validator("voice", mode="before")
    @classmethod
    def clean_voice(cls, value: Optional[str]) -> Optional[str]:
        cleaned = _clean_optional_text(value)
        if cleaned and len(cleaned) > 64:
            raise ValueError("voice must be 64 characters or fewer")
        return cleaned


class VoiceSessionSecret(BaseModel):
    value: str
    expires_at: int


class VoiceSessionMetadata(BaseModel):
    model: str
    instructions: str
    output_modality: VoiceSessionOutputModality
    voice: Optional[str] = None
    reasoning_effort: str
    max_input_tokens: int
    max_output_tokens: int
    idle_timeout_seconds: int
    session_timeout_seconds: int
    wake_words: List[str]
    primary_wake_phrase: str
    response_style: str
    supported_command_groups: List[str]
    tool_listing_path: str
    tool_execute_path: str


class VoiceSessionResponse(BaseModel):
    client_secret: VoiceSessionSecret
    session: Dict[str, Any]
    metadata: VoiceSessionMetadata


class VoiceToolExecuteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tool: str
    arguments: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("tool", mode="before")
    @classmethod
    def validate_tool_name(cls, value: Any) -> str:
        cleaned = str(value or "").strip()
        if not cleaned:
            raise ValueError("tool is required")
        if len(cleaned) > 128:
            raise ValueError("tool must be 128 characters or fewer")
        return cleaned
