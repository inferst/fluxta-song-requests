import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { RequestSongSettings } from "song-requests-protocol";

import type { SongQueue } from "../songs/song-queue";
import { templatedText } from "./templated";

export const REQUEST_SONG_ACTION = "request-song";

/**
 * What a run gets back, by the keys the manifest's `produces` declares: the
 * accepted Song and its place, or the Refusal's reason — nothing else, the
 * same as producing no value, so a reply cannot quote a Song that is not.
 */
type Produced = Record<string, string | number>;

/**
 * Request Song: checks a Request, puts the Song into the Song Queue In turn
 * and answers at once, for the scenario to reply in chat (ADR-0004). It never
 * waits for the Song to play.
 */
export class RequestSongAction extends StandaloneAction<RequestSongSettings> {
  readonly type = REQUEST_SONG_ACTION;
  readonly #queue: SongQueue;

  constructor(queue: SongQueue) {
    super();
    this.#queue = queue;
  }

  onTrigger = async ({
    settings,
  }: StandaloneTriggerContext<RequestSongSettings>): Promise<Produced> => {
    const request = templatedText(settings?.request)?.trim();

    // `!sr` with nothing after it: there is no song to look for, and a
    // Provider would read the blank as search words.
    if (!request) {
      return { outcome: "refused", reason: "not-found" };
    }

    const answer = await this.#queue.request(request);

    if (answer.kind === "refused") {
      return { outcome: "refused", reason: answer.reason };
    }

    const { song, position } = answer;
    return {
      outcome: "accepted",
      songId: song.id,
      title: song.title,
      channel: song.channel,
      url: song.url,
      position,
    };
  };
}
