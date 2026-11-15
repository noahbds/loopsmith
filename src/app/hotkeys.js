// Keyboard shortcuts (which key is which action: src/core/keys.js).

import { hotkeyAction } from '../core/keys.js';

export function createHotkeys(A) {
  const { S, floating, engaged } = A;

  function isTyping(e) {
    const t = (e.composedPath && e.composedPath()[0]) || e.target;
    return !!t && t.nodeType === 1 && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
  }

  // Whether the action has something to act on: the media for marking, a loop for the rest.
  function usable(hit) {
    if (!A.mediaOk()) return false;
    if (hit.action === 'markA' || hit.action === 'markB' || hit.action === 'tap') return true;
    if (hit.action === 'goto') return hit.index < S.loops.length;
    return S.loops.length > 0;
  }

  function onHotkey(e) {
    if (e.repeat || isTyping(e)) return;
    const hit = hotkeyAction(e);
    if (!hit) return;
    if (!S.player || !S.player.isConnected) return;
    // On an arbitrary page, only once the user has played that media (or opened the panel).
    if (floating ? !(S.open || engaged(S.player)) : !S.player.getClientRects().length) return;
    // A shortcut with nothing to act on leaves the key to the site.
    if (!usable(hit)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    switch (hit.action) {
      case 'toggle': if (S.active) A.stopRun(); else A.armRun(); break;
      case 'start': A.startLoop(); break;
      case 'markA': A.markNow('a'); break;
      case 'markB': A.markNow('b'); break;
      case 'next': A.navigate('skipLoop'); break;
      case 'prev': A.navigate('prev'); break;
      case 'skipRep': A.navigate('skipRep'); break;
      case 'restart': A.navigate('restart'); break;
      case 'tap': A.tapMark(); break;
      case 'goto': A.navigate('goto', hit.index); break;
    }
  }

  return { onHotkey };
}
