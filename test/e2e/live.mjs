// Browser tests on real sites with the built Chrome extension loaded (dist/chrome). Needs network.
// Cookie banners are answered with "Reject all". Sites change: a failure here can mean the site
// changed, not Loopsmith. Spotify and YouTube Music can't run here (DRM / headless browsers
// refused): check those by hand.
//
//   npm run build && npm run e2e:live

import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ext = join(here, '..', '..', 'dist', 'chrome');

const failures = [];
let current = '';
function check(ok, what, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${what}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failures.push(`${current}: ${what} (${detail})`);
}
const near = (x, y, tol = 0.8) => Math.abs(x - y) <= tol;

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 }, locale: 'en-US',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--autoplay-policy=no-user-gesture-required'],
});

async function rejectCookies(page) {
  for (const name of [/reject all/i, /necessary only|only necessary/i]) {
    const b = page.getByRole('button', { name }).first();
    if (await b.isVisible().catch(() => false)) {
      await b.click().catch(() => {});
      await page.waitForTimeout(3000);
      return;
    }
  }
}

const L = (page, sel) => page.locator('loopsmith-root ' + sel);
async function setField(page, sel, value) {
  await L(page, sel).fill(value);
  await L(page, sel).press('Enter');
}
async function watch(page, getT, ms, every = 250) {
  const ts = [];
  for (let i = 0; i < ms / every; i++) {
    await page.waitForTimeout(every);
    ts.push(await page.evaluate(getT));
  }
  const jumps = [];
  for (let i = 1; i < ts.length; i++) if (ts[i] < ts[i - 1] - 0.5) jumps.push(+ts[i].toFixed(1));
  return { ts, jumps };
}
const toast = (page) => page.evaluate(() => document.querySelector('loopsmith-root')?.shadowRoot.querySelector('.lsm-toast span')?.textContent);

/* ---------------- YouTube ---------------- */
try {
  current = 'YouTube';
  console.log(`\n${current}`);
  const page = await ctx.newPage();
  await page.goto('https://www.youtube.com/watch?v=aqz-KE-bpKQ', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await rejectCookies(page);
  const bump = page.locator('ytd-consent-bump-v2-lightbox button', { hasText: /reject all/i }).first();
  if (await bump.isVisible().catch(() => false)) { await bump.click(); await page.waitForTimeout(3000); }
  await page.waitForSelector('#movie_player video', { timeout: 30000 });
  for (let i = 0; i < 40 && await page.evaluate(() => document.getElementById('movie_player').classList.contains('ad-showing')); i++) await page.waitForTimeout(1000);
  await page.waitForTimeout(2000);
  check(await page.locator('.ytp-right-controls .lsm-btn').count() === 1, 'loop button in the player controls');
  await page.locator('.lsm-btn').click();
  await setField(page, '#lsm-time-a', '0:20');
  await setField(page, '#lsm-time-b', '0:24');
  await setField(page, '#lsm-count', '2');
  check(await page.locator('.ytp-progress-bar .lsm-mark').count() === 1, 'marker on the progress bar');
  await L(page, '.lsm-start').click();
  const w = await watch(page, () => document.querySelector('#movie_player video').currentTime, 11000);
  check(w.jumps.length === 1 && near(w.jumps[0], 20), 'plays 0:20→0:24 twice', JSON.stringify(w.jumps));
  check((await toast(page)) === 'Loop finished · played 2×', 'loop finishes');

  // what the popup's "Copy diagnostics" gets from the page, asked the way the popup asks
  const sw = ctx.serviceWorkers()[0];
  if (sw) {
    const report = await sw.evaluate(async () => {
      // the page under test is the active tab (a url filter needs the "tabs" permission, which the extension doesn't ask for)
      const tabs = await chrome.tabs.query({ active: true });
      return chrome.tabs.sendMessage(tabs[tabs.length - 1].id, { type: 'loopsmith:diagnostics' });
    });
    check(report && report.adapter === 'youtube' && report.hasPlayer && report.loops === 1, 'the page answers the diagnostics request', JSON.stringify(report));
  }

  // two loops end to end with "Next loop": no seek where the first ends and the second begins
  await L(page, '.lsm-add').click();
  await setField(page, '#lsm-time-a', '0:24');
  await setField(page, '#lsm-time-b', '0:27');
  await setField(page, '#lsm-count', '1');
  await L(page, '.lsm-chip-main').first().click();
  await setField(page, '#lsm-time-a', '0:21');
  await setField(page, '#lsm-time-b', '0:24');
  await setField(page, '#lsm-count', '1');
  await L(page, '.lsm-seg button[data-v="next"]').click();
  await L(page, '.lsm-start').click();
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__seeks = 0; document.querySelector('#movie_player video').addEventListener('seeking', () => window.__seeks++); });
  await page.waitForTimeout(6500);
  const joined = await page.evaluate(() => ({ seeks: window.__seeks, t: document.querySelector('#movie_player video').currentTime }));
  check(joined.seeks === 0 && joined.t > 26, 'loops joined end to end play on without a seek', JSON.stringify(joined));

  // next / previous loop by keyboard
  await L(page, '.lsm-chip-main').first().click();
  await L(page, '.lsm-start').click();
  await page.waitForTimeout(600);
  await page.keyboard.press('Shift+BracketRight');
  await page.waitForTimeout(800);
  const afterNext = await page.evaluate(() => document.querySelector('#movie_player video').currentTime);
  check(near(afterNext, 24.8, 1.5), 'Shift+] skips to the next loop', String(afterNext));
  await page.close();
} catch (e) { check(false, 'ran without errors', e.message.split('\n')[0]); }

