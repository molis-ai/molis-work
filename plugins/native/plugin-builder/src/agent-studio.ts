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
    + '<label class="as-select as-model"><span>模型</span><select data-as-model aria-label="构建使用的模型"></select></label></div></header>'
    + '<aside class="as-left" aria-label="协作"><div class="as-feed" data-as-feed aria-live="polite"></div>'
    + '<form class="as-composer" data-as-composer><div class="as-target" data-as-target hidden></div><textarea data-as-input rows="2" maxlength="48000" aria-label="描述或修改"></textarea>'
    + '<button class="as-send" type="submit" aria-label="发送" title="发送"><svg aria-hidden="true"><use href="#icon-send"/></svg></button></form>'
    + '<p class="as-model-note" data-as-model-note></p></aside>'
    + '<main class="as-right"><header class="as-canvas-head"><div class="as-title"><h1 data-as-title>新插件</h1><span class="as-phase" data-as-phase></span></div>'
    + '<div class="as-segment" role="tablist" aria-label="画布模式"><button type="button" role="tab" data-as-tab="build" aria-selected="true">构建</button><button type="button" role="tab" data-as-tab="try" aria-selected="false">试用</button></div>'
    + '<div class="as-head-actions" data-as-head-actions></div></header>'
    + '<div class="as-canvas" data-as-canvas data-tab="build"><div class="as-canvas-scroll" data-as-scroll><div class="as-empty" data-as-empty></div><div class="as-plugin" data-as-plugin></div>'
    + '<div class="as-pointer as-pointer-ui" data-as-pointer="ui" hidden><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M2 1l11 7-5 1-2 5z"/></svg><span>UI Agent</span><em></em></div>'
    + '<div class="as-pointer as-pointer-code" data-as-pointer="code" hidden><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M2 1l11 7-5 1-2 5z"/></svg><span>代码 Agent</span><em></em></div></div>'
    + '<nav class="as-board" data-as-board aria-label="组件池"></nav></div>'
    + '<footer class="as-status" data-as-status role="status"></footer></main></section>';
}

