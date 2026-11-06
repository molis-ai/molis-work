import {SYNC_COMPARISON_SCRIPT} from './settings-sync-comparison.js';
import {SYNC_PROJECT_RECYCLE_SCRIPT} from './settings-sync-projects.js';
import {SYNC_CLOUD_HISTORY_SCRIPT} from './settings-sync-history.js';

export function renderSyncSettings(L:(text:string)=>string):string {
  return `<section class="settings-document" data-sync-settings aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${L('同步')}</h1><p>${L('选择当前个人空间要同步的内容。关闭后保留双方已有数据。')}</p></header>
    <p data-sync-status role="status" class="settings-muted mw-loading">${L('正在读取…')}</p>
    <form data-sync-form hidden><div class="settings-setting-row"><label class="mw-check-row"><input type="checkbox" class="mw-check" data-slot="checkbox" data-sync-automatic><span>${L('本机自动同步')}</span></label><span class="settings-muted">${L('仅影响本机，关闭后仍可立即同步。')}</span></div><fieldset class="settings-section" data-sync-fields></fieldset>
      <p class="settings-muted" data-sync-quota></p>
      <div class="settings-form-actions"><button type="button" class="mw-btn mw-btn--secondary" data-sync-reload>${L('重新读取')}</button> <button type="submit" class="mw-btn mw-btn--primary">${L('保存同步配置')}</button> <button type="button" class="mw-btn mw-btn--secondary" data-sync-run>${L('立即同步')}</button></div>
    </form>
    <div data-sync-conflicts></div><div class="settings-form-actions" data-sync-tools hidden><button type="button" class="mw-btn mw-btn--secondary" data-sync-trash>${L('回收站')}</button></div><button type="button" class="mw-btn mw-btn--secondary" data-sync-projects>${L('项目回收')}</button><div data-sync-history></div>
    <p class="settings-form-error" data-sync-error role="alert" hidden></p>
    <button type="button" class="mw-btn mw-btn--secondary" data-sync-retry hidden>${L('重试')}</button>
  </section>`;
}

