import { useEffect, useMemo, useRef, useState } from "react";
import ClockCard from "./components/ClockCard";
import NowPlayingCard from "./components/NowPlayingCard";
import CalendarCard from "./components/CalendarCard";
import SensorsCard from "./components/SensorsCard";
import WeatherCard from "./components/WeatherCard";
import TodayCard from "./components/TodayCard";
import DailyTipCard from "./components/DailyTipCard";
import NewsCard from "./components/NewsCard";
import HaloVoiceStatus from "./components/HaloVoiceStatus";
import useMirrorGestureCamera from "./hooks/useMirrorGestureCamera";
import { createHaloVoiceClient } from "./services/haloVoiceClient";

const apiBaseUrl = (() => {
  const configured = (import.meta.env.VITE_BACKEND_URL || "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return "";
})();

const runtimeApiKey = (() => {
  const configured = (import.meta.env.VITE_BACKEND_API_KEY || "").trim();
  return configured || "halo-local-dev-key";
})();

const dailyTips = [
  { text: "Small consistent steps beat big occasional efforts.", source: "Daily Focus" },
  { text: "Use your energy on things you can control, not on what you fear.", source: "Mindset" },
  { text: "Deep work for one hour can be more valuable than ten hours of distraction.", source: "Productivity" },
  { text: "Be kind to yourself. Growth is not always visible day to day.", source: "Self Compassion" },
  { text: "Your future is built from the tiny choices you make today.", source: "Future Self" },
  { text: "Clarity comes from action, not from overthinking.", source: "Action" },
  { text: "Protect your attention; it’s your most limited resource.", source: "Attention" },
  { text: "You don’t need more time, you need clearer priorities.", source: "Priorities" },
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function getGreeting(now = new Date()) {
  const hour = now.getHours();
  let prefix = "Hello";

  if (hour >= 5 && hour < 12) {
    prefix = "Good morning";
  } else if (hour >= 12 && hour < 17) {
    prefix = "Good afternoon";
  } else if (hour >= 17 && hour < 22) {
    prefix = "Good evening";
  } else {
    prefix = "Good night";
  }
  return { prefix };
}

function weatherAdvice(tempC) {
  if (typeof tempC !== "number" || Number.isNaN(tempC)) {
    return {
      avatar: "📡",
      advice: "Waiting for a live weather reading for your location.",
    };
  }

  let avatar = "🧍‍♂️";
  let advice = "Mild weather. A light t-shirt is fine.";

  if (tempC <= 5) {
    avatar = "🧥";
    advice = "Very cold. Wear a warm coat, scarf, and maybe gloves.";
  } else if (tempC > 5 && tempC <= 12) {
    avatar = "🧣";
    advice = "Chilly. A jacket and maybe a scarf are a good idea.";
  } else if (tempC > 12 && tempC <= 20) {
    avatar = "🧥";
    advice = "Cool weather. A light jacket is recommended.";
  } else if (tempC > 20 && tempC <= 28) {
    avatar = "👕";
    advice = "Comfortable temperature. T-shirt is perfect.";
  } else if (tempC > 28) {
    avatar = "🩳";
    advice = "Hot outside. Stay hydrated and wear light clothes.";
  }

  return { avatar, advice };
}

function buildWeatherFallback() {
  return {
    tempC: null,
    desc: "Loading weather...",
    loc: "Waiting for the phone app...",
    region: "Phone weather will appear here after sync.",
    locSource: "loading",
    isDay: 1,
    updatedAt: "",
  };
}

function buildProfileFallback() {
  return {
    accountId: "",
    accountName: "Friend",
    updatedAt: "",
  };
}

function buildNewsFallback() {
  return [];
}

function buildNowPlayingFallback() {
  return {
    isPlaying: false,
    title: "",
    artist: "",
    album: "",
    source: "other",
    progressSeconds: 0,
    effectiveProgressSeconds: 0,
    durationSeconds: null,
    artworkUrl: "",
    trackUrl: "",
    videoStreamUrl: "",
    videoThumbnailUrl: "",
    playbackNote: "",
    updatedAt: null,
  };
}

const MEDIA_HISTORY_STORAGE_KEY = "halo.mirror.mediaHistory.v1";

function loadStoredMediaHistory() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(MEDIA_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeNowPlayingPayload(item))
      .filter((item) => item.title && canMirrorPlayFromGesture(item));
  } catch {
    return [];
  }
}

function saveStoredMediaHistory(items) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(MEDIA_HISTORY_STORAGE_KEY, JSON.stringify(items.slice(-20)));
  } catch {
    // Best-effort only.
  }
}

function normalizeNowPlayingPayload(payload) {
  const progressSeconds = Number.isFinite(payload?.progress_seconds)
    ? payload.progress_seconds
    : Number.isFinite(payload?.progressSeconds)
    ? payload.progressSeconds
    : 0;

  const effectiveProgressSeconds = Number.isFinite(payload?.effective_progress_seconds)
    ? payload.effective_progress_seconds
    : Number.isFinite(payload?.effectiveProgressSeconds)
    ? payload.effectiveProgressSeconds
    : progressSeconds;

  const durationSeconds = Number.isFinite(payload?.duration_seconds)
    ? payload.duration_seconds
    : Number.isFinite(payload?.durationSeconds)
    ? payload.durationSeconds
    : null;

  return {
    isPlaying: Boolean(payload?.is_playing ?? payload?.isPlaying),
    title: payload?.title || "",
    artist: payload?.artist || "",
    album: payload?.album || "",
    source: String(payload?.source || "other").toLowerCase(),
    progressSeconds,
    effectiveProgressSeconds,
    durationSeconds,
    artworkUrl: payload?.artwork_url || payload?.artworkUrl || "",
    trackUrl: payload?.track_url || payload?.trackUrl || "",
    videoStreamUrl: payload?.video_stream_url || payload?.videoStreamUrl || "",
    videoThumbnailUrl: payload?.video_thumbnail_url || payload?.videoThumbnailUrl || "",
    playbackNote: payload?.playback_note || payload?.playbackNote || "",
    updatedAt: payload?.updated_at || payload?.updatedAt || null,
  };
}

