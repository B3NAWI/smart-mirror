export default function SensorsCard({ sensorData }) {
  return (
    <div className="card">
      <div className="card-title-row">
        <div className="card-title">Sensors</div>
        <div className="chip">ESP32 · BME280 · PIR · APDS9960</div>
      </div>

      <div className="sensor-list">
        <div className="sensor-item">
          <span className="sensor-label">Temperature</span>
          <span className="sensor-value" id="sensor-temp">
            {sensorData.temperature.toFixed(1)}°C
          </span>
        </div>

        <div className="sensor-item">
          <span className="sensor-label">Humidity</span>
          <span className="sensor-value" id="sensor-humidity">
            {sensorData.humidity}%
          </span>
        </div>

        <div className="sensor-item">
          <span className="sensor-label">Pressure</span>
          <span className="sensor-value" id="sensor-pressure">
            {sensorData.pressure} hPa
          </span>
        </div>

        <div className="sensor-item">
          <span className="sensor-label">Motion</span>
          <span
            className={`sensor-value ${
              sensorData.motion ? "motion-on" : "motion-off"
            }`}
            id="sensor-motion"
          >
            {sensorData.motion ? "Detected" : "None"}
          </span>
        </div>

        <div className="sensor-item">
          <span className="sensor-label">Gesture</span>
          <span className="sensor-value" id="sensor-gesture">
            {sensorData.gesture === "none"
              ? "None"
              : sensorData.gesture[0].toUpperCase() +
                sensorData.gesture.slice(1)}
          </span>
        </div>
      </div>
    </div>
  );
}
