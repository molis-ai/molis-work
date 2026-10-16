export function renderSyncSettings(L:(text:string)=>string):string {
  return `<section class="settings-document" data-sync-settings aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${L('同步')}</h1><p>${L('选择当前个人空间要同步的内容。关闭后保留双方已有数据。')}</p></header>
    <p data-sync-status role="status" class="settings-muted mw-loading">${L('正在读取…')}</p>
    <form data-sync-form hidden><fieldset class="settings-section" data-sync-fields></fieldset>
      <p class="settings-muted">${L('当前为本机联调，仅同步上方已勾选的内容。附件和运行任务尚未接入。')}</p>
      <div class="settings-form-actions"><button type="button" class="mw-btn mw-btn--secondary" data-sync-reload>${L('重新读取')}</button> <button type="submit" class="mw-btn mw-btn--primary">${L('保存同步配置')}</button> <button type="button" class="mw-btn mw-btn--secondary" data-sync-run>${L('立即同步')}</button></div>
    </form>
    <div data-sync-conflicts></div>
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
    const request=async(path,body,method)=>{
      const response=await fetch('/api/sync'+path,{method:method||'GET',headers:molisWorkControlHeaders(),...(body===undefined?{}:{body:JSON.stringify(body)})});
      const data=await response.json();if(!response.ok)throw new Error(L(data.error||'同步暂时不可用'));return data;
    };
    const render=(data)=>{
      state=data;form.hidden=!data.available;status.classList.remove('mw-loading');
      if(!data.available){status.textContent=L(data.reason);return;}
      fields.replaceChildren(node('legend','',L('同步内容')));
      for(const [index,item] of data.collections.entries()){
        const row=node('div','settings-setting-row'),label=node('label','mw-check-row');
        const checkbox=node('input','mw-check');checkbox.type='checkbox';checkbox.dataset.slot='checkbox';checkbox.dataset.collection=String(index);
        checkbox.checked=data.policy.selections.some(s=>namespace(s)===namespace(item.selection));
        const waiting=item.conflicts.filter(c=>c.waiting).length;
        label.append(checkbox,node('span','',L(item.title)));row.append(label,node('span','settings-muted',L('待上传')+' '+item.pending+' · '+L('冲突')+' '+(item.conflicts.length-waiting)+(waiting?' · '+L('等待关联资产')+' '+waiting:'')));fields.append(row);
      }
      status.textContent=data.running?L('正在同步…'):data.lastSuccess?L('上次连接')+' '+new Date(data.lastSuccess).toLocaleString():L('尚未开始同步');
      if(data.unavailable.length)status.textContent+=' · '+L('部分集合尚未安装对应同步适配器');
      const conflicts=root.querySelector('[data-sync-conflicts]');conflicts.replaceChildren();
      for(const collection of data.collections)for(const item of collection.conflicts){
        const row=node('section','settings-section');row.append(node('h2','',L(item.waiting?'等待关联资产':'同步冲突')),node('p','',L(item.reason)));
        const details=node('details','settings-data-disclosure');details.append(node('summary','',L('资产标识')),node('code','',item.key));row.append(details);
        if(item.waiting){
          const button=node('button','mw-btn mw-btn--secondary',L('重试同步'));button.type='button';
          button.addEventListener('click',()=>act(()=>request('/run',{},'POST')));row.append(button);conflicts.append(row);continue;
        }
        for(const [choice,label] of [['local','保留本机版本'],['remote','采用云端版本']]){
          const button=node('button','mw-btn mw-btn--secondary',L(label));button.type='button';
          button.addEventListener('click',()=>act(()=>request('/resolve',{namespace:namespace(collection.selection),key:item.key,choice},'POST')));row.append(button);
        }
        conflicts.append(row);
      }
      error.hidden=!data.error;error.textContent=data.error?L(data.error):'';
    };
    const act=async(work)=>{
      if(busy)return;busy=true;error.hidden=true;retry.hidden=true;
      root.querySelectorAll('button,input').forEach(el=>el.disabled=true);
      try{const data=await work();if(!root.isConnected)return;dirty=false;render(data);}
      catch(failure){if(root.isConnected){error.textContent=L(failure.message);error.hidden=false;retry.hidden=false;status.classList.remove('mw-loading');}}
      finally{busy=false;root.querySelectorAll('button,input').forEach(el=>el.disabled=false);}
    };
    const load=()=>{if(!dirty)void act(()=>request(''));};mounted.set(root,load);
    form.addEventListener('change',()=>dirty=true);
    form.addEventListener('submit',event=>{event.preventDefault();if(!state?.available)return;
      const selections=[...state.unavailable,...[...fields.querySelectorAll('input:checked')].map(input=>state.collections[Number(input.dataset.collection)].selection)];
      void act(()=>request('/policy',{...state.policy,selections},'PUT'));
    });
    root.querySelector('[data-sync-run]').addEventListener('click',()=>act(()=>request('/run',{},'POST')));
    root.querySelector('[data-sync-reload]').addEventListener('click',()=>{dirty=false;load();});
    retry.addEventListener('click',()=>{if(dirty)form.requestSubmit();else load();});load();
  };
  bind(document);document.addEventListener('molis-work:settings-embed',event=>bind(event.detail?.root||document));
})();`;
