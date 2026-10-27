import type { Provider, RefusalReason, Song } from "./provider";

/** How Request Song is answered. */
export type RequestAnswer =
  | {
      kind: "accepted";
      song: Song;
      /** Its place among the waiting Songs, 1 first; 0 when it went on air at once. */
      position: number;
    }
  | { kind: "refused"; reason: RefusalReason };

/**
 * The plugin's single Song Queue: Songs waiting in order of arrival, played
 * one at a time. It owns the order; a Provider's Player is told one Song at a
 * time (ADR-0003).
 */
export class SongQueue {
  readonly #providers: Provider[];
  readonly #newId: () => string;
  readonly #waiting: Song[] = [];
  /** The Song on air — or waiting, paused, for its Player to come back. */
  #current?: Song;

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
    if (this.#current?.provider === provider.id) {
      provider.player.play(this.#current);
      return;
    }
    this.#advance();
  }

  /** The Current Song leaves the air; a stale report of an earlier one changes nothing. */
  #leave(songId: string): void {
    if (this.#current?.id !== songId) return;
    this.#current = undefined;
    this.#advance();
  }

  /** Puts the next Song on air, if its Player can play it now. */
  #advance(): void {
    if (this.#current) return;
    const next = this.#waiting[0];
    const player = next && this.#playerOf(next);
    if (!player?.ready) return;
    this.#waiting.shift();
    this.#current = next;
    player.play(next);
  }

  #playerOf(song: Song) {
    return this.#providers.find((p) => p.id === song.provider)?.player;
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
    return {
      kind: "accepted",
      song,
      position: this.#waiting.indexOf(song) + 1,
    };
  }
}
