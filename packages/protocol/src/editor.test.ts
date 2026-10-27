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

  it("accepts the status the sidecar sends, and nothing short of it", () => {
    const status = {
      playerUrl: "http://localhost:29362/player?key=k",
      playerConnected: true,
      apiKey: { state: "spent", masked: "••••ijkl", resetsAt: 1793257200000 },
      region: { chosen: null, system: "US" },
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
