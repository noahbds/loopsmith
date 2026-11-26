// Toolbar popup:
// - Page: site permissions (including file://), live controls for the active player or background looping tab, diagnostics
// - Saved: searchable library of saved tracks/videos, delete with undo, JSON export & import
// - Keys: remappable keyboard shortcuts and browser-wide command shortcut instructions

import { BUILT_IN, builtInFor } from '../sites.js';
import { backend } from '../platform/extension.js';
import { createStore } from '../core/store.js';
import { exportBackup, importBackup, siteLabelOf, entryUrlOf } from '../core/backup.js';
import { SHORTCUT_DEFS, bindingFromEvent, cleanKeyMap, formatBinding, specFor } from '../core/keys.js';
import { el } from '../ui/dom.js';
import { buildReport } from './report.js';

const api = globalThis.browser || globalThis.chrome;
const ALL = '*://*/*';
const FILE_ORIGIN = 'file:///*';
const $ = (id) => document.getElementById(id);

const store = createStore(backend, { delay: 0 });
const params = new URLSearchParams(location.search);
const isStandalone = params.get('standalone') === '1';
const isPermPrompt = params.get('prompt') === 'permissions';
const isFirefox = typeof browser !== 'undefined' && !!browser.runtime;
if (isStandalone) document.body.classList.add('standalone');

let storeReady = false;
let tab = null;
let host = '';
let protocol = '';
let deletedItem = null; // { id, entry } for undo in the Saved tab
let recordingAction = null;

async function ensureStore() {
  if (storeReady) return;
  await store.load();
  store.subscribe(() => {
    updateSavedCount();
    if (!$('paneSaved').hidden) renderLibrary();
    if (!$('paneKeys').hidden) renderKeys();
  });
  storeReady = true;
}

function show(node, text, onClick) {
  node.hidden = !text;
  node.textContent = text || '';
  node.onclick = onClick || null;
}

// Must run straight from the click: browsers only show the permission prompt for a user gesture.
function allow(origins) {
  api.permissions.request({ origins }).then((ok) => {
    if (!ok) return;
    renderPermBanner();
    renderPage();
    if (isPermPrompt) window.close();
  }, () => {});
}

async function renderPermBanner() {
  const banner = $('permBanner');
  if (!banner || !api.permissions || typeof api.permissions.contains !== 'function') return;
  const missing = [];
  for (const s of BUILT_IN) {
    const ok = await api.permissions.contains({ origins: s.matches }).catch(() => true);
    if (!ok) missing.push(s);
  }
  if (!missing.length) {
    banner.hidden = true;
    return;
  }
  const names = missing.map((s) => s.name).join(', ');
  const origins = missing.flatMap((s) => s.matches);
  $('permTitle').textContent = missing.length === 1 ? `Allow Loopsmith on ${names}` : 'Update site permissions';
  $('permSub').textContent = `New built-in sites (${names}) need your permission after updating.`;
  $('permAllowBtn').textContent = missing.length === 1 ? `Allow ${names}` : `Allow ${missing.length} sites`;
  $('permAllowBtn').onclick = () => allow(origins);
  const dismiss = $('permDismissBtn');
  dismiss.hidden = !isPermPrompt;
  dismiss.onclick = () => window.close();
  banner.hidden = false;
}

function revoke(origins) {
  api.permissions.remove({ origins }).then(() => renderPage({ removed: true }), () => {});
}

async function fileSchemeAllowed() {
  if (!api.extension || typeof api.extension.isAllowedFileSchemeAccess !== 'function') return true;
  try { return await api.extension.isAllowedFileSchemeAccess(); } catch (_) { return true; }
}

/* ---- Tabs ---- */

function selectTab(which) {
  recordingAction = null;
  for (const [id, pane] of [['tabBtnPage', 'panePage'], ['tabBtnSaved', 'paneSaved'], ['tabBtnKeys', 'paneKeys']]) {
    const active = id === 'tabBtn' + which[0].toUpperCase() + which.slice(1);
    $(id).setAttribute('aria-selected', String(active));
    $(pane).hidden = !active;
  }
  if (which === 'saved') renderLibrary();
  else if (which === 'keys') renderKeys();
  else renderPage();
}

