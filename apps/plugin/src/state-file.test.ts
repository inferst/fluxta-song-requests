import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SongQueueSnapshot } from "./songs/song-queue";
import { StateFile, stateFilePath } from "./state-file";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "song-requests-state-"));
  file = path.join(dir, "song-requests", "state.json");
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const song = {
  provider: "fake",
  trackId: "one",
  title: "One",
  channel: "Fake channel",
  channelUrl: "fake://channel",
  url: "fake://one",
  duration: 200,
  requesterPlatform: "twitch",
  requesterId: "u1",
  requesterName: "viewer",
  reference: "redemption-1",
  id: "song-1",
};

const snapshot: SongQueueSnapshot = {
  waiting: [{ ...song, id: "song-2", trackId: "two", title: "Two" }],
  current: {
    song,
    atStartCheck: false,
    started: true,
    position: 42.5,
  },
};

describe("the State file", () => {
  it("lives in Fluxta's per-user application data folder, in one of the plugin's own", () => {
    const at = stateFilePath();

    expect(path.isAbsolute(at)).toBe(true);
    expect(
      at.endsWith(path.join("Fluxta", "song-requests", "state.json")),
    ).toBe(true);
  });

  it("starts empty when there is no file yet", async () => {
    expect(await new StateFile(file).load()).toEqual({ recovered: false });
  });

  it("round-trips the Song Queue", async () => {
    const state = new StateFile(file);
    await state.save(snapshot);

    expect((await fs.readFile(file, "utf8")).startsWith("{")).toBe(true);
    expect(await state.load()).toEqual({ snapshot, recovered: false });
  });

  it("moves a broken file aside and starts empty", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "not json at all", "utf8");

    const loaded = await new StateFile(file).load();

    expect(loaded).toEqual({ recovered: true });
    await expect(fs.readFile(file, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    const left = (await fs.readdir(path.dirname(file))).filter((name) =>
      name.includes("broken"),
    );
    expect(left).toHaveLength(1);
    expect(
      await fs.readFile(path.join(path.dirname(file), left[0]), "utf8"),
    ).toBe("not json at all");
  });

  it("moves a file that does not match the shape aside and starts empty", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ version: 1, waiting: "nope" }));

    const loaded = await new StateFile(file).load();

    expect(loaded).toEqual({ recovered: true });
    await expect(fs.readFile(file, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("never leaves a broken file behind an interrupted write", async () => {
    const state = new StateFile(file);
    // What a crash before the rename leaves: a whole old file and a whole
    // temporary one — or nothing at all, never half of one.
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp-1`, JSON.stringify({ stale: true }));
    await state.save(snapshot);
    await state.save({
      ...snapshot,
      waiting: [],
      current: undefined,
    });

    expect((await state.load()).snapshot?.waiting).toEqual([]);
    const names = await fs.readdir(path.dirname(file));
    expect(names.filter((name) => name.endsWith(".json"))).toEqual([
      "state.json",
    ]);
  });
});
