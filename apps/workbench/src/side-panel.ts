import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { SIDE_CONTEXT_FACTORY } from "./side-panel-context.js";
import { SIDE_FORWARD_SCRIPT } from "./scripts/client/pane-messages.js";
import { renderSideBrowser } from "./side-panel-browser.js";
import { renderSideComputer } from "./side-panel-computer.js";
import { renderSideFiles } from "./side-panel-files.js";

/**
 * The panel beside the work (specs/archive/side-panel). Host layout only: which tab shows, how wide, open or closed.
 * What a tab shows belongs to its owner — the discussion to im-ui and the shared server, the browser to the
 * local browser service, files to the plugins that declare file sources, a plugin tab to that plugin.
 *
 * One tab shows at a time. Every tab keeps its own document once opened (hidden, never torn down), so switching
 * and closing lose no draft, page or reading position. Other surfaces open it with `molis:side-open`.
 */
export interface SidePanelPrimitives {
  L(value: string): string;
  escapeHtml(value: unknown): string;
  icon(name: PluginIconName): string;
}

/** A tab a plugin declared for the side slot; its document is served by the Host, never positioned by the plugin. */
export interface SidePanelPluginTab {
  /** `<plugin_id>/<view_id>`: the tab's identity in `molis:side-open`. */
  readonly key: string;
  readonly title: string;
  readonly icon: PluginIconName;
  readonly src: string;
  /** A Home tool's summon chord (`Mod+Shift+I`): opens and focuses the tab from anywhere, again closes it. */
  readonly keys?: string;
  readonly contextOwner?: string;
  readonly contextSurface?: string;
  /** Its place among the tabs (Manifest `order`); the panel's own tabs have places too, so no tab is first by being the Host's. */
  readonly order?: number;
}

/** The panel's own tabs, in the places they take among the plugins' (side-shelf §3.1: Shelf · 灵光 · 资料 · 浏览器 · 电脑 · 讨论; 资料 was 文件, specs/project-knowledge §8.1). */
const OWN_TABS = [["files", "资料", "file", 20], ["browser", "浏览器", "globe", 30], ["computer", "电脑", "system", 40], ["discussion", "讨论", "message", 50]] as const;

export function renderSidePanel(primitives: SidePanelPrimitives, pluginTabs: readonly SidePanelPluginTab[] = [], projectTools = true): string {
  const { L, icon, escapeHtml } = primitives;
  const tab = (id: string, label: string, glyph: PluginIconName, extra = "") =>
    `<button class="side-panel-tab" type="button" role="tab" id="side-tab-${escapeHtml(id)}" aria-controls="side-body-${escapeHtml(id)}" aria-selected="false" tabindex="-1" data-side-tab="${escapeHtml(id)}" title="${escapeHtml(label)}"${extra}>${icon(glyph)}<span>${escapeHtml(label)}</span></button>`;
  const body = (id: string, label: string, inner: string, extra = "") =>
    `<div class="side-panel-body" id="side-body-${escapeHtml(id)}" role="tabpanel" aria-labelledby="side-tab-${escapeHtml(id)}" aria-label="${escapeHtml(label)}" data-side-body="${escapeHtml(id)}"${extra} hidden>${inner}</div>`;
  // A plugin's side view names itself in its Manifest; the panel shows that name in the interface language.
  const plugins = pluginTabs.map(entry => ({ id: `plugin:${entry.key}`, ...entry, title: L(entry.title) }));
  const own = projectTools ? OWN_TABS.map(([id, label, glyph, order]) => ({ id, order, html: tab(id, L(label), glyph) })) : [];
  const ordered = [...own, ...plugins.map(entry => ({ id: entry.id, order: entry.order ?? 100, html: tab(entry.id, entry.title, entry.icon, ` data-side-plugin="${escapeHtml(entry.key)}"${entry.contextOwner ? ` data-side-context-owner="${escapeHtml(entry.contextOwner)}" data-side-context-surface="${escapeHtml(entry.contextSurface)}" hidden` : ""}${entry.keys ? ` data-side-keys="${escapeHtml(entry.keys)}"` : ""}`) }))]
    .sort((a, b) => a.order - b.order);
  return `<section class="side-panel" id="side-panel" role="region" aria-label="${L("侧栏")}" data-side-panel hidden>
        <header class="side-panel-head">
          <div class="side-panel-tabs" role="tablist" aria-label="${L("侧栏内容")}" data-side-tabs data-overflow-fade>
            ${ordered.map(entry => entry.html).join("")}
          </div>
          <button class="side-panel-close" type="button" data-side-close aria-label="${L("收起侧栏")}" title="${L("收起侧栏")}">${icon("x")}</button>
        </header>
        ${projectTools ? body("discussion", L("项目讨论"), `<iframe title="${L("群聊与 Thread")}"></iframe>`)
          + body("browser", L("浏览器"), renderSideBrowser(primitives), " data-side-browser")
          + body("computer", L("电脑"), renderSideComputer(primitives), " data-side-computer")
          + body("files", L("资料"), renderSideFiles(primitives), " data-side-files") : ""}
        ${plugins.map(entry => body(entry.id, entry.title, `<iframe title="${escapeHtml(entry.title)}" data-side-frame></iframe>`, ` data-side-src="${escapeHtml(entry.src)}"`)).join("")}
      </section>`;
}