export const AGENT_STUDIO_STYLES = String.raw`
.as-shell,.as-preview-page{--as-ground:#f3f3f1;--as-panel:#f9f9f8;--as-ink:#232831;--as-muted:#737985;--as-line:#e9e9ed;--as-blue:#397bfa;--as-green:#269672;--as-amber:#b7791f;--as-red:#c2413b;color:var(--as-ink);font:13px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;-webkit-font-smoothing:antialiased}
.as-shell{display:grid;grid-template-columns:clamp(320px,26%,430px) minmax(0,1fr);grid-template-rows:56px minmax(0,1fr);height:100vh;background:var(--as-ground);overflow:hidden}
.as-shell *,.as-preview-page *{box-sizing:border-box}.as-shell [hidden]{display:none!important}:where(.as-shell) button{font:inherit;color:inherit;cursor:pointer}:where(.as-shell) button:disabled{opacity:.42;cursor:not-allowed}
.as-shell svg{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle}.as-shell :focus-visible{outline:2px solid var(--as-blue);outline-offset:2px}
:where(.as-shell) :is(h1,h2,h3,p){margin:0}.as-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.as-top{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 20px;border-bottom:1px solid var(--as-line);background:var(--as-panel)}
.as-brand{display:flex;align-items:center;gap:8px;color:inherit;text-decoration:none;font-size:15px}.as-brand b{font-size:17px}.as-brand span{color:var(--as-muted)}.as-brand svg{width:22px;height:22px;color:#2448c9}
.as-top-actions{display:flex;align-items:center;gap:10px}.as-select{display:flex;align-items:center;gap:6px;color:var(--as-muted);font-size:12px}.as-select select{max-width:220px;font:inherit;color:var(--as-ink);border:1px solid #dedfe3;border-radius:7px;background:#fff;padding:6px 8px}
.as-icon{color:inherit;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid #e5e5e9;border-radius:7px;background:#fff}.as-icon:hover{background:#f1f2f4}
.as-left{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--as-line);background:var(--as-panel)}
.as-feed{flex:1;min-height:0;overflow-y:auto;padding:22px 22px 12px;display:flex;flex-direction:column;gap:14px;scrollbar-width:thin}
.as-feed h2{font-size:18px;font-weight:650}.as-muted{color:var(--as-muted)}.as-small{font-size:12px}
.as-card{border:1px solid var(--as-line);border-radius:10px;background:#fff;padding:14px 15px}.as-card h3{font-size:13px;font-weight:650;margin-bottom:6px}
.as-brief{border-left:3px solid #cfd6e4;padding:2px 0 2px 12px}.as-brief span{display:block;color:var(--as-muted);font-size:12px}.as-brief p{white-space:pre-wrap;overflow-wrap:anywhere}
.as-examples{display:grid;gap:8px}.as-example{text-align:left;border:1px solid var(--as-line);border-radius:9px;background:#fff;padding:10px 12px}.as-example:hover{border-color:#cdd3de}.as-example b{display:block;font-weight:600}
.as-candidates{display:grid;gap:10px}.as-candidate{border:1px solid var(--as-line);border-radius:10px;background:#fff;padding:12px 13px;text-align:left;width:100%}.as-candidate[aria-pressed="true"]{border-color:var(--as-blue);box-shadow:0 0 0 2px #dfe9ff}
.as-candidate b{display:block;font-size:14px}.as-candidate p{color:#4f5561;margin-top:3px}.as-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.as-chip{display:inline-flex;align-items:center;gap:4px;border-radius:999px;background:#f1f2f4;padding:1px 8px;font-size:11.5px;color:#535967;white-space:nowrap}.as-chip.jev{background:#e8f0ff;color:#2f5fd0}.as-chip.rule{background:#f1f2f4}.as-chip.user{background:#fff3dc;color:#8a5a12}.as-chip.ok{background:#e4f5ee;color:#1f7a5c}.as-chip.bad{background:#fdecea;color:#a3332d}
.as-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.as-button{color:inherit;text-decoration:none;display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:5px 12px;border:1px solid #e0e1e6;border-radius:7px;background:#fff;font-size:12px}.as-button:hover{background:#f6f7f9}.as-primary{background:#272c32;color:#fff;border-color:transparent}.as-primary:hover{background:#414852}
.as-ops{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px}.as-ops li{display:flex;align-items:center;justify-content:space-between;gap:8px}.as-ops code{font-size:12px;color:#454b57}
.as-agents{display:grid;gap:6px}.as-agent{display:flex;align-items:baseline;gap:8px}.as-agent b{flex:none;font-weight:600}.as-agent[data-agent=design] b{color:#6b4fd8}.as-agent[data-agent=ui] b{color:var(--as-blue)}.as-agent[data-agent=code] b{color:var(--as-green)}.as-agent[data-agent=host] b{color:#454b57}
.as-dots::after{content:"";display:inline-block;width:1.2em;text-align:left;animation:as-dots 1.2s steps(4,end) infinite}@keyframes as-dots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}
.as-decision{border-color:#f1d7a4;background:#fffaf0}.as-error{border-color:#f3c4c0;background:#fff7f6}.as-error p{color:#8f2f2a;white-space:pre-wrap;overflow-wrap:anywhere}
.as-steps{border-top:1px solid var(--as-line);padding-top:10px}.as-steps summary{cursor:pointer;color:var(--as-muted);font-size:12px}.as-steps ol{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:7px}
.as-step{display:grid;grid-template-columns:18px minmax(0,1fr);gap:6px;align-items:start}.as-step i{width:14px;height:14px;margin-top:3px;border-radius:50%;border:1.5px solid #cfd3da}.as-step[data-status=done] i{border-color:#9fd0bd;background:#e4f5ee}.as-step[data-status=active] i{border-color:var(--as-blue);border-top-color:transparent;animation:as-spin 1s linear infinite}.as-step[data-status=failed] i{border-color:var(--as-red);background:#fdecea}.as-step[data-status=waiting] i{border-color:var(--as-amber);background:#fff3dc}.as-step[data-status=cancelled] i{border-style:dashed}
.as-step-agent{font-weight:600;margin-right:4px}.as-step-agent[data-agent=design]{color:#6b4fd8}.as-step-agent[data-agent=ui]{color:var(--as-blue)}.as-step-agent[data-agent=code]{color:var(--as-green)}.as-step small{display:block;color:var(--as-muted);font-size:11.5px;overflow-wrap:anywhere;white-space:pre-wrap}
@keyframes as-spin{to{transform:rotate(360deg)}}
.as-gates{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}
.as-controls{display:flex;gap:8px}
.as-composer{position:relative;margin:0 16px 6px;border:1px solid #dcdfe6;border-radius:12px;background:#fff;padding:9px 48px 9px 12px}.as-composer:focus-within{border-color:#9dbaf6;box-shadow:0 0 0 3px #e7efff}
.as-composer textarea{display:block;width:100%;resize:none;border:0;outline:0;font:inherit;background:transparent;max-height:180px}.as-send{position:absolute;right:9px;bottom:9px;width:32px;height:32px;border:0;border-radius:50%;background:#272c32;color:#fff;display:flex;align-items:center;justify-content:center}.as-send:disabled{background:#b9bdc6}
.as-target{display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;color:#2f5fd0}.as-target button{border:0;background:none;padding:0 2px;color:var(--as-muted)}
.as-model-note{margin:0 16px 10px;color:#8b909a;font-size:11.5px;text-align:center}
.as-right{display:flex;flex-direction:column;min-width:0;min-height:0;padding:0 24px}
.as-canvas-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:62px}.as-title{display:flex;align-items:center;gap:8px;min-width:0}.as-title h1{font-size:15px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.as-phase{border-radius:6px;background:#eceef2;padding:1px 8px;font-size:11.5px;color:#586070;white-space:nowrap}.as-phase[data-phase=ready]{background:#e4f5ee;color:#1f7a5c}.as-phase[data-phase=failed]{background:#fdecea;color:#a3332d}.as-phase[data-phase=clarifying],.as-phase[data-phase=paused]{background:#fff3dc;color:#8a5a12}
.as-segment{display:flex;flex:none;padding:3px;border-radius:9px;background:#e8e9ec}.as-segment button{border:0;border-radius:7px;background:none;padding:5px 18px;font-size:12px;white-space:nowrap}.as-segment [aria-selected=true]{background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08);font-weight:600}
.as-head-actions{display:flex;gap:8px;justify-content:flex-end;min-width:120px}
.as-canvas{position:relative;flex:1;min-height:0;border-radius:14px;background:#fff;box-shadow:0 1px 3px rgba(20,24,33,.06);display:flex;flex-direction:column;overflow:hidden}
.as-canvas-scroll{position:relative;flex:1;min-height:0;overflow:auto;padding:36px clamp(20px,6%,84px) 96px;scrollbar-width:thin}
.as-plugin{max-width:980px;margin:0 auto}.as-empty{max-width:560px;margin:8vh auto 0;text-align:center;color:var(--as-muted)}.as-empty h2{color:var(--as-ink);font-size:20px;margin-bottom:6px}
.as-skeleton{display:grid;gap:14px;max-width:760px;margin:0 auto}.as-skeleton div{height:18px;border-radius:6px;background:linear-gradient(90deg,#f1f2f4,#f7f8f9,#f1f2f4);background-size:200% 100%;animation:as-shimmer 1.6s ease-in-out infinite}.as-skeleton .tall{height:120px}
@keyframes as-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}
.as-canvas[data-tab=build] .pc-node{position:relative;outline:1px dashed transparent;outline-offset:6px;transition:outline-color .2s}.as-canvas[data-tab=build] .pc-node:hover{outline-color:#b9ccf7}.as-canvas[data-tab=build] .pc-node[data-as-target]{outline:2px solid var(--as-blue)}
.as-canvas[data-tab=build] .pc-node[data-as-new]{animation:as-enter .72s ease-out}@keyframes as-enter{from{opacity:0;filter:blur(3px)}to{opacity:1;filter:none}}
.as-canvas[data-tab=build] .pc-node[data-as-wired]::after{content:"✓ 已接通";position:absolute;top:-12px;right:-6px;border-radius:999px;background:#e4f5ee;color:#1f7a5c;font-size:11px;padding:0 7px;animation:as-wired 1.6s ease-out forwards}@keyframes as-wired{0%,70%{opacity:1}100%{opacity:0}}
.as-canvas .pc-node{position:relative}.as-canvas .pc-inspect{position:absolute;top:-12px;right:-8px;z-index:2;border:1px solid #cfdcf8;border-radius:999px;background:#fff;padding:1px 9px;font-size:11.5px;opacity:0;transition:opacity .15s}.as-canvas[data-tab=build][data-inspectable] .pc-node:hover .pc-inspect,.as-canvas[data-tab=build][data-inspectable] .pc-inspect:focus-visible{opacity:1}.as-canvas:not([data-inspectable]) .pc-inspect,.as-canvas[data-tab=try] .pc-inspect{display:none}
.as-pointer{position:absolute;top:0;left:0;z-index:5;display:flex;align-items:flex-start;gap:2px;pointer-events:none;transition:transform .65s cubic-bezier(.2,.8,.2,1),opacity .2s}.as-pointer svg{width:16px;height:16px;fill:currentColor;stroke:none}.as-pointer span{border-radius:5px;color:#fff;font-size:11.5px;padding:1px 7px;margin-top:10px}.as-pointer em{position:absolute;top:34px;left:18px;white-space:nowrap;font-style:normal;font-size:11px;border:1px solid var(--as-line);background:#fff;border-radius:5px;padding:0 6px;color:#4f5561}
.as-pointer-ui{color:var(--as-blue)}.as-pointer-ui span{background:var(--as-blue)}.as-pointer-code{color:var(--as-green)}.as-pointer-code span{background:var(--as-green)}
.as-board{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:4px;max-width:calc(100% - 28px);overflow-x:auto;border:1px solid var(--as-line);border-radius:12px;background:rgba(255,255,255,.96);box-shadow:0 6px 24px rgba(20,24,33,.08);padding:6px;scrollbar-width:none}
.as-part{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:62px;border:1px solid transparent;border-radius:9px;background:none;padding:5px 6px;font-size:11px;color:#8b909a}.as-part b{font-weight:500}.as-part[data-used]{color:var(--as-ink)}.as-part[data-used]::after{content:"✓";position:absolute;top:1px;right:5px;color:var(--as-green);font-size:10px}.as-part[data-legal]{color:var(--as-ink);border-color:#f1d7a4;background:#fffaf0}.as-part[data-legal]:hover{background:#fff1d6}
.as-status{display:flex;justify-content:space-between;gap:12px;min-height:34px;align-items:center;color:var(--as-muted);font-size:11.5px}
html:has(.as-preview-page),body:has(.as-preview-page){margin:0;background:#f3f3f1}
.as-preview-page{display:block;max-width:980px;margin:0 auto 32px;padding:36px clamp(16px,5%,56px);background:#fff;min-height:calc(100vh - 56px);border-radius:0 0 14px 14px}
/* Wiring status is a building concern: people using or trying the plugin do not need it. */
[data-installed-plugin] .pc-status,.as-canvas[data-tab=try] .pc-status{display:none}
.as-install{margin-top:10px;padding-top:10px;border-top:1px solid var(--as-line)}
.as-dialog{border:1px solid var(--as-line);border-radius:14px;padding:20px 22px;max-width:420px;width:calc(100% - 32px);box-shadow:0 18px 60px rgba(20,24,33,.18);color:var(--as-ink)}.as-dialog::backdrop{background:rgba(20,24,33,.28)}.as-dialog h3{font-size:15px;margin-bottom:8px}.as-dialog ul{margin:6px 0 10px;padding-left:18px}.as-dialog li{margin:3px 0}
.as-installed-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;max-width:980px;margin:16px auto 0;padding:14px clamp(16px,5%,56px);background:#fff;border-radius:14px 14px 0 0;border-bottom:1px solid #ececf0;font:13px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#232831}.as-installed-bar span{color:#737985}.as-installed-bar a{margin-left:auto;color:#2f5fd0;text-decoration:none}
@media (max-width:760px){.as-shell{grid-template-columns:minmax(0,1fr);grid-template-rows:56px auto minmax(0,1fr);height:auto;min-height:100vh;overflow:visible}.as-top{padding:0 12px}.as-brand{flex:none}.as-top-actions{flex:1;justify-content:flex-end;gap:6px;min-width:0}.as-select{flex:0 1 auto;min-width:0}.as-select select{width:100%;min-width:0;max-width:none}.as-select:has(select[data-as-model]){flex:0 0 112px}.as-brand b{font-size:15px}.as-canvas-head{flex-wrap:wrap;row-gap:4px;padding:8px 0}.as-title{flex:1 1 60%}.as-head-actions{min-width:0}.as-left{border-right:0;border-bottom:1px solid var(--as-line)}.as-feed{max-height:52vh}.as-right{padding:0 12px 12px;min-height:80vh}.as-model span,.as-brand span{display:none}.as-canvas-scroll{padding:24px 16px 96px}}
@media (prefers-reduced-motion:reduce){.as-shell *{animation:none!important;transition:none!important}}
`;

