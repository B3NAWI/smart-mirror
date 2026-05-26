import { useEffect, useMemo, useRef, useState } from "react";
import ClockCard from "./components/ClockCard";
import NowPlayingCard from "./components/NowPlayingCard";
import CalendarCard from "./components/CalendarCard";
import SensorsCard from "./components/SensorsCard";
import WeatherCard from "./components/WeatherCard";
import TodayCard from "./components/TodayCard";
import DailyTipCard from "./components/DailyTipCard";
import AppsCard from "./components/AppsCard";

const apiBaseUrl = (() => {
  const configured = (import.meta.env.VITE_BACKEND_URL || "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return "";
})();

const userName = "Hilal";

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
    loc: "Locating device...",
    region: "Finding your city and region...",
    locSource: "loading",
    isDay: 1,
  };
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
    updatedAt: null,
  };
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
    updatedAt: payload?.updated_at || payload?.updatedAt || null,
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

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
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
  dateEnabled: true,
  remindersEnabled: true,
  calendarEnabled: true,
  temperatureEnabled: true,
  humidityEnabled: true,
  pressureEnabled: true,
  spotifyEnabled: true,
  youtubeEnabled: true,
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
    dateEnabled: readBooleanSetting(source, "date_enabled", "dateEnabled"),
    remindersEnabled: readBooleanSetting(source, "reminders_enabled", "remindersEnabled"),
    calendarEnabled: readBooleanSetting(source, "calendar_enabled", "calendarEnabled"),
    temperatureEnabled: readBooleanSetting(source, "temperature_enabled", "temperatureEnabled"),
    humidityEnabled: readBooleanSetting(source, "humidity_enabled", "humidityEnabled"),
    pressureEnabled: readBooleanSetting(source, "pressure_enabled", "pressureEnabled"),
    spotifyEnabled: readBooleanSetting(source, "spotify_enabled", "spotifyEnabled"),
    youtubeEnabled: readBooleanSetting(source, "youtube_enabled", "youtubeEnabled"),
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
  };
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
  const [weatherRefreshKey, setWeatherRefreshKey] = useState(0);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const weatherRefreshSeenRef = useRef("");
  const dashboardRefreshSeenRef = useRef("");

  const [nowPlaying, setNowPlaying] = useState(() => buildNowPlayingFallback());
  const [todayPlan, setTodayPlan] = useState(() => buildTodayPlanFallback());
  const [calendarMonthDate] = useState(() => new Date());
  const [calendarItemsByDate, setCalendarItemsByDate] = useState(() => ({}));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() =>
    formatLocalIsoDate(new Date())
  );
  const calendar = useMemo(
    () => buildCalendarModel(calendarMonthDate, calendarItemsByDate, selectedCalendarDate),
    [calendarItemsByDate, calendarMonthDate, selectedCalendarDate]
  );

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
          const nextSignals = normalizeRefreshSignalsPayload(payload);
          setRefreshSignals(nextSignals);

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
    let watchId = null;
    let fallbackStarted = false;

    const applyWeather = (payload) => {
      if (cancelled || !payload) {
        return;
      }

      const location = payload.location;
      const currentWeather = payload.weather;
      const locationLines = formatLocationLines(location);

      setWeather((current) => ({
        ...current,
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
            : current.isDay,
      }));
    };

    const stopWatching = () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    const fetchWeather = async (query = "") => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/weather/current${query}`);
        if (!response.ok) {
          throw new Error("Weather request failed");
        }
        return await response.json();
      } catch {
        return null;
      }
    };

    const loadFallbackWeather = async (sourceOverride = null) => {
      if (fallbackStarted) {
        return;
      }
      fallbackStarted = true;

      const fallbackWeather = await fetchWeather();
      if (fallbackWeather) {
        if (sourceOverride && fallbackWeather.location) {
          fallbackWeather.location.source = sourceOverride;
        }
        applyWeather(fallbackWeather);
        return;
      }

      if (!cancelled) {
        setWeather((current) => ({
          ...current,
          loc: "Location unavailable",
          region: "",
          locSource: "unavailable",
          desc: "Weather unavailable",
        }));
      }
    };

    const fetchExactWeather = async (coords) => {
      const query = `?lat=${coords.latitude}&lon=${coords.longitude}`;
      const deviceWeather = await fetchWeather(query);

      if (deviceWeather) {
        applyWeather(deviceWeather);
        stopWatching();
        return true;
      }

      return false;
    };

    const loadDeviceWeather = async () => {
      if (
        typeof window !== "undefined" &&
        !window.isSecureContext &&
        !isLocalHost(window.location.hostname)
      ) {
        setWeather((current) => ({
          ...current,
          loc: "Open via localhost or HTTPS",
          region: "",
          locSource: "insecure_context",
          desc: "Exact device location needs a secure page, using approximate weather.",
        }));
        loadFallbackWeather("ip_lookup");
        return;
      }

      if (!navigator.geolocation) {
        loadFallbackWeather("ip_lookup");
        return;
      }

      try {
        if (navigator.permissions?.query) {
          const permission = await navigator.permissions.query({
            name: "geolocation",
          });

          if (permission.state === "denied") {
            setWeather((current) => ({
              ...current,
              loc: "Allow location access",
              region: "",
              locSource: "permission_denied",
              desc: "Browser location is blocked, so exact city weather is unavailable.",
            }));
            loadFallbackWeather("ip_lookup");
            return;
          }
        }
      } catch {
        // Continue even if the Permissions API is unavailable.
      }

      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const loaded = await fetchExactWeather(coords);
          if (loaded) {
            return;
          }

          loadFallbackWeather("ip_lookup");
        },
        () => {
          setWeather((current) => ({
            ...current,
            loc: "Location permission needed",
            region: "",
            locSource: "permission_error",
          }));
          loadFallbackWeather("ip_lookup");
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 5 * 60 * 1000,
        }
      );

      watchId = navigator.geolocation.watchPosition(
        async ({ coords }) => {
          if (coords.accuracy && coords.accuracy > 800) {
            return;
          }

          await fetchExactWeather(coords);
        },
        () => {
          stopWatching();
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60 * 1000,
        }
      );
    };

    loadDeviceWeather();

    return () => {
      cancelled = true;
      stopWatching();
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

    const loadNowPlaying = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/now-playing`);
        if (!response.ok) {
          throw new Error("Now playing request failed");
        }

        const payload = await response.json();
        if (!cancelled) {
          setNowPlaying(normalizeNowPlayingPayload(payload));
        }
      } catch {
        if (!cancelled) {
          setNowPlaying((current) => ({
            ...current,
            isPlaying: false,
          }));
        }
      }
    };

    loadNowPlaying();
    const pollId = setInterval(loadNowPlaying, 15000);

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
    window.setSensorDataFromJSON = (json) => {
      setSensorData((prev) => normalizeSensorStatePayload(json, prev));
      if (json?.modules || json?.module_visibility || json?.visibility) {
        setModuleVisibility(normalizeModuleVisibilityPayload(json));
        const nextSignals = normalizeRefreshSignalsPayload(json);
        setRefreshSignals(nextSignals);
      }
    };
    window.setNowPlaying = (data) => {
      setNowPlaying(normalizeNowPlayingPayload(data));
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
  const weatherRefreshLabel = formatRefreshLabel(refreshSignals.weatherRequestedAt);
  const mirrorRefreshLabel = formatRefreshLabel(refreshSignals.mirrorRequestedAt);
  const weatherRefreshActive = isRecentRefresh(refreshSignals.weatherRequestedAt);
  const mirrorRefreshActive = isRecentRefresh(refreshSignals.mirrorRequestedAt);

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
            <span className="greeting-highlight" id="greeting-name">{userName}</span>
          </div>
        </div>

        <div className="middle">
          {/* ✅ LEFT COL – كل البوكسات */}
          <div className="left-col">
            <WeatherCard
              weather={weather}
              avatar={avatar}
              advice={advice}
              weatherRefreshLabel={weatherRefreshLabel}
              weatherRefreshActive={weatherRefreshActive}
              mirrorRefreshLabel={mirrorRefreshLabel}
              mirrorRefreshActive={mirrorRefreshActive}
              onRefreshLocation={() => {
                setWeather(buildWeatherFallback());
                setWeatherRefreshKey((value) => value + 1);
              }}
            />
            <SensorsCard
              sensorData={sensorData}
              moduleVisibility={moduleVisibility}
              refreshLabel={mirrorRefreshLabel}
              refreshActive={mirrorRefreshActive}
            />
            <TodayCard
              todayPlan={todayPlan}
              disabled={!moduleVisibility.remindersEnabled}
            />
            <DailyTipCard tip={tip} />
            <AppsCard />
            
          </div>

          {/* ✅ RIGHT COL */}
          <div className="right-col">
            <ClockCard
              clock={clock}
              dateText={dateText}
              disabled={!moduleVisibility.dateEnabled}
            />
            <NowPlayingCard
              nowPlaying={nowPlaying}
              mediaVisibility={moduleVisibility}
            />
            <CalendarCard
              calendar={calendar}
              onSelectDate={setSelectedCalendarDate}
              disabled={!moduleVisibility.calendarEnabled}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