function buildNowPlayingKey(payload) {
  const source = String(payload?.source || "other").toLowerCase();
  const title = String(payload?.title || "").trim().toLowerCase();
  const artist = String(payload?.artist || "").trim().toLowerCase();
  const trackUrl = String(payload?.trackUrl || payload?.track_url || "").trim();

  return [source, title, artist, trackUrl].join("::");
}

function canMirrorPlayFromGesture(payload) {
  const source = String(payload?.source || "").toLowerCase();
  if (source === "youtube") {
    return Boolean(payload?.trackUrl || payload?.track_url || payload?.videoStreamUrl);
  }

  if (source === "spotify") {
    return Boolean(payload?.trackUrl || payload?.track_url);
  }

  return false;
}

function toNowPlayingApiPayload(payload) {
  return {
    title: payload?.title || null,
    artist: payload?.artist || null,
    album: payload?.album || null,
    source: payload?.source || "other",
    is_playing: Boolean(payload?.isPlaying),
    progress_seconds: Number.isFinite(payload?.effectiveProgressSeconds)
      ? Math.max(0, Math.round(payload.effectiveProgressSeconds))
      : Number.isFinite(payload?.progressSeconds)
      ? Math.max(0, Math.round(payload.progressSeconds))
      : 0,
    duration_seconds: Number.isFinite(payload?.durationSeconds)
      ? Math.max(1, Math.round(payload.durationSeconds))
      : null,
    artwork_url: payload?.artworkUrl || null,
    track_url: payload?.trackUrl || null,
  };
}

function formatLocationLines(location) {
  const city = location?.city || location?.label || "Location unavailable";

  const regionParts = [];
  if (location?.region && location.region !== city) {
    regionParts.push(location.region);
  }
  if (location?.country && location.country !== city) {
    regionParts.push(location.country);
  }

  return {
    city,
    region: regionParts.join(", "),
  };
}

function formatLocalIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatCalendarDateLabel(value) {
  const parsed = new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function isPlannerEvent(event) {
  return event?.source === "planner_block" || (event?.source === "mobile" && event?.description);
}

function extractPlannerBlockTitle(event) {
  const rawTitle = String(event?.title || "").trim();
  const mainTitle = String(event?.description || "").trim();

  if (!rawTitle || !mainTitle) {
    return rawTitle || "Planned block";
  }

  const prefix = `${mainTitle} - `;
  if (rawTitle.toLowerCase().startsWith(prefix.toLowerCase())) {
    return rawTitle.slice(prefix.length).trim() || "Planned block";
  }

  return rawTitle;
}

function buildCalendarAgenda(events = [], todos = []) {
  const itemsByDate = {};

  const addItem = (dateKey, item) => {
    if (!dateKey) {
      return;
    }
    if (!itemsByDate[dateKey]) {
      itemsByDate[dateKey] = [];
    }
    itemsByDate[dateKey].push(item);
  };

  events.forEach((event) => {
    const dateKey = event?.start_time
      ? String(event.start_time).split("T")[0]
      : String(event?.date || "");
    const plannerEvent = isPlannerEvent(event);
    const blockTitle = extractPlannerBlockTitle(event);
    const timeLabel = formatAgendaTime(event?.start_time || event?.time);

    addItem(dateKey, {
      id: `calendar-${event.id}`,
      title: plannerEvent && event?.description ? event.description : event?.title || "Untitled event",
      detail: plannerEvent
        ? `${blockTitle}${timeLabel ? ` - ${timeLabel}` : ""}`
        : timeLabel,
      time: timeLabel,
      sortKey: agendaSortKey(event?.start_time || event?.time),
      completed: Boolean(event?.completed),
      kind: plannerEvent ? "plan" : "event",
    });
  });

  todos.forEach((todo) => {
    const dateKey = String(todo?.date || "");
    const timeLabel = formatAgendaTime(todo?.due_time);
    const priorityLabel = todo?.priority ? `${todo.priority} priority` : "Reminder";

    addItem(dateKey, {
      id: `todo-${todo.id}`,
      title: todo?.title || "Untitled task",
      detail: `${timeLabel} - ${priorityLabel}`,
      time: timeLabel,
      sortKey: agendaSortKey(todo?.due_time),
      completed: Boolean(todo?.completed),
      kind: "todo",
    });
  });

  Object.keys(itemsByDate).forEach((dateKey) => {
    itemsByDate[dateKey] = itemsByDate[dateKey].sort((left, right) =>
      left.sortKey.localeCompare(right.sortKey)
    );
  });

  return itemsByDate;
}

function buildCalendarModel(date = new Date(), itemsByDate = {}, selectedDate = "") {
  const year = date.getFullYear();
  const month = date.getMonth();
  const todayDate = date.getDate();
  const currentMonthKey = `${year}-${pad2(month + 1)}`;

  const monthNames = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];
  const weekDays = ["S", "M", "T", "W", "T", "F", "S"];

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  weekDays.forEach((d) => cells.push({ type: "header", label: d }));
  for (let i = 0; i < firstDay; i++) cells.push({ type: "empty" });
  for (let d = 1; d <= daysInMonth; d++) {
    const isoDate = `${currentMonthKey}-${pad2(d)}`;
    const items = Array.isArray(itemsByDate[isoDate]) ? itemsByDate[isoDate] : [];
    cells.push({
      type: "day",
      day: d,
      isoDate,
      isToday: d === todayDate,
      isSelected: selectedDate === isoDate,
      itemCount: items.length,
      hasItems: items.length > 0,
      hasPending: items.some((item) => !item.completed),
      hasCompleted: items.some((item) => item.completed),
    });
  }

  return {
    title: `${monthNames[month]} ${year}`,
    cells,
    selectedDate,
    selectedLabel: selectedDate ? formatCalendarDateLabel(selectedDate) : "",
    selectedItems: selectedDate ? itemsByDate[selectedDate] || [] : [],
  };
}

const defaultModuleVisibility = Object.freeze({
  weatherEnabled: true,
  newsEnabled: true,
  dateEnabled: true,
  remindersEnabled: true,
  calendarEnabled: true,
  temperatureEnabled: true,
  humidityEnabled: true,
  pressureEnabled: true,
  spotifyEnabled: true,
  youtubeEnabled: true,
  gestureCameraEnabled: false,
});

