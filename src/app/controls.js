// Building the panel: fields, slider, chips, buttons and their event handling.

import { NAME_MAX } from '../core/constants.js';
import { clamp, parseTime, segments } from '../core/util.js';
import * as V from '../core/view.js';
import { el, icon, I } from '../ui/dom.js';
import { SHADOW_CSS } from '../ui/styles.js';

export function createControls(A) {
  const { S, P, ui, adapter, floating, cur, fmtT, focused, fromFrac, ready, toPct, viewEnd, viewStart } = A;

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
    const minus = el('button', { class: 'lsm-ib', type: 'button', 'aria-label': `${label} earlier`, title: '−1 s  (Shift: 10 s · Alt: the finest step)' }, icon(I.minus, 14));
    const plus = el('button', { class: 'lsm-ib', type: 'button', 'aria-label': `${label} later`, title: '+1 s  (Shift: 10 s · Alt: the finest step)' }, icon(I.plus, 14));
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
      A.setPoint(which, cur()[which] + dir * (e.altKey ? A.fineStep() : e.shiftKey ? 10 : 1), false);
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
        const seg = segments(val, A.digits()).find((g) => s <= g.end);
        if (seg) unit = seg.unit;
      }
      const amount = e.altKey ? A.fineStep() : e.shiftKey ? unit * 10 : unit;
      A.setPoint(which, cur()[which] + dir * amount, false);
      const next = inp.value;
      const segs = segments(next, A.digits());
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

    // Close to another loop's edge, a dragged edge snaps to it (hold Alt to drag freely).
    const spanPerPx = () => {
      const r = ui.lane.getBoundingClientRect();
      return r.width > 0 ? (viewEnd() - viewStart()) / r.width : 0;
    };

    const apply = (x, alt) => {
      const edges = V.edgesOf(S.loops, S.sel);
      const near = alt ? -1 : 7 * spanPerPx();
      let snapped = false;
      if (drag.whole) {
        const l = cur();
        const start = drag.a0 + fromFrac(laneFrac(x)) - drag.t0;
        const s = near > 0 ? V.snapWhole(start, l.b - l.a, edges, near) : null;
        snapped = s != null;
        A.moveWhole(snapped ? s : start);
      } else {
        const v = fromFrac(laneFrac(x - drag.off));
        const s = near > 0 ? V.snapTo(v, edges, near) : null;
        snapped = s != null;
        A.setPoint(drag.which, snapped ? s : v, false);
      }
      ui.lane.classList.toggle('lsm-snapped', snapped);
      ui.tip.classList.toggle('lsm-snap', snapped && !drag.whole);
    };

    // Dragging an edge into the border of a zoomed slider scrolls it along.
    let edge = 0;
    let lastX = 0;
    let lastAlt = false;
    let panRaf = 0;
    const autoPan = () => {
      panRaf = 0;
      if (!drag || !edge) return;
      A.panView(edge * (viewEnd() - viewStart()) * 0.5 / 60);
      apply(lastX, lastAlt);
      panRaf = requestAnimationFrame(autoPan);
    };

    const move = (e) => {
      if (!drag || e.pointerId !== drag.id || !ready()) return;
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.x0) < 3) return;
        drag.moved = true;
      }
      lastX = e.clientX;
      lastAlt = e.altKey;
      const r = ui.lane.getBoundingClientRect();
      edge = S.zoom ? (e.clientX < r.left + 16 && S.v0 > 0 ? -1 : e.clientX > r.right - 16 && S.v1 < S.duration ? 1 : 0) : 0;
      if (edge && !panRaf) panRaf = requestAnimationFrame(autoPan);
      apply(e.clientX, e.altKey);
    };

    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const d = drag;
      drag = null;
      edge = 0;
      ui.lane.classList.remove('lsm-snapped');
      ui.tip.classList.remove('lsm-snap');
      try { track.releasePointerCapture(d.id); } catch (_) { /* already released */ }
      track.classList.remove('lsm-dragging');
      if (!d.whole) {
        ui.thumb[d.which].classList.remove('lsm-grab');
        if (!ui.thumb[d.which].matches(':focus-visible')) A.hideTip();
      }
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
      const px = (t) => r.left + (toPct(t) / 100) * r.width;
      if (th) {
        which = th.dataset.which;
        off = e.clientX - px(l[which]);
      } else if (e.clientX > px(l.a) && e.clientX < px(l.b)) {
        // On the bar between the handles: dragging it moves the whole loop. A plain click does nothing.
        drag = { whole: true, id: e.pointerId, x0: e.clientX, moved: false, a0: l.a, t0: fromFrac(laneFrac(e.clientX)) };
        S.sliding = true;
        try { track.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        track.classList.add('lsm-dragging');
        return;
      } else {
        // Outside the loop, only a press close to a handle takes it (a stray click moves nothing).
        which = Math.abs(e.clientX - px(l.a)) <= Math.abs(e.clientX - px(l.b)) ? 'a' : 'b';
        if (Math.abs(e.clientX - px(l[which])) > 16) return;
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

    // Wheel: zoom around the pointer. Shift (or a sideways swipe) moves the zoomed window.
    track.addEventListener('wheel', (e) => {
      if (!ready()) return;
      e.preventDefault();
      const px = e.deltaMode === 1 ? 16 : 1;
      const sideways = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (sideways) {
        A.panView(((e.deltaX || e.deltaY) * px) * spanPerPx());
      } else {
        const factor = clamp(Math.exp(-e.deltaY * px * 0.0025), 0.6, 1.6);
        A.zoomView(factor, fromFrac(laneFrac(e.clientX)));
      }
    }, { passive: false });
    track.addEventListener('dblclick', (e) => {
      if (e.target.closest && e.target.closest('.lsm-thumb')) return;
      if (S.zoom) A.setZoom(false);
    });

    // The overview strip: a press centres the window there, dragging moves it.
    let mini = null;
    const miniTime = (x) => {
      const r = ui.mini.getBoundingClientRect();
      return r.width > 0 ? clamp((x - r.left) / r.width, 0, 1) * S.duration : 0;
    };
    ui.mini.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !ready()) return;
      mini = e.pointerId;
      try { ui.mini.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      A.centerView(miniTime(e.clientX));
    });
    ui.mini.addEventListener('pointermove', (e) => { if (e.pointerId === mini) A.centerView(miniTime(e.clientX)); });
    for (const t of ['pointerup', 'pointercancel']) ui.mini.addEventListener(t, () => { mini = null; });

    for (const w of ['a', 'b']) {
      const th = ui.thumb[w];
      th.addEventListener('keydown', (e) => {
        if (!ready()) return;
        const unit = e.altKey ? A.fineStep() : e.shiftKey ? 10 : 1;
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
    if (t.tagName === 'BUTTON') {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') return true;
      return !!t.closest('[role="toolbar"]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key);
    }
    if (t.getAttribute('role') === 'slider') return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key);
    return false;
  }

  // The row of chips is one Tab stop; the arrow keys move along it (Home / End jump to the ends).
  const toolbarItems = () => [...ui.chipRow.querySelectorAll('button')].filter((b) => !b.hidden && !b.closest('[hidden]'));

  function syncToolbar() {
    const items = toolbarItems();
    if (!items.length) return;
    const keep = items.includes(ui.rove) ? ui.rove : (ui.chips[S.sel] && ui.chips[S.sel].main) || items[0];
    for (const b of items) b.tabIndex = b === keep ? 0 : -1;
  }

  function bindToolbar(row) {
    row.addEventListener('focusin', (e) => {
      if (e.target.tagName === 'BUTTON') {
        ui.rove = e.target;
        syncToolbar();
      }
    });
    row.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const items = toolbarItems();
      const i = items.indexOf(focused());
      if (i < 0) return;
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : clamp(i + (e.key === 'ArrowRight' ? 1 : -1), 0, items.length - 1);
      items[next].focus();
    });
  }

  // The "more" menu: actions that are used less often than the buttons in the panel.
  function buildMenu() {
    const item = (label, run, hint) => {
      const b = el('button', { class: 'lsm-mi', type: 'button', role: 'menuitem' }, el('span', { text: label }), hint ? el('kbd', { text: hint }) : null);
      b.addEventListener('click', () => { A.closeMenu(); run(); });
      return b;
    };
    ui.miRename = item('Rename loop', () => A.startRename(S.sel));
    ui.miFine = item('Times to hundredths of a second', () => A.setFine(!P.fine));
    ui.miWave = item('Hide the waveform', () => A.setWave(!P.wave));
    ui.miStrip = item('Hide the strip while looping', () => A.setStrip(!P.strip));
    ui.miAfter = item('Add a loop right after this one', () => A.addLoopAfter());
    ui.miTap = item('Tap to mark sections', () => A.tapMark(), 'Shift+M');
    ui.miSort = item('Number loops by start time', () => A.sortLoops());
    ui.miDelete = item('Delete loop', () => A.removeLoop());
    const menu = el('div', { class: 'lsm-menu', role: 'menu', hidden: true },
      item('Skip this repetition', () => A.navigate('skipRep'), 'Shift+\\'),
      item('Restart this repetition', () => A.navigate('restart'), 'Shift+Z'),
      ui.miRename,
      ui.miAfter,
      ui.miTap,
      ui.miSort,
      ui.miFine,
      ui.miWave,
      ui.miStrip,
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
      ['Shift+M', 'Tap to mark: each press ends a section and starts the next'],
      ['Shift+1 … 9', 'Go to loop 1 … 9'],
    ];
    const list = el('div', { class: 'lsm-help-rows' });
    for (const [k, v] of rows) list.append(el('kbd', { text: k }), el('span', { text: v }));
    return el('div', { class: 'lsm-help', hidden: true }, el('div', { class: 'lsm-label', text: 'Keyboard shortcuts' }), list);
  }

  // Renaming in place: the chip's label turns into a text field.
  function startRename(i) {
    const chip = ui.chips[i];
    const l = S.loops[i];
    if (!chip || !l || chip.renaming) return;
    chip.renaming = true;
    const input = el('input', { class: 'lsm-rename', type: 'text', maxlength: String(NAME_MAX), autocomplete: 'off', spellcheck: 'false', 'aria-label': `Name of loop ${i + 1}`, placeholder: `Loop ${i + 1}` });
    input.value = l.name || '';
    chip.main.hidden = true;
    chip.root.append(input);
    input.focus();
    input.select();
    const finish = (save) => {
      if (!chip.renaming) return;
      chip.renaming = false;
      const text = input.value;
      input.remove();
      chip.main.hidden = false;
      if (save) A.setName(ui.chips.indexOf(chip), text);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  function openMenu() {
    if (!ready()) return;
    const many = S.loops.length > 1;
    ui.miRename.firstChild.textContent = many ? `Rename loop ${S.sel + 1}` : 'Rename the loop';
    ui.miSort.hidden = !many;
    ui.miWave.firstChild.textContent = !P.wave ? 'Show the waveform' : S.waveState === 'unavailable' ? 'Waveform: not available on this site' : 'Hide the waveform';
    ui.miStrip.firstChild.textContent = P.strip ? 'Hide the strip while looping' : 'Show a strip while looping';
    ui.miFine.firstChild.textContent = P.fine ? 'Round times to tenths of a second' : 'Times to hundredths of a second';
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
      else {
        A.openPanel();
        // Opened from the keyboard: put the focus inside, on the selected loop.
        if (e.detail === 0 && ui.chips[S.sel]) ui.chips[S.sel].main.focus({ preventScroll: true });
      }
    });

    ui.markBox = el('div', { class: floating ? 'lsm-marks lsm-float' : 'lsm-marks', hidden: true });
    ui.toast = el('div', { class: 'lsm-toast', role: 'status', 'aria-live': 'polite' });

    // Header: one chip per loop
    ui.add = el('button', { class: 'lsm-hb lsm-add', type: 'button', 'aria-label': 'Add a loop', title: 'Add a loop at the current time\nShift+click: right after this loop' }, icon(I.plus, 14));
    ui.add.addEventListener('click', (e) => (e.shiftKey ? A.addLoopAfter() : A.addLoop()));
    ui.chipRow = el('div', { class: 'lsm-chips', role: 'toolbar', 'aria-label': 'Loops' }, ui.add);
    bindToolbar(ui.chipRow);
    ui.more = el('button', { class: 'lsm-hb lsm-more', type: 'button', 'aria-label': 'More', title: 'More', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, icon(I.more, 16));
    ui.more.addEventListener('click', () => (ui.menu.hidden ? A.openMenu() : A.closeMenu()));
    const close = el('button', { class: 'lsm-hb', type: 'button', 'aria-label': 'Close', title: 'Close' }, icon(I.close, 16));
    close.addEventListener('click', A.closePanel);
    ui.grip = el('span', { class: 'lsm-grip', title: 'Drag to move (double-click: back to the usual place)' }, icon(I.grip, 14));
    const head = el('div', { class: 'lsm-head' }, ui.grip, ui.chipRow, ui.more, close);
    ui.menu = buildMenu();
    ui.notice = el('div', { class: 'lsm-notice', role: 'status' });
    const gotIt = el('button', { class: 'lsm-hint-btn', type: 'button', text: 'Got it' });
    gotIt.addEventListener('click', () => {
      P.hintSeen = true;
      A.rememberPrefs();
      A.render();
    });
    ui.hint = el('div', { class: 'lsm-hint', hidden: true }, el('span', { text: 'Tip: every shortcut is listed under ⋯' }), gotIt);

    // Slider
    ui.thumb.a = el('div', { class: 'lsm-thumb lsm-thumb-a', 'data-which': 'a', role: 'slider', tabindex: '0', 'aria-valuemin': '0', 'aria-label': 'Loop start', text: 'A' });
    ui.thumb.b = el('div', { class: 'lsm-thumb lsm-thumb-b', 'data-which': 'b', role: 'slider', tabindex: '0', 'aria-valuemin': '0', 'aria-label': 'Loop end', text: 'B' });
    ui.tip = el('div', { class: 'lsm-tip' });
    ui.ghostBox = el('div', { class: 'lsm-ghosts' });
    ui.play = el('div', { class: 'lsm-play' });
    ui.wave = el('canvas', { class: 'lsm-wave', hidden: true, 'aria-hidden': 'true' });
    ui.lane = el('div', { class: 'lsm-lane' },
      ui.wave, el('div', { class: 'lsm-rail' }), ui.ghostBox, el('div', { class: 'lsm-fill' }), ui.play,
      ui.thumb.a, ui.thumb.b, ui.tip);
    ui.track = el('div', { class: 'lsm-track', title: 'Drag the A and B handles, or the bar between them to move the whole loop' }, ui.lane);
    ui.len = el('span', { class: 'lsm-len' });
    ui.scaleStart = el('span', { text: '0:00' });
    ui.scaleEnd = el('span');
    ui.zoom = el('button', { class: 'lsm-zoom', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Zoom the slider on this loop', title: 'Zoom on this loop, or back to the whole video\nMouse wheel on the slider zooms freely · Shift+wheel moves · double-click resets' }, icon(I.zoom, 14));
    ui.zoom.addEventListener('click', () => A.setZoom(!S.zoom));
    // Overview of the whole media while zoomed in: the window is the bracket; drag it to move.
    ui.miniMarks = el('div', { class: 'lsm-mini-marks' });
    ui.miniWin = el('div', { class: 'lsm-mini-win' });
    ui.mini = el('div', { class: 'lsm-mini', hidden: true, title: 'Overview: drag to move the zoomed window' }, ui.miniMarks, ui.miniWin);
    const slider = el('div', { class: 'lsm-slider' }, ui.track, ui.mini,
      el('div', { class: 'lsm-scale' }, ui.scaleStart, el('span', { class: 'lsm-mid' }, ui.len, ui.zoom), ui.scaleEnd));

    // Timestamps
    ui.field.a = makeField('a', 'Start');
    ui.field.b = makeField('b', 'End');
    const fields = el('div', { class: 'lsm-row' }, ui.field.a.root, ui.field.b.root);

    // Join this loop to its neighbours: start where the previous loop ends, end where the next starts.
    ui.chainA = el('button', { class: 'lsm-chain', type: 'button' });
    ui.chainA.addEventListener('click', A.chainStart);
    ui.chainB = el('button', { class: 'lsm-chain', type: 'button' });
    ui.chainB.addEventListener('click', A.chainEnd);
    ui.snapRow = el('div', { class: 'lsm-snaprow', hidden: true }, ui.chainA, ui.chainB);

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
    // Speed of this loop: a step is 5%; the dim value is the player's own speed.
    ui.rateVal = el('output', { class: 'lsm-num lsm-val', 'aria-live': 'off' });
    const rMinus = el('button', { class: 'lsm-ib', type: 'button', 'aria-label': 'Slower', title: 'Slower (5%)' }, icon(I.minus, 14));
    const rPlus = el('button', { class: 'lsm-ib', type: 'button', 'aria-label': 'Faster', title: 'Faster (5%)' }, icon(I.plus, 14));
    ui.rateReset = el('button', { class: 'lsm-ib', type: 'button', 'aria-label': "Back to the player's own speed", title: "Back to the player's own speed" }, icon(I.reset, 14));
    holdRepeat(rMinus, () => A.stepRate(-1));
    holdRepeat(rPlus, () => A.stepRate(1));
    ui.rateReset.addEventListener('click', A.clearRate);
    const speedField = el('div', { class: 'lsm-field' },
      el('div', { class: 'lsm-label', text: 'Speed' }),
      el('div', { class: 'lsm-box' }, rMinus, ui.rateVal, rPlus, ui.rateReset));
    const opts = el('div', { class: 'lsm-row' }, countField, speedField);

    // Play the whole set of loops again once the last one is done.
    ui.setsVal = el('output', { class: 'lsm-num lsm-val', 'aria-live': 'off' });
    const sMinus = el('button', { class: 'lsm-ib', type: 'button', 'aria-label': 'Fewer rounds', title: 'Fewer rounds' }, icon(I.minus, 14));
    const sPlus = el('button', { class: 'lsm-ib', type: 'button', 'aria-label': 'More rounds', title: 'More rounds' }, icon(I.plus, 14));
    ui.setsInf = el('button', { class: 'lsm-ib lsm-inf', type: 'button', 'aria-label': 'Play the loops again and again', 'aria-pressed': 'false', title: 'Again and again', text: '∞' });
    ui.setsNote = el('span', { class: 'lsm-note' });
    holdRepeat(sMinus, () => { if (P.setsForever) A.setSetsForever(false); else A.setSets(P.sets - 1); });
    holdRepeat(sPlus, () => { if (P.setsForever) A.setSetsForever(false); else A.setSets(P.sets + 1); });
    ui.setsInf.addEventListener('click', () => A.setSetsForever(!P.setsForever));
    const rounds = el('div', { class: 'lsm-row lsm-opts lsm-rounds' },
      el('div', { class: 'lsm-field' },
        el('div', { class: 'lsm-label', text: 'Play all loops' }),
        el('div', { class: 'lsm-box' }, sMinus, ui.setsVal, sPlus, ui.setsInf)),
      ui.setsNote);

    // Gap between repetitions and count-in: whole seconds / half seconds.
    const stepper = (label, valueClass, minus, plus, extra) => {
      const out = el('output', { class: 'lsm-num lsm-val', 'aria-live': 'off' });
      const m = el('button', { class: 'lsm-ib', type: 'button', 'aria-label': `${label}: less` }, icon(I.minus, 14));
      const p = el('button', { class: 'lsm-ib', type: 'button', 'aria-label': `${label}: more` }, icon(I.plus, 14));
      holdRepeat(m, minus);
      holdRepeat(p, plus);
      return { out, field: el('div', { class: 'lsm-field' }, el('div', { class: 'lsm-label', text: label }), el('div', { class: 'lsm-box' }, m, out, p, extra || null)) };
    };
    const gap = stepper('Gap between plays', 'gap', () => A.setGap(P.gap - 0.5), () => A.setGap(P.gap + 0.5));
    ui.gapVal = gap.out;
    ui.tickBtn = el('button', { class: 'lsm-ib lsm-inf', type: 'button', 'aria-label': 'Tick during the count-in', 'aria-pressed': 'true', title: 'Tick during the count-in', text: '♪' });
    ui.tickBtn.addEventListener('click', () => A.setTick(!P.tick));
    const count = stepper('Count-in', 'count', () => A.setCountIn(P.countIn - 1), () => A.setCountIn(P.countIn + 1), ui.tickBtn);
    ui.countVal = count.out;

    // Speed ramp: + step % every N repetitions, up to a target.
    ui.rampBtn = el('button', { class: 'lsm-ramp-toggle', type: 'button', 'aria-pressed': 'false', title: 'Speed up a little every few repetitions' }, el('span', { text: 'Off' }));
    ui.rampBtn.addEventListener('click', () => A.setRamp({ on: !P.ramp.on }));
    ui.rampIn = {};
    const rampInput = (key, label, width) => {
      const input = el('input', { class: 'lsm-mini-num', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: String(width), 'aria-label': label });
      const commit = () => {
        const n = parseInt(input.value, 10);
        if (n >= 0) A.setRamp({ [key]: n });
        else A.render();
      };
      input.addEventListener('change', commit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); input.select(); } });
      input.addEventListener('focus', () => setTimeout(() => { if (focused() === input) input.select(); }, 0));
      input.addEventListener('input', () => { input.value = input.value.replace(/\D+/g, '').slice(0, width); });
      ui.rampIn[key] = input;
      return input;
    };
    ui.ramp = el('div', { class: 'lsm-ramp lsm-off' },
      '+', rampInput('step', 'Percent added each time', 2), '% every', rampInput('every', 'Repetitions between steps', 2), 'plays, up to', rampInput('target', 'Speed to stop at, in percent', 3), '%');
    ui.practice = el('div', { class: 'lsm-practice', hidden: true },
      rounds,
      el('div', { class: 'lsm-row' }, gap.field, count.field),
      el('div', { class: 'lsm-field' }, el('div', { class: 'lsm-label', text: 'Speed ramp' }), el('div', { class: 'lsm-ramp-row' }, ui.rampBtn, ui.ramp)));
    ui.practiceBtn = el('button', { class: 'lsm-disclose', type: 'button', 'aria-expanded': 'false', text: '▸ Practice options' });
    ui.practiceBtn.addEventListener('click', A.togglePractice);
    const whenDone = el('div', { class: 'lsm-row1' }, afterField);

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

    ui.body = el('fieldset', { class: 'lsm-body' }, slider, fields, ui.snapRow, opts, whenDone, ui.practiceBtn, ui.practice, ui.status, actions);
    ui.strip = buildStrip();
    ui.help = buildHelp();
    ui.panel = el('div', { class: 'lsm-panel', role: 'dialog', 'aria-label': 'Section loop' }, head, ui.menu, ui.hint, ui.notice, ui.body, ui.help);

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

  return { bindSlider, buildUI, syncToolbar, startRename, openMenu, closeMenu, toggleHelp, cancelEdits, commitEdits, holdRepeat, makeField, shake, wheelSteps };
}
