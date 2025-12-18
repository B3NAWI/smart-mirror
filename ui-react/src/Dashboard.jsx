import { useEffect, useMemo, useState } from "react";
import ClockCard from "./components/ClockCard";
import NowPlayingCard from "./components/NowPlayingCard";
import CalendarCard from "./components/CalendarCard";
import SensorsCard from "./components/SensorsCard";
import WeatherCard from "./components/WeatherCard";
import TodayCard from "./components/TodayCard";
import DailyTipCard from "./components/DailyTipCard";
import AppsCard from "./components/AppsCard";



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
            HALLO MIRROR · BY HILAL DALLASHI &amp; Baraa Amro
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
          {/* ✅ LEFT COL – كل البوكسات */}
          <div className="left-col">
            <WeatherCard weather={weather} avatar={avatar} advice={advice} />
            <SensorsCard sensorData={sensorData} />
            <TodayCard message={message} />
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

      <div className="credits">Made by Hilal Dallashi &amp; Baraa Amro</div>
    </div>
  );
}
