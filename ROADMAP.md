# Loopsmith: audit and improvement plan

Version audited: **1.2.0** (`main` at `38d138c`). Scope: every file under `src/`, the build script,
CI workflows, the store listing and the privacy policy.

**Method and limits.** This is a static read of the code plus the repository layout. I did not run
the extension, the unit tests or the e2e suite, and I did not open any supported site. Anything
marked *verify* is a hypothesis to check before acting on it. Line numbers refer to the 1.2.0 files.

**How to read the tables.**

- **Sev:** `H` high (data loss, blocks a core use, or hurts every user), `M` medium, `L` low.
- **Eff:** `S` under a day, `M` a few days, `L` a week or more.
- IDs (U1, E3, C1…) are referenced from the phases in section 4.

---

## 1. Snapshot

| Area | State |
|---|---|
| Size | about 3,240 lines in `src/`. `src/app.js` alone is 1,544 (48%). |
| Architecture | Content script per page. Site specifics live in `src/adapters/`. Loop rules are pure functions in `src/core/engine.js`. UI is hand-built DOM in a shadow root. Popup and background only manage permissions. |
| Sites | Built in: YouTube, YouTube Music, Spotify, SoundCloud, Bandcamp, Vimeo, Twitch, Bilibili, Dailymotion. Opt-in generic adapter for any `<video>`/`<audio>`. |
| Storage | `storage.local`, one key per media item (`m:<key>`) plus `prefs`. Capped at 1,000 items. |
| Tests | 7 unit files (about 590 lines, mostly engine, store, media-key logic), a Playwright e2e suite, and a live-site smoke script. **None of it is in the repository** (see C1). |
| CI | Build, bundle syntax check, Mozilla `web-ext lint`. No tests. |

**What is already good (keep it):**

- Loop rules are pure and well tested: nested and overlapping loops, "next loop" semantics.
- The panel is in a shadow root, so site CSS can't break it, and e2e checks that.
- Adapter abstraction is clean, and the generic adapter finds media in shadow DOM and in
  `new Audio()` players through the page-world hook.
- Privacy posture is strong: no network, per-site opt-in permissions.
- Basic accessibility exists: slider roles, `aria-pressed`, `prefers-reduced-motion`, `aria-live`
  toast.
- Careful details: timestamp parsing, caret-aware arrow stepping, hold-to-repeat, wheel stepping,
  ad detection, adapter-specific end guards.

---

## 2. Audit findings

### 2.1 Interface and ergonomics (`src/app.js`, `src/ui/styles.js`)

| ID | Finding | Evidence | Sev | Eff |
|---|---|---|---|---|
| U1 | **Three overlapping on/off/start controls.** Header power icon switches *one loop* on or off. The big button turns *the whole run* on or off. The ▶ button *seeks to A and turns looping on*. All three look like "make it loop". Their effects differ in scope, not in kind. | `toggleLoop` (445), `armRun`/`stopRun` (345/368), `startLoop` (356) | H | M |
| U2 | **Three buttons do the same destructive thing.** Trash on a single-loop set calls `resetAll`. The ↻ button calls `resetAll`. With several loops, trash removes one, reset removes all 12 with no confirmation and no undo. | `removeLoop` (499), `resetAll` (514), reset button (1262) | H | S |
| U3 | **Two ways to set "forever".** The ∞ toggle and a count field that shows `∞` and turns back into a number when clicked. | `ui.inf`, `ui.count` click handler (1197–1208) | M | S |
| U4 | **Scope confusion on "When done".** It is global but sits beside the per-loop count. It dims silently when every loop is infinite (no explanation). The three options mix two separate decisions: what happens *between* loops, and what happens at the *end*. | `setAfter` (437), `ysl-dim` toggle (795), `AFTER` in constants | H | M |
| U5 | **The panel covers the video.** Fixed 344px, anchored above the controls, not draggable, no compact mode. While practising you usually want to see the video or the score. | `place()` (1083), `.ysl-panel` CSS | H | M |
| U6 | **Panel steals the player's keyboard.** After clicking any panel button, focus stays inside the shadow root. Every `keydown` is stopped at the panel, so Space, K, arrows and F stop working for the player. Worse, Space or Enter re-activates the button you just clicked (e.g. toggles looping off instead of pausing). | stop-propagation loop (1300–1303) | H | S |
| U7 | **Status is crammed into the main button.** "Turn off · Loop 2 · 3/5" with a progress fill behind it, on a 344px panel. It truncates with long labels, and the button is also the stop control. | `renderLive` (624), `.ysl-main` CSS | M | S |
| U8 | **Chips are numbers only.** No names. Up to 12 loops but only 6 palette colours, so loop 7 repeats loop 1's colour. They wrap into several rows. No reordering. Clicking the *already selected* chip seeks to its start, a hidden behaviour documented only in a tooltip. | `freeColor` (67), `makeChip` (678), `selectLoop` (462), `MAX_LOOPS`/`PALETTE` | M | M |
| U9 | **Slider limits.** You can't drag a loop as a whole (move both ends together). Clicking the track moves the *nearest* handle, which is easy to trigger by accident. Zoom is a small manual toggle next to the length text and re-fits only when you press it. | `bindSlider` (998), `ui.zoom` (1157) | M | M |
| U10 | **Four ways to edit each time, but only 0.1 s precision.** Handle, −/+, "now", typed text, plus ↑/↓ and wheel. Typed `1:23.45` is rounded to tenths. | `makeField` (896), `movePoint` uses `round1` | M | S |
| U11 | **Targets are small.** Icon buttons are 22×26px and 26×26px, field labels 10.5px. Below the WCAG 2.2 minimum target size (24×24 CSS px) in one dimension. Poor for touch (Firefox Android). | `.ysl-ib`, `.ysl-hb`, `.ysl-label` CSS | M | S |
| U12 | **Nothing teaches the shortcuts.** They appear only in tooltips and in the popup footer. No first-run hint, no cheat-sheet in the panel. | `title` attributes, `popup.html` | M | S |
| U13 | **A finished run just stops.** `finishRun` turns looping off and zeroes counters; a toast says "Loop finished". To go again you press Turn on, then ▶ again. No "Run again". | `finishRun` (305) | M | S |
| U14 | **Panel state isn't remembered.** Selected loop, panel position, open/closed, zoom all reset on every page load. | `S.sel`, `S.zoom`, `S.open` not persisted | L | S |
| U15 | **Little feedback when a loop turns.** Only a badge pop on the toolbar button. No optional audio tick, and nothing visible when the panel is closed beyond the badge. | `replay(ui.badge, 'ysl-pop')` | L | S |

