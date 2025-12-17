import { useEffect, useMemo, useState } from "react";
import ClockCard from "./components/ClockCard";
import NowPlayingCard from "./components/NowPlayingCard";

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
  let message = "Welcome back to your smart mirror.";

  if (hour >= 5 && hour < 12) {
    prefix = "Good morning";
    message = "Start your day with clarity and focus.";
  } else if (hour >= 12 && hour < 17) {
    prefix = "Good afternoon";
    message = "Keep going, you're doing great.";
  } else if (hour >= 17 && hour < 22) {
    prefix = "Good evening";
    message = "Time to slow down and recharge.";
  } else {
    prefix = "Good night";
    message = "Rest well and be ready for tomorrow.";
  }
  return { prefix, message };
}

function weatherAdvice(tempC) {
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
  const [{ prefix, message }, setGreeting] = useState(() => getGreeting());

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
    tempC: 22.5,
    desc: "Clear",
    loc: "Your City",
  });

  const [nowPlaying, setNowPlaying] = useState({
    isPlaying: false,
    title: "",
    artist: "",
  });

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
    setWeather((w) => ({ ...w, tempC: sensorData.temperature }));
  }, [sensorData.temperature]);

  // Mock sensor changes
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

  // Dev hooks
  useEffect(() => {
    window.setSensorDataFromJSON = (json) => {
      setSensorData((prev) => ({ ...prev, ...json }));
    };
    window.setNowPlaying = (data) => {
      setNowPlaying({
        isPlaying: !!data?.isPlaying,
        title: data?.title || "",
        artist: data?.artist || "",
      });
    };
    return () => {
      delete window.setSensorDataFromJSON;
      delete window.setNowPlaying;
    };
  }, []);

  const { avatar, advice } = useMemo(() => weatherAdvice(weather.tempC), [weather.tempC]);

  return (
    <div>
      <div className="bg"></div>

      <div className="shell">
        <div className="top-bar">
          <div className="halo-title">HALLO MIRROR</div>
          <div className="subtitle">Smart Ambient Dashboard</div>
          <div className="project-tagline">
            HALLO MIRROR · BY HILAL DALLASHI &amp; BARAA AMRO
          </div>
        </div>

        <div className="greeting-block">
          <div className="greeting-line">
            <span id="greeting-prefix">{prefix}</span>{" "}
            <span className="greeting-highlight" id="greeting-name">{userName}</span>
          </div>
          <div className="greeting-message" id="greeting-message">{message}</div>
        </div>

        <div className="middle">
          {/* LEFT */}
          <div className="left-col">
            <div className="card">
              <div className="card-title-row">
                <div className="card-title">Weather</div>
                <div className="chip">Placeholder</div>
              </div>

              <div className="weather-row">
                <div className="weather-main">
                  <div className="weather-temp" id="weather-temp">{weather.tempC.toFixed(1)}°C</div>
                  <div className="weather-desc" id="weather-desc">{weather.desc}</div>
                  <div className="weather-location" id="weather-loc">{weather.loc}</div>
                </div>
                <div className="weather-avatar" id="weather-avatar">{avatar}</div>
              </div>

              <div className="weather-advice" id="weather-advice">{advice}</div>
            </div>

            <div className="card">
              <div className="card-title-row">
                <div className="card-title">Sensors</div>
                <div className="chip">ESP32 · BME280 · PIR · APDS9960</div>
              </div>

              <div className="sensor-list">
                <div className="sensor-item">
                  <span className="sensor-label">Temperature</span>
                  <span className="sensor-value" id="sensor-temp">{sensorData.temperature.toFixed(1)}°C</span>
                </div>
                <div className="sensor-item">
                  <span className="sensor-label">Humidity</span>
                  <span className="sensor-value" id="sensor-humidity">{sensorData.humidity}%</span>
                </div>
                <div className="sensor-item">
                  <span className="sensor-label">Pressure</span>
                  <span className="sensor-value" id="sensor-pressure">{sensorData.pressure} hPa</span>
                </div>
                <div className="sensor-item">
                  <span className="sensor-label">Motion</span>
                  <span className={`sensor-value ${sensorData.motion ? "motion-on" : "motion-off"}`} id="sensor-motion">
                    {sensorData.motion ? "Detected" : "None"}
                  </span>
                </div>
                <div className="sensor-item">
                  <span className="sensor-label">Gesture</span>
                  <span className="sensor-value" id="sensor-gesture">
                    {sensorData.gesture === "none"
                      ? "None"
                      : sensorData.gesture[0].toUpperCase() + sensorData.gesture.slice(1)}
                  </span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-title-row">
                <div className="card-title">Today</div>
                <div className="chip">Overview</div>
              </div>

              <div className="time-message" id="time-of-day-message">{message}</div>

              <div className="event-list">
                <div className="event">
                  <div className="event-time">09:00</div>
                  <div className="event-title">Morning Focus</div>
                </div>
                <div className="event">
                  <div className="event-time">13:00</div>
                  <div className="event-title">Deep Work / Study</div>
                </div>
                <div className="event">
                  <div className="event-time">19:00</div>
                  <div className="event-title">Relax &amp; Recharge</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-title-row">
                <div className="card-title">Daily Tip</div>
                <div className="chip">Auto-updated</div>
              </div>
              <div className="quote-text" id="daily-tip">"{tip.text}"</div>
              <div className="quote-author" id="tip-source">— {tip.source}</div>
            </div>

            <div className="card">
              <div className="card-title-row">
                <div className="card-title">Apps &amp; Shortcuts</div>
                <div className="chip">Future actions</div>
              </div>

              <div className="apps-row">
                <div className="app-pill"><span>▶</span> YouTube</div>
                <div className="app-pill"><span>🎵</span> Music</div>
                <div className="app-pill"><span>📰</span> News</div>
                <div className="app-pill"><span>🧠</span> AI Assistant</div>
                <div className="app-pill"><span>⚙️</span> Settings</div>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="right-col">
            <ClockCard clock={clock} dateText={dateText} />

            <NowPlayingCard nowPlaying={nowPlaying} />

            <div className="card">
              <div className="card-title-row">
                <div className="card-title">Calendar</div>
                <div className="chip">This month</div>
              </div>

              <div className="calendar-body">
                <div className="calendar-header-row">
                  <div className="calendar-month" id="calendar-month">{calendar.title}</div>
                </div>

                <div className="calendar-grid" id="calendar-grid">
                  {calendar.cells.map((c, idx) => {
                    if (c.type === "header") return <div key={idx} className="cal-cell cal-header">{c.label}</div>;
                    if (c.type === "empty") return <div key={idx} className="cal-cell"></div>;
                    return (
                      <div key={idx} className={`cal-cell cal-day ${c.isToday ? "cal-today" : ""}`}>
                        {c.day}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="credits">Made by Hilal Dallashi &amp; Baraa Amro</div>
    </div>
  );
}
