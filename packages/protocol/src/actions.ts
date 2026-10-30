import type { RequestSongOverrides } from "./rules";

/**
 * Request Song's settings, as its Action Editor saves them.
 *
 * Every setting is edited through a `TemplateField`, so by the time the
 * sidecar reads one the host may have substituted it into a number or a
 * boolean — read it as a templated value, never as a bare string.
 */
export type RequestSongSettings = {
  request?: string;
  requesterPlatform?: string;
  requesterId?: string;
  requesterName?: string;
  reference?: string;
  /** Per Rule: follow the Default, a value of its own, or do not check. */
  overrides?: RequestSongOverrides;
};

export type { RequestSongOverrides, RuleOverride } from "./rules";

export type PlaybackSettings = { mode?: "pause" | "resume" | "toggle" };
export type VolumeSettings = { mode?: "set" | "change"; amount?: string };
export type SkipSettings = Record<string, never>;