export const SIDE_PANEL_STYLES = String.raw`
html body.immersive-workbench{--side-gap:8px}
html body.immersive-workbench[data-side-open=true] [data-plugin-stage]{margin-right:calc(var(--side-panel-width,35vw) + var(--side-gap) + var(--sheet-inset,14px))}
html body.immersive-workbench .side-panel{position:fixed;display:flex;flex-direction:column;inset:var(--desktop-titlebar-height,32px) var(--sheet-inset,14px) var(--dock-h,48px) auto;width:var(--side-panel-width,35vw);z-index:10;overflow:hidden;border:0;border-radius:var(--r-sheet,14px);background:var(--paper);box-shadow:var(--sheet-shadow);animation:none;opacity:0;transform:translateX(24px);transition:opacity var(--dur-move) var(--ease-quint),transform var(--dur-arrive) var(--ease-quint);pointer-events:none;container:side-panel/inline-size}
html body.immersive-workbench .side-panel[hidden]{display:none}
html body.immersive-workbench[data-side-open=true] .side-panel{opacity:1;transform:none;pointer-events:auto}
.side-panel-head{display:flex;align-items:center;gap:8px;flex:none;height:44px;padding:0 6px 0 8px;border-bottom:1px solid var(--line)}
.side-panel-tabs{display:flex;align-items:center;gap:2px;flex:1;min-width:0;overflow-x:auto}
.side-panel-tab{display:inline-flex;align-items:center;gap:6px;flex:none;height:30px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--muted);font:inherit;font-size:13px;cursor:pointer}
:is(.side-panel-tab,.side-panel-close){transition:background-color var(--dur-hover) var(--ease-quint),color var(--dur-hover) var(--ease-quint)}
.side-panel-tab[hidden]{display:none}
.side-panel-tab svg{width:15px;height:15px;flex:none}
:is(.side-panel-tab,.side-panel-close):hover{background:var(--nav-hover);color:var(--ink)}
.side-panel-tab[aria-selected=true]{background:var(--nav-active);color:var(--ink)}
.side-panel-tab:focus-visible,.side-panel-close:focus-visible{outline:2px solid var(--focus,var(--accent));outline-offset:-2px}
.side-busy-mark{display:inline-flex;flex:none;width:16px;height:16px}
.side-panel-close{display:inline-grid;place-items:center;flex:none;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:var(--muted);cursor:pointer}
.side-panel-close svg{width:16px;height:16px}
.side-panel-body{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;animation:craft-fade-in var(--dur-move) var(--ease-quint)}
.side-panel-body[hidden]{display:none}
.side-panel-body>iframe{border:0;display:block;flex:1;width:100%;min-height:0}
@container side-panel (max-width:420px){.side-panel-tab span{display:none}.side-panel-tab{padding:0 8px}}
.side-panel-divider{position:fixed;right:calc(var(--side-panel-width,35vw) + var(--sheet-inset,14px) + var(--side-gap)/2 - 6px);top:var(--desktop-titlebar-height,32px);bottom:var(--dock-h,48px);width:12px;z-index:11;cursor:col-resize;touch-action:none;border:0;padding:0;background:transparent}
.side-panel-divider:after{content:"";position:absolute;top:calc(50% - 14px);left:calc(50% - 1.5px);width:3px;height:28px;border-radius:4px;background:var(--line-strong,var(--line));opacity:0;transition:opacity var(--dur-hover) var(--ease-quint),background-color var(--dur-hover) var(--ease-quint)}
.side-panel-divider:hover:after,.side-panel-divider:focus-visible:after,body.is-side-resizing .side-panel-divider:after{opacity:1}
.side-panel-divider:hover:after,.side-panel-divider:focus-visible:after{background:var(--ink)}
.side-panel-divider:focus-visible{outline:1px solid var(--ink);outline-offset:-2px}
body:not([data-side-open=true]) .side-panel-divider{display:none}
html body.is-side-resizing :is([data-plugin-stage],.side-panel){transition:none!important}
body.is-side-resizing iframe,body.is-side-resizing [data-side-browser] canvas{pointer-events:none!important}
body.is-side-resizing{cursor:col-resize;user-select:none}
@media(max-width:760px){
 html body.immersive-workbench[data-side-open=true] [data-plugin-stage]{margin-right:8px;margin-bottom:calc(52dvh + var(--side-gap) + var(--sheet-inset,14px))}
 html body.immersive-workbench .side-panel{inset:auto 8px calc(var(--dock-h,48px) + 8px) 8px;width:auto;height:52dvh;transform:translateY(12px)}
 .side-panel-divider{display:none!important}
}
@media(prefers-reduced-motion:reduce){html body.immersive-workbench :is([data-plugin-stage],.side-panel,.side-panel-body){transition:none!important;animation:none!important}.side-panel-divider:after{transition:none!important}}
`.replace(/\n\s*/g, "");

