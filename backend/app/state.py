# state.py
# آخر حالة للمراية / Latest mirror state

from dataclasses import dataclass, asdict
from threading import Lock

@dataclass
class MirrorState:
    temperature: float | None = None
    humidity: int | None = None
    pressure: int | None = None
    motion: bool = False
    gesture: str = "none"

_state = MirrorState()
_lock = Lock()

def get_state():
    with _lock:
        return asdict(_state)

def update_state(data: dict):
    with _lock:
        for key, value in data.items():
            if hasattr(_state, key):
                setattr(_state, key, value)
