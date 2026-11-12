import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SidePanelPrimitives } from "./side-panel.js";

/**
 * The browser tab of the side panel (specs/archive/side-panel P2). The page lives in the local Host's browser; this tab shows
 * its screencast and sends the person's pointer, keys and input-method text back over one socket. The address bar,
 * problems, dialogs, file choosing and downloads are all this tab's; what the assistant does on the page shows here too.
 */
export function renderSideBrowser({ icon }: SidePanelPrimitives): string {
  const tool = (action: string, label: string, glyph: Parameters<SidePanelPrimitives["icon"]>[0], extra = "") =>
    `<button class="side-browser-tool" type="button" data-browser-action="${action}" aria-label="${label}" title="${label}"${extra}>${icon(glyph)}</button>`;
  return `<div class="side-browser" data-browser>
      <form class="side-browser-bar" data-browser-bar role="toolbar" aria-label="${uiText("workbench.side-panel-browser.browser-address-navigation")}">
        ${tool("back", uiText.text("workbench.side-panel-browser.back"), "back", " disabled")}${tool("forward", uiText.text("workbench.side-panel-browser.forward"), "arrow", " disabled")}${tool("reload", uiText.text("workbench.side-panel-browser.refresh"), "refresh")}${tool("stop", uiText.text("workbench.side-panel-browser.stop-loading"), "x", " hidden")}
        <label class="side-browser-address" data-browser-address-field>
          <span class="side-browser-identity" data-browser-identity aria-hidden="true">${icon("globe")}</span>
          <span class="side-browser-lock" data-browser-lock hidden aria-hidden="true">${icon("lock")}</span>
          <input type="text" inputmode="url" data-browser-address placeholder="${uiText("workbench.side-panel-browser.enter-address-search")}" aria-label="${uiText("workbench.side-panel-browser.address")}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go">
        </label>
        ${tool("sites", uiText.text("workbench.side-panel-browser.what-assistant-may-do-sites"), "shield", ' aria-haspopup="true" aria-expanded="false"')}${tool("give", uiText.text("workbench.side-panel-browser.hand-page-assistant"), "sparkles")}
      </form>
      <div class="side-browser-sites" data-browser-sites hidden role="dialog" aria-label="${uiText("workbench.side-panel-browser.what-assistant-may-do-sites")}"></div>
      <div class="side-browser-approval" data-browser-approval hidden role="alertdialog" aria-live="assertive" aria-label="${uiText("workbench.side-panel-browser.assistant-asks-confirm")}"></div>
      <div class="side-browser-strip" data-browser-strip hidden></div>
      <div class="side-browser-view" data-browser-view role="application" aria-roledescription="${uiText("workbench.side-panel-browser.web-page")}" aria-label="${uiText("workbench.side-panel-browser.web-page")}">
        <canvas data-browser-canvas aria-hidden="true"></canvas>
        <textarea class="side-browser-keys-textarea" data-browser-keys aria-label="${uiText("workbench.side-panel-browser.type-into-page")}" autocomplete="off" autocapitalize="off" spellcheck="false" tabindex="-1"></textarea>
        <span class="side-browser-marker" data-browser-marker hidden aria-hidden="true"></span>
        <div class="side-browser-cover" data-browser-cover>
          <div class="side-browser-cover-copy" data-browser-cover-copy>
            <p class="side-browser-cover-title">${uiText("workbench.side-panel-browser.enter-address-above-start-browsing")}</p>
            <p>${uiText("workbench.side-panel-browser.sign-ins-here-separate-own-browser-site-sign")}</p>
          </div>
        </div>
        <div class="side-browser-sheet" data-browser-sheet hidden role="dialog" aria-modal="false" aria-labelledby="side-browser-sheet-title"></div>
      </div>
      <div class="side-browser-control" data-browser-control hidden role="status" aria-live="polite"></div>
      <p class="side-browser-live" data-browser-live role="status" aria-live="polite"></p>
      <input type="file" data-browser-file hidden tabindex="-1">
    </div>`;
}

