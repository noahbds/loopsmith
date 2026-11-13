# Plan: from "YouTube Section Loop" to a loop tool for any website

Status: Phases 0, 1 and 2 built on branch `phase0-foundation` (2026-11-13). Phase 3 not started.

Phase 1 notes: Firefox moved to Manifest V3 (Firefox 128+) so both browsers share the popup,
background and page-world scripts. Media inside shadow roots isn't picked up yet (phase 3).

Phase 2 notes: SoundCloud and Spotify keep their audio out of the page; a page-world hook on
`HTMLMediaElement.prototype.play` moves it into a hidden `<loopsmith-media>` box. On SoundCloud,
seeking the element directly keeps its UI in step. Spotify seeks through its own progress bar with a
self-check fallback to the element; it couldn't be tested here (no Widevine in the test browsers).
The music sites use the docked panel for now; a button inside each site's own player bar is a
later polish.

## 0. Decisions

| Question | Decision |
|---|---|
| Browsers | Firefox + Chrome (and so Edge, Brave, Opera, Vivaldi) from one codebase |
| Already on AMO? | No, so the Firefox ID, name and storage key can all change freely |
| Main use case | **Music practice.** Music sites move up, including **Spotify Web** and the other music web apps |
| Userscript | Kept, built from the same source |
| DRM sites | Spotify yes (music phase). Netflix, Disney+, Prime stay a "maybe later" |
| Name | **Loopsmith** |

## 1. Where we start

Today the project is one 1,800-line script, kept in two copies
(`youtube-section-loop.user.js` and `firefox-extension/content.js`), plus a Firefox MV2 manifest.

About 85% of it doesn't depend on YouTube at all: the loop engine (`loopAt`, `loopEnd`, `check`,
counts, the "when done" behaviour), the panel, the timeline lane, the hotkeys, the chips and the
toasts. It only needs an `HTMLMediaElement`.

The YouTube-specific parts are few and easy to spot:

| Concern | Where it is today | YouTube coupling |
|---|---|---|
| Find the player | `ensure()` | `#movie_player` |
| Find the media | `syncVideo()` | `video.html5-main-video` |
| Which video is this? | `apiData()`, `idFromUrl()` | `getVideoData()` through `wrappedJSObject` (Firefox only), `/watch?v=`, `/live/` |
| Ads | `isAd()` | `.ad-showing`, `.ad-interrupting` |
| Live streams | `syncVideo()` | `getVideoData().isLive` |
| Toolbar button | `ensure()` | `.ytp-right-controls` |
| Markers on the seek bar | `ensure()` | `.ytp-progress-bar` |
| Panel position | `place()` | `.ytp-chrome-bottom` |
| SPA navigation | boot | `yt-navigate-*` events |
| Storage | `readStore()` / `flushStore()` | `localStorage`, which is **per site**, so loops saved on one site would never be visible on another |
| Look | CSS | Roboto / "YouTube Noto", YouTube blue |

Two problems will show up as soon as we leave YouTube:

1. **Hostile CSS.** Our panel is injected into the page's DOM, so any site's styles can break it.
   On YouTube we got away with `!important` and careful resets; on 20 sites we won't.
2. **`wrappedJSObject` is Firefox-only.** Chrome needs a script running in the page's own JS world
   to call site APIs.

## 2. Which websites

Ranked by how many people would use it × how hard it is.

### Tier 1: launch (the "works everywhere" promise)

| Site | Why people loop there | Difficulty | Notes |
|---|---|---|---|
| **YouTube** (incl. Music, embeds, Shorts?) | Everything | Done | Port the current behaviour into an adapter. YouTube Music is a new surface (`music.youtube.com`). |
| **Any HTML5 `<video>` / `<audio>`** (generic adapter) | Course sites, news, company intranets, self-hosted media | Medium | This alone covers hundreds of sites: Udemy, Coursera, Skillshare, Khan Academy, Wistia/JW Player/Video.js embeds, Google Drive previews, Plex/Jellyfin web, `file://` local videos. |
| **Vimeo** | Tutorials, dance, music lessons | Easy | Plain `<video>` in a known player; video ID is in the URL / embed. |
| **Twitch VODs and clips** | Gaming analysis, highlights | Medium | MSE seeking is slow; only VODs (live is not loopable, same as YouTube live). |
| **Dailymotion** | General | Easy | Plain `<video>`; ID in URL. |

