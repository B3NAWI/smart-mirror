# main.py
# تشغيل السيرفر + MQTT / Run server + MQTT

from fastapi import FastAPI
from .api import router
from .mqtt_client import start_mqtt

app = FastAPI(title="HALO MIRROR Backend")
app.include_router(router)

@app.on_event("startup")
def startup():
    start_mqtt()
