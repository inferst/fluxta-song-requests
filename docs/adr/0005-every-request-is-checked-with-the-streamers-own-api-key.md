# Every Request is checked with the streamer's own API Key before it is accepted

A viewer told "accepted" should hear the Song, and a duration limit or search
words (`!sr song name`) are what streamers expect first. Without a key YouTube
offers only oEmbed, which knows no duration, cannot tell a live stream from a
video and cannot search; so the plugin requires the streamer's own YouTube
Data API Key and checks every Request with `videos.list` — duration,
embedding, age restriction, Region, live — before Request Song returns. A key
shipped with the plugin is not an option: the source is public, and every
streamer would share one quota.

Search words cost far more than a link (`search.list` is 100 units of the
default 10,000 a day; `videos.list` is 1). A search asks for up to five
embeddable videos and takes the first that passes every Rule, at the same
cost as one. A search is cached for 7 days, so a Song asked for again costs
only its check. The plugin keeps no count of its own: when YouTube answers
that the quota is spent, every Request is refused as `quota-exhausted` until
YouTube resets it at midnight Pacific time.

## Considered Options

- **Links only, through oEmbed, with no key.** No setup, but the duration
  limit and live streams would only be caught when the Song's turn came,
  after the viewer was told it was accepted.
- **Links without a key, search and full checks with one.** Two behaviours to
  explain and to test.
- **Counting the quota and keeping a reserve for links.** The count drifts
  whenever the key is used elsewhere, and the gain did not justify the extra
  state; it can be added if spent quotas prove common.
