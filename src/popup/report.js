// The text the popup's "Copy diagnostics" button produces. Pure, so it can be tested.

/**
 * @param {{ version: string, userAgent: string, host: string, page: object | null }} info
 * @returns {string}
 */
export function buildReport({ version, userAgent, host, page }) {
  return JSON.stringify({
    loopsmith: version,
    browser: userAgent,
    site: host || null,
    page: page || 'Loopsmith is not running a player on this page',
  }, null, 2);
}
