/**
 * Plugin settings as the sidecar keeps them. It is their only writer —
 * editors send it messages — so the API Key is never handed to an editor.
 */
export type PluginSettings = {
  playerKey?: string;
  /** The streamer's YouTube Data API Key; it never reaches a log line or an editor. */
  apiKey?: string;
  /** The Region the streamer picked; absent to follow the computer's. */
  region?: string;
  [key: string]: unknown;
};