function readBooleanSetting(source, snakeKey, camelKey) {
  if (typeof source?.[snakeKey] === "boolean") {
    return source[snakeKey];
  }
  if (typeof source?.[camelKey] === "boolean") {
    return source[camelKey];
  }
  return true;
}

function normalizeModuleVisibilityPayload(payload) {
  const source = payload?.modules || payload?.module_visibility || payload?.visibility || {};

  return {
    weatherEnabled: readBooleanSetting(source, "weather_enabled", "weatherEnabled"),
    newsEnabled: readBooleanSetting(source, "news_enabled", "newsEnabled"),
    dateEnabled: readBooleanSetting(source, "date_enabled", "dateEnabled"),
    remindersEnabled: readBooleanSetting(source, "reminders_enabled", "remindersEnabled"),
    calendarEnabled: readBooleanSetting(source, "calendar_enabled", "calendarEnabled"),
    temperatureEnabled: readBooleanSetting(source, "temperature_enabled", "temperatureEnabled"),
    humidityEnabled: readBooleanSetting(source, "humidity_enabled", "humidityEnabled"),
    pressureEnabled: readBooleanSetting(source, "pressure_enabled", "pressureEnabled"),
    spotifyEnabled: readBooleanSetting(source, "spotify_enabled", "spotifyEnabled"),
    youtubeEnabled: readBooleanSetting(source, "youtube_enabled", "youtubeEnabled"),
    gestureCameraEnabled: readBooleanSetting(
      source,
      "gesture_camera_enabled",
      "gestureCameraEnabled"
    ),
  };
}

function readNumericValue(source, keys = []) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function normalizeSensorStatePayload(payload, fallback) {
  const source = payload?.state || payload || {};
  const temperature =
    readNumericValue(source, ["temperature", "temperature_c", "temp", "temp_c"]) ??
    fallback.temperature;
  const humidity =
    readNumericValue(source, ["humidity", "humidity_percent"]) ?? fallback.humidity;
  const pressure =
    readNumericValue(source, ["pressure", "pressure_hpa"]) ?? fallback.pressure;

  return {
    temperature,
    humidity: Math.round(humidity),
    pressure: Math.round(pressure),
    motion: Boolean(source?.motion ?? source?.pir ?? fallback.motion),
    gesture:
      typeof source?.gesture === "string"
        ? source.gesture
        : typeof source?.last_gesture === "string"
        ? source.last_gesture
        : fallback.gesture,
    updatedAt:
      typeof source?.mirror_state_updated_at === "string"
        ? source.mirror_state_updated_at
        : typeof source?.mirrorStateUpdatedAt === "string"
        ? source.mirrorStateUpdatedAt
        : fallback.updatedAt,
  };
}

function normalizeWeatherStatePayload(payload, fallback) {
  const source = payload?.state || payload || {};
  const nextTemp =
    readNumericValue(source, ["weather_temperature_c", "weatherTemperatureC"]) ?? fallback.tempC;
  const nextDesc =
    typeof source?.weather_description === "string"
      ? source.weather_description
      : typeof source?.weatherDescription === "string"
      ? source.weatherDescription
      : fallback.desc;
  const nextLoc =
    typeof source?.weather_location_label === "string"
      ? source.weather_location_label
      : typeof source?.weatherLocationLabel === "string"
      ? source.weatherLocationLabel
      : fallback.loc;
  const nextRegion =
    typeof source?.weather_region === "string"
      ? source.weather_region
      : typeof source?.weatherRegion === "string"
      ? source.weatherRegion
      : fallback.region;
  const nextSource =
    typeof source?.weather_source === "string"
      ? source.weather_source
      : typeof source?.weatherSource === "string"
      ? source.weatherSource
      : fallback.locSource;
  const nextIsDay =
    readNumericValue(source, ["weather_is_day", "weatherIsDay"]) ?? fallback.isDay;
  const nextUpdatedAt =
    typeof source?.weather_updated_at === "string"
      ? source.weather_updated_at
      : typeof source?.weatherUpdatedAt === "string"
      ? source.weatherUpdatedAt
      : fallback.updatedAt;

  return {
    tempC: nextTemp,
    desc: nextDesc || fallback.desc,
    loc: nextLoc || fallback.loc,
    region: nextRegion || "",
    locSource: nextSource || fallback.locSource,
    isDay: nextIsDay,
    updatedAt: nextUpdatedAt || fallback.updatedAt,
  };
}

function hasSyncedWeather(payload) {
  const source = payload?.state || payload || {};
  return Boolean(
    source?.weather_updated_at ||
      source?.weatherUpdatedAt ||
      source?.weather_location_label ||
      source?.weatherLocationLabel
  );
}

function normalizeProfilePayload(payload, fallback) {
  const source = payload?.state || payload || {};
  return {
    accountId:
      typeof source?.active_account_id === "string"
        ? source.active_account_id
        : typeof source?.activeAccountId === "string"
        ? source.activeAccountId
        : fallback.accountId,
    accountName:
      typeof source?.active_account_name === "string" && source.active_account_name.trim()
        ? source.active_account_name.trim()
        : typeof source?.activeAccountName === "string" && source.activeAccountName.trim()
        ? source.activeAccountName.trim()
        : fallback.accountName,
    updatedAt:
      typeof source?.profile_updated_at === "string"
        ? source.profile_updated_at
        : typeof source?.profileUpdatedAt === "string"
        ? source.profileUpdatedAt
        : fallback.updatedAt,
  };
}

function normalizeFallbackWeatherPayload(payload) {
  const location = payload?.location;
  const currentWeather = payload?.weather;
  const locationLines = formatLocationLines(location);

  return {
    tempC:
      typeof currentWeather?.temperature_c === "number"
        ? currentWeather.temperature_c
        : null,
    desc: currentWeather?.description || "Weather unavailable",
    loc: locationLines.city,
    region: locationLines.region,
    locSource: location?.source || "unavailable",
    isDay:
      typeof currentWeather?.is_day === "number"
        ? currentWeather.is_day
        : 1,
    updatedAt: new Date().toISOString(),
  };
}