/**
 * (Shipped without its full-line comments; they stay here in the source.)
 * Opens, sizes and switches the panel. Public, same-document interface (spec 3.1):
 * A Home tool (`data-side-plugin-open`, a tab with `data-side-keys`) is a switch: its button or chord, here or handed up
 * by a frame as `{ type: "molis:side-key", keys }`, opens it with the keyboard inside its document; pressed again from
 * inside, it closes. Tools with a chord load while the page is idle, so the first press shows a ready tool. A tab's own
 * document may report `{ type: "molis:side-status", status: "busy" | "attention" | "" }`: its tab and button carry a shared state ring.
 * `molis:side-open` { tab, view?, target?, focus? } · `molis:side-close` · `molis:side-toggle`. Same-origin frames post the same
 * `{ type: "molis:side-open", ... }`. Tab owners hear `molis:side-shown` { tab, target } when their tab shows; a plugin tab's
 * document gets the target as it is (`{ type: "molis:side-target", target }`, to that frame and this origin only), and its
 * page events in `SIDE_FORWARD_SCRIPT` reach this page (`molis:side-forward`), both through the S-30 checks.
 */
export const SIDE_PANEL_SCRIPT = String.raw`(() => {
  if(document.body.hasAttribute('data-pane-embedded'))return;
  const panel=document.querySelector('[data-side-panel]'),stage=document.querySelector('[data-plugin-stage],.arrival-stage');
  if(!panel||!stage)return;
  stage.setAttribute('data-plugin-stage','');
  document.querySelector('[data-workspace]').append(panel);
  const frame=panel.querySelector('[data-side-body="discussion"] iframe'),projectId=document.body.dataset.projectId;
  const forwarded=${SIDE_FORWARD_SCRIPT};
  const tabs=()=>[...panel.querySelectorAll('[data-side-tab]')].filter(tab=>!tab.hidden);
  const divider=document.createElement('div');divider.className='side-panel-divider';divider.tabIndex=0;
  divider.setAttribute('role','separator');divider.setAttribute('aria-orientation','vertical');divider.setAttribute('aria-label',globalThis.L('调整侧栏宽度'));divider.setAttribute('aria-controls',panel.id);
  panel.after(divider);
  const read=(key)=>{try{return localStorage.getItem(key);}catch{return null;}};
  const write=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
  let open=false,closing=null,trigger=null,ratio=.35,current=null;
  const storedRatio=Number(read('molis:side-ratio')??read('molis:discussion-ratio'));if(storedRatio>=.25&&storedRatio<=.55)ratio=storedRatio;
  const size=()=>Math.min(Math.max(innerWidth*ratio,360),innerWidth*.55);
  const paint=()=>{const width=Math.round(size());document.body.style.setProperty('--side-panel-width',width+'px');divider.setAttribute('aria-valuenow',String(width));divider.setAttribute('aria-valuemin','360');divider.setAttribute('aria-valuemax',String(Math.floor(innerWidth*.55)));if(open)panel.querySelector('[data-side-tab][aria-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});};
  const imVisible=()=>frame?.contentWindow?.postMessage({type:'molis:im-visibility',visible:open&&current==='discussion',theme:document.documentElement.dataset.resolvedTheme},location.origin);
  const known=(id)=>!!id&&tabs().some(button=>button.dataset.sideTab===id);
  const load=(body)=>{
    if(body.dataset.sideBody==='discussion'&&frame&&!frame.getAttribute('src'))frame.src='/im?embedded=1'+(projectId?'&project='+encodeURIComponent(projectId):'');
    const src=body.dataset.sideSrc,inner=body.querySelector('[data-side-frame]');
    if(src&&inner&&!inner.getAttribute('src')){inner.onload=()=>{inner.dataset.loaded='';};inner.src=src;}
  };
  const expanded=()=>document.querySelectorAll('[data-side-toggle],[data-side-plugin-open]').forEach(b=>b.setAttribute('aria-expanded',String(open&&(!b.dataset.sidePluginOpen||current==='plugin:'+b.dataset.sidePluginOpen))));
  const ready=(inner,run)=>'loaded' in inner.dataset?run():inner.addEventListener('load',run,{once:true});
  const select=(id,target)=>{
    // The tab a page falls back to on load, with the panel closed and nobody choosing it, is not remembered: on Home that is
    // a Home tool, and remembering it made a project's first open that tool instead of Shelf (side-shelf §3.1 AC-S01; QA-013).
    known(id)?write('molis:side-tab',id):id=tabs()[0]?.dataset.sideTab;
    current=id;
    for(const button of panel.querySelectorAll('[data-side-tab]')){const on=button.dataset.sideTab===id;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;}
    for(const body of panel.querySelectorAll('[data-side-body]')){const on=body.dataset.sideBody===id;body.hidden=!on;if(on&&open){load(body);const inner=target&&body.querySelector('[data-side-frame]');if(inner)ready(inner,()=>inner.contentWindow.postMessage({type:'molis:side-target',target},location.origin));}}
    expanded();imVisible();if(open)panel.querySelector('[data-side-tab][aria-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
    document.dispatchEvent(new CustomEvent('molis:side-shown',{detail:{tab:id,target:target??null,open}}));
  };
  const setOpen=(next,options={})=>{
    clearTimeout(closing);
    const was=open;open=next;
    if(open){
      if(!was)trigger=document.activeElement;
      panel.hidden=false;panel.inert=false;paint();void panel.offsetWidth;document.body.dataset.sideOpen='true';
      select(options.tab??current??read('molis:side-tab'),options.target);
      if(options.focus===true)panel.querySelector('[data-side-tab][aria-selected="true"]')?.focus({preventScroll:true});
      const inner=options.focus==='content'&&panel.querySelector('[data-side-body="'+current+'"] iframe');
      if(inner)ready(inner,()=>inner.focus());
    }else if(was){
      document.body.dataset.sideOpen='false';panel.inert=true;
      closing=setTimeout(()=>{if(!open)panel.hidden=true;},matchMedia('(prefers-reduced-motion:reduce)').matches?0:420);
      if(panel.contains(document.activeElement)){const back=trigger?.isConnected&&trigger.getClientRects().length?trigger:document.querySelector('[data-side-toggle]');back?.focus({preventScroll:true});if(panel.contains(document.activeElement))document.activeElement.blur();}
      imVisible();document.dispatchEvent(new CustomEvent('molis:side-shown',{detail:{tab:current,target:null,open:false}}));
    }
    expanded();
  };
  const request=(detail={})=>{
    const tab=detail.tab==='plugin'&&detail.view?'plugin:'+detail.view:detail.tab;
    if(tab!==undefined&&!known(tab))return false;
    setOpen(true,{tab,target:detail.target,focus:detail.focus===true});
    return true;
  };
  const summon=(id,toggle)=>known(id)&&(open&&current===id&&toggle?setOpen(false):setOpen(true,{tab:id,focus:'content'}),1);
  document.addEventListener('click',event=>{const button=event.target.closest?.('[data-side-plugin-open]');if(button)summon('plugin:'+button.dataset.sidePluginOpen,1);});
  const keyed=keys=>{const tab=[...panel.querySelectorAll('[data-side-keys]')].find(button=>button.dataset.sideKeys===keys);return tab&&summon(tab.dataset.sideTab,panel.contains(document.activeElement));};
  addEventListener('keydown',e=>{if(!e.repeat&&!e.isComposing&&keyed((e.metaKey||e.ctrlKey?'Mod+':'')+(e.shiftKey?'Shift+':'')+(e.altKey?'Alt+':'')+String(e.code).replace(/^Key/,'')))e.preventDefault();},true);
  if(!/Mac|iP/.test(navigator.platform))document.querySelectorAll('[data-side-plugin-open][title]').forEach(button=>{button.title=button.title.replace('⌘⇧','Ctrl+Shift+');});
  document.addEventListener('molis:side-open',event=>{if(request(event.detail||{}))event.preventDefault();});
  document.addEventListener('molis:side-close',()=>setOpen(false));
  document.addEventListener('molis:side-toggle',event=>open&&!(event.detail?.tab&&event.detail.tab!==current)?setOpen(false):request(event.detail||{}));
  panel.addEventListener('click',event=>{
    const target=event.target?.nodeType===1?event.target:null;if(!target)return;
    const button=target.closest('[data-side-tab]');if(button){select(button.dataset.sideTab);return;}
    if(target.closest('[data-side-close]'))setOpen(false);
  });
  panel.querySelector('[data-side-tabs]')?.addEventListener('keydown',event=>{
    const list=tabs(),at=list.findIndex(button=>button===document.activeElement);if(at<0)return;
    const next=event.key==='ArrowRight'?list[(at+1)%list.length]:event.key==='ArrowLeft'?list[(at-1+list.length)%list.length]:event.key==='Home'?list[0]:event.key==='End'?list.at(-1):null;
    if(!next)return;event.preventDefault();next.focus();select(next.dataset.sideTab);
  });
  // A dialog opened from the panel (the import dialog) closes on its own Escape; the panel stays.
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&open&&!event.target.closest?.('dialog')){event.preventDefault();setOpen(false);}});
  frame?.addEventListener('load',imVisible);
  new MutationObserver(imVisible).observe(document.documentElement,{attributes:true,attributeFilter:['data-resolved-theme']});
  addEventListener('message',async event=>{
    if(event.origin!==location.origin)return;
    if(event.data?.type==='molis:side-forward'){const made=forwarded.from(event)&&forwarded.event(event.data.name,event.data.detail);made&&window.dispatchEvent(made);return;}
    if(event.data?.type==='molis:side-open'&&event.source&&event.source!==window){request(event.data);return;}
    if(event.data?.type==='molis:side-close'&&event.source&&event.source!==window){setOpen(false);return;}
    if(event.data?.type==='molis:side-key'&&event.source!==window){keyed(event.data.keys);return;}
    if(event.data?.type==='molis:side-status'){const body=[...panel.querySelectorAll('[data-side-body]')].find(body=>body.querySelector('iframe')?.contentWindow===event.source);
      if(body)for(const mark of document.querySelectorAll('[data-side-tab="'+body.dataset.sideBody+'"],[data-side-plugin-open="'+body.dataset.sideBody.slice(7)+'"]')){let ring=mark.querySelector('.side-busy-mark');if(event.data.status){mark.dataset.sideBusy=event.data.status;if(!ring){ring=document.createElement('i');ring.className='side-busy-mark';mark.append(ring);}ring.dataset.mwState=event.data.status==='attention'?'answer':'running';}else{delete mark.dataset.sideBusy;ring?.remove();}}return;}
    if(!frame||event.source!==frame.contentWindow)return;
    if(event.data?.type==='molis:im-close')setOpen(false);
    if(event.data?.type==='molis:im-ready')imVisible();
    if(event.data?.type==='molis:im-connect'&&projectId){
      const answer=(error)=>frame.contentWindow.postMessage({type:'molis:im-connected',requestId:event.data.requestId,error},location.origin);
      try{await molisWorkRequest('/projects/'+encodeURIComponent(projectId)+'/api/im/connect',{body:{}});answer(null);}
      catch(error){answer(molisWorkRequest.text(error,L('项目连接失败')));}
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
  document.body.dataset.sideOpen='false';
  (${SIDE_CONTEXT_FACTORY})({panel,select,current:()=>current});
  select(read('molis:side-tab'));
  (window.requestIdleCallback||setTimeout)(()=>panel.querySelectorAll('[data-side-keys]').forEach(tab=>load(panel.querySelector('[data-side-body="'+tab.dataset.sideTab+'"]'))),{timeout:4000});
})();`.replace(/^[ \t]*\/\/.*\n/gm, "");

