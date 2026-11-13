# Loopsmith

A-B loop for any video: repeat one or several sections a chosen number of times. Drag the
handles, type a timestamp, or grab the current time. Hotkeys: Shift+A / Shift+B set the start / end
to now, Shift+S plays the selected loop, Shift+R turns looping on or off.

**Where it works**

- **YouTube**, out of the box: a loop button in the player's control bar, markers on the seek bar.
- **YouTube Music, SoundCloud, Spotify, Bandcamp**, out of the box: the loop button sits in the
  bottom-right corner, above the site's player bar. Loops are saved per track (YouTube Music shares
  them with YouTube). Spotify needs a browser with DRM support (regular Chrome, Edge, Firefox).
- **Vimeo, Twitch videos, Bilibili, Dailymotion**, out of the box: a loop button appears when you
  hover the video, and the markers sit on the site's own progress bar.
- **Any other site with an HTML5 video or audio**, once you turn it on: click the Loopsmith toolbar
  icon → *Turn on for this site* (or *for every website*). A loop button appears when you hover the
  video; for audio and small videos it sits in the bottom-right corner. The hotkeys work there once
  you have played the media.
- The userscript runs on every site; narrow it with your userscript manager's include/exclude rules.

Players built as web components (media inside shadow DOM) are found too, as long as their shadow
root is open. **Not yet:** Deezer, Tidal, Apple Music, Amazon Music. See the plan in
[docs/MULTI_SITE_PLAN.md](docs/MULTI_SITE_PLAN.md).

## Build

```bash
npm install
npm run build   # dist/firefox, dist/chrome, dist/loopsmith.user.js (+ .xpi / .zip)
npm test        # unit tests: loop rules, whole playback scenarios, storage, site mapping
npm run e2e     # browser tests on local test pages (real playback in Chromium)
npm run e2e:live  # browser tests on YouTube, SoundCloud, Bandcamp with the built extension
```

The browser tests need `npx playwright install chromium` once, and ffmpeg for the test media.
Spotify and YouTube Music can't be tested this way (DRM, and YouTube Music refuses automated
browsers): check them by hand after changes that touch them.

- **Firefox:** `about:debugging` → This Firefox → Load Temporary Add-on → `dist/firefox/manifest.json`
- **Chrome / Edge / Brave:** `chrome://extensions` → Developer mode → Load unpacked → `dist/chrome`
- **Userscript:** install `dist/loopsmith.user.js` in Tampermonkey or Violentmonkey

Loops saved by YouTube Section Loop 1.x are copied over automatically the first time Loopsmith
runs on youtube.com.

## Layout

```
src/core/       loop rules (engine.js), storage (store.js), timestamps: no DOM, unit-tested
src/ui/         DOM helpers, icons, styles
src/app.js      the player: state, playback control, panel, hotkeys
src/adapters/   one file per site (youtube.js, spotify.js, video-sites.js…) + generic.js for any
                other page
src/sites.js    sites with a dedicated adapter (they run without asking for a permission)
src/background.js, src/popup/   per-site on/off: optional permissions + a registered content script
src/page/       tiny scripts that run in the page's own JS world: YouTube player data, and a hook
                that brings out-of-page audio (SoundCloud, Spotify) into the page
src/platform/   storage backends: extension storage, userscript storage
scripts/build.mjs
```
