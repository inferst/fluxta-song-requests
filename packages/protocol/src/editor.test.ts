import { describe, expect, it } from "vitest";

import { isEditorMessage, isPluginMessage } from "./editor";

describe("the editors' messages", () => {
  it("accepts an editor asking how the plugin stands", () => {
    expect(isEditorMessage({ event: "get-status" })).toBe(true);
    expect(isEditorMessage({ event: "status" })).toBe(false);
    expect(isEditorMessage({})).toBe(false);
  });

  it("accepts an editor setting the API Key, or removing it", () => {
    expect(isEditorMessage({ event: "set-api-key", apiKey: "AIza…" })).toBe(
      true,
    );
    expect(isEditorMessage({ event: "set-api-key", apiKey: "" })).toBe(true);
    expect(isEditorMessage({ event: "set-api-key" })).toBe(false);
    expect(
      isEditorMessage({ event: "set-api-key", apiKey: "x".repeat(1000) }),
    ).toBe(false);
  });

  it("accepts an editor picking a Region, or going back to the computer's", () => {
    expect(isEditorMessage({ event: "set-region", region: "DE" })).toBe(true);
    expect(isEditorMessage({ event: "set-region", region: null })).toBe(true);
    expect(isEditorMessage({ event: "set-region", region: "Germany" })).toBe(
      false,
    );
  });

  it("accepts an editor setting the Rules' Defaults", () => {
    expect(
      isEditorMessage({
        event: "set-rule-defaults",
        defaults: { longestDurationSeconds: 900 },
      }),
    ).toBe(true);
    expect(
      isEditorMessage({
        event: "set-rule-defaults",
        defaults: { longestDurationSeconds: "forever" },
      }),
    ).toBe(false);
    expect(isEditorMessage({ event: "set-rule-defaults" })).toBe(false);
  });

  it("accepts an editor removing a Blocklist entry", () => {
    expect(
      isEditorMessage({
        event: "remove-blocklist-entry",
        entry: { kind: "track", provider: "youtube", trackId: "x" },
      }),
    ).toBe(true);
    expect(
      isEditorMessage({
        event: "remove-blocklist-entry",
        entry: { kind: "channel", channelUrl: "https://www.youtube.com/@x" },
      }),
    ).toBe(true);
    expect(
      isEditorMessage({
        event: "remove-blocklist-entry",
        entry: { kind: "channel" },
      }),
    ).toBe(false);
  });

  it("accepts an editor setting the Fallback Playlist, or removing it", () => {
    expect(
      isEditorMessage({
        event: "set-fallback-playlist",
        playlist: "https://www.youtube.com/playlist?list=PLx0sYbCqOb8",
      }),
    ).toBe(true);
    expect(
      isEditorMessage({ event: "set-fallback-playlist", playlist: "" }),
    ).toBe(true);
    expect(isEditorMessage({ event: "set-fallback-playlist" })).toBe(false);
    expect(
      isEditorMessage({
        event: "set-fallback-playlist",
        playlist: "x".repeat(1000),
      }),
    ).toBe(false);
  });

  it("accepts a channel's Provider id when removing its Blocklist entry", () => {
    const entry = {
      kind: "channel",
      provider: "fake",
      channelId: "channel-1",
      channelUrl: "fake://channel",
    };
    expect(isEditorMessage({ event: "remove-blocklist-entry", entry })).toBe(
      true,
    );
  });

  it("accepts the status the sidecar sends, and nothing short of it", () => {
    const status = {
      playerUrl: "http://localhost:29362/player?key=k",
      playerConnected: true,
      apiKey: { state: "spent", masked: "••••ijkl", resetsAt: 1793257200000 },
      region: { chosen: null, system: "US" },
      stateFile: { recovered: false },
      defaults: {
        requestsOpen: true,
        longestDurationSeconds: 600,
        waitingPerRequester: 3,
        queueSize: 50,
        alreadyQueued: "refuse",
        playedWithinSeconds: 3600,
        musicOnly: false,
      },
      blocklist: [
        { kind: "track", provider: "youtube", trackId: "x" },
        { kind: "channel", channelUrl: "https://www.youtube.com/@x" },
      ],
      fallbackPlaylist: "https://www.youtube.com/playlist?list=PLx0sYbCqOb8",
    };

    expect(isPluginMessage({ event: "status", status })).toBe(true);
    expect(
      isPluginMessage({ event: "status", status: { playerConnected: true } }),
    ).toBe(false);
    expect(
      isPluginMessage({
        event: "status",
        status: { ...status, apiKey: { state: "lost", masked: "" } },
      }),
    ).toBe(false);
    expect(isPluginMessage({ event: "get-status" })).toBe(false);
  });
});
