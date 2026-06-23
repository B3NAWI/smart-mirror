import { createActivationSoundService } from "./activationSound";

const KEYBOARD_SHORTCUT_LABEL = "Ctrl+Shift+H";
const VOICE_ENABLED_STORAGE_KEY = "halo.voice.enabled.v4";
const MIN_COMMAND_LISTEN_WINDOW_MS = 1500;
const MAX_COMMAND_LISTEN_WINDOW_MS = 10000;
const COMMAND_SETTLE_DELAY_MS = 650;
const COOLDOWN_DELAY_MS = 500;
const RESTART_DELAY_MS = 350;
const SPEECH_CHUNK_CHAR_LIMIT = 180;
const SPEECH_RETRY_LIMIT = 2;
const SPEECH_CUTOFF_MIN_RATIO = 0.35;
const ARABIC_SPEECH_PATTERN = /[\u0600-\u06ff]/u;
const TURKISH_SPEECH_PATTERN = /[çğıöşüİı]/iu;
const WAKE_WORDS = [
  "hi halo",
  "hey halo",
  "\u0647\u0627\u064a \u0647\u0627\u0644\u0648",
  "\u0647\u0627\u0644\u0648",
  "merhaba halo",
  "halo",
];
const STOP_PHRASES = [
  "halo stop",
  "stop halo",
  "\u0647\u0627\u0644\u0648 \u0633\u062a\u0648\u0628",
  "halo dur",
];
export const VOICE_PHASES = {
  IDLE_WAKE_LISTENING: "IDLE_WAKE_LISTENING",
  WAKE_DETECTED: "WAKE_DETECTED",
  ACKNOWLEDGING: "ACKNOWLEDGING",
  COMMAND_LISTENING: "COMMAND_LISTENING",
  PROCESSING: "PROCESSING",
  SPEAKING: "SPEAKING",
  SPEAKING_COMPLETE: "SPEAKING_COMPLETE",
  COOLDOWN: "COOLDOWN",
  STOPPED: "STOPPED",
  ERROR: "ERROR",
};
const STATUS_BY_PHASE = {
  [VOICE_PHASES.IDLE_WAKE_LISTENING]: "idle",
  [VOICE_PHASES.WAKE_DETECTED]: "listening",
  [VOICE_PHASES.ACKNOWLEDGING]: "listening",
  [VOICE_PHASES.COMMAND_LISTENING]: "listening",
  [VOICE_PHASES.PROCESSING]: "thinking",
  [VOICE_PHASES.SPEAKING]: "speaking",
  [VOICE_PHASES.SPEAKING_COMPLETE]: "speaking",
  [VOICE_PHASES.COOLDOWN]: "stopped",
  [VOICE_PHASES.STOPPED]: "stopped",
  [VOICE_PHASES.ERROR]: "error",
};
const ARABIC_LOCALE_PATTERN = /^ar\b/i;
const TURKISH_LOCALE_PATTERN = /^tr\b/i;

function createInitialDebugState() {
  return {
    voicePhase: VOICE_PHASES.STOPPED,
    wakeDetected: false,
    wakeDetectedAt: "",
    currentLanguage: "en",
    commandCaptured: "",
    commandCapturedAt: "",
    category: "",
    selectedIntent: "",
    selectedTool: "",
    realtimeSessionActive: false,
    realtimeStatus: "inactive",
    realtimeReason:
      "Frontend output uses backend text routing plus browser speech synthesis.",
    outputTokenLimit: 200,
    generalOutputTokenLimit: 350,
    detailedOutputTokenLimit: 500,
    responseStatus: "idle",
    responseStatusDetails: "Realtime inactive in frontend voice flow.",
    incompleteDetails: "not_applicable_local_tts",
    finishReason: "not_applicable_local_tts",
    backendHttpStatus: null,
    backendResponseReceivedAt: "",
    audioPlaybackStatus: "idle",
    audioDurationMs: 0,
    audioChunkCount: 0,
    audioChunksCompleted: 0,
    audioCutoffSuspected: false,
    responseCancelled: false,
    responseCancelledBy: "",
    sessionCloseReason: "",
    sessionCloseBlocked: false,
    lastError: "",
    apiErrorCode: "",
    apiErrorMessage: "",
    outputMode: "browser_speech_synthesis",
    model: "",
    vad: {
      silence_duration_ms: 1500,
      prefix_padding_ms: 500,
      threshold: 0.5,
    },
    commandListenMinMs: MIN_COMMAND_LISTEN_WINDOW_MS,
    commandListenMaxMs: MAX_COMMAND_LISTEN_WINDOW_MS,
    maxUserTextChars: 1000,
    historyTurns: 3,
    maxToolOutputChars: 1500,
    maxProjectContextChars: 6000,
  };
}

function createInitialSnapshot() {
  return {
    status: "idle",
    errorMessage: "",
    wakeRecognitionSupported: false,
    shortcutLabel: KEYBOARD_SHORTCUT_LABEL,
    voiceEnabled: true,
    wakeModeActive: false,
    conversationModeActive: false,
    wakeEngine: "manual",
    microphonePermission: "prompt",
    debug: createInitialDebugState(),
  };
}

function buildApiUrl(apiBaseUrl, path) {
  return `${apiBaseUrl}${path}`;
}

