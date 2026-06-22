from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .auth import require_api_key
from .database import get_db
from .mirror_commands import control_mirror_widget, control_screen, refresh_mirror, toggle_mirror_widget
from .schemas import MirrorCommandRequest

router = APIRouter(tags=["mirror"])


@router.post(
    "/api/mirror/command",
    dependencies=[Depends(require_api_key)],
)
def run_mirror_command(payload: MirrorCommandRequest, db: Session = Depends(get_db)):
    command = (payload.command or "").strip().lower()
    widget = (payload.widget or "").strip().lower()
    action = (payload.action or "").strip().lower()

    if widget and action:
        if action == "refresh":
            data = refresh_mirror(db)
            return {
                "status": "success",
                "command": "refresh_mirror",
                "data": data,
            }
        if widget == "screen":
            normalized_action = "on" if action in {"show", "on", "screen_on"} else "off"
            data = control_screen(normalized_action)
            return {
                "status": "success",
                "command": f"screen_{normalized_action}",
                "data": data,
            }

        try:
            if action not in {"show", "hide", "toggle"}:
                raise ValueError("Unsupported mirror action.")
            if action == "toggle":
                data = toggle_mirror_widget(db, widget)
            else:
                visible = action == "show"
                data = control_mirror_widget(db, widget, visible)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

        return {
            "status": "success",
            "command": f"{action}_{widget}",
            "data": data,
        }

    try:
        if command == "refresh_mirror":
            data = refresh_mirror(db)
        elif command == "screen_on":
            data = control_screen("on")
        elif command == "screen_off":
            data = control_screen("off")
        elif command.startswith("show_"):
            data = control_mirror_widget(db, command.removeprefix("show_"), True)
        elif command.startswith("hide_"):
            data = control_mirror_widget(db, command.removeprefix("hide_"), False)
        else:
            raise ValueError("Unsupported mirror command.")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return {
        "status": "success",
        "command": command,
        "data": data,
    }
