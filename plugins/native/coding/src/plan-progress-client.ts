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
      // A round that has ended hears of the change when the plan continues; only a live round is told right away.
      if(card.dataset.live!=='true')status(result?.board?.terminal?'已记在任务图上。计划的每一步都已结束。':'已记在任务图上。点「继续计划」后，下一轮按调整后的任务图继续。');
      else status(result.steered?'计划已调整，并已告诉执行中的这一轮。':'计划图已调整，但没能通知执行中的这一轮：'+(result.steer_error||'原因未知')+'。可以在输入框补充说明。',!result.steered);
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
  return {render(run,entry,live,latest=false){
    const board=entry?.board;if(!board)return null;
    let card=document.querySelector('[data-coding-plan-progress="'+CSS.escape(run.ref.run_id)+'"]');
    if(!card){card=el('section','coding-plan-progress');card.dataset.codingPlanProgress=run.ref.run_id;card.setAttribute('aria-label','本轮计划进度');}
    const signature=JSON.stringify([board.version,board.terminal,live,latest,run.phase,entry.verdicts]);
    // Never rebuild under the person's hands: an open form keeps the card as it is until they finish.
    if(card.dataset.editing==='true'||card.dataset.busy==='true'||card.dataset.signature===signature)return card;
    card.dataset.signature=signature;card.replaceChildren();
    const total=board.nodes.filter(node=>!skipped(node)).length,done=board.nodes.filter(node=>node.state==='succeeded').length;
    const head=el('header','coding-plan-head');head.innerHTML=svg('list');
    head.append(el('strong','',entry.plan?.content.title||'本轮计划'),el('span','coding-plan-count',done+' / '+total+' 步完成'),el('span','coding-plan-revision',entry.revision?'计划修订 '+entry.revision:''));
    card.append(head);
    // Rows in the TaskBoard's grammar: state, prerequisites, when it last moved and who is doing it.
    // The latest round's unfinished graph stays open to change after the round ends: a blocked step is decided, a
    // step skipped or added, and "继续计划" carries on from the graph as changed.
    const editable=(live||latest)&&!board.terminal,list=el('ul','coding-board-tree coding-board--compact coding-plan-steps');card.dataset.live=String(Boolean(live));
    const TONE={succeeded:'done',running:'progress',failed:'blocked',blocked:'blocked',cancelled:'quiet',ready:'ready','not-started':'idle'};
    const pad=(n)=>String(n).padStart(2,'0'),clock=(ms)=>{const date=new Date(ms);return pad(date.getHours())+':'+pad(date.getMinutes());};
    const who=run.frozen?.character?.title||({builder:'构建者',writer:'改写者',writers:'并行写入',coordinator:'协作',reader:'阅读者',planner:'规划者',reviewer:'评审者'})[run.frozen?.role_id]||'Agent';
    let hueValue=0;for(const char of who)hueValue=(hueValue*31+char.codePointAt(0))%360;
    const settledNode=(other)=>other.state==='succeeded'||skipped(other);
    board.nodes.forEach((node,index)=>{
      const step=stepOf(entry.plan,node),row=el('li','coding-board-item coding-plan-step');row.dataset.state=skipped(node)?'skipped':node.state;row.dataset.step=node.id;if(node.inserted)row.dataset.inserted='true';
      const line=el('div','coding-board-entry'),lead=el('span','coding-board-lead'),main=el('button','coding-board-node coding-plan-title');main.type='button';
      const note=node.reports.at(-1)?.note;main.title=(step.acceptance?'完成条件：'+step.acceptance:'')+(note?'\\n最近回报：'+note:'')||'查看这一步的回报并验收';
      main.append(el('span','coding-board-key',node.inserted?'插入':'S'+(index+1)),el('strong','',step.title));main.addEventListener('click',()=>openStep(run.ref.run_id,node.id));
      lead.append(el('span','coding-board-guide'),main);
      const verdict=entry.verdicts?.[node.id],decided=verdict&&verdict.board_version===board.version?verdict.status:null;
      const state=el('span','coding-board-state coding-plan-state');state.dataset.tone=decided==='accepted'?'accepted':decided==='needs-work'?'attention':skipped(node)?'quiet':TONE[node.state]||'idle';
      state.innerHTML=node.state==='running'&&!decided?'<span class="coding-board-pulse" aria-hidden="true"></span>':svg(decided==='accepted'?'check':decided==='needs-work'?'circle-alert':skipped(node)?'minus':MARK[node.state]||'circle');
      const yours=node.owner?.kind==='person'&&['succeeded','failed'].includes(node.state);
      state.append(el('span','',decided==='accepted'?'你已验收':decided==='needs-work'?'要求返工':skipped(node)?'你跳过了':yours?(node.state==='succeeded'?'你标记完成':'你标记失败'):LABEL[node.state]||node.state));if(decided)state.dataset.verdict=decided;
      const deps=(node.depends_on||[]).map(id=>board.nodes.find(other=>other.id===id)).filter(Boolean),waiting=deps.filter(dep=>!settledNode(dep)),stuck=waiting.filter(dep=>['failed','blocked'].includes(dep.state));
      const chip=el('span','coding-board-deps '+(!deps.length?'is-empty':stuck.length?'is-blocked':waiting.length?'is-waiting':'is-ready'));
      if(deps.length){chip.textContent=deps.length+' 个前置'+(stuck.length?' · '+stuck.length+' 个阻塞':waiting.length?' · '+waiting.length+' 个未完成':' · 已就绪');chip.title=deps.map(dep=>stepOf(entry.plan,dep).title).join('\\n');}
      // Who holds the step on the graph: this session (its executor), a subtask, you, or no one.
      const holder=node.owner,name=!holder||holder.kind==='session'?who:holder.kind==='person'?'你':holder.label;
      const meta=el('span','coding-board-meta'),time=el('time','coding-board-time'+(node.reports.length?'':' is-empty'),node.reports.length?clock(node.reports.at(-1).at_ms):''),avatar=el('span','coding-board-avatar'+(holder?.kind==='none'?' is-unknown':''),holder?.kind==='none'?'':Array.from(name)[0]);
      if(holder?.kind==='none')avatar.innerHTML=svg('user');else{let h=0;for(const char of name)h=(h*31+char.codePointAt(0))%360;avatar.style.setProperty('--board-avatar-hue',String(holder&&holder.kind!=='session'?h:hueValue));}
      avatar.title='负责：'+(holder?(holder.kind==='session'?'本会话 · '+who:holder.kind==='person'?'你':holder.label):who);avatar.setAttribute('aria-label',avatar.title);meta.append(time,avatar);
      line.append(lead,state,chip,meta);row.append(line);
      if(editable){
        const tools=el('span','coding-board-tools coding-plan-tools'),tool=(label,icon,action)=>{const button=el('button','mw-btn mw-btn--ghost mw-btn--icon-only');button.type='button';button.title=label;button.setAttribute('aria-label',label+'：'+step.title);button.innerHTML=svg(icon);button.addEventListener('click',action);tools.append(button);};
        const waiting=node.state==='not-started'||node.state==='ready';
        if(waiting&&index>0&&['not-started','ready'].includes(board.nodes[index-1].state))tool('提前一步','chevron-up',()=>void amend(card,run.ref.run_id,board.version,{kind:'move',node:node.id,direction:'up'}));
        if(waiting&&['not-started','ready'].includes(board.nodes[index+1]?.state))tool('推后一步','chevron-down',()=>void amend(card,run.ref.run_id,board.version,{kind:'move',node:node.id,direction:'down'}));
        if(node.state==='blocked')tool('给出决定','edit',()=>form(card,row,[['note','你的决定，例如：用方案 B，接受行号变化',500]],([note])=>amend(card,run.ref.run_id,board.version,{kind:'unblock',node:node.id,note}),'继续'));
        if(waiting||node.state==='blocked'||node.state==='failed')tool(node.state==='failed'?'越过这一步':'跳过','minus',()=>form(card,row,[['reason','跳过原因',300]],([reason])=>amend(card,run.ref.run_id,board.version,{kind:'skip',node:node.id,reason}),'跳过'));
        if(!['cancelled'].includes(node.state))tool('在后面插入一步','plus',()=>form(card,row,[['title','新步骤要做什么',120],['acceptance','完成条件',300]],([title,acceptance])=>amend(card,run.ref.run_id,board.version,{kind:'insert',after:node.id,title,acceptance}),'插入'));
        const open=!['succeeded','failed','cancelled'].includes(node.state),kind=node.owner?.kind;
        if(open&&kind!=='person')tool('由我处理','user',()=>void amend(card,run.ref.run_id,board.version,{kind:'assign',node:node.id,to:'me'}));
        if(open&&kind&&kind!=='session')tool(kind==='none'?'交给本会话':'交回本会话','undo',()=>void amend(card,run.ref.run_id,board.version,{kind:'assign',node:node.id,to:'session'}));
        if(open&&kind==='person'&&node.state!=='not-started'){
          tool('标记完成','check',()=>form(card,row,[['note','做了什么、怎么核对的',500]],([note])=>amend(card,run.ref.run_id,board.version,{kind:'resolve',node:node.id,state:'succeeded',note}),'完成'));
          tool('标记失败','x',()=>form(card,row,[['note','失败原因',500]],([note])=>amend(card,run.ref.run_id,board.version,{kind:'resolve',node:node.id,state:'failed',note}),'标记失败'));
        }
        line.append(tools);
      }
      list.append(row);
    });
    card.append(list);
    card.append(el('p','coding-plan-foot',editable?(live?'状态来自模型对任务图的回报；调整会记录在图上，并告诉执行中的这一轮。':'状态来自模型对任务图的回报；这一轮已结束，调整会记录在图上，点「继续计划」后按新的图继续。'):'状态来自模型对任务图的回报；点步骤可以查看回报并验收。'));
    return card;
  }};
}`;
