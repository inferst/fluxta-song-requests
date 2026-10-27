import { z } from "zod";

/**
 * The messages between the sidecar and the Player Page, over the page's own
 * WebSocket. The page does only what the sidecar says — load a video and
 * play it, unmute it, stop — and reports how that went; the Song Queue lives
 * in the sidecar.
 *
 * Every message is an object with an `event` discriminant, like the editor
 * messages, and both sides check what arrives: it is JSON off a socket.
 */

/**
 * The WebSocket close code a page is closed with when another page took over
 * (the one opened last plays). A page closed with it does not reconnect —
 * otherwise two open pages would take the player from each other for ever.
 */
export const REPLACED_CLOSE_CODE = 4000;

const SidecarMessageSchema = z.discriminatedUnion("event", [
  /** `muted` for a Song at its Start Check, which is not heard until `unmute`. */
  z.object({
    event: z.literal("load"),
    songId: z.string(),
    videoId: z.string(),
    muted: z.boolean(),
  }),
  z.object({ event: z.literal("unmute"), songId: z.string() }),
  z.object({ event: z.literal("stop") }),
]);

const PageMessageSchema = z.discriminatedUnion("event", [
  /**
   * The video plays, and the player knows it: `duration` is the player's
   * own, in seconds, and `live` whether the video is a live stream — whose
   * "duration" is only how long it has been on.
   */
  z.object({
    event: z.literal("loaded"),
    songId: z.string(),
    duration: z.number(),
    live: z.boolean(),
  }),
  z.object({ event: z.literal("ended"), songId: z.string() }),
  /** `code` is the IFrame Player's error code — 150 for any refusal at load. */
  z.object({
    event: z.literal("error"),
    songId: z.string(),
    code: z.number(),
  }),
]);

/** A message the sidecar sends to the Player Page. */
export type SidecarMessage = z.infer<typeof SidecarMessageSchema>;

/** A message the Player Page sends to the sidecar. */
export type PageMessage = z.infer<typeof PageMessageSchema>;

export function isSidecarMessage(value: unknown): value is SidecarMessage {
  return SidecarMessageSchema.safeParse(value).success;
}

export function isPageMessage(value: unknown): value is PageMessage {
  return PageMessageSchema.safeParse(value).success;
}