### Tier 2: music web apps (the main use case, right after the foundation)

| Site | Why | Difficulty | Notes |
|---|---|---|---|
| **YouTube Music** | Practising along to songs | Easy | Same player family as YouTube; different DOM (`ytmusic-player-bar`) and its own seek bar. |
| **Spotify Web** (`open.spotify.com`) | The biggest music catalogue | Hard | DRM audio and a custom player, see 4.9. |
| **SoundCloud** | Covers, remixes, DJs | Hard | Plays through an `Audio` object that is **not in the DOM**: needs a page-world hook (see 4.5). |
| **Bandcamp** | Independent music | Easy | `<audio>` in the DOM. |
| **Deezer, Tidal, Apple Music web, Amazon Music web** | Other catalogues | Medium to hard | Same approach as Spotify (4.9); done one at a time once Spotify works, starting with whichever behaves best. |
| **Songsterr, Moises, and lesson sites** (if they use a plain media element) | Practice tools | Easy | Generic adapter, checked one by one. |

All of these have no video to draw on: the panel docks to the bottom of the viewport, and markers
go on the site's own seek bar where we can find it.

### Tier 3: other video sites

| Site | Why | Difficulty | Notes |
|---|---|---|---|
| **Bilibili** | Huge audience, dance/music practice | Medium | Plain `<video>`, its own SPA navigation. |
| **X / Reddit / Facebook / Instagram / TikTok videos** | Short clips | Medium | Many videos per page (feeds): we must pick the right one (see 4.3). |
| **Kick VODs, Rumble, PeerTube, Odysee** | Long VODs | Easy (generic adapter is probably enough) | |

### Tier 4: maybe later, opt-in only

| Site | Why it's hard |
|---|---|
| **Netflix, Disney+, Prime Video, Max, Crunchyroll** | DRM players. Setting `video.currentTime` on Netflix crashes playback (error M7375); seeking has to go through each site's internal player API, which changes without notice. Ship only if there's real demand, behind a per-site toggle. Spotify (4.9) is the test of whether this approach holds up. |

### Not supported

- Live streams anywhere (nothing to loop back to beyond the DVR window; same rule as today).
- Sites inside cross-origin iframes we don't have permission for.

## 3. Product shape across sites

- **On known sites** (YouTube, Vimeo, Twitch…): same experience as today. Button in the player's
  own control bar, markers on the site's own progress bar, panel above the controls.
- **On any other site**: a small floating "loop" pill appears on hover over the active video (top
  right corner, like the picture-in-picture button browsers show). The panel opens from it. Markers
  live on the panel's own timeline lane, since we can't safely draw on an unknown progress bar.
- **Audio-only pages** (SoundCloud, Bandcamp, podcasts): the panel docks to the bottom-right of the
  viewport instead of over a video.
- **Toolbar icon** (new): shows whether the extension is active on this tab, and lets the user
  enable/disable it per site and open a "My loops" page listing every saved loop across sites, with
  links back to them.
- **Hotkeys** (Shift+A / B / R / S) work everywhere, scoped to the "active" media element.

## 4. How to build it

### 4.1 Split the monolith

```
src/
  core/
    engine.js        loop engine: pure functions + the check() tick, no DOM lookups
    state.js         S, P, loops, selection
    store.js         storage interface (below)
    time.js          parse/format timestamps
  ui/
    panel.js         panel, chips, lane, steppers
    marks.js         markers (drawn into whatever element the adapter gives us)
    launcher.js      floating pill for the generic adapter
    styles.css
  adapters/
    index.js         picks the adapter for location.hostname
    generic.js
    youtube.js
    vimeo.js
    twitch.js
    ...
  page-world/
    hooks.js         runs in the page's JS world (MAIN): site APIs, detached Audio
  platform/
    extension.js     browser.storage, messaging
    userscript.js    GM_getValue / GM_setValue
  entries/
    content.js
    userscript.js
    background.js
    popup/ , loops-page/
```

