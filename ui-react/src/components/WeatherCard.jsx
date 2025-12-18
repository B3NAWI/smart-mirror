export default function WeatherCard({ weather, avatar, advice }) {
  return (
    <div className="card">
      <div className="card-title-row">
        <div className="card-title">Weather</div>
        <div className="chip">Placeholder</div>
      </div>

      <div className="weather-row">
        <div className="weather-main">
          <div className="weather-temp" id="weather-temp">
            {weather.tempC.toFixed(1)}°C
          </div>
          <div className="weather-desc" id="weather-desc">{weather.desc}</div>
          <div className="weather-location" id="weather-loc">{weather.loc}</div>
        </div>

        <div className="weather-avatar" id="weather-avatar">{avatar}</div>
      </div>

      <div className="weather-advice" id="weather-advice">{advice}</div>
    </div>
  );
}
