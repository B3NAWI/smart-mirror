function normalizeYouTubeUrl(rawUrl) {
  if (!rawUrl) {
    return "";
  }

  const text = String(rawUrl).trim();
  if (!text) {
    return "";
  }

  const intentMatch = text.match(
    /(?:intent:\/\/)?(?:m\.|music\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/i
  );
  if (intentMatch?.[1]) {
    return `https://www.youtube.com/watch?v=${intentMatch[1]}`;
  }

  const shortMatch = text.match(/youtu\.be\/([A-Za-z0-9_-]{11})/i);
  if (shortMatch?.[1]) {
    return `https://www.youtube.com/watch?v=${shortMatch[1]}`;
  }

  return text;
}

function extractVideoIdFromUrl(rawUrl) {
  if (!rawUrl) {
    return "";
  }

  const text = normalizeYouTubeUrl(rawUrl);
  if (!text) {
    return "";
  }

  const directMatch = text.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})/i
  );
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  try {
    const url = new URL(text);
    const hostname = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

    if (hostname === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] || "";
    }

    if (hostname === "youtube.com") {
      const watchId = url.searchParams.get("v");
      if (watchId) {
        return watchId;
      }

      const segments = url.pathname.split("/").filter(Boolean);
      const typedSegment = segments[1];
      if (
        ["embed", "shorts", "live", "v"].includes(segments[0]) &&
        typedSegment
      ) {
        return typedSegment;
      }
    }
  } catch {
    return "";
  }

  return "";
}

export function extractYouTubeVideoId(rawUrl) {
  const value = extractVideoIdFromUrl(rawUrl);
  return /^[A-Za-z0-9_-]{11}$/.test(value) ? value : "";
}

export function buildYouTubeEmbedUrl(rawUrl) {
  const videoId = extractYouTubeVideoId(rawUrl);
  if (!videoId) {
    return "";
  }

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  const params = new URLSearchParams({
    autoplay: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    enablejsapi: "1",
    origin,
  });

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function buildSpotifyUri(rawUrl) {
  if (!rawUrl) {
    return "";
  }

  const text = String(rawUrl).trim();
  if (!text) {
    return "";
  }

  if (text.startsWith("spotify:")) {
    return text;
  }

  try {
    const url = new URL(text);
    const hostname = url.hostname.replace(/^www\./, "");
    if (hostname !== "open.spotify.com" && hostname !== "play.spotify.com") {
      return "";
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) {
      return "";
    }

    const allowedTypes = ["track", "album", "playlist", "artist", "episode", "show"];
    const typeIndex = segments.findIndex((segment) => allowedTypes.includes(segment));
    if (typeIndex < 0 || typeIndex + 1 >= segments.length) {
      return "";
    }

    const type = segments[typeIndex];
    const id = segments[typeIndex + 1];
    return `spotify:${type}:${id}`;
  } catch {
    return "";
  }
}

export function buildSpotifyEmbedUrl(rawUrl) {
  const uri = buildSpotifyUri(rawUrl);
  if (!uri) {
    return "";
  }

  const parts = uri.split(":");
  if (parts.length < 3) {
    return "";
  }

  const [, type, id] = parts;
  const params = new URLSearchParams({
    utm_source: "generator",
    theme: "0",
  });
  return `https://open.spotify.com/embed/${type}/${id}?${params.toString()}`;
}
