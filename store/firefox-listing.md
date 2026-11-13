# Firefox Add-ons (AMO) listing

**Résumé** (max 250 characters)

```
Loop any part of a song or video: set a start and an end, choose how many times it repeats, or forever. For practice, or to keep your favourite part on repeat, on popular music and video sites.
```

**Description** (Markdown)

```
Loop any part of a song or video, as many times as you want, then move on.

Loopsmith adds an A-B repeat to the players you already use. Mark a start and an end, choose how many times the section plays (or forever), and let it run without reaching for the mouse.

It is made for two things: practising (a guitar riff, the hard part of a song, a dance move, a language lesson) and keeping your favourite part of a song on repeat.

**What you can do**

- Set the start and end by dragging the A and B handles, typing a time (1:23, 90s, 1m30s), or grabbing the current position.
- Choose how many times a section plays, from 1 to 999, or forever.
- Add several loops on the same video or track, even overlapping ones. Switch a loop off without deleting it.
- Decide what happens when a loop is done: play on, jump straight to the next loop, or pause after the last one.
- See your loops on the site's own progress bar.
- Your loops are saved and come back when you return.
- Keyboard shortcuts: Shift+A / Shift+B set the start / end to now, Shift+S plays the loop, Shift+R turns looping on or off.

**Where it works**

Loopsmith works out of the box on YouTube, Spotify and other popular video and music sites. On any other website with a video or audio player, click the Loopsmith toolbar button and choose "Turn on for this site": it only runs where you allow it.

**Private by design**

- No account, no tracking, no analytics, no ads.
- Loopsmith never sends anything anywhere: your loops are stored in your browser only.
- It only asks for access to other websites when you turn it on for them, one site at a time.

Live streams can't be looped, since there is nothing to go back to. Loopsmith is not affiliated with any of the sites it works on.
```

**Expérimental:** no. **Paiement requis:** no.

**Catégories:** Photos, musique et vidéos.

**E-mail d'assistance:** optional (shown publicly). **Site d'assistance:** `https://github.com/noahbds/loopsmith/issues`

**Licence:** Licence MIT.

**Politique de confidentialité:** yes, paste the text of `PRIVACY.md`.

**Source code:** upload `dist/loopsmith-source.zip` (made with `git archive --format=zip -o dist/loopsmith-source.zip HEAD`).

**Notes aux testeurs**

```
BUILD (the uploaded code is bundled with esbuild, not minified; the source archive is attached)
- Requirements: Node.js 20 or later (built with Node 26.13.0, npm 11.20.0), any OS.
- In the source folder: npm ci, then npm run build
- Output: dist/firefox/ (the submitted package is dist/loopsmith-firefox.xpi, a zip of that folder).
- scripts/build.mjs bundles src/entries/content.js, src/background.js, src/popup/popup.js and the page scripts in src/page/ with esbuild (format iife, no minification).

HOW TO TEST
1. Open https://www.youtube.com/watch?v=eRsGyueVLvQ (Sintel, Blender Foundation). A loop button appears in the player's control bar.
2. Click it, set Start 1:48 and End 1:55, Times to play 2, and press the play button in the panel. Playback jumps back to 1:48 once, then plays on. Coloured markers show the loop on YouTube's progress bar.
3. On any other site with a video, click the Loopsmith toolbar button and choose "Turn on for this site" (this requests the optional permission for that site only). A loop button appears when hovering the video.

PERMISSIONS
- storage: loops and preferences, stored locally only.
- scripting: registers the content script for sites the user turns on, and starts it in tabs already open there.
- activeTab: the popup reads the current tab's address to offer turning Loopsmith on.
- Host permissions: a fixed list of media sites; any other site only through the optional permission above.
- Content scripts with world "MAIN" (src/page/): youtube.js reads the YouTube player's video id and seeks through its own API; media-hook.js moves audio elements that sites never insert into the page (Spotify, SoundCloud) into a hidden element so the content script can control them. Neither sends data anywhere.

The extension makes no network requests and collects no data.
```
