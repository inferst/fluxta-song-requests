import { z } from "zod";

/**
 * The messages between the sidecar and its editors.
 *
 * The SDK does not impose a format — this module is the single place where
 * ours is defined, so the sidecar and every editor page agree on it by
 * construction rather than by convention. Every message is an object with an
 * `event` discriminant.
 */

const PluginStatusSchema = z.object({
  /** Where OBS opens the Player Page, Player Key included. */
  playerUrl: z.string(),
  /** Whether a Player Page is connected to the sidecar now. */
  playerConnected: z.boolean(),
});

const EditorMessageSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("get-status") }),
]);

const PluginMessageSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("status"), status: PluginStatusSchema }),
]);

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
