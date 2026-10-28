import type { Player, Provider, RefusalReason, Song } from "./provider";

/** How Request Song is answered. */
export type RequestAnswer =
  | {
      kind: "accepted";
      song: Song;
      /** Its place among the waiting Songs, 1 first; 0 when it went on air at once. */
      position: number;
      /**
       * Seconds until it should start: what is left of the Current Song and
       * every Song ahead; `undefined` when a duration it needs is not known.
       */
      eta: number | undefined;
    }
  | { kind: "refused"; reason: RefusalReason };

/** The Song on air — or waiting, paused, for its Player to come back. */
type CurrentSong = {
  song: Song;
  /**
   * Its duration is not known, so it plays muted until its Player tells it —
   * however long that takes: a Song buffering through a network drop is not
   * failing (spike #3).
   */
  atStartCheck: boolean;
  /** When it began to play, by `Date.now()`; unset until its Player says so. */
  since?: number;
};

/**
 * Seconds left of the Current Song, if its duration is known. Away from its
 * Player it has all of them: it plays again from its start.
 */
function timeLeft(
  { song, since }: CurrentSong,
  player: Player | undefined,
): number | undefined {
  if (song.duration === undefined) return undefined;
  if (since === undefined || !player?.ready) return song.duration;
  return Math.max(0, song.duration - (Date.now() - since) / 1000);
}

/**
 * The plugin's single Song Queue: Songs waiting in order of arrival, played
 * one at a time. It owns the order; a Provider's Player is told one Song at a
 * time (ADR-0003).
 */
export class SongQueue {
  readonly #providers: Provider[];
  readonly #newId: () => string;
  readonly #waiting: Song[] = [];
  #current?: CurrentSong;

  constructor({
    providers,
    newId,
  }: {
    /** The first is the default one, which answers search words. */
    providers: Provider[];
    newId: () => string;
  }) {
    this.#providers = providers;
    this.#newId = newId;

    for (const provider of providers) {
      provider.player.attach({
        ready: () => this.#resume(provider),
        loaded: (songId, duration) => this.#loaded(songId, duration),
        ended: (songId) => this.#leave(songId),
        failed: (songId) => this.#leave(songId),
      });
    }
  }

  /**
   * A Player that comes back — a Player Page opened again — gets the Current
   * Song again if it is its own, or the next Song if nothing is on air.
   */
  #resume(provider: Provider): void {
    if (this.#current?.song.provider === provider.id) {
      this.#start(this.#current, provider.player);
      return;
    }
    this.#advance();
  }

  /**
   * Its Player tells how long the Song on air is. At its Start Check that
   * decides it: a live stream has no end and is dropped before anything of
   * it is heard (ADR-0005); any other is unmuted and goes on air.
   */
  #loaded(songId: string, duration: number | undefined): void {
    const current = this.#current;
    if (current?.song.id !== songId) return;

    if (current.atStartCheck) {
      if (duration === undefined) {
        this.#drop(current);
        return;
      }
      current.atStartCheck = false;
      current.song = { ...current.song, duration };
      this.#playerOf(current.song)?.unmute(songId);
    }

    current.since = Date.now();
  }

  /** The Current Song leaves the air; a stale report of an earlier one changes nothing. */
  #leave(songId: string): void {
    if (this.#current?.song.id !== songId) return;
    this.#current = undefined;
    this.#advance();
  }

  /** The Song on air goes without being heard; its Player stops it. */
  #drop(current: CurrentSong): void {
    this.#current = undefined;
    this.#playerOf(current.song)?.stop();
    this.#advance();
  }

  /** Puts the next Song on air, if its Player can play it now. */
  #advance(): void {
    if (this.#current) return;
    const next = this.#waiting[0];
    const player = next && this.#playerOf(next);
    if (!player?.ready) return;
    this.#waiting.shift();
    this.#current = {
      song: next,
      atStartCheck: next.duration === undefined,
    };
    this.#start(this.#current, player);
  }

  /** Plays the Song on air from its start — muted at its Start Check. */
  #start(current: CurrentSong, player: Player): void {
    current.since = undefined;
    player.play(current.song, { muted: current.atStartCheck });
  }

  #playerOf(song: Song) {
    return this.#providers.find((p) => p.id === song.provider)?.player;
  }

  /** Seconds until a waiting Song should start, if every duration it needs is known. */
  #etaOf(song: Song): number | undefined {
    let seconds = 0;

    if (this.#current) {
      const left = timeLeft(this.#current, this.#playerOf(this.#current.song));
      if (left === undefined) return undefined;
      seconds += left;
    }

    for (const ahead of this.#waiting) {
      if (ahead === song) break;
      if (ahead.duration === undefined) return undefined;
      seconds += ahead.duration;
    }

    return Math.round(seconds);
  }

  async request(request: string): Promise<RequestAnswer> {
    const provider =
      this.#providers.find((p) => p.claims(request)) ?? this.#providers[0];
    const resolution = await provider.resolve(request);

    if (resolution.kind === "refused") {
      return resolution;
    }

    const song: Song = { ...resolution.track, id: this.#newId() };
    this.#waiting.push(song);
    this.#advance();

    const position = this.#waiting.indexOf(song) + 1;
    return {
      kind: "accepted",
      song,
      position,
      eta: position === 0 ? 0 : this.#etaOf(song),
    };
  }
}
