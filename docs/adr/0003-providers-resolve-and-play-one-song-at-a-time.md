# Providers resolve and play one Song at a time; the Song Queue is the plugin's

The plugin starts with YouTube, but Spotify and others are meant to follow,
and their Songs share one Song Queue: a viewer requests by a link of any
service, and search words go to the default Provider. A Provider is therefore
a seam with two sides — resolving a Request into a playable track (by link or
by search, with its Playability), and playing one Song at a time on its
Player (play, pause, resume, stop, volume, position, end) — and nothing else.
Order, Rules, History, Events and the Fallback Playlist live above it and
know no Provider.

A Player never holds a queue: the plugin hands it the next Song only when the
Current Song is over. That keeps Remove, Next and Skip exact on services whose
own queue cannot be edited. The Fallback Playlist goes the same way: the
plugin learns the playlist's tracks — through the Data API with the API Key,
at a unit per 50 tracks and with every title, duration and Playability; from
the player, which can list a playlist it is given, without it — shuffles them
and hands the Player one track at a time, skipping any it cannot play. Handed
the playlist to play itself, YouTube's player kept its order through a
shuffle and stuck on the first entry it could not play (spike #3). The tests carry a fake second Provider, so
that the Song Queue, the Rules and the Events are shown not to depend on
YouTube.

## Spotify, when it comes

Known in October 2026, so the seam can take it:

- It is not to be counted on to play on the Player Page: its Web Playback SDK
  needs Premium and Widevine DRM, and developers report it failing inside
  embedded Chromium (CEF) browsers such as OBS's, most often at the DRM
  licence. Its Player is the streamer's Spotify app, driven through the Web
  API (Spotify Connect), which needs Premium too.
- The Web API cannot remove from or reorder Spotify's queue, so each Song is
  started by its URI rather than queued there; the end of a Song is noticed by
  polling, since the Web API pushes nothing.
- Since February 2026 a Development Mode app needs its owner to have Premium
  and admits five users, and extended quota requires a registered business
  with 250,000 monthly users. Fluxta cannot ship one shared client id; each
  streamer registers an app of their own and gives the plugin its Client ID,
  as they give it a YouTube API Key.
- Its sound comes from the Spotify app, not the Browser Source, so the
  streamer captures both in OBS.

## Considered Options

- **One Provider active at a time.** Simpler sound setup, but a link of
  another service would be refused, and switching Provider would strand the
  Songs already queued.
- **No seam until Spotify arrives.** YouTube's notions — a video id, oEmbed,
  the Music category — would leak into the queue, and Spotify would be a
  rewrite rather than an adapter.
