import {
  FALLBACK_RULE_DEFAULTS,
  type BlocklistEntry,
  type RequestSongOverrides,
  type RuleDefaults,
} from "song-requests-protocol";

import type {
  Player,
  Provider,
  RefusalReason,
  RequestMetadata,
  Song,
  Track,
} from "./provider";
import { recordInHistory, trimHistory, type HistoryEntry } from "./history";
import { checkRules, durationBoundsOf, resolveRules } from "./rules";

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
  /** It has been heard, so its end is Song Ended rather than Song Dropped. */
  started: boolean;
  loaded?: boolean;
  /** When it began to play, by `Date.now()`; unset until its Player says so. */
  since?: number;
  /** How far it has played, in seconds, as of `since`. */
  position: number;
  /**
   * Seconds in to resume at once its Player is ready — saved by the State
   * file for the Current Song of a restarted plugin (ADR-0002).
   */
  resumeAt?: number;
};

/** The Song Queue as the State file keeps it (ADR-0002). */
export type SongQueueSnapshot = {
  isPaused?: boolean;
  volume?: number;
  waiting: Song[];
  current?: {
    song: Song;
    atStartCheck: boolean;
    /** It has been heard: coming back, it goes on without a second Song Started. */
    started: boolean;
    /** How far it has played, in seconds. */
    position: number;
  };
  /** The Songs that left the air, newest first: at most 200, none older than 30 days. */
  history: HistoryEntry[];
};

/**
 * The plugin's single Song Queue: Songs waiting in order of arrival, played
 * one at a time. It owns the order; a Provider's Player is told one Song at a
 * time (ADR-0003). It also applies the Rules — each one above the Provider
 * seam, over the track a Provider resolved — and keeps the History.
 */
