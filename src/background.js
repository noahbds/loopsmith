// Background script (Chrome service worker / Firefox event page).
//
// 1. Sites other than the built-in ones are opt-in: the popup asks the browser for permission on a
//    site (or on every site, or on file:// URLs), and this script keeps one dynamically registered
//    content script in step with whatever permissions are granted.
// 2. When an already-installed extension updates and new built-in sites lack host permission (as
//    Firefox does on update), marks the toolbar icon and opens a one-time permission prompt so the
//    user can grant the new built-in sites in one click—and injects immediately into open tabs.
// 3. Tracks tabs that are actively looping (persisted in storage.session) to show a toolbar badge
//    and route browser-wide keyboard commands.

import { BUILT_IN, BUILT_IN_MATCHES } from './sites.js';

const api = globalThis.browser || globalThis.chrome;
const ID = 'loopsmith-sites';
const HOOK_ID = 'loopsmith-sites-hook';
const YT_ID = 'loopsmith-sites-youtube';
const NOCOOKIE = ['*://www.youtube-nocookie.com/*'];
const SESSION_KEY = 'activeTabs';
const PROMPTED_KEY = 'permPromptVer';

const COMMAND_ACTIONS = {
  'toggle-looping': 'toggle',
  'play-loop': 'start',
  'mark-start': 'markA',
  'mark-end': 'markB',
  'next-loop': 'next',
  'prev-loop': 'prev',
};

const optional = (origins) => (origins || []).filter((o) => /^(\*|https?|file):\/\//.test(o) && !BUILT_IN_MATCHES.includes(o));
const injectFilter = (origins) => (origins || []).filter((o) => /^(\*|https?|file):\/\//.test(o));

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

// Page-world scripts needed for a tab URL when injecting into an already-open tab (both optional
// sites and newly granted built-in sites after an extension update).
function pageWorldFilesFor(url) {
  try {
    const h = new URL(url).hostname;
    const site = BUILT_IN.find((s) => s.host(h));
    if (site && site.pageWorld) return site.pageWorld.map((f) => 'page-' + f.split('/').pop());
    if (h.endsWith('youtube-nocookie.com')) return ['page-youtube.js'];
  } catch (_) { /* ignore */ }
  return ['page-media-hook.js'];
}

async function injectInto(origins) {
  if (!origins.length || !api.tabs || typeof api.tabs.query !== 'function') return;
  const tabs = await api.tabs.query({ url: origins });
  for (const t of tabs) {
    const target = { tabId: t.id, allFrames: true };
    for (const file of pageWorldFilesFor(t.url || '')) {
      api.scripting.executeScript({ target, files: [file], world: 'MAIN' }).catch(() => {});
    }
    api.scripting.executeScript({ target, files: ['content.js'] }).catch(() => {});
  }
}

/* ---- Built-in permission check on extension update ---- */

async function missingBuiltIns() {
  if (!api.permissions || typeof api.permissions.contains !== 'function') return [];
  const missing = [];
  for (const s of BUILT_IN) {
    const ok = await api.permissions.contains({ origins: s.matches }).catch(() => true);
    if (!ok) missing.push(s);
  }
  return missing;
}

async function syncPermBadge() {
  if (!api.action || typeof api.action.setBadgeText !== 'function') return [];
  const missing = await missingBuiltIns();
  if (missing.length) {
    Promise.resolve(api.action.setBadgeText({ text: '!' })).catch(() => {});
    if (typeof api.action.setBadgeBackgroundColor === 'function') {
      Promise.resolve(api.action.setBadgeBackgroundColor({ color: '#d97706' })).catch(() => {});
    }
  } else {
    Promise.resolve(api.action.setBadgeText({ text: '' })).catch(() => {});
  }
  return missing;
}

async function checkUpdatePermissions(details) {
  const missing = await syncPermBadge();
  if (!missing.length || !details || details.reason !== 'update') return;
  if (!api.tabs || typeof api.tabs.create !== 'function' || !api.runtime || typeof api.runtime.getURL !== 'function') return;
  const ver = (api.runtime.getManifest && api.runtime.getManifest().version) || '';
  const local = api.storage && api.storage.local;
  if (local) {
    const prev = await local.get(PROMPTED_KEY).catch(() => ({}));
    if (prev && prev[PROMPTED_KEY] === ver) return;
    await local.set({ [PROMPTED_KEY]: ver }).catch(() => {});
  }
  api.tabs.create({ url: api.runtime.getURL('popup.html?standalone=1&prompt=permissions') }).catch(() => {});
}

/* ---- Active-loop toolbar badge & browser-level commands ---- */

const activeTabs = new Map(); // tabId -> { badge, statusText, title, url, at }
let sessionHydrated = false;
const sessionStore = api.storage && api.storage.session ? api.storage.session : null;

async function hydrateActiveTabs() {
  if (sessionHydrated || !sessionStore) return;
  sessionHydrated = true;
  try {
    const got = await sessionStore.get(SESSION_KEY);
    const saved = got && got[SESSION_KEY];
    if (saved && typeof saved === 'object') {
      for (const [k, v] of Object.entries(saved)) {
        const id = Number(k);
        if (Number.isInteger(id) && v && typeof v === 'object' && !activeTabs.has(id)) activeTabs.set(id, v);
      }
    }
  } catch (_) { /* ignore */ }
}

function persistActiveTabs() {
  if (!sessionStore) return;
  const obj = {};
  for (const [id, info] of activeTabs) obj[id] = info;
  Promise.resolve(sessionStore.set({ [SESSION_KEY]: obj })).catch(() => {});
}

function updateBadge(tabId, active, badge) {
  if (!api.action || typeof api.action.setBadgeText !== 'function') return;
  const text = active ? String(badge || '↻').slice(0, 4) : '';
  Promise.resolve(api.action.setBadgeText({ tabId, text })).catch(() => {});
  if (active && typeof api.action.setBadgeBackgroundColor === 'function') {
    Promise.resolve(api.action.setBadgeBackgroundColor({ tabId, color: '#1a7fd6' })).catch(() => {});
  }
}

async function liveActiveList() {
  await hydrateActiveTabs();
  const entries = [...activeTabs.entries()].sort((a, b) => b[1].at - a[1].at);
  if (!entries.length) return [];
  const out = [];
  let pruned = false;
  for (const [tabId, info] of entries) {
    if (api.tabs && typeof api.tabs.get === 'function') {
      const exists = await api.tabs.get(tabId).then(() => true, () => false);
      if (!exists) {
        activeTabs.delete(tabId);
        pruned = true;
        continue;
      }
    }
    out.push({ tabId, ...info });
  }
  if (pruned) persistActiveTabs();
  return out;
}

if (api.runtime && api.runtime.onMessage) {
  api.runtime.onMessage.addListener((msg, sender, send) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'loopsmith:state' && sender && sender.tab && sender.tab.id != null) {
      const tabId = sender.tab.id;
      hydrateActiveTabs().then(() => {
        if (msg.active) {
          activeTabs.set(tabId, {
            badge: msg.badge || '↻',
            statusText: msg.statusText || '',
            title: msg.title || sender.tab.title || '',
            url: sender.tab.url || '',
            at: Date.now(),
          });
          updateBadge(tabId, true, msg.badge);
        } else {
          activeTabs.delete(tabId);
          updateBadge(tabId, false, '');
        }
        persistActiveTabs();
      });
    } else if (msg.type === 'loopsmith:active-tabs') {
      liveActiveList().then(send, () => send([]));
      return true;
    }
  });
}

