# Chrome Web Store listing

Everything to paste into the developer dashboard. Images are in this folder.

## Store listing tab

**Description** (paste as is)

```
Loop any part of a song or video, as many times as you want, then move on.

Loopsmith adds an A-B repeat to the players you already use. Mark a start and an end, choose how many times the section plays (or forever), and keep practising without reaching for the mouse.

Made for practice: learning a guitar riff, a dance move, a language, a lecture, a speedrun route.

WHAT YOU CAN DO
• Set the start and end by dragging the A and B handles, typing a time (1:23, 90s, 1m30s), or grabbing the current position.
• Choose how many times a section plays, from 1 to 999, or forever.
• Add several loops on the same video (up to 12), even overlapping ones. Switch a loop off without deleting it.
• Decide what happens when a loop is done: play on, jump straight to the next loop, or pause after the last one.
• See your loops on the site's own progress bar.
• Your loops are saved per video or track, and come back when you return.
• Keyboard shortcuts: Shift+A / Shift+B set the start / end to now, Shift+S plays the loop, Shift+R turns looping on or off.

WORKS ON
• YouTube and YouTube Music
• Spotify (web player), SoundCloud, Bandcamp
• Vimeo, Twitch videos and clips, Bilibili, Dailymotion
• Any other website with a video or audio player: click the Loopsmith icon and choose "Turn on for this site". Loopsmith only runs where you allow it.

PRIVATE BY DESIGN
• No account, no tracking, no analytics, no ads.
• Loopsmith never sends anything anywhere: your loops are stored in your browser only.
• It only asks for access to other websites when you turn it on for them, one site at a time.

Live streams can't be looped (there's nothing to go back to). Loopsmith is not affiliated with YouTube, Spotify or any of the sites it works on.
```

**Category:** Outils (Tools). Alternative if you prefer to reach learners: Éducation.

**Langue:** Anglais (English). The interface is in English.

**Icône du magasin:** `store-icon-128.png` (96 px artwork with 16 px transparent margin, as Google asks).

**Captures d'écran:** `screenshot-1-youtube.png`, `screenshot-2-soundcloud.png`, `screenshot-3-any-site.png` (1280 × 800, PNG without alpha).

**Petite image promotionnelle:** `promo-small-440x280.png`

**Image promotionnelle en haut de la page (marquee):** `promo-marquee-1400x560.png`

**Vidéo promotionnelle:** leave empty (optional).

**URL officielle:** leave empty (only for a website you own and verified in Search Console).

**URL de la page d'accueil:** `https://github.com/noahbds/loopsmith`

**URL de l'assistance:** `https://github.com/noahbds/loopsmith/issues`

**Contenu réservé aux adultes:** No.

## Privacy practices tab ("Pratiques de confidentialité")

**Single purpose**

```
Loopsmith repeats a chosen section of the video or audio playing on a web page (A-B loop), a chosen number of times.
```

**Permission justifications**

- `storage`
  ```
  Saves the user's loops (start, end, repeat count) per video or track, and their preferences, in the browser's local extension storage so they come back on the next visit. Nothing leaves the browser.
  ```
- `scripting`
  ```
  When the user turns Loopsmith on for a website from the toolbar popup, the extension registers its content script for that site only, and starts it in tabs already open on it, so the loop controls appear without a reload.
  ```
- `activeTab`
  ```
  Lets the toolbar popup read the address of the current tab when the user opens it, to show whether Loopsmith runs there and offer to turn it on for that site.
  ```
- Host permissions (built-in sites: YouTube, YouTube Music, Spotify, SoundCloud, Bandcamp, Vimeo, Twitch, Bilibili, Dailymotion)
  ```
  The content script adds the loop controls to the media player on these sites and controls playback (seeking back to the loop start). On YouTube, YouTube Music, Spotify and SoundCloud a small script also runs in the page itself to read which track is loaded and reach the player's audio. No page content is read or sent anywhere.
  ```
- Optional host permissions (`*://*/*`)
  ```
  Only requested when the user clicks "Turn on for this site" (one site) or "Turn on for every website" in the popup, so Loopsmith can add its loop controls to media players on sites the user chooses. The user can turn it off again at any time.
  ```
- Remote code: **No, I am not using remote code.** (Everything is bundled in the package.)

**Data usage:** tick nothing in the list of data types (Loopsmith collects none), then tick the three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** not required when no data is collected. If the form insists, use
`https://github.com/noahbds/loopsmith/blob/main/PRIVACY.md` (see `PRIVACY.md` at the repository root).