export class SongQueue {
  readonly #providers: Provider[];
  readonly #newId: () => string;
  readonly #rules: {
    defaults: () => RuleDefaults;
    blocklist: () => BlocklistEntry[];
  };
  readonly #onStarted?: (song: Song) => void;
  readonly #onEnded?: (
    song: Song,
    how: "finished" | "failed" | "skipped",
  ) => void;
  readonly #onDropped?: (
    song: Song,
    why: "unavailable" | "too-long" | "too-short" | "removed",
  ) => void;
  readonly #onChange?: () => void;
  readonly #waiting: Song[] = [];
  #current?: CurrentSong;
  #history: HistoryEntry[];
  #paused: boolean;
  #volume: number;

  constructor({
    providers,
    newId,
    initial,
    rules,
    onStarted,
    onEnded,
    onDropped,
    onChange,
  }: {
    /** The first is the default one, which answers search words. */
    providers: Provider[];
    newId: () => string;
    /** What the State file saved: the queue comes back as it was (ADR-0002). */
    initial?: SongQueueSnapshot;
    /**
     * The Rules' Defaults and the Blocklist, as they stand now — they are
     * Plugin settings, which change while the queue lives. Without this the
     * #1 Defaults and an empty Blocklist apply.
     */
    rules?: {
      defaults: () => RuleDefaults;
      blocklist: () => BlocklistEntry[];
    };
    onStarted?: (song: Song) => void;
    onEnded?: (song: Song, how: "finished" | "failed" | "skipped") => void;
    onDropped?: (
      song: Song,
      why: "unavailable" | "too-long" | "too-short" | "removed",
    ) => void;
    /** The queue changed in a way the State file should keep. */
    onChange?: () => void;
  }) {
    this.#providers = providers;
    this.#newId = newId;
    this.#rules = rules ?? {
      defaults: () => FALLBACK_RULE_DEFAULTS,
      blocklist: () => [],
    };
    this.#onStarted = onStarted;
    this.#onEnded = onEnded;
    this.#onDropped = onDropped;
    this.#onChange = onChange;
    this.#paused = initial?.isPaused ?? false;
    this.#volume = initial?.volume ?? 100;

    this.#waiting.push(...(initial?.waiting ?? []));
    // Entries older than the History keeps are dropped on the way in, so a
    // long-closed plugin does not carry them forever.
    this.#history = trimHistory(initial?.history ?? []);
    if (initial?.current) {
      const { song, atStartCheck, started, position } = initial.current;
      this.#current = {
        song,
        atStartCheck,
        started,
        position,
        // It waits, paused, for its Player; `since` starts on the Player's
        // word, and a heard Song resumes where it had played.
        since: undefined,
        resumeAt: started ? position : undefined,
      };
    }

    for (const provider of providers) {
      provider.player.attach({
        ready: () => this.#resume(provider),
        disconnected: () => this.#disconnected(provider),
        loaded: (songId, duration) => this.#loaded(songId, duration),
        ended: (songId) => this.#ended(songId),
        failed: (songId) => this.#failed(songId),
      });
    }
  }

  /** The Song Queue as the State file keeps it. */
  snapshot(): SongQueueSnapshot {
    const current = this.#current;
    return {
      isPaused: this.#paused,
      volume: this.#volume,
      waiting: [...this.#waiting],
      current: current && {
        song: current.song,
        atStartCheck: current.atStartCheck,
        started: current.started,
        position: this.#positionOf(current),
      },
      history: [...this.#history],
    };
  }

  /**
   * How far the Current Song has played, in seconds. Away from its Player
   * nothing of it plays — neither while it waits for one nor through a
   * restart — so only a playing Player moves it on.
   */
  #positionOf(current: CurrentSong): number {
    const playing =
      !this.#paused &&
      current.since !== undefined &&
      this.#playerOf(current.song)?.ready;
    return (
      current.position + (playing ? (Date.now() - current.since!) / 1000 : 0)
    );
  }

  /**
   * A Player that comes back — a Player Page opened again — gets the Current
   * Song again if it is its own, or the next Song if nothing is on air.
   */
  #resume(provider: Provider): void {
    provider.player.setVolume(this.#volume);
    if (this.#current?.song.provider === provider.id) {
      if (this.#current.started && this.#current.resumeAt === undefined) {
        this.#current.resumeAt = this.#positionOf(this.#current);
      }
      this.#start(this.#current, provider.player);
      return;
    }
    this.#advance();
  }

  #disconnected(provider: Provider): void {
    const current = this.#current;
    if (current?.song.provider !== provider.id) return;
    if (current.since !== undefined && !this.#paused) {
      current.position += (Date.now() - current.since) / 1000;
    }
    current.since = undefined;
    current.loaded = false;
    this.#onChange?.();
  }

  /**
   * Its Player tells how long the Song on air is. At its Start Check that
   * decides it: a live stream has no end and is dropped before anything of
   * it is heard (ADR-0005); one outside the duration bounds it was accepted
   * with is dropped as `too-long` or `too-short`, still unheard; any other
   * is unmuted and goes on air.
   */
  #loaded(songId: string, duration: number | undefined): void {
    const current = this.#current;
    if (current?.song.id !== songId) return;

    if (current.atStartCheck) {
      if (duration === undefined) {
        this.#drop(current, true, "unavailable");
        return;
      }
      const bounds = current.song.durationBounds;
      if (bounds?.maxSeconds !== undefined && duration > bounds.maxSeconds) {
        this.#drop(current, true, "too-long");
        return;
      }
      if (bounds?.minSeconds !== undefined && duration < bounds.minSeconds) {
        this.#drop(current, true, "too-short");
        return;
      }
      current.atStartCheck = false;
      current.song = { ...current.song, duration };
      this.#playerOf(current.song)?.unmute(songId);
    }

    current.loaded = true;
    if (!this.#paused) current.since ??= Date.now();
    if (!current.started && !this.#paused) {
      current.started = true;
      this.#onStarted?.(current.song);
    }
    this.#onChange?.();
  }

  /** The Current Song played to its end, if it ever went on air. */
  #ended(songId: string): void {
    const current = this.#current;
    if (current?.song.id !== songId) return;
    if (!current.started) {
      this.#drop(current, false);
      return;
    }
    this.#finish(current, "finished");
  }

  /** A Player error drops a Song before it is heard, or fails it on air. */
  #failed(songId: string): void {
    const current = this.#current;
    if (current?.song.id !== songId) return;
    if (!current.started) {
      this.#drop(current, false);
      return;
    }
    this.#finish(current, "failed");
  }

  /** Every heard Song leaves the air through the same History and Event ordering. */
  #finish(current: CurrentSong, how: HistoryEntry["how"], stop = false): void {
    this.#current = undefined;
    if (stop) this.#playerOf(current.song)?.stop();
    this.#recordHowItLeft(current.song, how);
    this.#onEnded?.(current.song, how);
    this.#onChange?.();
    this.#advance();
  }

  /** A Song that was heard enters the History, newest first. */
  #recordHowItLeft(song: Song, how: "finished" | "failed" | "skipped"): void {
    this.#history = recordInHistory(this.#history, {
      song,
      how,
      at: Date.now(),
    });
  }

  /** The Song goes without being heard; a live Start Check still needs stopping. */
  #drop(
    current: CurrentSong,
    stop: boolean,
    why: "unavailable" | "too-long" | "too-short" | "removed" = "unavailable",
  ): void {
    this.#current = undefined;
    if (stop) this.#playerOf(current.song)?.stop();
    this.#onDropped?.(current.song, why);
    this.#onChange?.();
    this.#advance();
  }

  /** Puts the next Song on air, if its Player can play it now. */
  #advance(): void {
    if (this.#current || this.#paused) return;
    const next = this.#waiting[0];
    const player = next && this.#playerOf(next);
    if (!player?.ready) return;
    this.#waiting.shift();
    this.#current = {
      song: next,
      atStartCheck: next.duration === undefined,
      started: false,
      position: 0,
    };
    this.#onChange?.();
    this.#start(this.#current, player);
  }

  /**
   * Plays the Song on air — muted at its Start Check, from `resumeAt` when
   * the State file brings a heard Song back (ADR-0002), else from its start.
   */
  #start(current: CurrentSong, player: Player): void {
    current.loaded = false;
    current.since = undefined;
    if (current.resumeAt !== undefined) {
      current.position = current.resumeAt;
      player.play(current.song, {
        muted: current.atStartCheck,
        startAt: current.resumeAt,
        paused: this.#paused,
        volume: this.#volume,
      });
      current.resumeAt = undefined;
      return;
    }
    current.position = 0;
    player.play(current.song, {
      muted: current.atStartCheck,
      paused: this.#paused,
      volume: this.#volume,
    });
  }

  #playerOf(song: Song) {
    return this.#providers.find((p) => p.id === song.provider)?.player;
  }

  /** Ends the Current Song; one still at its Start Check was never heard. */
  skip(): Song | undefined {
    const current = this.#current;
    if (!current) return undefined;
    if (!current.started) {
      this.#drop(current, true, "removed");
    } else {
      this.#finish(current, "skipped", true);
    }
    return current.song;
  }

  /** The explicit pause is independent of whether a Player is connected. */
  playback(mode: "pause" | "resume" | "toggle"): boolean {
    const paused =
      mode === "pause"
        ? true
        : mode === "resume"
          ? false
          : mode === "toggle"
            ? !this.#paused
            : this.#paused;
    if (paused === this.#paused) return paused;
    const current = this.#current;
    if (current && paused) {
      current.position = this.#positionOf(current);
      current.since = undefined;
    }
    this.#paused = paused;
    if (current) {
      const player = this.#playerOf(current.song);
      if (paused) player?.pause();
      else {
        player?.resume();
        if (current.loaded && player?.ready) {
          current.since = Date.now();
          if (!current.started) {
            current.started = true;
            this.#onStarted?.(current.song);
          }
        }
      }
    }
    this.#onChange?.();
    if (!paused) this.#advance();
    return paused;
  }

  get volume(): number {
    return this.#volume;
  }

  /** State read by Standalone Query Sources; waiting durations exclude the Current Song. */
  status() {
    const current = this.#current;
    return {
      isPlaying: Boolean(
        current?.started &&
        current.loaded &&
        !this.#paused &&
        this.#playerOf(current.song)?.ready,
      ),
      isPaused: this.#paused,
      playerConnected: this.#providers.some(({ player }) => player.ready),
      currentTitle: current?.song.title ?? "",
      currentRequester: current?.song.requesterName ?? "",
      queueLength: this.#waiting.length,
      queueDuration: this.#waiting.reduce(
        (seconds, song) => seconds + (song.duration ?? 0),
        0,
      ),
      volume: this.#volume,
    };
  }

  setVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    const volume = Math.round(Math.max(0, Math.min(100, value)));
    if (volume === this.#volume) return;
    this.#volume = volume;
    for (const { player } of this.#providers) player.setVolume(volume);
    this.#onChange?.();
  }

  /** Seconds until a waiting Song should start, if every duration it needs is known. */
  #etaOf(song: Song): number | undefined {
    let seconds = 0;

    if (this.#current) {
      const duration = this.#current.song.duration;
      if (duration === undefined) return undefined;
      seconds += Math.max(0, duration - this.#positionOf(this.#current));
    }

    for (const ahead of this.#waiting) {
      if (ahead === song) break;
      if (ahead.duration === undefined) return undefined;
      seconds += ahead.duration;
    }

    return Math.round(seconds);
  }

  async request(
    request: string,
    metadata: RequestMetadata = {
      requesterPlatform: "",
      requesterId: "",
      requesterName: "",
      reference: "",
    },
    options: { overrides?: RequestSongOverrides } = {},
  ): Promise<RequestAnswer> {
    const provider =
      this.#providers.find((p) => p.claims(request)) ?? this.#providers[0];
    const rules = resolveRules(options.overrides, this.#rules.defaults());
    // A search tries candidates through the same Rules as a link. The
    // Provider knows no queue or Rules, only how to ask whether a track passes.
    const refusalOf = (track: Track) =>
      checkRules(rules, {
        track,
        requester: {
          requesterPlatform: metadata.requesterPlatform,
          requesterId: metadata.requesterId,
        },
        waiting: this.#waiting,
        current: this.#current?.song,
        history: this.#history,
        blocklist: this.#rules.blocklist(),
      });
    const resolution = await provider.resolve(request, {
      musicOnly: rules.musicOnly,
      refusalOf,
    });

    if (resolution.kind === "refused") return resolution;

    // Another Request may have changed the Song Queue while this one resolved.
    const reason = refusalOf(resolution.track);
    if (reason) {
      return { kind: "refused", reason };
    }

    const song: Song = {
      ...resolution.track,
      ...metadata,
      id: this.#newId(),
      // The bounds it was accepted with travel with it: without the API
      // Key its duration is learned only at its Start Check (ADR-0005).
      durationBounds: durationBoundsOf(rules),
    };
    this.#waiting.push(song);
    this.#advance();

    const position = this.#waiting.indexOf(song) + 1;
    // Advancing saves a Song that went on air; a waiting Song needs saving
    // too, including when no Player Page has connected yet.
    if (position > 0) this.#onChange?.();
    return {
      kind: "accepted",
      song,
      position,
      eta: position === 0 ? 0 : this.#etaOf(song),
    };
  }
}
