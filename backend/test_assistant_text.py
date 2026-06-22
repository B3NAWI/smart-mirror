from __future__ import annotations

import os
from pathlib import Path
from tempfile import TemporaryDirectory


def build_client():
    temp_dir = TemporaryDirectory()
    database_path = Path(temp_dir.name) / "assistant_text.db"
    os.environ["DATABASE_URL"] = f"sqlite:///{database_path}"
    os.environ["HALO_API_KEY"] = "test-halo-key"
    os.environ["HALO_DEV_API_KEY"] = "halo-local-dev-key"

    from fastapi.testclient import TestClient
    from app.database import engine, init_database
    from app.main import app

    init_database()
    client = TestClient(app)
    return temp_dir, client, engine


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    temp_dir, client, engine = build_client()
    headers = {"X-API-Key": "test-halo-key"}

    try:
        wake_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo"},
        )
        assert_true(wake_response.status_code == 200, "Wake phrase API failed")
        assert_true(wake_response.json()["wake_detected"] is True, "Wake phrase was not detected")

        time_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, what time is it?"},
        )
        assert_true(time_response.status_code == 200, "English time command failed")
        assert_true(time_response.json()["intent"] == "get_current_time", "English time intent failed")

        arabic_time_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo، كم الساعة؟"},
        )
        assert_true(arabic_time_response.status_code == 200, "Arabic time command failed")
        assert_true(
            arabic_time_response.json()["intent"] == "get_current_time",
            "Arabic time intent failed",
        )

        calendar_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, add a meeting tomorrow at 2 PM"},
        )
        assert_true(calendar_response.status_code == 200, "Calendar creation failed")
        assert_true(
            calendar_response.json()["intent"] == "create_calendar_event",
            "Calendar event was not created",
        )

        show_calendar_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, show my calendar"},
        )
        assert_true(show_calendar_response.status_code == 200, "Show calendar command failed")
        assert_true(
            show_calendar_response.json()["intent"] == "show_calendar",
            "Calendar widget command failed",
        )

        hide_weather_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, hide weather"},
        )
        assert_true(hide_weather_response.status_code == 200, "Hide weather command failed")
        assert_true(
            hide_weather_response.json()["intent"] == "hide_weather",
            "Weather widget command failed",
        )

        print("Wake phrase flow works")
        print("English assistant text command works")
        print("Arabic assistant text command works")
        print("Calendar creation through assistant text works")
        print("Calendar widget command works")
        print("Weather widget command works")
        return 0
    finally:
        client.close()
        engine.dispose()
        temp_dir.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
