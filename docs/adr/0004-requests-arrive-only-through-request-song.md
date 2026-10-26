# Requests arrive only through Request Song, and a Song is fulfilled when it starts

The plugin knows no streaming platform. A Request reaches it only as a
Request Song step a scenario runs — after a Platforms Command, a Redemption, a
donation, a deck button — the way the Text to Speech plugin's Speak does.
Who may request, how often and at what price is decided before the step, by
Platforms' Permission Levels and Cooldowns, a Reward's cost or an If/Else;
the plugin only checks the Request against its Rules, with the step's
Overrides, and answers at once with Run Variables — accepted or refused and
why, the Song, its Position and when it should start — for the scenario to
reply in chat.

Because the plugin cannot reach Twitch or DonationAlerts itself, the Request
carries what the scenario will need later: a Requester (platform, id, name),
for the Rules per Requester and for removing a viewer's own Songs, and an
opaque Reference, handed back unchanged in Song Started, Song Ended and Song
Dropped. A Request counts as fulfilled at **Song Started** — the Song was
heard — so that is where a scenario fulfils a Redemption, and **Song Dropped**,
a Song that never went on air, is where it refunds one. Song Ended says how
the Song left the air, so a scenario that wants to refund a failed one can.

## Considered Options

- **Listening to chat directly.** It would duplicate Platforms — accounts,
  OAuth, commands — for every platform, and still not cover Redemptions or
  donations.
- **Fulfilled only when played to the end.** Skipping a bad Song would then
  refund it, which rewards trolling.
