import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
ENV_FILE = BACKEND_DIR / ".env"

load_dotenv(dotenv_path=ENV_FILE)


def _parse_origins(origins_value: str) -> List[str]:
    origins = [origin.strip() for origin in origins_value.split(",")]
    return [origin for origin in origins if origin]


def _parse_csv(csv_value: str) -> List[str]:
    items = [item.strip() for item in csv_value.split(",")]
    return [item for item in items if item]


def _parse_bool(env_name: str, default: bool) -> bool:
    raw_value = os.getenv(env_name)
    if raw_value is None:
        return default

    normalized = raw_value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _parse_int(
    env_name: str,
    default: int,
    *,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    raw_value = os.getenv(env_name)
    try:
        value = int(raw_value) if raw_value is not None else default
    except (TypeError, ValueError):
        value = default

    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


def _normalize_database_url(database_url: str) -> str:
    sqlite_prefix = "sqlite:///"
    if not database_url.startswith(sqlite_prefix):
        return database_url

    raw_path = database_url[len(sqlite_prefix) :]
    if raw_path == ":memory:":
        return database_url

    database_path = Path(raw_path)
    if database_path.is_absolute():
        resolved_path = database_path
    elif database_path.parts and database_path.parts[0] == "backend":
        resolved_path = PROJECT_ROOT / database_path
    else:
        resolved_path = BACKEND_DIR / database_path

    resolved_path.parent.mkdir(parents=True, exist_ok=True)
    return f"{sqlite_prefix}{resolved_path}"


MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "mirror/sensors")

API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "5000"))

HALO_API_KEY = os.getenv("HALO_API_KEY", "")
HALO_DEV_API_KEY = os.getenv("HALO_DEV_API_KEY", "halo-local-dev-key").strip()
DATABASE_URL = _normalize_database_url(
    os.getenv("DATABASE_URL", "sqlite:///data/halo_mirror.db")
)
ALLOWED_ORIGINS = _parse_origins(
    os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
)
LOCAL_NETWORK_ORIGIN_REGEX = (
    r"^https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?$"
)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_REALTIME_MODEL = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime-2").strip() or "gpt-realtime-2"
HALO_VOICE_ENABLED = _parse_bool("HALO_VOICE_ENABLED", True)
HALO_MAX_INPUT_TOKENS = _parse_int("HALO_MAX_INPUT_TOKENS", 100000, minimum=1)
HALO_MAX_OUTPUT_TOKENS = _parse_int(
    "HALO_MAX_OUTPUT_TOKENS",
    300,
    minimum=1,
    maximum=4096,
)
HALO_VOICE_REASONING_EFFORT = os.getenv(
    "HALO_VOICE_REASONING_EFFORT",
    "low",
).strip().lower() or "low"
if HALO_VOICE_REASONING_EFFORT not in {"minimal", "low", "medium", "high", "xhigh"}:
    HALO_VOICE_REASONING_EFFORT = "low"
HALO_WAKE_WORDS = _parse_csv(
    os.getenv("HALO_WAKE_WORDS", "Halo,Halo Mirror,هالو,هالو ميرور")
)
HALO_VOICE_IDLE_TIMEOUT_SECONDS = _parse_int(
    "HALO_VOICE_IDLE_TIMEOUT_SECONDS",
    30,
    minimum=5,
    maximum=30,
)
HALO_VOICE_SESSION_TIMEOUT_SECONDS = _parse_int(
    "HALO_VOICE_SESSION_TIMEOUT_SECONDS",
    300,
    minimum=10,
    maximum=7200,
)
HALO_VOICE_ASSISTANT_INSTRUCTIONS = (
    "You are Halo Mirror, a concise bilingual smart mirror assistant. "
    "You control the mirror dashboard and coordinate with the phone app. "
    "Respond in the user's language. Keep answers short and direct. "
    "Use tools for user data, plans, alarms, reminders, YouTube, media, brightness, sensors, "
    "and navigation. Do not invent data. If a command changes state, confirm briefly. "
    "Wake names are Halo, Halo Mirror, هالو, هالو ميرور. Prioritize low token usage."
)
