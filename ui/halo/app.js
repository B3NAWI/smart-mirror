/* =========================================
   Basic Config
   إعدادات أساسية (اسم المستخدم)
========================================== */
const userName = "Hilal"; // اسم المستخدم الذي يظهر في التحية / User name shown in greeting

/* =========================================
   Clock & Date
   الساعة والتاريخ
========================================== */


function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");

  document.getElementById("clock").textContent = `${hh}:${mm}`;

  const opts = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };

  document.getElementById("date").textContent =
    now.toLocaleDateString("en-US", opts);
}

/* =========================================
   Greeting & Time-of-day Message
   رسالة الترحيب حسب الوقت
========================================== */
function updateGreeting() {
  const now = new Date();
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

  document.getElementById("greeting-prefix").textContent = prefix;
  document.getElementById("greeting-name").textContent = userName;
  document.getElementById("greeting-message").textContent = message;
  document.getElementById("time-of-day-message").textContent = message;
}

/* =========================================
   Daily Tips
   نصيحة يومية تتغير حسب اليوم
========================================== */
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

function updateDailyTip() {
  const today = new Date();
  const index = today.getDate() % dailyTips.length;
  const tip = dailyTips[index];

  document.getElementById("daily-tip").textContent = `"${tip.text}"`;
  document.getElementById("tip-source").textContent = `— ${tip.source}`;
}

/* =========================================
   Sensor Data Hooks
   ربط الحساسات (درجة حرارة، رطوبة، ضغط، حركة، إيماءات)
   يمكن تحديثها لاحقاً من Raspberry Pi / ESP32
========================================== */
const sensorData = {
  temperature: 22.5,
  humidity: 55,
  pressure: 1000,
  motion: false,
  gesture: "none",
};

function updateSensorUI(data) {
  if (data.temperature !== undefined) {
    document.getElementById("sensor-temp").textContent =
      data.temperature.toFixed(1) + "°C";
  }

  if (data.humidity !== undefined) {
    document.getElementById("sensor-humidity").textContent =
      data.humidity + "%";
  }

  if (data.pressure !== undefined) {
    document.getElementById("sensor-pressure").textContent =
      data.pressure + " hPa";
  }

  if (data.motion !== undefined) {
    const el = document.getElementById("sensor-motion");
    el.textContent = data.motion ? "Detected" : "None";
    el.classList.remove("motion-on", "motion-off");
    el.classList.add(data.motion ? "motion-on" : "motion-off");
  }

  if (data.gesture !== undefined) {
    const g = (data.gesture || "none").toString();
    document.getElementById("sensor-gesture").textContent =
      g === "none" ? "None" : g[0].toUpperCase() + g.slice(1);
  }
}

// دالة يمكن استدعاؤها من سكربت خارجي لتمرير JSON
// Function to receive JSON from another script (Python/Node/etc.)
function setSensorDataFromJSON(json) {
  Object.assign(sensorData, json);
  updateSensorUI(sensorData);
}

/* =========================================
   Weather Advice Based on Temperature
   منطق اقتراح اللبس حسب درجة الحرارة
========================================== */
function updateWeatherFromTemp(tempC, description = "Clear", location = "City") {
  document.getElementById("weather-temp").textContent = `${tempC.toFixed(1)}°C`;
  document.getElementById("weather-desc").textContent = description;
  document.getElementById("weather-loc").textContent = location;

  const avatarEl = document.getElementById("weather-avatar");
  const adviceEl = document.getElementById("weather-advice");

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

  avatarEl.textContent = avatar;
  adviceEl.textContent = advice;
}

/* =========================================
   Music Card Hooks (Now Playing)
   بوكس الأغنية الحالية - جاهز للربط مع مشغّل موسيقى
========================================== */
const nowPlaying = {
  isPlaying: false,
  title: "",
  artist: "",
};

function updateMusicUI() {
  const chip = document.getElementById("music-chip");
  const status = document.getElementById("music-status");
  const track = document.getElementById("music-track");
  const artist = document.getElementById("music-artist");

  if (nowPlaying.isPlaying && nowPlaying.title) {
    chip.textContent = "Playing";
    status.textContent = "Now playing:";
    track.textContent = nowPlaying.title;
    artist.textContent = nowPlaying.artist || "";
  } else {
    chip.textContent = "Idle";
    status.textContent = "No music playing.";
    track.textContent = "—";
    artist.textContent = "";
  }
}

// يُستدعى عندما نريد تحديث الأغنية من سكربت خارجي
// Can be called from a script to update now playing info
function setNowPlaying(data) {
  nowPlaying.isPlaying = !!data.isPlaying;
  nowPlaying.title = data.title || "";
  nowPlaying.artist = data.artist || "";
  updateMusicUI();
}

/* =========================================
   Calendar Builder
   بناء تقويم بسيط للشهر الحالي
========================================== */
function buildCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDate = now.getDate();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const weekDays = ["S", "M", "T", "W", "T", "F", "S"];

  document.getElementById("calendar-month").textContent =
    `${monthNames[month]} ${year}`;

  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  // Days header (S M T W T F S)
  weekDays.forEach((d) => {
    const cell = document.createElement("div");
    cell.className = "cal-cell cal-header";
    cell.textContent = d;
    grid.appendChild(cell);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Empty cells before day 1
  for (let i = 0; i < firstDay; i++) {
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    grid.appendChild(cell);
  }

  // Fill days
  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement("div");
    cell.className = "cal-cell cal-day";
    if (d === todayDate) cell.classList.add("cal-today");
    cell.textContent = d;
    grid.appendChild(cell);
  }
}

/* =========================================
   Initialization
   تهيئة واجهة HALLO MIRROR عند تحميل الصفحة
========================================== */
function init() {
  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Greeting & time-based message
  updateGreeting();

  // Daily tip
  updateDailyTip();

  // Sensors initial UI
  updateSensorUI(sensorData);

  // Music initial UI
  updateMusicUI();

  // Calendar
  buildCalendar();

  // Weather suggestion based on initial temperature
  updateWeatherFromTemp(sensorData.temperature, "Clear", "Your City");
}

window.addEventListener("DOMContentLoaded", init);

// (اختياري) لو بدك تجرب من الكونسول:
// setSensorDataFromJSON({ motion: true, gesture: "left", temperature: 27.3 });
// setNowPlaying({ isPlaying: true, title: "Blinding Lights", artist: "The Weeknd" });
// ===============================
// DEMO MODE (Mock Sensor Data)
// ===============================
setInterval(() => {
  const temp = 18 + Math.random() * 12;
  const hum = 40 + Math.random() * 30;
  const pres = 995 + Math.random() * 15;
  const motion = Math.random() > 0.7;
  const gestures = ["none", "left", "right", "up", "down"];
  const gesture = gestures[Math.floor(Math.random() * gestures.length)];

  setSensorDataFromJSON({
    temperature: temp,
    humidity: Math.round(hum),
    pressure: Math.round(pres),
    motion,
    gesture,
  });

}, 2000);
