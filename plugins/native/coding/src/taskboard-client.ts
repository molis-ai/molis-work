/**
 * The TaskBoard: the session's plan and every round that ran one, as a list in the Goal list's grammar — one row per
 * task, indented under what it belongs to, with its state, progress, prerequisites, who is doing it and when it last
 * moved. Every state comes from the execution record (the step graph, subagent records and reviews), never from what
 * the model said. A step's "who" is its holder on the graph: this session, the subtask it was handed to, you, or no one.
 * Clicking a row opens it; a live plan keeps its controls to reorder, skip, insert or unblock a step, and to take a
 * step on yourself, hand it back, or record your own result on it.
 *
 * The same tree also draws the directory column's outline (ports.outline): one compact row per task with its state
 * mark, key, title and who is on it, no columns and no controls. It is the "find" view of the session's work; the
 * board in the main area is where the work is changed. ports.progress receives "done/total" of the latest graph
 * for the main area's view switch.
 */
export const CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const lifetime=ports.lifetime;
  const {board,current,navigate,status,ownTask,amend,roleName,from}=ports;
  const outline=ports.outline||null,progress=ports.progress||(()=>{}),onShow=ports.onShow||(()=>true);
  const list=board.querySelector('[data-coding-board-list]'),notice=board.querySelector('[data-coding-board-status]'),title=board.querySelector('[data-coding-board-title]'),meta=board.querySelector('[data-coding-board-meta]');
  let owner='',data=null,key='',outlineKey='',loadError='';const collapsed=new Set(),empty=L('coding.board.empty');
  // The outline's rows are redrawn whole; one listener on the list finds a row's target by its key.
  const outlineTargets=new Map();
  if(outline)lifetime.listen(outline,'click',event=>{const row=event.target.closest('.coding-outline-row'),target=row&&outlineTargets.get(row.dataset.boardKey);if(target)void navigate(owner,target).catch(error=>status(error.message,true));});
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const svg=(name)=>'<svg aria-hidden="true"><use href="#icon-'+name+'"></use></svg>';
  const clip=(text,max)=>text.length>max?text.slice(0,max-1)+'…':text;
  const firstLine=(text)=>(text||'').trim().split('\\n')[0];
  const oneLine=(text)=>(text||'').replace(/\\s+/g,' ').trim();
  const hue=(name)=>{let value=0;for(const char of name)value=(value*31+char.codePointAt(0))%360;return value;};
  const when=(at)=>{if(!at)return null;const date=new Date(at);if(Number.isNaN(date.getTime()))return null;const now=new Date(),pad=(n)=>String(n).padStart(2,'0');
    const text=date.toDateString()===now.toDateString()?pad(date.getHours())+':'+pad(date.getMinutes()):new Intl.DateTimeFormat(document.documentElement.lang||'zh-CN',{month:'short',day:'numeric'}).format(date);return {text,title:date.toLocaleString()};};
  // Status words and marks follow the Goal list: an icon and a short label, coloured by tone.
  const STATE={
    'not-started':[L('coding.board.state.not-started'),'waiting','idle'],ready:[L('coding.board.state.ready'),'ready','ready'],running:[L('coding.filter.running'),'running','progress'],succeeded:[L('coding.board.state.succeeded'),'done','done'],
    failed:[L('coding.board.state.failed'),'failed','blocked'],blocked:[L('coding.board.state.blocked'),'blocked','blocked'],waiting:[L('coding.board.state.waiting'),'waiting','progress'],'needs-reconciliation':[L('coding.board.state.needs-reconciliation'),'verify','attention'],cancelled:[L('coding.state.cancelled'),'cancelled','quiet'],skipped:[L('coding.board.state.skipped'),'cancelled','quiet'],
    accepted:[L('coding.board.state.accepted'),'done','accepted'],'needs-work':[L('coding.board.state.needs-work'),'blocked','attention'],pending:[L('coding.board.state.pending'),'idle','idle'],
  };
  const PHASE={starting:[L('coding.board.phase.starting'),'starting','progress'],running:[L('coding.filter.running'),'running','progress'],compacting:[L('coding.call.compact'),'running','progress'],pausing:[L('coding.phase.pausing'),'paused','attention'],paused:[L('coding.state.paused'),'paused','attention'],
    'awaiting-input':[L('coding.state.waiting-answer'),'answer','attention'],'awaiting-review':[L('coding.state.waiting-approval'),'approval','attention'],completed:[L('coding.board.phase.completed'),'round-ended','done'],failed:[L('coding.timeline.failed'),'failed','blocked'],
    stopped:[L('coding.phase.stopped'),'stopped','quiet'],cancelled:[L('coding.state.cancelled'),'cancelled','quiet'],'reconcile-required':[L('coding.board.phase.reconcile'),'verify','attention']};
  const CHILD={running:[L('coding.filter.running'),'running','progress'],completed:[L('coding.board.child.completed'),'verify','done'],failed:[L('coding.timeline.failed'),'failed','blocked'],cancelled:[L('coding.state.cancelled'),'cancelled','quiet'],stopped:[L('coding.phase.stopped'),'stopped','quiet']};
  const skipped=(node)=>node.state==='cancelled'&&node.reports.some(report=>report.note.startsWith('用户跳过'));
  const stepOf=(plan,node)=>node.inserted?{title:node.title||node.id,acceptance:(node.reports.find(report=>report.note.startsWith('用户插入'))?.note.split('完成条件：')[1])||''}
    :plan?.content.steps[Number(node.id.replace('step-',''))-1]||{title:node.title||node.id,acceptance:''};
  const settled=(node)=>node.state==='succeeded'||skipped(node);
  // The Agent that does the work: the round's own Character when one was chosen, otherwise its role; a subagent is its role.
  const executorOf=(run)=>{const character=run.frozen?.character?.title,role=roleName(run.frozen?.role_id);
    return character?{name:character,detail:L('coding.board.by-character',{character,role})}:{name:role,detail:L('coding.board.by-role',{role})+(run.frozen?.model_id?' · '+L('coding.board.model',{model:run.frozen.model_id}):'')};};
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
      if(data.recovery_required)items.push({key:'recovery',title:L('coding.recovery.title'),state:PHASE['reconcile-required'],target:{kind:'recovery'},executor:null,children:[]});
      if(data.checkpoint_busy)items.push({key:'rewind',title:L('coding.board.rewind'),state:PHASE['awaiting-review'],target:{kind:'reviews'},executor:null,children:[]});
      groups.push({id:'attention',label:L('coding.board.group.attention'),mark:'circle-alert',items});
    }
    // The plan not yet run: its steps as they would be run.
    const plan=data.plan;
    if(plan&&!plans.some(entry=>entry.revision===plan.revision&&entry.board)){
      const steps=plan.content.steps.map((step,index)=>({key:'plan-'+index,label:'S'+(index+1),title:step.title,hint:L('coding.board.acceptance',{acceptance:step.acceptance}),state:STATE.pending,progress:{done:0,total:1},executor:null,target:{kind:'plan'},children:[]}));
      groups.push({id:'plan',label:L('coding.board.group.plan'),mark:'list',count:L('coding.board.revision',{revision:plan.revision}),items:[{key:'plan',label:L('coding.board.plan'),title:plan.content.title,hint:plan.content.change_reason||'',
        state:plan.content.blockers?[L('coding.board.plan.blocked'),'blocked','blocked']:plan.confirmed?[L('coding.board.plan.confirmed'),'ready','ready']:[L('coding.board.plan.unconfirmed'),'approval','attention'],
        progress:{done:0,total:steps.length},executor:null,target:{kind:'plan'},children:steps}]});
    }
    // Each round that ran a plan or dispatched subagents; newest first. Rounds that continued one step graph are one
    // task: the graph shows once, under its latest round, with every round that worked on it named on that row.
    const rounds=[],boardOf=(run)=>plans.find(item=>item.run_id===run.ref.run_id&&item.board)?.board.project_id,spans=new Map();
    runs.forEach((run,index)=>{const id=boardOf(run);if(id)spans.set(id,[...(spans.get(id)||[]),index]);});
    runs.forEach((run,index)=>{
      const id=run.ref.run_id,entry=plans.find(item=>item.run_id===id&&item.board),span=entry?spans.get(entry.board.project_id):[index];
      if(span.at(-1)!==index)return;
      const groupsHere=span.map(at=>subagents.find(item=>item.run_id===runs[at].ref.run_id)).filter(Boolean),group=groupsHere.find(item=>item.error),children=groupsHere.flatMap(item=>item.children.map(child=>({child,run_id:item.run_id})));
      if(!entry&&!children.length&&!plans.some(item=>item.run_id===id))return;
      const executor=executorOf(run),nodes=entry?.board?.nodes||[];
      const childRow=({child,run_id})=>{
        const verdict=child.verdict?.status,role=roleName(child.role_id)||child.role_name,at=startedAt(child);
        const own=child.workspace_path&&run.frozen?.directory?.canonical_path&&child.workspace_path!==run.frozen.directory.canonical_path?child.workspace_path.split('/').filter(Boolean).at(-1):'';
        return {key:'child-'+child.subagent_id,label:L('coding.board.subtask'),title:oneLine(child.task),hint:child.task,
          state:verdict==='accepted'?STATE.accepted:verdict==='needs-work'?STATE['needs-work']:CHILD[child.state]||[L('coding.board.state.unknown'),'verify','idle'],
          progress:null,note:own?L('coding.board.own-directory',{path:own}):'',executor:{name:role,detail:L('coding.board.subagent',{role})+(child.error?' · '+child.error:'')},time:Number.isFinite(at)?when(at):null,
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
        const yours=node.owner?.kind==='person'&&['succeeded','failed'].includes(node.state)?(node.state==='succeeded'?[L('coding.board.state.you-done'),'done','done']:[L('coding.board.state.you-failed'),'failed','blocked']):null;
        const state=decided==='accepted'?STATE.accepted:decided==='needs-work'?STATE['needs-work']:skipped(node)?STATE.skipped:yours||STATE[node.state]||STATE.pending; const shownState=node.state==='running'&&!decided?[state[0],node.owner?.kind==='person'?'doing':(['starting','running','compacting'].includes(run.phase)?'running':['paused','pausing','awaiting-input','awaiting-review'].includes(run.phase)?PHASE[run.phase][1]:'doing'),state[2]]:state;
        const deps=(node.depends_on||[]).map(dep=>nodes.find(other=>other.id===dep)).filter(Boolean).map(dep=>({title:stepOf(entry.plan,dep).title,ready:settled(dep),blocked:['failed','blocked'].includes(dep.state)}));
        const mine=(placed.get(node.id)||[]).map(childRow),last=node.reports.at(-1);
        const holder=node.owner,held=holder?.kind==='subtask'?children.find(item=>item.child.subagent_id===holder.subagent_id)?.child:null;
        // Who does this step: its holder on the graph, not whoever runs the round.
        // A claim held quiet too long by a session with no round running reads as expired, for you to reassign.
        // The Host labels a holder in the Host's language; the page says each kind with a page word, and keeps a subtask's title.
        const holderText=(value)=>{
          if(value.kind==='subtask'){const title=/[「“"](.+?)[」”"]/.exec(value.label||'')?.[1];return title?L('coding.board.holder-subtask',{title}):L('coding.board.subtask');}
          return value.kind==='session'?L('coding.board.this-session'):value.kind==='person'?L('coding.board.you'):value.kind==='none'?L('coding.board.unclaimed'):L('coding.board.holder-other');
        };
        const byText=(by)=>{
          if(!by)return '';
          const title=/^子任务[「“"](.+?)[」”"]$/.exec(by)?.[1];
          return title?L('coding.board.holder-subtask',{title}):by==='本会话'?L('coding.board.this-session'):by==='用户'?L('coding.board.you'):by==='改派'?L('coding.board.reassigned'):by==='没人认领'?L('coding.board.unclaimed'):L('coding.board.holder-other');
        };
        const expired=holder?.expired?{expired:true}:{},holderLabel=holder?holderText(holder):'';
        const doer=!holder?executor:holder.kind==='session'?{name:executor.name,detail:L('coding.board.holder',{holder:holderLabel})+' · '+executor.detail,...expired}
          :holder.kind==='subtask'?{name:holderLabel,detail:L('coding.board.holder',{holder:holderLabel})+(held?' · '+L('coding.board.held-subagent',{role:roleName(held.role_id)||held.role_name}):'')}
          :holder.kind==='person'?{name:L('coding.board.you'),detail:L('coding.board.holder-you'),person:true}
          :holder.kind==='none'?{name:L('coding.board.unclaimed'),detail:L('coding.board.no-holder'),none:true}:{name:holderLabel,detail:L('coding.board.holder',{holder:holderLabel}),...expired};
        const done=mine.length?mine.filter(row=>['done','accepted'].includes(row.state[2])).length:settled(node)||decided==='accepted'?1:0;
        return {key:'step-'+id+'-'+node.id,label:node.inserted?L('coding.board.inserted'):'S'+(Number(node.id.replace('step-',''))||position+1),title:step.title,
          hint:(step.acceptance?L('coding.board.acceptance',{acceptance:step.acceptance}):'')+(holder?'\\n'+L('coding.board.holder',{holder:holderLabel}):'')+(last?'\\n'+L('coding.board.last-report',{report:(last.by?byText(last.by)+L('coding.timeline.colon'):'')+last.note}):''),
          state:shownState,progress:{done,total:mine.length||1},deps,executor:doer,time:last?when(last.at_ms):null,target:{kind:'step',run_id:id,step_id:node.id},children:mine,
          node,live,editable,board:entry.board,runId:id,position};
      });
      // A skipped step leaves the count altogether: it is neither done nor still to do.
      const doneSteps=nodes.filter(node=>settled(node)&&!skipped(node)).length,counted=nodes.filter(node=>!skipped(node)).length;
      const name=entry?.plan?.content.title||clip(firstLine(run.task??ownTask(run.turns?.find(turn=>turn.kind==='user'&&!turn.steer)?.text||'')),90)||L('coding.turn.number',{number:index+1});
      const first=runs[span[0]];
      rounds.unshift({key:'run-'+id,label:span.length>1?'#'+(span[0]+1)+'–'+(index+1):'#'+(index+1),title:name,
        hint:[entry?L('coding.board.plan-revision',{revision:entry.revision??'?'}):'',span.length>1?L('coding.board.continued-turns',{turns:span.map(at=>'#'+(at+1)).join(L('coding.list.joiner'))}):''].filter(Boolean).join('\\n'),state:PHASE[run.phase]||[L('coding.board.state.unknown'),'verify','idle'],
        progress:nodes.length?{done:doneSteps,total:counted||nodes.length}:children.length?{done:children.filter(item=>item.child.state==='completed').length,total:children.length}:null,
        executor,time:when(first.started_at),target:{kind:'run',run_id:id},children:[...steps,...loose.map(childRow)],note:entry?.error||group?.error||''});
    });
    if(rounds.length)groups.push({id:'rounds',label:L('coding.board.group.run'),mark:'play',count:L('coding.board.turns',{count:rounds.length}),items:rounds});
    return groups;
  };
  const renderState=(state)=>{const [label,mark,tone]=state,node=el('span','coding-board-state');node.dataset.tone=tone;
    node.dataset.mwState=mark;node.append(el('span','',label));node.title=label;return node;};
  const renderProgress=(progress)=>{const node=el('span','coding-board-progress');if(!progress){node.classList.add('is-empty');return node;}
    const percent=Math.round(progress.done/Math.max(1,progress.total)*100);node.innerHTML='<span></span><i aria-hidden="true"><b></b></i>';node.firstChild.textContent=progress.done+'/'+progress.total;
    node.querySelector('b').style.setProperty('--board-progress',percent+'%');node.setAttribute('aria-label',L('coding.board.progress',{done:progress.done,total:progress.total}));return node;};
  const renderDeps=(row)=>{
    if(!row.deps?.length){const node=el('span','coding-board-deps is-empty');if(row.note){node.className='coding-board-deps is-note';node.textContent=row.note;node.title=row.note;}return node;}
    const waiting=row.deps.filter(dep=>!dep.ready),blocked=waiting.filter(dep=>dep.blocked);
    const node=el('details','coding-board-deps '+(blocked.length?'is-blocked':waiting.length?'is-waiting':'is-ready')),summary=el('summary');
    summary.textContent=L('coding.board.deps',{count:row.deps.length})+' · '+(blocked.length?L('coding.board.deps-blocked',{count:blocked.length}):waiting.length?L('coding.board.deps-waiting',{count:waiting.length}):L('coding.board.deps-ready'));
    summary.setAttribute('aria-label',L('coding.board.deps-open',{count:row.deps.length}));node.append(summary);
    const box=el('div','coding-board-dep-list');
    for(const dep of row.deps){const item=el('p','coding-board-dep '+(dep.ready?'is-ready':dep.blocked?'is-blocked':'is-waiting'));item.innerHTML=svg('link');item.append(el('strong','',dep.title),el('em','',dep.ready?L('coding.board.dep.ready'):dep.blocked?L('coding.board.dep.blocked'):L('coding.board.dep.waiting')));box.append(item);}
    node.append(box);return node;
  };
  const renderMeta=(row)=>{
    const node=el('span','coding-board-meta'),time=el('time','coding-board-time'+(row.time?'':' is-empty'),row.time?.text||'');if(row.time)time.title=row.time.title;
    const avatar=el('span','coding-board-avatar'+(row.executor&&!row.executor.none?'':' is-unknown')+(row.executor?.person?' is-person':''));
    if(row.executor?.none){node.dataset.owner='none';avatar.innerHTML=svg('user');avatar.title=row.executor.detail;avatar.setAttribute('aria-label',L('coding.board.unclaimed'));}
    else if(row.executor){if(row.executor.person)node.dataset.owner='person';avatar.textContent=Array.from(row.executor.name)[0]||'?';avatar.style.setProperty('--board-avatar-hue',String(hue(row.executor.name)));avatar.title=L('coding.board.executor',{detail:row.executor.detail});avatar.setAttribute('aria-label',L('coding.board.executor-name',{name:row.executor.name}));}
    const name=el('span','coding-board-agent',row.executor?.name||'');if(row.executor)name.title=L('coding.board.executor',{detail:row.executor.detail});
    if(row.executor?.expired){node.dataset.expired='true';const flag=el('span','coding-board-expired',L('coding.board.expired'));flag.title=row.executor.detail;node.append(time,name,flag,avatar);return node;}
    node.append(time,name,avatar);return node;
  };
  const tools=(row,entry)=>{
    if(!row.editable||!row.node)return null;
    const node=row.node,nodes=row.board.nodes,index=row.position,waiting=node.state==='not-started'||node.state==='ready';
    const group=el('span','coding-board-tools');
    const tool=(label,icon,action)=>{const button=el('button','mw-btn mw-btn--ghost mw-btn--icon-only');button.type='button';button.title=label;button.setAttribute('aria-label',label+'：'+row.title);button.innerHTML=svg(icon);
      lifetime.listen(button,'click',event=>{event.stopPropagation();action();});group.append(button);};
    const change=async(amendment)=>{board.dataset.busy='true';try{await amend(row.runId,row.board.version,amendment,row.live);}finally{delete board.dataset.busy;key='';render();}};
    const ask=(fields,label,build)=>{
      list.querySelector('.coding-board-form')?.remove();const form=el('form','coding-board-form');
      // A field is a text input, or with a 'check' kind a labelled checkbox that is off by default.
      const inputs=fields.map(([name,placeholder,max,kind])=>{if(kind==='check'){const label=el('label','coding-board-check'),box=el('input');box.type='checkbox';box.name=name;label.append(box,el('span','',placeholder));form.append(label);return box;}
        const input=el('input','mw-input');input.name=name;input.placeholder=placeholder;input.maxLength=max;input.required=true;form.append(input);return input;});
      const cancel=el('button','mw-btn mw-btn--ghost',L('coding.board.cancel')),ok=el('button','mw-btn mw-btn--primary',label);cancel.type='button';ok.type='submit';form.append(cancel,ok);board.dataset.editing='true';
      const close=()=>{form.remove();delete board.dataset.editing;key='';render();};
      lifetime.listen(cancel,'click',close);lifetime.listen(form,'keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
      lifetime.listen(form,'submit',async event=>{event.preventDefault();if(inputs.some(input=>input.type!=='checkbox'&&!input.value.trim()))return;ok.disabled=true;delete board.dataset.editing;
        await change(build(inputs.map(input=>input.type==='checkbox'?input.checked:input.value.trim())));});
      entry.after(form);inputs[0].focus();
    };
    if(waiting&&index>0&&['not-started','ready'].includes(nodes[index-1].state))tool(L('coding.board.move-up'),'chevron-up',()=>void change({kind:'move',node:node.id,direction:'up'}));
    if(waiting&&['not-started','ready'].includes(nodes[index+1]?.state))tool(L('coding.board.move-down'),'chevron-down',()=>void change({kind:'move',node:node.id,direction:'down'}));
    if(node.state==='blocked')tool(L('coding.board.decide'),'edit',()=>ask([['note',L('coding.board.decide-note'),500]],L('coding.board.decide-ok'),([note])=>({kind:'unblock',node:node.id,note})));
    if(waiting||node.state==='blocked'||node.state==='failed')tool(node.state==='failed'?L('coding.board.pass-over'):L('coding.board.skip'),'minus',()=>ask([['reason',L('coding.board.skip-reason'),300]],L('coding.board.skip'),([reason])=>({kind:'skip',node:node.id,reason})));
    if(node.state!=='cancelled')tool(L('coding.board.insert'),'plus',()=>ask([['title',L('coding.board.insert-title'),120],['acceptance',L('coding.board.insert-acceptance'),300],['mine',L('coding.board.mine'),0,'check']],L('coding.board.insert-ok'),([title,acceptance,mine])=>({kind:'insert',after:node.id,title,acceptance,...(mine?{mine:true}:{})})));
    // Who holds it: take it on yourself, hand it back to the session, and on your own step record how it went.
    const open=!['succeeded','failed','cancelled'].includes(node.state),holder=node.owner?.kind;
    if(open&&holder!=='person')tool(L('coding.board.mine'),'user',()=>void change({kind:'assign',node:node.id,to:'me'}));
    if(open&&holder&&holder!=='session')tool(holder==='none'?L('coding.board.give-session'):L('coding.board.return-session'),'undo',()=>void change({kind:'assign',node:node.id,to:'session'}));
    if(open&&holder==='person'&&node.state!=='not-started'){
      tool(L('coding.board.mark-done'),'check',()=>ask([['note',L('coding.board.mark-done-note'),500]],L('coding.board.mark-done-ok'),([note])=>({kind:'resolve',node:node.id,state:'succeeded',note})));
      tool(L('coding.board.mark-failed'),'x',()=>ask([['note',L('coding.board.mark-failed-note'),500]],L('coding.board.mark-failed'),([note])=>({kind:'resolve',node:node.id,state:'failed',note})));
    }
    return group;
  };
  const renderRow=(row,depth)=>{
    const item=el('li','coding-board-item');item.dataset.boardKey=row.key;item.style.setProperty('--board-depth',String(depth));
    const entry=el('div','coding-board-entry'),lead=el('span','coding-board-lead'),open=!collapsed.has(row.key);
    if(row.children.length){
      const toggle=el('button','coding-board-toggle');toggle.type='button';toggle.innerHTML=svg('chevron-down');toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',L(open?'coding.board.collapse':'coding.board.expand',{title:row.title}));
      lifetime.listen(toggle,'click',()=>{if(collapsed.has(row.key))collapsed.delete(row.key);else collapsed.add(row.key);key='';render();});lead.append(toggle);
    }else lead.append(el('span','coding-board-guide'));
    const main=el('button','coding-board-node');main.type='button';if(row.hint)main.title=row.hint;
    if(row.label)main.append(el('span','coding-board-key',row.label));main.append(el('strong','',row.title));
    lifetime.listen(main,'click',()=>void navigate(owner,row.target).catch(error=>status(error.message,true)));
    // A step a person added for a supplement links back to its receipt in the conversation.
    lead.append(main);
    const source=from(row.node);if(source)lead.append(source);
    entry.append(lead,renderState(row.state),renderProgress(row.progress),renderDeps(row),renderMeta(row));
    const controls=tools(row,entry);if(controls)entry.append(controls);
    item.append(entry);
    if(row.children.length&&open){const children=el('ul','coding-board-children');for(const child of row.children)children.append(renderRow(child,depth+1));item.append(children);}
    return item;
  };
  // What changes the drawing: the graphs, the rounds' phases and executors, the attention items and what is folded.
  const fingerprint=()=>JSON.stringify([owner,data.plan,data.taskboard_plans,(data.runs||[]).map(run=>[run.ref.run_id,run.phase,run.frozen?.character?.title]),data.subagents,data.recovery_required,data.checkpoint_busy,[...collapsed]]);
  // The latest graph in one line: revision, steps done, and who the open steps wait on.
  const summary=()=>{
    const latest=(data.taskboard_plans||[]).filter(entry=>entry.board).at(-1)?.board;
    const unfinished=latest?latest.nodes.filter(node=>!['succeeded','failed','cancelled'].includes(node.state)):[];
    const count=(kind)=>unfinished.filter(node=>node.owner?.kind===kind).length;
    const done=latest?latest.nodes.filter(node=>settled(node)&&!skipped(node)).length:0,total=latest?latest.nodes.filter(node=>!skipped(node)).length:0;
    return {latest,done,total,text:[data.plan?L('coding.board.plan-revision',{revision:data.plan.revision})+' · '+(data.plan.confirmed?L('coding.board.plan.confirmed'):L('coding.board.plan.unconfirmed')):'',latest?L('coding.board.steps-done',{done,total})+(latest.nodes.some(skipped)?' · '+L('coding.board.steps-skipped',{count:latest.nodes.filter(skipped).length}):''):'',
      count('subtask')?L('coding.board.steps-subtask',{count:count('subtask')}):'',count('person')?L('coding.board.steps-person',{count:count('person')}):'',count('none')?L('coding.board.steps-none',{count:count('none')}):''].filter(Boolean).join(' · ')};
  };
  // One compact row of the outline: state mark, key, title, children's count, and who is on it. No controls here.
  const outlineRow=(row,depth)=>{
    const item=el('li','coding-outline-item');item.style.setProperty('--board-depth',String(depth));
    const node=el('button','coding-outline-row');node.type='button';node.dataset.boardKey=row.key;if(row.hint)node.title=row.hint;
    const [label,mark,tone]=row.state,state=el('span','coding-outline-mark');state.dataset.tone=tone;state.dataset.mwState=mark;state.title=label;
    node.append(state);if(row.label)node.append(el('span','coding-board-key',row.label));
    node.append(el('strong','',row.title));node.setAttribute('aria-label',row.label?row.label+' '+row.title+'：'+label:row.title+'：'+label);
    if(row.progress&&row.children.length)node.append(el('span','coding-outline-count',row.progress.done+'/'+row.progress.total));
    if(row.executor){const avatar=el('span','coding-board-avatar'+(row.executor.none?' is-unknown':'')+(row.executor.person?' is-person':''));
      if(row.executor.none)avatar.innerHTML=svg('user');else{avatar.textContent=Array.from(row.executor.name)[0]||'?';avatar.style.setProperty('--board-avatar-hue',String(hue(row.executor.name)));}
      avatar.title=row.executor.none?row.executor.detail:L('coding.board.executor',{detail:row.executor.detail});node.append(avatar);}
    outlineTargets.set(row.key,row.target);item.append(node);
    if(row.children.length){const children=el('ul','coding-outline-children');for(const child of row.children)children.append(outlineRow(child,depth+1));item.append(children);}
    return item;
  };
  const renderOutline=()=>{
    if(!outline||outline.hidden)return;
    const rows=outline.querySelector('[data-coding-outline-list]'),note=outline.querySelector('[data-coding-outline-status]'),brief=outline.querySelector('[data-coding-outline-meta]'),expand=outline.querySelector('[data-coding-board-expand]');
    // No session on show (none chosen, or its tab closed): the outline says where to choose one, whatever it holds.
    if(!data||!onShow()){rows.replaceChildren();brief.textContent='';brief.hidden=true;if(expand)expand.disabled=true;outlineKey='';
      note.textContent=loadError||(owner&&onShow()?L('coding.board.reading'):L('coding.board.outline-empty'));return;}
    const next=fingerprint();if(next===outlineKey)return;outlineKey=next;
    const groups=tree(),line=summary();
    brief.textContent=line.text;brief.hidden=!line.text;if(expand)expand.disabled=false;
    note.textContent=loadError||data.error||(groups.length?L('coding.board.outline-note'):empty);
    rows.replaceChildren();outlineTargets.clear();
    for(const group of groups){
      const heading=el('h2','mw-dir__heading',group.label+' ');heading.append(el('small','',group.count||String(group.items.length)));rows.append(heading);
      const tree_=el('ul','coding-outline-tree');for(const row of group.items)tree_.append(outlineRow(row,0));rows.append(tree_);
    }
  };
  const renderBoard=()=>{
    if(board.hidden)return;
    if(!data){list.replaceChildren();title.textContent='TaskBoard';meta.textContent='';notice.textContent=loadError||(owner?L('coding.board.reading'):L('coding.board.pick-session'));return;}
    if(board.dataset.editing==='true'||board.dataset.busy==='true')return;
    const next=fingerprint();
    if(next===key)return;key=next;
    const scroll=board.scrollTop,groups=tree();
    title.textContent='TaskBoard';
    meta.textContent=summary().text;
    notice.textContent=loadError||data.error||(groups.length?L('coding.board.notice'):empty);
    list.replaceChildren();
    for(const group of groups){
      const fold=el('details','coding-board-fold');fold.open=!collapsed.has('group:'+group.id);fold.dataset.boardGroup=group.id;
      const summary=el('summary');summary.innerHTML='<span class="coding-board-caret">'+svg('chevron-down')+'</span><span class="coding-board-fold-mark">'+svg(group.mark)+'</span>';
      summary.append(el('strong','',group.label),el('small','',group.count||String(group.items.length)));
      lifetime.listen(fold,'toggle',()=>{if(fold.open)collapsed.delete('group:'+group.id);else collapsed.add('group:'+group.id);});
      const rows=el('ul','coding-board-tree');for(const row of group.items)rows.append(renderRow(row,0));
      fold.append(summary,rows);list.append(fold);
    }
    board.scrollTop=scroll;
  };
  const render=()=>{
    const line=data&&!loadError?summary():null;progress(line?.latest?line.done+'/'+line.total:'');
    renderBoard();renderOutline();
  };
  return {
    // How a step reads, the same on the plan card in the conversation (plan-progress-client.ts).
    stepOf,skipped,settled,
    loading(id){if(id!==owner){owner=id;data=null;key='';outlineKey='';loadError='';collapsed.clear();board.scrollTop=0;}render();},
    update(id,value){if(id!==current())return;if(id!==owner){key='';outlineKey='';collapsed.clear();board.scrollTop=0;}owner=id;data=value;loadError='';render();},
    fail(id,message){if(id!==owner)return;loadError=L('coding.board.unreadable',{reason:message});key='';outlineKey='';render();},
    show(){board.hidden=false;key='';render();},
    hide(){board.hidden=true;},
    showOutline(){if(!outline)return;outline.hidden=false;outlineKey='';render();},
    hideOutline(){if(outline)outline.hidden=true;},
    // What is on show changed (a tab closed or reopened): draw the outline again from what it holds.
    refreshOutline(){outlineKey='';render();},
  };
}`;
