from __future__ import annotations

from assistant.behavior_config import DEFAULT_RESPONSE_PROFILE, REALTIME_VOICES, RESPONSE_PROFILE_MAX_TOKENS
from assistant.prompts import HALO_SYSTEM_PROMPT
from assistant.tools import get_assistant_tool_definitions


def resolve_response_profile(value: str | None) -> str:
    cleaned = str(value or "").strip().lower()
    return cleaned if cleaned in RESPONSE_PROFILE_MAX_TOKENS else DEFAULT_RESPONSE_PROFILE


def get_max_response_output_tokens(profile: str | None) -> int:
    return RESPONSE_PROFILE_MAX_TOKENS[resolve_response_profile(profile)]


def resolve_realtime_voice(value: str | None) -> str:
    cleaned = str(value or "").strip().lower()
    return cleaned if cleaned in REALTIME_VOICES else REALTIME_VOICES[0]


def build_realtime_session_config(
    *,
    model: str,
    voice: str | None,
    response_profile: str | None,
    instructions: str | None = None,
) -> dict:
    resolved_profile = resolve_response_profile(response_profile)
    return {
        "model": model or "gpt-realtime-2",
        "voice": resolve_realtime_voice(voice),
        "instructions": instructions or HALO_SYSTEM_PROMPT,
        "tools": get_assistant_tool_definitions(),
        "response_profile": resolved_profile,
        "max_response_output_tokens": get_max_response_output_tokens(resolved_profile),
        "available_voices": list(REALTIME_VOICES),
    }
