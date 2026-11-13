// Building the panel: fields, slider, chips, buttons and their event handling.

import { clamp, parseTime, segments } from '../core/util.js';
import { el, icon, I } from '../ui/dom.js';
import { SHADOW_CSS } from '../ui/styles.js';

export function createControls(A) {
  const { S, ui, adapter, floating, cur, fmtT, focused, fromFrac, ready, toPct } = A;

  function holdRepeat(btn, fn) {
    let delay = 0;
    let repeat = 0;
    const stop = () => {
      clearTimeout(delay);
      clearInterval(repeat);
      delay = repeat = 0;
    };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      stop();
      fn(e);
      delay = setTimeout(() => {
        repeat = setInterval(() => {
          if (btn.matches(':disabled')) stop(); // the panel got disabled mid-hold: no pointerup will come
          else fn(e);
        }, 70);
      }, 380);
    });
    for (const t of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) btn.addEventListener(t, stop);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fn(e);
      }
    });
  }

  // Turns wheel/trackpad deltas into discrete steps.
  function wheelSteps(node, isArmed, fn) {
    let acc = 0;
    node.addEventListener('wheel', (e) => {
      if (!isArmed()) return;
      e.preventDefault();
      acc += (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 16 : 1);
      while (Math.abs(acc) >= 30) {
        const dir = acc < 0 ? 1 : -1;
        acc += dir * 30;
        fn(dir, e);
      }
    }, { passive: false });
  }

  function shake(node) {
    A.replay(node, 'lsm-shake');
  }

  // Applies whatever is half-typed in a field. Not every browser blurs an input
  // when a button is clicked (Firefox and Safari on macOS don't), so this is called explicitly.
  function commitEdits() {
    ui.field.a.commit();
    ui.field.b.commit();
    ui.commitCount();
  }

  // Throws away whatever is half-typed.
  function cancelEdits() {
    ui.field.a.editing = ui.field.b.editing = ui.countState.editing = false;
  }

  function makeField(which, label) {
    const f = { editing: false, stick: null };
    const id = 'lsm-time-' + which;
    const key = which.toUpperCase();
    f.input = el('input', {
      class: 'lsm-time', id, type: 'text', inputmode: 'text', autocomplete: 'off', spellcheck: 'false', maxlength: '14',
      title: 'Type a time: 9:00 · 1:02:03 · 90s · 9m30s\n↑ / ↓ adjust the part under the cursor',
    });
    const minus = el('button', { class: 'lsm-ib', type: 'button', 'aria-label': `${label} earlier`, title: '−1 s  (Shift: 10 s · Alt: 0.1 s)' }, icon(I.minus, 14));
    const plus = el('button', { class: 'lsm-ib', type: 'button', 'aria-label': `${label} later`, title: '+1 s  (Shift: 10 s · Alt: 0.1 s)' }, icon(I.plus, 14));
    f.now = el('button', { class: 'lsm-ib lsm-now', type: 'button', 'aria-label': `Set ${label.toLowerCase()} to the current time`, title: `Use the current time  (Shift+${key})` }, icon(I.now, 15));
    f.root = el('div', { class: 'lsm-field' },
      el('label', { class: 'lsm-label', for: id }, el('b', { class: 'lsm-tag', text: key }), label),
      el('div', { class: 'lsm-box' }, minus, f.input, plus, f.now));

    const revert = () => {
      f.editing = false;
      f.input.value = ready() ? fmtT(cur()[which]) : '';
    };

    const commit = () => {
      if (!f.editing) return true;
      const v = parseTime(f.input.value);
      if (v === null || !ready()) {
        revert();
        shake(f.root);
        return false;
      }
      f.editing = false;
      A.setPoint(which, v, true);
      return true;
    };
    f.commit = commit;

    const step = (dir, e) => {
      if (!ready()) return;
      if (f.editing) commit();
      A.setPoint(which, cur()[which] + dir * (e.altKey ? 0.1 : e.shiftKey ? 10 : 1), false);
    };

    // Steps the part of the timestamp under the cursor (hours, minutes, seconds, tenths).
    const caretStep = (dir, e) => {
      if (!ready()) return;
      if (f.editing && !commit()) return;
      const inp = f.input;
      const val = inp.value;
      const s = inp.selectionStart;
      const en = inp.selectionEnd;
      let unit = 1;
      if (f.stick && f.stick.val === val && f.stick.s === s && f.stick.e === en) {
        unit = f.stick.unit;
      } else if (s != null && !(s === 0 && en === val.length)) {
        const seg = segments(val).find((g) => s <= g.end);
        if (seg) unit = seg.unit;
      }
      const amount = e.altKey ? 0.1 : e.shiftKey ? unit * 10 : unit;
      A.setPoint(which, cur()[which] + dir * amount, false);
      const next = inp.value;
      const segs = segments(next);
      const seg = segs.find((g) => g.unit === unit) || segs.find((g) => g.unit === 1);
      if (seg && focused() === inp) {
        inp.setSelectionRange(seg.start, seg.end);
        f.stick = { val: next, s: seg.start, e: seg.end, unit };
      }
    };

    f.input.addEventListener('input', () => {
      f.editing = true;
      f.stick = null;
    });
    f.input.addEventListener('blur', () => {
      commit();
      f.stick = null;
    });
    f.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (commit()) f.input.select();
      } else if (e.key === 'Escape') {
        if (f.editing) { // first Escape cancels the edit, the next one closes the panel
          e.preventDefault();
          e.stopPropagation();
          revert();
          f.input.select();
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        caretStep(e.key === 'ArrowUp' ? 1 : -1, e);
      }
    });
    wheelSteps(f.input, () => focused() === f.input && ready(), caretStep);
    holdRepeat(minus, (e) => step(-1, e));
    holdRepeat(plus, (e) => step(1, e));
    f.now.addEventListener('click', () => {
      f.editing = false;
      A.markNow(which);
    });
    return f;
  }

  /* ---- Range slider (edits the loop only; it never moves the video) ---- */

  function bindSlider() {
    const track = ui.track;
    let drag = null;

    const laneFrac = (x) => {
      const r = ui.lane.getBoundingClientRect();
      return r.width > 0 ? clamp((x - r.left) / r.width, 0, 1) : 0;
    };

    const move = (e) => {
      if (!drag || e.pointerId !== drag.id || !ready()) return;
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.x0) < 3) return;
        drag.moved = true;
      }
      A.setPoint(drag.which, fromFrac(laneFrac(e.clientX - drag.off)), false);
    };

    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const d = drag;
      drag = null;
      try { track.releasePointerCapture(d.id); } catch (_) { /* already released */ }
      track.classList.remove('lsm-dragging');
      ui.thumb[d.which].classList.remove('lsm-grab');
      if (!ui.thumb[d.which].matches(':focus-visible')) A.hideTip();
      S.sliding = false;
      A.render();
    };

    track.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !ready() || drag) return;
      const l = cur();
      const th = e.target.closest ? e.target.closest('.lsm-thumb') : null;
      let which;
      let off = 0;
      const r = ui.lane.getBoundingClientRect();
      if (th) {
        which = th.dataset.which;
        off = e.clientX - (r.left + (toPct(l[which]) / 100) * r.width);
      } else {
        const t = fromFrac(laneFrac(e.clientX));
        which = Math.abs(t - l.a) <= Math.abs(t - l.b) ? 'a' : 'b';
      }
      drag = { which, id: e.pointerId, off, x0: e.clientX, moved: !th };
      S.sliding = true;
      try { track.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      track.classList.add('lsm-dragging');
      ui.thumb[which].classList.add('lsm-grab');
      ui.thumb[which].focus({ preventScroll: true });
      A.showTip(which);
      if (!th) move(e);
    });
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('lostpointercapture', end);

    for (const w of ['a', 'b']) {
      const th = ui.thumb[w];
      th.addEventListener('keydown', (e) => {
        if (!ready()) return;
        const unit = e.altKey ? 0.1 : e.shiftKey ? 10 : 1;
        const now = cur()[w];
        let target;
        switch (e.key) {
          case 'ArrowLeft': case 'ArrowDown': target = now - unit; break;
          case 'ArrowRight': case 'ArrowUp': target = now + unit; break;
          case 'PageDown': target = now - 60; break;
          case 'PageUp': target = now + 60; break;
          case 'Home': target = 0; break;
          case 'End': target = S.duration; break;
          default: return;
        }
        e.preventDefault();
        A.setPoint(w, target, false);
        A.showTip(w);
      });
      th.addEventListener('focus', () => { if (th.matches(':focus-visible')) A.showTip(w); });
      th.addEventListener('blur', () => { if (!drag) A.hideTip(); });
    }
  }

  const keyTarget = (e) => (e.composedPath && e.composedPath()[0]) || e.target;
  const isField = (e) => { const t = keyTarget(e); return !!t && t.tagName === 'INPUT'; };

  // Whether the control that has the focus makes use of this key.
  function usesKey(e) {
    const t = keyTarget(e);
    if (!t || t.nodeType !== 1) return false;
    if (e.key === 'Escape' || t.tagName === 'INPUT') return true;
    if (t.tagName === 'BUTTON') return e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar';
    if (t.getAttribute('role') === 'slider') return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key);
    return false;
  }

  // The "more" menu: actions that are used less often than the buttons in the panel.
  function buildMenu() {
    const item = (label, run, hint) => {
      const b = el('button', { class: 'lsm-mi', type: 'button', role: 'menuitem' }, el('span', { text: label }), hint ? el('kbd', { text: hint }) : null);
      b.addEventListener('click', () => { A.closeMenu(); run(); });
      return b;
    };
    ui.miDelete = item('Delete loop', () => A.removeLoop());
    const menu = el('div', { class: 'lsm-menu', role: 'menu', hidden: true },
      item('Skip this repetition', () => A.navigate('skipRep'), 'Shift+\\'),
      item('Restart this repetition', () => A.navigate('restart'), 'Shift+Z'),
      ui.miDelete,
      item('Remove all loops', () => A.clearAll()),
      item('Keyboard shortcuts', () => A.toggleHelp()));
    return menu;
  }

  // The small strip shown while looping with the editor closed.
  function buildStrip() {
    const button = (label, path, run, cls = 'lsm-sb') => {
      const b = el('button', { class: cls, type: 'button', 'aria-label': label, title: label }, icon(path, 16));
      b.addEventListener('click', run);
      return b;
    };
    ui.stripGrip = el('span', { class: 'lsm-grip', title: 'Drag to move (double-click: back to the usual place)' }, icon(I.grip, 14));
    ui.stripText = el('span', { class: 'lsm-strip-text' });
    ui.stripFill = el('i');
    return el('div', { class: 'lsm-strip', role: 'group', 'aria-label': 'Looping' },
      ui.stripGrip,
      el('i', { class: 'lsm-sdot' }),
      ui.stripText,
      button('Previous loop  (Shift+[)', I.prev, () => A.navigate('prev')),
      button('Next loop  (Shift+])', I.next, () => A.navigate('skipLoop')),
      button('Turn looping off  (Shift+R)', I.stop, () => A.stopRun()),
      button('Open the editor', I.expand, () => A.openPanel()),
      el('span', { class: 'lsm-strip-bar' }, ui.stripFill));
  }

  // The shortcut sheet (opened from the menu).
  function buildHelp() {
    const rows = [
      ['Shift+A / Shift+B', 'Start / end at the current time'],
      ['Shift+S', 'Play the selected loop'],
      ['Shift+R', 'Looping on / off'],
      ['Shift+]  /  Shift+[', 'Next / previous loop'],
      ['Shift+\\', 'Skip this repetition'],
      ['Shift+Z', 'Restart this repetition'],
      ['Shift+1 … 9', 'Go to loop 1 … 9'],
    ];
    const list = el('div', { class: 'lsm-help-rows' });
    for (const [k, v] of rows) list.append(el('kbd', { text: k }), el('span', { text: v }));
    return el('div', { class: 'lsm-help', hidden: true }, el('div', { class: 'lsm-label', text: 'Keyboard shortcuts' }), list);
  }

  function openMenu() {
    if (!ready()) return;
    const many = S.loops.length > 1;
    ui.miDelete.firstChild.textContent = many ? `Delete loop ${S.sel + 1}` : 'Reset the loop to the whole video';
    ui.menu.hidden = false;
    A.setMenuOpen(true);
  }

  function closeMenu() {
    if (ui.menu.hidden) return;
    ui.menu.hidden = true;
    A.setMenuOpen(false);
  }

  function toggleHelp() {
    ui.help.hidden = !ui.help.hidden;
  }

  function buildUI() {
    ui.badge = el('span', { class: 'lsm-badge' });
    ui.btn = el('button', {
      class: floating ? 'lsm-pill' : `${adapter.buttonClass || ''} lsm-btn`.trim(), type: 'button', title: 'Section loop (Loopsmith)', 'aria-label': 'Section loop',
      'aria-haspopup': 'dialog', 'aria-expanded': 'false',
    }, icon(I.loop, floating ? 22 : 24), ui.badge);
    ui.btn.addEventListener('click', (e) => {
      if (floating) e.stopPropagation(); // not a click on the page
      if (S.open) A.closePanel();
      else A.openPanel();
    });

    ui.markBox = el('div', { class: floating ? 'lsm-marks lsm-float' : 'lsm-marks', hidden: true });
    ui.toast = el('div', { class: 'lsm-toast', role: 'status', 'aria-live': 'polite' });

    // Header: one chip per loop
    ui.add = el('button', { class: 'lsm-hb lsm-add', type: 'button', 'aria-label': 'Add a loop', title: 'Add a loop at the current time' }, icon(I.plus, 14));
    ui.add.addEventListener('click', A.addLoop);
    ui.chipRow = el('div', { class: 'lsm-chips', role: 'group', 'aria-label': 'Loops' }, ui.add);
    ui.more = el('button', { class: 'lsm-hb lsm-more', type: 'button', 'aria-label': 'More', title: 'More', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, icon(I.more, 16));
    ui.more.addEventListener('click', () => (ui.menu.hidden ? A.openMenu() : A.closeMenu()));
    const close = el('button', { class: 'lsm-hb', type: 'button', 'aria-label': 'Close', title: 'Close' }, icon(I.close, 16));
    close.addEventListener('click', A.closePanel);
    ui.grip = el('span', { class: 'lsm-grip', title: 'Drag to move (double-click: back to the usual place)' }, icon(I.grip, 14));
    const head = el('div', { class: 'lsm-head' }, ui.grip, ui.chipRow, ui.more, close);
    ui.menu = buildMenu();
    ui.notice = el('div', { class: 'lsm-notice', role: 'status' });

    // Slider
    ui.thumb.a = el('div', { class: 'lsm-thumb lsm-thumb-a', 'data-which': 'a', role: 'slider', tabindex: '0', 'aria-valuemin': '0', 'aria-label': 'Loop start', text: 'A' });
    ui.thumb.b = el('div', { class: 'lsm-thumb lsm-thumb-b', 'data-which': 'b', role: 'slider', tabindex: '0', 'aria-valuemin': '0', 'aria-label': 'Loop end', text: 'B' });
    ui.tip = el('div', { class: 'lsm-tip' });
    ui.ghostBox = el('div', { class: 'lsm-ghosts' });
    ui.play = el('div', { class: 'lsm-play' });
    ui.lane = el('div', { class: 'lsm-lane' },
      el('div', { class: 'lsm-rail' }), ui.ghostBox, el('div', { class: 'lsm-fill' }), ui.play,
      ui.thumb.a, ui.thumb.b, ui.tip);
    ui.track = el('div', { class: 'lsm-track', title: 'Drag A and B, or click to move the nearest one' }, ui.lane);
    ui.len = el('span', { class: 'lsm-len' });
    ui.scaleStart = el('span', { text: '0:00' });
    ui.scaleEnd = el('span');
    ui.zoom = el('button', { class: 'lsm-zoom', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Zoom the slider on this loop', title: 'Zoom the slider on this loop (finer dragging)' }, icon(I.zoom, 14));
    ui.zoom.addEventListener('click', () => A.setZoom(!S.zoom));
    const slider = el('div', { class: 'lsm-slider' }, ui.track,
      el('div', { class: 'lsm-scale' }, ui.scaleStart, el('span', { class: 'lsm-mid' }, ui.len, ui.zoom), ui.scaleEnd));

    // Timestamps
    ui.field.a = makeField('a', 'Start');
    ui.field.b = makeField('b', 'End');
    const fields = el('div', { class: 'lsm-row' }, ui.field.a.root, ui.field.b.root);

    // Repeat count
    ui.countState = { editing: false };
    ui.count = el('input', { class: 'lsm-num', id: 'lsm-count', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '3', title: 'How many times this loop plays' });
    const cMinus = el('button', { class: 'lsm-ib', type: 'button', 'aria-label': 'Fewer plays', title: 'Fewer  (Shift: 10)' }, icon(I.minus, 14));
    const cPlus = el('button', { class: 'lsm-ib', type: 'button', 'aria-label': 'More plays', title: 'More  (Shift: 10)' }, icon(I.plus, 14));
    ui.inf = el('button', { class: 'lsm-ib lsm-inf', type: 'button', 'aria-label': 'Repeat forever', 'aria-pressed': 'false', title: 'Repeat forever', text: '∞' });
    const countField = el('div', { class: 'lsm-field' },
      el('label', { class: 'lsm-label', for: 'lsm-count', text: 'Times to play' }),
      el('div', { class: 'lsm-box' }, cMinus, ui.count, cPlus, ui.inf));

    const commitCount = () => {
      if (!ui.countState.editing) return;
      ui.countState.editing = false;
      const n = parseInt(ui.count.value, 10);
      if (n >= 1 && ready()) {
        A.setCount(n);
      } else {
        A.render();
        shake(countField);
      }
    };
    const bumpCount = (dir, e) => {
      if (!ready()) return;
      commitCount();
      if (cur().infinite) A.setInfinite(false);
      else A.setCount(cur().count + dir * (e.shiftKey ? 10 : 1));
    };
    ui.commitCount = commitCount;
    holdRepeat(cMinus, (e) => bumpCount(-1, e));
    holdRepeat(cPlus, (e) => bumpCount(1, e));
    ui.inf.addEventListener('click', () => {
      if (!ready()) return;
      ui.countState.editing = false;
      A.setInfinite(!cur().infinite);
    });
    ui.count.addEventListener('focus', () => {
      setTimeout(() => { if (focused() === ui.count) ui.count.select(); }, 0);
    });
    ui.count.addEventListener('input', () => {
      const digits = ui.count.value.replace(/\D+/g, '').slice(0, 3);
      if (digits !== ui.count.value) ui.count.value = digits;
      ui.countState.editing = true;
    });
    ui.count.addEventListener('blur', commitCount);
    ui.count.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitCount();
        ui.count.select();
      } else if (e.key === 'Escape') {
        if (ui.countState.editing) {
          e.preventDefault();
          e.stopPropagation();
          ui.countState.editing = false;
          A.render();
          ui.count.select();
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        bumpCount(e.key === 'ArrowUp' ? 1 : -1, e);
        ui.count.select();
      }
    });
    wheelSteps(ui.count, () => focused() === ui.count, (dir, e) => {
      bumpCount(dir, e);
      ui.count.select();
    });

    // What happens after the last repetition
    ui.segBtns = [
      el('button', { type: 'button', 'data-v': 'continue', 'aria-pressed': 'true', text: 'Play on', title: 'When a loop is done, keep playing the video' }),
      el('button', { type: 'button', 'data-v': 'next', 'aria-pressed': 'false', text: 'Next loop', title: 'When a loop is done, jump straight to the next loop\n(pauses after the last one)' }),
      el('button', { type: 'button', 'data-v': 'pause', 'aria-pressed': 'false', text: 'Pause', title: 'Keep playing between loops, pause after the last one' }),
    ];
    for (const b of ui.segBtns) b.addEventListener('click', () => A.setAfter(b.dataset.v));
    ui.seg = el('div', { class: 'lsm-seg', role: 'group', 'aria-label': 'When done' }, ...ui.segBtns);
    const afterField = el('div', { class: 'lsm-field' }, el('div', { class: 'lsm-label', text: 'When done' }), ui.seg);
    const opts = el('div', { class: 'lsm-row lsm-opts' }, countField, afterField);

    // Actions
    // Turning looping on and starting a loop are separate: the first leaves the video where it is.
    ui.start = el('button', { class: 'lsm-start', type: 'button' }, icon(I.play, 18));
    ui.start.addEventListener('click', A.startLoop);
    ui.mainText = el('span', { text: 'Turn looping on' });
    ui.main = el('button', { class: 'lsm-main', type: 'button', 'aria-pressed': 'false', title: 'Turn looping on / off  (Shift+R)\nThe video stays where it is' },
      icon(I.loop, 18, 'lsm-ic-idle'), icon(I.stop, 18, 'lsm-ic-stop'), ui.mainText);
    ui.main.addEventListener('click', () => (S.active ? A.stopRun() : A.armRun()));
    ui.prev = el('button', { class: 'lsm-skip', type: 'button', 'aria-label': 'Previous loop', title: 'Previous loop  (Shift+[)\nLater in a repetition: restart it' }, icon(I.prev, 16));
    ui.prev.addEventListener('click', () => A.navigate('prev'));
    ui.next = el('button', { class: 'lsm-skip', type: 'button', 'aria-label': 'Next loop', title: 'Skip to the next loop  (Shift+])' }, icon(I.next, 16));
    ui.next.addEventListener('click', () => A.navigate('skipLoop'));
    const actions = el('div', { class: 'lsm-actions' }, ui.prev, ui.start, ui.main, ui.next);

    // What is playing now: shown while looping.
    ui.statusText = el('span', { class: 'lsm-status-text' });
    ui.statusFill = el('i');
    ui.status = el('div', { class: 'lsm-status', hidden: true }, ui.statusText, el('span', { class: 'lsm-bar' }, ui.statusFill));

    ui.body = el('fieldset', { class: 'lsm-body' }, slider, fields, opts, ui.status, actions);
    ui.strip = buildStrip();
    ui.help = buildHelp();
    ui.panel = el('div', { class: 'lsm-panel', role: 'dialog', 'aria-label': 'Section loop' }, head, ui.menu, ui.notice, ui.body, ui.help);

    // The panel and the toast live in a shadow root: the site's CSS can't reach them.
    // Open, so focus and composedPath() still see which field is being typed in.
    // A custom tag name: broad site selectors like `body > div` don't match it.
    ui.host = document.createElement('loopsmith-root');
    ui.shadow = ui.host.attachShadow({ mode: 'open' });
    ui.shadow.append(el('style', { text: SHADOW_CSS }), ui.panel, ui.strip, ui.toast);
    if (floating) {
      // Floating mode draws the markers in the overlay, laid over the site's progress bar.
      ui.shadow.append(ui.btn, ui.markBox);
      const base = { position: 'fixed', display: 'block', margin: '0', padding: '0', border: '0', 'z-index': '2147483646', 'pointer-events': 'none', left: '0', top: '0', width: '0', height: '0' };
      for (const [k, v] of Object.entries(base)) ui.host.style.setProperty(k, v, 'important');
    }

    bindSlider();
    A.bindDrag(ui.grip, ui.panel);
    A.bindDrag(ui.stripGrip, ui.strip);

    // A press anywhere outside a text field applies what was being typed first.
    ui.panel.addEventListener('pointerdown', (e) => {
      if (!e.target || e.target.tagName !== 'INPUT') commitEdits();
    }, true);

    // Keep the player from reacting to anything that happens inside the panel (click-to-pause,
    // double-click fullscreen…), and to the keys a control in the panel uses (typing in a field,
    // Space on a button, arrows on a slider handle). Every other key still reaches the player,
    // so Space pauses and the arrows seek even after a click in the panel.
    ui.panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!ui.menu.hidden) A.closeMenu();
        else A.closePanel();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' && !isField(e)) {
        e.preventDefault();
        A.undo();
      }
    });
    const stop = (e) => e.stopPropagation();
    for (const box of [ui.panel, ui.strip]) {
      for (const t of ['keydown', 'keyup', 'keypress']) {
        box.addEventListener(t, (e) => { if (usesKey(e)) e.stopPropagation(); });
      }
      for (const t of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu']) box.addEventListener(t, stop);
      for (const t of ['wheel', 'touchstart', 'touchend']) box.addEventListener(t, stop, { passive: true });
      // After a mouse click the focus goes back to the page (a keyboard press keeps it, for Tab).
      box.addEventListener('click', (e) => {
        if (e.detail === 0 || !e.target.closest) return;
        const b = e.target.closest('button');
        if (b && focused() === b) b.blur(); // the button's own handler has already run
      });
    }
    for (const t of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu']) ui.toast.addEventListener(t, stop);
    ui.panel.addEventListener('click', (e) => {
      if (e.target.closest && !e.target.closest('.lsm-menu, .lsm-more')) A.closeMenu();
    });
  }

  return { bindSlider, buildUI, openMenu, closeMenu, toggleHelp, cancelEdits, commitEdits, holdRepeat, makeField, shake, wheelSteps };
}
