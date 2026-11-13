// Styles. LIGHT_CSS goes into the page (the toolbar button and the markers live in the site's own
// DOM); SHADOW_CSS lives inside the shadow root that holds the panel and the toast.

export const LIGHT_CSS = `
.ysl-btn{position:relative;display:inline-flex!important;align-items:center;justify-content:center;vertical-align:top}
.ysl-btn>svg{width:24px!important;height:24px!important;padding:0!important;flex:none;pointer-events:none;transition:color .2s,transform .25s cubic-bezier(.3,1.5,.5,1)}
.ysl-btn>svg path{fill:currentColor!important}
.ysl-btn[aria-expanded="true"]>svg{transform:scale(1.12)}
.ysl-btn.ysl-active>svg{color:#3ea6ff}
.ysl-badge{position:absolute;top:3px;right:5px;min-width:14px;height:14px;padding:0 3px;box-sizing:border-box;border-radius:7px;background:#3ea6ff;color:#06121f;font:700 9px/14px Roboto,Arial,sans-serif;text-align:center;transform:scale(0);transition:transform .2s cubic-bezier(.3,1.5,.5,1);pointer-events:none}
.ysl-btn.ysl-active .ysl-badge{transform:scale(1)}
.ysl-btn.ysl-active .ysl-badge.ysl-pop{animation:ysl-pop .4s}
.ysl-marks{position:absolute;left:0;right:0;top:0;height:100%;z-index:44;pointer-events:none}
.ysl-marks[hidden]{display:none}
.ysl-mark{position:absolute;top:calc(-7px - var(--lane,0) * 5px);height:3px;min-width:2px;border-radius:2px;background:rgb(var(--cv));opacity:.6;transition:opacity .2s,box-shadow .2s}
.ysl-mark::before,.ysl-mark::after{content:"";position:absolute;top:0;width:2px;height:calc(13px + var(--lane,0) * 5px);border-radius:1px;background:inherit}
.ysl-mark::before{left:0}
.ysl-mark::after{right:0}
.ysl-mark.ysl-sel{opacity:.95}
.ysl-marks.ysl-live .ysl-mark{opacity:1;box-shadow:0 0 6px rgba(var(--cv),.8)}
.ysl-marks.ysl-live .ysl-mark.ysl-spent{opacity:.35;box-shadow:none}
.ysl-mark.ysl-muted,.ysl-marks.ysl-live .ysl-mark.ysl-muted{opacity:.25;box-shadow:none}
@keyframes ysl-pop{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.ysl-btn *,.ysl-mark{animation:none!important;transition-duration:.01s!important}}
`;

// The marker rules apply in both places: on the site's bar (light DOM) and in the overlay.
const MARKS_CSS = () => LIGHT_CSS.split('\n').filter((l) => /^\.ysl-marks?\b/.test(l)).join('\n');

