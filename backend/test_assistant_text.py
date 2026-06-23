from __future__ import annotations

import os
from pathlib import Path
from tempfile import TemporaryDirectory


ARABIC_TIME = "Hi Halo، \u0643\u0645 \u0627\u0644\u0633\u0627\u0639\u0629\u061f"
ARABIC_EVENT_WITHOUT_TITLE = (
    "Hi Halo، \u062d\u0637\u0644\u064a \u0645\u0648\u0639\u062f "
    "\u0628\u0643\u0631\u0627 \u0627\u0644\u0633\u0627\u0639\u0629 3"
)


def build_client():
    temp_dir = TemporaryDirectory()
    database_path = Path(temp_dir.name) / "assistant_text.db"
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


def post_text(client, headers, text: str) -> dict:
    response = client.post(
        "/api/assistant/text",
        headers=headers,
        json={"user_id": "test-user", "text": text},
    )
    assert_true(response.status_code == 200, f"Request failed for: {text}")
    return response.json()


def main() -> int:
    temp_dir, client, engine = build_client()
    headers = {"X-API-Key": "test-halo-key"}

    try:
        english_time_payload = post_text(client, headers, "Hi Halo, what time is it?")
        assert_true(
            english_time_payload["intent"] == "get_current_time",
            "English time intent failed",
        )
        assert_true(
            bool(english_time_payload["tool_result"].get("display_time")),
            "English time response is missing the local display time",
        )

        arabic_time_payload = post_text(client, headers, ARABIC_TIME)
        assert_true(
            arabic_time_payload["intent"] == "get_current_time",
            "Arabic time intent failed",
        )
        assert_true(
            bool(arabic_time_payload["tool_result"].get("display_time")),
            "Arabic time response is missing the local display time",
        )

        show_calendar_payload = post_text(client, headers, "Hi Halo, show calendar")
        assert_true(
            show_calendar_payload["intent"] == "show_calendar",
            "Show calendar intent failed",
        )

        developer_payload = post_text(client, headers, "Hi Halo, who developed you?")
        assert_true(
            "Hilal Dallashi" in developer_payload["response"]
            and "Baraa Amro" in developer_payload["response"],
            "Developer response failed",
        )

        summary_payload = post_text(
            client,
            headers,
            "Hi Halo, explain yourself in 3 short sentences.",
        )
        assert_true(
            summary_payload["intent"] == "project_info",
            "Summary route failed",
        )
        assert_true(
            summary_payload["response"].count(".") >= 3,
            "Summary response was cut short",
        )

        title_prompt_payload = post_text(client, headers, ARABIC_EVENT_WITHOUT_TITLE)
        assert_true(
            title_prompt_payload["intent"] == "create_calendar_event",
            "Missing-title calendar route failed",
        )
        assert_true(
            title_prompt_payload["response"] == "\u0634\u0648 \u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0639\u062f\u061f",
            "Missing-title calendar clarification failed",
        )

        print("English time command works")
        print("Arabic time command works")
        print("Show calendar command works")
        print("Developer command works")
        print("Three-sentence summary works")
        print("Missing calendar title clarification works")
        return 0
    finally:
        client.close()
        engine.dispose()
        temp_dir.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
