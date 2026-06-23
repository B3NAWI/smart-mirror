from __future__ import annotations

import calendar
import logging
import re
from dataclasses import dataclass, field
from datetime import date as date_type
from datetime import datetime, time as time_type, timedelta
from typing import Any

from sqlalchemy.orm import Session

from assistant.behavior_config import MAX_PROJECT_CONTEXT_CHARS, MAX_TOOL_OUTPUT_CHARS, MAX_USER_TEXT_CHARS
from assistant.language import detect_language
from assistant.project_knowledge import detect_project_topic
from assistant.tools.calendar_tool import create_calendar_event, delete_calendar_event, list_calendar_events
from assistant.tools.general_answer_tool import general_answer_tool
from assistant.tools.mirror_ui_tool import control_mirror_widget, refresh_mirror, screen_off, screen_on
from assistant.tools.project_info_tool import project_info_tool
from assistant.tools.reminders_tool import create_reminder, delete_reminder, list_reminders
from assistant.tools.time_tool import get_current_time
from assistant.tools.weather_tool import get_weather
from assistant.tools.youtube_tool import open_youtube
from assistant.wake_word import contains_wake_phrase, normalize_text, strip_wake_phrase

logger = logging.getLogger("halo.assistant")

MONTH_NAME_TO_NUMBER = {
    month.lower(): index
    for index, month in enumerate(calendar.month_name)
    if month
}

GENERAL_QUESTION_MARKERS = (
    "what is ",
    "what are ",
    "explain ",
    "define ",
    "how does ",
    "شو يعني",
    "ما هو",
    "ما هي",
    "اشرح",
    "nedir",
    "açıkla",
    "acikla",
)

PROJECT_TRIGGER_PHRASES = (
    "halo mirror",
    "mirror project",
    "smart mirror",
    "المراية",
    "المرآة",
    "المشروع",
    "akıllı ayna",
    "akilli ayna",
    "ayna projesi",
)

WIDGET_ALIASES = {
    "clock": ("clock", "time widget", "الساعة", "saat"),
    "weather": ("weather", "الطقس", "جو", "hava durumu"),
    "calendar": ("calendar", "التقويم", "takvim"),
    "news": ("news", "الأخبار", "اخبار", "haberler"),
    "youtube": ("youtube", "يوتيوب"),
    "reminders": ("reminders", "التذكيرات", "hatırlatmalar", "hatirlatmalar"),
}


@dataclass(frozen=True)
class RoutedCommand:
    category: str
    intent: str
    tool_name: str | None = None
    params: dict[str, Any] = field(default_factory=dict)
    clarification: str | None = None

    @property
    def needs_clarification(self) -> bool:
        return bool(self.clarification)


def _localized_text(language: str, *, en: str, ar: str, tr: str) -> str:
    if language == "ar":
        return ar
    if language == "tr":
        return tr
    return en


def _contains_any(text: str, phrases: tuple[str, ...]) -> bool:
    return any(phrase in text for phrase in phrases)


def _extract_relative_date(text: str, now: datetime) -> date_type | None:
    if _contains_any(text, ("tomorrow", "tmrw", "بكرا", "بكره", "غدا", "غداً", "yarın", "yarin")):
        return (now + timedelta(days=1)).date()
    if _contains_any(text, ("today", "اليوم", "bugün", "bugun")):
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
        r"(?:at|الساعة|حوالي|عند|saat)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|صباح|مساء|العصر|ليل)?",
        r"\b(\d{1,2})(?::(\d{2}))\s*(am|pm|a\.m\.|p\.m\.|صباح|مساء|العصر|ليل)?\b",
        r"\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.|صباح|مساء|العصر|ليل)\b",
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        hour = int(match.group(1))
        minute = int(match.group(2) or "0") if match.lastindex and match.lastindex >= 2 else 0
        meridiem = str(match.group(3) or "").strip().lower() if match.lastindex and match.lastindex >= 3 else ""
        if hour > 23 or minute > 59:
            return None
        if meridiem in {"pm", "p.m.", "مساء", "العصر", "ليل"} and hour < 12:
            hour += 12
        elif meridiem in {"am", "a.m.", "صباح"} and hour == 12:
            hour = 0
        return time_type(hour=hour % 24, minute=minute)
    return None


def _clean_title(command: str, patterns: tuple[str, ...]) -> str:
    cleaned = strip_wake_phrase(command)
    for pattern in patterns:
        cleaned = re.sub(pattern, " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.-")
    return cleaned


