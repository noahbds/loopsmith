import { boot } from '../boot.js';
import { backend } from '../platform/extension.js';

const api = globalThis.browser || globalThis.chrome;

function sendState(state) {
  try {
    const p = api.runtime.sendMessage({ type: 'loopsmith:state', ...state });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (_) { /* extension context invalidated */ }
}

boot(backend, { lazy: true, onState: sendState }).then((app) => {
  if (!app) return;
  // Messages from the popup or browser commands: only a frame that holds a player answers.
  api.runtime.onMessage.addListener((msg, _sender, send) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'loopsmith:diagnostics') {
      const report = app.diagnostics();
      if (report.hasPlayer) send(report);
    } else if (msg.type === 'loopsmith:status') {
      const st = app.status();
      if (st.hasPlayer) send(st);
    } else if (msg.type === 'loopsmith:control') {
      const st = app.status();
      if (!st.hasPlayer) return;
      app.control(msg.action, msg.arg);
      send(app.status());
    }
  });
});
