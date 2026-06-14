from __future__ import annotations

from dataclasses import dataclass
from datetime import date as date_type
from datetime import datetime, time as time_type, timedelta
from typing import Any, Callable, Dict, List, Optional, Type

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy.orm import Session

from .calendar_routes import get_events_for_date
from .models import CalendarEvent, NowPlayingState, PlannerPlan, PlannerSegment, TodoTask
from .planner_routes import delete_planner_segment, upsert_planner_plan
from .schemas import PlannerPlanUpsert, PlannerSegmentUpsert
from .state import get_state, update_state
from .todo_routes import get_todos_for_date
from .youtube_streams import find_related_youtube_video, search_youtube_videos

REMINDER_SOURCE_PREFIX = "reminder:"
ALARM_SOURCE_PREFIX = "alarm:"
MIRROR_SCREEN_ALLOWLIST = {"today", "calendar", "weather", "sensors", "youtube"}
PHONE_TO_MIRROR_COMMAND_ALLOWLIST = {
    "show_today",
    "show_calendar",
    "show_weather",
    "show_sensors",
    "open_youtube",
    "sleep",
    "wake",
    "media_play",
    "media_pause",
    "media_stop",
    "media_next",
}


class VoiceToolError(Exception):
    pass


class VoiceToolValidationError(VoiceToolError):
    pass


class VoiceToolNotFoundError(VoiceToolError):
    pass


class UserScopedToolInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    userId: str = Field(min_length=1, max_length=128)

    @field_validator("userId", mode="before")
    @classmethod
    def validate_user_id(cls, value: Any) -> str:
        cleaned = str(value or "").strip()
        if not cleaned:
            raise ValueError("userId is required")
        return cleaned


class EmptyToolInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GetTodayPlanInput(UserScopedToolInput):
    pass


class GetWeekPlanInput(UserScopedToolInput):
    pass


class GetMonthPlanInput(UserScopedToolInput):
    pass


class GetWorkTasksInput(UserScopedToolInput):
    pass


class ReminderFieldUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    datetime: Optional[datetime] = None
    completed: Optional[bool] = None
    source: Optional[str] = Field(default=None, min_length=1, max_length=40)

    @field_validator("title", "source", mode="before")
    @classmethod
    def strip_optional_text(cls, value: Any) -> Optional[str]:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None


class AddReminderInput(UserScopedToolInput):
    title: str = Field(min_length=1, max_length=255)
    datetime: datetime
    source: str = Field(min_length=1, max_length=40)

    @field_validator("title", "source", mode="before")
    @classmethod
    def strip_text(cls, value: Any) -> str:
        cleaned = str(value or "").strip()
        if not cleaned:
            raise ValueError("value is required")
        return cleaned


class UpdateReminderInput(UserScopedToolInput):
    reminderId: int = Field(ge=1)
    fields: ReminderFieldUpdate


class DeleteReminderInput(UserScopedToolInput):
    reminderId: int = Field(ge=1)


class AlarmFieldUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    time: Optional[time_type] = None
    label: Optional[str] = Field(default=None, min_length=1, max_length=255)
    repeat: Optional[List[str]] = None
    source: Optional[str] = Field(default=None, min_length=1, max_length=40)


class AddAlarmInput(UserScopedToolInput):
    time: time_type
    label: str = Field(default="", max_length=255)
    repeat: List[str] = Field(default_factory=list)
    source: str = Field(min_length=1, max_length=40)


class UpdateAlarmInput(UserScopedToolInput):
    alarmId: str = Field(min_length=3, max_length=160)
    fields: AlarmFieldUpdate

    @field_validator("alarmId", mode="before")
    @classmethod
    def strip_alarm_id(cls, value: Any) -> str:
        cleaned = str(value or "").strip()
        if not cleaned:
            raise ValueError("alarmId is required")
        return cleaned


class DeleteAlarmInput(UserScopedToolInput):
    alarmId: str = Field(min_length=3, max_length=160)

    @field_validator("alarmId", mode="before")
    @classmethod
    def strip_alarm_id(cls, value: Any) -> str:
        cleaned = str(value or "").strip()
        if not cleaned:
            raise ValueError("alarmId is required")
        return cleaned


class GetNextAlarmInput(UserScopedToolInput):
    pass


class SummarizeUserDayInput(UserScopedToolInput):
    pass


class MirrorSetScreenInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    screenName: str = Field(min_length=1, max_length=32)

    @field_validator("screenName", mode="before")
    @classmethod
    def validate_screen_name(cls, value: Any) -> str:
        cleaned = str(value or "").strip().lower()
        if cleaned not in MIRROR_SCREEN_ALLOWLIST:
            raise ValueError(
                f"screenName must be one of: {', '.join(sorted(MIRROR_SCREEN_ALLOWLIST))}"
            )
        return cleaned


class LevelInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    level: int = Field(ge=0, le=100)


class MirrorSleepInput(EmptyToolInput):
    pass


class MirrorWakeInput(EmptyToolInput):
    pass


class MirrorShowTodayInput(EmptyToolInput):
    pass


class MirrorShowCalendarInput(EmptyToolInput):
    pass


class MirrorShowWeatherInput(EmptyToolInput):
    pass


class MirrorShowSensorsInput(EmptyToolInput):
    pass


