import { withPluginWords } from "./i18n.js";
import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { SIDE_CONTEXT_FACTORY } from "./side-panel-context.js";
import { SIDE_FORWARD_SCRIPT } from "./scripts/client/pane-messages.js";
import { renderSideBrowser } from "./side-panel-browser.js";
import { renderSideComputer } from "./side-panel-computer.js";
import { renderSideFiles } from "./side-panel-files.js";
import { withSidePane } from "./tab-workspace-ops.js";
import { BACKGROUND_TASKS_STYLES } from "./styles/background-tasks.js";

/**
 * The right side of the workbench (specs/archive/side-panel; specs/product-flow-governance §4.6.2 口径 1). Host layout only:
 * which view shows, how wide, open or collapsed — and those are kept in the tab workspace's state (`state.side`, the rules
 * in tab-workspace-ops.ts `withSidePane`), not here. What a view shows belongs to its owner — the discussion to im-ui and the
 * shared server, the browser to the local browser service, files to the plugins that declare file sources, the background
 * tasks to the plugins that report them, a plugin view to that plugin.
 *
 * Its tabs are glyphs at the right end of the title bar, where they stay when the side collapses; one view shows at a time.
 * Every view keeps its own document once opened (hidden, never torn down), so switching, collapsing and closing lose no
 * draft, page or reading position. Other surfaces open it with `molis:side-open`.
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

/** Which of the side's own views a page offers: a project's tools, and the background tasks where the page reads them. */
export interface SideViews {
  readonly projectTools?: boolean;
  readonly tasks?: boolean;
}

/** The panel's own tabs, in the places they take among the plugins' (side-shelf §3.1: Shelf · 灵光 · 资料 · 浏览器 · 电脑 · 讨论; 资料 was 文件, specs/project-knowledge §8.1). */
const OWN_TABS = [["files", "项目资料", "file", 20], ["browser", "浏览器", "globe", 30], ["computer", "电脑", "system", 40], ["discussion", "讨论", "message", 50]] as const;
/** The background tasks, after them: what was the title bar's button (workbench-navigation「三个方案共用的部分」3). */
const TASKS_TAB = ["tasks", "后台任务", "activity", 60] as const;

interface SideEntry { id: string; order: number; label: string; glyph: PluginIconName; attrs: string; plugin?: SidePanelPluginTab }

function sideEntries(primitives: SidePanelPrimitives, pluginTabs: readonly SidePanelPluginTab[], views: SideViews): SideEntry[] {
  const { L, escapeHtml } = primitives;
  // A plugin's side view names itself in its Manifest; the side shows that name in the interface language.
  const plugins = pluginTabs.map(entry => ({ id: `plugin:${entry.key}`, order: entry.order ?? 100, label: withPluginWords(entry.key.split("/")[0] ?? "", () => L(entry.title)), glyph: entry.icon, plugin: entry,
    attrs: ` data-side-plugin="${escapeHtml(entry.key)}"${entry.contextOwner ? ` data-side-context-owner="${escapeHtml(entry.contextOwner)}" data-side-context-surface="${escapeHtml(entry.contextSurface)}" hidden` : ""}${entry.keys ? ` data-side-keys="${escapeHtml(entry.keys)}"` : ""}` }));
  const own = [...views.projectTools === false ? [] : OWN_TABS, ...views.tasks ? [TASKS_TAB] : []]
    .map(([id, label, glyph, order]) => ({ id, order, label: L(label), glyph, attrs: id === "tasks" ? " data-side-tasks" : "" }));
  return [...own, ...plugins].sort((a, b) => a.order - b.order);
}

/**
 * The side's tabs, for the right end of the title bar: one glyph each, its name written out beside it while it is rested on or
 * focused. The background tasks' glyph carries how many are not done.
 */
