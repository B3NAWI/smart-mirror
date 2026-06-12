import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from threading import Lock
from typing import Optional
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

from yt_dlp import YoutubeDL


@dataclass
class ResolvedYouTubeStream:
    stream_url: str
    title: str = ""
    thumbnail_url: str = ""
    duration_seconds: Optional[int] = None
    expires_at: Optional[datetime] = None


@dataclass
class SuggestedYouTubeVideo:
    watch_url: str
    title: str = ""
    thumbnail_url: str = ""


_cache: dict[str, ResolvedYouTubeStream] = {}
_lock = Lock()


def _normalize_youtube_url(raw_url: Optional[str]) -> str:
    if not raw_url:
        return ""

    text = raw_url.strip()
    if not text:
        return ""

    intent_match = re.search(
        r"(?:intent://)?(?:m\.|music\.)?youtube\.com/watch\?v=([A-Za-z0-9_-]{11})",
        text,
        re.IGNORECASE,
    )
    if intent_match:
        return f"https://www.youtube.com/watch?v={intent_match.group(1)}"

    short_match = re.search(r"youtu\.be/([A-Za-z0-9_-]{11})", text, re.IGNORECASE)
    if short_match:
        return f"https://www.youtube.com/watch?v={short_match.group(1)}"

    return text


def _extract_video_id(raw_url: Optional[str]) -> str:
    normalized_url = _normalize_youtube_url(raw_url)
    if not normalized_url:
        return ""

    patterns = (
        r"(?:v=|youtu\.be/|shorts/|embed/|live/)([A-Za-z0-9_-]{11})",
        r"youtube\.com/watch\?v=([A-Za-z0-9_-]{11})",
    )
    for pattern in patterns:
        match = re.search(pattern, normalized_url, re.IGNORECASE)
        if match:
            return match.group(1)
    return ""


def _extract_expiration(stream_url: str) -> Optional[datetime]:
    try:
        parsed = urlparse(stream_url)
        expire_value = parse_qs(parsed.query).get("expire", [None])[0]
        if expire_value is None:
            return None
        return datetime.fromtimestamp(int(expire_value), tz=UTC)
    except Exception:
        return None


def _is_cache_valid(entry: ResolvedYouTubeStream) -> bool:
    if not entry.stream_url:
        return False
    if entry.expires_at is None:
        return True
    return entry.expires_at > datetime.now(tz=UTC)


def _pick_stream_url(info: dict) -> str:
    direct_url = info.get("url")
    if direct_url:
        return direct_url

    formats = info.get("formats") or []
    for item in formats:
        if (
            item.get("url")
            and item.get("vcodec") not in (None, "none")
            and item.get("acodec") not in (None, "none")
        ):
            return item["url"]

    return ""


def _extract_text(value: object) -> str:
    if isinstance(value, dict):
        simple_text = value.get("simpleText")
        if isinstance(simple_text, str):
            return simple_text.strip()
        runs = value.get("runs")
        if isinstance(runs, list):
            return "".join(
                run.get("text", "") for run in runs if isinstance(run, dict)
            ).strip()
    return ""


def _extract_thumbnail_url(renderer: dict) -> str:
    thumbnail = renderer.get("thumbnail")
    if not isinstance(thumbnail, dict):
        return ""
    thumbnails = thumbnail.get("thumbnails")
    if not isinstance(thumbnails, list) or not thumbnails:
        return ""
    last_item = thumbnails[-1]
    if not isinstance(last_item, dict):
        return ""
    url = last_item.get("url")
    return url.strip() if isinstance(url, str) else ""


def _iter_related_video_candidates(node: object):
    if isinstance(node, dict):
        for key in (
            "compactVideoRenderer",
            "videoRenderer",
            "endScreenVideoRenderer",
            "playlistPanelVideoRenderer",
            "reelItemRenderer",
        ):
            renderer = node.get(key)
            if isinstance(renderer, dict):
                video_id = renderer.get("videoId")
                if isinstance(video_id, str) and len(video_id) == 11:
                    title = (
                        _extract_text(renderer.get("title"))
                        or _extract_text(renderer.get("headline"))
                        or _extract_text(renderer.get("shortBylineText"))
                    )
                    yield SuggestedYouTubeVideo(
                        watch_url=f"https://www.youtube.com/watch?v={video_id}",
                        title=title,
                        thumbnail_url=_extract_thumbnail_url(renderer),
                    )

        for value in node.values():
            yield from _iter_related_video_candidates(value)
    elif isinstance(node, list):
        for item in node:
            yield from _iter_related_video_candidates(item)


def find_related_youtube_video(
    raw_url: Optional[str],
    exclude_urls: Optional[list[str]] = None,
) -> Optional[SuggestedYouTubeVideo]:
    normalized_url = _normalize_youtube_url(raw_url)
    if not normalized_url or "youtube.com" not in normalized_url:
        return None

    excluded_ids = {
        video_id
        for video_id in [_extract_video_id(normalized_url)]
        if video_id
    }
    for item in exclude_urls or []:
        video_id = _extract_video_id(item)
        if video_id:
            excluded_ids.add(video_id)

    request = Request(
        normalized_url,
        headers={"User-Agent": "Mozilla/5.0"},
    )
    with urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "ignore")

    match = re.search(r"var ytInitialData = (\{.*?\});", html)
    if not match:
        return None

    data = json.loads(match.group(1))
    for candidate in _iter_related_video_candidates(data):
        video_id = _extract_video_id(candidate.watch_url)
        if not video_id or video_id in excluded_ids:
            continue
        return candidate

    return None


def resolve_youtube_stream(raw_url: Optional[str]) -> Optional[ResolvedYouTubeStream]:
    normalized_url = _normalize_youtube_url(raw_url)
    if not normalized_url or "youtube.com" not in normalized_url:
        return None

    with _lock:
        cached = _cache.get(normalized_url)
        if cached and _is_cache_valid(cached):
            return cached

    options = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "extract_flat": False,
        "format": (
            "best[ext=mp4][acodec!=none][vcodec!=none]/"
            "best*[ext=mp4][acodec!=none][vcodec!=none]/"
            "best[acodec!=none][vcodec!=none]/best"
        ),
    }

    with YoutubeDL(options) as ydl:
        info = ydl.extract_info(normalized_url, download=False)

    stream_url = _pick_stream_url(info)
    if not stream_url:
        return None

    resolved = ResolvedYouTubeStream(
        stream_url=stream_url,
        title=info.get("title") or "",
        thumbnail_url=info.get("thumbnail") or "",
        duration_seconds=info.get("duration"),
        expires_at=_extract_expiration(stream_url),
    )

    with _lock:
        _cache[normalized_url] = resolved

    return resolved
