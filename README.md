<p align="center">
  <img src="assets/icon-128.png" width="96" height="96" alt="">
</p>

<h1 align="center">Loopsmith</h1>

<p align="center">
  A-B loop for any song or video: repeat one or several sections, a chosen number of times or forever.
</p>

<p align="center">
  <a href="https://github.com/noahbds/loopsmith/actions/workflows/ci.yml"><img src="https://github.com/noahbds/loopsmith/actions/workflows/ci.yml/badge.svg" alt="Build"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
</p>

<p align="center">
  <img src="store/screenshot-1-youtube.png" width="760" alt="Loopsmith's panel over a YouTube video, with two loops marked on the progress bar">
</p>

Made for practising (a guitar riff, the hard part of a song, a dance move, a language lesson) and
for keeping your favourite part of a song on repeat.

## Install

- **Chrome, Edge, Brave:** Chrome Web Store (in review)
- **Firefox:** Firefox Add-ons (in review)
- **From source:** see [Build](#build), or download the packages attached to each
  [release](https://github.com/noahbds/loopsmith/releases).

## What it does

- Set the start and end by dragging the A and B handles, typing a time (`1:23`, `90s`, `1m30s`), or
  grabbing the current position.
- Choose how many times a section plays (1 to 999) or forever.
- Several loops per video or track, overlapping or nested; switch one off without deleting it.
- When a loop is done: play on, jump to the next loop, or pause after the last one.
- Loops show on the site's own progress bar, and are saved per video or track.
- Skip ahead without waiting: next / previous loop, skip a repetition, restart it, or jump to loop 1–9.
  Deleting loops can be undone.
- Shortcuts: <kbd>Shift</kbd>+<kbd>A</kbd> / <kbd>Shift</kbd>+<kbd>B</kbd> set start / end to now,
  <kbd>Shift</kbd>+<kbd>S</kbd> plays the selected loop, <kbd>Shift</kbd>+<kbd>R</kbd> turns looping
  on or off, <kbd>Shift</kbd>+<kbd>]</kbd> / <kbd>[</kbd> next / previous loop,
  <kbd>Shift</kbd>+<kbd>\</kbd> skips a repetition, <kbd>Shift</kbd>+<kbd>Z</kbd> restarts it,
  <kbd>Shift</kbd>+<kbd>1</kbd>…<kbd>9</kbd> goes to that loop.

## Where it works

| | |
|---|---|
| **Built in** | YouTube, YouTube Music, Spotify, SoundCloud, Bandcamp, Vimeo, Twitch (videos and clips), Bilibili, Dailymotion |
| **Any other site** | Click the toolbar button, then *Turn on for this site* (or *for every website*). Works with any HTML5 `<video>` / `<audio>`, including players built as web components. |
| **Not yet** | Deezer, Tidal, Apple Music, Amazon Music. Help welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). |

Live streams can't be looped. Spotify needs a browser with DRM support (regular Chrome, Edge, Firefox).

## Privacy

No account, no analytics, no network requests. Loops are stored in your browser only, and
Loopsmith only runs on other sites after you turn it on for them. See [PRIVACY.md](PRIVACY.md).

## Build

Needs Node.js 20 or later.

```bash
npm ci
npm run build   # dist/chrome, dist/firefox, plus loopsmith-chrome.zip and loopsmith-firefox.xpi
```

- **Chrome / Edge / Brave:** `chrome://extensions` → Developer mode → *Load unpacked* → `dist/chrome`
- **Firefox:** `about:debugging` → This Firefox → *Load Temporary Add-on* → `dist/firefox/manifest.json`

## Contributing

Bug reports, site requests and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md);
security issues go through [SECURITY.md](SECURITY.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE). Loopsmith is not affiliated with any of the sites it works on.
