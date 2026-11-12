import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import {SYNC_COMPARISON_SCRIPT} from './settings-sync-comparison.js';
import {SYNC_PROJECT_RECYCLE_SCRIPT} from './settings-sync-projects.js';
import {SYNC_CLOUD_HISTORY_SCRIPT} from './settings-sync-history.js';

export function renderSyncSettings(_L:(text:string)=>string):string {
  return `<section class="settings-document" data-sync-settings aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${uiText("workbench.settings-sync.sync")}</h1><p>${uiText("workbench.settings-sync.choose-what-sync-personal-space-turning-sync-off")}</p></header>
    <p data-sync-identity class="settings-muted"></p>
    <p data-sync-status role="status" class="settings-muted mw-loading">${uiText("workbench.settings-sync.loading")}</p>
    <form data-sync-form hidden><div class="settings-setting-row"><label class="mw-check-row"><input type="checkbox" class="mw-check" data-slot="checkbox" data-sync-automatic><span>${uiText("workbench.settings-sync.automatic-sync-device")}</span></label><span class="settings-muted">${uiText("workbench.settings-sync.only-affects-device-sync-now-remains-available-when")}</span></div><fieldset class="settings-section" data-sync-fields></fieldset>
      <p class="settings-muted" data-sync-quota></p>
      <div class="settings-form-actions"><button type="button" class="mw-btn mw-btn--secondary" data-sync-reload>${uiText("workbench.settings-sync.reload")}</button> <button type="submit" class="mw-btn mw-btn--primary">${uiText("workbench.settings-sync.save-sync-settings")}</button> <button type="button" class="mw-btn mw-btn--secondary" data-sync-run>${uiText("workbench.settings-sync.sync-now")}</button></div>
    </form>
    <div data-sync-conflicts></div><div class="settings-form-actions" data-sync-tools hidden><button type="button" class="mw-btn mw-btn--secondary" data-sync-trash>${uiText("workbench.settings-sync.trash")}</button></div><button type="button" class="mw-btn mw-btn--secondary" data-sync-projects>${uiText("workbench.settings-sync.project-recycle-bin")}</button><div data-sync-history></div>
    <p class="settings-form-error" data-sync-error role="alert" hidden></p>
    <button type="button" class="mw-btn mw-btn--secondary" data-sync-retry hidden>${uiText("common.control.retry")}</button>
  </section>`;
}

