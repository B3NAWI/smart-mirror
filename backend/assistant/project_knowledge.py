from __future__ import annotations

import re

from .wake_word import normalize_text

PROJECT_TOPIC_KEYWORDS = {
    "developers": (
        "who developed you",
        "who made you",
        "who built you",
        "مين طورك",
        "من طورك",
        "seni kim geliştirdi",
        "seni kim gelistirdi",
    ),
    "overview": (
        "what is halo mirror",
        "what are you",
        "tell me about halo mirror",
        "tell me about the mirror project",
        "mirror project",
        "احكيلي عن مشروع المراية",
        "احكيلي عن مشروع المرآة",
        "شو هاد المشروع",
        "شو مشروع المراية",
        "halo mirror nedir",
        "ayna projesi",
    ),
    "components": (
        "what components do you use",
        "what hardware do you use",
        "what parts do you use",
        "شو المكونات",
        "ما المكونات",
        "hangi bileşenleri kullanıyorsun",
        "hangi bilesenleri kullaniyorsun",
    ),
    "architecture": (
        "what is your architecture",
        "explain your architecture",
        "system architecture",
        "شو المعمارية",
        "اشرح المعمارية",
        "mimarini açıkla",
        "mimarini acikla",
        "mimarin nedir",
    ),
    "sensors": (
        "what sensors do you use",
        "what sensors are used",
        "شو الحساسات المستخدمة",
        "شو الحساسات",
        "hangi sensörleri kullanıyorsun",
        "hangi sensorleri kullaniyorsun",
    ),
}

PROJECT_RESPONSES = {
    "developers": {
        "en": "I was developed by Hilal Dallashi and Baraa Amro.",
        "ar": "تم تطويري بواسطة هلال دلاشة وبراء عمرو.",
        "tr": "Hilal Dallashi ve Baraa Amro tarafından geliştirildim.",
    },
    "overview": {
        "en": (
            "HALO MIRROR is a Smart Home Mirror System that shows useful daily information on a mirror surface. "
            "A display sits behind a two-way mirror so the user can see both reflection and digital information. "
            "It shows time, date, weather, reminders, calendar items, media status, and sensor readings."
        ),
        "ar": (
            "HALO MIRROR هو نظام مرآة منزلية ذكية يعرض معلومات يومية مفيدة على سطح المرآة. "
            "توجد شاشة خلف مرآة ثنائية الاتجاه بحيث يرى المستخدم الانعكاس والمعلومات الرقمية معاً. "
            "ويعرض الوقت والتاريخ والطقس والتذكيرات والمواعيد وحالة الوسائط وقراءات الحساسات."
        ),
        "tr": (
            "HALO MIRROR, aynanın yüzeyinde yararlı günlük bilgiler gösteren bir Akıllı Ev Ayna Sistemidir. "
            "İki yönlü aynanın arkasına yerleştirilen ekran sayesinde kullanıcı hem yansımayı hem dijital bilgileri görür. "
            "Sistem saat, tarih, hava durumu, hatırlatmalar, takvim öğeleri, medya durumu ve sensör verileri gösterir."
        ),
    },
    "components": {
        "en": (
            "The system uses a two-way mirror, a display, Raspberry Pi 5, an ESP32 sensing node, a BME280 environmental sensor, "
            "a PIR motion sensor, a FastAPI backend, a SQLite database, a React/Vite dashboard, and an Android companion app."
        ),
        "ar": (
            "يستخدم النظام مرآة ثنائية الاتجاه وشاشة وRaspberry Pi 5 ووحدة ESP32 وحساس BME280 البيئي "
            "وحساس حركة PIR وباك إند FastAPI وقاعدة بيانات SQLite وواجهة React/Vite وتطبيق أندرويد مرافق."
        ),
        "tr": (
            "Sistem iki yönlü ayna, ekran, Raspberry Pi 5, ESP32 algılama düğümü, BME280 çevresel sensör, "
            "PIR hareket sensörü, FastAPI backend, SQLite veritabanı, React/Vite gösterge paneli ve Android yardımcı uygulaması kullanır."
        ),
    },
    "architecture": {
        "en": (
            "Its sensor flow is BME280 and PIR to ESP32, then MQTT, then the FastAPI backend, and finally the dashboard and Android app. "
            "Its application flow is Android App to FastAPI plus SQLite and then to the React Dashboard. "
            "This keeps sensor data, mirror modules, reminders, and calendar information synchronized."
        ),
        "ar": (
            "مسار الحساسات فيه هو BME280 وPIR إلى ESP32 ثم MQTT ثم باك إند FastAPI وأخيراً إلى الداشبورد وتطبيق أندرويد. "
            "أما مسار التطبيق فهو تطبيق أندرويد مع FastAPI وSQLite ثم إلى لوحة React. "
            "وبهذا تبقى بيانات الحساسات ووحدات المرآة والتذكيرات والتقويم متزامنة."
        ),
        "tr": (
            "Sensör akışı BME280 ve PIR'den ESP32'ye, ardından MQTT üzerinden FastAPI backend'e ve oradan gösterge paneli ile Android uygulamasına gider. "
            "Uygulama akışı ise Android uygulaması ile FastAPI ve SQLite arasında, ardından React gösterge paneline doğru çalışır. "
            "Bu yapı sensör verilerini, ayna modüllerini, hatırlatmaları ve takvim bilgisini senkronize tutar."
        ),
    },
    "sensors": {
        "en": (
            "The main sensors are the BME280 environmental sensor and the PIR motion sensor. "
            "They are read by the ESP32 sensing node and forwarded to the FastAPI backend for the dashboard and Android app."
        ),
        "ar": (
            "الحساسات الأساسية هي BME280 البيئي وحساس الحركة PIR. "
            "تتم قراءتهما عبر وحدة ESP32 ثم تُرسل البيانات إلى باك إند FastAPI ليستخدمها الداشبورد وتطبيق أندرويد."
        ),
        "tr": (
            "Temel sensörler BME280 çevresel sensörü ile PIR hareket sensörüdür. "
            "Bu veriler ESP32 algılama düğümü tarafından okunur ve FastAPI backend üzerinden gösterge paneli ile Android uygulamasına iletilir."
        ),
    },
}

