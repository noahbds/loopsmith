# Contributing to Loopsmith

Thanks for helping. Bug reports, site requests and pull requests are all welcome.

## Reporting a problem

Open an [issue](https://github.com/noahbds/loopsmith/issues/new/choose) and pick the template that
fits. For a site that misbehaves, the most useful details are the page address, your browser and
its version, and what you did step by step.

Security problems: please don't open a public issue, see [SECURITY.md](SECURITY.md).

## Setting up

Needs Node.js 20 or later.

```bash
git clone https://github.com/noahbds/loopsmith.git
cd loopsmith
npm ci
npm run build
```

Load `dist/chrome` (`chrome://extensions` → Developer mode → *Load unpacked*) or
`dist/firefox/manifest.json` (`about:debugging` → *Load Temporary Add-on*). After each
`npm run build`, click the reload button on the extension and reload the page you test on.
`npm run dev` rebuilds on every change to `src/`.

## How the code is organised

```
src/core/        loop rules (engine.js), storage, timestamps, media detection: no site specifics
src/app.js       wires the parts of the player together (about 90 lines)
src/app/         the player, in parts: state, video tracking, running the loops, editing, drawing,
                 panel controls, layout, hotkeys
test/            unit tests (vitest) and browser tests (Playwright) on local pages
src/adapters/    one file per site; generic.js handles any other page
src/sites.js     the built-in sites: which adapter, which pages, which page-world scripts
src/page/        small scripts that run in the page's own JavaScript world
src/background.js, src/popup/   "Turn on for this site": optional permissions + registered scripts
scripts/build.mjs   builds both browsers from the same sources (esbuild, no minification)
```

### Adding support for a site

1. Check first whether the generic adapter already works: turn Loopsmith on for the site from the
   toolbar popup. Often only the progress-bar markers or the "which track is this" part need help.
2. Add an adapter in `src/adapters/`. Most sites only need a few fields on top of `generic.js`
   (see `video-sites.js`): `progressBar` (where markers go), `identify` (a stable id per video or
   track), `isAd`, and for music sites `dockOnly` / `dockInset`.
3. Register it in `src/sites.js` (name, match patterns, adapter) and in `src/boot.js`.
4. Test it for real (see below) and describe what you checked in the pull request.

## Testing your change

Run these before opening a pull request (the CI runs the first four on every push):

```bash
npm run lint        # ESLint
npm run typecheck   # tsc on the pure core (src/core/engine.js, store.js, util.js), types in src/types.js
npm test            # unit tests (vitest)
npm run build
npm run e2e         # real Chromium on local test pages; needs ffmpeg and `npx playwright install chromium`
```

New loop rules go in `src/core/engine.js` as pure functions with a test in `test/`.

Please also check by hand, in the browser, at least:

- a loop set to play twice jumps back once, then playback carries on;
- the markers sit on the site's progress bar;
- the loop is still there after reloading the page;
- two overlapping loops in "Next loop" mode: the first plays its count, then the second plays from
  its own start;
- the Shift shortcuts work, and don't fire while typing in a text field on the page;
- YouTube still works if you touched shared code (`src/app/`, `src/core/`).

For Firefox, `npx web-ext lint --source-dir dist/firefox` runs Mozilla's validator; the CI runs it
on every push.

## Rules for code

- **No network requests, analytics or tracking**, ever. Loopsmith's privacy promise depends on it.
- No runtime dependencies: everything ships in the bundle, nothing is loaded remotely.
- No `innerHTML` with dynamic content (some sites enforce Trusted Types); build DOM nodes instead.
- Keep site-specific code in adapters; `src/app/` and `src/core/` stay site-agnostic.
- Match the existing style (2-space indent, semicolons, single quotes); `.editorconfig` covers the basics.

## Pull requests

Keep each pull request to one change, explain what it fixes and how you tested it, and add a line to
the *Unreleased* section of [CHANGELOG.md](CHANGELOG.md). By contributing, you agree that your
contribution is licensed under the [MIT license](LICENSE).
