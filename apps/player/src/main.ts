import {
  isSidecarMessage,
  REPLACED_CLOSE_CODE,
  type PageMessage,
} from "song-requests-protocol";

/**
 * The Player Page: YouTube's IFrame Player and nothing else in view
 * (ADR-0001). It does only what the sidecar says — load a video, which plays
 * at once — and reports how that went. The Song Queue lives in the sidecar.
 */

const ENDED = 0;
const RECONNECT_MS = { first: 1_000, max: 10_000 };

const key = new URLSearchParams(location.search).get("key") ?? "";
const note = document.getElementById("note")!;

let socket: WebSocket | undefined;
let player: YT.Player | undefined;
let apiReady = false;
/** The player answers calls only once its own `onReady` has fired. */
let playerReady = false;
/** The Song the page plays, or is about to once the API has loaded. */
let current: { songId: string; videoId: string } | undefined;

function send(message: PageMessage): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function load(songId: string, videoId: string): void {
  current = { songId, videoId };
  if (!apiReady) return;

  if (player) {
    if (playerReady) player.loadVideoById(videoId);
    return;
  }

  // No `origin` parameter: what YouTube checks is the page's host, which is
  // `localhost` — never an IP address, which it refuses (spike #3).
  player = new YT.Player("player", {
    width: "100%",
    height: "100%",
    playerVars: { playsinline: 1 },
    events: {
      onReady: (event) => {
        playerReady = true;
        if (current) event.target.loadVideoById(current.videoId);
      },
      onStateChange: (event) => {
        if (event.data === ENDED && current) {
          send({ event: "ended", songId: current.songId });
        }
      },
      onError: (event) => {
        if (current) {
          send({ event: "error", songId: current.songId, code: event.data });
        }
      },
    },
  });
}

/** Another page took over: this one stops for good. */
function replaced(): void {
  player?.destroy();
  player = undefined;
  playerReady = false;
  current = undefined;
  note.textContent = "The player is open elsewhere.";
  note.style.display = "grid";
}

function connect(delay = RECONNECT_MS.first): void {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(
    `${scheme}://${location.host}/ws?key=${encodeURIComponent(key)}`,
  );
  let opened = false;

  ws.addEventListener("open", () => {
    opened = true;
  });

  ws.addEventListener("message", (event) => {
    let message: unknown;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (isSidecarMessage(message)) load(message.songId, message.videoId);
  });

  ws.addEventListener("close", (event) => {
    socket = undefined;
    if (event.code === REPLACED_CLOSE_CODE) {
      replaced();
      return;
    }
    // The plugin restarting, or Fluxta closed: try again, more slowly each
    // time it fails, at once after a connection that worked.
    const next = opened ? RECONNECT_MS.first : delay;
    setTimeout(() => connect(Math.min(next * 2, RECONNECT_MS.max)), next);
  });

  socket = ws;
}

window.onYouTubeIframeAPIReady = () => {
  apiReady = true;
  if (current) load(current.songId, current.videoId);
};

const api = document.createElement("script");
api.src = "https://www.youtube.com/iframe_api";
document.head.append(api);

connect();
