from __future__ import annotations

from datetime import datetime


def get_current_time() -> dict:
    now = datetime.now()
    display_time = now.strftime("%I:%M %p").lstrip("0")
    return {
        "tool": "get_current_time",
        "reply": f"It's {display_time}.",
        "data": {
            "iso_datetime": now.isoformat(),
            "display_time": display_time,
        },
    }

