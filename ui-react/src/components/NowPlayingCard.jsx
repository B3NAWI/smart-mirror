import { useEffect, useRef, useState } from "react";
import ModuleDisabledState from "./ModuleDisabledState";
import { buildSpotifyEmbedUrl } from "../utils/mediaEmbed";

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

export default function NowPlayingCard({
  nowPlaying,
  mediaVisibility,
  gestureCommand,
}) {
  const videoRef = useRef(null);
  const preferredVolumeRef = useRef(0.8);
  const [blockedStreamUrl, setBlockedStreamUrl] = useState("");
  const [playbackErrorState, setPlaybackErrorState] = useState({
    streamUrl: "",
    message: "",
  });
  const [volumeHud, setVolumeHud] = useState({
    visible: false,
    level: 80,
    label: "",
  });

  const spotifyEnabled = mediaVisibility?.spotifyEnabled ?? true;
  const youtubeEnabled = mediaVisibility?.youtubeEnabled ?? true;
  const currentSource = String(nowPlaying?.source || "other").toLowerCase();
  const disabled =
    (!spotifyEnabled && !youtubeEnabled) ||
    (currentSource === "spotify" && !spotifyEnabled) ||
    (currentSource === "youtube" && !youtubeEnabled);

  const hasTrack = Boolean(nowPlaying?.title);
  const isPlaying = Boolean(nowPlaying?.isPlaying && hasTrack);
  const musicChip = disabled
    ? "Off on mobile"
    : isPlaying
    ? "Playing"
    : hasTrack
    ? "Paused"
    : "Idle";
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
  const youtubeStreamUrl =
    currentSource === "youtube" ? nowPlaying?.videoStreamUrl || "" : "";
  const spotifyEmbedUrl =
    currentSource === "spotify" ? buildSpotifyEmbedUrl(nowPlaying?.trackUrl || "") : "";
  const showYoutubeStage = Boolean(youtubeStreamUrl && !disabled);
  const showSpotifyStage = Boolean(spotifyEmbedUrl && !disabled);
  const playbackBlocked = blockedStreamUrl === youtubeStreamUrl;
  const playbackError =
    playbackErrorState.streamUrl === youtubeStreamUrl
      ? playbackErrorState.message
      : "";
  const musicCardClassName = `card music-card ${
    disabled ? "card--disabled" : ""
  } ${showYoutubeStage ? "music-card--video" : ""}`.trim();
  const musicChipLabel = showYoutubeStage ? "Video" : showSpotifyStage ? "Spotify" : musicChip;
  const videoStatus =
    currentSource === "spotify"
      ? "Spotify on mirror"
      : isPlaying
      ? "Video on mirror"
      : "Queued for mirror";

  useEffect(() => {
    if (!showYoutubeStage || !videoRef.current) {
      return;
    }

    const video = videoRef.current;
    video.muted = false;
    video.volume = preferredVolumeRef.current;
    const playPromise = video.play();

    if (playPromise?.catch) {
      playPromise.catch(() => {
        setBlockedStreamUrl(youtubeStreamUrl);
      });
    }
  }, [showYoutubeStage, youtubeStreamUrl]);

  useEffect(() => {
    if (!gestureCommand?.id) {
      return;
    }

    if (showSpotifyStage) {
      if (gestureCommand.action === "volume_up" || gestureCommand.action === "volume_down") {
        setVolumeHud((current) => {
          const currentLevel = Number.isFinite(current.level) ? current.level : 80;
          const nextLevel = Math.min(
            Math.max(currentLevel + (gestureCommand.action === "volume_up" ? 50 : -50), 0),
            100
          );
          return {
            visible: true,
            level: nextLevel,
            label: gestureCommand.action === "volume_up" ? "Volume Up" : "Volume Down",
          };
        });
      }
      return;
    }

    if (!showYoutubeStage || !videoRef.current) {
      return;
    }

    const video = videoRef.current;
    const clampVolume = (value) => Math.min(Math.max(value, 0), 1);

    if (gestureCommand.action === "volume_up" || gestureCommand.action === "volume_down") {
      const delta = gestureCommand.action === "volume_up" ? 0.5 : -0.5;
      const nextVolume = clampVolume((Number(video.volume) || preferredVolumeRef.current) + delta);
      video.muted = false;
      video.volume = nextVolume;
      preferredVolumeRef.current = nextVolume;
      setVolumeHud({
        visible: true,
        level: Math.round(nextVolume * 100),
        label: gestureCommand.action === "volume_up" ? "Volume Up" : "Volume Down",
      });
      return;
    }

    if (gestureCommand.action === "seek_backward" || gestureCommand.action === "seek_forward") {
      const preservedVolume = clampVolume(
        Number.isFinite(video.volume) ? video.volume : preferredVolumeRef.current
      );
      const deltaSeconds = gestureCommand.action === "seek_backward" ? -10 : 10;
      const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const videoDuration = Number.isFinite(video.duration) ? video.duration : null;
      const nextTime = currentTime + deltaSeconds;
      video.muted = false;
      video.currentTime =
        videoDuration == null
          ? Math.max(0, nextTime)
          : Math.min(Math.max(0, nextTime), videoDuration);
      video.volume = preservedVolume;
      preferredVolumeRef.current = preservedVolume;

      const playPromise = video.play();
      if (playPromise?.catch) {
        playPromise.catch(() => {
          setBlockedStreamUrl(youtubeStreamUrl);
        });
      }
    }
  }, [gestureCommand, showSpotifyStage, showYoutubeStage, youtubeStreamUrl]);

  useEffect(() => {
    if (!gestureCommand?.id || showYoutubeStage || showSpotifyStage) {
      return;
    }

    if (gestureCommand.action === "volume_up" || gestureCommand.action === "volume_down") {
      setVolumeHud((current) => {
        const currentLevel = Number.isFinite(current.level) ? current.level : 80;
        const nextLevel = Math.min(
          Math.max(currentLevel + (gestureCommand.action === "volume_up" ? 50 : -50), 0),
          100
        );
        return {
          visible: true,
          level: nextLevel,
          label: gestureCommand.action === "volume_up" ? "Volume Up" : "Volume Down",
        };
      });
    }
  }, [gestureCommand, showSpotifyStage, showYoutubeStage]);

  useEffect(() => {
    if (!volumeHud.visible) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setVolumeHud((current) => ({
        ...current,
        visible: false,
      }));
    }, 1400);

    return () => window.clearTimeout(timeoutId);
  }, [volumeHud.visible, volumeHud.level, volumeHud.label]);

  const handleManualStart = async () => {
    if (!videoRef.current) {
      return;
    }

    try {
      videoRef.current.muted = false;
      await videoRef.current.play();
      setBlockedStreamUrl("");
      setPlaybackErrorState({
        streamUrl: "",
        message: "",
      });
    } catch {
      setBlockedStreamUrl(youtubeStreamUrl);
    }
  };

  return (
    <div className={musicCardClassName}>
      <div className="card-title-row">
        <div className="card-title">Now Playing</div>
        <div className="chip">{musicChipLabel}</div>
      </div>

      {volumeHud.visible ? (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 14px",
            borderRadius: "16px",
            border: "1px solid rgba(61, 201, 255, 0.24)",
            background:
              "linear-gradient(135deg, rgba(20, 30, 54, 0.94), rgba(14, 22, 40, 0.9))",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              fontSize: "0.86rem",
              color: "rgba(231, 241, 255, 0.92)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <span>{volumeHud.label}</span>
            <span>{volumeHud.level}%</span>
          </div>
          <div
            style={{
              marginTop: "8px",
              height: "8px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.12)",
              overflow: "hidden",
            }}
            aria-hidden="true"
          >
            <div
              style={{
                width: `${volumeHud.level}%`,
                height: "100%",
                borderRadius: "999px",
                background: "linear-gradient(90deg, #48b9ff, #9ee2ff)",
              }}
            />
          </div>
        </div>
      ) : null}

      {disabled ? (
        <ModuleDisabledState
          title="Media hidden"
          description={
            !spotifyEnabled && !youtubeEnabled
              ? "Spotify and YouTube are both turned off in the mobile mirror settings."
              : `${formatSource(currentSource)} is turned off in the mobile mirror settings.`
          }
        />
      ) : showYoutubeStage ? (
        <div className="music-video-shell">
          <div className="music-video-stage">
            <video
              ref={videoRef}
              className="music-video-frame"
              src={youtubeStreamUrl}
              poster={nowPlaying?.videoThumbnailUrl || ""}
              autoPlay
              playsInline
              controls
              preload="metadata"
              onCanPlay={() => {
                if (!videoRef.current) {
                  return;
                }

                videoRef.current.volume = preferredVolumeRef.current;
                const playPromise = videoRef.current.play();
                if (playPromise?.catch) {
                  playPromise.catch(() => {
                    setBlockedStreamUrl(youtubeStreamUrl);
                  });
                }
              }}
              onError={() => {
                setPlaybackErrorState({
                  streamUrl: youtubeStreamUrl,
                  message: "This video stream could not start in the browser.",
                });
              }}
            />
            <div className="music-video-glow" aria-hidden="true"></div>
            {playbackBlocked ? (
              <button
                type="button"
                className="music-video-overlay"
                onClick={handleManualStart}
              >
                Tap to start video and sound
              </button>
            ) : null}
          </div>

          <div className="music-video-meta">
            <div className="music-video-pulse" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>

            <div className="music-main">
              <div className="music-topline">
                <div className="music-status" id="music-status">{videoStatus}</div>
                <div className={`music-source music-source--${nowPlaying?.source || "other"}`}>
                  {formatSource(nowPlaying?.source)}
                </div>
              </div>

              <div className="music-track music-track--video" id="music-track">
                {nowPlaying?.title || "YouTube video ready on the mirror"}
              </div>

              <div className="music-artist-row">
                <div className="music-artist" id="music-artist">
                  {playbackError ||
                    nowPlaying?.playbackNote ||
                    nowPlaying?.artist ||
                    "Sent from the phone app. The mirror is now showing the video itself."}
                </div>
                <div className="music-video-tag">Visual playback</div>
              </div>

              <div className="music-progress-block">
                <div className="music-progress-bar" aria-hidden="true">
                  <span style={{ width: `${progressPercent}%` }}></span>
                </div>
                <div className="music-progress-meta">
                  <span>{formatSeconds(progress)}</span>
                  <span>{duration ? formatSeconds(duration) : "Streaming"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : showSpotifyStage ? (
        <div className="music-video-shell">
          <div className="music-video-stage">
            <iframe
              key={spotifyEmbedUrl}
              className="music-video-frame"
              src={spotifyEmbedUrl}
              title={nowPlaying?.title || "Spotify on mirror"}
              loading="eager"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
            />
            <div className="music-video-glow" aria-hidden="true"></div>
          </div>

          <div className="music-video-meta">
            <div className="music-video-pulse" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>

            <div className="music-main">
              <div className="music-topline">
                <div className="music-status" id="music-status">{videoStatus}</div>
                <div className={`music-source music-source--${nowPlaying?.source || "other"}`}>
                  {formatSource(nowPlaying?.source)}
                </div>
              </div>

              <div className="music-track music-track--video" id="music-track">
                {nowPlaying?.title || "Spotify selection ready on the mirror"}
              </div>

              <div className="music-artist-row">
                <div className="music-artist" id="music-artist">
                  {nowPlaying?.artist ||
                    "Spotify is loaded on the mirror. If Chrome allows autoplay, the song should start on its own."}
                </div>
                <div className="music-video-tag">Audio playback</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
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
      )}
    </div>
  );
}
