import json
import logging

import paho.mqtt.client as mqtt

from .config import MQTT_HOST, MQTT_PORT, MQTT_TOPIC
from .state import update_state

logger = logging.getLogger("halo.backend.mqtt")

_mqtt_status = {
    "state": "not_started",
    "host": MQTT_HOST,
    "port": MQTT_PORT,
    "topic": MQTT_TOPIC,
    "message": "MQTT client has not started.",
}


def _set_mqtt_status(state: str, message: str) -> None:
    _mqtt_status["state"] = state
    _mqtt_status["message"] = message


def get_mqtt_status() -> dict:
    return dict(_mqtt_status)


def on_connect(client, userdata, flags, rc):
    client.subscribe(MQTT_TOPIC)
    if rc == 0:
        _set_mqtt_status("connected", f"Connected to {MQTT_HOST}:{MQTT_PORT} ({MQTT_TOPIC})")
        logger.info("MQTT connected to %s:%s topic=%s", MQTT_HOST, MQTT_PORT, MQTT_TOPIC)
    else:
        _set_mqtt_status("error", f"MQTT broker rejected the connection with code {rc}.")
        logger.warning("MQTT connection rejected with code %s", rc)


def on_message(client, userdata, msg):
    try:
        payload = msg.payload.decode("utf-8")
        data = json.loads(payload)
        if isinstance(data, dict):
            update_state(data)
    except Exception:
        pass


def start_mqtt():
    """Start MQTT when available without blocking the API in local fallback mode."""
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message
    _set_mqtt_status("starting", "Trying to connect to the MQTT broker.")

    try:
        client.connect(MQTT_HOST, MQTT_PORT, 60)
        client.loop_start()
        logger.info("MQTT client started for %s:%s topic=%s", MQTT_HOST, MQTT_PORT, MQTT_TOPIC)
    except Exception as exc:
        _set_mqtt_status("fallback", "MQTT broker unavailable. Running API-only mode.")
        logger.warning("MQTT unavailable, running API-only mode: %s", exc)

    return get_mqtt_status()
