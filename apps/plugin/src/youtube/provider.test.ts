import { describe, expect, it } from "vitest";

import type { Player } from "../songs/provider";
import { createYouTubeProvider } from "./provider";

const ID = "dQw4w9WgXcQ";
const LINK = `https://youtu.be/${ID}`;

const idlePlayer: Player = {
  ready: false,
  play: () => {},
  attach: () => {},
};

/** A `fetch` that answers oEmbed by the video id the request carries. */
function oEmbed(answers: Record<string, Response | Error>) {
  const requested: string[] = [];
  const fetch = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const target = new URL(url.searchParams.get("url") ?? "");
    const id = target.searchParams.get("v") ?? "";
    requested.push(id);
    const answer = answers[id];
    if (answer instanceof Error) throw answer;
    return answer ?? new Response("Not Found", { status: 404 });
  };
  return { fetch, requested };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("the YouTube Provider", () => {
  it("claims YouTube links and nothing else", () => {
    const youtube = createYouTubeProvider({
      fetch: oEmbed({}).fetch,
      player: idlePlayer,
    });

    expect(youtube.claims(LINK)).toBe(true);
    expect(youtube.claims("never gonna give you up")).toBe(false);
    expect(youtube.claims(`https://example.com/watch?v=${ID}`)).toBe(false);
  });

  it("turns a link into a track with oEmbed's title and channel", async () => {
    const { fetch } = oEmbed({
      [ID]: json({
        title: "Rick Astley - Never Gonna Give You Up",
        author_name: "Rick Astley",
        author_url: "https://www.youtube.com/@RickAstleyYT",
      }),
    });
    const youtube = createYouTubeProvider({ fetch, player: idlePlayer });

    expect(await youtube.resolve(LINK)).toEqual({
      kind: "track",
      track: {
        provider: "youtube",
        trackId: ID,
        title: "Rick Astley - Never Gonna Give You Up",
        channel: "Rick Astley",
        channelUrl: "https://www.youtube.com/@RickAstleyYT",
        url: `https://www.youtube.com/watch?v=${ID}`,
      },
    });
  });

  it.each([
    [400, "not-found"],
    [404, "not-found"],
    [401, "not-embeddable"],
    [403, "not-embeddable"],
    [500, "provider-unavailable"],
  ])("refuses a video oEmbed answers %i for as %s", async (status, reason) => {
    const { fetch } = oEmbed({ [ID]: new Response("", { status }) });
    const youtube = createYouTubeProvider({ fetch, player: idlePlayer });

    expect(await youtube.resolve(LINK)).toEqual({ kind: "refused", reason });
  });

  it("refuses as provider-unavailable when oEmbed cannot be reached", async () => {
    const { fetch } = oEmbed({ [ID]: new TypeError("fetch failed") });
    const youtube = createYouTubeProvider({ fetch, player: idlePlayer });

    expect(await youtube.resolve(LINK)).toEqual({
      kind: "refused",
      reason: "provider-unavailable",
    });
  });

  it("refuses search words as no-api-key without asking YouTube", async () => {
    const { fetch, requested } = oEmbed({});
    const youtube = createYouTubeProvider({ fetch, player: idlePlayer });

    expect(await youtube.resolve("never gonna give you up")).toEqual({
      kind: "refused",
      reason: "no-api-key",
    });
    expect(requested).toEqual([]);
  });
});
