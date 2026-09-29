/**
 * The agent-built plugin studio: left, the conversation and the real collaboration record; right, the plugin
 * itself, rendered by the host component renderer from the frozen component tree. Everything shown is derived
 * from the build record the host pushes; nothing here advances a build or fakes progress.
 */
export function renderAgentStudio(): string {
  return '<section class="as-shell" data-agent-studio>'
    + '<header class="as-top"><a class="as-brand" href="#" aria-label="Molis"><svg aria-hidden="true"><use href="#icon-wand"/></svg><b>Molis</b><span>/</span><span>插件创作工作台</span></a>'
    + '<div class="as-top-actions"><label class="as-select"><span class="as-sr">我的插件</span><select data-as-builds aria-label="我的插件"></select></label>'
    + '<button class="as-icon" type="button" data-as-new aria-label="新建插件" title="新建插件"><svg aria-hidden="true"><use href="#icon-plus"/></svg></button>'
    + '<label class="as-select as-model"><span>模型</span><select data-as-model aria-label="构建使用的模型"></select></label>'
    + '<a class="as-model-setup" data-as-model-setup href="/settings/models" hidden>打开模型设置</a></div></header>'
    + '<aside class="as-left" aria-label="协作"><div class="as-feed" data-as-feed aria-live="polite"></div>'
    + '<label class="as-select" data-as-edit-label hidden><span>修改范围</span><select data-as-edit-mode aria-label="修改范围"><option value="message">功能与界面</option><option value="visual">只调整界面</option></select></label>'
    + '<form class="as-composer" data-as-composer><div class="as-target" data-as-target hidden></div><textarea data-as-input rows="2" maxlength="48000" aria-label="描述或修改"></textarea>'
    + '<button class="as-send" type="submit" aria-label="发送" title="发送"><svg aria-hidden="true"><use href="#icon-send"/></svg></button></form>'
    + '<p class="as-model-note" data-as-model-note></p></aside>'
    + '<main class="as-right"><header class="as-canvas-head"><div class="as-title"><h1 data-as-title>新插件</h1><span class="as-phase" data-as-phase></span></div>'
    + '<div class="as-segment" role="tablist" aria-label="画布模式"><button type="button" role="tab" data-as-tab="build" aria-selected="true">构建</button><button type="button" role="tab" data-as-tab="try" aria-selected="false">试用</button></div>'
    + '<div class="as-head-actions" data-as-head-actions></div></header>'
    + '<div class="as-canvas" data-as-canvas data-tab="build"><div class="as-canvas-scroll" data-as-scroll><div class="as-empty" data-as-empty></div><div class="as-plugin" data-as-plugin></div>'
    + '<div class="as-frame" data-as-frame hidden aria-hidden="true"><i></i><i></i><i></i><i></i><span></span></div>'
    + '<div class="as-pointer as-pointer-ui" data-as-pointer="ui" hidden><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M2 1l11 7-5 1-2 5z"/></svg><span>UI Agent</span><em></em></div>'
    + '<div class="as-pointer as-pointer-code" data-as-pointer="code" hidden><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M2 1l11 7-5 1-2 5z"/></svg><span>代码 Agent</span><em></em></div></div>'
    + '<div class="as-catalog" data-as-catalog-panel hidden aria-label="UI 目录全部组件"></div><nav class="as-board" data-as-board aria-label="规格板：UI 目录里的组件"></nav><div class="as-part-tip" data-as-tip role="tooltip" hidden></div></div>'
    + '<footer class="as-status" data-as-status role="status"></footer></main></section>';
}