if (api.tabs && api.tabs.onRemoved) {
  api.tabs.onRemoved.addListener((tabId) => {
    hydrateActiveTabs().then(() => {
      if (activeTabs.delete(tabId)) persistActiveTabs();
    });
  });
}

if (api.commands && api.commands.onCommand) {
  api.commands.onCommand.addListener(async (command) => {
    const action = COMMAND_ACTIONS[command];
    if (!action || !api.tabs) return;
    try {
      const [cur] = await api.tabs.query({ active: true, currentWindow: true });
      if (cur && cur.id != null) {
        const reply = await api.tabs.sendMessage(cur.id, { type: 'loopsmith:control', action }).catch(() => null);
        if (reply && reply.hasPlayer) return;
      }
    } catch (_) { /* try active looping tab next */ }
    const list = await liveActiveList();
    if (list.length) {
      const targetId = list[0].tabId;
      api.tabs.sendMessage(targetId, { type: 'loopsmith:control', action }).catch(() => {
        activeTabs.delete(targetId);
        persistActiveTabs();
      });
    }
  });
}

api.permissions.onAdded.addListener(async (p) => {
  await sync().catch(() => {});
  await syncPermBadge().catch(() => {});
  await injectInto(injectFilter(p.origins)).catch(() => {});
});
api.permissions.onRemoved.addListener(() => {
  sync().catch(() => {});
  syncPermBadge().catch(() => {});
});
api.runtime.onInstalled.addListener((details) => {
  sync().catch(() => {});
  checkUpdatePermissions(details).catch(() => {});
});
api.runtime.onStartup.addListener(() => {
  sync().catch(() => {});
  syncPermBadge().catch(() => {});
});
