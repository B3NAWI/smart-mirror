import ModuleDisabledState from "./ModuleDisabledState";

export default function WeatherCard({
  weather,
  avatar,
  advice,
  onRefreshLocation,
  disabled = false,
  weatherRefreshLabel = "",
  weatherRefreshActive = false,
  mirrorRefreshLabel = "",
  mirrorRefreshActive = false,
}) {
  const locationChip =
    weather.locSource === "mobile_app"
      ? "Phone sync"
      : weather.locSource === "device_geolocation"
      ? "Device GPS"
      : weather.locSource === "ip_lookup"
      ? "Approximate"
      : weather.locSource === "loading"
      ? "Locating"
      : weather.locSource === "permission_denied" ||
        weather.locSource === "permission_error"
      ? "Need permission"
      : weather.locSource === "insecure_context"
      ? "Need HTTPS"
      : "Offline";

  const permissionActionLabel =
    weather.locSource === "permission_denied" ||
    weather.locSource === "permission_error"
      ? "Enable location permission"
      : weather.locSource === "insecure_context"
      ? "Use secure location mode"
      : weather.locSource === "loading"
      ? "Waiting for phone weather"
      : "Retry weather";

  const permissionHelpText =
    weather.locSource === "permission_denied"
      ? "Allow location from the browser address bar, then try again."
      : weather.locSource === "permission_error"
      ? "The browser needs a user-approved location request."
      : weather.locSource === "insecure_context"
      ? "Open the dashboard with HTTPS or localhost to allow exact device GPS."
      : weather.locSource === "mobile_app"
      ? "This weather is synced from the currently active phone account."
      : weather.locSource === "unavailable"
      ? "We could not get your exact device location, so fallback weather may be used."
      : "Use your device GPS for the exact city and current weather.";

  const temperatureText =
    typeof weather.tempC === "number" && !Number.isNaN(weather.tempC)
      ? `${weather.tempC.toFixed(1)} C`
      : "-- C";

  return (
    <div className={`card ${disabled ? "card--disabled" : ""}`}>
      <div className="card-title-row">
        <div className="card-title">Weather</div>
        <div className="chip">{disabled ? "Off" : locationChip}</div>
      </div>

      {!disabled && (weatherRefreshLabel || mirrorRefreshLabel) && (
        <div className="weather-sync-row">
          {weatherRefreshLabel ? (
            <div
              className={`sync-pill ${weatherRefreshActive ? "sync-pill--live" : ""}`}
            >
              Mobile weather refreshed {weatherRefreshLabel}
            </div>
          ) : null}
          {mirrorRefreshLabel ? (
            <div
              className={`sync-pill ${mirrorRefreshActive ? "sync-pill--live" : ""}`}
            >
              Mirror data refreshed {mirrorRefreshLabel}
            </div>
          ) : null}
        </div>
      )}

      {disabled ? (
        <ModuleDisabledState
          title="Weather hidden"
          description="Weather is turned off in the mobile mirror settings."
        />
      ) : (
        <>
          <div className="weather-row">
            <div className="weather-main">
              <div className="weather-temp" id="weather-temp">
                {temperatureText}
              </div>
              <div className="weather-desc" id="weather-desc">{weather.desc}</div>
              <div className="weather-location" id="weather-loc">{weather.loc}</div>
              {weather.region ? (
                <div className="weather-region" id="weather-region">{weather.region}</div>
              ) : null}
            </div>

            <div className="weather-avatar" id="weather-avatar">{avatar}</div>
          </div>

          <div className="weather-advice" id="weather-advice">{advice}</div>

          {(weather.locSource === "permission_denied" ||
            weather.locSource === "permission_error" ||
            weather.locSource === "loading" ||
            weather.locSource === "insecure_context" ||
            weather.locSource === "unavailable") && (
            <div className="weather-permission-box">
              <button
                className="weather-location-button"
                type="button"
                onClick={onRefreshLocation}
              >
                {permissionActionLabel}
              </button>
              <div className="weather-permission-help">{permissionHelpText}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
