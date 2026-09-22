import { parseCodingPlan, parseCodingPlanAnswer } from "./plans.js";
/** Plan drafts are UI inputs; execution state is always projected from Run records. */
export const CODING_PLANS_CLIENT_FACTORY_SCRIPT = `(ports) => {
  const parseCodingPlan=${parseCodingPlan.toString()};
  const parseCodingPlanAnswer=${parseCodingPlanAnswer.toString()};
  const {q,api,current,execute,status}=ports;
  let plan=null,runs=[],owner='',busy=false,editor=null,renderKey='';
  const region=q('[data-coding-plan]'),dialog=q('[data-coding-plan-dialog]');
  const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  const button=(text,action,disabled=false)=>{const node=element('button',text,'mw-btn');node.type='button';node.disabled=disabled;node.addEventListener('click',()=>void action());return node;};
  const path=()=>'/sessions/'+encodeURIComponent(owner)+'/plan';
  const field=(label,value,multiline=false)=>{const node=element('label',undefined,'mw-field'),input=element(multiline?'textarea':'input',undefined,'mw-input');node.append(element('span',label),input);input.value=value;if(multiline)input.rows=3;return {node,input};};
  const describe=(parent,content)=>{
    parent.append(element('h3',content.title));const list=element('ol');
    for(const step of content.steps){const item=element('li');item.append(element('p',step.title),element('p','完成条件：'+step.acceptance));list.append(item);}parent.append(list);
    if(content.blockers)parent.append(element('p','待解决：'+content.blockers));
    if(content.change_reason)parent.append(element('p','变更说明：'+content.change_reason));
  };
  const storedKey=id=>'molis-coding-plan-editor:'+location.pathname+':'+id;
  const remember=()=>{if(!editor)return;try{sessionStorage.setItem(storedKey(editor.id),JSON.stringify({revision:editor.revision,content:values()}));}catch{}};
  const values=()=>({title:editor.title.value,steps:editor.steps.map(step=>({title:step.title.value,acceptance:step.acceptance.value})),blockers:editor.blockers.value,change_reason:editor.reason.value});
  const edit=()=>{
    if(!plan)return;const content=structuredClone(plan.content);let saved;
    dialog.querySelector('h2').textContent='调整计划';dialog.setAttribute('aria-label','调整计划');q('[data-coding-plan-save]').hidden=false;
    q('[data-coding-plan-help]').textContent='按依赖顺序安排步骤，每步写清完成条件。保存修改后需要重新确认；正在执行的任务继续使用原固定版本。';
    try{saved=JSON.parse(sessionStorage.getItem(storedKey(owner)) || 'null');}catch{}
    const draft=saved?.content?.steps?saved.content:content;
    editor={id:owner,revision:plan.revision,steps:[]};const body=q('[data-coding-plan-fields]');body.replaceChildren();
    if(saved && saved.revision!==plan.revision){const comparison=element('details');comparison.append(element('summary','查看当前已保存版本 · 修订 '+plan.revision));describe(comparison,content);body.append(comparison);}
    const title=field('计划标题',draft.title);editor.title=title.input;body.append(title.node);
    const steps=element('div');body.append(steps);
    const add=(value={title:'',acceptance:''})=>{
      const row=element('section',undefined,'coding-material'),title=field('步骤',value.title),acceptance=field('完成条件',value.acceptance,true);
      const entry={title:title.input,acceptance:acceptance.input};editor.steps.push(entry);row.append(title.node,acceptance.node);
      row.append(button('上移',()=>{const index=editor.steps.indexOf(entry);if(index>0){[editor.steps[index-1],editor.steps[index]]=[editor.steps[index],editor.steps[index-1]];steps.insertBefore(row,row.previousElementSibling);remember();}}));
      row.append(button('移除步骤',()=>{editor.steps=editor.steps.filter(one=>one!==entry);row.remove();remember();}));steps.append(row);
    };
    for(const step of draft.steps)add(step);
    body.append(button('添加步骤',()=>{if(editor.steps.length<20){add();remember();}else q('[data-coding-plan-error]').textContent='最多 20 步，请合并相关工作。';}));
    const blockers=field('尚未解决的阻塞（没有则留空）',draft.blockers,true),reason=field('变更理由（调整已确认计划时必填）',draft.change_reason,true);
    editor.blockers=blockers.input;editor.reason=reason.input;body.append(blockers.node,reason.node);
    q('[data-coding-plan-error]').textContent=saved && saved.revision!==plan.revision?'计划已有新修订。下方保留你的未保存修改，请先对照当前已保存版本再合并保存。':'';
    dialog.showModal();
  };
  const fixed=async(revision)=>{
    const id=owner,data=await api(path()+'?revision='+revision);if(id!==current())return;
    editor=null;dialog.querySelector('h2').textContent='执行使用的计划 · 修订 '+revision;q('[data-coding-plan-save]').hidden=true;
    dialog.setAttribute('aria-label','执行使用的计划');q('[data-coding-plan-help]').textContent='固定版本只供核对。需要改变后续工作时，关闭后调整当前计划并重新确认。';
    const body=q('[data-coding-plan-fields]');body.replaceChildren();describe(body,data.plan.content);
    q('[data-coding-plan-error]').textContent='这是执行时确认的固定版本；后续草稿修改不会改变它。';dialog.showModal();
  };
  const action=async(fn)=>{
    if(busy)return;const id=owner;busy=true;renderKey='';render();
    try{await fn(id);}catch(error){if(id===current())status(error.message,true);}
    finally{busy=false;renderKey='';if(id===current())render();}
  };
  const render=()=>{
    const active=runs.some(run=>!['completed','failed','stopped','cancelled'].includes(run.phase));
    const planners=runs.filter(run=>run.frozen.role_id==='planner' && run.phase==='completed');
    const key=JSON.stringify([owner,plan,planners.map(run=>run.ref.run_id),runs.map(run=>[run.ref.run_id,run.phase]),busy]);if(key===renderKey)return;renderKey=key;
    region.replaceChildren();region.hidden=!plan && !planners.length;
    region.append(element('h3','计划'));
    if(plan){
      region.append(element('p','修订 '+plan.revision+' · '+(plan.confirmed?'已确认':'待确认')));describe(region,plan.content);
      const origin=element('details'),label=element('summary','原任务与工作区');origin.append(label,element('p',plan.source.task),element('p',plan.source.workspace_path));region.append(origin);
      region.append(button('查看并调整计划',edit,busy));
      const execution=plan.confirmed?runs.find(run=>run.frozen.text_materials.some(item=>item.source_artifact_id===plan.confirmed.artifact_id && item.source_version===plan.confirmed.version)):null;
      if(execution){
        const names={completed:'本轮结束，步骤尚需核对',failed:'执行失败，请查看原轮次',stopped:'已停止，请核对已发生操作',cancelled:'已取消', 'awaiting-review':'等待修改或命令审查','awaiting-input':'等待回答','reconcile-required':'中断结果待核对'};
        region.append(element('p',names[execution.phase] || '正在按此版本执行'));
        region.append(button('查看计划执行',()=>{const block=[...q('[data-coding-turns]').children].find(node=>node.dataset.run===execution.ref.run_id);if(block){block.scrollIntoView({block:'start'});block.tabIndex=-1;block.focus({preventScroll:true});}}));
      }else if(plan.confirmed)region.append(button('按此计划执行',()=>action(()=>execute(plan.revision)),busy || active));
      else region.append(button('确认此计划版本',()=>action(async id=>{const data=await api(path()+'/confirm','POST',{expected_revision:plan.revision});if(id===current())plan=data.plan;}),busy || Boolean(plan.content.blockers)));
      region.append(element('p','确认计划不批准修改或命令；执行结束不等于步骤通过。'));
    }
    for(const [index,run] of runs.entries())for(const material of run.frozen.text_materials){
      const prefix='coding-plan:'+owner+':';if(!material.source_artifact_id.startsWith(prefix))continue;
      const revision=Number(material.source_artifact_id.slice(prefix.length));if(!Number.isSafeInteger(revision)||revision<1)continue;
      region.append(button('查看第 '+(index+1)+' 轮使用的计划 · 修订 '+revision,()=>action(()=>fixed(revision)),busy));
      if(plan && revision!==plan.revision)region.append(element('p','第 '+(index+1)+' 轮使用修订 '+revision+'；当前草稿修改不改变这轮执行。'));
    }
    for(const run of planners.filter(run=>run.ref.run_id!==plan?.source.run_id))region.append(button('查看第 '+(runs.indexOf(run)+1)+' 轮计划提案',()=>action(async id=>{
      const data=await api(path(),'POST',{run_id:run.ref.run_id,expected_revision:plan?.revision ?? 0});if(id===current()){plan=data.plan;edit();}
    }),busy));
  };
  q('[data-coding-plan-form]').addEventListener('input',remember);
  q('[data-coding-plan-close]').addEventListener('click',()=>{remember();dialog.close();});
  dialog.addEventListener('cancel',remember);
  q('[data-coding-plan-form]').addEventListener('submit',async event=>{
    event.preventDefault();if(!editor || busy)return;remember();const draft=editor;busy=true;q('[data-coding-plan-save]').disabled=true;
    try{const data=await api('/sessions/'+encodeURIComponent(draft.id)+'/plan','POST',{expected_revision:draft.revision,content:values()});
      try{sessionStorage.removeItem(storedKey(draft.id));}catch{}
      if(draft.id===current()){plan=data.plan;dialog.close();editor=null;status('计划修改已保存，需确认这一修订后才能执行。');}
    }catch(error){q('[data-coding-plan-error]').textContent=error.message;}
    finally{busy=false;q('[data-coding-plan-save]').disabled=false;renderKey='';render();}
  });
  return {
    update(id,value,nextRuns){if(owner!==id){remember();dialog.close();editor=null;renderKey='';plan=null;}owner=id;if(!plan || value?.revision>plan.revision || value?.revision===plan.revision && (!plan.confirmed || value.confirmed))plan=value;runs=nextRuns;render();},
    renderTurn(node,run,turn){
      if(run.frozen.role_id!=='planner' || turn.kind!=='assistant' || !(/^\\s*\\{/.test(turn.text) || turn.text.includes('\x60\x60\x60')))return false;
      node.replaceChildren();
      try{const content=parseCodingPlanAnswer(turn.text);node.append(element('p','模型计划提案 · 确认版本请查看右侧计划'));describe(node,content);const detail=element('details');detail.append(element('summary','查看规划原回答'),element('pre',turn.text));node.append(detail);}
      catch{node.append(element('p',run.phase==='completed'?'提案格式未完成，请查看原回答后补充要求。':'正在形成计划…'));const detail=element('details'),summary=element('summary','查看原回答');detail.append(summary,element('pre',turn.text));node.append(detail);}
      return true;
    }
  };
}`;