/* ---------------- SoundCloud ---------------- */
try {
  current = 'SoundCloud';
  console.log(`\n${current}`);
  const page = await ctx.newPage();
  await page.goto('https://soundcloud.com/forss/flickermood', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await rejectCookies(page);
  for (const sel of ['.modal__closeButton', '[aria-label=Close]']) {
    const x = page.locator(sel).first();
    if (await x.isVisible().catch(() => false)) { await x.click().catch(() => {}); await page.waitForTimeout(800); }
  }
  check(await page.evaluate(() => !!document.querySelector('loopsmith-root')?.shadowRoot.querySelector('.lsm-pill.lsm-show')), 'loop button shows before anything plays');
  await page.locator('.sc-button-play').first().click({ timeout: 10000 });
  await page.waitForTimeout(4000);
  const m = () => document.querySelector('loopsmith-media audio, loopsmith-media video')?.currentTime ?? -1;
  check(await page.evaluate(m) > 0, "SoundCloud's out-of-page audio was found");
  await L(page, '.lsm-pill').click();
  await setField(page, '#lsm-time-a', '0:30');
  await setField(page, '#lsm-time-b', '0:34');
  await setField(page, '#lsm-count', '2');
  check(await page.evaluate(() => !document.querySelector('loopsmith-root').shadowRoot.querySelector('.lsm-marks').hidden), "marker on SoundCloud's progress bar");
  await L(page, '.lsm-start').click();
  const w = await watch(page, m, 11000);
  check(w.jumps.length === 1 && near(w.jumps[0], 30), 'plays 0:30→0:34 twice', JSON.stringify(w.jumps));
  const shown = await page.evaluate(() => document.querySelector('.playbackTimeline__timePassed span[aria-hidden]')?.textContent || '');
  check(/^0:3\d$/.test(shown.trim()), "SoundCloud's own clock follows", shown);
  await page.close();
} catch (e) { check(false, 'ran without errors', e.message.split('\n')[0]); }

/* ---------------- Bandcamp ---------------- */
try {
  current = 'Bandcamp';
  console.log(`\n${current}`);
  const page = await ctx.newPage();
  await page.goto('https://c418.bandcamp.com/album/minecraft-volume-alpha', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await rejectCookies(page);
  await page.locator('.playbutton').first().click();
  await page.waitForTimeout(3000);
  await L(page, '.lsm-pill').click();
  await setField(page, '#lsm-time-a', '0:20');
  await setField(page, '#lsm-time-b', '0:24');
  await setField(page, '#lsm-count', '2');
  await L(page, '.lsm-start').click();
  const w = await watch(page, () => [...document.querySelectorAll('audio')].find((a) => a.duration > 0)?.currentTime ?? -1, 11000);
  check(w.jumps.length === 1 && near(w.jumps[0], 20), 'plays 0:20→0:24 twice', JSON.stringify(w.jumps));
  await page.close();
} catch (e) { check(false, 'ran without errors', e.message.split('\n')[0]); }

await ctx.close();
console.log(failures.length ? `\n${failures.length} failed:\n- ${failures.join('\n- ')}` : '\nAll live checks passed.');
process.exit(failures.length ? 1 : 0);
