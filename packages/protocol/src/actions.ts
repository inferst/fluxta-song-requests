/**
 * Request Song's settings, as its Action Editor saves them.
 *
 * `request` is edited through a `TemplateField`, so by the time the sidecar
 * reads it the host may have substituted it into a number or a boolean —
 * read it as a templated value, never as a bare string.
 */
export type RequestSongSettings = {
  request?: string;
};
