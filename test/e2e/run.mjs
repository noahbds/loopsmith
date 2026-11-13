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
  text: document.querySelector('loopsmith-root').shadowRoot.querySelector('.lsm-status-text').textContent,
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
  check((await shadow(page, (sr) => sr.querySelector('.lsm-toast span').textContent)) === 'Loop finished · played 2×', 'toast says the loop finished');

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

// Skipping and going back: loop 1 0:05→0:10 ×5, loop 2 0:20→0:25 ×2.
{
  const { ctx, page } = await open('Skip, previous, restart and go-to', '/overlap.html');
  await page.evaluate(() => document.getElementById('main').play());
  await openPanel(page, [640, 300]);
  await setField(page, '#lsm-time-a', '0:05');
  await setField(page, '#lsm-time-b', '0:10');
  await setField(page, '#lsm-count', '5');
  await L(page, '.lsm-add').click();
  await setField(page, '#lsm-time-a', '0:20');
  await setField(page, '#lsm-time-b', '0:25');
  await setField(page, '#lsm-count', '2');
  await L(page, '.lsm-chip-main').first().click();
  await L(page, '.lsm-start').click();
  const t = () => page.evaluate(() => document.getElementById('main').currentTime);
  const status = () => shadow(page, (sr) => sr.querySelector('.lsm-status-text').textContent);
  await page.waitForTimeout(1500);
  check(near(await t(), 6.5, 1.2), 'playing loop 1 from 0:05', String(await t()));

  await page.keyboard.press('Shift+BracketRight');
  await page.waitForTimeout(500);
  check(near(await t(), 20.5, 1), 'Shift+] skips to loop 2 at 0:20', String(await t()));
  check(/Loop 2/.test(await status()), 'the status says loop 2', await status());

  await page.keyboard.press('Shift+BracketLeft');
  await page.waitForTimeout(500);
  check(near(await t(), 5.5, 1), 'Shift+[ early in the repetition goes back to loop 1', String(await t()));

  await page.waitForTimeout(3000); // well into the repetition (> 2 s)
  await page.keyboard.press('Shift+BracketLeft');
  await page.waitForTimeout(400);
  check(near(await t(), 5.4, 1), 'Shift+[ later in a repetition restarts it', String(await t()));

  await page.waitForTimeout(1500);
  await page.keyboard.press('Shift+Backslash');
  await page.waitForTimeout(400);
  const rep = await shadow(page, (sr) => sr.querySelector('.lsm-chip-main span').textContent);
  check(/^2\/5$/.test(rep), 'Shift+\\ skips a repetition: it counts as played', rep);

  await page.keyboard.press('Shift+Digit2');
  await page.waitForTimeout(500);
  check(near(await t(), 20.5, 1), 'Shift+2 goes to loop 2', String(await t()));

  await page.keyboard.press('Shift+BracketRight'); // loop 2 is the last one: nothing left
  await page.waitForTimeout(500);
  check(/Loops? finished/.test(await shadow(page, (sr) => sr.querySelector('.lsm-toast span').textContent)), 'skipping the last loop finishes the run');
  const again = L(page, '.lsm-toast-btn');
  check((await again.textContent()) === 'Run again', 'the finished toast offers Run again');
  await again.click();
  await page.waitForTimeout(500);
  check(near(await t(), 5.5, 1), 'Run again starts from the first loop', String(await t()));
  check(await shadow(page, (sr) => sr.querySelector('.lsm-main').classList.contains('lsm-on')), 'and looping is on');
  await ctx.close();
}

