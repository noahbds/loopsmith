import { beforeAll, describe, expect, it } from 'vitest';
import { BUILT_IN_MATCHES } from '../src/sites.js';

// A fake extension API: enough of permissions / scripting / tabs for the background script.
const granted = new Set(BUILT_IN_MATCHES);
let registered = [];
const injected = [];
const listeners = {};
const on = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });

globalThis.chrome = {
  permissions: {
    getAll: async () => ({ origins: [...granted], permissions: ['storage'] }),
    onAdded: on('added'),
    onRemoved: on('removed'),
  },
  runtime: { onInstalled: on('installed'), onStartup: on('startup') },
  scripting: {
    getRegisteredContentScripts: async ({ ids }) => registered.filter((r) => ids.includes(r.id)),
    registerContentScripts: async (specs) => { registered.push(...specs); },
    updateContentScripts: async (specs) => { registered = registered.map((r) => specs.find((s) => s.id === r.id) || r); },
    unregisterContentScripts: async ({ ids }) => { registered = registered.filter((r) => !ids.includes(r.id)); },
    executeScript: async ({ target }) => { injected.push(target.tabId); },
  },
  tabs: { query: async ({ url }) => (url.includes('*://example.com/*') ? [{ id: 7 }] : []) },
};

beforeAll(async () => {
  await import('../src/background.js');
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('background: content script follows the granted sites', () => {
  it('registers nothing for the built-in sites alone', async () => {
    await listeners.installed();
    await flush();
    expect(registered).toEqual([]);
  });

  it('registers and injects when a site is allowed', async () => {
    granted.add('*://example.com/*');
    await listeners.added({ origins: ['*://example.com/*'] });
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({
      id: 'loopsmith-sites', matches: ['*://example.com/*'], excludeMatches: BUILT_IN_MATCHES, js: ['content.js'], allFrames: true,
    });
    expect(injected).toEqual([7]);
  });

  it('updates the same registration for more sites', async () => {
    granted.add('*://*/*');
    await listeners.added({ origins: ['*://*/*'] });
    expect(registered).toHaveLength(1);
    expect(registered[0].matches).toEqual(['*://example.com/*', '*://*/*']);
  });

  it('unregisters when every site is removed again', async () => {
    granted.delete('*://example.com/*');
    granted.delete('*://*/*');
    listeners.removed({ origins: [] });
    await flush();
    await flush();
    expect(registered).toEqual([]);
  });
});
