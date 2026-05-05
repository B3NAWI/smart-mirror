from datetime import date as date_type
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy import case
from sqlalchemy.orm import Session

from .auth import require_api_key
from .database import get_db
from .models import TodoTask
from .schemas import DeleteResponse, TodoTaskCreate, TodoTaskRead, TodoTaskUpdate

router = APIRouter(prefix="/api/todos", tags=["todos"])


def priority_ordering():
    return case(
        (TodoTask.priority == "high", 0),
        (TodoTask.priority == "medium", 1),
        else_=2,
    )


def get_todos_for_date(
    db: Session,
    target_date: date_type,
    completed: Optional[bool] = None,
) -> List[TodoTask]:
    query = db.query(TodoTask).filter(TodoTask.date == target_date)
    if completed is not None:
        query = query.filter(TodoTask.completed == completed)

    return (
        query.order_by(
            priority_ordering(),
            case((TodoTask.due_time.is_(None), 1), else_=0),
            TodoTask.due_time.asc(),
            TodoTask.id.asc(),
        )
        .all()
    )


@router.get("", response_model=List[TodoTaskRead])
def list_todos(
    date: Optional[date_type] = Query(None),
    completed: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(TodoTask)

    if date is not None:
        query = query.filter(TodoTask.date == date)

    if completed is not None:
        query = query.filter(TodoTask.completed == completed)

    return (
        query.order_by(
            priority_ordering(),
            case((TodoTask.due_time.is_(None), 1), else_=0),
            TodoTask.due_time.asc(),
            TodoTask.date.asc(),
            TodoTask.id.asc(),
        )
        .all()
    )


@router.get("/today", response_model=List[TodoTaskRead])
def list_today_todos(db: Session = Depends(get_db)):
    return get_todos_for_date(db, date_type.today())


@router.post(
    "",
    response_model=TodoTaskRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
def create_todo_task(payload: TodoTaskCreate, db: Session = Depends(get_db)):
    todo = TodoTask(**payload.model_dump())
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@router.patch(
    "/{todo_id}",
    response_model=TodoTaskRead,
    dependencies=[Depends(require_api_key)],
)
def update_todo_task(
    todo_id: int,
    payload: TodoTaskUpdate,
    db: Session = Depends(get_db),
):
    todo = db.query(TodoTask).filter(TodoTask.id == todo_id).first()
    if todo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todo task not found",
        )

    updates = payload.model_dump(exclude_unset=True)
    for field_name, value in updates.items():
        setattr(todo, field_name, value)

    db.commit()
    db.refresh(todo)
    return todo


@router.delete(
    "/{todo_id}",
    response_model=DeleteResponse,
    dependencies=[Depends(require_api_key)],
)
def delete_todo_task(todo_id: int, db: Session = Depends(get_db)):
    todo = db.query(TodoTask).filter(TodoTask.id == todo_id).first()
    if todo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todo task not found",
        )

    db.delete(todo)
    db.commit()
    return DeleteResponse(status="deleted", id=todo_id)