export function renderSideStrip(primitives: SidePanelPrimitives, pluginTabs: readonly SidePanelPluginTab[] = [], views: SideViews = {}): string {
  const { L, icon, escapeHtml } = primitives;
  const tab = (entry: SideEntry) => `<button class="side-panel-tab" type="button" role="tab" id="side-tab-${escapeHtml(entry.id)}" aria-controls="side-body-${escapeHtml(entry.id)}" aria-selected="false" tabindex="-1" data-side-tab="${escapeHtml(entry.id)}" aria-label="${escapeHtml(entry.label)}"${entry.attrs}><span class="side-panel-tab-label" aria-hidden="true">${escapeHtml(entry.label)}</span>${icon(entry.glyph)}${entry.id === "tasks" ? `<span class="side-tab-badge" data-background-tasks-count aria-hidden="true" hidden>0</span>` : ""}</button>`;
  return `<div class="side-strip" role="tablist" aria-label="${L("右侧")}" data-side-tabs>${sideEntries(primitives, pluginTabs, views).map(tab).join("")}</div>`;
}

export function renderSidePanel(primitives: SidePanelPrimitives, pluginTabs: readonly SidePanelPluginTab[] = [], views: SideViews = {}): string {
  const { L, escapeHtml } = primitives;
  const body = (id: string, label: string, inner: string, extra = "") =>
    `<div class="side-panel-body" id="side-body-${escapeHtml(id)}" role="tabpanel" aria-labelledby="side-tab-${escapeHtml(id)}" aria-label="${escapeHtml(label)}" data-side-body="${escapeHtml(id)}"${extra} hidden>${inner}</div>`;
  const inner: Record<string, () => string> = {
    discussion: () => body("discussion", L("项目讨论"), `<iframe title="${L("群聊与 Thread")}"></iframe>`),
    browser: () => body("browser", L("浏览器"), renderSideBrowser(primitives), " data-side-browser"),
    computer: () => body("computer", L("电脑"), renderSideComputer(primitives), " data-side-computer"),
    files: () => body("files", L("项目资料"), renderSideFiles(primitives), " data-side-files"),
    tasks: () => body("tasks", L("后台任务"), `<div class="side-tasks"><strong class="side-tasks-title">${L("后台任务")}</strong><div class="side-tasks-list" data-background-tasks-list><p class="side-tasks-empty">${L("现在没有后台任务")}</p></div></div>`),
  };
  return `<section class="side-panel" id="side-panel" role="region" aria-label="${L("右侧")}" data-side-panel hidden>
        ${sideEntries(primitives, pluginTabs, views).map(entry => entry.plugin
          ? body(entry.id, entry.label, `<iframe title="${escapeHtml(entry.label)}" data-side-frame></iframe>`, ` data-side-src="${escapeHtml(entry.plugin.src)}"`)
          : inner[entry.id]!()).join("")}
      </section>`;
}

