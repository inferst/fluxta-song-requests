import { describe, expect, it } from "vitest";

import type { PlayerEvents, Song } from "../songs/provider";
import { PagePlayer, type PageSocket } from "./page-player";

/** One Player Page's socket, as the test drives it. */
class FakeSocket implements PageSocket {
  readonly sent: unknown[] = [];
  closed = false;
  #onMessage?: (text: string) => void;
  #onClose?: () => void;

  send(text: string) {
    this.sent.push(JSON.parse(text));
  }

  close() {
    this.closed = true;
    this.#onClose?.();
  }

  onMessage(listener: (text: string) => void) {
    this.#onMessage = listener;
  }

  onClose(listener: () => void) {
    this.#onClose = listener;
  }

  /** The page sends this. */
  says(message: unknown) {
    this.#onMessage?.(
      typeof message === "string" ? message : JSON.stringify(message),
    );
  }
}

/** What the Song Queue hears from the Player. */
function listen(player: PagePlayer) {
  const heard: string[] = [];
  const events: PlayerEvents = {
    ready: () => heard.push("ready"),
    loaded: (songId, duration) => heard.push(`loaded ${songId} ${duration}`),
    ended: (songId) => heard.push(`ended ${songId}`),
    failed: (songId) => heard.push(`failed ${songId}`),
  };
  player.attach(events);
  return heard;
}

const song: Song = {
  id: "song-1",
  provider: "youtube",
  trackId: "dQw4w9WgXcQ",
  title: "Never Gonna Give You Up",
  channel: "Rick Astley",
  channelUrl: "https://www.youtube.com/@RickAstleyYT",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  requesterPlatform: "",
  requesterId: "",
  requesterName: "",
  reference: "",
};

describe("the Player Page's Player", () => {
  it("is ready once a page connects, and says so", () => {
    const player = new PagePlayer();
    const heard = listen(player);
    const connected: boolean[] = [];
    player.onConnectionChange((value) => connected.push(value));

    expect(player.ready).toBe(false);

    player.connect(new FakeSocket());

    expect(player.ready).toBe(true);
    expect(heard).toEqual(["ready"]);
    expect(connected).toEqual([true]);
  });

  it("tells the page to load a Song, and passes on how it went", () => {
    const player = new PagePlayer();
    const heard = listen(player);
    const page = new FakeSocket();
    player.connect(page);

    player.play(song, { muted: false });
    expect(page.sent).toEqual([
      {
        event: "load",
        songId: "song-1",
        videoId: "dQw4w9WgXcQ",
        muted: false,
        startAt: 0,
      },
    ]);

    page.says({ event: "ended", songId: "song-1" });
    page.says({ event: "error", songId: "song-2", code: 150 });
    page.says({ event: "ended" });
    page.says("not json");
    expect(heard).toEqual(["ready", "ended song-1", "failed song-2"]);
  });

  it("plays a Song muted for its Start Check, then unmutes or stops it", () => {
    const player = new PagePlayer();
    listen(player);
    const page = new FakeSocket();
    player.connect(page);

    player.play(song, { muted: true });
    player.unmute("song-1");
    player.stop();

    expect(page.sent).toEqual([
      {
        event: "load",
        songId: "song-1",
        videoId: "dQw4w9WgXcQ",
        muted: true,
        startAt: 0,
      },
      { event: "unmute", songId: "song-1" },
      { event: "stop" },
    ]);
  });

  it("passes on how long a Song is, in whole seconds, and none for a live stream", () => {
    const player = new PagePlayer();
    const heard = listen(player);
    const page = new FakeSocket();
    player.connect(page);

    page.says({
      event: "loaded",
      songId: "song-1",
      duration: 212.6,
      live: false,
    });
    // The player gives a live stream's time on air as its duration.
    page.says({
      event: "loaded",
      songId: "song-2",
      duration: 5400,
      live: true,
    });

    expect(heard).toEqual([
      "ready",
      "loaded song-1 213",
      "loaded song-2 undefined",
    ]);
  });

  it("is no longer ready once its page closes", () => {
    const player = new PagePlayer();
    listen(player);
    const connected: boolean[] = [];
    player.onConnectionChange((value) => connected.push(value));
    const page = new FakeSocket();
    player.connect(page);

    page.close();

    expect(player.ready).toBe(false);
    expect(connected).toEqual([true, false]);
  });

  it("lets a new page replace the one before it", () => {
    const player = new PagePlayer();
    const heard = listen(player);
    const connected: boolean[] = [];
    player.onConnectionChange((value) => connected.push(value));
    const before = new FakeSocket();
    const after = new FakeSocket();
    player.connect(before);

    player.connect(after);
    player.play(song, { muted: false });
    before.says({ event: "ended", songId: "song-1" });

    expect(before.closed).toBe(true);
    expect(before.sent).toEqual([]);
    expect(after.sent).toHaveLength(1);
    expect(player.ready).toBe(true);
    expect(heard).toEqual(["ready", "ready"]);
    expect(connected.at(-1)).toBe(true);
  });
});
