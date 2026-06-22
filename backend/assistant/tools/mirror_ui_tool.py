from __future__ import annotations

from sqlalchemy.orm import Session

from app.mirror_commands import control_mirror_widget as _control_mirror_widget
from app.mirror_commands import control_screen as _control_screen
from app.mirror_commands import refresh_mirror as _refresh_mirror
from app.mirror_commands import toggle_mirror_widget as _toggle_mirror_widget


def control_mirror_widget(db: Session, *, widget: str, action: str) -> dict:
    normalized_widget = str(widget or "").strip().lower()
    normalized_action = str(action or "").strip().lower()
    if normalized_action == "toggle":
        data = _toggle_mirror_widget(db, normalized_widget)
        return {
            "tool": "control_mirror_widget",
            "reply": f"Toggled {normalized_widget}.",
            "data": data,
        }

    visible = normalized_action == "show"
    data = _control_mirror_widget(db, normalized_widget, visible)
    return {
        "tool": "control_mirror_widget",
        "reply": f"{'Showing' if visible else 'Hiding'} {normalized_widget}.",
        "data": data,
    }


def show_calendar(db: Session) -> dict:
    return control_mirror_widget(db, widget="calendar", action="show") | {"tool": "show_calendar", "reply": "Showing calendar."}


def hide_calendar(db: Session) -> dict:
    return control_mirror_widget(db, widget="calendar", action="hide") | {"tool": "hide_calendar", "reply": "Hiding calendar."}


def show_weather(db: Session) -> dict:
    return control_mirror_widget(db, widget="weather", action="show") | {"tool": "show_weather", "reply": "Showing weather."}


def hide_weather(db: Session) -> dict:
    return control_mirror_widget(db, widget="weather", action="hide") | {"tool": "hide_weather", "reply": "Hiding weather."}


def show_news(db: Session) -> dict:
    return control_mirror_widget(db, widget="news", action="show") | {"tool": "show_news", "reply": "Showing news."}


def hide_news(db: Session) -> dict:
    return control_mirror_widget(db, widget="news", action="hide") | {"tool": "hide_news", "reply": "Hiding news."}


def screen_on() -> dict:
    data = _control_screen("on")
    return {
        "tool": "screen_on",
        "reply": "Screen is on.",
        "data": data,
    }


def screen_off() -> dict:
    data = _control_screen("off")
    return {
        "tool": "screen_off",
        "reply": "Screen is off.",
        "data": data,
    }


def refresh_mirror(db: Session) -> dict:
    data = _refresh_mirror(db)
    return {
        "tool": "refresh_mirror",
        "reply": "Refreshing the mirror.",
        "data": data,
    }
