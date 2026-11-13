// Builds every target from src/:
//   dist/firefox/          Firefox extension (MV3, 128+)  + dist/loopsmith-firefox.xpi
//   dist/chrome/           Chrome / Edge / Brave (MV3)    + dist/loopsmith-chrome.zip
//   dist/loopsmith.user.js Tampermonkey / Violentmonkey
//
// Usage: npm run build

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILT_IN } from '../src/sites.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const dist = join(root, 'dist');

const NAME = 'Loopsmith: A-B Loop for Any Video';
const DESCRIPTION = 'Repeat one or several sections of a video a chosen number of times. Drag the handles, type a timestamp, or grab the current time.';
const GECKO_ID = 'loopsmith@noahbds';

// Sites with a dedicated adapter run out of the box; every other site is opt-in from the popup
// (optional host permissions + a content script the background registers).
const MATCHES = BUILT_IN.flatMap((s) => s.matches);
const PAGE_WORLD = BUILT_IN.filter((s) => s.pageWorld).map((s) => ({
  matches: s.matches, src: s.pageWorld, js: s.pageWorld.map((f) => 'page-' + f.split('/').pop()),
}));
const PAGE_SOURCES = [...new Set(BUILT_IN.flatMap((s) => s.pageWorld || []))];

const common = { bundle: true, format: 'iife', charset: 'utf8', legalComments: 'none', logLevel: 'warning' };

async function bundle(entry, outfile, extra = {}) {
  await build({ ...common, entryPoints: [join(root, entry)], outfile, ...extra });
}

const json = (file, obj) => writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');

function zip(dir, out) {
  rmSync(out, { force: true });
  execFileSync('zip', ['-qr', '-X', out, '.'], { cwd: dir });
}

// The parts both extension builds share.
async function extension(out, target) {
  mkdirSync(out, { recursive: true });
  await bundle('src/entries/content.js', join(out, 'content.js'), { target });
  await bundle('src/background.js', join(out, 'background.js'), { target });
  await bundle('src/popup/popup.js', join(out, 'popup.js'), { target });
  for (const src of PAGE_SOURCES) await bundle(src, join(out, 'page-' + src.split('/').pop()), { target });
  for (const f of ['popup.html', 'popup.css']) cpSync(join(root, 'src/popup', f), join(out, f));
  cpSync(join(root, 'assets/icon.svg'), join(out, 'icon.svg'));
  return {
    manifest_version: 3,
    name: NAME,
    short_name: 'Loopsmith',
    version: pkg.version,
    description: DESCRIPTION,
    permissions: ['storage', 'scripting', 'activeTab'],
    optional_host_permissions: ['*://*/*'],
    action: { default_title: 'Loopsmith', default_popup: 'popup.html' },
    content_scripts: [
      ...PAGE_WORLD.map((p) => ({ matches: p.matches, js: p.js, run_at: 'document_start', all_frames: true, world: 'MAIN' })),
      { matches: MATCHES, js: ['content.js'], run_at: 'document_idle', all_frames: true },
    ],
  };
}

async function firefox() {
  const out = join(dist, 'firefox');
  const manifest = await extension(out, 'firefox128');
  json(join(out, 'manifest.json'), {
    ...manifest,
    icons: { 48: 'icon.svg', 96: 'icon.svg' },
    action: { ...manifest.action, default_icon: 'icon.svg' },
    background: { scripts: ['background.js'] },
    browser_specific_settings: {
      gecko: { id: GECKO_ID, strict_min_version: '128.0', data_collection_permissions: { required: ['none'] } },
    },
  });
  zip(out, join(dist, 'loopsmith-firefox.xpi'));
}

async function chrome() {
  const out = join(dist, 'chrome');
  const manifest = await extension(out, 'chrome111');
  const icons = {};
  for (const size of [16, 32, 48, 128]) {
    cpSync(join(root, `assets/icon-${size}.png`), join(out, `icon-${size}.png`));
    icons[size] = `icon-${size}.png`;
  }
  json(join(out, 'manifest.json'), {
    ...manifest,
    icons,
    action: { ...manifest.action, default_icon: icons },
    background: { service_worker: 'background.js' },
    minimum_chrome_version: '111',
  });
  zip(out, join(dist, 'loopsmith-chrome.zip'));
}

async function userscript() {
  const header = [
    '// ==UserScript==',
    '// @name         Loopsmith (A-B loop)',
    '// @namespace    loopsmith',
    `// @version      ${pkg.version}`,
    `// @description  ${DESCRIPTION}`,
    // Every site: the generic adapter stays idle on pages without media. Narrow it with your
    // userscript manager's own include/exclude settings if you prefer.
    '// @match        *://*/*',
    '// @run-at       document-start',
    '// @grant        GM_getValue',
    '// @grant        GM_setValue',
    '// @grant        GM_deleteValue',
    '// @grant        GM_listValues',
    '// ==/UserScript==',
    '',
    '// Built from https://github.com/noahbds/youtube-section-loop (src/). Edit the sources, not this file.',
    '',
  ].join('\n');
  await bundle('src/entries/userscript.js', join(dist, 'loopsmith.user.js'), { target: 'es2020', banner: { js: header } });
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
await Promise.all([firefox(), chrome(), userscript()]);
console.log(`Built Loopsmith ${pkg.version} into dist/`);