class MediaPlayInput(EmptyToolInput):
    pass


class MediaPauseInput(EmptyToolInput):
    pass


class MediaStopInput(EmptyToolInput):
    pass


class MediaNextInput(EmptyToolInput):
    pass


class MediaPreviousInput(EmptyToolInput):
    pass


class MediaSearchInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=1, max_length=120)

    @field_validator("query", mode="before")
    @classmethod
    def strip_query(cls, value: Any) -> str:
        cleaned = str(value or "").strip()
        if not cleaned:
            raise ValueError("query is required")
        return cleaned


class MediaOpenYoutubeInput(EmptyToolInput):
    pass


class MediaSetVolumeInput(LevelInput):
    pass


class PhoneSendNotificationInput(UserScopedToolInput):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=500)


class PhoneCreateAlarmInput(UserScopedToolInput):
    time: time_type
    label: str = Field(default="", max_length=255)
    repeat: List[str] = Field(default_factory=list)


class PhoneSyncPlansInput(UserScopedToolInput):
    pass


class PhoneSendCommandToMirrorInput(UserScopedToolInput):
    command: str = Field(min_length=1, max_length=32)

    @field_validator("command", mode="before")
    @classmethod
    def validate_command(cls, value: Any) -> str:
        cleaned = str(value or "").strip().lower()
        if cleaned not in PHONE_TO_MIRROR_COMMAND_ALLOWLIST:
            raise ValueError(
                f"command must be one of: {', '.join(sorted(PHONE_TO_MIRROR_COMMAND_ALLOWLIST))}"
            )
        return cleaned


class GetCurrentSensorDataInput(EmptyToolInput):
    pass


class GetTemperatureInput(EmptyToolInput):
    pass


class GetHumidityInput(EmptyToolInput):
    pass


class GetPressureInput(EmptyToolInput):
    pass


@dataclass(frozen=True)
class VoiceToolSpec:
    name: str
    description: str
    input_model: Type[BaseModel]
    handler: Callable[[BaseModel, Optional[Session]], Dict[str, Any]]
    requires_db: bool = False


def _require_db(db: Optional[Session]) -> Session:
    if db is None:
        raise VoiceToolError("A database session is required for this tool.")
    return db


def _normalize_reminder_source(source: str) -> str:
    cleaned = str(source or "").strip().lower().replace(" ", "_")
    cleaned = cleaned[:40] or "voice"
    return f"{REMINDER_SOURCE_PREFIX}{cleaned}"[:50]


def _normalize_alarm_source(source: str) -> str:
    cleaned = str(source or "").strip().lower().replace(" ", "_")
    cleaned = cleaned[:40] or "voice"
    return f"{ALARM_SOURCE_PREFIX}{cleaned}"[:50]


def _is_reminder_task(todo: TodoTask) -> bool:
    return (todo.source or "").startswith(REMINDER_SOURCE_PREFIX)


def _alarm_id(plan_id: str, segment_id: str) -> str:
    return f"{plan_id}:{segment_id}"


def _parse_alarm_id(alarm_id: str) -> tuple[str, str]:
    plan_id, separator, segment_id = str(alarm_id or "").partition(":")
    if not separator or not plan_id or not segment_id:
        raise VoiceToolError("alarmId must be in the format '<planId>:<segmentId>'.")
    return plan_id, segment_id


def _placeholder_result(tool_name: str, message: str, todo: str) -> Dict[str, Any]:
    return {
        "tool": tool_name,
        "status": "placeholder",
        "message": message,
        "todo": todo,
    }


def _serialize_calendar_event(event: CalendarEvent) -> Dict[str, Any]:
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description,
        "start_time": event.start_time.isoformat() if event.start_time else None,
        "end_time": event.end_time.isoformat() if event.end_time else None,
        "location": event.location,
        "completed": event.completed,
        "source": event.source,
    }


def _serialize_todo(todo: TodoTask) -> Dict[str, Any]:
    return {
        "id": todo.id,
        "title": todo.title,
        "description": todo.description,
        "date": todo.date.isoformat() if todo.date else None,
        "due_time": todo.due_time.isoformat() if todo.due_time else None,
        "priority": todo.priority,
        "completed": todo.completed,
        "source": todo.source,
    }


def _serialize_plan(plan: PlannerPlan) -> Dict[str, Any]:
    segments = sorted(plan.segments, key=lambda item: (item.start_time, item.id))
    return {
        "id": plan.id,
        "title": plan.title,
        "date": plan.date.isoformat() if plan.date else None,
        "source": plan.source,
        "segments": [
            {
                "id": segment.id,
                "title": segment.title,
                "start_time": segment.start_time.isoformat() if segment.start_time else None,
                "end_time": segment.end_time.isoformat() if segment.end_time else None,
                "is_done": segment.is_done,
                "backend_event_id": segment.backend_event_id,
                "alarm_at_start": segment.alarm_at_start,
                "alarm_at_end": segment.alarm_at_end,
            }
            for segment in segments
        ],
    }


def _is_alarm_segment(segment: PlannerSegment) -> bool:
    return bool(segment.alarm_at_start or segment.alarm_at_end)


def _alarm_datetime(plan: PlannerPlan, segment: PlannerSegment) -> datetime:
    return datetime.combine(plan.date, segment.start_time)


