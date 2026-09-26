/**
 * The TaskBoard: the session's plan and every round that ran one, as a list in the Goal list's grammar — one row per
 * task, indented under what it belongs to, with its state, progress, prerequisites, who is doing it and when it last
 * moved. Every state comes from the execution record (the step graph, subagent records and reviews), never from what
 * the model said. A step's "who" is its holder on the graph: this session, the subtask it was handed to, you, or no one.
 * Clicking a row opens it; a live plan keeps its controls to reorder, skip, insert or unblock a step, and to take a
 * step on yourself, hand it back, or record your own result on it.
 */
export const CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const {board,current,navigate,status,ownTask,amend,roleName}=ports;
  const list=board.querySelector('[data-coding-board-list]'),notice=board.querySelector('[data-coding-board-status]'),title=board.querySelector('[data-coding-board-title]'),meta=board.querySelector('[data-coding-board-meta]');
  let owner='',data=null,key='',loadError='';const collapsed=new Set();
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const svg=(name)=>'<svg aria-hidden="true"><use href="#icon-'+name+'"></use></svg>';
  const clip=(text,max)=>text.length>max?text.slice(0,max-1)+'…':text;
  const firstLine=(text)=>(text||'').trim().split('\\n')[0];
  const oneLine=(text)=>(text||'').replace(/\\s+/g,' ').trim();
  const hue=(name)=>{let value=0;for(const char of name)value=(value*31+char.codePointAt(0))%360;return value;};
  const when=(at)=>{if(!at)return null;const date=new Date(at);if(Number.isNaN(date.getTime()))return null;const now=new Date(),pad=(n)=>String(n).padStart(2,'0');
    const text=date.toDateString()===now.toDateString()?pad(date.getHours())+':'+pad(date.getMinutes()):(date.getMonth()+1)+'月'+date.getDate()+'日';return {text,title:date.toLocaleString()};};
  // Status words and marks follow the Goal list: an icon and a short label, coloured by tone.
  const STATE={
    'not-started':['等待前置','circle','idle'],ready:['可以开始','circle','ready'],running:['进行中','','progress'],succeeded:['模型报告完成','check','done'],
    failed:['模型报告失败','x','blocked'],blocked:['受阻，等你决定','circle-alert','blocked'],cancelled:['已取消','minus','quiet'],skipped:['已跳过','minus','quiet'],
    accepted:['你已验收','check','accepted'],'needs-work':['要求返工','circle-alert','attention'],pending:['待执行','circle','idle'],
  };
  const PHASE={starting:['准备中','','progress'],running:['进行中','','progress'],compacting:['整理上下文','','progress'],pausing:['正在暂停','pause','attention'],paused:['已暂停','pause','attention'],
    'awaiting-input':['等你回答','circle-alert','attention'],'awaiting-review':['等你审查','circle-alert','attention'],completed:['已结束','check','done'],failed:['失败','x','blocked'],
    stopped:['已停止','minus','quiet'],cancelled:['已取消','minus','quiet'],'reconcile-required':['待核对','circle-alert','attention']};
  const CHILD={running:['进行中','','progress'],completed:['已结束 · 待核对','check','done'],failed:['失败','x','blocked'],cancelled:['已取消','minus','quiet'],stopped:['已停止','minus','quiet']};
  const skipped=(node)=>node.state==='cancelled'&&node.reports.some(report=>report.note.startsWith('用户跳过'));
  const stepOf=(plan,node)=>node.inserted?{title:node.title||node.id,acceptance:(node.reports.find(report=>report.note.startsWith('用户插入'))?.note.split('完成条件：')[1])||''}
    :plan?.content.steps[Number(node.id.replace('step-',''))-1]||{title:node.title||node.id,acceptance:''};
  const settled=(node)=>node.state==='succeeded'||skipped(node);
  // The Agent that does the work: the round's own Character when one was chosen, otherwise its role; a subagent is its role.
  const executorOf=(run)=>{const character=run.frozen?.character?.title,role=roleName(run.frozen?.role_id);
    return character?{name:character,detail:'Character「'+character+'」· 角色 '+role}:{name:role,detail:'角色 '+role+(run.frozen?.model_id?' · 模型 '+run.frozen.model_id:'')};};
  // A subagent belongs to the step whose latest report came just before it started; otherwise to the round itself.
  const startedAt=(child)=>{const at=child.activity?.find(item=>item.at)?.at;return at?Date.parse(at):NaN;};
  // A subagent holding a step belongs under it; one holding none, under the step reported just before it started.
  const stepFor=(nodes,child)=>{const held=nodes.find(node=>node.owner?.subagent_id===child.subagent_id);if(held)return held;
    const at=startedAt(child);if(!Number.isFinite(at))return null;let best=null,bestAt=-Infinity;
    for(const node of nodes)for(const report of node.reports)if(report.at_ms<=at&&report.at_ms>bestAt){best=node;bestAt=report.at_ms;}return best;};
  const tree=()=>{
    const groups=[],runs=data.runs||[],plans=data.taskboard_plans||[],subagents=data.subagents||[];
    if(data.recovery_required||data.checkpoint_busy){
      const items=[];
      if(data.recovery_required)items.push({key:'recovery',title:'核对中断结果',state:PHASE['reconcile-required'],target:{kind:'recovery'},executor:null,children:[]});
      if(data.checkpoint_busy)items.push({key:'rewind',title:'处理文件回退',state:PHASE['awaiting-review'],target:{kind:'reviews'},executor:null,children:[]});
      groups.push({id:'attention',label:'需要你处理',mark:'circle-alert',items});
    }
    // The plan not yet run: its steps as they would be run.
    const plan=data.plan;
    if(plan&&!plans.some(entry=>entry.revision===plan.revision&&entry.board)){
      const steps=plan.content.steps.map((step,index)=>({key:'plan-'+index,label:'S'+(index+1),title:step.title,hint:'完成条件：'+step.acceptance,state:STATE.pending,progress:{done:0,total:1},executor:null,target:{kind:'plan'},children:[]}));
      groups.push({id:'plan',label:'当前计划',mark:'list',count:'修订 '+plan.revision,items:[{key:'plan',label:'计划',title:plan.content.title,hint:plan.content.change_reason||'',
        state:plan.content.blockers?['有阻塞','circle-alert','blocked']:plan.confirmed?['已确认','check','ready']:['待确认','circle','attention'],
        progress:{done:0,total:steps.length},executor:null,target:{kind:'plan'},children:steps}]});
    }
    // Each round that ran a plan or dispatched subagents; newest first. Rounds that continued one step graph are one
    // task: the graph shows once, under its latest round, with every round that worked on it named on that row.
    const rounds=[],boardOf=(run)=>plans.find(item=>item.run_id===run.ref.run_id&&item.board)?.board.board_id,spans=new Map();
    runs.forEach((run,index)=>{const id=boardOf(run);if(id)spans.set(id,[...(spans.get(id)||[]),index]);});
    runs.forEach((run,index)=>{
      const id=run.ref.run_id,entry=plans.find(item=>item.run_id===id&&item.board),span=entry?spans.get(entry.board.board_id):[index];
      if(span.at(-1)!==index)return;
      const groupsHere=span.map(at=>subagents.find(item=>item.run_id===runs[at].ref.run_id)).filter(Boolean),group=groupsHere.find(item=>item.error),children=groupsHere.flatMap(item=>item.children.map(child=>({child,run_id:item.run_id})));
      if(!entry&&!children.length&&!plans.some(item=>item.run_id===id))return;
      const executor=executorOf(run),nodes=entry?.board?.nodes||[];
      const childRow=({child,run_id})=>{
        const verdict=child.verdict?.status,role=child.role_name||roleName(child.role_id),at=startedAt(child);
        const own=child.workspace_path&&run.frozen?.directory?.canonical_path&&child.workspace_path!==run.frozen.directory.canonical_path?child.workspace_path.split('/').filter(Boolean).at(-1):'';
        return {key:'child-'+child.subagent_id,label:'子任务',title:oneLine(child.task),hint:child.task,
          state:verdict==='accepted'?STATE.accepted:verdict==='needs-work'?STATE['needs-work']:CHILD[child.state]||['状态未知','circle','idle'],
          progress:null,note:own?'独立目录 '+own:'',executor:{name:role,detail:'子代理 · '+role+(child.error?' · '+child.error:'')},time:Number.isFinite(at)?when(at):null,
          target:{kind:'child',run_id,child_id:child.subagent_id},children:[]};
      };
      const placed=new Map(),loose=[];
      for(const item of children){const node=stepFor(nodes,item.child);if(node)placed.set(node.id,[...(placed.get(node.id)||[]),item]);else loose.push(item);}
      const live=Boolean(entry&&!entry.board.terminal&&['running','starting','paused','pausing','awaiting-review','awaiting-input'].includes(run.phase));
      // The latest round's unfinished graph can still be changed once the round ends; "继续计划" carries on from it.
      // A plan round is also the latest one to change when only ended conversation rounds came after it.
      const lastPlan=runs.reduce((found,other,at)=>plans.some(item=>item.run_id===other.ref.run_id&&item.board)?at:found,-1);
      const quietAfter=runs.slice(lastPlan+1).every(other=>['completed','failed','stopped','cancelled'].includes(other.phase));
      const editable=Boolean(entry&&!entry.board.terminal&&(live||span.includes(runs.length-1)||span.includes(lastPlan)&&quietAfter));
      const steps=nodes.map((node,position)=>{
        const step=stepOf(entry.plan,node),verdict=entry.verdicts?.[node.id],decided=verdict&&verdict.board_version===entry.board.version?verdict.status:null;
        // A step you hold ends by your own mark, not by a model's report.
        const yours=node.owner?.kind==='person'&&['succeeded','failed'].includes(node.state)?(node.state==='succeeded'?['你标记完成','check','done']:['你标记失败','x','blocked']):null;
        const state=decided==='accepted'?STATE.accepted:decided==='needs-work'?STATE['needs-work']:skipped(node)?STATE.skipped:yours||STATE[node.state]||STATE.pending;
        const deps=(node.depends_on||[]).map(dep=>nodes.find(other=>other.id===dep)).filter(Boolean).map(dep=>({title:stepOf(entry.plan,dep).title,ready:settled(dep),blocked:['failed','blocked'].includes(dep.state)}));
        const mine=(placed.get(node.id)||[]).map(childRow),last=node.reports.at(-1);
        const holder=node.owner,held=holder?.kind==='subtask'?children.find(item=>item.child.subagent_id===holder.subagent_id)?.child:null;
        // Who does this step: its holder on the graph, not whoever runs the round.
        const doer=!holder?executor:holder.kind==='session'?{name:executor.name,detail:'负责：本会话 · '+executor.detail}
          :holder.kind==='subtask'?{name:holder.label,detail:'负责：'+holder.label+(held?' · 子代理 '+(held.role_name||roleName(held.role_id)):'')}
          :holder.kind==='person'?{name:'你',detail:'负责：你（这一步由你处理）',person:true}
          :holder.kind==='none'?{name:'没人认领',detail:'这一步没有负责人',none:true}:{name:holder.label,detail:'负责：'+holder.label};
        const done=mine.length?mine.filter(row=>['done','accepted'].includes(row.state[2])).length:settled(node)||decided==='accepted'?1:0;
        return {key:'step-'+id+'-'+node.id,label:node.inserted?'插入':'S'+(Number(node.id.replace('step-',''))||position+1),title:step.title,
          hint:(step.acceptance?'完成条件：'+step.acceptance:'')+(holder?'\\n负责：'+(holder.kind==='person'?'你':holder.label):'')+(last?'\\n最近回报：'+(last.by?last.by+'：':'')+last.note:''),
          state,progress:{done,total:mine.length||1},deps,executor:doer,time:last?when(last.at_ms):null,target:{kind:'step',run_id:id,step_id:node.id},children:mine,
          node,live,editable,board:entry.board,runId:id,position};
      });
      // A skipped step leaves the count altogether: it is neither done nor still to do.
      const doneSteps=nodes.filter(node=>settled(node)&&!skipped(node)).length,counted=nodes.filter(node=>!skipped(node)).length;
      const name=entry?.plan?.content.title||clip(firstLine(run.task??ownTask(run.turns?.find(turn=>turn.kind==='user'&&!turn.steer)?.text||'')),90)||'第 '+(index+1)+' 轮';
      const first=runs[span[0]];
      rounds.unshift({key:'run-'+id,label:span.length>1?'#'+(span[0]+1)+'–'+(index+1):'#'+(index+1),title:name,
        hint:[entry?'计划修订 '+(entry.revision??'?'):'',span.length>1?'接续的轮次：'+span.map(at=>'#'+(at+1)).join('、'):''].filter(Boolean).join('\\n'),state:PHASE[run.phase]||['状态未知','circle','idle'],
        progress:nodes.length?{done:doneSteps,total:counted||nodes.length}:children.length?{done:children.filter(item=>item.child.state==='completed').length,total:children.length}:null,
        executor,time:when(first.started_at),target:{kind:'run',run_id:id},children:[...steps,...loose.map(childRow)],note:entry?.error||group?.error||''});
    });
    if(rounds.length)groups.push({id:'rounds',label:'执行',mark:'play',count:rounds.length+' 轮',items:rounds});
    return groups;
  };
  const renderState=(state)=>{const [label,mark,tone]=state,node=el('span','coding-board-state');node.dataset.tone=tone;
    node.innerHTML=tone==='progress'?'<span class="coding-board-pulse" aria-hidden="true"></span>':svg(mark||'circle');node.append(el('span','',label));node.title=label;return node;};
  const renderProgress=(progress)=>{const node=el('span','coding-board-progress');if(!progress){node.classList.add('is-empty');return node;}
    const percent=Math.round(progress.done/Math.max(1,progress.total)*100);node.innerHTML='<span></span><i aria-hidden="true"><b></b></i>';node.firstChild.textContent=progress.done+'/'+progress.total;
    node.querySelector('b').style.setProperty('--board-progress',percent+'%');node.setAttribute('aria-label',progress.done+'/'+progress.total+' 完成');return node;};
  const renderDeps=(row)=>{
    if(!row.deps?.length){const node=el('span','coding-board-deps is-empty');if(row.note){node.className='coding-board-deps is-note';node.textContent=row.note;node.title=row.note;}return node;}
    const waiting=row.deps.filter(dep=>!dep.ready),blocked=waiting.filter(dep=>dep.blocked);
    const node=el('details','coding-board-deps '+(blocked.length?'is-blocked':waiting.length?'is-waiting':'is-ready')),summary=el('summary');
    summary.textContent=row.deps.length+' 个前置'+(blocked.length?' · '+blocked.length+' 个阻塞':waiting.length?' · '+waiting.length+' 个未完成':' · 已就绪');
    summary.setAttribute('aria-label','查看 '+row.deps.length+' 个前置步骤');node.append(summary);
    const box=el('div','coding-board-dep-list');
    for(const dep of row.deps){const item=el('p','coding-board-dep '+(dep.ready?'is-ready':dep.blocked?'is-blocked':'is-waiting'));item.innerHTML=svg('link');item.append(el('strong','',dep.title),el('em','',dep.ready?'已完成，不再挡住':dep.blocked?'受阻，挡住这一步':'还在等它完成'));box.append(item);}
    node.append(box);return node;
  };
  const renderMeta=(row)=>{
    const node=el('span','coding-board-meta'),time=el('time','coding-board-time'+(row.time?'':' is-empty'),row.time?.text||'');if(row.time)time.title=row.time.title;
    const avatar=el('span','coding-board-avatar'+(row.executor&&!row.executor.none?'':' is-unknown')+(row.executor?.person?' is-person':''));
    if(row.executor?.none){node.dataset.owner='none';avatar.innerHTML=svg('user');avatar.title=row.executor.detail;avatar.setAttribute('aria-label','没人认领');}
    else if(row.executor){if(row.executor.person)node.dataset.owner='person';avatar.textContent=Array.from(row.executor.name)[0]||'?';avatar.style.setProperty('--board-avatar-hue',String(hue(row.executor.name)));avatar.title='执行：'+row.executor.detail;avatar.setAttribute('aria-label','执行者 '+row.executor.name);}
    const name=el('span','coding-board-agent',row.executor?.name||'');if(row.executor)name.title='执行：'+row.executor.detail;
    node.append(time,name,avatar);return node;
  };
  const tools=(row,entry)=>{
    if(!row.editable||!row.node)return null;
    const node=row.node,nodes=row.board.nodes,index=row.position,waiting=node.state==='not-started'||node.state==='ready';
    const group=el('span','coding-board-tools');
    const tool=(label,icon,action)=>{const button=el('button','mw-btn mw-btn--ghost mw-btn--icon-only');button.type='button';button.title=label;button.setAttribute('aria-label',label+'：'+row.title);button.innerHTML=svg(icon);
      button.addEventListener('click',event=>{event.stopPropagation();action();});group.append(button);};
    const change=async(amendment)=>{board.dataset.busy='true';try{await amend(row.runId,row.board.version,amendment,row.live);}finally{delete board.dataset.busy;key='';render();}};
    const ask=(fields,label,build)=>{
      list.querySelector('.coding-board-form')?.remove();const form=el('form','coding-board-form');
      // A field is a text input, or with a 'check' kind a labelled checkbox that is off by default.
      const inputs=fields.map(([name,placeholder,max,kind])=>{if(kind==='check'){const label=el('label','coding-board-check'),box=el('input');box.type='checkbox';box.name=name;label.append(box,el('span','',placeholder));form.append(label);return box;}
        const input=el('input','mw-input');input.name=name;input.placeholder=placeholder;input.maxLength=max;input.required=true;form.append(input);return input;});
      const cancel=el('button','mw-btn mw-btn--ghost','取消'),ok=el('button','mw-btn mw-btn--primary',label);cancel.type='button';ok.type='submit';form.append(cancel,ok);board.dataset.editing='true';
      const close=()=>{form.remove();delete board.dataset.editing;key='';render();};
      cancel.addEventListener('click',close);form.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
      form.addEventListener('submit',async event=>{event.preventDefault();if(inputs.some(input=>input.type!=='checkbox'&&!input.value.trim()))return;ok.disabled=true;delete board.dataset.editing;
        await change(build(inputs.map(input=>input.type==='checkbox'?input.checked:input.value.trim())));});
      entry.after(form);inputs[0].focus();
    };
    if(waiting&&index>0&&['not-started','ready'].includes(nodes[index-1].state))tool('提前一步','chevron-up',()=>void change({kind:'move',node:node.id,direction:'up'}));
    if(waiting&&['not-started','ready'].includes(nodes[index+1]?.state))tool('推后一步','chevron-down',()=>void change({kind:'move',node:node.id,direction:'down'}));
    if(node.state==='blocked')tool('给出决定','edit',()=>ask([['note','你的决定，例如：用方案 B',500]],'继续',([note])=>({kind:'unblock',node:node.id,note})));
    if(waiting||node.state==='blocked'||node.state==='failed')tool(node.state==='failed'?'越过这一步':'跳过','minus',()=>ask([['reason','跳过原因',300]],'跳过',([reason])=>({kind:'skip',node:node.id,reason})));
    if(node.state!=='cancelled')tool('在后面插入一步','plus',()=>ask([['title','新步骤要做什么',120],['acceptance','完成条件',300],['mine','由我处理',0,'check']],'插入',([title,acceptance,mine])=>({kind:'insert',after:node.id,title,acceptance,...(mine?{mine:true}:{})})));
    // Who holds it: take it on yourself, hand it back to the session, and on your own step record how it went.
    const open=!['succeeded','failed','cancelled'].includes(node.state),holder=node.owner?.kind;
    if(open&&holder!=='person')tool('由我处理','user',()=>void change({kind:'assign',node:node.id,to:'me'}));
    if(open&&holder&&holder!=='session')tool(holder==='none'?'交给本会话':'交回本会话','undo',()=>void change({kind:'assign',node:node.id,to:'session'}));
    if(open&&holder==='person'&&node.state!=='not-started'){
      tool('标记完成','check',()=>ask([['note','做了什么、怎么核对的',500]],'完成',([note])=>({kind:'resolve',node:node.id,state:'succeeded',note})));
      tool('标记失败','x',()=>ask([['note','失败原因',500]],'标记失败',([note])=>({kind:'resolve',node:node.id,state:'failed',note})));
    }
    return group;
  };
  const renderRow=(row,depth)=>{
    const item=el('li','coding-board-item');item.dataset.boardKey=row.key;item.style.setProperty('--board-depth',String(depth));
    const entry=el('div','coding-board-entry'),lead=el('span','coding-board-lead'),open=!collapsed.has(row.key);
    if(row.children.length){
      const toggle=el('button','coding-board-toggle');toggle.type='button';toggle.innerHTML=svg('chevron-down');toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',(open?'折叠 ':'展开 ')+row.title);
      toggle.addEventListener('click',()=>{if(collapsed.has(row.key))collapsed.delete(row.key);else collapsed.add(row.key);key='';render();});lead.append(toggle);
    }else lead.append(el('span','coding-board-guide'));
    const main=el('button','coding-board-node');main.type='button';if(row.hint)main.title=row.hint;
    if(row.label)main.append(el('span','coding-board-key',row.label));main.append(el('strong','',row.title));
    main.addEventListener('click',()=>void navigate(owner,row.target).catch(error=>status(error.message,true)));
    lead.append(main);entry.append(lead,renderState(row.state),renderProgress(row.progress),renderDeps(row),renderMeta(row));
    const controls=tools(row,entry);if(controls)entry.append(controls);
    item.append(entry);
    if(row.children.length&&open){const children=el('ul','coding-board-children');for(const child of row.children)children.append(renderRow(child,depth+1));item.append(children);}
    return item;
  };
  const render=()=>{
    if(board.hidden)return;
    if(!data){list.replaceChildren();title.textContent='TaskBoard';meta.textContent='';notice.textContent=loadError||(owner?'正在读取…':'在左侧选一个会话，查看它的计划、步骤和子任务。');return;}
    if(board.dataset.editing==='true'||board.dataset.busy==='true')return;
    const next=JSON.stringify([owner,data.plan,data.taskboard_plans,(data.runs||[]).map(run=>[run.ref.run_id,run.phase,run.frozen?.character?.title]),data.subagents,data.recovery_required,data.checkpoint_busy,[...collapsed]]);
    if(next===key)return;key=next;
    const scroll=board.scrollTop,groups=tree();
    title.textContent='TaskBoard';
    const latest=(data.taskboard_plans||[]).filter(entry=>entry.board).at(-1)?.board;
    const unfinished=latest?latest.nodes.filter(node=>!['succeeded','failed','cancelled'].includes(node.state)):[];
    const count=(kind)=>unfinished.filter(node=>node.owner?.kind===kind).length;
    meta.textContent=[data.plan?'计划修订 '+data.plan.revision+(data.plan.confirmed?' · 已确认':' · 待确认'):'',latest?latest.nodes.filter(node=>settled(node)&&!skipped(node)).length+'/'+latest.nodes.filter(node=>!skipped(node)).length+' 步完成'+(latest.nodes.some(skipped)?' · 跳过 '+latest.nodes.filter(skipped).length+' 步':''):'',
      count('subtask')?count('subtask')+' 步在子任务手上':'',count('person')?'你负责 '+count('person')+' 步':'',count('none')?'没人认领 '+count('none')+' 步':''].filter(Boolean).join(' · ');
    notice.textContent=loadError||data.error||(groups.length?'状态来自任务图回报、子代理记录和审查，不从模型的回答推断。点一行查看详情。':'这个会话还没有计划或子任务。在对话里用「规划」或「协作」开始，它们会出现在这里。');
    list.replaceChildren();
    for(const group of groups){
      const fold=el('details','coding-board-fold');fold.open=!collapsed.has('group:'+group.id);fold.dataset.boardGroup=group.id;
      const summary=el('summary');summary.innerHTML='<span class="coding-board-caret">'+svg('chevron-down')+'</span><span class="coding-board-fold-mark">'+svg(group.mark)+'</span>';
      summary.append(el('strong','',group.label),el('small','',group.count||String(group.items.length)));
      fold.addEventListener('toggle',()=>{if(fold.open)collapsed.delete('group:'+group.id);else collapsed.add('group:'+group.id);});
      const rows=el('ul','coding-board-tree');for(const row of group.items)rows.append(renderRow(row,0));
      fold.append(summary,rows);list.append(fold);
    }
    board.scrollTop=scroll;
  };
  return {
    loading(id){if(id!==owner){owner=id;data=null;key='';loadError='';collapsed.clear();board.scrollTop=0;}render();},
    update(id,value){if(id!==current())return;if(id!==owner){key='';collapsed.clear();board.scrollTop=0;}owner=id;data=value;loadError='';render();},
    fail(id,message){if(id!==owner)return;loadError='任务暂不可读：'+message+'；已显示内容可能过期。';key='';render();},
    show(){board.hidden=false;key='';render();},
    hide(){board.hidden=true;},
  };
}`;
