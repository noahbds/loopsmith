// Styles. LIGHT_CSS goes into the page (the toolbar button and the markers live in the site's own
// DOM); SHADOW_CSS lives inside the shadow root that holds the panel and the toast.

export const LIGHT_CSS = `
.lsm-btn{position:relative;display:inline-flex!important;align-items:center;justify-content:center;vertical-align:top}
.lsm-btn>svg{width:24px!important;height:24px!important;padding:0!important;flex:none;pointer-events:none;transition:color .2s,transform .25s cubic-bezier(.3,1.5,.5,1)}
.lsm-btn>svg path{fill:currentColor!important}
.lsm-btn[aria-expanded="true"]>svg{transform:scale(1.12)}
.lsm-btn.lsm-active>svg{color:#3ea6ff}
.lsm-badge{position:absolute;top:3px;right:5px;min-width:14px;height:14px;padding:0 3px;box-sizing:border-box;border-radius:7px;background:#3ea6ff;color:#06121f;font:700 9px/14px Roboto,Arial,sans-serif;text-align:center;transform:scale(0);transition:transform .2s cubic-bezier(.3,1.5,.5,1);pointer-events:none}
.lsm-btn.lsm-active .lsm-badge{transform:scale(1)}
.lsm-btn.lsm-active .lsm-badge.lsm-pop{animation:lsm-pop .4s}
.lsm-marks{position:absolute;left:0;right:0;top:0;height:100%;z-index:44;pointer-events:none}
.lsm-marks[hidden]{display:none}
.lsm-mark{position:absolute;top:calc(-7px - var(--lane,0) * 5px);height:3px;min-width:2px;border-radius:2px;background:rgb(var(--cv));opacity:.6;transition:opacity .2s,box-shadow .2s}
.lsm-mark::before,.lsm-mark::after{content:"";position:absolute;top:0;width:2px;height:calc(13px + var(--lane,0) * 5px);border-radius:1px;background:inherit}
.lsm-mark::before{left:0}
.lsm-mark::after{right:0}
.lsm-mark.lsm-sel{opacity:.95}
.lsm-marks.lsm-live .lsm-mark{opacity:1;box-shadow:0 0 6px rgba(var(--cv),.8)}
.lsm-marks.lsm-live .lsm-mark.lsm-spent{opacity:.35;box-shadow:none}
.lsm-mark.lsm-muted,.lsm-marks.lsm-live .lsm-mark.lsm-muted{opacity:.25;box-shadow:none}
@keyframes lsm-pop{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.lsm-btn *,.lsm-mark{animation:none!important;transition-duration:.01s!important}}
`;

// The marker rules apply in both places: on the site's bar (light DOM) and in the overlay.
const MARKS_CSS = () => LIGHT_CSS.split('\n').filter((l) => /^\.lsm-marks?\b/.test(l)).join('\n');