for (const btn of document.querySelectorAll('.tabs button')) {
  btn.addEventListener('click', () => selectTab(btn.dataset.tab));
}

/* ---- Page tab ---- */

async function sendTabControl(tabId, action) {
  try {
    await api.tabs.sendMessage(tabId, { type: 'loopsmith:control', action });
  } catch (_) { /* tab closed or navigated */ }
  await renderLiveCards();
}

async function renderLiveCards() {
  const nowCard = $('nowCard');
  const otherCard = $('otherCard');
  nowCard.hidden = true;
  otherCard.hidden = true;

  let here = null;
  if (tab && tab.id != null) {
    try { here = await api.tabs.sendMessage(tab.id, { type: 'loopsmith:status' }); } catch (_) { here = null; }
  }
  if (here && here.mediaOk) {
    nowCard.hidden = false;
    $('nowDot').classList.toggle('on', !!here.active);
    $('nowTitle').textContent = here.title || 'Current media';
    $('nowSub').textContent = here.active
      ? (here.statusText || 'Looping')
      : here.loops
        ? `${here.loops} saved loop${here.loops === 1 ? '' : 's'} · looping off`
        : 'No loops yet on this media';
    const btns = $('nowBtns');
    btns.replaceChildren();
    const addBtn = (text, action, accent = false) => {
      const b = el('button', { type: 'button', class: accent ? 'pill-btn accent' : 'pill-btn', text });
      b.addEventListener('click', () => sendTabControl(tab.id, action));
      btns.append(b);
    };
    if (here.loops > 0) {
      addBtn(here.active ? 'Turn off' : 'Turn on', 'toggle', !here.active);
      if (!here.active) addBtn('Play loop', 'start');
      if (here.active && here.loops > 1) {
        addBtn('Prev', 'prev');
        addBtn('Next', 'next');
      }
    }
    addBtn('Editor', 'open', here.loops === 0);
  }

  let activeList = [];
  try { activeList = (await api.runtime.sendMessage({ type: 'loopsmith:active-tabs' })) || []; } catch (_) { activeList = []; }
  const other = activeList.find((item) => !tab || item.tabId !== tab.id);
  if (other) {
    otherCard.hidden = false;
    $('otherTitle').textContent = other.title || 'Looping in another tab';
    $('otherSub').textContent = other.statusText || 'Looping active';
    const btns = $('otherBtns');
    btns.replaceChildren();
    const goBtn = el('button', { type: 'button', class: 'pill-btn accent', text: 'Go to tab' });
    goBtn.addEventListener('click', () => {
      api.tabs.update(other.tabId, { active: true });
      window.close();
    });
    const nextBtn = el('button', { type: 'button', class: 'pill-btn', text: 'Next' });
    nextBtn.addEventListener('click', () => sendTabControl(other.tabId, 'next'));
    const stopBtn = el('button', { type: 'button', class: 'pill-btn', text: 'Stop' });
    stopBtn.addEventListener('click', () => sendTabControl(other.tabId, 'stop'));
    btns.append(goBtn, nextBtn, stopBtn);
  }
}

