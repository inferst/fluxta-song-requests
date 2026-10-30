# AGENTS.md

This document provides instructions for agentic coding agents working in this repository.

## Project Overview

Fluxta Song Requests is a [Fluxta](https://fluxta.app) plugin that lets viewers request songs. A scenario turns a chat command, a Redemption, a donation or a deck button into a **Request Song** step; the plugin checks the **Request**, puts the **Song** into its own **Song Queue** and answers at once with Run Variables for a chat reply. Songs play one at a time from YouTube on the plugin's **Player Page**, a web page the sidecar serves for an OBS Browser Source. More Providers, Spotify first, are to follow behind the same seam. See `CONTEXT.md` for the language and `docs/adr/` for the decisions.

It is a pnpm workspace (turbo) of four TypeScript packages. The Plugin API it builds against — `@fluxta/sdk` and the `fluxta` CLI from `@fluxta/cli` — is owned by Fluxta, not by this repo (see [Working against Fluxta](#working-against-fluxta)).

## Commands

### Setup

```bash
pnpm install     # Node ≥ 22.18, the pnpm version pinned in package.json
```

### Development & Build

```bash
pnpm build          # wipe dist/ and build the editors, the Player Page and the sidecar into dist/song-requests/
pnpm dev            # build the editors and the Player Page once, then watch every app
pnpm typecheck      # tsc --noEmit in every package
pnpm test           # vitest in apps/plugin and packages/protocol
pnpm lint           # eslint over the whole workspace
pnpm format         # prettier --write; `pnpm format:check` only checks
```

`fluxta publish` runs `lint` and `format:check` itself and stops if either fails.

### Target a specific package

```bash
pnpm --filter song-requests-plugin test
pnpm --filter song-requests-protocol test
pnpm --filter song-requests-editor build
pnpm --filter song-requests-player build
```

### Run it in Fluxta

`dist/song-requests/` is the build folder Fluxta loads (see Fluxta's [Development](https://fluxta.app/docs/plugins/getting-started/development) guide). Every successful sidecar build — `pnpm build` included — ends with `fluxta restart`, which, while Fluxta is running, links this build and restarts the plugin in it.

```bash
pnpm exec fluxta link dist/song-requests   # a development link to this build
pnpm dev                                   # every successful sidecar build runs `fluxta restart`
pnpm exec fluxta link --status             # what is linked
pnpm exec fluxta unlink                    # back to the installed package
```

Editor-only and Player Page-only rebuilds restart nothing — reopen the editor in Fluxta, or refresh the Browser Source, to see them. The sidecar logs to `dist/song-requests/logs/song-requests.log`; `pnpm build` wipes `dist/` and the log with it. Trying it for real needs OBS on the same computer: copy the Player Page's address from the plugin's tab in Fluxta into a Browser Source, then run Request Song with a YouTube link.

## Architecture

### Packages

- `apps/plugin` (`song-requests-plugin`) — the Plugin sidecar: the Node.js process Fluxta starts. tsdown bundles it, `ws` included, into `dist/song-requests/index.mjs` and copies `manifest.json` and `icons/` beside it.
- `apps/editor` (`song-requests-editor`) — the editors, React + Vite + Tailwind, built into `dist/song-requests/editor/`: the Plugin Editor (`plugin.html`, the plugin's own tab in Fluxta) and one Action Editor per Action.
- `apps/player` (`song-requests-player`) — the Player Page, plain TypeScript + Vite, built into `dist/song-requests/player/` and served by the sidecar: YouTube's IFrame Player, filling the page, driven over a WebSocket.
- `packages/protocol` (`song-requests-protocol`) — what the sidecar, the editors and the Player Page share: the editor ↔ sidecar messages (`editor.ts`), the Player Page ↔ sidecar messages (`page.ts`), each an object with an `event` discriminant checked with zod, every Action's settings type (`actions.ts`) and the Rules' shared types (`rules.ts`). Consumed as TypeScript source; it has no build.

### Plugin sidecar (`apps/plugin/src`)

```
index.ts            composition root: the YouTube Provider on the Player Page's Player, the Song Queue, the Action, editor messages, Plugin settings (the Player Key, the API Key, the Region), the Player Page's server
plugin.ts           the single `Plugin` instance from @fluxta/sdk/api
settings.ts         Plugin settings as the sidecar keeps them; it is their only writer
state-file.ts       the State file (ADR-0002): the Song Queue and the History in one JSON file of the plugin's own in the OS's per-user application data folder, written atomically, read back on start
songs/
  provider.ts       the Provider seam (ADR-0003): Track, Song, Refusal reasons, Player and its events
  song-queue.ts     the Song Queue: routes a Request to the Provider that claims it, keeps the order, applies the Rules (with the step's Overrides), hands each Provider's Player one Song at a time, runs the Start Check, answers `eta`
  rules.ts          the Rules: a step's Overrides over the Defaults, resolved and checked against a track and the queue
  history.ts        the History: the Songs that left the air, newest first, at most 200 and none older than 30 days
youtube/
  link.ts           a Request that is one YouTube link → its video id
  provider.ts       the YouTube Provider: links through the Data API or oEmbed; search candidates checked for Playability and through the Song Queue's Rules callback
  data-api.ts       `videos.list` and `search.list` with the API Key; refused keys and separate daily units and Search Queries quotas
  search-cache.ts   normalized search words to the chosen video id, kept for 7 days in the State file; every hit is checked afresh
  quota-reset.ts    when YouTube resets its daily quotas: midnight Pacific
  playability.ts    a `videos.list` item → a track with its duration, or the Playability Refusal
  oembed.ts         a link checked without the key: missing, not embeddable, else its title and channel
  region.ts         the Region of a locale, and of this computer (`AppleLocale` on macOS)
  fetch.ts          the `fetch` YouTube's clients take, so tests can hand them a fake
player-page/
  page-player.ts    YouTube's Player: the Player Page connected over its WebSocket; the page opened last takes over
  server.ts         the page, its scripts and its WebSocket on both loopbacks; 403 without the Player Key
  player-key.ts     the Player Key, made once and kept in Plugin settings
actions/            one StandaloneAction per manifest Action, file named after its `type`; templated.ts reads TemplateField settings
sources/            Standalone Query Sources reading the Song Queue's current playback state through registerSource; no pushed Plugin Variables
```

A Request travels `actions/request-song.ts` → `SongQueue.request` → the Provider that claims it (`claims`, else the first, the default one) → `resolve`, and the accepted Song waits until its Provider's Player is `ready`. The Player reports back through `PlayerEvents`. A Song whose duration is not known — one accepted without the API Key — has its Start Check: it is played muted, unmuted once its Player reports a duration (`loaded`), and dropped unheard when the Player reports none (a live stream). It waits for that as long as it takes: a Song buffering through a network drop is not failing (spike #3). `index.ts` sends every open editor the Player Page's address, whether one is connected, the API Key's state (masked, never the key) and the Region; the Plugin Editor changes the key and the Region by messages, and the sidecar writes them into Plugin settings.

### Editors (`apps/editor`)

- One HTML entry per editor at the package root, each mounting `src/<editor>/main.tsx`. Fluxta never tells an editor which Action it edits — it only serves the path the manifest names — so every Action Editor is its own page. `vite.config.ts` picks up every `*.html` on its own.
- Editors are built from Fluxta's [UI Kit](https://fluxta.app/docs/plugins/reference/ui-kit) (`@fluxta/sdk/ui`) and hear from the sidecar through `song-requests-protocol` messages (`src/plugin/usePluginStatus.ts`).

### Player Page (`apps/player`)

`index.html` and `src/main.ts`: it reads the Player Key from its own address, opens `ws://<host>/ws?key=…`, loads each Song the sidecar sends — muted, for a Song at its Start Check — and reports `loaded` (the player's duration, and whether the video is live — by `getVideoData().isLive`, or, at a Start Check, by a duration that grows as it plays), `ended` and `error` back; `unmute` lets a Song be heard from its start, `stop` stops it. It reconnects when the link drops, except when it is closed with `REPLACED_CLOSE_CODE` — another page took over — and then it stops for good. `src/youtube.d.ts` types the part of the IFrame Player API it uses.

## Key Conventions

- **Manifest and code change together.** `manifest.json` declares every Action (with its `produces`), and the code registers exactly those, by the same `type` / `key`. Adding an Action means: its manifest entry, `apps/plugin/src/actions/<type>.ts` with its test, its registration in `index.ts`, its settings type in `song-requests-protocol`, `apps/editor/<type>.html`, `apps/editor/src/<type>/` and an icon in `icons/`.
- **Naming in the manifest** ([manifest reference](https://fluxta.app/docs/plugins/reference/manifest)): every kind — an Action `type` — is kebab-case (`request-song`); every key — a produced value, a settings field — is camelCase (`songId`).
- **Nothing above the Provider seam knows YouTube** (ADR-0003). The Song Queue, the Actions and the Events deal in Tracks and Songs; a video id, oEmbed or anything else YouTube's stays under `youtube/` and `player-page/`. The tests' fake second Provider (`songs/song-queue.test.ts`) is what keeps it so — a change that needs YouTube there belongs behind the seam.
- **A Player holds no queue.** The Song Queue hands it the next Song only when the Current Song is over; never pass it a list.
- **Playback state is queried.** The eight playback Value Sources use `registerSource`, declared as `resolve: "query"` and `context: "standalone"`. Each reads current local state; no host reconnect callback or `setVariable` replay is needed. They do not provide automatic live button-title bindings.
- **The Player Page's address is `localhost`, never an IP.** YouTube refuses to play on a page whose host is an IP address (error 150, spike #3), so the server listens on both loopbacks and every address it shows says `localhost`. The page stays on this computer (ADR-0001).
- **The Player Page shows the player and nothing else, and must stay in view.** YouTube's policies forbid a player that is not shown and anything drawn over it (ADR-0001). Information about the Song belongs on another page, not on this one.
- **The Player Key never reaches a log line or an error message.** It appears only in the Player Page's address, shown in the Plugin Editor to be copied into OBS.
- **Neither does the API Key**, and it never reaches an editor: the Plugin Editor sends a new one to the sidecar and is shown `ApiKeyStatus.masked`. It travels in the `x-goog-api-key` header, never in a URL.
- **Requests are answered, never thrown.** A Provider that cannot reach its service refuses as `provider-unavailable`; nothing throws out of `onTrigger`. The answer must come well inside Fluxta's ~30 s action timeout — the Data API and oEmbed, which a link may wait for one after the other, get 10 s each.
- **Run Variables** ([guide](https://fluxta.app/docs/plugins/guides/run-variables)): a setting edited through a `TemplateField` arrives with its references substituted and may hold a number or a boolean. Read it through `templatedText` (`actions/templated.ts`), never as a bare string.
- **The sidecar bundle is self-contained.** Fluxta runs it with a bundled Node and no `node_modules`, so tsdown inlines every non-builtin dependency (`noExternal`). Do not externalize one.
- **File naming**: the sidecar, the Player Page and `song-requests-protocol` use kebab-case (`song-queue.ts`, `page-player.ts`). In the editors, React components are PascalCase (`PlayerPageSection.tsx`), hooks are `useThing.ts`.
- **Tests**: vitest, colocated `*.test.ts`, at these seams: the link parser; the Data API client against a fake `fetch` and vitest's fake clock; the Region of a locale; the YouTube Provider against a fake `fetch`; the Song Queue with fake Providers and Players, `eta` on the fake clock; the State file's round trip and its recovery from a broken file, in a temporary folder; the Player Page's Player against a fake socket; the Player Page's server on a real loopback port; each Action through a real Song Queue; the protocol's message checks. No test reaches YouTube. The Player Page's browser script and the editors have no tests; OBS checks the page.
- **Comments say why** — the YouTube or Fluxta behaviour that forces the code — and use the capitalized terms of `CONTEXT.md` and Fluxta's [Terminology](https://fluxta.app/docs/plugins/getting-started/terminology).

## Working against Fluxta

- **Fluxta owns the Plugin API contract**: `@fluxta/sdk`, the manifest schema and the `fluxta` CLI, documented at [fluxta.app/docs/plugins](https://fluxta.app/docs/plugins). When this plugin needs something they do not offer, do not work around the contract or patch `node_modules`: record the need in an issue here, label it `ready-for-human`, and stop — a person takes it to Fluxta (see `docs/agents/issue-tracker.md`). Once a release of the SDK or CLI provides it, it is adopted here.
- **The plugin serves its own page, by design**: the host serves no plugin pages, so the Player Page is the sidecar's own HTTP server (ADR-0001). That is a decision, not a gap to report.
- **The SDK and the CLI come from npm**, pinned once in the `catalog:` of `pnpm-workspace.yaml`; every package says `"catalog:"`. The installed typings — `apps/plugin/node_modules/@fluxta/sdk/dist/api.d.mts` (sidecar) and `ui.d.mts` (editors) — are the contract at the version in use; Fluxta's own working tree may be ahead of it.
- **Adopting a new SDK or CLI version**: bump its `catalog:` entry, add the exact version to `minimumReleaseAgeExclude` if pnpm refuses it as too young, `pnpm install`, and commit `pnpm-workspace.yaml` and `pnpm-lock.yaml` together.
- **Versions and publication**: the plugin's version is `version` in `manifest.json`. `pnpm exec fluxta publish` validates the package and opens a pull request to Fluxta's trusted catalog (`fluxta/plugins`). The catalog can hold a newer version than this repo, and `fluxta publish` merges against it rather than overwriting it. See Fluxta's [Publishing](https://fluxta.app/docs/plugins/getting-started/publishing) guide. Pushing a `version` bump to `main` also tags a draft GitHub Release (`.github/workflows/release.yml`).
- **Publishing is the user's call.** Run `fluxta publish` only when the user asks for it in the conversation.

## Commits

- [Conventional Commits](https://www.conventionalcommits.org/) without a scope, lowercase and imperative: `feat: play a requested link on the Player Page`, `fix: …`, `chore: bump version`.

## Agent skills

- Issues: GitHub Issues at `inferst/fluxta-song-requests`. See `docs/agents/issue-tracker.md`.
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- Domain: `CONTEXT.md` and `docs/adr/`, plus Fluxta's plugin docs and YouTube's API and policies. See `docs/agents/domain.md`.
