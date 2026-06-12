# HALO MIRROR Frontend

## Environment

The mirror UI reads from the backend with:

- `VITE_BACKEND_URL`
- `VITE_SPOTIFY_CLIENT_ID`

For gesture-camera runtime updates, it can also write the detected swipe back to the backend with:

- `VITE_BACKEND_API_KEY`

If `VITE_BACKEND_API_KEY` is not set, the frontend falls back to `halo-local-dev-key`, which matches the mobile app's local development default.

## Spotify Premium playback

To let the mirror website become a real Spotify player instead of a simple embed, add:

- `VITE_SPOTIFY_CLIENT_ID`

Then add your mirror website URL as a Spotify redirect URI in the Spotify developer dashboard, for example:

- `http://localhost:5173`
- `http://192.168.1.xxx:5173`

## Gesture camera

The mirror website now includes:

- a live browser camera preview in the Sensors card
- MediaPipe hand tracking for swipe detection
- shared `gesture` state updates through `PATCH /api/state/runtime`

Turn it on from the Android app's mirror settings with the `Gesture camera` switch.
