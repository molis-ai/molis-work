import { parseCodingPlan, parseCodingPlanAnswer } from "./plans.js";
/** Plan drafts are UI inputs; execution state is always projected from Run records. */
export const CODING_PLANS_CLIENT_FACTORY_SCRIPT = `(ports) => {
  const lifetime=ports.lifetime;
  const parseCodingPlan=${parseCodingPlan.toString()};
  const parseCodingPlanAnswer=${parseCodingPlanAnswer.toString()};
  const {q,api,current,execute,status}=ports;
  let plan=null,runs=[],owner='',busy=false,editor=null,renderKey='',revision=0;
  const region=q('[data-coding-plan]'),dialog=q('[data-coding-plan-dialog]');
  const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  const button=(text,action,disabled=false)=>{const node=element('button',text,'mw-btn');node.type='button';node.disabled=disabled;lifetime.listen(node,'click',()=>void action());return node;};
  const path=()=>'/sessions/'+encodeURIComponent(owner)+'/plan';
  const field=(label,value,multiline=false)=>{const node=element('label',undefined,'mw-field'),input=element(multiline?'textarea':'input',undefined,'mw-input');node.append(element('span',label),input);input.value=value;if(multiline)input.rows=3;return {node,input};};
  const describe=(parent,content)=>{
    parent.append(element('h3',content.title));const list=element('ol');
    for(const [index,step] of content.steps.entries()){const item=element('li');item.append(element('p',step.title),element('p',L('coding.board.acceptance',{acceptance:step.acceptance})));
      if(index && step.after)item.append(element('p',step.after.length?L('coding.plan.after',{steps:step.after.join(L('coding.list.joiner'))}):L('coding.plan.after-none-long'),'coding-plan-after'));list.append(item);}parent.append(list);
    if(content.blockers)parent.append(element('p',L('coding.plan.blockers',{blockers:content.blockers})));
    if(content.change_reason)parent.append(element('p',L('coding.plan.change-reason',{reason:content.change_reason})));
  };
  const storedKey=id=>'molis-coding-plan-editor:'+location.pathname+':'+id;
  // Keep real edits, not an untouched form that could mask a newer saved revision.
  const shape=(content)=>JSON.stringify({title:content?.title||'',steps:(content?.steps||[]).map(step=>({title:step.title||'',acceptance:step.acceptance||'',...(step.after?{after:step.after}:{})})),blockers:content?.blockers||'',change_reason:content?.change_reason||''});
  const remember=()=>{if(!editor)return;try{const now=values();if(shape(now)===editor.base)sessionStorage.removeItem(storedKey(editor.id));else sessionStorage.setItem(storedKey(editor.id),JSON.stringify({revision:editor.revision,content:now}));}catch{}};
  // A step's waits are typed as earlier step numbers: empty keeps the default (the step before), 无 means none.
  const afterText=after=>after===undefined?'':after.length?after.join(L('coding.list.joiner')):L('coding.plan.none');
  const afterOf=text=>{const value=text.trim();if(!value)return undefined;if(/^(无|没有|不等|none|0)$/i.test(value))return [];return value.split(/[\\s,，、]+/).filter(Boolean).map(Number);};
  // Reordering or removing steps renumbers them; every typed wait follows its step, and a wait on a removed step is dropped.
  const renumber=map=>{for(const step of editor.steps){const after=afterOf(step.after.value);if(!after?.length)continue;const next=after.map(map).filter(n=>n!==null);step.after.value=next.length?afterText(next):'';}};
  const values=()=>({title:editor.title.value,steps:editor.steps.map(step=>{const after=afterOf(step.after.value);return {title:step.title.value,acceptance:step.acceptance.value,...(after===undefined?{}:{after})};}),blockers:editor.blockers.value,change_reason:editor.reason.value});
  const edit=()=>{
    if(!plan)return;const content=structuredClone(plan.content);let saved;
    dialog.querySelector('h2').textContent=L('coding.plan.title');dialog.setAttribute('aria-label',L('coding.plan.title'));q('[data-coding-plan-save]').hidden=false;
    q('[data-coding-plan-help]').textContent=L('coding.plan.edit-help');
    try{saved=JSON.parse(sessionStorage.getItem(storedKey(owner)) || 'null');}catch{}
    const draft=saved?.content?.steps?saved.content:content;
    editor={id:owner,revision:plan.revision,base:shape(plan.content),steps:[]};const body=q('[data-coding-plan-fields]');body.replaceChildren();
    if(saved && saved.revision!==plan.revision){const comparison=element('details');comparison.append(element('summary',L('coding.plan.saved-version',{revision:plan.revision})));describe(comparison,content);
      body.append(comparison,button(L('coding.plan.discard',{revision:plan.revision}),()=>{try{sessionStorage.removeItem(storedKey(owner));}catch{}edit();}));}
    const title=field(L('coding.plan.title-field'),draft.title);editor.title=title.input;body.append(title.node);
    const steps=element('div');body.append(steps);
    const add=(value={title:'',acceptance:''})=>{
      const row=element('section',undefined,'coding-material'),title=field(L('coding.plan.step'),value.title),acceptance=field(L('coding.board.insert-acceptance'),value.acceptance,true);
      const after=field(L('coding.plan.after-field'),afterText(value.after));after.input.inputMode='numeric';after.node.dataset.codingPlanAfter='';
      const entry={title:title.input,acceptance:acceptance.input,after:after.input};editor.steps.push(entry);row.append(title.node,acceptance.node,after.node);
      row.append(button(L('coding.plan.move-up'),()=>{const index=editor.steps.indexOf(entry);if(index>0){[editor.steps[index-1],editor.steps[index]]=[editor.steps[index],editor.steps[index-1]];steps.insertBefore(row,row.previousElementSibling);renumber(n=>n===index?index+1:n===index+1?index:n);remember();}}));
      row.append(button(L('coding.plan.remove-step'),()=>{const gone=editor.steps.indexOf(entry)+1;editor.steps=editor.steps.filter(one=>one!==entry);row.remove();renumber(n=>n===gone?null:n>gone?n-1:n);remember();}));steps.append(row);
    };
    for(const step of draft.steps)add(step);
    body.append(button(L('coding.plan.add-step'),()=>{if(editor.steps.length<20){add();remember();}else q('[data-coding-plan-error]').textContent=L('coding.plan.max-steps');}));
    const blockers=field(L('coding.plan.blockers-field'),draft.blockers,true),reason=field(L('coding.plan.reason-field'),draft.change_reason,true);
    editor.blockers=blockers.input;editor.reason=reason.input;body.append(blockers.node,reason.node);
    q('[data-coding-plan-error]').textContent=saved && saved.revision!==plan.revision?L('coding.plan.newer'):'';
    if(!dialog.open)dialog.showModal();
  };
  const fixed=async(revision)=>{
    const id=owner,data=await api(path()+'?revision='+revision);if(id!==current())return;
    editor=null;dialog.querySelector('h2').textContent=L('coding.plan.fixed-title',{revision});q('[data-coding-plan-save]').hidden=true;
    dialog.setAttribute('aria-label',L('coding.plan.fixed'));q('[data-coding-plan-help]').textContent=L('coding.plan.fixed-help');
    const body=q('[data-coding-plan-fields]');body.replaceChildren();describe(body,data.plan.content);
    q('[data-coding-plan-error]').textContent=L('coding.plan.fixed-note');dialog.showModal();
  };
  const action=async(fn)=>{
    if(busy)return;const id=owner;busy=true;renderKey='';render();
    try{await fn(id);}catch(error){if(!lifetime.alive)return;if(id===current())status(error.message,true);}
    finally{busy=false;renderKey='';if(id===current())render();}
  };
  const render=()=>{
    const active=runs.some(run=>!['completed','failed','stopped','cancelled'].includes(run.phase));
    // Only answers that read as a plan are offered as proposals; an unreadable one keeps its note in the conversation.
    const readable=run=>{if(!run.turns)return true;try{parseCodingPlanAnswer((run.turns.filter(turn=>turn.kind==='assistant').at(-1)?.text || '').trim());return true;}catch{return false;}};
    const planners=runs.filter(run=>run.frozen.role_id==='planner' && run.phase==='completed' && readable(run));
    const key=JSON.stringify([owner,plan,planners.map(run=>run.ref.run_id),runs.map(run=>[run.ref.run_id,run.phase]),busy]);if(key===renderKey)return;renderKey=key;
    region.replaceChildren();region.hidden=!plan && !planners.length;
    region.append(element('h3',L('coding.board.plan')));
    if(plan){
      region.append(element('p',L('coding.board.revision',{revision:plan.revision})+' · '+(plan.confirmed?L('coding.board.plan.confirmed'):L('coding.board.plan.unconfirmed'))));describe(region,plan.content);
      const origin=element('details'),label=element('summary',L('coding.plan.source'));origin.append(label,element('p',plan.source.task));region.append(origin);
      region.append(button(L('coding.plan.view-adjust'),edit,busy));
      const execution=plan.confirmed?runs.find(run=>run.frozen.text_materials.some(item=>item.source_artifact_id===plan.confirmed.artifact_id && item.source_version===plan.confirmed.version)):null;
      if(execution){
        const names={completed:L('coding.plan.run.completed'),failed:L('coding.plan.run.failed'),stopped:L('coding.plan.run.stopped'),cancelled:L('coding.state.cancelled'), 'awaiting-review':L('coding.plan.run.awaiting-review'),'awaiting-input':L('coding.phase.awaiting-input'),'reconcile-required':L('coding.plan.run.reconcile')};
        region.append(element('p',names[execution.phase] || L('coding.plan.run.running')));
        region.append(button(L('coding.plan.view-run'),()=>{const block=[...q('[data-coding-turns]').children].find(node=>node.dataset.run===execution.ref.run_id);if(block){block.scrollIntoView({block:'start'});block.tabIndex=-1;block.focus({preventScroll:true});}}));
      }else if(plan.confirmed)region.append(button(L('coding.plan.execute'),()=>action(()=>execute(plan.revision)),busy || active));
      else{region.append(button(L('coding.plan.confirm'),()=>action(async id=>{const data=await api(path()+'/confirm','POST',{expected_revision:plan.revision});if(id===current()){plan=data.plan;status(L('coding.plan.confirmed',{revision:plan.revision}));}}),busy || Boolean(plan.content.blockers)));
        if(plan.content.blockers)region.append(element('p',L('coding.plan.blocked-note')));}
      region.append(element('p',L('coding.plan.confirm-note')));
    }
    for(const [index,run] of runs.entries())for(const material of run.frozen.text_materials){
      const prefix='coding-plan:'+owner+':';if(!material.source_artifact_id.startsWith(prefix))continue;
      const revision=Number(material.source_artifact_id.slice(prefix.length));if(!Number.isSafeInteger(revision)||revision<1)continue;
      region.append(button(L('coding.plan.turn-plan',{number:index+1,revision}),()=>action(()=>fixed(revision)),busy));
      if(plan && revision!==plan.revision)region.append(element('p',L('coding.plan.turn-uses',{number:index+1,revision})));
    }
    for(const run of planners.filter(run=>run.ref.run_id!==plan?.source.run_id))region.append(button(L('coding.plan.turn-proposal',{number:runs.indexOf(run)+1}),()=>action(async id=>{
      const data=await api(path(),'POST',{run_id:run.ref.run_id,expected_revision:plan?.revision ?? revision});if(id===current()){plan=data.plan;edit();}
    }),busy));
  };
  lifetime.listen(q('[data-coding-plan-form]'),'input',remember);
  lifetime.listen(q('[data-coding-plan-close]'),'click',()=>{remember();dialog.close();});
  lifetime.listen(dialog,'cancel',remember);
  lifetime.listen(q('[data-coding-plan-form]'),'submit',async event=>{
    event.preventDefault();if(!editor || busy)return;remember();const draft=editor;busy=true;q('[data-coding-plan-save]').disabled=true;
    try{const data=await api('/sessions/'+encodeURIComponent(draft.id)+'/plan','POST',{expected_revision:draft.revision,content:values()});
      try{sessionStorage.removeItem(storedKey(draft.id));}catch{}
      if(draft.id===current()){plan=data.plan;dialog.close();editor=null;status(L('coding.plan.saved'));}
    }catch(error){if(!lifetime.alive)return;q('[data-coding-plan-error]').textContent=error.message;}
    finally{busy=false;q('[data-coding-plan-save]').disabled=false;renderKey='';render();}
  });
  return {
    prepareStepRework(reason){if(!plan)throw new Error(L('coding.plan.unreadable'));edit();editor.reason.value=[editor.reason.value,reason].filter(Boolean).join('\\n');remember();q('[data-coding-plan-error]').textContent=L('coding.plan.rework');},
    openFixed:fixed,
    update(id,value,nextRuns,epoch=0){if(owner!==id){remember();dialog.close();editor=null;renderKey='';plan=null;}owner=id;revision=epoch;if(!plan || !value || value.revision>plan.revision || value.revision===plan.revision && (!plan.confirmed || value.confirmed))plan=value;runs=nextRuns;render();},
    renderTurn(node,run,turn){
      if(run.frozen.role_id!=='planner' || turn.kind!=='assistant' || !(/^\\s*\\{/.test(turn.text) || turn.text.includes('\\n{') || turn.text.includes('\x60\x60\x60')))return false;
      node.replaceChildren();
      try{const content=parseCodingPlanAnswer(turn.text);node.append(element('p',L('coding.plan.proposal')));describe(node,content);const detail=element('details');detail.append(element('summary',L('coding.plan.planner-answer')),element('pre',turn.text));node.append(detail);}
      catch{node.append(element('p',run.phase==='completed'?L('coding.plan.proposal-incomplete'):L('coding.plan.forming')));const detail=element('details'),summary=element('summary',L('coding.plan.answer'));detail.append(summary,element('pre',turn.text));node.append(detail);}
      return true;
    }
  };
}`;
