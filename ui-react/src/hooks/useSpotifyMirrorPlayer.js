import { useEffect, useRef, useState } from "react";
import { buildSpotifyUri } from "../utils/mediaEmbed";

const SPOTIFY_CLIENT_ID = (import.meta.env.VITE_SPOTIFY_CLIENT_ID || "").trim();
const SPOTIFY_REDIRECT_URI = (import.meta.env.VITE_SPOTIFY_REDIRECT_URI || "").trim();
const TOKEN_STORAGE_KEY = "halo.spotify.tokens.v1";
const PKCE_STATE_KEY = "halo.spotify.pkce.state.v1";
const PKCE_VERIFIER_KEY = "halo.spotify.pkce.verifier.v1";
const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
];

let spotifySdkPromise = null;

function getRedirectUri() {
  if (SPOTIFY_REDIRECT_URI) {
    return SPOTIFY_REDIRECT_URI;
  }
  if (typeof window === "undefined") {
    return "";
  }
  return `${window.location.origin}${window.location.pathname}`;
}

function randomString(length = 64) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  return window.crypto.subtle.digest("SHA-256", data);
}

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function buildPkceChallenge(verifier) {
  const digest = await sha256(verifier);
  return base64UrlEncode(digest);
}

function loadStoredTokens() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  if (typeof window === "undefined") {
    return;
  }

  if (!tokens) {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

async function exchangeSpotifyCode({ code, verifier }) {
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: verifier,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error("Spotify authorization failed.");
  }

  const payload = await response.json();
  return {
    accessToken: payload.access_token || "",
    refreshToken: payload.refresh_token || "",
    expiresAt: Date.now() + Math.max((payload.expires_in || 3600) - 60, 60) * 1000,
  };
}

async function refreshSpotifyToken(refreshToken) {
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error("Spotify token refresh failed.");
  }

  const payload = await response.json();
  return {
    accessToken: payload.access_token || "",
    refreshToken: payload.refresh_token || refreshToken,
    expiresAt: Date.now() + Math.max((payload.expires_in || 3600) - 60, 60) * 1000,
  };
}

async function getFreshSpotifyTokens() {
  const stored = loadStoredTokens();
  if (!stored?.refreshToken) {
    return stored;
  }

  if (stored.expiresAt && stored.expiresAt > Date.now()) {
    return stored;
  }

  const refreshed = await refreshSpotifyToken(stored.refreshToken);
  saveTokens(refreshed);
  return refreshed;
}

function loadSpotifySdk() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Spotify SDK requires a browser."));
  }

  if (window.Spotify?.Player) {
    return Promise.resolve(window.Spotify);
  }

  if (spotifySdkPromise) {
    return spotifySdkPromise;
  }

  spotifySdkPromise = new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify);

    const existing = document.querySelector('script[data-spotify-sdk="true"]');
    if (existing) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.dataset.spotifySdk = "true";
    script.onerror = () => reject(new Error("Spotify SDK failed to load."));
    document.body.appendChild(script);
  });

  return spotifySdkPromise;
}

