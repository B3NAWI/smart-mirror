# mqtt_client.py
# استقبال بيانات MQTT / Receive MQTT data

import json
import paho.mqtt.client as mqtt

from .config import MQTT_HOST, MQTT_PORT, MQTT_TOPIC
from .state import update_state

def on_connect(client, userdata, flags, rc):
    # اشترك بالتوبيك أول ما يتصل / Subscribe on connect
    client.subscribe(MQTT_TOPIC)

def on_message(client, userdata, msg):
    try:
        payload = msg.payload.decode("utf-8")
        data = json.loads(payload)
        if isinstance(data, dict):
            update_state(data)
    except Exception:
        pass

def start_mqtt():
    """
    بنشغّل MQTT لو متوفر.
    على ويندوز غالبًا ما في broker شغّال، فبنكمّل بدون ما نطيّح السيرفر.
    """
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message

    try:
        client.connect(MQTT_HOST, MQTT_PORT, 60)
        client.loop_start()
        print(f"[MQTT] Connected to {MQTT_HOST}:{MQTT_PORT} topic={MQTT_TOPIC}")
    except Exception as e:
        print(f"[MQTT] Not available ({e}) — running API only.")
