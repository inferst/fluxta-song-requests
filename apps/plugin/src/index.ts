import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  isEditorMessage,
  isRegion,
  FALLBACK_RULE_DEFAULTS,
  type BlocklistEntry,
  type PluginMessage,
  type PluginStatus,
  type RuleDefaults,
} from "song-requests-protocol";

import { RequestSongAction } from "./actions/request-song";
import { SkipAction } from "./actions/skip";
import { PlaybackAction } from "./actions/playback";
import { VolumeAction } from "./actions/volume";
import { createPlaybackSources } from "./sources/playback";
import {
  SONG_DROPPED_EVENT,
  SONG_ENDED_EVENT,
  SONG_STARTED_EVENT,
  toSongDroppedPayload,
  toSongEndedPayload,
  toSongStartedPayload,
} from "./events";
import { PagePlayer } from "./player-page/page-player";
import { ensurePlayerKey } from "./player-page/player-key";
import { startPlayerPageServer } from "./player-page/server";
import { plugin } from "./plugin";
import type { PluginSettings } from "./settings";
import { SongQueue } from "./songs/song-queue";
import { StateFile } from "./state-file";
import { DataApi } from "./youtube/data-api";
import { createYouTubeProvider } from "./youtube/provider";
import { systemRegion } from "./youtube/region";
import { SearchCache } from "./youtube/search-cache";

/** Fixed, so the address in OBS stays the same; the Settings change it later (#15). */
const PLAYER_PORT = 29362;

/** The Player Page's build, beside this bundle in the Built Plugin Folder. */
const PAGE_DIR = fileURLToPath(new URL("./player/", import.meta.url));

/** The computer's own Region, until the streamer picks another. */
const SYSTEM_REGION = await systemRegion();

// The sidecar is the only writer of Plugin settings, so this copy is what
// they hold. It is unset until they have been read: a change made before
// then would be written over them.
let settings: PluginSettings | undefined = undefined;

const chosenRegion = () =>
  isRegion(settings?.region) ? settings.region : null;

const pagePlayer = new PagePlayer();
const dataApi = new DataApi({ fetch });

// The Song Queue and search cache share the State file (ADR-0002).
const stateFile = new StateFile();
const restored = await stateFile.load();
const searchCache = new SearchCache({
  initial: restored.snapshot?.searchCache,
  onChange: saveState,
});
const youtube = createYouTubeProvider({
  fetch,
  player: pagePlayer,
  dataApi,
  region: () => chosenRegion() ?? SYSTEM_REGION,
  searchCache,
});

const queue = new SongQueue({
  providers: [youtube],
  newId: randomUUID,
  initial: restored.snapshot,
  // The Rules' Defaults and the Blocklist are Plugin settings: read live, so
  // a change in the Plugin Editor applies to the next Request.
  rules: {
    defaults: () => ({
      ...FALLBACK_RULE_DEFAULTS,
      ...settings?.ruleDefaults,
    }),
    blocklist: () => settings?.blocklist ?? [],
  },
  onChange: saveState,
  onStarted: (song) =>
    plugin.emitEvent(SONG_STARTED_EVENT, toSongStartedPayload(song)),
  onEnded: (song, how) =>
    plugin.emitEvent(SONG_ENDED_EVENT, toSongEndedPayload(song, how)),
  onDropped: (song, why) =>
    plugin.emitEvent(SONG_DROPPED_EVENT, toSongDroppedPayload(song, why)),
});

/**
 * The State file keeps the Song Queue across restarts: on every change, and
 * every few seconds while a Song plays, so a restart loses only those few
 * seconds of how far the Current Song has played.
 */
function saveState(): void {
  stateFile
    .save({ ...queue.snapshot(), searchCache: searchCache.snapshot() })
    .catch(() =>
      console.error("The Song Queue's State file could not be written"),
    );
}

// Nothing of the Current Song plays while its Player is away, so the few
// seconds matter only while one is connected.
const stateSaveTimer = setInterval(() => {
  if (queue.snapshot().current) saveState();
}, 5_000);
stateSaveTimer.unref();

plugin.registerAction(new RequestSongAction(queue));
plugin.registerAction(new SkipAction(queue));
plugin.registerAction(new PlaybackAction(queue));
plugin.registerAction(new VolumeAction(queue));
for (const source of createPlaybackSources(queue))
  plugin.registerSource(source);

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
    apiKey: dataApi.status(),
    region: { chosen: chosenRegion(), system: SYSTEM_REGION },
    stateFile: { recovered: restored.recovered },
    defaults: {
      ...FALLBACK_RULE_DEFAULTS,
      ...settings?.ruleDefaults,
    } satisfies RuleDefaults,
    blocklist: (settings?.blocklist ?? []) as BlocklistEntry[],
  };
}

/** Tells every open editor how the plugin stands. */
function publish(): void {
  plugin.sendToEditor({
    event: "status",
    status: status(),
  } satisfies PluginMessage);
}

/** `setPluginSettings` replaces the whole object, so a change goes in with the rest. */
function saveSettings(change: Partial<PluginSettings>): void {
  if (!settings) return;
  settings = { ...settings, ...change };
  plugin
    .setPluginSettings(
      settings as Parameters<typeof plugin.setPluginSettings>[0],
    )
    // Never the settings themselves: the API Key is among them.
    .catch(() => console.error("The Plugin settings could not be saved"));
}

pagePlayer.onConnectionChange(publish);
dataApi.onStatusChange(publish);

// Attached before connecting, so nothing sent while the editor was already
// open is missed once the authenticated handshake completes.
plugin.onReceiveFromEditor((message: unknown) => {
  if (!isEditorMessage(message)) return;

  switch (message.event) {
    case "get-status":
      publish();
      return;

    case "set-api-key": {
      if (!settings) return;
      const apiKey = message.apiKey.trim();
      saveSettings({ apiKey: apiKey || undefined });
      dataApi.setKey(apiKey);
      // So the Plugin Editor can say whether YouTube accepts it at once.
      void dataApi.check();
      return;
    }

    case "set-region":
      if (!settings) return;
      saveSettings({ region: message.region ?? undefined });
      publish();
      return;

    case "set-rule-defaults":
      if (!settings) return;
      // The editor writes 0 for "no shortest bound"; the setting is the
      // value's absence, so an explicit 0 removes it.
      if (message.defaults.shortestDurationSeconds === 0) {
        const ruleDefaults = {
          ...settings.ruleDefaults,
          ...message.defaults,
        };
        delete ruleDefaults.shortestDurationSeconds;
        saveSettings({ ruleDefaults });
      } else {
        saveSettings({
          ruleDefaults: { ...settings.ruleDefaults, ...message.defaults },
        });
      }
      publish();
      return;

    case "remove-blocklist-entry":
      if (!settings) return;
      saveSettings({
        blocklist: (settings.blocklist ?? []).filter(
          (entry) => JSON.stringify(entry) !== JSON.stringify(message.entry),
        ),
      });
      publish();
      return;
  }
});

await plugin.connect();

// Settings are only readable over the authenticated connection.
const { payload } = await plugin.getPluginSettings();
const stored = (payload ?? {}) as PluginSettings;
playerKey = await ensurePlayerKey(stored, (next) =>
  plugin.setPluginSettings(
    next as Parameters<typeof plugin.setPluginSettings>[0],
  ),
);
settings = { ...stored, playerKey };

dataApi.setKey(typeof settings.apiKey === "string" ? settings.apiKey : "");
void dataApi.check();

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