export const SYNC_SETTINGS_CLIENT_SCRIPT=String.raw`
(()=>{
  const mounted=new WeakMap();
  const bind=(scope)=>{
    const root=scope.matches?.('[data-sync-settings]')?scope:scope.querySelector('[data-sync-settings]');
    if(!root)return;
    if(mounted.has(root)){mounted.get(root)();return;}
    const readText=globalThis.t.text;
    const form=root.querySelector('[data-sync-form]'),fields=root.querySelector('[data-sync-fields]');
    const status=root.querySelector('[data-sync-status]'),error=root.querySelector('[data-sync-error]'),retry=root.querySelector('[data-sync-retry]');
    let state=null,busy=false,dirty=false;
    const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text)el.textContent=text;return el;};
    const namespace=(s)=>JSON.stringify([s.plugin_id,s.publisher_id,s.publisher_signature,s.collection_id,s.schema_version]);
    const request=(path,body,method,base='/api/sync')=>molisWorkRequest(base+path,{method:method||'GET',headers:state?.policy?.spaceId?{'x-molis-sync-space':state.policy.spaceId}:{},...(body===undefined?{}:{body}),fallback:globalThis.t.text("workbench.settings-sync.sync-temporarily-unavailable")});
    const button=(label,run)=>{const el=node('button','mw-btn mw-btn--secondary',globalThis.t.text(label));el.type='button';el.addEventListener('click',()=>{if(!root.isConnected)return;try{Promise.resolve(run()).catch(failure=>{if(root.isConnected){error.hidden=false;error.textContent=failure.message;}});}catch(failure){error.hidden=false;error.textContent=failure.message;}});return el;};
    const sheet=(title,body,actions)=>{
      const spaceId=state?.policy?.spaceId;
      const dialog=node('dialog','mw-dialog mw-dialog--form'),shell=node('div','mw-form mw-dialog__shell'),header=node('header','mw-form__header');dialog.dataset.syncDialog='';
      header.append(node('h2','',globalThis.t.text(title)));const main=node('div','mw-form__body');main.append(body);const footer=node('footer','mw-form__footer'),problem=node('p','settings-form-error');problem.setAttribute('role','alert');problem.hidden=true;main.append(problem);
      for(const [label,run] of actions)footer.append(button(label,async()=>{footer.querySelectorAll('button').forEach(el=>el.disabled=true);try{if(state?.policy?.spaceId!==spaceId)throw new Error(globalThis.t.text("workbench.settings-sync.account-has-changed-please-reopen-view"));await run();dialog.close();}catch(error){problem.textContent=error.message;problem.hidden=false;}finally{footer.querySelectorAll('button').forEach(el=>el.disabled=false);}}));
      const cancel=node('button','mw-btn mw-btn--secondary',globalThis.t.text("common.control.cancel"));cancel.type='button';cancel.addEventListener('click',()=>dialog.close());footer.append(cancel);shell.append(header,main,footer);dialog.append(shell);document.body.append(dialog);
      const observer=new MutationObserver(()=>{if(!root.isConnected)dialog.close();});observer.observe(document.body,{childList:true,subtree:true});dialog.addEventListener('close',()=>{observer.disconnect();dialog.remove();},{once:true});dialog.showModal();cancel.focus();return dialog;
    };
    ${SYNC_COMPARISON_SCRIPT}
    const compare=async(collection,item,recovery=false)=>{
      try{
        const ns=namespace(collection.selection),spaceId=state?.policy?.spaceId,path=recovery?'/recovery?id='+encodeURIComponent(item.id):'/conflict?key='+encodeURIComponent(item.key);
        const view=await request(path+'&namespace='+encodeURIComponent(ns));if(!root.isConnected||!view||state?.policy?.spaceId!==spaceId)return;
        const body=comparison(view,collection);
        const choose=choice=>()=>act(()=>request(recovery?'/restore-recovery':'/resolve',{namespace:ns,key:item.key,id:item.id,choice,revision:view.revision,state:view.state},'POST'),false,true);
        sheet(recovery?"workbench.settings-sync.restore-retained-version":"workbench.settings-sync.compare-conflicting-versions",body,[["workbench.settings-sync.keep-local-version",choose('local')],["workbench.settings-sync.use-cloud-version",choose('remote')]]);
      }catch(failure){error.hidden=false;error.textContent=failure.message;}
    };
    ${SYNC_CLOUD_HISTORY_SCRIPT}
    ${SYNC_PROJECT_RECYCLE_SCRIPT}
    const render=(data)=>{
      if(state?.policy?.spaceId&&data.policy?.spaceId!==state.policy.spaceId)document.querySelectorAll('[data-sync-dialog]').forEach(dialog=>dialog.close());
      const identity=root.querySelector('[data-sync-identity]');identity.style.overflowWrap='anywhere';
      identity.textContent=data.available?readText("workbench.settings-sync.space-space-device-device",{space:[document.querySelector('[data-personal-name]')?.textContent?.trim(),data.policy.spaceId].filter(Boolean).join(' · '),device:data.device_label||readText("workbench.settings-sections.this-device")}):'';
      state=data;form.hidden=!data.available;status.classList.remove('mw-loading');
      root.querySelector('[data-sync-tools]').hidden=!data.available;root.querySelector('[data-sync-projects]').hidden=!data.available;
      if(!data.available){status.textContent=data.reason;root.querySelector('[data-sync-conflicts]').replaceChildren();root.querySelector('[data-sync-history]').replaceChildren();return;}
      root.querySelector('[data-sync-quota]').textContent=data.quota?globalThis.t.text("workbench.settings-sync.cloud-storage")+' '+(data.quota.usedBytes/1000000).toFixed(2)+' / '+(data.quota.limitBytes/1000000).toFixed(0)+' MB':'';
      root.querySelector('[data-sync-automatic]').checked=data.device.automatic===true;
      fields.replaceChildren(node('legend','',globalThis.t.text("workbench.settings-sync.content-sync")));
      for(const [index,item] of data.collections.entries()){
        const row=node('div','settings-setting-row'),label=node('label','mw-check-row');
        const checkbox=node('input','mw-check');checkbox.type='checkbox';checkbox.dataset.slot='checkbox';checkbox.dataset.collection=String(index);
        checkbox.checked=data.policy.selections.some(s=>namespace(s)===namespace(item.selection));
        const waiting=item.conflicts.filter(c=>c.waiting).length;
        label.append(checkbox,node('span','',item.title));row.append(label,node('span','settings-muted',globalThis.t.text("workbench.settings-sync.pending-upload")+' '+item.pending+' · '+globalThis.t.text("workbench.settings-sync.conflict")+' '+(item.conflicts.length-waiting)+(waiting?' · '+globalThis.t.text("workbench.settings-sync.waiting-linked-assets")+' '+waiting:'')));fields.append(row);
      }
      const progress=data.progress;
      status.dataset.syncComplete=String(progress.complete);
      status.textContent=data.running?globalThis.t.text("workbench.settings-sync.syncing"):!progress.selected?globalThis.t.text("workbench.settings-sync.choose-content-sync"):progress.complete?globalThis.t.text("workbench.settings-sync.selected-content-synced-last-check"):data.error||progress.conflicts||progress.waiting||progress.failures||progress.unavailable?globalThis.t.text("workbench.settings-sync.sync-not-complete"):progress.pending?globalThis.t.text("workbench.settings-sync.waiting-sync"):globalThis.t.text("workbench.settings-sync.sync-has-not-started");
      const counts=[[globalThis.t.text("workbench.settings-sync.pending-upload"),progress.pending],[globalThis.t.text("workbench.settings-sync.conflict"),progress.conflicts],[globalThis.t.text("workbench.settings-sync.waiting-linked-assets"),progress.waiting],[globalThis.t.text("workbench.settings-sync.items-needing-attention"),progress.failures],[globalThis.t.text("workbench.settings-sync.unavailable-collections"),progress.unavailable]].filter(([,count])=>count).map(([label,count])=>label+' '+count);
      if(counts.length)status.textContent+=' · '+counts.join(' · ');
      if(data.lastSuccess)status.textContent+=' · '+globalThis.t.text("workbench.settings-sync.last-completed")+' '+globalThis.t.text("common.generated.formatted", { value: { kind: "date", at: data.lastSuccess, style: "datetime-with-seconds" } });
      const conflicts=root.querySelector('[data-sync-conflicts]');conflicts.replaceChildren();
      for(const collection of data.collections)for(const item of collection.conflicts){
        const row=node('section','settings-section');row.append(node('h2','',collection.title+' · '+(item.title||readText("workbench.settings-sync.object-id",{id:String(item.key).slice(-24)}))),node('p','',item.reason));
        const details=node('details','settings-data-disclosure');details.append(node('summary','',readText("workbench.settings-sync.asset-identity")),node('code','',item.key));row.append(details);
        if(item.waiting){
          const button=node('button','mw-btn mw-btn--secondary',globalThis.t.text("workbench.settings-sync.retry-sync"));button.type='button';
          button.addEventListener('click',()=>act(()=>request('/run',{},'POST')));row.append(button);conflicts.append(row);continue;
        }
        row.append(button("workbench.settings-sync.compare-versions",()=>compare(collection,item)));
        conflicts.append(row);
      }
      for(const collection of data.collections)for(const item of collection.failures||[]){const row=node('section','settings-section');row.append(node('h2','',globalThis.t.text("workbench.settings-sync.items-needing-attention")),node('p','',item.reason),node('code','',item.key),button("workbench.settings-sync.retry-item",()=>act(()=>request('/retry-item',{namespace:namespace(collection.selection),key:item.key,direction:item.direction},'POST'))));conflicts.append(row);}
      const history=root.querySelector('[data-sync-history]');history.replaceChildren();
      const retained=node('details','settings-data-disclosure');retained.append(node('summary','',globalThis.t.text("workbench.settings-sync.retained-versions")));history.append(retained);
      for(const collection of data.collections){const entry=node('div','settings-setting-row');entry.append(node('span','',collection.title),button("workbench.settings-sync.cloud-history",()=>cloudHistory(collection)),button("workbench.settings-sync.local-history",async()=>{try{const response=await request('/recoveries?namespace='+encodeURIComponent(namespace(collection.selection)));const body=node('div','');if(!response.items.length)body.append(node('p','settings-muted',globalThis.t.text("workbench.settings-sync.no-retained-versions")));for(const item of response.items)body.append(node('p','',item.key),button("workbench.settings-sync.view-restore",()=>compare(collection,item,true)));sheet("workbench.settings-sync.local-history",body,[]);}catch(failure){error.hidden=false;error.textContent=failure.message;}}));retained.append(entry);}
      error.hidden=!data.error;error.textContent=data.error?data.error:'';
    };
    const act=async(work,deviceOnly=false,propagate=false)=>{
      if(busy){if(propagate)throw new Error(globalThis.t.text("workbench.settings-sync.syncing"));return;}busy=true;error.hidden=true;retry.hidden=true;
      root.querySelectorAll('button,input').forEach(el=>el.disabled=true);
      try{const data=await work();if(!root.isConnected)return;if(deviceOnly){state.device=data.device;root.querySelector('[data-sync-automatic]').checked=data.device.automatic===true;}else{dirty=false;render(data);}}
      catch(failure){if(root.isConnected){error.textContent=failure.message;error.hidden=false;retry.hidden=false;status.dataset.syncComplete='false';status.textContent=globalThis.t.text("workbench.settings-sync.sync-temporarily-unavailable");status.classList.remove('mw-loading');}if(propagate)throw failure;}
      finally{busy=false;root.querySelectorAll('button,input').forEach(el=>el.disabled=false);}
    };
    const load=()=>{if(!dirty)void act(()=>request(''));};mounted.set(root,load);
    form.addEventListener('change',event=>{if(event.target.matches('[data-sync-automatic]'))return;dirty=true;});
    root.querySelector('[data-sync-automatic]').addEventListener('change',event=>{
      const automatic=event.target.checked,previous=state.device.automatic===true;
      void act(async()=>{try{return await request('/device',{automatic},'PUT');}catch(error){event.target.checked=previous;throw error;}},true);
    });
    form.addEventListener('submit',event=>{event.preventDefault();if(!state?.available)return;
      const selections=[...state.unavailable,...[...fields.querySelectorAll('input:checked')].map(input=>state.collections[Number(input.dataset.collection)].selection)];
      void act(()=>request('/policy',{...state.policy,selections},'PUT'));
    });
    root.querySelector('[data-sync-run]').addEventListener('click',()=>{
      if(dirty){error.textContent=readText("workbench.settings-sync.save-before-syncing");error.hidden=false;return;}
      void act(()=>request('/run',{},'POST'));
    });
    root.querySelector('[data-sync-reload]').addEventListener('click',()=>{dirty=false;load();});
    root.querySelector('[data-sync-trash]').addEventListener('click',async()=>{
      try{
        const body=node('div',''),dialog=sheet("workbench.settings-sync.trash",body,[]);let before;
        const load=async()=>{const response=await request('/trash'+(before===undefined?'':'?before='+before));if(!dialog.isConnected)return;
          if(!response.items.length&&!body.children.length)body.append(node('p','settings-muted',globalThis.t.text("workbench.settings-sync.trash-empty")));
          for(const item of response.items){const row=node('section','settings-section');row.append(node('p','',item.key),node('p','settings-muted',globalThis.t.text("workbench.settings-sync.keep-until")+' '+globalThis.t.text("common.generated.formatted", { value: { kind: "date", at: item.expiresAt, style: "datetime-with-seconds" } })));
            row.append(button("workbench.settings-sync.restore",()=>act(()=>request('/restore-trash',{...item,operationId:crypto.randomUUID()},'POST'),false,true).then(()=>{row.remove();})),node('p','settings-muted',globalThis.t.text("workbench.settings-sync.permanent-cleanup-not-available-yet-retained-content-still")));body.append(row);}
          if(response.more){before=response.next;const more=button("workbench.settings-sync.load-more",()=>{more.remove();void load();});body.append(more);}
        };await load();
      }catch(failure){error.hidden=false;error.textContent=failure.message;}
    });
    retry.addEventListener('click',()=>{if(dirty)form.requestSubmit();else load();});load();
    const timer=setInterval(()=>{if(!root.isConnected){clearInterval(timer);return;}if(!document.hidden&&root.getClientRects().length&&!busy&&!dirty&&!root.contains(document.activeElement))load();},5000);
  };
  bind(document);document.addEventListener('molis-work:settings-embed',event=>bind(event.detail?.root||document));
})();`;