// The strip while looping with the editor closed, and dragging the panel.
{
  const { ctx, page } = await open('Strip and moving the panel', '/overlap.html');
  await page.evaluate(() => document.getElementById('main').play());
  await openPanel(page, [640, 300]);
  await setField(page, '#lsm-time-a', '0:05');
  await setField(page, '#lsm-time-b', '0:10');
  await L(page, '.lsm-start').click();
  const strip = () => shadow(page, (sr) => sr.querySelector('.lsm-strip').classList.contains('lsm-open'));
  check(!(await strip()), 'no strip while the editor is open');
  await L(page, '.lsm-head [aria-label="Close"]').click(); // close the editor
  await page.waitForTimeout(500);
  check(await strip(), 'the strip shows while looping with the editor closed');
  check(/Rep/.test(await shadow(page, (sr) => sr.querySelector('.lsm-strip-text').textContent)), 'it says which repetition is playing');
  await L(page, '.lsm-strip .lsm-sb:last-of-type').click(); // open the editor
  await page.waitForTimeout(300);
  check(!(await strip()), 'opening the editor hides the strip');
  const rect = () => shadow(page, (sr) => { const r = sr.querySelector('.lsm-panel').getBoundingClientRect(); return { l: r.left, t: r.bottom }; });
  const before = await rect();
  const g = await L(page, '.lsm-panel .lsm-grip').boundingBox();
  await page.mouse.move(g.x + 6, g.y + 10);
  await page.mouse.down();
  await page.mouse.move(g.x - 114, g.y - 50, { steps: 6 });
  await page.mouse.up();
  const after = await rect();
  check(near(before.l - after.l, 120, 4) && near(before.t - after.t, 60, 4), 'dragging the grip moves the panel', JSON.stringify({ before, after }));
  await page.reload();
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.getElementById('main').play());
  await openPanel(page, [640, 300]);
  const again = await rect();
  check(near(again.l, after.l, 4) && near(again.t, after.t, 4), 'the position is remembered after a reload', JSON.stringify({ after, again }));
  await L(page, '.lsm-panel .lsm-grip').dblclick();
  const reset = await rect();
  check(near(reset.l, before.l, 4) && near(reset.t, before.t, 4), 'double-clicking the grip puts it back', JSON.stringify({ before, reset }));
  await ctx.close();
}

// Play all loops again: loop 1 0:05→0:08 ×1 and loop 2 0:10→0:12 ×1, two rounds.
{
  const { ctx, page } = await open('Play all loops again', '/overlap.html');
  await page.evaluate(() => document.getElementById('main').play());
  await openPanel(page, [640, 300]);
  await setField(page, '#lsm-time-a', '0:05');
  await setField(page, '#lsm-time-b', '0:08');
  await setField(page, '#lsm-count', '1');
  await L(page, '.lsm-add').click();
  await setField(page, '#lsm-time-a', '0:10');
  await setField(page, '#lsm-time-b', '0:12');
  await setField(page, '#lsm-count', '1');
  const val = () => shadow(page, (sr) => sr.querySelector('.lsm-rounds .lsm-val').textContent);
  check((await val()) === '1×', 'plays the set once by default');
  await L(page, '[aria-label="More rounds"]').click();
  check((await val()) === '2×', 'the + button asks for two rounds', await val());
  await L(page, '.lsm-chip-main').first().click();
  await page.evaluate(() => { document.getElementById('main').playbackRate = 2; });
  await L(page, '.lsm-start').click();
  const w = await watch(page, mainT, 9000);
  // round 1 ends after loop 2 (0:12) and goes back to 0:05; round 2 ends and playback carries on
  check(w.jumps.length === 1 && near(w.jumps[0], 5, 1), 'after the last loop it goes back to the first loop, once', JSON.stringify(w.jumps));
  check(w.status.some((x) => /round 2\/2/.test(x.text)), 'the status shows the round', JSON.stringify(w.status.slice(-3)));
  check(!(await shadow(page, (sr) => sr.querySelector('.lsm-main').classList.contains('lsm-on'))), 'looping is off after the last round');
  await page.reload();
  await page.waitForTimeout(1200);
  await openPanel(page, [640, 300]);
  check((await val()) === '2×', 'the number of rounds is remembered');
  await L(page, '.lsm-rounds .lsm-inf').click();
  check((await val()) === '∞', 'the ∞ button plays them again and again');
  await ctx.close();
}

