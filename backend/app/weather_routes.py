import json
from typing import Dict, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, Query

router = APIRouter(tags=["weather"])

REQUEST_HEADERS = {
    "User-Agent": "HALO-MIRROR/1.0 (+https://localhost)",
    "Accept": "application/json",
}

WEATHER_CODE_LABELS = {
    0: "Clear sky",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Light snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with light hail",
    99: "Thunderstorm with heavy hail",
}


def _fetch_json(url: str) -> Optional[Dict]:
    request = Request(url, headers=REQUEST_HEADERS)
    try:
        with urlopen(request, timeout=6) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception:
        return None


def _build_location_payload(
    *,
    city: Optional[str],
    region: Optional[str],
    country: Optional[str],
    latitude: Optional[float],
    longitude: Optional[float],
    source: str,
    approximate: bool,
) -> Dict:
    label = city or region or country or "Location unavailable"
    return {
        "city": city,
        "region": region,
        "country": country,
        "label": label,
        "latitude": latitude,
        "longitude": longitude,
        "source": source,
        "approximate": approximate,
    }


def _reverse_geocode(lat: float, lon: float) -> Optional[Dict]:
    query = urlencode(
        {
            "format": "jsonv2",
            "lat": lat,
            "lon": lon,
            "zoom": 10,
            "addressdetails": 1,
        }
    )
    data = _fetch_json(f"https://nominatim.openstreetmap.org/reverse?{query}")
    if not data:
        return None

    address = data.get("address", {})
    city = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("municipality")
        or address.get("county")
    )
    region = address.get("state") or address.get("region")
    country = address.get("country")

    return _build_location_payload(
        city=city,
        region=region,
        country=country,
        latitude=lat,
        longitude=lon,
        source="device_geolocation",
        approximate=False,
    )


def _lookup_location_from_ip() -> Optional[Dict]:
    data = _fetch_json("https://ipwho.is/")
    if not data or data.get("success") is False:
        return None

    latitude = data.get("latitude")
    longitude = data.get("longitude")
    return _build_location_payload(
        city=data.get("city"),
        region=data.get("region"),
        country=data.get("country"),
        latitude=float(latitude) if latitude is not None else None,
        longitude=float(longitude) if longitude is not None else None,
        source="ip_lookup",
        approximate=True,
    )


def _get_current_weather(latitude: float, longitude: float) -> Optional[Dict]:
    query = urlencode(
        {
            "latitude": latitude,
            "longitude": longitude,
            "current": "temperature_2m,weather_code,is_day",
            "temperature_unit": "celsius",
            "timezone": "auto",
        }
    )
    data = _fetch_json(f"https://api.open-meteo.com/v1/forecast?{query}")
    if not data or "current" not in data:
        return None

    current = data["current"]
    code = current.get("weather_code")
    description = WEATHER_CODE_LABELS.get(code, "Weather unavailable")

    return {
        "temperature_c": current.get("temperature_2m"),
        "weather_code": code,
        "description": description,
        "is_day": current.get("is_day"),
        "timezone": data.get("timezone"),
    }


def _resolve_location(lat: Optional[float], lon: Optional[float]) -> Dict:
    if lat is not None and lon is not None:
        reverse_location = _reverse_geocode(lat, lon)
        if reverse_location:
            return reverse_location

    ip_location = _lookup_location_from_ip()
    if ip_location:
        return ip_location

    return _build_location_payload(
        city=None,
        region=None,
        country=None,
        latitude=lat,
        longitude=lon,
        source="unavailable",
        approximate=True,
    )


@router.get("/api/location")
def read_location(
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
):
    return _resolve_location(lat, lon)


@router.get("/api/weather/current")
def read_current_weather(
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
):
    location = _resolve_location(lat, lon)
    latitude = location.get("latitude")
    longitude = location.get("longitude")

    weather = None
    if latitude is not None and longitude is not None:
        weather = _get_current_weather(float(latitude), float(longitude))

    return {
        "location": location,
        "weather": weather,
    }
