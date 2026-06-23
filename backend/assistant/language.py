from __future__ import annotations

import re
import unicodedata

ARABIC_PATTERN = re.compile(r"[\u0600-\u06FF]")
TURKISH_CHAR_PATTERN = re.compile(r"[çğıöşüÇĞİÖŞÜ]")
LATIN_WORD_PATTERN = re.compile(r"[A-Za-zÇĞİIÖŞÜçğıöşü']+")

WAKE_FILLER_WORDS = {
    "hi",
    "hey",
    "halo",
    "merhaba",
}

ENGLISH_HINTS = {
    "what",
    "who",
    "how",
    "why",
    "when",
    "where",
    "time",
    "calendar",
    "weather",
    "developed",
    "developer",
    "screen",
    "show",
    "hide",
    "open",
    "close",
}

TURKISH_HINTS = {
    "saat",
    "kaç",
    "kac",
    "kim",
    "geliştirdi",
    "gelistirdi",
    "geliştiren",
    "gelistiren",
    "nedir",
    "takvim",
    "hava",
    "durumu",
    "ayna",
    "proje",
    "ekran",
    "göster",
    "goster",
    "gizle",
    "aç",
    "ac",
    "kapat",
}

ARABIC_HINTS = {
    "كم",
    "الساعة",
    "مين",
    "طورك",
    "المراية",
    "المرآة",
    "المشروع",
    "الطقس",
    "التقويم",
    "الشاشة",
}


def normalize_language_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(text or ""))
    normalized = normalized.replace("’", "'").replace("‘", "'")
    normalized = re.sub(r"\s+", " ", normalized).strip().lower()
    return normalized


def _tokenize_latin_words(text: str) -> list[str]:
    tokens = [match.group(0).strip("'") for match in LATIN_WORD_PATTERN.finditer(text)]
    return [token for token in tokens if token and token not in WAKE_FILLER_WORDS]


def detect_language(text: str) -> str:
    normalized = normalize_language_text(text)
    if not normalized:
        return "en"

    scores = {"ar": 0, "en": 0, "tr": 0}
    hint_hits = {"ar": 0, "en": 0, "tr": 0}

    arabic_chars = len(ARABIC_PATTERN.findall(normalized))
    if arabic_chars:
        scores["ar"] += arabic_chars * 3

    turkish_chars = len(TURKISH_CHAR_PATTERN.findall(normalized))
    if turkish_chars:
        scores["tr"] += turkish_chars * 3

    for hint in ARABIC_HINTS:
        if hint in normalized:
            scores["ar"] += 3
            hint_hits["ar"] += 1

    latin_tokens = _tokenize_latin_words(normalized)
    for token in latin_tokens:
        if token in ENGLISH_HINTS:
            scores["en"] += 3
            hint_hits["en"] += 1
        if token in TURKISH_HINTS:
            scores["tr"] += 3
            hint_hits["tr"] += 1

    if latin_tokens and scores["tr"] == 0 and scores["ar"] == 0:
        scores["en"] += max(2, len(latin_tokens) // 2)

    if scores["tr"] > 0 and turkish_chars > 0:
        scores["tr"] += 1

    dominant_language = max(scores, key=scores.get)
    if scores[dominant_language] == 0:
        return "en"

    if scores["tr"] == scores["en"] and scores["tr"] > 0:
        if hint_hits["tr"] > hint_hits["en"]:
            return "tr"
        if hint_hits["en"] > hint_hits["tr"]:
            return "en"
        return "tr" if turkish_chars > 0 else "en"

    return dominant_language


def is_language(language: str, *candidates: str) -> bool:
    return str(language or "").strip().lower() in {candidate.lower() for candidate in candidates}
