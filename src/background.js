// Background script (Chrome service worker / Firefox event page).
//
// Sites other than the built-in ones are opt-in: the popup asks the browser for permission on a
// site (or on every site), and this script keeps one dynamically registered content script in step
// with whatever permissions are granted. The permissions are the single source of truth, so it
// stays right when the user changes site access from the browser's own extension settings too.

import { BUILT_IN_MATCHES } from './sites.js';

const api = globalThis.browser || globalThis.chrome;
const ID = 'loopsmith-sites';
const HOOK_ID = 'loopsmith-sites-hook';
const YT_ID = 'loopsmith-sites-youtube';
const NOCOOKIE = ['*://www.youtube-nocookie.com/*'];

const optional = (origins) => (origins || []).filter((o) => /^(\*|https?):\/\//.test(o) && !BUILT_IN_MATCHES.includes(o));

// Two scripts per allowed site: the content script, and the page-world media hook (out-of-page
// audio, plays inside shadow-DOM players), which must run at document start.
// YouTube's privacy-enhanced embeds use the YouTube adapter, which needs its page-world helper
// to know which video is loaded: registered too when the user allowed that host (or every site).
function specs(sites) {
  const common = { matches: sites, excludeMatches: BUILT_IN_MATCHES, allFrames: true };
  const out = [
    { ...common, id: ID, js: ['content.js'], runAt: 'document_idle' },
    { ...common, id: HOOK_ID, js: ['page-media-hook.js'], runAt: 'document_start', world: 'MAIN' },
  ];
  const yt = sites.includes('*://*/*') ? NOCOOKIE : sites.filter((s) => s.includes('youtube-nocookie.com'));
  if (yt.length) out.push({ id: YT_ID, matches: yt, allFrames: true, js: ['page-youtube.js'], runAt: 'document_start', world: 'MAIN' });
  return out;
}

async function sync() {
  const { origins } = await api.permissions.getAll();
  const sites = optional(origins);
  const existing = (await api.scripting.getRegisteredContentScripts({ ids: [ID, HOOK_ID, YT_ID] })).map((r) => r.id);
  const all = sites.length ? specs(sites) : [];
  const gone = existing.filter((id) => !all.some((x) => x.id === id));
  if (gone.length) await api.scripting.unregisterContentScripts({ ids: gone });
  if (!all.length) return;
  const update = all.filter((x) => existing.includes(x.id));
  const create = all.filter((x) => !existing.includes(x.id));
  if (update.length) await api.scripting.updateContentScripts(update);
  if (create.length) await api.scripting.registerContentScripts(create);
}

// Newly allowed sites: start right away in the tabs already open on them, no reload needed.
// (The hook arrives late there, so it only sees plays from now on.)
async function injectInto(origins) {
  if (!origins.length) return;
  const tabs = await api.tabs.query({ url: origins });
  for (const t of tabs) {
    const target = { tabId: t.id, allFrames: true };
    api.scripting.executeScript({ target, files: ['page-media-hook.js'], world: 'MAIN' }).catch(() => {});
    api.scripting.executeScript({ target, files: ['content.js'] }).catch(() => {});
  }
}

api.permissions.onAdded.addListener(async (p) => {
  await sync().catch(() => {});
  await injectInto(optional(p.origins)).catch(() => {});
});
api.permissions.onRemoved.addListener(() => { sync().catch(() => {}); });
api.runtime.onInstalled.addListener(() => { sync().catch(() => {}); });
api.runtime.onStartup.addListener(() => { sync().catch(() => {}); });
