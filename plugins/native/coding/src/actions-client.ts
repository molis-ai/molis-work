/** Next-run references only; the Host rechecks authority and Character scope before dispatch. */
export const CODING_ACTIONS_CLIENT = `(host) => {
  const {q,api,current,selections,save,controls,status}=host;
  const dialog=q('[data-coding-actions-dialog]'),list=q('[data-coding-actions-list]'),error=q('[data-coding-actions-error]'),submit=q('[data-coding-actions-save]');
  const key=ref=>JSON.stringify([ref.capability_id,ref.version,ref.provider_id]);
  let session='',ticket=0,chosen=[],busy=false;
  const close=()=>{if(busy)return;ticket++;dialog.close();};
  const open=async()=>{
    if(!current() || busy)return;
    const id=current(),request=++ticket;session=id;chosen=structuredClone(selections.get(id) || []);
    list.textContent='正在读取当前授权能力…';error.textContent='';submit.disabled=true;dialog.showModal();
    try{
      await save(id);const data=await api('/sessions/'+encodeURIComponent(id)+'/actions');
      if(request!==ticket || current()!==id || !dialog.open)return;
      const canWrite=q('[data-coding-intent]').value==='execute';
      const rows=data.actions.filter(view=>view.action.audiences.includes('agent')).map(view=>({ref:{capability_id:view.capability_id,version:view.version,provider_id:view.provider.provider_id},
        title:view.action.title,source:view.provider.title,kind:view.action.kind,
        available:view.availability.available && (canWrite || view.operation==='query'),
        reason:!view.availability.available?view.availability.reason:!canWrite && view.operation!=='query'?'当前执行方式只允许查询；请切换到执行后再选择。':view.action.description}));
      for(const ref of chosen)if(!rows.some(row=>key(row.ref)===key(ref)))rows.push({ref,title:ref.capability_id,source:ref.provider_id,available:false,reason:'原能力、版本或授权不可用；引用保留，请明确移除或恢复来源。'});
      list.replaceChildren();
      for(const row of rows){const label=document.createElement('label'),check=document.createElement('input'),copy=document.createElement('span'),title=document.createElement('strong'),description=document.createElement('span');
        label.className='mw-check-row coding-material';check.type='checkbox';check.className='mw-check';check.checked=chosen.some(ref=>key(ref)===key(row.ref));check.disabled=!row.available && !check.checked;
        title.textContent=row.title+' · v'+row.ref.version;description.textContent=row.source+' · '+row.reason;copy.append(title,document.createElement('br'),description);
        check.onchange=()=>{chosen=chosen.filter(ref=>key(ref)!==key(row.ref));if(check.checked)chosen.push(row.ref);};label.append(check,copy);list.append(label);
      }
      if(!rows.length)list.textContent='还没有可用能力。请先在能力服务中为内置 Agent 授权。';submit.disabled=false;
    }catch(failure){if(request===ticket && current()===id)error.textContent=failure.message+'；原选择保持。';}
  };
  q('[data-coding-actions-open]').onclick=()=>void open();q('[data-coding-actions-close]').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  q('[data-coding-actions-form]').onsubmit=async event=>{
    event.preventDefault();if(busy || submit.disabled)return;
    if(current()!==session){error.textContent='会话已切换，请重新打开当前会话的能力选择。';return;}
    const id=session;selections.set(id,structuredClone(chosen));controls();busy=true;submit.disabled=true;
    const enabled=[...list.querySelectorAll('input:not(:disabled)')];enabled.forEach(input=>input.disabled=true);
    try{await save(id);dialog.close();ticket++;status('能力选择已保存，仅用于下一轮；在跑任务保持原选择。');}
    catch(failure){error.textContent=failure.message+'；选择仍保留在此窗口，可重试保存。';}
    finally{busy=false;submit.disabled=false;enabled.forEach(input=>input.disabled=false);}
  };
}`;