// Names, and numbering the loops by start time.
{
  const { ctx, page } = await open('Loop names and order', '/overlap.html');
  await page.evaluate(() => document.getElementById('main').play());
  await openPanel(page, [640, 300]);
  await setField(page, '#lsm-time-a', '0:30');
  await setField(page, '#lsm-time-b', '0:35');
  await L(page, '.lsm-add').click();
  await setField(page, '#lsm-time-a', '0:10');
  await setField(page, '#lsm-time-b', '0:15');
  await L(page, '.lsm-chip-main').nth(1).dblclick();
  await L(page, '.lsm-rename').fill('Intro riff');
  await L(page, '.lsm-rename').press('Enter');
  const names = () => shadow(page, (sr) => [...sr.querySelectorAll('.lsm-chip')].map((c) => c.querySelector('b').textContent + ':' + c.querySelector('.lsm-name').textContent));
  check(JSON.stringify(await names()) === '["1:","2:Intro riff"]', 'double-click names a loop', JSON.stringify(await names()));
  await L(page, '.lsm-more').click();
  await L(page, '.lsm-mi').filter({ hasText: 'Number loops by start time' }).click();
  check(JSON.stringify(await names()) === '["1:Intro riff","2:"]', 'numbering by start time puts the earlier loop first', JSON.stringify(await names()));
  check((await L(page, '#lsm-time-a').inputValue()) === '0:10', 'the selected loop stays selected');
  await L(page, '.lsm-toast-btn').click();
  check(JSON.stringify(await names()) === '["1:","2:Intro riff"]', 'and that can be undone', JSON.stringify(await names()));
  await page.reload();
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.getElementById('main').play());
  await openPanel(page, [640, 300]);
  check(JSON.stringify(await names()) === '["1:","2:Intro riff"]', 'the name is saved', JSON.stringify(await names()));
  await L(page, '.lsm-chip-main').nth(1).click();
  await L(page, '.lsm-more').click();
  await L(page, '.lsm-mi').filter({ hasText: 'Rename loop' }).click();
  await L(page, '.lsm-rename').fill('');
  await L(page, '.lsm-rename').press('Enter');
  check(JSON.stringify(await names()) === '["1:","2:"]', 'an empty name removes it', JSON.stringify(await names()));
  await ctx.close();
}

// The slider: drag the bar to move the whole loop; a stray click moves nothing. Fine timing.
{
  const { ctx, page } = await open('Slider bar and fine timing', '/overlap.html');
  await page.evaluate(() => document.getElementById('main').play());
  await openPanel(page, [640, 300]);
  await setField(page, '#lsm-time-a', '0:10');
  await setField(page, '#lsm-time-b', '0:20');
  const ab = async () => [await L(page, '#lsm-time-a').inputValue(), await L(page, '#lsm-time-b').inputValue()];
  const fill = await L(page, '.lsm-fill').boundingBox();
  await page.mouse.click(fill.x + fill.width + 90, fill.y + fill.height / 2);
  check(JSON.stringify(await ab()) === '["0:10","0:20"]', 'clicking far from the loop moves nothing', JSON.stringify(await ab()));
  await page.mouse.move(fill.x + fill.width / 2, fill.y + fill.height / 2);
  await page.mouse.down();
  await page.mouse.move(fill.x + fill.width / 2 + 60, fill.y + fill.height / 2, { steps: 6 });
  await page.mouse.up();
  const [a, b] = await ab();
  const secs = (t) => t.split(':').reduce((x, y) => x * 60 + Number(y), 0);
  check(secs(a) > 15 && near(secs(b) - secs(a), 10, 0.2), 'dragging the bar moves both ends and keeps the length', JSON.stringify([a, b]));

  await L(page, '.lsm-more').click();
  await L(page, '.lsm-mi').filter({ hasText: 'hundredths' }).click();
  await setField(page, '#lsm-time-a', '0:05.25');
  check((await L(page, '#lsm-time-a').inputValue()) === '0:05.25', 'fine timing keeps hundredths', await L(page, '#lsm-time-a').inputValue());
  await setField(page, '#lsm-time-b', '0:05.6');
  check((await L(page, '#lsm-time-b').inputValue()) === '0:05.6', 'and allows a 0.35 s loop', await L(page, '#lsm-time-b').inputValue());
  await page.reload();
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.getElementById('main').play());
  await openPanel(page, [640, 300]);
  check((await L(page, '#lsm-time-a').inputValue()) === '0:05.25', 'the hundredths are saved and the mode is remembered', await L(page, '#lsm-time-a').inputValue());
  await ctx.close();
}