export const SIDE_PANEL_STYLES = String.raw`
html body.immersive-workbench{--side-gap:8px}
html body.immersive-workbench[data-side-open=true] [data-plugin-stage]{margin-right:calc(var(--side-panel-width,35vw) + var(--side-gap) + var(--sheet-inset,14px))}
html body.immersive-workbench .side-panel{position:fixed;display:flex;flex-direction:column;inset:var(--desktop-titlebar-height,32px) var(--sheet-inset,14px) var(--dock-h,48px) auto;width:var(--side-panel-width,35vw);z-index:10;overflow:hidden;border:0;border-radius:var(--r-sheet,14px);background:var(--paper);box-shadow:var(--sheet-shadow);animation:none;opacity:0;transform:translateX(24px);transition:opacity var(--dur-move) var(--ease-quint),transform var(--dur-arrive) var(--ease-quint);pointer-events:none;container:side-panel/inline-size}
html body.immersive-workbench .side-panel[hidden]{display:none}
html body.immersive-workbench[data-side-open=true] .side-panel{opacity:1;transform:none;pointer-events:auto}
.side-strip{order:6;display:flex;align-items:center;justify-content:flex-end;gap:2px;flex:none;min-width:0;padding-right:calc(var(--sheet-inset,14px) - 8px)}
body[data-side-open=true] .side-strip{min-width:calc(var(--side-panel-width,35vw) + var(--sheet-inset,14px) - 8px)}
.side-panel-tab{position:relative;display:inline-flex;align-items:center;gap:6px;flex:none;height:28px;min-width:28px;padding:0 6px;border:0;border-radius:8px;background:transparent;color:var(--muted);font:inherit;font-size:13px;white-space:nowrap;cursor:pointer;transition:background-color var(--dur-hover) var(--ease-quint),color var(--dur-hover) var(--ease-quint)}
.side-panel-tab:is([hidden],[data-side-closed]){display:none}
.side-panel-tab svg{width:16px;height:16px;flex:none}
.side-panel-tab-label{display:none}
.side-panel-tab.is-grown .side-panel-tab-label{display:inline;animation:craft-fade-in var(--dur-hover) var(--ease-quint)}
.side-panel-tab:hover,.side-panel-tab.is-grown{background:var(--nav-hover);color:var(--ink)}
body[data-side-open=true] .side-panel-tab[aria-selected=true]{background:var(--nav-active);color:var(--ink)}
.side-panel-tab:focus-visible{outline:2px solid var(--focus,var(--accent));outline-offset:-2px}
.side-tab-badge{position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--action);color:var(--action-ink);font-size:11px;font-weight:var(--weight-control,500);line-height:16px;text-align:center;font-variant-numeric:tabular-nums;pointer-events:none}
.side-tab-badge[hidden]{display:none}
.side-undo-chip{order:5;flex:none;max-width:220px}
.side-undo-chip span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.side-busy-mark{display:inline-flex;flex:none;width:16px;height:16px}
.side-panel-body{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;animation:craft-fade-in var(--dur-move) var(--ease-quint)}
.side-panel-body[hidden]{display:none}
.side-panel-body>iframe{border:0;display:block;flex:1;width:100%;min-height:0}
.side-tasks{display:flex;flex-direction:column;gap:4px;flex:1;min-height:0;overflow:auto;padding:12px 8px}
.side-tasks-title{padding:4px 12px 8px;font-size:12px;font-weight:var(--weight-control,500);color:var(--muted)}
.side-tasks-empty{margin:0;padding:8px 12px;color:var(--muted);font-size:13px}
${BACKGROUND_TASKS_STYLES}
.side-panel-divider{position:fixed;right:calc(var(--side-panel-width,35vw) + var(--sheet-inset,14px) + var(--side-gap)/2 - 6px);top:var(--desktop-titlebar-height,32px);bottom:var(--dock-h,48px);width:12px;z-index:11;cursor:col-resize;touch-action:none;border:0;padding:0;background:transparent}
.side-panel-divider:after{content:"";position:absolute;top:calc(50% - 14px);left:calc(50% - 1.5px);width:3px;height:28px;border-radius:4px;background:var(--line-strong,var(--line));opacity:0;transition:opacity var(--dur-hover) var(--ease-quint),background-color var(--dur-hover) var(--ease-quint)}
.side-panel-divider:hover:after,.side-panel-divider:focus-visible:after,body.is-side-resizing .side-panel-divider:after{opacity:1}
.side-panel-divider:hover:after,.side-panel-divider:focus-visible:after{background:var(--ink)}
.side-panel-divider:focus-visible{outline:1px solid var(--ink);outline-offset:-2px}
body:not([data-side-open=true]) .side-panel-divider{display:none}
html body.is-side-resizing :is([data-plugin-stage],.side-panel){transition:none!important}
body.is-side-resizing iframe,body.is-side-resizing [data-side-browser] canvas{pointer-events:none!important}
body.is-side-resizing{cursor:col-resize;user-select:none}
@media(pointer:coarse){.side-panel-tab{height:44px;min-width:44px}}
@media(max-width:760px){
 html body.immersive-workbench[data-side-open=true] [data-plugin-stage]{margin-right:8px;margin-bottom:calc(52dvh + var(--side-gap) + var(--sheet-inset,14px))}
 html body.immersive-workbench .side-panel{inset:auto 8px calc(var(--dock-h,48px) + 8px) 8px;width:auto;height:52dvh;transform:translateY(12px)}
 body[data-side-open=true] .side-strip{min-width:0}
 .side-panel-divider{display:none!important}
}
@media(prefers-reduced-motion:reduce){html body.immersive-workbench :is([data-plugin-stage],.side-panel,.side-panel-body,.side-panel-tab,.side-panel-tab-label){transition:none!important;animation:none!important}.side-panel-divider:after{transition:none!important}}
`.replace(/\n\s*/g, "");

