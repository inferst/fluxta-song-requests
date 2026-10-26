# YouTube plays on the plugin's own Player Page

YouTube can only be played by its IFrame Player inside a web page, and a
plugin's sidecar is a Node.js process. So the sidecar serves its own Player
Page over HTTP and drives the player on it over a WebSocket of its own. The
streamer opens the page in an OBS Browser Source, which shows the video on
stream and captures its sound.

The page is the plugin's alone; the host has no part in it. Exactly one page
plays at a time: when another page connects, it takes over, and the previous
one stops and says the player is open elsewhere. Reopening OBS therefore just
works, and a forgotten tab cannot hold the player hostage. With no page open,
the Current Song waits, paused at its position, and Requests are still
accepted. The plugin reports no External Connection for the page; the Plugin
Editor and the `playerConnected` Plugin Variable say whether one is open.

YouTube's [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
and [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
bind the page: the player is at least 200×200 px with nothing drawn in front
of it, it starts playing only when it is visible, and there is no
"background player" — no player kept out of view (III.I.9). The page therefore
shows the player and nothing else, and it has no audio-only or hidden mode.
What is playing is shown elsewhere: a separate Now Playing page later, an OBS
text source set from Song Started today.

## Considered Options

- **Play in the Plugin Editor.** The editor's iframe is unmounted whenever its
  tab is left, so the music would stop when the streamer switches to Deck; its
  sandbox (`allow-scripts allow-forms`, no `allow-same-origin`) gives it an
  opaque origin that YouTube's embed refuses; and the sound would come from
  Fluxta's process with no video for the stream. Changing either is a host
  decision about Editor isolation (Fluxta ADR-0025).
- **Extract the audio and play it like Text to Speech does.** It separates
  YouTube's audio from its video, which the Developer Policies forbid
  (III.I.7), breaks whenever YouTube changes, and needs a downloader binary.
- **A host-served "plugin page".** Useful to other plugins too, but a change to
  Fluxta's contract; the page can move there if the host ever offers one.

## Consequences

- The page is reachable by anything on the machine, so it is guarded: a
  Player Key in its address, an `Origin` check on its WebSocket, and
  `frame-ancestors 'none'` so another site cannot frame it and take over the
  player. A key in a URL is what Fluxta ADR-0025 rejects for host grants; here
  it only guards a page whose address lives in OBS's settings, and the
  streamer can replace it.
- It listens on loopback by default, on a fixed port the streamer can change,
  so the address in OBS stays the same. A setting opens it to the local
  network for setups with OBS on a second computer; the key is required
  either way.
- In an ordinary browser, unlike OBS, the page needs one click before it may
  play with sound.
