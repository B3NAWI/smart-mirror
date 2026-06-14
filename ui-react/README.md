# HALO MIRROR Frontend

The mirror frontend is a Vite + React dashboard that talks to the HALO backend for mirror state, planner/reminder data, planner-backed alarms, media state, and Halo voice session/tool coordination.

## Required frontend environment variables

Create `ui-react/.env` from `ui-react/.env.example`.

Used by the mirror frontend:

- `VITE_BACKEND_URL`
- `VITE_BACKEND_API_KEY`
- `VITE_SPOTIFY_CLIENT_ID`
- `VITE_SPOTIFY_REDIRECT_URI`
- `VITE_API_PROXY_TARGET`

Notes:

- `VITE_BACKEND_API_KEY` is the HALO backend key, not the OpenAI key
- `OPENAI_API_KEY` must never be added here
- the voice client gets ephemeral Realtime credentials from `POST /api/voice/session`

## Run locally

From `smart-mirror/ui-react`:

```bash
npm install
npm run dev
```

Default Vite URL:

```text
http://localhost:5173
```

## Voice section

The mirror UI currently:

- requests ephemeral Realtime credentials from `POST /api/voice/session`
- reads backend-defined safe tools from `GET /api/voice/tools`
- executes actions through `POST /api/voice/tools/execute`
- never includes `OPENAI_API_KEY` in the browser bundle

Wake words:

- `Halo`
- `Halo Mirror`
- `هالو`
- `هالو ميرور`

Manual fallback:

- click the floating voice control
- press `Ctrl+Shift+H`
- press `Esc` or the stop action to end the session

## Microphone permission behavior

The frontend is wired to avoid repeated prompts on every render:

- microphone permission is requested only when Halo voice is enabled for the first time
- local consent state is stored in browser storage
- existing streams are reused where possible
- tracks are stopped when voice is disabled or the session ends

If Chromium still asks again later, that is controlled by browser or OS permission policy.

To reset browser microphone permission:

1. Open site settings for the mirror origin.
2. Change Microphone to `Ask` or `Block`.
3. Reload the page.
4. Allow access again when you re-enable voice.

## Raspberry Pi kiosk notes

The frontend can run in Chromium kiosk mode. Example:

```bash
chromium-browser --kiosk --incognito --noerrdialogs --disable-infobars http://127.0.0.1:5173
```

If wake-word detection is limited in kiosk mode:

- launch Chromium normally once
- allow microphone permission
- then return to kiosk mode

## Gesture camera

The frontend also supports:

- live browser camera preview in the Sensors card
- swipe detection through the existing gesture camera flow
- runtime updates through `PATCH /api/state/runtime`

## Build and lint

From `smart-mirror/ui-react`:

```bash
npm run lint
npm run build
```

## Known limitations

- browser wake-word detection depends on `SpeechRecognition` support
- Chromium kiosk wake-word detection may need manual activation
- Arabic wake-word detection is best-effort because it depends on the browser speech engine
- voice alarm commands use the shared planner-backed alarm flow, so repeating alarms are still limited

## More documentation

See [docs/VOICE_ASSISTANT.md](../../docs/VOICE_ASSISTANT.md) for full setup, kiosk notes, app/mirror sync behavior, emulator guidance, manual test steps, and troubleshooting.
