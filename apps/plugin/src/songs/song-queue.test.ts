import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Player, PlayerEvents, Provider, Song } from "./provider";
import { SongQueue, type RequestAnswer } from "./song-queue";

/** A Player whose page the test connects and whose Songs it loads and ends. */
class FakePlayer implements Player {
  ready = false;
  /** The titles of the Songs it was told to play. */
  readonly played: string[] = [];
  /** Everything it was told, in order: `play one`, `play one muted`, `unmute one`, `stop`. */
  readonly told: string[] = [];
  readonly #titles = new Map<string, string>();
  #events?: PlayerEvents;

  play(song: Song, { muted }: { muted: boolean }) {
    this.played.push(song.title);
    this.told.push(`play ${song.title}${muted ? " muted" : ""}`);
    this.#titles.set(song.id, song.title);
  }

  unmute(songId: string) {
    this.told.push(`unmute ${this.#titles.get(songId)}`);
  }

  stop() {
    this.told.push("stop");
  }

  attach(events: PlayerEvents) {
    this.#events = events;
  }

  connect() {
    this.ready = true;
    this.#events?.ready();
  }

  /** The Song plays, and is this long — `undefined` for a live stream. */
  load(song: Song, duration: number | undefined) {
    this.#events?.loaded(song.id, duration);
  }

  end(song: Song) {
    this.#events?.ended(song.id);
  }

  fail(song: Song) {
    this.#events?.failed(song.id);
  }
}

/**
 * A Provider that knows nothing of YouTube: it claims `<id>:<title>`, with
 * `@<seconds>` after the title when it knows the track's duration — without,
 * the Song has its Start Check. It refuses `<id>:refuse` as not found, and
 * takes anything else whole as the title — the way a default Provider
 * answers search words.
 */
function fakeProvider(id: string, player = new FakePlayer()) {
  const provider: Provider = {
    id,
    player,
    claims: (request) => request.startsWith(`${id}:`),
    async resolve(request) {
      const prefix = `${id}:`;
      const text = request.startsWith(prefix)
        ? request.slice(prefix.length)
        : request;
      const [title, seconds] = text.split("@");
      if (title === "refuse") return { kind: "refused", reason: "not-found" };
      return {
        kind: "track",
        track: {
          provider: id,
          trackId: title,
          title,
          channel: `${id} channel`,
          channelUrl: `${id}://channel`,
          url: `${id}://${title}`,
          duration: seconds === undefined ? undefined : Number(seconds),
        },
      };
    },
  };
  return { provider, player };
}

function songOf(answer: RequestAnswer): Song {
  if (answer.kind !== "accepted") throw new Error(`refused: ${answer.reason}`);
  return answer.song;
}

function songQueue(...providers: Provider[]) {
  let next = 0;
  return new SongQueue({ providers, newId: () => `song-${++next}` });
}

type HeardSongEvent =
  | { event: "started"; song: Song }
  | { event: "ended"; song: Song; how: "finished" | "failed" }
  | { event: "dropped"; song: Song; why: "unavailable" };

function eventQueue(...providers: Provider[]) {
  let next = 0;
  const heard: HeardSongEvent[] = [];
  const queue = new SongQueue({
    providers,
    newId: () => `song-${++next}`,
    onStarted: (song) => heard.push({ event: "started", song }),
    onEnded: (song, how) => heard.push({ event: "ended", song, how }),
    onDropped: (song, why) => heard.push({ event: "dropped", song, why }),
  });
  return { queue, heard };
}

