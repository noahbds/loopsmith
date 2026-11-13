// Keyboard shortcuts.



export function createHotkeys(A) {
  const { S, floating, engaged } = A;

  function isTyping(e) {
    const t = (e.composedPath && e.composedPath()[0]) || e.target;
    return !!t && t.nodeType === 1 && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
  }

  function onHotkey(e) {
    if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (isTyping(e)) return;
    const k = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : String(e.code || '').replace(/^Key/, '').toLowerCase();
    if (k !== 'a' && k !== 'b' && k !== 'r' && k !== 's') return;
    if (!S.player || !S.player.isConnected) return;
    // On an arbitrary page, only once the user has played that media (or opened the panel).
    if (floating ? !(S.open || engaged(S.player)) : !S.player.getClientRects().length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (k === 'r') {
      if (S.active) A.stopRun();
      else A.armRun();
    } else if (k === 's') {
      A.startLoop();
    } else {
      A.markNow(k);
    }
  }

  return { isTyping, onHotkey };
}