async function renderPage(opts = {}) {
  const site = $('site');
  const status = $('status');
  const primary = $('primary');
  const secondary = $('secondary');
  const note = $('note');
  status.classList.remove('on');
  primary.classList.remove('quiet');
  show(secondary, '');
  show(note, '');

  await renderLiveCards();

  if (protocol === 'file:') {
    site.textContent = 'Local media file';
    const fileOk = await fileSchemeAllowed();
    const granted = await api.permissions.contains({ origins: [FILE_ORIGIN] });
    if (!fileOk) {
      status.textContent = 'Allow file URL access in extension settings first.';
      show(primary, 'Open extension settings', () => {
        api.tabs.create({ url: `chrome://extensions/?id=${api.runtime.id}` });
        window.close();
      });
      show(note, 'Turn on “Allow access to file URLs”, then come back and enable local files.');
      return;
    }
    if (granted) {
      status.textContent = 'On for local files. Hover the player for the loop button.';
      status.classList.add('on');
      primary.classList.add('quiet');
      show(primary, 'Turn off for local files', () => revoke([FILE_ORIGIN]));
    } else {
      status.textContent = 'Off for local files.';
      show(primary, 'Turn on for local files', () => allow([FILE_ORIGIN]));
    }
    if (opts.removed) show(note, 'Reload the file tab to remove the loop button.');
    return;
  }

  if (!/^https?:$/.test(protocol)) {
    site.textContent = 'This page';
    status.textContent = 'Loopsmith can’t run on browser pages. Open a page with a video or audio file.';
    show(primary, '');
    return;
  }
  site.textContent = host;

  const builtIn = builtInFor(host);
  if (builtIn) {
    if (!(await api.permissions.contains({ origins: builtIn.matches }))) {
      status.textContent = `Loopsmith doesn’t have access to ${builtIn.name}.`;
      show(primary, `Allow on ${builtIn.name}`, () => allow(builtIn.matches));
      return;
    }
    status.textContent = `Works on ${builtIn.name} out of the box.`;
    status.classList.add('on');
    show(primary, '');
    return;
  }

  const pattern = `*://${host}/*`;
  const everywhere = await api.permissions.contains({ origins: [ALL] });
  const here = everywhere || (await api.permissions.contains({ origins: [pattern] }));

  if (everywhere) {
    status.textContent = 'On for every website.';
    status.classList.add('on');
    primary.classList.add('quiet');
    show(primary, 'Turn off for every website', () => revoke([ALL]));
  } else if (here) {
    status.textContent = 'On for this site. Hover a video for the loop button.';
    status.classList.add('on');
    primary.classList.add('quiet');
    show(primary, 'Turn off for this site', () => revoke([pattern]));
  } else {
    status.textContent = 'Off on this site.';
    show(primary, 'Turn on for this site', () => allow([pattern]));
    show(secondary, 'Turn on for every website', () => allow([ALL]));
  }

  if (opts.removed) {
    show(note, 'Reload the page to remove the loop button.');
    show(secondary, 'Reload page', () => {
      api.tabs.reload(tab.id);
      window.close();
    });
  }
}

/* ---- Saved library & JSON backup ---- */

function updateSavedCount() {
  if (!storeReady) return;
  const n = store.entries().length;
  $('tabBtnSaved').textContent = n > 0 ? `Saved · ${n}` : 'Saved';
}

function readableTitle(id, entry) {
  if (entry.title) return entry.title;
  const colon = id.indexOf(':');
  const rest = colon > 0 ? id.slice(colon + 1) : id;
  if (rest.startsWith('file/')) return rest.slice(5).split('#')[0];
  return rest.split('#')[0];
}

