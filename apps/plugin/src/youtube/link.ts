/** YouTube's video ids: 11 characters of URL-safe base64. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const WATCH_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

/** Paths that carry the id as their second segment: `/shorts/<id>`, … */
const ID_PATHS = new Set(["shorts", "embed", "live"]);

/**
 * The video a Request links to, or `undefined` when the Request is not one
 * YouTube link — search words, another site, a playlist. The whole Request
 * must be the link: words around it are search words, which need the API Key
 * (ADR-0005).
 */
export function videoIdOf(request: string): string | undefined {
  const text = request.trim();

  if (!text || /\s/.test(text)) {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return undefined;
  }

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  let id: string | null | undefined;

  if (host === "youtu.be") {
    id = segments[0];
  } else if (WATCH_HOSTS.has(host)) {
    if (segments[0] === "watch") {
      id = url.searchParams.get("v");
    } else if (ID_PATHS.has(segments[0] ?? "")) {
      id = segments[1];
    }
  }

  return id && VIDEO_ID.test(id) ? id : undefined;
}
