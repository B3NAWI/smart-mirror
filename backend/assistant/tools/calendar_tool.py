from __future__ import annotations

from datetime import date as date_type
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from assistant.storage import (
    create_calendar_event_record,
    delete_calendar_event_record,
    find_calendar_event,
    list_calendar_event_records,
)


def _serialize_event(event) -> dict:
    return {
        "id": event.id,
        "title": event.title,
        "start_datetime": event.start_time.isoformat(),
        "end_datetime": event.end_time.isoformat() if event.end_time else None,
        "notes": event.description,
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


def create_calendar_event(
    db: Session,
    *,
    title: str,
    start_datetime: datetime,
    end_datetime: datetime | None = None,
    notes: str | None = None,
) -> dict:
    final_end = end_datetime or (start_datetime + timedelta(hours=1))
    event = create_calendar_event_record(
        db,
        title=title,
        start_datetime=start_datetime,
        end_datetime=final_end,
        notes=notes,
        source="voice",
    )
    reply_time = event.start_time.strftime("%I:%M %p").lstrip("0")
    return {
        "tool": "create_calendar_event",
        "reply": f"Added {event.title} for {reply_time}.",
        "data": {"event": _serialize_event(event)},
    }


def list_calendar_events(
    db: Session,
    *,
    target_date: date_type | None = None,
) -> dict:
    events = list_calendar_event_records(db, target_date=target_date or date_type.today(), limit=10)
    return {
        "tool": "list_calendar_events",
        "reply": f"You have {len(events)} event{'s' if len(events) != 1 else ''}.",
        "data": {
            "events": [_serialize_event(event) for event in events],
        },
    }


def delete_calendar_event(
    db: Session,
    *,
    event_id: int | None = None,
    title_query: str | None = None,
) -> dict:
    event = find_calendar_event(db, event_id=event_id, title_query=title_query)
    if event is None:
        return {
            "tool": "delete_calendar_event",
            "reply": "I couldn't find that event.",
            "data": {},
        }
    deleted_id = delete_calendar_event_record(db, event)
    return {
        "tool": "delete_calendar_event",
        "reply": f"Deleted {event.title}.",
        "data": {"id": deleted_id, "title": event.title},
    }