PROJECT_LONG_RESPONSES = {
    "overview": {
        "en": (
            "HALO MIRROR is a Smart Home Mirror System built to combine a normal mirror experience with useful digital information. "
            "A display is placed behind a two-way mirror so the user can still see reflection while the interface shows time, weather, reminders, calendar items, media status, and sensor readings. "
            "The system combines Raspberry Pi 5 services, an ESP32 sensing node, a FastAPI backend, SQLite storage, a React/Vite dashboard, and an Android companion application."
        ),
        "ar": (
            "HALO MIRROR هو نظام مرآة منزلية ذكية صُمم ليجمع بين تجربة المرآة العادية والمعلومات الرقمية المفيدة. "
            "توضع شاشة خلف مرآة ثنائية الاتجاه بحيث يرى المستخدم انعكاسه مع الوقت والطقس والتذكيرات والتقويم وحالة الوسائط وبيانات الحساسات. "
            "ويجمع النظام بين Raspberry Pi 5 ووحدة ESP32 وباك إند FastAPI وتخزين SQLite وواجهة React/Vite وتطبيق أندرويد مرافق."
        ),
        "tr": (
            "HALO MIRROR, normal ayna deneyimini yararlı dijital bilgilerle birleştirmek için geliştirilmiş bir Akıllı Ev Ayna Sistemidir. "
            "İki yönlü aynanın arkasına yerleştirilen ekran sayesinde kullanıcı hem kendi yansımasını hem de saat, hava durumu, hatırlatmalar, takvim, medya durumu ve sensör verilerini görebilir. "
            "Sistem Raspberry Pi 5, ESP32, FastAPI backend, SQLite, React/Vite gösterge paneli ve Android yardımcı uygulamasını birlikte kullanır."
        ),
    },
}

PROJECT_KNOWLEDGE_SUMMARY = (
    "HALO MIRROR is a Smart Home Mirror System with a two-way mirror, display, Raspberry Pi 5, ESP32, "
    "BME280, PIR sensor, FastAPI backend, SQLite database, React/Vite dashboard, and Android companion app."
)


def detect_project_topic(question: str) -> str | None:
    normalized = normalize_text(question)
    if not normalized:
        return None

    for topic, phrases in PROJECT_TOPIC_KEYWORDS.items():
        if any(phrase in normalized for phrase in phrases):
            return topic

    if re.search(r"\bhalo mirror\b", normalized) or any(
        marker in normalized for marker in ("مشروع", "المراية", "المرآة", "proje", "ayna")
    ):
        return "overview"
    return None


def get_project_response(topic: str, language: str, *, explain_more: bool = False) -> str:
    normalized_topic = topic if topic in PROJECT_RESPONSES else "overview"
    response_set = (
        PROJECT_LONG_RESPONSES.get(normalized_topic)
        if explain_more and normalized_topic in PROJECT_LONG_RESPONSES
        else PROJECT_RESPONSES.get(normalized_topic)
    ) or PROJECT_RESPONSES["overview"]
    return response_set["tr" if language == "tr" else "ar" if language == "ar" else "en"]
