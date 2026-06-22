from __future__ import annotations

import calendar
import logging
import re
from dataclasses import dataclass, field
from datetime import date as date_type
from datetime import datetime, time as time_type, timedelta
from typing import Any

from sqlalchemy.orm import Session

from .storage import get_or_create_user_preference
from .tools.calendar_tool import (
    create_calendar_event as run_create_calendar_event,
    delete_calendar_event as run_delete_calendar_event,
    list_calendar_events as run_list_calendar_events,
)
from .tools.mirror_ui_tool import (
    control_mirror_widget as run_control_mirror_widget,
    hide_calendar as run_hide_calendar,
    hide_news as run_hide_news,
    hide_weather as run_hide_weather,
    refresh_mirror as run_refresh_mirror,
    screen_off as run_screen_off,
    screen_on as run_screen_on,
    show_calendar as run_show_calendar,
    show_news as run_show_news,
    show_weather as run_show_weather,
)
from .tools.reminders_tool import (
    create_reminder as run_create_reminder,
    delete_reminder as run_delete_reminder,
    list_reminders as run_list_reminders,
)
from .tools.time_tool import get_current_time as run_get_current_time
from .tools.weather_tool import get_weather as run_get_weather
from .tools.youtube_tool import open_youtube as run_open_youtube
from .wake_word import contains_wake_phrase, normalize_text, strip_wake_phrase

logger = logging.getLogger("halo.assistant")

MONTH_NAME_TO_NUMBER = {
    month.lower(): index
    for index, month in enumerate(calendar.month_name)
    if month
}

PROJECT_REPLIES = {
    "project": {
        "en": "HALO MIRROR is a smart home mirror that shows daily information and responds to voice commands.",
        "ar": "أنا HALO MIRROR، مرآة ذكية تعرض المعلومات اليومية وتستجيب للأوامر الصوتية.",
    },
    "developers": {
        "en": "I was developed by Hilal Dallashi and Baraa Amro.",
        "ar": "تم تطويري من قبل هلال دلاشة وبراء عمرو.",
    },
    "components": {
        "en": "I use a two-way mirror, display, Raspberry Pi 5, ESP32, BME280, PIR sensor, and a planned camera.",
        "ar": "أستخدم مرآة ثنائية الاتجاه وشاشة وRaspberry Pi 5 وESP32 وBME280 وحساس PIR وكاميرا مخططة.",
    },
    "architecture": {
        "en": "My architecture connects sensors and apps through a FastAPI backend, SQLite storage, and a React mirror dashboard.",
        "ar": "معماريتي تربط الحساسات والتطبيقات عبر FastAPI وSQLite ولوحة React الخاصة بالمرآة.",
    },
    "sensors": {
        "en": "My main sensors are BME280 for climate data and PIR for motion detection.",
        "ar": "الحساسات الأساسية عندي هي BME280 للطقس وPIR لاكتشاف الحركة.",
    },
    "data_flow": {
        "en": "Sensor data flows from ESP32 to FastAPI and then to the dashboard and mobile app.",
        "ar": "بيانات الحساسات تنتقل من ESP32 إلى FastAPI ثم إلى لوحة المرآة وتطبيق الهاتف.",
    },
    "risks": {
        "en": "My main risks are sensor delays, privacy concerns, heat, network failure, and dashboard sync issues.",
        "ar": "أهم المخاطر هي تأخر دمج الحساسات والخصوصية والحرارة وفشل الشبكة ومشاكل التزامن.",
    },
    "standards": {
        "en": "I considered MQTT, I2C, GDPR, KVKK, RoHS, WEEE, and responsible engineering standards.",
        "ar": "راعيت MQTT وI2C وGDPR وKVKK وRoHS وWEEE ومبادئ الهندسة المسؤولة.",
    },
}

PROJECT_TOPIC_PATTERNS = {
    "developers": (
        "who developed you",
        "who made you",
        "مين طورك",
        "مين عملك",
        "من طورك",
    ),
    "project": (
        "what is this project",
        "what are you",
        "tell me about this project",
        "شو هذا المشروع",
        "ما هذا المشروع",
        "مين انت",
    ),
    "components": (
        "what components do you use",
        "what hardware do you use",
        "شو المكونات",
        "ما المكونات",
    ),
    "architecture": (
        "what is your architecture",
        "system architecture",
        "شو المعمارية",
        "ما هي المعمارية",
    ),
    "sensors": (
        "what sensors are used",
        "what sensors do you use",
        "شو الحساسات",
        "ما هي الحساسات",
    ),
    "data_flow": (
        "what is the data flow",
        "data flow",
        "شو تدفق البيانات",
        "كيف تتدفق البيانات",
    ),
    "risks": (
        "what are the risks",
        "risks",
        "شو المخاطر",
        "ما المخاطر",
    ),
    "standards": (
        "what standards did you consider",
        "standards",
        "شو المعايير",
        "ما المعايير",
    ),
}


