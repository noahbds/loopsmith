// Presses one of the site's own player buttons (the next-track button, for "After the last: Next").
// False when it isn't there, is hidden, or is greyed out (nothing comes next).

/**
 * @param {string} sel
 * @returns {boolean}
 */
export function press(sel) {
  const el = /** @type {HTMLElement | null} */ (document.querySelector(sel));
  if (!el || !el.getClientRects().length) return false;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled')) return false;
  el.click();
  return true;
}
