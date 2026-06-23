from __future__ import annotations

from typing import Any

from openai import APIConnectionError, APIStatusError, OpenAI

from assistant.behavior_config import GENERAL_MAX_RESPONSE_TOKENS, is_expand_request
from assistant.language import detect_language
from app.config import OPENAI_API_KEY, OPENAI_TEXT_MODEL

GENERAL_TOPIC_KEYWORDS = {
    "artificial_intelligence": (
        "artificial intelligence",
        "what is ai",
        "what is artificial intelligence",
        "الذكاء الاصطناعي",
        "شو يعني ai",
        "yapay zeka",
        "yapay zekâ",
    ),
    "iot": (
        "iot",
        "internet of things",
        "انترنت الاشياء",
        "إنترنت الأشياء",
        "شو يعني iot",
        "nesnelerin interneti",
    ),
    "backend": (
        "backend",
        "back end",
        "شو يعني backend",
        "ما هو backend",
        "backend nedir",
        "arka uç",
        "arka uc",
    ),
}

GENERAL_TOPIC_RESPONSES = {
    "artificial_intelligence": {
        "en": "Artificial intelligence is software that can analyze information, learn patterns, and make useful decisions or responses that normally need human reasoning.",
        "ar": "الذكاء الاصطناعي هو برمجيات تستطيع تحليل المعلومات وتعلّم الأنماط وتقديم قرارات أو ردود مفيدة تشبه جزءاً من التفكير البشري.",
        "tr": "Yapay zeka, bilgileri analiz edebilen, örüntüleri öğrenebilen ve normalde insan muhakemesi gerektiren yararlı kararlar veya yanıtlar üretebilen yazılımdır.",
    },
    "iot": {
        "en": "IoT means connecting physical devices like sensors, appliances, or controllers to the internet so they can collect data, communicate, and be monitored or controlled remotely.",
        "ar": "إنترنت الأشياء يعني ربط الأجهزة المادية مثل الحساسات والأجهزة المنزلية بالشبكة لكي تجمع البيانات وتتواصل ويمكن مراقبتها أو التحكم بها عن بُعد.",
        "tr": "Nesnelerin İnterneti, sensörler ve cihazlar gibi fiziksel sistemlerin veri toplaması, iletişim kurması ve uzaktan izlenip kontrol edilmesi için internete bağlanmasıdır.",
    },
    "backend": {
        "en": "A backend is the server-side part of a system. It handles business logic, databases, APIs, authentication, and the work that happens behind the user interface.",
        "ar": "الباك إند هو الجزء الخلفي من النظام على جهة الخادم. يتولى منطق التطبيق وقواعد البيانات والواجهات البرمجية والمصادقة وكل ما يحدث خلف الواجهة المرئية.",
        "tr": "Backend, bir sistemin sunucu tarafındaki kısmıdır. İş mantığını, veritabanlarını, API'leri, kimlik doğrulamayı ve kullanıcı arayüzünün arkasındaki işlemleri yönetir.",
    },
}


def _normalize(text: str) -> str:
    return " ".join(str(text or "").lower().split())


def _detect_topic(question: str) -> str | None:
    normalized = _normalize(question)
    for topic, phrases in GENERAL_TOPIC_KEYWORDS.items():
        if any(phrase in normalized for phrase in phrases):
            return topic
    return None


def _fallback_response(language: str) -> str:
    if language == "ar":
        return "أستطيع الإجابة عن أسئلة التقنية والمرآة بشكل مهني. اسألني سؤالاً أكثر تحديداً."
    if language == "tr":
        return "Teknoloji ve ayna sistemiyle ilgili soruları profesyonel şekilde yanıtlayabilirim. Bana daha spesifik bir soru sor."
    return "I can answer technology and mirror questions professionally. Ask me a more specific question."


def _generate_with_openai(question: str) -> str | None:
    if not OPENAI_API_KEY:
        return None

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.responses.create(
            model=OPENAI_TEXT_MODEL,
            instructions=(
                "You are HALO, a professional multilingual assistant. "
                "Answer in the same language as the user, stay concise, and avoid project-specific context unless asked."
            ),
            input=question,
            max_output_tokens=GENERAL_MAX_RESPONSE_TOKENS if is_expand_request(question) else 220,
            text={"verbosity": "low"},
            reasoning={"effort": "low"},
        )
        content = str(getattr(response, "output_text", "") or "").strip()
        return content or None
    except (APIConnectionError, APIStatusError):
        return None


def general_answer_tool(question: str) -> dict[str, Any]:
    language = detect_language(question)
    topic = _detect_topic(question)

    if topic:
        reply = GENERAL_TOPIC_RESPONSES[topic][language]
    else:
        reply = _generate_with_openai(question) or _fallback_response(language)

    return {
        "tool": "general_answer_tool",
        "reply": reply,
        "data": {
            "topic": topic or "general",
            "language": language,
        },
    }
