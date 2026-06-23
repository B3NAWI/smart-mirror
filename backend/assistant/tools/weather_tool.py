from __future__ import annotations

from app.weather_routes import read_current_weather


def get_weather(*, language: str = "en") -> dict:
    payload = read_current_weather(None, None)
    weather = payload.get("weather") if isinstance(payload, dict) else None
    location = payload.get("location") if isinstance(payload, dict) else None

    if not weather:
        reply = "Weather is not configured yet."
        if language == "ar":
            reply = "الطقس غير مهيأ بعد."
        elif language == "tr":
            reply = "Hava durumu henüz yapılandırılmadı."
        return {
            "tool": "get_weather",
            "reply": reply,
            "data": {
                "weather": None,
                "location": location,
                "language": language,
            },
        }

    location_label = ""
    if isinstance(location, dict):
        location_label = location.get("label") or location.get("city") or ""

    description = weather.get("description") or "Weather unavailable"
    temperature = weather.get("temperature_c")

    if language == "ar":
        reply = f"{description}، {temperature} درجة."
        if location_label:
            reply = f"{description}، {temperature} درجة في {location_label}."
    elif language == "tr":
        reply = f"{description}, {temperature} derece."
        if location_label:
            reply = f"{location_label} için {description}, {temperature} derece."
    else:
        reply = f"{description}, {temperature} degrees."
        if location_label:
            reply = f"{description}, {temperature} degrees in {location_label}."

    return {
        "tool": "get_weather",
        "reply": reply,
        "data": {
            "weather": weather,
            "location": location,
            "language": language,
        },
    }