export const AGENT_STUDIO_STYLES = String.raw`
.as-shell,.as-preview-page{--as-ground:var(--canvas,#f3f3f1);--as-panel:var(--nav-bg,#f9f9f8);--as-ink:var(--ink,#232831);--as-muted:var(--muted,#737985);--as-line:var(--line,#e9e9ed);--as-paper:var(--paper,#fff);--as-fill:var(--control-fill,var(--as-fill));--as-blue:#397bfa;--as-green:#269672;--as-amber:#b7791f;--as-red:#c2413b;color:var(--as-ink);font:13px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;-webkit-font-smoothing:antialiased}
.as-shell{display:grid;grid-template-columns:clamp(320px,26%,430px) minmax(0,1fr);grid-template-rows:56px minmax(0,1fr);height:100vh;background:var(--as-ground);overflow:hidden}
.as-shell *,.as-preview-page *{box-sizing:border-box}.as-shell [hidden]{display:none!important}:where(.as-shell) button{font:inherit;color:inherit;cursor:pointer}:where(.as-shell) button:disabled{opacity:.42;cursor:not-allowed}
.as-shell svg{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle}.as-shell :focus-visible{outline:2px solid var(--as-blue);outline-offset:2px}
:where(.as-shell) :is(h1,h2,h3,p){margin:0}.as-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.as-top{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 20px;border-bottom:1px solid var(--as-line);background:var(--as-panel)}
.as-brand{display:flex;align-items:center;gap:8px;color:inherit;text-decoration:none;font-size:15px}.as-brand b{font-size:17px}.as-brand span{color:var(--as-muted)}.as-brand svg{width:22px;height:22px;color:#2448c9}
.as-top-actions{display:flex;align-items:center;gap:10px}.as-select{display:flex;align-items:center;gap:6px;color:var(--as-muted);font-size:12px}.as-select select{max-width:220px;font:inherit;color:var(--as-ink);border:1px solid var(--as-line);border-radius:7px;background:var(--as-paper);padding:6px 8px}
.as-icon{color:inherit;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid var(--as-line);border-radius:7px;background:var(--as-paper)}.as-icon:hover{background:var(--as-fill)}
.as-left{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--as-line);background:var(--as-panel)}
.as-feed{flex:1;min-height:0;overflow-y:auto;padding:22px 22px 12px;display:flex;flex-direction:column;gap:14px;scrollbar-width:thin}
.as-feed h2{font-size:18px;font-weight:650}.as-muted{color:var(--as-muted)}.as-small{font-size:12px}
.as-card{border:1px solid var(--as-line);border-radius:10px;background:var(--as-paper);padding:14px 15px}.as-card h3{font-size:13px;font-weight:650;margin-bottom:6px}
.as-brief{border-left:3px solid #cfd6e4;padding:2px 0 2px 12px}.as-brief span{display:block;color:var(--as-muted);font-size:12px}.as-brief p{white-space:pre-wrap;overflow-wrap:anywhere}
.as-examples{display:grid;gap:8px}.as-example{text-align:left;border:1px solid var(--as-line);border-radius:9px;background:var(--as-paper);padding:10px 12px}.as-example:hover{border-color:var(--as-line)}.as-example b{display:block;font-weight:600}
.as-candidates{display:grid;gap:10px}.as-candidate{border:1px solid var(--as-line);border-radius:10px;background:var(--as-paper);padding:12px 13px;text-align:left;width:100%}.as-candidate[aria-pressed="true"]{border-color:var(--as-blue);box-shadow:0 0 0 2px #dfe9ff}
.as-candidate b{display:block;font-size:14px}.as-candidate p{color:var(--as-muted);margin-top:3px}.as-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.as-chip{display:inline-flex;align-items:center;gap:4px;border-radius:999px;background:var(--as-fill);padding:1px 8px;font-size:11.5px;color:var(--as-muted);white-space:nowrap}.as-chip.jev{background:var(--blue-soft,#e8f0ff);color:#2f5fd0}.as-chip.rule{background:var(--as-fill)}.as-chip.user{background:var(--amber-soft,#fff3dc);color:#8a5a12}
.as-secret{display:grid;grid-template-columns:auto 1fr 1.4fr;gap:6px;align-items:center;margin:6px 0}.as-secret input{min-width:0;border:1px solid var(--as-line);border-radius:6px;padding:4px 6px;font:inherit;background:var(--as-paper);color:var(--as-ink)}
.as-mockup{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;border:1px solid var(--as-line);background:var(--as-fill);margin-bottom:8px}.as-mockup[data-drawing]{display:flex;align-items:center;justify-content:center;color:var(--as-muted);font-size:12px}.as-mockup-large{aspect-ratio:auto;max-height:320px;object-fit:contain}
.as-chip[data-as-enable]{background:var(--amber-soft,#fff3dc);color:var(--as-amber)}.as-chip.ok{background:var(--green-soft,#e4f5ee);color:#1f7a5c}.as-chip.bad{background:var(--red-soft,#fdecea);color:#a3332d}
.as-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.as-button{color:inherit;text-decoration:none;display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:5px 12px;border:1px solid var(--as-line);border-radius:7px;background:var(--as-paper);font-size:12px}.as-button:hover{background:var(--as-fill)}.as-primary{background:var(--ink,#272c32);color:var(--paper,#fff);border-color:transparent}.as-primary:hover{background:#414852}
.as-ops{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px}.as-ops li{display:flex;align-items:center;justify-content:space-between;gap:8px}.as-ops code{font-size:12px;color:var(--as-muted)}.as-op-note{display:block;color:var(--as-muted);font-size:11px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.as-ops li>span{min-width:0}
.as-agents{display:grid;gap:6px}.as-agent{display:flex;align-items:baseline;gap:8px}.as-agent b{flex:none;font-weight:600}.as-agent[data-agent=design] b{color:#6b4fd8}.as-agent[data-agent=ui] b{color:var(--as-blue)}.as-agent[data-agent=code] b{color:var(--as-green)}.as-agent[data-agent=host] b{color:var(--as-muted)}
.as-dots::after{content:"";display:inline-block;width:1.2em;text-align:left;animation:as-dots 1.2s steps(4,end) infinite}@keyframes as-dots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}
.as-decision{border-color:#f1d7a4;background:var(--amber-soft,#fffaf0)}.as-error{border-color:#f3c4c0;background:var(--red-soft,#fff7f6)}.as-error p{color:#8f2f2a;white-space:pre-wrap;overflow-wrap:anywhere}
.as-steps{border-top:1px solid var(--as-line);padding-top:10px}.as-steps summary{cursor:pointer;color:var(--as-muted);font-size:12px}.as-steps ol{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:7px}
.as-step{display:grid;grid-template-columns:18px minmax(0,1fr);gap:6px;align-items:start}.as-step i{width:14px;height:14px;margin-top:3px;border-radius:50%;border:1.5px solid var(--as-line)}.as-step[data-status=done] i{border-color:#9fd0bd;background:var(--green-soft,#e4f5ee)}.as-step[data-status=active] i{border-color:var(--as-blue);border-top-color:transparent;animation:as-spin 1s linear infinite}.as-step[data-status=failed] i{border-color:var(--as-red);background:var(--red-soft,#fdecea)}.as-step[data-status=waiting] i{border-color:var(--as-amber);background:var(--amber-soft,#fff3dc)}.as-step[data-status=cancelled] i{border-style:dashed}
.as-step-agent{font-weight:600;margin-right:4px}.as-step-agent[data-agent=design]{color:#6b4fd8}.as-step-agent[data-agent=ui]{color:var(--as-blue)}.as-step-agent[data-agent=code]{color:var(--as-green)}.as-step small{display:block;color:var(--as-muted);font-size:11.5px;overflow-wrap:anywhere;white-space:pre-wrap}
@keyframes as-spin{to{transform:rotate(360deg)}}
.as-gates{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}
.as-controls{display:flex;gap:8px}
.as-composer{position:relative;margin:0 16px 6px;border:1px solid var(--as-line);border-radius:12px;background:var(--as-paper);padding:9px 48px 9px 12px}.as-composer:focus-within{border-color:#9dbaf6;box-shadow:0 0 0 3px #e7efff}
.as-composer textarea{display:block;width:100%;resize:none;border:0;outline:0;font:inherit;background:transparent;max-height:180px}.as-send{position:absolute;right:9px;bottom:9px;width:32px;height:32px;border:0;border-radius:50%;background:var(--ink,#272c32);color:var(--paper,#fff);display:flex;align-items:center;justify-content:center}.as-send:disabled{background:#b9bdc6}
.as-target{display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;color:#2f5fd0}.as-target button{border:0;background:none;padding:0 2px;color:var(--as-muted)}
.as-model-note{margin:0 16px 10px;color:var(--as-muted);font-size:11.5px;text-align:center}
.as-model-setup{align-self:center;color:var(--as-muted);font-size:12px;white-space:nowrap}
.as-right{display:flex;flex-direction:column;min-width:0;min-height:0;padding:0 24px}
.as-canvas-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:62px}.as-title{display:flex;align-items:center;gap:8px;min-width:0}.as-title h1{font-size:15px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.as-phase{border-radius:6px;background:var(--as-fill);padding:1px 8px;font-size:11.5px;color:var(--as-muted);white-space:nowrap}.as-phase[data-phase=ready]{background:var(--green-soft,#e4f5ee);color:#1f7a5c}.as-phase[data-phase=failed]{background:var(--red-soft,#fdecea);color:#a3332d}.as-phase[data-phase=clarifying],.as-phase[data-phase=paused]{background:var(--amber-soft,#fff3dc);color:#8a5a12}
.as-segment{display:flex;flex:none;padding:3px;border-radius:9px;background:var(--as-fill)}.as-segment button{border:0;border-radius:7px;background:none;padding:5px 18px;font-size:12px;white-space:nowrap}.as-segment [aria-selected=true]{background:var(--as-paper);box-shadow:0 1px 2px rgba(0,0,0,.08);font-weight:600}
.as-head-actions{display:flex;gap:8px;justify-content:flex-end;min-width:120px}
.as-canvas{position:relative;flex:1;min-height:0;border-radius:14px;background:var(--as-paper);box-shadow:0 1px 3px rgba(20,24,33,.06);display:flex;flex-direction:column;overflow:hidden}
.as-canvas-scroll{position:relative;flex:1;min-height:0;overflow:auto;padding:36px clamp(20px,6%,84px) 96px;scrollbar-width:thin}
.as-plugin{max-width:980px;margin:0 auto}.as-empty{max-width:560px;margin:8vh auto 0;text-align:center;color:var(--as-muted)}.as-empty h2{color:var(--as-ink);font-size:20px;margin-bottom:6px}
.as-skeleton{display:grid;gap:14px;max-width:760px;margin:0 auto}.as-skeleton div{height:18px;border-radius:6px;background:linear-gradient(90deg,var(--as-fill),#f7f8f9,var(--as-fill));background-size:200% 100%;animation:as-shimmer 1.6s ease-in-out infinite}.as-skeleton .tall{height:120px}
@keyframes as-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}
.as-canvas[data-tab=build] .pc-node{position:relative;outline:1px dashed transparent;outline-offset:6px;transition:outline-color .2s}.as-canvas[data-tab=build] .pc-node:hover{outline-color:#b9ccf7}.as-canvas[data-tab=build] .pc-node[data-as-target]{outline:2px solid var(--as-blue)}
.as-canvas[data-tab=build] .pc-node[data-as-queued]{display:none}.as-canvas[data-tab=build] .pc-node[data-as-landing]{opacity:0}
.as-canvas[data-tab=build] .pc-node[data-as-arrive]{animation:as-arrive .6s cubic-bezier(.2,.8,.2,1)}@keyframes as-arrive{from{opacity:0;transform:translateY(10px) scale(.985);filter:blur(2px)}to{opacity:1;transform:none;filter:none}}
.as-canvas[data-tab=build] .pc-node[data-live=false]{opacity:.6}.as-canvas[data-tab=build] .pc-node[data-live=false]::before{content:"功能待接通";position:absolute;top:-11px;right:0;z-index:1;font-size:10.5px;line-height:18px;color:#8a5a12;background:var(--amber-soft,#fff6e6);border:1px solid #f4dfb5;border-radius:999px;padding:0 7px}
.as-canvas[data-tab=build] .pc-node[data-as-wired]::after{content:"✓ 已接通";position:absolute;top:-12px;right:-6px;border-radius:999px;background:var(--green-soft,#e4f5ee);color:#1f7a5c;font-size:11px;padding:0 7px;animation:as-wired 1.6s ease-out forwards}@keyframes as-wired{0%,70%{opacity:1}100%{opacity:0}}
.as-canvas .pc-node{position:relative}.as-canvas .pc-inspect{position:absolute;top:-12px;right:-8px;z-index:2;border:1px solid #cfdcf8;border-radius:999px;background:var(--as-paper);padding:1px 9px;font-size:11.5px;opacity:0;transition:opacity .15s}.as-canvas[data-tab=build][data-inspectable] .pc-node:hover .pc-inspect,.as-canvas[data-tab=build][data-inspectable] .pc-inspect:focus-visible{opacity:1}.as-canvas:not([data-inspectable]) .pc-inspect,.as-canvas[data-tab=try] .pc-inspect{display:none}
.as-pointer{position:absolute;top:0;left:0;z-index:5;display:flex;align-items:flex-start;gap:2px;pointer-events:none;transition:transform .6s cubic-bezier(.2,.8,.2,1),opacity .2s}.as-pointer svg{width:17px;height:17px;fill:currentColor;stroke:#fff;stroke-width:1.2;filter:drop-shadow(0 1px 1px rgba(0,0,0,.18))}.as-pointer span{border-radius:6px;color:var(--paper,#fff);font-size:11.5px;font-weight:550;padding:1px 8px;margin-top:12px;box-shadow:0 3px 10px rgba(20,24,33,.16)}.as-pointer em{position:absolute;top:36px;left:18px;white-space:nowrap;font-style:normal;font-size:11.5px;border:1px solid var(--as-line);background:var(--as-paper);border-radius:6px;padding:1px 7px;color:var(--as-muted);box-shadow:0 3px 10px rgba(20,24,33,.08)}
.as-pointer-ui{color:var(--as-blue)}.as-pointer-ui span{background:var(--as-blue)}.as-pointer-code{color:var(--as-green)}.as-pointer-code span{background:var(--as-green)}
.as-pointer[data-click] svg{animation:as-click .38s ease-out}@keyframes as-click{50%{transform:scale(.78)}}
.as-frame{position:absolute;top:0;left:0;z-index:4;border:1.5px solid var(--as-blue);border-radius:10px;pointer-events:none;box-shadow:0 0 0 4px rgba(57,123,250,.1);transition:transform .5s cubic-bezier(.2,.8,.2,1),width .5s cubic-bezier(.2,.8,.2,1),height .5s cubic-bezier(.2,.8,.2,1)}.as-frame[data-mode=landing]{border-style:dashed;box-shadow:none;background:rgba(57,123,250,.03)}
.as-frame i{position:absolute;width:7px;height:7px;background:var(--as-paper);border:1.5px solid var(--as-blue);border-radius:2px}.as-frame i:nth-child(1){top:-4px;left:-4px}.as-frame i:nth-child(2){top:-4px;right:-4px}.as-frame i:nth-child(3){bottom:-4px;left:-4px}.as-frame i:nth-child(4){bottom:-4px;right:-4px}
.as-frame span{position:absolute;top:-21px;left:-1px;background:var(--as-blue);color:var(--paper,#fff);font-size:11px;line-height:18px;border-radius:5px 5px 5px 0;padding:0 7px;white-space:nowrap}
.as-board{position:absolute;left:50%;bottom:14px;z-index:6;transform:translateX(-50%);display:flex;align-items:stretch;gap:2px;max-width:calc(100% - 28px);overflow-x:auto;border:1px solid var(--as-line);border-radius:16px;background:var(--as-paper);box-shadow:0 10px 30px rgba(20,24,33,.1);padding:6px 8px;scrollbar-width:none}
.as-board-label{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:1px;padding:0 12px 0 6px;margin-right:4px;border-right:1px solid var(--as-line);white-space:nowrap;font-size:12px;font-weight:600}.as-board-label svg{width:16px;height:16px;color:#5069ae;margin-bottom:2px}.as-board-label small{font-weight:400;color:var(--as-muted);font-size:11px}
.as-part{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:64px;min-width:64px;height:58px;border:0;border-radius:10px;background:none;padding:4px;font-size:11px;color:var(--as-muted);transition:background .2s,color .2s,transform .3s cubic-bezier(.2,.8,.2,1.3),box-shadow .3s}.as-part svg{width:19px;height:19px;stroke-width:1.6}.as-part b{font-weight:500;white-space:nowrap}
.as-part:hover{background:var(--as-fill);color:var(--as-ink)}.as-part[data-used]{color:var(--as-ink)}.as-part-check{position:absolute;top:4px;right:7px;display:grid;place-items:center;min-width:14px;height:14px;border-radius:7px;background:var(--as-green);color:var(--paper,#fff);font-size:9px;font-style:normal;font-weight:700;padding:0 3px;animation:as-pop .4s cubic-bezier(.2,.8,.2,1.4)}@keyframes as-pop{from{transform:scale(0)}to{transform:none}}
.as-part[data-legal]{color:#8a5a12;background:var(--amber-soft,#fff6e6);box-shadow:inset 0 0 0 1px #f1d7a4}.as-part[data-legal]:hover{background:var(--amber-soft,#ffefd2)}.as-part[data-picking]{color:var(--as-blue);background:var(--blue-soft,#eef3ff);transform:translateY(-3px);box-shadow:0 4px 12px rgba(57,123,250,.22)}
.as-part-tip{position:absolute;z-index:8;bottom:90px;width:232px;padding:10px 12px;border-radius:11px;background:var(--as-paper);border:1px solid var(--as-line);box-shadow:0 14px 34px rgba(20,24,33,.13);font-size:12px;pointer-events:none}.as-part-tip b{display:block;font-size:13px;margin-bottom:2px}.as-part-tip p{color:var(--as-muted)}.as-part-tip ul{margin:7px 0 0;padding:7px 0 0;border-top:1px solid var(--as-line);list-style:none;display:grid;gap:3px}.as-part-tip li::before{content:"✓ ";color:var(--as-green)}.as-part-tip .as-tip-legal{color:#8a5a12;margin-top:6px}
.as-part[data-catalog]{opacity:.5}.as-board-more{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:64px;min-width:64px;height:58px;margin-left:4px;border:0;border-left:1px solid var(--as-line);border-radius:0 10px 10px 0;background:none;font-size:11px;color:var(--as-muted)}.as-board-more svg{width:18px;height:18px}.as-board-more[aria-expanded=true],.as-board-more:hover{color:var(--as-ink);background:var(--as-fill)}
.as-catalog{position:absolute;left:50%;bottom:90px;z-index:7;transform:translateX(-50%);width:min(880px,calc(100% - 28px));max-height:min(420px,calc(100% - 120px));overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px 18px;padding:14px 16px;border:1px solid var(--as-line);border-radius:14px;background:var(--as-paper);box-shadow:0 14px 40px rgba(20,24,33,.14);animation:as-rise .22s ease-out}
.as-catalog h4{margin:0 0 6px;font-size:11.5px;font-weight:600;color:var(--as-muted);display:flex;justify-content:space-between}.as-catalog section>div{display:flex;flex-wrap:wrap;gap:2px}.as-catalog .as-part{width:58px;min-width:58px;height:52px}.as-catalog-note{grid-column:1/-1;margin:0;font-size:11.5px;color:var(--as-muted)}
@keyframes as-rise{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
.as-board-cap{margin-left:6px;padding-left:12px!important;border-left:1px solid var(--as-line)}.as-cap b{max-width:60px;overflow:hidden;text-overflow:ellipsis}
.as-cap[data-as-arrive] .as-part-check{animation:as-pop .4s cubic-bezier(.2,.8,.2,1)}.as-cap[data-wiring]{outline:1.5px dashed var(--as-green);outline-offset:1px;animation:as-wiring 1.2s ease-in-out infinite}@keyframes as-wiring{50%{outline-color:transparent}}@media (prefers-reduced-motion:reduce){.as-cap[data-wiring]{animation:none}}
.as-cap-list{display:grid;gap:3px}.as-cap-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:1px 8px;padding:6px 8px;border-radius:8px;font-size:12px}.as-cap-row b{font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.as-cap-row small{grid-column:1/-1;color:var(--as-muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.as-cap-row[data-used]{background:var(--green-soft,#e4f5ee)}.as-cap-row[data-off]{opacity:.55}.as-cap-row .as-chip{font-size:10.5px;padding:0 6px}
.as-recent{display:grid;gap:6px}.as-recent h3{font-weight:500;margin-bottom:2px}.as-recent-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;text-align:left;border:1px solid var(--as-line);border-radius:10px;background:var(--as-paper);padding:9px 12px}.as-recent-item:hover{border-color:var(--as-line)}.as-recent-item b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.as-recent-item small{grid-column:1/-1;color:var(--as-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.as-status{display:flex;justify-content:space-between;gap:12px;min-height:34px;align-items:center;color:var(--as-muted);font-size:11.5px}
html:has(.as-preview-page),body:has(.as-preview-page){margin:0;background:var(--canvas,#f3f3f1)}
.as-preview-page{display:block;max-width:980px;margin:0 auto 32px;padding:36px clamp(16px,5%,56px);background:var(--as-paper);min-height:calc(100vh - 56px);border-radius:0 0 14px 14px}
.as-install{margin-top:10px;padding-top:10px;border-top:1px solid var(--as-line)}
.as-dialog{border:1px solid var(--as-line);border-radius:14px;padding:20px 22px;max-width:420px;width:calc(100% - 32px);box-shadow:0 18px 60px rgba(20,24,33,.18);color:var(--as-ink)}.as-dialog::backdrop{background:rgba(20,24,33,.28)}.as-dialog h3{font-size:15px;margin-bottom:8px}.as-dialog ul{margin:6px 0 10px;padding-left:18px}.as-dialog li{margin:3px 0}
.as-installed-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;max-width:980px;margin:16px auto 0;padding:14px clamp(16px,5%,56px);background:var(--as-paper);border-radius:14px 14px 0 0;border-bottom:1px solid #ececf0;font:13px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#232831}.as-installed-bar span{color:#737985}.as-installed-bar a{margin-left:auto;color:#2f5fd0;text-decoration:none}
@media (max-width:760px){.as-shell{grid-template-columns:minmax(0,1fr);grid-template-rows:56px auto minmax(0,1fr);height:auto;min-height:100vh;overflow:visible}.as-top{padding:0 12px}.as-brand{flex:none}.as-top-actions{flex:1;justify-content:flex-end;gap:6px;min-width:0}.as-select{flex:0 1 auto;min-width:0}.as-select select{width:100%;min-width:0;max-width:none}.as-select:has(select[data-as-model]){flex:0 0 112px}.as-brand b{font-size:15px}.as-canvas-head{flex-wrap:wrap;row-gap:4px;padding:8px 0}.as-title{flex:1 1 60%}.as-head-actions{min-width:0}.as-left{border-right:0;border-bottom:1px solid var(--as-line)}.as-feed{max-height:52vh}.as-right{padding:0 12px 12px;min-height:80vh}.as-model span,.as-brand span{display:none}.as-canvas-scroll{padding:24px 16px 96px}}
@media (prefers-reduced-motion:reduce){.as-shell *{animation:none!important;transition:none!important}}
`;