describe("the Song Queue", () => {
  it("puts accepted Songs In turn and waits while no Player is ready", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);

    expect(await queue.request("fake:one")).toMatchObject({
      kind: "accepted",
      position: 1,
      song: { id: "song-1", title: "one", provider: "fake" },
    });
    expect(await queue.request("fake:two")).toMatchObject({
      kind: "accepted",
      position: 2,
    });
    expect(player.played).toEqual([]);
  });

  it("plays the first Song once its Player is ready, then the next when it ends", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    const first = await queue.request("fake:one");
    await queue.request("fake:two");

    player.connect();
    expect(player.played).toEqual(["one"]);

    if (first.kind === "accepted") player.end(first.song);
    expect(player.played).toEqual(["one", "two"]);
  });

  it("puts a Song on air at once when nothing plays and its Player is ready", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();

    expect(await queue.request("fake:one")).toMatchObject({
      kind: "accepted",
      position: 0,
    });
    expect(await queue.request("fake:two")).toMatchObject({ position: 1 });
    expect(player.played).toEqual(["one"]);
  });

  it("gives a Song that cannot play up for the next one", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const first = await queue.request("fake:one");
    await queue.request("fake:two");

    if (first.kind === "accepted") player.fail(first.song);
    expect(player.played).toEqual(["one", "two"]);
  });

  it("plays the Current Song again when its Player comes back", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    await queue.request("fake:one");
    await queue.request("fake:two");

    player.ready = false;
    player.connect();
    expect(player.played).toEqual(["one", "one"]);
  });

  it("plays the Songs of two Providers in order, each on its own Player", async () => {
    const tube = fakeProvider("tube");
    const wave = fakeProvider("wave");
    const queue = songQueue(tube.provider, wave.provider);
    wave.player.connect();

    const one = await queue.request("tube:one");
    const two = await queue.request("wave:two");
    await queue.request("tube:three");

    // The first Song's Player is not ready: the queue waits for it rather
    // than letting a later Song jump ahead on another Player.
    expect(wave.player.played).toEqual([]);

    tube.player.connect();
    expect(tube.player.played).toEqual(["one"]);

    if (one.kind === "accepted") tube.player.end(one.song);
    expect(wave.player.played).toEqual(["two"]);

    if (two.kind === "accepted") wave.player.end(two.song);
    expect(tube.player.played).toEqual(["one", "three"]);
  });

  it("hands a Request no Provider claims to the first, the default one", async () => {
    const tube = fakeProvider("tube");
    const wave = fakeProvider("wave");
    const queue = songQueue(tube.provider, wave.provider);

    expect(await queue.request("wave:two")).toMatchObject({
      song: { provider: "wave" },
    });
    expect(await queue.request("tube:refuse")).toEqual({
      kind: "refused",
      reason: "not-found",
    });
    // "plain words" is no one's link, so the default Provider gets it whole.
    expect(await queue.request("plain words")).toMatchObject({
      song: { provider: "tube", title: "plain words" },
    });
  });

  it("queues nothing for a refused Request", async () => {
    const { provider } = fakeProvider("fake");
    const queue = songQueue(provider);

    await queue.request("fake:refuse");
    expect(await queue.request("fake:one")).toMatchObject({ position: 1 });
  });

  it("ignores a Player reporting on a Song that is no longer on air", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const first = await queue.request("fake:one");
    await queue.request("fake:two");
    await queue.request("fake:three");

    if (first.kind === "accepted") {
      player.end(first.song);
      player.end(first.song);
    }
    expect(player.played).toEqual(["one", "two"]);
  });
});

describe("the Song's Events", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires Started once the Player loads a Song, then Ended as finished", async () => {
    const { provider, player } = fakeProvider("fake");
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));

    expect(heard).toEqual([]);

    player.load(one, 200);
    player.load(one, 200);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({
      event: "started",
      song: { id: "song-1", duration: 200 },
    });

    player.end(one);
    expect(heard).toHaveLength(2);
    expect(heard[1]).toMatchObject({
      event: "ended",
      song: { id: "song-1" },
      how: "finished",
    });
  });

  it("fires Ended as failed when the Player breaks on air", async () => {
    const { provider, player } = fakeProvider("fake");
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);

    player.fail(one);

    expect(heard.map(({ event }) => event)).toEqual(["started", "ended"]);
    expect(heard[1]).toMatchObject({ how: "failed" });
  });

  it("drops a Song its Player cannot load, without Started or Ended", async () => {
    const { provider, player } = fakeProvider("fake");
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    const two = songOf(await queue.request("fake:two@100"));

    player.fail(one);
    expect(heard).toEqual([
      { event: "dropped", song: one, why: "unavailable" },
    ]);

    player.load(two, 100);
    expect(heard.map(({ event }) => event)).toEqual(["dropped", "started"]);
  });

  it("fires Started only after a Start Check lets the Song be heard", async () => {
    const { provider, player } = fakeProvider("fake");
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));

    expect(heard).toEqual([]);

    player.load(one, 180);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({
      event: "started",
      song: { id: "song-1", duration: 180 },
    });
    expect(player.told).toEqual(["play one muted", "unmute one"]);
  });

  it("drops a live stream at its Start Check as unavailable", async () => {
    const { provider, player } = fakeProvider("fake");
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const live = songOf(await queue.request("fake:live"));

    player.load(live, undefined);

    expect(heard).toEqual([
      { event: "dropped", song: live, why: "unavailable" },
    ]);
  });

  it("does not fire Started again when its Player comes back", async () => {
    const { provider, player } = fakeProvider("fake");
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));
    player.load(one, 200);

    player.ready = false;
    player.connect();
    player.load(one, 200);

    expect(heard.map(({ event }) => event)).toEqual(["started"]);
  });

  it("fires nothing while a Song buffers through a network drop", async () => {
    const { provider, player } = fakeProvider("fake");
    const { queue, heard } = eventQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);

    vi.advanceTimersByTime(10 * 60_000);
    expect(heard.map(({ event }) => event)).toEqual(["started"]);

    player.end(one);
    expect(heard.map(({ event }) => event)).toEqual(["started", "ended"]);
    expect(heard[1]).toMatchObject({ how: "finished" });
  });
});