/** Browser client; a string so the host can inline it. Receives the host's routes and the component renderer. */
export const AGENT_STUDIO_CLIENT_FACTORY_SCRIPT = String.raw`(host)=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icon=n=>'<svg aria-hidden="true"><use href="#icon-'+n+'"/></svg>';
 const headers=m=>m==='GET'?{}:(globalThis.molisWorkControlHeaders?.()||{'content-type':'application/json'});
 async function api(path,method='GET',body){
  const r=await fetch(host.api(path),{method,cache:'no-store',headers:headers(method),...(body===undefined?{}:{body:JSON.stringify(body)})});
  const v=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(v.error||'操作失败，内容已保留'),{status:r.status});return v;
 }
 let pending=0;globalThis.__molisPluginPending=0;
 const pluginCall=id=>async(componentId,binding,payload)=>{pending++;globalThis.__molisPluginPending=pending;try{return (await api('/builds/'+id+'/call','POST',{componentId,binding,payload})).value}finally{pending--;globalThis.__molisPluginPending=pending}};
 if(host.mode==='preview'){
  const root=document.querySelector('[data-studio-preview]');
  const plugin=host.components({root,call:pluginCall(host.build)});
  // Read-only probe for the host's acceptance run: what a part's query returns, to tell display from behavior problems.
  globalThis.__molisPluginRead=componentId=>pluginCall(host.build)(componentId,'read',{selection:{}});
  api('/builds/'+host.build).then(async({build})=>{if(!build.design)throw new Error('这个草稿还没有确定方案');await plugin.update({contract:build.design.contract,nodes:build.nodes,connected:build.connected});globalThis.__molisPluginReady=true;}).catch(e=>{root.textContent=e.message;});
  return;
 }
 if(host.mode==='installed'){
  // An installed plugin: the same renderer; every call goes to the plugin's own sandboxed process through the host.
  const root=document.querySelector('[data-installed-plugin]');
  const call=async(componentId,binding,payload)=>{pending++;globalThis.__molisPluginPending=pending;try{const r=await fetch(host.call,{method:'POST',cache:'no-store',headers:headers('POST'),body:JSON.stringify({componentId,binding,payload})});const v=await r.json().catch(()=>({}));if(!r.ok)throw new Error(v.error||'操作失败，输入已保留');return v.value;}finally{pending--;globalThis.__molisPluginPending=pending}};
  host.components({root,call}).update(host.view).then(()=>{globalThis.__molisPluginReady=true;}).catch(e=>{root.textContent=e.message;});
  return;
 }
 const root=document.querySelector('[data-agent-studio]'),$=s=>root.querySelector(s);
 const feed=$('[data-as-feed]'),input=$('[data-as-input]'),canvas=$('[data-as-canvas]'),scroll=$('[data-as-scroll]'),pluginRoot=$('[data-as-plugin]'),empty=$('[data-as-empty]');
 let state={builds:[],releases:[],models:[],model:null,components:[],selectionAvailable:false},current=null,versions=[],preview=null,tab='build',target=null,source=null,frame=0,busy=false,notice='',openSteps=null,rendered='',seenNodes=new Set(),seenWired=new Set(),firstPaint=true;
 const plugin=host.components({root:pluginRoot,call:(id,binding,payload)=>current?pluginCall(current.id)(id,binding,payload):Promise.reject(new Error('还没有草稿')),inspect:id=>{if(tab!=='build'||!current?.design)return;target=id;schedule();input.focus();}});
 const PHASE={draft:'草稿',designing:'设计中',clarifying:'等你回答',choosing:'比较方案',building:'构建中',paused:'已暂停',failed:'需要处理',ready:'可以试用'};
 const AGENT={design:'主线设计',ui:'UI Agent',code:'代码 Agent',host:'宿主检查'};
 const componentName=kind=>(state.components.find(c=>c.kind===kind)||{}).name||kind;
 const active=b=>!!b?.active;
 const EXAMPLES=[['读书笔记','记录读过的书、评分和一句话感受，按状态筛选'],['每日复盘','每天写下完成了什么、卡在哪里、明天最重要的一件事'],['小组报名表','收集报名人的姓名、联系方式和时间段，能看到已报名名单']];
 function selection(s){if(!s)return '';if(s.source==='jev')return '<span class="as-chip jev">Jev · '+s.candidates.length+' 选 1'+(s.elapsedMs!=null?' · '+s.elapsedMs+'ms':'')+'</span>';if(s.source==='user')return '<span class="as-chip user">你选择</span>';return '<span class="as-chip rule">'+(s.candidates.length===1?'唯一合法组件':'规则选择')+'</span>';}
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
 function candidateHtml(c,selected){const ops=c.preview.contract.operations,caps=[...new Set(ops.flatMap(o=>o.effects?.capabilities||[]))].map(capabilityTitle);return '<button type="button" class="as-candidate" data-as-candidate="'+esc(c.id)+'" aria-pressed="'+(selected?'true':'false')+'"><b>'+esc(c.title)+'</b><p>'+esc(c.description)+'</p><p class="as-small as-muted">'+esc(c.rationale)+'</p><div class="as-meta"><span class="as-chip">'+ops.length+' 项功能</span><span class="as-chip">'+c.preview.parts.length+' 个界面零件</span><span class="as-chip">'+c.preview.contract.pages.length+' 个页面</span>'+caps.map(t=>'<span class="as-chip">'+esc(t)+'</span>').join('')+'</div></button>';}
 function effects(c){const e=c.effects||{};const words=[];if(e.storage)words.push('自己的存储（'+e.storage.map(x=>x==='read'?'读':'写').join('/')+'）');if(e.capabilities?.length)words.push(e.capabilities.map(capabilityTitle).join('、'));if(e.networkDomains?.length)words.push('联网 '+e.networkDomains.join('、'));return words.join('；')||'不使用任何外部能力';}
 function opState(b,op){if(b.connected.includes(op.id))return '<span class="as-chip ok">已接通</span>';const s=b.steps.find(x=>x.agent==='code'&&x.operationId===op.id&&x.status==='active');if(s)return '<span class="as-chip jev">编写中</span>';const f=b.steps.find(x=>x.agent==='code'&&x.operationId===op.id&&x.action==='verify'&&x.status==='failed');return f?'<span class="as-chip bad">未通过</span>':'<span class="as-chip">待接通</span>';}
 function installed(b){return b?.design?(state.installations||[]).find(i=>i.pluginId===b.design.contract.pluginId):null;}
 const covered=(next,approved)=>Object.entries(next||{}).every(([k,v])=>v.every(x=>(approved?.[k]||[]).includes(x)));
 function installHtml(b){const latest=versions[0],inst=installed(b);if(!latest)return '';
  if(!inst)return '<div class="as-install"><p class="as-small">v'+latest.version+' 已发布，安装后会出现在这个项目里，数据和试用分开保存。</p><div class="as-actions"><button type="button" class="as-button as-primary" data-as-install="'+latest.version+'">'+icon('download')+'安装到这个项目</button></div></div>';
  const upgrade=latest.version>inst.version?'<button type="button" class="as-button" data-as-upgrade="'+latest.version+'">'+icon('refresh')+'升级到 v'+latest.version+'</button>':'';
  return '<div class="as-install"><p class="as-small"><span class="as-chip ok">已安装 v'+inst.version+'</span>'+(inst.state==='running'?'':' <span class="as-chip bad">'+esc(inst.state)+'</span>')+'</p><div class="as-actions"><a class="as-button as-primary" href="'+esc(host.plugin(inst.pluginId))+'" target="_blank" rel="noopener" data-as-open-plugin="'+esc(b.id)+'">'+icon('external')+'打开插件</a>'+upgrade+'<button type="button" class="as-button" data-as-uninstall>'+icon('trash')+'卸载</button></div></div>';}
 function effectsList(e){const rows=[];if(e?.storage?.length)rows.push(e.storage.includes('write')?'在本机保存和读取它自己的数据（只属于这个插件）':'读取它自己保存的数据');
  for(const id of e?.capabilities||[])rows.push((state.capabilities||[]).find(c=>c.id===id)?.consent||'使用平台能力：'+id);if(e?.networkDomains?.length)rows.push('访问这些网站：'+e.networkDomains.join('、'));
  if(e?.secretRefs?.length)rows.push('使用你保存的密钥：'+e.secretRefs.join('、')+'（插件只拿到引用，看不到内容）');if(e?.artifacts?.length)rows.push('读写项目里的文档成果');return rows.length?rows:['不需要任何额外权限'];}
 /** A small in-page dialog; resolves with the chosen button's value, or '' when dismissed. */
 function ask(title,text,buttons){return new Promise(resolve=>{const d=document.createElement('dialog');d.className='as-dialog';
  d.innerHTML='<form method="dialog"><h3>'+esc(title)+'</h3><p class="as-small">'+esc(text)+'</p><div class="as-actions">'+buttons.map(([value,label,primary])=>'<button value="'+esc(value)+'" class="as-button'+(primary?' as-primary':'')+'">'+esc(label)+'</button>').join('')+'</div></form>';
  settle(d,resolve);});}
 // Resolve from the form's own submit (synchronous with the click) and from Escape; a dialog's close event is not
 // delivered while the page is in the background.
 function settle(d,resolve){root.append(d);d.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const value=e.submitter?.value||'';d.close();d.remove();resolve(value);});
  d.addEventListener('cancel',e=>{e.preventDefault();d.close();d.remove();resolve('');});d.showModal();}
 function consent(title,effects,confirmLabel){return new Promise(resolve=>{const d=document.createElement('dialog');d.className='as-dialog';
  d.innerHTML='<form method="dialog"><h3>'+esc(title)+'</h3><p class="as-small as-muted">它会：</p><ul>'+effectsList(effects).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><p class="as-small as-muted">它不能读取你的文件、其他插件的数据，也不能直接联网；运行在隔离的进程里。</p><div class="as-actions"><button value="cancel" class="as-button">取消</button><button value="ok" class="as-button as-primary">'+esc(confirmLabel)+'</button></div></form>';
  settle(d,value=>resolve(value==='ok'));});}
 function agents(b){const rows=[];const last=(agent,f=()=>true)=>[...b.steps].reverse().find(s=>s.agent===agent&&f(s));
  const d=last('design');if(d)rows.push(['design',d.status==='active'?'<span class="as-dots">'+esc(d.label)+'</span>':esc(d.label)]);
  const u=last('ui');if(u)rows.push(['ui',esc(u.label)+' '+selection(u.selection)]);
  const c=last('code',s=>s.action==='implement'&&s.status==='active')||last('code',s=>s.action==='verify');const act=last('code',s=>['file','tool','check'].includes(s.action));
  if(c)rows.push(['code',(c.status==='active'?'<span class="as-dots">'+esc(c.label)+'</span>':esc(c.label))+(c.status==='active'&&act?'<small class="as-muted"> · '+esc(act.action==='file'?'写入 '+(act.detail||'').slice(0,60):act.action==='check'?'正在自查门禁':act.label)+'</small>':'')]);
  const h=last('host');if(h)rows.push(['host',h.status==='active'?'<span class="as-dots">'+esc(h.label)+'</span>':esc(h.label)]);
  return rows.length?'<div class="as-agents">'+rows.map(([a,t])=>'<div class="as-agent" data-agent="'+a+'"><b>'+AGENT[a]+'</b><span>'+t+'</span></div>').join('')+'</div>':'';}
 function renderFeed(){
  const b=current,parts=[];
  if(!b){parts.push('<h2>一起把想法做出来</h2><p class="as-muted">说说你想要一个什么样的插件：谁用、做什么、留下什么结果。主线设计会先理解需求，再给出几个方案让你比较。</p><div class="as-examples">'+EXAMPLES.map(([t,d])=>'<button type="button" class="as-example" data-as-example="'+esc(d)+'"><b>'+esc(t)+'</b><span class="as-muted as-small">'+esc(d)+'</span></button>').join('')+'</div><p class="as-small as-muted">示例只会填进输入框，不会自动开始。</p>');}
  else{
   parts.push('<div class="as-brief"><span>你的需求</span><p>'+esc(b.brief)+'</p></div>');
   for(const m of b.messages.slice(1))parts.push('<div class="as-brief"><span>'+(m.role==='user'?'你补充了':'主线设计')+'</span><p>'+esc(m.text)+'</p></div>');
   if(b.questions.length)parts.push('<div class="as-card as-decision"><h3>主线设计需要你回答 '+b.questions.length+' 个问题</h3><ol>'+b.questions.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ol><p class="as-small as-muted">在下方输入框里回答；只会追问这一轮。</p></div>');
   if(b.phase==='choosing'&&b.candidates.length)parts.push('<div><h3 class="as-small as-muted">'+b.candidates.length+' 个方案 · 点选在右侧预览</h3><div class="as-candidates">'+b.candidates.map(c=>candidateHtml(c,c.id===(preview||b.candidates[0].id))).join('')+'</div>'+(()=>{const c=b.candidates.find(x=>x.id===(preview||b.candidates[0].id));return c?'<div class="as-card" style="margin-top:10px"><h3>'+esc(c.title)+' 的使用路径</h3><p>'+c.journey.map(esc).join(' → ')+'</p><p class="as-small as-muted" style="margin-top:6px">会用到：'+esc(effects(c))+'</p><div class="as-actions"><button type="button" class="as-button as-primary" data-as-choose="'+esc(c.id)+'">采用这个方案并开始构建</button></div></div>':'';})()+'</div>');
   if(!b.design&&b.chosen&&b.active?.stage==='detail'){const c=b.candidates.find(x=>x.id===b.chosen);if(c)parts.push('<div class="as-card"><h3>已采用「'+esc(c.title)+'」</h3><p class="as-small as-muted">主线设计正在补全功能合同、界面零件和验收用例；完成后 UI Agent 和代码 Agent 会同时开工。</p></div>');}
   if(b.design)parts.push('<div class="as-card"><h3>主线 · '+esc(b.design.title)+'</h3><p class="as-small">'+b.design.journey.map(esc).join(' → ')+'</p><ul class="as-ops">'+b.design.contract.operations.map(op=>'<li><span>'+esc(op.description||op.id)+' <code>'+esc(op.id)+'</code></span>'+opState(b,op)+'</li>').join('')+'</ul>'+(b.notes?.length?'<p class="as-small as-muted" style="margin-top:6px">宿主整理：'+b.notes.slice(0,6).map(esc).join('、')+'</p>':'')+'</div>');
   const ag=agents(b);if(ag)parts.push(ag);
   if(b.pendingPart){const part=b.design?.parts.find(p=>p.id===b.pendingPart.id);parts.push('<div class="as-card as-decision"><h3>请你选择「'+esc(part?.purpose||b.pendingPart.id)+'」用哪个组件</h3><p class="as-small as-muted">'+esc(b.pendingPart.reason)+'。已放入的组件不受影响。</p><div class="as-actions">'+b.pendingPart.candidates.map(k=>'<button type="button" class="as-button" data-as-part="'+esc(k)+'">'+esc(componentName(k))+'</button>').join('')+'</div></div>');}
   if(b.error)parts.push('<div class="as-card as-error"><h3>'+(b.phase==='paused'?'已暂停':'这一步没有完成')+'</h3><p>'+esc(b.error)+'</p><div class="as-actions">'+(!active(b)?'<button type="button" class="as-button as-primary" data-as-action="resume">'+icon('play')+'继续</button>':'')+(b.history.length&&!active(b)?'<button type="button" class="as-button" data-as-action="undo">'+icon('undo')+'撤回上次修订</button>':'')+'</div></div>');
   if(b.phase==='ready'){const cases=b.browserResult?.cases||[],latest=versions[0],published=latest&&latest.design.contract.revision===b.design.contract.revision&&JSON.stringify(latest.nodes)===JSON.stringify(b.nodes);parts.push('<div class="as-card"><h3>可以试用了</h3><p class="as-small">'+b.connected.length+' 项功能全部接通 · 门禁 G1–G6 通过 · 界面验收 '+cases.filter(c=>c.passed).length+'/'+cases.length+' 通过</p><div class="as-actions">'+(published?'<span class="as-chip ok">v'+latest.version+' 已是当前版本</span>':'<button type="button" class="as-button as-primary" data-as-action="publish">'+icon('package')+'发布 v'+((latest?.version||0)+1)+'</button>')+'<a class="as-button" href="'+esc(host.preview(b.id))+'" target="_blank" rel="noopener">'+icon('external')+'单独打开试用</a></div>'+installHtml(b)+'</div>');}
   if(active(b))parts.push('<div class="as-controls"><button type="button" class="as-button" data-as-action="pause">'+icon('pause')+'暂停</button></div>');
   else if(b.phase==='paused'&&!b.error)parts.push('<div class="as-controls"><button type="button" class="as-button as-primary" data-as-action="resume">'+icon('play')+'继续构建</button></div>');
   if(b.steps.length){const done=b.steps.filter(s=>s.status==='done').length,shown=b.steps.slice(-60);parts.push('<details class="as-steps" data-as-steps'+(openSteps??active(b)?' open':'')+'><summary>协作记录 · '+done+' 步已完成</summary><ol>'+(b.steps.length>shown.length?'<li class="as-small as-muted">更早的 '+(b.steps.length-shown.length)+' 步已折叠</li>':'')+shown.map(stepHtml).join('')+'</ol></details>');}
  }
  if(notice)parts.push('<div class="as-card as-error" role="alert"><p>'+esc(notice)+'</p></div>');
  const html=parts.join('');if(html===rendered)return;rendered=html;
  const bottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<40;feed.innerHTML=html;if(bottom||firstPaint)feed.scrollTop=feed.scrollHeight;firstPaint=false;
 }
 function renderHead(){
  const b=current;$('[data-as-title]').textContent=b?(b.design?.title||b.candidates.find(c=>c.id===b.chosen)?.title||b.title):'新插件';const phase=$('[data-as-phase]');phase.textContent=b?(b.active?.stage==='detail'?'细化方案中':b.active?.stage==='revise'?'修订中':b.active?.stage==='design'?'理解需求中':PHASE[b.phase]||b.phase):'';phase.dataset.phase=b?.phase||'';phase.hidden=!b;
  root.querySelectorAll('[data-as-tab]').forEach(t=>{t.setAttribute('aria-selected',String(t.dataset.asTab===tab));t.disabled=t.dataset.asTab==='try'&&!(b?.connected.length);});
  canvas.dataset.tab=tab;canvas.toggleAttribute('data-inspectable',!!b?.design&&!active(b));
  $('[data-as-head-actions]').innerHTML=(b?.design?'<a class="as-icon" href="'+esc(host.preview(b.id))+'" target="_blank" rel="noopener" title="单独打开试用" aria-label="单独打开试用">'+icon('external')+'</a>':'')+(b&&!active(b)?'<button type="button" class="as-icon" data-as-remove title="删除这个草稿" aria-label="删除这个草稿">'+icon('trash')+'</button>':'');
  const composer=$('[data-as-composer]'),send=composer.querySelector('.as-send');
  input.placeholder=!b?'描述你想要的插件，例如：记录读过的书和感受，按状态筛选':b.questions.length?'回答上面的问题':active(b)?'构建进行中，可以先暂停再提修改':b.design?'对整体或选中的组件提出修改':'补充你的需求';
  input.disabled=active(b)||busy;send.disabled=active(b)||busy;
  const t=$('[data-as-target]');const node=target&&b?.nodes.find(n=>n.id===target);t.hidden=!node;t.innerHTML=node?'指向 · '+esc(node.purpose)+' <button type="button" data-as-untarget aria-label="取消指向">'+icon('x')+'</button>':'';
  const model=state.models.find(m=>m.provider_id===state.model?.provider_id&&m.model_id===state.model?.model_id);
  $('[data-as-model-note]').textContent=(model?'主线设计与代码 Agent：'+model.label:'请选择构建使用的模型')+' · Jev '+(state.selectionAvailable?'已配置':'未配置（按规格板顺序选择组件）');
 }
 function renderBoard(){
  const b=current,board=$('[data-as-board]');const used=new Set((b?.nodes||[]).map(n=>n.kind)),legal=new Set(b?.pendingPart?.candidates||[]);
  board.hidden=!b?.design;board.innerHTML=state.components.map(c=>'<button type="button" class="as-part"'+(used.has(c.kind)?' data-used':'')+(legal.has(c.kind)?' data-legal data-as-part="'+esc(c.kind)+'"':' disabled')+' title="'+esc(c.description)+'"><b>'+esc(c.name)+'</b></button>').join('');
 }
 let lastView='';
 async function renderCanvas(){
  const b=current;let view=null;
  if(b?.design)view={contract:b.design.contract,nodes:b.nodes,connected:b.connected};
  else if(b?.candidates.length&&(b.phase==='choosing'||b.active?.stage==='detail')){const c=b.candidates.find(x=>x.id===(b.chosen||preview||b.candidates[0].id))||b.candidates[0];const kind=p=>(state.components.find(x=>x.intent===p.intent)||{}).kind||'text';view={contract:c.preview.contract,nodes:c.preview.parts.map(p=>({...p,kind:kind(p)})),connected:[]};}
  empty.hidden=!!view&&view.nodes.length>0;pluginRoot.hidden=!view||!view.nodes.length;
  if(!b)empty.innerHTML='<h2>这里会出现你的插件</h2><p>方案确定后，UI Agent 从组件池里逐个放入组件，代码 Agent 同时编写功能，接通一项就能试用一项。</p>';
  else if(!view)empty.innerHTML='<div class="as-skeleton" aria-label="正在理解需求"><div style="width:40%"></div><div class="tall"></div><div></div><div style="width:70%"></div></div><p style="margin-top:18px">“'+esc(b.brief.slice(0,120))+'”</p>';
  else if(!view.nodes.length)empty.innerHTML='<p>UI Agent 正在从组件池里挑第一个组件…</p>';
  const key=view?JSON.stringify(view):'';if(view&&key!==lastView){lastView=key;await plugin.update(view);}
  decorate();
 }
 function decorate(){
  const b=current;const nodes=[...pluginRoot.querySelectorAll('[data-component-id]')];
  for(const el of nodes){const id=el.dataset.componentId;el.toggleAttribute('data-as-target',id===target);
   if(b?.design&&!seenNodes.has(id)){seenNodes.add(id);if(!firstPaint&&tab==='build'){el.setAttribute('data-as-new','');setTimeout(()=>el.removeAttribute('data-as-new'),800);}}
   const node=b?.nodes.find(n=>n.id===id),ops=[node?.read?.operationId,node?.submit?.operationId].filter(Boolean),wired=ops.length&&ops.every(o=>b.connected.includes(o));
   if(wired&&!seenWired.has(id)){seenWired.add(id);if(tab==='build'){el.setAttribute('data-as-wired','');setTimeout(()=>el.removeAttribute('data-as-wired'),1700);}}}
  pointers();
 }
 function place(pointer,el,label){if(!el){pointer.hidden=true;return;}const box=el.getBoundingClientRect(),area=scroll.getBoundingClientRect();pointer.hidden=false;pointer.querySelector('em').textContent=label||'';pointer.querySelector('em').hidden=!label;
  // Point at the part's top-right corner from inside the canvas, so the label never leaves the visible area.
  const width=Math.max(pointer.offsetWidth,120),x=Math.min(box.right-area.left+scroll.scrollLeft-width+24,scroll.scrollLeft+area.width-width-16),y=box.top-area.top+scroll.scrollTop+8;
  pointer.style.transform='translate('+Math.round(Math.max(scroll.scrollLeft+8,x))+'px,'+Math.round(y)+'px)';}
 function pointers(){
  const b=current,ui=$('[data-as-pointer="ui"]'),code=$('[data-as-pointer="code"]');
  if(!b?.design||tab!=='build'||!active(b)&&!b.pendingPart){ui.hidden=true;code.hidden=true;return;}
  const lastUi=[...b.steps].reverse().find(s=>s.agent==='ui'&&s.target);const el=id=>id&&pluginRoot.querySelector('[data-component-id="'+CSS.escape(id)+'"]');
  place(ui,el(b.pendingPart?.id||lastUi?.target),lastUi?.status==='active'?'选择组件':b.pendingPart?'等你选组件':lastUi?.label.slice(0,18));
  const writing=[...b.steps].reverse().find(s=>s.agent==='code'&&s.action==='implement'&&s.status==='active');
  const bound=writing&&b.nodes.find(n=>n.read?.operationId===writing.operationId||n.submit?.operationId===writing.operationId);
  place(code,el(bound?.id),writing?'编写 '+writing.operationId:'');if(!writing)code.hidden=true;
 }
 function renderAll(){renderHead();renderFeed();renderBoard();void renderCanvas();
  const s=$('[data-as-status]'),b=current;s.innerHTML='<span>'+(!b?'':active(b)?(b.active.stage==='design'?'主线设计正在工作':'UI Agent 与代码 Agent 正在协作'):b.phase==='ready'?'全部功能已接通，可以试用和发布':b.phase==='clarifying'?'等你回答问题':b.phase==='choosing'?'等你选择方案':b.pendingPart?'等你选择组件':PHASE[b.phase]||'')+'</span><span>'+(b?.connected.length?'已接通 '+b.connected.length+'/'+(b.design?.contract.operations.length||0)+' 项功能 · 输入会保留':'')+'</span>';}
 // Animation frames do not run in a hidden page; render there directly so the page never shows a stale build.
 function schedule(){if(frame)return;const paint=()=>{frame=0;renderAll();};frame=document.hidden?setTimeout(paint,0):requestAnimationFrame(paint);}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)pointers();});
 function renderBuilds(){const select=$('[data-as-builds]');select.innerHTML='<option value="">'+(state.builds.length?'我的插件（'+state.builds.length+'）':'还没有插件')+'</option>'+state.builds.map(b=>'<option value="'+esc(b.id)+'"'+(b.id===current?.id?' selected':'')+'>'+esc(b.design?.title||b.title)+' · '+esc(PHASE[b.phase]||b.phase)+'</option>').join('');
  const model=$('[data-as-model]');model.innerHTML=(state.model?'':'<option value="">选择模型</option>')+state.models.map(m=>'<option value="'+esc(m.provider_id+'\n'+m.model_id)+'"'+(m.provider_id===state.model?.provider_id&&m.model_id===state.model?.model_id?' selected':'')+'>'+esc(m.label.endsWith(m.model_id)&&m.label!==m.model_id?m.model_id+' · '+m.label.slice(0,-m.model_id.length).replace(/\s*·\s*$/,''):m.label)+'</option>').join('');}
 function subscribe(id){source?.close();source=null;if(!id)return;source=new EventSource(host.api('/builds/'+id+'/events'));source.onmessage=e=>{const b=JSON.parse(e.data);if(b.id!==current?.id)return;if(b.design?.contract.revision!==current.design?.contract.revision){seenNodes=new Set();seenWired=new Set();}current=b;
   const listed=state.builds.find(x=>x.id===b.id);if(listed&&(listed.phase!==b.phase||(listed.design?.title||listed.title)!==(b.design?.title||b.title))){Object.assign(listed,{phase:b.phase,title:b.title,design:b.design});renderBuilds();}
   schedule();};}
 async function open(id){target=null;preview=null;rendered='';lastView='';seenNodes=new Set();seenWired=new Set();firstPaint=true;tab='build';
  if(!id){current=null;versions=[];subscribe(null);history.replaceState(null,'',location.pathname);schedule();return;}
  const v=await api('/builds/'+id);current=v.build;versions=v.versions;subscribe(id);history.replaceState(null,'',location.pathname+'?build='+encodeURIComponent(id));renderBuilds();schedule();}
 async function refreshState(){state=await api('/state');renderBuilds();}
 async function run(work){if(busy)return;busy=true;notice='';schedule();try{await work();}catch(e){notice=e.message;}finally{busy=false;schedule();}}
 async function act(action,extra={}){const v=await api('/builds/'+current.id+'/action','POST',{action,revision:current.revision,...extra});if(v.build)current=v.build;if(v.release){versions=(await api('/builds/'+current.id)).versions;notice='';}if(v.deleted){await refreshState();await open(null);}}
 root.addEventListener('click',e=>{const el=e.target.closest('button,a');if(!el||!root.contains(el))return;
  // Framed in the workbench, the plugin opens in place as a workbench stage rather than in a new window.
  if(el.dataset.asOpenPlugin&&parent!==window){e.preventDefault();parent.postMessage({type:'molis-studio-open-plugin',surface:'app-'+el.dataset.asOpenPlugin},location.origin);return;}
  if(el.dataset.asExample){input.value=el.dataset.asExample;input.focus();return;}
  if(el.dataset.asCandidate){preview=el.dataset.asCandidate;rendered='';schedule();return;}
  if(el.dataset.asChoose){run(()=>act('choose',{candidateId:el.dataset.asChoose}));return;}
  if(el.dataset.asPart){run(()=>act('part',{kind:el.dataset.asPart}));return;}
  if(el.dataset.asAction){const a=el.dataset.asAction;if(a==='publish')run(()=>act('publish'));else run(()=>act(a));return;}
  if(el.dataset.asTab){tab=el.dataset.asTab;target=null;schedule();return;}
  if(el.hasAttribute('data-as-untarget')){target=null;schedule();return;}
  if(el.dataset.asInstall){const v=versions.find(x=>x.version===Number(el.dataset.asInstall));consent('安装「'+(current.design?.title||'')+'」到这个项目',v?.permissions,'安装').then(ok=>{if(ok)run(async()=>{await act('install',{version:v.version,grants:{consent:true}});await refreshState();});});return;}
  if(el.dataset.asUpgrade){const v=versions.find(x=>x.version===Number(el.dataset.asUpgrade)),inst=installed(current);const go=()=>run(async()=>{await act('upgrade',{version:v.version,grants:{consent:true}});await refreshState();});
   if(covered(v?.permissions,inst?.effects))go();else consent('升级到 v'+v.version+' 需要新的权限',v?.permissions,'确认并升级').then(ok=>{if(ok)go();});return;}
  if(el.hasAttribute('data-as-uninstall')){const inst=installed(current);if(!inst)return;ask('卸载「'+(current.design?.title||'')+'」','卸载后它会从这个项目里移除。它保存的数据可以留着，以后重新安装还能看到。',[['keep','卸载，保留数据',true],['drop','卸载并删除数据'],['cancel','取消']]).then(choice=>{if(choice==='keep'||choice==='drop')run(async()=>{await act('uninstall',{version:inst.version,grants:{keepData:choice==='keep'}});await refreshState();if(parent!==window)parent.postMessage({type:'molis-studio-plugin-removed',surface:'app-'+current.id},location.origin);});});return;}
  if(el.hasAttribute('data-as-remove')){ask('删除「'+(current.design?.title||current.title)+'」这个草稿？','构建目录和试用数据会一起删除，已发布并安装的插件不受影响。',[['remove','删除',true],['cancel','取消']]).then(choice=>{if(choice==='remove')run(()=>act('remove'));});return;}
  if(el.hasAttribute('data-as-new')){run(()=>open(null));input.focus();}
 });
 feed.addEventListener('click',e=>{const summary=e.target.closest?.('[data-as-steps] > summary');if(summary)openSteps=!summary.parentElement.open;});
 $('[data-as-builds]').addEventListener('change',e=>run(()=>open(e.target.value||null)));
 $('[data-as-model]').addEventListener('change',e=>{const[provider_id,model_id]=e.target.value.split('\n');if(!provider_id)return;run(async()=>{await api('/settings','POST',{provider_id,model_id});await refreshState();});});
 input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('[data-as-composer]').requestSubmit();}});
 $('[data-as-composer]').addEventListener('submit',e=>{e.preventDefault();const text=input.value.trim();if(!text)return;run(async()=>{
  if(!current){const v=await api('/builds','POST',{brief:text});input.value='';await refreshState();await open(v.build.id);return;}
  const node=target&&current.nodes.find(n=>n.id===target);await act('message',{message:node?'［'+node.purpose+'］'+text:text});input.value='';target=null;});});
 scroll.addEventListener('scroll',()=>pointers(),{passive:true});addEventListener('resize',()=>pointers());
 new MutationObserver(()=>{if(!frame)(document.hidden?setTimeout:requestAnimationFrame)(()=>decorate());}).observe(pluginRoot,{childList:true,subtree:true});
 run(async()=>{await refreshState();const id=new URLSearchParams(location.search).get('build');await open(id&&state.builds.some(b=>b.id===id)?id:state.builds[0]?.id||null);});
}`;
