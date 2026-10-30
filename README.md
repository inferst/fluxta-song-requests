# Fluxta Song Requests

A [Fluxta](https://fluxta.app) plugin that lets viewers request songs — by a
chat command, a channel-points reward, a donation or a deck button — and plays
them one at a time from YouTube on its own player page in OBS. Spotify is to
follow.

## Getting started

1. Open the plugin's **Song Requests** tab in Fluxta and copy the Player Page's
   address.
2. In OBS, on the same computer, add a **Browser Source** with that address.
   Keep it in view on stream: YouTube does not allow a player that is not
   shown.
3. Add a **Request Song** step wherever songs come from — a chat command, a
   channel-points reward, a deck button — with a YouTube link as its Request,
   usually what a viewer typed after the command. Later steps can read whether
   it was accepted, the Song's title and its place in the queue.

Songs play one at a time, in the order they were requested. While no Player
Page is open, they wait.

## Playback controls

- **Skip** ends the Current Song and moves to the next. Its Run Variable
  `title` names the skipped Song; with nothing on air, it produces no title.
- **Playback** pauses, resumes or toggles playback and returns `isPaused`.
  Requests continue to queue while paused.
- **Volume** sets a percentage or changes it by a signed amount, such as
  `+10` or `-10`, and returns `volume`. The result is rounded to a whole
  percentage within 0–100. Invalid amounts leave it unchanged.

The volume and an explicit pause survive restarts and Player Page reconnects.
A paused Song waits at its saved position until Playback resumes it.

If/Else can read **Is Playing**, **Is Paused**, **Player Connected**,
**Current Title**, **Current Requester**, **Queue Length**, **Queue Duration
(Seconds)** and **Volume**. These are Query Sources: Fluxta asks for current
state when evaluating a condition, including after a reconnect. Queue Length
and Queue Duration count waiting Songs; unknown durations contribute nothing
to the duration total. Is Playing is false until a Song goes on air, while
paused, or with its Player disconnected. Is Paused records the streamer's
explicit pause. An empty Current Title or Current Requester is an empty string.
These sources do not provide automatic live button-title bindings.
