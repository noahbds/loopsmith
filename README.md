# Loopsmith

A-B loop for any video: repeat one or several sections a chosen number of times. Drag the
handles, type a timestamp, or grab the current time. Hotkeys: Shift+A / Shift+B set the start / end
to now, Shift+S plays the selected loop, Shift+R turns looping on or off.

**Where it works**

- **YouTube**, out of the box: a loop button in the player's control bar, markers on the seek bar.
- **Any other site with an HTML5 video or audio**, once you turn it on: click the Loopsmith toolbar
  icon → *Turn on for this site* (or *for every website*). A loop button appears when you hover the
  video; for audio and small videos it sits in the bottom-right corner. The hotkeys work there once
  you have played the media.
- The userscript runs on every site; narrow it with your userscript manager's include/exclude rules.

Not yet: media inside shadow DOM players, SoundCloud, Spotify and other music apps. See the plan in
[docs/MULTI_SITE_PLAN.md](docs/MULTI_SITE_PLAN.md).

## Build

```bash
npm install
npm run build   # dist/firefox, dist/chrome, dist/loopsmith.user.js (+ .xpi / .zip)
npm test        # unit tests for the loop engine and storage
```

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
src/adapters/   one file per site (youtube.js) + generic.js for any other page
src/sites.js    sites with a dedicated adapter (they run without asking for a permission)
src/background.js, src/popup/   per-site on/off: optional permissions + a registered content script
src/page/       tiny scripts that run in the page's own JS world (Chrome)
src/platform/   storage backends: extension storage, userscript storage
scripts/build.mjs
```
