from __future__ import annotations

import os
from pathlib import Path
from tempfile import TemporaryDirectory


def build_client():
    temp_dir = TemporaryDirectory()
    database_path = Path(temp_dir.name) / "halo_assistant_e2e.db"
    os.environ["DATABASE_URL"] = f"sqlite:///{database_path}"
    os.environ["HALO_API_KEY"] = "test-halo-key"
    os.environ["HALO_DEV_API_KEY"] = "halo-local-dev-key"
    os.environ["HALO_FREEFORM_ASSISTANT_ENABLED"] = "false"

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
        debug_config_response = client.get(
            "/api/assistant/debug/config",
            headers=headers,
        )
        assert_true(debug_config_response.status_code == 200, "Assistant debug config API failed")
        debug_config_payload = debug_config_response.json()
        assert_true(
            debug_config_payload["max_response_output_tokens"] >= 100,
            "Voice output token limit is too low",
        )

        time_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, what time is it?"},
        )
        assert_true(time_response.status_code == 200, "Time command API failed")
        time_payload = time_response.json()
        assert_true(time_payload["intent"] == "get_current_time", "Time command did not succeed")

        calendar_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, add project presentation tomorrow at 2 PM"},
        )
        assert_true(calendar_response.status_code == 200, "Calendar command API failed")
        calendar_payload = calendar_response.json()
        assert_true(
            calendar_payload["intent"] == "create_calendar_event",
            "Calendar command did not create event",
        )

        list_response = client.get("/api/calendar")
        assert_true(list_response.status_code == 200, "Calendar listing API failed")
        assert_true(len(list_response.json()) >= 1, "Calendar event not persisted")

        show_calendar_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, show my calendar"},
        )
        assert_true(show_calendar_response.status_code == 200, "Show calendar API failed")
        state_response = client.get("/api/state")
        state_payload = state_response.json()
        assert_true(state_payload["modules"]["calendar_enabled"] is True, "Calendar widget not enabled")

        hide_calendar_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, hide calendar"},
        )
        assert_true(hide_calendar_response.status_code == 200, "Hide calendar API failed")

        show_weather_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, show weather"},
        )
        assert_true(show_weather_response.status_code == 200, "Show weather API failed")

        hide_weather_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, hide weather"},
        )
        assert_true(hide_weather_response.status_code == 200, "Hide weather API failed")

        show_news_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, show news"},
        )
        assert_true(show_news_response.status_code == 200, "Show news API failed")
        news_state = client.get("/api/state").json()
        assert_true(news_state["modules"]["news_enabled"] is True, "News widget not enabled")

        hide_news_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, hide news"},
        )
        assert_true(hide_news_response.status_code == 200, "Hide news API failed")

        youtube_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, open YouTube"},
        )
        assert_true(youtube_response.status_code == 200, "Open YouTube API failed")
        now_playing_response = client.get("/api/now-playing")
        assert_true(now_playing_response.status_code == 200, "Now playing API failed")

        screen_off_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, screen off"},
        )
        assert_true(screen_off_response.status_code == 200, "Screen off API failed")
        state_after_screen_off = client.get("/api/state").json()
        assert_true(state_after_screen_off["sleeping"] is True, "Screen did not turn off")

        screen_on_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, screen on"},
        )
        assert_true(screen_on_response.status_code == 200, "Screen on API failed")
        state_after_screen_on = client.get("/api/state").json()
        assert_true(state_after_screen_on["sleeping"] is False, "Screen did not turn on")

        news_feed_response = client.get("/api/news/headlines")
        assert_true(news_feed_response.status_code == 200, "News headlines API failed")

        explain_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, explain yourself in 3 short sentences."},
        )
        assert_true(explain_response.status_code == 200, "Explain yourself API failed")
        assert_true(
            explain_response.json()["response"].count(".") >= 3,
            "Explain yourself response was cut short",
        )

        developers_response = client.post(
            "/api/assistant/text",
            headers=headers,
            json={"user_id": "test-user", "text": "Hi Halo, who developed you?"},
        )
        assert_true(developers_response.status_code == 200, "Who developed you API failed")
        assert_true(
            "Hilal Dallashi" in developers_response.json()["response"],
            "Developer response content failed",
        )

        print("Assistant debug config API works")
        print("Voice time command API works")
        print("Voice calendar command API works")
        print("Calendar persistence works")
        print("Calendar widget API flow works")
        print("Weather widget API flow works")
        print("News widget API flow works")
        print("YouTube API flow works")
        print("Screen control API flow works")
        print("News headlines API works")
        print("Explain yourself API works")
        print("Developer identity API works")
        return 0
    finally:
        client.close()
        engine.dispose()
        temp_dir.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
