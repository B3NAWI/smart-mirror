from __future__ import annotations

from datetime import date as date_type
from datetime import datetime, time as time_type, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import CalendarEvent, NowPlayingState, TodoTask, UserPreference

REMINDER_SOURCE_PREFIX = "reminder:"


def get_or_create_user_preference(
    db: Session,
    user_id: str,
    account_name: str | None = None,
) -> UserPreference:
    preference = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    if preference is not None:
        if account_name and not preference.preferred_name:
            preference.preferred_name = account_name
            db.commit()
            db.refresh(preference)
        return preference

    preference = UserPreference(
        user_id=user_id,
        preferred_name=account_name or "",
    )
    db.add(preference)
    db.commit()
    db.refresh(preference)
    return preference


def create_calendar_event_record(
    db: Session,
    *,
    title: str,
    start_datetime: datetime,
    end_datetime: datetime | None = None,
    notes: str | None = None,
    source: str = "voice",
) -> CalendarEvent:
    event = CalendarEvent(
        title=title,
        start_time=start_datetime,
        end_time=end_datetime,
        description=notes,
        source=source,
        completed=False,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def list_calendar_event_records(
    db: Session,
    *,
    target_date: date_type | None = None,
    start_datetime: datetime | None = None,
    end_datetime: datetime | None = None,
    limit: int = 20,
) -> list[CalendarEvent]:
    query = db.query(CalendarEvent)

    if target_date is not None:
        start_bound = datetime.combine(target_date, time_type.min)
        end_bound = start_bound + timedelta(days=1)
        query = query.filter(CalendarEvent.start_time < end_bound).filter(
            (CalendarEvent.end_time.is_(None)) | (CalendarEvent.end_time >= start_bound)
        )

    if start_datetime is not None:
        query = query.filter(
            (CalendarEvent.end_time.is_(None)) | (CalendarEvent.end_time >= start_datetime)
        )

    if end_datetime is not None:
        query = query.filter(CalendarEvent.start_time <= end_datetime)

    return query.order_by(CalendarEvent.start_time.asc(), CalendarEvent.id.asc()).limit(limit).all()


def find_calendar_event(
    db: Session,
    *,
    event_id: int | None = None,
    title_query: str | None = None,
) -> CalendarEvent | None:
    if event_id is not None:
        return db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()

    if title_query:
        normalized = title_query.strip().lower()
        events = db.query(CalendarEvent).order_by(CalendarEvent.start_time.asc(), CalendarEvent.id.asc()).all()
        for event in events:
            if normalized in (event.title or "").lower():
                return event
    return None


def delete_calendar_event_record(db: Session, event: CalendarEvent) -> int:
    event_id = event.id
    db.delete(event)
    db.commit()
    return event_id


def _normalize_reminder_source(source: str) -> str:
    cleaned = str(source or "").strip().lower() or "voice"
    return f"{REMINDER_SOURCE_PREFIX}{cleaned}"[:50]


def _is_reminder_task(todo: TodoTask) -> bool:
    return (todo.source or "").startswith(REMINDER_SOURCE_PREFIX)


def create_reminder_record(
    db: Session,
    *,
    title: str,
    remind_at: datetime | None = None,
    notes: str | None = None,
    source: str = "voice",
) -> TodoTask:
    reminder = TodoTask(
        title=title,
        description=notes,
        date=(remind_at or datetime.now()).date(),
        due_time=(remind_at.time().replace(microsecond=0) if remind_at else None),
        priority="medium",
        completed=False,
        source=_normalize_reminder_source(source),
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    return reminder


def list_reminder_records(
    db: Session,
    *,
    target_date: date_type | None = None,
    limit: int = 20,
) -> list[TodoTask]:
    query = db.query(TodoTask)
    if target_date is not None:
        query = query.filter(TodoTask.date == target_date)
    reminders = query.order_by(TodoTask.date.asc(), TodoTask.due_time.asc(), TodoTask.id.asc()).limit(limit).all()
    return [reminder for reminder in reminders if _is_reminder_task(reminder)]


def find_reminder_record(
    db: Session,
    *,
    reminder_id: int | None = None,
    title_query: str | None = None,
) -> TodoTask | None:
    if reminder_id is not None:
        reminder = db.query(TodoTask).filter(TodoTask.id == reminder_id).first()
        return reminder if reminder and _is_reminder_task(reminder) else None

    if title_query:
        normalized = title_query.strip().lower()
        reminders = db.query(TodoTask).order_by(TodoTask.date.asc(), TodoTask.id.asc()).all()
        for reminder in reminders:
            if _is_reminder_task(reminder) and normalized in (reminder.title or "").lower():
                return reminder
    return None


def delete_reminder_record(db: Session, reminder: TodoTask) -> int:
    reminder_id = reminder.id
    db.delete(reminder)
    db.commit()
    return reminder_id


def get_or_create_now_playing_state(db: Session) -> NowPlayingState:
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

