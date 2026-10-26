/**
 * The Provider seam (ADR-0003): a music service turns a Request into a track
 * and plays one Song at a time on its Player. Nothing above it — the Song
 * Queue, Request Song — knows which service a Song comes from.
 */

/** One playable item of a Provider, before it is accepted as a Song. */
export type Track = {
  /** The Provider's `id`. */
  provider: string;
  /** The Provider's own id for it — YouTube's video id. */
  trackId: string;
  title: string;
  channel: string;
  /** The channel's address, which a channel in the Blocklist is matched by without the API Key. */
  channelUrl: string;
  /** A link to it a viewer can open. */
  url: string;
};

/** A Request accepted into the Song Queue. */
export type Song = Track & {
  /** The Song's own id, unique in the Song Queue and in the Song's Events. */
  id: string;
};

/** Why a Request did not become a Song. */
export type RefusalReason =
  "not-found" | "not-embeddable" | "no-api-key" | "provider-unavailable";

export type Resolution =
  { kind: "track"; track: Track } | { kind: "refused"; reason: RefusalReason };

/** What a Player tells the Song Queue. */
export interface PlayerEvents {
  /** It can play now — a Player Page connected. */
  ready(): void;
  /** The Song played to its end. */
  ended(songId: string): void;
  /** The Song could not be played, or broke while playing. */
  failed(songId: string): void;
}

/** Where a Provider's Songs play. It is told one Song at a time and holds no queue. */
export interface Player {
  /** Whether a Song handed over now would play. */
  readonly ready: boolean;
  /** Plays the Song in place of whatever was on. */
  play(song: Song): void;
  /** How the Song Queue hears from it. */
  attach(events: PlayerEvents): void;
}

export interface Provider {
  readonly id: string;
  /**
   * Whether the Request is a link of this Provider's. A Request no Provider
   * claims is search words, which the default Provider answers.
   */
  claims(request: string): boolean;
  resolve(request: string): Promise<Resolution>;
  readonly player: Player;
}
