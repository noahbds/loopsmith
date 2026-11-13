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

const optional = (origins) => (origins || []).filter((o) => /^(\*|https?):\/\//.test(o) && !BUILT_IN_MATCHES.includes(o));

// Two scripts per allowed site: the content script, and the page-world media hook (out-of-page
// audio, plays inside shadow-DOM players), which must run at document start.
function specs(sites) {
  const common = { matches: sites, excludeMatches: BUILT_IN_MATCHES, allFrames: true };
  return [
    { ...common, id: ID, js: ['content.js'], runAt: 'document_idle' },
    { ...common, id: HOOK_ID, js: ['page-media-hook.js'], runAt: 'document_start', world: 'MAIN' },
  ];
}

async function sync() {
  const { origins } = await api.permissions.getAll();
  const sites = optional(origins);
  const existing = (await api.scripting.getRegisteredContentScripts({ ids: [ID, HOOK_ID] })).map((r) => r.id);
  if (!sites.length) {
    if (existing.length) await api.scripting.unregisterContentScripts({ ids: existing });
    return;
  }
  const all = specs(sites);
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
