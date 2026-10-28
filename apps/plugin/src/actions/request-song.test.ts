import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { RequestSongSettings } from "song-requests-protocol";
import { describe, expect, it } from "vitest";

import type { Player, Provider } from "../songs/provider";
import { SongQueue } from "../songs/song-queue";
import { RequestSongAction } from "./request-song";

const idlePlayer: Player = {
  ready: false,
  play: () => {},
  unmute: () => {},
  stop: () => {},
  attach: () => {},
};

/**
 * Claims `fake:<title>`, with `@<seconds>` after the title when it knows the
 * track's duration; refuses `fake:refuse`, and records what it was asked.
 */
function fakeProvider() {
  const asked: string[] = [];
  const provider: Provider = {
    id: "fake",
    player: idlePlayer,
    claims: (request) => request.startsWith("fake:"),
    async resolve(request) {
      asked.push(request);
      const [title, seconds] = request.slice("fake:".length).split("@");
      if (title === "refuse") return { kind: "refused", reason: "not-found" };
      return {
        kind: "track",
        track: {
          provider: "fake",
          trackId: title,
          title,
          channel: "Some Channel",
          channelUrl: "fake://channel",
          url: `fake://${title}`,
          duration: seconds === undefined ? undefined : Number(seconds),
        },
      };
    },
  };
  return { provider, asked };
}

function requestSong() {
  const { provider, asked } = fakeProvider();
  let next = 0;
  const queue = new SongQueue({
    providers: [provider],
    newId: () => `song-${++next}`,
  });
  const action = new RequestSongAction(queue);
  const run = (settings: Record<string, unknown>) =>
    action.onTrigger(
      new StandaloneTriggerContext<RequestSongSettings>(
        "instance",
        settings as RequestSongSettings,
      ),
    );
  return { run, asked };
}

describe("Request Song", () => {
  it("produces the accepted Song and its place for a chat reply", async () => {
    const { run } = requestSong();
    await run({ request: "fake:first" });

    expect(await run({ request: "  fake:second " })).toEqual({
      outcome: "accepted",
      songId: "song-2",
      title: "second",
      channel: "Some Channel",
      url: "fake://second",
      position: 2,
    });
  });

  it("produces the Song's duration and when it should start, once they are known", async () => {
    const { run } = requestSong();
    await run({ request: "fake:first@200" });

    expect(await run({ request: "fake:second@100" })).toEqual({
      outcome: "accepted",
      songId: "song-2",
      title: "second",
      channel: "Some Channel",
      url: "fake://second",
      position: 2,
      duration: 100,
      eta: 200,
    });
  });

  it("produces only the outcome and the reason for a refused Request", async () => {
    const { run } = requestSong();

    expect(await run({ request: "fake:refuse" })).toEqual({
      outcome: "refused",
      reason: "not-found",
    });
  });

  it("refuses an empty Request without asking any Provider", async () => {
    const { run, asked } = requestSong();

    expect(await run({})).toEqual({ outcome: "refused", reason: "not-found" });
    expect(await run({ request: "   " })).toEqual({
      outcome: "refused",
      reason: "not-found",
    });
    expect(asked).toEqual([]);
  });

  it("reads a Request a Run Variable turned into a number", async () => {
    const { run, asked } = requestSong();

    await run({ request: 42 });

    // 42 is no one's link, so the default Provider gets it, as text.
    expect(asked).toEqual(["42"]);
  });
});
