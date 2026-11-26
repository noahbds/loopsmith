// Sites with a dedicated adapter. Loopsmith runs on these out of the box (no permission to grant);
// every other site uses the generic adapter once the user turns Loopsmith on for it.
// The build reads `matches` and `pageWorld` to write the manifests; boot.js reads `adapter`.

const AMAZON_HOSTS = [
  'music.amazon.com',
  'music.amazon.co.uk',
  'music.amazon.de',
  'music.amazon.fr',
  'music.amazon.es',
  'music.amazon.it',
  'music.amazon.co.jp',
  'music.amazon.ca',
  'music.amazon.com.au',
  'music.amazon.com.br',
  'music.amazon.com.mx',
  'music.amazon.in',
];

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
    name: 'Spotify',
    matches: ['*://open.spotify.com/*'],
    host: (h) => h === 'open.spotify.com',
    adapter: 'spotify',
    pageWorld: ['src/page/media-hook.js'],
  },
  {
    name: 'Apple Music',
    matches: ['*://music.apple.com/*'],
    host: (h) => h === 'music.apple.com',
    adapter: 'applemusic',
    pageWorld: ['src/page/media-hook.js'],
  },
  {
    name: 'SoundCloud',
    matches: ['*://soundcloud.com/*'],
    host: (h) => h === 'soundcloud.com',
    adapter: 'soundcloud',
    pageWorld: ['src/page/media-hook.js'],
  },
  {
    name: 'Deezer',
    matches: ['*://www.deezer.com/*'],
    host: (h) => h === 'www.deezer.com',
    adapter: 'deezer',
    pageWorld: ['src/page/media-hook.js'],
  },
  {
    name: 'Tidal',
    matches: ['*://tidal.com/*', '*://www.tidal.com/*', '*://listen.tidal.com/*'],
    host: (h) => h === 'tidal.com' || h === 'www.tidal.com' || h === 'listen.tidal.com',
    adapter: 'tidal',
    pageWorld: ['src/page/media-hook.js'],
  },
  {
    name: 'Amazon Music',
    matches: AMAZON_HOSTS.map((h) => `*://${h}/*`),
    host: (h) => AMAZON_HOSTS.includes(h),
    adapter: 'amazonmusic',
    pageWorld: ['src/page/media-hook.js'],
  },
  {
    name: 'Bandcamp',
    matches: ['*://*.bandcamp.com/*'],
    host: (h) => h === 'bandcamp.com' || h.endsWith('.bandcamp.com'),
    adapter: 'bandcamp',
    pageWorld: ['src/page/media-session.js'],
  },
  {
    name: 'Vimeo',
    matches: ['*://vimeo.com/*', '*://player.vimeo.com/*'],
    host: (h) => h === 'vimeo.com' || h === 'player.vimeo.com',
    adapter: 'vimeo',
    pageWorld: ['src/page/media-session.js'],
  },
  {
    name: 'Twitch',
    matches: ['*://www.twitch.tv/*', '*://clips.twitch.tv/*'],
    host: (h) => h === 'www.twitch.tv' || h === 'clips.twitch.tv',
    adapter: 'twitch',
    pageWorld: ['src/page/media-session.js'],
  },
  {
    name: 'Bilibili',
    matches: ['*://www.bilibili.com/*'],
    host: (h) => h === 'www.bilibili.com',
    adapter: 'bilibili',
    pageWorld: ['src/page/media-session.js'],
  },
  {
    name: 'Dailymotion',
    matches: ['*://www.dailymotion.com/*', '*://geo.dailymotion.com/*'],
    host: (h) => h === 'www.dailymotion.com' || h === 'geo.dailymotion.com',
    adapter: 'dailymotion',
    pageWorld: ['src/page/media-session.js'],
  },
];

export const BUILT_IN_MATCHES = BUILT_IN.flatMap((s) => s.matches);

export const builtInFor = (hostname) => BUILT_IN.find((s) => s.host(hostname)) || null;
