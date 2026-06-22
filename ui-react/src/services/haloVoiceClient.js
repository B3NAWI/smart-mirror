import { createActivationSoundService } from "./activationSound";
import { createHaloVoiceTools } from "./haloVoiceTools";

const REALTIME_API_BASE_URL = "https://api.openai.com/v1/realtime/calls";
const DEFAULT_MODEL = "gpt-realtime-2";
const DEFAULT_IDLE_TIMEOUT_MS = 30000;
const KEYBOARD_SHORTCUT_LABEL = "Ctrl+Shift+H";
const VOICE_ENABLED_STORAGE_KEY = "halo.voice.enabled.v1";
const WAKE_WORDS = ["hi halo"];
const USER_SCOPED_TOOL_NAMES = new Set([
  "route_halo_command",
  "create_calendar_event",
  "list_calendar_events",
  "get_today_plan",
  "get_week_plan",
  "get_month_plan",
  "get_work_tasks",
  "add_reminder",
  "update_reminder",
  "delete_reminder",
  "add_alarm",
  "update_alarm",
  "delete_alarm",
  "get_next_alarm",
  "summarize_user_day",
  "phone_send_notification",
  "phone_create_alarm",
  "phone_sync_plans",
  "phone_send_command_to_mirror",
]);

function createInitialSnapshot() {
  return {
    status: "idle",
    errorMessage: "",
    wakeRecognitionSupported: false,
    shortcutLabel: KEYBOARD_SHORTCUT_LABEL,
    voiceEnabled: false,
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

function transcriptContainsWakeWord(value) {
  const normalized = normalizeTranscript(value);
  if (!normalized) {
    return false;
  }

  return WAKE_WORDS.some((wakeWord) => normalized.includes(wakeWord));
}

function safeParseJson(value) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function parseErrorMessage(response) {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === "string" && payload.detail.trim()) {
      return payload.detail.trim();
    }
  } catch {
    // Ignore JSON parsing failures here.
  }

  if (typeof response.statusText === "string" && response.statusText.trim()) {
    return response.statusText.trim();
  }

  return `Request failed with status ${response.status}`;
}

function hasAudioTrack(stream) {
  return Boolean(stream && stream.getAudioTracks().some((track) => track.readyState === "live"));
}

