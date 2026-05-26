import ModuleDisabledState from "./ModuleDisabledState";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatGesture(gesture) {
  if (!gesture || gesture === "none") {
    return "Idle";
  }

  return gesture[0].toUpperCase() + gesture.slice(1);
}

function temperatureNote(value) {
  if (value < 18) return "Cool room";
  if (value > 28) return "Warm room";
  return "Balanced";
}

function humidityNote(value) {
  if (value < 35) return "Dry air";
  if (value > 65) return "Humid air";
  return "Comfort zone";
}

function pressureNote(value) {
  if (value < 1000) return "Light pressure";
  if (value > 1015) return "Dense pressure";
  return "Stable air";
}

export default function SensorsCard({
  sensorData,
  moduleVisibility,
  refreshLabel = "",
  refreshActive = false,
}) {
  const metrics = [
    {
      key: "temp",
      label: "Temperature",
      short: "T",
      value: `${sensorData.temperature.toFixed(1)} C`,
      note: temperatureNote(sensorData.temperature),
      level: clamp(((sensorData.temperature - 10) / 25) * 100, 8, 100),
      tone: "temp",
      valueId: "sensor-temp",
      enabled: moduleVisibility?.temperatureEnabled ?? true,
    },
    {
      key: "humidity",
      label: "Humidity",
      short: "H",
      value: `${sensorData.humidity}%`,
      note: humidityNote(sensorData.humidity),
      level: clamp(sensorData.humidity, 8, 100),
      tone: "humidity",
      valueId: "sensor-humidity",
      enabled: moduleVisibility?.humidityEnabled ?? true,
    },
    {
      key: "pressure",
      label: "Pressure",
      short: "P",
      value: `${sensorData.pressure} hPa`,
      note: pressureNote(sensorData.pressure),
      level: clamp(((sensorData.pressure - 980) / 45) * 100, 8, 100),
      tone: "pressure",
      valueId: "sensor-pressure",
      enabled: moduleVisibility?.pressureEnabled ?? true,
    },
  ];

  return (
    <div className="card">
      <div className="card-title-row">
        <div className="card-title">Sensors</div>
        <div className="chip">ESP32 - BME280 - PIR - APDS9960</div>
      </div>

      <div className="sensor-overview">
        <div className={`sensor-live-pill ${refreshActive ? "sensor-live-pill--live" : ""}`}>
          <span className="sensor-live-dot"></span>
          {refreshLabel ? `Mirror refreshed ${refreshLabel}` : "Ambient stream active"}
        </div>
        <div className="sensor-overview-text">
          {refreshLabel
            ? "The mobile app asked the mirror website to pull fresh dashboard data."
            : "Smooth live readings from your mirror environment."}
        </div>
      </div>

      <div className="sensor-grid">
        {metrics.map((metric) => (
          <div
            className={`sensor-panel sensor-panel--${metric.tone} ${metric.enabled ? "" : "sensor-panel--disabled"}`}
            key={metric.key}
          >
            {metric.enabled ? (
              <>
                <div className="sensor-panel-head">
                  <div className="sensor-orb" aria-hidden="true">
                    {metric.short}
                  </div>
                  <div className="sensor-panel-meta">
                    <div className="sensor-panel-label">{metric.label}</div>
                    <div className="sensor-panel-note">{metric.note}</div>
                  </div>
                </div>

                <div className="sensor-panel-value" id={metric.valueId}>
                  {metric.value}
                </div>

                <div className="sensor-meter" aria-hidden="true">
                  <span style={{ width: `${metric.level}%` }}></span>
                </div>
              </>
            ) : (
              <ModuleDisabledState
                title={`${metric.label} hidden`}
                description="This sensor slot was turned off in the mobile mirror settings."
                compact
              />
            )}
          </div>
        ))}
      </div>

      <div className="sensor-status-grid">
        <div
          className={`sensor-status-card ${
            sensorData.motion ? "sensor-status-card--active" : ""
          }`}
        >
          <div className="sensor-status-top">
            <div className="sensor-status-label">Motion</div>
            <div
              className={`sensor-status-badge ${
                sensorData.motion ? "motion-on" : "motion-off"
              }`}
              id="sensor-motion"
            >
              {sensorData.motion ? "Detected" : "Quiet"}
            </div>
          </div>
          <div className="sensor-status-body">
            <div className="sensor-wave" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="sensor-status-copy">
              {sensorData.motion
                ? "Movement is happening near the mirror."
                : "No recent motion around the mirror."}
            </div>
          </div>
        </div>

        <div className="sensor-status-card sensor-status-card--gesture">
          <div className="sensor-status-top">
            <div className="sensor-status-label">Gesture</div>
            <div className="sensor-status-badge sensor-status-badge--gesture">
              APDS9960
            </div>
          </div>
          <div className="sensor-gesture-row">
            <div className="sensor-gesture-shape" aria-hidden="true">
              <span className={`gesture-arrow gesture-arrow--${sensorData.gesture}`}></span>
            </div>
            <div>
              <div className="sensor-gesture-value" id="sensor-gesture">
                {formatGesture(sensorData.gesture)}
              </div>
              <div className="sensor-status-copy">
                Swipe commands appear here when detected.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
