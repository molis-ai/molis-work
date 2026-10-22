import type {ImmersiveShellPrimitives} from './immersive-shell.js';
export function renderSyncIndicator({L,icon}:ImmersiveShellPrimitives):string{return `<a href="/settings/sync" class="sync-resident-status" data-sync-indicator aria-label="${L('查看同步详情')}" title="${L('查看同步详情')}" hidden>${icon('cloud')}<span data-sync-indicator-label></span></a>`;}
export const SYNC_INDICATOR_STYLES=String.raw`
.sync-resident-status{display:flex;align-items:center;gap:4px;max-width:100%;text-decoration:none;color:var(--muted-foreground);font-size:11px;min-width:0}
.sync-resident-status[hidden]{display:none}.sync-resident-status span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:8em}
.sync-resident-status[data-sync-phase="conflict"],.sync-resident-status[data-sync-phase="failed"]{color:var(--destructive)}
@media(max-width:600px){.sync-resident-status span{max-width:5em}}
`;
export const SYNC_INDICATOR_SCRIPT=String.raw`
(()=>{
 if(!document.querySelector('[data-sync-indicator]'))return;
 const L=globalThis.L||((text)=>text),control=new AbortController();let timer,busy=false,available=true;
 const paint=(phase,label,detail)=>{for(const el of document.querySelectorAll('[data-sync-indicator]')){el.hidden=false;el.dataset.syncPhase=phase;el.querySelector('[data-sync-indicator-label]').textContent=L(label);el.title=L('查看同步详情')+' · '+(detail||L(label));}};
 const load=async()=>{
  clearTimeout(timer);if(busy||control.signal.aborted||document.hidden)return;busy=true;
  try{
   if(!navigator.onLine){paint('offline','离线');return;}
   const value=await molisWorkRequest('/api/sync',{signal:control.signal,fallback:L('同步暂时不可用')});if(control.signal.aborted||document.hidden)return;
   available=Boolean(value.available);if(!available){document.querySelectorAll('[data-sync-indicator]').forEach(el=>el.hidden=true);return;}
   const p=value.progress;
   const state=value.running?['syncing','正在同步…']:p.unavailable?['failed','同步暂时不可用']:p.conflicts?['conflict','同步冲突']:p.failures||value.error?['failed','同步尚未完成']:p.waiting?['waiting','等待关联资产']:p.pending?['pending','等待同步']:p.complete?['complete','上次检查已同步']:['idle','尚未开始同步'];
   paint(state[0],state[1],value.error|| (value.lastSuccess?L('上次完成')+' '+new Date(value.lastSuccess).toLocaleString():''));
  }catch(error){if(!control.signal.aborted)paint(navigator.onLine?'failed':'offline',navigator.onLine?'同步暂时不可用':'离线');}
  finally{busy=false;clearTimeout(timer);if(!control.signal.aborted&&!document.hidden&&available)timer=setTimeout(load,15000);}
 };
 window.addEventListener('online',load,{signal:control.signal});window.addEventListener('offline',()=>paint('offline','离线'),{signal:control.signal});
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)void load();},{signal:control.signal});
 window.addEventListener('pagehide',()=>{control.abort();clearTimeout(timer);},{once:true});void load();
})();`;
