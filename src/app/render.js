// Drawing the state into the panel, the chips, the markers and the toast.

import { MAX_LOOPS, PALETTE } from '../core/constants.js';
import { clamp, roundT, fmt } from '../core/util.js';
import * as V from '../core/view.js';
import { rateText } from '../core/practice.js';
import * as E from '../core/engine.js';
import { el, setText, setAttr, setStyle, pct } from '../ui/dom.js';

export function createRender(A) {
  const { S, P, ui, adapter, floating, L, cur, describe, digits, finished, fitView, fmtT, focused, isAd, isDefaultSet, loopLabel, ready, roundText, stripWanted, toPct, viewEnd, viewStart } = A;

  const live = { wait: '', round: 1, notice: null, stale: true, loop: null, next: null, done: -1, prog: -1, px: -1, out: null };

  // Cheap, frequent updates: playhead, run status, progress fill, transient notices.
  function renderLive() {
    const v = S.video;
    const ad = isAd();
    let notice = '';
    if (S.live) notice = 'Live streams can’t be looped.';
    else if (ad) notice = S.active ? 'Ad playing — the loops pick up right after.' : 'Ad playing…';
    else if (!S.ranged) notice = S.duration > 0 ? 'This video is too short to loop a section.' : adapter.waitingText || 'Waiting for the video…';
    if (notice !== live.notice) {
      live.notice = notice;
      ui.notice.textContent = notice;
      ui.notice.classList.toggle('lsm-show', !!notice);
    }
    if (!v || !ready() || ad || !S.trusted) {
      return;
    }

    A.waveTick();
    const t = v.currentTime;
    if (S.active) {
      const guard = A.turnGuard();
      const l = A.loopAt(t, guard);
      const next = l ? null : A.nextLoop(t);
      const done = l ? l.done : -1;
      const wait = S.waiting ? (S.waiting.kind === 'count' ? `Starting in ${S.waiting.left}` : 'Next repetition…') : '';
      if (live.stale || l !== live.loop || next !== live.next || done !== live.done || S.round !== live.round || wait !== live.wait) {
        live.round = S.round;
        live.wait = wait;
        live.stale = false;
        live.loop = l;
        live.next = next;
        live.done = done;
        const many = S.loops.length > 1;
        let text;
        let badge = '·';
        if (l) {
          const n = l.infinite ? `${l.done + 1} · ∞` : `${Math.min(l.done + 1, l.count)} / ${l.count}`;
          text = many ? `${loopLabel(l)} · ${n}` : `Rep ${n}`;
          badge = l.infinite ? '∞' : String(Math.max(1, l.count - l.done));
        } else if (next) {
          text = many ? `Next: ${next.name || `loop ${S.loops.indexOf(next) + 1}`}` : 'Loop ahead';
        } else {
          text = 'Past the loops';
        }
        text += roundText();
        if (S.baseRate != null && S.ownRate != null && l) text += ` · ${rateText(S.ownRate)}`;
        if (wait) text = wait;
        setText(ui.statusText, text);
        setText(ui.stripText, text);
        setStyle(ui.strip, '--acv', PALETTE[(l || next || cur()).c]);
        ui.badge.textContent = badge;
      }
      if (S.open || stripWanted()) {
        const prog = l ? Math.round(clamp((t - l.a) / Math.max(0.01, A.loopEnd(l, guard) - l.a), 0, 1) * 500) : 0;
        if (prog !== live.prog) {
          live.prog = prog;
          const scale = `scaleX(${prog / 500})`;
          ui.statusFill.style.transform = scale;
          ui.stripFill.style.transform = scale;
        }
      }
    }
    if (S.open) {
      const out = t < viewStart() - 0.05 || t > viewEnd() + 0.05;
      if (out !== live.out) {
        live.out = out;
        ui.play.hidden = out;
      }
      // Whole device pixels: on a long video the playhead only needs repainting about once a second.
      const px = Math.round((toPct(t) / 100) * S.laneW * S.dpr) / S.dpr;
      if (px !== live.px) {
        live.px = px;
        ui.play.style.transform = `translateX(${px}px)`;
      }
    }
  }

  let tipWhich = null;

  function showTip(which) {
    tipWhich = which;
    ui.tip.classList.add('lsm-show');
    renderTip();
  }

  function hideTip() {
    tipWhich = null;
    ui.tip.classList.remove('lsm-show');
  }

  function renderTip() {
    if (!tipWhich || !ready()) return;
    setText(ui.tip, fmtT(cur()[tipWhich]));
    setStyle(ui.lane, '--tip', pct(toPct(cur()[tipWhich])));
  }

  // Grows or shrinks a list of DOM nodes to `n` items.
  function resize(list, n, create) {
    while (list.length > n) {
      const gone = list.pop();
      (gone.root || gone).remove();
    }
    while (list.length < n) list.push(create());
  }

  // A chip is two buttons: the dot switches the loop on or off, the rest selects it.
  function makeChip() {
    const num = el('b');
    const name = el('em', { class: 'lsm-name' });
    const meta = el('span');
    const dot = el('button', { class: 'lsm-dot', type: 'button' }, el('i'));
    const main = el('button', { class: 'lsm-chip-main', type: 'button' }, num, name, meta);
    const root = el('div', { class: 'lsm-chip', role: 'group' }, dot, main);
    const chip = { root, num, name, meta, dot, main };
    main.addEventListener('dblclick', () => A.startRename(ui.chips.indexOf(chip)));
    dot.addEventListener('click', () => A.toggleLoopAt(ui.chips.indexOf(chip)));
    main.addEventListener('click', () => A.selectLoop(ui.chips.indexOf(chip)));
    root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const i = ui.chips.indexOf(chip);
      if (i !== S.sel) A.selectLoop(i);
      A.openMenu();
    });
    ui.chipRow.insertBefore(root, ui.add);
    return chip;
  }

  // Open menu: a click on the page or Escape closes it (see controls.js).
  function setMenuOpen(open) {
    setAttr(ui.more, 'aria-expanded', String(open));
  }

  function renderLoops(ok) {
    const loops = ok ? S.loops : [];
    const d = S.duration;
    const lanes = E.lanesOf(loops);
    const many = loops.length > 1;

    resize(ui.chips, loops.length, makeChip);
    resize(ui.ghosts, loops.length, () => ui.ghostBox.appendChild(el('div', { class: 'lsm-ghost' })));
    resize(ui.marks, loops.length, () => ui.markBox.appendChild(el('div', { class: 'lsm-mark' })));
    resize(ui.miniTicks, loops.length, () => ui.miniMarks.appendChild(el('i')));

    loops.forEach((l, i) => {
      const rgb = PALETTE[l.c];
      const selected = i === S.sel;
      const spent = S.active && l.on && finished(l);
      let meta;
      if (!l.on) meta = 'off';
      else if (!S.active) meta = l.infinite ? '∞' : `×${l.count}`;
      else if (spent) meta = '✓';
      else meta = l.infinite ? `${l.done + 1}·∞` : `${Math.min(l.done + 1, l.count)}/${l.count}`;

      const chip = ui.chips[i];
      setStyle(chip.root, '--cv', rgb);
      setAttr(chip.main, 'aria-pressed', String(selected));
      setAttr(chip.dot, 'aria-pressed', String(l.on));
      setAttr(chip.dot, 'aria-label', `Loop ${i + 1} ${l.on ? 'switched on' : 'switched off'}`);
      setAttr(chip.dot, 'title', l.on ? `Switch loop ${i + 1} off. It is kept, just not played.` : `Switch loop ${i + 1} back on`);
      chip.root.classList.toggle('lsm-sel', selected);
      chip.root.classList.toggle('lsm-spent', spent);
      chip.root.classList.toggle('lsm-muted', !l.on);
      setAttr(chip.main, 'title', `${l.name ? `${l.name} (loop ${i + 1})` : `Loop ${i + 1}`}: ${describe(l)}${l.on ? '' : ' · switched off'}${l.skip ? ' · skipped' : ''}\n${selected ? 'Click again to jump to its start' : 'Click to edit'} · double-click to rename`);
      setText(chip.num, String(i + 1));
      setText(chip.name, l.name || '');
      chip.name.hidden = !l.name;
      setText(chip.meta, meta);

      const ghost = ui.ghosts[i];
      const shown = many && !selected && l.b > viewStart() && l.a < viewEnd();
      ghost.hidden = !shown;
      ghost.classList.toggle('lsm-muted', !l.on);
      if (shown) {
        const ga = toPct(l.a);
        setStyle(ghost, 'left', pct(ga));
        setStyle(ghost, 'width', pct(Math.max(0, toPct(l.b) - ga)));
        setStyle(ghost, '--cv', rgb);
        setStyle(ghost, '--lane', String(lanes[i] % 2));
      }

      const tick = ui.miniTicks[i];
      setStyle(tick, 'left', pct((l.a / d) * 100));
      setStyle(tick, 'width', pct(Math.max(0.6, ((l.b - l.a) / d) * 100)));
      setStyle(tick, '--cv', rgb);
      tick.classList.toggle('lsm-muted', !l.on);

      const mark = ui.marks[i];
      setStyle(mark, 'left', pct((l.a / d) * 100));
      setStyle(mark, 'width', pct(((l.b - l.a) / d) * 100));
      setStyle(mark, '--cv', rgb);
      setStyle(mark, '--lane', String(Math.min(lanes[i], 3)));
      mark.classList.toggle('lsm-sel', selected || !many);
      mark.classList.toggle('lsm-spent', spent);
      mark.classList.toggle('lsm-muted', !l.on);
    });

    const which = many ? `loop ${S.sel + 1}` : 'this loop';
    ui.add.hidden = !ok || loops.length >= MAX_LOOPS;
    ui.more.hidden = !ok;
    if (!ok) A.closeMenu();
    const startTitle = `Play ${which} from its start`;
    setAttr(ui.start, 'title', `${startTitle}  (Shift+S)\nTurns looping on if it is off`);
    setAttr(ui.start, 'aria-label', startTitle);
    A.syncToolbar();
    A.waveGate();
    A.drawWave();
    ui.markBox.hidden = !(ok && (S.active || !isDefaultSet()) && (!floating || L.barPlaced));
    ui.markBox.classList.toggle('lsm-live', S.active);
  }

  // The two buttons that join the loop to its neighbours (shown when there is something to join to).
  function renderChain(ok) {
    const { prev, next } = ok ? V.neighbours(S.loops, S.sel) : { prev: null, next: null };
    const l = ok ? cur() : null;
    const min = P.fine ? 0.2 : 0.5;
    const showA = !!prev && Math.abs(prev.b - l.a) > 0.001 && prev.b < l.b - min;
    const showB = !!next && Math.abs(next.a - l.b) > 0.001 && next.a > l.a + min;
    ui.chainA.hidden = !showA;
    ui.chainB.hidden = !showB;
    ui.snapRow.hidden = !(showA || showB);
    if (showA) {
      setText(ui.chainA, `⇤ Start after ${loopLabel(prev)}`);
      setAttr(ui.chainA, 'title', `Start this loop at ${fmtT(prev.b)}, right where ${loopLabel(prev)} ends`);
    }
    if (showB) {
      setText(ui.chainB, `End before ${loopLabel(next)} ⇥`);
      setAttr(ui.chainB, 'title', `End this loop at ${fmtT(next.a)}, right where ${loopLabel(next)} starts`);
    }
  }

  function render() {
    const ok = ready();
    const l = ok ? cur() : null;
    if (!ok) S.zoom = false;
    else if (S.zoom && !S.sliding && !S.panned && (l.a < S.v0 || l.b > S.v1)) fitView();
    const pa = ok ? toPct(l.a) : 0;
    const pb = ok ? toPct(l.b) : 100;

    ui.body.disabled = !ok;
    ui.panel.classList.toggle('lsm-off', !ok);
    ui.panel.classList.toggle('lsm-running', S.active);
    ui.panel.classList.toggle('lsm-muted', ok && !l.on);
    setStyle(ui.panel, '--acv', PALETTE[ok ? l.c : 0]);
    setStyle(ui.lane, '--a', pct(pa));
    setStyle(ui.lane, '--b', pct(pb));

    for (const w of ['a', 'b']) {
      const f = ui.field[w];
      const shown = ok ? fmtT(l[w]) : '';
      if (!f.editing && f.input.value !== shown) f.input.value = shown;
      const th = ui.thumb[w];
      th.tabIndex = ok ? 0 : -1;
      setAttr(th, 'aria-valuemax', String(Math.round(S.duration)));
      setAttr(th, 'aria-valuenow', ok ? String(roundT(l[w], digits())) : '0');
      setAttr(th, 'aria-valuetext', shown);
    }
    setText(ui.len, ok ? `Length ${fmt(l.b - l.a, false, digits())}` : '');
    setText(ui.scaleStart, ok ? fmtT(viewStart()) : '0:00');
    setText(ui.scaleEnd, ok ? fmtT(viewEnd()) : '–:––');
    setAttr(ui.zoom, 'aria-pressed', String(S.zoom));
    ui.mini.hidden = !(ok && S.zoom);
    if (ok && S.zoom) {
      setStyle(ui.miniWin, 'left', pct((S.v0 / S.duration) * 100));
      setStyle(ui.miniWin, 'width', pct(((S.v1 - S.v0) / S.duration) * 100));
    }
    renderChain(ok);
    renderTip();

    const inf = ok && l.infinite;
    const count = !ok ? '' : inf ? '∞' : String(l.count);
    if (!ui.countState.editing && ui.count.value !== count) ui.count.value = count;
    ui.count.readOnly = inf;
    setAttr(ui.inf, 'aria-pressed', String(inf));
    setAttr(ui.seg, 'data-v', P.after);
    // Speed
    const own = ok && Number.isFinite(l.rate);
    setText(ui.rateVal, own ? rateText(l.rate) : rateText((S.video && S.video.playbackRate) || 1));
    ui.rateVal.classList.toggle('lsm-dimmed', !own);
    ui.rateReset.hidden = !own;
    setAttr(ui.rateVal, 'title', own ? 'This loop plays at this speed' : "The player's own speed (this loop doesn't change it)");
    // Practice options
    ui.practiceBtn.setAttribute('aria-expanded', String(P.practiceOpen));
    setText(ui.practiceBtn, P.practiceOpen ? '▾ Practice options' : '▸ Practice options');
    ui.practice.hidden = !P.practiceOpen;
    setText(ui.gapVal, P.gap ? `${P.gap} s` : 'off');
    setText(ui.countVal, P.countIn ? `${P.countIn} s` : 'off');
    setAttr(ui.tickBtn, 'aria-pressed', String(P.tick));
    ui.tickBtn.hidden = !P.countIn;
    setAttr(ui.rampBtn, 'aria-pressed', String(P.ramp.on));
    setText(ui.rampBtn.firstChild, P.ramp.on ? 'On' : 'Off');
    ui.ramp.classList.toggle('lsm-off', !P.ramp.on);
    for (const [k, input] of Object.entries(ui.rampIn)) if (focused() !== input && input.value !== String(P.ramp[k])) input.value = String(P.ramp[k]);
    setText(ui.setsVal, P.setsForever ? '∞' : `${P.sets}×`);
    setAttr(ui.setsInf, 'aria-pressed', String(P.setsForever));
    setText(ui.setsNote, P.setsForever ? 'Then starts over, again and again' : P.sets > 1 ? `Then starts over: ${P.sets} rounds in all` : 'Stops after the last loop');
    ui.seg.classList.toggle('lsm-dim', ok && S.loops.every((x) => !x.on || x.infinite));
    for (const b of ui.segBtns) setAttr(b, 'aria-pressed', String(b.dataset.v === P.after));

    ui.main.classList.toggle('lsm-on', S.active);
    setAttr(ui.main, 'aria-pressed', String(S.active));
    setText(ui.mainText, S.active ? 'Turn off' : 'Turn looping on');
    ui.status.hidden = !S.active;
    ui.hint.hidden = P.hintSeen;
    live.stale = true; // the run status below is rebuilt by renderLive()
    if (!S.active) {
      live.prog = -1;
      ui.statusFill.style.transform = '';
      ui.stripFill.style.transform = '';
    }

    // The strip: shown while looping with the editor closed.
    const strip = stripWanted();
    if (strip !== ui.strip.classList.contains('lsm-open')) {
      ui.strip.classList.toggle('lsm-open', strip);
      if (strip) A.place();
    }
    setStyle(ui.strip, '--acv', PALETTE[ok ? l.c : 0]);

    ui.btn.classList.toggle('lsm-active', S.active);
    setAttr(ui.btn, 'aria-expanded', String(S.open));
    setAttr(ui.btn, 'aria-pressed', String(S.active));
    A.updatePill();

    renderLoops(ok);
    renderLive();
  }

  function replay(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth; // restart the CSS animation
    node.classList.add(cls);
  }

  let toastTimer = 0;

  // A short message over the video. With an action ({ label, run }) it stays a little longer and
  // shows a button, e.g. "Undo".
  function toast(msg, action) {
    ui.toast.replaceChildren(el('span', { text: msg }));
    ui.toast.classList.toggle('lsm-act', !!action);
    if (action) {
      const b = el('button', { class: 'lsm-toast-btn', type: 'button', text: action.label });
      b.addEventListener('click', () => {
        ui.toast.classList.remove('lsm-show');
        action.run();
      });
      ui.toast.append(b);
    }
    ui.toast.classList.add('lsm-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('lsm-show'), action ? 6000 : 1900);
  }

  return { hideTip, live, makeChip, setMenuOpen, render, renderLive, renderLoops, renderTip, replay, resize, showTip, toast };
}
