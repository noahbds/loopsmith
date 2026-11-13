// Builds every target from src/:
//   dist/firefox/          Firefox extension (MV2)        + dist/loopsmith-firefox.xpi
//   dist/chrome/           Chrome / Edge / Brave (MV3)    + dist/loopsmith-chrome.zip
//   dist/loopsmith.user.js Tampermonkey / Violentmonkey
//
// Usage: npm run build

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const dist = join(root, 'dist');

const NAME = 'Loopsmith: A-B Loop for Any Video';
const DESCRIPTION = 'Repeat one or several sections of a video a chosen number of times. Drag the handles, type a timestamp, or grab the current time.';
const GECKO_ID = 'loopsmith@noahbds';

// Sites the content script runs on. Grows with each adapter.
const MATCHES = ['*://www.youtube.com/*'];
const PAGE_WORLD = [{ matches: ['*://www.youtube.com/*'], js: 'page-youtube.js', src: 'src/page/youtube.js' }];

const common = { bundle: true, format: 'iife', charset: 'utf8', legalComments: 'none', logLevel: 'warning' };

async function bundle(entry, outfile, extra = {}) {
  await build({ ...common, entryPoints: [join(root, entry)], outfile, ...extra });
}

const json = (file, obj) => writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');

function zip(dir, out) {
  rmSync(out, { force: true });
  execFileSync('zip', ['-qr', '-X', out, '.'], { cwd: dir });
}

async function firefox() {
  const out = join(dist, 'firefox');
  mkdirSync(out, { recursive: true });
  await bundle('src/entries/content.js', join(out, 'content.js'), { target: 'firefox109' });
  cpSync(join(root, 'assets/icon.svg'), join(out, 'icon.svg'));
  json(join(out, 'manifest.json'), {
    manifest_version: 2,
    name: NAME,
    short_name: 'Loopsmith',
    version: pkg.version,
    description: DESCRIPTION,
    icons: { 48: 'icon.svg', 96: 'icon.svg' },
    permissions: ['storage'],
    // No page-world script here: Firefox content scripts reach page objects through wrappedJSObject.
    content_scripts: [{ matches: MATCHES, js: ['content.js'], run_at: 'document_idle', all_frames: true }],
    browser_specific_settings: {
      gecko: { id: GECKO_ID, strict_min_version: '109.0', data_collection_permissions: { required: ['none'] } },
    },
  });
  zip(out, join(dist, 'loopsmith-firefox.xpi'));
}

async function chrome() {
  const out = join(dist, 'chrome');
  mkdirSync(out, { recursive: true });
  await bundle('src/entries/content.js', join(out, 'content.js'), { target: 'chrome111' });
  for (const p of PAGE_WORLD) await bundle(p.src, join(out, p.js), { target: 'chrome111' });
  const icons = {};
  for (const s of [16, 32, 48, 128]) {
    cpSync(join(root, `assets/icon-${s}.png`), join(out, `icon-${s}.png`));
    icons[s] = `icon-${s}.png`;
  }
  json(join(out, 'manifest.json'), {
    manifest_version: 3,
    name: NAME,
    short_name: 'Loopsmith',
    version: pkg.version,
    description: DESCRIPTION,
    icons,
    permissions: ['storage'],
    minimum_chrome_version: '111',
    content_scripts: [
      ...PAGE_WORLD.map((p) => ({ matches: p.matches, js: [p.js], run_at: 'document_start', all_frames: true, world: 'MAIN' })),
      { matches: MATCHES, js: ['content.js'], run_at: 'document_idle', all_frames: true },
    ],
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
    ...MATCHES.map((m) => `// @match        ${m.replace('*://', 'https://')}`),
    '// @run-at       document-idle',
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
