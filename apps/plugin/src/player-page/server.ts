import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { extname, join } from "node:path";

import { REPLACED_CLOSE_CODE } from "song-requests-protocol";
import { WebSocketServer, type WebSocket } from "ws";

import type { PageSocket } from "./page-player";

/**
 * Both loopbacks, so that `localhost` answers whichever of them the OS
 * resolves it to. The address OBS opens is always `localhost`: YouTube
 * refuses to play on a page whose host is an IP address (spike #3), and the
 * page stays on this computer (ADR-0001).
 */
const LOOPBACKS = ["127.0.0.1", "::1"] as const;

export type PlayerPageServer = {
  /** The port it listens on — the one asked for, unless that was 0. */
  port: number;
  close(): Promise<void>;
};

export type PlayerPageServerOptions = {
  port: number;
  /** The Player Page's built files: `index.html` and `assets/`. */
  pageDir: string;
  /** The Player Key as it stands now. */
  playerKey: () => string;
  /** A Player Page connected its WebSocket. */
  onPage: (page: PageSocket) => void;
};

/** One file of the page's own build, never a path: `/assets/<name>`. */
const ASSET = /^\/assets\/([A-Za-z0-9_-][A-Za-z0-9._-]*)$/;

const ASSET_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

/** A page's messages are a few dozen bytes; anything far larger is not one. */
const MAX_MESSAGE_BYTES = 64 * 1024;

/** Whether a request carries the Player Key, compared in constant time. */
function hasKey(url: URL, playerKey: string): boolean {
  const given = Buffer.from(url.searchParams.get("key") ?? "");
  const expected = Buffer.from(playerKey);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** A `ws` socket, narrowed to what the Player Page's Player needs. */
function pageSocket(socket: WebSocket): PageSocket {
  return {
    send: (text) => socket.send(text),
    close: () => socket.close(REPLACED_CLOSE_CODE, "replaced"),
    onMessage: (listener) =>
      socket.on("message", (data, isBinary) => {
        if (!isBinary) listener(data.toString());
      }),
    onClose: (listener) => socket.on("close", () => listener()),
  };
}

function refuseUpgrade(socket: Socket, status: 403 | 404): void {
  const text = status === 403 ? "Forbidden" : "Not Found";
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

/**
 * Serves the Player Page and its WebSocket on loopback. Without the Player
 * Key the page and the WebSocket answer 403.
 */
export async function startPlayerPageServer(
  options: PlayerPageServerOptions,
): Promise<PlayerPageServer> {
  const { pageDir, playerKey, onPage } = options;
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
  });

  function upgrade(request: IncomingMessage, socket: Socket, head: Buffer) {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (url.pathname !== "/ws") {
      refuseUpgrade(socket, 404);
      return;
    }
    if (!hasKey(url, playerKey())) {
      refuseUpgrade(socket, 403);
      return;
    }
    sockets.handleUpgrade(request, socket, head, (page) =>
      onPage(pageSocket(page)),
    );
  }

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/player") {
      if (!hasKey(url, playerKey())) {
        response.writeHead(403).end();
        return;
      }
      const page = await readFile(join(pageDir, "index.html"));
      response
        .writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        })
        .end(page);
      return;
    }

    const asset = request.method === "GET" && ASSET.exec(url.pathname);
    if (asset) {
      // The page's scripts hold nothing secret, and the page that loads
      // them cannot pass the key on, so they are served without it.
      const name = asset[1];
      try {
        const body = await readFile(join(pageDir, "assets", name));
        response
          .writeHead(200, {
            "content-type":
              ASSET_TYPES[extname(name)] ?? "application/octet-stream",
          })
          .end(body);
      } catch {
        response.writeHead(404).end();
      }
      return;
    }

    response.writeHead(404).end();
  }

  const servers: Server[] = [];
  const serve = () =>
    createServer((request, response) => {
      handle(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      });
    }).on("upgrade", (request, socket, head) =>
      upgrade(request, socket as Socket, head),
    );

  const first = serve();
  await listen(first, options.port, LOOPBACKS[0]);
  servers.push(first);
  const port = (first.address() as AddressInfo).port;

  const second = serve();
  try {
    await listen(second, port, LOOPBACKS[1]);
    servers.push(second);
  } catch (error) {
    // A machine without IPv6 still answers on 127.0.0.1, which `localhost`
    // resolves to there.
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EADDRNOTAVAIL" && code !== "EAFNOSUPPORT") {
      sockets.close();
      await Promise.all(servers.map(closeServer));
      throw error;
    }
  }

  return {
    port,
    async close() {
      for (const page of sockets.clients) page.terminate();
      sockets.close();
      await Promise.all(servers.map(closeServer));
    },
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}
