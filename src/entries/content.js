import { boot } from '../boot.js';
import { backend } from '../platform/extension.js';

const api = globalThis.browser || globalThis.chrome;

boot(backend).then((app) => {
  if (!app) return;
  // The popup's "Copy diagnostics" asks every frame; only a frame that holds a player answers.
  api.runtime.onMessage.addListener((msg, _sender, send) => {
    if (!msg || msg.type !== 'loopsmith:diagnostics') return;
    const report = app.diagnostics();
    if (report.hasPlayer) send(report);
  });
});
