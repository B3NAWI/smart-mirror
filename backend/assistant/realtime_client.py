from __future__ import annotations

from openai import APIConnectionError, APIStatusError, OpenAI


def build_realtime_session_payload(
    *,
    model: str,
    instructions: str,
    output_modality: str,
    voice: str | None,
    max_output_tokens: int,
    idle_timeout_seconds: int,
    session_timeout_seconds: int,
    reasoning_effort: str,
) -> dict:
    session_payload = {
        "type": "realtime",
        "model": model,
        "instructions": instructions,
        "max_output_tokens": max_output_tokens,
        "output_modalities": [output_modality],
        "reasoning": {"effort": reasoning_effort},
        "truncation": "auto",
    }

    if output_modality == "audio":
        session_payload["audio"] = {
            "input": {
                "turn_detection": {
                    "type": "server_vad",
                    "create_response": True,
                    "interrupt_response": True,
                    "idle_timeout_ms": idle_timeout_seconds * 1000,
                    "silence_duration_ms": 700,
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

