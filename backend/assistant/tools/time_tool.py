from __future__ import annotations

from datetime import datetime


def get_current_time(*, language: str = "en") -> dict:
    now = datetime.now()
    display_time = now.strftime("%I:%M %p").lstrip("0")

    if language == "ar":
        reply = f"الساعة الآن {display_time}."
    elif language == "tr":
        reply = f"Saat şu an {display_time}."
    else:
        reply = f"It's {display_time}."

    return {
        "tool": "get_current_time",
        "reply": reply,
        "data": {
            "iso_datetime": now.isoformat(),
            "display_time": display_time,
            "language": language,
        },
    }
