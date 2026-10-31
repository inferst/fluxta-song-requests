import { z } from "zod";

import { isRegion } from "./regions";
import { BlocklistEntrySchema, RuleDefaultsSchema } from "./rules";

/**
 * The messages between the sidecar and its editors.
 *
 * The SDK does not impose a format — this module is the single place where
 * ours is defined, so the sidecar and every editor page agree on it by
 * construction rather than by convention. Every message is an object with an
 * `event` discriminant.
 */

const ApiKeyStatusSchema = z.object({
  /**
   * `none` — no key set; `unchecked` — YouTube has not answered about it yet;
   * `accepted`; `refused` — YouTube refuses it, so it goes unused until it is
   * changed; `spent` — its daily units are spent until `resetsAt`.
   */
  state: z.enum(["none", "unchecked", "accepted", "refused", "spent"]),
  /** Its last characters behind dots, to tell which key it is — never the key. */
  masked: z.string(),
  /** When YouTube resets the units, in ms since the epoch; only while `spent`. */
  resetsAt: z.number().optional(),
});

const RegionSchema = z.string().refine(isRegion);

/** Why a Request did not become a Song — the Refusal's reason, shown as text. */
const RefusalReasonSchema = z.enum([
  "not-found",
  "not-embeddable",
  "age-restricted",
  "region-blocked",
  "live",
  "no-api-key",
  "api-key-invalid",
  "quota-exhausted",
  "provider-unavailable",
  "closed",
  "too-long",
  "too-short",
  "requester-limit",
  "queue-full",
  "already-queued",
  "recently-played",
  "blocked",
  "not-music",
]);

/** A waiting Song as the Plugin Editor's queue lists it. */
const WaitingSongSchema = z.object({
  id: z.string(),
  title: z.string(),
  channel: z.string(),
  /** A link to it a viewer can open. */
  url: z.string(),
  requesterName: z.string(),
  /** In seconds; `null` until its Player reports it at its Start Check. */
  duration: z.number().nullable(),
  /** How it arrived: Next Songs precede In turn Songs. */
  place: z.enum(["next", "inTurn"]),
  /**
   * Seconds until it should start — what is left of what is on air and
   * every Song ahead; `null` when a duration it needs is not known.
   */
  eta: z.number().nullable(),
});

/** What is on air now, as the Plugin Editor's Now section renders it. */
const NowPlayingSchema = z.object({
  /** The Current Song's id, or the Fallback Track's. */
  id: z.string(),
  title: z.string(),
  channel: z.string(),
  url: z.string(),
  /** The Current Song's Requester; a Fallback Track has none. */
  requesterName: z.string(),
  /** `true` for a Fallback Track: no Rules, no Events, no History. */
  isFallback: z.boolean(),
  /** In seconds; `null` until known — a keyless Song at its Start Check. */
  duration: z.number().nullable(),
  /** How far it has played, in seconds, when the status was built. */
  position: z.number(),
  /** It plays muted while its Player reports how long it is. */
  atStartCheck: z.boolean(),
});

/** The Now and the queue part of the status: what plays, and what waits. */
const PlaybackStatusSchema = z.object({
  /**
   * The sidecar's `Date.now()` when the status was built — the editor runs
   * on this computer, so it can tick the progress from its own clock.
   */
  now: z.number(),
  isPaused: z.boolean(),
  volume: z.number(),
  requestsOpen: z.boolean(),
  /** `null` when nothing is on air. */
  current: NowPlayingSchema.nullable(),
  waiting: z.array(WaitingSongSchema),
});

const PluginStatusSchema = z.object({
  /** Where OBS opens the Player Page, Player Key included. */
  playerUrl: z.string(),
  /** Whether a Player Page is connected to the sidecar now. */
  playerConnected: z.boolean(),
  apiKey: ApiKeyStatusSchema,
  region: z.object({
    /** The one the streamer picked, or `null` to follow the computer's. */
    chosen: RegionSchema.nullable(),
    /** The computer's, from its locale. */
    system: RegionSchema,
  }),
  stateFile: z.object({
    /**
     * `true` once the State file could not be read and was moved aside, so
     * the plugin started with an empty Song Queue (ADR-0002).
     */
    recovered: z.boolean(),
  }),
  /** The Rules' Defaults as they stand now — #1's where the streamer set none. */
  defaults: RuleDefaultsSchema,
  /** What the streamer never wants played; adding comes with Block Song. */
  blocklist: z.array(BlocklistEntrySchema),
  /** The Fallback Playlist's link as saved, `""` for none. */
  fallbackPlaylist: z.string(),
  /** What the Now and the queue sections render; republished on every change. */
  playback: PlaybackStatusSchema,
});

const EditorMessageSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("get-status") }),
  /**
   * A new API Key from the Plugin Editor, `""` to remove it. The editor is
   * never sent the key back — only `ApiKeyStatus.masked`.
   */
  z.object({ event: z.literal("set-api-key"), apiKey: z.string().max(200) }),
  /** A Region the streamer picked, or `null` to follow the computer's. */
  z.object({ event: z.literal("set-region"), region: RegionSchema.nullable() }),
  /**
   * The Rules' Defaults as the streamer set them; what is absent keeps the
   * value it has, #1's where it never had one.
   */
  z.object({
    event: z.literal("set-rule-defaults"),
    defaults: RuleDefaultsSchema.partial(),
  }),
  /** Take one entry out of the Blocklist; adding comes with Block Song (#11). */
  z.object({
    event: z.literal("remove-blocklist-entry"),
    entry: BlocklistEntrySchema,
  }),
  /** The Fallback Playlist's link, `""` to remove it. Read when it is set. */
  z.object({
    event: z.literal("set-fallback-playlist"),
    playlist: z.string().max(500),
  }),
  /** Pause, resume or toggle — the Playback Action's modes. */
  z.object({
    event: z.literal("playback"),
    mode: z.enum(["pause", "resume", "toggle"]),
  }),
  /** Ends what is on air — the Skip Action. */
  z.object({ event: z.literal("skip") }),
  /** Sets the volume, 0–100. */
  z.object({
    event: z.literal("set-volume"),
    volume: z.number().min(0).max(100),
  }),
  /** Opens or closes Requests — the Requests Action's open and close. */
  z.object({ event: z.literal("set-requests-open"), open: z.boolean() }),
  /**
   * Moves a waiting Song to another place, `toPosition` 1-based among the
   * waiting Songs — the drag in the Plugin Editor's queue.
   */
  z.object({
    event: z.literal("reorder-song"),
    songId: z.string(),
    toPosition: z.number().int().positive(),
  }),
  /** Puts a waiting Song ahead of every In turn Song, behind earlier Next ones. */
  z.object({ event: z.literal("move-song-next"), songId: z.string() }),
  /** Drops a waiting Song as removed — the Remove Song Action by `songId`. */
  z.object({ event: z.literal("remove-song"), songId: z.string() }),
  /** Blocks a waiting Song's track — the Block Song Action by `songId`. */
  z.object({ event: z.literal("block-song"), songId: z.string() }),
  /**
   * The streamer's own Request: a link or search words, checked as Request
   * Song with the Defaults. Answered with `request-answer`.
   */
  z.object({
    event: z.literal("request-song"),
    request: z.string().min(1).max(500),
  }),
]);

/** What became of the streamer's Request from the Plugin Editor's add field. */
const StreamerRequestAnswerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("accepted"),
    /** Its place among the waiting Songs; 0 when it went on air at once. */
    position: z.number().int().nonnegative(),
    /** Seconds until it should start; `null` when a duration is not known. */
    eta: z.number().nullable(),
  }),
  z.object({ kind: z.literal("refused"), reason: RefusalReasonSchema }),
]);

const PluginMessageSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("status"), status: PluginStatusSchema }),
  /**
   * What became of the streamer's Request from the Plugin Editor's add
   * field: the Song's place, or the Refusal's reason.
   */
  z.object({
    event: z.literal("request-answer"),
    answer: StreamerRequestAnswerSchema,
  }),
]);

/** Why a Request did not become a Song. */
export type RefusalReason = z.infer<typeof RefusalReasonSchema>;

/** A waiting Song as the Plugin Editor's queue lists it. */
export type WaitingSong = z.infer<typeof WaitingSongSchema>;

/** What is on air now, as the Plugin Editor's Now section renders it. */
export type NowPlaying = z.infer<typeof NowPlayingSchema>;

/** The Now and the queue part of the status: what plays, and what waits. */
export type PlaybackStatus = z.infer<typeof PlaybackStatusSchema>;

/** What became of the streamer's Request from the Plugin Editor's add field. */
export type StreamerRequestAnswer = z.infer<typeof StreamerRequestAnswerSchema>;

/** What the Plugin Editor shows of the API Key. */
export type ApiKeyStatus = z.infer<typeof ApiKeyStatusSchema>;

/** Everything the Plugin Editor renders. */
export type PluginStatus = z.infer<typeof PluginStatusSchema>;

/** A message an editor sends to the sidecar. */
export type EditorMessage = z.infer<typeof EditorMessageSchema>;

/** A message the sidecar sends to its editors. */
export type PluginMessage = z.infer<typeof PluginMessageSchema>;

/**
 * Narrows a value that arrived over the wire. Both sides receive `unknown`
 * JSON, so neither should trust the other's shape.
 */
export function isEditorMessage(value: unknown): value is EditorMessage {
  return EditorMessageSchema.safeParse(value).success;
}

export function isPluginMessage(value: unknown): value is PluginMessage {
  return PluginMessageSchema.safeParse(value).success;
}