export const SHADOW_CSS = `
:host{all:initial;display:contents}
.ysl-pill{position:absolute;top:var(--ysl-pill-top,10px);right:10px;z-index:2201;display:grid;place-items:center;width:40px;height:40px;margin:0;padding:0;border:0;border-radius:50%;background:rgba(24,24,27,.88);color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.4),inset 0 0 0 1px rgba(255,255,255,.14);cursor:pointer;pointer-events:none;opacity:0;transform:scale(.85);transition:opacity .18s,transform .18s,background .15s;-webkit-appearance:none;appearance:none}
.ysl-pill.ysl-show,.ysl-pill:focus-visible{opacity:1;transform:none;pointer-events:auto}
.ysl-pill:hover{background:rgba(44,44,50,.96)}
.ysl-pill:focus-visible{outline:2px solid #3ea6ff;outline-offset:2px}
.ysl-pill>svg{display:block;width:22px;height:22px;pointer-events:none;transition:color .2s,transform .25s cubic-bezier(.3,1.5,.5,1)}
.ysl-pill>svg path{fill:currentColor}
.ysl-pill[aria-expanded="true"]>svg{transform:scale(1.12)}
.ysl-pill.ysl-active>svg{color:#3ea6ff}
.ysl-pill .ysl-badge{position:absolute;top:-3px;right:-3px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:#3ea6ff;color:#06121f;font:700 10px/16px Roboto,system-ui,Arial,sans-serif;text-align:center;transform:scale(0);transition:transform .2s cubic-bezier(.3,1.5,.5,1);pointer-events:none}
.ysl-pill.ysl-active .ysl-badge{transform:scale(1)}
.ysl-pill.ysl-active .ysl-badge.ysl-pop{animation:ysl-pop .4s}
:host(.ysl-dock) .ysl-pill{top:auto;bottom:16px;right:16px}
:host(.ysl-dock) .ysl-panel{right:16px}
.ysl-marks.ysl-float{position:fixed;height:4px;z-index:2147483646}
.ysl-toast{position:absolute;left:50%;top:12%;z-index:2200;max-width:90%;box-sizing:border-box;padding:8px 14px;border-radius:999px;background:rgba(24,24,27,.94);color:#fff;font:600 13px/1.25 Roboto,Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transform:translate(-50%,-6px);pointer-events:none;transition:opacity .18s,transform .18s}
.ysl-toast.ysl-show{opacity:1;transform:translate(-50%,0)}

.ysl-panel{--acv:62,166,255;--ac:rgb(var(--acv));--ac-ink:#06121f;--line:rgba(255,255,255,.12);--mute:rgba(255,255,255,.64);
position:absolute;right:12px;bottom:62px;z-index:2200;width:344px;max-width:calc(100% - 24px);box-sizing:border-box;padding:10px 14px 14px;border-radius:14px;
background:rgba(24,24,27,.96);
box-shadow:0 12px 40px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.08);
color:#fff;font:400 13px/1.3 Roboto,"YouTube Noto",system-ui,-apple-system,"Segoe UI",Arial,Helvetica,sans-serif;text-align:left;direction:ltr;cursor:default;-webkit-user-select:none;user-select:none;
overflow:hidden auto;overscroll-behavior:contain;scrollbar-width:thin;
opacity:0;visibility:hidden;pointer-events:none;transform:translateY(10px) scale(.97);transform-origin:100% 100%;
transition:opacity .16s ease,transform .22s cubic-bezier(.2,.9,.3,1.15),visibility 0s linear .22s}
.ysl-panel.ysl-open{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition-delay:0s}
.ysl-panel *,.ysl-panel *::before,.ysl-panel *::after{box-sizing:border-box}
.ysl-panel button{-webkit-appearance:none;appearance:none;display:inline-grid;place-items:center;margin:0;padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer}
.ysl-panel input{-webkit-appearance:none;appearance:none;min-width:0;margin:0;padding:0;border:0;border-radius:0;outline:0;background:none;box-shadow:none;color:inherit;font:inherit;-webkit-user-select:text;user-select:text;cursor:text}
.ysl-panel [hidden]{display:none!important}
.ysl-panel svg{display:block;pointer-events:none}
.ysl-panel svg path{fill:currentColor}
.ysl-panel :focus-visible{outline:2px solid var(--ac);outline-offset:1px}
.ysl-panel input:focus-visible{outline:0}

.ysl-panel .ysl-head{display:flex;align-items:flex-start;gap:4px;margin-bottom:8px}
.ysl-panel .ysl-chips{flex:1;display:flex;flex-wrap:wrap;gap:5px;min-width:0}
.ysl-panel .ysl-chip{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px 0 7px;border-radius:13px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px var(--line);color:var(--mute);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;transition:background .15s,box-shadow .15s,color .15s,opacity .15s,transform .08s}
.ysl-panel .ysl-chip i{width:8px;height:8px;border-radius:50%;background:rgb(var(--cv))}
.ysl-panel .ysl-chip b{color:#fff;font-weight:700}
.ysl-panel .ysl-chip:hover{background:rgba(255,255,255,.14)}
.ysl-panel .ysl-chip:active{transform:scale(.95)}
.ysl-panel .ysl-chip[aria-pressed="true"]{background:rgba(var(--cv),.2);box-shadow:inset 0 0 0 1.5px rgb(var(--cv));color:#fff}
.ysl-panel .ysl-chip.ysl-spent{opacity:.5}
.ysl-panel .ysl-chip.ysl-muted{opacity:.55}
.ysl-panel .ysl-chip.ysl-muted i{background:none;box-shadow:inset 0 0 0 1.5px rgb(var(--cv))}
.ysl-panel .ysl-chip.ysl-muted b{text-decoration:line-through}
.ysl-panel .ysl-chip.ysl-new{animation:ysl-in .28s cubic-bezier(.3,1.4,.5,1)}
.ysl-panel .ysl-hb{flex:none;width:26px;height:26px;border-radius:50%;color:var(--mute);transition:background .12s,color .12s,transform .08s}
.ysl-panel .ysl-hb:hover{background:rgba(255,255,255,.12);color:#fff}
.ysl-panel .ysl-hb:active{transform:scale(.9)}
.ysl-panel .ysl-add{box-shadow:inset 0 0 0 1px var(--line)}
.ysl-panel .ysl-power[aria-pressed="true"]{color:var(--ac)}
.ysl-panel .ysl-head>.ysl-hb:last-child{margin-right:-5px}

.ysl-panel .ysl-notice{display:none;margin-bottom:8px;padding:6px 10px;border-radius:8px;background:rgba(255,200,60,.14);color:#ffd874;font-size:12px}
.ysl-panel .ysl-notice.ysl-show{display:block}

.ysl-panel .ysl-body{display:grid;gap:10px;min-width:0;margin:0;padding:0;border:0;transition:opacity .2s}
.ysl-panel.ysl-off .ysl-body{opacity:.38;pointer-events:none}

.ysl-panel .ysl-track{position:relative;height:30px;cursor:pointer;touch-action:none}
.ysl-panel .ysl-lane{position:absolute;left:18px;right:18px;top:0;bottom:0;--a:0%;--b:100%;--tip:0%}
.ysl-panel .ysl-rail{position:absolute;left:-18px;right:-18px;top:50%;height:6px;margin-top:-3px;border-radius:3px;background:rgba(255,255,255,.16)}
.ysl-panel .ysl-ghost{position:absolute;top:calc(50% + 5px + var(--lane,0) * 4px);height:3px;min-width:2px;border-radius:2px;background:rgb(var(--cv));opacity:.8;pointer-events:none}
.ysl-panel .ysl-ghost.ysl-muted{opacity:.3}
.ysl-panel .ysl-fill{position:absolute;left:var(--a);width:calc(var(--b) - var(--a));top:50%;height:6px;margin-top:-3px;overflow:hidden;background:var(--ac);transition:background-color .2s,opacity .2s}
.ysl-panel.ysl-muted .ysl-fill{opacity:.35}
.ysl-panel.ysl-open.ysl-running .ysl-fill::after{content:"";position:absolute;left:0;top:0;width:100%;height:100%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.5),rgba(255,255,255,0));animation:ysl-flow 1.4s linear infinite}
.ysl-panel .ysl-play{position:absolute;left:0;top:7px;bottom:7px;width:2px;margin-left:-1px;border-radius:1px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.4);pointer-events:none}
.ysl-panel.ysl-off .ysl-play{display:none}
.ysl-panel .ysl-thumb{position:absolute;top:50%;display:grid;place-items:center;width:18px;height:26px;margin-top:-13px;background:#fff;color:#0f0f0f;font-size:10px;font-weight:800;line-height:1;cursor:ew-resize;touch-action:none;box-shadow:0 1px 4px rgba(0,0,0,.45);transition:background .15s,color .15s,box-shadow .15s}
.ysl-panel .ysl-thumb-a{left:var(--a);transform:translateX(-100%);border-radius:7px 2px 2px 7px}
.ysl-panel .ysl-thumb-b{left:var(--b);border-radius:2px 7px 7px 2px}
.ysl-panel .ysl-thumb:hover,.ysl-panel .ysl-thumb.ysl-grab,.ysl-panel .ysl-thumb:focus-visible{background:var(--ac);color:var(--ac-ink)}
.ysl-panel .ysl-thumb.ysl-grab{box-shadow:0 0 0 5px rgba(var(--acv),.28)}
.ysl-panel .ysl-tip{position:absolute;left:var(--tip);bottom:100%;padding:2px 7px;border-radius:6px;background:#fff;color:#0f0f0f;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;opacity:0;transform:translate(-50%,4px);pointer-events:none;transition:opacity .12s,transform .12s}
.ysl-panel .ysl-tip.ysl-show{opacity:1;transform:translate(-50%,0)}
.ysl-panel .ysl-scale{display:flex;align-items:center;justify-content:space-between;margin-top:1px;color:var(--mute);font-size:11px;font-variant-numeric:tabular-nums}
.ysl-panel .ysl-scale>span:first-child,.ysl-panel .ysl-scale>span:last-child{flex:1 1 0}
.ysl-panel .ysl-scale>span:last-child{text-align:right}
.ysl-panel .ysl-mid{display:flex;align-items:center;gap:5px}
.ysl-panel .ysl-len{color:#fff;font-weight:600}
.ysl-panel .ysl-zoom{width:20px;height:18px;border-radius:5px;color:var(--mute);transition:background .12s,color .12s}
.ysl-panel .ysl-zoom:hover{background:rgba(255,255,255,.14);color:#fff}
.ysl-panel .ysl-zoom[aria-pressed="true"],.ysl-panel .ysl-zoom[aria-pressed="true"]:hover{background:var(--ac);color:var(--ac-ink)}

.ysl-panel .ysl-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ysl-panel .ysl-opts{grid-template-columns:116px 1fr}
.ysl-panel .ysl-field{min-width:0}
.ysl-panel .ysl-label{display:flex;align-items:center;gap:6px;height:15px;margin-bottom:4px;color:var(--mute);font-size:10.5px;font-weight:600;letter-spacing:.6px;text-transform:uppercase}
.ysl-panel .ysl-tag{display:grid;place-items:center;width:15px;height:15px;border-radius:4px;background:rgba(255,255,255,.14);color:#fff;font-size:9.5px;font-weight:800;letter-spacing:0}
.ysl-panel .ysl-box{display:flex;align-items:center;height:34px;padding:0 3px;border-radius:9px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow .15s,background .15s}
.ysl-panel .ysl-box:hover{background:rgba(255,255,255,.11)}
.ysl-panel .ysl-box:focus-within{background:rgba(var(--acv),.1);box-shadow:inset 0 0 0 1.5px var(--ac)}
.ysl-panel .ysl-time,.ysl-panel .ysl-num{flex:1 1 0;width:0;height:100%;text-align:center;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.2px}
.ysl-panel .ysl-num[readonly]{font-size:17px;cursor:pointer}
.ysl-panel .ysl-ib{flex:none;width:22px;height:26px;border-radius:6px;color:var(--mute);transition:background .12s,color .12s,transform .08s}
.ysl-panel .ysl-ib:hover{background:rgba(255,255,255,.14);color:#fff}
.ysl-panel .ysl-ib:active{transform:scale(.88)}
.ysl-panel .ysl-now{width:24px;color:var(--ac)}
.ysl-panel .ysl-now:hover{color:var(--ac)}
.ysl-panel .ysl-now.ysl-flash{animation:ysl-ping .45s}
.ysl-panel .ysl-inf{width:26px;margin-left:2px;font-size:16px;font-weight:700;line-height:1}
.ysl-panel .ysl-inf[aria-pressed="true"],.ysl-panel .ysl-inf[aria-pressed="true"]:hover{background:var(--ac);color:var(--ac-ink)}
.ysl-panel .ysl-shake{animation:ysl-shake .32s}
.ysl-panel .ysl-shake .ysl-box{box-shadow:inset 0 0 0 1.5px #ff6b6b}

.ysl-panel .ysl-seg{position:relative;display:grid;grid-template-columns:repeat(3,1fr);height:34px;padding:3px;border-radius:9px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px var(--line);transition:opacity .2s}
.ysl-panel .ysl-seg::before{content:"";position:absolute;top:3px;bottom:3px;left:3px;width:calc((100% - 6px) / 3);border-radius:6px;background:rgba(255,255,255,.18);transition:transform .22s cubic-bezier(.3,1.2,.5,1)}
.ysl-panel .ysl-seg[data-v="next"]::before{transform:translateX(100%)}
.ysl-panel .ysl-seg[data-v="pause"]::before{transform:translateX(200%)}
.ysl-panel .ysl-seg button{position:relative;min-width:0;border-radius:6px;color:var(--mute);font-size:11.5px;font-weight:600;white-space:nowrap;transition:color .15s}
.ysl-panel .ysl-seg button[aria-pressed="true"]{color:#fff}
.ysl-panel .ysl-seg.ysl-dim{opacity:.45}

.ysl-panel .ysl-actions{display:flex;gap:8px;margin-top:2px}
.ysl-panel .ysl-main{position:relative;flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:0;height:36px;overflow:hidden;border-radius:18px;background:var(--ac);color:var(--ac-ink);font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;transition:background .18s,color .18s,box-shadow .18s,transform .08s,filter .12s}
.ysl-panel .ysl-main:hover{filter:brightness(1.1)}
.ysl-panel .ysl-main:active{transform:scale(.98)}
.ysl-panel .ysl-main>*{position:relative}
.ysl-panel .ysl-main.ysl-on{background:rgba(255,255,255,.1);color:#fff;box-shadow:inset 0 0 0 1px var(--line)}
.ysl-panel .ysl-main-fill{position:absolute;inset:0;background:rgba(var(--acv),.38);opacity:0;transform:scaleX(0);transform-origin:0 50%;pointer-events:none}
.ysl-panel .ysl-main.ysl-on .ysl-main-fill{opacity:1}
.ysl-panel .ysl-ic-stop,.ysl-panel .ysl-on .ysl-ic-idle{display:none}
.ysl-panel .ysl-on .ysl-ic-stop{display:block}
.ysl-panel .ysl-start{flex:none;width:36px;height:36px;border-radius:50%;background:rgba(var(--acv),.18);color:var(--ac);box-shadow:inset 0 0 0 1px rgba(var(--acv),.5);transition:background .12s,color .12s,transform .08s}
.ysl-panel .ysl-start:hover{background:var(--ac);color:var(--ac-ink)}
.ysl-panel .ysl-start:active{transform:scale(.92)}
.ysl-panel .ysl-reset{flex:none;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.08);color:var(--mute);box-shadow:inset 0 0 0 1px var(--line);transition:background .12s,color .12s,transform .3s}
.ysl-panel .ysl-reset:hover{background:rgba(255,255,255,.14);color:#fff}
.ysl-panel .ysl-reset:active{transform:rotate(-120deg)}

@keyframes ysl-pop{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}
@keyframes ysl-in{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes ysl-flow{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
@keyframes ysl-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
@keyframes ysl-ping{0%{box-shadow:0 0 0 0 rgba(var(--acv),.7)}100%{box-shadow:0 0 0 9px rgba(var(--acv),0)}}
${MARKS_CSS()}
@media (prefers-reduced-motion:reduce){.ysl-panel,.ysl-panel *,.ysl-panel *::before,.ysl-toast,.ysl-pill,.ysl-pill *{animation:none!important;transition-duration:.01s!important}}
`;