// Keyboard use of the chip row, and the first-run tip.
{
  const { ctx, page } = await open('Chips by keyboard, first-run tip', '/overlap.html');
  await page.evaluate(() => document.getElementById('main').play());
  await openPanel(page, [640, 300]);
  check(await L(page, '.lsm-hint').isVisible(), 'the tip shows the first time');
  await L(page, '.lsm-add').click();
  const stops = () => shadow(page, (sr) => [...sr.querySelectorAll('.lsm-chips button')].filter((b) => b.tabIndex === 0).length);
  check((await stops()) === 1, 'the chip row is a single Tab stop', String(await stops()));
  await L(page, '.lsm-chip-main').first().focus();
  await page.keyboard.press('ArrowRight');
  const active = () => shadow(page, (sr) => sr.activeElement && sr.activeElement.className);
  check(/lsm-dot/.test(await active()), 'the arrow keys move along the row', await active());
  await page.keyboard.press('End');
  check(/lsm-add/.test(await active()), 'End goes to the last button', await active());
  await page.keyboard.press('Home');
  check(/lsm-dot/.test(await active()), 'Home goes to the first', await active());
  await L(page, '.lsm-hint-btn').click();
  check(!(await L(page, '.lsm-hint').isVisible()), 'Got it hides the tip');
  await page.reload();
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.getElementById('main').play());
  await openPanel(page, [640, 300]);
  check(!(await L(page, '.lsm-hint').isVisible()), 'and it stays hidden');
  await ctx.close();
}

// Placing loops next to each other, zooming, and tapping marks.
{
  const { ctx, page } = await open('Chaining, zoom and tapping', '/overlap.html');
  await page.evaluate(() => document.getElementById('main').play());
  await openPanel(page, [640, 300]);
  await L(page, '.lsm-hint-btn').click();
  await setField(page, '#lsm-time-a', '0:10');
  await setField(page, '#lsm-time-b', '0:20');
  await L(page, '.lsm-add').click();
  await setField(page, '#lsm-time-a', '0:30');
  await setField(page, '#lsm-time-b', '0:40');
  const a = () => L(page, '#lsm-time-a').inputValue();
  const b = () => L(page, '#lsm-time-b').inputValue();
  const chain = L(page, '.lsm-chain').first();
  check((await chain.textContent()).includes('Start after Loop 1'), 'a button offers to start right after the previous loop', await chain.textContent());
  await chain.click();
  check((await a()) === '0:20', 'it puts the start at the previous loop\'s end', await a());
  check(!(await L(page, '.lsm-chain').first().isVisible().catch(() => false)), 'and the button goes away once joined');

  await L(page, '.lsm-add').click({ modifiers: ['Shift'] });
  check((await a()) === '0:40' && (await b()) === '1:00', 'Shift+add makes a loop right after the selected one', JSON.stringify([await a(), await b()]));

  // zoom with the wheel around the pointer, move with Shift+wheel, reset by double-click
  const scale = () => shadow(page, (sr) => [...sr.querySelectorAll('.lsm-scale > span:not(.lsm-mid)')].map((x) => x.textContent).join('-'));
  const track = await L(page, '.lsm-track').boundingBox();
  await page.mouse.move(track.x + track.width / 2, track.y + 15);
  check((await scale()) === '0:00-1:00', 'starts on the whole video', await scale());
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(150);
  const zoomed = await scale();
  check(zoomed !== '0:00-1:00' && await L(page, '.lsm-mini').isVisible(), 'the wheel zooms and the overview strip appears', zoomed);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 300);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(150);
  check((await scale()) !== zoomed, 'Shift+wheel moves the window', await scale());
  await page.mouse.dblclick(track.x + track.width / 2, track.y + 4);
  await page.waitForTimeout(150);
  check((await scale()) === '0:00-1:00', 'double-click goes back to the whole video', await scale());

  // dragging an edge snaps to another loop's edge
  await L(page, '.lsm-chip-main').nth(1).click();
  const tr = await L(page, '.lsm-lane').boundingBox();
  const px = (t) => tr.x + (t / 60) * tr.width;
  await page.mouse.move(px(20), tr.y + 15);
  const thumbA = await L(page, '.lsm-thumb-a').boundingBox();
  await page.mouse.move(thumbA.x + thumbA.width / 2, thumbA.y + thumbA.height / 2);
  await page.mouse.down();
  await page.mouse.move(thumbA.x + thumbA.width / 2 + (px(11) - px(20)), thumbA.y + 10, { steps: 8 }); // about 0:11, 1 s from the edge at 0:10
  await page.mouse.up();
  check((await a()) === '0:10' || (await a()) === '0:20', 'a dragged edge snaps to a neighbour\'s edge', await a());
  await page.keyboard.press('Escape');
  await ctx.close();
}