### 2.2 Loop engine and behaviour (`src/core/engine.js`, `check()` in `app.js`)

| ID | Finding | Evidence | Sev | Eff |
|---|---|---|---|---|
| E1 | **No way to skip.** Cannot skip one repetition, skip the rest of a loop, go to the next or previous loop, restart the current repetition, or jump to loop N. The only navigation is seeking by hand or finishing counts. | `engine.js` exports only `advance` (automatic) and helpers | H | M |
| E2 | **No sequence repeat.** Loops 1→2→3 then stop. You can't say "play the whole set 4 times" or "cycle forever". When the last loop finishes the run ends (`finishRun`). | `advance` returns `{finish:true}` (101) | H | M |
| E3 | **No speed control at all.** Nothing writes `playbackRate`, even though slowing a passage is the main reason musicians loop. Speed ramping (+5% every N reps) is the standard practice tool. | no `playbackRate` writes in `src/` | H | M |
| E4 | **No gap or count-in.** A rep restarts instantly. Can't add a pause between reps or a lead-in before the first. | `turnAround`, `seekTo` | M | M |
| E5 | **0.1 s precision and 0.5 s minimum length.** `round1` everywhere, `MIN_LEN = 0.5`. Too coarse for short riffs, ornaments, or drum fills. | `util.js`, `constants.js`, `movePoint` | M | M |
| E6 | **Turn-around timing is event-driven and unmeasured.** It relies on `timeupdate` plus rAF near loop ends, a 0.25 s guard (more in hidden tabs, `0.1 + 0.3×rate`), and a seek. Seeking on streaming players can rebuffer and leave an audible gap. There is no benchmark of the actual error per site/browser. | `turnGuard` (251), `wantsFrames` (539) | M | M |
| E7 | **A large forward jump is ignored.** `check()` returns early when `t - prev > max(2, rate×2)`. If a throttled tab ever jumps more than that between checks, the loop end is missed. *Verify* how often media events are delayed in background tabs. | `check` (281) | M | S |
| E8 | **The untouched default loop isn't saved.** If the only loop spans the whole video, `rememberLoops` stores `null`. Changing its count or ∞ then isn't kept for that video (only the global default is). | `isDefaultSet`, `rememberLoops` (91) | L | S |
| E9 | **Other tabs aren't followed.** `store.load` hears changes from other tabs, but the running app never re-reads them. Two tabs on the same video diverge until reload. | `store.onChange`, no listener in `app.js` | L | M |
| E10 | **The last 0.25 s of a track can never be part of a loop that ends at the end.** Intentional (avoids autoplay), but undocumented. | `loopEnd` | L | S |

### 2.3 Data and storage (`src/core/store.js`)

