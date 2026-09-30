import type { MolisWorkIcon } from "@molis-ai/molis-work-design-system";
import { renderSideBrowser } from "./side-panel-browser.js";
import { renderSideFiles } from "./side-panel-files.js";

/**
 * The panel beside the work (specs/side-panel). Host layout only: which tab shows, how wide, open or closed.
 * What a tab shows belongs to its owner — the discussion to im-ui and the shared server, the browser to the
 * local browser service, files to the plugins that declare file sources, a plugin tab to that plugin.
 *
 * One tab shows at a time. Every tab keeps its own document once opened (hidden, never torn down), so switching
 * and closing lose no draft, page or reading position. Other surfaces open it with `molis:side-open`.
 */
export interface SidePanelPrimitives {
  L(value: string): string;
  escapeHtml(value: unknown): string;
  icon(name: MolisWorkIcon): string;
}

/** A tab a plugin declared for the side slot; its document is served by the Host, never positioned by the plugin. */
export interface SidePanelPluginTab {
  /** `<plugin_id>/<view_id>`: the tab's identity in `molis:side-open`. */
  readonly key: string;
  readonly title: string;
  readonly icon: MolisWorkIcon;
  readonly src: string;
}

export function renderSidePanel(primitives: SidePanelPrimitives, pluginTabs: readonly SidePanelPluginTab[] = []): string {
  const { L, icon, escapeHtml } = primitives;
  const tab = (id: string, label: string, glyph: MolisWorkIcon, extra = "") =>
    `<button class="side-panel-tab" type="button" role="tab" id="side-tab-${escapeHtml(id)}" aria-controls="side-body-${escapeHtml(id)}" aria-selected="false" tabindex="-1" data-side-tab="${escapeHtml(id)}" title="${escapeHtml(label)}"${extra}>${icon(glyph)}<span>${escapeHtml(label)}</span></button>`;
  const body = (id: string, label: string, inner: string, extra = "") =>
    `<div class="side-panel-body" id="side-body-${escapeHtml(id)}" role="tabpanel" aria-labelledby="side-tab-${escapeHtml(id)}" aria-label="${escapeHtml(label)}" data-side-body="${escapeHtml(id)}"${extra} hidden>${inner}</div>`;
  const plugins = pluginTabs.map(entry => ({ id: `plugin:${entry.key}`, ...entry }));
  return `<section class="side-panel" id="dock-window-im" role="region" aria-label="${L("侧栏")}" data-side-panel data-dock-window="im" hidden>
        <header class="side-panel-head">
          <div class="side-panel-tabs" role="tablist" aria-label="${L("侧栏内容")}" data-side-tabs>
            ${tab("discussion", L("讨论"), "message")}${tab("browser", L("浏览器"), "globe")}${tab("files", L("文件"), "folder")}${plugins.map(entry => tab(entry.id, entry.title, entry.icon, ` data-side-plugin="${escapeHtml(entry.key)}"`)).join("")}
          </div>
          <button class="side-panel-close" type="button" data-side-close aria-label="${L("收起侧栏")}" title="${L("收起侧栏")}">${icon("x")}</button>
        </header>
        ${body("discussion", L("项目讨论"), `<iframe title="${L("群聊与 Thread")}" data-dock-frame="im"></iframe>`)}
        ${body("browser", L("浏览器"), renderSideBrowser(primitives), " data-side-browser")}
        ${body("files", L("文件"), renderSideFiles(primitives), " data-side-files")}
        ${plugins.map(entry => body(entry.id, entry.title, `<iframe title="${escapeHtml(entry.title)}" data-side-frame></iframe>`, ` data-side-src="${escapeHtml(entry.src)}"`)).join("")}
      </section>`;
}

