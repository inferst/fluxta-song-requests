import { describe, expect, it } from "vitest";

import { isPageMessage, isSidecarMessage } from "./page";

describe("the Player Page's messages", () => {
  it("accepts a page saying a Song plays, ended or could not play", () => {
    expect(
      isPageMessage({
        event: "loaded",
        songId: "s1",
        duration: 213.1,
        live: false,
      }),
    ).toBe(true);
    expect(isPageMessage({ event: "ended", songId: "s1" })).toBe(true);
    expect(isPageMessage({ event: "error", songId: "s1", code: 150 })).toBe(
      true,
    );
  });

  it("refuses anything else a page might send", () => {
    expect(isPageMessage({ event: "ended" })).toBe(false);
    expect(isPageMessage({ event: "error", songId: "s1", code: "150" })).toBe(
      false,
    );
    expect(isPageMessage({ event: "load", songId: "s1" })).toBe(false);
    expect(
      isPageMessage({ event: "loaded", songId: "s1", duration: 213 }),
    ).toBe(false);
    expect(isPageMessage("ended")).toBe(false);
    expect(isPageMessage(null)).toBe(false);
  });

  it("accepts the sidecar telling a page to load a video, unmute it or stop", () => {
    expect(
      isSidecarMessage({
        event: "load",
        songId: "s1",
        videoId: "dQw4w9WgXcQ",
        muted: true,
      }),
    ).toBe(true);
    expect(isSidecarMessage({ event: "unmute", songId: "s1" })).toBe(true);
    expect(isSidecarMessage({ event: "stop" })).toBe(true);

    expect(
      isSidecarMessage({ event: "load", songId: "s1", videoId: "dQw4w9WgXcQ" }),
    ).toBe(false);
    expect(isSidecarMessage({ event: "unmute" })).toBe(false);
    expect(isSidecarMessage({ event: "ended", songId: "s1" })).toBe(false);
  });
});
