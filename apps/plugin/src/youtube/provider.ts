import type {
  Player,
  Provider,
  RefusalReason,
  Resolution,
} from "../songs/provider";
import { videoIdOf } from "./link";

/**
 * Fluxta waits about 30 s for an Action to answer; oEmbed gets well under it.
 */
const OEMBED_TIMEOUT_MS = 10_000;

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type OEmbed = { title?: unknown; author_name?: unknown; author_url?: unknown };

/**
 * What oEmbed's refusals mean (spike #3): 400 for a missing video, 401 for
 * one that may not be embedded. Anything else is YouTube not answering.
 */
function refusalFor(status: number): RefusalReason {
  if (status === 400 || status === 404) return "not-found";
  if (status === 401 || status === 403) return "not-embeddable";
  return "provider-unavailable";
}

const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/**
 * YouTube, checked without the API Key: a link through oEmbed, which knows a
 * missing and a non-embeddable video but neither duration nor age
 * restriction — those wait for the player (ADR-0005). Search words need the
 * API Key, so they are refused.
 */
export function createYouTubeProvider({
  fetch,
  player,
}: {
  fetch: Fetch;
  player: Player;
}): Provider {
  return {
    id: "youtube",
    player,
    claims: (request) => videoIdOf(request) !== undefined,

    async resolve(request): Promise<Resolution> {
      const id = videoIdOf(request);

      if (!id) {
        return { kind: "refused", reason: "no-api-key" };
      }

      const url = new URL("https://www.youtube.com/oembed");
      url.searchParams.set("format", "json");
      url.searchParams.set("url", watchUrl(id));

      let body: OEmbed;

      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
        });

        if (!response.ok) {
          return { kind: "refused", reason: refusalFor(response.status) };
        }

        body = (await response.json()) as OEmbed;
      } catch {
        return { kind: "refused", reason: "provider-unavailable" };
      }

      return {
        kind: "track",
        track: {
          provider: "youtube",
          trackId: id,
          title: typeof body.title === "string" ? body.title : "",
          channel: typeof body.author_name === "string" ? body.author_name : "",
          channelUrl:
            typeof body.author_url === "string" ? body.author_url : "",
          url: watchUrl(id),
        },
      };
    },
  };
}
