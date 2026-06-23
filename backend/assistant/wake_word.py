from __future__ import annotations

import re
import unicodedata

ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
WAKE_PHRASE_VARIANTS = (
    "hi halo",
    "hey halo",
    "هاي هالو",
    "هالو",
    "merhaba halo",
    "halo",
)


def normalize_text(value: str) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).translate(ARABIC_DIGITS)
    text = re.sub(r"[^\w\s\u0600-\u06FFçğıöşüÇĞİÖŞÜ]", " ", text.lower(), flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def contains_wake_phrase(value: str) -> bool:
    normalized = normalize_text(value)
    return any(phrase in normalized for phrase in WAKE_PHRASE_VARIANTS)


def strip_wake_phrase(value: str) -> str:
    normalized = str(value or "").strip()
    pattern = re.compile(
        r"^\s*(?:hi\s+halo|hey\s+halo|هاي\s+هالو|هالو|merhaba\s+halo|halo)\s*[,،:]?\s*",
        re.IGNORECASE,
    )
    return pattern.sub("", normalized).strip()
