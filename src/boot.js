// Shared start-up for every build: picks the site adapter, loads saved loops, starts the app.

import { start } from './app.js';
import { createStore, migrateV1 } from './core/store.js';
import youtube from './adapters/youtube.js';

const ADAPTERS = [
  { match: (h) => h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtube-nocookie.com' || h.endsWith('.youtube-nocookie.com'), adapter: youtube },
];

export async function boot(backend) {
  const found = ADAPTERS.find((x) => x.match(location.hostname));
  if (!found) return;
  const adapter = found.adapter;
  if (!adapter.shouldRun()) return;
  // The marker lives in the DOM so two copies (extension + userscript) never both attach to one page.
  const root = document.documentElement;
  if (root.hasAttribute('data-ysl')) return;
  root.setAttribute('data-ysl', '');

  const store = createStore(backend);
  await store.load();
  if (adapter.legacyStoreKey) {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(adapter.legacyStoreKey)); } catch (_) { /* blocked or corrupt */ }
    migrateV1(store, raw, adapter.keyPrefix);
  }
  start(adapter, store);
}