export const SIDE_PANEL_STYLES = String.raw`
html body.immersive-workbench[data-side-open=true] [data-plugin-stage]{margin-right:calc(var(--side-panel-width,35vw) + 8px)}
html body.immersive-workbench .side-panel{position:fixed;display:flex;flex-direction:column;inset:var(--desktop-titlebar-height,32px) 8px calc(var(--dock-h,48px) + 8px) auto;width:var(--side-panel-width,35vw);z-index:10;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:var(--paper);box-shadow:none;animation:none;opacity:0;transform:translateX(24px);transition:opacity var(--dur-move) var(--ease-quint),transform var(--dur-arrive) var(--ease-quint);pointer-events:none;container:side-panel/inline-size}
html body.immersive-workbench .side-panel[hidden]{display:none}
html body.immersive-workbench[data-side-open=true] .side-panel{opacity:1;transform:none;pointer-events:auto}
.side-panel-head{display:flex;align-items:center;gap:8px;flex:none;height:44px;padding:0 6px 0 8px;border-bottom:1px solid var(--line)}
.side-panel-tabs{display:flex;align-items:center;gap:2px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}
.side-panel-tabs::-webkit-scrollbar{display:none}
.side-panel-tab{display:inline-flex;align-items:center;gap:6px;flex:none;height:30px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--muted);font:inherit;font-size:13px;cursor:pointer;transition:background-color var(--dur-hover) var(--ease-quint),color var(--dur-hover) var(--ease-quint)}
.side-panel-tab svg{width:15px;height:15px;flex:none}
.side-panel-tab:hover{background:var(--nav-hover);color:var(--ink)}
.side-panel-tab[aria-selected=true]{background:var(--nav-active);color:var(--ink)}
.side-panel-tab:focus-visible,.side-panel-close:focus-visible{outline:2px solid var(--focus,var(--accent));outline-offset:-2px}
.side-panel-tab[data-side-busy=true]::after{content:"";width:6px;height:6px;border-radius:50%;background:var(--accent)}
.side-panel-close{display:inline-grid;place-items:center;flex:none;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;transition:background-color var(--dur-hover) var(--ease-quint),color var(--dur-hover) var(--ease-quint)}
.side-panel-close:hover{background:var(--nav-hover);color:var(--ink)}
.side-panel-close svg{width:16px;height:16px}
.side-panel-body{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;animation:side-panel-body-in var(--dur-move) var(--ease-quint)}
.side-panel-body[hidden]{display:none}
.side-panel-body>iframe{border:0;display:block;flex:1;width:100%;min-height:0}
@keyframes side-panel-body-in{from{opacity:0}to{opacity:1}}
@container side-panel (max-width:420px){.side-panel-tab span{display:none}.side-panel-tab{padding:0 8px}}
.side-panel-divider{position:fixed;right:calc(var(--side-panel-width,35vw) + 7px);top:var(--desktop-titlebar-height,32px);bottom:calc(var(--dock-h,48px) + 8px);width:9px;z-index:11;cursor:col-resize;touch-action:none;border:0;padding:0;background:transparent}
.side-panel-divider:after{content:"";position:absolute;top:calc(50% - 14px);left:3px;width:3px;height:28px;border-radius:4px;background:var(--line-strong,var(--line))}
.side-panel-divider:hover:after,.side-panel-divider:focus-visible:after{background:var(--ink)}
.side-panel-divider:focus-visible{outline:1px solid var(--ink);outline-offset:-2px}
body:not([data-side-open=true]) .side-panel-divider{display:none}
html body.is-side-resizing :is([data-plugin-stage],.side-panel){transition:none!important}
body.is-side-resizing iframe,body.is-side-resizing [data-side-browser] canvas{pointer-events:none!important}
body.is-side-resizing{cursor:col-resize;user-select:none}
@media(max-width:760px){
 html body.immersive-workbench[data-side-open=true] [data-plugin-stage]{margin-right:8px;margin-bottom:calc(52dvh + 8px)}
 html body.immersive-workbench .side-panel{inset:auto 8px calc(var(--dock-h,48px) + 8px) 8px;width:auto;height:52dvh;transform:translateY(12px)}
 .side-panel-divider{display:none!important}
}
@media(prefers-reduced-motion:reduce){html body.immersive-workbench :is([data-plugin-stage],.side-panel,.side-panel-body){transition:none!important;animation:none!important}}
`;

/**
 * Opens, sizes and switches the panel. Public, same-document interface (spec 3.1):
 * `molis:side-open` { tab, view?, target?, focus? } · `molis:side-close` · `molis:side-toggle`; the older
 * `molis:discussion-toggle` / `-close` keep working for the discussion tab. Same-origin frames post the same
 * `{ type: "molis:side-open", ... }`. Tab owners hear `molis:side-shown` { tab, target } when their tab shows.
 */