async function renderLibrary() {
  await ensureStore();
  updateSavedCount();
  const q = ($('searchInput').value || '').trim().toLowerCase();
  const all = store.entries();
  const list = $('savedList');
  const empty = $('savedEmpty');
  list.replaceChildren();

  const matches = all.filter(({ id, entry }) => {
    if (!q) return true;
    const site = siteLabelOf(id).toLowerCase();
    const title = readableTitle(id, entry).toLowerCase();
    const names = (entry.loops || []).map((l) => (l && l.name ? l.name.toLowerCase() : '')).join(' ');
    return title.includes(q) || site.includes(q) || id.toLowerCase().includes(q) || names.includes(q);
  });

  $('undoBar').hidden = !deletedItem;
  if (deletedItem) {
    $('undoText').textContent = `Removed “${readableTitle(deletedItem.id, deletedItem.entry).slice(0, 26)}”`;
  }

  if (!matches.length) {
    empty.hidden = false;
    empty.textContent = all.length ? 'No saved items match your search.' : 'Loops you save on any video or track appear here.';
    return;
  }
  empty.hidden = true;

  for (const { id, entry } of matches) {
    const count = entry.loops.length;
    const site = siteLabelOf(id);
    const named = entry.loops.map((l) => l && l.name).filter(Boolean).slice(0, 2).join(', ');
    const meta = `${site} · ${count} loop${count === 1 ? '' : 's'}${named ? ` · ${named}` : ''}`;
    const targetUrl = entryUrlOf(id, entry);

    const openBtn = el('button', {
      type: 'button',
      class: 'saved-open',
      title: targetUrl || 'Local file: open it in your browser to use its saved loops',
    },
    el('span', { class: 'saved-title', text: readableTitle(id, entry) }),
    el('span', { class: 'saved-meta', text: meta }));

    openBtn.addEventListener('click', () => {
      if (!targetUrl) {
        show($('backupNote'), 'Open this local file in a browser tab to play its loops.');
        return;
      }
      api.tabs.create({ url: targetUrl });
      window.close();
    });

    const delBtn = el('button', {
      type: 'button',
      class: 'saved-del',
      'aria-label': `Delete saved loops for ${readableTitle(id, entry)}`,
      title: 'Delete saved loops',
      text: '×',
    });
    delBtn.addEventListener('click', async () => {
      deletedItem = { id, entry };
      store.put(id, null);
      await store.flush();
      renderLibrary();
    });

    list.append(el('div', { class: 'saved-item', role: 'listitem' }, openBtn, delBtn));
  }
}

$('searchInput').addEventListener('input', renderLibrary);

$('undoBtn').addEventListener('click', async () => {
  if (!deletedItem) return;
  store.put(deletedItem.id, deletedItem.entry);
  deletedItem = null;
  await store.flush();
  renderLibrary();
});

