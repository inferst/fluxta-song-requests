import { describe, expect, it } from "vitest";

import type { Track } from "../songs/provider";
import { DataApi } from "./data-api";
import { keylessPlaylistTracks, playlistTracks } from "./playlist";

const KEY = "AIzaSyTestKey-0123456789abcdefghijkl";
const PLAYLIST = "PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A `fetch` that answers every call with the next of `answers`, and records each call. */
function youtube(...answers: (Response | Error)[]) {
  const calls: URL[] = [];
  const fetch = async (input: string | URL | Request) => {
    calls.push(new URL(String(input)));
    const answer = answers.shift() ?? new Error("no answer left");
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { fetch, calls };
}

/** A `playlistItems.list` page, `videoId`less entries standing for deleted videos. */
function playlistPage(
  videoIds: (string | undefined)[],
  nextPageToken?: string,
) {
  return json({
    items: videoIds.map((videoId) => ({
      contentDetails: videoId === undefined ? {} : { videoId },
    })),
    ...(nextPageToken ? { nextPageToken } : {}),
  });
}

/** A `videos.list` page of playable videos, except as `overrides` say. */
function videosPage(
  ids: string[],
  overrides: Record<
    string,
    Partial<{ embeddable: boolean; title: string }>
  > = {},
) {
  return json({
    items: ids.map((id) => {
      const override = overrides[id] ?? {};
      return {
        id,
        snippet: {
          title: override.title ?? `Title ${id}`,
          channelTitle: "Channel",
        },
        contentDetails: { duration: "PT3M33S" },
        status: { embeddable: override.embeddable ?? true },
      };
    }),
  });
}

describe("learning the Fallback Playlist through the Data API", () => {
  it("reads 120 tracks at a unit per 50 for each of playlistItems.list and videos.list", async () => {
    const ids = Array.from({ length: 120 }, (_, at) =>
      `video${at}`.padEnd(11, "x"),
    );
    const { fetch, calls } = youtube(
      playlistPage(ids.slice(0, 50), "page-2"),
      playlistPage(ids.slice(50, 100), "page-3"),
      playlistPage([undefined, ...ids.slice(100, 120)]),
      videosPage(ids.slice(0, 50)),
      videosPage(ids.slice(50, 100)),
      videosPage(ids.slice(100, 120)),
    );
    const api = new DataApi({ fetch });
    api.setKey(KEY);

    const tracks = await playlistTracks(api, PLAYLIST, "US");

    // Three playlistItems.list pages and three videos.list pages — a unit
    // per 50 tracks for each, nothing more.
    expect(calls).toHaveLength(6);
    expect(
      calls.filter((url) => url.pathname.endsWith("/playlistItems")),
    ).toHaveLength(3);
    expect(
      calls.filter((url) => url.pathname.endsWith("/videos")),
    ).toHaveLength(3);
    expect(calls[0].searchParams.get("playlistId")).toBe(PLAYLIST);
    expect(calls[0].searchParams.get("maxResults")).toBe("50");
    expect(calls[1].searchParams.get("pageToken")).toBe("page-2");
    expect(calls[2].searchParams.get("pageToken")).toBe("page-3");
    const videosCalls = calls.filter((url) => url.pathname.endsWith("/videos"));
    expect(
      videosCalls.map((call) => call.searchParams.get("id")!.split(",").length),
    ).toEqual([50, 50, 20]);

    // The entry without a video id is left out with the deleted video.
    expect(tracks).toHaveLength(120);
    expect(tracks[0]).toMatchObject({
      provider: "youtube",
      trackId: ids[0],
      duration: 213,
    });
  });

  it("leaves out what cannot play, whatever playlistItems.list listed", async () => {
    const playable = "dQw4w9WgXcQ";
    const notEmbeddable = "vZLd81IHGQw";
    const gone = "xxxxxxxxxxx";
    const { fetch } = youtube(
      playlistPage([playable, notEmbeddable, gone]),
      videosPage([playable, notEmbeddable], {
        [notEmbeddable]: { embeddable: false },
      }),
    );
    const api = new DataApi({ fetch });
    api.setKey(KEY);

    const tracks = await playlistTracks(api, PLAYLIST, "US");

    expect(tracks.map((track) => track.trackId)).toEqual([playable]);
  });

  it("answers no tracks without a usable key and asks YouTube nothing", async () => {
    const { fetch, calls } = youtube();
    const api = new DataApi({ fetch });

    expect(await playlistTracks(api, PLAYLIST, "US")).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("the Fallback Playlist learned from the player", () => {
  it("makes a track of each listed id — nothing but the link is known", () => {
    expect(keylessPlaylistTracks(["dQw4w9WgXcQ", "video2xxxxx"])).toEqual<
      Track[]
    >([
      {
        provider: "youtube",
        trackId: "dQw4w9WgXcQ",
        title: "",
        channel: "",
        channelUrl: "",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
      {
        provider: "youtube",
        trackId: "video2xxxxx",
        title: "",
        channel: "",
        channelUrl: "",
        url: "https://www.youtube.com/watch?v=video2xxxxx",
      },
    ]);
  });
});