function normalizeTranscript(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function transcriptContainsAnyPhrase(value, phrases) {
  const normalized = normalizeTranscript(value);
  return Boolean(normalized) && phrases.some((phrase) => normalized.includes(phrase));
}

function stripWakePhrase(value) {
  const normalized = normalizeTranscript(value);
  if (!normalized) {
    return "";
  }

  for (const wakeWord of [...WAKE_WORDS].sort((left, right) => right.length - left.length)) {
    const index = normalized.indexOf(wakeWord);
    if (index < 0) {
      continue;
    }
    return normalized.slice(index + wakeWord.length).trim();
  }

  return "";
}

function isArabicLocale() {
  const localeCandidates = [];

  if (typeof document !== "undefined") {
    localeCandidates.push(document.documentElement?.lang || "");
  }

  if (typeof navigator !== "undefined") {
    localeCandidates.push(...(Array.isArray(navigator.languages) ? navigator.languages : []));
    localeCandidates.push(navigator.language || "");
  }

  return localeCandidates.some((locale) => ARABIC_LOCALE_PATTERN.test(locale || ""));
}

function isTurkishLocale() {
  const localeCandidates = [];

  if (typeof document !== "undefined") {
    localeCandidates.push(document.documentElement?.lang || "");
  }

  if (typeof navigator !== "undefined") {
    localeCandidates.push(...(Array.isArray(navigator.languages) ? navigator.languages : []));
    localeCandidates.push(navigator.language || "");
  }

  return localeCandidates.some((locale) => TURKISH_LOCALE_PATTERN.test(locale || ""));
}

function transcriptLooksArabic(value) {
  return ARABIC_SPEECH_PATTERN.test(String(value || ""));
}

function transcriptLooksTurkish(value) {
  const transcript = String(value || "");
  return (
    TURKISH_SPEECH_PATTERN.test(transcript) ||
    /\b(saat|kaç|kac|merhaba|geliştirdi|gelistirdi|nedir|takvim|hava durumu|ekran|göster|goster|gizle|aç|ac|kapat)\b/i.test(
      transcript
    )
  );
}

function detectDominantLanguage(value = "") {
  const transcript = String(value || "");
  if (transcriptLooksArabic(transcript)) {
    return "ar";
  }
  if (transcriptLooksTurkish(transcript)) {
    return "tr";
  }
  if (!transcript.trim()) {
    if (isArabicLocale()) {
      return "ar";
    }
    if (isTurkishLocale()) {
      return "tr";
    }
  }
  return "en";
}

function getPreferredRecognitionLanguage(transcript = "") {
  const language = detectDominantLanguage(transcript);
  if (language === "ar") {
    return "ar-SA";
  }
  if (language === "tr") {
    return "tr-TR";
  }
  return "en-US";
}

function buildWakeGreeting(language = "en") {
  if (language === "ar") {
    return "\u0623\u0643\u064a\u062f\u060c \u0633\u0627\u0645\u0639\u0643.";
  }
  if (language === "tr") {
    return "Evet, dinliyorum.";
  }
  return "Yes, I'm listening.";
}

function selectSpeechVoice(language = "en") {
  if (typeof window === "undefined" || !window.speechSynthesis?.getVoices) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();
  if (!Array.isArray(voices) || voices.length === 0) {
    return null;
  }

  const preferredPrefix =
    language === "ar" ? "ar" : language === "tr" ? "tr" : "en";

  return (
    voices.find((voice) => String(voice?.lang || "").toLowerCase().startsWith(`${preferredPrefix}-`)) ||
    voices.find((voice) => String(voice?.lang || "").toLowerCase().startsWith(preferredPrefix)) ||
    voices.find((voice) => voice?.default) ||
    null
  );
}

function buildRecognitionErrorMessage(errorCode) {
  if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
    return "Error: microphone unavailable";
  }
  if (errorCode === "audio-capture") {
    return "Error: microphone unavailable";
  }
  return "Voice recognition is unavailable right now.";
}

function formatTimestamp(value = Date.now()) {
  return new Date(value).toISOString();
}

function debugLog(message, details) {
  if (typeof console === "undefined" || typeof console.info !== "function") {
    return;
  }

  if (typeof details === "undefined") {
    console.info(`[HALO Voice] ${message}`);
    return;
  }

  console.info(`[HALO Voice] ${message}`, details);
}

function buildSpeechChunks(text) {
  const normalizedText = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalizedText) {
    return [];
  }

  const sentencePattern = new RegExp("[^.!?\\u061f\\u060c\\u061b]+[.!?\\u061f\\u060c\\u061b]?", "gu");
  const sentences =
    normalizedText.match(sentencePattern)?.map((item) => item.trim()).filter(Boolean) ||
    [normalizedText];

  const chunks = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    const nextChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
    if (nextChunk.length <= SPEECH_CHUNK_CHAR_LIMIT) {
      currentChunk = nextChunk;
      continue;
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    if (sentence.length <= SPEECH_CHUNK_CHAR_LIMIT) {
      currentChunk = sentence;
      continue;
    }

    let remaining = sentence;
    while (remaining.length > SPEECH_CHUNK_CHAR_LIMIT) {
      chunks.push(remaining.slice(0, SPEECH_CHUNK_CHAR_LIMIT).trim());
      remaining = remaining.slice(SPEECH_CHUNK_CHAR_LIMIT).trim();
    }
    currentChunk = remaining;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function estimateSpeechDurationMs(text) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(900, words * 150);
}

function dispatchVoiceToolEvent(detail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("halo:voice-tool", {
      detail,
    })
  );
}

async function parseErrorMessage(response) {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === "string" && payload.detail.trim()) {
      return payload.detail.trim();
    }
  } catch {
    // Ignore parsing issues and fall back to status text.
  }

  if (typeof response.statusText === "string" && response.statusText.trim()) {
    return response.statusText.trim();
  }

  return `Request failed with status ${response.status}`;
}

