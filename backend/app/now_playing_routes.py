from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import require_api_key
from .database import get_db
from .models import NowPlayingState
from .schemas import (
    DeleteResponse,
    NowPlayingAdvanceRequest,
    NowPlayingRead,
    NowPlayingUpdate,
    NowPlayingUpsert,
)
from .youtube_streams import find_related_youtube_video, resolve_youtube_stream

router = APIRouter(prefix="/api/now-playing", tags=["now-playing"])


def _get_or_create_state(db: Session) -> NowPlayingState:
    state = db.query(NowPlayingState).filter(NowPlayingState.id == 1).first()
    if state is not None:
        return state

    state = NowPlayingState(
        id=1,
        source="other",
        is_playing=False,
        progress_seconds=0,
    )
    db.add(state)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return db.query(NowPlayingState).filter(NowPlayingState.id == 1).first()
    db.refresh(state)
    return state


def _as_response(state: NowPlayingState) -> NowPlayingRead:
    resolved_youtube_stream = None
    if state.source == "youtube" and state.track_url:
        try:
            resolved_youtube_stream = resolve_youtube_stream(state.track_url)
        except Exception:
            resolved_youtube_stream = None

    effective_progress = state.progress_seconds or 0
    duration = state.duration_seconds or (
        resolved_youtube_stream.duration_seconds if resolved_youtube_stream else None
    )

    if state.is_playing and state.updated_at:
        elapsed = max(0, int((datetime.utcnow() - state.updated_at).total_seconds()))
        effective_progress += elapsed

    if duration is not None:
        effective_progress = min(effective_progress, duration)
        progress_percent = round((effective_progress / duration) * 100, 2)
    else:
        progress_percent = 0.0

    return NowPlayingRead.model_validate(
        {
            "id": state.id,
            "title": state.title,
            "artist": state.artist,
            "album": state.album,
            "source": state.source,
            "is_playing": state.is_playing,
            "progress_seconds": state.progress_seconds,
            "duration_seconds": state.duration_seconds,
            "artwork_url": state.artwork_url,
            "track_url": state.track_url,
            "created_at": state.created_at,
            "updated_at": state.updated_at,
            "effective_progress_seconds": effective_progress,
            "progress_percent": progress_percent,
            "video_stream_url": resolved_youtube_stream.stream_url if resolved_youtube_stream else None,
            "video_thumbnail_url": resolved_youtube_stream.thumbnail_url if resolved_youtube_stream else None,
            "playback_note": (
                "Direct stream resolved for mirror playback."
                if resolved_youtube_stream
                else None
            ),
        }
    )


@router.get("", response_model=NowPlayingRead)
def read_now_playing(db: Session = Depends(get_db)):
    return _as_response(_get_or_create_state(db))


@router.post(
    "",
    response_model=NowPlayingRead,
    dependencies=[Depends(require_api_key)],
)
def upsert_now_playing(payload: NowPlayingUpsert, db: Session = Depends(get_db)):
    state = _get_or_create_state(db)

    for field_name, value in payload.model_dump().items():
        setattr(state, field_name, value)

    db.commit()
    db.refresh(state)
    return _as_response(state)


@router.patch(
    "",
    response_model=NowPlayingRead,
    dependencies=[Depends(require_api_key)],
)
def update_now_playing(payload: NowPlayingUpdate, db: Session = Depends(get_db)):
    state = _get_or_create_state(db)

    updates = payload.model_dump(exclude_unset=True)
    for field_name, value in updates.items():
        setattr(state, field_name, value)

    if (
        state.duration_seconds is not None
        and state.progress_seconds > state.duration_seconds
    ):
        state.progress_seconds = state.duration_seconds

    if state.is_playing and not state.title:
        state.is_playing = False

    db.commit()
    db.refresh(state)
    return _as_response(state)


@router.post(
    "/next",
    response_model=NowPlayingRead,
    dependencies=[Depends(require_api_key)],
)
def advance_to_next_youtube_video(
    payload: NowPlayingAdvanceRequest,
    db: Session = Depends(get_db),
):
    state = _get_or_create_state(db)

    if state.source != "youtube" or not state.track_url:
        raise HTTPException(status_code=400, detail="A YouTube video is not active.")

    suggestion = find_related_youtube_video(
        state.track_url,
        exclude_urls=[state.track_url, *payload.exclude_track_urls],
    )
    if suggestion is None:
        raise HTTPException(status_code=404, detail="No next YouTube video was found.")

    state.title = suggestion.title or state.title
    state.artist = None
    state.album = None
    state.source = "youtube"
    state.is_playing = True
    state.progress_seconds = 0
    state.duration_seconds = None
    state.artwork_url = suggestion.thumbnail_url or state.artwork_url
    state.track_url = suggestion.watch_url

    db.commit()
    db.refresh(state)
    return _as_response(state)


@router.delete(
    "",
    response_model=DeleteResponse,
    dependencies=[Depends(require_api_key)],
)
def clear_now_playing(db: Session = Depends(get_db)):
    state = _get_or_create_state(db)
    state.title = None
    state.artist = None
    state.album = None
    state.source = "other"
    state.is_playing = False
    state.progress_seconds = 0
    state.duration_seconds = None
    state.artwork_url = None
    state.track_url = None

    db.commit()
    return DeleteResponse(status="cleared", id=state.id)
