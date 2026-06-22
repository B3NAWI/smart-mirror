from __future__ import annotations

from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import List
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from fastapi import APIRouter

from .config import NEWS_FEED_URL, NEWS_HEADLINES_LIMIT
from .schemas import NewsHeadlineRead, NewsHeadlinesResponse

router = APIRouter(tags=["news"])

REQUEST_HEADERS = {
    "User-Agent": "HALO-MIRROR/1.0 (+https://localhost)",
    "Accept": "application/rss+xml, application/xml, text/xml",
}


def _parse_datetime(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except Exception:
        return None
    return parsed.astimezone().isoformat() if parsed.tzinfo else parsed.isoformat()


def _read_text(node: ET.Element | None, tag_names: tuple[str, ...]) -> str:
    if node is None:
        return ""
    for tag_name in tag_names:
        child = node.find(tag_name)
        if child is not None and child.text:
            return child.text.strip()
    return ""


def fetch_news_headlines(*, limit: int = NEWS_HEADLINES_LIMIT) -> List[dict]:
    request = Request(NEWS_FEED_URL, headers=REQUEST_HEADERS)
    try:
        with urlopen(request, timeout=8) as response:
            xml_payload = response.read()
    except Exception:
        return []

    try:
        root = ET.fromstring(xml_payload)
    except ET.ParseError:
        return []

    items = root.findall(".//item")
    headlines: List[dict] = []
    for index, item in enumerate(items[: max(1, min(limit, 10))], start=1):
        title = _read_text(item, ("title",))
        link = _read_text(item, ("link",))
        published_at = _parse_datetime(_read_text(item, ("pubDate", "published")))
        source = _read_text(item, ("source",))
        if not source:
            source = "News"
        if not title:
            continue
        headlines.append(
            {
                "id": f"headline-{index}",
                "title": title,
                "link": link or None,
                "source": source,
                "published_at": published_at,
            }
        )
    return headlines


@router.get("/api/news/headlines", response_model=NewsHeadlinesResponse)
def read_news_headlines():
    headlines = fetch_news_headlines(limit=NEWS_HEADLINES_LIMIT)
    return NewsHeadlinesResponse(
        headlines=[NewsHeadlineRead.model_validate(item) for item in headlines],
        feed_url=NEWS_FEED_URL,
        fetched_at=datetime.utcnow(),
    )
