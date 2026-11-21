export const SYNC_INDICATOR_SCRIPT=String.raw`
(()=>{
 if(!document.querySelector('[data-sync-indicator]'))return;
 const readText=globalThis.t.text,control=new AbortController();let timer,busy=false,available=true;
 const paint=(phase,label,detail)=>{for(const el of document.querySelectorAll('[data-sync-indicator]')){el.hidden=false;el.dataset.syncPhase=phase;el.querySelector('[data-sync-indicator-label]').textContent=readText(label);el.title=readText("workbench.sync-indicator.view-synchronization-details")+' · '+(detail||readText(label));}};
 const load=async()=>{
  clearTimeout(timer);if(busy||control.signal.aborted||document.hidden)return;busy=true;
  try{
   if(!navigator.onLine){paint('offline',"workbench.sync-indicator.offline");return;}
   const value=await molisWorkRequest('/api/sync?view=indicator',{signal:control.signal,fallback:readText("workbench.sync-indicator.sync-temporarily-unavailable")});if(control.signal.aborted||document.hidden)return;
   available=Boolean(value.available);if(!available){document.querySelectorAll('[data-sync-indicator]').forEach(el=>el.hidden=true);return;}
   const p=value.progress,tx=value.transfer;
   const state=value.running?['syncing',"workbench.sync-indicator.syncing"]:p.unavailable?['failed',"workbench.sync-indicator.sync-temporarily-unavailable"]:p.conflicts?['conflict',"workbench.sync-indicator.sync-conflict"]:p.failures||value.error?['failed',"workbench.sync-indicator.sync-not-complete"]:p.waiting?['waiting',"workbench.sync-indicator.waiting-linked-assets"]:p.pending?['pending',"workbench.sync-indicator.waiting-sync"]:p.complete?['complete',"workbench.sync-indicator.synced-last-check"]:['idle',"workbench.sync-indicator.sync-has-not-started"];
   const xfer=value.running&&tx&&tx.total>0?' '+(tx.done/1e6).toFixed(1)+'/'+(tx.total/1e6).toFixed(1)+' MB':'';
   paint(state[0],state[1],value.error||(xfer?readText("workbench.sync-indicator.syncing")+xfer:value.lastSuccess?readText("workbench.sync-indicator.last-completed")+' '+readText("common.generated.formatted",{value:{kind:"date",at:value.lastSuccess,style:"datetime-with-seconds"}}):''));
  }catch{if(!control.signal.aborted)paint(navigator.onLine?'failed':'offline',navigator.onLine?"workbench.sync-indicator.sync-temporarily-unavailable":"workbench.sync-indicator.offline");}
  finally{busy=false;clearTimeout(timer);if(!control.signal.aborted&&!document.hidden&&available)timer=setTimeout(load,2000);}
 };
 window.addEventListener('online',load,{signal:control.signal});window.addEventListener('offline',()=>paint('offline',"workbench.sync-indicator.offline"),{signal:control.signal});
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)void load();},{signal:control.signal});
 window.addEventListener('pagehide',()=>{control.abort();clearTimeout(timer);},{once:true});void load();
})();`;
