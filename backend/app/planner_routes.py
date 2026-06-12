from datetime import date as date_type
from datetime import datetime, time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .auth import require_api_key
from .database import get_db
from .models import CalendarEvent, PlannerPlan, PlannerSegment
from .schemas import (
    DeleteResponse,
    PlannerPlanRead,
    PlannerPlanUpsert,
    PlannerSegmentRead,
    PlannerSegmentUpdate,
)

router = APIRouter(prefix="/api/planner", tags=["planner"])


def _build_event_title(plan_title: str, segment_title: str) -> str:
    cleaned_plan_title = plan_title.strip()
    cleaned_segment_title = segment_title.strip()
    if cleaned_plan_title.lower() == cleaned_segment_title.lower():
        return cleaned_plan_title
    return f"{cleaned_plan_title} - {cleaned_segment_title}"


def _build_segment_start(date_value: date_type, start_time: time) -> datetime:
    return datetime.combine(date_value, start_time)


def _build_segment_end(date_value: date_type, end_time: Optional[time]) -> Optional[datetime]:
    if end_time is None:
        return None
    return datetime.combine(date_value, end_time)


def _load_plan(db: Session, plan_id: str) -> PlannerPlan:
    plan = db.query(PlannerPlan).filter(PlannerPlan.id == plan_id).first()
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Planner plan not found",
        )
    return plan


def _load_segment(db: Session, plan_id: str, segment_id: str) -> PlannerSegment:
    segment = (
        db.query(PlannerSegment)
        .filter(PlannerSegment.plan_id == plan_id, PlannerSegment.id == segment_id)
        .first()
    )
    if segment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Planner segment not found",
        )
    return segment


def _delete_calendar_event(db: Session, event_id: Optional[str]) -> None:
    if not event_id:
        return
    try:
        numeric_id = int(event_id)
    except (TypeError, ValueError):
        return

    event = db.query(CalendarEvent).filter(CalendarEvent.id == numeric_id).first()
    if event is not None:
        db.delete(event)


def _sync_segment_event(db: Session, plan: PlannerPlan, segment: PlannerSegment) -> None:
    event: Optional[CalendarEvent] = None
    if segment.backend_event_id:
        try:
            numeric_id = int(segment.backend_event_id)
        except (TypeError, ValueError):
            numeric_id = None
        if numeric_id is not None:
            event = db.query(CalendarEvent).filter(CalendarEvent.id == numeric_id).first()

    if event is None:
        event = CalendarEvent(
            title=_build_event_title(plan.title, segment.title),
            description=plan.title,
            start_time=_build_segment_start(plan.date, segment.start_time),
            end_time=_build_segment_end(plan.date, segment.end_time),
            completed=segment.is_done,
            source="planner_block",
        )
        db.add(event)
        db.flush()
        segment.backend_event_id = str(event.id)
        return

    event.title = _build_event_title(plan.title, segment.title)
    event.description = plan.title
    event.start_time = _build_segment_start(plan.date, segment.start_time)
    event.end_time = _build_segment_end(plan.date, segment.end_time)
    event.completed = segment.is_done
    event.source = "planner_block"


def _serialize_segment(segment: PlannerSegment) -> PlannerSegmentRead:
    return PlannerSegmentRead(
        id=segment.id,
        title=segment.title,
        start_time=segment.start_time,
        end_time=segment.end_time,
        is_done=segment.is_done,
        backend_event_id=segment.backend_event_id or "",
        alarm_at_start=segment.alarm_at_start,
        alarm_at_end=segment.alarm_at_end,
        created_at=segment.created_at,
        updated_at=segment.updated_at,
    )


def _serialize_plan(plan: PlannerPlan) -> PlannerPlanRead:
    ordered_segments = sorted(
        plan.segments,
        key=lambda segment: (segment.start_time, segment.id),
    )
    return PlannerPlanRead(
        id=plan.id,
        title=plan.title,
        date=plan.date,
        source=plan.source,
        segments=[_serialize_segment(segment) for segment in ordered_segments],
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


@router.get("/plans", response_model=List[PlannerPlanRead])
def list_planner_plans(
    date: Optional[date_type] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(PlannerPlan)
    if date is not None:
        query = query.filter(PlannerPlan.date == date)

    plans = query.order_by(PlannerPlan.date.asc(), PlannerPlan.updated_at.desc()).all()
    return [_serialize_plan(plan) for plan in plans]


@router.post(
    "/plans",
    response_model=PlannerPlanRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
def upsert_planner_plan(payload: PlannerPlanUpsert, db: Session = Depends(get_db)):
    plan = db.query(PlannerPlan).filter(PlannerPlan.id == payload.id).first()

    if plan is None:
        plan = PlannerPlan(
            id=payload.id,
            title=payload.title,
            date=payload.date,
            source=payload.source,
        )
        db.add(plan)
        db.flush()
    else:
        for existing_segment in list(plan.segments):
            _delete_calendar_event(db, existing_segment.backend_event_id)
            db.delete(existing_segment)
        plan.title = payload.title
        plan.date = payload.date
        plan.source = payload.source
        db.flush()

    for incoming_segment in payload.segments:
        segment = PlannerSegment(
            id=incoming_segment.id,
            plan_id=plan.id,
            title=incoming_segment.title,
            start_time=incoming_segment.start_time,
            end_time=incoming_segment.end_time,
            is_done=incoming_segment.is_done,
            alarm_at_start=incoming_segment.alarm_at_start,
            alarm_at_end=incoming_segment.alarm_at_end,
        )
        db.add(segment)
        db.flush()
        _sync_segment_event(db, plan, segment)

    db.commit()
    db.refresh(plan)
    return _serialize_plan(plan)


@router.patch(
    "/plans/{plan_id}/segments/{segment_id}",
    response_model=PlannerSegmentRead,
    dependencies=[Depends(require_api_key)],
)
def update_planner_segment(
    plan_id: str,
    segment_id: str,
    payload: PlannerSegmentUpdate,
    db: Session = Depends(get_db),
):
    plan = _load_plan(db, plan_id)
    segment = _load_segment(db, plan_id, segment_id)

    updates = payload.model_dump(exclude_unset=True)
    for field_name, value in updates.items():
        setattr(segment, field_name, value)

    if segment.end_time is not None and segment.end_time <= segment.start_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_time must be after start_time",
        )

    _sync_segment_event(db, plan, segment)
    db.commit()
    db.refresh(segment)
    return _serialize_segment(segment)


@router.delete(
    "/plans/{plan_id}/segments/{segment_id}",
    response_model=DeleteResponse,
    dependencies=[Depends(require_api_key)],
)
def delete_planner_segment(
    plan_id: str,
    segment_id: str,
    db: Session = Depends(get_db),
):
    segment = _load_segment(db, plan_id, segment_id)
    _delete_calendar_event(db, segment.backend_event_id)
    db.delete(segment)
    db.flush()

    remaining_count = db.query(PlannerSegment).filter(PlannerSegment.plan_id == plan_id).count()
    if remaining_count == 0:
        plan = _load_plan(db, plan_id)
        db.delete(plan)

    db.commit()
    return DeleteResponse(status="deleted", id=0)


@router.delete(
    "/plans/{plan_id}",
    response_model=DeleteResponse,
    dependencies=[Depends(require_api_key)],
)
def delete_planner_plan(plan_id: str, db: Session = Depends(get_db)):
    plan = _load_plan(db, plan_id)
    for segment in list(plan.segments):
        _delete_calendar_event(db, segment.backend_event_id)
        db.delete(segment)
    db.delete(plan)
    db.commit()
    return DeleteResponse(status="deleted", id=0)
