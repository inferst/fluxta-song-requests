import { describe, expect, it } from "vitest";

import { isEditorMessage, isPluginMessage } from "./editor";

describe("the editors' messages", () => {
  it("accepts an editor asking how the plugin stands", () => {
    expect(isEditorMessage({ event: "get-status" })).toBe(true);
    expect(isEditorMessage({ event: "status" })).toBe(false);
    expect(isEditorMessage({})).toBe(false);
  });

  it("accepts the status the sidecar sends, and nothing short of it", () => {
    const status = {
      playerUrl: "http://localhost:29362/player?key=k",
      playerConnected: true,
    };

    expect(isPluginMessage({ event: "status", status })).toBe(true);
    expect(
      isPluginMessage({ event: "status", status: { playerConnected: true } }),
    ).toBe(false);
    expect(isPluginMessage({ event: "get-status" })).toBe(false);
  });
});