def _extract_event_title(command: str) -> str:
    title = _clean_title(
        command,
        (
            r"^(add|create|schedule|book|ekle)\s+",
            r"\b(meeting|appointment|event|toplanti|toplantı|etkinlik)\b",
            r"\b(tomorrow|today|بكرا|بكره|غدا|غداً|اليوم|yarın|yarin|bugün|bugun)\b",
            r"\b(on\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?\b",
            r"\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b",
            r"\b(at|on|الساعة|عند|saat)\b",
            r"^(حطلي|ضيف|أضف|اضف|سجل)\s+",
            r"\b(موعد|اجتماع|حدث)\b",
        ),
    )
    normalized = normalize_text(command)
    if title:
        return title
    if "meeting" in normalized or "اجتماع" in normalized or "toplantı" in normalized or "toplanti" in normalized:
        return "Meeting"
    if "appointment" in normalized or "موعد" in normalized:
        return "Appointment"
    return "Event"


def _extract_reminder_title(command: str) -> str:
    title = _clean_title(
        command,
        (
            r"^(add|create|ekle)\s+",
            r"\b(reminder|remind me|hatırlatıcı|hatirlatici)\b",
            r"^(ذكرني|ضيف|أضف|اضف)\s+",
            r"\b(تذكير|ذكرني)\b",
            r"\b(tomorrow|today|بكرا|بكره|غدا|غداً|اليوم|yarın|yarin|bugün|bugun)\b",
            r"\b\d{1,2}(?::\d{2})?\s*(?:am|pm|صباح|مساء|العصر|ليل)?\b",
            r"\b(at|on|الساعة|saat)\b",
        ),
    )
    return title or "Reminder"


