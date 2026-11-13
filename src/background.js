// Background script (Chrome service worker / Firefox event page).
//
// Sites other than the built-in ones are opt-in: the popup asks the browser for permission on a
// site (or on every site), and this script keeps one dynamically registered content script in step
// with whatever permissions are granted. The permissions are the single source of truth, so it
// stays right when the user changes site access from the browser's own extension settings too.

import { BUILT_IN_MATCHES } from './sites.js';

const api = globalThis.browser || globalThis.chrome;
const ID = 'loopsmith-sites';

const optional = (origins) => (origins || []).filter((o) => /^(\*|https?):\/\//.test(o) && !BUILT_IN_MATCHES.includes(o));

async function sync() {
  const { origins } = await api.permissions.getAll();
  const sites = optional(origins);
  const existing = await api.scripting.getRegisteredContentScripts({ ids: [ID] });
  if (!sites.length) {
    if (existing.length) await api.scripting.unregisterContentScripts({ ids: [ID] });
    return;
  }
  const spec = { id: ID, matches: sites, excludeMatches: BUILT_IN_MATCHES, js: ['content.js'], runAt: 'document_idle', allFrames: true };
  if (existing.length) await api.scripting.updateContentScripts([spec]);
  else await api.scripting.registerContentScripts([spec]);
}

// Newly allowed sites: start right away in the tabs already open on them, no reload needed.
async function injectInto(origins) {
  if (!origins.length) return;
  const tabs = await api.tabs.query({ url: origins });
  for (const t of tabs) {
    api.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: ['content.js'] }).catch(() => {});
  }
}

api.permissions.onAdded.addListener(async (p) => {
  await sync().catch(() => {});
  await injectInto(optional(p.origins)).catch(() => {});
});
api.permissions.onRemoved.addListener(() => { sync().catch(() => {}); });
api.runtime.onInstalled.addListener(() => { sync().catch(() => {}); });
api.runtime.onStartup.addListener(() => { sync().catch(() => {}); });
