// Toolbar popup: shows whether Loopsmith runs on the current site and turns it on or off.
// It only asks for or gives back permissions; the background script registers the content script.

import { builtInFor } from '../sites.js';

const api = globalThis.browser || globalThis.chrome;
const ALL = '*://*/*';
const $ = (id) => document.getElementById(id);

let tab = null;
let host = '';

function show(node, text, onClick) {
  node.hidden = !text;
  node.textContent = text || '';
  node.onclick = onClick || null;
}

// Must run straight from the click: browsers only show the permission prompt for a user gesture.
// Firefox closes the popup while it asks, so nothing important happens after this here.
function allow(origins) {
  api.permissions.request({ origins }).then((ok) => { if (ok) render(); }, () => {});
}

function revoke(origins) {
  api.permissions.remove({ origins }).then(() => render({ removed: true }), () => {});
}

async function render(opts = {}) {
  const site = $('site');
  const status = $('status');
  const primary = $('primary');
  const secondary = $('secondary');
  const note = $('note');
  status.classList.remove('on');
  primary.classList.remove('quiet');
  show(secondary, '');
  show(note, '');

  if (!/^https?:$/.test(new URL(tab.url || 'about:blank').protocol)) {
    site.textContent = 'This page';
    status.textContent = 'Loopsmith can’t run on browser pages. Open a page with a video.';
    show(primary, '');
    return;
  }
  site.textContent = host;

  const builtIn = builtInFor(host);
  if (builtIn) {
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

(async () => {
  [tab] = await api.tabs.query({ active: true, currentWindow: true });
  try { host = new URL(tab.url).hostname; } catch (_) { host = ''; }
  render();
})();
