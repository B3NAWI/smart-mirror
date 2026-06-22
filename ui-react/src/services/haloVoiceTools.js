const USER_SCOPED_TOOLS = new Set([
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

const DEFAULT_SOURCE_TOOLS = new Set([
  "add_reminder",
  "add_alarm",
]);

function buildApiUrl(apiBaseUrl, path) {
  return `${apiBaseUrl}${path}`;
}

function buildHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };
}

async function parseErrorMessage(response) {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === "string" && payload.detail.trim()) {
      return payload.detail.trim();
    }
  } catch {
    // Ignore JSON parsing errors and fall back to status text.
  }

  if (typeof response.statusText === "string" && response.statusText.trim()) {
    return response.statusText.trim();
  }

  return `Request failed with status ${response.status}`;
}

function injectToolDefaults(toolName, argumentsPayload, userContext) {
  const nextArguments = { ...(argumentsPayload || {}) };
  const fallbackUserId =
    String(userContext?.userId || userContext?.accountId || "").trim() || "mirror-local";

  if (USER_SCOPED_TOOLS.has(toolName) && !nextArguments.userId) {
    nextArguments.userId = fallbackUserId;
  }

  if (DEFAULT_SOURCE_TOOLS.has(toolName) && !nextArguments.source) {
    nextArguments.source = "voice";
  }

  return nextArguments;
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

export function createHaloVoiceTools({
  apiBaseUrl = "",
  apiKey,
  getUserContext = () => ({}),
} = {}) {
  let cachedDefinitions = null;

  async function getDefinitions() {
    if (cachedDefinitions) {
      return cachedDefinitions;
    }

    const response = await fetch(buildApiUrl(apiBaseUrl, "/api/voice/tools"), {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    const payload = await response.json();
    cachedDefinitions = Array.isArray(payload?.tools) ? payload.tools : [];
    return cachedDefinitions;
  }

  async function executeTool(toolName, argumentsPayload = {}) {
    const normalizedArguments = injectToolDefaults(
      toolName,
      argumentsPayload,
      getUserContext()
    );

    const response = await fetch(buildApiUrl(apiBaseUrl, "/api/voice/tools/execute"), {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify({
        tool: toolName,
        arguments: normalizedArguments,
      }),
    });

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    const result = await response.json();
    dispatchVoiceToolEvent({
      tool: toolName,
      arguments: normalizedArguments,
      result,
    });
    return result;
  }

  return {
    executeTool,
    getDefinitions,
    invalidateDefinitions() {
      cachedDefinitions = null;
    },
  };
}
