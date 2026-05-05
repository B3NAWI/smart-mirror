from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router
from .config import ALLOWED_ORIGINS, LOCAL_NETWORK_ORIGIN_REGEX
from .database import init_database
from .mqtt_client import start_mqtt

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
    start_mqtt()
