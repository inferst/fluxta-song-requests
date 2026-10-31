import {
  isSidecarMessage,
  REPLACED_CLOSE_CODE,
  type PageMessage,
  type SidecarMessage,
} from "song-requests-protocol";

/**
 * The Player Page: YouTube's IFrame Player and nothing else in view
 * (ADR-0001). It does only what the sidecar says — load a video, which plays
 * at once unless paused, muted for a Song's Start Check; unmute it; pause,
 * resume, change volume or stop — and reports how
 * that went. The Song Queue lives in the sidecar.
 */

const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;
const CUED = 5;
const RECONNECT_MS = { first: 1_000, max: 10_000 };
/** How soon to look again for a duration the player does not know yet. */
const DURATION_RETRY_MS = 250;
/**
 * How long a Song at its Start Check is watched before its duration is
 * believed: a live stream's "duration" is how long it has been on, and grows
 * as it plays, whatever `getVideoData()` says.
 */
const LIVE_WATCH_MS = 1_500;

const key = new URLSearchParams(location.search).get("key") ?? "";
const note = document.getElementById("note")!;

let socket: WebSocket | undefined;
let player: YT.Player | undefined;
let apiReady = false;
/** The player answers calls only once its own `onReady` has fired. */
let playerReady = false;
let paused = false;
let volume = 100;
/** The Song the page plays, or is about to once the API has loaded. */
let current:
  | {
      songId: string;
      videoId: string;
      muted: boolean;
      /** Seconds in to start at: the Song goes on from where a restart found it. */
      startAt: number;
      /** Whether the sidecar has been told it plays, and how long it is. */
      reported: boolean;
      /** The duration first read at its Start Check, and when, to see whether it grows. */
      first?: { duration: number; at: number };
    }
  | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;
/** The playlist a `cue` asked to list, waiting for the player to load it. */
let listing: { playlistId: string; requestId: string } | undefined;

function send(message: PageMessage): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function start(target: YT.Player): void {
  if (!current) return;
  target.setVolume(volume);
  // A Song at its Start Check must not be heard before the sidecar says so —
  // muted before it loads, not after.
  if (current.muted) target.mute();
  else target.unMute();
  const video = {
    videoId: current.videoId,
    startSeconds: current.startAt,
  };
  // A restored pause must not briefly play with sound while loading.
  if (paused) target.cueVideoById(video);
  else target.loadVideoById(video);
}

/**
 * Tells the sidecar the Song plays and how long it is, once the player
 * knows. A live stream's duration is how long it has been on, not its
 * length, so one is told by what the player says of the video or, at a
 * Song's Start Check, by its duration growing as it plays; any other video
 * once its duration is more than 0, which it is not until its data loaded.
 */
function report(): void {
  clearTimeout(retry);
  if (!player || !current || current.reported) return;
  // A duration retry can outlive a pause or buffering; it must not announce playback.
  if (player.getPlayerState() !== PLAYING) return;

  const data = player.getVideoData();
  let live = data.isLive === true;
  const duration = player.getDuration();

  // The player may still hold the video before this one.
  if (data.video_id !== current.videoId || (!live && !(duration > 0))) {
    retry = setTimeout(report, DURATION_RETRY_MS);
    return;
  }

  if (!live && current.muted) {
    current.first ??= { duration, at: performance.now() };
    const watched = performance.now() - current.first.at;
    if (watched < LIVE_WATCH_MS) {
      retry = setTimeout(report, LIVE_WATCH_MS - watched);
      return;
    }
    // A video's own duration settles within a fraction of a second; a live
    // stream's grows with the time it is watched.
    live = duration - current.first.duration > watched / 2000;
  }

  current.reported = true;
  send({
    event: "loaded",
    songId: current.songId,
    duration,
    live,
    title: data.title ?? "",
  });
  reportPlayback(player, player.getPlayerState());
}

function reportPlayback(target: YT.Player, state: number): void {
  if (!current || target.getVideoData().video_id !== current.videoId) return;
  send({
    event: "playback",
    songId: current.songId,
    state:
      state === PAUSED || (state === CUED && paused)
        ? "paused"
        : state === BUFFERING
          ? "buffering"
          : state === PLAYING
            ? "playing"
            : "loading",
    // The muted Start Check is discarded when the Song is heard from its start.
    position: current.muted ? 0 : target.getCurrentTime(),
  });
}

function load(
  songId: string,
  videoId: string,
  muted: boolean,
  startAt: number,
): void {
  current = { songId, videoId, muted, startAt, reported: false };
  listing = undefined;
  clearTimeout(retry);
  if (!apiReady) return;

  if (player) {
    if (playerReady) start(player);
    return;
  }

  // No `origin` parameter: what YouTube checks is the page's host, which is
  // `localhost` — never an IP address, which it refuses (spike #3).
  player = createPlayer();
}

