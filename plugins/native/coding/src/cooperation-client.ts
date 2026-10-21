/**
 * Sessions working together, as people see it. A delegation goes by letter between the two sessions (the SDK's
 * envelope for people); records from before that are shown read-only. A session created for a delegation shows where
 * it came from and what is asked of it, and hands its finished round back; the session that asked follows each delegation's receipts
 * and decides whether to take what comes back. Related sessions are listed read-only, and so are the messages the
 * sessions' models sent each other, which the person can withdraw while open. The session's background commands are
 * listed too, with a way to stop one still running. None of it reaches the model.
 */
export const CODING_COOPERATION_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const lifetime=ports.lifetime;
  const {q,api,current,status,openSession,refreshSessions,rounds,prefill,materialsChanged,openArtifact}=ports;
  const banner=q('[data-coding-delegation-banner]'),section=q('[data-coding-cooperation]'),dialog=q('[data-coding-delegate-dialog]'),backgroundSection=q('[data-coding-background]');
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const button=(label,variant,handler)=>{const node=el('button','mw-btn'+(variant?' mw-btn--'+variant:''),label);node.type='button';lifetime.listen(node,'click',handler);return node;};
  const time=(value)=>value?new Date(value).toLocaleString(document.documentElement.lang||'zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
  const EVENT={submitted:L('coding.coop.event.submitted'),delivered:L('coding.coop.event.delivered'),accepted:L('coding.coop.event.accepted'),started:L('coding.coop.event.started'),'delivery-sent':L('coding.coop.event.delivery-sent'),'delivery-accepted':L('coding.coop.event.delivery-accepted'),'delivery-rejected':L('coding.coop.event.delivery-rejected'),completed:L('coding.coop.event.completed'),rejected:L('coding.coop.event.rejected'),cancelled:L('coding.state.cancelled'),failed:L('coding.timeline.failed')};
  const SESSION_STATE={idle:L('coding.state.idle'),running:L('coding.state.running'),paused:L('coding.state.paused'),'waiting-answer':L('coding.state.waiting-answer'),'waiting-approval':L('coding.state.waiting-approval'),failed:L('coding.state.failed'),stopped:L('coding.phase.stopped'),cancelled:L('coding.state.cancelled'),'reconcile-required':L('coding.coop.state.reconcile'),queued:L('coding.state.queued'),done:L('coding.state.done')};
  const TONE={received:'attention',delivered:'attention',accepted:'progress',committing:'progress',completed:'done',rejected:'blocked',cancelled:'idle',failed:'blocked'};
  const MAIL_KIND={request:L('coding.coop.mail.request'),reply:L('coding.coop.mail.reply'),notice:L('coding.coop.mail.notice'),handoff:L('coding.coop.mail.handoff')};
  const MAIL_STATE={queued:L('coding.coop.mail.queued'),delivered:L('coding.coop.mail.delivered'),accepted:L('coding.coop.event.accepted'),completed:L('coding.board.phase.completed'),rejected:L('coding.coop.event.rejected'),cancelled:L('coding.coop.mail.cancelled'),expired:L('coding.coop.mail.expired')};
  const MAIL_TONE={queued:'attention',delivered:'progress',accepted:'progress',completed:'done',rejected:'blocked',cancelled:'idle',expired:'idle'};
  const TASK_STATE={running:L('coding.coop.task.running'),succeeded:L('coding.coop.task.succeeded'),failed:L('coding.timeline.failed'),stopped:L('coding.phase.stopped'),interrupted:L('coding.coop.task.interrupted')};
  const TASK_TONE={running:'progress',succeeded:'done',failed:'blocked',stopped:'idle',interrupted:'attention'};
  let owner='',mail=[],commands=[],backgroundUnknown=false,readAt=0,reading=false,drawnKey='';
  const drawBackground=()=>{
    backgroundSection.hidden=!commands.length&&!backgroundUnknown;backgroundSection.replaceChildren();if(backgroundSection.hidden)return;
    backgroundSection.append(el('h3','',L('coding.results.background')));if(backgroundUnknown)backgroundSection.append(el('p','',L('coding.coop.state-unreadable')));const list=el('ol','coding-coop-mail coding-background-list');
    for(const task of commands.slice().reverse()){
      const item=el('li'),head=el('div','coding-coop-head'),chip=el('span','mw-status mw-status--plain',TASK_STATE[task.state]||task.state);chip.dataset.tone=TASK_TONE[task.state]||'idle';chip.dataset.mwState=task.state==='succeeded'?'done':task.state;item.dataset.state=task.state;
      head.append(el('code','coding-background-command',task.summary),chip);
      const line=el('p','coding-coop-line');line.append(el('span','coding-coop-note',(task.exit_code===undefined?'':'exit '+task.exit_code+' · ')+L('coding.coop.started-at',{time:time(task.started_at_ms)})+(task.ended_at_ms?' · '+L('coding.coop.ended-at',{time:time(task.ended_at_ms)}):'')));
      item.append(head,line);
      if(task.state==='running')item.append(button(L('coding.coop.stop'),'ghost',async()=>{
        try{await api('/sessions/'+encodeURIComponent(current())+'/background/'+encodeURIComponent(task.task_id)+'/stop','POST',{});status(L('coding.coop.stopped-command'));}catch(error){if(!lifetime.alive)return;status(error.message,true);}await refresh(true);}));
      list.append(item);
    }
    backgroundSection.append(list);
  };
  const act=async(path,body,done)=>{try{await api('/sessions/'+encodeURIComponent(current())+'/delegations'+path,'POST',body);if(done)status(done);await refresh(true);}catch(error){if(!lifetime.alive)return;status(error.message,true);await refresh(true);}};
  const receipts=(delegation)=>{const details=el('details','coding-coop-receipts'),summary=el('summary','',L('coding.coop.receipts',{count:delegation.receipts.length})),list=el('ol');
    for(const receipt of delegation.receipts){const item=el('li');item.append(el('span','coding-coop-event',EVENT[receipt.event]||receipt.event),el('time','',time(receipt.at)));
      if(receipt.note)item.append(el('span','coding-coop-note',receipt.note));if(receipt.recorded_only)item.append(el('span','coding-coop-late',L('coding.coop.late')));list.append(item);}
    details.append(summary,list);return details;};
  const stateChip=(delegation)=>{const chip=el('span','mw-status mw-status--plain',delegation.state_label);chip.dataset.tone=TONE[delegation.state]||'idle';chip.dataset.mwState=({received:'approval',delivered:'approval',accepted:'ready',committing:'running',completed:'done',rejected:'cancelled',cancelled:'cancelled',failed:'failed'})[delegation.state]||'verify';return chip;};
  const sessionLink=(side)=>side?.title?button(L('coding.coop.quoted',{title:side.title}),'ghost',()=>void openSession(side.session_id,side.title)):el('span','coding-coop-gone',L('coding.coop.gone'));
  const reasonForm=(label,confirm,handler)=>{const form=el('form','coding-coop-reason'),input=el('textarea','mw-textarea');input.rows=2;input.maxLength=2000;input.required=true;input.setAttribute('aria-label',label);input.placeholder=label;
    const send=el('button','mw-btn mw-btn--secondary',confirm);send.type='submit';form.append(input,send);lifetime.listen(form,'submit',event=>{event.preventDefault();if(input.value.trim())void handler(input.value.trim());});return form;};
  const drawBanner=(incoming)=>{
    banner.hidden=!incoming;banner.replaceChildren();if(!incoming)return;
    const head=el('div','coding-coop-head');head.append(el('strong','',L('coding.coop.incoming')),stateChip(incoming));
    const from=el('p','coding-coop-line');from.append(document.createTextNode(L('coding.coop.from')),sessionLink(incoming.from),document.createTextNode(' · '+incoming.title));
    const ended=['completed','rejected','cancelled','failed'].includes(incoming.state);banner.classList.toggle('is-ended',ended);
    if(ended){head.append(from);banner.append(head);banner.append(receipts(incoming));return;}
    const task=el('details','coding-coop-task');task.append(el('summary','',L('coding.coop.task')),el('p','',incoming.task));
    banner.append(head,from,task);
    const row=el('div','coding-coop-actions'),path='/'+encodeURIComponent(incoming.delegation_id);
    if(incoming.state==='delivered'){
      row.append(button(L('coding.coop.accept'),'secondary',()=>void act(path,{action:'accept',expected_revision:incoming.revision},L('coding.coop.accepted')).then(()=>prefill(incoming.task))),
        button(L('coding.coop.reject'),'ghost',()=>{row.replaceChildren(reasonForm(L('coding.coop.reject-why-seen'),L('coding.coop.reject-ok'),reason=>act(path,{action:'reject',reason,expected_revision:incoming.revision},L('coding.coop.rejected'))));row.querySelector('textarea').focus();}));
      banner.append(el('p','coding-coop-note',L('coding.coop.accept-note')),row);
    } else if(incoming.state==='accepted'){banner.append(el('p','coding-coop-note',L('coding.coop.accepted-note')));row.append(button(L('coding.coop.reject'),'ghost',()=>{row.replaceChildren(reasonForm(L('coding.coop.reject-why'),L('coding.coop.reject-ok'),reason=>act(path,{action:'reject',reason,expected_revision:incoming.revision},L('coding.coop.rejected'))));}));banner.append(row);}
    else if(incoming.state==='committing'){
      const finished=rounds().filter(round=>round.phase==='completed');
      const pending=incoming.deliveries.find(item=>item.state==='sent');
      if(pending)banner.append(el('p','coding-coop-note',L(pending.kind==='report'?'coding.coop.delivered-report':'coding.coop.delivered-change',{number:rounds().find(round=>round.run_id===pending.run_id)?.number||'?'})));
      else if(!finished.length)banner.append(el('p','coding-coop-note',L('coding.coop.deliver-later')));
      else{
        const form=el('form','coding-coop-deliver'),choice=el('select','mw-select'),kind=el('select','mw-select'),note=el('input','mw-input'),send=el('button','mw-btn mw-btn--secondary',L('coding.coop.deliver'));
        for(const round of finished.slice().reverse()){const option=el('option','',L('coding.turn.number',{number:round.number}));option.value=round.run_id;choice.append(option);}
        for(const [value,label] of [['report',L('coding.coop.kind.report')],['changeset',L('coding.coop.kind.changeset')]]){const option=el('option','',label);option.value=value;kind.append(option);}
        choice.setAttribute('aria-label',L('coding.coop.which-turn'));kind.setAttribute('aria-label',L('coding.coop.which-result'));note.placeholder=L('coding.coop.note-optional');note.maxLength=2000;note.setAttribute('aria-label',L('coding.coop.note'));send.type='submit';
        form.append(choice,kind,note,send);lifetime.listen(form,'submit',event=>{event.preventDefault();send.disabled=true;void act(path+'/deliveries',{run_id:choice.value,kind:kind.value,note:note.value,expected_revision:incoming.revision},L('coding.coop.delivered'));});
        banner.append(form);
      }
      for(const delivery of incoming.deliveries.filter(item=>item.state==='rejected').slice(-1))banner.append(el('p','coding-coop-rejected',L('coding.coop.last-rejected',{reason:delivery.reason})));
    }
    else banner.append(el('p','coding-coop-note',incoming.state==='completed'?L('coding.coop.completed'):(incoming.receipts.at(-1)?.note||incoming.state_label)));
    banner.append(receipts(incoming));
  };
  const drawMail=()=>{
    if(!mail.length)return;const list=el('ol','coding-coop-mail');
    for(const message of mail.slice().reverse()){
      const item=el('li'),head=el('div','coding-coop-head'),line=el('p','coding-coop-line');item.dataset.state=message.state;
      const failed=message.state==='cancelled'&&(message.history||[]).some(entry=>entry.event==='failed');
      const chip=el('span','mw-status mw-status--plain',failed?L('coding.coop.mail.failed'):(MAIL_STATE[message.state]||message.state));chip.dataset.tone=failed?'blocked':(MAIL_TONE[message.state]||'idle');chip.dataset.mwState=failed?'failed':({queued:'queued',delivered:'waiting',accepted:'ready',completed:'round-ended',rejected:'cancelled',cancelled:'cancelled',expired:'stale'})[message.state]||'verify';
      head.append(el('strong','',L(message.outgoing?'coding.coop.mail.sent':'coding.coop.mail.received',{kind:MAIL_KIND[message.kind]||message.kind})+(message.await_reply?L('coding.coop.mail.awaiting'):'')),chip);
      line.append(document.createTextNode(message.outgoing?L('coding.coop.mail.to'):L('coding.coop.mail.from')),message.peer?sessionLink(message.peer):el('span','',L('coding.coop.quoted',{title:message.outgoing?message.to_title:message.from_title})),el('time','',time(message.sent_at_ms)));
      const body=el('details','coding-coop-task');body.append(el('summary','',message.body.split('\\n')[0].slice(0,80)),el('p','',message.body));
      item.append(head,line,body);
      if(message.outgoing && ['queued','delivered','accepted'].includes(message.state))item.append(button(L('coding.coop.withdraw'),'ghost',async()=>{
        try{await api('/sessions/'+encodeURIComponent(current())+'/messages/'+encodeURIComponent(message.message_id)+'/cancel','POST',{});status(L('coding.coop.withdrawn'));}catch(error){if(!lifetime.alive)return;status(error.message,true);}await refresh(true);}));
      list.append(item);
    }
    section.append(el('h4','',L('coding.coop.mail')),list);
  };
  const drawSection=(value)=>{
    const empty=!value.outgoing.length && !value.related.length && !value.incoming && !mail.length;section.hidden=empty;section.replaceChildren();if(empty)return;
    section.append(el('h3','',L('coding.results.cooperation')));
    for(const delegation of value.outgoing){
      const card=el('article','coding-coop-card'),head=el('div','coding-coop-head'),path='/'+encodeURIComponent(delegation.delegation_id);
      head.append(el('strong','',delegation.title),stateChip(delegation));
      const open=!['completed','rejected','cancelled','failed'].includes(delegation.state);
      const to=el('p','coding-coop-line');to.append(document.createTextNode(L('coding.coop.delegated-to')),sessionLink(delegation.to));if(delegation.to?.state)to.append(el('span','coding-coop-note',L('coding.coop.there',{state:SESSION_STATE[delegation.to.state]||delegation.to.state})));card.append(head,to);
      for(const delivery of delegation.deliveries){
        const row=el('div','coding-coop-delivery');row.dataset.state=delivery.state;
        row.append(el('p','',L('coding.coop.delivery',{kind:delivery.kind==='report'?L('coding.coop.report'):L('coding.coop.change')})+' · '+delivery.title+(delivery.note?' · '+delivery.note:'')+' · '+time(delivery.sent_at)));
        if(delivery.artifact&&openArtifact)row.append(button(delivery.kind==='report'?L('coding.coop.open-report'):L('coding.coop.open-change'),'ghost',()=>openArtifact(delivery.artifact,delivery.title)));
        if(delivery.state==='sent'&&open){const actions=el('div','coding-coop-actions');
          actions.append(button(L('coding.coop.take'),'secondary',()=>void act(path+'/deliveries/'+encodeURIComponent(delivery.delivery_id),{decision:'accept',expected_revision:delegation.revision},L('coding.coop.taken')).then(()=>materialsChanged())),
            button(L('coding.coop.decline'),'ghost',()=>{actions.replaceChildren(reasonForm(L('coding.coop.decline-why'),L('coding.coop.confirm'),reason=>act(path+'/deliveries/'+encodeURIComponent(delivery.delivery_id),{decision:'reject',reason,expected_revision:delegation.revision},L('coding.coop.declined'))));}));
          row.append(actions);}
        else if(delivery.state!=='sent')row.append(el('p','coding-coop-note',delivery.state==='accepted'?L('coding.coop.took-at',{time:time(delivery.decided_at)}):L('coding.coop.not-taken',{reason:delivery.reason})));
        card.append(row);
      }
      if(delegation.state==='received')card.append(button(L('coding.coop.retry'),'secondary',()=>void act(path,{action:'deliver',expected_revision:delegation.revision})));
      if(open)card.append(button(L('coding.coop.cancel'),'ghost',()=>void act(path,{action:'cancel',expected_revision:delegation.revision},L('coding.coop.cancelled'))));
      card.append(receipts(delegation));section.append(card);
    }
    if(value.incoming){const line=el('p','coding-coop-line');line.append(document.createTextNode(L('coding.coop.came-from')),sessionLink(value.incoming.from),document.createTextNode(L('coding.coop.came-from-after',{state:value.incoming.state_label})));section.append(line);}
    const others=value.related.filter(item=>!value.outgoing.some(delegation=>delegation.to_session===item.session_id));
    if(others.length){const list=el('ul','coding-coop-related');for(const item of others){const entry=el('li');entry.append(sessionLink(item),el('span','coding-coop-note',item.relation.join(L('coding.list.joiner'))+(item.state?' · '+(SESSION_STATE[item.state]||item.state):'')));list.append(entry);}section.append(el('h4','',L('coding.coop.related')),list);}
    drawMail();
  };
  const refresh=async(force=false)=>{
    const id=current();if(!id||reading)return;if(!force && owner===id && Date.now()-readAt<3000)return;
    reading=true;try{const [value,messages,background]=await Promise.all([api('/sessions/'+encodeURIComponent(id)+'/delegations'),api('/sessions/'+encodeURIComponent(id)+'/messages').catch(()=>({messages:[]})),api('/sessions/'+encodeURIComponent(id)+'/background').catch(()=>({commands:null}))]);if(id!==current())return;backgroundUnknown=background.commands===null;commands=backgroundUnknown?(owner===id?commands:[]):background.commands;owner=id;readAt=Date.now();mail=messages.messages;
      const key=JSON.stringify([id,value,mail,commands,backgroundUnknown,rounds().map(round=>[round.run_id,round.phase,round.number])]);
      if(force || key!==drawnKey){drawnKey=key;drawBanner(value.incoming);drawSection(value);drawBackground();}}
    catch(error){if(!lifetime.alive)return;if(id===current()){banner.hidden=true;}}finally{reading=false;}
  };
  // What goes with the task is picked from project knowledge in the page's one picker (specs/project-knowledge PMAT-18), as the
  // next round's materials are; the other session reads each piece through knowledge.read when its round starts.
  let delegatePicks=[],pickTicket=0;
  const drawPicks=()=>{const list=dialog.querySelector('[data-coding-delegate-outputs]');
    list.replaceChildren(...(delegatePicks.length?delegatePicks.map(pick=>el('p','coding-coop-line',pick.title)):[el('p','coding-coop-note',L('coding.coop.no-materials'))]));};
  const openDialog=async()=>{
    const id=current();if(!id)return;const form=dialog.querySelector('form'),message=dialog.querySelector('[data-coding-delegate-status]');
    form.reset();message.textContent='';dialog.querySelector('[data-coding-delegate-task]').value=q('[data-coding-task]').value.trim();delegatePicks=[];pickTicket++;drawPicks();
    dialog.querySelector('[data-coding-delegate-pick]').hidden=document.documentElement.dataset.knowledgePicker!=='1';
    dialog.showModal();dialog.querySelector('[data-coding-delegate-title]').focus();
  };
  lifetime.listen(dialog.querySelector('[data-coding-delegate-pick]'),'click',()=>{
    document.dispatchEvent(new CustomEvent('molis-work:knowledge-pick',{detail:{request_id:'coding-delegate:'+(++pickTicket),selected:structuredClone(delegatePicks),max:30}}));
  });
  lifetime.listen(document,'molis-work:knowledge-picked',event=>{
    if(String(event.detail?.request_id || '')!=='coding-delegate:'+pickTicket || !dialog.open)return;
    delegatePicks=(event.detail.picks || []).map(pick=>({kind:pick.kind,id:pick.id,title:pick.title}));drawPicks();
  });
  lifetime.listen(dialog.querySelector('form'),'submit',async event=>{
    event.preventDefault();const id=current(),message=dialog.querySelector('[data-coding-delegate-status]'),send=dialog.querySelector('[data-coding-delegate-create]');
    const task=dialog.querySelector('[data-coding-delegate-task]').value.trim(),title=dialog.querySelector('[data-coding-delegate-title]').value.trim();
    if(!task){message.textContent=L('coding.coop.write-task');return;}
    const materials=delegatePicks;
    send.disabled=true;message.textContent=L('coding.coop.creating');
    try{const result=await api('/sessions/'+encodeURIComponent(id)+'/delegations','POST',{task,...(title?{title}:{}),materials});dialog.close();
      await refreshSessions();status(result.delivery_unconfirmed?L('coding.coop.unconfirmed'):L('coding.coop.created',{title:result.session.title}),Boolean(result.delivery_unconfirmed));await refresh(true);}
    catch(error){if(!lifetime.alive)return;message.textContent=error.message;}finally{send.disabled=false;}
  });
  lifetime.listen(dialog.querySelector('[data-coding-delegate-cancel]'),'click',()=>dialog.close());
  return {refresh,openDialog,reset(){owner='';mail=[];commands=[];backgroundUnknown=false;backgroundSection.hidden=true;backgroundSection.replaceChildren();banner.hidden=true;banner.replaceChildren();section.hidden=true;section.replaceChildren();}};
}`;