export function createHaloVoiceClient({
  apiBaseUrl = "",
  apiKey,
  getUserContext = () => ({}),
} = {}) {
  const listeners = new Set();
  const snapshot = createInitialSnapshot();
  const activationSound = createActivationSoundService();
  const SpeechRecognitionClass =
    typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  let isStarted = false;
  let voicePhase = VOICE_PHASES.STOPPED;
  let wakeRecognition = null;
  let commandRecognition = null;
  let stopRecognition = null;
  let commandMinWindowTimeoutId = null;
  let commandMaxWindowTimeoutId = null;
  let commandSettleTimeoutId = null;
  let cooldownTimeoutId = null;
  let recognitionRestartTimeoutId = null;
  let microphonePermissionRequest = null;
  let commandAbortController = null;
  let isRecognitionTransitioning = false;
  let lastErrorMessage = "";
  let activeSpeechRunId = 0;
  let activeCommandSessionId = 0;
  let preferredCommandLanguage = getPreferredRecognitionLanguage();
  let conversationModeActive = false;

  snapshot.wakeRecognitionSupported = Boolean(SpeechRecognitionClass);
  snapshot.voiceEnabled = readPersistedVoiceEnabled();
  snapshot.wakeEngine = SpeechRecognitionClass ? "web-speech" : "manual";

  function readPersistedVoiceEnabled() {
    if (typeof window === "undefined") {
      return true;
    }

    try {
      const savedValue = window.localStorage.getItem(VOICE_ENABLED_STORAGE_KEY);
      if (savedValue === null) {
        return true;
      }
      return savedValue === "true";
    } catch {
      return true;
    }
  }

  function persistVoiceEnabled(value) {
    snapshot.voiceEnabled = value;
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(VOICE_ENABLED_STORAGE_KEY, value ? "true" : "false");
    } catch {
      // Ignore localStorage failures and continue in memory.
    }
  }

  function emit() {
    const nextSnapshot = { ...snapshot, debug: { ...snapshot.debug, vad: { ...snapshot.debug.vad } } };
    listeners.forEach((listener) => listener(nextSnapshot));
  }

  function updateSnapshot(nextValues) {
    Object.assign(snapshot, nextValues);
    emit();
  }

  function updateDebug(nextValues) {
    snapshot.debug = {
      ...snapshot.debug,
      ...nextValues,
      vad: {
        ...snapshot.debug.vad,
        ...(nextValues?.vad || {}),
      },
    };
    emit();
  }

  function setConversationMode(nextValue) {
    conversationModeActive = Boolean(nextValue);
    updateSnapshot({
      conversationModeActive,
    });
  }

  function setPhase(nextPhase, { errorMessage = "", wakeModeActive } = {}) {
    voicePhase = nextPhase;
    lastErrorMessage = errorMessage;
    updateSnapshot({
      status: STATUS_BY_PHASE[nextPhase] || "idle",
      errorMessage,
      wakeModeActive:
        typeof wakeModeActive === "boolean" ? wakeModeActive : snapshot.wakeModeActive,
      wakeRecognitionSupported: Boolean(SpeechRecognitionClass),
      wakeEngine: SpeechRecognitionClass ? "web-speech" : "manual",
    });
    updateDebug({
      voicePhase: nextPhase,
      lastError: errorMessage || snapshot.debug.lastError,
    });
    debugLog("voice state changed", {
      state: nextPhase,
      status: snapshot.status,
      wakeModeActive: snapshot.wakeModeActive,
    });
  }

  function clearTimers() {
    if (commandMinWindowTimeoutId) {
      window.clearTimeout(commandMinWindowTimeoutId);
      commandMinWindowTimeoutId = null;
    }
    if (commandMaxWindowTimeoutId) {
      window.clearTimeout(commandMaxWindowTimeoutId);
      commandMaxWindowTimeoutId = null;
    }
    if (commandSettleTimeoutId) {
      window.clearTimeout(commandSettleTimeoutId);
      commandSettleTimeoutId = null;
    }
    if (cooldownTimeoutId) {
      window.clearTimeout(cooldownTimeoutId);
      cooldownTimeoutId = null;
    }
    if (recognitionRestartTimeoutId) {
      window.clearTimeout(recognitionRestartTimeoutId);
      recognitionRestartTimeoutId = null;
    }
  }

  async function fetchDebugConfig() {
    try {
      const response = await fetch(buildApiUrl(apiBaseUrl, "/api/assistant/debug/config"), {
        headers: {
          "X-API-Key": apiKey,
        },
      });
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }
      const payload = await response.json();
      updateDebug({
        model: String(payload?.model || "").trim(),
        outputTokenLimit: Number(payload?.max_response_output_tokens) || snapshot.debug.outputTokenLimit,
        generalOutputTokenLimit:
          Number(payload?.general_max_response_output_tokens) ||
          snapshot.debug.generalOutputTokenLimit,
        detailedOutputTokenLimit:
          Number(payload?.detailed_max_response_output_tokens) ||
          snapshot.debug.detailedOutputTokenLimit,
        maxUserTextChars:
          Number(payload?.max_user_text_chars) || snapshot.debug.maxUserTextChars,
        historyTurns: Number(payload?.history_turns) || snapshot.debug.historyTurns,
        maxToolOutputChars:
          Number(payload?.max_tool_output_chars) || snapshot.debug.maxToolOutputChars,
        maxProjectContextChars:
          Number(payload?.max_project_context_chars) || snapshot.debug.maxProjectContextChars,
        realtimeSessionActive: Boolean(payload?.realtime_frontend_active),
        realtimeStatus: payload?.realtime_frontend_active ? "active" : "inactive",
        realtimeReason:
          String(payload?.frontend_output_mode || "").trim() || snapshot.debug.realtimeReason,
        outputMode:
          String(payload?.frontend_output_mode || "").trim() || snapshot.debug.outputMode,
        vad: {
          silence_duration_ms:
            Number(payload?.vad?.silence_duration_ms) || snapshot.debug.vad.silence_duration_ms,
          prefix_padding_ms:
            Number(payload?.vad?.prefix_padding_ms) || snapshot.debug.vad.prefix_padding_ms,
          threshold: Number(payload?.vad?.threshold) || snapshot.debug.vad.threshold,
        },
      });
      debugLog("realtime inspection", {
        realtimeSessionActive: Boolean(payload?.realtime_frontend_active),
        model: payload?.model || "",
        maxResponseOutputTokens: payload?.max_response_output_tokens,
        vad: payload?.vad || {},
      });
    } catch (error) {
      debugLog("assistant debug config unavailable", {
        message: error instanceof Error ? error.message : "Unknown debug config error.",
      });
    }
  }

  async function ensureMicrophonePermission() {
    if (!navigator.mediaDevices?.getUserMedia || typeof window === "undefined") {
      return;
    }

    if (snapshot.microphonePermission === "granted") {
      return;
    }

    if (microphonePermissionRequest) {
      return microphonePermissionRequest;
    }

    microphonePermissionRequest = navigator.mediaDevices
      .getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then((permissionStream) => {
        snapshot.microphonePermission = "granted";
        permissionStream.getTracks().forEach((track) => track.stop());
        emit();
        debugLog("microphone permission granted");
      })
      .catch((error) => {
        snapshot.microphonePermission = "denied";
        emit();
        debugLog("microphone permission denied");
        throw error;
      })
      .finally(() => {
        microphonePermissionRequest = null;
      });

    return microphonePermissionRequest;
  }

  function stopWakeRecognition() {
    if (!wakeRecognition) {
      return;
    }
    const recognition = wakeRecognition;
    wakeRecognition = null;
    try {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    } catch {
      // Best-effort only.
    }
    updateSnapshot({ wakeModeActive: false });
  }

  function stopCommandRecognition() {
    if (!commandRecognition) {
      return;
    }
    const recognition = commandRecognition;
    commandRecognition = null;
    try {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    } catch {
      // Best-effort only.
    }
  }

  function stopStopRecognition() {
    if (!stopRecognition) {
      return;
    }
    const recognition = stopRecognition;
    stopRecognition = null;
    try {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    } catch {
      // Best-effort only.
    }
  }

  function stopAllRecognition() {
    stopWakeRecognition();
    stopCommandRecognition();
    stopStopRecognition();
  }

  function cancelSpeech({ reason = "", markCancelled = true } = {}) {
    activeSpeechRunId += 1;
    if (markCancelled) {
      updateDebug({
        responseCancelled: true,
        responseCancelledBy: reason || "manual",
        sessionCloseReason: reason || snapshot.debug.sessionCloseReason,
        audioPlaybackStatus: "cancelled",
      });
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore speech cancellation issues.
    }
  }

  function cancelCommandRequest() {
    if (!commandAbortController) {
      return;
    }
    commandAbortController.abort();
    commandAbortController = null;
  }

  function buildRecognitionInstance({ continuous, interimResults, lang }) {
    if (!SpeechRecognitionClass) {
      return null;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.maxAlternatives = 1;
    recognition.lang = lang || getPreferredRecognitionLanguage();
    return recognition;
  }

  async function returnToWakeMode({ reason = "complete", fromStoppedState = false } = {}) {
    clearTimers();
    cancelCommandRequest();
    stopCommandRecognition();
    stopStopRecognition();

    if (!isStarted) {
      return;
    }

    updateDebug({
      sessionCloseReason: reason,
      sessionCloseBlocked: false,
      responseStatus: "completed",
    });

    if (!snapshot.voiceEnabled) {
      setPhase(VOICE_PHASES.STOPPED, { wakeModeActive: false });
      return;
    }

    if (!SpeechRecognitionClass) {
      setPhase(VOICE_PHASES.STOPPED, {
        wakeModeActive: false,
        errorMessage: "Voice recognition is unavailable in this browser.",
      });
      return;
    }

    setPhase(fromStoppedState ? VOICE_PHASES.STOPPED : VOICE_PHASES.COOLDOWN, {
      wakeModeActive: false,
    });

    cooldownTimeoutId = window.setTimeout(() => {
      if (conversationModeActive) {
        debugLog("returned to conversation mode", { reason });
        void startCommandListening({ source: "conversation-followup" });
        return;
      }

      debugLog("returned to wake mode", { reason });
      void startWakeListening({ restartReason: reason });
    }, fromStoppedState ? COOLDOWN_DELAY_MS : RESTART_DELAY_MS);
  }

  function handleApiFailure(errorMessage, errorCode = "") {
    const uiError = "API limit/error detected. Check console.";
    updateDebug({
      responseStatus: "error",
      responseStatusDetails: errorMessage,
      lastError: errorMessage,
      apiErrorCode: errorCode,
      apiErrorMessage: errorMessage,
    });
    setPhase(VOICE_PHASES.ERROR, {
      errorMessage: uiError,
      wakeModeActive: false,
    });
  }

  function handleRecognitionFailure(errorMessage) {
    updateDebug({
      responseStatus: "error",
      lastError: errorMessage,
      apiErrorCode: "",
      apiErrorMessage: errorMessage,
    });
    setPhase(VOICE_PHASES.ERROR, {
      errorMessage,
      wakeModeActive: false,
    });
  }

  async function speakQueuedChunks(chunks, { nextStep }) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      updateDebug({
        audioPlaybackStatus: "unavailable",
        audioDurationMs: 0,
      });
      debugLog("response audio started", { fallback: "none" });
      debugLog("response audio ended", { fallback: "none" });
      if (nextStep !== "wake-ack") {
        setPhase(VOICE_PHASES.SPEAKING_COMPLETE, { wakeModeActive: false });
        await returnToWakeMode({ reason: nextStep });
      }
      return;
    }

    const speechRunId = ++activeSpeechRunId;
    const queue = chunks.map((chunkText) => ({ text: chunkText, attempt: 0 }));
    const totalStartTime = performance.now();
    let completedChunks = 0;
    let cutoffSuspected = false;

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume?.();
    } catch {
      // Best-effort only.
    }

    updateDebug({
      audioPlaybackStatus: "queued",
      audioChunkCount: queue.length,
      audioChunksCompleted: 0,
      audioDurationMs: 0,
      audioCutoffSuspected: false,
      responseCancelled: false,
      responseCancelledBy: "",
    });
    void startStopPhraseListening();

    while (queue.length) {
      if (speechRunId !== activeSpeechRunId) {
        return;
      }

      const chunk = queue.shift();
      const chunkText = String(chunk?.text || "").trim();
      if (!chunkText) {
        continue;
      }

      await new Promise((resolve) => {
        let finished = false;
        let lastBoundaryCharIndex = 0;
        const chunkStartTime = performance.now();

        const finish = ({ detectedCutoff = false, remainder = "" } = {}) => {
          if (finished) {
            return;
          }
          finished = true;

          const durationMs = Math.round(performance.now() - chunkStartTime);
          const expectedDurationMs = estimateSpeechDurationMs(chunkText);
          const shouldRetry =
            detectedCutoff &&
            remainder &&
            chunk.attempt < SPEECH_RETRY_LIMIT &&
            speechRunId === activeSpeechRunId;

          if (shouldRetry) {
            cutoffSuspected = true;
            queue.unshift({ text: remainder, attempt: chunk.attempt + 1 });
          }

          completedChunks += shouldRetry ? 0 : 1;
          updateDebug({
            audioPlaybackStatus: shouldRetry ? "retrying-cutoff" : "speaking",
            audioChunksCompleted: completedChunks,
            audioDurationMs: Math.round(performance.now() - totalStartTime),
            audioCutoffSuspected: cutoffSuspected,
          });
          debugLog(shouldRetry ? "speech cutoff suspected" : "response chunk finished", {
            durationMs,
            expectedDurationMs,
            chunkLength: chunkText.length,
            boundaryCharIndex: lastBoundaryCharIndex,
            attempt: chunk.attempt,
            remainderLength: remainder.length,
          });
          resolve();
        };

        const utterance = new SpeechSynthesisUtterance(chunkText);
        const speechLanguage = detectDominantLanguage(chunkText);
        utterance.lang =
          speechLanguage === "ar" ? "ar-SA" : speechLanguage === "tr" ? "tr-TR" : "en-US";
        utterance.voice = selectSpeechVoice(speechLanguage);
        utterance.rate = speechLanguage === "ar" ? 0.96 : 0.98;
        utterance.pitch = 1;
        utterance.onstart = () => {
          updateDebug({
            audioPlaybackStatus: "speaking",
          });
          debugLog("response.audio.delta", {
            chunkIndex: completedChunks + 1,
            chunkCount: chunks.length,
          });
          debugLog("response audio started", {
            chunk: completedChunks + 1,
            chunkCount: chunks.length,
            chunkText: chunkText.slice(0, 120),
          });
        };
        utterance.onboundary = (event) => {
          if (typeof event?.charIndex === "number") {
            lastBoundaryCharIndex = Math.max(lastBoundaryCharIndex, event.charIndex);
          }
        };
        utterance.onend = () => {
          const durationMs = Math.round(performance.now() - chunkStartTime);
          const expectedDurationMs = estimateSpeechDurationMs(chunkText);
          const cutoffDetected =
            lastBoundaryCharIndex > 0 &&
            lastBoundaryCharIndex < chunkText.length - 12 &&
            durationMs < expectedDurationMs * SPEECH_CUTOFF_MIN_RATIO;
          const remainder = cutoffDetected
            ? chunkText.slice(lastBoundaryCharIndex).trim()
            : "";
          debugLog("response audio ended", {
            durationMs,
            expectedDurationMs,
            boundaryCharIndex: lastBoundaryCharIndex,
            cutoffDetected,
          });
          finish({ detectedCutoff: cutoffDetected, remainder });
        };
        utterance.onerror = (event) => {
          updateDebug({
            audioPlaybackStatus: "error",
            lastError: "Browser speech playback failed.",
            responseStatus: "error",
            responseStatusDetails:
              typeof event?.error === "string" ? event.error : "speech-error",
          });
          debugLog("response audio ended", {
            reason: "speech-error",
            error: event?.error,
          });
          finish();
        };

        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          finish();
        }
      });
    }

    stopStopRecognition();
    if (speechRunId !== activeSpeechRunId) {
      return;
    }

    updateDebug({
      audioPlaybackStatus: "ended",
      audioDurationMs: Math.round(performance.now() - totalStartTime),
      audioChunksCompleted: completedChunks,
      audioCutoffSuspected: cutoffSuspected,
    });
    debugLog("response.audio.done", {
      chunkCount: chunks.length,
      audioDurationMs: Math.round(performance.now() - totalStartTime),
      cutoffSuspected,
    });

    if (nextStep !== "wake-ack") {
      setPhase(VOICE_PHASES.SPEAKING_COMPLETE, { wakeModeActive: false });
      await returnToWakeMode({ reason: nextStep });
    }
  }

  async function speakReply(text, { nextStep = "open-mic" } = {}) {
    const responseText = String(text || "").trim();
    if (!responseText) {
      if (nextStep !== "wake-ack") {
        await returnToWakeMode({ reason: nextStep });
      }
      return;
    }

    stopWakeRecognition();
    stopCommandRecognition();
    setPhase(VOICE_PHASES.SPEAKING, { wakeModeActive: false });
    updateDebug({
      responseStatus: "speaking",
      responseStatusDetails: "Assistant reply is being spoken locally.",
    });
    await speakQueuedChunks(buildSpeechChunks(responseText), { nextStep });
  }

  async function runVoiceCommand(commandText, { source = "open-mic" } = {}) {
    const normalizedCommand = String(commandText || "").trim();
    if (!normalizedCommand) {
      await returnToWakeMode({ reason: "empty-command" });
      return;
    }

    stopWakeRecognition();
    stopCommandRecognition();
    stopStopRecognition();
    clearTimers();
    cancelCommandRequest();

    const userContext = getUserContext() || {};
    const commandSessionId = ++activeCommandSessionId;
    commandAbortController = new AbortController();

    setPhase(VOICE_PHASES.PROCESSING, { wakeModeActive: false });
    updateDebug({
      commandCaptured: normalizedCommand.slice(0, 200),
      commandCapturedAt: formatTimestamp(),
      currentLanguage: detectDominantLanguage(normalizedCommand),
      responseStatus: "pending",
      responseStatusDetails: "Waiting for backend assistant response.",
      backendHttpStatus: null,
      backendResponseReceivedAt: "",
      lastError: "",
      apiErrorCode: "",
      apiErrorMessage: "",
      responseCancelled: false,
      responseCancelledBy: "",
      incompleteDetails: "not_applicable_local_tts",
      finishReason: "waiting_for_backend",
    });
    debugLog("command captured", { source, command: normalizedCommand.slice(0, 160) });

    try {
      const response = await fetch(buildApiUrl(apiBaseUrl, "/api/voice/command"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          command: normalizedCommand,
          user_id: String(userContext.userId || userContext.accountId || "").trim() || "mirror-local",
          account_name: String(userContext.accountName || "").trim() || undefined,
        }),
        signal: commandAbortController.signal,
      });

      if (!response.ok) {
        const errorMessage = await parseErrorMessage(response);
        const errorCode = String(response.status || "");
        commandAbortController = null;
        handleApiFailure(errorMessage, errorCode);
        debugLog("error event", {
          type: "http-error",
          code: errorCode,
          message: errorMessage,
        });
        await returnToWakeMode({ reason: "api-error" });
        return;
      }

      const payload = await response.json();
      if (commandSessionId !== activeCommandSessionId) {
        return;
      }

      commandAbortController = null;
      updateDebug({
        backendHttpStatus: response.status,
        backendResponseReceivedAt: formatTimestamp(),
        currentLanguage:
          String(payload?.data?.language || "").trim() || detectDominantLanguage(payload?.reply || normalizedCommand),
        category: String(payload.category || "").trim(),
        selectedIntent: String(payload.intent || "").trim(),
        selectedTool: String(payload.tool || "").trim(),
        responseStatus: "completed",
        responseStatusDetails: "Backend assistant reply received.",
        finishReason: "completed",
      });
      debugLog("response.created", {
        status: "completed",
        status_details: "backend_text_route",
      });
      debugLog("response.output_item.done", {
        type: "message",
        replyLength: String(payload.reply || "").length,
      });

      if (typeof console !== "undefined" && typeof console.groupCollapsed === "function") {
        console.groupCollapsed("[HALO Voice] command response");
        console.info("intent", payload.intent);
        console.info("tool", payload.tool);
        console.info("reply", payload.reply);
        console.info("data", payload.data || {});
        console.groupEnd();
      }

      debugLog("selected intent/tool", {
        intent: payload.intent,
        tool: payload.tool,
      });
      debugLog("tool result", payload.data || {});
      debugLog("response.done", {
        status: "completed",
        status_details: "backend_text_route",
        finish_reason: "completed",
        incomplete_details: "not_applicable_local_tts",
      });

      dispatchVoiceToolEvent({
        tool: payload.tool,
        arguments: { command: normalizedCommand, source },
        result: payload,
      });

      await speakReply(payload.reply, { nextStep: "command-complete" });
    } catch (error) {
      commandAbortController = null;

      if (error?.name === "AbortError") {
        updateDebug({
          responseCancelled: true,
          responseCancelledBy: "abort",
          sessionCloseReason: "abort",
        });
        debugLog("voice command cancelled");
        return;
      }

      const errorMessage =
        error instanceof Error && error.message
          ? error.message
          : "Unable to process the voice command.";
      handleApiFailure(errorMessage, "");
      debugLog("error event", {
        type: "exception",
        code: "",
        message: errorMessage,
      });
      await returnToWakeMode({ reason: "command-error" });
    }
  }

  async function startCommandListening({ source = "open-mic", initialCommand = "" } = {}) {
    if (!SpeechRecognitionClass) {
      handleRecognitionFailure("Voice recognition is unavailable in this browser.");
      return;
    }

    if (initialCommand.trim()) {
      await runVoiceCommand(initialCommand.trim(), { source });
      return;
    }

    try {
      await ensureMicrophonePermission();
    } catch {
      handleRecognitionFailure("Error: microphone unavailable");
      return;
    }

    clearTimers();
    stopCommandRecognition();
    stopWakeRecognition();
    stopStopRecognition();
    setPhase(VOICE_PHASES.COMMAND_LISTENING, { wakeModeActive: false });
    updateDebug({
      responseStatus: "listening",
      responseStatusDetails: "Microphone open. Speak normally.",
    });

    const recognition = buildRecognitionInstance({
      continuous: true,
      interimResults: true,
      lang: preferredCommandLanguage,
    });
    if (!recognition) {
      handleRecognitionFailure("Voice recognition is unavailable in this browser.");
      return;
    }

    let hasSubmittedCommand = false;
    let pendingFinalTranscript = "";
    let bestInterimTranscript = "";
    let minimumListenWindowElapsed = false;

    const submitCommandIfReady = (force = false) => {
      if (hasSubmittedCommand) {
        return;
      }
      if (!force && !minimumListenWindowElapsed) {
        return;
      }

      const transcript = pendingFinalTranscript || (force ? bestInterimTranscript : "");
      if (!transcript.trim()) {
        return;
      }

      hasSubmittedCommand = true;
      if (commandSettleTimeoutId) {
        window.clearTimeout(commandSettleTimeoutId);
        commandSettleTimeoutId = null;
      }
      stopCommandRecognition();
      void runVoiceCommand(transcript, { source });
    };

    const scheduleSettleSubmission = () => {
      if (commandSettleTimeoutId) {
        window.clearTimeout(commandSettleTimeoutId);
      }
      if (!minimumListenWindowElapsed || !pendingFinalTranscript.trim()) {
        return;
      }
      commandSettleTimeoutId = window.setTimeout(() => {
        commandSettleTimeoutId = null;
        submitCommandIfReady(false);
      }, COMMAND_SETTLE_DELAY_MS);
    };

    commandRecognition = recognition;
    commandMinWindowTimeoutId = window.setTimeout(() => {
      minimumListenWindowElapsed = true;
      scheduleSettleSubmission();
    }, MIN_COMMAND_LISTEN_WINDOW_MS);
    commandMaxWindowTimeoutId = window.setTimeout(() => {
      submitCommandIfReady(true);
    }, MAX_COMMAND_LISTEN_WINDOW_MS);

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((result) => result?.[0]?.transcript || "")
        .join(" ")
        .trim();

      if (!transcript) {
        return;
      }

      bestInterimTranscript = transcript;
      preferredCommandLanguage = getPreferredRecognitionLanguage(transcript);
      updateDebug({
        currentLanguage: detectDominantLanguage(transcript),
      });
      const latestResult = event.results?.[event.results.length - 1];
      if (latestResult?.isFinal) {
        pendingFinalTranscript = transcript;
        scheduleSettleSubmission();
      }
    };

    recognition.onerror = (event) => {
      stopCommandRecognition();
      if (event?.error === "aborted" && hasSubmittedCommand) {
        return;
      }
      if (event?.error === "no-speech") {
        debugLog("open mic detected no speech");
        void returnToWakeMode({ reason: "no-speech" });
        return;
      }
      const errorMessage = buildRecognitionErrorMessage(event?.error);
      handleRecognitionFailure(errorMessage);
      void returnToWakeMode({ reason: "command-error" });
    };

    recognition.onend = () => {
      commandRecognition = null;
      if (hasSubmittedCommand || voicePhase !== VOICE_PHASES.COMMAND_LISTENING) {
        return;
      }
      submitCommandIfReady(true);
      if (hasSubmittedCommand) {
        return;
      }
      debugLog("open mic session ended without transcript");
      void returnToWakeMode({ reason: "listen-restart" });
    };

    try {
      recognition.start();
    } catch {
      debugLog("duplicate session prevented", { phase: "command-listening" });
      void returnToWakeMode({ reason: "command-restart" });
    }
  }

  async function speakWakeGreetingAndListen({ source = "wake-word" } = {}) {
    setPhase(VOICE_PHASES.ACKNOWLEDGING, { wakeModeActive: false });
    const language = snapshot.debug.currentLanguage || detectDominantLanguage();

    try {
      await activationSound.play();
    } catch {
      // Best-effort only.
    }

    await speakReply(buildWakeGreeting(language), { nextStep: "wake-ack" });

    if (!isStarted || !snapshot.voiceEnabled) {
      return;
    }

    if (voicePhase !== VOICE_PHASES.STOPPED && voicePhase !== VOICE_PHASES.ERROR) {
      await startCommandListening({ source });
    }
  }

  async function startWakeListening({ restartReason = "startup" } = {}) {
    if (
      !isStarted ||
      !snapshot.voiceEnabled ||
      !SpeechRecognitionClass ||
      conversationModeActive ||
      voicePhase === VOICE_PHASES.PROCESSING ||
      voicePhase === VOICE_PHASES.SPEAKING ||
      isRecognitionTransitioning
    ) {
      return;
    }

    clearTimers();
    stopCommandRecognition();
    stopStopRecognition();
    stopWakeRecognition();

    try {
      await ensureMicrophonePermission();
    } catch {
      handleRecognitionFailure("Error: microphone unavailable");
      return;
    }

    const recognition = buildRecognitionInstance({
      continuous: true,
      interimResults: true,
      lang: getPreferredRecognitionLanguage(),
    });
    if (!recognition) {
      handleRecognitionFailure("Wake word recognition is unavailable in this browser.");
      return;
    }

    wakeRecognition = recognition;
    setPhase(VOICE_PHASES.IDLE_WAKE_LISTENING, { wakeModeActive: true });
    updateDebug({
      wakeDetected: false,
      selectedIntent: "",
      selectedTool: "",
      responseStatus: "idle",
    });
    debugLog("wake listener armed", { reason: restartReason });

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((result) => result?.[0]?.transcript || "")
        .join(" ")
        .trim();

      if (!transcriptContainsAnyPhrase(transcript, WAKE_WORDS)) {
        return;
      }

      const inlineCommand = stripWakePhrase(transcript);
      preferredCommandLanguage = getPreferredRecognitionLanguage(transcript);
      const detectedLanguage = detectDominantLanguage(transcript);
      setPhase(VOICE_PHASES.WAKE_DETECTED, { wakeModeActive: false });
      updateDebug({
        wakeDetected: true,
        wakeDetectedAt: formatTimestamp(),
        currentLanguage: detectedLanguage,
      });
      debugLog("wake phrase detected", {
        transcript: normalizeTranscript(transcript).slice(0, 160),
      });

      stopWakeRecognition();
      if (inlineCommand) {
        void startCommandListening({
          source: "wake-inline-command",
          initialCommand: inlineCommand,
        });
        return;
      }

      void speakWakeGreetingAndListen({ source: "wake-word" });
    };

    recognition.onerror = (event) => {
      wakeRecognition = null;
      if (event?.error === "aborted") {
        return;
      }
      const errorMessage = buildRecognitionErrorMessage(event?.error);
      if (event?.error === "not-allowed" || event?.error === "service-not-allowed") {
        handleRecognitionFailure(errorMessage);
        return;
      }
      debugLog("wake listener error", { error: event?.error });
      recognitionRestartTimeoutId = window.setTimeout(() => {
        void startWakeListening({ restartReason: "wake-error" });
      }, RESTART_DELAY_MS);
    };

    recognition.onend = () => {
      wakeRecognition = null;
      if (!isStarted || !snapshot.voiceEnabled || voicePhase !== VOICE_PHASES.IDLE_WAKE_LISTENING) {
        return;
      }
      recognitionRestartTimeoutId = window.setTimeout(() => {
        void startWakeListening({ restartReason: "wake-end" });
      }, RESTART_DELAY_MS);
    };

    try {
      isRecognitionTransitioning = true;
      recognition.start();
      isRecognitionTransitioning = false;
    } catch {
      isRecognitionTransitioning = false;
      debugLog("duplicate session prevented", { phase: "wake-listening" });
      recognitionRestartTimeoutId = window.setTimeout(() => {
        void startWakeListening({ restartReason: "wake-retry" });
      }, RESTART_DELAY_MS);
    }
  }

  async function startStopPhraseListening() {
    if (!SpeechRecognitionClass || snapshot.microphonePermission === "denied") {
      return;
    }

    stopStopRecognition();

    const recognition = buildRecognitionInstance({
      continuous: true,
      interimResults: true,
    });
    if (!recognition) {
      return;
    }

    stopRecognition = recognition;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((result) => result?.[0]?.transcript || "")
        .join(" ")
        .trim();

      if (!transcriptContainsAnyPhrase(transcript, STOP_PHRASES)) {
        return;
      }

      updateDebug({
        responseCancelled: true,
        responseCancelledBy: "stop-phrase",
        sessionCloseReason: "stop-phrase",
      });
      debugLog("stop phrase detected");
      void stopListening({ reason: "stop-phrase" });
    };

    recognition.onerror = () => {
      stopStopRecognition();
    };

    recognition.onend = () => {
      stopRecognition = null;
      if (voicePhase === VOICE_PHASES.SPEAKING) {
        recognitionRestartTimeoutId = window.setTimeout(() => {
          void startStopPhraseListening();
        }, RESTART_DELAY_MS);
      }
    };

    try {
      recognition.start();
    } catch {
      debugLog("duplicate session prevented", { phase: "stop-listening" });
    }
  }

  async function stopListening({ reason = "manual-stop" } = {}) {
    const interruptedDuringSpeech = voicePhase === VOICE_PHASES.SPEAKING;

    setConversationMode(false);
    clearTimers();
    cancelCommandRequest();
    stopAllRecognition();
    cancelSpeech({
      reason,
      markCancelled: interruptedDuringSpeech || reason === "stop-phrase",
    });
    setPhase(VOICE_PHASES.STOPPED, { wakeModeActive: false });
    updateDebug({
      sessionCloseReason: reason,
      sessionCloseBlocked: false,
      responseCancelled:
        interruptedDuringSpeech || reason === "stop-phrase" || snapshot.debug.responseCancelled,
      responseCancelledBy:
        interruptedDuringSpeech || reason === "stop-phrase"
          ? reason
          : snapshot.debug.responseCancelledBy,
      responseStatus:
        interruptedDuringSpeech || reason === "stop-phrase"
          ? "cancelled"
          : snapshot.debug.responseStatus,
    });
    debugLog("session close requested", {
      reason,
      manual: reason !== "stop-phrase",
      responseCancelled: interruptedDuringSpeech || reason === "stop-phrase",
    });

  }

  function handleKeydown(event) {
    if (event.key === "Escape" && snapshot.status !== "idle") {
      event.preventDefault();
      void stopListening({ reason: "escape" });
      return;
    }

    if (event.ctrlKey && event.shiftKey && String(event.key).toLowerCase() === "h") {
      event.preventDefault();
      void activate();
    }
  }

  function handlePageHide() {
    isStarted = false;
    conversationModeActive = false;
    clearTimers();
    cancelCommandRequest();
    stopAllRecognition();
    cancelSpeech({ reason: "pagehide", markCancelled: false });
  }

  async function activate() {
    persistVoiceEnabled(true);
    setConversationMode(true);
    preferredCommandLanguage = getPreferredRecognitionLanguage();
    try {
      await ensureMicrophonePermission();
    } catch {
      setConversationMode(false);
      handleRecognitionFailure("Error: microphone unavailable");
      return;
    }

    clearTimers();
    cancelCommandRequest();
    stopAllRecognition();
    cancelSpeech({ reason: "manual-activate", markCancelled: false });
    await startCommandListening({ source: "manual-conversation" });
  }

  function start() {
    if (isStarted) {
      return;
    }

    isStarted = true;
    updateDebug({
      currentLanguage: detectDominantLanguage(),
    });
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    void fetchDebugConfig();

    if (!snapshot.voiceEnabled) {
      setPhase(VOICE_PHASES.STOPPED, { wakeModeActive: false });
      return;
    }

    if (!SpeechRecognitionClass) {
      setPhase(VOICE_PHASES.STOPPED, {
        wakeModeActive: false,
        errorMessage: "Voice recognition is unavailable in this browser.",
      });
      return;
    }

    void startWakeListening({ restartReason: "startup" });
  }

  function stop() {
    isStarted = false;
    window.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("beforeunload", handlePageHide);
    clearTimers();
    cancelCommandRequest();
    stopAllRecognition();
    cancelSpeech({ reason: "shutdown", markCancelled: false });
    setPhase(VOICE_PHASES.STOPPED, {
      wakeModeActive: false,
      errorMessage: lastErrorMessage,
    });
  }

  return {
    start,
    stop,
    activate,
    setVoiceEnabled(enabled) {
      persistVoiceEnabled(Boolean(enabled));

      if (!enabled) {
        setConversationMode(false);
        clearTimers();
        cancelCommandRequest();
        stopAllRecognition();
        cancelSpeech({ reason: "voice-disabled", markCancelled: false });
        setPhase(VOICE_PHASES.STOPPED, { wakeModeActive: false });
        return;
      }

      if (!isStarted) {
        return;
      }

      void fetchDebugConfig();
      if (conversationModeActive) {
        void startCommandListening({ source: "conversation-resume" });
        return;
      }
      void startWakeListening({ restartReason: "voice-enabled" });
    },
    stopListening,
    subscribe(listener) {
      listeners.add(listener);
      listener({ ...snapshot, debug: { ...snapshot.debug, vad: { ...snapshot.debug.vad } } });
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return { ...snapshot, debug: { ...snapshot.debug, vad: { ...snapshot.debug.vad } } };
    },
  };
}