| ID | Finding | Evidence | Sev | Eff |
|---|---|---|---|---|
| D1 | **Pruning evicts the wrong items.** Oldest by last *edit* (`t`), not last *use*. A loop you play every day but never edit is the first to go once you pass 1,000 items. And it happens silently. | `prune` (55), `rememberLoops` sets `t` only on edit | H | S |
| D2 | **No title or URL stored.** The file header mentions `title?, url?` but nothing writes them. A library UI can't show names. | `store.js` header, `rememberLoops` | H | S |
| D3 | **No export, import, or backup.** Uninstalling or switching browser loses everything. | none | M | M |
| D4 | **No schema version per entry.** Only a one-off `mig:v1` flag. Adding fields later has no migration path. | `store.js` | M | S |
| D5 | **Fragile keys on arbitrary sites.** `host + path + chosen params + rounded duration`. A page whose duration shifts by a second (dynamic ad insertion) loses its loops; different media with the same duration on one URL share loops. No manual "re-link". | `mediaKey` | M | M |
| D6 | **No cross-device sync.** `storage.sync` unused. | `platform/extension.js` | L | M |
| D7 | **Every frame loads the entire store.** `getAll()` is `storage.local.get(null)`, run in every frame of every enabled page. With 1,000 entries that is wasteful on pages with many iframes. | `platform/extension.js`, `store.load` | M | M |

### 2.4 Sites and adapters (`src/adapters/`, `src/sites.js`)

| ID | Finding | Evidence | Sev | Eff |
|---|---|---|---|---|
| S1 | **Selector fragility.** Spotify test IDs, SoundCloud classes, YouTube Music element IDs, Twitch `data-a-target`, Bilibili `bpx-*`. Any site redesign breaks an adapter silently. The live smoke script exists but is local only. | adapters, `test/e2e/live.mjs` | H | M |
| S2 | **Missing sites.** Deezer, Tidal, Apple Music, Amazon Music (all listed "not yet"), plus Rumble, Kick, Odysee, Nebula, Internet Archive; Netflix and other DRM video (likely needs page-world player APIs, *verify*). | README | M | M each |
| S3 | **Local files can't be enabled.** The popup refuses anything not `http(s)`, so a local `file://` mp3/mp4 (a very common practice workflow) is out. Chrome needs "Allow access to file URLs" per extension. | `popup.js` protocol check | M | M |
| S4 | **Unverified edge cases on YouTube.** Shorts (`/shorts/<id>`: `idFromUrl` only handles `/watch` and `/live`), embeds on third-party sites, playlists that autoplay, chapters. *Verify each.* | `youtube.js` | M | S |
| S5 | **No touch or mobile story.** The UI is mouse-first; Firefox for Android runs MV3 extensions. *Verify* it loads there at all. | CSS, pointer handling | L | L |

### 2.5 Popup, background, manifest

| ID | Finding | Evidence | Sev | Eff |
|---|---|---|---|---|
| P1 | **The popup is only a permission switch.** No loops list, no settings, no help, no status of the current tab's loops. | `popup.js` | H | M |
| P2 | **No browser-level shortcuts.** No `commands` in the manifest, so shortcuts only work with the page focused, can't be remapped, and don't show in the browser's own shortcut manager. Hotkeys are fixed to Shift+A/B/R/S. | `build.mjs`, `onHotkey` (1467) | M | M |
| P3 | **No options page.** Default count, default length, shortcuts, behaviour toggles have no home. | no `options_ui` | M | M |
| P4 | **Toolbar icon never reflects looping.** No badge text or colour. You can't tell from another tab that a loop is running. | `background.js` has no messaging | L | S |
| P5 | **`activeTab` may be unnecessary.** *Verify* whether the popup's `tabs.query` needs it. Dropping an unneeded permission helps store review and trust. | `build.mjs` permissions | L | S |
| P6 | **No i18n.** No `_locales`, English strings hardcoded across files. | everywhere | M | L |
| P7 | **Page-world channels are spoofable.** Data attributes and DOM events (`data-ysl-seek`, `ysl:yt-seek`) can be triggered by the page. Impact is tiny (it can ask the player to seek) but worth a comment or a nonce. | `src/page/youtube.js` | L | S |

### 2.6 Accessibility

| ID | Finding | Sev | Eff |
|---|---|---|---|
| A1 | `role="dialog"` but opening doesn't move focus into it, there is no focus trap, and nothing announces it. Focus is only restored on close. | M | S |
| A2 | 12 chips = 12 tab stops. Should be one tab stop with arrow-key navigation (roving tabindex). | M | S |
| A3 | Target sizes (U11) and 10.5px labels. | M | S |
| A4 | Panel direction is forced `ltr` and font sizes are fixed px. No text-scaling or RTL consideration. | L | S |
| A5 | No `forced-colors` (Windows high contrast) styling. | L | S |

### 2.7 Code health, testing, CI