The build (esbuild, one config, no framework) produces from the same source:

- `dist/firefox/` (MV3, Firefox 128+; or stay MV2 a bit longer; Firefox still supports it)
- `dist/chrome/` (MV3; also Edge, Brave, Opera, Vivaldi)
- `dist/section-loop.user.js` (Tampermonkey / Violentmonkey)
- zipped `.xpi` / `.zip` for the stores

This also ends the duplication between the userscript and `content.js` (today they've already
drifted: `isFinite` vs `Number.isFinite`, `loopsFromSaved(saved, duration)` vs `loopsFromSaved(saved)`).
The built `.xpi` stops being committed and moves into `dist/` (gitignored) and GitHub Releases.

### 4.2 The adapter contract

Every site is described by the same small object. The core never touches site DOM directly.

```js
export default {
  id: 'youtube',
  match: (url) => /(^|\.)youtube\.com$/.test(url.hostname),

  // Containers
  findPlayer(),               // element the panel/toast are mounted in (or null → floating mode)
  findMedia(player),          // the HTMLMediaElement to control
  buttonHost(player),         // where the toolbar button goes (null → floating pill)
  progressBar(player),        // where markers go (null → markers only in the panel)
  controlsTop(player),        // y position the panel should sit above (null → default)

  // Identity
  mediaKey(),                 // "yt:dQw4w9WgXcQ"; null if unknown yet
  mediaTitle(),               // for the "My loops" page

  // Playback state
  isAd(), isLive(),
  seek(t), play(), pause(),   // optional: defaults use media.currentTime / play(); override for DRM sites

  // Lifecycle
  navEvents: ['yt-navigate-finish', 'yt-player-updated'],  // extra "re-sync now" signals
  theme: { font: 'Roboto, Arial, sans-serif', accent: '62,166,255' },
};
```

The **generic adapter** implements it with heuristics, and every site adapter can fall back to it
for any method it doesn't define.

### 4.3 Generic adapter: picking the right media element

Pages often have several `<video>` elements (feeds, background videos, ads, previews). Rule:

1. Track every media element on the page (MutationObserver + `play` events captured on `document`,
   which also catches elements inside open shadow roots via `composedPath()`).
2. The **active** element is the one the user last played or clicked, otherwise the largest visible
   one with `duration > 5 s` that isn't `muted && autoplay && loop` (that's a decorative background
   video).
3. Recompute on `play`, on click, on scroll-out-of-view, and when an element is removed.

Its media key is `origin + pathname + "#" + Math.round(duration)` (query strings dropped except an
allow-list like `v`, `id`, `video`), so loops come back when you revisit the page.

### 4.4 UI isolation: Shadow DOM

Everything we inject (panel, pill, toast) moves into a closed shadow root on a single host element.
Site CSS can't reach in, ours can't leak out, and most of the defensive `!important` resets can go.
Markers drawn on a site's progress bar (known adapters only) stay in light DOM, scoped by class name.

Fullscreen: when `document.fullscreenElement` changes, the host moves inside it. If the site
fullscreens the bare `<video>` element (some do), nothing can be overlaid; in that case we show a
toast on exit and rely on hotkeys, which keep working.

### 4.5 Page-world script (Chrome + Firefox)

A second, tiny content script with `"world": "MAIN"` (Chrome 111+, Firefox 128+) does what the
isolated content script can't:

- Calls site player APIs (YouTube `getVideoData`, later Netflix seek). Replaces `wrappedJSObject`.
- Patches `HTMLMediaElement.prototype.play` to announce media elements that aren't in the DOM
  (SoundCloud). It attaches them to a hidden container so the content script can see them.
