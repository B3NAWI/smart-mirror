from __future__ import annotations

SUPPORTED_LANGUAGES = ["ar", "en", "tr"]

NORMAL_MAX_RESPONSE_TOKENS = 220
GENERAL_MAX_RESPONSE_TOKENS = 350
PROJECT_MAX_RESPONSE_TOKENS = 500

MAX_HISTORY_TURNS = 3
MAX_USER_TEXT_CHARS = 1000
MAX_TOOL_OUTPUT_CHARS = 1500
MAX_PROJECT_CONTEXT_CHARS = 6000

DEFAULT_RESPONSE_PROFILE = "normal"
RESPONSE_PROFILE_MAX_TOKENS = {
    "normal": NORMAL_MAX_RESPONSE_TOKENS,
    "general_question": GENERAL_MAX_RESPONSE_TOKENS,
    "project_question": PROJECT_MAX_RESPONSE_TOKENS,
}

WAKE_PHRASES = (
    "Hi Halo",
    "Hey Halo",
    "هاي هالو",
    "هالو",
    "Merhaba Halo",
    "Halo",
)

STOP_PHRASES = (
    "Halo stop",
    "stop halo",
    "هالو ستوب",
    "Halo dur",
)

REALTIME_VOICES = ("marin", "cedar")

# Backward-compatible aliases for earlier wiring.
NORMAL_MAX_TOKENS = NORMAL_MAX_RESPONSE_TOKENS
GENERAL_QUESTION_MAX_TOKENS = GENERAL_MAX_RESPONSE_TOKENS
PROJECT_MAX_TOKENS = PROJECT_MAX_RESPONSE_TOKENS


def is_expand_request(text: str) -> bool:
    normalized = str(text or "").lower()
    return any(
        phrase in normalized
        for phrase in (
            "explain more",
            "more details",
            "tell me more",
            "expand",
            "daha fazla detay",
            "daha detayli",
            "daha detaylı",
            "ayrintili anlat",
            "ayrıntılı anlat",
            "احكيلي اكثر",
            "احكيلي أكتر",
            "اشرح اكثر",
            "اشرح أكتر",
            "زيدني تفاصيل",
        )
    )
