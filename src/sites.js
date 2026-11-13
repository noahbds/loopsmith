// Sites with a dedicated adapter. Loopsmith runs on these out of the box (no permission to grant);
// every other site uses the generic adapter once the user turns Loopsmith on for it.
// The build reads `matches` and `pageWorld` to write the manifests; boot.js reads `adapter`.

export const BUILT_IN = [
  {
    name: 'YouTube',
    matches: ['*://www.youtube.com/*'],
    host: (h) => h === 'www.youtube.com',
    adapter: 'youtube',
    pageWorld: ['src/page/youtube.js'],
  },
  {
    name: 'YouTube Music',
    matches: ['*://music.youtube.com/*'],
    host: (h) => h === 'music.youtube.com',
    adapter: 'ytmusic',
    pageWorld: ['src/page/youtube.js'],
  },
  {
    name: 'SoundCloud',
    matches: ['*://soundcloud.com/*'],
    host: (h) => h === 'soundcloud.com',
    adapter: 'soundcloud',
    pageWorld: ['src/page/media-hook.js'],
  },
  {
    name: 'Spotify',
    matches: ['*://open.spotify.com/*'],
    host: (h) => h === 'open.spotify.com',
    adapter: 'spotify',
    pageWorld: ['src/page/media-hook.js'],
  },
  {
    name: 'Bandcamp',
    matches: ['*://*.bandcamp.com/*'],
    host: (h) => h === 'bandcamp.com' || h.endsWith('.bandcamp.com'),
    adapter: 'bandcamp',
  },
];

export const BUILT_IN_MATCHES = BUILT_IN.flatMap((s) => s.matches);

export const builtInFor = (hostname) => BUILT_IN.find((s) => s.host(hostname)) || null;