/** The IFrame Player, once YouTube's API has loaded. */
function createPlayer(): YT.Player {
  return new YT.Player("player", {
    width: "100%",
    height: "100%",
    playerVars: { playsinline: 1 },
    events: {
      onReady: (event) => {
        playerReady = true;
        if (listing !== undefined) {
          event.target.cuePlaylist({ list: listing.playlistId });
        } else {
          start(event.target);
        }
      },
      onStateChange: (event) => {
        if (listing !== undefined && event.data === CUED) {
          // A `cue` wants the playlist listed, never played (ADR-0003):
          // what `getPlaylist()` gives is what the player loaded of it —
          // for a long playlist, maybe not every entry.
          const ids = event.target.getPlaylist();
          const { requestId } = listing;
          listing = undefined;
          send({
            event: "cued",
            requestId,
            ids: Array.isArray(ids) ? ids : [],
          });
        }
        // The Player's own controls can override a command from the sidecar.
        // Only the current video may change the shared pause state.
        if (
          current &&
          event.target.getVideoData().video_id === current.videoId
        ) {
          if (event.data === PLAYING) paused = false;
          else if (event.data === PAUSED) paused = true;
        }
        if (event.data === PLAYING) {
          if (current?.reported) reportPlayback(event.target, event.data);
          else {
            report();
            // The Start Check may still be learning the duration, but its
            // Pause and Play controls must already reach the Plugin Editor.
            if (!current?.reported) reportPlayback(event.target, event.data);
          }
        } else if (
          event.data === PAUSED ||
          event.data === BUFFERING ||
          event.data === CUED
        ) {
          if (current?.muted) current.first = undefined;
          reportPlayback(event.target, event.data);
        }
        if (event.data === ENDED && current) {
          send({ event: "ended", songId: current.songId });
        }
      },
      onError: (event) => {
        clearTimeout(retry);
        if (listing !== undefined) {
          const { requestId } = listing;
          listing = undefined;
          send({ event: "cued", requestId, ids: [] });
          return;
        }
        if (current) {
          send({ event: "error", songId: current.songId, code: event.data });
        }
      },
    },
  });
}

/**
 * The Song passed its Start Check: it is heard from its start, as if the
 * moment it played muted had not been.
 */
function unmute(songId: string): void {
  if (current?.songId !== songId) return;
  current.muted = false;
  if (!playerReady) return;
  if (paused)
    player?.cueVideoById({ videoId: current.videoId, startSeconds: 0 });
  else player?.seekTo(0, true);
  player?.unMute();
}

function stop(): void {
  current = undefined;
  listing = undefined;
  clearTimeout(retry);
  if (playerReady) player?.stopVideo();
}

function obey(message: SidecarMessage): void {
  switch (message.event) {
    case "load":
      paused = message.paused ?? false;
      volume = message.volume ?? volume;
      load(message.songId, message.videoId, message.muted, message.startAt);
      return;
    case "unmute":
      unmute(message.songId);
      return;
    case "stop":
      stop();
      return;
    case "pause":
      paused = true;
      clearTimeout(retry);
      if (playerReady && current) player?.pauseVideo();
      return;
    case "resume":
      paused = false;
      if (playerReady && current) player?.playVideo();
      return;
    case "volume":
      volume = message.volume;
      if (playerReady) player?.setVolume(volume);
      return;
    case "cue":
      // Only ever cued, to learn the Fallback Playlist's entries — never
      // played: the sidecar hands tracks one at a time (ADR-0003).
      current = undefined;
      clearTimeout(retry);
      listing = {
        playlistId: message.playlistId,
        requestId: message.requestId,
      };
      if (!apiReady) return;
      if (!player) {
        player = createPlayer();
        return;
      }
      if (playerReady) player.cuePlaylist({ list: message.playlistId });
      return;
  }
}

/** Another page took over: this one stops for good. */
function replaced(): void {
  player?.destroy();
  player = undefined;
  playerReady = false;
  current = undefined;
  listing = undefined;
  clearTimeout(retry);
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
    if (isSidecarMessage(message)) obey(message);
  });

  ws.addEventListener("close", (event) => {
    socket = undefined;
    if (event.code === REPLACED_CLOSE_CODE) {
      replaced();
      return;
    }
    stop();
    // The plugin restarting, or Fluxta closed: try again, more slowly each
    // time it fails, at once after a connection that worked.
    const next = opened ? RECONNECT_MS.first : delay;
    setTimeout(() => connect(Math.min(next * 2, RECONNECT_MS.max)), next);
  });

  socket = ws;
}

window.onYouTubeIframeAPIReady = () => {
  apiReady = true;
  if (current) {
    load(current.songId, current.videoId, current.muted, current.startAt);
  } else if (listing !== undefined && !player) {
    player = createPlayer();
  }
};

const api = document.createElement("script");
api.src = "https://www.youtube.com/iframe_api";
document.head.append(api);

connect();