export const SIDE_BROWSER_STYLES = String.raw`
.side-browser{position:relative;display:flex;flex-direction:column;flex:1;min-height:0}
.side-browser-bar{display:flex;align-items:center;gap:2px;flex:none;padding:6px 8px;border-bottom:1px solid var(--line)}
.side-browser-tool{display:inline-grid;place-items:center;flex:none;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;transition:background-color var(--dur-hover) var(--ease-quint),color var(--dur-hover) var(--ease-quint)}
.side-browser-tool svg{width:16px;height:16px}
.side-browser-tool:hover:not(:disabled){background:var(--nav-hover);color:var(--ink)}
.side-browser-tool:disabled{opacity:.4;cursor:default}
.side-browser-tool[hidden]{display:none}
.side-browser-tool:focus-visible,.side-browser-address:focus-within{outline:2px solid var(--focus,var(--accent));outline-offset:-2px}
.side-browser-address{display:flex;align-items:center;gap:6px;flex:1;min-width:0;height:32px;margin:0 4px;padding:0 10px;border-radius:8px;background:var(--wash,var(--nav-hover));color:var(--ink)}
.side-browser-address svg{width:14px;height:14px;flex:none;color:var(--muted)}
.side-browser-address [hidden]{display:none}
.side-browser-address input{flex:1;min-width:0;border:0;padding:0;background:transparent;color:inherit;font:inherit;font-size:13px;outline:none}
.side-browser-address input::placeholder{color:var(--faint,var(--muted))}
.side-browser-strip{display:flex;align-items:center;gap:8px;flex:none;padding:8px 12px;border-bottom:1px solid var(--line);font-size:12px;color:var(--ink-soft,var(--ink))}
.side-browser-strip[hidden]{display:none}
.side-browser-strip p{flex:1;min-width:0;margin:0;line-height:1.5}
.side-browser-strip[data-tone=problem]{background:color-mix(in srgb,var(--red,#b03d45) 8%,var(--paper))}
.side-browser-view{position:relative;flex:1;min-height:0;overflow:hidden;background:var(--paper);outline:none;cursor:default}
.side-browser-view:focus-within{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--accent) 40%,transparent)}
.side-browser-view canvas{position:absolute;inset:0;display:block;width:100%;height:100%}
.side-browser-keys-textarea{position:absolute;left:0;top:0;width:1px;height:1px;padding:0;border:0;opacity:0;resize:none;overflow:hidden;font-size:16px;pointer-events:none}
.side-browser-marker{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid var(--accent);background:color-mix(in srgb,var(--accent) 18%,transparent);pointer-events:none;transition:transform var(--dur-move) var(--ease-quint),opacity var(--dur-move) var(--ease-quint)}
.side-browser-marker[hidden]{display:none}
.side-browser-cover{position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:var(--paper);color:var(--muted);font-size:13px;line-height:1.7;text-align:center}
.side-browser-cover[hidden]{display:none}
.side-browser-cover-copy{max-width:340px}
.side-browser-cover-copy p{margin:0 0 8px}
.side-browser-cover-title{color:var(--ink);font-size:15px;font-weight:500}
.side-browser-cover .mw-btn{margin-top:8px}
.side-browser-sheet{position:absolute;left:12px;right:12px;top:12px;display:grid;gap:10px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--paper);box-shadow:var(--shadow-float,0 8px 24px rgb(0 0 0 / .12));font-size:13px;line-height:1.6}
.side-browser-sheet[hidden]{display:none}
.side-browser-sheet h2{margin:0;font-size:13px;font-weight:600}
.side-browser-sheet p{margin:0;overflow-wrap:anywhere;white-space:pre-wrap;max-height:40vh;overflow:auto}
.side-browser-sheet input[type=text]{height:32px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);font:inherit;font-size:13px}
.side-browser-sheet .side-browser-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.side-browser-control{display:flex;align-items:center;gap:8px;flex:none;padding:8px 12px;border-top:1px solid var(--line);font-size:12px}
.side-browser-control[hidden]{display:none}
.side-browser-control p{flex:1;min-width:0;margin:0;line-height:1.5}
.side-browser-control[data-mode=assistant]{background:color-mix(in srgb,var(--accent) 8%,var(--paper))}
.side-browser-approval,.side-browser-sites{display:grid;gap:8px;flex:none;padding:12px;border-bottom:1px solid var(--line);font-size:13px;line-height:1.6}
.side-browser-approval{background:color-mix(in srgb,var(--accent) 7%,var(--paper))}
.side-browser-approval[hidden],.side-browser-sites[hidden]{display:none}
.side-browser-approval-note{margin:0;color:var(--muted)}
.side-browser-approval h2,.side-browser-sites h2{margin:0;font-size:13px;font-weight:600}
.side-browser-approval p,.side-browser-sites p{margin:0;overflow-wrap:anywhere}
.side-browser-approval-copy{display:contents}
.side-browser-approval dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 12px;margin:0;font-size:12px}
.side-browser-approval dt{color:var(--muted)}.side-browser-approval dd{margin:0;overflow-wrap:anywhere}
.side-browser-actions-row{display:flex;flex-wrap:wrap;gap:8px}
.side-browser-sites ul{display:grid;gap:4px;margin:0;padding:0;list-style:none}
.side-browser-sites li{display:flex;align-items:center;gap:8px;font-size:12px}
.side-browser-toggle{display:flex;align-items:center;gap:8px;font-size:12px}
.side-browser-sites li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.side-browser-live{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);margin:0}
@media(min-width:601px) and (max-width:760px){
  @container side-panel (max-width:420px){
    .side-browser-approval{gap:6px;padding-block:8px}
    .side-browser-approval .side-browser-actions-row{flex-wrap:nowrap;gap:6px}
    .side-browser-approval .mw-btn{flex:1 1 0;min-width:0;padding-inline:6px;white-space:normal;overflow-wrap:anywhere;line-height:1.2;text-align:center}
    .side-browser-approval [data-browser-action=approve-site]{flex-grow:1.6}
    .side-browser-approval-copy{display:block;max-height:clamp(26px,calc(33dvh - 159px),120px);overflow:auto}
    .side-browser-approval-copy:focus-visible{outline:var(--focus-stroke);outline-offset:var(--focus-stroke-inset,-1px)}
    .side-browser-approval-copy dl{margin-block-start:4px}
    .side-browser:has(.side-browser-sites:not([hidden])){display:grid;grid-template:min-content min-content min-content minmax(0,1fr) min-content/minmax(0,1fr)}
    .side-browser>*{grid-column:1}
    .side-browser-bar{grid-row:1}
    .side-browser-approval{grid-row:2}
    .side-browser-strip{grid-row:3}
    .side-browser-view,.side-browser-sites{grid-row:4}
    .side-browser-control{grid-row:5}
    .side-browser-sites{z-index:1;align-self:start;min-height:0;max-height:100%;grid-template-columns:minmax(0,1fr);overflow:auto;background:var(--paper)}
    .side-browser-sites ul{grid-template-columns:minmax(0,1fr)}
    @media(max-height:750px){
      .side-browser-bar,.side-browser-control{padding-block:4px}
      .side-browser-control p{line-height:1.35;max-height:3lh;overflow:auto;overflow-wrap:anywhere}
      .side-browser-control .mw-btn{flex:none;max-width:52%;white-space:normal;line-height:1.25;text-align:center}
    }
  }
}
@media(prefers-reduced-motion:reduce){.side-browser-marker{transition:none}}
`;

