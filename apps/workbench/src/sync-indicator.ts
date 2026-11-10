import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type {ImmersiveShellPrimitives} from './immersive-shell.js';
export function renderSyncIndicator({icon}:ImmersiveShellPrimitives):string{return `<a href="/settings/sync" class="sync-resident-status" data-sync-indicator aria-label="${uiText("workbench.sync-indicator.view-synchronization-details")}" title="${uiText("workbench.sync-indicator.view-synchronization-details")}" hidden>${icon('cloud')}<span data-sync-indicator-label></span></a>`;}
export const SYNC_INDICATOR_STYLES=String.raw`
.sync-resident-status{display:flex;align-items:center;gap:4px;max-width:100%;text-decoration:none;color:var(--muted);font-size:11px;min-width:0}
.sync-resident-status[hidden]{display:none}.sync-resident-status span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:8em}
.sync-resident-status[data-sync-phase="conflict"],.sync-resident-status[data-sync-phase="failed"]{color:var(--danger)}
@media(max-width:600px){.sync-resident-status span{max-width:5em}}
`;
export const SYNC_INDICATOR_SCRIPT=String.raw`
(()=>{
 if(!document.querySelector('[data-sync-indicator]'))return;
 const readText=globalThis.t.text,control=new AbortController();let timer,busy=false,available=true;
 const paint=(phase,label,detail)=>{for(const el of document.querySelectorAll('[data-sync-indicator]')){el.hidden=false;el.dataset.syncPhase=phase;el.querySelector('[data-sync-indicator-label]').textContent=globalThis.t.text(label);el.title=globalThis.t.text("workbench.sync-indicator.view-synchronization-details")+' · '+(detail||globalThis.t.text(label));}};
 const load=async()=>{
  clearTimeout(timer);if(busy||control.signal.aborted||document.hidden)return;busy=true;
  try{
   if(!navigator.onLine){paint('offline',"workbench.sync-indicator.offline");return;}
   const value=await molisWorkRequest('/api/sync',{signal:control.signal,fallback:globalThis.t.text("workbench.sync-indicator.sync-temporarily-unavailable")});if(control.signal.aborted||document.hidden)return;
   available=Boolean(value.available);if(!available){document.querySelectorAll('[data-sync-indicator]').forEach(el=>el.hidden=true);return;}
   const p=value.progress;
   const state=value.running?['syncing',"workbench.sync-indicator.syncing"]:p.unavailable?['failed',"workbench.sync-indicator.sync-temporarily-unavailable"]:p.conflicts?['conflict',"workbench.sync-indicator.sync-conflict"]:p.failures||value.error?['failed',"workbench.sync-indicator.sync-not-complete"]:p.waiting?['waiting',"workbench.sync-indicator.waiting-linked-assets"]:p.pending?['pending',"workbench.sync-indicator.waiting-sync"]:p.complete?['complete',"workbench.sync-indicator.synced-last-check"]:['idle',"workbench.sync-indicator.sync-has-not-started"];
   paint(state[0],state[1],value.error|| (value.lastSuccess?globalThis.t.text("workbench.sync-indicator.last-completed")+' '+globalThis.t.text("common.generated.formatted", { value: { kind: "date", at: value.lastSuccess, style: "datetime" } }):''));
  }catch(error){if(!control.signal.aborted)paint(navigator.onLine?'failed':'offline',navigator.onLine?"workbench.sync-indicator.sync-temporarily-unavailable":"workbench.sync-indicator.offline");}
  finally{busy=false;clearTimeout(timer);if(!control.signal.aborted&&!document.hidden&&available)timer=setTimeout(load,15000);}
 };
 window.addEventListener('online',load,{signal:control.signal});window.addEventListener('offline',()=>paint('offline',"workbench.sync-indicator.offline"),{signal:control.signal});
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)void load();},{signal:control.signal});
 window.addEventListener('pagehide',()=>{control.abort();clearTimeout(timer);},{once:true});void load();
})();`;
