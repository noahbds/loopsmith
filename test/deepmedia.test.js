// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { allMedia, mediaOf, PLAY_EVENT } from '../src/core/deepmedia.js';

describe('finding media', () => {
  it('finds media in the page and inside nested open shadow roots', () => {
    document.body.innerHTML = '<video id="a"></video><my-player></my-player>';
    const outer = document.querySelector('my-player').attachShadow({ mode: 'open' });
    outer.innerHTML = '<inner-player></inner-player>';
    const inner = outer.querySelector('inner-player').attachShadow({ mode: 'open' });
    inner.innerHTML = '<audio id="b"></audio>';
    const ids = allMedia().map((m) => m.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  it('tells which media a composed event came from, across shadow roots', () => {
    document.body.innerHTML = '<x-player></x-player>';
    const sr = document.querySelector('x-player').attachShadow({ mode: 'open' });
    sr.innerHTML = '<video id="v"></video>';
    let got = null;
    document.addEventListener(PLAY_EVENT, (e) => { got = mediaOf(e); }, { once: true });
    sr.querySelector('video').dispatchEvent(new CustomEvent(PLAY_EVENT, { bubbles: true, composed: true }));
    expect(got && got.id).toBe('v');
  });
});
