/**
 * The running plan, in the conversation: every step of the round's own graph with its reported state, and — while
 * the round is live — the person's controls to skip, insert, reorder or unblock. Each control is one SDK graph
 * operation through the Host; the card never infers a step's state from the model's prose.
 */
export const CODING_PLAN_PROGRESS_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const {api,current,status,refresh,openStep}=ports;
  const svg=(name)=>'<svg aria-hidden="true"><use href="#icon-'+name+'"></use></svg>';
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const MARK={succeeded:'check','running':'','failed':'x',blocked:'circle-alert',cancelled:'minus',ready:'circle','not-started':'circle'};
  const LABEL={succeeded:'模型报告完成',running:'进行中',failed:'模型报告失败',blocked:'受阻，等你决定',cancelled:'已取消',ready:'可以开始','not-started':'等待前一步'};
  const skipped=(node)=>node.state==='cancelled'&&node.reports.some(report=>report.note.startsWith('用户跳过'));
  const stepOf=(plan,node)=>node.inserted?{title:node.title||node.id,acceptance:(node.reports.find(report=>report.note.startsWith('用户插入'))?.note.split('完成条件：')[1])||''}
    :plan?.content.steps[Number(node.id.replace('step-',''))-1]||{title:node.title||node.id,acceptance:''};
  const amend=async(card,runId,version,amendment)=>{
    const id=current();card.dataset.busy='true';
    try{
      const result=await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(runId)+'/plan-amendments','POST',{amendment,expected_version:version});
      status(result.steered?'计划已调整，并已告诉执行中的这一轮。':'计划图已调整，但没能通知执行中的这一轮：'+(result.steer_error||'原因未知')+'。可以在输入框补充说明。',!result.steered);
      delete card.dataset.editing;
    }catch(error){status(error.message,true);}
    finally{delete card.dataset.busy;card.dataset.signature='';if(id===current())await refresh();}
  };
  // One inline form at a time, placed under the step it acts on.
  const form=(card,row,fields,submit,label)=>{
    card.querySelector('.coding-plan-form')?.remove();card.dataset.editing='true';
    const box=el('form','coding-plan-form'),inputs=fields.map(([name,placeholder,max])=>{const input=el('input','mw-input');input.name=name;input.placeholder=placeholder;input.maxLength=max;input.required=true;box.append(input);return input;});
    const actions=el('div','coding-plan-form-actions'),cancel=el('button','mw-btn mw-btn--ghost','取消'),ok=el('button','mw-btn mw-btn--primary',label);cancel.type='button';ok.type='submit';actions.append(cancel,ok);box.append(actions);
    cancel.addEventListener('click',()=>{box.remove();delete card.dataset.editing;});
    box.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();box.remove();delete card.dataset.editing;}});
    box.addEventListener('submit',event=>{event.preventDefault();if(inputs.some(input=>!input.value.trim()))return;ok.disabled=true;void submit(inputs.map(input=>input.value.trim()));});
    row.after(box);inputs[0].focus();
  };
  return {render(run,entry,live){
    const board=entry?.board;if(!board)return null;
    let card=document.querySelector('[data-coding-plan-progress="'+CSS.escape(run.ref.run_id)+'"]');
    if(!card){card=el('section','coding-plan-progress');card.dataset.codingPlanProgress=run.ref.run_id;card.setAttribute('aria-label','本轮计划进度');}
    const signature=JSON.stringify([board.version,board.terminal,live,run.phase,entry.verdicts]);
    // Never rebuild under the person's hands: an open form keeps the card as it is until they finish.
    if(card.dataset.editing==='true'||card.dataset.busy==='true'||card.dataset.signature===signature)return card;
    card.dataset.signature=signature;card.replaceChildren();
    const total=board.nodes.filter(node=>!skipped(node)).length,done=board.nodes.filter(node=>node.state==='succeeded').length;
    const head=el('header','coding-plan-head');head.innerHTML=svg('list');
    head.append(el('strong','',entry.plan?.content.title||'本轮计划'),el('span','coding-plan-count',done+' / '+total+' 步完成'),el('span','coding-plan-revision',entry.revision?'计划修订 '+entry.revision:''));
    card.append(head);
    const editable=live&&!board.terminal,list=el('ol','coding-plan-steps');
    board.nodes.forEach((node,index)=>{
      const step=stepOf(entry.plan,node),row=el('li','coding-plan-step');row.dataset.state=skipped(node)?'skipped':node.state;row.dataset.step=node.id;if(node.inserted)row.dataset.inserted='true';
      const mark=el('span','coding-plan-mark');mark.innerHTML=node.state==='running'?'<span class="coding-spinner" aria-hidden="true"></span>':svg(MARK[node.state]||'circle');
      const title=el('button','coding-plan-title',step.title);title.type='button';title.title='查看这一步的完成条件、模型回报与你的评价';title.addEventListener('click',()=>openStep(run.ref.run_id,node.id));
      const state=el('span','coding-plan-state',skipped(node)?'你跳过了':LABEL[node.state]||node.state);
      const verdict=entry.verdicts?.[node.id];if(verdict&&verdict.board_version===board.version){state.textContent=verdict.status==='accepted'?'你已验收':'你要求返工';state.dataset.verdict=verdict.status;}
      row.append(mark,title,state);
      const note=node.reports.at(-1)?.note;if(note){const last=el('p','coding-plan-note',note);last.title=note;row.append(last);}
      if(editable){
        const tools=el('span','coding-plan-tools'),tool=(label,icon,action)=>{const button=el('button','mw-btn mw-btn--ghost');button.type='button';button.title=label;button.setAttribute('aria-label',label+'：'+step.title);button.innerHTML=icon?svg(icon):'';if(!icon)button.textContent=label;button.addEventListener('click',action);tools.append(button);};
        const waiting=node.state==='not-started'||node.state==='ready';
        if(waiting&&index>0&&['not-started','ready'].includes(board.nodes[index-1].state))tool('提前一步','chevron-up',()=>void amend(card,run.ref.run_id,board.version,{kind:'move',node:node.id,direction:'up'}));
        if(waiting&&['not-started','ready'].includes(board.nodes[index+1]?.state))tool('推后一步','chevron-down',()=>void amend(card,run.ref.run_id,board.version,{kind:'move',node:node.id,direction:'down'}));
        if(node.state==='blocked')tool('给出决定',null,()=>form(card,row,[['note','你的决定，例如：用方案 B，接受行号变化',500]],([note])=>amend(card,run.ref.run_id,board.version,{kind:'unblock',node:node.id,note}),'继续'));
        if(waiting||node.state==='blocked'||node.state==='failed')tool(node.state==='failed'?'越过这一步':'跳过',null,()=>form(card,row,[['reason','跳过原因',300]],([reason])=>amend(card,run.ref.run_id,board.version,{kind:'skip',node:node.id,reason}),'跳过'));
        if(!['cancelled'].includes(node.state))tool('在后面插入一步','plus',()=>form(card,row,[['title','新步骤要做什么',120],['acceptance','完成条件',300]],([title,acceptance])=>amend(card,run.ref.run_id,board.version,{kind:'insert',after:node.id,title,acceptance}),'插入'));
        row.append(tools);
      }
      list.append(row);
    });
    card.append(list);
    card.append(el('p','coding-plan-foot',editable?'状态来自模型对任务图的回报；调整会记录在图上，并告诉执行中的这一轮。':'状态来自模型对任务图的回报；点步骤可以查看回报并验收。'));
    return card;
  }};
}`;
