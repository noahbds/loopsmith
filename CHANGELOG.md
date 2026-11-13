# Changelog

All notable changes are listed here. Versions follow [semantic versioning](https://semver.org/).

## Unreleased

- *Play all loops*: once the last loop is done, the whole set can start over, 2 to 99 times or again
  and again. The status shows the round, and the choice is remembered.
- A small strip shows while looping with the editor closed (what is playing, previous / next / stop,
  and a button that opens the editor). The panel and the strip can be dragged; the position is
  remembered per site, and double-clicking the grip puts it back.
- The run status has its own line with a progress bar instead of sharing the main button.
- Twelve loop colours instead of six.
- Loop names: double-click a chip (or ⋯ → Rename) to name a loop; the name shows on the chip and in
  the status. ⋯ → *Number loops by start time* renumbers them in play order (undoable).
- Drag the bar between A and B to move the whole loop. A click far from the loop no longer moves a
  handle.
- ⋯ → *Times to hundredths of a second*: loops down to 0.2 s, times kept to 0.01 s. Alt steps by
  the finest unit.
- Keyboard: the chip row is one Tab stop with arrow keys; opening the panel from the keyboard puts
  the focus inside; bigger click targets and labels; Windows high-contrast colours; a one-time tip
  that points to the shortcut list. The panel keeps clear of the loop button on small videos
  (it scrolls).

- Skipping: next loop, previous loop (restarts the repetition when you are more than 2 s into it),
  skip a repetition, restart a repetition, and go to loop 1–9. Buttons for next / previous in the
  panel; shortcuts `Shift+]`, `Shift+[`, `Shift+\`, `Shift+Z`, `Shift+1`…`9`, none of them used by
  YouTube.
- "Run again" on the *Loop finished* message.
- Deleting a loop or removing all loops can be undone (button on the message, or Ctrl/Cmd+Z in the
  panel).
- Panel: the on/off switch for a loop is now the dot on its chip; the trash and reset buttons are
  replaced by a ⋯ menu (delete loop, remove all loops, skip / restart a repetition, shortcut list);
  the ∞ field no longer turns back into a number when clicked (use the ∞ button or −).
- Fixed: after clicking a button in the panel, Space and the other player keys went to the panel
  instead of the video (and Space pressed the button again). Keys the focused control doesn't use
  now reach the player, and a mouse click gives the focus back to the page.

- Popup: *Copy diagnostics for a bug report* shows and copies the version, browser, site and what
  Loopsmith found on the page. Nothing is sent anywhere.
- Internal: the tests are now part of the repository and run in CI (unit tests on every push, browser
  tests in a separate job); ESLint and a type check on the loop rules; `npm run dev` rebuilds on
  change; packages are zipped in Node (no `zip` command needed) and are the same on every build.
- Internal: the player code is split into parts under `src/app/`.
- Internal: the page-facing names that began with `ysl-` (CSS classes, data attributes, events) now
  begin with `lsm-`. Loops saved by version 1.x are still migrated.

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
