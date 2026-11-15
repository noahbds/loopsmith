# Loopsmith 1.4.0: bug audit

Audit of `main` at `b0ad565` (1.4.0), done on 2026-11-15, to plan a bug fix release (1.4.1).

## How this was done

- **Code:** every file in `src/` and `scripts/build.mjs` was read.
- **Checks:** lint, type check and the 147 unit tests all pass. None of the bugs below is caught by
  them.
- **Engine simulation:** playback was stepped through `src/core/engine.js` in 0.1 s steps, with
  18 loop layouts and skip actions, in both "Between loops" settings.
- **Real extension:** Loopsmith 1.4.0 as installed in Chrome (the Chrome Web Store copy, same
  version as `main`) was tested with the Claude in Chrome extension.
  - First round: YouTube (*Sintel*, Blender's open movie), with a YouTube Premium account.
  - Second round, with a regular account: YouTube ads, YouTube Music, Spotify, SoundCloud,
    Bandcamp, Vimeo, Twitch, Bilibili and Dailymotion.
  - The panel was driven through its own controls (its shadow root is open). Times were also
    typed with real keystrokes.
  - Every seek and pause of the `<video>` element was recorded, at 4× speed so loops ran quickly.
  - Shortcuts were sent as synthetic key events.

**Status of each finding:**

- **Confirmed in Chrome:** reproduced in the real extension.
- **Simulated:** reproduced through the engine only.
- **Code:** found by reading the code; not reproduced.
- **Not reproduced:** tried, and it worked.

## Fix status (unreleased, after 1.4.0)

Every bug below is fixed in the working tree (see `CHANGELOG.md`, *Unreleased*). Lint, type check,
179 unit tests and every end-to-end check pass. The fixes were then checked in Chrome with the dev
build (`dist/chrome`, loaded unpacked):

| ID | Checked in Chrome | Result |
|---|---|---|
| B1 | Loop 1 0:10–0:40 ×2, loop 2 0:20–0:25 ×2, Play on / Pause | `39.6 → 10`, `39.5 → 20`, `24 → 20`, pause at 0:25. Loop 2 now plays twice; the panel says "Then loop 2, from its start"; the editor moves to loop 2. |
| B2 | 0:10–0:40 ×2 and 0:10–0:25 ×2, Jump | `39.6 → 10`, `39.5 → 10`, `24.6 → 10`, pause at 0:25.1: both play, loop 1 first |
| B3 | 0:10–0:30 ×2 and 0:25–0:45 ×2, Play on | `29 → 10`, `30 → 25`, `44.9 → 25`, pause at 0:45: loop 2 plays twice from its start |
| B3 | One loop 1:00–1:20 ×1, looping turned on at 1:12 | `79.2 → 60`, then pause at 1:20: the partial pass didn't count |
| B4, B5 | Two tabs on the same video | Tab A's 7× and hundredths reached tab B ("Loops updated from another tab"); tab B's new start and gap reached tab A |
| B6 | Synthetic Shift+3 (AZERTY), Shift+R and Shift+5 with no loop | All passed through to the page |
| B7 | A YouTube Short | Button in the Short's top-right corner; the panel fits inside it; a 0:12–0:20 ×2 loop ran |
| B8 | ⋯ with no loop | Opens with tap to mark, hundredths, strip, auto-on and the shortcut sheet |
| B10 | Shift+M at 3:20, seek to 6:20, Shift+M | The second press starts a new section ("Start 6:20") |
| B11 | Shift+S on a loop named "Bridge", then skip it | "Bridge · 1:00 → 1:20 · 1×", then "Loop finished" (no false "played 1×") |
| B16 | YouTube Music | The marker sits on the new `ytmusic-miniplayer` bar |

Not checked in Chrome: B9 and B15 (unit tests only: they need 1,000 items or full storage), B12,
B13, B14 (needs `youtube-nocookie.com` turned on) and B17 (Dailymotion's player frame can't be
scripted from the test tool).

## Summary

| ID | Sev | Status | Bug |
|---|---|---|---|
| B1 | **H** | Confirmed in Chrome | With "Between loops: Play on", a loop inside another one never plays |
| B2 | **H** | Confirmed in Chrome | Two loops with the same start: the second never plays, and the panel describes the wrong order |
| B3 | M | Confirmed in Chrome | An overlapping loop's first play starts halfway and counts as a full play |
| B4 | M | Confirmed in Chrome | A settings change in one tab is undone by any other open tab |
| B5 | M | Confirmed in Chrome | The same video in two tabs: one tab's edits silently overwrite the other's |
| B6 | M | Confirmed in Chrome | Shift shortcuts are taken even when they can't do anything, including Shift+digits on AZERTY |
| B7 | M | Confirmed in Chrome | YouTube Shorts: no loop button at all |
| B8 | M | Confirmed in Chrome | Without a loop, the settings and the ⋯ menu can't be reached |
| B9 | M | Code | Old loops are deleted without warning past 1,000 saved items |
| B10 | L | Confirmed in Chrome | Tap to mark keeps its mark across a seek, making one huge section |
| B11 | L | Confirmed in Chrome | Messages ignore loop names, or say the wrong thing |
| B12 | L | Code | A duration correction during a run brings skipped loops back |
| B13 | L | Code | Other sites: loops disappear when the duration shifts by about half a second, and same-length tracks share loops |
| B14 | L | Code | `youtube-nocookie.com` embeds can't save loops in Chrome (*verify*) |
| B15 | L | Code | Storage errors are swallowed silently |
| B16 | M | Confirmed in Chrome | YouTube Music: no loop markers on its progress bar since its redesign |
| B17 | L | Code (*verify*) | Dailymotion: loops may be shared by every video of the same length |
| – | – | Not reproduced | Edits lost when the tab closes; typing in a field triggers YouTube shortcuts; looping state after YouTube changes video |

---

## Loop order (B1–B3)

All three come from two rules in the engine, so they should be fixed together.

1. The loop "in charge" at the playhead is the one that **started first** (`loopAt`).
2. After a loop's last play, "Play on" only looks for loops that still **end ahead** of the playhead
   (`settle`, `anyAhead`), and "Jump" for loops that **start strictly later** (`nextLoop`).

### B1 · H · With "Play on", a loop inside another one never plays

**Confirmed in Chrome.**

- **Setup:** loop 1 at 0:10–0:40 ×2, loop 2 at 0:20–0:25 ×2. Between loops: Play on. After the
  last: Pause. Looping turned on at 0:08.
- **Recorded:** `39.69 → 10.00`, then `pause @ 40.00`.
- **Result:** loop 1 played twice and the run ended. Loop 2 played 0 times. The panel's status only
  ever showed "Loop 1". The message said "Loops finished". Before the run, the panel said loop 1
  "Then plays on".

**Simulated, with the same cause:**

- Three nested levels (10–90, 20–60, 30–40): only the outer loop plays.
- Two loops inside one (10–90, then 20–30 and 50–60): neither inside loop plays.
- **A whole-video loop plus any other loop:** the other loop never plays. This is the "loop the
  whole video" case from 1.4.
- Playback started *inside* the inner loop (at 0:25): the outer loop still takes over, and the
  inner one never plays.

**Why:** at 0:40 loop 2's end is behind the playhead, so nothing counts as "ahead".

**Fix:** after a loop's last play, a loop that starts inside it and still has plays left is played
from its start, whatever the "Between loops" setting. "Play on" should only change what happens in
the gaps *between* loops. Update `thenText` in `src/app/render.js` to match.

### B2 · H · Two loops with the same start: the second never plays

**Confirmed in Chrome.**

- **Setup:** loop 1 at 0:10–0:40 ×2, loop 2 at 0:10–0:25 ×2. Between loops: Jump.
- **Recorded:** `39.58 → 10.00`, then `pause @ 40.01`.
- **Result:** loop 2 never played. Simulated, it never plays with "Play on" either.

**A second problem:** the panel described loop 1 as "Last loop, then pauses", while the engine
plays loop 1 *first*.

- The panel's order (`sortedByStart`) puts the shorter loop first when two start together.
- The engine (`loopAt`) puts the lower-numbered loop first.

**Why:** `nextLoop` only takes loops with `a > t` (strictly), so a loop with the same start is never
"next".

**Fix:** define one play order (start, then one tie-break) in `engine.js`. Use it in `loopAt`,
`nextLoop`, `thenText` and `neighbours`, and take "next" as the loop after this one in that order.

### B3 · M · An overlapping loop's first play starts halfway and counts as a full play

**Confirmed in Chrome.**

- **Setup:** loop 1 at 0:10–0:30 ×2, loop 2 at 0:25–0:45 ×2. Between loops: Play on.
- **Recorded:** `28.89 → 10.00`, then `44.79 → 25.00`, then `pause @ 45.00`.
- **Result:** loop 2's first "play" ran 0:30–0:45 and counted as play 1 of 2. The panel showed
  "Loop 2 · 1 / 2" from 0:31. So loop 2 played in full only once.

**Simulated:** the same happens to the tail of an outer loop after an inner one was jumped to.

**Fix:** when a loop's end is reached and its play didn't start near its start (say within 0.5 s),
go back to its start without counting a play.

**Tests to add for B1–B3:** nested (two and three levels), several loops inside one, a whole-media
loop plus inner loops, same start in both list orders, overlapping, and starting playback inside an
inner loop. Each in both "Between loops" settings, checking the number of plays of every loop.

---

## Several tabs (B4, B5)

### B4 · M · A settings change in one tab is undone by any other open tab

**Confirmed in Chrome.**

- **Steps:**
  1. Opened two YouTube tabs.
  2. Tab A: ⋯ → *Times to hundredths of a second*.
  3. Tab B: Gap between plays +0.5 s.
  4. Reloaded tab A.
- **Result:** hundredths was off again; the 0.5 s gap was kept.

**Why:**

- The settings object `P` is read once, when the page loads (`createCore`).
- Every settings change writes the whole of `P` (`rememberPrefs`).
- So any tab opened earlier writes back its old values. That includes the remembered panel
  position for **every** site (`P.pos`), not only its own.

**Fix:** keep `P` up to date from `store.onChange` (the store already receives the changes), and
write only the field that changed.

### B5 · M · The same video in two tabs: one tab's edits silently overwrite the other's

**Confirmed in Chrome.**

- **Steps:**
  1. Both tabs on the same video, with the loop 1:45–2:10 ×2.
  2. Tab A: set 7 plays.
  3. Tab B, which never showed the change: moved the start to 1:50.
  4. Reloaded.
- **Result:** the loop was 1:50–2:10 **×2**; tab A's 7 was lost.

**Why:** `store.onChange` updates the store, but the open page never reads it again (roadmap E9).

**Fix:** when the current video's entry changes in another tab and nothing is being edited here,
reload the loops (keeping the run's counts). If something is being edited, say "Changed in another
tab".

---

## Keyboard (B6)

### B6 · M · Shift shortcuts are taken even when they can't do anything

**Confirmed in Chrome**, with synthetic key events.

- **Shift+digits on AZERTY:** a Shift+`3` keypress as an AZERTY keyboard sends it (`key: "3"`,
  `code: "Digit3"`, with loops on the page) was **blocked** (`defaultPrevented`). The panel showed
  "No loop 3".
  - On AZERTY you hold Shift to type a digit. So on French keyboards, YouTube's 0–9 "jump to
    0 %…90 %" keys no longer reach YouTube.
  - YouTube's own reaction wasn't tested: it may ignore synthetic events.
- **With no loops at all:**
  - Shift+R was blocked and said "Create a loop first".
  - Shift+5 was blocked and said "Not available right now", which is misleading. The real reason is
    that there is no loop.

**Why:**

- `hotkeyAction` matches digits by key position (`Digit1–9`), whatever character they type.
- `onHotkey` always calls `preventDefault()` and `stopImmediatePropagation()` before knowing
  whether the action can run.

**Fix:**

- Treat Shift+digit as "go to loop N" only when Shift changes the character (`e.key` is not the
  digit itself).
- Let the key through to the site when the action has nothing to act on: no loop, or no loop N.
- Fix the "Not available right now" message.

**Not reproduced:** typing in the time fields doesn't trigger YouTube's shortcuts. Typing `1m45s`
with real keystrokes while the video played didn't mute it or go full screen. The fields keep their
keys.

---

## Sites

### B7 · M · YouTube Shorts: no loop button at all

**Confirmed in Chrome.**

- **Page:** `youtube.com/shorts/…`.
- **Result:** Loopsmith attached to `#movie_player`, which YouTube keeps **hidden** on Shorts. So
  the loop button had no size, and the shortcuts were off, since they need a visible player. The
  short plays in `#shorts-player`, which Loopsmith ignores.
- `idFromUrl` doesn't read `/shorts/<id>` either.

**Fix:** on `/shorts/`, use `#shorts-player` as the player, and read the id from the URL. Or say
in the README and listings that Shorts aren't supported.

### B13 · L · Other sites: loops disappear when the duration shifts, and same-length tracks share loops

**Code** (`src/core/mediakey.js`).

- On sites without a dedicated adapter, and on Bandcamp, Vimeo, Twitch and Dailymotion, the saved
  key is the page plus the duration rounded to a second.
- So a duration change of about half a second (ad insertion, a re-encode) makes saved loops
  disappear.
- On a Bandcamp album page, two tracks of the same rounded length share one set of loops.

**Fix:**

- If nothing is saved under the exact key, fall back to the same page with a duration within 1 s.
- On Bandcamp, add the track title to the key.

### B14 · L · `youtube-nocookie.com` embeds can't save loops in Chrome (*verify*)

**Code.**

- Once the user turns Loopsmith on there, `boot.js` picks the YouTube adapter.
- But the background only injects the generic media hook, not `page-youtube.js`. So in Chrome the
  adapter can't ask the player which video is loaded.
- `idFromUrl` returns nothing for `/embed/`. With no id, nothing is saved.

**Fix:** register `page-youtube.js` for that host too, or use the generic adapter there.

### B16 · M · YouTube Music: no loop markers on its progress bar since its redesign

**Confirmed in Chrome.**

- Looping itself works on YouTube Music (see "Checked and working").
- But no markers show. YouTube Music no longer has a `ytmusic-player-bar`: its bottom bar is now
  `ytmusic-miniplayer`, with the seek bar as `input.ytMusicMiniPlayerProgressBar`.
- So `progressBar` in `src/adapters/ytmusic.js` finds nothing, and the markers stay hidden.
- `dockInset: 72` was measured on the old bar and may no longer match.

**Fix:**

- Look for `ytmusic-miniplayer .ytMusicMiniPlayerProgressBar` first, and keep the old selector as
  a fallback.
- Check the panel's docked position above the new bar.
- This is exactly the silent breakage roadmap S1 describes. A nightly check of each site would
  have caught it.

### B17 · L · Dailymotion: loops may be shared by every video of the same length (*verify*)

**Code, with one thing seen in Chrome.**

- Dailymotion's video page now loads the player frame as
  `geo.dailymotion.com/player/xtv3w.html?`, with no `?video=` parameter.
- The adapter's comment says the id is read from that parameter. If the frame's own address also
  lacks it, the key is just the player page plus the rounded duration. Then every Dailymotion
  video of the same length would share one set of loops.
- The frame's own address couldn't be read from the test tool, since the frame is from another
  site.

**Fix:** check what the frame's address is. If the id isn't in it, have the top page
(`www.dailymotion.com/video/<id>`) pass the id down, or key on the frame's media URL.

---

## Panel and messages

### B8 · M · Without a loop, the settings and the ⋯ menu can't be reached

**Confirmed in Chrome.**

- With no loop on the media, the editor (including "Between loops", "After the last" and Practice
  options) is hidden, and its fieldset is disabled.
- The ⋯ menu doesn't open, since `openMenu` needs a loop.
- So you can't turn on "looping turns on by itself", hundredths, or the shortcut sheet until you
  have created a loop.

**Fix:** let ⋯ open without a loop, showing the items that don't need one (settings, shortcuts).

### B10 · L · Tap to mark keeps its mark across a seek

**Confirmed in Chrome.**

- **Steps:** Shift+M at 3:20, seek to 6:20, Shift+M.
- **Result:** "Loop 3 · 3:20 → 6:20": one 3-minute section that was never played through.

**Fix:** drop the pending mark on any seek (the `seeking` handler in `tracking.js`).

### B11 · L · Messages ignore loop names, or say the wrong thing

- **Confirmed in Chrome:** starting a loop named "Bridge" (loop 2) with Shift+S showed
  "Loop 2 · 1:20 → 1:30 · 3×". `startLoop` builds the label itself instead of using `loopLabel`.
- **Confirmed in Chrome:** Shift+digit with no loops says "Not available right now" (see B6).
- **Code:** with one loop on, "Loop finished · played 5×" shows the loop's *count*, even when it
  was skipped after one play (`finishRun`).

**Fix:** use `loopLabel` everywhere; show the real number of plays.

---

## Data

### B9 · M · Old loops are deleted without warning past 1,000 saved items

**Code** (`prune` in `src/core/store.js`, roadmap D1).

- Entries are removed oldest-*edit* first, so a loop played every day but never edited goes first.
- Nothing tells the user.

**Fix:** record when loops were last used, prune by that, and show a one-time message when
something is pruned.

### B12 · L · A duration correction during a run brings skipped loops back

**Code** (`applyDuration` in `src/app/tracking.js`).

- When the player corrects the media's duration during a run, the loops are reloaded from storage
  and only `done` is copied across.
- A loop skipped in this run plays again, and a loop that was jumped to loses its turn.

**Fix:** copy `skip` and `turn` as well.

### B15 · L · Storage errors are swallowed silently

**Code.** `flush` in `src/core/store.js` ignores failed writes, for example when storage is full.
Loops then look saved but are gone after a reload.

**Fix:** on a failed write, show a message once ("Loops couldn't be saved").

---

## Checked and working

| What | How | Result |
|---|---|---|
| An edit right before the tab closes | Chrome: set 9 plays, closed the tab immediately, reopened | Saved. The 300 ms delayed write was flushed on close. Firefox not tested. |
| Typing times while the video plays | Chrome: typed `1m45s` with real keys | No YouTube shortcut fired; the start became 1:45 |
| YouTube changing video while looping is on | Chrome: clicked a related video during a run | Looping turned off, the new video had no loops and no markers |
| Turn-around timing (visible tab) | Chrome: three 10 s plays of 1:20–1:30 at 1× | Clean turn-arounds |
| YouTube preroll ad | Chrome, regular account: opened the panel during a 20 s preroll on "Faded", tried Shift+A and *Whole video*, then let the ad finish | During the ad the panel said "Ad playing…", nothing could be created (Shift+A: "Not available right now"), and no loop was keyed to the ad. Afterwards the real 3:32 duration was used. |
| Saved loops + *turn on by itself* | Chrome: saved a loop on YouTube, turned the option on, reloaded | Looping turned itself on with "Looping 0:10 → 0:20 · 2× (saved loops)" and a *Turn off* button. No preroll played on that reload or the next three, so auto-on *after* an ad is still untested. |
| YouTube Music | Chrome: same video on music.youtube.com | The loop saved on YouTube was there (shared ids), looping turned itself on, and the turn-around (`19.85 → 10.00`) went through the player's own seek. Markers: see B16. |
| Spotify | Chrome, logged in: a loop 0:20–0:30 ×2 on a track | Clean turn-arounds (`29.78 → 20.00`), Spotify's own position stayed in step, markers drawn on Spotify's bar |
| Bandcamp | Chrome: album page, a loop 0:12–0:20 ×2 on track 1, then next / previous track | Clean turn-arounds. Track 2 showed no loops; back on track 1 the loop was there again. Loopsmith's button only appears once something has played (expected: the audio has no controls of its own). |
| Vimeo | Chrome: a loop 0:08–0:15 ×2 | Clean turn-arounds, markers on Vimeo's bar |
| Twitch | Chrome: a 60 s clip, loop 0:12–0:20 ×2 | Clean turn-arounds (`19.93 → 12.00`) |
| Bilibili | Chrome: a video page, loop 0:12–0:20 ×2 | Clean turn-arounds |
| Dailymotion | Chrome: a video page (new vertical layout) | The loop button and panel show inside the player frame. The frame's video can't be scripted from the test tool, so no loop was run. Keys: see B17. |
| Other sites (archive.org, turned on from the popup) | Chrome: *Big Buck Bunny*, whose player keeps the `<video>` inside a shadow root | Found the video, looped 0:12–0:20 ×2 cleanly, drew the markers on the site's own seek bar, and Shift+R worked after playing |

## Not tested

- **Background tabs.** The test tool keeps its tab rendering as if it were in front. Even after a
  real click opened another page, `document.visibilityState` stayed `visible`, with 60 frames per
  second. So the timing in a background tab (roadmap E7) is still unmeasured.

  **To test by hand:**
  1. Make a loop of about 10 s, ×20, and turn looping on.
  2. Switch to another tab for a minute, once with sound and once muted. Chrome slows muted
     background tabs more.
  3. Come back and check that the playhead is still inside the loop and that the counter went up.
- **SoundCloud:** it asks for a sign-in before it plays anything.
- **Ads after the first one:** mid-rolls, and auto-on while a preroll plays. Prerolls came up
  only once in about ten loads.
- **Firefox.**
- **Windows** high-contrast (`forced-colors`) styles.

## Suggested order for 1.4.1

1. **B1, B2, B3:** one change to the engine's play order, with the scenario tests listed under B3.
   These affect the main use: nested loops and the whole-video loop.
2. **B6, B4, B5:** keyboard and tabs.
3. **B16, B7, B8, B10, B11:** small, user-visible. B16 is a one-line selector fix.
4. **B17:** check first; fix if the frame really has no id.
5. **B9, B12–B15** as time allows.
