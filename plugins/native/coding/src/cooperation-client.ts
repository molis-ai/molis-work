/**
 * Sessions working together, as people see it. A session created for a delegation shows where it came from and
 * what is asked of it, and hands its finished round back; the session that asked follows each delegation's receipts
 * and decides whether to take what comes back. Related sessions are listed read-only. None of it reaches the model.
 */
export const CODING_COOPERATION_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const {q,api,current,status,openSession,refreshSessions,rounds,prefill,materialsChanged}=ports;
  const banner=q('[data-coding-delegation-banner]'),section=q('[data-coding-cooperation]'),dialog=q('[data-coding-delegate-dialog]');
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const button=(label,variant,handler)=>{const node=el('button','mw-btn'+(variant?' mw-btn--'+variant:''),label);node.type='button';node.addEventListener('click',handler);return node;};
  const time=(value)=>value?new Date(value).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
  const EVENT={submitted:'已提交',delivered:'已送达对方会话',accepted:'对方已接受',started:'对方开始执行','delivery-sent':'对方交付了成果','delivery-accepted':'已收下交付','delivery-rejected':'没有收下交付',completed:'已完成',rejected:'对方拒绝',cancelled:'已取消',failed:'失败'};
  const SESSION_STATE={idle:'尚未执行',running:'执行中',paused:'已暂停','waiting-answer':'等你回答','waiting-approval':'等你审查',failed:'失败待处理',stopped:'已停止',cancelled:'已取消','reconcile-required':'待核对结果',done:'本轮结束'};
  const TONE={received:'attention',delivered:'attention',accepted:'progress',committing:'progress',completed:'done',rejected:'blocked',cancelled:'idle',failed:'blocked'};
  let owner='',data=null,readAt=0,reading=false,drafts=new Map();
  const act=async(path,body,done)=>{try{await api('/sessions/'+encodeURIComponent(current())+'/delegations'+path,'POST',body);if(done)status(done);await refresh(true);}catch(error){status(error.message,true);await refresh(true);}};
  const receipts=(delegation)=>{const details=el('details','coding-coop-receipts'),summary=el('summary','','回执 '+delegation.receipts.length+' 条'),list=el('ol');
    for(const receipt of delegation.receipts){const item=el('li');item.append(el('span','coding-coop-event',EVENT[receipt.event]||receipt.event),el('time','',time(receipt.at)));
      if(receipt.note)item.append(el('span','coding-coop-note',receipt.note));if(receipt.recorded_only)item.append(el('span','coding-coop-late','在结束之后到达，只记录'));list.append(item);}
    details.append(summary,list);return details;};
  const stateChip=(delegation)=>{const chip=el('span','mw-status mw-status--plain',delegation.state_label);chip.dataset.tone=TONE[delegation.state]||'idle';return chip;};
  const sessionLink=(side)=>side?.title?button('「'+side.title+'」','ghost',()=>void openSession(side.session_id,side.title)):el('span','coding-coop-gone','已不存在的会话');
  const reasonForm=(label,confirm,handler)=>{const form=el('form','coding-coop-reason'),input=el('textarea','mw-textarea');input.rows=2;input.maxLength=2000;input.required=true;input.setAttribute('aria-label',label);input.placeholder=label;
    const send=el('button','mw-btn mw-btn--secondary',confirm);send.type='submit';form.append(input,send);form.addEventListener('submit',event=>{event.preventDefault();if(input.value.trim())void handler(input.value.trim());});return form;};
  // The receiving side: where the work came from, and handing the finished round back.
  const drawBanner=(incoming)=>{
    banner.hidden=!incoming;banner.replaceChildren();if(!incoming)return;
    const head=el('div','coding-coop-head');head.append(el('strong','','来自其他会话的委派'),stateChip(incoming));
    const from=el('p','coding-coop-line');from.append(document.createTextNode('发起：'),sessionLink(incoming.from),document.createTextNode(' · '+incoming.title));
    // An ended delegation stays as one line with its receipts; it no longer asks anything of this session.
    const ended=['completed','rejected','cancelled','failed'].includes(incoming.state);banner.classList.toggle('is-ended',ended);
    if(ended){head.append(from);banner.append(head,receipts(incoming));return;}
    const task=el('details','coding-coop-task');task.append(el('summary','','委派内容'),el('p','',incoming.task));
    banner.append(head,from,task);
    const row=el('div','coding-coop-actions'),path='/'+encodeURIComponent(incoming.delegation_id);
    if(incoming.state==='delivered'){
      row.append(button('接受并放进输入框','secondary',()=>void act(path,{action:'accept',expected_revision:incoming.revision},'已接受。任务已在输入框里，发送后才开始执行。').then(()=>prefill(incoming.task))),
        button('拒绝…','ghost',()=>{row.replaceChildren(reasonForm('拒绝的原因（发起的会话会看到）','确认拒绝',reason=>act(path,{action:'reject',reason,expected_revision:incoming.revision},'已拒绝这个委派。')));row.querySelector('textarea').focus();}));
      banner.append(el('p','coding-coop-note','接受后任务会放进输入框；由你确认并发送，不会自动执行。'),row);
    } else if(incoming.state==='accepted'){banner.append(el('p','coding-coop-note','已接受。发送第一轮后开始执行。'));row.append(button('拒绝…','ghost',()=>{row.replaceChildren(reasonForm('拒绝的原因','确认拒绝',reason=>act(path,{action:'reject',reason,expected_revision:incoming.revision},'已拒绝这个委派。')));}));banner.append(row);}
    else if(incoming.state==='committing'){
      const finished=rounds().filter(round=>round.phase==='completed');
      const pending=incoming.deliveries.find(item=>item.state==='sent');
      if(pending)banner.append(el('p','coding-coop-note','已交付第 '+(rounds().find(round=>round.run_id===pending.run_id)?.number||'?')+' 轮的'+(pending.kind==='report'?'报告':'固定变更')+'，等发起的会话决定是否收下。'));
      else if(!finished.length)banner.append(el('p','coding-coop-note','完成一轮后，可以把成果交付给发起的会话。'));
      else{
        const form=el('form','coding-coop-deliver'),choice=el('select','mw-select'),kind=el('select','mw-select'),note=el('input','mw-input'),send=el('button','mw-btn mw-btn--secondary','交付');
        for(const round of finished.slice().reverse()){const option=el('option','','第 '+round.number+' 轮');option.value=round.run_id;choice.append(option);}
        for(const [value,label] of [['report','报告（现在固定）'],['changeset','固定变更（需已固定）']]){const option=el('option','',label);option.value=value;kind.append(option);}
        choice.setAttribute('aria-label','交付哪一轮');kind.setAttribute('aria-label','交付的成果');note.placeholder='说明（可选）';note.maxLength=2000;note.setAttribute('aria-label','交付说明');send.type='submit';
        form.append(choice,kind,note,send);form.addEventListener('submit',event=>{event.preventDefault();send.disabled=true;void act(path+'/deliveries',{run_id:choice.value,kind:kind.value,note:note.value,expected_revision:incoming.revision},'已交付，等发起的会话决定。');});
        banner.append(form);
      }
      for(const delivery of incoming.deliveries.filter(item=>item.state==='rejected').slice(-1))banner.append(el('p','coding-coop-rejected','上次交付没有被收下：'+delivery.reason));
    }
    else banner.append(el('p','coding-coop-note',incoming.state==='completed'?'发起的会话已收下交付，这个委派已完成。':(incoming.receipts.at(-1)?.note||incoming.state_label)));
    banner.append(receipts(incoming));
  };
  // The asking side: each delegation's state and receipts, deliveries to take or return, and related sessions.
  const drawSection=(value)=>{
    const empty=!value.outgoing.length && !value.related.length && !value.incoming;section.hidden=empty;section.replaceChildren();if(empty)return;
    section.append(el('h3','','协作与相关会话'));
    for(const delegation of value.outgoing){
      const card=el('article','coding-coop-card'),head=el('div','coding-coop-head'),path='/'+encodeURIComponent(delegation.delegation_id);
      head.append(el('strong','',delegation.title),stateChip(delegation));
      const to=el('p','coding-coop-line');to.append(document.createTextNode('委派给'),sessionLink(delegation.to));if(delegation.to?.state)to.append(el('span','coding-coop-note','那边：'+(SESSION_STATE[delegation.to.state]||delegation.to.state)));card.append(head,to);
      for(const delivery of delegation.deliveries){
        const row=el('div','coding-coop-delivery');row.dataset.state=delivery.state;
        row.append(el('p','','交付：'+(delivery.kind==='report'?'报告':'固定变更')+' · '+delivery.title+(delivery.note?' · '+delivery.note:'')+' · '+time(delivery.sent_at)));
        if(delivery.state==='sent'){const actions=el('div','coding-coop-actions');
          actions.append(button('收下并作为下一轮材料','secondary',()=>void act(path+'/deliveries/'+encodeURIComponent(delivery.delivery_id),{decision:'accept',expected_revision:delegation.revision},'已收下，交付的成果已加入下一轮材料。').then(()=>materialsChanged())),
            button('不收下…','ghost',()=>{actions.replaceChildren(reasonForm('不收下的原因（对方会看到）','确认',reason=>act(path+'/deliveries/'+encodeURIComponent(delivery.delivery_id),{decision:'reject',reason,expected_revision:delegation.revision},'已退回，对方可以修改后再交付。')));}));
          row.append(actions);}
        else row.append(el('p','coding-coop-note',delivery.state==='accepted'?'已收下 · '+time(delivery.decided_at):'没有收下：'+delivery.reason));
        card.append(row);
      }
      if(!['completed','rejected','cancelled','failed'].includes(delegation.state))card.append(button('取消委派','ghost',()=>void act(path,{action:'cancel',expected_revision:delegation.revision},'已取消这个委派。')));
      card.append(receipts(delegation));section.append(card);
    }
    if(value.incoming){const line=el('p','coding-coop-line');line.append(document.createTextNode('这个会话来自'),sessionLink(value.incoming.from),document.createTextNode('的委派 · '+value.incoming.state_label));section.append(line);}
    const others=value.related.filter(item=>!value.outgoing.some(delegation=>delegation.to_session===item.session_id));
    if(others.length){const list=el('ul','coding-coop-related');for(const item of others){const entry=el('li');entry.append(sessionLink(item),el('span','coding-coop-note',item.relation.join('、')+(item.state?' · '+(SESSION_STATE[item.state]||item.state):'')));list.append(entry);}section.append(el('h4','','相关会话'),list);}
  };
  const refresh=async(force=false)=>{
    const id=current();if(!id||reading)return;if(!force && owner===id && Date.now()-readAt<3000)return;
    reading=true;try{const value=await api('/sessions/'+encodeURIComponent(id)+'/delegations');if(id!==current())return;owner=id;readAt=Date.now();data=value;drawBanner(value.incoming);drawSection(value);}
    catch(error){if(id===current()){banner.hidden=true;}}finally{reading=false;}
  };
  // Delegating: a new session gets the task as its draft, with fixed outputs handed over at their versions.
  const openDialog=async()=>{
    const id=current();if(!id)return;const form=dialog.querySelector('form'),list=dialog.querySelector('[data-coding-delegate-outputs]'),message=dialog.querySelector('[data-coding-delegate-status]');
    form.reset();message.textContent='';dialog.querySelector('[data-coding-delegate-task]').value=q('[data-coding-task]').value.trim();list.replaceChildren(el('p','coding-coop-note','正在读取可带上的固定成果…'));dialog.showModal();dialog.querySelector('[data-coding-delegate-title]').focus();
    try{const value=await api('/sessions/'+encodeURIComponent(id)+'/materials');list.replaceChildren();
      const choices=value.materials.filter(item=>!item.error && ['本会话的固定成果','已选固定版本','其他会话的固定成果'].includes(item.source));
      if(!choices.length)list.append(el('p','coding-coop-note','这个会话还没有固定的报告或变更。可以先在"每轮成果"里固定。'));
      for(const item of choices){const label=el('label','mw-check-row'),check=el('input','mw-check');check.type='checkbox';check.value=JSON.stringify(item.reference);label.append(check,el('span','',item.title));list.append(label);}}
    catch(error){list.replaceChildren(el('p','coding-coop-note',error.message));}
  };
  dialog.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const id=current(),message=dialog.querySelector('[data-coding-delegate-status]'),send=dialog.querySelector('[data-coding-delegate-create]');
    const task=dialog.querySelector('[data-coding-delegate-task]').value.trim(),title=dialog.querySelector('[data-coding-delegate-title]').value.trim();
    if(!task){message.textContent='请写下要委派的任务。';return;}
    const materials=[...dialog.querySelectorAll('[data-coding-delegate-outputs] input:checked')].map(input=>JSON.parse(input.value));
    send.disabled=true;message.textContent='正在创建委派…';
    try{const result=await api('/sessions/'+encodeURIComponent(id)+'/delegations','POST',{task,...(title?{title}:{}),materials});dialog.close();
      await refreshSessions();status('已委派给新会话「'+result.session.title+'」。对方接受并发送后才会执行。');await refresh(true);}
    catch(error){message.textContent=error.message;}finally{send.disabled=false;}
  });
  dialog.querySelector('[data-coding-delegate-cancel]').addEventListener('click',()=>dialog.close());
  return {refresh,openDialog,reset(){owner='';data=null;banner.hidden=true;banner.replaceChildren();section.hidden=true;section.replaceChildren();}};
}`;