/**
 * Links that leave Molis Work open in the side panel's browser (specs/archive/side-panel, 存量接入): every plugin's
 * `target="_blank"` link and `window.open` of a web address, without each plugin knowing about the panel. The person
 * keeps the system browser with ⌘/Ctrl/Shift. Same-origin addresses, downloads, `javascript:`/`mailto:` and
 * `window.open("")` (sign-in popups a page fills itself) are left alone. Runs in the workbench, in its embedded panes
 * and in plugin side views; a frame hands the address to the panel in the window above it.
 * Molis Work's own pages never open a second browser tab (specs/artifact-positioning §4): in the workbench a new-tab
 * link or `window.open` of one opens here, as a plain click on it would.
 */
export const SIDE_LINKS_SCRIPT = String.raw`(() => {
  if(globalThis.__molisSideLinks)return;globalThis.__molisSideLinks=true;
  const external=(value)=>{try{const url=new URL(String(value),location.href);return /^https?:$/.test(url.protocol)&&url.origin!==location.origin?url.href:'';}catch{return '';}};
  const hasPanel=()=>!!document.querySelector('[data-side-panel]')&&!document.body?.hasAttribute('data-pane-embedded');
  const own=(value)=>{try{const url=new URL(String(value),location.href);return window.parent===window&&hasPanel()&&url.origin===location.origin&&!/^\/(api|assets)\//.test(url.pathname)&&!/\/api\//.test(url.pathname)?url.href:'';}catch{return '';}};
  const openHere=(href)=>{const link=document.createElement('a');link.href=href;link.hidden=true;document.body.append(link);link.click();link.remove();};
  const open=(url)=>{
    if(hasPanel()){const event=new CustomEvent('molis:side-open',{detail:{tab:'browser',target:{url}},cancelable:true});document.dispatchEvent(event);return event.defaultPrevented;}
    if(window.parent!==window){try{window.parent.postMessage({type:'molis:side-open',tab:'browser',target:{url}},location.origin);return true;}catch{return false;}}
    return false;
  };
  document.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0)return;
    const link=event.target?.nodeType===1?event.target.closest('a[href]'):null;
    if(!link||link.hasAttribute('download')||link.closest('[data-side-links=off]'))return;
    const here=link.target==='_blank'&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey?own(link.getAttribute('href')):'';
    if(here){event.preventDefault();openHere(here);return;}
    const url=external(link.getAttribute('href'));
    if(!url||(link.target!=='_blank'&&!link.closest('[data-side-links=on]')))return;
    if(event.metaKey||event.ctrlKey||event.shiftKey){
      // The system browser, on purpose. The desktop shell has its own way out; the web keeps the browser's default.
      if(globalThis.molisWorkOpenExternalUrl){event.preventDefault();void globalThis.molisWorkOpenExternalUrl(url);}
      return;
    }
    if(open(url))event.preventDefault();
  });
  const nativeOpen=window.open.bind(window);
  window.open=(value,target,features)=>{
    const url=value?external(value):'';
    if(url&&open(url))return null;
    const here=value?own(value):'';
    if(here){openHere(here);return null;}
    return nativeOpen(value,target,features);
  };
})();`.replace(/^[ \t]*\/\/.*\n/gm, "");
