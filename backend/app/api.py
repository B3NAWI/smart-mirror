from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import require_api_key
from .calendar_routes import router as calendar_router
from .database import get_db
from .models import MirrorModuleSettings
from .schemas import (
    MirrorRefreshRequest,
    MirrorModuleSettingsRead,
    MirrorModuleSettingsUpdate,
    MirrorStateResponse,
)
from .daily_plan_routes import router as daily_plan_router
from .now_playing_routes import router as now_playing_router
from .state import get_state, update_state
from .todo_routes import router as todo_router
from .weather_routes import router as weather_router

router = APIRouter()


def _get_or_create_module_settings(db: Session) -> MirrorModuleSettings:
    settings = db.query(MirrorModuleSettings).filter(MirrorModuleSettings.id == 1).first()
    if settings is not None:
        return settings

    settings = MirrorModuleSettings(id=1)
    db.add(settings)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return db.query(MirrorModuleSettings).filter(MirrorModuleSettings.id == 1).first()

    db.refresh(settings)
    return settings


@router.get("/api/state", response_model=MirrorStateResponse)
def read_state(db: Session = Depends(get_db)):
    return MirrorStateResponse.model_validate(
        {
            **get_state(),
            "modules": _get_or_create_module_settings(db),
        }
    )


@router.get("/api/state/modules", response_model=MirrorModuleSettingsRead)
def read_state_modules(db: Session = Depends(get_db)):
    return _get_or_create_module_settings(db)


@router.patch(
    "/api/state/modules",
    response_model=MirrorModuleSettingsRead,
    dependencies=[Depends(require_api_key)],
)
def update_state_modules(
    payload: MirrorModuleSettingsUpdate,
    db: Session = Depends(get_db),
):
    settings = _get_or_create_module_settings(db)

    for field_name, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings, field_name, value)

    db.commit()
    db.refresh(settings)
    return settings


@router.post(
    "/api/state/refresh",
    response_model=MirrorModuleSettingsRead,
    dependencies=[Depends(require_api_key)],
)
def signal_state_refresh(
    payload: MirrorRefreshRequest,
    db: Session = Depends(get_db),
):
    settings = _get_or_create_module_settings(db)
    now = datetime.utcnow()

    if payload.weather:
        settings.weather_refresh_requested_at = now
    if payload.mirror_data:
        settings.mirror_refresh_requested_at = now

    db.commit()
    db.refresh(settings)
    return settings


@router.post("/api/test")
def test_update():
    update_state({
        "temperature": 27,
        "humidity": 60,
        "pressure": 1007,
        "motion": True,
        "gesture": "left"
    })
    return {"status": "updated"}


router.include_router(calendar_router)
router.include_router(todo_router)
router.include_router(daily_plan_router)
router.include_router(now_playing_router)
router.include_router(weather_router)