export function createHaloVoiceClient({
  apiBaseUrl = "",
  apiKey,
  getUserContext = () => ({}),
} = {}) {
  const listeners = new Set();
  const snapshot = createInitialSnapshot();
  const activationSound = createActivationSoundService();
  const haloVoiceTools = createHaloVoiceTools({
    apiBaseUrl,
    apiKey,
    getUserContext,
  });

  const SpeechRecognitionClass =
    typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  let isStarted = false;
  let isConnecting = false;
  let recognition = null;
  let recognitionRestartTimer = null;
  let idleTimer = null;
  let pendingToolExecution = Promise.resolve();
  let audioElement = null;
  let dataChannel = null;
  let peerConnection = null;
  let localStream = null;
  let sessionMetadata = null;
  let shouldResumeWakeRecognition = true;
  let isManualWakeMode = !SpeechRecognitionClass;

  snapshot.wakeRecognitionSupported = Boolean(SpeechRecognitionClass);
  snapshot.voiceEnabled = readPersistedVoiceEnabled();

  function readPersistedVoiceEnabled() {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return window.localStorage.getItem(VOICE_ENABLED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  }

  function persistVoiceEnabled(value) {
    snapshot.voiceEnabled = value;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(VOICE_ENABLED_STORAGE_KEY, value ? "true" : "false");
      } catch {
        // Ignore storage failures and keep working in memory.
      }
    }
  }

  function emit() {
    const nextSnapshot = { ...snapshot };
    listeners.forEach((listener) => listener(nextSnapshot));
  }

  function setStatus(status, errorMessage = "") {
    snapshot.status = status;
    snapshot.errorMessage = errorMessage;
    emit();
  }

  function clearIdleTimer() {
    if (idleTimer) {
      window.clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function scheduleIdleTimeout() {
    clearIdleTimer();
    if (!peerConnection) {
      return;
    }

    const timeoutSeconds = Number(sessionMetadata?.idle_timeout_seconds) || 30;
    idleTimer = window.setTimeout(() => {
      void stopListening();
    }, Math.max(timeoutSeconds * 1000, DEFAULT_IDLE_TIMEOUT_MS));
  }

  function resetActivityTimer() {
    if (peerConnection) {
      scheduleIdleTimeout();
    }
  }

  function stopWakeRecognition({ manualOnly = false } = {}) {
    clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = null;
    isManualWakeMode = manualOnly || !SpeechRecognitionClass;

    if (recognition) {
      try {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.stop();
      } catch {
        // Wake recognition is best-effort only.
      }
      recognition = null;
    }

    snapshot.wakeRecognitionSupported = !isManualWakeMode && Boolean(SpeechRecognitionClass);
    emit();
  }

  function restartWakeRecognitionSoon() {
    clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = window.setTimeout(() => {
      void startWakeRecognition();
    }, 400);
  }

  async function startWakeRecognition() {
    if (
      !isStarted ||
      !snapshot.voiceEnabled ||
      !SpeechRecognitionClass ||
      peerConnection ||
      isConnecting
    ) {
      return;
    }

    stopWakeRecognition();

    try {
      recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang =
        (Array.isArray(navigator.languages) && navigator.languages[0]) ||
        navigator.language ||
        "en-US";

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results || [])
          .map((result) => result?.[0]?.transcript || "")
          .join(" ");

        if (!transcriptContainsWakeWord(transcript)) {
          return;
        }

        void activateVoiceSession({ source: "wake-word" });
      };

      recognition.onerror = (event) => {
        if (event?.error === "not-allowed" || event?.error === "service-not-allowed") {
          stopWakeRecognition({ manualOnly: true });
          return;
        }

        restartWakeRecognitionSoon();
      };

      recognition.onend = () => {
        recognition = null;
        if (
          isStarted &&
          snapshot.voiceEnabled &&
          shouldResumeWakeRecognition &&
          !peerConnection &&
          !isManualWakeMode
        ) {
          restartWakeRecognitionSoon();
        }
      };

      recognition.start();
      shouldResumeWakeRecognition = true;
      isManualWakeMode = false;
      snapshot.wakeRecognitionSupported = true;
      emit();
    } catch {
      stopWakeRecognition({ manualOnly: true });
    }
  }

  async function fetchVoiceSession() {
    const response = await fetch(buildApiUrl(apiBaseUrl, "/api/voice/session"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        client: "mirror",
        output_modality: "audio",
      }),
    });

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    return response.json();
  }

  async function ensureLocalStream() {
    if (hasAudioTrack(localStream)) {
      return localStream;
    }

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    if (!hasAudioTrack(localStream)) {
      throw new Error("Microphone audio is unavailable.");
    }

    return localStream;
  }

  function sendRealtimeEvent(eventPayload) {
    if (!dataChannel || dataChannel.readyState !== "open") {
      return false;
    }

    dataChannel.send(JSON.stringify(eventPayload));
    return true;
  }

  async function executeFunctionCall(call) {
    const toolName = call?.name;
    const callId = call?.call_id;

    if (!toolName || !callId) {
      return;
    }

    let outputPayload;
    try {
      let argumentsPayload = safeParseJson(call.arguments);

      if (USER_SCOPED_TOOL_NAMES.has(toolName) && !argumentsPayload.userId) {
        const fallbackUserId =
          String(getUserContext()?.userId || getUserContext()?.accountId || "").trim() ||
          "mirror-local";
        argumentsPayload = {
          ...argumentsPayload,
          userId: fallbackUserId,
        };
      }

      const result = await haloVoiceTools.executeTool(toolName, argumentsPayload);
      outputPayload = result;
    } catch (error) {
      outputPayload = {
        tool: toolName,
        status: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Tool execution failed.",
      };
    }

    sendRealtimeEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(outputPayload),
      },
    });
  }

  function handleRealtimeMessage(event) {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    if (!payload || typeof payload !== "object") {
      return;
    }

    switch (payload.type) {
      case "input_audio_buffer.speech_started":
        setStatus("listening");
        resetActivityTimer();
        break;
      case "input_audio_buffer.speech_stopped":
        setStatus("thinking");
        resetActivityTimer();
        break;
      case "input_audio_buffer.timeout_triggered":
        void stopListening();
        break;
      case "response.created":
        setStatus("thinking");
        resetActivityTimer();
        break;
      case "response.done": {
        const outputItems = Array.isArray(payload?.response?.output)
          ? payload.response.output
          : [];
        const functionCalls = outputItems.filter((item) => item?.type === "function_call");

        if (!functionCalls.length) {
          if (peerConnection && (!audioElement || audioElement.paused)) {
            setStatus("listening");
          }
          resetActivityTimer();
          break;
        }

        pendingToolExecution = pendingToolExecution.then(async () => {
          setStatus("thinking");
          for (const call of functionCalls) {
            await executeFunctionCall(call);
          }
          sendRealtimeEvent({ type: "response.create" });
          resetActivityTimer();
        });
        break;
      }
      case "error":
        setStatus(
          "error",
          typeof payload?.error?.message === "string"
            ? payload.error.message
            : "Voice session error."
        );
        break;
      default:
        break;
    }
  }

  function attachRemoteAudio(stream) {
    if (!audioElement) {
      audioElement = new Audio();
      audioElement.autoplay = true;
      audioElement.playsInline = true;
      audioElement.onplaying = () => {
        setStatus("speaking");
        resetActivityTimer();
      };
      audioElement.onended = () => {
        if (peerConnection) {
          setStatus("listening");
        }
      };
      audioElement.onpause = () => {
        if (peerConnection) {
          setStatus("listening");
        }
      };
    }

    audioElement.srcObject = stream;
    void audioElement.play().catch(() => {});
  }

  async function closeRealtimeSession({ restartWake = true } = {}) {
    clearIdleTimer();
    isConnecting = false;
    sessionMetadata = null;

    if (recognition) {
      stopWakeRecognition({ manualOnly: isManualWakeMode });
    }

    if (dataChannel) {
      try {
        dataChannel.close();
      } catch {
        // Ignore close errors.
      }
      dataChannel = null;
    }

    if (audioElement) {
      try {
        audioElement.pause();
      } catch {
        // Ignore pause errors.
      }
      audioElement.srcObject = null;
      audioElement = null;
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }

    if (peerConnection) {
      try {
        peerConnection.onconnectionstatechange = null;
        peerConnection.ontrack = null;
        peerConnection.close();
      } catch {
        // Ignore close errors.
      }
      peerConnection = null;
    }

    if (restartWake && isStarted) {
      shouldResumeWakeRecognition = true;
      setStatus("idle");
      if (snapshot.voiceEnabled && !isManualWakeMode) {
        void startWakeRecognition();
      } else {
        emit();
      }
      return;
    }

    shouldResumeWakeRecognition = false;
    setStatus("idle");
  }

  async function activateVoiceSession({ source = "manual" } = {}) {
    if (peerConnection || isConnecting) {
      resetActivityTimer();
      return;
    }

    if (
      typeof window === "undefined" ||
      !window.RTCPeerConnection ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setStatus("error", "Browser audio session support is unavailable.");
      return;
    }

    isConnecting = true;
    shouldResumeWakeRecognition = false;
    persistVoiceEnabled(true);
    stopWakeRecognition({ manualOnly: isManualWakeMode });
    setStatus("listening");
    emit();

    try {
      if (source === "wake-word") {
        await activationSound.play();
      }

      const [voiceSession, toolDefinitions] = await Promise.all([
        fetchVoiceSession(),
        haloVoiceTools.getDefinitions(),
      ]);

      localStream = await ensureLocalStream();

      sessionMetadata = voiceSession?.metadata || null;
      peerConnection = new RTCPeerConnection();
      dataChannel = peerConnection.createDataChannel("oai-events");
      dataChannel.onmessage = handleRealtimeMessage;

      dataChannel.onopen = () => {
        const serverInstructions = String(voiceSession?.metadata?.instructions || "").trim();
        const shortReplyInstruction =
          "Keep spoken answers to one short sentence.";
        const routingInstruction =
          "For mirror questions or commands, call route_halo_command with the user's exact request before answering whenever possible.";
        const nextInstructions = [serverInstructions, routingInstruction, shortReplyInstruction]
          .filter(Boolean)
          .join("\n");

        sendRealtimeEvent({
          type: "session.update",
          session: {
            instructions: nextInstructions,
            tools: toolDefinitions,
            tool_choice: "auto",
          },
        });
        resetActivityTimer();
      };

      peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams || [];
        if (remoteStream) {
          attachRemoteAudio(remoteStream);
          return;
        }

        attachRemoteAudio(new MediaStream([event.track]));
      };

      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection?.connectionState;
        if (state === "failed" || state === "disconnected" || state === "closed") {
          void closeRealtimeSession({ restartWake: true });
        }
      };

      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
      });
      await peerConnection.setLocalDescription(offer);

      const realtimeResponse = await fetch(
        `${REALTIME_API_BASE_URL}?model=${encodeURIComponent(
          voiceSession?.metadata?.model || DEFAULT_MODEL
        )}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${voiceSession.client_secret.value}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        }
      );

      if (!realtimeResponse.ok) {
        throw new Error(await parseErrorMessage(realtimeResponse));
      }

      const answerSdp = await realtimeResponse.text();
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });

      isConnecting = false;
      setStatus("listening");
      resetActivityTimer();
    } catch (error) {
      await closeRealtimeSession({ restartWake: true });
      setStatus(
        "error",
        error instanceof Error && error.message
          ? error.message
          : "Unable to start Halo voice."
      );
    }
  }

  async function stopListening() {
    await closeRealtimeSession({ restartWake: true });
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && (peerConnection || isConnecting)) {
      event.preventDefault();
      void stopListening();
      return;
    }

    if (event.ctrlKey && event.shiftKey && String(event.key).toLowerCase() === "h") {
      event.preventDefault();
      void activateVoiceSession({ source: "manual" });
    }
  }

  function handlePageHide() {
    void closeRealtimeSession({ restartWake: false });
  }

  function start() {
    if (isStarted) {
      return;
    }

    isStarted = true;
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    if (snapshot.voiceEnabled && SpeechRecognitionClass) {
      void startWakeRecognition();
      return;
    }

    emit();
  }

  function stop() {
    isStarted = false;
    window.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("beforeunload", handlePageHide);
    stopWakeRecognition({ manualOnly: !SpeechRecognitionClass });
    void closeRealtimeSession({ restartWake: false });
  }

  return {
    start,
    stop,
    activate() {
      return activateVoiceSession({ source: "manual" });
    },
    setVoiceEnabled(enabled) {
      persistVoiceEnabled(Boolean(enabled));
      if (!enabled) {
        stopWakeRecognition({ manualOnly: !SpeechRecognitionClass });
        void closeRealtimeSession({ restartWake: false });
        emit();
        return;
      }

      if (isStarted && SpeechRecognitionClass && !peerConnection && !isConnecting) {
        void startWakeRecognition();
      }
      emit();
    },
    stopListening,
    subscribe(listener) {
      listeners.add(listener);
      listener({ ...snapshot });
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return { ...snapshot };
    },
  };
}
