import { describe, it, expect } from 'vitest';
import { buildReport } from '../src/popup/report.js';

describe('buildReport', () => {
  it('lists the version, browser, site and what the page reported', () => {
    const out = JSON.parse(buildReport({ version: '1.3.0', userAgent: 'UA', host: 'example.com', page: { adapter: 'generic', loops: 2 } }));
    expect(out).toEqual({ loopsmith: '1.3.0', browser: 'UA', site: 'example.com', page: { adapter: 'generic', loops: 2 } });
  });

  it('says so when no player answered', () => {
    const out = JSON.parse(buildReport({ version: '1.3.0', userAgent: 'UA', host: '', page: null }));
    expect(out.site).toBeNull();
    expect(out.page).toMatch(/not running a player/);
  });
});
