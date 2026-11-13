// Shared start-up for every build: picks the site adapter, loads saved loops, starts the app.

import { start } from './app.js';
import { createStore, migrateV1 } from './core/store.js';
import { allMedia, PLAY_EVENT } from './core/deepmedia.js';
import { builtInFor } from './sites.js';
import youtube from './adapters/youtube.js';
import ytmusic from './adapters/ytmusic.js';
import soundcloud from './adapters/soundcloud.js';
import spotify from './adapters/spotify.js';
import bandcamp from './adapters/bandcamp.js';
import { vimeo, twitch, bilibili, dailymotion } from './adapters/video-sites.js';
import generic from './adapters/generic.js';

const ADAPTERS = { youtube, ytmusic, soundcloud, spotify, bandcamp, vimeo, twitch, bilibili, dailymotion, generic };

// Dedicated adapters by hostname; anything else gets the generic one.
function adapterFor(hostname) {
  if (/(^|\.)youtube-nocookie\.com$/.test(hostname)) return youtube;
  const site = builtInFor(hostname);
  return (site && ADAPTERS[site.adapter]) || generic;
}

export async function boot(backend) {
  const adapter = adapterFor(location.hostname);
  if (!adapter.shouldRun()) return;
  // The marker lives in the DOM so the script never attaches twice to one page (it can be injected
  // both by the manifest and when a site is turned on in an open tab).
  const root = document.documentElement;
  // Pages that still hold a copy from before 1.3 (it marked itself `data-ysl`) are left alone.
  if (root.hasAttribute('data-lsm') || root.hasAttribute('data-ysl')) return;
  root.setAttribute('data-lsm', '');

  // Most pages never have media: on those, wait quietly instead of starting anything.
  // (Music sites start right away: their loop button shows before anything plays.)
  if (adapter.floating && !adapter.dockOnly && !allMedia().length) await firstMedia();

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
    const events = ['loadstart', 'loadedmetadata', 'play', PLAY_EVENT];
    const seen = (e) => {
      if (e.type !== PLAY_EVENT && !(e.target instanceof HTMLMediaElement)) return;
      for (const t of events) document.removeEventListener(t, seen, true);
      resolve();
    };
    for (const t of events) document.addEventListener(t, seen, true);
  });
}
