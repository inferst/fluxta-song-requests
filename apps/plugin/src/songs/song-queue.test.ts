import { describe, expect, it } from "vitest";

import type { Player, PlayerEvents, Provider, Song } from "./provider";
import { SongQueue } from "./song-queue";

/** A Player whose page the test connects and whose Songs it ends. */
class FakePlayer implements Player {
  ready = false;
  readonly played: string[] = [];
  #events?: PlayerEvents;

  play(song: Song) {
    this.played.push(song.title);
  }

  attach(events: PlayerEvents) {
    this.#events = events;
  }

  connect() {
    this.ready = true;
    this.#events?.ready();
  }

  end(song: Song) {
    this.#events?.ended(song.id);
  }

  fail(song: Song) {
    this.#events?.failed(song.id);
  }
}

/**
 * A Provider that knows nothing of YouTube: it claims `<id>:<title>`,
 * refuses `<id>:refuse` as not found, and takes anything else whole as the
 * title — the way a default Provider answers search words.
 */
function fakeProvider(id: string, player = new FakePlayer()) {
  const provider: Provider = {
    id,
    player,
    claims: (request) => request.startsWith(`${id}:`),
    async resolve(request) {
      const prefix = `${id}:`;
      const title = request.startsWith(prefix)
        ? request.slice(prefix.length)
        : request;
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
        },
      };
    },
  };
  return { provider, player };
}

function songQueue(...providers: Provider[]) {
  let next = 0;
  return new SongQueue({ providers, newId: () => `song-${++next}` });
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
