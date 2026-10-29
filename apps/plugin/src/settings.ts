/**
 * Plugin settings as the sidecar keeps them. It is their only writer —
 * editors send it messages — so the API Key is never handed to an editor.
 */
import type { BlocklistEntry, RuleDefaults } from "song-requests-protocol";

export type PluginSettings = {
  playerKey?: string;
  /** The streamer's YouTube Data API Key; it never reaches a log line or an editor. */
  apiKey?: string;
  /** The Region the streamer picked; absent to follow the computer's. */
  region?: string;
  /** The Rules' Defaults as the streamer set them; #1's where absent. */
  ruleDefaults?: Partial<RuleDefaults>;
  /** The tracks and channels the streamer never wants played. */
  blocklist?: BlocklistEntry[];
  [key: string]: unknown;
};
