// Sites with a dedicated adapter. Loopsmith runs on these out of the box (no permission to grant);
// every other site uses the generic adapter once the user turns Loopsmith on for it.
// The build reads `matches` to write the manifests.

export const BUILT_IN = [
  {
    name: 'YouTube',
    matches: ['*://www.youtube.com/*'],
    host: (h) => h === 'www.youtube.com',
    pageWorld: 'src/page/youtube.js',
  },
];

export const BUILT_IN_MATCHES = BUILT_IN.flatMap((s) => s.matches);

export const builtInFor = (hostname) => BUILT_IN.find((s) => s.host(hostname)) || null;
