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