describe("the Start Check", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is not needed by a Song whose duration is known", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();

    await queue.request("fake:one@200");

    expect(player.told).toEqual(["play one"]);
  });

  it("starts a Song of unknown duration muted, and lets it be heard once its Player tells it", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));

    expect(player.told).toEqual(["play one muted"]);

    player.load(one, 200);
    expect(player.told).toEqual(["play one muted", "unmute one"]);
  });

  it("drops a live stream unheard, and plays the next Song", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const live = songOf(await queue.request("fake:live"));
    await queue.request("fake:two@100");

    player.load(live, undefined);

    expect(player.told).not.toContain("unmute live");
    expect(player.played).toEqual(["live", "two"]);
    expect(player.told.at(-1)).toBe("play two");
  });

  it("stops a dropped Song when no Song follows it", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const live = songOf(await queue.request("fake:live"));

    player.load(live, undefined);

    expect(player.told).toEqual(["play live muted", "stop"]);
  });

  it("waits for its Player to tell the duration, however long that takes", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));
    await queue.request("fake:two@100");

    // A network drop leaves the player buffering, with no error (spike #3).
    vi.advanceTimersByTime(10 * 60_000);
    expect(player.told).toEqual(["play one muted"]);

    player.load(one, 200);
    expect(player.told).toEqual(["play one muted", "unmute one"]);
  });

  it("plays a Song that passed its Start Check as it is when its Player comes back", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));
    player.load(one, 200);

    player.ready = false;
    player.connect();

    expect(player.told.at(-1)).toBe("play one");
  });

  it("drops a Song its Player refuses at load, and plays the next", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));
    await queue.request("fake:two@100");

    player.fail(one);

    expect(player.told).toEqual(["play one muted", "play two"]);
  });

  it("ignores what a Player says of a Song no longer on air", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));
    await queue.request("fake:two");
    player.fail(one);

    player.load(one, 200);
    player.load(one, undefined);

    expect(player.told).toEqual(["play one muted", "play two muted"]);
  });
});

describe("how long until a Song should start", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is what is left of the Current Song and every Song ahead", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = await queue.request("fake:one@200");
    expect(one).toMatchObject({ position: 0, eta: 0 });

    expect(await queue.request("fake:two@100")).toMatchObject({ eta: 200 });

    player.load(songOf(one), 200);
    vi.advanceTimersByTime(50_000);
    expect(await queue.request("fake:three@60")).toMatchObject({ eta: 250 });
  });

  it("counts Songs waiting for their Player in full", async () => {
    const { provider } = fakeProvider("fake");
    const queue = songQueue(provider);

    expect(await queue.request("fake:one@200")).toMatchObject({
      position: 1,
      eta: 0,
    });
    vi.advanceTimersByTime(50_000);
    expect(await queue.request("fake:two@100")).toMatchObject({ eta: 200 });
  });

  it("counts the Current Song in full while its Player is away, since it plays again from its start", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one@200"));
    player.load(one, 200);
    vi.advanceTimersByTime(50_000);

    player.ready = false;
    vi.advanceTimersByTime(60_000);

    expect(await queue.request("fake:two@100")).toMatchObject({ eta: 200 });
  });

  it("counts a duration learned at the Start Check", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    const one = songOf(await queue.request("fake:one"));
    player.load(one, 180);
    vi.advanceTimersByTime(30_000);

    expect(await queue.request("fake:two@60")).toMatchObject({ eta: 150 });
  });

  it("is not known while a duration it needs is not", async () => {
    const { provider } = fakeProvider("fake");
    const queue = songQueue(provider);

    await queue.request("fake:one@100");
    const unknown = await queue.request("fake:unknown");
    const after = await queue.request("fake:after@60");

    // Its own duration is not needed to know when a Song should start.
    expect(unknown).toMatchObject({ eta: 100 });
    expect(after.kind === "accepted" && after.eta).toBe(undefined);
  });

  it("is not known while the Current Song's duration is not", async () => {
    const { provider, player } = fakeProvider("fake");
    const queue = songQueue(provider);
    player.connect();
    await queue.request("fake:one");

    const two = await queue.request("fake:two@60");

    expect(two).toMatchObject({ position: 1 });
    expect(two.kind === "accepted" && two.eta).toBe(undefined);
  });
});
