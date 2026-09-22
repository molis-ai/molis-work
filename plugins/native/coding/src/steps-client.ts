/** User assessments stay separate from original SDK reports and never mutate the graph. */
export const CODING_STEPS_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const {q,api,current,status,refresh,prepareRework}=ports,dialog=q('[data-coding-step-dialog]'),detail=q('[data-coding-step-detail]'),notes=q('[data-coding-step-notes]'),message=q('[data-coding-step-status]');
  const accept=q('[data-coding-step-accept]'),reject=q('[data-coding-step-reject]'),rework=q('[data-coding-step-rework]'),reload=q('[data-coding-step-refresh]');
  let owner='',runId='',stepId='',data=null,entry=null,node=null,verdict=null,busy=false,ticket=0;
  const states={'not-started':'等待前置步骤',ready:'待执行',running:'模型报告执行中',succeeded:'模型报告成功，待用户核对',failed:'模型报告失败',cancelled:'模型报告取消',blocked:'模型报告阻塞'};
  const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
  const key=()=> 'molis-coding-step-notes:'+location.pathname+':'+owner+':'+runId+':'+stepId;
  const remember=()=>{try{sessionStorage.setItem(key(),notes.value);}catch{}};
  const update=()=>{
    const run=data?.runs.find(run=>run.ref.run_id===runId),ended=run&&['completed','failed','stopped','cancelled'].includes(run.phase);
    const available=Boolean(ended && node?.reports.length && !entry?.board_error && !data?.recovery_required && !data?.checkpoint_busy);
    accept.disabled=busy||!available||node.state!=='succeeded';reject.disabled=busy||!available;reload.disabled=busy;
    rework.disabled=busy||verdict?.status!=='needs-work';notes.disabled=busy;
  };
  const read=async()=>{
    const at=ticket,id=owner;busy=true;update();message.textContent='正在读取原步骤回报…';
    try{
      const value=await api('/sessions/'+encodeURIComponent(id));if(at!==ticket||id!==current())return;
      data=value;entry=value.taskboard_plans?.find(entry=>entry.run_id===runId && entry.board?.nodes.some(node=>node.id===stepId));
      node=entry?.board.nodes.find(node=>node.id===stepId);verdict=entry?.verdicts?.[stepId]||null;detail.replaceChildren();
      if(!node||!entry.plan)throw new Error('原步骤回报暂不可读；不能判断完成情况。');
      const index=entry.board.nodes.findIndex(node=>node.id===stepId),step=entry.plan.content.steps[index];
      detail.append(el('p','原执行 '+runId+' · 固定计划修订 '+entry.revision),el('h3',step.title),el('p','完成条件：'+step.acceptance),el('p',states[node.state]||'状态暂不可读'));
      const reports=el('ol','');for(const report of node.reports)reports.append(el('li',report.note));detail.append(reports);
      if(!node.reports.length)detail.append(el('p','尚无模型步骤回报。'));
      if(verdict){detail.append(el('p',verdict.status==='accepted'?'用户已验收通过':'用户要求返工'),el('p',verdict.notes));if(verdict.board_id!==entry.board.board_id||verdict.board_version!==entry.board.version)detail.append(el('p','这条评价对应较早回报，请重新核对当前版本。'));}
      else detail.append(el('p','用户尚未评价。'));
      if(!notes.value && verdict?.notes)notes.value=verdict.notes;
      const run=data.runs.find(run=>run.ref.run_id===runId);message.textContent=['completed','failed','stopped','cancelled'].includes(run.phase)?'原执行已经结束；步骤回报保留原状态，请分别核对。':'本轮仍在执行，结束后可以评价；可重新读取最新回报。';
    }catch(error){if(at===ticket){entry=null;node=null;verdict=null;message.textContent=error.message;}}
    finally{if(at===ticket){busy=false;update();}}
  };
  const save=async(action)=>{
    if(busy||!node||!entry?.board)return;const at=ticket,id=owner;busy=true;update();remember();message.textContent='正在保存评价…';
    try{await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(runId)+'/steps/'+encodeURIComponent(stepId),'POST',{
      action,notes:notes.value,expected_revision:verdict?.revision||0,board_id:entry.board.board_id,board_version:entry.board.version});
      if(at!==ticket)return;try{sessionStorage.removeItem(key());}catch{}await read();if(id===current())await refresh();
      if(at===ticket)message.textContent=action==='accepted'?'已保存用户验收；原模型回报保持。':'返工说明已保存；可据此调整下一版计划。';
    }catch(error){if(at===ticket)message.textContent=error.message;}
    finally{if(at===ticket){busy=false;update();}}
  };
  notes.addEventListener('input',remember);accept.addEventListener('click',()=>void save('accepted'));reject.addEventListener('click',()=>void save('needs-work'));
  reload.addEventListener('click',()=>void read());q('[data-coding-step-close]').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{remember();ticket++;busy=false;});
  rework.addEventListener('click',()=>{if(busy||verdict?.status!=='needs-work')return;const reason='原执行 '+runId+' / 计划修订 '+entry.revision+' / '+stepId+' 需返工：'+verdict.notes;dialog.close();try{prepareRework(reason);}catch(error){status(error.message,true);}});
  return {sync(id){if(dialog.open && owner!==id)dialog.close();},async open(id,run,step){if(busy){status('原步骤请求仍在处理，请稍后重试。',true);return;}ticket++;owner=id;runId=run;stepId=step;data=null;entry=null;node=null;verdict=null;detail.replaceChildren();notes.value='';try{notes.value=sessionStorage.getItem(key())||'';}catch{}dialog.showModal();await read();}};
}`;
