from __future__ import annotations

from assistant.behavior_config import is_expand_request
from assistant.language import detect_language
from assistant.project_knowledge import detect_project_topic, get_project_response


def project_info_tool(question: str, *, topic: str | None = None) -> dict:
    language = detect_language(question)
    resolved_topic = topic or detect_project_topic(question) or "overview"
    reply = get_project_response(
        resolved_topic,
        language,
        explain_more=is_expand_request(question),
    )
    return {
        "tool": "project_info_tool",
        "reply": reply,
        "data": {
            "topic": resolved_topic,
            "language": language,
        },
    }