| ID | Finding | Evidence | Sev | Eff |
|---|---|---|---|---|
| C1 | **Tests are not in the repository.** `.gitignore` ends with "Tests are kept locally, not in the repository: `test/`". `package.json` still has `test`, `e2e`, `e2e:live` scripts and vitest/playwright/happy-dom dev dependencies, and CI never runs them. Contributors can't run tests; regressions merge unchecked. | `.gitignore`, `ci.yml`, `package.json` | H | S |
| C2 | **`app.js` is a 1,544-line closure** mixing state, engine glue, DOM building, layout, hotkeys and site mounting. Nearly all of it is untestable except through a browser. | `src/app.js` | H | L |
| C3 | **No lint, format or type check.** Only `.editorconfig`. The adapter contract lives in a comment at the top of `youtube.js`; the loop shape in a comment in `engine.js`. | repo root | M | M |
| C4 | **Old-name debt.** `ysl-` CSS prefix, `data-ysl-*` attributes, `ysl:` events, `ysl:v1` key, from *YouTube Section Loop*. Harmless, but they leak the old name to every page. Keep `ysl:v1` (migration needs it). | many | L | M |
| C5 | **No dev loop.** No watch build, no `web-ext run`. The build shells out to `zip` (no Windows support). | `build.mjs` | M | S |
| C6 | **No diagnostics for bug reports.** By design nothing leaves the browser, so issues arrive as "doesn't work on X". An in-extension "Copy diagnostics" (site, adapter, key, duration, versions) would fix this without breaking privacy. | none | M | S |
| C7 | **Changelog and release notes are manual.** `Unreleased` is empty. | `CHANGELOG.md` | L | S |

### 2.8 Performance

| ID | Finding | Evidence | Sev | Eff |
|---|---|---|---|---|
| R1 | `findProgressBar` walks the whole player subtree, including shadow roots, every 2 s on generic pages, even after it found the bar. Back off once found and stable. | `generic.js` `progressBar`, `findbar.js` | L | S |
| R2 | A 1 s `setInterval` runs on every attached page whenever the tab is visible, even when idle. Fine today, but worth a budget. | `app.js` (1504) | L | S |
| R3 | Whole-store load per frame (see D7). | | M | M |

### 2.9 Docs and store

| ID | Finding | Sev | Eff |
|---|---|---|---|
| L1 | README and listings have no demo GIF; screenshots will be stale after the redesign. | M | S |
| L2 | No in-extension help, first-run tip, or "what's new". | M | S |
| L3 | No practice recipes ("guitar riff at 70% with ramp", "language shadowing"), which is the product's main use case. | M | S |
| L4 | Two listings (`listing.md`, `firefox-listing.md`) to keep in sync by hand. | L | S |

---

## 3. Design decisions to make the plan concrete

### 3.1 Control model: one job per control

| Control | Scope | Does |
|---|---|---|
| **Loop switch** (big, global) | whole run | Looping on/off. Video stays where it is. |
| **▶ Play loop** | selected loop | Seek to A, make sure looping is on, play. |
| **Dot on a chip** | one loop | Switch that loop on/off (kept and saved, never played). |
| **⏮ / ⏭** | run | Previous / next loop (see 3.2). |
| **⋯ menu** | panel | Clear all loops, export, settings, help. |
| **Delete** (per chip menu) | one loop | Remove it. Single remaining loop: reset to whole video. |

Removed: header power icon, standalone trash button, ↻ button. Anything destructive that affects
more than one loop gets an **Undo toast** (see 3.5) instead of a confirm dialog.

### 3.2 Skipping semantics (E1)

Add a runtime-only flag `skip` on a loop (never saved, cleared by `arm` and `stopRun`).
`skipped(l)` becomes `!l.on || l.skip || exhausted(l)`, so the existing engine already treats a
skipped loop as played out.

| Action | Effect | Counts a play? |
|---|---|---|
| **Restart repetition** | Seek to A of the current loop | No |
| **Skip repetition** | Current repetition counts as played, go to the next one (or the "after" rule if it was the last) | Yes |
| **Finish loop / next loop** ⏭ | Mark the current loop `skip`, seek to the start of the next playable loop (list order, or time order if ordering is by time). None left: apply the end-of-run rule (3.4). | n/a |
| **Previous loop** ⏮ | If more than 2 s into the repetition: restart it. Otherwise un-skip the previous loop (`done = 0`, `skip = false`) and seek to its A. Same convention as music players. | n/a |
| **Go to loop N** | Un-skip loop N, reset its `done`, seek to A, arm if needed | n/a |

For an infinite loop "skip repetition" just restarts it, and "next loop" is the way out. That is
why ⏭ exists as a separate action.

New pure functions in `engine.js` (return the same `{ seek, ... }` shape as `advance`, so `app.js`
needs one code path): `skipRep`, `skipLoop`, `prevLoop`, `gotoLoop`. Each gets scenario tests next
to the existing ones.

