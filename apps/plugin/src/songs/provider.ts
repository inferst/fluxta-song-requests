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
  /**
   * In seconds; unknown when its Provider could not tell it, until its Player
   * does, at the Song's Start Check.
   */
  duration?: number;
};

/** Who a Request is from and the scenario's opaque label for it. */
export type RequestMetadata = {
  requesterPlatform: string;
  requesterId: string;
  requesterName: string;
  reference: string;
};

/** A Request accepted into the Song Queue. */
export type Song = Track &
  RequestMetadata & {
    /** The Song's own id, unique in the Song Queue and in the Song's Events. */
    id: string;
  };

/** Why a Request did not become a Song. */
export type RefusalReason =
  | "not-found"
  | "not-embeddable"
  | "age-restricted"
  | "region-blocked"
  | "live"
  | "no-api-key"
  | "api-key-invalid"
  | "quota-exhausted"
  | "provider-unavailable";

export type Resolution =
  { kind: "track"; track: Track } | { kind: "refused"; reason: RefusalReason };

/** What a Player tells the Song Queue. */
export interface PlayerEvents {
  /** It can play now — a Player Page connected. */
  ready(): void;
  /**
   * The Song plays — muted, if it was played so — and is this long, in
   * seconds; `undefined` for a live stream, which has no end.
   */
  loaded(songId: string, duration: number | undefined): void;
  /** The Song played to its end. */
  ended(songId: string): void;
  /** The Song could not be played, or broke while playing. */
  failed(songId: string): void;
}

/** Where a Provider's Songs play. It is told one Song at a time and holds no queue. */
export interface Player {
  /** Whether a Song handed over now would play. */
  readonly ready: boolean;
  /**
   * Plays the Song in place of whatever was on. A muted Song is not heard
   * until `unmute` — its Start Check.
   */
  play(song: Song, options: { muted: boolean }): void;
  /** Lets the Song on air be heard; a Song that is no longer on air stays as it is. */
  unmute(songId: string): void;
  /** Stops whatever is on; nothing plays until the next `play`. */
  stop(): void;
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
