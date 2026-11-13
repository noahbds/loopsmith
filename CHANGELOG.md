# Changelog

All notable changes are listed here. Versions follow [semantic versioning](https://semver.org/).

## Unreleased

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
