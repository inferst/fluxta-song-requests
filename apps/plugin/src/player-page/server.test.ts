import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PageSocket } from "./page-player";
import { startPlayerPageServer, type PlayerPageServer } from "./server";

const KEY = "the-player-key";

let pageDir: string;
let server: PlayerPageServer | undefined;

beforeEach(() => {
  pageDir = mkdtempSync(join(tmpdir(), "player-page-"));
  writeFileSync(join(pageDir, "index.html"), "<!doctype html><p>player</p>");
  mkdirSync(join(pageDir, "assets"));
  writeFileSync(join(pageDir, "assets", "player.js"), "console.log(1)");
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(pageDir, { recursive: true, force: true });
});

async function start(onPage: (page: PageSocket) => void = () => {}) {
  server = await startPlayerPageServer({
    port: 0,
    pageDir,
    playerKey: () => KEY,
    onPage,
  });
  return server;
}

describe("the Player Page's server", () => {
  it("serves the page only with the Player Key", async () => {
    const { port } = await start();
    const page = (query: string) =>
      fetch(`http://localhost:${port}/player${query}`);

    const served = await page(`?key=${KEY}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toMatch(/^text\/html/);
    expect(await served.text()).toContain("<p>player</p>");

    expect((await page("")).status).toBe(403);
    expect((await page("?key=another-key")).status).toBe(403);
  });

  it("answers on both loopbacks localhost may resolve to", async () => {
    const { port } = await start();

    for (const host of ["127.0.0.1", "[::1]"]) {
      const served = await fetch(`http://${host}:${port}/player?key=${KEY}`);
      expect(served.status).toBe(200);
    }
  });

  it("serves the page's scripts without the key, and nothing outside them", async () => {
    const { port } = await start();
    const get = (path: string) => fetch(`http://localhost:${port}${path}`);

    const script = await get("/assets/player.js");
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toMatch(/^text\/javascript/);
    expect(await script.text()).toBe("console.log(1)");

    expect((await get("/assets/missing.js")).status).toBe(404);
    expect((await get("/assets/%2e%2e/index.html")).status).toBe(404);
    expect((await get("/index.html")).status).toBe(404);
  });

  it("hands a page's WebSocket over when it carries the Player Key", async () => {
    const pages: PageSocket[] = [];
    const { port } = await start((page) => pages.push(page));
    const client = new WebSocket(`ws://localhost:${port}/ws?key=${KEY}`);
    await new Promise((resolve) => client.addEventListener("open", resolve));
    await until(() => pages.length === 1);
    const [page] = pages;

    const fromPage = new Promise<string>((resolve) => page.onMessage(resolve));
    client.send('{"event":"ended","songId":"s1"}');
    expect(await fromPage).toBe('{"event":"ended","songId":"s1"}');

    const toPage = new Promise((resolve) =>
      client.addEventListener("message", (event) => resolve(event.data)),
    );
    page.send('{"event":"load","songId":"s1","videoId":"dQw4w9WgXcQ"}');
    expect(await toPage).toBe(
      '{"event":"load","songId":"s1","videoId":"dQw4w9WgXcQ"}',
    );

    const closed = new Promise<void>((resolve) => page.onClose(resolve));
    client.close();
    await closed;
  });

  it("answers a WebSocket without the Player Key with 403", async () => {
    const pages: PageSocket[] = [];
    const { port } = await start((page) => pages.push(page));

    expect(await upgradeStatus(port, "/ws")).toBe(403);
    expect(await upgradeStatus(port, "/ws?key=another-key")).toBe(403);
    expect(pages).toEqual([]);
  });
});

/** The status a WebSocket upgrade request is answered with. */
function upgradeStatus(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      host: "localhost",
      port,
      path,
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        "sec-websocket-version": "13",
      },
    });
    request.on("response", (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    request.on("upgrade", () => resolve(101));
    request.on("error", reject);
    request.end();
  });
}

async function until(condition: () => boolean) {
  for (let i = 0; i < 100 && !condition(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