@dataclass(frozen=True)
class RoutedCommand:
    intent: str
    params: dict[str, Any] = field(default_factory=dict)
    clarification: str | None = None

    @property
    def needs_clarification(self) -> bool:
        return bool(self.clarification)


def _contains_arabic(text: str) -> bool:
    return bool(re.search(r"[\u0600-\u06FF]", text))


def _contains_any(text: str, phrases: tuple[str, ...]) -> bool:
    return any(phrase in text for phrase in phrases)


def _normalize_title_fallback(value: str, fallback: str) -> str:
    cleaned = normalize_text(value)
    if not cleaned or cleaned in {"a", "an", "the", "الساعة"}:
        return fallback
    return value.strip() or fallback


def _extract_relative_date(text: str, now: datetime) -> date_type | None:
    if _contains_any(text, ("tomorrow", "tmrw", "بكرا", "بكره", "غدا", "غداً")):
        return (now + timedelta(days=1)).date()
    if _contains_any(text, ("today", "اليوم")):
        return now.date()
    return None


def _extract_named_date(text: str, now: datetime) -> date_type | None:
    month_pattern = "|".join(MONTH_NAME_TO_NUMBER.keys())
    patterns = (
        rf"\b({month_pattern})\s+(\d{{1,2}})(?:\s*,?\s*(\d{{4}}))?\b",
        rf"\b(\d{{1,2}})\s+({month_pattern})(?:\s*,?\s*(\d{{4}}))?\b",
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        if str(match.group(1)).isdigit():
            day = int(match.group(1))
            month_name = str(match.group(2)).lower()
            year = int(match.group(3) or now.year)
        else:
            month_name = str(match.group(1)).lower()
            day = int(match.group(2))
            year = int(match.group(3) or now.year)
        return date_type(year, MONTH_NAME_TO_NUMBER[month_name], day)
    return None


def _extract_time(text: str) -> time_type | None:
    patterns = (
        r"(?:at|الساعة|ساعه|حوالي|عند)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|صباح|مساء|العصر|ليل)?",
        r"\b(\d{1,2})(?::(\d{2}))\s*(am|pm|a\.m\.|p\.m\.|صباح|مساء|العصر|ليل)?\b",
        r"\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.|صباح|مساء|العصر|ليل)\b",
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        groups = match.groups()
        hour = int(groups[0])
        minute = int(groups[1] or "0") if len(groups) > 1 else 0
        meridiem = (groups[2] or "").strip().lower() if len(groups) > 2 else ""
        if hour > 23 or minute > 59:
            return None
        if meridiem in {"pm", "p.m.", "مساء", "العصر", "ليل"} and hour < 12:
            hour += 12
        elif meridiem in {"am", "a.m.", "صباح"} and hour == 12:
            hour = 0
        elif not meridiem and 1 <= hour <= 7:
            hour += 12
        return time_type(hour=hour % 24, minute=minute)

    bare_match = re.search(r"\b(\d{1,2})\b", text)
    if not bare_match:
        return None
    hour = int(bare_match.group(1))
    if hour > 23:
        return None
    if 1 <= hour <= 7:
        hour += 12
    return time_type(hour=hour % 24, minute=0)


def _clean_title(command: str, patterns: tuple[str, ...]) -> str:
    cleaned = strip_wake_phrase(command)
    for pattern in patterns:
        cleaned = re.sub(pattern, " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^(a|an|the)\s+", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.-")
    return cleaned


def _extract_event_title(command: str) -> str:
    title = _clean_title(
        command,
        (
            r"^(add|create|schedule|book)\s+",
            r"\b(meeting|appointment|event)\b",
            r"\b(tomorrow|today)\b",
            r"\b(on\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?\b",
            r"\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b",
            r"\b(at|on)\b",
            r"^(حطلي|ضيف|أضف|اضف|سجل)\s+",
            r"\b(موعد|اجتماع|حدث)\b",
            r"\b(بكرا|بكره|غدا|غداً|اليوم)\b",
            r"\bالساعة\s*\d{1,2}(?::\d{2})?\b",
        ),
    )
    normalized = normalize_text(command)
    if title and normalize_text(title) not in {"a", "an", "the", "الساعة"}:
        return title
    if _contains_any(normalized, ("meeting", "اجتماع")):
        return "Meeting"
    if _contains_any(normalized, ("appointment", "موعد")):
        return "Appointment"
    return "Event"


def _extract_reminder_title(command: str) -> str:
    return _clean_title(
        command,
        (
            r"^(add|create)\s+",
            r"\b(reminder|remind me)\b",
            r"^(ذكرني|ضيف|أضف|اضف)\s+",
            r"\b(تذكير|ذكرني)\b",
            r"\b(tomorrow|today|بكرا|بكره|غدا|غداً|اليوم)\b",
            r"\b\d{1,2}(?::\d{2})?\s*(?:am|pm|صباح|مساء|العصر|ليل)?\b",
            r"\b(at|on|الساعة)\b",
        ),
    )


def _extract_title_target(command: str, nouns: tuple[str, ...]) -> str:
    cleaned = normalize_text(strip_wake_phrase(command))
    for noun in nouns:
        cleaned = cleaned.replace(noun, " ")
    cleaned = re.sub(r"\b(delete|remove|cancel|امسح|احذف|شيل|الغي)\b", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.-")
    return cleaned


def _project_reply(topic: str, command: str) -> str:
    language = "ar" if _contains_arabic(command) else "en"
    return PROJECT_REPLIES.get(topic, PROJECT_REPLIES["project"])[language]


def parse_command(command: str, *, now: datetime | None = None) -> RoutedCommand:
    current = now or datetime.now()
    original = strip_wake_phrase(command)
    normalized = normalize_text(original)

    if not normalized:
        return RoutedCommand("empty", clarification="What would you like me to do?")

    if _contains_any(
        normalized,
        (
            "what time is it",
            "time is it",
            "current time",
            "قديش الساعة",
            "كم الساعة",
            "الساعة كم",
        ),
    ):
        return RoutedCommand("get_current_time")

    for topic, phrases in PROJECT_TOPIC_PATTERNS.items():
        if _contains_any(normalized, phrases):
            return RoutedCommand("project_info", {"topic": topic})

    if _contains_any(
        normalized,
        ("show reminders", "list reminders", "my reminders", "اعرض التذكيرات", "شو التذكيرات"),
    ):
        return RoutedCommand("list_reminders")

    if _contains_any(
        normalized,
        ("delete event", "remove event", "delete calendar", "remove calendar event", "احذف موعد", "الغي الموعد"),
    ):
        target = _extract_title_target(
            original,
            ("event", "calendar", "appointment", "meeting", "موعد", "اجتماع"),
        )
        if not target:
            return RoutedCommand("delete_calendar_event", clarification="Which event should I delete?")
        return RoutedCommand("delete_calendar_event", {"title_query": target})

    if _contains_any(normalized, ("delete reminder", "remove reminder", "احذف التذكير", "امسح التذكير")):
        target = _extract_title_target(original, ("reminder", "التذكير"))
        if not target:
            return RoutedCommand("delete_reminder", clarification="Which reminder should I delete?")
        return RoutedCommand("delete_reminder", {"title_query": target})

    if _contains_any(normalized, ("reminder", "remind me", "تذكير", "ذكرني")) and _contains_any(
        normalized, ("add", "create", "ذكرني", "ضيف", "أضف", "اضف")
    ):
        target_date = _extract_relative_date(normalized, current) or _extract_named_date(normalized, current)
        target_time = _extract_time(normalized)
        title = _extract_reminder_title(original)
        if not title:
            return RoutedCommand("add_reminder", clarification="What should I remind you about?")
        if target_time is None:
            return RoutedCommand("add_reminder", clarification="What time should I set the reminder for?")
        if target_date is None:
            target_date = current.date()
        return RoutedCommand(
            "add_reminder",
            {"title": title, "datetime": datetime.combine(target_date, target_time)},
        )

    target_date = _extract_relative_date(normalized, current) or _extract_named_date(normalized, current)
    target_time = _extract_time(normalized)

    if _contains_any(normalized, ("calendar", "meeting", "appointment", "event", "موعد", "اجتماع")) and _contains_any(
        normalized, ("add", "create", "schedule", "book", "حطلي", "ضيف", "أضف", "اضف", "سجل")
    ):
        title = _extract_event_title(original)
        if not title:
            return RoutedCommand("create_calendar_event", clarification="What should I call the event?")
        if target_time is None:
            return RoutedCommand("create_calendar_event", clarification="What time should I set it for?")
        if target_date is None:
            return RoutedCommand("create_calendar_event", clarification="Which day should I schedule it for?")
        return RoutedCommand(
            "create_calendar_event",
            {"title": title, "start_time": datetime.combine(target_date, target_time)},
        )

    if _contains_any(normalized, ("add", "create", "schedule", "book", "حطلي", "ضيف", "أضف", "اضف", "سجل")) and (
        target_date is not None or target_time is not None
    ):
        title = _extract_event_title(original)
        if target_time is None:
            return RoutedCommand("create_calendar_event", clarification="What time should I set it for?")
        if target_date is None:
            return RoutedCommand("create_calendar_event", clarification="Which day should I schedule it for?")
        return RoutedCommand(
            "create_calendar_event",
            {"title": title, "start_time": datetime.combine(target_date, target_time)},
        )

    if _contains_any(normalized, ("show calendar", "show my calendar", "open calendar", "اعرض التقويم", "افتح التقويم")):
        return RoutedCommand("control_mirror_widget", {"widgetName": "calendar", "visible": True})

    if _contains_any(normalized, ("hide calendar", "اخفي التقويم", "سكر التقويم")):
        return RoutedCommand("control_mirror_widget", {"widgetName": "calendar", "visible": False})

    if _contains_any(normalized, ("list calendar", "calendar today", "what is on my calendar", "شو عندي اليوم")):
        return RoutedCommand("list_calendar_events", {"date": current.date()})

    if _contains_any(normalized, ("refresh mirror", "reload mirror", "update mirror", "حدث المرآة", "اعمل تحديث")):
        return RoutedCommand("refresh_mirror")

    if _contains_any(normalized, ("screen off", "turn screen off", "طفي الشاشة", "سكر الشاشة")):
        return RoutedCommand("control_screen", {"action": "off"})

    if _contains_any(normalized, ("screen on", "turn screen on", "شغل الشاشة", "افتح الشاشة")):
        return RoutedCommand("control_screen", {"action": "on"})

    if _contains_any(normalized, ("weather", "الطقس", "جو")):
        if _contains_any(normalized, ("show", "open", "اعرض", "افتح")):
            return RoutedCommand("control_mirror_widget", {"widgetName": "weather", "visible": True})
        if _contains_any(normalized, ("hide", "close", "اخفي", "سكر")):
            return RoutedCommand("control_mirror_widget", {"widgetName": "weather", "visible": False})
        return RoutedCommand("get_weather")

    widget_aliases = {
        "calendar": ("calendar", "التقويم"),
        "youtube": ("youtube", "يوتيوب"),
        "clock": ("clock", "time widget", "الساعة"),
        "news": ("news", "الأخبار", "اخبار"),
        "reminders": ("reminders", "التذكيرات"),
    }
    for widget_name, aliases in widget_aliases.items():
        if _contains_any(normalized, aliases):
            if _contains_any(normalized, ("show", "open", "اعرض", "افتح")):
                return RoutedCommand("control_mirror_widget", {"widgetName": widget_name, "visible": True})
            if _contains_any(normalized, ("hide", "close", "اخفي", "سكر")):
                return RoutedCommand("control_mirror_widget", {"widgetName": widget_name, "visible": False})

    if "youtube" in normalized or "يوتيوب" in normalized:
        if _contains_any(normalized, ("search", "play", "ابحث", "شغل")):
            query = _clean_title(
                original,
                (
                    r"^(open|show|search|play)\s+",
                    r"\byoutube\b",
                    r"^(افتح|اعرض|ابحث|شغل)\s+",
                    r"\bيوتيوب\b",
                ),
            )
            return RoutedCommand("open_youtube", {"query": query or None})
        return RoutedCommand("open_youtube")

    return RoutedCommand("unsupported", clarification="I need a clearer command.")


def execute_assistant_text_command(
    *,
    db: Session,
    text: str,
    user_id: str = "mirror-local",
    account_name: str | None = None,
) -> dict[str, Any]:
    original_text = str(text or "").strip()
    wake_detected = contains_wake_phrase(original_text)
    command_text = strip_wake_phrase(original_text) if wake_detected else original_text

    logger.info("wake phrase detected: %s", "yes" if wake_detected else "no")
    logger.info("user text: %s", original_text[:240])

    get_or_create_user_preference(db, user_id, account_name)

    if wake_detected and not command_text:
        final_payload = {
            "wake_detected": True,
            "intent": "wake_greeting",
            "tool_result": {},
            "response": "أكيد، سامعك." if _contains_arabic(original_text) else "Yes, I'm listening.",
            "selected_tool": None,
        }
        logger.info("selected intent: %s", final_payload["intent"])
        logger.info("final response: %s", final_payload["response"])
        return final_payload

    routed = parse_command(command_text or original_text)
    logger.info("selected intent: %s", routed.intent)

    if routed.needs_clarification:
        final_payload = {
            "wake_detected": wake_detected,
            "intent": routed.intent,
            "tool_result": {},
            "response": routed.clarification or "Please clarify.",
            "selected_tool": None,
        }
        logger.info("final response: %s", final_payload["response"])
        return final_payload

    if routed.intent == "project_info":
        final_payload = {
            "wake_detected": wake_detected,
            "intent": "project_info",
            "tool_result": {"topic": routed.params.get("topic")},
            "response": _project_reply(str(routed.params.get("topic") or "project"), original_text),
            "selected_tool": None,
        }
        logger.info("final response: %s", final_payload["response"])
        return final_payload

    selected_tool = routed.intent
    params = dict(routed.params)
    logger.info("tool arguments: %s", params)

    if routed.intent == "get_current_time":
        tool_result = run_get_current_time()
    elif routed.intent == "create_calendar_event":
        tool_result = run_create_calendar_event(
            db,
            title=_normalize_title_fallback(str(params["title"]), "Event"),
            start_datetime=params["start_time"],
            end_datetime=params.get("end_time"),
            notes=params.get("notes"),
        )
        selected_tool = "create_calendar_event"
    elif routed.intent == "list_calendar_events":
        tool_result = run_list_calendar_events(db, target_date=params.get("date"))
        selected_tool = "list_calendar_events"
    elif routed.intent == "delete_calendar_event":
        tool_result = run_delete_calendar_event(
            db,
            event_id=params.get("event_id"),
            title_query=params.get("title_query"),
        )
        selected_tool = "delete_calendar_event"
    elif routed.intent == "add_reminder":
        tool_result = run_create_reminder(
            db,
            title=_normalize_title_fallback(str(params["title"]), "Reminder"),
            remind_at=params.get("datetime"),
            notes=params.get("notes"),
        )
        selected_tool = "create_reminder"
    elif routed.intent == "list_reminders":
        tool_result = run_list_reminders(db, target_date=params.get("date"))
        selected_tool = "list_reminders"
    elif routed.intent == "delete_reminder":
        tool_result = run_delete_reminder(
            db,
            reminder_id=params.get("reminder_id"),
            title_query=params.get("title_query"),
        )
        selected_tool = "delete_reminder"
    elif routed.intent == "control_mirror_widget":
        widget_name = str(params["widgetName"])
        visible = bool(params["visible"])
        action = "show" if visible else "hide"
        tool_result = run_control_mirror_widget(db, widget=widget_name, action=action)
        if widget_name == "calendar":
            selected_tool = "show_calendar" if visible else "hide_calendar"
            tool_result = run_show_calendar(db) if visible else run_hide_calendar(db)
        elif widget_name == "weather":
            selected_tool = "show_weather" if visible else "hide_weather"
            tool_result = run_show_weather(db) if visible else run_hide_weather(db)
        elif widget_name == "news":
            selected_tool = "show_news" if visible else "hide_news"
            tool_result = run_show_news(db) if visible else run_hide_news(db)
    elif routed.intent == "control_screen":
        if params.get("action") == "on":
            selected_tool = "screen_on"
            tool_result = run_screen_on()
        else:
            selected_tool = "screen_off"
            tool_result = run_screen_off()
    elif routed.intent == "refresh_mirror":
        selected_tool = "refresh_mirror"
        tool_result = run_refresh_mirror(db)
    elif routed.intent == "open_youtube":
        selected_tool = "open_youtube"
        tool_result = run_open_youtube(db, query=params.get("query"))
    elif routed.intent == "get_weather":
        selected_tool = "get_weather"
        tool_result = run_get_weather()
    else:
        final_payload = {
            "wake_detected": wake_detected,
            "intent": "unsupported",
            "tool_result": {},
            "response": "I need a clearer command.",
            "selected_tool": None,
        }
        logger.info("final response: %s", final_payload["response"])
        return final_payload

    logger.info("selected tool: %s", selected_tool)
    logger.info("tool result: %s", tool_result)

    final_payload = {
        "wake_detected": wake_detected,
        "intent": selected_tool,
        "tool_result": tool_result.get("data", {}),
        "response": tool_result.get("reply", "Done."),
        "selected_tool": selected_tool,
    }
    logger.info("final response: %s", final_payload["response"])
    return final_payload