export const SIDE_PANEL_SCRIPT = String.raw`(() => {
  if(document.body.hasAttribute('data-pane-embedded'))return;
  const panel=document.querySelector('[data-side-panel]'),stage=document.querySelector('[data-plugin-stage]');
  if(!panel||!stage)return;
  document.querySelector('[data-workspace]').append(panel);
  const frame=panel.querySelector('[data-dock-frame="im"]'),projectId=document.body.dataset.projectId;
  const tabs=()=>[...panel.querySelectorAll('[data-side-tab]')];
  const bodyOf=(id)=>panel.querySelector('[data-side-body="'+CSS.escape(id)+'"]');
  const divider=document.createElement('div');divider.className='side-panel-divider';divider.tabIndex=0;
  divider.setAttribute('role','separator');divider.setAttribute('aria-orientation','vertical');divider.setAttribute('aria-label','调整侧栏宽度');divider.setAttribute('aria-controls',panel.id);
  panel.after(divider);
  const read=(key)=>{try{return localStorage.getItem(key);}catch{return null;}};
  const write=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
  let open=false,closing=null,trigger=null,ratio=.35,current=null;
  const storedRatio=Number(read('molis:side-ratio')??read('molis:discussion-ratio'));if(storedRatio>=.25&&storedRatio<=.55)ratio=storedRatio;
  const size=()=>Math.min(Math.max(innerWidth*ratio,360),innerWidth*.55);
  const paint=()=>{const width=Math.round(size());document.body.style.setProperty('--side-panel-width',width+'px');document.body.style.setProperty('--discussion-size',width+'px');divider.setAttribute('aria-valuenow',String(width));divider.setAttribute('aria-valuemin','360');divider.setAttribute('aria-valuemax',String(Math.floor(innerWidth*.55)));};
  const imVisible=()=>frame?.contentWindow?.postMessage({type:'molis:im-visibility',visible:open&&current==='discussion',theme:document.documentElement.dataset.resolvedTheme},location.origin);
  const known=(id)=>!!id&&tabs().some(button=>button.dataset.sideTab===id);
  const load=(body)=>{
    if(body.dataset.sideBody==='discussion'&&frame&&!frame.getAttribute('src'))frame.src='/im?embedded=1'+(projectId?'&project='+encodeURIComponent(projectId):'');
    const src=body.dataset.sideSrc,inner=body.querySelector('[data-side-frame]');
    if(src&&inner&&!inner.getAttribute('src'))inner.src=src;
  };
  const select=(id,target)=>{
    if(!known(id))id='discussion';
    const changed=current!==id;current=id;write('molis:side-tab',id);
    for(const button of tabs()){const on=button.dataset.sideTab===id;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;}
    for(const body of panel.querySelectorAll('[data-side-body]')){const on=body.dataset.sideBody===id;if(on&&changed){body.hidden=false;load(body);}else if(!on)body.hidden=true;}
    imVisible();
    document.dispatchEvent(new CustomEvent('molis:side-shown',{detail:{tab:id,target:target??null,open}}));
  };
  const setOpen=(next,options={})=>{
    clearTimeout(closing);
    const was=open;open=next;
    if(open){
      if(!was)trigger=document.activeElement;
      panel.hidden=false;panel.inert=false;paint();void panel.offsetWidth;document.body.dataset.sideOpen='true';
      select(options.tab??current??read('molis:side-tab')??'discussion',options.target);
      if(options.focus===true)panel.querySelector('[data-side-tab][aria-selected="true"]')?.focus({preventScroll:true});
    }else if(was){
      delete document.body.dataset.sideOpen;panel.inert=true;
      closing=setTimeout(()=>{if(!open)panel.hidden=true;},matchMedia('(prefers-reduced-motion:reduce)').matches?0:420);
      if(panel.contains(document.activeElement)){const focusTarget=trigger?.isConnected&&trigger.getClientRects().length?trigger:document.querySelector('[data-dock-toggle="im"]');focusTarget?.focus({preventScroll:true});}
      imVisible();document.dispatchEvent(new CustomEvent('molis:side-shown',{detail:{tab:current,target:null,open:false}}));
    }
    document.querySelectorAll('[data-dock-toggle="im"],[data-side-toggle]').forEach(button=>button.setAttribute('aria-expanded',String(open)));
  };
  const request=(detail={})=>{
    const tab=detail.tab==='plugin'&&detail.view?'plugin:'+detail.view:detail.tab;
    setOpen(true,{tab:known(tab)?tab:undefined,target:detail.target,focus:detail.focus===true});
  };
  document.addEventListener('molis:side-open',event=>request(event.detail||{}));
  document.addEventListener('molis:side-close',()=>setOpen(false));
  document.addEventListener('molis:side-toggle',event=>open&&!(event.detail?.tab&&event.detail.tab!==current)?setOpen(false):request(event.detail||{}));
  document.addEventListener('molis:discussion-toggle',()=>open&&current==='discussion'?setOpen(false):request({tab:'discussion'}));
  document.addEventListener('molis:discussion-close',()=>setOpen(false));
  panel.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;if(!target)return;
    const button=target.closest('[data-side-tab]');if(button){select(button.dataset.sideTab);return;}
    if(target.closest('[data-side-close]'))setOpen(false);
  });
  panel.querySelector('[data-side-tabs]')?.addEventListener('keydown',event=>{
    const list=tabs(),at=list.findIndex(button=>button===document.activeElement);if(at<0)return;
    const next=event.key==='ArrowRight'?list[(at+1)%list.length]:event.key==='ArrowLeft'?list[(at-1+list.length)%list.length]:event.key==='Home'?list[0]:event.key==='End'?list.at(-1):null;
    if(!next)return;event.preventDefault();next.focus();select(next.dataset.sideTab);
  });
  // Escape closes the panel from inside it, the same as its close button; a tab that holds a menu or preview
  // handles Escape first and prevents it.
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&open){event.preventDefault();setOpen(false);}});
  frame?.addEventListener('load',imVisible);
  new MutationObserver(imVisible).observe(document.documentElement,{attributes:true,attributeFilter:['data-resolved-theme']});
  addEventListener('message',async event=>{
    if(event.origin!==location.origin)return;
    if(event.data?.type==='molis:side-open'&&event.source&&event.source!==window){request(event.data);return;}
    if(event.data?.type==='molis:side-close'&&event.source&&event.source!==window){setOpen(false);return;}
    if(!frame||event.source!==frame.contentWindow)return;
    if(event.data?.type==='molis:im-close')setOpen(false);
    if(event.data?.type==='molis:im-ready')imVisible();
    if(event.data?.type==='molis:im-connect'&&projectId){
      try{
        const token=document.querySelector('meta[name="molis-work-control-token"]')?.content;
        const response=await fetch('/projects/'+encodeURIComponent(projectId)+'/api/im/connect',{method:'POST',headers:{'Content-Type':'application/json','x-molis-work-control-token':token||'','x-molis-work-idempotency-key':crypto.randomUUID()},body:'{}'});
        const result=await response.json();frame.contentWindow.postMessage({type:'molis:im-connected',requestId:event.data.requestId,error:response.ok?null:result.error||'项目连接失败'},location.origin);
      }catch{frame.contentWindow.postMessage({type:'molis:im-connected',requestId:event.data.requestId,error:'项目连接中断，请重试'},location.origin);}
    }
  });
  let drag=null;
  const keep=()=>write('molis:side-ratio',String(ratio));
  divider.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={id:event.pointerId};divider.setPointerCapture(event.pointerId);document.body.classList.add('is-side-resizing');event.preventDefault();});
  divider.addEventListener('pointermove',event=>{if(!drag)return;ratio=Math.max(.25,Math.min(.55,(innerWidth-event.clientX-8)/innerWidth));paint();});
  const end=()=>{if(!drag)return;drag=null;document.body.classList.remove('is-side-resizing');keep();};
  divider.addEventListener('pointerup',end);divider.addEventListener('lostpointercapture',end);divider.addEventListener('pointercancel',end);
  divider.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();ratio=event.key==='Home'?.25:event.key==='End'?.55:Math.max(.25,Math.min(.55,ratio+(event.key==='ArrowLeft'?24:-24)/innerWidth));paint();keep();});
  divider.addEventListener('dblclick',()=>{ratio=.35;paint();keep();});
  addEventListener('resize',paint);paint();
  const first=read('molis:side-tab');select(known(first)?first:'discussion');
})();`;
