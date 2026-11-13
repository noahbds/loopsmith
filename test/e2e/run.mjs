// Browser tests on local test pages: the app runs in real Chromium against real <video>/<audio>
// playback, and every check is an assertion. No network needed.
//
//   npm run e2e
//
// Needs: `npx playwright install chromium` once, and ffmpeg (to generate the test media).

import { chromium } from 'playwright';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createReadStream, readFileSync, statSync, mkdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeMedia } from './make-media.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
makeMedia(fixtures);

// The app as a plain page script (test build: same code, localStorage instead of extension storage).
await build({ entryPoints: [join(here, 'entry.js')], bundle: true, format: 'iife', outfile: join(out, 'bundle.js'), logLevel: 'warning' });
const bundle = readFileSync(join(out, 'bundle.js'), 'utf8');
// Injected at document start, in the page world.
const inject = `(() => { const run = () => { ${bundle}\n }; if (document.documentElement) run();
  else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); run(); } }).observe(document, { childList: true }); })();`;

/* ---------- static server with Range support (seeking needs it) ---------- */

const TYPES = { '.html': 'text/html', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(fixtures, path === '/' ? 'lesson.html' : path);
  let st;
  try { st = statSync(file); } catch { res.writeHead(404).end(); return; }
  const type = TYPES[extname(file)] || 'application/octet-stream';
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const s = m[1] ? +m[1] : 0;
    const e = m[2] ? +m[2] : st.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
    createReadStream(file, { start: s, end: e }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st.size });
    createReadStream(file).pipe(res);
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

/* ---------- helpers ---------- */

const failures = [];
let current = '';
function check(ok, what, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${what}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failures.push(`${current}: ${what} (${detail})`);
}
const near = (x, y, tol = 0.6) => Math.abs(x - y) <= tol;

const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });

async function open(name, path) {
  current = name;
  console.log(`\n${name}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(inject);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(false, 'no page errors', e.message));
  await page.goto(base + path);
  await page.waitForTimeout(1200);
  return { ctx, page };
}

const L = (page, sel) => page.locator('loopsmith-root ' + sel);
const shadow = (page, fn, arg) => page.evaluate(([f, a]) => {
  const sr = document.querySelector('loopsmith-root')?.shadowRoot;
  return sr ? new Function('sr', 'a', `return (${f})(sr, a)`)(sr, a) : null;
}, [fn.toString(), arg]);

async function setField(page, sel, value) {
  await L(page, sel).fill(value);
  await L(page, sel).press('Enter');
}

async function openPanel(page, hoverAt) {
  if (hoverAt) await page.mouse.move(...hoverAt);
  await page.waitForTimeout(200);
  await L(page, '.lsm-pill').click();
  await page.waitForTimeout(200);
}

// Samples the media position; returns the positions it jumped back to (and the samples).
async function watch(page, getT, ms, every = 200) {
  const ts = [];
  const status = [];
  for (let i = 0; i < ms / every; i++) {
    await page.waitForTimeout(every);
    const s = await page.evaluate(getT);
    ts.push(s.t);
    status.push({ t: s.t, text: s.text });
  }
  const jumps = [];
  for (let i = 1; i < ts.length; i++) if (ts[i] < ts[i - 1] - 0.5) jumps.push(+ts[i].toFixed(1));
  return { ts, jumps, status };
}

const mainT = () => ({
  t: document.getElementById('main').currentTime,
  text: document.querySelector('loopsmith-root').shadowRoot.querySelector('.lsm-main span:last-child').textContent,
});

/* ---------- scenarios ---------- */

{
  const { ctx, page } = await open('Lesson page: picking the video, isolation, hotkeys, one loop, saving', '/lesson.html');
  const box = await page.evaluate(() => {
    const h = document.querySelector('loopsmith-root').getBoundingClientRect();
    const v = document.getElementById('main').getBoundingClientRect();
    return { h: [h.left, h.top, h.width, h.height].map(Math.round), v: [v.left, v.top, v.width, v.height].map(Math.round) };
  });
  check(JSON.stringify(box.h) === JSON.stringify(box.v), 'overlay sits on the main video, not the background or thumbnail', JSON.stringify(box));

  await page.keyboard.press('Shift+A');
  await page.waitForTimeout(200);
  check((await shadow(page, (sr) => sr.querySelector('.lsm-toast').textContent)) === '', 'hotkeys do nothing before the media was played');

  await page.mouse.move(640, 600);
  await page.waitForTimeout(300);
  check(await shadow(page, (sr) => sr.querySelector('.lsm-pill').classList.contains('lsm-show')), 'loop button shows on hover');

  await openPanel(page);
  const styles = await shadow(page, (sr) => ({ font: getComputedStyle(sr.querySelector('.lsm-panel')).fontFamily, border: getComputedStyle(sr.querySelector('.lsm-row')).borderTopStyle }));
  check(!/comic/i.test(styles.font) && styles.border === 'none', "the page's hostile CSS doesn't reach the panel", JSON.stringify(styles));

  await setField(page, '#lsm-time-a', '0:05');
  await setField(page, '#lsm-time-b', '0:09');
  await setField(page, '#lsm-count', '2');
  await page.evaluate(() => { const v = document.getElementById('main'); v.muted = true; v.play(); });
  await page.locator('#notes').click();
  await page.keyboard.type('Some Notes');
  check((await page.locator('#notes').inputValue()) === 'Some Notes', 'typing Shift+letters in a page field types them');
  await page.mouse.click(5, 5);
  await page.keyboard.press('Shift+S');
  const w = await watch(page, mainT, 9000);
  check(w.jumps.length === 1 && near(w.jumps[0], 5), 'Shift+S plays 0:05→0:09 twice (one jump back to 0:05)', JSON.stringify(w.jumps));
  check(w.ts[w.ts.length - 1] > 9.5, 'then playback carries on', String(w.ts[w.ts.length - 1]));
  check((await shadow(page, (sr) => sr.querySelector('.lsm-toast').textContent)) === 'Loop finished · played 2×', 'toast says the loop finished');

  await page.reload();
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const v = document.getElementById('main'); v.muted = true; v.play(); });
  await page.waitForTimeout(600);
  const saved = await shadow(page, (sr) => [sr.querySelector('#lsm-time-a').value, sr.querySelector('#lsm-time-b').value]);
  check(JSON.stringify(saved) === '["0:05","0:09"]', 'the loop is still there after a reload', JSON.stringify(saved));

  await page.evaluate(() => { document.getElementById('main').pause(); const a = document.getElementById('song'); a.scrollIntoView(); a.play(); });
  await page.waitForTimeout(1500);
  const dock = await page.evaluate(() => ({ dock: document.querySelector('loopsmith-root').classList.contains('lsm-dock'), b: document.querySelector('loopsmith-root').shadowRoot.querySelector('#lsm-time-b').value }));
  check(dock.dock && dock.b === '0:40', 'playing the audio docks the panel bottom-right, on the audio', JSON.stringify(dock));
  await ctx.close();
}

{
  const { ctx, page } = await open('Scrolled video: the button stays visible', '/lesson.html');
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(400);
  await page.mouse.move(640, 200);
  await page.waitForTimeout(400);
  const top = await shadow(page, (sr) => Math.round(sr.querySelector('.lsm-pill').getBoundingClientRect().top));
  check(top >= 0 && top <= 20, 'button is inside the window, at the top of the visible part', String(top));
  await ctx.close();
}

// Overlapping loops (reported bug): loop 1 0:05→0:15 ×2, loop 2 0:12→0:20 ×3.
for (const mode of ['next', 'continue']) {
  const { ctx, page } = await open(`Overlapping loops, "${mode === 'next' ? 'Next loop' : 'Play on'}"`, '/overlap.html');
  await page.evaluate(() => { const v = document.getElementById('main'); v.play(); });
  await openPanel(page, [640, 300]);
  await setField(page, '#lsm-time-a', '0:05');
  await setField(page, '#lsm-time-b', '0:15');
  await setField(page, '#lsm-count', '2');
  await L(page, '.lsm-add').click();
  await setField(page, '#lsm-time-a', '0:12');
  await setField(page, '#lsm-time-b', '0:20');
  await setField(page, '#lsm-count', '3');
  await L(page, `.lsm-seg button[data-v="${mode}"]`).click();
  await L(page, '.lsm-chip').first().click();
  await page.evaluate(() => { document.getElementById('main').playbackRate = 2; });
  await L(page, '.lsm-start').click();
  const w = await watch(page, mainT, 23000);
  // Next loop: 0:15→0:05, then a jump to loop 2's start, then two repeats of it.
  // Play on: 0:15→0:05, then playback runs on into loop 2, which repeats twice from 0:12.
  const want = mode === 'next' ? [5, 12, 12, 12] : [5, 12, 12];
  check(w.jumps.length === want.length && w.jumps.every((j, i) => near(j, want[i])), `jumps back to ${want.join(', ')}`, JSON.stringify(w.jumps));
  const firstLoop2 = w.status.findIndex((s) => /Loop 2/.test(s.text));
  const loop1Done = w.ts.findIndex((t, i) => i > 0 && near(t, 12, 1) && w.ts[i - 1] > 14); // first jump to 0:12 (Next loop)
  if (mode === 'next') check(firstLoop2 >= loop1Done - 1, 'status says "Loop 1" until loop 1 is finished', `first "Loop 2" at sample ${firstLoop2}, loop 1 done at ${loop1Done}`);
  else check(!w.status.some((s, i) => /Loop 2/.test(s.text) && s.t < 15 && w.status.slice(i).some((x) => /Loop 1/.test(x.text))), 'status never says "Loop 2" while loop 1 still has plays left');
  if (mode === 'next') check(await page.evaluate(() => document.getElementById('main').paused), '"Next loop" pauses after the last loop');
  await ctx.close();
}

{
  const { ctx, page } = await open('A loop inside another', '/overlap.html');
  await page.evaluate(() => document.getElementById('main').play());
  await openPanel(page, [640, 300]);
  await setField(page, '#lsm-time-a', '0:02');
  await setField(page, '#lsm-time-b', '0:14');
  await setField(page, '#lsm-count', '2');
  await L(page, '.lsm-add').click();
  await setField(page, '#lsm-time-a', '0:06');
  await setField(page, '#lsm-time-b', '0:09');
  await setField(page, '#lsm-count', '2');
  await L(page, '.lsm-chip').first().click();
  await page.evaluate(() => { document.getElementById('main').playbackRate = 2; });
  await L(page, '.lsm-start').click();
  const w = await watch(page, mainT, 13000);
  check(w.jumps.length === 2 && near(w.jumps[0], 6) && near(w.jumps[1], 2), 'inner loop twice, then the outer one again', JSON.stringify(w.jumps));
  await ctx.close();
}

{
  const { ctx, page } = await open('Player inside shadow DOM', '/shadow.html');
  await page.evaluate(() => document.querySelector('fancy-player').shadowRoot.querySelector('video').play());
  await page.waitForTimeout(800);
  await openPanel(page, [640, 400]);
  check(await shadow(page, (sr) => sr.querySelector('.lsm-panel').classList.contains('lsm-open')), 'found the video inside the shadow root');
  await setField(page, '#lsm-time-a', '0:05');
  await setField(page, '#lsm-time-b', '0:08');
  await setField(page, '#lsm-count', '2');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await page.keyboard.press('Shift+S');
  const w = await watch(page, () => ({ t: document.querySelector('fancy-player').shadowRoot.querySelector('video').currentTime, text: '' }), 7000);
  check(w.jumps.length === 1 && near(w.jumps[0], 5), 'Shift+S works there and the loop plays twice', JSON.stringify(w.jumps));
  await ctx.close();
}

for (const kind of ['range', 'aria', 'named', 'named&visover']) {
  const label = { range: '<input type=range>', aria: 'ARIA slider in ms', named: 'class name only', 'named&visover': 'hidden container, visible bar' }[kind];
  const { ctx, page } = await open(`Custom player (${label}): markers on its own bar`, `/custom.html?kind=${kind}`);
  await page.evaluate(() => document.getElementById('main').play());
  await openPanel(page, [640, 300]);
  await setField(page, '#lsm-time-a', '0:20');
  await setField(page, '#lsm-time-b', '0:30');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await page.waitForTimeout(2600); // the bar is looked up again every 2 s
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(300);
  const pos = await page.evaluate(() => {
    const b = document.getElementById('bar').getBoundingClientRect();
    const m = document.querySelector('loopsmith-root').shadowRoot.querySelector('.lsm-marks');
    const r = m.getBoundingClientRect();
    return { bar: [Math.round(b.left), Math.round(b.top + b.height / 2), Math.round(b.width)], marks: [Math.round(r.left), Math.round(r.top), Math.round(r.width)], hidden: m.hidden };
  });
  check(!pos.hidden && near(pos.marks[0], pos.bar[0], 2) && near(pos.marks[1], pos.bar[1], 4) && near(pos.marks[2], pos.bar[2], 2),
    'markers lie on the bar (not the volume slider, not the video edge)', JSON.stringify(pos));
  await page.evaluate(() => document.getElementById('controls').classList.add('hidden'));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(300);
  check(await shadow(page, (sr) => sr.querySelector('.lsm-marks').hidden), 'markers hide when the player hides its controls');
  await page.evaluate(() => document.getElementById('controls').classList.remove('hidden'));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(300);
  check(!(await shadow(page, (sr) => sr.querySelector('.lsm-marks').hidden)), 'and come back with them');
  await ctx.close();
}

{
  const { ctx, page } = await open('Native controls only: markers along the bottom of the video', '/overlap.html');
  await page.evaluate(() => document.getElementById('main').play());
  await openPanel(page, [640, 300]);
  await setField(page, '#lsm-time-a', '0:20');
  await setField(page, '#lsm-time-b', '0:30');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const pos = await page.evaluate(() => {
    const v = document.getElementById('main').getBoundingClientRect();
    const r = document.querySelector('loopsmith-root').shadowRoot.querySelector('.lsm-marks').getBoundingClientRect();
    return { videoBottom: Math.round(v.bottom), marksTop: Math.round(r.top) };
  });
  check(near(pos.marksTop, pos.videoBottom - 4, 3), 'no bar to find: markers on the bottom edge', JSON.stringify(pos));
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} failed:\n- ${failures.join('\n- ')}` : '\nAll browser checks passed.');
process.exit(failures.length ? 1 : 0);