def _serialize_alarm(plan: PlannerPlan, segment: PlannerSegment) -> Dict[str, Any]:
    return {
        "alarmId": _alarm_id(plan.id, segment.id),
        "planId": plan.id,
        "segmentId": segment.id,
        "label": segment.title,
        "date": plan.date.isoformat(),
        "time": segment.start_time.isoformat(),
        "datetime": _alarm_datetime(plan, segment).isoformat(),
        "repeat": [],
        "source": plan.source,
        "completed": segment.is_done,
        "alarm_at_start": segment.alarm_at_start,
        "alarm_at_end": segment.alarm_at_end,
    }


def _list_alarm_segments(db: Session) -> List[tuple[PlannerPlan, PlannerSegment]]:
    alarms: List[tuple[PlannerPlan, PlannerSegment]] = []
    plans = db.query(PlannerPlan).order_by(PlannerPlan.date.asc(), PlannerPlan.updated_at.desc()).all()
    for plan in plans:
        ordered_segments = sorted(plan.segments, key=lambda item: (item.start_time, item.id))
        for segment in ordered_segments:
            if _is_alarm_segment(segment):
                alarms.append((plan, segment))
    return alarms


def _load_alarm(db: Session, alarm_id: str) -> tuple[PlannerPlan, PlannerSegment]:
    plan_id, segment_id = _parse_alarm_id(alarm_id)
    plan = db.query(PlannerPlan).filter(PlannerPlan.id == plan_id).first()
    if plan is None:
        raise VoiceToolError("Alarm plan not found.")

    segment = (
        db.query(PlannerSegment)
        .filter(PlannerSegment.plan_id == plan_id, PlannerSegment.id == segment_id)
        .first()
    )
    if segment is None or not _is_alarm_segment(segment):
        raise VoiceToolError("Alarm not found.")

    return plan, segment


def _next_alarm_date(target_time: time_type) -> date_type:
    now = datetime.now()
    candidate = datetime.combine(date_type.today(), target_time)
    if candidate <= now:
        candidate += timedelta(days=1)
    return candidate.date()


def _next_upcoming_alarm(db: Session) -> Optional[tuple[PlannerPlan, PlannerSegment]]:
    now = datetime.now()
    upcoming = [
        (plan, segment)
        for plan, segment in _list_alarm_segments(db)
        if _alarm_datetime(plan, segment) >= now and not segment.is_done
    ]
    if not upcoming:
        return None
    return min(upcoming, key=lambda item: (_alarm_datetime(item[0], item[1]), item[1].id))


def _get_or_create_now_playing_state(db: Session) -> NowPlayingState:
    state = db.query(NowPlayingState).filter(NowPlayingState.id == 1).first()
    if state is not None:
        return state

    state = NowPlayingState(
        id=1,
        source="other",
        is_playing=False,
        progress_seconds=0,
    )
    db.add(state)
    db.commit()
    db.refresh(state)
    return state


def _serialize_now_playing_state(state: NowPlayingState) -> Dict[str, Any]:
    return {
        "id": state.id,
        "title": state.title,
        "artist": state.artist,
        "album": state.album,
        "source": state.source,
        "is_playing": state.is_playing,
        "progress_seconds": state.progress_seconds,
        "duration_seconds": state.duration_seconds,
        "artwork_url": state.artwork_url,
        "track_url": state.track_url,
        "updated_at": state.updated_at.isoformat() if state.updated_at else None,
    }


def _select_next_event(events: List[CalendarEvent], target_date: date_type) -> Optional[CalendarEvent]:
    if not events:
        return None

    if target_date != date_type.today():
        return events[0]

    now = datetime.now()
    for event in events:
        if event.start_time >= now:
            return event
        if event.end_time and event.end_time >= now:
            return event
    return None


def _select_next_todo(todos: List[TodoTask]) -> Optional[TodoTask]:
    for todo in todos:
        if not todo.completed:
            return todo
    return None


def _get_plans_for_range(
    db: Session,
    start_date: date_type,
    end_date: date_type,
) -> List[PlannerPlan]:
    return (
        db.query(PlannerPlan)
        .filter(PlannerPlan.date >= start_date, PlannerPlan.date <= end_date)
        .order_by(PlannerPlan.date.asc(), PlannerPlan.updated_at.desc())
        .all()
    )


def _get_calendar_events_for_range(
    db: Session,
    start_date: date_type,
    end_date: date_type,
) -> List[CalendarEvent]:
    day_start = datetime.combine(start_date, time_type.min)
    day_end = datetime.combine(end_date + timedelta(days=1), time_type.min)
    return (
        db.query(CalendarEvent)
        .filter(CalendarEvent.start_time < day_end)
        .filter((CalendarEvent.end_time.is_(None)) | (CalendarEvent.end_time >= day_start))
        .order_by(CalendarEvent.start_time.asc(), CalendarEvent.id.asc())
        .all()
    )


def _get_todos_for_range(
    db: Session,
    start_date: date_type,
    end_date: date_type,
) -> List[TodoTask]:
    return (
        db.query(TodoTask)
        .filter(TodoTask.date >= start_date, TodoTask.date <= end_date)
        .order_by(TodoTask.date.asc(), TodoTask.due_time.asc(), TodoTask.id.asc())
        .all()
    )


