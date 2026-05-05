from dataclasses import dataclass, asdict
from threading import Lock
from typing import Optional

@dataclass
class MirrorState:
    temperature: Optional[float] = None
    humidity: Optional[int] = None
    pressure: Optional[int] = None
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
