"""HALO assistant tool registry."""

from __future__ import annotations

from .calendar_tool import create_calendar_event, delete_calendar_event, list_calendar_events
from .general_answer_tool import general_answer_tool
from .mirror_ui_tool import control_mirror_widget, control_screen, refresh_mirror, screen_off, screen_on
from .project_info_tool import project_info_tool
from .reminders_tool import create_reminder, delete_reminder, list_reminders
from .time_tool import get_current_time
from .weather_tool import get_weather
from .youtube_tool import open_youtube


def get_assistant_tool_definitions() -> list[dict]:
    return [
        {
            "type": "function",
            "name": "get_current_time",
            "description": "Get the current local time for the mirror user.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
        {
            "type": "function",
            "name": "project_info_tool",
            "description": "Answer HALO MIRROR project questions using the stored project knowledge.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "topic": {"type": "string"},
                },
                "required": ["question"],
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "general_answer_tool",
            "description": "Answer general knowledge questions professionally and concisely.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                },
                "required": ["question"],
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "create_calendar_event",
            "description": "Create a calendar event in local storage.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "start_datetime": {"type": "string"},
                    "end_datetime": {"type": "string"},
                    "notes": {"type": "string"},
                },
                "required": ["title", "start_datetime"],
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "list_calendar_events",
            "description": "List saved calendar events for a given day.",
            "parameters": {
                "type": "object",
                "properties": {
                    "target_date": {"type": "string"},
                },
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "delete_calendar_event",
            "description": "Delete a calendar event by id or title phrase.",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {"type": "integer"},
                    "title_query": {"type": "string"},
                },
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "create_reminder",
            "description": "Create a reminder in local storage.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "remind_at": {"type": "string"},
                    "notes": {"type": "string"},
                },
                "required": ["title"],
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "list_reminders",
            "description": "List reminders from local storage.",
            "parameters": {
                "type": "object",
                "properties": {
                    "target_date": {"type": "string"},
                },
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "delete_reminder",
            "description": "Delete a reminder by id or title phrase.",
            "parameters": {
                "type": "object",
                "properties": {
                    "reminder_id": {"type": "integer"},
                    "title_query": {"type": "string"},
                },
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "get_weather",
            "description": "Read the current configured weather data.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
        {
            "type": "function",
            "name": "control_mirror_widget",
            "description": "Show, hide, or toggle mirror dashboard widgets.",
            "parameters": {
                "type": "object",
                "properties": {
                    "widget": {
                        "type": "string",
                        "enum": ["clock", "weather", "calendar", "news", "youtube", "reminders"],
                    },
                    "action": {
                        "type": "string",
                        "enum": ["show", "hide", "toggle"],
                    },
                },
                "required": ["widget", "action"],
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "open_youtube",
            "description": "Open YouTube, optionally with a search query.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                },
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "control_screen",
            "description": "Turn the mirror screen on or off.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["on", "off"]},
                },
                "required": ["action"],
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "refresh_mirror",
            "description": "Request a mirror dashboard refresh.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    ]


__all__ = [
    "create_calendar_event",
    "create_reminder",
    "control_mirror_widget",
    "control_screen",
    "delete_calendar_event",
    "delete_reminder",
    "general_answer_tool",
    "get_assistant_tool_definitions",
    "get_current_time",
    "get_weather",
    "list_calendar_events",
    "list_reminders",
    "open_youtube",
    "project_info_tool",
    "refresh_mirror",
    "screen_off",
    "screen_on",
]
