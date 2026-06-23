from __future__ import annotations

import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def build_client():
    temp_dir = TemporaryDirectory()
    database_path = Path(temp_dir.name) / "assistant_text.db"
    os.environ["DATABASE_URL"] = f"sqlite:///{database_path}"
    os.environ["HALO_API_KEY"] = "test-halo-key"
    os.environ["HALO_DEV_API_KEY"] = "halo-local-dev-key"
    os.environ["HALO_FREEFORM_ASSISTANT_ENABLED"] = "false"

    from app.database import engine, init_database
    from app.main import app

    init_database()
    return temp_dir, engine, TestClient(app)


def post_text(client: TestClient, text: str) -> dict:
    response = client.post(
        "/api/assistant/text",
        headers={"X-API-Key": "test-halo-key"},
        json={"user_id": "test-user", "text": text},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_assistant_text_endpoints():
    temp_dir, engine, client = build_client()

    try:
        arabic_time = post_text(client, "Hi Halo, كم الساعة؟")
        assert arabic_time["category"] == "time_command"
        assert arabic_time["selected_tool"] == "get_current_time"
        assert arabic_time["tool_result"]["language"] == "ar"

        arabic_developers = post_text(client, "Hi Halo, مين طورك؟")
        assert arabic_developers["category"] == "project_question"
        assert arabic_developers["selected_tool"] == "project_info_tool"
        assert "هلال دلاشة" in arabic_developers["response"]

        arabic_overview = post_text(client, "Hi Halo, احكيلي عن مشروع المراية.")
        assert arabic_overview["category"] == "project_question"
        assert arabic_overview["selected_tool"] == "project_info_tool"
        assert "مرآة" in arabic_overview["response"] or "المراية" in arabic_overview["response"]

        english_time = post_text(client, "Hi Halo, what time is it?")
        assert english_time["category"] == "time_command"
        assert english_time["selected_tool"] == "get_current_time"
        assert english_time["tool_result"]["language"] == "en"

        english_developers = post_text(client, "Hi Halo, who developed you?")
        assert english_developers["response"] == "I was developed by Hilal Dallashi and Baraa Amro."

        english_overview = post_text(client, "Hi Halo, what is HALO MIRROR?")
        assert english_overview["category"] == "project_question"
        assert "smart home mirror system" in english_overview["response"].lower()

        turkish_time = post_text(client, "Hi Halo, saat kaç?")
        assert turkish_time["category"] == "time_command"
        assert turkish_time["selected_tool"] == "get_current_time"
        assert turkish_time["tool_result"]["language"] == "tr"

        turkish_developers = post_text(client, "Hi Halo, seni kim geliştirdi?")
        assert turkish_developers["category"] == "project_question"
        assert turkish_developers["selected_tool"] == "project_info_tool"
        assert "geliştirildim" in turkish_developers["response"]

        turkish_overview = post_text(client, "Hi Halo, HALO MIRROR nedir?")
        assert turkish_overview["category"] == "project_question"
        assert turkish_overview["selected_tool"] == "project_info_tool"
        assert "Akıllı Ev Ayna Sistemi" in turkish_overview["response"]

        show_calendar = post_text(client, "Hi Halo, show calendar.")
        assert show_calendar["category"] == "calendar_command"
        assert show_calendar["intent"] == "show_calendar"

        hide_weather = post_text(client, "Hi Halo, hide weather.")
        assert hide_weather["category"] == "weather_command"
        assert hide_weather["intent"] == "hide_weather"

        open_youtube = post_text(client, "Hi Halo, open YouTube.")
        assert open_youtube["category"] == "youtube_command"
        assert open_youtube["selected_tool"] == "open_youtube"

        add_meeting = post_text(client, "Hi Halo, add meeting tomorrow at 2 PM.")
        assert add_meeting["category"] == "calendar_command"
        assert add_meeting["selected_tool"] == "create_calendar_event"
        assert add_meeting["tool_result"]["event"]["title"] == "Meeting"
    finally:
        client.close()
        engine.dispose()
        temp_dir.cleanup()
