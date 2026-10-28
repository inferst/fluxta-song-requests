import type { Player, Provider, Resolution } from "../songs/provider";
import type { DataApi } from "./data-api";
import type { Fetch } from "./fetch";
import { videoIdOf } from "./link";
import { checkWithOEmbed } from "./oembed";
import { resolveVideo } from "./playability";

/**
 * YouTube (ADR-0005). With a usable API Key a link is checked through
 * `videos.list` — Playability and duration — before the Request is answered,
 * so an accepted one will play. Without one — none set, a key YouTube
 * refuses, its units spent — or while the Data API does not answer, a link
 * is checked through oEmbed and what only the player can tell waits for the
 * Song's Start Check.
 */
export function createYouTubeProvider({
  fetch,
  player,
  dataApi,
  region,
}: {
  fetch: Fetch;
  player: Player;
  dataApi: DataApi;
  /** The Region Playability is checked for, as it stands now. */
  region: () => string;
}): Provider {
  return {
    id: "youtube",
    player,
    claims: (request) => videoIdOf(request) !== undefined,

    async resolve(request): Promise<Resolution> {
      const id = videoIdOf(request);

      if (!id) {
        // Search words need a usable API Key; search itself is still to
        // come (#9), and until then finds nothing.
        return { kind: "refused", reason: dataApi.unusable() ?? "not-found" };
      }

      const answer = await dataApi.videos([id]);

      if (answer.kind === "videos") {
        return resolveVideo(
          id,
          answer.videos.find((video) => video.id === id),
          region(),
        );
      }

      return checkWithOEmbed(fetch, id);
    },
  };
}