export const SYNC_SETTINGS_CLIENT_SCRIPT=String.raw`
(()=>{
  const mounted=new WeakMap();
  const bind=(scope)=>{
    const root=scope.matches?.('[data-sync-settings]')?scope:scope.querySelector('[data-sync-settings]');
    if(!root)return;
    if(mounted.has(root)){mounted.get(root)();return;}
    const L=globalThis.L||((text)=>text);
    const form=root.querySelector('[data-sync-form]'),fields=root.querySelector('[data-sync-fields]');
    const status=root.querySelector('[data-sync-status]'),error=root.querySelector('[data-sync-error]'),retry=root.querySelector('[data-sync-retry]');
    let state=null,busy=false,dirty=false;
    const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text)el.textContent=text;return el;};
    const namespace=(s)=>JSON.stringify([s.plugin_id,s.publisher_id,s.publisher_signature,s.collection_id,s.schema_version]);
    const request=(path,body,method,base='/api/sync')=>molisWorkRequest(base+path,{method:method||'GET',headers:state?.policy?.spaceId?{'x-molis-sync-space':state.policy.spaceId}:{},...(body===undefined?{}:{body}),fallback:L('同步暂时不可用')});
    const button=(label,run)=>{const el=node('button','mw-btn mw-btn--secondary',L(label));el.type='button';el.addEventListener('click',()=>{if(!root.isConnected)return;try{Promise.resolve(run()).catch(failure=>{if(root.isConnected){error.hidden=false;error.textContent=L(failure.message);}});}catch(failure){error.hidden=false;error.textContent=L(failure.message);}});return el;};
    const sheet=(title,body,actions)=>{
      const spaceId=state?.policy?.spaceId;
      const dialog=node('dialog','mw-dialog mw-dialog--form'),shell=node('div','mw-form mw-dialog__shell'),header=node('header','mw-form__header');dialog.dataset.syncDialog='';
      header.append(node('h2','',L(title)));const main=node('div','mw-form__body');main.append(body);const footer=node('footer','mw-form__footer'),problem=node('p','settings-form-error');problem.setAttribute('role','alert');problem.hidden=true;main.append(problem);
      for(const [label,run] of actions)footer.append(button(label,async()=>{footer.querySelectorAll('button').forEach(el=>el.disabled=true);try{if(state?.policy?.spaceId!==spaceId)throw new Error(L('当前账号已变化，请重新打开'));await run();dialog.close();}catch(error){problem.textContent=L(error.message);problem.hidden=false;}finally{footer.querySelectorAll('button').forEach(el=>el.disabled=false);}}));
      const cancel=node('button','mw-btn mw-btn--secondary',L('取消'));cancel.type='button';cancel.addEventListener('click',()=>dialog.close());footer.append(cancel);shell.append(header,main,footer);dialog.append(shell);document.body.append(dialog);
      const observer=new MutationObserver(()=>{if(!root.isConnected)dialog.close();});observer.observe(document.body,{childList:true,subtree:true});dialog.addEventListener('close',()=>{observer.disconnect();dialog.remove();},{once:true});dialog.showModal();cancel.focus();return dialog;
    };
    ${SYNC_COMPARISON_SCRIPT}
    const compare=async(collection,item,recovery=false)=>{
      try{
        const ns=namespace(collection.selection),spaceId=state?.policy?.spaceId,path=recovery?'/recovery?id='+encodeURIComponent(item.id):'/conflict?key='+encodeURIComponent(item.key);
        const view=await request(path+'&namespace='+encodeURIComponent(ns));if(!root.isConnected||!view||state?.policy?.spaceId!==spaceId)return;
        const body=comparison(view,collection);
        const choose=choice=>()=>act(()=>request(recovery?'/restore-recovery':'/resolve',{namespace:ns,key:item.key,id:item.id,choice,revision:view.revision,state:view.state},'POST'),false,true);
        sheet(recovery?'恢复保留版本':'对比冲突版本',body,[['保留本机版本',choose('local')],['采用云端版本',choose('remote')]]);
      }catch(failure){error.hidden=false;error.textContent=L(failure.message);}
    };
    ${SYNC_CLOUD_HISTORY_SCRIPT}
    ${SYNC_PROJECT_RECYCLE_SCRIPT}
    const render=(data)=>{
      if(state?.policy?.spaceId&&data.policy?.spaceId!==state.policy.spaceId)document.querySelectorAll('[data-sync-dialog]').forEach(dialog=>dialog.close());
      state=data;form.hidden=!data.available;status.classList.remove('mw-loading');
      root.querySelector('[data-sync-tools]').hidden=!data.available;root.querySelector('[data-sync-projects]').hidden=!data.available;
      if(!data.available){status.textContent=L(data.reason);root.querySelector('[data-sync-conflicts]').replaceChildren();root.querySelector('[data-sync-history]').replaceChildren();return;}
      root.querySelector('[data-sync-quota]').textContent=data.quota?L('云端容量')+' '+(data.quota.usedBytes/1000000).toFixed(2)+' / '+(data.quota.limitBytes/1000000).toFixed(0)+' MB':'';
      root.querySelector('[data-sync-automatic]').checked=data.device.automatic===true;
      fields.replaceChildren(node('legend','',L('同步内容')));
      for(const [index,item] of data.collections.entries()){
        const row=node('div','settings-setting-row'),label=node('label','mw-check-row');
        const checkbox=node('input','mw-check');checkbox.type='checkbox';checkbox.dataset.slot='checkbox';checkbox.dataset.collection=String(index);
        checkbox.checked=data.policy.selections.some(s=>namespace(s)===namespace(item.selection));
        const waiting=item.conflicts.filter(c=>c.waiting).length;
        label.append(checkbox,node('span','',L(item.title)));row.append(label,node('span','settings-muted',L('待上传')+' '+item.pending+' · '+L('冲突')+' '+(item.conflicts.length-waiting)+(waiting?' · '+L('等待关联资产')+' '+waiting:'')));fields.append(row);
      }
      const progress=data.progress;
      status.dataset.syncComplete=String(progress.complete);
      status.textContent=data.running?L('正在同步…'):!progress.selected?L('请选择同步内容'):progress.complete?L('所选内容已同步至上次检查'):data.error||progress.conflicts||progress.waiting||progress.failures||progress.unavailable?L('同步尚未完成'):progress.pending?L('等待同步'):L('尚未开始同步');
      const counts=[[L('待上传'),progress.pending],[L('冲突'),progress.conflicts],[L('等待关联资产'),progress.waiting],[L('需要处理的资产'),progress.failures],[L('不可用集合'),progress.unavailable]].filter(([,count])=>count).map(([label,count])=>label+' '+count);
      if(counts.length)status.textContent+=' · '+counts.join(' · ');
      if(data.lastSuccess)status.textContent+=' · '+L('上次完成')+' '+new Date(data.lastSuccess).toLocaleString();
      const conflicts=root.querySelector('[data-sync-conflicts]');conflicts.replaceChildren();
      for(const collection of data.collections)for(const item of collection.conflicts){
        const row=node('section','settings-section');row.append(node('h2','',L(item.waiting?'等待关联资产':'同步冲突')),node('p','',L(item.reason)));
        const details=node('details','settings-data-disclosure');details.append(node('summary','',L('资产标识')),node('code','',item.key));row.append(details);
        if(item.waiting){
          const button=node('button','mw-btn mw-btn--secondary',L('重试同步'));button.type='button';
          button.addEventListener('click',()=>act(()=>request('/run',{},'POST')));row.append(button);conflicts.append(row);continue;
        }
        row.append(button('对比版本',()=>compare(collection,item)));
        conflicts.append(row);
      }
      for(const collection of data.collections)for(const item of collection.failures||[]){const row=node('section','settings-section');row.append(node('h2','',L('需要处理的资产')),node('p','',L(item.reason)),node('code','',item.key),button('重试这一项',()=>act(()=>request('/retry-item',{namespace:namespace(collection.selection),key:item.key,direction:item.direction},'POST'))));conflicts.append(row);}
      const history=root.querySelector('[data-sync-history]');history.replaceChildren();
      const retained=node('details','settings-data-disclosure');retained.append(node('summary','',L('保留版本')));history.append(retained);
      for(const collection of data.collections){const entry=node('div','settings-setting-row');entry.append(node('span','',L(collection.title)),button('云端保留版本',()=>cloudHistory(collection)),button('本机保留版本',async()=>{try{const response=await request('/recoveries?namespace='+encodeURIComponent(namespace(collection.selection)));const body=node('div','');if(!response.items.length)body.append(node('p','settings-muted',L('暂无保留版本')));for(const item of response.items)body.append(node('p','',item.key),button('查看并恢复',()=>compare(collection,item,true)));sheet('本机保留版本',body,[]);}catch(failure){error.hidden=false;error.textContent=L(failure.message);}}));retained.append(entry);}
      error.hidden=!data.error;error.textContent=data.error?L(data.error):'';
    };
    const act=async(work,deviceOnly=false,propagate=false)=>{
      if(busy){if(propagate)throw new Error(L('正在同步…'));return;}busy=true;error.hidden=true;retry.hidden=true;
      root.querySelectorAll('button,input').forEach(el=>el.disabled=true);
      try{const data=await work();if(!root.isConnected)return;if(deviceOnly){state.device=data.device;root.querySelector('[data-sync-automatic]').checked=data.device.automatic===true;}else{dirty=false;render(data);}}
      catch(failure){if(root.isConnected){error.textContent=L(failure.message);error.hidden=false;retry.hidden=false;status.dataset.syncComplete='false';status.textContent=L('同步暂时不可用');status.classList.remove('mw-loading');}if(propagate)throw failure;}
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
    root.querySelector('[data-sync-run]').addEventListener('click',()=>act(()=>request('/run',{},'POST')));
    root.querySelector('[data-sync-reload]').addEventListener('click',()=>{dirty=false;load();});
    root.querySelector('[data-sync-trash]').addEventListener('click',async()=>{
      try{
        const body=node('div',''),dialog=sheet('回收站',body,[]);let before;
        const load=async()=>{const response=await request('/trash'+(before===undefined?'':'?before='+before));if(!dialog.isConnected)return;
          if(!response.items.length&&!body.children.length)body.append(node('p','settings-muted',L('回收站为空')));
          for(const item of response.items){const row=node('section','settings-section');row.append(node('p','',item.key),node('p','settings-muted',L('保留至')+' '+new Date(item.expiresAt).toLocaleString()));
            row.append(button('恢复',()=>act(()=>request('/restore-trash',{...item,operationId:crypto.randomUUID()},'POST'),false,true).then(()=>{row.remove();})),node('p','settings-muted',L('永久清理暂未开放，保留内容仍计入云端容量。')));body.append(row);}
          if(response.more){before=response.next;const more=button('加载更多',()=>{more.remove();void load();});body.append(more);}
        };await load();
      }catch(failure){error.hidden=false;error.textContent=L(failure.message);}
    });
    retry.addEventListener('click',()=>{if(dirty)form.requestSubmit();else load();});load();
    const timer=setInterval(()=>{if(!root.isConnected){clearInterval(timer);return;}if(!document.hidden&&root.getClientRects().length&&!busy&&!dirty&&!root.contains(document.activeElement))load();},5000);
  };
  bind(document);document.addEventListener('molis-work:settings-embed',event=>bind(event.detail?.root||document));
})();`;
