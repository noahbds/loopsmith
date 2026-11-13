# Loopsmith improvement plan

Ergonomics and feature roadmap, based on a read of `src/app.js`, `src/core/engine.js`,
`src/core/store.js`, the popup and the background script.

## Problems today

### Redundant or confusing controls (`buildUI` in `src/app.js`)

- Three "power" concepts: the header power icon (one loop on/off), the big "Turn looping on" button
  (whole run), and the ▶ button (start the selected loop). Nothing says which does what.
- Trash on a single loop does the same thing as the ↻ reset button.
- "Times to play" has an ∞ toggle, and the field also shows ∞ and can be clicked to leave infinite.
- "When done" (Play on / Next loop / Pause) is global but sits next to the per-loop count.
- The zoom button is tucked beside the length text. Start/End each have −, +, a target button and a
  draggable handle.
- The panel (about 340px wide) sits over the video while practising.

### Missing engine abilities (`src/core/engine.js`)

- No way to skip a repetition, skip to the next or previous loop, or restart the current loop.
  Clicking the selected chip only seeks to its start.
- "Next loop" order is hardcoded by start time; loops can't be reordered.

### Underdeveloped

- The popup only toggles site permissions: no settings, no list of saved loops, hardcoded shortcut
  hints.
- The store has no `title` or `url` per entry, so saved loops can't be listed by name.
- Only 4 shortcuts, fixed to Shift+letter, none for navigating loops.
- No speed control, undo, loop names, or export/sharing.
- Pruning at `MAX_SAVED` (1000) is silent.

## Phase 1: Skipping and navigation

Engine additions are pure functions in `engine.js`, with unit tests alongside the existing ones.

- [ ] `skipRep`: count one play as done and go straight to the next repetition.
- [ ] `skipLoop`: mark the current loop exhausted and jump to the next playable one.
- [ ] Previous loop, and restart loop (back to A).
- [ ] Go to loop N with keys 1–9.
- [ ] Hotkeys: next loop, previous loop, skip repetition, restart (scheme to be decided).
- [ ] Chip right-click menu: Play, Duplicate, Delete.
- [ ] Optional loop order: by time (current) or a list order set by dragging chips.

## Phase 2: Panel rework

One clear job per control; common actions reachable in one click.

- [ ] **Control model:** one global *Loop on/off* switch plus *Play from loop start*. Per-loop on/off
  moves onto each chip. Remove the header power icon.
- [ ] Remove the duplicate trash/reset: *Delete loop* per chip, *Clear all* in a small menu.
- [ ] **Compact run strip** while looping: loop number, rep n/N, progress bar, ⏮ ⏭ skip buttons.
  Small enough not to cover the video.
- [ ] **Full editor** stays for setup, tidied up. Panel is draggable and remembers its position.
- [ ] Start/End: one field each with a ±1s stepper and a "now" button; keep the A/B handles.
- [ ] Count: a single stepper whose top value is ∞, no separate ∞ button.
- [ ] "When done" moves to a settings popover, relabelled "After the last loop".
- [ ] Zoom gets a proper button next to the slider.
- [ ] Chips show "next" and "played out" states, with a tooltip legend.

## Phase 3: Practice features

- [ ] **Speed control:** presets and ± buttons (`playbackRate`), preserve-pitch toggle.
- [ ] **Speed ramp:** add N% every M reps up to a target.
- [ ] **Gap between reps** (0–5 s) and optional count-in before the first rep.
- [ ] **Nudge whole loop** by its length or ±1s keeping its duration; halve / double.
- [ ] **Tap to mark while playing** (A then B) to define a loop live.
- [ ] Loop names; undo/redo for edits.
- [ ] Session stats: reps done and time practised per loop.

## Phase 4: Library, popup and settings

- [ ] Popup becomes tabbed: *This site* (permissions), *Loops*, *Settings*.
- [ ] Loops library: list by title and site, search, open, delete.
- [ ] Store `title` and `url` with each entry.
- [ ] Options: default count, default new-loop length, shortcut remapping, compact-strip toggle.
- [ ] Import/export all loops as JSON; "copy link" with loop times (YouTube).
- [ ] Warn before old loops are pruned at the 1000 limit.

## Phase 5: Sites and engine

- [ ] YouTube chapters: "loop this chapter" shortcut.
- [ ] New sites: Deezer, Tidal, Apple Music (listed as "not yet" in the README).
- [ ] Timing precision: `timeupdate` fires about every 250 ms; use a tighter timer or
  `requestVideoFrameCallback` where available, and make the guard configurable.
- [ ] Optional seamless audio loop via Web Audio buffers where the source allows it.
- [ ] Accessibility and i18n: full keyboard path, screen-reader labels, string table, touch mode.

## Suggested order

1. Phase 1 (skipping): clearest missing feature, mostly engine work.
2. Phase 2 (panel): reuses the skip actions in the compact strip.
3. Phases 3 and 4.
4. Phase 5 as ongoing work.

## Open decisions

- Should the compact run strip replace the open panel while looping, or only appear once the editor
  is closed?
- Should "After the last loop" stay global or become per-loop?
- Hotkey scheme for skipping: arrows, or letters like the existing A/B/R/S?