function normalizePlannerPlans(payload) {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.plans)
    ? payload.plans
    : [];

  return items.map((plan) => ({
    id: String(plan?.id || ""),
    title: String(plan?.title || "Untitled plan"),
    date: String(plan?.date || ""),
    segments: Array.isArray(plan?.segments)
      ? plan.segments.map((segment) => ({
          id: String(segment?.id || ""),
          title: String(segment?.title || "Untitled block"),
          startTime: String(segment?.start_time || segment?.startTime || ""),
          endTime: String(segment?.end_time || segment?.endTime || ""),
          alarmAtStart: Boolean(segment?.alarm_at_start ?? segment?.alarmAtStart),
          alarmAtEnd: Boolean(segment?.alarm_at_end ?? segment?.alarmAtEnd),
          isDone: Boolean(segment?.is_done ?? segment?.isDone),
        }))
      : [],
  }));
}

function normalizeNewsPayload(payload) {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.headlines)
    ? payload.headlines
    : [];

  return items.map((item, index) => ({
    id: item?.id || `headline-${index + 1}`,
    title: String(item?.title || "").trim(),
    link: typeof item?.link === "string" ? item.link : "",
    source: typeof item?.source === "string" ? item.source : "News",
    published_at:
      typeof item?.published_at === "string"
        ? item.published_at
        : typeof item?.publishedAt === "string"
        ? item.publishedAt
        : "",
  }));
}

function resolveVoiceScreenName(detail) {
  const toolName = String(detail?.tool || detail?.result?.tool || "").trim();
  const widgetName = String(
    detail?.arguments?.widgetName ||
      detail?.result?.data?.widget ||
      ""
  ).trim();
  const screenName = String(
    detail?.arguments?.screenName ||
      detail?.result?.data?.screen_name ||
      detail?.result?.data?.ui?.screen_name ||
      ""
  ).trim();

  if (widgetName === "news" || toolName === "show_news") {
    return "news";
  }

  if (screenName) {
    return screenName;
  }

  if (toolName === "mirror_show_today") {
    return "today";
  }

  if (toolName === "mirror_show_calendar") {
    return "calendar";
  }

  if (toolName === "mirror_show_weather") {
    return "weather";
  }

  if (toolName === "mirror_show_sensors") {
    return "sensors";
  }

  if (toolName === "media_open_youtube") {
    return "youtube";
  }

  if (toolName === "show_calendar") {
    return "calendar";
  }

  if (toolName === "show_weather") {
    return "weather";
  }

  if (toolName === "show_news") {
    return "news";
  }

  if (toolName === "open_youtube") {
    return "youtube";
  }

  return "";
}

function buildRefreshSignalsFallback() {
  return {
    weatherRequestedAt: "",
    mirrorRequestedAt: "",
  };
}

function normalizeRefreshSignalsPayload(payload) {
  const source = payload?.modules || payload?.module_visibility || payload?.visibility || {};

  return {
    weatherRequestedAt:
      typeof source?.weather_refresh_requested_at === "string"
        ? source.weather_refresh_requested_at
        : typeof source?.weatherRefreshRequestedAt === "string"
        ? source.weatherRefreshRequestedAt
        : "",
    mirrorRequestedAt:
      typeof source?.mirror_refresh_requested_at === "string"
        ? source.mirror_refresh_requested_at
        : typeof source?.mirrorRefreshRequestedAt === "string"
        ? source.mirrorRefreshRequestedAt
        : "",
  };
}

function parseTimestamp(value) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecentRefresh(value, windowSeconds = 12) {
  const parsed = parseTimestamp(value);
  if (parsed == null) {
    return false;
  }

  return Date.now() - parsed <= windowSeconds * 1000;
}

function formatRefreshLabel(value) {
  const parsed = parseTimestamp(value);
  if (parsed == null) {
    return "";
  }

  const diffSeconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (diffSeconds < 8) {
    return "just now";
  }
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  return `${diffHours}h ago`;
}

