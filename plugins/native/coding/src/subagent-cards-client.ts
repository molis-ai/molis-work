/**
 * Subagents, where they were sent: under the step that dispatched them, one card each with its own live timeline,
 * its own pending approvals, its conclusion and a stop control. A child's completion is the Runtime's fact; whether
 * its result is good enough stays the person's call, made in the results panel.
 */
export const CODING_SUBAGENT_CARDS_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const {api,current,status,refresh,timeline,showReviews,sessionId,openInPanel,parentLive,prefill}=ports;
  const svg=(name)=>'<svg aria-hidden="true"><use href="#icon-'+name+'"></use></svg>';
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const STATE={running:'执行中',completed:'已结束，结论待你核对',failed:'执行失败',cancelled:'已停止','reconcile-required':'中断，结果待核对'};
  const phaseOf=(child)=>child.state==='running'?'running':child.state==='completed'?'completed':child.state==='failed'?'failed':'stopped';
  const card=(section,run,child)=>{
    let node=[...section.children].find(entry=>entry.dataset.child===child.subagent_id);
    if(!node){
      node=el('article','coding-child');node.dataset.child=child.subagent_id;
      const head=el('header','coding-child-head');head.append(el('span','coding-child-mark'),el('strong','coding-child-role'),el('span','coding-child-state'),el('span','coding-child-meta'));
      const task=el('p','coding-child-task'),process=el('details','coding-activity coding-child-process');process.dataset.codingActivity='child:'+child.subagent_id;
      const reviews=el('div','coding-child-reviews'),result=el('details','coding-child-result'),foot=el('footer','coding-child-foot');reviews.hidden=true;
      result.append(el('summary'),el('div','coding-turn'));
      node.append(head,task,process,reviews,result,foot);section.append(node);
    }
    node.dataset.state=child.state;
    node.querySelector('.coding-child-mark').innerHTML=child.state==='running'?'<span class="coding-spinner" aria-hidden="true"></span>':svg(child.state==='completed'?'check':child.state==='failed'?'x':'circle-alert');
    node.querySelector('.coding-child-role').textContent=child.role_name||child.role_id;
    const verdict=child.verdict?.status;
    node.querySelector('.coding-child-state').textContent=verdict==='accepted'?'你已接受结论':verdict==='needs-work'?'你要求返工':STATE[child.state]||child.state;
    const tokens=child.usage?.tokens,meta=[child.workspace_path&&child.integration_available?'独立目录 '+child.workspace_path.split('/').pop():'',tokens&&(tokens.input||tokens.output)?'用量 '+((tokens.input||0)+(tokens.output||0)).toLocaleString()+' tokens':''].filter(Boolean).join(' · ');
    node.querySelector('.coding-child-meta').textContent=meta;
    const task=node.querySelector('.coding-child-task'),first=(child.task||'').trim().split('\\n').find(line=>line.trim())||'';task.textContent=first;task.title=child.task||'';
    // The child's own timeline, rendered exactly like the parent's: live while it runs, folded once it is done.
    const process=node.querySelector('.coding-child-process');
    if(child.activity?.length){process.hidden=false;timeline.renderGroup(process,child.activity,{ref:{run_id:child.subagent_id},phase:phaseOf(child),activity:child.activity},child.state==='running');}
    else process.hidden=true;
    // Its pending approvals appear in its own card, decided by the Host like any other.
    const reviews=node.querySelector('.coding-child-reviews');
    // The Host's review client shows or hides this box itself; an empty one never takes space.
    if(child.state==='running'&&child.child_run){const now=Date.now();if(now-Number(reviews.dataset.readAt||0)>1500){reviews.dataset.readAt=String(now);void showReviews(reviews,[child.child_run],sessionId());}}else{reviews.hidden=true;reviews.replaceChildren();delete reviews.dataset.readAt;}
    const result=node.querySelector('.coding-child-result');result.hidden=!child.result;
    if(child.result){const body=result.querySelector('.coding-turn'),html=child.result_html||'';if(body.dataset.source!==child.result){body.dataset.source=child.result;if(html)body.innerHTML=html;else body.textContent=child.result;}}
    // Folded by default with a one-line preview: the parent's summary is where the reading happens.
    if(child.result){const preview=child.result.replace(/[#*\x60>|-]+/g,' ').replace(/\\s+/g,' ').trim();result.querySelector('summary').textContent='结论 · '+(preview.length>90?preview.slice(0,90)+'…':preview);}
    if(child.error){let error=node.querySelector('.coding-child-error');if(!error){error=el('p','coding-child-error');node.querySelector('.coding-child-foot').before(error);}error.textContent=child.error;}
    const foot=node.querySelector('.coding-child-foot'),key=JSON.stringify([child.state,verdict,child.integration_available]);
    if(foot.dataset.key!==key){
      foot.dataset.key=key;foot.replaceChildren();
      if(child.state==='running'){const stop=el('button','mw-btn mw-btn--ghost','停止这个子任务');stop.type='button';stop.addEventListener('click',async()=>{stop.disabled=true;const id=current();
        try{await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(run.ref.run_id)+'/subagents/'+encodeURIComponent(child.subagent_id),'POST',{action:'stop'});status('已请求停止这个子任务；其他子任务照常进行。');}
        catch(error){status(error.message,true);stop.disabled=false;}if(id===current())await refresh();});foot.append(stop);}
      if(child.state==='completed'){const judge=el('button','mw-btn mw-btn--ghost',child.integration_available?'评价并整合成果':'评价结论');judge.type='button';judge.addEventListener('click',()=>openInPanel(child.subagent_id));foot.append(judge);}
      // A failed or stopped child is sent again by the parent, never re-run behind its back: a live parent is asked through the
      // supplemental channel; an ended one gets the request in the composer, sent only when the person chooses.
      if(['failed','cancelled'].includes(child.state)){const retry=el('button','mw-btn mw-btn--ghost','重试这个子任务');retry.type='button';retry.addEventListener('click',async()=>{
        const ask='请重新派出子任务「'+(child.role_name||child.role_id)+'」，沿用原分工'+(child.error?'；上次没有完成的原因：'+child.error:'')+'。原分工：\\n'+(child.task||'');
        if(parentLive(run)){retry.disabled=true;const id=current();try{await api('/sessions/'+encodeURIComponent(id)+'/control','POST',{kind:'steer',run_id:run.ref.run_id,text:ask});status('已请执行中的这一轮重新派出这个子任务。');}catch(error){status(error.message,true);retry.disabled=false;}if(id===current())await refresh();}
        else{prefill(ask);status('重试请求已放进输入框；确认执行方式后发送。');}
      });foot.append(retry);}
    }
    return node;
  };
  return {render(run,group){
    if(!group||!group.children?.length&&!group.error)return null;
    let section=document.querySelector('[data-coding-subagents-of="'+CSS.escape(run.ref.run_id)+'"]');
    if(!section){section=el('section','coding-children');section.dataset.codingSubagentsOf=run.ref.run_id;section.setAttribute('aria-label','这一轮派出的子任务');}
    let head=section.querySelector(':scope > .coding-children-head');if(!head){head=el('p','coding-children-head');section.prepend(head);}
    if(group.error){head.textContent='子任务状态暂时读不到：'+group.error;return section;}
    const running=group.children.filter(child=>child.state==='running').length;
    head.replaceChildren(document.createTextNode('派出 '+group.children.length+' 个子任务'+(running?' · '+running+' 个进行中':' · 都已结束')));
    // Two or more children can be read side by side, conclusions open, like comparing parallel agents.
    if(group.children.length>1){const compare=el('button','coding-children-compare',section.dataset.layout==='compare'?'逐个查看':'并排对比');compare.type='button';compare.setAttribute('aria-pressed',String(section.dataset.layout==='compare'));
      compare.addEventListener('click',()=>{const on=section.dataset.layout!=='compare';section.dataset.layout=on?'compare':'';section.querySelectorAll('.coding-child-result').forEach(node=>{if(!node.hidden)node.open=on;});compare.textContent=on?'逐个查看':'并排对比';compare.setAttribute('aria-pressed',String(on));});head.append(compare);}
    for(const child of group.children)card(section,run,child);
    for(const node of [...section.querySelectorAll(':scope > .coding-child')])if(!group.children.some(child=>child.subagent_id===node.dataset.child))node.remove();
    return section;
  }};
}`;