- Talks to the content script only through `CustomEvent`s on `document` with a random per-page
  channel name.

It stays under ~100 lines and is only injected on sites whose adapter asks for it.

### 4.6 Storage that works across sites

- Extension: `browser.storage.local` (shared across all sites, survives clearing site data).
  Optionally `storage.sync` for preferences only (sync quota is too small for loops).
- Userscript: `GM_getValue` / `GM_setValue` (shared across sites for that script).
- New format `v2`: `{ prefs, media: { "<adapter>:<key>": { loops, t, title, url } } }`. Raise
  `MAX_SAVED` to something like 1,000; storage.local is unlimited-ish.
- **Migration**: on youtube.com, read the old `localStorage['ysl:v1']` once, convert IDs to
  `yt:<id>`, write them to v2, mark migrated. Nobody loses their loops.
- Cross-tab safety: keep today's "re-read before writing" merge, plus `storage.onChanged` so an open
  tab picks up edits made in another one.
- Bonus: Export / import loops as JSON from the "My loops" page.

### 4.7 Permissions and privacy

Running on `<all_urls>` shows a scary "Access your data for all websites" warning and gets stricter
review on both stores. Proposal:

- **Static match list** for the curated sites (YouTube, Vimeo, Twitch, Dailymotion, SoundCloud,
  Bandcamp, Bilibili…). Works out of the box.
- **Everything else is opt-in** through the toolbar button: "Enable on this site" requests that one
  origin as an optional host permission and registers the content script for it
  (`scripting.registerContentScripts`). A one-click "Enable on all sites" for those who want it.
- `activeTab` lets the user try it once on the current tab without granting a permanent permission.
- Still zero data collection, no network requests, no analytics. Say so in the store listing.

### 4.8 Timing on less friendly players

The engine already handles `seeking`, hidden-tab timing and the end-of-video guard. Two additions:

- Use `requestVideoFrameCallback` where available for tighter turnarounds on video.
- Per-adapter `seekSlack` (Twitch / MSE players land a little after the target time), so a loop
  doesn't immediately re-trigger after a seek.

### 4.9 Spotify and the other protected music players

Spotify's web player plays DRM audio through a media element it doesn't put in the page, and it
keeps its own idea of the playback position. Setting `currentTime` behind its back is likely to
desync the UI or stop playback. The adapter therefore tries three ways to **seek**, in order, and
keeps the first that works (checked on each Spotify update):

1. **The site's own seek bar.** Spotify's progress bar is an `<input type="range">`. Setting its
   value and firing `input`/`change` makes Spotify seek itself, the same as a user dragging it.
   Most robust: it uses Spotify's own code path.
2. **The media element**, caught through the page-world `play` hook (4.5), if seeking it directly
   turns out to be safe.
3. **Spotify's internal player object**, found from the page world. Most fragile; last resort.

To **read the position** precisely enough to turn around on time, the adapter prefers the media
element's `currentTime` (from the hook), and falls back to the seek bar's value plus a local clock
between updates (the bar alone only moves once a second).

The "video ID" becomes the track ID (`spotify:track:<id>`, read from the "now playing" link), so
loops are saved per song, and switching tracks re-syncs like a YouTube navigation does. Ads on the
free tier are detected and loops pause, as on YouTube.

The same three-step approach is reused for Deezer, Tidal, Apple Music and Amazon Music, each with its
own selectors.

Risks specific to these sites: a loop turnaround through the seek bar may have a small audible gap
(~100–300 ms), and selectors break when the site ships a redesign. Each adapter has a self-check
("can I find the seek bar and the track ID?") and shows a "Loopsmith can't control this player right
now" toast instead of failing silently.

### 4.10 Testing

- **Unit tests** (Vitest) for the engine: `loopAt`, `loopEnd`, counts, overlaps, "when done"
  behaviour, migration v1→v2, the media-key builder. These are pure functions after the split.