def _date_buckets(
    start_date: date_type,
    end_date: date_type,
    events: List[CalendarEvent],
    todos: List[TodoTask],
    plans: List[PlannerPlan],
) -> List[Dict[str, Any]]:
    event_map: Dict[date_type, List[CalendarEvent]] = {}
    for event in events:
        event_start = max(start_date, event.start_time.date())
        event_end = (
            min(end_date, event.end_time.date())
            if event.end_time is not None
            else event_start
        )
        current = event_start
        while current <= event_end:
            event_map.setdefault(current, []).append(event)
            current += timedelta(days=1)

    todo_map: Dict[date_type, List[TodoTask]] = {}
    for todo in todos:
        todo_map.setdefault(todo.date, []).append(todo)

    plan_map: Dict[date_type, List[PlannerPlan]] = {}
    for plan in plans:
        plan_map.setdefault(plan.date, []).append(plan)

    buckets: List[Dict[str, Any]] = []
    current = start_date
    while current <= end_date:
        buckets.append(
            {
                "date": current.isoformat(),
                "calendar_events": [
                    _serialize_calendar_event(event) for event in event_map.get(current, [])
                ],
                "todos": [_serialize_todo(todo) for todo in todo_map.get(current, [])],
                "planner_plans": [_serialize_plan(plan) for plan in plan_map.get(current, [])],
            }
        )
        current += timedelta(days=1)
    return buckets


def _today_plan_payload(db: Session, user_id: str) -> Dict[str, Any]:
    target_date = date_type.today()
    events = get_events_for_date(db, target_date)
    todos = get_todos_for_date(db, target_date)
    plans = _get_plans_for_range(db, target_date, target_date)
    next_event = _select_next_event(events, target_date)
    next_todo = _select_next_todo(todos)
    return {
        "userId": user_id,
        "user_scope": "shared_backend",
        "date": target_date.isoformat(),
        "calendar_events": [_serialize_calendar_event(event) for event in events],
        "todos": [_serialize_todo(todo) for todo in todos],
        "planner_plans": [_serialize_plan(plan) for plan in plans],
        "next_event": _serialize_calendar_event(next_event) if next_event else None,
        "next_todo": _serialize_todo(next_todo) if next_todo else None,
    }


