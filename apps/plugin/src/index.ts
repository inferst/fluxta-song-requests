import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  isEditorMessage,
  type PluginMessage,
  type PluginStatus,
} from "song-requests-protocol";

import { RequestSongAction } from "./actions/request-song";
import { PagePlayer } from "./player-page/page-player";
import { ensurePlayerKey, type PluginSettings } from "./player-page/player-key";
import { startPlayerPageServer } from "./player-page/server";
import { plugin } from "./plugin";
import { SongQueue } from "./songs/song-queue";
import { createYouTubeProvider } from "./youtube/provider";

/** Fixed, so the address in OBS stays the same; the Settings change it later (#15). */
const PLAYER_PORT = 29362;

/** The Player Page's build, beside this bundle in the Built Plugin Folder. */
const PAGE_DIR = fileURLToPath(new URL("./player/", import.meta.url));

const pagePlayer = new PagePlayer();
const youtube = createYouTubeProvider({ fetch, player: pagePlayer });
const queue = new SongQueue({ providers: [youtube], newId: randomUUID });

plugin.registerAction(new RequestSongAction(queue));

// Read by `status()` from the start — an editor may ask before the settings
// have been read — so it starts out unknown.
let playerKey: string | undefined = undefined;

function status(): PluginStatus {
  return {
    // Always `localhost`, never an IP: YouTube refuses to play on a page
    // addressed by one (spike #3).
    playerUrl: playerKey
      ? `http://localhost:${PLAYER_PORT}/player?key=${playerKey}`
      : "",
    playerConnected: pagePlayer.ready,
  };
}

/** Tells every open editor how the plugin stands. */
function publish(): void {
  plugin.sendToEditor({
    event: "status",
    status: status(),
  } satisfies PluginMessage);
}

pagePlayer.onConnectionChange(publish);

// Attached before connecting, so nothing sent while the editor was already
// open is missed once the authenticated handshake completes.
plugin.onReceiveFromEditor((message: unknown) => {
  if (isEditorMessage(message) && message.event === "get-status") {
    publish();
  }
});

await plugin.connect();

// Settings are only readable over the authenticated connection.
const { payload } = await plugin.getPluginSettings();
playerKey = await ensurePlayerKey((payload ?? {}) as PluginSettings, (next) =>
  plugin.setPluginSettings(
    next as Parameters<typeof plugin.setPluginSettings>[0],
  ),
);

try {
  await startPlayerPageServer({
    port: PLAYER_PORT,
    pageDir: PAGE_DIR,
    playerKey: () => playerKey ?? "",
    onPage: (page) => pagePlayer.connect(page),
  });
  console.log(`The Player Page is served on localhost:${PLAYER_PORT}`);
} catch (error) {
  // Another program holds the port; Request Song still queues, and nothing
  // plays until the plugin is restarted with the port free.
  const code = (error as NodeJS.ErrnoException).code ?? String(error);
  console.error(
    `The Player Page cannot listen on port ${PLAYER_PORT}: ${code}`,
  );
}

publish();