$('exportBtn').addEventListener('click', async () => {
  await ensureStore();
  const data = exportBackup(store, api.runtime.getManifest().version);
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const day = new Date().toISOString().slice(0, 10);
  const a = el('a', { href: url, download: `loopsmith-loops-${day}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const count = Object.keys(data.items).length;
  show($('backupNote'), `Exported ${count} saved item${count === 1 ? '' : 's'}.`);
});

async function importJsonText(text) {
  await ensureStore();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    show($('backupNote'), 'Couldn’t read JSON file.');
    return;
  }
  const res = importBackup(store, parsed);
  if (!res.ok) {
    show($('backupNote'), res.error);
    return;
  }
  await store.flush();
  await renderLibrary();
  const parts = [];
  if (res.imported) parts.push(`${res.imported} added`);
  if (res.updated) parts.push(`${res.updated} updated`);
  if (res.skipped) parts.push(`${res.skipped} kept as newer`);
  show($('backupNote'), parts.length ? `Import complete: ${parts.join(', ')}.` : 'Nothing new to import.');
}

$('importBtn').addEventListener('click', () => {
  // Firefox closes extension popups as soon as the OS file picker opens: open a tab instead.
  if (isFirefox && !isStandalone) {
    api.tabs.create({ url: api.runtime.getURL('popup.html?tab=saved&standalone=1') });
    window.close();
    return;
  }
  $('importFile').value = '';
  $('importFile').click();
});

$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) await importJsonText(await file.text());
});

const savedPane = $('paneSaved');
savedPane.addEventListener('dragover', (e) => {
  e.preventDefault();
  savedPane.classList.add('dragover');
});
for (const ev of ['dragleave', 'drop']) {
  savedPane.addEventListener(ev, () => savedPane.classList.remove('dragover'));
}
savedPane.addEventListener('drop', async (e) => {
  e.preventDefault();
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) await importJsonText(await file.text());
});

/* ---- Shortcuts tab ---- */

async function saveCustomKeys(nextMap) {
  await ensureStore();
  const prefs = { ...store.getPrefs() };
  const cleaned = cleanKeyMap(nextMap);
  if (Object.keys(cleaned).length) prefs.keys = cleaned;
  else delete prefs.keys;
  store.setPrefs(prefs);
  await store.flush();
}

async function renderKeys() {
  await ensureStore();
  const custom = cleanKeyMap(store.getPrefs().keys);
  const list = $('keysList');
  list.replaceChildren();

  for (const def of SHORTCUT_DEFS) {
    const spec = specFor(def.action, custom);
    const isRec = recordingAction === def.action;
    const text = isRec ? 'Press keys…' : formatBinding(spec);
    const btn = el('button', {
      type: 'button',
      class: `key-btn${isRec ? ' recording' : !spec ? ' off' : ''}`,
      text,
      title: 'Click, then press a shortcut with Shift, Alt, Ctrl or Cmd (Backspace turns it off)',
    });
    btn.addEventListener('click', () => {
      recordingAction = recordingAction === def.action ? null : def.action;
      renderKeys();
    });
    list.append(el('div', { class: 'key-row' }, el('span', { text: def.label }), btn));
  }
}

window.addEventListener('keydown', async (e) => {
  if (!recordingAction) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') {
    recordingAction = null;
    renderKeys();
    return;
  }
  const custom = cleanKeyMap(store.getPrefs().keys);
  if (e.key === 'Backspace' || e.key === 'Delete') {
    custom[recordingAction] = '';
    recordingAction = null;
    await saveCustomKeys(custom);
    renderKeys();
    return;
  }
  const spec = bindingFromEvent(e);
  if (!spec) {
    show($('keysNote'), 'Include Shift, Alt, Ctrl or Cmd so normal page keys keep working.');
    return;
  }
  // Ensure no two actions share the same custom chord.
  for (const d of SHORTCUT_DEFS) {
    if (d.action !== recordingAction && specFor(d.action, custom) === spec) custom[d.action] = '';
  }
  if (spec === SHORTCUT_DEFS.find((d) => d.action === recordingAction)?.defaultSpec) delete custom[recordingAction];
  else custom[recordingAction] = spec;
  recordingAction = null;
  show($('keysNote'), '');
  await saveCustomKeys(custom);
  renderKeys();
}, true);

$('resetKeysBtn').addEventListener('click', async () => {
  recordingAction = null;
  await saveCustomKeys({});
  show($('keysNote'), 'Restored default shortcuts.');
  renderKeys();
});

$('browserKeysBtn').addEventListener('click', () => {
  if (isFirefox) {
    show($('keysNote'), 'In Firefox, open about:addons → ⚙️ → Manage Extension Shortcuts to set window-wide shortcuts.');
  } else {
    api.tabs.create({ url: 'chrome://extensions/shortcuts' });
    if (!isStandalone) window.close();
  }
});

/* ---- Diagnostics ---- */

async function diagnostics() {
  let page = null;
  try { page = await api.tabs.sendMessage(tab.id, { type: 'loopsmith:diagnostics' }); } catch (_) { /* no Loopsmith in that page */ }
  const text = buildReport({ version: api.runtime.getManifest().version, userAgent: navigator.userAgent, host: host || protocol, page });
  const box = $('diagText');
  box.value = text;
  box.hidden = false;
  box.select();
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch (_) { /* the text is selected: Ctrl/Cmd+C works */ }
  show($('note'), copied ? 'Copied. Paste it into your bug report.' : 'Select and copy the text below.');
}

$('diag').addEventListener('click', diagnostics);

(async () => {
  [tab] = await api.tabs.query({ active: true, currentWindow: true });
  try {
    const u = new URL((tab && tab.url) || 'about:blank');
    protocol = u.protocol;
    host = u.hostname;
  } catch (_) {
    protocol = '';
    host = '';
  }
  const initialTab = params.get('tab');
  renderPermBanner();
  if (initialTab === 'saved' || initialTab === 'keys') selectTab(initialTab);
  else renderPage();
  ensureStore().then(updateSavedCount, () => {});
})();
