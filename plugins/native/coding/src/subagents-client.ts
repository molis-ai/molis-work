/** UI projections never turn a runtime completion into user acceptance. */
export const CODING_SUBAGENTS_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const {q,api,current,status,refresh,usageSummary,prepareRework}=ports,region=q('[data-coding-subagents]');let key='',pending=new Set();
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const draftKey=id=>'coding-subagent-feedback:'+location.pathname+':'+id;
  const button=(label,action,disabled)=>{const node=el('button',label);node.type='button';node.className='mw-btn';node.disabled=Boolean(disabled);node.addEventListener('click',()=>void action());return node;};
  const states={running:'执行中',completed:'本轮结束，结果待核对',failed:'执行失败',cancelled:'已停止','reconcile-required':'中断结果待核对'};
  return { update(id,groups){
    const next=JSON.stringify([id,groups,[...pending]]);if(key===next)return;key=next;
    const opened=new Set([...region.querySelectorAll('details[open]')].map(node=>node.dataset.child));
    const focused=document.activeElement,focusId=region.contains(focused)?focused.dataset.feedback:undefined,selection=focusId?[focused.selectionStart,focused.selectionEnd]:null;
    region.replaceChildren();region.hidden=!groups.length;if(!groups.length)return;
    region.append(el('h3','子任务'),el('p','父任务负责汇总与复核；子任务结束不代表结果被接受。'));
    for(const group of groups){
      if(group.error){region.append(el('p','子任务暂不可读取：'+group.error));continue;}
      if(!group.children.length){region.append(el('p','尚未派出子任务。'));continue;}
      for(const child of group.children){
        const resultState=child.state==='completed'&&child.verdict?(child.verdict.status==='accepted'?'本轮结束，结果已接受':'本轮结束，需返工'):states[child.state];
        const row=el('details'),summary=el('summary',(child.role_name || child.role_id)+' · '+resultState);row.dataset.child=child.subagent_id;row.open=opened.has(child.subagent_id);row.append(summary);
        const assignment=el('details');assignment.className='coding-material';assignment.dataset.child=child.subagent_id+':assignment';assignment.open=opened.has(assignment.dataset.child);assignment.append(el('summary','查看任务与权限'),el('p',child.task),el('p','工作区：'+(child.workspace_path || '未知')),el('p','工具上限：'+(child.host_tools || []).join('、')));row.append(assignment);
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
