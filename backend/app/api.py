from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import require_api_key
from .calendar_routes import router as calendar_router
from .config import HALO_VOICE_ENABLED, OPENAI_API_KEY
from .database import database_healthcheck, get_db
from .mirror_commands import get_or_create_module_settings
from .models import MirrorModuleSettings
from .mirror_routes import router as mirror_router
from .news_routes import router as news_router
from .mqtt_client import get_mqtt_status
from .schemas import (
    MirrorRefreshRequest,
    MirrorRuntimeStateUpdate,
    MirrorModuleSettingsRead,
    MirrorModuleSettingsUpdate,
    MirrorStateResponse,
)
from .daily_plan_routes import router as daily_plan_router
from .now_playing_routes import router as now_playing_router
from .planner_routes import router as planner_router
from .state import get_state, update_state
from .todo_routes import router as todo_router
from .voice_routes import router as voice_router
from .weather_routes import router as weather_router

router = APIRouter()
@router.get("/api/state", response_model=MirrorStateResponse)
def read_state(db: Session = Depends(get_db)):
    return MirrorStateResponse.model_validate(
        {
            **get_state(),
            "modules": get_or_create_module_settings(db),
        }
    )


@router.get("/api/health")
def read_health(db: Session = Depends(get_db)):
    modules = get_or_create_module_settings(db)
    database_connected = database_healthcheck()
    return {
        "status": "ok" if database_connected else "degraded",
        "database": {
            "connected": database_connected,
            "url_scheme": "sqlite"
            if str(db.bind.url).startswith("sqlite")
            else db.bind.url.get_backend_name(),
        },
        "mqtt": get_mqtt_status(),
        "voice": {
            "enabled": HALO_VOICE_ENABLED,
            "openai_configured": bool(OPENAI_API_KEY),
        },
        "modules": {
            "weather_enabled": modules.weather_enabled,
            "news_enabled": modules.news_enabled,
            "gesture_camera_enabled": modules.gesture_camera_enabled,
        },
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/api/state/modules", response_model=MirrorModuleSettingsRead)
def read_state_modules(db: Session = Depends(get_db)):
    return get_or_create_module_settings(db)


@router.patch(
    "/api/state/modules",
    response_model=MirrorModuleSettingsRead,
    dependencies=[Depends(require_api_key)],
)
def update_state_modules(
    payload: MirrorModuleSettingsUpdate,
    db: Session = Depends(get_db),
):
    settings = get_or_create_module_settings(db)

    for field_name, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings, field_name, value)

    db.commit()
    db.refresh(settings)
    return settings


@router.patch(
    "/api/state/runtime",
    response_model=MirrorStateResponse,
    dependencies=[Depends(require_api_key)],
)
def update_runtime_state(
    payload: MirrorRuntimeStateUpdate,
    db: Session = Depends(get_db),
):
    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    if updates:
        update_state(updates)

    return MirrorStateResponse.model_validate(
        {
            **get_state(),
            "modules": get_or_create_module_settings(db),
        }
    )


@router.post(
    "/api/state/refresh",
    response_model=MirrorModuleSettingsRead,
    dependencies=[Depends(require_api_key)],
)
def signal_state_refresh(
    payload: MirrorRefreshRequest,
    db: Session = Depends(get_db),
):
    settings = get_or_create_module_settings(db)
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
router.include_router(planner_router)
router.include_router(now_playing_router)
router.include_router(weather_router)
router.include_router(news_router)
router.include_router(voice_router)
router.include_router(mirror_router)
