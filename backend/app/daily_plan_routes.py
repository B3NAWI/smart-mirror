from datetime import date as date_type
from datetime import datetime, time
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from .auth import require_api_key
from .calendar_routes import get_events_for_date
from .database import get_db
from .models import CalendarEvent, TodoTask
from .schemas import DailyPlanResponse, SeedCalendarResponse
from .todo_routes import get_todos_for_date

router = APIRouter(tags=["daily-plan"])


def _is_planner_block(event) -> bool:
    source = getattr(event, "source", "")
    if source == "planner_block":
        return True
    return source == "mobile" and bool(getattr(event, "description", None))


def _select_next_event(target_date: date_type, events):
    if not events:
        return None

    if target_date != date_type.today():
        return next((event for event in events if not (_is_planner_block(event) and event.completed)), events[0])

    now = datetime.now()
    for event in events:
        if _is_planner_block(event) and event.completed:
            continue
        if event.start_time >= now:
            return event
        if event.end_time and event.end_time >= now:
            return event
    return None


def _select_next_todo(todos):
    for todo in todos:
        if not todo.completed:
            return todo
    return None


@router.get("/api/daily-plan", response_model=DailyPlanResponse)
def get_daily_plan(
    date: Optional[date_type] = Query(None),
    db: Session = Depends(get_db),
):
    target_date = date or date_type.today()
    calendar_events = get_events_for_date(db, target_date)
    todos = get_todos_for_date(db, target_date)
    incomplete_todos = [todo for todo in todos if not todo.completed]
    planner_blocks = [event for event in calendar_events if _is_planner_block(event)]
    incomplete_planner_blocks = [event for event in planner_blocks if not event.completed]

    return DailyPlanResponse(
        date=target_date,
        calendar_events=calendar_events,
        todos=todos,
        completed_todos_count=sum(1 for todo in todos if todo.completed) + sum(1 for event in planner_blocks if event.completed),
        remaining_todos_count=len(incomplete_todos) + len(incomplete_planner_blocks),
        high_priority_count=sum(
            1 for todo in incomplete_todos if todo.priority == "high"
        ),
        next_event=_select_next_event(target_date, calendar_events),
        next_todo=_select_next_todo(todos),
    )


@router.post(
    "/api/dev/seed-calendar",
    response_model=SeedCalendarResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
def seed_calendar_and_todos(db: Session = Depends(get_db)):
    today = date_type.today()
    start_of_day = datetime.combine(today, time(9, 0))

    sample_events = [
        {
            "title": "Morning Standup",
            "description": "Quick sync with the HALO MIRROR team.",
            "start_time": start_of_day,
            "end_time": datetime.combine(today, time(9, 30)),
            "location": "Home Office",
            "source": "seed",
        },
        {
            "title": "Doctor Appointment",
            "description": "Bring insurance card.",
            "start_time": datetime.combine(today, time(13, 0)),
            "end_time": datetime.combine(today, time(13, 45)),
            "location": "City Clinic",
            "source": "seed",
        },
        {
            "title": "Dinner with Family",
            "description": "Pick up dessert on the way.",
            "start_time": datetime.combine(today, time(19, 0)),
            "end_time": datetime.combine(today, time(20, 30)),
            "location": "Downtown",
            "source": "seed",
        },
    ]

    sample_todos = [
        {
            "title": "Refill vitamins",
            "description": "Check the bathroom cabinet first.",
            "date": today,
            "due_time": time(10, 0),
            "priority": "medium",
            "completed": False,
            "source": "seed",
        },
        {
            "title": "Prepare Raspberry Pi backup",
            "description": "Copy the latest dashboard config.",
            "date": today,
            "due_time": time(15, 30),
            "priority": "high",
            "completed": False,
            "source": "seed",
        },
        {
            "title": "Water the plants",
            "description": None,
            "date": today,
            "due_time": None,
            "priority": "low",
            "completed": True,
            "source": "seed",
        },
    ]

    events_created = 0
    for event_payload in sample_events:
        existing_event = (
            db.query(CalendarEvent)
            .filter(CalendarEvent.title == event_payload["title"])
            .filter(CalendarEvent.start_time == event_payload["start_time"])
            .filter(CalendarEvent.source == "seed")
            .first()
        )
        if existing_event is None:
            db.add(CalendarEvent(**event_payload))
            events_created += 1

    todos_created = 0
    for todo_payload in sample_todos:
        existing_todo = (
            db.query(TodoTask)
            .filter(TodoTask.title == todo_payload["title"])
            .filter(TodoTask.date == todo_payload["date"])
            .filter(TodoTask.source == "seed")
            .first()
        )
        if existing_todo is None:
            db.add(TodoTask(**todo_payload))
            todos_created += 1

    db.commit()

    seeded_events = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.source == "seed")
        .filter(CalendarEvent.start_time >= datetime.combine(today, time.min))
        .filter(CalendarEvent.start_time < datetime.combine(today, time.max))
        .order_by(CalendarEvent.start_time.asc(), CalendarEvent.id.asc())
        .all()
    )
    seeded_todos = get_todos_for_date(db, today)
    seeded_todos = [todo for todo in seeded_todos if todo.source == "seed"]

    return SeedCalendarResponse(
        date=today,
        events_created=events_created,
        todos_created=todos_created,
        calendar_events=seeded_events,
        todos=seeded_todos,
        message="Sample calendar events and todos created for today.",
    )
