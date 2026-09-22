/** A navigation projection of the same Plan, Run and child verdicts as the workbench. */
export const CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const {directory,current,navigate,status}=ports,region=directory.querySelector('[data-coding-taskboard]');
  const choice=region.querySelector('[data-coding-taskboard-session]'),tree=region.querySelector('[data-coding-taskboard-tree]'),notice=region.querySelector('[data-coding-taskboard-status]');
  let owner='',data=null,key='',optionsKey='',loadError='';
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
  const phases={starting:'正在准备',running:'执行中',compacting:'正在整理上下文',pausing:'正在暂停',paused:'已暂停','awaiting-input':'等待回答','awaiting-review':'等待审查',completed:'本轮结束，待核对',failed:'执行失败',stopped:'已停止',cancelled:'已取消','reconcile-required':'结果待核对'};
  const tone=phase=>['awaiting-input','awaiting-review','reconcile-required'].includes(phase)?'attention':phase==='failed'?'blocked':['running','starting','compacting'].includes(phase)?'progress':'idle';
  const action=(label,target,mark,phase)=>{
    const node=el('button',undefined,'mw-btn mw-btn--ghost coding-board-node');node.type='button';node.dataset.boardTarget=JSON.stringify(target);
    node.append(el('span',label));if(mark){const state=el('span',mark,'mw-status mw-status--plain');state.dataset.tone=tone(phase);node.append(state);}
    node.addEventListener('click',()=>void navigate(owner,target).catch(error=>status(error.message,true)));return node;
  };
  const branch=(label,id,opened,initial=false)=>{const node=el('details',undefined,'coding-board-branch');node.dataset.boardBranch=id;node.open=opened.has(id)||!key&&initial;node.append(el('summary',label));return node;};
  const steps=(parent,plan,target,entry)=>{
    const states={'not-started':'等待前置步骤',ready:'待执行',running:'模型报告执行中',succeeded:'模型报告成功，待核对',failed:'模型报告失败',cancelled:'模型报告取消',blocked:'模型报告阻塞'};
    const list=el('ol');for(const [index,step] of plan.content.steps.entries()){
      const item=el('li'),node=entry?.board?.nodes.find(node=>node.id==='step-'+(index+1)),verdict=node&&entry.verdicts?.[node.id];
      const accepted=verdict?.board_id===entry?.board?.board_id&&verdict?.board_version===entry?.board?.version;
      const mark=node?(accepted?(verdict.status==='accepted'?'用户验收通过':'用户要求返工'):states[node.state]):undefined;
      item.append(action(step.title,node?{kind:'step',run_id:entry.run_id,step_id:node.id}:{...target,step_index:index},mark,node?.state==='blocked'?'awaiting-input':node?.state));
      const criteria=el('details');criteria.append(el('summary','完成条件'),el('p',step.acceptance,'coding-board-meta'));criteria.dataset.boardBranch=JSON.stringify([target,index]);list.append(item);item.append(criteria);
      if(node?.reports.length)item.append(el('p',node.reports.at(-1).note,'coding-board-meta'));
    }parent.append(list);
    parent.append(el('p',entry?.board_error|| (entry?.board?'步骤显示原模型回报；用户验收单独记录。':'尚无步骤级回报；本轮结束不代表各步骤已通过。'),'coding-board-meta'));
  };
  const render=()=>{
    if(region.hidden)return;
    if(!data){tree.replaceChildren();notice.textContent=loadError|| (owner?'正在读取原任务…':'选择会话后查看计划与实际执行。');return;}
    notice.textContent=loadError||data.error||'计划、执行与结果评价分别显示；点击节点进入原任务。';
    const runs=data.runs.map(run=>({id:run.ref.run_id,phase:run.phase,role:run.frozen.role_id,task:run.turns.find(turn=>turn.kind==='user'&&!turn.steer)?.text||''}));
    const groups=(data.subagents||[]).map(group=>({...group,children:group.children.map(child=>({subagent_id:child.subagent_id,role_name:child.role_name,role_id:child.role_id,task:child.task,state:child.state,verdict:child.verdict,error:child.error}))}));
    const next=JSON.stringify([owner,data.plan,data.taskboard_plans,runs,groups,data.recovery_required,data.checkpoint_busy]);if(next===key)return;
    const opened=new Set([...tree.querySelectorAll('details[open]')].map(node=>node.dataset.boardBranch));
    const focused=tree.contains(document.activeElement)?document.activeElement.dataset.boardTarget:undefined,focusedBranch=tree.contains(document.activeElement)&&document.activeElement.tagName==='SUMMARY'?document.activeElement.parentElement.dataset.boardBranch:undefined,scroll=region.scrollTop;
    tree.replaceChildren();
    if(data.recovery_required)tree.append(action('核对中断结果',{kind:'recovery'},'结果尚未确认','reconcile-required'));
    if(data.checkpoint_busy)tree.append(action('处理文件回退',{kind:'reviews'},'回退待处理','awaiting-review'));
    if(data.plan){
      const plan=data.plan,label='当前计划 · 修订 '+plan.revision+' · '+(plan.content.blockers?'有阻塞':plan.confirmed?'已确认':'待确认');
      const row=branch(label,'draft',opened,true);row.append(action(plan.content.title,{kind:'plan'}));
      if(plan.content.blockers)row.append(el('p','待解决：'+plan.content.blockers,'coding-board-meta'));
      if(plan.content.change_reason)row.append(el('p','变更说明：'+plan.content.change_reason,'coding-board-meta'));
      steps(row,plan,{kind:'plan'});tree.append(row);
    }else tree.append(el('p','没有已保存的计划；普通任务可直接执行。','coding-board-meta'));
    if(!runs.length)tree.append(el('p',data.recovery_required?'执行记录未恢复，不能判断完成情况。':'尚未开始执行。','coding-board-meta'));
    for(const [index,run] of runs.entries()){
      const row=branch('第 '+(index+1)+' 轮 · '+(phases[run.phase]||'状态暂不可读'),'run:'+run.id,opened,index===runs.length-1);
      const title=run.task.length>100?run.task.slice(0,100)+'…':run.task||'查看原执行';
      row.append(action(title,{kind:'run',run_id:run.id}));
      if(run.phase==='awaiting-review')row.append(action('处理本轮审查',{kind:'reviews',run_id:run.id}));
      for(const entry of (data.taskboard_plans||[]).filter(entry=>entry.run_id===run.id)){
        const label='本轮固定计划 · 修订 '+(entry.revision??'未知');
        if(entry.plan){row.append(action(label,{kind:'fixed-plan',revision:entry.revision}));steps(row,entry.plan,{kind:'fixed-plan',revision:entry.revision},entry);}
        else row.append(el('p',label+'：'+entry.error,'coding-board-meta'));
      }
      const group=groups.find(group=>group.run_id===run.id);
      if(group?.error)row.append(el('p','子任务暂不可读：'+group.error,'coding-board-meta'));
      if(group?.children.length){
        const children=el('div',undefined,'coding-board-children');children.append(el('p','本轮子任务 · '+group.children.length,'coding-board-meta'));
        for(const child of group.children){
          const label=(child.role_name||child.role_id)+' · '+(child.task.length>80?child.task.slice(0,80)+'…':child.task);
          const mark=child.verdict?(child.verdict.status==='accepted'?'用户已接受此结果':'用户要求返工'):phases[child.state]||'状态暂不可读';
          children.append(action(label,{kind:'child',run_id:run.id,child_id:child.subagent_id},mark,child.verdict?.status==='needs-work'?'awaiting-input':child.state));
          if(child.verdict?.notes)children.append(el('p',child.verdict.notes,'coding-board-meta'));
        }row.append(children);
      }
      tree.append(row);
    }
    for(const detail of tree.querySelectorAll('details'))if(opened.has(detail.dataset.boardBranch))detail.open=true;
    key=next;region.scrollTop=scroll;
    if(focused)[...tree.querySelectorAll('[data-board-target]')].find(node=>node.dataset.boardTarget===focused)?.focus({preventScroll:true});
    if(focusedBranch)[...tree.querySelectorAll('details')].find(node=>node.dataset.boardBranch===focusedBranch)?.querySelector('summary')?.focus({preventScroll:true});
  };
  choice.addEventListener('change',()=>{if(choice.value)void navigate(choice.value,{kind:'session'}).catch(error=>status(error.message,true));});
  return {
    sessions(rows){const next=JSON.stringify(rows.map(row=>[row.session_id,row.title]));if(next!==optionsKey){choice.replaceChildren(el('option','选择任务'));choice.firstChild.value='';for(const row of rows){const option=el('option',row.title);option.value=row.session_id;choice.append(option);}optionsKey=next;}choice.value=current();},
    loading(id){if(id!==owner){owner=id;data=null;key='';loadError='';region.scrollTop=0;}choice.value=id;render();},
    update(id,value){if(id!==current())return;if(id!==owner){key='';region.scrollTop=0;}owner=id;data=value;loadError='';choice.value=id;render();},
    fail(id,message){if(id!==owner)return;loadError='任务暂不可读：'+message+'；已显示内容可能过期。';render();},
    show(){region.hidden=false;render();}
  };
}`;
