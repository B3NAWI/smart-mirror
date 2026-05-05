from datetime import date as date_type
from datetime import datetime, time, timedelta
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .auth import require_api_key
from .database import get_db
from .models import CalendarEvent
from .schemas import (
    CalendarEventCreate,
    CalendarEventRead,
    CalendarEventUpdate,
    DeleteResponse,
)

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


def _validate_event_times(start_time: datetime, end_time: Optional[datetime]) -> None:
    if end_time and end_time < start_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_time cannot be before start_time",
        )


def _normalize_filter_datetime(value: Optional[datetime]) -> Optional[datetime]:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone().replace(tzinfo=None)


def _date_range(target_date: date_type) -> Tuple[datetime, datetime]:
    day_start = datetime.combine(target_date, time.min)
    day_end = day_start + timedelta(days=1)
    return day_start, day_end


def get_events_for_date(db: Session, target_date: date_type) -> List[CalendarEvent]:
    day_start, day_end = _date_range(target_date)
    return (
        db.query(CalendarEvent)
        .filter(CalendarEvent.start_time < day_end)
        .filter(
            (CalendarEvent.end_time.is_(None)) | (CalendarEvent.end_time >= day_start)
        )
        .order_by(CalendarEvent.start_time.asc(), CalendarEvent.id.asc())
        .all()
    )


@router.get("", response_model=List[CalendarEventRead])
def list_calendar_events(
    date: Optional[date_type] = Query(None),
    from_: Optional[datetime] = Query(None, alias="from"),
    to: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
):
    from_ = _normalize_filter_datetime(from_)
    to = _normalize_filter_datetime(to)

    if from_ and to and to < from_:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'to' cannot be before 'from'",
        )

    query = db.query(CalendarEvent)

    if date:
        day_start, day_end = _date_range(date)
        query = query.filter(CalendarEvent.start_time < day_end).filter(
            (CalendarEvent.end_time.is_(None)) | (CalendarEvent.end_time >= day_start)
        )

    if from_:
        query = query.filter(
            (CalendarEvent.end_time.is_(None)) | (CalendarEvent.end_time >= from_)
        )

    if to:
        query = query.filter(CalendarEvent.start_time <= to)

    return query.order_by(CalendarEvent.start_time.asc(), CalendarEvent.id.asc()).all()


@router.get("/today", response_model=List[CalendarEventRead])
def list_today_calendar_events(db: Session = Depends(get_db)):
    return get_events_for_date(db, date_type.today())


@router.post(
    "",
    response_model=CalendarEventRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
def create_calendar_event(payload: CalendarEventCreate, db: Session = Depends(get_db)):
    _validate_event_times(payload.start_time, payload.end_time)

    event = CalendarEvent(**payload.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.patch(
    "/{event_id}",
    response_model=CalendarEventRead,
    dependencies=[Depends(require_api_key)],
)
def update_calendar_event(
    event_id: int,
    payload: CalendarEventUpdate,
    db: Session = Depends(get_db),
):
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar event not found",
        )

    updates = payload.model_dump(exclude_unset=True)
    for field_name, value in updates.items():
        setattr(event, field_name, value)

    _validate_event_times(event.start_time, event.end_time)

    db.commit()
    db.refresh(event)
    return event


@router.delete(
    "/{event_id}",
    response_model=DeleteResponse,
    dependencies=[Depends(require_api_key)],
)
def delete_calendar_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar event not found",
        )

    db.delete(event)
    db.commit()
    return DeleteResponse(status="deleted", id=event_id)
