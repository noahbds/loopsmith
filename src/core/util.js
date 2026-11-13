// Small helpers and timestamp formatting/parsing. No DOM.

/** @param {number} x @param {number} lo @param {number} hi */
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
/** @param {number} x */
export const round1 = (x) => Math.round(x * 10) / 10;
/** Rounds to `digits` decimals (1 = tenths, 2 = hundredths). @param {number} x @param {number} [digits] */
export const roundT = (x, digits = 1) => { const k = 10 ** digits; return Math.round(x * k) / k; };
/** @param {number} n */
export const pad2 = (n) => String(n).padStart(2, '0');
/** @param {unknown} x @returns {x is number} */
export const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * 1:02:03.5. Tenths by default, hundredths with digits = 2; trailing zeros are dropped.
 * @param {number} sec @param {boolean} withHours @param {number} [digits]
 */
export function fmt(sec, withHours, digits = 1) {
  const k = 10 ** digits;
  const total = Math.max(0, Math.round(sec * k));
  const whole = Math.floor(total / k);
  const frac = total % k;
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  let out = h > 0 || withHours ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
  if (frac) out += '.' + String(frac).padStart(digits, '0').replace(/0+$/, '');
  return out;
}

// Accepts 9:00, 1:02:03.5, 540, 90s, 9m30s, 1h2m, "9 30". Returns seconds or null.
/** @param {unknown} raw @returns {number | null} */
export function parseTime(raw) {
  const s = String(raw).trim().toLowerCase().replace(/,/g, '.');
  if (!s) return null;
  const num = '(\\d+(?:\\.\\d+)?)';
  const units = new RegExp(`^(?:${num}\\s*h)?\\s*(?:${num}\\s*m(?:in)?)?\\s*(?:${num}\\s*s(?:ec)?)?$`).exec(s);
  if (units && (units[1] || units[2] || units[3])) {
    return (+units[1] || 0) * 3600 + (+units[2] || 0) * 60 + (+units[3] || 0);
  }
  const parts = s.split(/\s*:\s*|\s+/);
  if (parts.length > 3) return null;
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    const p = parts[i] === '' && parts.length > 1 ? '0' : parts[i];
    if (!(last ? /^\d+(\.\d+)?$/ : /^\d+$/).test(p)) return null;
    total = total * 60 + Number(p);
  }
  return isFinite(total) ? total : null;
}

// Splits a formatted time into its editable parts: [{start, end, unit}]
/**
 * @param {string} val
 * @param {number} [digits] decimals shown in the seconds part
 * @returns {{ start: number, end: number, unit: number }[]}
 */
export function segments(val, digits = 1) {
  /** @type {{ start: number, end: number, unit: number }[]} */
  const out = [];
  const parts = val.split(':');
  let pos = 0;
  parts.forEach((p, i) => {
    const unit = [1, 60, 3600][parts.length - 1 - i] || 3600;
    const dot = p.indexOf('.');
    if (i === parts.length - 1 && dot >= 0) {
      out.push({ start: pos, end: pos + dot, unit });
      out.push({ start: pos + dot + 1, end: pos + p.length, unit: 10 ** -digits });
    } else {
      out.push({ start: pos, end: pos + p.length, unit });
    }
    pos += p.length + 1;
  });
  return out;
}