/** Runs once per workbench document; connects the first time the browser tab shows. */
// Shipped without its full-line comments (they stay in this source).
export const SIDE_BROWSER_SCRIPT = String.raw`(() => {
  if(document.body.hasAttribute('data-pane-embedded'))return;
  const root=document.querySelector('[data-browser]'),projectId=document.body.dataset.projectId;
  if(!root||!projectId)return;
  const readText=globalThis.t.text;
  const $=(selector)=>root.querySelector(selector);
  const view=$('[data-browser-view]'),canvas=$('[data-browser-canvas]'),keys=$('[data-browser-keys]'),address=$('[data-browser-address]');
  const cover=$('[data-browser-cover]'),coverCopy=$('[data-browser-cover-copy]'),strip=$('[data-browser-strip]'),sheet=$('[data-browser-sheet]');
  const control=$('[data-browser-control]'),live=$('[data-browser-live]'),marker=$('[data-browser-marker]'),fileInput=$('[data-browser-file]');
  const esc=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const ctx=canvas.getContext('2d');
  let socket=null,ready=false,state=null,shown=false,panelOpen=false,retry=0,retryTimer=null,pending=null,drawing=false,selection='',announced='',queuedAddress='',attached=false,lastMode='person',lastWork=null,reviewTimer=null,reviewing=null,reviewMode=null,reviewRow=null,polled=false;
  const routePrefix=document.body.dataset.routePrefix||('/projects/'+encodeURIComponent(projectId));
  const approval=$('[data-browser-approval]'),sitesBox=$('[data-browser-sites]');
  const deciding=new Set();
  let fileChoice=null,sitesRender=0;
  const sendRaw=(message)=>{if(socket&&socket.readyState===1&&ready)socket.send(JSON.stringify(message));};
  const viewport=()=>{const rect=view.getBoundingClientRect();return {width:Math.max(240,Math.floor(rect.width)),height:Math.max(200,Math.floor(rect.height)),dpr:Math.min(2,Math.max(1,devicePixelRatio||1))};};
  const visible=()=>shown&&panelOpen&&document.visibilityState==='visible';
  const connect=()=>{
    if(socket)return;
    clearTimeout(retryTimer);
    socket=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/browser');
    socket.binaryType='arraybuffer';
    socket.addEventListener('open',()=>{socket.send(JSON.stringify({type:'auth',token:molisWorkRequest.token()}));});
    socket.addEventListener('message',event=>{
      if(event.data instanceof ArrayBuffer){pending=event.data;if(!drawing)draw();return;}
      let message;try{message=JSON.parse(event.data);}catch{return;}
      if(message.type==='ready'){ready=true;retry=0;attached=false;if(shown)attach();else sendRaw({type:'watch',project_id:projectId});return;}
      if(message.type==='state'){state=message.state;render();follow();return;}
      if(message.type==='copied'){selection=message.text||'';return;}
      if(message.type==='error')say(message.message,true);
    });
    socket.addEventListener('close',()=>{socket=null;ready=false;attached=false;retryTimer=setTimeout(connect,Math.min(15000,500*2**retry++));});
  };
  // Listening starts with the workbench; the browser itself starts only when the tab is first shown.
  const attach=()=>{if(attached||!ready)return;attached=true;sendRaw({type:'attach',project_id:projectId,viewport:viewport()});sendRaw({type:'visible',visible:visible()});if(queuedAddress){sendRaw({type:'navigate',input:queuedAddress});queuedAddress='';}};
  const draw=async()=>{
    drawing=true;
    while(pending){
      const bytes=pending;pending=null;
      try{
        const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
        if(canvas.width!==bitmap.width||canvas.height!==bitmap.height){canvas.width=bitmap.width;canvas.height=bitmap.height;}
        ctx.drawImage(bitmap,0,0);bitmap.close?.();
      }catch{}
    }
    drawing=false;
  };
  const say=(text,urgent)=>{if(!text||text===announced)return;announced=text;live.setAttribute('role',urgent?'alert':'status');live.textContent=text;};
  const tool=(name)=>$('[data-browser-action="'+name+'"]');
  const browserButton=(action,label,kind='secondary',scope)=>'<button class="mw-btn mw-btn--'+kind+' mw-btn--sm" type="button" data-browser-action="'+action+'"'+(scope===undefined?'':' data-scope="'+esc(scope)+'"')+'>'+esc(label)+'</button>';
  const render=()=>{
    if(!state)return;
    tool('back').disabled=!state.can_go_back;tool('forward').disabled=!state.can_go_forward;
    tool('reload').hidden=state.loading;tool('stop').hidden=!state.loading;
    tool('give').disabled=!state.url;
    if(document.activeElement!==address)address.value=state.url||'';
    $('[data-browser-lock]').hidden=!state.secure;$('[data-browser-identity]').hidden=state.secure;
    $('[data-browser-address-field]').title=state.origin?(state.secure?globalThis.t.text("workbench.side-panel-browser.secure-connection")+' · ':globalThis.t.text("workbench.side-panel-browser.connection-not-encrypted")+' · ')+state.origin:'';
    view.setAttribute('aria-label',state.title||state.origin?globalThis.t.text("workbench.side-panel-browser.web-page")+'：'+(state.title||state.origin):globalThis.t.text("workbench.side-panel-browser.web-page"));
    // What covers the page: a problem that leaves nothing to show, or the start page.
    const fault=state.problem;
    const blank=!state.url&&!state.loading;
    if(fault&&(state.status==='unavailable'||state.status==='stopped'||state.status==='crashed')){
      cover.hidden=false;
      const action=fault.code==='browser.not_found'?browserButton('retry',globalThis.t.text("common.control.retry")):fault.code==='browser.page_crashed'?browserButton('reload',globalThis.t.text("workbench.side-panel-browser.reload")):browserButton('restart',globalThis.t.text("workbench.side-panel-browser.restart-browser"));
      coverCopy.innerHTML='<p class="side-browser-cover-title">'+esc(fault.code==='browser.not_found'?globalThis.t.text("workbench.side-panel-browser.no-browser-available"):fault.code==='browser.page_crashed'?globalThis.t.text("workbench.side-panel-browser.page-crashed"):globalThis.t.text("workbench.side-panel-browser.browser-not-running"))+'</p><p>'+esc(fault.message)+'</p>'+action;
      say(fault.message,true);
    }else if(state.status==='starting'){
      cover.hidden=false;coverCopy.innerHTML='<p class="side-browser-cover-title">'+esc(globalThis.t.text("workbench.side-panel-browser.starting-browser"))+'</p>';
    }else if(blank){
      cover.hidden=false;
      coverCopy.innerHTML='<p class="side-browser-cover-title">'+esc(globalThis.t.text("workbench.side-panel-browser.enter-address-above-start-browsing"))+'</p><p>'+esc(globalThis.t.text("workbench.side-panel-browser.sign-ins-here-separate-own-browser-site-sign"))+(state.engine?'</p><p>'+esc(globalThis.t.text("workbench.side-panel-browser.using-name-computer",{name:state.engine})):'')+'</p>';
    }else cover.hidden=true;
    // The strip above the page: a page problem the page still shows behind, or the window a page opened.
    if(fault&&cover.hidden){strip.hidden=false;strip.dataset.tone='problem';strip.innerHTML='<p>'+esc(fault.message)+'</p>'+(fault.code==='browser.load_failed'?browserButton('reload',globalThis.t.text("workbench.side-panel-browser.refresh")):'');say(fault.message,true);}
    else if(state.popup_depth>0){strip.hidden=false;strip.dataset.tone='popup';strip.innerHTML='<p>'+esc(globalThis.t.text("workbench.side-panel-browser.window-page-opened-example-sign-closing-returns-original"))+'</p>'+browserButton('popup-close',globalThis.t.text("workbench.side-panel-browser.close-return"));}
    else{strip.hidden=true;strip.innerHTML='';}
    renderSheet();renderControl();
    // A page that failed to load is announced by its problem above, never as opened.
    if(state.status==='ready'&&!state.loading&&state.title&&!fault)say(globalThis.t.text("workbench.side-panel-browser.opened-title",{title:state.title}));
  };
  const renderSheet=()=>{
    const dialog=state.dialog,chooser=state.file_chooser,download=[...state.downloads].reverse().find(item=>item.state==='completed'&&!seenDownloads.has(item.id));
    if(dialog){
      const title={alert:globalThis.t.text("workbench.side-panel-browser.message-page"),confirm:globalThis.t.text("workbench.side-panel-browser.page-asks-confirm"),prompt:globalThis.t.text("workbench.side-panel-browser.page-asks-input"),beforeunload:globalThis.t.text("workbench.side-panel-browser.leave-page")}[dialog.type]||globalThis.t.text("workbench.side-panel-browser.message-page");
      sheet.innerHTML='<h2 id="side-browser-sheet-title">'+esc(title)+' · '+esc(state.origin)+'</h2><p>'+esc(dialog.message)+'</p>'+(dialog.type==='prompt'?'<input type="text" data-browser-prompt value="'+esc(dialog.default_prompt)+'" aria-label="'+esc(globalThis.t.text("workbench.side-panel-browser.input"))+'">':'')+'<div class="side-browser-actions">'+(dialog.type==='alert'?'':browserButton('dialog-cancel',globalThis.t.text("common.control.cancel")))+browserButton('dialog-accept',dialog.type==='beforeunload'?globalThis.t.text("workbench.side-panel-browser.leave"):globalThis.t.text("common.control.confirm"),'primary')+'</div>';
      sheet.dataset.kind='dialog';sheet.dataset.id=dialog.id;sheet.hidden=false;
    }else if(chooser){
      sheet.innerHTML='<h2 id="side-browser-sheet-title">'+esc(globalThis.t.text("workbench.side-panel-browser.page-asks-file"))+'</h2><p>'+esc(globalThis.t.text("workbench.side-panel-browser.files-choose-will-be-sent-origin",{origin:state.origin||globalThis.t.text("workbench.side-panel-browser.page")}))+'</p><div class="side-browser-actions">'+browserButton('file-cancel',globalThis.t.text("common.control.cancel"))+browserButton('file-pick',chooser.multiple?globalThis.t.text("workbench.side-panel-browser.choose-files"):globalThis.t.text("workbench.side-panel-browser.choose-file"),'primary')+'</div>';
      sheet.dataset.kind='file';sheet.dataset.id=chooser.id;sheet.hidden=false;fileInput.multiple=!!chooser.multiple;
    }else if(download){
      sheet.innerHTML='<h2 id="side-browser-sheet-title">'+esc(globalThis.t.text("workbench.side-panel-browser.download-finished"))+'</h2><p>'+esc(download.filename)+'</p><div class="side-browser-actions">'+browserButton('download-dismiss',globalThis.t.text("common.control.close"))+'<a class="mw-btn mw-btn--primary mw-btn--sm" data-browser-download="'+esc(download.id)+'" href="/projects/'+encodeURIComponent(projectId)+'/api/browser/downloads/'+encodeURIComponent(download.id)+'" download="'+esc(download.filename)+'">'+esc(globalThis.t.text("workbench.side-panel-browser.save-computer"))+'</a></div>';
      sheet.dataset.kind='download';sheet.dataset.id=download.id;sheet.hidden=false;
    }else{sheet.hidden=true;sheet.innerHTML='';delete sheet.dataset.kind;}
  };
  const seenDownloads=new Set();
  const renderControl=()=>{
    const mode=state.control?.mode||'person',activity=state.control?.activity;
    if(mode==='assistant'){
      control.hidden=false;control.dataset.mode=mode;
      control.innerHTML='<p><strong>'+esc(globalThis.t.text("workbench.side-panel-browser.assistant-working-here"))+'</strong> · '+esc(activity?.summary||state.origin)+'</p>'+browserButton('takeover',globalThis.t.text("workbench.side-panel-browser.take-over"));
      if(activity?.point){const scaleX=view.clientWidth/(state.viewport.width||1),scaleY=view.clientHeight/(state.viewport.height||1);marker.style.left=activity.point.x*scaleX+'px';marker.style.top=activity.point.y*scaleY+'px';marker.hidden=false;}else marker.hidden=true;
      say(activity?.summary||globalThis.t.text("workbench.side-panel-browser.assistant-working-here"));
    }else if(mode==='taken-over'){
      control.hidden=false;control.dataset.mode=mode;marker.hidden=true;
      control.innerHTML='<p>'+esc(globalThis.t.text("workbench.side-panel-browser.have-taken-over-assistant-paused"))+'</p>'+browserButton('handback',globalThis.t.text("workbench.side-panel-browser.hand-back-assistant"),'primary');
    }else{control.hidden=true;control.innerHTML='';marker.hidden=true;}
  };
  // When the Assistant starts using this project's page, the panel opens on it (once per piece of work), without focus.
  const follow=()=>{
    const mode=state.control?.mode||'person',work=state.control?.work_id||null;
    if(mode==='assistant'&&(lastMode!=='assistant'||work!==lastWork)&&!visible())document.dispatchEvent(new CustomEvent('molis:side-open',{detail:{tab:'browser'}}));
    if(mode==='assistant')lastWork=work;
    const changed=mode!==lastMode;
    lastMode=mode;
    // A step may already be waiting (the panel was reloaded, or the person took the page over): look once per change.
    if(!reviewTimer&&(mode!=='person'||changed||!reviewing&&!polled)){polled=true;void pollReviews();}
    else if(changed&&reviewRow)renderApproval(reviewRow);
  };
  const pollReviews=async()=>{
    clearTimeout(reviewTimer);reviewTimer=null;
    let rows;
    try{
      const result=await molisWorkRequest(routePrefix+'/api/agent/reviews?status=pending');
      rows=(result.reviews||[]).filter(row=>row.request?.document?.tool==='surface-act'&&(row.request.document.fields||[]).some(f=>f.label==='网站')&&(!row.receipt||row.receipt.status==='pending'));
    }catch{}
    // A failed read did not settle the visible review. Keep it available at the same polling cadence.
    if(rows)renderApproval(rows[0]||null);
    if(reviewing||state?.control?.mode==='assistant'||state?.control?.mode==='taken-over')reviewTimer=setTimeout(pollReviews,1500);
  };
  const focusBrowserTab=()=>{
    const tab=document.querySelector('[data-side-tab=browser][aria-selected=true]');
    if(visible()&&tab?.getClientRects().length)tab.focus({preventScroll:true});
  };
  const paintApprovalBusy=()=>{
    const busy=deciding.has(reviewing)?'true':null;
    for(const choice of approval.querySelectorAll('[data-browser-action]'))choice.ariaDisabled=busy;
  };
  const renderApproval=(row)=>{
    reviewRow=row;
    const focused=approval.contains(document.activeElement)?document.activeElement:null;
    if(!row){if(focused)focusBrowserTab();approval.hidden=true;approval.innerHTML='';reviewing=null;reviewMode=null;return;}
    const held=state?.control?.mode==='taken-over';
    const same=reviewing===row.request.review_id;
    if(same&&reviewMode===held)return;
    if(!same&&focused)focusBrowserTab();
    const scroll=same&&(!held||focused)?approval.querySelector('.side-browser-approval-copy').scrollTop:0;
    reviewing=row.request.review_id;reviewMode=held;
    const doc=row.request.document||{},fields=doc.fields||[],site=(fields.find(field=>field.label==='网站')||{}).value||state?.origin||'';
    // Uploads always ask; a blank page is no site to remember.
    const upload=/上传/.test(doc.summary||''),remember=!upload&&/^https?:\/\//.test(site);
    // While the person holds the page the step cannot run; after the handback the Assistant looks again first.
    const note=held?'<p class="side-browser-approval-note">'+esc(globalThis.t.text("workbench.side-panel-browser.while-hold-page-step-wont-run-after-hand"))+'</p>':'';
    const details=fields.filter(field=>field.label!=='网站').map(field=>'<dt>'+esc(field.label)+'</dt><dd>'+esc(field.value)+'</dd>').join('');
    const choices=held?'':browserButton('approve-once',globalThis.t.text("workbench.side-panel-browser.allow-once"),'primary')+(remember?browserButton('approve-site',globalThis.t.text("workbench.side-panel-browser.dont-ask-again-site"),'secondary'):'');
    approval.innerHTML='<h2 id="side-browser-approval-title">'+esc(globalThis.t.text("workbench.side-panel-browser.assistant-asks-confirm"))+'</h2>'
      +'<div class="side-browser-approval-copy" role="group" aria-labelledby="side-browser-approval-title" tabindex="0">'
      +note+'<p>'+esc(doc.summary||globalThis.t.text("workbench.side-panel-browser.assistant-wants-act-page"))+'</p><dl>'+details+'</dl></div>'
      +'<div class="side-browser-actions-row">'+choices+browserButton('reject',globalThis.t.text("workbench.side-panel-browser.dont-allow"),'ghost')+'</div>';
    approval.dataset.site=site;approval.hidden=false;
    paintApprovalBusy();
    const copy=approval.querySelector('.side-browser-approval-copy');
    copy.scrollTop=scroll;
    if(same&&focused){
      const next=focused.dataset.browserAction?tool(focused.dataset.browserAction):copy;
      (next?.getClientRects().length?next:tool('reject')).focus({preventScroll:true});
    }
    if(!visible())document.dispatchEvent(new CustomEvent('molis:side-open',{detail:{tab:'browser'}}));
    say(globalThis.t.text("workbench.side-panel-browser.assistant-asks-confirm-what",{what:doc.summary||''}),true);
  };
  const decide=async(decision,id,site)=>{
    if(!id||deciding.has(id))return;
    deciding.add(id);paintApprovalBusy();
    try{
      if(site)await setSite(site,'allow');
      await molisWorkRequest(routePrefix+'/api/agent/reviews/decide',{body:{review_id:id,decision},fallback:globalThis.t.text("workbench.side-panel-browser.answer-was-not-sent")});
      if(reviewing===id)renderApproval(null);
      void pollReviews();
    }catch(error){fail(error);}
    finally{deciding.delete(id);if(reviewing===id)paintApprovalBusy();}
  };
  const sitesUrl='/api/browser/sites';
  const renderSites=async()=>{
    const here=state?.origin||'',request=++sitesRender;
    let rows=[],enabled=true;try{rows=(await molisWorkRequest(sitesUrl)).sites||[];enabled=(await molisWorkRequest('/api/browser/assistant')).enabled!==false;}catch{}
    if(request!==sitesRender||sitesBox.hidden)return;
    const mine=rows.find(row=>row.scope===here);
    const label=(row)=>row.decision==='allow'?globalThis.t.text("workbench.side-panel-browser.may-act-without-asking"):globalThis.t.text("workbench.side-panel-browser.blocked-looking-acting");
    sitesBox.innerHTML='<h2>'+esc(globalThis.t.text("workbench.side-panel-browser.what-assistant-may-do-sites"))+'</h2>'+(here?'<p>'+esc(here)+' · '+esc(mine?label(mine):globalThis.t.text("workbench.side-panel-browser.asks-before-every-action"))+'</p><div class="side-browser-actions-row">'+(mine?.decision!=='allow'?browserButton('site-allow',globalThis.t.text("workbench.side-panel-browser.may-act-without-asking"),'secondary',here):'')+(mine?.decision!=='block'?browserButton('site-block',globalThis.t.text("workbench.side-panel-browser.block-assistant-site"),'secondary',here):'')+(mine?browserButton('site-forget',globalThis.t.text("workbench.side-panel-browser.ask-every-time-again"),'ghost',here):'')+'</div>':'<p>'+esc(globalThis.t.text("workbench.side-panel-browser.open-site-set-here"))+'</p>')
      +(rows.filter(row=>row.scope!==here).length?'<ul>'+rows.filter(row=>row.scope!==here).map(row=>'<li><span>'+esc(row.scope)+' · '+esc(label(row))+'</span><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-browser-action="site-forget" data-scope="'+esc(row.scope)+'">'+esc(globalThis.t.text("workbench.side-panel-browser.undo"))+'</button></li>').join('')+'</ul>':'')
      +'<p class="side-browser-cover-copy">'+esc(globalThis.t.text("workbench.side-panel-browser.uploading-file-always-asks-first"))+'</p>'
      +'<label class="side-browser-toggle"><input type="checkbox" data-browser-assistant'+(enabled?' checked':'')+'> '+esc(globalThis.t.text("workbench.side-panel-browser.let-assistant-use-side-panel-browser"))+'</label>';
  };
  const setSite=(scope,decision)=>molisWorkRequest(sitesUrl,{body:{scope,decision},fallback:globalThis.t.text("workbench.side-panel-browser.not-saved")});
  const post=(path,body)=>molisWorkRequest('/projects/'+encodeURIComponent(projectId)+'/api/browser/'+path,{body:body||{},fallback:globalThis.t.text("workbench.side-panel-browser.that-did-not-finish")});
  const fail=(error)=>say(molisWorkRequest.text(error),true);
  root.addEventListener('submit',event=>{event.preventDefault();sendRaw({type:'navigate',input:address.value});address.blur();focusPage();});
  address.addEventListener('focus',()=>address.select());
  address.addEventListener('keydown',event=>{if(event.key==='Escape'&&state){address.value=state.url||'';event.stopPropagation();event.preventDefault();focusPage();}});
  root.addEventListener('click',async event=>{
    // Checked by node type, not instanceof: a node first touched from a same-origin frame carries that frame's prototype.
    const target=event.target?.nodeType===1?event.target.closest('[data-browser-action],[data-browser-download]'):null;if(!target)return;
    if(target.matches('[data-browser-download]')){seenDownloads.add(target.dataset.browserDownload);setTimeout(()=>{if(state)renderSheet();},0);return;}
    const action=target.dataset.browserAction;
    if(action==='back'||action==='forward'){sendRaw({type:'history',delta:action==='back'?-1:1});return;}
    if(action==='reload'){sendRaw({type:'reload'});return;}
    if(action==='stop'){sendRaw({type:'stop'});return;}
    if(action==='retry'||action==='restart'){sendRaw({type:'restart'});return;}
    if(action==='popup-close'){sendRaw({type:'popup-close'});return;}
    if(action==='dialog-accept'||action==='dialog-cancel'){sendRaw({type:'dialog',id:sheet.dataset.id,accept:action==='dialog-accept',prompt_text:sheet.querySelector('[data-browser-prompt]')?.value});focusPage();return;}
    if(action==='file-cancel'){sendRaw({type:'file-chooser-cancel',id:sheet.dataset.id});focusPage();return;}
    if(action==='file-pick'){
      if(!state?.file_chooser||state.file_chooser.id!==sheet.dataset.id)return;
      fileChoice={id:state.file_chooser.id,origin:state.origin,url:state.url};fileInput.value='';fileInput.click();return;
    }
    if(action==='download-dismiss'){seenDownloads.add(sheet.dataset.id);renderSheet();return;}
    if(action==='give'){
      // What the person sees (their selection, or the page's readable text), with where and when it came from; the
      // Assistant offers it above the bar and the person decides what to ask (continuity.md: suggest).
      try{
        const capture=(await post('capture',{})).capture;
        const at=globalThis.t.text("common.generated.formatted", { value: { kind: "date", at: capture.captured_at, style: "datetime-with-seconds" } });
        const title=(capture.selection?globalThis.t.text("workbench.side-panel-browser.selection-page"):globalThis.t.text("workbench.side-panel-browser.web-page-2"))+' · '+(capture.title||capture.origin);
        const text=globalThis.t.text("workbench.side-panel-browser.source-url",{url:capture.url})+'\n'+globalThis.t.text("workbench.side-panel-browser.taken-side-panel-browser",{at})+(capture.truncated?'\n'+globalThis.t.text("workbench.side-panel-browser.page-long-only-its-beginning-was-taken"):'')+'\n\n'+capture.text;
        window.dispatchEvent(new CustomEvent('molis:assistant-message',{detail:{message_id:crypto.randomUUID(),purpose:'suggest',source:{surface:'browser',title:globalThis.t.text("workbench.side-panel-browser.side-panel-browser")},
          text:'',materials:[{title,text:text.slice(0,20000)}]}}));
        say(globalThis.t.text("workbench.side-panel-browser.handed-page-assistant-confirm-above-bar-put-input"));
      }catch(error){fail(error);}
      return;
    }
    if(action==='takeover'||action==='handback'){sendRaw({type:action});document.dispatchEvent(new CustomEvent('molis:side-browser-control',{detail:{action,project_id:projectId,session_id:state?.control?.work_id||null}}));if(action==='handback')say(globalThis.t.text("workbench.side-panel-browser.handed-back-assistant-looks-page-again-before-going"));return;}
    if(action==='approve-once'||action==='reject'||action==='approve-site'){
      await decide(action==='reject'?'reject':'approve',reviewing,action==='approve-site'?approval.dataset.site:undefined);return;
    }
    if(action==='sites'){const open=sitesBox.hidden;sitesBox.hidden=!open;target.setAttribute('aria-expanded',String(open));if(open)await renderSites();else sitesRender++;return;}
    if(action==='site-allow'||action==='site-block'||action==='site-forget'){try{await setSite(target.dataset.scope,action.slice(5));await renderSites();}catch(error){fail(error);}return;}
  });
  sitesBox.addEventListener('change',async event=>{
    if(event.target?.nodeType!==1||!event.target.matches('input[data-browser-assistant]'))return;
    const enabled=event.target.checked;
    try{await molisWorkRequest('/api/browser/assistant',{body:{enabled}});}catch{event.target.checked=!enabled;say(globalThis.t.text("workbench.side-panel-browser.not-saved"),true);return;}
    say(enabled?globalThis.t.text("workbench.side-panel-browser.assistant-may-use-side-panel-browser-still-asks"):globalThis.t.text("workbench.side-panel-browser.assistant-no-longer-uses-side-panel-browser"));
  });
  fileInput.addEventListener('change',async()=>{
    const files=[...fileInput.files||[]],choice=fileChoice;fileChoice=null;if(!files.length||!choice)return;
    try{
      const encoded=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,data:String(reader.result).split(',')[1]||''});reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);})));
      if(choice.id!==state?.file_chooser?.id||choice.origin!==state.origin||choice.url!==state.url)throw new Error(globalThis.t.text("workbench.side-panel-browser.files-were-not-given-page"));
      await post('upload',{chooser_id:choice.id,files:encoded});
      say(globalThis.t.text("workbench.side-panel-browser.gave-count-file-s-page",{count:files.length}));
    }catch(error){fail(error);}
    focusPage();
  });
  // Pointer and wheel, in the page's CSS pixels.
  const point=(event)=>{const rect=canvas.getBoundingClientRect(),w=state?.viewport.width||rect.width,h=state?.viewport.height||rect.height;return {x:Math.round((event.clientX-rect.left)*w/rect.width),y:Math.round((event.clientY-rect.top)*h/rect.height)};};
  const modifiers=(event)=>(event.altKey?1:0)|(event.ctrlKey?2:0)|(event.metaKey?4:0)|(event.shiftKey?8:0);
  const buttonName=(value)=>value===0?'left':value===1?'middle':value===2?'right':'none';
  let moveFrame=0,lastMove=null,down=false;
  canvas.addEventListener('pointerdown',event=>{
    if(!state||!cover.hidden)return;
    event.preventDefault();canvas.setPointerCapture(event.pointerId);down=true;focusPage(event);
    sendRaw({type:'mouse',event:'down',...point(event),button:buttonName(event.button),buttons:event.buttons,click_count:Math.max(1,event.detail||1),modifiers:modifiers(event)});
  });
  canvas.addEventListener('pointermove',event=>{
    if(!state||!cover.hidden)return;
    lastMove=event;if(moveFrame)return;
    moveFrame=requestAnimationFrame(()=>{moveFrame=0;const e=lastMove;if(!e)return;sendRaw({type:'mouse',event:'move',...point(e),button:down?buttonName(0):'none',buttons:e.buttons,click_count:0,modifiers:modifiers(e)});});
  });
  const release=(event)=>{if(!down)return;down=false;sendRaw({type:'mouse',event:'up',...point(event),button:buttonName(event.button),buttons:event.buttons,click_count:Math.max(1,event.detail||1),modifiers:modifiers(event)});sendRaw({type:'copy'});};
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  view.addEventListener('wheel',event=>{if(!state||!cover.hidden)return;event.preventDefault();const scale=event.deltaMode===1?16:event.deltaMode===2?view.clientHeight:1;sendRaw({type:'mouse',event:'wheel',...point(event),button:'none',buttons:0,click_count:0,modifiers:modifiers(event),delta_x:event.deltaX*scale,delta_y:event.deltaY*scale});},{passive:false});
  // Keys and input methods go through a hidden field that stays focused while the person types into the page.
  const focusPage=(event)=>{if(event){const rect=view.getBoundingClientRect();keys.style.left=Math.max(0,event.clientX-rect.left)+'px';keys.style.top=Math.max(0,event.clientY-rect.top)+'px';}keys.focus({preventScroll:true});};
  const forwardKey=(event,type)=>{
    const text=type==='down'&&event.key.length===1?event.key:type==='down'&&event.key==='Enter'?'\r':undefined;
    sendRaw({type:'key',event:type,key:event.key,code:event.code,key_code:event.keyCode||0,text,modifiers:modifiers(event)});
  };
  let composing=false;
  keys.addEventListener('keydown',event=>{
    if(composing||event.isComposing||event.keyCode===229)return;
    // Shift+Escape hands the keyboard back to the panel; plain Escape belongs to the page, like every other key.
    if(event.key==='Escape'&&event.shiftKey){event.preventDefault();event.stopPropagation();$('[data-browser-action="reload"]')?.focus();return;}
    const mod=event.metaKey||event.ctrlKey;
    if(mod&&(event.key==='v'||event.key==='V'))return; // the paste event below carries the text
    if(mod&&(event.key==='c'||event.key==='C'||event.key==='x'||event.key==='X')){forwardKey(event,'down');return;} // the copy event below fills the clipboard
    event.preventDefault();event.stopPropagation();forwardKey(event,'down');
  });
  keys.addEventListener('keyup',event=>{if(composing||event.isComposing)return;event.preventDefault();forwardKey(event,'up');if(event.shiftKey||event.key.startsWith('Arrow'))sendRaw({type:'copy'});});
  keys.addEventListener('compositionstart',()=>{composing=true;});
  keys.addEventListener('compositionupdate',event=>sendRaw({type:'compose',text:event.data||''}));
  keys.addEventListener('compositionend',event=>{composing=false;sendRaw({type:'compose',text:''});if(event.data)sendRaw({type:'text',text:event.data});keys.value='';});
  keys.addEventListener('input',event=>{if(composing||event.isComposing)return;if(keys.value){sendRaw({type:'text',text:keys.value});keys.value='';}});
  keys.addEventListener('paste',event=>{event.preventDefault();const text=event.clipboardData?.getData('text/plain');if(text)sendRaw({type:'text',text});});
  keys.addEventListener('copy',event=>{event.preventDefault();event.clipboardData?.setData('text/plain',selection);});
  keys.addEventListener('cut',event=>{event.preventDefault();event.clipboardData?.setData('text/plain',selection);});
  // Size and visibility follow the panel.
  let resizeTimer=null;
  new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(ready&&view.clientWidth)sendRaw({type:'resize',viewport:viewport()});if(state)renderControl();},120);}).observe(view);
  const syncVisible=()=>sendRaw({type:'visible',visible:visible()});
  document.addEventListener('visibilitychange',syncVisible);
  connect();
  document.addEventListener('molis:side-shown',event=>{
    panelOpen=event.detail?.open!==false;
    const now=event.detail?.tab==='browser'&&panelOpen;
    if(now&&!shown){shown=true;connect();attach();}else shown=now&&shown;
    if(now&&event.detail?.target?.url){if(ready)sendRaw({type:'navigate',input:event.detail.target.url});else queuedAddress=event.detail.target.url;}
    syncVisible();
  });
})();`.replace(/^[ \t]*\/\/.*\n/gm, "");
