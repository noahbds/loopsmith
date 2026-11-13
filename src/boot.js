// Shared start-up for every build: picks the site adapter, loads saved loops, starts the app.

import { start } from './app.js';
import { createStore, migrateV1 } from './core/store.js';
import youtube from './adapters/youtube.js';
import generic from './adapters/generic.js';

// Dedicated adapters by hostname; anything else gets the generic one.
function adapterFor(hostname) {
  if (/(^|\.)youtube\.com$/.test(hostname) || /(^|\.)youtube-nocookie\.com$/.test(hostname)) return youtube;
  return generic;
}

export async function boot(backend) {
  const adapter = adapterFor(location.hostname);
  if (!adapter.shouldRun()) return;
  // The marker lives in the DOM so two copies (extension + userscript) never both attach to one page.
  const root = document.documentElement;
  if (root.hasAttribute('data-ysl')) return;
  root.setAttribute('data-ysl', '');

  // Most pages never have media: on those, wait quietly instead of starting anything.
  if (adapter.floating && !document.querySelector('video, audio')) await firstMedia();

  const store = createStore(backend);
  await store.load();
  if (adapter.legacyStoreKey) {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(adapter.legacyStoreKey)); } catch (_) { /* blocked or corrupt */ }
    migrateV1(store, raw, adapter.keyPrefix);
  }
  start(adapter, store);
}

function firstMedia() {
  return new Promise((resolve) => {
    const events = ['loadstart', 'loadedmetadata', 'play'];
    const seen = (e) => {
      if (!(e.target instanceof HTMLMediaElement)) return;
      for (const t of events) document.removeEventListener(t, seen, true);
      resolve();
    };
    for (const t of events) document.addEventListener(t, seen, true);
  });
}
