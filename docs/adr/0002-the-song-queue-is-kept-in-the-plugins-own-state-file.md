# The Song Queue is kept in the plugin's own state file

Songs are often paid for — channel points, a donation — so losing the Song
Queue to a restart of the plugin or of Fluxta, or to an update of the plugin,
would lose what viewers paid for. The plugin keeps the Song Queue, the Current
Song with how far it has played, the History, Requests Open, the volume and
its search cache in one JSON file of its own, in the OS's per-user data
folder for applications, outside the plugin's package folder. After a restart
the queue is back and the Current Song goes on from where it was, without a
second Song Started.

## Considered Options

- **Memory only, as the Text to Speech plugin's Speech Queue.** Fine for
  phrases, not for paid Songs.
- **Plugin settings.** `setPluginSettings` replaces the whole object, so the
  sidecar saving the queue and the Plugin Editor saving settings would
  overwrite each other; and it would turn every Request into a settings
  write. Settings stay what the streamer configures: the API Key, the
  Defaults, the Fallback Playlist, the Blocklist, the Player Key, the port.
- **The package folder.** Fluxta replaces it whole on every update
  (Fluxta ADR-0033).
- **A storage the host provides.** It offers none; if it ever does, the file
  moves there.

## Consequences

- Removing the plugin leaves the file behind, as Fluxta leaves a removed
  plugin's settings (ADR-0033); reinstalling finds the queue.
- What the file keeps from YouTube's API is bound by its 30-day limit
  (Developer Policies III.E.4): the History holds nothing older, and the
  search cache keeps entries for 7 days.
