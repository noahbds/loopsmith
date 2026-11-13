// Drawing the state into the panel, the chips, the markers and the toast.

import { MAX_LOOPS, PALETTE } from '../core/constants.js';
import { clamp, round1, fmt } from '../core/util.js';
import * as E from '../core/engine.js';
import { el, setText, setAttr, setStyle, pct } from '../ui/dom.js';

export function createRender(A) {
  const { S, P, ui, adapter, floating, L, cur, describe, exhausted, fitView, fmtT, isAd, isDefaultSet, ready, toPct, viewEnd, viewStart } = A;

  const live = { notice: null, stale: true, loop: null, next: null, done: -1, prog: -1, px: -1, out: null };

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
      if (S.active && live.stale) setText(ui.mainText, 'Turn off'); // no position to report yet
      return;
    }

    const t = v.currentTime;
    if (S.active) {
      const guard = A.turnGuard();
      const l = A.loopAt(t, guard);
      const next = l ? null : A.nextLoop(t);
      const done = l ? l.done : -1;
      if (live.stale || l !== live.loop || next !== live.next || done !== live.done) {
        live.stale = false;
        live.loop = l;
        live.next = next;
        live.done = done;
        const many = S.loops.length > 1;
        let text;
        let badge = '·';
        if (l) {
          const n = l.infinite ? `${l.done + 1} · ∞` : `${Math.min(l.done + 1, l.count)} / ${l.count}`;
          text = many ? `Loop ${S.loops.indexOf(l) + 1} · ${n}` : `Rep ${n}`;
          badge = l.infinite ? '∞' : String(Math.max(1, l.count - l.done));
        } else if (next) {
          text = many ? `Next: loop ${S.loops.indexOf(next) + 1}` : 'Loop ahead';
        } else {
          text = 'Past the loops';
        }
        ui.mainText.textContent = 'Turn off · ' + text;
        ui.badge.textContent = badge;
      }
      if (S.open) {
        const prog = l ? Math.round(clamp((t - l.a) / Math.max(0.01, A.loopEnd(l, guard) - l.a), 0, 1) * 500) : 0;
        if (prog !== live.prog) {
          live.prog = prog;
          ui.mainFill.style.transform = `scaleX(${prog / 500})`;
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

  function makeChip() {
    const num = el('b');
    const meta = el('span');
    const root = el('button', { class: 'lsm-chip', type: 'button' }, el('i'), num, meta);
    const chip = { root, num, meta };
    root.addEventListener('click', () => A.selectLoop(ui.chips.indexOf(chip)));
    ui.chipRow.insertBefore(root, ui.add);
    return chip;
  }

  function renderLoops(ok) {
    const loops = ok ? S.loops : [];
    const d = S.duration;
    const lanes = E.lanesOf(loops);
    const many = loops.length > 1;

    resize(ui.chips, loops.length, makeChip);
    resize(ui.ghosts, loops.length, () => ui.ghostBox.appendChild(el('div', { class: 'lsm-ghost' })));
    resize(ui.marks, loops.length, () => ui.markBox.appendChild(el('div', { class: 'lsm-mark' })));

    loops.forEach((l, i) => {
      const rgb = PALETTE[l.c];
      const selected = i === S.sel;
      const spent = S.active && l.on && exhausted(l);
      let meta;
      if (!l.on) meta = 'off';
      else if (!S.active) meta = l.infinite ? '∞' : `×${l.count}`;
      else if (spent) meta = '✓';
      else meta = l.infinite ? `${l.done + 1}·∞` : `${Math.min(l.done + 1, l.count)}/${l.count}`;

      const chip = ui.chips[i];
      setStyle(chip.root, '--cv', rgb);
      setAttr(chip.root, 'aria-pressed', String(selected));
      chip.root.classList.toggle('lsm-spent', spent);
      chip.root.classList.toggle('lsm-muted', !l.on);
      setAttr(chip.root, 'title', `Loop ${i + 1}: ${describe(l)}${l.on ? '' : ' · switched off'}\n${selected ? 'Click again to jump to its start' : 'Click to edit'}`);
      setText(chip.num, String(i + 1));
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
    const on = ok && cur().on;
    const trashTitle = many ? `Remove loop ${S.sel + 1}` : 'Reset this loop to the whole video';
    ui.add.hidden = !ok || loops.length >= MAX_LOOPS;
    ui.trash.hidden = !ok;
    setAttr(ui.trash, 'title', trashTitle);
    setAttr(ui.trash, 'aria-label', trashTitle);
    ui.power.hidden = !ok;
    setAttr(ui.power, 'aria-pressed', String(on));
    setAttr(ui.power, 'title', on ? `Switch ${which} off — it is kept, just not played` : `Switch ${which} back on`);
    setAttr(ui.power, 'aria-label', many ? `Loop ${S.sel + 1} switched on` : 'Loop switched on');
    const startTitle = `Play ${which} from its start`;
    setAttr(ui.start, 'title', `${startTitle}  (Shift+S)\nTurns looping on if it is off`);
    setAttr(ui.start, 'aria-label', startTitle);
    ui.markBox.hidden = !(ok && (S.active || !isDefaultSet()) && (!floating || L.barPlaced));
    ui.markBox.classList.toggle('lsm-live', S.active);
  }

  function render() {
    const ok = ready();
    const l = ok ? cur() : null;
    if (!ok) S.zoom = false;
    else if (S.zoom && !S.sliding && (l.a < S.v0 || l.b > S.v1)) fitView();
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
      setAttr(th, 'aria-valuenow', ok ? String(round1(l[w])) : '0');
      setAttr(th, 'aria-valuetext', shown);
    }
    setText(ui.len, ok ? `Length ${fmt(l.b - l.a, false)}` : '');
    setText(ui.scaleStart, ok ? fmtT(viewStart()) : '0:00');
    setText(ui.scaleEnd, ok ? fmtT(viewEnd()) : '–:––');
    setAttr(ui.zoom, 'aria-pressed', String(S.zoom));
    renderTip();

    const inf = ok && l.infinite;
    const count = !ok ? '' : inf ? '∞' : String(l.count);
    if (!ui.countState.editing && ui.count.value !== count) ui.count.value = count;
    ui.count.readOnly = inf;
    setAttr(ui.inf, 'aria-pressed', String(inf));
    setAttr(ui.seg, 'data-v', P.after);
    ui.seg.classList.toggle('lsm-dim', ok && S.loops.every((x) => !x.on || x.infinite));
    for (const b of ui.segBtns) setAttr(b, 'aria-pressed', String(b.dataset.v === P.after));

    ui.main.classList.toggle('lsm-on', S.active);
    setAttr(ui.main, 'aria-pressed', String(S.active));
    live.stale = true; // the run status below is rebuilt by renderLive()
    if (!S.active) {
      live.prog = -1;
      ui.mainFill.style.transform = '';
      setText(ui.mainText, 'Turn looping on');
    }

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

  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add('lsm-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('lsm-show'), 1900);
  }

  return { hideTip, live, makeChip, render, renderLive, renderLoops, renderTip, replay, resize, showTip, toast };
}
