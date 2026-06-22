from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from assistant.command_router import execute_assistant_text_command, parse_command
from assistant.wake_word import contains_wake_phrase
from app.database import Base
from app.models import MirrorModuleSettings


def build_test_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autocommit=False, autoflush=False)()
    session.add(MirrorModuleSettings(id=1))
    session.commit()
    return session


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    session = build_test_session()

    assert_true(contains_wake_phrase("Hi Halo"), "Wake phrase detection failed")
    wake_route = parse_command("Hi Halo, what time is it?")
    assert_true(wake_route.intent == "get_current_time", "English time routing failed")

    arabic_route = parse_command("Hi Halo, قديش الساعة؟")
    assert_true(arabic_route.intent == "get_current_time", "Arabic time routing failed")

    time_result = execute_assistant_text_command(
        db=session,
        user_id="test-user",
        text="Hi Halo, what time is it?",
    )
    assert_true(time_result["intent"] == "get_current_time", "Time tool execution failed")
    assert_true(len(time_result.get("response", "")) <= 80, "Time reply is too long")

    calendar_result = execute_assistant_text_command(
        db=session,
        user_id="test-user",
        text="Hi Halo, add project presentation today at 10 AM",
    )
    assert_true(calendar_result["intent"] == "create_calendar_event", "Calendar creation failed")

    list_result = execute_assistant_text_command(
        db=session,
        user_id="test-user",
        text="Hi Halo, what is on my calendar",
    )
    assert_true(list_result["intent"] == "list_calendar_events", "Calendar listing failed")
    assert_true(len(list_result["tool_result"]["events"]) >= 1, "Calendar event was not stored")

    show_result = execute_assistant_text_command(
        db=session,
        user_id="test-user",
        text="Hi Halo, show my calendar",
    )
    assert_true(show_result["intent"] == "show_calendar", "Show widget failed")

    hide_result = execute_assistant_text_command(
        db=session,
        user_id="test-user",
        text="Hi Halo, hide calendar",
    )
    assert_true(hide_result["intent"] == "hide_calendar", "Hide widget failed")

    print("Wake phrase detection works")
    print("English time command works")
    print("Arabic time command works")
    print("Calendar creation works")
    print("Calendar listing works")
    print("Mirror widget control works")
    print("Short response behavior works")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
