import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router
from .config import (
    ALLOWED_ORIGINS,
    API_HOST,
    API_PORT,
    DATABASE_URL,
    HALO_VOICE_ENABLED,
    LOCAL_NETWORK_ORIGIN_REGEX,
    OPENAI_API_KEY,
)
from .database import database_healthcheck, init_database
from .mqtt_client import start_mqtt

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

logger = logging.getLogger("halo.backend")

app = FastAPI(title="HALO MIRROR Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=LOCAL_NETWORK_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.on_event("startup")
def startup():
    init_database()
    database_connected = database_healthcheck()
    mqtt_status = start_mqtt()

    logger.info("HALO MIRROR backend started on %s:%s", API_HOST, API_PORT)
    logger.info("Database connected: %s (%s)", "yes" if database_connected else "no", DATABASE_URL)
    logger.info(
        "MQTT status: %s - %s",
        mqtt_status.get("state", "unknown"),
        mqtt_status.get("message", ""),
    )
    logger.info(
        "Voice enabled: %s | OpenAI key configured: %s",
        "yes" if HALO_VOICE_ENABLED else "no",
        "yes" if OPENAI_API_KEY else "no",
    )
