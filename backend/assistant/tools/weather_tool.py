from __future__ import annotations

from app.weather_routes import read_current_weather


def get_weather() -> dict:
    payload = read_current_weather(None, None)
    weather = payload.get("weather") if isinstance(payload, dict) else None
    location = payload.get("location") if isinstance(payload, dict) else None

    if not weather:
        return {
            "tool": "get_weather",
            "reply": "Weather is not configured yet.",
            "data": {
                "weather": None,
                "location": location,
            },
        }

    location_label = ""
    if isinstance(location, dict):
        location_label = location.get("label") or location.get("city") or ""

    description = weather.get("description") or "Weather unavailable"
    temperature = weather.get("temperature_c")
    reply = f"{description}, {temperature} degrees."
    if location_label:
        reply = f"{description}, {temperature} degrees in {location_label}."

    return {
        "tool": "get_weather",
        "reply": reply,
        "data": {
            "weather": weather,
            "location": location,
        },
    }

