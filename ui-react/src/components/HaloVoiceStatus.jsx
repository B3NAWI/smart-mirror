const STATUS_LABELS = {
  idle: "Wake Ready",
  listening: "HALO is listening",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Voice Error",
};

export default function HaloVoiceStatus({
  status = "idle",
  errorMessage = "",
  wakeRecognitionSupported = false,
  shortcutLabel = "Ctrl+Shift+H",
  voiceEnabled = true,
  wakeModeActive = false,
  wakeEngine = "manual",
  microphonePermission = "prompt",
  onActivate,
  onStop,
  onToggleVoiceEnabled,
}) {
  const isActive = status === "listening" || status === "thinking" || status === "speaking";
  const primaryLabel = !voiceEnabled
    ? "Auto Wake Off"
    : !wakeRecognitionSupported && status === "idle"
    ? "Manual Voice"
    : STATUS_LABELS[status];
  const helperLabel = !voiceEnabled
    ? `Automatic microphone is off. Use ${shortcutLabel} or enable wake mode.`
    : wakeModeActive
    ? `Wake mode active via ${wakeEngine}. Say "Hi Halo".`
    : microphonePermission === "denied"
    ? "Microphone permission was denied. Manual mode is still available."
    : `Manual start only via ${shortcutLabel}.`;

  return (
    <div
      className={`halo-voice-status halo-voice-status--${status}`}
      title={status === "error" && errorMessage ? errorMessage : helperLabel}
    >
      <button
        type="button"
        className="halo-voice-status__primary"
        onClick={() => {
          if (!voiceEnabled) {
            onToggleVoiceEnabled?.(true);
            return;
          }
          if (isActive) {
            onStop?.();
            return;
          }
          onActivate?.();
        }}
        aria-pressed={isActive || voiceEnabled}
      >
        <span className="halo-voice-status__dot" aria-hidden="true" />
        <span className="halo-voice-status__label">{primaryLabel}</span>
      </button>

      <span className="halo-voice-status__helper">{helperLabel}</span>

      {isActive ? (
        <button
          type="button"
          className="halo-voice-status__stop"
          onClick={onStop}
          aria-label="Stop listening"
        >
          Stop
        </button>
      ) : (
        <button
          type="button"
          className="halo-voice-status__stop"
          onClick={() => onToggleVoiceEnabled?.(!voiceEnabled)}
          aria-label={voiceEnabled ? "Disable automatic microphone" : "Enable automatic microphone"}
        >
          {voiceEnabled ? "Auto On" : "Auto Off"}
        </button>
      )}
    </div>
  );
}
