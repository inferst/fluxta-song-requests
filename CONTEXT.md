# Song Requests

The Fluxta plugin that lets viewers request songs. A scenario hands it a
Request — a chat command, a Redemption, a donation, a deck button — and it
keeps the accepted Songs in its own Song Queue and plays them one at a time,
for now from YouTube on its Player Page in OBS.

Fluxta's own words — Action, Run Variable, Event, Event Source, Event Field,
Value Source, If/Else, Plugin Editor, Action Editor, Plugin settings, Plugin
Variable, External Connection — mean what Fluxta's
[Terminology](https://fluxta.app/docs/plugins/getting-started/terminology)
says and are not redefined here. In particular a **run** is Fluxta's: one
execution of a program.

## Language

### Requests

**Request**:
What one Request Song step hands the plugin: text — a link or search words —
and, optionally, a Requester and a Reference. It becomes a Song or a Refusal
before the step returns. With the API Key an accepted Request is one that will
play; without it, what only the player can tell waits for the Song's Start
Check.
_Avoid_: order, song request (the plugin's name, not one item), ask.

**Requester**:
Who a Request is from: a platform, an id on it and a name, each optional — a
Request with none is the streamer's own. Limits per Requester count by
platform and id; the name is only shown.
_Avoid_: user, viewer (a Requester may be the streamer), Account (a
Platforms Account is who the streamer signs in as).

**Reference**:
An opaque label a scenario attaches to a Request — a Redemption's id, a
donation's id — that the plugin never reads and hands back unchanged in every
Event about the Song, so the scenario can fulfil or refund what paid for it.
_Avoid_: tag (the Text to Speech plugin's word for something else), id.

**Refusal**:
A Request that did not become a Song, with the one reason why — `closed`,
`too-long`, `requester-limit`, `blocked`, `quota-exhausted` and the like.
_Avoid_: error (nothing failed), rejection, denial.

**Playability**:
Whether a Provider can play a track at all: it exists, may be embedded, has
no age restriction, is available in the Region and is not a live stream or a
premiere. A track that is not playable is refused whatever the step says —
or, when only the player can tell, dropped at its Start Check.
_Avoid_: availability (one part of it), Rule (a Rule can be overridden).

**Rule**:
A check of the streamer's a Request must pass to become a Song — Requests
Open, duration bounds, Songs waiting per Requester, queue size, already
queued, recently played, Blocklist, music only. Each has a Default and may
have an Override. Without the API Key the duration bounds wait for the Start
Check and music only is not checked.
_Avoid_: filter, limit (one kind of Rule), policy.

**Default**:
A Rule's value in Plugin settings, which a Request Song step follows unless
it overrides it.
_Avoid_: global setting.

**Override**:
A Rule's value set on one Request Song step, which wins over the Default for
the Requests that step makes — including "do not check". Who deserves an
Override is the scenario's to decide.
_Avoid_: bypass, exception.

**Requests Open**:
Whether Request Song accepts Requests at all; a closed plugin refuses them as
`closed`. Playback goes on either way.
_Avoid_: enabled, paused (that is playback).

**Blocklist**:
The tracks and channels the streamer never wants played, kept in Plugin
settings. A Request for one is refused as `blocked`; blocking a Song already
queued drops it. A channel is known by its id with the API Key and by its
address without it.
_Avoid_: blacklist, ban list.

**Region**:
The country Playability is checked for — the streamer's, since the
streamer's computer plays — taken from the OS's locale until the streamer
picks another.
_Avoid_: country, locale (where the Default comes from).

### Songs

**Song**:
A Request accepted into the Song Queue: one track of one Provider, with its
title, channel, duration and link, its Requester and its Reference.
_Avoid_: track (a Provider's item, before it is accepted), video (YouTube's
word), request.

**Song Queue**:
The plugin's single list of Songs waiting, in order of arrival with the Next
ones ahead. The plugin owns it and keeps it across restarts of the plugin and
of Fluxta.
_Avoid_: queue alone (the host's Event Queue and Custom Queue order runs),
playlist (a Provider's), Spotify's queue.

**Position**:
Where Request Song puts its Song: **In turn**, the end of the Song Queue, or
**Next**, ahead of every In turn Song and behind other Next ones. Nothing
interrupts the Current Song.
_Avoid_: priority.

**Current Song**:
The one Song on air, playing or paused, with how far it has played. It
outlives a restart and goes on from that point.
_Avoid_: now playing (the future widget's title), active song.

**Start Check**:
How a Song whose duration is not known yet — one accepted without the API
Key — goes on air: it starts muted, and once the player tells its duration it
is unmuted, or dropped as `too-long`, `too-short` or `unavailable` before
anything of it is heard.
_Avoid_: probe, preview.

**History**:
The Songs that left the air, newest first: at most 200, none older than 30
days. Recently played is checked against it.
_Avoid_: log, played list.

**Fallback Playlist**:
A playlist of the streamer's whose playable tracks the plugin plays shuffled,
one at a time, while the Song Queue is empty. Its tracks are not Songs:
Playability applies to them, but no Rules, no Events, no History. A Song
waits for the Fallback Track on air to end.
_Avoid_: backup playlist, autoplay (YouTube's word for something else).

**Fallback Track**:
The Fallback Playlist's track on air.
_Avoid_: Song.

### A Song's life

**Song Started**:
The Event of a Song going on air. A Request counts as fulfilled here: the
Song was heard, whatever happens next.
_Avoid_: song played.

**Song Ended**:
The Event of a Song leaving the air, with how: `finished`, `skipped` or
`failed` (it broke while playing).
_Avoid_: song finished (one of three ways).

**Song Dropped**:
The Event of a Song leaving the Song Queue without ever going on air, with
why: `removed`, `cleared`, `blocked`, `unavailable` (it could not play when
its turn came) or, at its Start Check, `too-long` or `too-short`. The usual
cue to refund.
_Avoid_: song removed (one of six reasons), cancelled.

### Providers and playback

**Provider**:
A music service Songs come from. It turns a Request into a track — by link
or by search — and checks its Playability, and it plays one Song at a time
on its Player. YouTube now; Spotify to follow.
_Avoid_: platform (a streaming service in Platforms, an operating system in
the host), source, service.

**Player**:
Where a Provider's Songs play and are controlled: YouTube's is the Player
Page; Spotify's would be the streamer's own Spotify app. It is told one Song
at a time and never holds a queue of its own.
_Avoid_: output, device (Spotify's word for an app it can play on).

**Player Page**:
The web page the plugin serves for YouTube's Player, opened in an OBS
Browser Source on the same computer. One plays at a time — the one opened last takes over — and
none open means the Current Song waits, paused. It shows the player and
nothing else, and it must be in view: YouTube does not allow a player that
is not shown.
_Avoid_: overlay, widget (a Now Playing page would be a separate one),
Browser Source (OBS's holder of it).

**Player Key**:
The secret part of the Player Page's address, without which the page and its
link to the plugin refuse to work. The streamer can replace it, and every
open Player Page then stops.
_Avoid_: token, password.

**API Key**:
The streamer's own YouTube Data API key, which the plugin works without. With
it every Request is checked before it is accepted and search words work;
without it — or while YouTube refuses it or its units are spent — links are
checked through oEmbed and at their Start Check, and words are refused. Its
daily quotas — one for searches, one for everything else — are the
streamer's.
_Avoid_: token, credentials.
