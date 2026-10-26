# Every Request is checked with the streamer's own API Key before it is accepted

A viewer told "accepted" should hear the Song, and a duration limit or search
words (`!sr song name`) are what streamers expect first. Without a key YouTube
offers only oEmbed, which knows no duration, cannot tell a live stream from a
video and cannot search; so the plugin requires the streamer's own YouTube
Data API Key and checks every Request with `videos.list` — duration,
embedding, age restriction, Region, live — before Request Song returns. A key
shipped with the plugin is not an option: the source is public, and every
streamer would share one quota.

Search words are the scarce part. `search.list` has a daily bucket of its
own, 100 calls by default, while `videos.list` takes 1 of the 10,000 units a
day that everything else shares (YouTube's quota page, October 2026). A
search asks for up to five embeddable videos in one call and takes the first
that passes Playability and every Rule; the embeddable filter lets
age-restricted videos through (spike #3), so each candidate is still checked.
A search is cached for 7 days, so a Song asked for again costs only its
check. The plugin keeps no count of its own and follows YouTube's answer per
bucket: when the searches are spent, Requests by words are refused as
`quota-exhausted` while links are still checked; when the units are spent,
every Request is — each until YouTube resets it at midnight Pacific time.

## Considered Options

- **Links only, through oEmbed, with no key.** No setup, but the duration
  limit and live streams would only be caught when the Song's turn came,
  after the viewer was told it was accepted.
- **Links without a key, search and full checks with one.** Two behaviours to
  explain and to test.
- **Counting the quota ourselves.** The count drifts whenever the key is used
  elsewhere, and with searches in a bucket of their own they cannot starve
  the link checks a reserve would have protected.
