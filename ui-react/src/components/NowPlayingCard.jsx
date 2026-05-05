function formatSource(source) {
  const sourceLabels = {
    spotify: "Spotify",
    youtube: "YouTube",
    apple_music: "Apple Music",
    local: "Local",
    other: "Mirror Audio",
  };

  return sourceLabels[source] || "Mirror Audio";
}

function formatSeconds(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "--:--";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function NowPlayingCard({ nowPlaying }) {
  const hasTrack = Boolean(nowPlaying?.title);
  const isPlaying = Boolean(nowPlaying?.isPlaying && hasTrack);
  const musicChip = isPlaying ? "Playing" : hasTrack ? "Paused" : "Idle";
  const musicStatus = isPlaying
    ? "Live playback"
    : hasTrack
    ? "Ready to resume"
    : "Waiting for music";

  const duration =
    typeof nowPlaying?.durationSeconds === "number" ? nowPlaying.durationSeconds : null;
  const progress =
    typeof nowPlaying?.effectiveProgressSeconds === "number"
      ? nowPlaying.effectiveProgressSeconds
      : 0;
  const progressPercent =
    duration && duration > 0 ? Math.min((progress / duration) * 100, 100) : 0;

  return (
    <div className="card music-card">
      <div className="card-title-row">
        <div className="card-title">Now Playing</div>
        <div className="chip">{musicChip}</div>
      </div>

      <div className="music-shell">
        <div className={`music-orb ${isPlaying ? "music-orb--live" : ""}`}>
          <div className="music-wave">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>

        <div className="music-main">
          <div className="music-topline">
            <div className="music-status" id="music-status">{musicStatus}</div>
            <div className={`music-source music-source--${nowPlaying?.source || "other"}`}>
              {formatSource(nowPlaying?.source)}
            </div>
          </div>

          <div className="music-track" id="music-track">
            {nowPlaying?.title || "No music playing right now"}
          </div>

          <div className="music-artist-row">
            <div className="music-artist" id="music-artist">
              {nowPlaying?.artist || "Connect Spotify, YouTube, or your phone player."}
            </div>
            {nowPlaying?.album ? (
              <div className="music-album">{nowPlaying.album}</div>
            ) : null}
          </div>

          <div className="music-progress-block">
            <div className="music-progress-bar" aria-hidden="true">
              <span style={{ width: `${progressPercent}%` }}></span>
            </div>
            <div className="music-progress-meta">
              <span>{formatSeconds(progress)}</span>
              <span>{duration ? formatSeconds(duration) : "Live"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
