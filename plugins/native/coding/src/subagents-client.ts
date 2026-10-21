/** UI projections never turn a runtime completion into user acceptance. */
export const CODING_SUBAGENTS_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const lifetime=ports.lifetime;
  const {q,api,current,status,refresh,usageSummary,prepareRework}=ports,region=q('[data-coding-subagents]');let key='',pending=new Set(),lastGroups=[],lastId='';
  // Two results side by side, as Cursor compares attempts: retries of one subtask, or two takes on the same question.
  const compare=[];
  const edits=(child)=>[...new Set((child.activity || []).filter(item=>['edit','write'].includes(item.name)&&item.state==='completed'&&item.target).map(item=>item.target))];
  const column=(child)=>{const box=el('article');box.className='coding-compare-column';
    box.append(el('h4',(child.role_name || child.role_id)+(child.workspace_path?'（'+child.workspace_path.split('/').pop()+'）':'')),el('p',states[child.state] || child.state));
    const files=edits(child);box.append(el('p',files.length?L('coding.sub.files',{files:files.join(L('coding.list.joiner'))}):L('coding.sub.no-files')));
    const tokens=child.usage?.tokens;if(tokens)box.append(el('p',L('coding.sub.usage',{tokens:((tokens.input||0)+(tokens.output||0)).toLocaleString()})));
    if(child.result){const body=el('div');body.className='coding-turn';if(child.result_html)body.innerHTML=child.result_html;else body.textContent=child.result;box.append(body);}
    if(child.error)box.append(el('p',L('coding.sub.error',{error:child.error})));
    return box;};
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const draftKey=id=>'coding-subagent-feedback:'+location.pathname+':'+id;
  const button=(label,action,disabled)=>{const node=el('button',label);node.type='button';node.className='mw-btn';node.disabled=Boolean(disabled);lifetime.listen(node,'click',()=>void action());return node;};
  const states={running:L('coding.state.running'),completed:L('coding.sub.state.completed'),failed:L('coding.phase.failed'),cancelled:L('coding.phase.stopped'),'reconcile-required':L('coding.plan.run.reconcile')};
  return { update(id,groups){
    lastGroups=groups;lastId=id;
    const next=JSON.stringify([id,groups,[...pending],compare]);if(key===next)return;key=next;
    const opened=new Set([...region.querySelectorAll('details[open]')].map(node=>node.dataset.child));
    const focused=document.activeElement,focusId=region.contains(focused)?focused.dataset.feedback:undefined,selection=focusId?[focused.selectionStart,focused.selectionEnd]:null;
    region.replaceChildren();region.hidden=!groups.length;if(!groups.length)return;
    region.append(el('h3',L('coding.sub.title')),el('p',L('coding.sub.note')));
    const all=groups.flatMap(group=>group.children || []);
    for(let index=compare.length-1;index>=0;index--)if(!all.some(child=>child.subagent_id===compare[index]))compare.splice(index,1);
    if(compare.length===2){const view=el('section');view.className='coding-compare';view.setAttribute('aria-label',L('coding.sub.compare-label'));
      const head=el('div');head.className='coding-compare-head';head.append(el('strong',L('coding.sub.compare')),button(L('coding.sub.compare-clear'),()=>{compare.length=0;key='';this.update(lastId,lastGroups);}));
      view.append(head,...compare.map(id=>column(all.find(child=>child.subagent_id===id))));region.append(view);}
    else if(all.filter(child=>child.state!=='running').length>1)region.append(el('p',L('coding.sub.compare-hint')));
    for(const group of groups){
      if(group.error){region.append(el('p',L('coding.sub.unreadable',{reason:group.error})));continue;}
      if(!group.children.length){region.append(el('p',L('coding.sub.none')));continue;}
      for(const child of group.children){
        const resultState=child.state==='completed'&&child.verdict?(child.verdict.status==='accepted'?L('coding.sub.state.accepted'):L('coding.sub.state.needs-work')):states[child.state];
        // Subtasks of one role look alike; the directory each worked in tells them apart.
        const row=el('details'),summary=el('summary',(child.role_name || child.role_id)+(child.workspace_path?'（'+child.workspace_path.split('/').pop()+'）':'')+' · '+resultState);row.dataset.child=child.subagent_id;row.open=opened.has(child.subagent_id);row.append(summary);
        const assignment=el('details');assignment.className='coding-material';assignment.dataset.child=child.subagent_id+':assignment';assignment.open=opened.has(assignment.dataset.child);assignment.append(el('summary',L('coding.sub.assignment')),el('p',child.task),el('p',L('coding.sub.workspace',{path:child.workspace_path || L('coding.sub.unknown')})),el('p',L('coding.sub.tools',{tools:(child.host_tools || []).join(L('coding.list.joiner'))})));row.append(assignment);
        if(child.state!=='running'){const pick=el('label'),box=el('input');pick.className='mw-check-row';box.type='checkbox';box.className='mw-check';box.checked=compare.includes(child.subagent_id);
          lifetime.listen(box,'change',()=>{const at=compare.indexOf(child.subagent_id);if(box.checked&&at<0){compare.push(child.subagent_id);if(compare.length>2)compare.shift();}else if(!box.checked&&at>=0)compare.splice(at,1);key='';this.update(lastId,lastGroups);});
          pick.append(box,el('span',L('coding.sub.compare-add')));row.append(pick);}
        if(child.result){const result=el('div');result.className='coding-turn';if(child.result_html)result.innerHTML=child.result_html;else result.textContent=child.result;row.append(result);}
        if(child.error)row.append(el('p',L('coding.sub.error',{error:child.error})));
        for(const activity of child.activity || [])row.append(el('p',activity.name+' · '+activity.state));
        if(child.usage)row.append(el('p',L('coding.sub.own-usage',{usage:usageSummary(child.usage)})));
        if(child.verdict)row.append(el('p',L(child.verdict.status==='accepted'?'coding.sub.verdict.accepted':'coding.sub.verdict.needs-work',{notes:child.verdict.notes || L('coding.sub.verdict.no-notes')})));
        const act=async(action,notes='')=>{
          if(pending.has(child.subagent_id))return;pending.add(child.subagent_id);key='';
          try{await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(group.run_id)+'/subagents/'+encodeURIComponent(child.subagent_id),'POST',{action,notes,expected_revision:child.verdict?.revision ?? 0});
            if(action!=='stop'){try{sessionStorage.removeItem(draftKey(child.subagent_id));}catch{}}
            if(action==='needs-work')await prepareRework(id,group.run_id,child,notes);
            if(current()===id){status(action==='needs-work'?L('coding.sub.rework-saved'):action==='stop'?L('coding.sub.stop-asked'):L('coding.sub.verdict-saved'));await refresh();}
          }catch(error){if(!lifetime.alive)return;if(current()===id)status(error.message,true);}finally{pending.delete(child.subagent_id);key='';}
        };
        if(child.state==='running')row.append(button(L('coding.sub.stop'),()=>act('stop'),pending.has(child.subagent_id)));
        // Ended badly but wrote files in its own directory: the work may be whole or partial, so it is shown, never assumed.
        if(['failed','cancelled'].includes(child.state)&&child.integration_available&&(child.activity||[]).some(item=>['edit','write'].includes(item.name)&&item.state==='completed')){
          row.append(el('p',L('coding.sub.partial')));
          row.append(button(L('coding.sub.look'),()=>ports.openIntegration(id,group.run_id,child),pending.has(child.subagent_id)));
        }
        if(child.state==='completed'){
          if(child.integration_available)row.append(button(L('coding.sub.integrate'),()=>ports.openIntegration(id,group.run_id,child),pending.has(child.subagent_id)));
          const label=el('label'),input=el('textarea');label.className='mw-field';label.append(el('span',L('coding.sub.feedback')));input.className='mw-input';input.rows=2;input.maxLength=4000;input.dataset.feedback=child.subagent_id;
          try{input.value=sessionStorage.getItem(draftKey(child.subagent_id)) ?? '';}catch{}
          lifetime.listen(input,'input',()=>{try{sessionStorage.setItem(draftKey(child.subagent_id),input.value);}catch{}});label.append(input);row.append(label);
          row.append(button(L('coding.sub.accept'),()=>act('accepted',input.value),pending.has(child.subagent_id)),button(L('coding.sub.rework'),()=>act('needs-work',input.value),pending.has(child.subagent_id)));
        }
        region.append(row);
      }
    }
    if(focusId){const node=[...region.querySelectorAll('textarea')].find(node=>node.dataset.feedback===focusId);if(node){node.focus({preventScroll:true});node.setSelectionRange(...selection);}}
  }};
}`;