/**
 * (Shipped without its full-line comments; they stay here in the source.)
 * Opens, sizes and switches the right side; `ops` are the side's rules (`withSidePane`) and `getState()` the state that holds
 * `side` — the tab workspace's own on a project page, so `save` is its persist, and the page's alone where there is no tab
 * workspace (the way in). `remember(record, reopen)` hands a closed tab's way back to the workspace's list of closed things
 * (⌘⇧T / Ctrl+Shift+T reopens whichever closed last); without it the side keeps the shortcut itself.
 * Public, same-document interface (spec 3.1), as before the side joined the workspace:
 * A Home tool (`data-side-plugin-open`, a tab with `data-side-keys`) is a switch: its button or chord, here or handed up
 * by a frame as `{ type: "molis:side-key", keys }`, opens it with the keyboard inside its document; pressed again from
 * inside, it closes. ⌘\ / Ctrl+\ (also handed up as `Mod+Backslash`) collapses or opens the side. Tools with a chord load
 * while the page is idle, so the first press shows a ready tool. A tab's own document may report
 * `{ type: "molis:side-status", status: "busy" | "attention" | "" }`: its tab and button carry a shared state ring.
 * `molis:side-open` { tab, view?, target?, focus? } · `molis:side-close` · `molis:side-toggle`. Same-origin frames post the same
 * `{ type: "molis:side-open", ... }`. Tab owners hear `molis:side-shown` { tab, target } when their tab shows; a plugin tab's
 * document gets the target as it is (`{ type: "molis:side-target", target }`, to that frame and this origin only), and its
 * page events in `SIDE_FORWARD_SCRIPT` reach this page (`molis:side-forward`), both through the S-30 checks.
 * Answers `{ open(key, target), restore() }`: open (or recall) a view, and draw the side again from a state the workspace replaced.
 */
