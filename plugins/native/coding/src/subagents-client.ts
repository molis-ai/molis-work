/** UI projections never turn a runtime completion into user acceptance. */
export const CODING_SUBAGENTS_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const {q,api,current,status,refresh,usageSummary,prepareRework}=ports,region=q('[data-coding-subagents]');let key='',pending=new Set(),lastGroups=[],lastId='';
  // Two results side by side, as Cursor compares attempts: retries of one subtask, or two takes on the same question.
  const compare=[];
  const edits=(child)=>[...new Set((child.activity || []).filter(item=>['edit','write'].includes(item.name)&&item.state==='completed'&&item.target).map(item=>item.target))];
  const column=(child)=>{const box=el('article');box.className='coding-compare-column';
    box.append(el('h4',(child.role_name || child.role_id)+(child.workspace_path?'（'+child.workspace_path.split('/').pop()+'）':'')),el('p',states[child.state] || child.state));
    const files=edits(child);box.append(el('p',files.length?'改动的文件：'+files.join('、'):'没有改动文件'));
    const tokens=child.usage?.tokens;if(tokens)box.append(el('p','用量：'+((tokens.input||0)+(tokens.output||0)).toLocaleString()+' tokens'));
    if(child.result){const body=el('div');body.className='coding-turn';if(child.result_html)body.innerHTML=child.result_html;else body.textContent=child.result;box.append(body);}
    if(child.error)box.append(el('p','运行信息：'+child.error));
    return box;};
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const draftKey=id=>'coding-subagent-feedback:'+location.pathname+':'+id;
  const button=(label,action,disabled)=>{const node=el('button',label);node.type='button';node.className='mw-btn';node.disabled=Boolean(disabled);node.addEventListener('click',()=>void action());return node;};
  const states={running:'执行中',completed:'本轮结束，结果待核对',failed:'执行失败',cancelled:'已停止','reconcile-required':'中断结果待核对'};
  return { update(id,groups){
    lastGroups=groups;lastId=id;
    const next=JSON.stringify([id,groups,[...pending],compare]);if(key===next)return;key=next;
    const opened=new Set([...region.querySelectorAll('details[open]')].map(node=>node.dataset.child));
    const focused=document.activeElement,focusId=region.contains(focused)?focused.dataset.feedback:undefined,selection=focusId?[focused.selectionStart,focused.selectionEnd]:null;
    region.replaceChildren();region.hidden=!groups.length;if(!groups.length)return;
    region.append(el('h3','子任务'),el('p','父任务负责汇总与复核；子任务结束不代表结果被接受。'));
    const all=groups.flatMap(group=>group.children || []);
    for(let index=compare.length-1;index>=0;index--)if(!all.some(child=>child.subagent_id===compare[index]))compare.splice(index,1);
    if(compare.length===2){const view=el('section');view.className='coding-compare';view.setAttribute('aria-label','子任务结果对比');
      const head=el('div');head.className='coding-compare-head';head.append(el('strong','并排对比'),button('清空对比',()=>{compare.length=0;key='';this.update(lastId,lastGroups);}));
      view.append(head,...compare.map(id=>column(all.find(child=>child.subagent_id===id))));region.append(view);}
    else if(all.filter(child=>child.state!=='running').length>1)region.append(el('p','勾选两个子任务的"加入对比"，可以并排看它们的结论和改动。'));
    for(const group of groups){
      if(group.error){region.append(el('p','子任务暂不可读取：'+group.error));continue;}
      if(!group.children.length){region.append(el('p','尚未派出子任务。'));continue;}
      for(const child of group.children){
        const resultState=child.state==='completed'&&child.verdict?(child.verdict.status==='accepted'?'本轮结束，结果已接受':'本轮结束，需返工'):states[child.state];
        // Subtasks of one role look alike; the directory each worked in tells them apart.
        const row=el('details'),summary=el('summary',(child.role_name || child.role_id)+(child.workspace_path?'（'+child.workspace_path.split('/').pop()+'）':'')+' · '+resultState);row.dataset.child=child.subagent_id;row.open=opened.has(child.subagent_id);row.append(summary);
        const assignment=el('details');assignment.className='coding-material';assignment.dataset.child=child.subagent_id+':assignment';assignment.open=opened.has(assignment.dataset.child);assignment.append(el('summary','查看任务与权限'),el('p',child.task),el('p','工作区：'+(child.workspace_path || '未知')),el('p','工具上限：'+(child.host_tools || []).join('、')));row.append(assignment);
        if(child.state!=='running'){const pick=el('label'),box=el('input');pick.className='mw-check-row';box.type='checkbox';box.className='mw-check';box.checked=compare.includes(child.subagent_id);
          box.addEventListener('change',()=>{const at=compare.indexOf(child.subagent_id);if(box.checked&&at<0){compare.push(child.subagent_id);if(compare.length>2)compare.shift();}else if(!box.checked&&at>=0)compare.splice(at,1);key='';this.update(lastId,lastGroups);});
          pick.append(box,el('span','加入对比'));row.append(pick);}
        if(child.result){const result=el('div');result.className='coding-turn';if(child.result_html)result.innerHTML=child.result_html;else result.textContent=child.result;row.append(result);}
        if(child.error)row.append(el('p','运行信息：'+child.error));
        for(const activity of child.activity || [])row.append(el('p',activity.name+' · '+activity.state));
        if(child.usage)row.append(el('p','此子任务用量：'+usageSummary(child.usage)+'；不含在父任务小计中。'));
        if(child.verdict)row.append(el('p',(child.verdict.status==='accepted'?'用户已接受此结果':'用户要求返工')+'：'+(child.verdict.notes || '无补充说明')));
        const act=async(action,notes='')=>{
          if(pending.has(child.subagent_id))return;pending.add(child.subagent_id);key='';
          try{await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(group.run_id)+'/subagents/'+encodeURIComponent(child.subagent_id),'POST',{action,notes,expected_revision:child.verdict?.revision ?? 0});
            if(action!=='stop'){try{sessionStorage.removeItem(draftKey(child.subagent_id));}catch{}}
            if(action==='needs-work')await prepareRework(id,group.run_id,child,notes);
            if(current()===id){status(action==='needs-work'?'返工原因已保存，任务已加入输入框，发送后才执行。原结果继续保留。':action==='stop'?'已请求停止原子任务。':'已保存对这份结果的评价。');await refresh();}
          }catch(error){if(current()===id)status(error.message,true);}finally{pending.delete(child.subagent_id);key='';}
        };
        if(child.state==='running')row.append(button('停止此子任务',()=>act('stop'),pending.has(child.subagent_id)));
        // Ended badly but wrote files in its own directory: the work may be whole or partial, so it is shown, never assumed.
        if(['failed','cancelled'].includes(child.state)&&child.integration_available&&(child.activity||[]).some(item=>['edit','write'].includes(item.name)&&item.state==='completed')){
          row.append(el('p','这个子任务没有正常结束，但在自己的目录里改过文件；改动可能不完整，看过差异再决定是否整合。'));
          row.append(button('查看改动并决定是否整合',()=>ports.openIntegration(id,group.run_id,child),pending.has(child.subagent_id)));
        }
        if(child.state==='completed'){
          if(child.integration_available)row.append(button('查看成果并整合',()=>ports.openIntegration(id,group.run_id,child),pending.has(child.subagent_id)));
          const label=el('label'),input=el('textarea');label.className='mw-field';label.append(el('span','结果评价或返工原因'));input.className='mw-input';input.rows=2;input.maxLength=4000;input.dataset.feedback=child.subagent_id;
          try{input.value=sessionStorage.getItem(draftKey(child.subagent_id)) ?? '';}catch{}
          input.addEventListener('input',()=>{try{sessionStorage.setItem(draftKey(child.subagent_id),input.value);}catch{}});label.append(input);row.append(label);
          row.append(button('接受此结果',()=>act('accepted',input.value),pending.has(child.subagent_id)),button('标记需返工并准备任务',()=>act('needs-work',input.value),pending.has(child.subagent_id)));
        }
        region.append(row);
      }
    }
    if(focusId){const node=[...region.querySelectorAll('textarea')].find(node=>node.dataset.feedback===focusId);if(node){node.focus({preventScroll:true});node.setSelectionRange(...selection);}}
  }};
}`;
