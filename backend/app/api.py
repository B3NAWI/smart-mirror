from fastapi import APIRouter
from .state import get_state, update_state

router = APIRouter()

@router.get("/api/state")
def read_state():
    return get_state()

@router.post("/api/test")
def test_update():
    # تحديث تجريبي
    update_state({
        "temperature": 27,
        "humidity": 60,
        "pressure": 1007,
        "motion": True,
        "gesture": "left"
    })
    return {"status": "updated"}
