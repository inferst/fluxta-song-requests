import {
  isPageMessage,
  type PageMessage,
  type SidecarMessage,
} from "song-requests-protocol";

import type { Player, PlayerEvents, Song } from "../songs/provider";

/** One Player Page's WebSocket, as narrow as the Player needs it. */
export interface PageSocket {
  send(text: string): void;
  /** Another page took over: this one stops, and stays closed. */
  close(): void;
  onMessage(listener: (text: string) => void): void;
  onClose(listener: () => void): void;
}

/**
 * YouTube's Player: the Player Page open in OBS, driven over its WebSocket
 * (ADR-0001). It is ready while a page is connected.
 */
export class PagePlayer implements Player {
  #page?: PageSocket;
  #events?: PlayerEvents;
  readonly #connectionListeners: ((connected: boolean) => void)[] = [];

  get ready(): boolean {
    return this.#page !== undefined;
  }

  attach(events: PlayerEvents): void {
    this.#events = events;
  }

  onConnectionChange(listener: (connected: boolean) => void): void {
    this.#connectionListeners.push(listener);
  }

  /**
   * Makes the page the one that plays. The page opened last takes over — so
   * reopening OBS just works — and the one before it is closed; only the
   * current page's messages count.
   */
  connect(page: PageSocket): void {
    const before = this.#page;
    this.#page = page;

    page.onMessage((text) => {
      if (this.#page === page) this.#receive(text);
    });
    page.onClose(() => {
      if (this.#page !== page) return;
      this.#page = undefined;
      this.#tellConnection();
    });

    before?.close();
    this.#tellConnection();
    this.#events?.ready();
  }

  play(song: Song, { muted }: { muted: boolean }): void {
    this.#send({
      event: "load",
      songId: song.id,
      videoId: song.trackId,
      muted,
    });
  }

  unmute(songId: string): void {
    this.#send({ event: "unmute", songId });
  }

  stop(): void {
    this.#send({ event: "stop" });
  }

  #send(message: SidecarMessage): void {
    this.#page?.send(JSON.stringify(message));
  }

  #receive(text: string): void {
    const message = parse(text);
    if (!message) return;

    switch (message.event) {
      case "loaded":
        // A live stream's duration is how long it has been on, not its
        // length: it has none.
        this.#events?.loaded(
          message.songId,
          message.live ? undefined : Math.round(message.duration),
        );
        return;
      case "ended":
        this.#events?.ended(message.songId);
        return;
      case "error":
        this.#events?.failed(message.songId);
        return;
    }
  }

  #tellConnection(): void {
    for (const listener of this.#connectionListeners) listener(this.ready);
  }
}

/** What a page sent, if it is one of our messages: it is JSON off a socket. */
function parse(text: string): PageMessage | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isPageMessage(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
