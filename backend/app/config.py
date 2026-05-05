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
DATABASE_URL = _normalize_database_url(
    os.getenv("DATABASE_URL", "sqlite:///data/halo_mirror.db")
)
ALLOWED_ORIGINS = _parse_origins(
    os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
)
LOCAL_NETWORK_ORIGIN_REGEX = (
    r"^https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?$"
)
