/** User assessments stay separate from original SDK reports and never mutate the graph. */
export const CODING_STEPS_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const lifetime=ports.lifetime;
  const {q,api,current,status,refresh,prepareRework,receipts}=ports,dialog=q('[data-coding-step-dialog]'),detail=q('[data-coding-step-detail]'),notes=q('[data-coding-step-notes]'),message=q('[data-coding-step-status]');
  const accept=q('[data-coding-step-accept]'),reject=q('[data-coding-step-reject]'),rework=q('[data-coding-step-rework]'),reload=q('[data-coding-step-refresh]');
  let owner='',runId='',stepId='',data=null,entry=null,node=null,verdict=null,busy=false,ticket=0;
  const states={'not-started':L('coding.step.state.not-started'),ready:L('coding.step.state.ready'),running:L('coding.step.state.running'),succeeded:L('coding.step.state.succeeded'),failed:L('coding.step.state.failed'),cancelled:L('coding.step.state.cancelled'),blocked:L('coding.step.state.blocked')};
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
    const at=ticket,id=owner;busy=true;update();message.textContent=L('coding.step.reading');
    try{
      const value=await api('/sessions/'+encodeURIComponent(id));if(at!==ticket||id!==current())return;
      data=value;entry=value.taskboard_plans?.find(entry=>entry.run_id===runId && entry.board?.nodes.some(node=>node.id===stepId));
      node=entry?.board.nodes.find(node=>node.id===stepId);verdict=entry?.verdicts?.[stepId]||null;detail.replaceChildren();
      if(!node||!entry.plan)throw new Error(L('coding.step.unreadable'));
      const step=node.inserted?{title:node.title||node.id,acceptance:(node.reports.find(report=>report.note.startsWith('用户插入'))?.note.split('完成条件：')[1])||L('coding.step.see-insert')}:entry.plan.content.steps[Number(node.id.replace('step-',''))-1]||{title:node.title||node.id,acceptance:''};
      detail.append(el('p',L('coding.step.run',{run:runId,revision:entry.revision})),el('h3',step.title),el('p',L('coding.step.acceptance',{acceptance:step.acceptance})),el('p',states[node.state]||L('coding.step.state.unknown')));
      // Who holds the step now, and who made each report (a handover says so).
      if(node.owner)detail.append(el('p',L('coding.step.owner',{owner:node.owner.kind==='person'?L('coding.step.you'):node.owner.label})));
      const reports=el('ol','');
      // A report naming a supplement opens its receipt in the conversation, when this page drew one.
      for(const report of node.reports){const li=el('li',(report.by?report.by.label+L('coding.timeline.colon'):'')+report.note);for(const one of report.inputs||[]){const link=receipts.link(q('[data-coding-turns]'),one.input_id,()=>dialog.close());if(link)li.append(' ',link);}reports.append(li);}
      detail.append(reports);
      if(!node.reports.length)detail.append(el('p',L('coding.step.no-reports')));
      if(verdict){detail.append(el('p',verdict.status==='accepted'?L('coding.step.accepted'):L('coding.step.needs-work')),el('p',verdict.notes));if(verdict.project_id!==entry.board.project_id||verdict.board_version!==entry.board.version)detail.append(el('p',L('coding.step.stale-verdict')));}
      else detail.append(el('p',L('coding.step.no-verdict')));
      if(!notes.value && verdict?.notes)notes.value=verdict.notes;
      const run=data.runs.find(run=>run.ref.run_id===runId);message.textContent=['completed','failed','stopped','cancelled'].includes(run.phase)?L('coding.step.run-ended'):L('coding.step.run-running');
    }catch(error){if(!lifetime.alive)return;if(at===ticket){entry=null;node=null;verdict=null;message.textContent=error.message;}}
    finally{if(at===ticket){busy=false;update();}}
  };
  const save=async(action)=>{
    if(busy||!node||!entry?.board)return;const at=ticket,id=owner;busy=true;update();remember();message.textContent=L('coding.step.saving');
    try{await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(runId)+'/steps/'+encodeURIComponent(stepId),'POST',{
      action,notes:notes.value,expected_revision:verdict?.revision||0,project_id:entry.board.project_id,board_version:entry.board.version});
      if(at!==ticket)return;try{sessionStorage.removeItem(key());}catch{}await read();if(id===current())await refresh();
      if(at===ticket)message.textContent=action==='accepted'?L('coding.step.saved-accepted'):L('coding.step.saved-rework');
    }catch(error){if(!lifetime.alive)return;if(at===ticket)message.textContent=error.message;}
    finally{if(at===ticket){busy=false;update();}}
  };
  lifetime.listen(notes,'input',remember);lifetime.listen(accept,'click',()=>void save('accepted'));lifetime.listen(reject,'click',()=>void save('needs-work'));
  lifetime.listen(reload,'click',()=>void read());lifetime.listen(q('[data-coding-step-close]'),'click',()=>dialog.close());lifetime.listen(dialog,'close',()=>{remember();ticket++;busy=false;});
  lifetime.listen(rework,'click',()=>{if(busy||verdict?.status!=='needs-work')return;const reason='原执行 '+runId+' / 计划修订 '+entry.revision+' / '+stepId+' 需返工：'+verdict.notes;dialog.close();try{prepareRework(reason);}catch(error){if(!lifetime.alive)return;status(error.message,true);}});
  return {sync(id){if(dialog.open && owner!==id)dialog.close();},async open(id,run,step){if(busy){status(L('coding.step.busy'),true);return;}ticket++;owner=id;runId=run;stepId=step;data=null;entry=null;node=null;verdict=null;detail.replaceChildren();notes.value='';try{notes.value=sessionStorage.getItem(key())||'';}catch{}dialog.showModal();await read();}};
}`;