function formatAgendaTime(value) {
  if (!value) {
    return "Any time";
  }

  const normalized = value.includes("T") ? value.split("T")[1] : value;
  const [hoursText = "", minutesText = "00"] = normalized.split(":");
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return value;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function buildTodayPlanFallback() {
  return {
    items: [],
    remainingTodosCount: 0,
    completedTodosCount: 0,
    highPriorityCount: 0,
    isLoading: true,
  };
}

function agendaSortKey(value) {
  if (!value) {
    return "99:99:99";
  }

  const normalized = value.includes("T") ? value.split("T")[1] : value;
  return normalized.padEnd(8, ":00").slice(0, 8);
}

function normalizeDailyPlan(payload) {
  const calendarItems = Array.isArray(payload?.calendar_events)
    ? payload.calendar_events.map((event) => ({
        id: `event-${event.id}`,
        time: formatAgendaTime(event.start_time || event.time),
        sortKey: agendaSortKey(event.start_time || event.time),
        title: event.title || "Untitled event",
        kind: event.completed ? "done" : event.source === "planner_block" ? "todo" : "event",
      }))
    : [];

  const todoItems = Array.isArray(payload?.todos)
    ? payload.todos.map((todo) => ({
        id: `todo-${todo.id}`,
        time: formatAgendaTime(todo.due_time),
        sortKey: agendaSortKey(todo.due_time),
        title: todo.title || "Untitled task",
        kind: todo.completed ? "done" : "todo",
      }))
    : [];

  const items = [...calendarItems, ...todoItems]
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .slice(0, 6);

  return {
    items,
    remainingTodosCount: Number.isFinite(payload?.remaining_todos_count)
      ? payload.remaining_todos_count
      : 0,
    completedTodosCount: Number.isFinite(payload?.completed_todos_count)
      ? payload.completed_todos_count
      : 0,
    highPriorityCount: Number.isFinite(payload?.high_priority_count)
      ? payload.high_priority_count
      : 0,
    isLoading: false,
  };
}

export default function Dashboard() {
  const [clock, setClock] = useState("00:00");
  const [dateText, setDateText] = useState("Loading...");
  const [{ prefix }, setGreeting] = useState(() => getGreeting());
  const [profile, setProfile] = useState(() => buildProfileFallback());

  const [tip, setTip] = useState(() => {
    const today = new Date();
    return dailyTips[today.getDate() % dailyTips.length];
  });

  const [sensorData, setSensorData] = useState({
    temperature: 22.5,
    humidity: 55,
    pressure: 1000,
    motion: false,
    gesture: "none",
    updatedAt: "",
  });
  const [moduleVisibility, setModuleVisibility] = useState(() => ({
    ...defaultModuleVisibility,
  }));
  const [refreshSignals, setRefreshSignals] = useState(() =>
    buildRefreshSignalsFallback()
  );

  const [weather, setWeather] = useState({
    ...buildWeatherFallback(),
  });
  const [plannerPlans, setPlannerPlans] = useState([]);
  const [newsHeadlines, setNewsHeadlines] = useState(() => buildNewsFallback());
  const [mirrorAlarm, setMirrorAlarm] = useState(null);
  const [voiceState, setVoiceState] = useState({
    status: "idle",
    errorMessage: "",
    wakeRecognitionSupported: false,
    shortcutLabel: "Ctrl+Shift+H",
    voiceEnabled: true,
    wakeModeActive: false,
    wakeEngine: "manual",
    microphonePermission: "prompt",
  });
  const [weatherRefreshKey, setWeatherRefreshKey] = useState(0);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const weatherRefreshSeenRef = useRef("");
  const dashboardRefreshSeenRef = useRef("");
  const hasSyncedWeatherRef = useRef(false);
  const triggeredAlarmKeysRef = useRef(new Set());

  const [nowPlaying, setNowPlaying] = useState(() => buildNowPlayingFallback());
  const [gestureCommand, setGestureCommand] = useState(null);
  const [todayPlan, setTodayPlan] = useState(() => buildTodayPlanFallback());
  const [calendarMonthDate] = useState(() => new Date());
  const [calendarItemsByDate, setCalendarItemsByDate] = useState(() => ({}));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() =>
    formatLocalIsoDate(new Date())
  );
  const initialMediaHistory = useMemo(() => loadStoredMediaHistory(), []);
  const mediaHistoryRef = useRef(initialMediaHistory);
  const mediaHistoryIndexRef = useRef(Math.max(initialMediaHistory.length - 1, -1));
  const lastNowPlayingKeyRef = useRef("");
  const nowPlayingTransitionActiveRef = useRef(false);
  const nowPlayingTransitionVersionRef = useRef(0);
  const voiceClientRef = useRef(null);
  const voiceContextRef = useRef({
    userId: "mirror-local",
    accountName: "Friend",
  });
  const weatherCardRef = useRef(null);
  const sensorsCardRef = useRef(null);
  const todayCardRef = useRef(null);
  const nowPlayingCardRef = useRef(null);
  const calendarCardRef = useRef(null);
  const newsCardRef = useRef(null);
  const calendar = useMemo(
    () => buildCalendarModel(calendarMonthDate, calendarItemsByDate, selectedCalendarDate),
    [calendarItemsByDate, calendarMonthDate, selectedCalendarDate]
  );

  const publishRuntimeState = async (updates) => {
    try {
      await fetch(`${apiBaseUrl}/api/state/runtime`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": runtimeApiKey,
        },
        body: JSON.stringify(updates),
      });
    } catch {
      // Keep the mirror UI responsive even if the backend write fails.
    }
  };

  const publishNowPlayingState = async (payload) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/now-playing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": runtimeApiKey,
        },
        body: JSON.stringify(toNowPlayingApiPayload(payload)),
      });
      if (!response.ok) {
        throw new Error("Now playing sync failed");
      }
      return await response.json();
    } catch {
      // Keep local playback responsive if the mirror state sync misses one update.
      return null;
    }
  };

  const rememberNowPlaying = (payload, options = {}) => {
    const { pushHistory = true } = options;
    const normalized = normalizeNowPlayingPayload(payload);
    const itemKey = buildNowPlayingKey(normalized);

    setNowPlaying(normalized);

    if (!normalized.title) {
      lastNowPlayingKeyRef.current = "";
      return normalized;
    }

    if (!pushHistory || !canMirrorPlayFromGesture(normalized)) {
      lastNowPlayingKeyRef.current = itemKey;
      return normalized;
    }

    const existingIndex = mediaHistoryRef.current.findIndex(
      (entry) => buildNowPlayingKey(entry) === itemKey
    );

    if (existingIndex >= 0) {
      mediaHistoryRef.current[existingIndex] = normalized;
      mediaHistoryIndexRef.current = existingIndex;
      saveStoredMediaHistory(mediaHistoryRef.current);
      lastNowPlayingKeyRef.current = itemKey;
      return normalized;
    }

    const nextHistory = [...mediaHistoryRef.current, normalized].slice(-20);
    mediaHistoryRef.current = nextHistory;
    mediaHistoryIndexRef.current = nextHistory.length - 1;
    saveStoredMediaHistory(nextHistory);
    lastNowPlayingKeyRef.current = itemKey;
    return normalized;
  };

  const beginNowPlayingTransition = () => {
    nowPlayingTransitionVersionRef.current += 1;
    nowPlayingTransitionActiveRef.current = true;
    return nowPlayingTransitionVersionRef.current;
  };

  const finishNowPlayingTransition = (version) => {
    if (nowPlayingTransitionVersionRef.current === version) {
      nowPlayingTransitionActiveRef.current = false;
    }
  };

  const queueGestureCommand = (action, extra = {}) => {
    setGestureCommand({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      ...extra,
    });
  };

  const handleHorizontalGesture = async (gesture) => {
    const source = String(nowPlaying?.source || "").toLowerCase();
    if (source === "spotify") {
      return;
    }

    const transitionVersion = beginNowPlayingTransition();

    const history = mediaHistoryRef.current.filter(
      (entry) => String(entry?.source || "").toLowerCase() === source
    );
    const currentKey = buildNowPlayingKey(nowPlaying);
    let currentIndex = history.findIndex((entry) => buildNowPlayingKey(entry) === currentKey);

    if (currentIndex < 0) {
      currentIndex = history.length - 1;
    }

    const targetIndex = gesture === "left" ? currentIndex - 1 : currentIndex + 1;
    const targetItem = history[targetIndex];

    if (!targetItem) {
      if (
        source !== "youtube" ||
        gesture !== "right" ||
        !canMirrorPlayFromGesture(nowPlaying)
      ) {
        finishNowPlayingTransition(transitionVersion);
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/api/now-playing/next`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": runtimeApiKey,
          },
          body: JSON.stringify({
            exclude_track_urls: history
              .map((entry) => entry?.trackUrl || entry?.track_url || "")
              .filter(Boolean),
          }),
        });
        if (!response.ok) {
          throw new Error("Next YouTube video request failed");
        }

        const payload = await response.json();
        const nextItem = rememberNowPlaying(payload);
        queueGestureCommand("history_next", {
          title: nextItem.title || "",
          trackUrl: nextItem.trackUrl || "",
          source: nextItem.source || "",
        });
      } catch {
        // If no recommendation is available, leave the current video playing.
      } finally {
        finishNowPlayingTransition(transitionVersion);
      }
      return;
    }

    const targetPlaybackItem = {
      ...targetItem,
      isPlaying: true,
      progressSeconds: 0,
      effectiveProgressSeconds: 0,
    };

    try {
      const syncedPayload = await publishNowPlayingState(targetPlaybackItem);
      const nextItem = rememberNowPlaying(syncedPayload || targetPlaybackItem);
      const nextKey = buildNowPlayingKey(nextItem);
      const nextIndex = mediaHistoryRef.current.findIndex(
        (entry) => buildNowPlayingKey(entry) === nextKey
      );

      mediaHistoryIndexRef.current = nextIndex >= 0 ? nextIndex : targetIndex;
      saveStoredMediaHistory(mediaHistoryRef.current);
      queueGestureCommand(
        gesture === "left" ? "history_previous" : "history_next",
        {
          title: nextItem.title || "",
          trackUrl: nextItem.trackUrl || "",
          source: nextItem.source || "",
        }
      );
    } finally {
      finishNowPlayingTransition(transitionVersion);
    }
  };

  const triggerGestureAction = (gesture) => {
    if (gesture === "up") {
      queueGestureCommand("volume_up");
      return;
    }

    if (gesture === "down") {
      queueGestureCommand("volume_down");
      return;
    }

    if (gesture === "left" || gesture === "right") {
      void handleHorizontalGesture(gesture);
    }
  };

  const handleGestureDetected = (gesture) => {
    setSensorData((current) => ({
      ...current,
      gesture,
    }));
    window.dispatchEvent(new CustomEvent("halo:gesture", { detail: { gesture } }));
    publishRuntimeState({ gesture });
    triggerGestureAction(gesture);
  };

  const gestureCamera = useMirrorGestureCamera({
    enabled: moduleVisibility.gestureCameraEnabled,
    onGestureDetected: handleGestureDetected,
  });

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
      setDateText(
        now.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      );
      setGreeting(getGreeting(now));
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const today = new Date();
    setTip(dailyTips[today.getDate() % dailyTips.length]);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadMirrorState = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/state`);
        if (!response.ok) {
          throw new Error("Mirror state request failed");
        }

        const payload = await response.json();
        if (!cancelled) {
          setSensorData((current) => normalizeSensorStatePayload(payload, current));
          setModuleVisibility(normalizeModuleVisibilityPayload(payload));
          setProfile((current) => normalizeProfilePayload(payload, current));
          const nextSignals = normalizeRefreshSignalsPayload(payload);
          setRefreshSignals(nextSignals);
          hasSyncedWeatherRef.current = hasSyncedWeather(payload);
          if (hasSyncedWeatherRef.current) {
            setWeather((current) => normalizeWeatherStatePayload(payload, current));
          }

          if (
            nextSignals.weatherRequestedAt &&
            nextSignals.weatherRequestedAt !== weatherRefreshSeenRef.current
          ) {
            weatherRefreshSeenRef.current = nextSignals.weatherRequestedAt;
            setWeatherRefreshKey((value) => value + 1);
          }

          if (
            nextSignals.mirrorRequestedAt &&
            nextSignals.mirrorRequestedAt !== dashboardRefreshSeenRef.current
          ) {
            dashboardRefreshSeenRef.current = nextSignals.mirrorRequestedAt;
            setDashboardRefreshKey((value) => value + 1);
          }
        }
      } catch {
        if (!cancelled) {
          setModuleVisibility((current) => ({ ...current }));
        }
      }
    };

    loadMirrorState();
    const pollId = setInterval(loadMirrorState, 5000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchWeather = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/weather/current`);
        if (!response.ok) {
          throw new Error("Weather request failed");
        }
        return await response.json();
      } catch {
        return null;
      }
    };

    const loadFallbackWeather = async () => {
      if (hasSyncedWeatherRef.current) {
        return;
      }
      const fallbackWeather = await fetchWeather();
      if (cancelled || !fallbackWeather || hasSyncedWeatherRef.current) {
        return;
      }
      setWeather(normalizeFallbackWeatherPayload(fallbackWeather));
    };

    loadFallbackWeather();

    return () => {
      cancelled = true;
    };
  }, [weatherRefreshKey]);

  useEffect(() => {
    let cancelled = false;

    const loadDailyPlan = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/daily-plan`);
        if (!response.ok) {
          throw new Error("Daily plan request failed");
        }

        const payload = await response.json();
        if (!cancelled) {
          setTodayPlan(normalizeDailyPlan(payload));
        }
      } catch {
        if (!cancelled) {
          setTodayPlan((current) => ({
            ...current,
            isLoading: false,
          }));
        }
      }
    };

    loadDailyPlan();
    const pollId = setInterval(loadDailyPlan, 5000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [dashboardRefreshKey]);

  useEffect(() => {
    let cancelled = false;

    const loadNews = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/news/headlines`);
        if (!response.ok) {
          throw new Error("News request failed");
        }
        const payload = await response.json();
        if (!cancelled) {
          setNewsHeadlines(normalizeNewsPayload(payload));
        }
      } catch {
        if (!cancelled) {
          setNewsHeadlines((current) => current);
        }
      }
    };

    loadNews();
    const pollId = setInterval(loadNews, 300000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [dashboardRefreshKey]);

  useEffect(() => {
    let cancelled = false;

    const loadCalendarAgenda = async () => {
      try {
        const [calendarResponse, todosResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/api/calendar`),
          fetch(`${apiBaseUrl}/api/todos`),
        ]);

        if (!calendarResponse.ok || !todosResponse.ok) {
          throw new Error("Calendar agenda request failed");
        }

        const [calendarPayload, todosPayload] = await Promise.all([
          calendarResponse.json(),
          todosResponse.json(),
        ]);

        if (!cancelled) {
          setCalendarItemsByDate(buildCalendarAgenda(calendarPayload, todosPayload));
        }
      } catch {
        if (!cancelled) {
          setCalendarItemsByDate((current) => current);
        }
      }
    };

    loadCalendarAgenda();
    const pollId = setInterval(loadCalendarAgenda, 5000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [dashboardRefreshKey]);

  useEffect(() => {
    let cancelled = false;

    const loadPlannerPlans = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/planner/plans`);
        if (!response.ok) {
          throw new Error("Planner request failed");
        }
        const payload = await response.json();
        if (!cancelled) {
          setPlannerPlans(normalizePlannerPlans(payload));
        }
      } catch {
        if (!cancelled) {
          setPlannerPlans((current) => current);
        }
      }
    };

    loadPlannerPlans();
    const pollId = setInterval(loadPlannerPlans, 5000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [dashboardRefreshKey]);

  useEffect(() => {
    const speakAlarm = (message) => {
      try {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          const utterance = new SpeechSynthesisUtterance(message);
          utterance.rate = 1;
          utterance.pitch = 1;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        }
      } catch {
        // Mirror alarm voice is best-effort only.
      }
    };

    const playBeep = () => {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.type = "square";
        oscillator.frequency.value = 880;
        gainNode.gain.value = 0.05;
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start();
        window.setTimeout(() => {
          oscillator.stop();
          audioContext.close().catch(() => {});
        }, 450);
      } catch {
        // Best-effort only.
      }
    };

    const evaluateAlarms = () => {
      const now = new Date();
      const todayKey = formatLocalIsoDate(now);
      const currentMinuteKey = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

      plannerPlans.forEach((plan) => {
        if (plan.date !== todayKey) {
          return;
        }

        plan.segments.forEach((segment) => {
          if (segment.isDone) {
            return;
          }

          const maybeTrigger = (alarmType, timeValue, label) => {
            if (!timeValue || timeValue.slice(0, 5) !== currentMinuteKey) {
              return;
            }
            const alarmKey = `${todayKey}:${plan.id}:${segment.id}:${alarmType}:${currentMinuteKey}`;
            if (triggeredAlarmKeysRef.current.has(alarmKey)) {
              return;
            }
            triggeredAlarmKeysRef.current.add(alarmKey);
            const message = `${segment.title}. ${label}.`;
            setMirrorAlarm({
              id: alarmKey,
              title: segment.title,
              detail: `${plan.title} - ${label}`,
            });
            playBeep();
            speakAlarm(message);
          };

          if (segment.alarmAtStart) {
            maybeTrigger("start", segment.startTime, "Start now");
          }
          if (segment.alarmAtEnd) {
            maybeTrigger("end", segment.endTime, "Ends now");
          }
        });
      });
    };

    evaluateAlarms();
    const intervalId = setInterval(evaluateAlarms, 1000);
    return () => clearInterval(intervalId);
  }, [plannerPlans]);

  useEffect(() => {
    if (!mirrorAlarm) {
      return undefined;
    }
    const timeoutId = setTimeout(() => setMirrorAlarm(null), 45000);
    return () => clearTimeout(timeoutId);
  }, [mirrorAlarm]);

  useEffect(() => {
    let cancelled = false;

    const loadNowPlaying = async () => {
      if (nowPlayingTransitionActiveRef.current) {
        return;
      }

      const transitionVersionAtRequest = nowPlayingTransitionVersionRef.current;

      try {
        const response = await fetch(`${apiBaseUrl}/api/now-playing`);
        if (!response.ok) {
          throw new Error("Now playing request failed");
        }

        const payload = await response.json();
        if (
          !cancelled &&
          !nowPlayingTransitionActiveRef.current &&
          transitionVersionAtRequest === nowPlayingTransitionVersionRef.current
        ) {
          rememberNowPlaying(payload);
        }
      } catch {
        if (
          !cancelled &&
          !nowPlayingTransitionActiveRef.current &&
          transitionVersionAtRequest === nowPlayingTransitionVersionRef.current
        ) {
          setNowPlaying((current) => ({
            ...current,
            isPlaying: false,
          }));
        }
      }
    };

    loadNowPlaying();
    const pollId = setInterval(loadNowPlaying, 4000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [dashboardRefreshKey]);

  useEffect(() => {
    const tickId = setInterval(() => {
      setNowPlaying((current) => {
        if (!current.isPlaying) {
          return current;
        }

        const duration = current.durationSeconds;
        const nextProgress =
          typeof duration === "number"
            ? Math.min(current.effectiveProgressSeconds + 1, duration)
            : current.effectiveProgressSeconds + 1;

        if (nextProgress === current.effectiveProgressSeconds) {
          return current;
        }

        return {
          ...current,
          effectiveProgressSeconds: nextProgress,
        };
      });
    }, 1000);

    return () => clearInterval(tickId);
  }, []);

  useEffect(() => {
    voiceContextRef.current = {
      userId: String(profile.accountId || "").trim() || "mirror-local",
      accountName: profile.accountName || "Friend",
    };
  }, [profile.accountId, profile.accountName]);

  useEffect(() => {
    const voiceClient = createHaloVoiceClient({
      apiBaseUrl,
      apiKey: runtimeApiKey,
      getUserContext: () => voiceContextRef.current,
    });

    voiceClientRef.current = voiceClient;
    const unsubscribe = voiceClient.subscribe(setVoiceState);
    voiceClient.start();

    return () => {
      unsubscribe();
      voiceClient.stop();
      voiceClientRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleVoiceTool = (event) => {
      const detail = event?.detail;
      const resultData = detail?.result?.data || {};
      const executedTool =
        String(resultData?.executed_tool || detail?.result?.tool || detail?.tool || "").trim();

      if (resultData?.modules) {
        setModuleVisibility(normalizeModuleVisibilityPayload({ modules: resultData.modules }));
        setRefreshSignals(normalizeRefreshSignalsPayload({ modules: resultData.modules }));
      }

      if (resultData?.weather && resultData?.location) {
        setWeather(normalizeFallbackWeatherPayload({
          weather: resultData.weather,
          location: resultData.location,
        }));
      }

      if (Array.isArray(resultData?.events) || executedTool === "create_calendar_event" || executedTool === "add_reminder" || executedTool === "delete_reminder") {
        setDashboardRefreshKey((value) => value + 1);
      }

      if (resultData?.now_playing) {
        rememberNowPlaying(resultData.now_playing);
      }

      if (executedTool === "show_news" || executedTool === "hide_news") {
        setDashboardRefreshKey((value) => value + 1);
      }

      const screenName = resolveVoiceScreenName(detail);
      if (!screenName) {
        return;
      }

      const cardMap = {
        weather: weatherCardRef,
        sensors: sensorsCardRef,
        today: todayCardRef,
        youtube: nowPlayingCardRef,
        calendar: calendarCardRef,
        news: newsCardRef,
      };
      const targetRef = cardMap[screenName];
      targetRef?.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    };

    window.addEventListener("halo:voice-tool", handleVoiceTool);
    return () => {
      window.removeEventListener("halo:voice-tool", handleVoiceTool);
    };
  }, []);

  useEffect(() => {
    window.setSensorDataFromJSON = (json) => {
      setSensorData((prev) => normalizeSensorStatePayload(json, prev));
      if (json?.modules || json?.module_visibility || json?.visibility) {
        setModuleVisibility(normalizeModuleVisibilityPayload(json));
        const nextSignals = normalizeRefreshSignalsPayload(json);
        setRefreshSignals(nextSignals);
      }
    };
    window.setNowPlaying = (data) => {
      rememberNowPlaying(data);
    };
    return () => {
      delete window.setSensorDataFromJSON;
      delete window.setNowPlaying;
    };
  }, []);

  const { avatar, advice } = useMemo(
    () => weatherAdvice(weather.tempC),
    [weather.tempC]
  );
  const weatherRefreshLabel = formatRefreshLabel(weather.updatedAt || refreshSignals.weatherRequestedAt);
  const mirrorRefreshLabel = formatRefreshLabel(sensorData.updatedAt || refreshSignals.mirrorRequestedAt);
  const weatherRefreshActive = isRecentRefresh(refreshSignals.weatherRequestedAt);
  const mirrorRefreshActive = isRecentRefresh(refreshSignals.mirrorRequestedAt);
  const showYoutubeStage =
    String(nowPlaying?.source || "").toLowerCase() === "youtube" &&
    Boolean(nowPlaying?.videoStreamUrl);

  return (
    <div>
      <div className="bg"></div>
      <div className="shell">
        <div className="top-bar">
          <div className="halo-title">HALLO MIRROR</div>
          <div className="subtitle">Smart Ambient Dashboard</div>
        </div>

        <div className="greeting-block">
          <div className="greeting-line">
            <span id="greeting-prefix">{prefix}</span>{" "}
            <span className="greeting-highlight" id="greeting-name">{profile.accountName}</span>
          </div>
        </div>

        {mirrorAlarm ? (
          <div className="mirror-alarm-banner">
            <div className="mirror-alarm-title">{mirrorAlarm.title}</div>
            <div className="mirror-alarm-detail">{mirrorAlarm.detail}</div>
          </div>
        ) : null}

        <div className={`middle ${showYoutubeStage ? "middle--youtube-live" : ""}`}>
          {/* ✅ LEFT COL – كل البوكسات */}
          <div className="left-col">
            <div ref={weatherCardRef}>
              <WeatherCard
                weather={weather}
                avatar={avatar}
                advice={advice}
                disabled={!moduleVisibility.weatherEnabled}
                weatherRefreshLabel={weatherRefreshLabel}
                weatherRefreshActive={weatherRefreshActive}
                mirrorRefreshLabel={mirrorRefreshLabel}
                mirrorRefreshActive={mirrorRefreshActive}
                onRefreshLocation={() => {
                  setWeather(buildWeatherFallback());
                  setWeatherRefreshKey((value) => value + 1);
                }}
              />
            </div>
            <div ref={sensorsCardRef}>
              <SensorsCard
                sensorData={sensorData}
                moduleVisibility={moduleVisibility}
                refreshLabel={mirrorRefreshLabel}
                refreshActive={mirrorRefreshActive}
                gestureCamera={gestureCamera}
              />
            </div>
            <div ref={todayCardRef}>
              <TodayCard
                todayPlan={todayPlan}
                disabled={!moduleVisibility.remindersEnabled}
              />
            </div>
            <div ref={newsCardRef}>
              <NewsCard
                headlines={newsHeadlines}
                disabled={!moduleVisibility.newsEnabled}
              />
            </div>
            <DailyTipCard tip={tip} />
          </div>

          {/* ✅ RIGHT COL */}
          <div className="right-col">
            <ClockCard
              clock={clock}
              dateText={dateText}
              disabled={!moduleVisibility.dateEnabled}
            />
            <div ref={nowPlayingCardRef}>
              <NowPlayingCard
                nowPlaying={nowPlaying}
                mediaVisibility={moduleVisibility}
                gestureCommand={gestureCommand}
              />
            </div>
            <div ref={calendarCardRef}>
              <CalendarCard
                calendar={calendar}
                onSelectDate={setSelectedCalendarDate}
                disabled={!moduleVisibility.calendarEnabled}
              />
            </div>
          </div>
        </div>
      </div>

      <HaloVoiceStatus
        status={voiceState.status}
        errorMessage={voiceState.errorMessage}
        wakeRecognitionSupported={voiceState.wakeRecognitionSupported}
        shortcutLabel={voiceState.shortcutLabel}
        voiceEnabled={voiceState.voiceEnabled}
        wakeModeActive={voiceState.wakeModeActive}
        wakeEngine={voiceState.wakeEngine}
        microphonePermission={voiceState.microphonePermission}
        onActivate={() => {
          void voiceClientRef.current?.activate();
        }}
        onStop={() => {
          void voiceClientRef.current?.stopListening();
        }}
        onToggleVoiceEnabled={(enabled) => {
          voiceClientRef.current?.setVoiceEnabled(enabled);
        }}
      />
    </div>
  );
}
