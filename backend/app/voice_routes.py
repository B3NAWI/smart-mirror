from collections import defaultdict, deque
from threading import Lock
from time import monotonic
from typing import Deque, Dict

from fastapi import APIRouter, Depends, HTTPException, Request as FastAPIRequest, status
from sqlalchemy.orm import Session
from assistant.command_router import execute_assistant_text_command
from assistant.realtime_client import (
    APIConnectionError,
    APIStatusError,
    build_realtime_session_payload,
    create_realtime_client_secret,
)

from .auth import require_api_key
from .config import (
    HALO_MAX_INPUT_TOKENS,
    HALO_MAX_OUTPUT_TOKENS,
    HALO_VOICE_ASSISTANT_INSTRUCTIONS,
    HALO_VOICE_ENABLED,
    HALO_VOICE_IDLE_TIMEOUT_SECONDS,
    HALO_PRIMARY_WAKE_PHRASE,
    HALO_VOICE_REASONING_EFFORT,
    HALO_VOICE_SESSION_TIMEOUT_SECONDS,
    HALO_VOICE_SUPPORTED_COMMAND_GROUPS,
    HALO_WAKE_WORDS,
    OPENAI_API_KEY,
    OPENAI_REALTIME_MODEL,
)
from .database import get_db
from .schemas import (
    AssistantTextRequest,
    AssistantTextResponse,
    HaloCommandRequest,
    HaloCommandResponse,
    VoiceSessionRequest,
    VoiceSessionResponse,
    VoiceToolExecuteRequest,
)
from .voice_tools import (
    VoiceToolError,
    VoiceToolNotFoundError,
    VoiceToolValidationError,
    execute_voice_tool,
    get_voice_tool_definitions,
)

router = APIRouter(tags=["voice"])

VOICE_SESSION_RATE_LIMIT_WINDOW_SECONDS = 60
VOICE_SESSION_RATE_LIMIT_MAX_REQUESTS = 5
DEFAULT_AUDIO_VOICE = "marin"
VOICE_TOOLS_LISTING_PATH = "/api/voice/tools"
VOICE_TOOLS_EXECUTE_PATH = "/api/voice/tools/execute"
VOICE_COMMAND_PATH = "/api/voice/command"

_rate_limit_buckets: Dict[str, Deque[float]] = defaultdict(deque)
_rate_limit_lock = Lock()


def _get_client_address(request: FastAPIRequest) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        first_hop = forwarded_for.split(",")[0].strip()
        if first_hop:
            return first_hop

    if request.client and request.client.host:
        return request.client.host

    return "unknown"


def _enforce_voice_session_rate_limit(
    request: FastAPIRequest,
    client_label: str,
) -> None:
    now = monotonic()
    bucket_key = f"{_get_client_address(request)}:{client_label}"

    with _rate_limit_lock:
        bucket = _rate_limit_buckets[bucket_key]
        while bucket and now - bucket[0] >= VOICE_SESSION_RATE_LIMIT_WINDOW_SECONDS:
            bucket.popleft()

        if len(bucket) >= VOICE_SESSION_RATE_LIMIT_MAX_REQUESTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many voice session requests. Please wait a moment and try again.",
            )

        bucket.append(now)


def _enforce_voice_request_rate_limit(
    request: FastAPIRequest,
    bucket_name: str,
    *,
    window_seconds: int = VOICE_SESSION_RATE_LIMIT_WINDOW_SECONDS,
    max_requests: int = VOICE_SESSION_RATE_LIMIT_MAX_REQUESTS * 3,
) -> None:
    now = monotonic()
    bucket_key = f"{bucket_name}:{_get_client_address(request)}"

    with _rate_limit_lock:
        bucket = _rate_limit_buckets[bucket_key]
        while bucket and now - bucket[0] >= window_seconds:
            bucket.popleft()

        if len(bucket) >= max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many voice requests. Please wait a moment and try again.",
            )

        bucket.append(now)


def _safe_create_realtime_client_secret(payload: dict) -> dict:
    try:
        response_payload = create_realtime_client_secret(OPENAI_API_KEY, payload)
    except APIStatusError as exc:
        provider_message = None
        if isinstance(exc.body, dict):
            raw_message = exc.body.get("message")
            if isinstance(raw_message, str):
                provider_message = raw_message.strip()[:200]

        if exc.status_code in {401, 403}:
            detail = "Voice provider authentication failed on the server."
        elif exc.status_code == 429:
            detail = "Voice provider rate limit reached. Please try again shortly."
        elif exc.status_code == 400:
            detail = (
                f"Voice provider rejected the session configuration: {provider_message}"
                if provider_message
                else "Voice provider rejected the session configuration."
            )
        else:
            detail = "Voice provider session creation failed."

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
        ) from exc
    except APIConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to reach the voice provider right now.",
        ) from exc
    return response_payload


