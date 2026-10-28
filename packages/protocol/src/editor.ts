import { z } from "zod";

import { isRegion } from "./regions";

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
]);

const PluginMessageSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("status"), status: PluginStatusSchema }),
]);

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