- **Fixture tests** (Playwright with the built extension loaded): a local page with a generated
  30-second video (ffmpeg test pattern), several videos, a shadow-DOM player, an iframe player, a
  detached `Audio`. Asserts loops turn around at the right time.
- **Live-site smoke checklist** per adapter (manual, before each release): button appears, markers
  on the bar, loop turns around, loops restored after reload, SPA navigation to another video.

## 5. Phases

| Phase | Content | Result |
|---|---|---|
| **0. Foundation** | Build setup, split into modules, YouTube adapter with exact current behaviour, Shadow DOM, storage v2 + migration, engine unit tests | Same extension, new insides. Ship as a normal update. |
| **1. Any video** | Generic adapter, floating pill, active-media picking, fullscreen handling, toolbar popup with per-site enable, Chrome MV3 build | "Works on any site" release + Chrome Web Store listing |
| **2. Music** | Page-world script, docked audio panel, YouTube Music, Bandcamp, SoundCloud, **Spotify Web** (4.9) | Musicians covered: the main use case |
| **3. More music + video** | Deezer / Tidal / Apple Music / Amazon Music (one at a time), Vimeo, Twitch VODs, Dailymotion, Bilibili, feed sites (X, Reddit…) | Broad coverage |
| **4. Extras** | "My loops" page, export/import, playback speed / pitch-preserving slow-down for practice, Edge store, maybe Safari | |
| **5. Maybe** | Netflix, Disney+, Prime through their internal APIs, opt-in | Only with demand |

Each phase ends in a release that works on its own.

## 6. New name

The current name has "YouTube" in it, which also becomes a trademark problem on the stores once the
extension is about more than YouTube ("for YouTube" is tolerated; "YouTube X" as the product name is
not). Candidates, with the store title format `Name: A-B Loop for Any Video`:

| Name | Feel | Comment |
|---|---|---|
| **Loopsmith** (recommended) | Crafty, precise | Distinctive, easy to search, says "loop", fits musicians and learners. Repo: `loopsmith`. |
| **Section Loop** | Continuity | Keeps the current identity, just drops "YouTube". Safe but generic, hard to search for. |
| **Encore** | Musical, friendly | Nice word, but "Encore" is already a known music-notation software. Name clash risk. |
| **Riff** | Musicians | Short; very crowded name. |
| **Loop Lab** | Practice, learning | Clear; also fairly common. |
| **Again!** | Playful | Memorable; hard to search. |

The store title should always carry the keywords people actually search for: "A-B repeat", "loop",
"video". Before deciding, check the name on the Chrome Web Store, addons.mozilla.org, GitHub and a
trademark search.

**Chosen: Loopsmith.** Still to do before publishing: check the name on the Chrome Web Store,
addons.mozilla.org, GitHub and a trademark search.

Since nothing is published yet, the rename can be clean:

- Manifest `name`: `Loopsmith: A-B Loop for Any Video`; gecko `id`: `loopsmith@<your domain or handle>`
- Userscript `@name Loopsmith`, `@namespace loopsmith`
- CSS prefix `ysl-` → `ls-`, page marker `data-ysl` → `data-loopsmith`, storage key `loopsmith:v2`
  (the v1 migration still reads `ysl:v1` on youtube.com)
- GitHub repo `youtube-section-loop` → `loopsmith` (GitHub redirects the old URL)
- New icon: the current one is fine to start; a proper one before the store listing

## 7. Risks

| Risk | Mitigation |
|---|---|
| Sites change their DOM and adapters break | Adapters are small and each one falls back to the generic adapter, so a broken adapter degrades to "floating pill" instead of "nothing". |
| Store review for broad host permissions | Opt-in per site (4.7). |
| Regressions on YouTube during the rewrite | Phase 0 ships with no new features, only the refactor, checked against today's behaviour. |
| Overlay covers site controls on unknown sites | Pill only on hover, draggable, remembers its corner per site; panel closes on Escape. |
| Two copies (extension + userscript) both running | Keep the `data-ysl` DOM marker check. |