@router.post(
    "/api/voice/session",
    response_model=VoiceSessionResponse,
    dependencies=[Depends(require_api_key)],
)
def create_voice_session(
    request: FastAPIRequest,
    payload: VoiceSessionRequest | None = None,
):
    if not HALO_VOICE_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Halo voice assistant is disabled on this server.",
        )

    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI voice configuration is missing on this server.",
        )

    request_payload = payload or VoiceSessionRequest()
    _enforce_voice_session_rate_limit(request, request_payload.client)

    session_request = build_realtime_session_payload(
        model=OPENAI_REALTIME_MODEL,
        instructions=HALO_VOICE_ASSISTANT_INSTRUCTIONS,
        output_modality=request_payload.output_modality,
        voice=request_payload.voice or DEFAULT_AUDIO_VOICE,
        max_output_tokens=HALO_MAX_OUTPUT_TOKENS,
        idle_timeout_seconds=HALO_VOICE_IDLE_TIMEOUT_SECONDS,
        session_timeout_seconds=HALO_VOICE_SESSION_TIMEOUT_SECONDS,
        reasoning_effort=HALO_VOICE_REASONING_EFFORT,
    )
    session_response = _safe_create_realtime_client_secret(session_request)

    secret_value = session_response.get("value")
    expires_at = session_response.get("expires_at")
    session = session_response.get("session")
    if not isinstance(secret_value, str) or not secret_value:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Voice provider returned an invalid client secret.",
        )
    if not isinstance(expires_at, int):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Voice provider returned an invalid expiration time.",
        )
    if not isinstance(session, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Voice provider returned an invalid session payload.",
        )

    effective_voice = (
        request_payload.voice or DEFAULT_AUDIO_VOICE
        if request_payload.output_modality == "audio"
        else None
    )
    return {
        "client_secret": {
            "value": secret_value,
            "expires_at": expires_at,
        },
        "session": session,
        "metadata": {
            "model": OPENAI_REALTIME_MODEL,
            "instructions": HALO_VOICE_ASSISTANT_INSTRUCTIONS,
            "output_modality": request_payload.output_modality,
            "voice": effective_voice,
            "reasoning_effort": HALO_VOICE_REASONING_EFFORT,
            "max_input_tokens": HALO_MAX_INPUT_TOKENS,
            "max_output_tokens": HALO_MAX_OUTPUT_TOKENS,
            "idle_timeout_seconds": HALO_VOICE_IDLE_TIMEOUT_SECONDS,
            "session_timeout_seconds": HALO_VOICE_SESSION_TIMEOUT_SECONDS,
            "wake_words": HALO_WAKE_WORDS,
            "primary_wake_phrase": HALO_PRIMARY_WAKE_PHRASE,
            "response_style": "short",
            "supported_command_groups": HALO_VOICE_SUPPORTED_COMMAND_GROUPS,
            "tool_listing_path": VOICE_TOOLS_LISTING_PATH,
            "tool_execute_path": VOICE_TOOLS_EXECUTE_PATH,
        },
    }


@router.get(
    "/api/voice/tools",
    dependencies=[Depends(require_api_key)],
)
def list_voice_tools():
    return {
        "tools": get_voice_tool_definitions(),
    }


@router.post(
    "/api/voice/tools/execute",
    dependencies=[Depends(require_api_key)],
)
def run_voice_tool(
    request: FastAPIRequest,
    payload: VoiceToolExecuteRequest,
    db: Session = Depends(get_db),
):
    _enforce_voice_request_rate_limit(request, "voice-tools")
    try:
        return execute_voice_tool(
            payload.tool,
            payload.arguments,
            db=db,
        )
    except VoiceToolValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except VoiceToolNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except VoiceToolError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/api/assistant/text",
    response_model=AssistantTextResponse,
    dependencies=[Depends(require_api_key)],
)
def run_assistant_text(
    request: FastAPIRequest,
    payload: AssistantTextRequest,
    db: Session = Depends(get_db),
):
    _enforce_voice_request_rate_limit(request, "assistant-text")
    return execute_assistant_text_command(
        db=db,
        text=payload.text,
        user_id=payload.user_id or "mirror-local",
        account_name=payload.account_name,
    )


@router.post(
    VOICE_COMMAND_PATH,
    response_model=HaloCommandResponse,
    dependencies=[Depends(require_api_key)],
)
def run_halo_command(
    request: FastAPIRequest,
    payload: HaloCommandRequest,
    db: Session = Depends(get_db),
):
    _enforce_voice_request_rate_limit(request, "voice-command")
    result = execute_assistant_text_command(
        db=db,
        text=payload.command,
        user_id=payload.user_id or "mirror-local",
        account_name=payload.account_name,
    )

    return {
        "status": "success" if result.get("intent") != "unsupported" else "error",
        "intent": result.get("intent", "unknown"),
        "reply": result.get("response", ""),
        "tool": result.get("selected_tool") or "assistant_text",
        "data": result.get("tool_result", {}),
    }