/** Browser client; a string so the host can inline it. Receives the host's routes and the component renderer. */
export const AGENT_STUDIO_CLIENT_FACTORY_SCRIPT = String.raw`(host)=>{
 const root=document.querySelector(host.mode==='preview'?'[data-studio-preview]':host.mode==='installed'?'[data-installed-plugin]':'[data-agent-studio]');
 if(!root)return;const lifetime=host.mountPluginClient(root);if(!lifetime)return;

 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icon=n=>'<svg aria-hidden="true"><use href="#icon-'+n+'"/></svg>';
 const headers=m=>m==='GET'?{}:(globalThis.molisWorkControlHeaders?.()||{'content-type':'application/json'});
 async function api(path,method='GET',body,signal){
  const r=await lifetime.fetch(host.api(path),{method,signal,cache:'no-store',headers:headers(method),...(body===undefined?{}:{body:JSON.stringify(body)})});
  const v=await r.json().catch(()=>({}));lifetime.assertCurrent(signal);if(!r.ok)throw Object.assign(new Error(v.error||'操作失败，内容已保留'),{status:r.status});return v;
 }
 let pending=0;globalThis.__molisPluginPending=0;
 const pluginCall=id=>async(componentId,binding,payload)=>{pending++;globalThis.__molisPluginPending=pending;try{return (await api('/builds/'+id+'/call','POST',{componentId,binding,payload,...(host.acceptance?{acceptance:host.acceptance}:{})})).value}finally{pending--;if(lifetime.alive)globalThis.__molisPluginPending=pending}};
 if(host.mode==='preview'){
  const readings=new Map(),plugin=host.components({root,call:pluginCall(host.build),onRead:(id,result)=>readings.set(id,result)});
  lifetime.own(()=>plugin.destroy());
  // Diagnose the actual rendered query, including selection and filters, without issuing another request.
  globalThis.__molisPluginRead=async componentId=>{const result=readings.get(componentId);if(!result)throw new Error('当前组件尚未读取');if('error'in result)throw new Error(result.error);return structuredClone(result.value)};
  api('/builds/'+host.build).then(async({build})=>{if(!build.design)throw new Error('这个草稿还没有确定方案');await plugin.update({contract:build.design.contract,nodes:build.nodes,connected:build.connected,presentation:build.design.presentation});if(lifetime.alive)globalThis.__molisPluginReady=true;}).catch(e=>{if(lifetime.alive)root.textContent=e.message;});
  return;
 }
 if(host.mode==='installed'){
  // An installed plugin: the same renderer; every call goes to the plugin's own sandboxed process through the host.
  if(parent!==window)root.dataset.framed='';
  const call=async(componentId,binding,payload)=>{pending++;globalThis.__molisPluginPending=pending;try{const r=await lifetime.fetch(host.call,{method:'POST',cache:'no-store',headers:headers('POST'),body:JSON.stringify({componentId,binding,payload})});const v=await r.json().catch(()=>({}));lifetime.assertCurrent();if(!r.ok)throw new Error(v.error||'操作失败，输入已保留');return v.value;}finally{pending--;if(lifetime.alive)globalThis.__molisPluginPending=pending}};
  const plugin=host.components({root,call});lifetime.own(()=>plugin.destroy());plugin.update(host.view).then(()=>{if(lifetime.alive)globalThis.__molisPluginReady=true;}).catch(e=>{if(lifetime.alive)root.textContent=e.message;});
  return;
 }
 const $=s=>root.querySelector(s);
 const feed=$('[data-as-feed]'),input=$('[data-as-input]'),canvas=$('[data-as-canvas]'),scroll=$('[data-as-scroll]'),pluginRoot=$('[data-as-plugin]'),empty=$('[data-as-empty]');
 let state={builds:[],releases:[],models:[],model:null,components:[],selectionAvailable:false},current=null,versions=[],preview=null,tab='build',target=null,source=null,frame=0,busy=false,notice='',openSteps=null,rendered='',seenWired=new Set(),firstPaint=true;
 // The UI Agent's placements, paced so each one can be seen: a part waits in the queue, is taken from the spec board and set in place.
 let revealed=new Set(),queue=[],landing=null,picking=null,playing=false,playToken=0;
 // Capabilities being connected: shown ticked on the capability board only once the code agent has carried them in.
 let wiredCaps=new Set(),wires=[],wiring=null,wiringPlay=false;
 // Parts are UI catalog components; builds from before keep their old names, which map onto the catalog.
 const LEGACY={heading:'frame',text:'card',list:'directory',cards:'card',reader:'accordion',chat:'card',matrix:'table',notice:'alert'},catalogKind=k=>LEGACY[k]||k;
 const GROUPS=['版面','展示','录入','操作','浮层','反馈'];let catalogOpen='';
 // The capability board: what this plugin uses from the project's unified action directory, and the whole directory.
 const CAP_ICON={platform:'sparkles',plugin:'package',mcp:'network'},CAP_SOURCES=[['platform','平台'],['plugin','已安装插件'],['mcp','MCP 与连接器']];
 const capabilityOf=id=>(state.capabilities||[]).find(c=>c.id===id&&c.offered!==false)||(state.capabilities||[]).find(c=>c.id===id)||{id,title:id,source:{kind:'platform'}};
 function usedCapabilities(b){const ops=b?.design?.contract.operations||[];return [...new Set(ops.flatMap(o=>o.effects?.capabilities||[]))].map(id=>{const using=ops.filter(o=>(o.effects?.capabilities||[]).includes(id));return {c:capabilityOf(id),done:using.every(o=>b.connected.includes(o.id)),ops:using.map(o=>o.id)};});}
 const plugin=host.components({root:pluginRoot,call:(id,binding,payload)=>current?pluginCall(current.id)(id,binding,payload):Promise.reject(new Error('还没有草稿')),inspect:id=>{if(tab!=='build'||!current?.design)return;target=id;schedule();input.focus();}});
 lifetime.own(()=>plugin.destroy());
 const PHASE={draft:'草稿',designing:'设计中',clarifying:'等你回答',choosing:'比较方案',building:'构建中',paused:'已暂停',failed:'需要处理',ready:'可以试用'};
 // A build stopped on a question for the person is waiting for them, not paused.
 const phaseOf=b=>!b.active&&(b.pendingPlugins?.length||b.pendingPart)?'等你决定':PHASE[b.phase]||b.phase;
 const AGENT={design:'主线设计',ui:'UI Agent',code:'代码 Agent',host:'宿主检查'};
 const componentName=kind=>(state.components.find(c=>c.kind===catalogKind(kind))||{}).name||kind;
 const active=b=>!!b?.active;
 const EXAMPLES=[['读书笔记','记录读过的书、评分和一句话感受，按状态筛选'],['每日复盘','每天写下完成了什么、卡在哪里、明天最重要的一件事'],['小组报名表','收集报名人的姓名、联系方式和时间段，能看到已报名名单']];
 function selection(s){if(!s)return '';if(s.source==='jev')return '<span class="as-chip jev">Jev · '+s.candidates.length+' 选 1'+(s.elapsedMs!=null?' · '+s.elapsedMs+'ms':'')+'</span>';if(s.source==='design')return '<span class="as-chip rule">UI Agent</span>';if(s.source==='user')return '<span class="as-chip user">你选择</span>';return '<span class="as-chip rule">'+(s.candidates.length===1?'唯一合法':'规则选择')+'</span>';}
 function gates(detail){try{const g=JSON.parse(detail);if(!Array.isArray(g))return '';const name={G1:'合同',G2:'类型',G3:'打包',G4:'实现',G5:'测试',G6:'沙箱试运行'};return '<div class="as-gates">'+g.map(x=>'<span class="as-chip '+(x.passed?'ok':'bad')+'" title="'+esc(x.id+' '+x.detail)+'">'+esc(name[x.id]||x.id)+(x.passed?' ✓':' ✗')+'</span>').join('')+'</div>'+g.filter(x=>!x.passed).map(x=>'<small>'+esc(x.detail).slice(0,600)+'</small>').join('');}catch{return detail?'<small>'+esc(detail).slice(0,600)+'</small>':'';}}
 function checkChips(detail){try{const r=JSON.parse(detail);return Array.isArray(r?.gates)?gates(JSON.stringify(r.gates)):'';}catch{return '';}}
 function cases(detail){try{const c=JSON.parse(detail);if(!Array.isArray(c))return '';return '<small>'+c.filter(x=>x.passed).length+'/'+c.length+' 条验收通过</small>'+c.filter(x=>!x.passed).map(x=>{let d=x.detail;try{const i=JSON.parse(d);d=(i.step?'第 '+i.step+' 步 ':'')+(i.reason||'')+(i.visible?'（界面显示：'+i.visible.slice(0,80)+'）':'');}catch{}return '<small>✗ '+esc(x.id)+'：'+esc(d).slice(0,300)+'</small>';}).join('');}catch{return '';}}
 function stepHtml(s){let label=s.label,detail='';
  if(s.agent==='code'&&s.action==='file'){label='写入 '+(s.detail||s.label);}
  else if(s.agent==='code'&&s.action==='check'){label='自查门禁';detail=checkChips(s.detail);}
  else if(s.agent==='code'&&s.action==='tool'){label=(s.label==='read'?'读取 ':s.label==='search'?'搜索 ':s.label+' ')+(s.detail||'').slice(0,80);}
  else if(s.agent==='code'&&s.action==='verify')detail=gates(s.detail);
  else if(s.agent==='host'&&s.action==='verify')detail=cases(s.detail);
  else if(s.detail)detail='<small>'+esc(s.detail).slice(0,400)+'</small>';
  return '<li class="as-step" data-status="'+esc(s.status)+'"><i aria-hidden="true"></i><div><span class="as-step-agent" data-agent="'+esc(s.agent)+'">'+esc(AGENT[s.agent]||s.agent)+'</span>'+esc(label)+' '+selection(s.selection)+detail+'</div></li>';}
 const capabilityTitle=id=>(state.capabilities||[]).find(x=>x.id===id)?.title||id;
 /** The plugins a proposal would need enabled in this project first. */
 function toEnable(c){const ids=new Set(c.preview.contract.operations.flatMap(o=>o.effects?.capabilities||[]));return [...new Set((state.capabilities||[]).filter(x=>ids.has(x.id)&&x.installed===false).map(x=>x.source?.title||''))].filter(Boolean);}
 // W7: the proposal's picture when an image service drew one; nothing at all when there is none.
 function mockupHtml(c,large){const m=c.mockup;if(!m||m.status==='failed'||!current)return '';if(m.status==='drawing')return '<div class="as-mockup" data-drawing><span class="as-dots">正在画效果图</span></div>';
  return '<img class="as-mockup'+(large?' as-mockup-large':'')+'" src="'+esc(host.api('/builds/'+current.id+'/mockups/'+c.id))+'" alt="'+esc('「'+c.title+'」的效果图')+'" loading="lazy">';}
 function candidateHtml(c,selected){const ops=c.preview.contract.operations,caps=[...new Set(ops.flatMap(o=>o.effects?.capabilities||[]))].map(capabilityTitle),enable=toEnable(c);return '<button type="button" class="as-candidate" data-as-candidate="'+esc(c.id)+'" aria-pressed="'+(selected?'true':'false')+'">'+mockupHtml(c,false)+'<b>'+esc(c.title)+'</b><p>'+esc(c.description)+'</p><p class="as-small as-muted">'+esc(c.rationale)+'</p><div class="as-meta"><span class="as-chip">'+ops.length+' 项功能</span><span class="as-chip">'+c.preview.parts.length+' 个界面零件</span><span class="as-chip">'+c.preview.contract.pages.length+' 个页面</span>'+caps.map(t=>'<span class="as-chip">'+esc(t)+'</span>').join('')+enable.map(t=>'<span class="as-chip" data-as-enable>要先启用「'+esc(t)+'」</span>').join('')+'</div></button>';}
 function effects(c){const e=c.effects||{};const words=[];if(e.storage)words.push('自己的存储（'+e.storage.map(x=>x==='read'?'读':'写').join('/')+'）');if(e.capabilities?.length)words.push(e.capabilities.map(capabilityTitle).join('、'));if(e.networkDomains?.length)words.push('联网 '+e.networkDomains.join('、'));return words.join('；')||'不使用任何外部能力';}
 // One row of the task board: where this operation stands, and what its code agent is doing or where it is stuck.
 function opState(b,op){if(b.connected.includes(op.id))return '<span class="as-chip ok">已接通</span>';const s=b.steps.find(x=>x.agent==='code'&&x.operationId===op.id&&x.action==='implement'&&x.status==='active');
  if(s&&active(b)){const round=/第 (\d+) 轮/.exec(s.label)?.[1];return '<span class="as-chip jev">'+(round?'修正第 '+round+' 轮':'编写中')+'</span>';}
  const f=b.steps.find(x=>x.agent==='code'&&x.operationId===op.id&&x.action==='verify'&&x.status==='failed');return f?'<span class="as-chip bad">卡住了</span>':'<span class="as-chip">'+(active(b)&&b.active.stage==='build'?'排队中':'待接通')+'</span>';}
 function opNote(b,op){if(b.connected.includes(op.id))return '';const mine=[...b.steps].reverse().filter(x=>x.agent==='code'&&x.operationId===op.id);
  const f=mine.find(x=>x.action==='verify'&&x.status==='failed');if(f&&!active(b)){const gate=(()=>{try{return JSON.parse(f.detail).find(g=>!g.passed);}catch{return null;}})();return gate?'<small class="as-op-note">'+esc(gate.id+'：'+gate.detail.slice(0,120))+'</small>':'';}
  if(!active(b))return '';const now=mine.find(x=>['file','tool','check'].includes(x.action));return now?'<small class="as-op-note">'+esc(now.action==='file'?'写入 '+(now.target||(now.detail||'').slice(0,60)):now.action==='check'?'正在自查门禁':now.label)+'</small>':'';}
 /** What went wrong, in the person's words, and what they can do; the host's own words stay under 技术细节. */
 function failure(e){e=e||'';const c=/^界面验收「([^」]+)」/.exec(e);
  if(c)return ['试用时「'+c[1]+'」没有按预期工作','点「继续」让 AI 再修一次；也可以在下面直接告诉它应该怎样。'];
  if(/已达到 \d+ 轮修复上限/.test(e))return ['有一项功能没能写好','点「继续」让 AI 再试一次；如果反复失败，可以在下面把这项功能说得更简单些。'];
  if(/^(界面合同无效|功能合同不成立|细化方案|验收「|操作 |组件 |模型输出不是完整 JSON|rework)/.test(e))return ['设计这一步没能完成','点「继续」让 AI 重新设计一次；也可以在下面换个说法描述你的需求。'];
  return null;}
 function installed(b){return b?.design?(state.installations||[]).find(i=>i.pluginId===b.design.contract.pluginId):null;}
 const covered=(next,approved)=>Object.entries(next||{}).every(([k,v])=>v.every(x=>(approved?.[k]||[]).includes(x)));
 function installHtml(b){const latest=versions[0],inst=installed(b);if(!latest)return '';
  if(!inst)return '<div class="as-install"><p class="as-small">v'+latest.version+' 已发布，安装后会出现在这个项目里，数据和试用分开保存。</p><div class="as-actions"><button type="button" class="as-button as-primary" data-as-install="'+latest.version+'">'+icon('download')+'安装到这个项目</button></div></div>';
  const upgrade=latest.version>inst.version?'<button type="button" class="as-button" data-as-upgrade="'+latest.version+'">'+icon('refresh')+'升级到 v'+latest.version+'</button>':'';
  return '<div class="as-install"><p class="as-small"><span class="as-chip ok">已安装 v'+inst.version+'</span>'+(inst.state==='running'?'':' <span class="as-chip bad">'+esc(inst.state)+'</span>')+'</p>'+(inst.error?'<p class="as-small" role="alert">'+esc(inst.error)+'</p>':'')+'<div class="as-actions"><a class="as-button as-primary" href="'+esc(host.plugin(inst.pluginId))+'" target="_blank" rel="noopener" data-as-open-plugin="'+esc(b.id)+'">'+icon('external')+'打开插件</a>'+upgrade+(inst.state==='disabled'?'<button type="button" class="as-button" data-as-install-enable>启用</button>':'')+'<button type="button" class="as-button" data-as-uninstall>'+icon('trash')+'卸载</button></div></div>';}
 // What an installation grants, grouped the way the person weighs it: its own data, what it reads (granted with the
 // installation), and what it changes outside itself (each listed).
 function effectsList(e){const own=[],reads=[],writes=[],other=[];if(e?.storage?.length)own.push(e.storage.includes('write')?'在本机保存和读取它自己的数据（只属于这个插件）':'读取它自己保存的数据');
  for(const id of e?.capabilities||[]){const c=(state.capabilities||[]).find(x=>x.id===id),words=(c?.consent||'使用平台能力：'+id).replace(/^(读取|写入)：/,'');(c?.effect==='read'?reads:writes).push(words);}
  if(e?.networkDomains?.length)other.push('访问这些网站：'+e.networkDomains.join('、'));
  if(e?.secretRefs?.length)other.push('使用你保存的密钥：'+e.secretRefs.join('、')+'（插件只拿到引用，看不到内容）');if(e?.artifacts?.length)other.push('读写项目里的文档成果');
  return [['它自己的数据',own],['会读取',reads],['会替你改动',writes],['其他',other]].filter(([,rows])=>rows.length);}
 /** A small in-page dialog; resolves with the chosen button's value, or '' when dismissed. */
 function ask(title,text,buttons){return new Promise(resolve=>{const d=document.createElement('dialog');d.className='as-dialog';
  d.innerHTML='<form method="dialog"><h3>'+esc(title)+'</h3><p class="as-small">'+esc(text)+'</p><div class="as-actions">'+buttons.map(([value,label,primary])=>'<button value="'+esc(value)+'" class="as-button'+(primary?' as-primary':'')+'">'+esc(label)+'</button>').join('')+'</div></form>';
  settle(d,resolve);});}
 // Resolve from the form's own submit (synchronous with the click) and from Escape; a dialog's close event is not
 // delivered while the page is in the background.
 function settle(d,resolve){const stop=lifetime.own(()=>{d.close();d.remove();resolve('');});root.append(d);d.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const value=e.submitter?.value||'';d.close();d.remove();resolve(value);stop();});
  d.addEventListener('cancel',e=>{e.preventDefault();d.close();d.remove();resolve('');stop();});d.showModal();}
 function consent(title,effects,confirmLabel){return new Promise(resolve=>{const d=document.createElement('dialog');d.className='as-dialog';const refs=effects?.secretRefs||[];
  d.innerHTML='<form method="dialog"><h3>'+esc(title)+'</h3>'+(effectsList(effects).map(([head,rows])=>'<p class="as-small as-muted">'+esc(head)+'</p><ul>'+rows.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>').join('')||'<p class="as-small">不需要任何额外权限。</p>')
   +(refs.length?'<p class="as-small as-muted">它要用到的密钥（保存在本机加密存储里，插件只拿到名字，看不到内容）</p>'+refs.map(r=>'<div class="as-secret" data-secret="'+esc(r)+'"><b>'+esc(r)+'</b><input data-secret-header value="Authorization" aria-label="'+esc(r)+' 放在哪个请求头" required><input type="password" data-secret-value placeholder="例如 Bearer sk-…" aria-label="'+esc(r)+' 的内容" required autocomplete="off"></div>').join(''):'')
   +'<p class="as-small as-muted">除了上面列出的，它不能读取你的文件和其他插件的数据'+(effects?.networkDomains?.length?'，也只能访问上面列出的网站':'，也不能联网')+'；运行在隔离的进程里。</p><div class="as-actions"><button value="cancel" class="as-button" formnovalidate>取消</button><button value="ok" class="as-button as-primary">'+esc(confirmLabel)+'</button></div></form>';
  settle(d,value=>resolve(value==='ok'?{secrets:[...d.querySelectorAll('[data-secret]')].map(x=>({name:x.dataset.secret,header:x.querySelector('[data-secret-header]').value.trim(),value:x.querySelector('[data-secret-value]').value}))}:false));});}
 function agents(b){const rows=[];const last=(agent,f=()=>true)=>[...b.steps].reverse().find(s=>s.agent===agent&&f(s));
  const d=last('design');if(d)rows.push(['design',d.status==='active'?'<span class="as-dots">'+esc(d.label)+'</span>':esc(d.label)+(d.selection?' '+selection(d.selection):'')]);
  const u=last('ui');if(u)rows.push(['ui',esc(u.label)+' '+selection(u.selection)]);
  const writing=b.steps.filter(s=>s.agent==='code'&&s.action==='implement'&&s.status==='active');
  if(writing.length>1&&active(b)){rows.push(['code','<span class="as-dots">同时在写 '+writing.length+' 项功能</span><small class="as-muted"> · 各自只改自己的文件</small>']);}
  const c=writing.length>1&&active(b)?null:last('code',s=>s.action==='implement'&&s.status==='active')||last('code',s=>s.action==='verify');const act=last('code',s=>['file','tool','check'].includes(s.action));
  if(c)rows.push(['code',(c.status==='active'?'<span class="as-dots">'+esc(c.label)+'</span>':esc(c.label))+(c.status==='active'&&act?'<small class="as-muted"> · '+esc(act.action==='file'?'写入 '+(act.detail||'').slice(0,60):act.action==='check'?'正在自查门禁':act.label)+'</small>':'')]);
  const h=last('host');if(h)rows.push(['host',h.status==='active'?'<span class="as-dots">'+esc(h.label)+'</span>':esc(h.label)]);
  return rows.length?'<div class="as-agents">'+rows.map(([a,t])=>'<div class="as-agent" data-agent="'+a+'"><b>'+AGENT[a]+'</b><span>'+t+'</span></div>').join('')+'</div>':'';}
 function renderFeed(){
  const b=current,parts=[];
  if(!b){parts.push('<h2>一起把想法做出来</h2><p class="as-muted">说说你想要一个什么样的插件：谁用、做什么、留下什么结果。主线设计会先理解需求，再给出几个方案让你比较。</p><div class="as-examples">'+EXAMPLES.map(([t,d])=>'<button type="button" class="as-example" data-as-example="'+esc(d)+'"><b>'+esc(t)+'</b><span class="as-muted as-small">'+esc(d)+'</span></button>').join('')+'</div><p class="as-small as-muted">示例只会填进输入框，不会自动开始。</p>');
   if(state.builds.length)parts.push('<div class="as-recent"><h3 class="as-small as-muted">或者继续做之前的插件</h3>'+state.builds.slice(0,6).map(x=>'<button type="button" class="as-recent-item" data-as-open="'+esc(x.id)+'"><b>'+esc(x.design?.title||x.title)+'</b><span class="as-phase" data-phase="'+esc(x.phase)+'">'+esc(phaseOf(x))+'</span><small>'+esc(x.brief)+'</small></button>').join('')+'</div>');}
  else{
   parts.push('<div class="as-brief"><span>你的需求</span><p>'+esc(b.brief)+'</p></div>');
   for(const m of b.messages.slice(1))parts.push('<div class="as-brief"><span>'+(m.role==='user'?'你补充了':'主线设计')+'</span><p>'+esc(m.text)+'</p></div>');
   if(b.questions.length)parts.push('<div class="as-card as-decision"><h3>主线设计需要你回答 '+b.questions.length+' 个问题</h3><ol>'+b.questions.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ol><p class="as-small as-muted">在下方输入框里回答；只会追问这一轮。</p></div>');
   if(b.phase==='choosing'&&b.candidates.length)parts.push('<div><h3 class="as-small as-muted">'+b.candidates.length+' 个方案 · 点选在右侧预览</h3><div class="as-candidates">'+b.candidates.map(c=>candidateHtml(c,c.id===(preview||b.candidates[0].id))).join('')+'</div>'+(()=>{const c=b.candidates.find(x=>x.id===(preview||b.candidates[0].id));return c?'<div class="as-card" style="margin-top:10px">'+mockupHtml(c,true)+'<h3>'+esc(c.title)+' 的使用路径</h3><p>'+c.journey.map(esc).join(' → ')+'</p><p class="as-small as-muted" style="margin-top:6px">会用到：'+esc(effects(c))+'</p>'+(toEnable(c).length?'<p class="as-small" style="margin-top:6px">这个方案要用到这个项目还没启用的'+toEnable(c).map(t=>'「'+esc(t)+'」').join('、')+'，开工前会先问你要不要启用。</p>':'')+'<div class="as-actions"><button type="button" class="as-button as-primary" data-as-choose="'+esc(c.id)+'">采用这个方案并开始构建</button></div></div>':'';})()+'</div>');
   if(!b.design&&b.chosen&&b.active?.stage==='detail'){const c=b.candidates.find(x=>x.id===b.chosen);if(c)parts.push('<div class="as-card"><h3>已采用「'+esc(c.title)+'」</h3><p class="as-small as-muted">主线设计正在补全功能合同、界面零件和验收用例；完成后 UI Agent 和代码 Agent 会同时开工。</p></div>');}
   if(b.design)parts.push('<div class="as-card"><h3>主线 · '+esc(b.design.title)+'</h3><p class="as-small">'+b.design.journey.map(esc).join(' → ')+'</p><ul class="as-ops">'+b.design.contract.operations.map(op=>'<li><span>'+esc(op.description||op.id)+' <code>'+esc(op.id)+'</code>'+opNote(b,op)+'</span>'+opState(b,op)+'</li>').join('')+'</ul>'+(b.notes?.length?'<p class="as-small as-muted" style="margin-top:6px">宿主整理：'+b.notes.slice(0,6).map(esc).join('、')+'</p>':'')+'</div>');
   const ag=agents(b);if(ag)parts.push(ag);
   if(b.pendingPlugins?.length)parts.push('<div class="as-card as-decision"><h3>这个方案要用到还没在这个项目启用的插件</h3><ul class="as-ops">'+b.pendingPlugins.map(p=>'<li><span><b>'+esc(p.title)+'</b> · '+esc(p.capabilities.join('、'))+'</span></li>').join('')+'</ul><p class="as-small as-muted">启用后它会出现在这个项目里，插件也才能用它的能力；不启用的话，主线设计会换一种不需要它的做法。</p><div class="as-actions"><button type="button" class="as-button as-primary" data-as-action="enable-plugins">'+icon('check')+'启用并继续</button><button type="button" class="as-button" data-as-action="skip-plugins">不用它，改方案</button></div></div>');
   if(b.pendingPart){const part=b.design?.parts.find(p=>p.id===b.pendingPart.id);parts.push('<div class="as-card as-decision"><h3>请你选择「'+esc(part?.purpose||b.pendingPart.id)+'」用哪个组件</h3><p class="as-small as-muted">'+esc(b.pendingPart.reason)+'。已放入的组件不受影响。</p><div class="as-actions">'+b.pendingPart.candidates.map(k=>'<button type="button" class="as-button" data-as-part="'+esc(k)+'">'+esc(componentName(k))+'</button>').join('')+'</div></div>');}
   if(b.error)parts.push('<div class="as-card as-error"><h3>'+(b.phase==='paused'?'已暂停':failure(b.error)?.[0]||'这一步没有完成')+'</h3><p>'+(b.phase!=='paused'&&failure(b.error)?esc(failure(b.error)[1])+'</p><details class="as-small as-muted"><summary>技术细节</summary><p>'+esc(b.error)+'</p></details>':esc(b.error)+'</p>')+'<div class="as-actions">'+(!active(b)?'<button type="button" class="as-button as-primary" data-as-action="resume">'+icon('play')+'继续</button>':'')+(b.history.length&&!active(b)?'<button type="button" class="as-button" data-as-action="undo">'+icon('undo')+'撤回上次修订</button>':'')+'</div></div>');
   if(b.phase==='ready'){const cases=b.browserResult?.cases||[],latest=versions[0],published=latest&&latest.design.contract.revision===b.design.contract.revision&&JSON.stringify(latest.nodes)===JSON.stringify(b.nodes)&&JSON.stringify(latest.design.presentation)===JSON.stringify(b.design.presentation);parts.push('<div class="as-card"><h3>可以试用了</h3><p class="as-small">'+b.connected.length+' 项功能全部接通 · 门禁 G1–G6 通过 · 界面验收 '+cases.filter(c=>c.passed).length+'/'+cases.length+' 通过</p><div class="as-actions">'+(published?'<span class="as-chip ok">v'+latest.version+' 已是当前版本</span>':'<button type="button" class="as-button as-primary" data-as-action="publish">'+icon('package')+'发布 v'+((latest?.version||0)+1)+'</button>')+'<a class="as-button" href="'+esc(host.preview(b.id))+'" target="_blank" rel="noopener">'+icon('external')+'单独打开试用</a></div>'+installHtml(b)+'</div>');}
   if(active(b))parts.push('<div class="as-controls"><button type="button" class="as-button" data-as-action="pause">'+icon('pause')+'暂停</button></div>');
   else if(b.phase==='paused'&&!b.error&&!b.pendingPlugins?.length)parts.push('<div class="as-controls"><button type="button" class="as-button as-primary" data-as-action="resume">'+icon('play')+'继续构建</button></div>');
   if(b.steps.length){const done=b.steps.filter(s=>s.status==='done').length,shown=b.steps.slice(-60);parts.push('<details class="as-steps" data-as-steps'+(openSteps??active(b)?' open':'')+'><summary>协作记录 · '+done+' 步已完成</summary><ol>'+(b.steps.length>shown.length?'<li class="as-small as-muted">更早的 '+(b.steps.length-shown.length)+' 步已折叠</li>':'')+shown.map(stepHtml).join('')+'</ol></details>');}
  }
  if(b?.visualResult){const v=b.visualResult;parts.push('<div class="as-card"><h3>'+(v.structural?'宽窄屏结构检查通过':'界面结构需要修正')+'</h3><p>'+(v.status==='reviewed'?'视觉复查已完成':'功能已验证；视觉未复查')+'</p>'+v.issues.map(issue=>'<p class="as-small">'+esc(issue)+'</p>').join('')+'</div>');}
  if(notice)parts.push('<div class="as-card as-error" role="alert"><p>'+esc(notice)+'</p></div>');
  const html=parts.join('');if(html===rendered)return;rendered=html;
  const bottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<40;feed.innerHTML=html;if(!current)feed.scrollTop=0;else if(bottom||firstPaint)feed.scrollTop=feed.scrollHeight;firstPaint=false;
 }
 function renderHead(){
  $('[data-as-edit-label]').hidden=!(current?.design&&current?.checks?.global?.passed);if($('[data-as-edit-label]').hidden)$('[data-as-edit-mode]').value='message';
  const b=current;$('[data-as-title]').textContent=b?(b.design?.title||b.candidates.find(c=>c.id===b.chosen)?.title||b.title):'新插件';const phase=$('[data-as-phase]');phase.textContent=b?(b.active?.stage==='detail'?'细化方案中':b.active?.stage==='revise'?'修订中':b.active?.stage==='design'?'理解需求中':phaseOf(b)):'';phase.dataset.phase=b?.phase||'';phase.hidden=!b;
  root.querySelectorAll('[data-as-tab]').forEach(t=>{t.setAttribute('aria-selected',String(t.dataset.asTab===tab));t.disabled=t.dataset.asTab==='try'&&!(b?.connected.length);});
  if(active(b)||!previousVisual(b))comparePrevious=false;
  canvas.dataset.tab=tab;canvas.toggleAttribute('data-inspectable',!!b?.design&&!active(b));
  $('[data-as-head-actions]').innerHTML=(previousVisual(b)&&!active(b)?'<button type="button" class="as-button" data-as-compare aria-pressed="'+comparePrevious+'">'+(comparePrevious?'返回当前界面':'查看上次界面')+'</button><button type="button" class="as-icon" data-as-action="undo" title="撤回上次修订" aria-label="撤回上次修订">'+icon('undo')+'</button>':'')+(b?.design?'<a class="as-icon" href="'+esc(host.preview(b.id))+'" target="_blank" rel="noopener" title="单独打开试用" aria-label="单独打开试用">'+icon('external')+'</a>':'')+(b&&!active(b)?'<button type="button" class="as-icon" data-as-remove title="删除这个草稿" aria-label="删除这个草稿">'+icon('trash')+'</button>':'');
  const composer=$('[data-as-composer]'),send=composer.querySelector('.as-send');
  input.placeholder=!b?'描述你想要的插件，例如：记录读过的书和感受，按状态筛选':b.questions.length?'回答上面的问题':active(b)?'直接说要改什么：会先停下这一轮，再按你的意思改':b.design?'对整体或选中的组件提出修改':'补充你的需求';
  // Typing never waits for a build: a change request stops the current round and is taken in.
  send.disabled=busy;
  const t=$('[data-as-target]');const node=target&&b?.nodes.find(n=>n.id===target);t.hidden=!node;t.innerHTML=node?'指向 · '+esc(node.purpose)+' <button type="button" data-as-untarget aria-label="取消指向">'+icon('x')+'</button>':'';
  const model=state.models.find(m=>m.provider_id===state.model?.provider_id&&m.model_id===state.model?.model_id);
  $('[data-as-model-note]').textContent=(model?'主线设计与代码 Agent：'+model.label:'请选择构建使用的模型')+' · Jev '+(state.selectionAvailable?'已配置':'未配置（优先使用 UI Agent 的设计）');
 }
 /** What the rendered plugin actually uses from the catalog: every component carries its catalog slot. */
 function usedSlots(){const used=new Map();for(const el of pluginRoot.querySelectorAll('[data-slot]')){if(el.closest('[hidden]'))continue;const k=({'directory-row':'directory','button-loading-indicator':'spinner','collapsible':'accordion'})[el.dataset.slot]||el.dataset.slot;used.set(k,(used.get(k)||0)+1);}return used;}
 function renderBoard(){if(!lifetime.alive)return;
  const b=current,board=$('[data-as-board]'),panel=$('[data-as-catalog-panel]');board.hidden=!b?.design;if(board.hidden){tip.hidden=true;panel.hidden=true;return;}
  // Only what has landed counts as placed; a part still waiting its turn is not on the page yet.
  const placed=b.nodes.filter(n=>revealed.has(n.id)),parts=new Map();for(const n of placed)parts.set(catalogKind(n.kind),(parts.get(catalogKind(n.kind))||0)+1);
  const inside=usedSlots(),legal=new Set((b.pendingPart?.candidates||[]).map(catalogKind)),used=c=>parts.get(c.kind)||(c.use!=='part'&&inside.has(c.kind)?1:0);
  const item=c=>{const n=used(c);return '<button type="button" class="as-part" data-kind="'+esc(c.kind)+'"'+(n?' data-used':'')+(c.use==='catalog'&&!n?' data-catalog':'')+(c.kind===picking?' data-picking':'')+(legal.has(c.kind)?' data-legal data-as-part="'+esc(c.kind)+'"':'')+' aria-label="'+esc(c.name+' '+c.catalog+'：'+c.description)+'">'+icon(c.icon||'frame')+'<b>'+esc(c.name)+'</b>'+(n?'<i class="as-part-check" aria-hidden="true">'+(n>1&&c.use==='part'?n:'✓')+'</i>':'')+'</button>';};
  const total=state.components.length,inUse=state.components.filter(used).length,caps=usedCapabilities(b),directory=(state.capabilities||[]).filter(c=>c.offered);
  const html='<span class="as-board-label">'+icon('frame')+'规格板<small>已放入 '+placed.length+'/'+b.design.parts.length+' · 用到 '+inUse+'/'+total+'</small></span>'+state.components.filter(c=>c.use==='part').map(item).join('')
   +'<button type="button" class="as-board-more" data-as-catalog="components" aria-expanded="'+(catalogOpen==='components')+'" title="UI 目录里的全部组件">'+icon('grid')+'<b>全部 '+total+'</b></button>'
   +'<span class="as-board-label as-board-cap">'+icon('zap')+'能力板<small>接通 '+caps.filter(x=>x.done).length+'/'+caps.length+' · 目录 '+directory.length+'</small></span>'
   +caps.map(({c,done,ops})=>{const shown=done&&wiredCaps.has(c.id),busy=wiring===c.id||!done&&active(b)&&b.steps.some(s=>s.agent==='code'&&s.action==='implement'&&s.status==='active'&&ops.includes(s.operationId));
     return '<button type="button" class="as-part as-cap" data-cap="'+esc(c.id)+'"'+(shown?' data-used':'')+(busy?' data-wiring':'')+' aria-label="'+esc(c.title+'：'+(c.description||'')+(busy?'（接线中）':''))+'">'+icon(CAP_ICON[c.source?.kind]||'zap')+'<b>'+esc(c.title)+'</b>'+(shown?'<i class="as-part-check" aria-hidden="true">✓</i>':'')+'</button>';}).join('')
   +'<button type="button" class="as-board-more" data-as-catalog="capabilities" aria-expanded="'+(catalogOpen==='capabilities')+'" title="能力目录：平台、已安装插件、MCP 与连接器">'+icon('grid')+'<b>全部 '+directory.length+'</b></button>';
  if(board.dataset.html!==html){board.innerHTML=html;board.dataset.html=html;}
  panel.hidden=!catalogOpen;
  let body='';
  if(catalogOpen==='components')body='<p class="as-catalog-note">规格板就是 UI 目录（/__ui/catalog）：带 ✓ 的是这个插件正在用的，浅色的是目录里有、生成插件暂未用到的。</p>'+GROUPS.map(g=>{const list=state.components.filter(c=>c.group===g);return '<section><h4><span>'+g+'</span><span>'+list.filter(used).length+'/'+list.length+'</span></h4><div>'+list.map(item).join('')+'</div></section>';}).join('');
  if(catalogOpen==='capabilities'){const usedIds=new Set(caps.map(x=>x.c.id)),row=c=>'<div class="as-cap-row"'+(usedIds.has(c.id)?' data-used':'')+(c.offered===false?' data-off':'')+' title="'+esc(c.description||'')+'"><b>'+esc(c.title)+'</b><span class="as-chip">'+(c.effect==='read'?'读':c.effect==='write'?'写':'不可撤销')+'</span><small>'+esc(c.offered===false?c.reason||'':(c.source?.title||'')+' · '+c.id)+'</small></div>';
   const all=(state.capabilities||[]).filter(c=>!c.legacy),off=all.filter(c=>c.offered===false);
   body='<p class="as-catalog-note">能力板就是项目的统一能力目录：读类随安装授予，写类安装时逐项授权、试用时用替身；不能撤销的不开放给插件。</p>'+CAP_SOURCES.map(([k,name])=>{const list=all.filter(c=>c.offered&&c.installed!==false&&c.source?.kind===k);return '<section><h4><span>'+name+'</span><span>'+list.length+'</span></h4><div class="as-cap-list">'+(list.map(row).join('')||'<small class="as-muted">暂无</small>')+'</div></section>';}).join('')
    +(()=>{const idle=all.filter(c=>c.offered&&c.installed===false);return idle.length?'<section><h4><span>未启用的插件（用到时会先问你）</span><span>'+idle.length+'</span></h4><div class="as-cap-list">'+idle.map(row).join('')+'</div></section>':'';})()
    +(off.length?'<section><h4><span>不开放给插件</span><span>'+off.length+'</span></h4><div class="as-cap-list">'+off.map(row).join('')+'</div></section>':'');}
  if(catalogOpen&&panel.dataset.html!==body){panel.innerHTML=body;panel.dataset.html=body;}
 }
 const tip=$('[data-as-tip]');
 /** What a spec-board part is, and where this plugin already uses it. */
 function showTip(button){
  if(button.dataset.cap){const cap=capabilityOf(button.dataset.cap),use=usedCapabilities(current).find(x=>x.c.id===cap.id);tip.innerHTML='<b>'+esc(cap.title)+' · '+esc(cap.source?.title||'平台')+'</b><p>'+esc(cap.description||'')+'</p><p>'+esc(cap.effect==='read'?'只读取':'会写入，安装时需要你授权；试用时用替身')+'</p>'+(use?'<ul>'+use.ops.map(o=>'<li>'+esc(o)+'</li>').join('')+'</ul>':'')+(()=>{const s=[...(current?.steps||[])].reverse().find(x=>x.agent==='design'&&x.action==='place'&&x.selection?.choice===cap.id)?.selection;return s&&s.candidates.length>1?'<p>'+selection(s)+' 从 '+s.candidates.map(capabilityTitle).map(esc).join('、')+' 中选定</p>':'';})();
   const area=canvas.getBoundingClientRect(),box=button.getBoundingClientRect();tip.style.left=Math.round(Math.max(8,Math.min(area.width-240,box.left-area.left+box.width/2-116)))+'px';tip.hidden=false;return;}
  const c=state.components.find(x=>x.kind===button.dataset.kind);if(!c)return;const used=(current?.nodes||[]).filter(n=>catalogKind(n.kind)===c.kind&&revealed.has(n.id));
  tip.innerHTML='<b>'+esc(c.name)+' · '+esc(c.catalog)+'</b><p>'+esc(c.description)+'</p><p>'+esc(c.use==='part'?'可以作为一个组件放进插件':c.use==='inside'?'在组件里面用：字段、筛选、状态、提示':'UI 目录里有，生成的插件暂未用到')+'</p>'+(used.length?'<ul>'+used.map(n=>'<li>'+esc(n.props.title||n.purpose)+'</li>').join('')+'</ul>':'')+(button.hasAttribute('data-legal')?'<p class="as-tip-legal">点一下，用它放入这个组件</p>':'');
  const area=canvas.getBoundingClientRect(),box=button.getBoundingClientRect();tip.style.left=Math.round(Math.max(8,Math.min(area.width-240,box.left-area.left+box.width/2-116)))+'px';tip.hidden=false;}
 let lastView='',comparePrevious=false;
 const previousVisual=b=>b?.design&&b.history.at(-1)?.design?.contract.revision===b.design.contract.revision?b.history.at(-1):null;
 async function renderCanvas(){
  const b=current;let view=null;
  if(b?.design)view={contract:b.design.contract,nodes:b.nodes,connected:b.connected,presentation:b.design.presentation};
  else if(b?.candidates.length&&(b.phase==='choosing'||b.active?.stage==='detail')){const c=b.candidates.find(x=>x.id===(b.chosen||preview||b.candidates[0].id))||b.candidates[0];const kind=p=>(state.components.find(x=>x.use==='part'&&x.intents[0]===p.intent)||state.components.find(x=>x.use==='part'&&x.intents.includes(p.intent))||{}).kind||'card';view={contract:c.preview.contract,nodes:c.preview.parts.map(p=>({...p,kind:kind(p)})),connected:[]};}
  if(comparePrevious&&previousVisual(b)){const before=previousVisual(b);view={contract:before.design.contract,nodes:before.nodes,connected:before.connected,presentation:before.design.presentation};}
  pluginRoot.inert=comparePrevious;pluginRoot.setAttribute('aria-label',comparePrevious?'上次界面，只读对照':'当前界面');
  empty.hidden=!!view&&view.nodes.length>0;pluginRoot.hidden=!view||!view.nodes.length;
  if(!b)empty.innerHTML='<h2>这里会出现你的插件</h2><p>方案确定后，UI Agent 从下方规格板里逐个取出组件放进来，代码 Agent 同时编写功能，接通一项就能试用一项。</p>';
  else if(!view)empty.innerHTML='<div class="as-skeleton" aria-label="正在理解需求"><div style="width:40%"></div><div class="tall"></div><div></div><div style="width:70%"></div></div><p style="margin-top:18px">“'+esc(b.brief.slice(0,120))+'”</p>';
  else if(!view.nodes.length)empty.innerHTML=b.pendingPlugins?.length?'<p>等你决定要不要启用'+b.pendingPlugins.map(p=>'「'+esc(p.title)+'」').join('、')+'，决定后 UI Agent 就开始放组件。</p>':active(b)?'<p>UI Agent 正在从规格板里挑第一个组件…</p>':'<p>还没有放组件。</p>';
  if(b?.design)stage(b);
  const key=view?JSON.stringify(view):'';if(view&&key!==lastView){lastView=key;await plugin.update(view);lifetime.assertCurrent();}
  decorate();
 }
 /** New parts join the queue in the order they were placed; opening a build, or trying it, shows everything at once. */
 function stage(b){const ids=b.nodes.map(n=>n.id);queue=queue.filter(id=>ids.includes(id));stageWires(b);
  if(tab!=='build'||document.hidden){ids.forEach(id=>revealed.add(id));queue=[];return;}
  // The part being landed has left the queue but is not revealed yet; an update arriving meanwhile must not queue it again.
  for(const id of ids)if(!revealed.has(id)&&!queue.includes(id)&&id!==landing)queue.push(id);
  if(queue.length&&!playing)void play().catch(backgroundError);}
 /** A capability whose operations are all connected joins the wiring queue; in the background it is simply ticked. */
 function stageWires(b){for(const {c,done,ops} of usedCapabilities(b)){if(!done||wiredCaps.has(c.id)||wires.some(w=>w.cap===c.id))continue;
   if(tab!=='build'||document.hidden)wiredCaps.add(c.id);else wires.push({cap:c.id,title:c.title,ops});}
  if(wires.length&&!wiringPlay)void playWires().catch(backgroundError);}
 /** D22: the code agent takes the capability from the capability board, carries it to the part that calls it, and the board ticks it. */
 async function playWires(){while(playing)await wait(150);if(wiringPlay)return;wiringPlay=true;const token=playToken,code=$('[data-as-pointer="code"]'),frameEl=$('[data-as-frame]');
  try{while(wires.length&&token===playToken){
   if(tab!=='build'||document.hidden){wires.forEach(w=>wiredCaps.add(w.cap));wires=[];break;}
   const w=wires[0];wiring=w.cap;renderBoard();const chip=$('[data-as-board] .as-cap[data-cap="'+CSS.escape(w.cap)+'"]');
   if(chip){chip.scrollIntoView({block:'nearest',inline:'center'});aim(code,chip,'取出能力「'+w.title+'」','above');await wait(620);click(code);await wait(240);}
   if(token!==playToken)break;
   // A button on each record has nowhere to show while the list is empty: carry it to that list instead.
   const node=current?.nodes.find(n=>revealed.has(n.id)&&w.ops.some(o=>n.read?.operationId===o||n.submit?.operationId===o)),host=node&&Object.values(node.submit?.input||{}).find(v=>v.source==='selection')?.componentId;
   const el=node&&(partEl(node.id)||host&&partEl(host));
   if(el){const view=scroll.getBoundingClientRect(),box=el.getBoundingClientRect();if(box.top<view.top+40||box.bottom>view.bottom-90){el.scrollIntoView({block:'center',behavior:'smooth'});await wait(380);}
    frameAt(el,'landing','代码 Agent · '+w.title);aim(code,el,'接上「'+w.title+'」','right');await wait(680);click(code);}
   if(token!==playToken)break;
   wires.shift();wiredCaps.add(w.cap);wiring=null;renderBoard();const done=$('[data-as-board] .as-cap[data-cap="'+CSS.escape(w.cap)+'"]');done?.setAttribute('data-as-arrive','');lifetime.timeout(()=>done?.removeAttribute('data-as-arrive'),700);
   if(el)frameAt(el,'placed','代码 Agent · 已接上「'+w.title+'」');await wait(560);frameEl.hidden=true;
  }}finally{wiringPlay=false;wiring=null;code.hidden=true;if(!playing)frameEl.hidden=true;renderBoard();}}
 const wait=ms=>lifetime.delay(ms);
 const partEl=id=>{const el=id&&pluginRoot.querySelector('[data-component-id="'+CSS.escape(id)+'"]');if(!el)return null;if(el.hidden)return pluginRoot.querySelector('[data-pc-action="'+CSS.escape(id)+'"]');const box=el.getBoundingClientRect();return box.width&&box.height?el:pluginRoot.querySelector('[data-pc-open="'+CSS.escape(id)+'"]')||el;};
 function click(pointer){pointer.removeAttribute('data-click');void pointer.offsetWidth;pointer.setAttribute('data-click','');}
 async function play(){playing=true;const token=++playToken,ui=$('[data-as-pointer="ui"]'),frameEl=$('[data-as-frame]');
  try{while(wiringPlay)await wait(150);while(queue.length&&token===playToken){
   if(tab!=='build'||document.hidden){queue.forEach(id=>revealed.add(id));queue=[];break;}
   const id=queue[0],node=current?.nodes.find(n=>n.id===id);if(!node){queue.shift();continue;}
   const name=componentName(node.kind),step=[...current.steps].reverse().find(s=>s.agent==='ui'&&s.target===id),by=step?.selection?.source==='jev'?' · Jev '+step.selection.candidates.length+' 选 1':step?.selection?.source==='user'?' · 你选的':'';
   // 1. Take the part from the spec board.
   picking=catalogKind(node.kind);renderBoard();const part=$('[data-as-board] [data-kind="'+CSS.escape(picking)+'"]');
   if(part){part.scrollIntoView({block:'nearest',inline:'center'});aim(ui,part,'取出「'+name+'」'+by,'above');await wait(620);click(ui);await wait(240);}
   if(token!==playToken)break;
   // 2. Carry it to its place: the spot opens, framed, before the part shows.
   queue.shift();landing=id;decorate();const el=partEl(id);
   if(el){const view=scroll.getBoundingClientRect(),box=el.getBoundingClientRect();if(box.top<view.top+40||box.bottom>view.bottom-90){el.scrollIntoView({block:'center',behavior:'smooth'});await wait(380);}
    frameAt(el,'landing','UI Agent · '+name);aim(ui,el,'放入「'+(node.props.title||name)+'」','corner');await wait(680);click(ui);}
   // 3. It lands and the spec board ticks it off.
   landing=null;picking=null;revealed.add(id);renderBoard();decorate();
   const placed=partEl(id);if(placed){const root=placed.closest('[data-component-id]');root?.setAttribute('data-as-arrive','');lifetime.timeout(()=>root?.removeAttribute('data-as-arrive'),700);frameAt(placed,'placed','UI Agent · '+name);}
   await wait(560);frameEl.hidden=true;
  }}finally{if(token===playToken){playing=false;landing=null;picking=null;frameEl.hidden=true;renderBoard();decorate();if(wires.length&&!wiringPlay)void playWires().catch(backgroundError);}}}
 function frameAt(el,mode,label){if(!lifetime.alive)return;const f=$('[data-as-frame]'),box=el.getBoundingClientRect(),area=scroll.getBoundingClientRect(),was=f.hidden;f.hidden=false;f.dataset.mode=mode;f.querySelector('span').textContent=label;
  if(was)f.style.transition='none';f.style.transform='translate('+Math.round(box.left-area.left+scroll.scrollLeft-6)+'px,'+Math.round(box.top-area.top+scroll.scrollTop-6)+'px)';f.style.width=Math.round(box.width+12)+'px';f.style.height=Math.round(box.height+12)+'px';if(was){void f.offsetWidth;f.style.transition='';}}
 function decorate(){if(!lifetime.alive)return;
  const b=current;const nodes=[...pluginRoot.querySelectorAll('[data-component-id]')];
  for(const el of nodes){const id=el.dataset.componentId;el.toggleAttribute('data-as-target',id===target);
   el.toggleAttribute('data-as-queued',queue.includes(id));el.toggleAttribute('data-as-landing',landing===id);
   const node=b?.nodes.find(n=>n.id===id),ops=[node?.read?.operationId,node?.submit?.operationId].filter(Boolean),wired=ops.length&&ops.every(o=>b.connected.includes(o));
   if(wired&&!seenWired.has(id)){seenWired.add(id);if(tab==='build'){el.setAttribute('data-as-wired','');lifetime.timeout(()=>el.removeAttribute('data-as-wired'),1700);}}}
  pointers();
 }
 /** Point at an element from inside the canvas: above it (the spec board), at its top-right area (a part), or at its right edge. */
 function aim(pointer,el,label,where){const box=el?.getBoundingClientRect();if(!box||!box.width&&!box.height){pointer.hidden=true;return;}const area=scroll.getBoundingClientRect(),em=pointer.querySelector('em');em.textContent=label||'';em.hidden=!label;
  const was=pointer.hidden;pointer.hidden=false;const left=box.left-area.left+scroll.scrollLeft,top=box.top-area.top+scroll.scrollTop,width=Math.max(pointer.offsetWidth,140);
  let x=where==='above'?left+box.width/2-6:where==='right'?left+box.width-28:left+Math.min(box.width*.62,box.width-40),y=where==='above'?top-62:where==='right'?top+Math.min(box.height*.5,44):top+12;
  x=Math.max(scroll.scrollLeft+6,Math.min(x,scroll.scrollLeft+area.width-width-12));
  if(was)pointer.style.transition='none';pointer.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px)';if(was){void pointer.offsetWidth;pointer.style.transition='';}}
 function pointers(){if(!lifetime.alive)return;
  const b=current,ui=$('[data-as-pointer="ui"]'),code=$('[data-as-pointer="code"]');
  if(!b?.design||tab!=='build'){ui.hidden=true;code.hidden=true;$('[data-as-frame]').hidden=true;return;}
  if(!playing){
   const lastUi=[...b.steps].reverse().find(s=>s.agent==='ui');
   if(b.pendingPart)aim(ui,$('[data-as-board] [data-legal]'),'等你选组件','above');
   else if(active(b)&&lastUi?.status==='active')aim(ui,$('[data-as-board] .as-board-label'),state.selectionAvailable?'Jev 在挑下一个组件':'按规格板挑下一个组件','above');
   else if(active(b)&&lastUi?.target&&revealed.has(lastUi.target))aim(ui,partEl(lastUi.target),lastUi.label.slice(0,18),'corner');
   else ui.hidden=true;}
  const writing=active(b)&&[...b.steps].reverse().find(s=>s.agent==='code'&&s.action==='implement'&&s.status==='active');
  const bound=writing&&b.nodes.find(n=>revealed.has(n.id)&&(n.read?.operationId===writing.operationId||n.submit?.operationId===writing.operationId));
  if(wiringPlay)return;if(bound)aim(code,partEl(bound.id),'编写 '+writing.operationId,'right');else code.hidden=true;
 }
 function renderAll(){if(!lifetime.alive)return;renderHead();renderFeed();renderBoard();void renderCanvas().catch(backgroundError);
  const s=$('[data-as-status]'),b=current;s.innerHTML='<span>'+(!b?'':active(b)?(b.active.stage==='design'?'主线设计正在工作':'UI Agent 与代码 Agent 正在协作'):b.phase==='ready'?'全部功能已接通，可以试用和发布':b.phase==='clarifying'?'等你回答问题':b.phase==='choosing'?'等你选择方案':b.pendingPart?'等你选择组件':b.pendingPlugins?.length?'等你决定要不要启用插件':PHASE[b.phase]||'')+'</span><span>'+(b?.connected.length?'已接通 '+b.connected.length+'/'+(b.design?.contract.operations.length||0)+' 项功能 · 输入会保留':'')+'</span>';}
 // Hidden views read the authoritative build again on return.
 function schedule(){if(frame||!lifetime.visible)return;const paint=()=>{frame=0;renderAll();};frame=lifetime.frame(paint);}
 let viewSignal,opening=0,initialized=false;
 const backgroundError=e=>{if(lifetime.alive&&!viewSignal?.aborted){notice=e.message;schedule();}};
 function renderBuilds(){const select=$('[data-as-builds]');select.innerHTML='<option value="">'+(state.builds.length?'我的插件（'+state.builds.length+'）':'还没有插件')+'</option>'+state.builds.map(b=>'<option value="'+esc(b.id)+'"'+(b.id===current?.id?' selected':'')+'>'+esc(b.design?.title||b.title)+' · '+esc(phaseOf(b))+'</option>').join('');
  const model=$('[data-as-model]');model.innerHTML=(state.model?'':'<option value="">选择模型</option>')+state.models.map(m=>'<option value="'+esc(m.provider_id+'\n'+m.model_id)+'"'+(m.provider_id===state.model?.provider_id&&m.model_id===state.model?.model_id?' selected':'')+'>'+esc(m.label.endsWith(m.model_id)&&m.label!==m.model_id?m.model_id+' · '+m.label.slice(0,-m.model_id.length).replace(/\s*·\s*$/,''):m.label)+'</option>').join('');
  const setup=$('[data-as-model-setup]');if(setup)setup.hidden=state.models.length>0;}
 function subscribe(id){source?.close();source=null;if(!id||!lifetime.visible)return;const subscribed=source=new EventSource(host.api('/builds/'+id+'/events'));source.onmessage=e=>{if(source!==subscribed||!lifetime.visible)return;const b=JSON.parse(e.data);if(b.id!==current?.id)return;if(b.design?.contract.revision!==current.design?.contract.revision)seenWired=new Set();current=b;
   const listed=state.builds.find(x=>x.id===b.id);if(listed&&(listed.phase!==b.phase||(listed.design?.title||listed.title)!==(b.design?.title||b.title))){Object.assign(listed,{phase:b.phase,title:b.title,design:b.design});renderBuilds();}
   schedule();};}
 async function open(id,signal){const ticket=++opening;comparePrevious=false;target=null;preview=null;rendered='';lastView='';seenWired=new Set();firstPaint=true;tab='build';playToken++;playing=false;queue=[];landing=null;picking=null;revealed=new Set();wiredCaps=new Set();wires=[];wiring=null;
  if(!id){current=null;versions=[];subscribe(null);history.replaceState(null,'',location.pathname);schedule();return;}
  const v=await api('/builds/'+id,'GET',undefined,signal);if(ticket!==opening)return;current=v.build;versions=v.versions;current.nodes.forEach(n=>revealed.add(n.id));usedCapabilities(current).forEach(x=>{if(x.done)wiredCaps.add(x.c.id);});subscribe(id);history.replaceState(null,'',location.pathname+'?build='+encodeURIComponent(id));renderBuilds();schedule();}
 async function refreshState(signal){state=await api('/state','GET',undefined,signal);renderBuilds();}
 async function run(work){if(busy||!lifetime.alive)return;busy=true;notice='';schedule();try{await work();}catch(e){notice=e.message;}finally{busy=false;schedule();}}
 async function act(action,extra={}){const v=await api('/builds/'+current.id+'/action','POST',{action,revision:current.revision,...extra});if(v.build)current=v.build;if(v.release){versions=(await api('/builds/'+current.id)).versions;notice='';}if(v.deleted){await refreshState();await open(null);}}
 lifetime.listen(root,'click',e=>{const el=e.target.closest('button,a');if(!el||!root.contains(el))return;
  // Framed in the workbench, the plugin opens in place as a workbench stage rather than in a new window.
  if(el.dataset.asOpenPlugin&&parent!==window){e.preventDefault();parent.postMessage({type:'molis-studio-open-plugin',surface:'app-'+el.dataset.asOpenPlugin},location.origin);return;}
  if(el.matches('[data-as-model-setup]')){if(parent!==window){e.preventDefault();parent.postMessage({type:'molis-work:open-settings',href:'/settings/models'},location.origin);}return;}
  if(el.dataset.asExample){input.value=el.dataset.asExample;input.focus();return;}
  if(el.dataset.asOpen){run(()=>open(el.dataset.asOpen));return;}
  if(el.hasAttribute('data-as-catalog')){const which=el.dataset.asCatalog||'components';catalogOpen=catalogOpen===which?'':which;tip.hidden=true;renderBoard();return;}
  if(el.dataset.asCandidate){preview=el.dataset.asCandidate;rendered='';schedule();return;}
  if(el.dataset.asChoose){run(()=>act('choose',{candidateId:el.dataset.asChoose}));return;}
  if(el.dataset.asPart){run(()=>act('part',{kind:el.dataset.asPart}));return;}
  if(el.dataset.asAction){const a=el.dataset.asAction;if(a==='publish')run(()=>act('publish'));else run(()=>act(a));return;}
  if(el.hasAttribute('data-as-compare')){comparePrevious=!comparePrevious;schedule();return;}
  if(el.dataset.asTab){tab=el.dataset.asTab;target=null;if(tab!=='build'){playToken++;playing=false;queue.forEach(id=>revealed.add(id));queue=[];landing=null;picking=null;wires.forEach(w=>wiredCaps.add(w.cap));wires=[];wiring=null;}schedule();return;}
  if(el.hasAttribute('data-as-untarget')){target=null;schedule();return;}
  if(el.dataset.asInstall){const v=versions.find(x=>x.version===Number(el.dataset.asInstall));consent('安装「'+(current.design?.title||'')+'」到这个项目',v?.permissions,'安装').then(ok=>{if(ok)run(async()=>{
    // Secrets go to the host's sealed store first; the plugin will only ever name them.
    for(const s of ok.secrets||[])await api('/secrets','POST',{pluginId:v.pluginId,...s});
    await act('install',{version:v.version,grants:{consent:true}});await refreshState();});});return;}
  if(el.dataset.asUpgrade){const v=versions.find(x=>x.version===Number(el.dataset.asUpgrade)),inst=installed(current);const go=()=>run(async()=>{await act('upgrade',{version:v.version,grants:{consent:true}});await refreshState();});
   if(covered(v?.permissions,inst?.effects))go();else consent('升级到 v'+v.version+' 需要新的权限',v?.permissions,'确认并升级').then(ok=>{if(ok)go();});return;}
  if(el.hasAttribute('data-as-install-enable')){const inst=installed(current);if(inst)run(async()=>{await act('enable',{version:inst.version});await refreshState();});return;}
  if(el.hasAttribute('data-as-uninstall')){const inst=installed(current);if(!inst)return;ask('卸载「'+(current.design?.title||'')+'」','卸载后它会从这个项目里移除。它保存的数据可以留着，以后重新安装还能看到。',[['keep','卸载，保留数据',true],['drop','卸载并删除数据'],['cancel','取消']]).then(choice=>{if(choice==='keep'||choice==='drop')run(async()=>{await act('uninstall',{version:inst.version,grants:{keepData:choice==='keep'}});await refreshState();if(parent!==window)parent.postMessage({type:'molis-studio-plugin-removed',surface:'app-'+current.id},location.origin);});});return;}
  if(el.hasAttribute('data-as-remove')){ask('删除「'+(current.design?.title||current.title)+'」这个草稿？','构建目录和试用数据会一起删除，已发布并安装的插件不受影响。',[['remove','删除',true],['cancel','取消']]).then(choice=>{if(choice==='remove')run(()=>act('remove'));});return;}
  if(el.hasAttribute('data-as-new')){run(()=>open(null));input.focus();}
 });
 lifetime.listen(feed,'click',e=>{const summary=e.target.closest?.('[data-as-steps] > summary');if(summary)openSteps=!summary.parentElement.open;});
 lifetime.listen($('[data-as-builds]'),'change',e=>run(()=>open(e.target.value||null)));
 lifetime.listen($('[data-as-model]'),'change',e=>{const[provider_id,model_id]=e.target.value.split('\n');if(!provider_id)return;run(async()=>{await api('/settings','POST',{provider_id,model_id});await refreshState();});});
 lifetime.listen(input,'keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('[data-as-composer]').requestSubmit();}});
 lifetime.listen($('[data-as-composer]'),'submit',e=>{e.preventDefault();const text=input.value.trim();if(!text||busy)return;
  const go=fresh=>run(async()=>{
   if(!current||fresh){const v=await api('/builds','POST',{brief:text});input.value='';await refreshState();await open(v.build.id);return;}
   const node=target&&current.nodes.find(n=>n.id===target);await act($('[data-as-edit-mode]').value,{message:node?'［'+node.purpose+'］'+text:text});input.value='';target=null;});
  // "做一个……" while another plugin is open is most likely a new plugin; ask rather than rewrite the open one.
  if(current?.design&&!target&&/^(我|帮我|请)?(要|想|需要|来)?(做|建|创建|新建|开发|搭)(一个|个|一款|款)/.test(text))
   ask('做一个新插件，还是修改「'+current.design.title+'」？','“'+text.slice(0,80)+'”',[['new','做成新插件',true],['modify','修改「'+current.design.title+'」'],['cancel','取消']]).then(choice=>{if(choice==='new')go(true);else if(choice==='modify')go(false);});
  else go(false);});
 lifetime.listen(scroll,'scroll',()=>{if(!playing)pointers();},{passive:true});lifetime.listen(window,'resize',()=>pointers());
 const board=$('[data-as-board]');lifetime.listen(board,'pointerover',e=>{const b=e.target.closest?.('.as-part');if(b)showTip(b);});lifetime.listen(board,'pointerleave',()=>{tip.hidden=true;});
 lifetime.listen(board,'focusin',e=>{const b=e.target.closest?.('.as-part');if(b)showTip(b);});lifetime.listen(board,'focusout',()=>{tip.hidden=true;});
 const catalogPanel=$('[data-as-catalog-panel]');lifetime.listen(catalogPanel,'pointerover',e=>{const b=e.target.closest?.('.as-part');if(b)showTip(b);});lifetime.listen(catalogPanel,'pointerleave',()=>{tip.hidden=true;});
 lifetime.observe(new MutationObserver(()=>{if(!frame&&lifetime.visible)lifetime.frame(()=>decorate());}),pluginRoot,{childList:true,subtree:true});
 // Coming in without a plugin named in the address starts a new one; earlier ones are a click away, never opened for you.
 lifetime.whenVisible(signal=>{
  viewSignal=signal;
  void (async()=>{
   await refreshState(signal);
   if(!initialized){const id=new URLSearchParams(location.search).get('build');await open(id&&state.builds.some(b=>b.id===id)?id:null,signal);initialized=true;}
   else if(current){const id=current.id,ticket=opening,v=await api('/builds/'+id,'GET',undefined,signal);if(current?.id!==id||opening!==ticket)return;current=v.build;versions=v.versions;current.nodes.forEach(n=>revealed.add(n.id));subscribe(id);}
   schedule();
  })().catch(backgroundError);
  return()=>{source?.close();source=null;playToken++;playing=false;wiringPlay=false;landing=null;picking=null;queue=[];wires=[];wiring=null;lifetime.cancelFrame(frame);frame=0;};
 });
}`;