async function spotifyWebApiRequest(path, { method = "GET", token, body, query } = {}) {
  const url = new URL(`https://api.spotify.com/v1${path}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value != null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    throw new Error(text || `Spotify API request failed (${response.status}).`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function transferSpotifyPlayback(token, deviceId, play = false) {
  return spotifyWebApiRequest("/me/player", {
    method: "PUT",
    token,
    body: {
      device_ids: [deviceId],
      play,
    },
  });
}

async function getSpotifyDevices(token) {
  const payload = await spotifyWebApiRequest("/me/player/devices", {
    method: "GET",
    token,
  });
  return Array.isArray(payload?.devices) ? payload.devices : [];
}

async function waitForSpotifyDevice(token, deviceId, attempts = 8, delayMs = 350) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const devices = await getSpotifyDevices(token);
    const match = devices.find((device) => device?.id === deviceId);
    if (match) {
      return match;
    }
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }
  return null;
}

async function startSpotifyPlaybackOnDevice({ token, deviceId, spotifyUri }) {
  const isTrackLike = spotifyUri.startsWith("spotify:track:") || spotifyUri.startsWith("spotify:episode:");
  const body = isTrackLike ? { uris: [spotifyUri] } : { context_uri: spotifyUri };
  const playAttempts = [
    async () =>
      spotifyWebApiRequest("/me/player/play", {
        method: "PUT",
        token,
        query: { device_id: deviceId },
        body,
      }),
    async () =>
      spotifyWebApiRequest("/me/player/play", {
        method: "PUT",
        token,
        body,
      }),
  ];

  let lastError = null;
  for (const attempt of playAttempts) {
    try {
      await attempt();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
  }

  throw lastError || new Error("Spotify playback could not start.");
}

function trackToArtwork(track) {
  return track?.album?.images?.[0]?.url || "";
}

export default function useSpotifyMirrorPlayer({ enabled, trackUrl, gestureCommand }) {
  const playerRef = useRef(null);
  const deviceIdRef = useRef("");
  const currentUriRef = useRef("");
  const gestureIdRef = useRef("");
  const activationBoundRef = useRef(false);
  const [authState, setAuthState] = useState({
    ready: false,
    connected: false,
    missingClientId: !SPOTIFY_CLIENT_ID,
    error: "",
  });
  const [playbackState, setPlaybackState] = useState({
    title: "",
    artist: "",
    artworkUrl: "",
    uri: "",
    isPlaying: false,
    volume: 80,
  });
  const [lastRequestedUri, setLastRequestedUri] = useState("");

  const spotifyUri = enabled ? buildSpotifyUri(trackUrl || "") : "";

  const connectSpotify = async () => {
    if (!SPOTIFY_CLIENT_ID || typeof window === "undefined") {
      setAuthState((current) => ({
        ...current,
        missingClientId: true,
        error: "Spotify client ID is missing.",
      }));
      return;
    }

    const verifier = randomString(96);
    const state = randomString(24);
    const challenge = await buildPkceChallenge(verifier);
    window.localStorage.setItem(PKCE_VERIFIER_KEY, verifier);
    window.localStorage.setItem(PKCE_STATE_KEY, state);

    const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
    authorizeUrl.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", getRedirectUri());
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("scope", SPOTIFY_SCOPES.join(" "));
    authorizeUrl.searchParams.set("state", state);
    window.location.assign(authorizeUrl.toString());
  };

  useEffect(() => {
    if (typeof window === "undefined" || !SPOTIFY_CLIENT_ID) {
      return;
    }

    const finishAuth = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const storedState = window.localStorage.getItem(PKCE_STATE_KEY);
      const verifier = window.localStorage.getItem(PKCE_VERIFIER_KEY);

      if (!code || !state || !verifier || state !== storedState) {
        return;
      }

      try {
        const tokens = await exchangeSpotifyCode({ code, verifier });
        saveTokens(tokens);
        url.searchParams.delete("code");
        url.searchParams.delete("state");
        url.searchParams.delete("error");
        window.history.replaceState({}, document.title, url.toString());
        window.localStorage.removeItem(PKCE_STATE_KEY);
        window.localStorage.removeItem(PKCE_VERIFIER_KEY);
        setAuthState((current) => ({
          ...current,
          connected: true,
          error: "",
        }));
      } catch (error) {
        setAuthState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "Spotify login failed.",
        }));
      }
    };

    void finishAuth();
  }, []);

  useEffect(() => {
    if (!enabled || !SPOTIFY_CLIENT_ID) {
      return undefined;
    }

    let cancelled = false;
    let removeActivation = null;

    const setupPlayer = async () => {
      try {
        const tokens = await getFreshSpotifyTokens();
        if (!tokens?.accessToken) {
          setAuthState((current) => ({
            ...current,
            ready: false,
            connected: false,
          }));
          return;
        }

        const Spotify = await loadSpotifySdk();
        if (cancelled || playerRef.current) {
          return;
        }

        const player = new Spotify.Player({
          name: "HALO Mirror Spotify",
          getOAuthToken: async (callback) => {
            const fresh = await getFreshSpotifyTokens();
            callback(fresh?.accessToken || "");
          },
          volume: 0.8,
        });

        player.addListener("ready", ({ device_id: deviceId }) => {
          deviceIdRef.current = deviceId;
          setAuthState((current) => ({
            ...current,
            ready: true,
            connected: true,
            error: "",
          }));

          if (!activationBoundRef.current) {
            const activate = () => {
              player.activateElement?.();
              window.removeEventListener("click", activate);
              window.removeEventListener("touchstart", activate);
              window.removeEventListener("keydown", activate);
              activationBoundRef.current = false;
            };
            window.addEventListener("click", activate, { once: true });
            window.addEventListener("touchstart", activate, { once: true });
            window.addEventListener("keydown", activate, { once: true });
            activationBoundRef.current = true;
            removeActivation = activate;
          }

          void (async () => {
            try {
              const fresh = await getFreshSpotifyTokens();
              if (!fresh?.accessToken) {
                return;
              }
              await transferSpotifyPlayback(fresh.accessToken, deviceId, false);
            } catch {
              // Best-effort transfer; selection playback will retry with a play request later.
            }
          })();
        });

        player.addListener("autoplay_failed", () => {
          setAuthState((current) => ({
            ...current,
            error: "Spotify autoplay was blocked. Reconnect Spotify or interact with the page once.",
          }));
        });

        player.addListener("authentication_error", ({ message }) => {
          setAuthState((current) => ({
            ...current,
            ready: false,
            connected: false,
            error: message || "Spotify authentication failed.",
          }));
          saveTokens(null);
        });

        player.addListener("account_error", ({ message }) => {
          setAuthState((current) => ({
            ...current,
            error: message || "Spotify Premium is required for mirror playback.",
          }));
        });

        player.addListener("playback_error", ({ message }) => {
          setAuthState((current) => ({
            ...current,
            error: message || "Spotify playback failed.",
          }));
        });

        player.addListener("player_state_changed", async (state) => {
          if (!state) {
            return;
          }

          const currentTrack = state.track_window?.current_track;
          const artistNames = currentTrack?.artists?.map((artist) => artist.name).join(", ") || "";
          currentUriRef.current = currentTrack?.uri || "";
          let level = playbackState.volume;
          try {
            level = Math.round((await player.getVolume()) * 100);
          } catch {
            // keep last known level
          }
          setPlaybackState({
            title: currentTrack?.name || "",
            artist: artistNames,
            artworkUrl: trackToArtwork(currentTrack),
            uri: currentTrack?.uri || "",
            isPlaying: !state.paused,
            volume: level,
          });
        });

        const connected = await player.connect();
        if (!connected && !cancelled) {
          setAuthState((current) => ({
            ...current,
            error: "Spotify player could not connect.",
          }));
        }
        playerRef.current = player;
      } catch (error) {
        if (!cancelled) {
          setAuthState((current) => ({
            ...current,
            error: error instanceof Error ? error.message : "Spotify setup failed.",
          }));
        }
      }
    };

    void setupPlayer();

    return () => {
      cancelled = true;
      if (typeof removeActivation === "function") {
        window.removeEventListener("click", removeActivation);
        window.removeEventListener("touchstart", removeActivation);
        window.removeEventListener("keydown", removeActivation);
      }
      playerRef.current?.disconnect?.();
      playerRef.current = null;
      deviceIdRef.current = "";
      currentUriRef.current = "";
      activationBoundRef.current = false;
      setAuthState((current) => ({
        ...current,
        ready: false,
      }));
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !spotifyUri || !playerRef.current || !deviceIdRef.current || !authState.ready) {
      return;
    }

    let cancelled = false;

    const startSpotifySelection = async () => {
      try {
        const tokens = await getFreshSpotifyTokens();
        if (!tokens?.accessToken || cancelled) {
          return;
        }

        setLastRequestedUri(spotifyUri);
        const device = await waitForSpotifyDevice(tokens.accessToken, deviceIdRef.current);
        if (!device) {
          throw new Error("Spotify mirror device is not available yet.");
        }

        await transferSpotifyPlayback(tokens.accessToken, deviceIdRef.current, false);
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        await startSpotifyPlaybackOnDevice({
          token: tokens.accessToken,
          deviceId: deviceIdRef.current,
          spotifyUri,
        });
        currentUriRef.current = spotifyUri;
        setAuthState((current) => ({
          ...current,
          error: "",
        }));
      } catch (error) {
        if (!cancelled) {
          setAuthState((current) => ({
            ...current,
            error: error instanceof Error ? error.message : "Spotify could not start playback.",
          }));
        }
      }
    };

    void startSpotifySelection();

    return () => {
      cancelled = true;
    };
  }, [enabled, spotifyUri, authState.ready]);

  useEffect(() => {
    if (!gestureCommand?.id || gestureIdRef.current === gestureCommand.id || !playerRef.current) {
      return;
    }

    gestureIdRef.current = gestureCommand.id;

    const handleGesture = async () => {
      try {
        if (gestureCommand.action === "history_previous" || gestureCommand.action === "history_next") {
          const nextUri = buildSpotifyUri(gestureCommand.trackUrl || "");
          if (nextUri && nextUri !== currentUriRef.current) {
            const tokens = await getFreshSpotifyTokens();
            if (!tokens?.accessToken || !deviceIdRef.current) {
              return;
            }
            setLastRequestedUri(nextUri);
            const device = await waitForSpotifyDevice(tokens.accessToken, deviceIdRef.current);
            if (!device) {
              throw new Error("Spotify mirror device is not available yet.");
            }
            await transferSpotifyPlayback(tokens.accessToken, deviceIdRef.current, false);
            await new Promise((resolve) => window.setTimeout(resolve, 650));
            await startSpotifyPlaybackOnDevice({
              token: tokens.accessToken,
              deviceId: deviceIdRef.current,
              spotifyUri: nextUri,
            });
            currentUriRef.current = nextUri;
            return;
          }

          if (gestureCommand.action === "history_previous") {
            await playerRef.current.previousTrack?.();
          } else {
            await playerRef.current.nextTrack?.();
          }
          return;
        }

        if (gestureCommand.action === "volume_up" || gestureCommand.action === "volume_down") {
          const currentVolume = await playerRef.current.getVolume();
          const delta = gestureCommand.action === "volume_up" ? 0.5 : -0.5;
          const nextVolume = Math.min(Math.max(currentVolume + delta, 0), 1);
          await playerRef.current.setVolume(nextVolume);
          setPlaybackState((current) => ({
            ...current,
            volume: Math.round(nextVolume * 100),
          }));
        }
      } catch (error) {
        setAuthState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "Spotify gesture control failed.",
        }));
      }
    };

    void handleGesture();
  }, [gestureCommand]);

  return {
    authState,
    playbackState,
    spotifyUri,
    lastRequestedUri,
    connectSpotify,
  };
}
