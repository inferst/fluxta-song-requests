import { describe, expect, it } from "vitest";

import { isPageMessage, isSidecarMessage } from "./page";

describe("the Player Page's messages", () => {
  it("accepts a page saying a Song ended or could not play", () => {
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
    expect(isPageMessage("ended")).toBe(false);
    expect(isPageMessage(null)).toBe(false);
  });

  it("accepts the sidecar telling a page to load a video", () => {
    expect(
      isSidecarMessage({ event: "load", songId: "s1", videoId: "dQw4w9WgXcQ" }),
    ).toBe(true);
    expect(isSidecarMessage({ event: "load", songId: "s1" })).toBe(false);
    expect(isSidecarMessage({ event: "ended", songId: "s1" })).toBe(false);
  });
});