{
  const { ctx, page } = await open('Tap to mark', '/overlap.html');
  await page.evaluate(() => { const v = document.getElementById('main'); v.currentTime = 4; v.play(); });
  await openPanel(page, [640, 300]);
  const chips = () => shadow(page, (sr) => sr.querySelectorAll('.lsm-chip').length);
  await page.keyboard.press('Shift+KeyM');
  check(/Start/.test(await shadow(page, (sr) => sr.querySelector('.lsm-toast span').textContent)), 'the first tap marks a start');
  await page.waitForTimeout(2200);
  await page.keyboard.press('Shift+KeyM');
  await page.waitForTimeout(150);
  const a = await L(page, '#lsm-time-a').inputValue();
  const b = await L(page, '#lsm-time-b').inputValue();
  check((await chips()) === 1 && /^0:0[3-5]/.test(a) && /^0:0[6-8]/.test(b), 'the second tap makes the loop (the untouched whole-video loop is replaced)', JSON.stringify([a, b]));
  await page.waitForTimeout(2000);
  await page.keyboard.press('Shift+KeyM');
  await page.waitForTimeout(150);
  check((await chips()) === 2, 'the third tap makes the next section', String(await chips()));
  const a2 = await L(page, '#lsm-time-a').inputValue();
  check(a2 === b, 'which starts where the last one ended', JSON.stringify([a2, b]));
  await ctx.close();
}

// A click in the panel must not take the keyboard from the player.
{
  const { ctx, page } = await open('Keyboard after a click in the panel', '/overlap.html');
  await page.evaluate(() => {
    window.__space = 0;
    document.addEventListener('keydown', (e) => { if (e.key === ' ') window.__space++; });
    document.getElementById('main').play();
  });
  await openPanel(page, [640, 300]);
  await L(page, '.lsm-main').click();
  await page.keyboard.press('Space');
  check((await page.evaluate(() => window.__space)) === 1, 'Space after clicking a panel button reaches the page');
  check(await shadow(page, (sr) => sr.querySelector('.lsm-main').getAttribute('aria-pressed') === 'true'), 'and does not press the button again');
  await ctx.close();
}

// Undo.
{
  const { ctx, page } = await open('Delete and undo', '/overlap.html');
  await page.evaluate(() => document.getElementById('main').play());
  await openPanel(page, [640, 300]);
  await L(page, '.lsm-add').click();
  const chips = () => shadow(page, (sr) => sr.querySelectorAll('.lsm-chip').length);
  check((await chips()) === 2, 'two loops');
  await L(page, '.lsm-more').click();
  await L(page, '.lsm-mi', { }).filter({ hasText: 'Delete loop 2' }).click();
  check((await chips()) === 1, 'Delete loop removes it');
  await L(page, '.lsm-toast-btn').click();
  check((await chips()) === 2, 'Undo brings it back');
  await L(page, '.lsm-more').click();
  await L(page, '.lsm-mi').filter({ hasText: 'Remove all loops' }).click();
  check((await chips()) === 1, 'Remove all loops leaves the whole video');
  await L(page, '.lsm-toast-btn').click();
  check((await chips()) === 2, 'and that can be undone too');
  // the dot on a chip switches a loop off and on
  await L(page, '.lsm-dot').nth(1).click();
  check(await shadow(page, (sr) => sr.querySelectorAll('.lsm-chip')[1].classList.contains('lsm-muted')), 'the dot switches a loop off');
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
