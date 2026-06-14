const STATUS_LABELS = {
  idle: "Halo Voice",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Voice Error",
};

export default function HaloVoiceStatus({
  status = "idle",
  errorMessage = "",
  wakeRecognitionSupported = false,
  shortcutLabel = "Ctrl+Shift+H",
  voiceEnabled = false,
  onActivate,
  onStop,
}) {
  const isActive = status === "listening" || status === "thinking" || status === "speaking";
  const primaryLabel =
    !voiceEnabled
      ? "Enable Voice"
      : status === "idle" && !wakeRecognitionSupported
      ? "Voice Manual"
      : STATUS_LABELS[status];
  const helperLabel = !voiceEnabled
    ? `Enable once, then use ${shortcutLabel}`
    : wakeRecognitionSupported
    ? `Wake words enabled • ${shortcutLabel}`
    : `Manual start only • ${shortcutLabel}`;

  return (
    <div
      className={`halo-voice-status halo-voice-status--${status}`}
      title={status === "error" && errorMessage ? errorMessage : helperLabel}
    >
      <button
        type="button"
        className="halo-voice-status__primary"
        onClick={isActive ? onStop : onActivate}
        aria-pressed={isActive || voiceEnabled}
      >
        <span className="halo-voice-status__dot" aria-hidden="true" />
        <span className="halo-voice-status__label">{primaryLabel}</span>
      </button>

      {isActive ? (
        <button
          type="button"
          className="halo-voice-status__stop"
          onClick={onStop}
          aria-label="Stop listening"
        >
          Stop
        </button>
      ) : null}
    </div>
  );
}