def _extract_title_target(command: str, nouns: tuple[str, ...]) -> str:
    cleaned = normalize_text(strip_wake_phrase(command))
    for noun in nouns:
        cleaned = cleaned.replace(noun, " ")
    cleaned = re.sub(r"\b(delete|remove|cancel|امسح|احذف|شيل|الغي|sil|kaldır|kaldir|iptal)\b", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.-")
    return cleaned


def _trim_text(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return f"{value[: max(limit - 1, 0)].rstrip()}…"


def _trim_tool_payload(value: Any, *, remaining_chars: int = MAX_TOOL_OUTPUT_CHARS) -> Any:
    if remaining_chars <= 0:
        return "…"
    if isinstance(value, str):
        return _trim_text(value, remaining_chars)
    if isinstance(value, list):
        items = []
        budget = remaining_chars
        for item in value:
            trimmed = _trim_tool_payload(item, remaining_chars=budget)
            items.append(trimmed)
            budget -= len(str(trimmed))
            if budget <= 0:
                break
        return items
    if isinstance(value, dict):
        result = {}
        budget = remaining_chars
        for key, item in value.items():
            trimmed = _trim_tool_payload(item, remaining_chars=budget)
            result[key] = trimmed
            budget -= len(str(key)) + len(str(trimmed))
            if budget <= 0:
                break
        return result
    return value


def parse_command(command: str, *, now: datetime | None = None) -> RoutedCommand:
    current = now or datetime.now()
    original = strip_wake_phrase(command)
    normalized = normalize_text(original)
    language = detect_language(original)

    if not normalized:
        return RoutedCommand(
            category="general_question",
            intent="wake_greeting",
            clarification=_localized_text(
                language,
                en="What would you like me to do?",
                ar="شو بدك أعمل؟",
                tr="Ne yapmamı istersin?",
            ),
        )

    if _contains_any(
        normalized,
        (
            "what time is it",
            "time is it",
            "current time",
            "قديش الساعة",
            "كم الساعة",
            "الساعة كم",
            "saat kaç",
            "saat kac",
        ),
    ):
        return RoutedCommand("time_command", "get_current_time", "get_current_time")

    project_topic = detect_project_topic(original)
    if project_topic or _contains_any(normalized, PROJECT_TRIGGER_PHRASES):
        return RoutedCommand(
            "project_question",
            f"project_{project_topic or 'overview'}",
            "project_info_tool",
            {"question": original, "topic": project_topic or "overview"},
        )

    if _contains_any(normalized, ("show reminders", "list reminders", "my reminders", "اعرض التذكيرات", "شو التذكيرات", "hatırlatmaları göster", "hatirlatmalari goster")):
        return RoutedCommand("reminder_command", "list_reminders", "list_reminders")

    if _contains_any(normalized, ("delete reminder", "remove reminder", "احذف التذكير", "امسح التذكير", "hatırlatıcıyı sil", "hatirlaticiyi sil")):
        target = _extract_title_target(original, ("reminder", "التذكير", "hatırlatıcı", "hatirlatici"))
        if not target:
            return RoutedCommand(
                "reminder_command",
                "delete_reminder",
                clarification=_localized_text(
                    language,
                    en="Which reminder should I delete?",
                    ar="أي تذكير بدك أحذف؟",
                    tr="Hangi hatırlatıcıyı sileyim?",
                ),
            )
        return RoutedCommand("reminder_command", "delete_reminder", "delete_reminder", {"title_query": target})

    if _contains_any(normalized, ("reminder", "remind me", "تذكير", "ذكرني", "hatırlatıcı", "hatirlat")) and _contains_any(
        normalized, ("add", "create", "ذكرني", "ضيف", "أضف", "اضف", "ekle")
    ):
        target_date = _extract_relative_date(normalized, current) or _extract_named_date(normalized, current)
        target_time = _extract_time(normalized)
        title = _extract_reminder_title(original)
        return RoutedCommand(
            "reminder_command",
            "create_reminder",
            "create_reminder",
            {
                "title": title,
                "datetime": datetime.combine(target_date or current.date(), target_time or time_type(hour=9)),
            },
        )

    if _contains_any(normalized, ("delete event", "remove event", "delete calendar", "احذف موعد", "الغي الموعد", "etkinliği sil", "toplantıyı sil", "toplantiyi sil")):
        target = _extract_title_target(original, ("event", "calendar", "appointment", "meeting", "موعد", "اجتماع", "takvim", "etkinlik", "toplantı", "toplanti"))
        if not target:
            return RoutedCommand(
                "calendar_command",
                "delete_calendar_event",
                clarification=_localized_text(
                    language,
                    en="Which event should I delete?",
                    ar="أي موعد بدك أحذف؟",
                    tr="Hangi etkinliği sileyim?",
                ),
            )
        return RoutedCommand("calendar_command", "delete_calendar_event", "delete_calendar_event", {"title_query": target})

    target_date = _extract_relative_date(normalized, current) or _extract_named_date(normalized, current)
    target_time = _extract_time(normalized)
    if _contains_any(normalized, ("calendar", "meeting", "appointment", "event", "موعد", "اجتماع", "takvim", "toplantı", "toplanti", "etkinlik")) and _contains_any(
        normalized, ("add", "create", "schedule", "book", "حطلي", "ضيف", "أضف", "اضف", "سجل", "ekle")
    ):
        title = _extract_event_title(original)
        if target_date is None:
            return RoutedCommand(
                "calendar_command",
                "create_calendar_event",
                clarification=_localized_text(
                    language,
                    en="Which day should I schedule it for?",
                    ar="لأي يوم أحطه؟",
                    tr="Hangi gün için planlayayım?",
                ),
            )
        if target_time is None:
            return RoutedCommand(
                "calendar_command",
                "create_calendar_event",
                clarification=_localized_text(
                    language,
                    en="What time should I set it for?",
                    ar="أي ساعة أحطه؟",
                    tr="Saat kaçta ayarlayayım?",
                ),
            )
        return RoutedCommand(
            "calendar_command",
            "create_calendar_event",
            "create_calendar_event",
            {"title": title, "start_time": datetime.combine(target_date, target_time)},
        )

    if _contains_any(normalized, ("show calendar", "open calendar", "اعرض التقويم", "افتح التقويم", "takvimi göster", "takvimi goster")):
        return RoutedCommand("calendar_command", "show_calendar", "control_mirror_widget", {"widget": "calendar", "action": "show"})
    if _contains_any(normalized, ("hide calendar", "اخفي التقويم", "سكر التقويم", "takvimi gizle")):
        return RoutedCommand("calendar_command", "hide_calendar", "control_mirror_widget", {"widget": "calendar", "action": "hide"})
    if _contains_any(normalized, ("list calendar", "calendar today", "what is on my calendar", "شو عندي اليوم", "takvimi listele")):
        return RoutedCommand("calendar_command", "list_calendar_events", "list_calendar_events", {"date": current.date()})

    if _contains_any(normalized, ("weather", "الطقس", "جو", "hava durumu")):
        if _contains_any(normalized, ("show", "open", "اعرض", "افتح", "göster", "goster", "aç", "ac")):
            return RoutedCommand("weather_command", "show_weather", "control_mirror_widget", {"widget": "weather", "action": "show"})
        if _contains_any(normalized, ("hide", "close", "اخفي", "سكر", "gizle", "kapat")):
            return RoutedCommand("weather_command", "hide_weather", "control_mirror_widget", {"widget": "weather", "action": "hide"})
        return RoutedCommand("weather_command", "get_weather", "get_weather")

    if "youtube" in normalized or "يوتيوب" in normalized:
        if _contains_any(normalized, ("hide", "close", "اخفي", "سكر", "gizle", "kapat")):
            return RoutedCommand("mirror_ui_command", "hide_youtube", "control_mirror_widget", {"widget": "youtube", "action": "hide"})

        query = _clean_title(
            original,
            (
                r"^(open|show|search|play|aç|ac)\s+",
                r"\byoutube\b",
                r"^(افتح|اعرض|ابحث|شغل)\s+",
                r"\bيوتيوب\b",
            ),
        )
        return RoutedCommand("youtube_command", "open_youtube", "open_youtube", {"query": query or None})

    for widget_name, aliases in WIDGET_ALIASES.items():
        if _contains_any(normalized, aliases):
            if _contains_any(normalized, ("show", "open", "اعرض", "افتح", "göster", "goster", "aç", "ac")):
                return RoutedCommand("mirror_ui_command", f"show_{widget_name}", "control_mirror_widget", {"widget": widget_name, "action": "show"})
            if _contains_any(normalized, ("hide", "close", "اخفي", "سكر", "gizle", "kapat")):
                return RoutedCommand("mirror_ui_command", f"hide_{widget_name}", "control_mirror_widget", {"widget": widget_name, "action": "hide"})

    if _contains_any(normalized, ("refresh mirror", "reload mirror", "update mirror", "حدث المراية", "حدث المرآة", "aynayi yenile", "aynayı yenile")):
        return RoutedCommand("mirror_ui_command", "refresh_mirror", "refresh_mirror")
    if _contains_any(normalized, ("screen off", "turn screen off", "طفي الشاشة", "سكر الشاشة", "ekrani kapat", "ekranı kapat")):
        return RoutedCommand("screen_command", "screen_off", "control_screen", {"action": "off"})
    if _contains_any(normalized, ("screen on", "turn screen on", "شغل الشاشة", "افتح الشاشة", "ekrani ac", "ekranı aç")):
        return RoutedCommand("screen_command", "screen_on", "control_screen", {"action": "on"})

    if normalized.endswith("?") or any(marker in normalized for marker in GENERAL_QUESTION_MARKERS):
        return RoutedCommand("general_question", "general_answer", "general_answer_tool", {"question": original})

    return RoutedCommand("general_question", "general_answer", "general_answer_tool", {"question": original})


def _finalize_tool_response(*, routed: RoutedCommand, tool_result: dict[str, Any], language: str) -> str:
    if tool_result.get("reply"):
        return str(tool_result["reply"])

    if routed.intent == "show_calendar":
        return _localized_text(language, en="Showing calendar.", ar="أظهرت التقويم.", tr="Takvimi gösteriyorum.")
    if routed.intent == "hide_weather":
        return _localized_text(language, en="Hiding weather.", ar="أخفيت الطقس.", tr="Hava durumunu gizliyorum.")
    if routed.intent == "show_weather":
        return _localized_text(language, en="Showing weather.", ar="أظهرت الطقس.", tr="Hava durumunu gösteriyorum.")
    if routed.intent == "screen_on":
        return _localized_text(language, en="Screen is on.", ar="شغلت الشاشة.", tr="Ekranı açtım.")
    if routed.intent == "screen_off":
        return _localized_text(language, en="Screen is off.", ar="طفّيت الشاشة.", tr="Ekranı kapattım.")
    return _localized_text(language, en="Done.", ar="تم.", tr="Tamamlandı.")


def execute_assistant_text_command(
    *,
    db: Session,
    text: str,
    user_id: str = "mirror-local",
    account_name: str | None = None,
) -> dict[str, Any]:
    del user_id, account_name
    original_text = str(text or "").strip()
    language = detect_language(original_text)

    if len(original_text) > MAX_USER_TEXT_CHARS:
        return {
            "wake_detected": contains_wake_phrase(original_text),
            "category": "general_question",
            "intent": "input_too_long",
            "tool_result": {
                "max_user_text_chars": MAX_USER_TEXT_CHARS,
                "max_project_context_chars": MAX_PROJECT_CONTEXT_CHARS,
                "language": language,
            },
            "response": _localized_text(
                language,
                en="That request is too long. Please ask in a shorter way.",
                ar="الطلب طويل جداً. احكيه بشكل أقصر.",
                tr="Bu istek çok uzun. Lütfen daha kısa şekilde sor.",
            ),
            "selected_tool": None,
        }

    wake_detected = contains_wake_phrase(original_text)
    command_text = strip_wake_phrase(original_text) if wake_detected else original_text
    routed = parse_command(original_text)

    logger.info("assistant category: %s", routed.category)
    logger.info("assistant intent: %s", routed.intent)

    if wake_detected and not command_text:
        return {
            "wake_detected": True,
            "category": "general_question",
            "intent": "wake_greeting",
            "tool_result": {"language": language},
            "response": _localized_text(
                language,
                en="Yes, I'm listening.",
                ar="أكيد، سامعك.",
                tr="Evet, dinliyorum.",
            ),
            "selected_tool": None,
        }

    if routed.needs_clarification:
        return {
            "wake_detected": wake_detected,
            "category": routed.category,
            "intent": routed.intent,
            "tool_result": {"language": language},
            "response": routed.clarification or _localized_text(
                language,
                en="Please clarify.",
                ar="وضحلي أكثر.",
                tr="Lütfen biraz daha açık söyler misin?",
            ),
            "selected_tool": None,
        }

    selected_tool = routed.tool_name
    if routed.tool_name == "project_info_tool":
        tool_result = project_info_tool(routed.params.get("question") or original_text, topic=routed.params.get("topic"))
    elif routed.tool_name == "general_answer_tool":
        tool_result = general_answer_tool(routed.params.get("question") or original_text)
    elif routed.tool_name == "get_current_time":
        tool_result = get_current_time(language=language)
    elif routed.tool_name == "create_calendar_event":
        tool_result = create_calendar_event(db, title=str(routed.params["title"]).strip() or "Event", start_datetime=routed.params["start_time"])
    elif routed.tool_name == "list_calendar_events":
        tool_result = list_calendar_events(db, target_date=routed.params.get("date"))
    elif routed.tool_name == "delete_calendar_event":
        tool_result = delete_calendar_event(db, title_query=routed.params.get("title_query"))
    elif routed.tool_name == "create_reminder":
        tool_result = create_reminder(db, title=str(routed.params["title"]).strip() or "Reminder", remind_at=routed.params.get("datetime"))
    elif routed.tool_name == "list_reminders":
        tool_result = list_reminders(db, target_date=routed.params.get("date"))
    elif routed.tool_name == "delete_reminder":
        tool_result = delete_reminder(db, title_query=routed.params.get("title_query"))
    elif routed.tool_name == "get_weather":
        tool_result = get_weather(language=language)
    elif routed.tool_name == "control_mirror_widget":
        tool_result = control_mirror_widget(db, widget=str(routed.params["widget"]), action=str(routed.params["action"]))
    elif routed.tool_name == "open_youtube":
        tool_result = open_youtube(db, query=routed.params.get("query"))
    elif routed.tool_name == "refresh_mirror":
        tool_result = refresh_mirror(db)
    elif routed.tool_name == "control_screen":
        tool_result = screen_on() if routed.params.get("action") == "on" else screen_off()
    else:
        tool_result = {
            "tool": "general_answer_tool",
            "reply": _localized_text(language, en="I need a clearer command.", ar="بدي أمر أوضح.", tr="Daha net bir komuta ihtiyacım var."),
            "data": {"language": language},
        }
        selected_tool = "general_answer_tool"

    response = _finalize_tool_response(routed=routed, tool_result=tool_result, language=language)
    tool_data = dict(tool_result.get("data", {}))
    tool_data["executed_tool"] = selected_tool
    tool_data["language"] = tool_data.get("language") or language
    tool_data["selected_intent"] = routed.intent

    return {
        "wake_detected": wake_detected,
        "category": routed.category,
        "intent": routed.intent,
        "tool_result": _trim_tool_payload(tool_data),
        "response": response,
        "selected_tool": selected_tool,
    }
