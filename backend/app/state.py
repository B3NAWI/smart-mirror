import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any, Dict, Optional

STATE_FILE = Path(__file__).resolve().parent.parent / "data" / "mirror_runtime_state.json"
SENSOR_FIELDS = {"temperature", "humidity", "pressure", "motion", "gesture"}
WEATHER_FIELDS = {
    "weather_temperature_c",
    "weather_description",
    "weather_location_label",
    "weather_region",
    "weather_source",
    "weather_is_day",
}
PROFILE_FIELDS = {"active_account_id", "active_account_name"}
CONTROL_FIELDS = {
    "screen_name",
    "brightness_level",
    "volume_level",
    "sleeping",
}


@dataclass
class MirrorState:
    temperature: Optional[float] = None
    humidity: Optional[int] = None
    pressure: Optional[int] = None
    motion: bool = False
    gesture: str = "none"
    mirror_state_updated_at: Optional[str] = None
    weather_temperature_c: Optional[float] = None
    weather_description: str = ""
    weather_location_label: str = ""
    weather_region: str = ""
    weather_source: str = ""
    weather_is_day: Optional[int] = None
    weather_updated_at: Optional[str] = None
    active_account_id: str = ""
    active_account_name: str = ""
    profile_updated_at: Optional[str] = None
    screen_name: str = "today"
    brightness_level: int = 70
    volume_level: int = 50
    sleeping: bool = False
    control_updated_at: Optional[str] = None


def _timestamp() -> str:
    return datetime.utcnow().isoformat()


def _coerce_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _load_state() -> MirrorState:
    if not STATE_FILE.exists():
        return MirrorState()

    try:
        payload = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return MirrorState()

    return MirrorState(
        temperature=_coerce_float(payload.get("temperature")),
        humidity=_coerce_int(payload.get("humidity")),
        pressure=_coerce_int(payload.get("pressure")),
        motion=bool(payload.get("motion", False)),
        gesture=str(payload.get("gesture") or "none"),
        mirror_state_updated_at=payload.get("mirror_state_updated_at"),
        weather_temperature_c=_coerce_float(payload.get("weather_temperature_c")),
        weather_description=str(payload.get("weather_description") or ""),
        weather_location_label=str(payload.get("weather_location_label") or ""),
        weather_region=str(payload.get("weather_region") or ""),
        weather_source=str(payload.get("weather_source") or ""),
        weather_is_day=_coerce_int(payload.get("weather_is_day")),
        weather_updated_at=payload.get("weather_updated_at"),
        active_account_id=str(payload.get("active_account_id") or ""),
        active_account_name=str(payload.get("active_account_name") or ""),
        profile_updated_at=payload.get("profile_updated_at"),
        screen_name=str(payload.get("screen_name") or "today"),
        brightness_level=_coerce_int(payload.get("brightness_level")) or 70,
        volume_level=_coerce_int(payload.get("volume_level")) or 50,
        sleeping=bool(payload.get("sleeping", False)),
        control_updated_at=payload.get("control_updated_at"),
    )


def _save_state(state: MirrorState) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(asdict(state), ensure_ascii=True, indent=2), encoding="utf-8")


_state = _load_state()
_lock = Lock()


def get_state() -> Dict[str, Any]:
    with _lock:
        return asdict(_state)


def update_state(data: Dict[str, Any]) -> None:
    with _lock:
        sensor_changed = False
        weather_changed = False
        profile_changed = False

        for key, value in data.items():
            if not hasattr(_state, key):
                continue

            if key in {"temperature", "weather_temperature_c"}:
                value = _coerce_float(value)
            elif key in {"humidity", "pressure", "weather_is_day"}:
                value = _coerce_int(value)
            elif key == "motion":
                value = bool(value)
            elif key == "sleeping":
                value = bool(value)
            elif key in {"brightness_level", "volume_level"}:
                numeric_value = _coerce_int(value)
                if numeric_value is None:
                    continue
                value = max(0, min(100, numeric_value))
            elif key in {"gesture", "weather_description", "weather_location_label", "weather_region", "weather_source", "active_account_id", "active_account_name"}:
                value = str(value or "")
            elif key == "screen_name":
                value = str(value or "today")

            setattr(_state, key, value)

            if key in SENSOR_FIELDS:
                sensor_changed = True
            if key in WEATHER_FIELDS:
                weather_changed = True
            if key in PROFILE_FIELDS:
                profile_changed = True
            if key in CONTROL_FIELDS:
                _state.control_updated_at = _timestamp()

        now = _timestamp()
        if sensor_changed:
            _state.mirror_state_updated_at = now
        if weather_changed:
            _state.weather_updated_at = now
        if profile_changed:
            _state.profile_updated_at = now

        _save_state(_state)
