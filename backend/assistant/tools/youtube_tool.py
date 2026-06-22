from __future__ import annotations

from sqlalchemy.orm import Session

from assistant.storage import get_or_create_now_playing_state
from app.youtube_streams import search_youtube_videos


def open_youtube(db: Session, *, query: str | None = None) -> dict:
    results = search_youtube_videos(query, limit=5) if query else []
    now_playing = None
    if results:
        first_result = results[0]
        state = get_or_create_now_playing_state(db)
        state.title = first_result.title or query or "YouTube"
        state.artist = "YouTube"
        state.album = None
        state.source = "youtube"
        state.is_playing = True
        state.progress_seconds = 0
        state.duration_seconds = first_result.duration_seconds
        state.artwork_url = first_result.thumbnail_url
        state.track_url = first_result.watch_url
        db.commit()
        db.refresh(state)
        now_playing = {
            "title": state.title,
            "artist": state.artist,
            "source": state.source,
            "is_playing": state.is_playing,
            "track_url": state.track_url,
            "artwork_url": state.artwork_url,
        }

    return {
        "tool": "open_youtube",
        "reply": f"Opening YouTube{' for ' + query if query else ''}.",
        "data": {
            "query": query,
            "results": [
                {
                    "title": result.title,
                    "watch_url": result.watch_url,
                    "thumbnail_url": result.thumbnail_url,
                    "duration_seconds": result.duration_seconds,
                }
                for result in results
            ],
            "now_playing": now_playing,
        },
    }
