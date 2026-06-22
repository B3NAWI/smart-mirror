from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import MirrorModuleSettings
from .state import get_state, update_state

WIDGET_FIELD_MAP = {
    "weather": "weather_enabled",
    "news": "news_enabled",
    "calendar": "calendar_enabled",
    "youtube": "youtube_enabled",
    "clock": "date_enabled",
    "reminders": "reminders_enabled",
}
WIDGET_SCREEN_MAP = {
    "weather": "weather",
    "calendar": "calendar",
    "youtube": "youtube",
    "reminders": "today",
    "clock": "today",
    "news": "today",
}


def get_or_create_module_settings(db: Session) -> MirrorModuleSettings:
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


def _module_snapshot(settings: MirrorModuleSettings) -> Dict[str, Any]:
    return {
        "weather_enabled": settings.weather_enabled,
        "news_enabled": settings.news_enabled,
        "date_enabled": settings.date_enabled,
        "reminders_enabled": settings.reminders_enabled,
        "calendar_enabled": settings.calendar_enabled,
        "youtube_enabled": settings.youtube_enabled,
        "gesture_camera_enabled": settings.gesture_camera_enabled,
        "weather_refresh_requested_at": settings.weather_refresh_requested_at.isoformat()
        if settings.weather_refresh_requested_at
        else None,
        "mirror_refresh_requested_at": settings.mirror_refresh_requested_at.isoformat()
        if settings.mirror_refresh_requested_at
        else None,
    }


def control_mirror_widget(db: Session, widget_name: str, visible: bool) -> Dict[str, Any]:
    normalized = str(widget_name or "").strip().lower()
    field_name = WIDGET_FIELD_MAP.get(normalized)
    if field_name is None:
        raise ValueError(f"Unsupported widget: {widget_name}")

    settings = get_or_create_module_settings(db)
    setattr(settings, field_name, bool(visible))
    db.commit()
    db.refresh(settings)

    current_state = {}
    if visible:
        target_screen = WIDGET_SCREEN_MAP.get(normalized, "today")
        update_state({"screen_name": target_screen, "sleeping": False})
        current_state = get_state()
    elif get_state().get("screen_name") == WIDGET_SCREEN_MAP.get(normalized):
        update_state({"screen_name": "today"})
        current_state = get_state()

    return {
        "widget": normalized,
        "visible": bool(visible),
        "modules": _module_snapshot(settings),
        "screen_name": current_state.get("screen_name") or get_state().get("screen_name"),
    }


def toggle_mirror_widget(db: Session, widget_name: str) -> Dict[str, Any]:
    normalized = str(widget_name or "").strip().lower()
    field_name = WIDGET_FIELD_MAP.get(normalized)
    if field_name is None:
        raise ValueError(f"Unsupported widget: {widget_name}")

    settings = get_or_create_module_settings(db)
    current_visible = bool(getattr(settings, field_name))
    return control_mirror_widget(db, normalized, not current_visible)


def control_screen(action: str) -> Dict[str, Any]:
    normalized = str(action or "").strip().lower()
    if normalized not in {"on", "off"}:
        raise ValueError("screen action must be 'on' or 'off'")

    sleeping = normalized == "off"
    update_state({"sleeping": sleeping})
    state = get_state()
    return {
        "action": normalized,
        "screen_name": state.get("screen_name"),
        "sleeping": state.get("sleeping"),
    }


def refresh_mirror(db: Session) -> Dict[str, Any]:
    settings = get_or_create_module_settings(db)
    settings.mirror_refresh_requested_at = datetime.utcnow()
    db.commit()
    db.refresh(settings)
    return {
        "modules": _module_snapshot(settings),
        "screen_name": get_state().get("screen_name"),
    }