### 3.3 Hotkeys

Rule from the owner: **no default may collide with an existing YouTube shortcut.** Keep what exists
(`Shift+A`, `Shift+B`, `Shift+R`, `Shift+S`; YouTube doesn't use them). Add:

| Action | Default | Why it is safe (to verify, see below) |
|---|---|---|
| Next loop | `Shift+]` | YouTube has no bracket shortcuts |
| Previous loop | `Shift+[` | same |
| Skip repetition | `Shift+\` | unbound |
| Restart repetition | `Shift+Z` | unbound (`z` is not a YouTube key) |
| Go to loop 1–9 | `Shift+1`…`Shift+9` | YouTube's number keys are unshifted (seek to %) |
| Speed down / up | `Shift+;` / `Shift+'` | unbound |

Deliberately avoided: `Shift+N` / `Shift+P` (next/previous video), `Shift+,` / `Shift+.` (speed),
`+` / `-` (caption size, so `Shift+=` is out), `Shift+/` (help), plain arrows, `K J L F M T I C O`
and digits (YouTube's own keys), and anything with Ctrl, Alt or Cmd (browser shortcuts).

Keys are matched by physical `event.code` (`BracketLeft`, `Backslash`, `KeyZ`, `Digit1`…) so they
work on non-QWERTY layouts, as `onHotkey` already does for letters. **Collision check required
before shipping:** compare every default with each built-in site's native shortcuts (YouTube,
YouTube Music, Spotify, SoundCloud, Vimeo, Twitch, Bilibili, Dailymotion) and note any clash in the
table. Every shortcut is remappable (options page) and the key ones are also registered through
the manifest `commands` API (P2).

### 3.4 Between loops and at the end: split "When done" (U4, E2)

Replace the single three-way choice with two clear settings:

1. **Between loops:** *Keep playing* (play the gap) or *Jump to the next loop*.
2. **After the last loop:** *Keep playing*, *Pause*, *Restart the set*, or *Repeat the set N times*
   (N or ∞).

Mapping from today's values, so saved prefs migrate cleanly: `continue` → keep playing / keep
playing; `next` → jump / pause (today's "Next loop" pauses after the last one); `pause` → keep
playing / pause. Existing per-user prefs convert once at load.

### 3.5 Undo

A small in-memory history (last 20 loop-set snapshots, per media key) with Ctrl/Cmd+Z when the
panel has focus and an **Undo** button on the toast after destructive actions (delete loop, clear
all, reset). Snapshots are `E.serializeLoops` output, which already exists.

### 3.6 Panel layout

Two modes. The compact strip is shown while a run is active and the editor is closed. The full
editor opens from the strip or the toolbar button.

```
Compact run strip (≈ 300 × 44)
┌───────────────────────────────────────────┐
│ ●2  rep 3/5  ━━━━━━○──────  ⏮  ⏭   ⏹   ⤢ │   ⤢ = open editor, drag by the grip
└───────────────────────────────────────────┘

Full editor (≈ 344 wide, draggable, remembers position)
┌───────────────────────────────────────── ⋯ ✕ ┐
│ [●1 Intro ×5] [●2 Riff ∞] [○3 off]  [+]      │  chips: dot = on/off, click = select,
│                                              │  double-click = rename, drag = reorder
│  A━━━━━━━━━━━━━━━━━━━━|━━━━━━━━━━━━━B   🔍    │  drag the filled bar to move the loop
│  0:00        Length 1:39:46        1:39:46   │
│  START  [−] 0:00.0 [+] [◎]   END  [−] 1:39 [+] [◎]
│  PLAYS  [−] 5 [+]  (top value = ∞)           │
│  SPEED  [−] 100% [+]   ▢ ramp +5% / 3 reps   │
│  [ ▶ Play loop ]         [ ⟳ Looping: ON ]   │
└──────────────────────────────────────────────┘
```

Rules: no more than three primary actions visible; settings live behind ⋯; panel never covers the
site's controls; Escape closes; focus returns to the player (U6).

### 3.7 Data model v2 (backward compatible)

```jsonc
// m:<media key>
{
  "v": 2,
  "loops": [ { "a": 12.3, "b": 20.1, "n": 5, "inf": false, "on": true, "c": 0,
               "name": "Intro riff", "rate": 0.75, "gap": 0 } ],   // new fields are optional
  "set": { "repeat": 1 },          // sequence repeat (E2); omitted = play the set once
  "title": "Song name", "url": "https://…",  // D2, captured at first save
  "t": 1731500000000,              // last edit
  "u": 1731600000000,              // last use, touched at most once per page session (D1)
  "stats": { "plays": 120, "secs": 1840 }    // optional, Phase 3
}
// prefs
{ "count": 5, "infinite": false, "after": "continue",   // v1 fields stay readable
  "between": "play", "end": "continue", "len": 30, "keys": {}, "defaultRate": 1, "stats": false, "panel": { "x": 0, "y": 0, "mode": "auto" } }
```

`loopsFromSaved` already ignores unknown fields and drops malformed ones, so older extension
versions keep working with newer data. Prune by `max(t, u)`.

---

## 4. Roadmap

Each phase is shippable on its own. Item IDs link back to findings.

### Phase 0: Foundation (do first; no user-visible change)

Goal: make the rest safe to build.

- [ ] **C1** Track `test/` in git. Generate large fixtures (`bg.mp4`, `main.mp4`, `song.mp3`) with
  `test/e2e/make-media.mjs` instead of committing them. Remove the `.gitignore` line. Add
  `npm test` to `ci.yml`; run e2e in a second job (Playwright, Chromium) that may be marked
  non-blocking at first.
- [ ] **C2** Split `app.js`:
  - `core/session.js`: the state `S`, the run actions (arm, stop, skip, seek) and the check loop,
    with the player and clock injected so it runs under happy-dom or plain mocks.
  - `ui/panel.js`, `ui/slider.js`, `ui/fields.js`, `ui/chips.js`, `ui/compact.js`: DOM only,
    driven by a `render(state)` call.
  - `core/hotkeys.js`, `platform/layout.js` (floating overlay and docking).
  Do it behind the existing tests and the e2e suite, one extraction per commit.
- [ ] **C3** Add ESLint, Prettier (or Biome), and `tsc --checkJs` with JSDoc typedefs for `Loop`,
  `Adapter`, `Store`. Move the adapter contract out of `youtube.js` into `src/adapters/README.md`
  plus a typedef.
- [ ] **C5** `npm run dev` (esbuild watch plus `web-ext run`). Replace the `zip` shell call with a
  Node zip so Windows works.
- [ ] **D7 / R3** Load only `prefs` and the current media key at boot (`storage.local.get([...])`),
  not the whole store. Library views load lazily.
- [ ] **C6** "Copy diagnostics" button (popup, later panel menu): version, browser, adapter, media
  key, duration, loop count. Nothing is sent anywhere.
- [ ] **C4** Rename the legacy names for **1.3** (owner decision): CSS prefix `ysl-` → `ls-`,
  `data-ysl*` attributes, `ysl:` events, `ysl-style` id. The content script, the page-world scripts
  (`src/page/*.js`) and the adapters must change in the same commit, since they talk through those
  names. **Keep reading the old `ysl:v1` localStorage key** (the v1 migration needs it). Check: a tab
  already open before the update must not end up with two attached copies (the attach guard is the
  `data-ysl` attribute, so the new guard has to also respect the old one for one release).
- [ ] **C7** Fill `CHANGELOG.md` per change from now on; add a PR-template checkbox.

*Done when:* CI fails on a broken engine test; `app.js` is under about 400 lines; coverage of
`session.js` includes the three run actions.

### Phase 1: Control model and skipping (target 1.3)

Fixes your two stated problems.

- [ ] **E1** Implement `skipRep`, `skipLoop`, `prevLoop`, `gotoLoop` and the `skip` flag (3.2),
  with scenario tests: skip on an infinite loop, skip the last loop, skip inside nested and
  overlapping loops, previous loop within and after 2 s, "Next loop" with a skipped middle loop.
- [ ] **U6** Return focus to the player after pointer use on non-text controls; let non-modifier
  keys through to the site unless an input is focused. Test: click Turn on, press Space, the video
  pauses and looping stays on.
- [ ] **U1 / U2 / U3** Apply the control model (3.1): remove header power, trash and ↻; per-chip
  on/off and delete; single count stepper with ∞ as its top value.
- [ ] **U2** Undo toast for delete and clear (3.5).
- [ ] **U13** "Run again" on the finished toast; optional "keep looping set armed" setting.
- [ ] Hotkeys from 3.3, after the collision audit; show them in the panel's help sheet (U12).
- [ ] Minimal ⏮ / ⏭ buttons added to the existing panel (the full redesign comes in Phase 2).

*Done when:* from a running 3-loop set you can skip a repetition, skip a loop, go back, and jump to
loop 2 by keyboard and by mouse, with correct counters and toasts on YouTube and on a generic page.

### Phase 2: Panel redesign (target 1.4)

- [ ] **U5 / U7** Compact run strip plus draggable full editor; remember position and mode (U14).
- [ ] **U8** Loop names (inline rename), reorder by drag, 12 distinct colours (or colour plus
  shape/number badge), collapse chips into a scrollable row.
- [ ] **U9** Drag the filled bar to move a loop; click on the empty track moves nothing unless it
  is within a few px of a handle; **auto-zoom** on drag, with manual lock.
- [ ] **U10 / E5** Optional fine precision (0.01 s, shown only when you opt in), minimum loop
  length 0.1 s when fine mode is on.
- [ ] **U11 / A1 / A2 / A3** 28 px minimum targets, 12px minimum text, focus moved into the panel
  on open, roving tabindex on chips, focus trap with Escape to close.
- [ ] **A5** `forced-colors` styles; **A4** use `rem`-friendly sizes where it doesn't fight the host.
- [ ] **U12** One-time first-run hint; shortcuts sheet under ⋯.
- [ ] Re-shoot store screenshots and a short demo GIF (L1).

*Done when:* a new user can set a loop, loop it five times and move to the next without opening
any tooltip, and a keyboard-only user can do the same.

### Phase 3: Practice features (target 1.5)

- [ ] **E3** Speed control per loop or global (`playbackRate`), presets (50/75/90/100%), ± steps,
  pitch preservation toggle (`preservesPitch`), restore the original speed on stop or navigation.
  Must not fight sites that also set the rate (YouTube): re-apply on `ratechange` only when the
  change didn't come from us.
- [ ] **E3** Speed ramp: start rate, target rate, step, every N repetitions; shown in the strip.
- [ ] **E4** Gap between reps (0–5 s) and count-in (silence before the first rep, optional click
  or tick). Gap implemented as pause plus timer, not as extra video playback.
- [ ] **E2 / 3.4** Between-loops and end-of-set settings, including "repeat the set N times / ∞".
  Prefs migration from `after`.
- [ ] Nudge the whole loop by ±1 s or by its own length; halve and double the length.
- [ ] **Tap-to-mark** while playing: `Shift+A` then `Shift+B`, plus "mark and keep going" for
  defining several loops in a single pass.
- [ ] Practice stats per loop (reps, time) and a "Today" figure; stored locally, off by default
  if you prefer nothing extra is kept.
- [ ] **U15** Optional audible tick on turn-around (off by default).

*Done when:* "75% speed, +5% every 3 reps up to 100%, 2 s gap" works on YouTube, SoundCloud and a
generic page, and the original rate comes back on stop.

### Phase 4: Library, popup, options, data (target 1.6)

- [ ] **D2 / D1 / D4** Write `title`, `url`, `v`, `u` (3.7); prune by last use; show a warning
  before anything is pruned.
- [ ] **P1** Popup tabs: *This page* (permissions plus the current loops), *Library*, *Settings*.
- [ ] **Library:** every saved item with title, site, loop count, last used; search; open in a
  new tab; delete; multi-select.
- [ ] **D3** Export and import all loops as JSON (and per item). Importer validates with
  `loopsFromSaved` and never overwrites newer entries without asking.
- [ ] Share: copy a link carrying loop times (YouTube `t=`, plus an optional `#loopsmith=` fragment
  the extension reads when present).
- [ ] **P3** Options page: default count, default length, default speed, shortcut remapping,
  compact-strip behaviour, reduced motion override.
- [ ] **P2** Manifest `commands` for the key actions, so they appear in the browser shortcut manager.
- [ ] **P4** Toolbar badge and icon state while a run is active (message from content script to
  background).
- [ ] **E9** Re-read the store when another tab changes the current key; show a subtle "updated
  elsewhere" note instead of overwriting mid-edit.
- [ ] **D5** "Re-link loops to this page" for generic pages whose duration changed.
- [ ] **D6** Optional `storage.sync` for prefs and a small recent set (quota-aware), off by default.
- [ ] **P5** Drop `activeTab` if the popup works without it.

*Done when:* a user with 300 saved items can find one by name, back everything up, restore it in
another browser, and nothing is evicted without a warning.

### Phase 5: Sites and reliability (rolling)

- [ ] **S1** Nightly GitHub Action running `e2e:live` against each built-in site (non-blocking);
  on failure open or update a labelled issue with the adapter name.
- [ ] **E6** Turn-around benchmark harness: per site/browser, measure the error in ms between the
  loop end and the seek, in visible and hidden tabs. Publish the numbers; set targets (for example
  median under 100 ms visible). Try `requestVideoFrameCallback` on video and a tighter timer for
  audio before adding anything heavier.
- [ ] **E7** Remove the silent early return in `check()`: when a large forward jump spans a loop end,
  treat it as having crossed it if the tab was hidden.
- [ ] **S4** Verify and fix YouTube Shorts, third-party embeds, playlists, chapters (add "loop this
  chapter" shortcut).
- [ ] **S3** `file://` support: explain "Allow access to file URLs" in the popup, accept `file:`
  there, test with local mp3/mp4 (and drag-dropped files).
- [ ] **S2** New adapters, in order of likely demand: Deezer, Tidal, Apple Music (web), Amazon
  Music, Rumble, Odysee, Internet Archive. Each adapter ships with DOM-fixture contract tests.
- [ ] **R1** Back off progress-bar scanning once found and stable.
- [ ] **P7** Add a per-page nonce to the page-world messages, or at least document why spoofing
  is harmless.
- [ ] **S5** Mobile is desktop only for now: say so in the README and both store listings. No touch
  layout planned.

### Phase 6: Polish and reach (ongoing)

- [ ] **P6** i18n: extract strings to `_locales/<lang>/messages.json`; start with French and
  Spanish; localise the store listings.
- [ ] **L2 / L3** In-extension "what's new", a practice-recipes page in the README, links from the
  popup.
- [ ] **L4** Generate the listing copy from one source file.
- [ ] Safari via Apple's converter, if there is demand.

---

## 5. Test plan

| Layer | What to add |
|---|---|
| Unit (vitest) | Every new engine function; prefs migration (`after` → `between`/`end`); store v2 read/write, prune-by-use, import validation; time parsing at 0.01 s; hotkey map and collisions. |
| Scenario | Skip and restart inside single, sequential, overlapping and nested sets, for each between/end setting; speed ramp counters; set-repeat counters. |
| Session (happy-dom, after C2) | Run actions with a fake player and clock: arm, finish, skip, seek storms, ad start/end, duration correction mid-run. |
| e2e (Playwright) | Add to the existing fixtures: Space after clicking a panel button; skip and previous by keyboard and mouse; undo after delete; compact strip appears and hides; drag the loop bar; speed restored on stop. |
| Live smoke | One check per built-in site: button mounts, duration read, a 2-second loop turns once. Nightly, non-blocking. |
| Manual matrix | Chrome and Firefox × YouTube, YouTube Music, Spotify, SoundCloud, one generic page, one local file; light and dark site themes; keyboard-only pass; 200% zoom; reduced motion. |

---

## 6. Release plan

| Version | Contents | Notes |
|---|---|---|
| 1.2.x | Tests, CI, `app.js` split | Internal. Fill the changelog. |
| **1.3** | Phase 0 (including the `ysl-` rename) and Phase 1 | The "skip and tidy" release: fixes the two main complaints. |
| **1.4** | Phase 2 | Visual overhaul; new screenshots, GIF and listing copy. |
| **1.5** | Phase 3 | Practice features. Likely the main thing the store listing should lead with. |
| **1.6** | Phase 4 | Library, export/import, options, shortcuts. |
| 1.7+ | Phase 5 items as ready | New sites and reliability. |

Data compatibility rule for every release: a newer version never writes something an older version
can't read without losing the loops (new fields are optional; old fields are never repurposed).

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Refactoring `app.js` introduces regressions | Do Phase 0 test work first; one extraction per commit; keep e2e green throughout. |
| Speed control fights the site's own speed handling | Re-apply only on our own changes; restore on stop and navigation; per-site opt-out. |
| Shortcuts collide with a site's own keys | Collision audit before release; remappable; `commands` API for global ones. |
| Skip semantics confuse users with overlapping loops | Define by loop order, show "next: loop N" in the strip, test the overlapping scenarios explicitly. |
| Adapters keep breaking | Nightly live smoke plus contract fixtures; fast patch releases. |
| New permissions (`commands` needs none, `storage.sync` needs none, `file://` is a user toggle) | Keep the privacy policy accurate; update `PRIVACY.md` with the library and stats data it now stores. |
| Scope creep | Each phase has a "done when"; features outside this list go to issues first. |

## 8. Decisions (settled)

1. **Compact strip:** auto-shrinks. While a run is active with the editor closed, only the strip
   shows; the editor opens from it. (3.6)
2. **Sequence repeat:** yes. After the last loop: keep playing, pause, restart the set, or repeat the
   set N times / forever. (3.4, E2)
3. **Speed:** per loop, with a global default that new loops inherit. Data model has `rate` per
   loop and `defaultRate` in prefs. (E3)
4. **Stats:** opt-in and local only. Off by default; nothing extra is stored until enabled in
   settings. `PRIVACY.md` is updated when it ships.
5. **Hotkeys:** no collision with any existing YouTube shortcut; defaults in 3.3, remappable.
6. **Mobile:** desktop only for now. Say so in the README and the store listings; S5 is closed as
   "not planned" until there is demand.
7. **Old-name cleanup (C4):** do it, but in **1.3**, not 2.0. No major version bump is planned.

## 9. Out of scope (for now)

- Waveform display: needs fetching and decoding the media, which breaks the "no network requests"
  promise on most sites (revisit for local files only).
- Downloading, recording or converting media.
- Accounts, cloud storage, or any analytics.
- Looping live streams (nothing to go back to).
