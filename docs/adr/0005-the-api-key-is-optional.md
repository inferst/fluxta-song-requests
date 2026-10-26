# The API Key is optional; with it every Request is checked before it is accepted

Playing needs no key — YouTube's IFrame Player takes none — only checking and
searching do. The first version of this decision required the streamer's own
YouTube Data API Key, so that every "accepted" was certain; but it put a
Google Cloud setup in front of a plugin that can otherwise work out of the
box, and the spike (#3) showed that oEmbed, which needs no key, catches the
commonest failures at once: a missing video (HTTP 400) and one that may not
be embedded (401). So the key is optional, and it buys certainty and search.

**With the API Key** every Request is checked with `videos.list` before
Request Song returns — duration, embedding, age restriction, Region, live — so
an accepted Request is one that will play, and search words work.

**Without it** — none set, a key YouTube refuses, or its units spent for the
day — a link is checked with oEmbed (it exists and may be embedded; its title
and channel) and with every Rule that needs no duration, and search words are
refused. What only the player can tell is found when the Song's turn comes,
at its **Start Check**: the Song starts muted, and once the player reports its
duration it is either unmuted and goes on air — Song Started — or dropped:
`too-long`, `too-short`, or `unavailable` for an age-restricted,
region-blocked or live one, all of which the player refuses alike (error 150).
Nothing of a dropped Song is heard, and Song Dropped carries its Reference, so
a scenario can refund it. Music only, which needs YouTube's category, is not
checked, and a blocked channel is matched by the address oEmbed gives rather
than by its id. A Song whose duration is already known needs no Start Check.

A key shipped with the plugin is not an option: the source is public, and
every streamer would share one quota.

Search words are the scarce part. `search.list` has a daily bucket of its
own, 100 calls by default, while `videos.list` takes 1 of the 10,000 units a
day that everything else shares (YouTube's quota page, October 2026). A
search asks for up to five embeddable videos in one call and takes the first
that passes Playability and every Rule; the embeddable filter lets
age-restricted videos through (spike #3), so each candidate is still checked.
A search is cached for 7 days, so a Song asked for again costs only its
check. The plugin keeps no count of its own and follows YouTube's answer per
bucket: when the searches are spent, Requests by words are refused as
`quota-exhausted`; when the units are spent, links are checked as without a
key and words are refused — each until YouTube resets it at midnight Pacific
time.

## Considered Options

- **Requiring the key** — this decision's first version. Every "accepted"
  certain and search from the first day, but no plugin at all until the
  streamer has set up a Google Cloud project.
- **Never using a key.** No search, and every duration limit found only at the
  Start Check.
- **Refusing every Request without a usable key.** A wrong key or a spent
  quota would stop all Requests, when links can still be checked well enough.
- **Searching without a key** through YouTube's internal API or its pages —
  against YouTube's terms.
- **Counting the quota ourselves.** The count drifts whenever the key is used
  elsewhere, and with searches in a bucket of their own they cannot starve
  the link checks a reserve would have protected.
