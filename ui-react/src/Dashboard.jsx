import { useEffect, useMemo, useState } from "react";
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

function buildCalendarModel(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const todayDate = date.getDate();

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
    cells.push({ type: "day", day: d, isToday: d === todayDate });
  }

  return { title: `${monthNames[month]} ${year}`, cells };
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

  const [weather, setWeather] = useState({
    ...buildWeatherFallback(),
  });
  const [weatherRefreshKey, setWeatherRefreshKey] = useState(0);

  const [nowPlaying, setNowPlaying] = useState(() => buildNowPlayingFallback());

  const [calendar, setCalendar] = useState(() => buildCalendarModel());

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
    setCalendar(buildCalendarModel(today));
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
  }, []);

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
    const id = setInterval(() => {
      const temp = 18 + Math.random() * 12;
      const hum = 40 + Math.random() * 30;
      const pres = 995 + Math.random() * 15;
      const motion = Math.random() > 0.7;
      const gestures = ["none", "left", "right", "up", "down"];
      const gesture = gestures[Math.floor(Math.random() * gestures.length)];

      setSensorData({
        temperature: temp,
        humidity: Math.round(hum),
        pressure: Math.round(pres),
        motion,
        gesture,
      });
    }, 2000);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    window.setSensorDataFromJSON = (json) => {
      setSensorData((prev) => ({ ...prev, ...json }));
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
              onRefreshLocation={() => {
                setWeather(buildWeatherFallback());
                setWeatherRefreshKey((value) => value + 1);
              }}
            />
            <SensorsCard sensorData={sensorData} />
            <TodayCard />
            <DailyTipCard tip={tip} />
            <AppsCard />
            
          </div>

          {/* ✅ RIGHT COL */}
          <div className="right-col">
            <ClockCard clock={clock} dateText={dateText} />
            <NowPlayingCard nowPlaying={nowPlaying} />
            <CalendarCard calendar={calendar} />
          </div>
        </div>
      </div>
    </div>
  );
}
