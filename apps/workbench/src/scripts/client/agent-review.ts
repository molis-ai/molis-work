/** Host-owned review actions. Plugins receive a rendering hook, never a decision capability. */
export const AGENT_REVIEW_CLIENT_FACTORY_SCRIPT = `(host) => {
  const mounts=new WeakMap(), busy=new Set(), recoveryDrafts=new Map(), feedbackDrafts=new Map();
  const feedbackKey=id=>'molis-review-feedback:'+host.route('/api/agent/reviews')+':'+id;
  const readFeedback=id=>{try{return sessionStorage.getItem(feedbackKey(id)) ?? feedbackDrafts.get(id) ?? '';}catch{return feedbackDrafts.get(id) ?? '';}};
  const saveFeedback=(id,text)=>{feedbackDrafts.set(id,text);try{if(text)sessionStorage.setItem(feedbackKey(id),text);else sessionStorage.removeItem(feedbackKey(id));}catch{}};
  const syncActions=row=>{
    const id=row.dataset.agentReviewItem,hasFeedback=Boolean(row.querySelector('[data-agent-review-feedback]')?.value.trim());
    row.querySelectorAll('[data-agent-review-approve],[data-agent-review-reject],[data-agent-review-inspect]').forEach(button=>{button.disabled=busy.has(id) || hasFeedback && button.hasAttribute('data-agent-review-approve');});
    const reject=row.querySelector('[data-agent-review-reject]');if(reject)reject.textContent=hasFeedback?'拒绝并反馈':'拒绝';
    const input=row.querySelector('[data-agent-review-feedback]');if(input)input.disabled=busy.has(id);
  };
  const read=async(path,body) => {
    const response=await fetch(host.route(path),body ? {method:'POST',headers:host.headers(),body:JSON.stringify(body)} : {});
    const data=await response.json(); if(!response.ok) throw new Error(data.error || '审查暂不可用');return data;
  };
  // scope.runSession lists every run of one runtime session; scope.limit keeps open items plus that much settled history.
  const show=async(container,refs,sessionId,workspaceId,scope) => {
    if(!container) return;
    let state=mounts.get(container);
    if(!state) {
      state={key:'',ticket:0,refs:[],more:0}; mounts.set(container,state);
      container.addEventListener('click',event=>{if(!event.target.closest('[data-review-more]'))return;state.more+=50;void show(container,state.refs,state.sessionId,state.workspaceId,state.scope);});
      container.addEventListener('input',event=>{
        if(event.target.matches('[data-agent-review-feedback]')){
          const row=event.target.closest('[data-agent-review-item]');saveFeedback(row.dataset.agentReviewItem,event.target.value);syncActions(row);return;
        }
        if(!event.target.matches('[data-review-recovery-reason],[data-review-recovery-confirm]'))return;
        const row=event.target.closest('[data-agent-review-item]');
        recoveryDrafts.set(row.dataset.agentReviewItem,{reason:row.querySelector('[data-review-recovery-reason]')?.value || '',confirmed:row.querySelector('[data-review-recovery-confirm]')?.checked===true});
      });
      container.addEventListener('click',async event=>{
        const recoveryButton=event.target.closest('[data-agent-review-inspect],[data-review-recheck],[data-review-confirm-not]');
        if(recoveryButton && container.contains(recoveryButton)) {
          const row=recoveryButton.closest('[data-agent-review-item]'), review_id=row.dataset.agentReviewItem;
          if(busy.has(review_id))return;
          const scopeKey=state.key, scope={workspaceId:state.workspaceId,sessionId:state.sessionId};
          const holder=row.querySelector('[data-review-recovery]');
          busy.add(review_id); recoveryButton.disabled=true;
          try {
            let data;
            if(recoveryButton.hasAttribute('data-agent-review-inspect'))data=await read('/api/agent/reviews/recovery?review_id='+encodeURIComponent(review_id));
            else {
              const confirm=recoveryButton.hasAttribute('data-review-confirm-not');
              const panel=row.querySelector('[data-review-recovery-view]');
              const confirmed=row.querySelector('[data-review-recovery-confirm]')?.checked===true;
              const reason=row.querySelector('[data-review-recovery-reason]')?.value || '';
              if(confirm && (!confirmed || !reason.trim()))throw new Error('请填写具体依据并确认原操作未发生');
              data=await read('/api/agent/reviews/recovery',{review_id,action:confirm?'not-happened':'refresh',confirmed,reason,revision:panel?.dataset.reviewRevision});
            }
            if(scopeKey!==state.key || !container.contains(row))return;
            if(!data.view.receipt.effect_uncertain) {
              recoveryDrafts.delete(review_id);
              await host.onDecision?.({...scope,receipt:data.view.receipt,error:null});
              await show(container,state.refs,state.sessionId,state.workspaceId,state.scope);
            } else {
              holder.innerHTML=data.html;
              const draft=recoveryDrafts.get(review_id);
              const input=holder.querySelector('[data-review-recovery-reason]'),check=holder.querySelector('[data-review-recovery-confirm]');
              if(input && draft)input.value=draft.reason;
              if(check)check.checked=false;
            }
          } catch(error) {
            if(scopeKey===state.key && container.contains(row)) {
              let note=holder.querySelector('[data-review-recovery-error]');
              if(!note){note=document.createElement('p');note.dataset.reviewRecoveryError='';note.setAttribute('role','alert');holder.append(note);}
              note.textContent=error.message;
            }
          } finally {busy.delete(review_id);recoveryButton.disabled=false;}
          return;
        }
        const button=event.target.closest('[data-agent-review-approve],[data-agent-review-reject]');
        if(!button || !container.contains(button)) return;
        const review_id=button.dataset.agentReviewApprove || button.dataset.agentReviewReject;
        if(busy.has(review_id)) return;
        const row=button.closest('[data-agent-review-item]'),note=row.querySelector('[data-agent-review-feedback]')?.value.trim() || '';
        if(button.dataset.agentReviewApprove && note)return;
        busy.add(review_id); syncActions(row);
        const scope={workspaceId:state.workspaceId,sessionId:state.sessionId};let receipt=null,decisionError=null;
        const remember=Boolean(button.dataset.agentReviewApprove && row.querySelector('[data-agent-review-remember]')?.checked);
        try { ({receipt}=await read('/api/agent/reviews/decide',{review_id,decision:button.dataset.agentReviewApprove ? 'approve' : 'reject',...(note?{note}: {}),...(remember?{remember:'session'}:{})}));if(!receipt.delivery_error)saveFeedback(review_id,''); }
        catch(error) {
          decisionError=error.message;
          const row=button.closest('[data-agent-review-item]');
          let note=row.querySelector('[data-review-error]');
          if(!note){note=document.createElement('p');note.dataset.reviewError='';note.className='agent-review-error';note.setAttribute('role','alert');row.append(note);}
          note.textContent=error.message;
        } finally {busy.delete(review_id);syncActions(row);await host.onDecision?.({...scope,receipt,error:decisionError});void show(container,state.refs,state.sessionId,state.workspaceId,state.scope);}
      });
    }
    const key=JSON.stringify([refs,sessionId,workspaceId,scope?.runSession || null]); const ticket=++state.ticket;
    if(state.key!==key){container.replaceChildren();delete container.dataset.reviewHtml;state.key=key;state.more=0;}
    state.refs=refs;state.sessionId=sessionId;state.workspaceId=workspaceId;state.scope=scope;
    if(!refs.length && !sessionId && !workspaceId && !scope?.runSession) {container.hidden=true;return;}
    try {
      const query=new URLSearchParams();if(sessionId)query.set('session_id',sessionId);if(workspaceId)query.set('workspace_id',workspaceId);refs.forEach(ref=>query.append('run_id',ref.run_id));
      if(scope?.runSession)query.set('run_session_id',scope.runSession);if(scope?.limit)query.set('limit',String(scope.limit+state.more));
      const data=await read('/api/agent/reviews?'+query);
      if(ticket!==state.ticket || key!==state.key) return;
      container.hidden=data.reviews.length===0;
      container.querySelector('[data-review-load-error]')?.remove();
      if(container.dataset.reviewHtml!==data.html) {
        const detailKey=item=>{const row=item.closest('[data-agent-review-item]');return JSON.stringify([row?.dataset.agentReviewItem,row?.dataset.agentReviewPhase,item.dataset.reviewDetail]);};
        const details=new Map([...container.querySelectorAll('details[data-review-detail]')].map(item=>[detailKey(item),item.open]));
        const panels=new Map([...container.querySelectorAll('[data-review-recovery-view]')].map(panel=>[panel.closest('[data-agent-review-item]').dataset.agentReviewItem,panel]));
        const focused=container.contains(document.activeElement) && document.activeElement.matches('[data-agent-review-feedback]') ? {id:document.activeElement.closest('[data-agent-review-item]').dataset.agentReviewItem,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null;
        let scroller=container.parentElement;while(scroller && scroller.scrollHeight<=scroller.clientHeight)scroller=scroller.parentElement;
        const visibleTop=scroller?.getBoundingClientRect().top || 0;
        const anchor=scroller?.scrollTop>0 ? [...container.querySelectorAll('[data-agent-review-item]')].find(row=>row.getBoundingClientRect().bottom>visibleTop) : null;
        const anchorId=anchor?.dataset.agentReviewItem,anchorTop=anchor?.getBoundingClientRect().top;
        container.innerHTML=data.html;container.dataset.reviewHtml=data.html;
        container.querySelectorAll('[data-agent-review-item]').forEach(row=>{const holder=row.querySelector('[data-review-recovery]'),panel=panels.get(row.dataset.agentReviewItem);if(holder && panel)holder.append(panel);});
        container.querySelectorAll('details[data-review-detail]').forEach(item=>{const open=details.get(detailKey(item));if(open!==undefined)item.open=open;});
        container.querySelectorAll('[data-agent-review-feedback]').forEach(input=>{
          const id=input.closest('[data-agent-review-item]').dataset.agentReviewItem;input.value=readFeedback(id);
          if(focused?.id===id){input.focus({preventScroll:true});input.setSelectionRange(focused.start,focused.end);}
        });
        if(anchorId && scroller){const next=[...container.querySelectorAll('[data-agent-review-item]')].find(row=>row.dataset.agentReviewItem===anchorId);if(next)scroller.scrollTop+=next.getBoundingClientRect().top-anchorTop;}
      }
      container.querySelectorAll('[data-agent-review-item]').forEach(syncActions);
      // Older settled history is one click away rather than resent on every refresh.
      let more=container.querySelector(':scope > [data-review-more]');
      if(data.omitted>0){if(!more){more=document.createElement('button');more.type='button';more.className='mw-btn mw-btn--ghost';more.dataset.reviewMore='';}container.append(more);more.textContent='显示更早的 '+data.omitted+' 条审查记录';}
      else more?.remove();
    } catch(error) {
      if(ticket!==state.ticket) return;
      container.hidden=false;
      let note=container.querySelector('[data-review-load-error]');
      if(!note){note=document.createElement('p');note.dataset.reviewLoadError='';note.setAttribute('role','alert');container.prepend(note);}
      note.textContent='审查暂未刷新：'+error.message;
    }
  };
  return show;
}`;
