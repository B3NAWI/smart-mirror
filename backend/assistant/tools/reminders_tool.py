from __future__ import annotations

from datetime import date as date_type
from datetime import datetime

from sqlalchemy.orm import Session

from assistant.storage import (
    create_reminder_record,
    delete_reminder_record,
    find_reminder_record,
    list_reminder_records,
)


def _serialize_reminder(reminder) -> dict:
    remind_at = None
    if reminder.date and reminder.due_time:
        remind_at = datetime.combine(reminder.date, reminder.due_time).isoformat()
    return {
        "id": reminder.id,
        "title": reminder.title,
        "remind_at": remind_at,
        "notes": reminder.description,
        "created_at": reminder.created_at.isoformat() if reminder.created_at else None,
    }


def create_reminder(
    db: Session,
    *,
    title: str,
    remind_at: datetime | None = None,
    notes: str | None = None,
) -> dict:
    reminder = create_reminder_record(
        db,
        title=title,
        remind_at=remind_at,
        notes=notes,
        source="voice",
    )
    return {
        "tool": "create_reminder",
        "reply": f"Added reminder for {reminder.title}.",
        "data": {"reminder": _serialize_reminder(reminder)},
    }


def list_reminders(
    db: Session,
    *,
    target_date: date_type | None = None,
) -> dict:
    reminders = list_reminder_records(db, target_date=target_date, limit=10)
    return {
        "tool": "list_reminders",
        "reply": f"You have {len(reminders)} reminder{'s' if len(reminders) != 1 else ''}.",
        "data": {"reminders": [_serialize_reminder(reminder) for reminder in reminders]},
    }


def delete_reminder(
    db: Session,
    *,
    reminder_id: int | None = None,
    title_query: str | None = None,
) -> dict:
    reminder = find_reminder_record(db, reminder_id=reminder_id, title_query=title_query)
    if reminder is None:
        return {
            "tool": "delete_reminder",
            "reply": "I couldn't find that reminder.",
            "data": {},
        }
    deleted_id = delete_reminder_record(db, reminder)
    return {
        "tool": "delete_reminder",
        "reply": f"Deleted {reminder.title}.",
        "data": {"id": deleted_id, "title": reminder.title},
    }

