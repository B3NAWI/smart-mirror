export default function NowPlayingCard({ nowPlaying }) {
  const musicChip =
    nowPlaying?.isPlaying && nowPlaying?.title ? "Playing" : "Idle";

  const musicStatus =
    nowPlaying?.isPlaying && nowPlaying?.title
      ? "Now playing:"
      : "No music playing.";

  return (
    <div className="card">
      <div className="card-title-row">
        <div className="card-title">Now Playing</div>
        <div className="chip">{musicChip}</div>
      </div>

      <div className="music-main">
        <div className="music-status" id="music-status">{musicStatus}</div>
        <div className="music-track" id="music-track">{nowPlaying?.title || "—"}</div>
        <div className="music-artist" id="music-artist">{nowPlaying?.artist || ""}</div>
      </div>
    </div>
  );
}
