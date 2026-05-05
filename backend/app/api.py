from fastapi import APIRouter

from .calendar_routes import router as calendar_router
from .daily_plan_routes import router as daily_plan_router
from .now_playing_routes import router as now_playing_router
from .state import get_state, update_state
from .todo_routes import router as todo_router
from .weather_routes import router as weather_router

router = APIRouter()


@router.get("/api/state")
def read_state():
    return get_state()


@router.post("/api/test")
def test_update():
    update_state({
        "temperature": 27,
        "humidity": 60,
        "pressure": 1007,
        "motion": True,
        "gesture": "left"
    })
    return {"status": "updated"}


router.include_router(calendar_router)
router.include_router(todo_router)
router.include_router(daily_plan_router)
router.include_router(now_playing_router)
router.include_router(weather_router)
