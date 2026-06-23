from __future__ import annotations

from openai import APIConnectionError, APIStatusError, OpenAI


def build_realtime_session_payload(
    *,
    model: str,
    instructions: str,
    output_modality: str,
    voice: str | None,
    max_response_output_tokens: int,
    tools: list[dict] | None,
    idle_timeout_seconds: int,
    session_timeout_seconds: int,
    reasoning_effort: str,
    vad_prefix_padding_ms: int = 500,
    vad_silence_duration_ms: int = 1500,
    vad_threshold: float = 0.5,
) -> dict:
    session_payload = {
        "type": "realtime",
        "model": model,
        "instructions": instructions,
        "max_response_output_tokens": max_response_output_tokens,
        "output_modalities": [output_modality],
        "reasoning": {"effort": reasoning_effort},
        "truncation": "auto",
        "tool_choice": "auto",
        "tools": tools or [],
    }

    if output_modality == "audio":
        session_payload["audio"] = {
            "input": {
                "turn_detection": {
                    "type": "server_vad",
                    "create_response": True,
                    "interrupt_response": False,
                    "idle_timeout_ms": idle_timeout_seconds * 1000,
                    "prefix_padding_ms": vad_prefix_padding_ms,
                    "silence_duration_ms": vad_silence_duration_ms,
                    "threshold": vad_threshold,
                }
            },
            "output": {"voice": voice or "marin"},
        }

    return {
        "expires_after": {
            "anchor": "created_at",
            "seconds": session_timeout_seconds,
        },
        "session": session_payload,
    }


def create_realtime_client_secret(api_key: str, payload: dict) -> dict:
    client = OpenAI(api_key=api_key)
    response = client.realtime.client_secrets.create(**payload)
    response_payload = (
        response.model_dump(exclude_none=True)
        if hasattr(response, "model_dump")
        else {
            "value": response.value,
            "expires_at": response.expires_at,
            "session": {},
        }
    )
    return {
        "value": response_payload.get("value", ""),
        "expires_at": response_payload.get("expires_at"),
        "session": response_payload.get("session", {}),
    }


__all__ = [
    "APIConnectionError",
    "APIStatusError",
    "build_realtime_session_payload",
    "create_realtime_client_secret",
]