export const SHADOW_CSS = `
:host{all:initial;display:contents}
.lsm-pill{position:absolute;top:var(--lsm-pill-top,10px);right:10px;z-index:2201;display:grid;place-items:center;width:40px;height:40px;margin:0;padding:0;border:0;border-radius:50%;background:rgba(24,24,27,.88);color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.4),inset 0 0 0 1px rgba(255,255,255,.14);cursor:pointer;pointer-events:none;opacity:0;transform:scale(.85);transition:opacity .18s,transform .18s,background .15s;-webkit-appearance:none;appearance:none}
.lsm-pill.lsm-show,.lsm-pill:focus-visible{opacity:1;transform:none;pointer-events:auto}
.lsm-pill:hover{background:rgba(44,44,50,.96)}
.lsm-pill:focus-visible{outline:2px solid #3ea6ff;outline-offset:2px}
.lsm-pill>svg{display:block;width:22px;height:22px;pointer-events:none;transition:color .2s,transform .25s cubic-bezier(.3,1.5,.5,1)}
.lsm-pill>svg path{fill:currentColor}
.lsm-pill[aria-expanded="true"]>svg{transform:scale(1.12)}
.lsm-pill.lsm-active>svg{color:#3ea6ff}
.lsm-pill .lsm-badge{position:absolute;top:-3px;right:-3px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:#3ea6ff;color:#06121f;font:700 10px/16px Roboto,system-ui,Arial,sans-serif;text-align:center;transform:scale(0);transition:transform .2s cubic-bezier(.3,1.5,.5,1);pointer-events:none}
.lsm-pill.lsm-active .lsm-badge{transform:scale(1)}
.lsm-pill.lsm-active .lsm-badge.lsm-pop{animation:lsm-pop .4s}
:host(.lsm-dock) .lsm-pill{top:auto;bottom:16px;right:16px}
:host(.lsm-dock) .lsm-panel{right:16px}
.lsm-marks.lsm-float{position:fixed;height:4px;z-index:2147483646}
.lsm-toast{position:absolute;left:50%;top:12%;z-index:2200;max-width:90%;box-sizing:border-box;padding:8px 14px;border-radius:999px;background:rgba(24,24,27,.94);color:#fff;font:600 13px/1.25 Roboto,Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transform:translate(-50%,-6px);pointer-events:none;transition:opacity .18s,transform .18s}
.lsm-toast.lsm-show{opacity:1;transform:translate(-50%,0)}
.lsm-toast.lsm-act{display:flex;align-items:center;gap:10px;padding-right:6px;pointer-events:auto}
.lsm-toast-btn{-webkit-appearance:none;appearance:none;margin:0;padding:3px 10px;border:0;border-radius:999px;background:#3ea6ff;color:#06121f;font:700 12px/1.3 Roboto,Arial,sans-serif;cursor:pointer}
.lsm-toast-btn:hover{filter:brightness(1.1)}
.lsm-toast-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}

.lsm-panel{--acv:62,166,255;--ac:rgb(var(--acv));--ac-ink:#06121f;--line:rgba(255,255,255,.12);--mute:rgba(255,255,255,.64);
position:absolute;right:12px;bottom:62px;z-index:2200;width:344px;max-width:calc(100% - 24px);box-sizing:border-box;padding:10px 14px 14px;border-radius:14px;
background:rgba(24,24,27,.96);
box-shadow:0 12px 40px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.08);
color:#fff;font:400 13px/1.3 Roboto,"YouTube Noto",system-ui,-apple-system,"Segoe UI",Arial,Helvetica,sans-serif;text-align:left;direction:ltr;cursor:default;-webkit-user-select:none;user-select:none;
overflow:hidden auto;overscroll-behavior:contain;scrollbar-width:thin;
translate:var(--dx,0px) var(--dy,0px);opacity:0;visibility:hidden;pointer-events:none;transform:translateY(10px) scale(.97);transform-origin:100% 100%;
transition:opacity .16s ease,transform .22s cubic-bezier(.2,.9,.3,1.15),visibility 0s linear .22s}
.lsm-panel.lsm-open{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition-delay:0s}
.lsm-panel *,.lsm-panel *::before,.lsm-panel *::after,.lsm-strip *,.lsm-strip *::before,.lsm-strip *::after{box-sizing:border-box}
.lsm-panel button,.lsm-strip button{-webkit-appearance:none;appearance:none;display:inline-grid;place-items:center;margin:0;padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer}
.lsm-panel input{-webkit-appearance:none;appearance:none;min-width:0;margin:0;padding:0;border:0;border-radius:0;outline:0;background:none;box-shadow:none;color:inherit;font:inherit;-webkit-user-select:text;user-select:text;cursor:text}
.lsm-panel [hidden],.lsm-strip [hidden]{display:none!important}
.lsm-panel svg,.lsm-strip svg{display:block;pointer-events:none}
.lsm-panel svg path,.lsm-strip svg path{fill:currentColor}
.lsm-panel :focus-visible,.lsm-strip :focus-visible{outline:2px solid var(--ac);outline-offset:1px}
.lsm-panel input:focus-visible{outline:0}

.lsm-panel .lsm-head{display:flex;align-items:flex-start;gap:4px;margin-bottom:8px}
.lsm-panel .lsm-chips{flex:1;display:flex;flex-wrap:wrap;gap:5px;min-width:0}
.lsm-panel .lsm-chip{display:inline-flex;align-items:stretch;height:26px;border-radius:13px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px var(--line);color:var(--mute);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;transition:background .15s,box-shadow .15s,color .15s,opacity .15s,transform .08s}
.lsm-panel .lsm-dot{display:grid;place-items:center;width:24px;border-radius:13px 0 0 13px}
.lsm-panel .lsm-dot:hover{background:rgba(255,255,255,.14)}
.lsm-panel .lsm-chip-main{display:inline-flex;align-items:center;gap:5px;padding:0 9px 0 2px;border-radius:0 13px 13px 0;color:inherit;font-size:inherit}
.lsm-panel .lsm-chip-main:hover{background:rgba(255,255,255,.1)}
.lsm-panel .lsm-chip i{width:8px;height:8px;border-radius:50%;background:rgb(var(--cv))}
.lsm-panel .lsm-chip b{color:#fff;font-weight:700}
.lsm-panel .lsm-name{max-width:84px;overflow:hidden;text-overflow:ellipsis;font-style:normal;color:#fff}
.lsm-panel .lsm-rename{width:104px;height:100%;padding:0 10px 0 2px;border-radius:0 13px 13px 0;color:#fff;font-size:12px}
.lsm-panel .lsm-chip:active{transform:scale(.97)}
.lsm-panel .lsm-chip.lsm-sel{background:rgba(var(--cv),.2);box-shadow:inset 0 0 0 1.5px rgb(var(--cv));color:#fff}
.lsm-panel .lsm-chip.lsm-spent{opacity:.5}
.lsm-panel .lsm-chip.lsm-muted{opacity:.55}
.lsm-panel .lsm-chip.lsm-muted i{background:none;box-shadow:inset 0 0 0 1.5px rgb(var(--cv))}
.lsm-panel .lsm-chip.lsm-muted b{text-decoration:line-through}
.lsm-panel .lsm-chip.lsm-new{animation:lsm-in .28s cubic-bezier(.3,1.4,.5,1)}
.lsm-panel .lsm-hb{flex:none;width:28px;height:28px;border-radius:50%;color:var(--mute);transition:background .12s,color .12s,transform .08s}
.lsm-panel .lsm-hb:hover{background:rgba(255,255,255,.12);color:#fff}
.lsm-panel .lsm-hb:active{transform:scale(.9)}
.lsm-panel .lsm-add{box-shadow:inset 0 0 0 1px var(--line)}
.lsm-panel .lsm-menu{position:absolute;top:40px;right:10px;z-index:3;min-width:220px;padding:5px;border-radius:10px;background:rgb(40,40,45);box-shadow:0 8px 24px rgba(0,0,0,.5),inset 0 0 0 1px var(--line)}
.lsm-panel .lsm-mi{display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;height:32px;padding:0 10px;border-radius:7px;text-align:left;color:#fff;font-size:12.5px}
.lsm-panel .lsm-mi:hover,.lsm-panel .lsm-mi:focus-visible{background:rgba(255,255,255,.12)}
.lsm-panel .lsm-mi kbd,.lsm-panel .lsm-help kbd{padding:1px 6px;border-radius:5px;background:rgba(255,255,255,.12);color:var(--mute);font:600 10.5px/16px inherit;font-family:inherit;white-space:nowrap}
.lsm-panel .lsm-help{margin-top:10px;padding-top:8px;border-top:1px solid var(--line)}
.lsm-panel .lsm-help-rows{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;align-items:center;font-size:12px}
.lsm-panel .lsm-help-rows kbd{justify-self:start}
.lsm-panel .lsm-head>.lsm-hb:last-child{margin-right:-5px}

.lsm-panel .lsm-notice{display:none;margin-bottom:8px;padding:6px 10px;border-radius:8px;background:rgba(255,200,60,.14);color:#ffd874;font-size:12px}
.lsm-panel .lsm-notice.lsm-show{display:block}

.lsm-panel .lsm-body{display:grid;gap:10px;min-width:0;margin:0;padding:0;border:0;transition:opacity .2s}
.lsm-panel.lsm-off .lsm-body{opacity:.38;pointer-events:none}

.lsm-panel .lsm-track{position:relative;height:30px;cursor:pointer;touch-action:none}
.lsm-panel .lsm-lane{position:absolute;left:18px;right:18px;top:0;bottom:0;--a:0%;--b:100%;--tip:0%}
.lsm-panel .lsm-rail{position:absolute;left:-18px;right:-18px;top:50%;height:6px;margin-top:-3px;border-radius:3px;background:rgba(255,255,255,.16)}
.lsm-panel .lsm-ghost{position:absolute;top:calc(50% + 5px + var(--lane,0) * 4px);height:3px;min-width:2px;border-radius:2px;background:rgb(var(--cv));opacity:.8;pointer-events:none}
.lsm-panel .lsm-ghost.lsm-muted{opacity:.3}
.lsm-panel .lsm-fill{cursor:grab;position:absolute;left:var(--a);width:calc(var(--b) - var(--a));top:50%;height:6px;margin-top:-3px;overflow:hidden;background:var(--ac);transition:background-color .2s,opacity .2s}
.lsm-panel.lsm-muted .lsm-fill{opacity:.35}
.lsm-panel.lsm-open.lsm-running .lsm-fill::after{content:"";position:absolute;left:0;top:0;width:100%;height:100%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.5),rgba(255,255,255,0));animation:lsm-flow 1.4s linear infinite}
.lsm-panel .lsm-track.lsm-dragging .lsm-fill{cursor:grabbing}
.lsm-panel .lsm-play{position:absolute;left:0;top:7px;bottom:7px;width:2px;margin-left:-1px;border-radius:1px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.4);pointer-events:none}
.lsm-panel.lsm-off .lsm-play{display:none}
.lsm-panel .lsm-thumb{position:absolute;top:50%;display:grid;place-items:center;width:18px;height:26px;margin-top:-13px;background:#fff;color:#0f0f0f;font-size:10px;font-weight:800;line-height:1;cursor:ew-resize;touch-action:none;box-shadow:0 1px 4px rgba(0,0,0,.45);transition:background .15s,color .15s,box-shadow .15s}
.lsm-panel .lsm-thumb-a{left:var(--a);transform:translateX(-100%);border-radius:7px 2px 2px 7px}
.lsm-panel .lsm-thumb-b{left:var(--b);border-radius:2px 7px 7px 2px}
.lsm-panel .lsm-thumb:hover,.lsm-panel .lsm-thumb.lsm-grab,.lsm-panel .lsm-thumb:focus-visible{background:var(--ac);color:var(--ac-ink)}
.lsm-panel .lsm-thumb.lsm-grab{box-shadow:0 0 0 5px rgba(var(--acv),.28)}
.lsm-panel .lsm-tip{position:absolute;left:var(--tip);bottom:100%;padding:2px 7px;border-radius:6px;background:#fff;color:#0f0f0f;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;opacity:0;transform:translate(-50%,4px);pointer-events:none;transition:opacity .12s,transform .12s}
.lsm-panel .lsm-tip.lsm-show{opacity:1;transform:translate(-50%,0)}
.lsm-panel .lsm-scale{display:flex;align-items:center;justify-content:space-between;margin-top:1px;color:var(--mute);font-size:12px;font-variant-numeric:tabular-nums}
.lsm-panel .lsm-scale>span:first-child,.lsm-panel .lsm-scale>span:last-child{flex:1 1 0}
.lsm-panel .lsm-scale>span:last-child{text-align:right}
.lsm-panel .lsm-mid{display:flex;align-items:center;gap:5px}
.lsm-panel .lsm-len{color:#fff;font-weight:600}
.lsm-panel .lsm-zoom{width:24px;height:24px;border-radius:5px;color:var(--mute);transition:background .12s,color .12s}
.lsm-panel .lsm-zoom:hover{background:rgba(255,255,255,.14);color:#fff}
.lsm-panel .lsm-zoom[aria-pressed="true"],.lsm-panel .lsm-zoom[aria-pressed="true"]:hover{background:var(--ac);color:var(--ac-ink)}

.lsm-panel .lsm-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.lsm-panel .lsm-opts{grid-template-columns:116px 1fr}
.lsm-panel .lsm-field{min-width:0}
.lsm-panel .lsm-val{display:grid;place-items:center;cursor:default;-webkit-user-select:none;user-select:none}
.lsm-panel .lsm-note{align-self:end;padding-bottom:9px;color:var(--mute);font-size:11.5px;line-height:1.3}
.lsm-panel .lsm-label{display:flex;align-items:center;gap:6px;height:15px;margin-bottom:4px;color:var(--mute);font-size:11.5px;font-weight:600;letter-spacing:.5px;text-transform:uppercase}
.lsm-panel .lsm-tag{display:grid;place-items:center;width:15px;height:15px;border-radius:4px;background:rgba(255,255,255,.14);color:#fff;font-size:9.5px;font-weight:800;letter-spacing:0}
.lsm-panel .lsm-box{display:flex;align-items:center;height:34px;padding:0 3px;border-radius:9px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow .15s,background .15s}
.lsm-panel .lsm-box:hover{background:rgba(255,255,255,.11)}
.lsm-panel .lsm-box:focus-within{background:rgba(var(--acv),.1);box-shadow:inset 0 0 0 1.5px var(--ac)}
.lsm-panel .lsm-time,.lsm-panel .lsm-num,.lsm-panel .lsm-val{flex:1 1 0;width:0;height:100%;text-align:center;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.2px}
.lsm-panel .lsm-num[readonly]{font-size:17px;cursor:pointer}
.lsm-panel .lsm-ib{flex:none;width:26px;height:28px;border-radius:6px;color:var(--mute);transition:background .12s,color .12s,transform .08s}
.lsm-panel .lsm-ib:hover{background:rgba(255,255,255,.14);color:#fff}
.lsm-panel .lsm-ib:active{transform:scale(.88)}
.lsm-panel .lsm-now{width:28px;color:var(--ac)}
.lsm-panel .lsm-now:hover{color:var(--ac)}
.lsm-panel .lsm-now.lsm-flash{animation:lsm-ping .45s}
.lsm-panel .lsm-inf{width:26px;margin-left:2px;font-size:16px;font-weight:700;line-height:1}
.lsm-panel .lsm-inf[aria-pressed="true"],.lsm-panel .lsm-inf[aria-pressed="true"]:hover{background:var(--ac);color:var(--ac-ink)}
.lsm-panel .lsm-shake{animation:lsm-shake .32s}
.lsm-panel .lsm-shake .lsm-box{box-shadow:inset 0 0 0 1.5px #ff6b6b}

.lsm-panel .lsm-seg{position:relative;display:grid;grid-template-columns:repeat(3,1fr);height:34px;padding:3px;border-radius:9px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px var(--line);transition:opacity .2s}
.lsm-panel .lsm-seg::before{content:"";position:absolute;top:3px;bottom:3px;left:3px;width:calc((100% - 6px) / 3);border-radius:6px;background:rgba(255,255,255,.18);transition:transform .22s cubic-bezier(.3,1.2,.5,1)}
.lsm-panel .lsm-seg[data-v="next"]::before{transform:translateX(100%)}
.lsm-panel .lsm-seg[data-v="pause"]::before{transform:translateX(200%)}
.lsm-panel .lsm-seg button{position:relative;min-width:0;border-radius:6px;color:var(--mute);font-size:11.5px;font-weight:600;white-space:nowrap;transition:color .15s}
.lsm-panel .lsm-seg button[aria-pressed="true"]{color:#fff}
.lsm-panel .lsm-seg.lsm-dim{opacity:.45}

.lsm-panel .lsm-actions{display:flex;gap:8px;margin-top:2px}
.lsm-panel .lsm-main{position:relative;flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:0;height:36px;overflow:hidden;border-radius:18px;background:var(--ac);color:var(--ac-ink);font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;transition:background .18s,color .18s,box-shadow .18s,transform .08s,filter .12s}
.lsm-panel .lsm-main:hover{filter:brightness(1.1)}
.lsm-panel .lsm-main:active{transform:scale(.98)}
.lsm-panel .lsm-main>*{position:relative}
.lsm-panel .lsm-main.lsm-on{background:rgba(255,255,255,.1);color:#fff;box-shadow:inset 0 0 0 1px var(--line)}
.lsm-panel .lsm-main-fill{position:absolute;inset:0;background:rgba(var(--acv),.38);opacity:0;transform:scaleX(0);transform-origin:0 50%;pointer-events:none}
.lsm-panel .lsm-main.lsm-on .lsm-main-fill{opacity:1}
.lsm-panel .lsm-ic-stop,.lsm-panel .lsm-on .lsm-ic-idle{display:none}
.lsm-panel .lsm-on .lsm-ic-stop{display:block}
.lsm-panel .lsm-start{flex:none;width:36px;height:36px;border-radius:50%;background:rgba(var(--acv),.18);color:var(--ac);box-shadow:inset 0 0 0 1px rgba(var(--acv),.5);transition:background .12s,color .12s,transform .08s}
.lsm-panel .lsm-start:hover{background:var(--ac);color:var(--ac-ink)}
.lsm-panel .lsm-start:active{transform:scale(.92)}
.lsm-panel .lsm-skip{flex:none;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.08);color:var(--mute);box-shadow:inset 0 0 0 1px var(--line);transition:background .12s,color .12s,transform .08s}
.lsm-panel .lsm-skip:hover{background:rgba(255,255,255,.14);color:#fff}
.lsm-panel .lsm-skip:active{transform:scale(.92)}

.lsm-panel .lsm-grip,.lsm-strip .lsm-grip{flex:none;display:grid;place-items:center;width:16px;height:26px;color:var(--mute);cursor:grab;touch-action:none;opacity:.7}
.lsm-panel .lsm-grip:hover,.lsm-strip .lsm-grip:hover,.lsm-grip.lsm-grab{opacity:1}
.lsm-grip.lsm-grab{cursor:grabbing}
.lsm-panel .lsm-head>.lsm-grip{margin-left:-6px}

.lsm-panel .lsm-hint{display:flex;align-items:center;gap:10px;margin-bottom:8px;padding:7px 8px 7px 10px;border-radius:8px;background:rgba(var(--acv),.14);font-size:12px;line-height:1.35}
.lsm-panel .lsm-hint span{flex:1}
.lsm-panel .lsm-hint-btn{flex:none;height:26px;padding:0 10px;border-radius:13px;background:var(--ac);color:var(--ac-ink);font-size:12px;font-weight:700}
.lsm-panel .lsm-status{display:grid;gap:5px;margin-top:2px}
.lsm-panel .lsm-status-text{font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lsm-bar{display:block;position:relative;height:3px;overflow:hidden;border-radius:2px;background:rgba(255,255,255,.14)}
.lsm-bar>i,.lsm-strip-bar>i{position:absolute;inset:0;background:var(--ac);transform:scaleX(0);transform-origin:0 50%}

.lsm-strip{--acv:62,166,255;--ac:rgb(var(--acv));--line:rgba(255,255,255,.12);--mute:rgba(255,255,255,.64);
position:absolute;right:12px;bottom:62px;z-index:2200;display:flex;align-items:center;gap:4px;height:42px;max-width:calc(100% - 24px);padding:0 6px 3px 4px;border-radius:21px;overflow:hidden;
background:rgba(24,24,27,.96);box-shadow:0 8px 28px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.08);
color:#fff;font:600 13px/1.2 Roboto,system-ui,-apple-system,"Segoe UI",Arial,Helvetica,sans-serif;direction:ltr;cursor:default;-webkit-user-select:none;user-select:none;
translate:var(--dx,0px) var(--dy,0px);opacity:0;visibility:hidden;pointer-events:none;transform:translateY(8px);transition:opacity .16s ease,transform .2s cubic-bezier(.2,.9,.3,1.15),visibility 0s linear .2s}
.lsm-strip.lsm-open{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition-delay:0s}
:host(.lsm-dock) .lsm-strip{right:16px}
.lsm-strip .lsm-sdot{flex:none;width:9px;height:9px;margin:0 3px 0 2px;border-radius:50%;background:var(--ac)}
.lsm-strip .lsm-strip-text{flex:1;min-width:84px;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.lsm-strip .lsm-sb{flex:none;width:30px;height:30px;border-radius:50%;color:var(--mute);transition:background .12s,color .12s,transform .08s}
.lsm-strip .lsm-sb:hover{background:rgba(255,255,255,.14);color:#fff}
.lsm-strip .lsm-sb:active{transform:scale(.9)}
.lsm-strip-bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.12)}

@keyframes lsm-pop{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}
@keyframes lsm-in{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes lsm-flow{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
@keyframes lsm-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
@keyframes lsm-ping{0%{box-shadow:0 0 0 0 rgba(var(--acv),.7)}100%{box-shadow:0 0 0 9px rgba(var(--acv),0)}}
${MARKS_CSS()}
@media (forced-colors:active){
.lsm-panel,.lsm-strip,.lsm-toast,.lsm-pill{background:Canvas;color:CanvasText;border:1px solid CanvasText}
.lsm-panel .lsm-box,.lsm-panel .lsm-chip,.lsm-panel .lsm-seg,.lsm-panel .lsm-ib,.lsm-panel .lsm-hb,.lsm-panel .lsm-skip,.lsm-panel .lsm-start,.lsm-panel .lsm-main,.lsm-panel .lsm-mi,.lsm-strip .lsm-sb,.lsm-panel .lsm-hint-btn,.lsm-toast-btn{border:1px solid ButtonText;forced-color-adjust:auto}
.lsm-panel .lsm-thumb{background:ButtonFace;color:ButtonText;border:1px solid ButtonText;forced-color-adjust:none}
.lsm-panel .lsm-rail{background:GrayText;forced-color-adjust:none}
.lsm-panel .lsm-fill,.lsm-bar>i,.lsm-strip-bar>i{background:Highlight;forced-color-adjust:none}
.lsm-panel .lsm-chip.lsm-sel,.lsm-panel [aria-pressed="true"]{outline:2px solid Highlight;outline-offset:-2px}
.lsm-panel :focus-visible,.lsm-strip :focus-visible{outline:2px solid Highlight}
}
@media (prefers-reduced-motion:reduce){.lsm-panel,.lsm-panel *,.lsm-panel *::before,.lsm-strip,.lsm-strip *,.lsm-toast,.lsm-pill,.lsm-pill *{animation:none!important;transition-duration:.01s!important}}
`;