def _tool_get_today_plan(args: GetTodayPlanInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    return {
        "tool": "get_today_plan",
        "status": "success",
        "data": _today_plan_payload(live_db, args.userId),
    }


def _tool_get_week_plan(args: GetWeekPlanInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    start_date = date_type.today()
    end_date = start_date + timedelta(days=6)
    events = _get_calendar_events_for_range(live_db, start_date, end_date)
    todos = _get_todos_for_range(live_db, start_date, end_date)
    plans = _get_plans_for_range(live_db, start_date, end_date)
    return {
        "tool": "get_week_plan",
        "status": "success",
        "data": {
            "userId": args.userId,
            "user_scope": "shared_backend",
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "days": _date_buckets(start_date, end_date, events, todos, plans),
        },
    }


def _tool_get_month_plan(args: GetMonthPlanInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    today = date_type.today()
    start_date = today.replace(day=1)
    if start_date.month == 12:
        next_month = start_date.replace(year=start_date.year + 1, month=1, day=1)
    else:
        next_month = start_date.replace(month=start_date.month + 1, day=1)
    end_date = next_month - timedelta(days=1)
    events = _get_calendar_events_for_range(live_db, start_date, end_date)
    todos = _get_todos_for_range(live_db, start_date, end_date)
    plans = _get_plans_for_range(live_db, start_date, end_date)
    return {
        "tool": "get_month_plan",
        "status": "success",
        "data": {
            "userId": args.userId,
            "user_scope": "shared_backend",
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "days": _date_buckets(start_date, end_date, events, todos, plans),
        },
    }


def _tool_get_work_tasks(args: GetWorkTasksInput, db: Optional[Session]) -> Dict[str, Any]:
    return _placeholder_result(
        "get_work_tasks",
        "The backend does not have a dedicated work-task model or tagging system yet.",
        "TODO: add explicit work-task categorization or a separate work-task model before enabling this tool.",
    )


def _tool_add_reminder(args: AddReminderInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    reminder = TodoTask(
        title=args.title,
        date=args.datetime.date(),
        due_time=args.datetime.time().replace(microsecond=0),
        priority="medium",
        completed=False,
        source=_normalize_reminder_source(args.source),
    )
    live_db.add(reminder)
    live_db.commit()
    live_db.refresh(reminder)
    return {
        "tool": "add_reminder",
        "status": "success",
        "data": {
            "userId": args.userId,
            "reminder": _serialize_todo(reminder),
            "note": "Stored in the existing todo/reminder system.",
        },
    }


def _load_reminder(db: Session, reminder_id: int) -> TodoTask:
    reminder = db.query(TodoTask).filter(TodoTask.id == reminder_id).first()
    if reminder is None or not _is_reminder_task(reminder):
        raise VoiceToolError("Reminder not found.")
    return reminder


def _tool_update_reminder(args: UpdateReminderInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    reminder = _load_reminder(live_db, args.reminderId)
    fields = args.fields
    if fields.title is not None:
        reminder.title = fields.title
    if fields.datetime is not None:
        reminder.date = fields.datetime.date()
        reminder.due_time = fields.datetime.time().replace(microsecond=0)
    if fields.completed is not None:
        reminder.completed = fields.completed
    if fields.source is not None:
        reminder.source = _normalize_reminder_source(fields.source)
    live_db.commit()
    live_db.refresh(reminder)
    return {
        "tool": "update_reminder",
        "status": "success",
        "data": {
            "userId": args.userId,
            "reminder": _serialize_todo(reminder),
        },
    }


def _tool_delete_reminder(args: DeleteReminderInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    reminder = _load_reminder(live_db, args.reminderId)
    live_db.delete(reminder)
    live_db.commit()
    return {
        "tool": "delete_reminder",
        "status": "success",
        "data": {
            "userId": args.userId,
            "deleted_reminder_id": args.reminderId,
        },
    }


def _tool_add_alarm(args: AddAlarmInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    alarm_date = _next_alarm_date(args.time)
    label = args.label.strip() or "Alarm"
    plan_id = f"alarm-plan-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
    segment_id = f"alarm-segment-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
    source = _normalize_alarm_source(args.source)

    plan = upsert_planner_plan(
        PlannerPlanUpsert(
            id=plan_id,
            title=f"Alarm - {label}",
            date=alarm_date,
            source=source,
            segments=[
                PlannerSegmentUpsert(
                    id=segment_id,
                    title=label,
                    start_time=args.time,
                    end_time=None,
                    is_done=False,
                    alarm_at_start=True,
                    alarm_at_end=False,
                )
            ],
        ),
        live_db,
    )

    note_parts: List[str] = [
        "Stored in the shared planner/alarm flow so the app and mirror read the same backend data."
    ]
    if args.repeat:
        note_parts.append("Repeat rules are accepted but not persisted yet.")

    created_alarm = _serialize_alarm(plan, plan.segments[0])
    return {
        "tool": "add_alarm",
        "status": "success",
        "data": {
            "userId": args.userId,
            "alarm": created_alarm,
            "note": " ".join(note_parts),
        },
    }


def _tool_update_alarm(args: UpdateAlarmInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    plan, segment = _load_alarm(live_db, args.alarmId)
    fields = args.fields

    if fields.label is not None:
        cleaned_label = fields.label.strip()
        segment.title = cleaned_label
        plan.title = f"Alarm - {cleaned_label}"
    if fields.time is not None:
        segment.start_time = fields.time
        plan.date = _next_alarm_date(fields.time)
    if fields.source is not None:
        plan.source = _normalize_alarm_source(fields.source)

    live_db.commit()
    live_db.refresh(plan)
    live_db.refresh(segment)

    note = None
    if fields.repeat:
        note = "Repeat rules are not persisted yet in the planner-backed alarm flow."

    return {
        "tool": "update_alarm",
        "status": "success",
        "data": {
            "userId": args.userId,
            "alarm": _serialize_alarm(plan, segment),
            "note": note,
        },
    }


def _tool_delete_alarm(args: DeleteAlarmInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    plan_id, segment_id = _parse_alarm_id(args.alarmId)
    _load_alarm(live_db, args.alarmId)
    delete_planner_segment(plan_id, segment_id, live_db)
    return {
        "tool": "delete_alarm",
        "status": "success",
        "data": {
            "userId": args.userId,
            "deleted_alarm_id": args.alarmId,
        },
    }


def _tool_get_next_alarm(args: GetNextAlarmInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    upcoming = _next_upcoming_alarm(live_db)
    return {
        "tool": "get_next_alarm",
        "status": "success",
        "data": {
            "userId": args.userId,
            "next_alarm": _serialize_alarm(*upcoming) if upcoming else None,
        },
    }


def _tool_summarize_user_day(args: SummarizeUserDayInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    payload = _today_plan_payload(live_db, args.userId)
    event_count = len(payload["calendar_events"])
    todo_count = len(payload["todos"])
    next_event = payload["next_event"]
    next_todo = payload["next_todo"]

    parts = [f"You have {event_count} calendar item(s) and {todo_count} todo/reminder item(s) today."]
    if next_event:
        parts.append(f"Next event: {next_event['title']} at {next_event['start_time']}.")
    if next_todo:
        due_time = next_todo.get("due_time") or "no set time"
        parts.append(f"Next todo: {next_todo['title']} at {due_time}.")
    return {
        "tool": "summarize_user_day",
        "status": "success",
        "data": {
            "userId": args.userId,
            "summary": " ".join(parts),
            "details": payload,
        },
    }


def _current_control_state() -> Dict[str, Any]:
    state = get_state()
    return {
        "screen_name": state.get("screen_name"),
        "brightness_level": state.get("brightness_level"),
        "volume_level": state.get("volume_level"),
        "sleeping": state.get("sleeping"),
        "control_updated_at": state.get("control_updated_at"),
    }


def _tool_mirror_set_screen(args: MirrorSetScreenInput, db: Optional[Session]) -> Dict[str, Any]:
    update_state({"screen_name": args.screenName, "sleeping": False})
    return {
        "tool": "mirror_set_screen",
        "status": "success",
        "data": _current_control_state(),
    }


def _tool_mirror_set_brightness(args: LevelInput, db: Optional[Session]) -> Dict[str, Any]:
    update_state({"brightness_level": args.level})
    return {
        "tool": "mirror_set_brightness",
        "status": "success",
        "data": _current_control_state(),
    }


def _tool_mirror_set_volume(args: LevelInput, db: Optional[Session]) -> Dict[str, Any]:
    update_state({"volume_level": args.level})
    return {
        "tool": "mirror_set_volume",
        "status": "success",
        "data": _current_control_state(),
    }


def _tool_mirror_sleep(args: MirrorSleepInput, db: Optional[Session]) -> Dict[str, Any]:
    update_state({"sleeping": True})
    return {
        "tool": "mirror_sleep",
        "status": "success",
        "data": _current_control_state(),
    }


def _tool_mirror_wake(args: MirrorWakeInput, db: Optional[Session]) -> Dict[str, Any]:
    update_state({"sleeping": False})
    return {
        "tool": "mirror_wake",
        "status": "success",
        "data": _current_control_state(),
    }


def _tool_mirror_show_today(args: MirrorShowTodayInput, db: Optional[Session]) -> Dict[str, Any]:
    return _tool_mirror_set_screen(MirrorSetScreenInput(screenName="today"), db)


def _tool_mirror_show_calendar(args: MirrorShowCalendarInput, db: Optional[Session]) -> Dict[str, Any]:
    return _tool_mirror_set_screen(MirrorSetScreenInput(screenName="calendar"), db)


def _tool_mirror_show_weather(args: MirrorShowWeatherInput, db: Optional[Session]) -> Dict[str, Any]:
    return _tool_mirror_set_screen(MirrorSetScreenInput(screenName="weather"), db)


def _tool_mirror_show_sensors(args: MirrorShowSensorsInput, db: Optional[Session]) -> Dict[str, Any]:
    return _tool_mirror_set_screen(MirrorSetScreenInput(screenName="sensors"), db)


def _tool_media_play(args: MediaPlayInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    state = _get_or_create_now_playing_state(live_db)
    if not state.title and not state.track_url:
        return _placeholder_result(
            "media_play",
            "No media item is loaded in the existing now-playing state.",
            "TODO: attach a playback queue or active media launcher before using play with an empty state.",
        )
    state.is_playing = True
    live_db.commit()
    live_db.refresh(state)
    return {
        "tool": "media_play",
        "status": "success",
        "data": _serialize_now_playing_state(state),
    }


def _tool_media_pause(args: MediaPauseInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    state = _get_or_create_now_playing_state(live_db)
    state.is_playing = False
    live_db.commit()
    live_db.refresh(state)
    return {
        "tool": "media_pause",
        "status": "success",
        "data": _serialize_now_playing_state(state),
    }


def _tool_media_stop(args: MediaStopInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    state = _get_or_create_now_playing_state(live_db)
    state.title = None
    state.artist = None
    state.album = None
    state.source = "other"
    state.is_playing = False
    state.progress_seconds = 0
    state.duration_seconds = None
    state.artwork_url = None
    state.track_url = None
    live_db.commit()
    live_db.refresh(state)
    return {
        "tool": "media_stop",
        "status": "success",
        "data": _serialize_now_playing_state(state),
    }


def _tool_media_next(args: MediaNextInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    state = _get_or_create_now_playing_state(live_db)
    if state.source != "youtube" or not state.track_url:
        return _placeholder_result(
            "media_next",
            "The current backend can only advance to a related item when YouTube playback is active.",
            "TODO: add playback queue/history support for non-YouTube sources.",
        )

    suggestion = find_related_youtube_video(state.track_url, exclude_urls=[state.track_url])
    if suggestion is None:
        raise VoiceToolError("No next YouTube video was found.")

    state.title = suggestion.title or state.title
    state.artist = None
    state.album = None
    state.source = "youtube"
    state.is_playing = True
    state.progress_seconds = 0
    state.duration_seconds = None
    state.artwork_url = suggestion.thumbnail_url or state.artwork_url
    state.track_url = suggestion.watch_url
    live_db.commit()
    live_db.refresh(state)
    return {
        "tool": "media_next",
        "status": "success",
        "data": _serialize_now_playing_state(state),
    }


def _tool_media_previous(args: MediaPreviousInput, db: Optional[Session]) -> Dict[str, Any]:
    return _placeholder_result(
        "media_previous",
        "The backend does not keep a playback history yet.",
        "TODO: add playback history or queue state before enabling previous-track navigation.",
    )


def _tool_media_search(args: MediaSearchInput, db: Optional[Session]) -> Dict[str, Any]:
    results = search_youtube_videos(args.query, limit=5)
    return {
        "tool": "media_search",
        "status": "success",
        "data": {
            "query": args.query,
            "provider": "youtube",
            "results": [
                {
                    "watch_url": item.watch_url,
                    "title": item.title,
                    "thumbnail_url": item.thumbnail_url,
                    "duration_seconds": item.duration_seconds,
                }
                for item in results
            ],
        },
    }


def _tool_media_open_youtube(args: MediaOpenYoutubeInput, db: Optional[Session]) -> Dict[str, Any]:
    return _tool_mirror_set_screen(MirrorSetScreenInput(screenName="youtube"), db)


def _tool_media_set_volume(args: MediaSetVolumeInput, db: Optional[Session]) -> Dict[str, Any]:
    return _tool_mirror_set_volume(LevelInput(level=args.level), db)


def _tool_phone_send_notification(args: PhoneSendNotificationInput, db: Optional[Session]) -> Dict[str, Any]:
    return _placeholder_result(
        "phone_send_notification",
        "Backend push delivery is not configured yet.",
        "TODO: connect this tool to FCM/APNs. Until then, the Android app uses its local HaloMirrorCoordinationNotifier confirmation path.",
    )


def _tool_phone_create_alarm(args: PhoneCreateAlarmInput, db: Optional[Session]) -> Dict[str, Any]:
    result = _tool_add_alarm(
        AddAlarmInput(
            userId=args.userId,
            time=args.time,
            label=args.label,
            repeat=args.repeat,
            source="phone_app",
        ),
        db,
    )
    result["tool"] = "phone_create_alarm"
    return result


def _tool_phone_sync_plans(args: PhoneSyncPlansInput, db: Optional[Session]) -> Dict[str, Any]:
    live_db = _require_db(db)
    snapshot = _today_plan_payload(live_db, args.userId)
    return {
        "tool": "phone_sync_plans",
        "status": "placeholder",
        "message": "Phone push sync is not implemented yet. Returning a pull-style snapshot instead.",
        "todo": "TODO: add a real phone sync transport before enabling background sync.",
        "data": snapshot,
    }


def _tool_phone_send_command_to_mirror(
    args: PhoneSendCommandToMirrorInput,
    db: Optional[Session],
) -> Dict[str, Any]:
    dispatch = {
        "show_today": lambda: _tool_mirror_show_today(MirrorShowTodayInput(), db),
        "show_calendar": lambda: _tool_mirror_show_calendar(MirrorShowCalendarInput(), db),
        "show_weather": lambda: _tool_mirror_show_weather(MirrorShowWeatherInput(), db),
        "show_sensors": lambda: _tool_mirror_show_sensors(MirrorShowSensorsInput(), db),
        "open_youtube": lambda: _tool_media_open_youtube(MediaOpenYoutubeInput(), db),
        "sleep": lambda: _tool_mirror_sleep(MirrorSleepInput(), db),
        "wake": lambda: _tool_mirror_wake(MirrorWakeInput(), db),
        "media_play": lambda: _tool_media_play(MediaPlayInput(), db),
        "media_pause": lambda: _tool_media_pause(MediaPauseInput(), db),
        "media_stop": lambda: _tool_media_stop(MediaStopInput(), db),
        "media_next": lambda: _tool_media_next(MediaNextInput(), db),
    }
    result = dispatch[args.command]()
    result["phone_user_id"] = args.userId
    return result


def _tool_get_current_sensor_data(args: GetCurrentSensorDataInput, db: Optional[Session]) -> Dict[str, Any]:
    state = get_state()
    return {
        "tool": "get_current_sensor_data",
        "status": "success",
        "data": {
            "temperature": state.get("temperature"),
            "humidity": state.get("humidity"),
            "pressure": state.get("pressure"),
            "motion": state.get("motion"),
            "gesture": state.get("gesture"),
            "mirror_state_updated_at": state.get("mirror_state_updated_at"),
        },
    }


def _tool_get_temperature(args: GetTemperatureInput, db: Optional[Session]) -> Dict[str, Any]:
    return {
        "tool": "get_temperature",
        "status": "success",
        "data": {"temperature": get_state().get("temperature")},
    }


def _tool_get_humidity(args: GetHumidityInput, db: Optional[Session]) -> Dict[str, Any]:
    return {
        "tool": "get_humidity",
        "status": "success",
        "data": {"humidity": get_state().get("humidity")},
    }


def _tool_get_pressure(args: GetPressureInput, db: Optional[Session]) -> Dict[str, Any]:
    return {
        "tool": "get_pressure",
        "status": "success",
        "data": {"pressure": get_state().get("pressure")},
    }


VOICE_TOOL_SPECS: List[VoiceToolSpec] = [
    VoiceToolSpec("get_today_plan", "Get today's plan from the shared backend calendar, todo, and planner data.", GetTodayPlanInput, _tool_get_today_plan, requires_db=True),
    VoiceToolSpec("get_week_plan", "Get the current week's plan from the shared backend calendar, todo, and planner data.", GetWeekPlanInput, _tool_get_week_plan, requires_db=True),
    VoiceToolSpec("get_month_plan", "Get the current month's plan from the shared backend calendar, todo, and planner data.", GetMonthPlanInput, _tool_get_month_plan, requires_db=True),
    VoiceToolSpec("get_work_tasks", "Get work tasks for a user.", GetWorkTasksInput, _tool_get_work_tasks),
    VoiceToolSpec("add_reminder", "Add a reminder using the existing todo/reminder storage.", AddReminderInput, _tool_add_reminder, requires_db=True),
    VoiceToolSpec("update_reminder", "Update an existing reminder stored in the todo/reminder system.", UpdateReminderInput, _tool_update_reminder, requires_db=True),
    VoiceToolSpec("delete_reminder", "Delete an existing reminder stored in the todo/reminder system.", DeleteReminderInput, _tool_delete_reminder, requires_db=True),
    VoiceToolSpec("add_alarm", "Add an alarm for a user.", AddAlarmInput, _tool_add_alarm),
    VoiceToolSpec("update_alarm", "Update an alarm for a user.", UpdateAlarmInput, _tool_update_alarm),
    VoiceToolSpec("delete_alarm", "Delete an alarm for a user.", DeleteAlarmInput, _tool_delete_alarm),
    VoiceToolSpec("get_next_alarm", "Get the next alarm for a user.", GetNextAlarmInput, _tool_get_next_alarm),
    VoiceToolSpec("summarize_user_day", "Summarize today's user schedule and todos.", SummarizeUserDayInput, _tool_summarize_user_day, requires_db=True),
    VoiceToolSpec("mirror_set_screen", "Switch the mirror to an allowlisted screen.", MirrorSetScreenInput, _tool_mirror_set_screen),
    VoiceToolSpec("mirror_set_brightness", "Set mirror brightness from 0 to 100.", LevelInput, _tool_mirror_set_brightness),
    VoiceToolSpec("mirror_set_volume", "Set mirror volume from 0 to 100.", LevelInput, _tool_mirror_set_volume),
    VoiceToolSpec("mirror_sleep", "Put the mirror into sleep mode.", MirrorSleepInput, _tool_mirror_sleep),
    VoiceToolSpec("mirror_wake", "Wake the mirror from sleep mode.", MirrorWakeInput, _tool_mirror_wake),
    VoiceToolSpec("mirror_show_today", "Show the today screen on the mirror.", MirrorShowTodayInput, _tool_mirror_show_today),
    VoiceToolSpec("mirror_show_calendar", "Show the calendar screen on the mirror.", MirrorShowCalendarInput, _tool_mirror_show_calendar),
    VoiceToolSpec("mirror_show_weather", "Show the weather screen on the mirror.", MirrorShowWeatherInput, _tool_mirror_show_weather),
    VoiceToolSpec("mirror_show_sensors", "Show the sensors screen on the mirror.", MirrorShowSensorsInput, _tool_mirror_show_sensors),
    VoiceToolSpec("media_play", "Resume the current media item if one is already loaded.", MediaPlayInput, _tool_media_play, requires_db=True),
    VoiceToolSpec("media_pause", "Pause the current media item.", MediaPauseInput, _tool_media_pause, requires_db=True),
    VoiceToolSpec("media_stop", "Stop and clear the current media item.", MediaStopInput, _tool_media_stop, requires_db=True),
    VoiceToolSpec("media_next", "Advance to the next related YouTube item when YouTube playback is active.", MediaNextInput, _tool_media_next, requires_db=True),
    VoiceToolSpec("media_previous", "Go to the previous media item.", MediaPreviousInput, _tool_media_previous),
    VoiceToolSpec("media_search", "Search YouTube safely for media items.", MediaSearchInput, _tool_media_search),
    VoiceToolSpec("media_open_youtube", "Open the YouTube screen on the mirror.", MediaOpenYoutubeInput, _tool_media_open_youtube),
    VoiceToolSpec("media_set_volume", "Set media volume from 0 to 100.", MediaSetVolumeInput, _tool_media_set_volume),
    VoiceToolSpec("phone_send_notification", "Send a notification to the phone app.", PhoneSendNotificationInput, _tool_phone_send_notification),
    VoiceToolSpec("phone_create_alarm", "Create a phone alarm.", PhoneCreateAlarmInput, _tool_phone_create_alarm),
    VoiceToolSpec("phone_sync_plans", "Sync plans to the phone app.", PhoneSyncPlansInput, _tool_phone_sync_plans, requires_db=True),
    VoiceToolSpec("phone_send_command_to_mirror", "Send an allowlisted command from the phone app to the mirror.", PhoneSendCommandToMirrorInput, _tool_phone_send_command_to_mirror, requires_db=True),
    VoiceToolSpec("get_current_sensor_data", "Get the current sensor data from the runtime state store.", GetCurrentSensorDataInput, _tool_get_current_sensor_data),
    VoiceToolSpec("get_temperature", "Get the current temperature sensor reading.", GetTemperatureInput, _tool_get_temperature),
    VoiceToolSpec("get_humidity", "Get the current humidity sensor reading.", GetHumidityInput, _tool_get_humidity),
    VoiceToolSpec("get_pressure", "Get the current pressure sensor reading.", GetPressureInput, _tool_get_pressure),
]

VOICE_TOOL_REGISTRY: Dict[str, VoiceToolSpec] = {
    spec.name: spec for spec in VOICE_TOOL_SPECS
}


def get_voice_tool_definitions() -> List[Dict[str, Any]]:
    return [
        {
            "type": "function",
            "name": spec.name,
            "description": spec.description,
            "parameters": spec.input_model.model_json_schema(),
        }
        for spec in VOICE_TOOL_SPECS
    ]


def execute_voice_tool(
    tool_name: str,
    arguments: Optional[Dict[str, Any]] = None,
    *,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    spec = VOICE_TOOL_REGISTRY.get(tool_name)
    if spec is None:
        raise VoiceToolNotFoundError(f"Unknown voice tool: {tool_name}")

    if spec.requires_db and db is None:
        raise VoiceToolError(f"Tool '{tool_name}' requires a database session.")

    try:
        validated_args = spec.input_model.model_validate(arguments or {})
    except ValidationError as exc:
        raise VoiceToolValidationError(str(exc)) from exc

    return spec.handler(validated_args, db)
