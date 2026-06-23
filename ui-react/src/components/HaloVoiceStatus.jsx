const STATUS_LABELS = {
  idle: "Wake Ready",
  listening: "Listening",
  thinking: "Processing",
  speaking: "Responding",
  stopped: "Paused",
  error: "Voice Error",
};

export default function HaloVoiceStatus({
  status = "idle",
  errorMessage = "",
  wakeRecognitionSupported = false,
  shortcutLabel = "Ctrl+Shift+H",
  voiceEnabled = true,
  wakeModeActive = false,
  conversationModeActive = false,
  microphonePermission = "prompt",
  onActivate,
  onStop,
}) {
  const isActive =
    status === "listening" || status === "thinking" || status === "speaking";
  const canManualStop = isActive;
  const resolvedErrorLabel =
    errorMessage && errorMessage.startsWith("Error:")
      ? errorMessage
      : errorMessage
      ? `Error: ${errorMessage}`
      : STATUS_LABELS.error;

  const primaryLabel =
    status === "error" && errorMessage
      ? resolvedErrorLabel
      : !voiceEnabled
      ? "Voice Disabled"
      : !wakeRecognitionSupported && status === "idle"
      ? "Manual Voice"
      : STATUS_LABELS[status] || STATUS_LABELS.idle;

  const helperLabel = !voiceEnabled
    ? `Voice mode is off. Use ${shortcutLabel} to activate manually.`
    : microphonePermission === "denied"
    ? "Microphone permission was denied. Manual mode is still available."
    : conversationModeActive
    ? 'Conversation is open. HALO will keep listening until you say "Halo stop" or tap Stop.'
    : wakeModeActive
    ? 'Say "Hi Halo", "Hey Halo", "Merhaba Halo", or "هالو".'
    : status === "speaking"
    ? 'Say "Halo stop" or tap Stop to interrupt.'
    : status === "thinking"
    ? "HALO is processing your command."
    : status === "listening"
    ? "Speak naturally."
    : `Voice shortcut: ${shortcutLabel}.`;

  const badgeLabel = canManualStop
    ? "Tap to stop"
    : conversationModeActive
    ? "Open Talk"
    : wakeModeActive
    ? "Hands-free"
    : !voiceEnabled
    ? "Off"
    : "Ready";

  const titleLabel =
    status === "error" && errorMessage ? resolvedErrorLabel : helperLabel;

  return (
    <div className={`halo-voice-status halo-voice-status--${status}`} title={titleLabel}>
      <button
        type="button"
        className="halo-voice-status__primary"
        onClick={() => {
          if (canManualStop) {
            onStop?.();
            return;
          }
          onActivate?.();
        }}
        aria-pressed={isActive || voiceEnabled}
        aria-label={canManualStop ? "Stop HALO voice" : "Activate HALO voice"}
      >
        <span className="halo-voice-status__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" role="presentation" focusable="false">
            <path d="M12 15.25a3.75 3.75 0 0 0 3.75-3.75V7a3.75 3.75 0 1 0-7.5 0v4.5A3.75 3.75 0 0 0 12 15.25Z" />
            <path d="M18.25 11.5a.75.75 0 0 0-1.5 0 4.75 4.75 0 0 1-9.5 0 .75.75 0 0 0-1.5 0 6.26 6.26 0 0 0 5.5 6.21V20h-2a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-2v-2.29a6.26 6.26 0 0 0 5.5-6.21Z" />
          </svg>
        </span>

        <span className="halo-voice-status__copy">
          <span className="halo-voice-status__eyebrow">HALO Voice</span>
          <span className="halo-voice-status__label">{primaryLabel}</span>
        </span>

        <span className="halo-voice-status__badge">{badgeLabel}</span>
      </button>

      {canManualStop ? (
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
