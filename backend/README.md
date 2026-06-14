## HALO MIRROR Backend

The backend is the single source of truth for HALO MIRROR voice coordination, mirror state, reminders, planner data, planner-backed alarms, media state, and Realtime session brokering.

### What it does

- stores calendar, planner, todo/reminder, and now-playing data in SQLite
- exposes mirror-friendly read APIs
- protects write APIs with `X-API-Key`
- creates short-lived OpenAI Realtime client secrets with `POST /api/voice/session`
- executes safe allowlisted voice tools with `GET /api/voice/tools` and `POST /api/voice/tools/execute`
- keeps `OPENAI_API_KEY` on the server only

### Required environment variables

Copy `.env.example` to `.env` in the `backend` folder.

Required for normal operation:

- `HALO_API_KEY`
- `DATABASE_URL`
- `API_HOST`
- `API_PORT`

Required for voice:

- `OPENAI_API_KEY`
- `OPENAI_REALTIME_MODEL`
- `HALO_VOICE_ENABLED`
- `HALO_MAX_INPUT_TOKENS`
- `HALO_MAX_OUTPUT_TOKENS`
- `HALO_VOICE_REASONING_EFFORT`
- `HALO_WAKE_WORDS`
- `HALO_VOICE_IDLE_TIMEOUT_SECONDS`
- `HALO_VOICE_SESSION_TIMEOUT_SECONDS`

Optional:

- `MQTT_HOST`
- `MQTT_PORT`
- `MQTT_TOPIC`
- `ALLOWED_ORIGINS`

### Add `OPENAI_API_KEY`

1. Open `backend/.env`.
2. Set `OPENAI_API_KEY=YOUR_REAL_OPENAI_SERVER_KEY`.
3. Restart the backend.
4. Never copy that key into the mirror frontend or Android app.

### Enable or disable voice

- enable: `HALO_VOICE_ENABLED=true`
- disable: `HALO_VOICE_ENABLED=false`

When disabled, `POST /api/voice/session` returns `503`.

### Install and run

From `smart-mirror/backend`:

```bash
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 5000 --reload
```

macOS/Linux:

```bash
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 5000 --reload
```

### Health and startup logs

Useful endpoints:

- `GET /api/health`
- `GET /api/state`

Startup logs report:

- backend started
- database connected
- MQTT connected or fallback mode
- voice enabled or disabled
- OpenAI key configured or missing

The backend does not print the actual OpenAI key.

### Authentication

Protected endpoints require:

```http
X-API-Key: <HALO_API_KEY>
```

This includes:

- write endpoints
- `POST /api/voice/session`
- `GET /api/voice/tools`
- `POST /api/voice/tools/execute`

### Key endpoints

- `GET /api/health`
- `GET /api/state`
- `PATCH /api/state/modules`
- `PATCH /api/state/runtime`
- `POST /api/state/refresh`
- `GET /api/calendar`
- `POST /api/calendar`
- `PATCH /api/calendar/{event_id}`
- `DELETE /api/calendar/{event_id}`
- `GET /api/todos`
- `POST /api/todos`
- `PATCH /api/todos/{todo_id}`
- `DELETE /api/todos/{todo_id}`
- `GET /api/planner/plans`
- `POST /api/planner/plans`
- `PATCH /api/planner/plans/{plan_id}/segments/{segment_id}`
- `DELETE /api/planner/plans/{plan_id}`
- `GET /api/now-playing`
- `POST /api/now-playing`
- `POST /api/voice/session`
- `GET /api/voice/tools`
- `POST /api/voice/tools/execute`

### Voice and app sync notes

- the mirror frontend asks this backend for ephemeral Realtime credentials
- the mirror frontend sends tool calls back through this backend
- `HaloMirrorApp` writes reminders and plans to this same backend
- app quick alarms and voice alarms both use the shared planner-backed alarm flow
- mirror commands use the same safe tool layer instead of a second command system
- backend phone push is still not configured
- the current Android placeholder/fallback is the local `HaloMirrorCoordinationNotifier`

### Security notes

- `OPENAI_API_KEY` stays in `backend/.env`
- the browser only receives short-lived Realtime client secrets
- voice session creation and voice tool execution are rate-limited in memory
- safe tool handlers validate input server-side
- mirror screen names and phone-to-mirror commands are allowlisted
- no arbitrary shell commands, arbitrary code execution, or arbitrary URL execution exist in the voice layer
- raw speech should not be logged

### Cost control notes

- keep `HALO_MAX_OUTPUT_TOKENS` low
- keep `HALO_VOICE_REASONING_EFFORT=low` unless needed
- use wake-word or manual activation instead of always-on paid loops
- turn voice off with `HALO_VOICE_ENABLED=false` when not testing

### More documentation

See [docs/VOICE_ASSISTANT.md](../../docs/VOICE_ASSISTANT.md) for the cross-project setup, Raspberry Pi kiosk notes, microphone behavior, emulator guidance, sync verification notes, and troubleshooting.
