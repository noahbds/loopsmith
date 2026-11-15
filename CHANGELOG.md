# Changelog

All notable changes are listed here. Versions follow [semantic versioning](https://semver.org/).

## Unreleased

## 1.4.0

**Loops take turns**
- Fixed: a loop placed inside another one cut into it. With loop 1 over a whole song and loop 2 on a
  passage inside it, playback went back to loop 2's start as soon as it reached loop 2's end, before
  loop 1 had finished. Now one loop has the turn at a time: of the loops the playback is in, the one
  that starts first (or the one you started or jumped to). The others wait for their own turn.
- The editor follows the run: when the next loop gets its turn, it becomes the selected loop.

**Between loops, and after the last one**
- "When done" is now two choices for all loops: *Between loops* (play on, or jump straight to the
  next loop) and *After the last* (play on, pause, or repeat). This adds the two missing
  combinations: jump between loops and then play on, and jump between loops and then pause.
- *Repeat* replaces *Play all loops* in the practice options: choose it, then the number of rounds
  (2 to 99) or ∞. Settings from 1.3 carry over.
- Next to *Times to play*, a line says what happens when the selected loop is done ("Then jumps to
  loop 2", "Last loop, then pauses"…).

**No loop until you make one**
- A video or track starts with no loop; the panel offers *Whole video* (or *Whole track*) and
  *30 s from here*. `Shift+A` / `Shift+B`, tap to mark (`Shift+M`) and **+** create one too.
- A loop over the whole video is a loop like any other: it is saved and shown on the progress bar.
  Deleting the last loop leaves none (and can be undone).

**Also**
- ⋯ → *Turn looping on when saved loops load*: looping starts by itself on a video or track you
  already have loops for (off by default; the message has a *Turn off* button).
- While looping, the status and the buttons stay at the bottom of the panel when it scrolls.
- Fixed: the time shown above a slider handle was cut off by the top of the panel.
- Fixed: a panel dragged near the top of the player could end up partly above it (under the site's
  header) once it grew taller; it now stays inside the player.

## 1.3.0 (2026-11-15)

**Moving around while looping**
- Next loop, previous loop (it restarts the repetition when you are more than 2 s into it), skip a
  repetition, restart a repetition, and go to loop 1–9. Buttons for next / previous in the panel;
  shortcuts `Shift+]`, `Shift+[`, `Shift+\`, `Shift+Z`, `Shift+1`…`9`, none of them used by YouTube.
- *Play all loops*: once the last loop is done, the whole set can start over, 2 to 99 times or again
  and again. The status shows the round.
- "Run again" on the *Loop finished* message.
- A small strip shows while looping with the editor closed (what is playing, previous / next / stop,
  open the editor). It has a hide button; ⋯ → *Show a strip while looping* brings it back.
- Fixed: with "Next loop", two loops placed end to end cut the sound for a moment where the first
  ends and the second starts (a needless seek). Playback now just goes on.
- Fixed: after clicking a button in the panel, Space and the other player keys went to the panel
  instead of the video (and Space pressed the button again).
- Fixed: stopping looping while the video is held between two plays left it silent.

**Placing and editing loops**
- Under Start / End, buttons put this loop's start right after the previous loop's end, or its end
  right before the next loop's start. Dragging an edge snaps to other loops' edges (hold Alt to drag
  freely). Shift+click **+**, or ⋯ → *Add a loop right after this one*, adds a loop where the
  selected one ends.
- Tap to mark (`Shift+M`): tap while the media plays; each tap ends the section that began at the
  previous tap and starts the next one.
- Drag the bar between A and B to move the whole loop. A click far from the loop no longer moves a
  handle.
- Zoom: the mouse wheel on the slider zooms around the pointer, Shift+wheel moves, double-click goes
  back to the whole video; an overview strip shows where the window is (drag it to move), and
  dragging an edge into the border scrolls the slider along.
- Loop names (double-click a chip, or ⋯ → Rename); ⋯ → *Number loops by start time*.
- Twelve loop colours instead of six.
- ⋯ → *Times to hundredths of a second*: loops down to 0.2 s, times kept to 0.01 s.
- Deleting a loop, removing all loops or renumbering can be undone (button on the message, or
  Ctrl/Cmd+Z in the panel).
- A named or switched-off loop that covers the whole video is now saved.

**Practice**
- *Practice options*: a gap between plays (0 to 5 s), a count-in before a loop starts (0 to 8 s,
  with ticks), and *Play all loops*.

**The panel**
- The on/off switch for a loop is the dot on its chip; the trash and reset buttons are replaced by a
  ⋯ menu (delete, remove all, skip / restart a repetition, shortcut list, options).
- The panel and the strip can be dragged; the position is remembered per site (double-click the grip
  to put it back). The editor's header and action buttons stay in view when it scrolls.
- The run status has its own line with a progress bar.
- Keyboard: the chip row is one Tab stop with arrow keys, opening the panel from the keyboard puts
  the focus inside, bigger click targets, Windows high-contrast colours, a one-time tip.
- Popup: *Copy diagnostics for a bug report* (nothing is sent anywhere).

**Under the hood**
- The tests are part of the repository and run in CI; ESLint and a type check on the loop rules;
  `npm run dev` rebuilds on change; packages are zipped in Node and are the same on every build.
- The player code is split into parts under `src/app/`.
- The page-facing names that began with `ysl-` now begin with `lsm-`. Loops saved by version 1.x are
  still migrated.

## 1.2.0 (2026-11-13)

First release as **Loopsmith** (previously *YouTube Section Loop*).

- Works beyond YouTube: YouTube Music, Spotify, SoundCloud, Bandcamp, Vimeo, Twitch, Bilibili and
  Dailymotion out of the box, and any other site with a video or audio player once turned on from
  the toolbar popup.
- Loop markers on each site's own progress bar, found automatically on unknown sites.
- Overlapping loops: the status shows the loop actually in charge, and "Next loop" plays the next
  loop from its own start.
- Loops are stored in extension storage, shared across sites; loops from 1.x are migrated.
- Chrome support (Manifest V3), alongside Firefox (Manifest V3, Firefox 128 or later).
- The panel is isolated from the site's styles (Shadow DOM).

## 1.1 and earlier

*YouTube Section Loop*: A-B repeat for YouTube only, as a Firefox extension and a userscript.
