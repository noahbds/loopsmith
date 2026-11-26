# Changelog

All notable changes are listed here. Versions follow [semantic versioning](https://semver.org/).

## Unreleased

**Smoother repetitions**
- Loops now turn around on time, to within a few milliseconds: a timer is aimed at each loop's end
  instead of waiting for the next screen refresh (or, with the editor and strip closed or in a
  background tab, for a check that ran four times a second and could let up to a quarter of a
  second of the next section through).
- Less work while playing: no animation frames run just to watch for a loop's end, Spotify's ad
  check no longer lays out the page on every frame, and finding the player bar on Apple Music,
  Deezer, Tidal and Amazon Music no longer re-checks the same elements over and over.

**Fixes**
- Moving the start or end of the loop that is playing (or undoing, or a change from another tab)
  no longer makes the current pass "partly played", which made that loop play one extra time.

## 1.7.0

Saved-loops library and JSON backup in the popup, four more built-in music sites, local media
files, shareable loop links, chapter support, phrase stepping, custom shortcuts and active-tab
controls.

**Saved loops & backup (toolbar popup)**
- A new *Saved* tab in the toolbar popup lists your saved videos and tracks across every site,
  with search, loop counts, one-click open, and delete with undo.
- *Export JSON* and *Import JSON* back up and restore all saved loops and preferences locally
  (newer local edits are kept when merging).
- Content scripts now load only preferences and the current media item's key from storage instead
  of reading the entire store in every frame.

**More music sites, control-bar button everywhere & local files**
- Built-in support for **Apple Music**, **Deezer**, **Tidal** (`tidal.com` and `listen.tidal.com`)
  and **Amazon Music**: track identification, progress-bar markers, loop button right inside each
  site's player bar, and *After the last: Next*.
- On any other website with a custom HTML player bar (including web-component players with open
  shadow roots), Loopsmith now places its loop button inside the player's own control bar instead
  of floating over the corner, falling back to the floating button only when there is no bar.
- Existing installs updating from an earlier version are prompted to allow the new built-in sites
  (with a toolbar `!` badge and one-click *Allow* banner in the popup), and Loopsmith starts
  immediately in tabs already open on them.
- Local audio and video files (`file://`): turn Loopsmith on for local files from the popup (with
  a shortcut to Chrome's *Allow access to file URLs* toggle when needed). Local files are keyed by
  filename and duration, so moving a file between folders keeps its loops.

**Sharing, chapters & phrase stepping**
- ⋯ → *Copy link with loops*: copies the page address with a start timestamp (such as YouTube's
  `?t=`) plus a `#loopsmith=…` hash. Opening that link loads the loops automatically, with no
  servers or network requests.
- Video chapters (YouTube chapters and HTML5 `<track kind="chapters">`): dragged loop handles snap
  to chapter boundaries, and ⋯ → *Loop chapter* turns the current chapter into a named loop.
- Step a loop backward or forward by its own length (`Shift+J` / `Shift+L`) or halve / double its
  length (`Shift+H` / `Shift+D`), also available as a compact row in ⋯.

**Shortcuts, toolbar badge & background tabs**
- A *Keys* tab in the toolbar popup lets you remap or turn off any shortcut (helpful on AZERTY and
  other layouts), and links to browser-wide shortcuts (`commands`) so you can control loops from
  another window or tab.
- The toolbar icon shows a live badge while a tab is looping, and the popup's *Page* tab offers
  quick controls for the current player or a tab looping in the background.
- Fixed: in heavily throttled background tabs, playback advances of more than two seconds between
  timer ticks no longer miss loop turn-arounds.

## 1.6.1

**Fixes**
- Firefox: on YouTube, Spotify and the other built-in sites, the loop button didn't appear until
  you clicked the Loopsmith toolbar button. Firefox now gives Loopsmith access to those sites when
  it's installed. If it doesn't have access (for example, you turned it off in Firefox's add-on
  settings), the toolbar popup says so and has an *Allow* button.

## 1.6.0

The loop button joins each site's own controls, a new *After the last: Next*, and loops count a
pass you skip ahead in.

**After the last: Next**
- A fourth choice under *After the last*: once the loops are done, go to the next track or video.
  Loopsmith does what the site does for the ⏭ media key (the one keyboards, system media controls
  and headphones use), so the site moves on through its own queue, playlist or autoplay. On
  YouTube and YouTube Music it uses the player's own *next*; sites that don't handle that key get
  their next button pressed (Spotify, SoundCloud, Bandcamp albums). With neither, playback skips to
  the end of the media and the site's own autoplay, if it has one, takes it from there.
- *Between loops* and *After the last* are now one under the other, each across the panel.

**The loop button joins the site's own controls**
- On Spotify, SoundCloud, YouTube Music, Bandcamp, Vimeo, Twitch and Bilibili the loop button now
  sits in the site's control bar, next to its own buttons (like on YouTube), instead of floating
  over the page. If that bar isn't on screen the button floats as before, so it never goes missing.
  Dailymotion and other sites keep the floating button.

**Fixes**
- Skipping ahead (or back) with the site's progress bar inside the loop that is playing no longer
  stops that pass from counting. Before, the loop went back to its start without counting it, so
  testing a loop by skipping to its end made it look stuck on *1 / 3*. Arriving in a loop from
  outside it, or turning looping on halfway through it, still doesn't count that first pass.
- Fixed: when a player moved its media forward by a fraction of a second during playback, or the
  media briefly couldn't be read, that pass was taken for a jump into the middle of the loop and
  didn't count, so the loop could repeat forever. A small hop forward is now still the same pass.

## 1.5.0

Bug fixes from the 1.4.0 audit (see [AUDIT.md](AUDIT.md)), and a simpler panel.

**Panel**
- Removed: the practice options (gap between plays, count-in and its tick) are gone.
- Skip and restart a repetition are buttons on the status line while looping (they were in ⋯).
- Delete loop is a button in the loop editor (it was in ⋯); it can still be undone.
- *If the video or track has saved loops* (under *for all loops*, it was in ⋯): *Do nothing*,
  *Turn looping on*, or the new *Play loop 1*: looping turns on and playback starts from the first loop.
- The slider's rail now spans exactly the media, so a loop at 0:00 starts at its left edge.
- The status line takes the colour of the loop that is playing, not the one selected in the editor.

**Loops play in the right order**
- Fixed (B1): with *Between loops: Play on*, a loop inside another one never played (including any
  loop inside a whole-video loop). Once a loop is done, a loop that starts inside it now plays next,
  from its own start, in both modes. *Play on* and *Jump* only differ for the stretch between loops.
- Fixed (B2): of two loops with the same start, the second never played. Loops play by start, then
  by number, and the panel's "Then …" line follows the same order.
- Fixed (B3): a loop entered after its start (overlapping another, or looping turned on halfway
  through it) counted that partial pass as a full play. It now goes back to its start first.

**Keyboard and tabs**
- Fixed (B6): on AZERTY keyboards, Shift+1…9 types a digit, so it is left to the site (YouTube's
  jump to 10 %…90 %). Shortcuts that have nothing to act on (no loop yet) no longer swallow the key.
- Fixed (B4): a setting changed in one tab was undone by any other open tab. Tabs now pick up each
  other's settings.
- Fixed (B5): with the same video in two tabs, one tab's edits overwrote the other's. A tab now
  reloads loops changed in another tab, or says so while you're editing.

**Sites**
- YouTube Shorts: the loop button now shows, in the corner of the Short (B7).
- YouTube Music: loop markers are back on its redesigned progress bar (B16).
- Dailymotion: loops are saved per video id, handed down from the video page to the player (B17).
  Dailymotion loops saved by 1.4.0 and earlier are not carried over.
- `youtube-nocookie.com` embeds, once turned on, know which video is loaded (B14).
- Bandcamp: the track title is part of the key, so tracks of the same length no longer share loops.
  On other sites, loops saved under a duration one second off are found again (B13).

**Panel and messages**
- The ⋯ menu opens before any loop exists, for the settings and the shortcut sheet (B8).
- Tap to mark forgets its mark after a seek, instead of making one long section (B10).
- Messages use loop names, and "played N×" counts the plays that really happened (B11).

**Data**
- Saved loops are removed least recently *used* first (not least recently edited) past 1,000 items,
  and a message says when that happens (B9).
- A failed save (storage full) is reported instead of silently lost (B15).
- A duration correction during a run no longer brings skipped loops back (B12).

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