export const SIDE_PANE_FACTORY = String.raw`({ops,getState,save=()=>{},remember=null,L=globalThis.L})=>{
  const panel=document.querySelector('[data-side-panel]'),strip=document.querySelector('[data-side-tabs]'),stage=document.querySelector('[data-plugin-stage],.arrival-stage');
  if(!panel||!strip||!stage)return null;
  stage.setAttribute('data-plugin-stage','');
  document.querySelector('[data-workspace]').append(panel);
  const frame=panel.querySelector('[data-side-body="discussion"] iframe'),projectId=document.body.dataset.projectId;
  const forwarded=${SIDE_FORWARD_SCRIPT};
  const MAC=/Mac|iP/.test(navigator.platform);
  const side=()=>getState().side;
  const buttons=()=>[...strip.querySelectorAll('[data-side-tab]')];
  const views=()=>buttons().map(button=>({key:button.dataset.sideTab,plugin:(button.dataset.sidePlugin||'').split('/')[0],title:button.querySelector('.side-panel-tab-label')?.textContent||button.dataset.sideTab}));
  const tabOf=key=>side().tabs.find(tab=>tab.itemId===key);
  const offered=id=>!!id&&buttons().some(button=>button.dataset.sideTab===id&&!button.hidden);
  const tabs=()=>buttons().filter(button=>!button.hidden&&tabOf(button.dataset.sideTab));
  const current=()=>{const key=ops.sideActive(getState())?.itemId;const shown=tabs();return shown.some(button=>button.dataset.sideTab===key)?key:shown[0]?.dataset.sideTab||null;};
  const divider=document.createElement('div');divider.className='side-panel-divider';divider.tabIndex=0;
  divider.setAttribute('role','separator');divider.setAttribute('aria-orientation','vertical');divider.setAttribute('aria-label',L('调整侧栏宽度'));divider.setAttribute('aria-controls',panel.id);
  panel.after(divider);
  let open=false,closing=null,trigger=null,known=new Set();
  const size=()=>Math.min(Math.max(innerWidth*side().ratio,360),innerWidth*.55);
  const paint=()=>{const width=Math.round(size());document.body.style.setProperty('--side-panel-width',width+'px');divider.setAttribute('aria-valuenow',String(width));divider.setAttribute('aria-valuemin','360');divider.setAttribute('aria-valuemax',String(Math.floor(innerWidth*.55)));};
  const imVisible=()=>frame?.contentWindow?.postMessage({type:'molis:im-visibility',visible:open&&current()==='discussion',theme:document.documentElement.dataset.resolvedTheme},location.origin);
  const load=(body)=>{
    if(body.dataset.sideBody==='discussion'&&frame&&!frame.getAttribute('src'))frame.src='/im?embedded=1'+(projectId?'&project='+encodeURIComponent(projectId):'');
    const src=body.dataset.sideSrc,inner=body.querySelector('[data-side-frame]');
    if(src&&inner&&!inner.getAttribute('src')){inner.onload=()=>{inner.dataset.loaded='';};inner.src=src;}
  };
  const expanded=()=>document.querySelectorAll('[data-side-toggle],[data-side-plugin-open]').forEach(b=>b.setAttribute('aria-expanded',String(open&&(!b.dataset.sidePluginOpen||current()==='plugin:'+b.dataset.sidePluginOpen))));
  const ready=(inner,run)=>'loaded' in inner.dataset?run():inner.addEventListener('load',run,{once:true});
  let undo=null,undoTimer=0;
  const live=document.createElement('div');live.setAttribute('role','status');live.className='mw-sr-only';document.body.append(live);
  const undoLabel=record=>L('撤销关闭 {plugin}',{plugin:record.title});
  const drawUndo=()=>{
    document.querySelector('[data-side-undo]')?.remove();
    if(!undo||undo.until<Date.now()||tabOf(undo.record.tab.itemId)){undo=null;return;}
    const chip=document.createElement('button');chip.type='button';chip.className='mw-btn mw-btn--ghost mw-btn--sm side-undo-chip';chip.dataset.sideUndo='';
    chip.innerHTML='<svg aria-hidden="true"><use href="#icon-undo"></use></svg><span></span>';chip.querySelector('span').textContent=undoLabel(undo.record);
    chip.title=undoLabel(undo.record)+(MAC?' (⌘⇧T)':' (Ctrl+Shift+T)');
    const record=undo.record;chip.addEventListener('click',()=>reopen(record));
    strip.before(chip);
  };
  const draw=(target)=>{
    const id=current();
    for(const button of buttons()){const on=button.dataset.sideTab===id;button.toggleAttribute('data-side-closed',!tabOf(button.dataset.sideTab));button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;}
    for(const body of panel.querySelectorAll('[data-side-body]')){const on=body.dataset.sideBody===id;body.hidden=!on;if(on&&open){load(body);const inner=target&&body.querySelector('[data-side-frame]');if(inner)ready(inner,()=>inner.contentWindow.postMessage({type:'molis:side-target',target},location.origin));}}
    expanded();imVisible();drawUndo();
  };
  const choose=id=>{if(!offered(id))return;const state=getState();if(tabOf(id))ops.selectSide(state,id);else{ops.openSide(state,id,views());ops.setSideOpen(state,open);}};
  const select=(id,target)=>{
    choose(id);draw(target);
    document.dispatchEvent(new CustomEvent('molis:side-shown',{detail:{tab:current(),target:target??null,open}}));
  };
  const setOpen=(next,options={})=>{
    clearTimeout(closing);
    const was=open;open=Boolean(next)&&(tabs().length>0||offered(options.tab));
    ops.setSideOpen(getState(),open);
    if(open){
      if(!was)trigger=document.activeElement;
      panel.hidden=false;panel.inert=false;paint();void panel.offsetWidth;document.body.dataset.sideOpen='true';
      select(options.tab??current(),options.target);
      if(options.focus===true)strip.querySelector('[data-side-tab][aria-selected="true"]')?.focus({preventScroll:true});
      const inner=options.focus==='content'&&panel.querySelector('[data-side-body="'+current()+'"] iframe');
      if(inner)ready(inner,()=>inner.focus());
    }else if(was){
      document.body.dataset.sideOpen='false';panel.inert=true;
      closing=setTimeout(()=>{if(!open)panel.hidden=true;},matchMedia('(prefers-reduced-motion:reduce)').matches?0:420);
      if(panel.contains(document.activeElement)){const back=trigger?.isConnected&&trigger.getClientRects().length?trigger:strip.querySelector('[data-side-tab][aria-selected="true"]');back?.focus({preventScroll:true});if(panel.contains(document.activeElement))document.activeElement.blur();}
      imVisible();document.dispatchEvent(new CustomEvent('molis:side-shown',{detail:{tab:current(),target:null,open:false}}));
    }
    expanded();
  };
  const request=(detail={})=>{
    const tab=detail.tab==='plugin'&&detail.view?'plugin:'+detail.view:detail.tab;
    if(tab!==undefined&&!offered(tab))return false;
    setOpen(true,{tab,target:detail.target,focus:detail.focus===true});save();
    return true;
  };
  const toggle=()=>{setOpen(!open,{focus:true});save();};
  const reopen=record=>{
    if(!ops.reopenSideTab(getState(),record))return false;
    if(undo?.record===record)undo=null;
    if(record.active&&open)select(record.tab.itemId);else draw();
    save();return true;
  };
  const close=button=>{
    const tab=tabOf(button?.dataset.sideTab);if(!tab)return;
    const record=ops.closeSideTab(getState(),tab.id);if(!record)return;
    undo={record,until:Date.now()+6000};clearTimeout(undoTimer);undoTimer=setTimeout(drawUndo,6020);
    live.textContent=L('已关闭 {plugin}',{plugin:record.title})+' · '+undoLabel(record);
    remember?.(record,()=>reopen(record));
    if(open&&!side().open)setOpen(false);else if(record.active&&open)select(current());else draw();
    save();
    strip.querySelector('[data-side-tab][aria-selected="true"]:not([data-side-closed])')?.focus({preventScroll:true});
  };
  const summon=(id,toggle)=>offered(id)&&(open&&current()===id&&toggle?setOpen(false):setOpen(true,{tab:id,focus:'content'}),save(),1);
  document.addEventListener('click',event=>{const button=event.target.closest?.('[data-side-plugin-open]');if(button)summon('plugin:'+button.dataset.sidePluginOpen,1);});
  const keyed=keys=>{const tab=[...strip.querySelectorAll('[data-side-keys]')].find(button=>button.dataset.sideKeys===keys);return tab&&summon(tab.dataset.sideTab,panel.contains(document.activeElement));};
  addEventListener('keydown',e=>{
    if(e.repeat||e.isComposing)return;
    if(e.code==='Backslash'&&(MAC?e.metaKey:e.ctrlKey)&&!e.shiftKey&&!e.altKey){e.preventDefault();toggle();return;}
    if(!remember&&e.key?.toLowerCase()==='t'&&e.shiftKey&&!e.altKey&&(e.metaKey||e.ctrlKey)&&undo){e.preventDefault();reopen(undo.record);return;}
    if(keyed((e.metaKey||e.ctrlKey?'Mod+':'')+(e.shiftKey?'Shift+':'')+(e.altKey?'Alt+':'')+String(e.code).replace(/^Key/,'')))e.preventDefault();
  },true);
  if(!MAC)document.querySelectorAll('[data-side-plugin-open][title]').forEach(button=>{button.title=button.title.replace('⌘⇧','Ctrl+Shift+');});
  document.addEventListener('molis:side-open',event=>{if(request(event.detail||{}))event.preventDefault();});
  document.addEventListener('molis:side-close',()=>{setOpen(false);save();});
  document.addEventListener('molis:side-toggle',event=>{if(open&&!(event.detail?.tab&&event.detail.tab!==current())){setOpen(false);save();}else request(event.detail||{});});
  strip.addEventListener('click',event=>{
    const button=event.target?.nodeType===1?event.target.closest('[data-side-tab]'):null;if(!button)return;
    if(open)select(button.dataset.sideTab);else setOpen(true,{tab:button.dataset.sideTab});
    save();
  });
  strip.addEventListener('keydown',event=>{
    const list=tabs(),at=list.findIndex(button=>button===document.activeElement);if(at<0)return;
    if(event.key==='Delete'){event.preventDefault();close(list[at]);return;}
    if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();menuFor(list[at]);return;}
    const next=event.key==='ArrowRight'?list[(at+1)%list.length]:event.key==='ArrowLeft'?list[(at-1+list.length)%list.length]:event.key==='Home'?list[0]:event.key==='End'?list.at(-1):null;
    if(!next)return;event.preventDefault();next.focus();if(open){select(next.dataset.sideTab);save();}
  });
  let growTimer=0;
  const grow=button=>strip.querySelectorAll('[data-side-tab]').forEach(node=>node.classList.toggle('is-grown',node===button));
  strip.addEventListener('pointerover',event=>{
    const button=event.target.closest?.('[data-side-tab]');if(!button||button.classList.contains('is-grown'))return;
    clearTimeout(growTimer);growTimer=setTimeout(()=>grow(button),strip.querySelector('.is-grown')?0:140);
  });
  strip.addEventListener('pointerout',event=>{
    const button=event.target.closest?.('[data-side-tab]');if(!button||button.contains(event.relatedTarget))return;
    clearTimeout(growTimer);if(!event.relatedTarget?.closest?.('[data-side-tab]')&&!button.matches(':focus-visible'))button.classList.remove('is-grown');
  });
  strip.addEventListener('focusin',event=>{const button=event.target.closest('[data-side-tab]');grow(button?.matches(':focus-visible')?button:null);});
  strip.addEventListener('focusout',event=>{if(!strip.contains(event.relatedTarget))grow(null);});
  const menu=document.createElement('div');menu.className='mw-menu mw-menu--context side-tab-menu';menu.setAttribute('popover','manual');menu.setAttribute('role','menu');document.body.append(menu);
  let menuAnchor=null;
  const menuFor=button=>{
    menuAnchor=button;menu.replaceChildren();
    const heading=document.createElement('strong');heading.textContent=button.querySelector('.side-panel-tab-label')?.textContent||'';
    const item=document.createElement('button');item.type='button';item.className='mw-menu__item';item.setAttribute('role','menuitem');item.dataset.sideMenu='close';
    item.innerHTML='<svg aria-hidden="true"><use href="#icon-x"></use></svg><span></span>';item.querySelector('span').textContent=L('关闭标签');
    item.addEventListener('click',()=>{menu.hidePopover();close(button);});
    menu.append(heading,item);menu.showPopover();
    const box=button.getBoundingClientRect();
    menu.style.left=Math.max(8,Math.min(box.right-menu.offsetWidth,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.round(box.bottom+6)+'px';
    item.focus();
  };
  strip.addEventListener('contextmenu',event=>{const button=event.target.closest?.('[data-side-tab]');if(!button)return;event.preventDefault();menuFor(button);});
  menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();menu.hidePopover();menuAnchor?.focus({preventScroll:true});}});
  document.addEventListener('pointerdown',event=>{if(menu.matches(':popover-open')&&!menu.contains(event.target))menu.hidePopover();});
  // A dialog opened from the panel (the import dialog) closes on its own Escape; the panel stays.
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&open&&!event.target.closest?.('dialog')){event.preventDefault();setOpen(false);save();}});
  frame?.addEventListener('load',imVisible);
  new MutationObserver(imVisible).observe(document.documentElement,{attributes:true,attributeFilter:['data-resolved-theme']});
  addEventListener('message',async event=>{
    if(event.origin!==location.origin)return;
    if(event.data?.type==='molis:side-forward'){const made=forwarded.from(event)&&forwarded.event(event.data.name,event.data.detail);made&&window.dispatchEvent(made);return;}
    if(event.data?.type==='molis:side-open'&&event.source&&event.source!==window){request(event.data);return;}
    if(event.data?.type==='molis:side-close'&&event.source&&event.source!==window){setOpen(false);save();return;}
    if(event.data?.type==='molis:side-key'&&event.source!==window){
      const keys=event.data.keys;
      if(keys==='Mod+Backslash')toggle();
      else if(keys==='Mod+K'||keys==='Mod+F'){
        const source=forwarded.from(event),body=source?.closest('[data-side-body]');
        if(open&&source&&body?.dataset.sideBody===current()&&!source.closest('[hidden],[inert]')&&source.checkVisibility({checkVisibilityCSS:true}))
          window.dispatchEvent(new KeyboardEvent('keydown',{key:keys.slice(-1),metaKey:true,bubbles:true}));
      }else keyed(keys);
      return;
    }
    if(event.data?.type==='molis:side-status'){const body=[...panel.querySelectorAll('[data-side-body]')].find(body=>body.querySelector('iframe')?.contentWindow===event.source);
      if(body)for(const mark of document.querySelectorAll('[data-side-tab="'+body.dataset.sideBody+'"],[data-side-plugin-open="'+body.dataset.sideBody.slice(7)+'"]')){let ring=mark.querySelector('.side-busy-mark');if(event.data.status){mark.dataset.sideBusy=event.data.status;if(!ring){ring=document.createElement('i');ring.className='side-busy-mark';mark.append(ring);}ring.dataset.mwState=event.data.status==='attention'?'answer':'running';}else{delete mark.dataset.sideBusy;ring?.remove();}}return;}
    if(!frame||event.source!==frame.contentWindow)return;
    if(event.data?.type==='molis:im-close'){setOpen(false);save();}
    if(event.data?.type==='molis:im-ready')imVisible();
    if(event.data?.type==='molis:im-connect'&&projectId){
      const answer=(error)=>frame.contentWindow.postMessage({type:'molis:im-connected',requestId:event.data.requestId,error},location.origin);
      try{await molisWorkRequest('/projects/'+encodeURIComponent(projectId)+'/api/im/connect',{body:{}});answer(null);}
      catch(error){answer(molisWorkRequest.text(error,L('项目连接失败')));}
    }
  });
  let drag=null;
  divider.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={id:event.pointerId};divider.setPointerCapture(event.pointerId);document.body.classList.add('is-side-resizing');event.preventDefault();});
  divider.addEventListener('pointermove',event=>{if(!drag)return;ops.setSideRatio(getState(),(innerWidth-event.clientX-8)/innerWidth);paint();});
  const end=()=>{if(!drag)return;drag=null;document.body.classList.remove('is-side-resizing');save();};
  divider.addEventListener('pointerup',end);divider.addEventListener('lostpointercapture',end);divider.addEventListener('pointercancel',end);
  divider.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const [min,max]=ops.SIDE_RATIO;ops.setSideRatio(getState(),event.key==='Home'?min:event.key==='End'?max:side().ratio+(event.key==='ArrowLeft'?24:-24)/innerWidth);paint();save();});
  divider.addEventListener('dblclick',()=>{ops.setSideRatio(getState(),.35);paint();save();});
  addEventListener('resize',paint);
  document.body.dataset.sideOpen='false';
  // The views the page offers settle the side's tabs; a view it offers later (a plugin added) joins, one closed here stays closed.
  const settle=(only)=>{const list=views();ops.syncSide(getState(),list,only);known=new Set(list.map(view=>view.key));};
  settle();
  (${SIDE_CONTEXT_FACTORY})({panel,strip,select,current});
  document.addEventListener('molis-work:plugins-changed',()=>{settle(new Set(views().map(view=>view.key).filter(key=>!known.has(key))));draw();save();});
  new MutationObserver(()=>draw()).observe(strip,{subtree:true,attributes:true,attributeFilter:['hidden']});
  paint();select(current());
  (window.requestIdleCallback||setTimeout)(()=>strip.querySelectorAll('[data-side-keys]').forEach(tab=>load(panel.querySelector('[data-side-body="'+tab.dataset.sideTab+'"]'))),{timeout:4000});
  // The workspace read another state (a reload's, a reset): the side shows what that one says, without saving it again.
  const restore=()=>{settle();paint();if(side().open!==open)setOpen(side().open);else draw();};
  return {open:(key,target)=>request({tab:key,target}),restore};
}`.replace(/^[ \t]*\/\/.*\n/gm, "");

/** The side on a page without a tab workspace (the way in): the same rules and the same pane, held by the page alone. */
export const SIDE_PANEL_SCRIPT = String.raw`(() => {
  if(document.body.hasAttribute('data-pane-embedded')||document.querySelector('[data-tab-workspace]'))return;
  const ops=(${withSidePane.toString()})({create:()=>({})}),state=ops.create();
  (${SIDE_PANE_FACTORY})({ops,getState:()=>state});
})();`;

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
