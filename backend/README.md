## HALO MIRROR Backend

This backend keeps the existing MQTT sensor pipeline and adds a SQLite-backed calendar and daily todo system for the mobile companion app and mirror dashboard.

### Features

- Existing sensor state API and MQTT ingestion remain available.
- Calendar events are stored persistently in SQLite.
- Daily todo tasks are stored persistently in SQLite.
- Now playing state is stored persistently in SQLite for the mirror music card.
- Write endpoints are protected with `X-API-Key`.
- Read endpoints are public so the mirror dashboard can fetch them without extra auth.
- `GET /api/daily-plan` combines the mirror-ready agenda for a single day.

### Environment setup

1. From the project root, go into the backend folder:

```bash
cd backend
```

2. Create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Copy `.env.example` to `.env` and update values as needed.

`.env.example` is the template.
`.env` is your real local configuration and must not be committed or shared publicly.

Example `.env` values:

```env
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_TOPIC=mirror/sensors
API_HOST=0.0.0.0
API_PORT=5000
HALO_API_KEY=change_me_generate_secure_key
DATABASE_URL=sqlite:///data/halo_mirror.db
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Generate a secure API key

Use Python to generate a strong key:

```bash
python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(32))
PY
```

Set that value in `HALO_API_KEY` inside `backend/.env`.

If `backend/.env` does not exist yet, create it from `.env.example` and paste the generated key there.

### Run the backend

From the `backend` folder:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 5000 --reload
```

On startup the app will:

- load environment variables from `backend/.env`
- create the SQLite database file if it does not exist
- create the required tables automatically
- start the MQTT client without breaking the API if MQTT is unavailable

The SQLite file is created at:

```text
backend/data/halo_mirror.db
```

The default `DATABASE_URL` is:

```text
sqlite:///data/halo_mirror.db
```

This is important because the backend is normally started from inside the `backend` folder.

### Authentication

All write endpoints require:

```http
X-API-Key: <your HALO_API_KEY>
```

Current behavior:

- Public mirror-friendly read endpoints: no API key required
- Create, update, delete, and dev seed endpoints: API key required

If the API key is missing or wrong, protected endpoints return `401`.

### Available endpoints

#### Existing sensor endpoints

- `GET /api/state`
- `GET /api/state/modules`
- `PATCH /api/state/modules`
- `PATCH /api/state/runtime`
- `POST /api/state/refresh`
- `POST /api/test`

#### Calendar endpoints

- `GET /api/calendar`
- `GET /api/calendar/today`
- `POST /api/calendar`
- `PATCH /api/calendar/{event_id}`
- `DELETE /api/calendar/{event_id}`

#### Todo endpoints

- `GET /api/todos`
- `GET /api/todos/today`
- `POST /api/todos`
- `PATCH /api/todos/{todo_id}`
- `DELETE /api/todos/{todo_id}`

#### Daily plan endpoints

- `GET /api/daily-plan`
- `POST /api/dev/seed-calendar`

#### Now playing endpoints

- `GET /api/now-playing`
- `POST /api/now-playing`
- `PATCH /api/now-playing`
- `DELETE /api/now-playing`

### Request examples for the mobile app

#### Create a calendar event

Request body:

```json
{
  "title": "Project Check-in",
  "description": "Sync with the mobile app developer",
  "start_time": "2026-05-03T14:00:00",
  "end_time": "2026-05-03T14:30:00",
  "location": "Google Meet",
  "source": "mobile"
}
```

curl example:

```bash
curl -X POST "http://localhost:5000/api/calendar" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "title": "Project Check-in",
    "description": "Sync with the mobile app developer",
    "start_time": "2026-05-03T14:00:00",
    "end_time": "2026-05-03T14:30:00",
    "location": "Google Meet",
    "source": "mobile"
  }'
```

#### Create a todo

Request body:

```json
{
  "title": "Pick up parcel",
  "description": "Locker closes at 18:00",
  "date": "2026-05-03",
  "due_time": "17:30:00",
  "priority": "high",
  "completed": false,
  "source": "mobile"
}
```

curl example:

```bash
curl -X POST "http://localhost:5000/api/todos" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "title": "Pick up parcel",
    "description": "Locker closes at 18:00",
    "date": "2026-05-03",
    "due_time": "17:30:00",
    "priority": "high",
    "completed": false,
    "source": "mobile"
  }'
```

#### Fetch today's daily plan

curl example:

```bash
curl "http://localhost:5000/api/daily-plan"
```

For a real phone or tablet, do not use `localhost`.
`localhost` on the phone means the phone itself, not your Raspberry Pi or laptop.

Use the Raspberry Pi or laptop LAN IP instead, for example:

```text
http://192.168.1.25:5000/api/daily-plan
```

Example response shape:

```json
{
  "date": "2026-05-03",
  "calendar_events": [],
  "todos": [],
  "completed_todos_count": 0,
  "remaining_todos_count": 0,
  "high_priority_count": 0,
  "next_event": null,
  "next_todo": null
}
```

#### Update now playing

Request body:

```json
{
  "title": "Die With A Smile",
  "artist": "Lady Gaga & Bruno Mars",
  "album": "Single",
  "source": "spotify",
  "is_playing": true,
  "progress_seconds": 42,
  "duration_seconds": 251
}
```

curl example:

```bash
curl -X POST "http://localhost:5000/api/now-playing" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "title": "Die With A Smile",
    "artist": "Lady Gaga & Bruno Mars",
    "album": "Single",
    "source": "spotify",
    "is_playing": true,
    "progress_seconds": 42,
    "duration_seconds": 251
  }'
```

Fetch current playback:

```bash
curl "http://localhost:5000/api/now-playing"
```

### Query parameters

#### `GET /api/calendar`

- `date=YYYY-MM-DD`
- `from=2026-05-03T00:00:00`
- `to=2026-05-03T23:59:59`

#### `GET /api/todos`

- `date=YYYY-MM-DD`
- `completed=true`

#### `GET /api/daily-plan`

- `date=YYYY-MM-DD`

### Notes for the dashboard and mobile app

- Titles cannot be empty.
- Todo `priority` must be `low`, `medium`, or `high`.
- `end_time` cannot be earlier than `start_time`.
- The backend accepts standard JSON date and datetime strings.
- `due_time` can be sent as `17:30` or `17:30:00`.
- `GET /api/daily-plan` is the best single endpoint for the mirror UI.
- From the mobile app, use `http://<RASPBERRY_PI_IP>:5000/...` instead of `http://localhost:5000/...`.
- Keep `backend/.env` private and do not commit it.

### Mobile app reminder

Examples for local desktop testing can use:

```text
http://localhost:5000/api/todos
```

Examples for a real phone on the same Wi-Fi should use:

```text
http://<RASPBERRY_PI_IP>:5000/api/todos
```
