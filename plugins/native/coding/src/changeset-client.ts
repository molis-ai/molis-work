/** Fixed review reader; only the existing composer can submit model work. */
export const CODING_CHANGESET_CLIENT_FACTORY_SCRIPT = `(ports) => {
  const {root,q,api}=ports;
  let runId='',ticket=0,index=0,value=null,comments=[];
  const reader=q('[data-coding-change-reader]'),message=q('[data-coding-change-status]');
  const key=()=> 'molis-coding-feedback:'+root.dataset.codingPrefix+':'+ports.current()+':'+runId;
  const remember=()=>{try{localStorage.setItem(key(),JSON.stringify(comments));}catch{message.textContent='意见暂未保存到本机，请保留当前窗口。';}};
  const close=()=>{ticket++;runId='';value=null;reader.hidden=true;};
  const renderComments=()=>{
    const list=q('[data-coding-feedback-list]');list.replaceChildren();
    comments.forEach((comment,n)=>{
      const file=value?.change.files[comment.change_index];
      const row=document.createElement('div'),label=document.createElement('label'),input=document.createElement('textarea'),remove=document.createElement('button');
      row.className='mw-form__field';label.textContent=(file?.path || '原文件')+' · 修改 '+(comment.change_index+1)+' · '+(comment.side==='before'?'修改前':'修改后')+'第 '+comment.line+' 行';
      input.className='mw-textarea';input.rows=2;input.value=comment.comment;input.maxLength=5000;input.setAttribute('aria-label',label.textContent+'意见');
      input.addEventListener('input',()=>{comment.comment=input.value;remember();});
      remove.type='button';remove.className='mw-btn mw-btn--ghost';remove.textContent='移除意见';remove.addEventListener('click',()=>{comments.splice(n,1);remember();renderComments();});
      label.append(input);row.append(label,remove);list.append(row);
    });
    q('[data-coding-feedback-return]').disabled=!comments.length || !value?.reference;
  };
  const open=async(nextRun,save=false,nextIndex=0)=>{
    const id=ports.current(),token=++ticket,scrollToStart=!runId || runId!==nextRun || index!==nextIndex;
    if(!runId)ports.closeReport();
    if(runId!==nextRun){comments=[];runId=nextRun;try{const saved=JSON.parse(localStorage.getItem(key()) || '[]');if(Array.isArray(saved))comments=saved;}catch{}}
    index=nextIndex;value=null;reader.hidden=false;
    q('[data-coding-change-save]').disabled=true;q('[data-coding-feedback-return]').disabled=true;
    message.textContent=save?'正在保存原审查的固定版本…':'正在读取本轮审查…';
    try{
      const result=await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(nextRun)+'/changeset?change_index='+index,save?'POST':'GET');
      if(ticket!==token || id!==ports.current())return;
      value=result;q('[data-coding-change-body]').innerHTML=result.html;
      const statuses={applied:'已执行',failed:'执行失败',unknown:'执行结果未知','not-applied':'未执行'}, decisions={pending:'待审',approved:'已批准',rejected:'已拒绝',cancelled:'已取消',expired:'已过期'};
      const list=q('[data-coding-change-files]');list.replaceChildren();
      result.change.files.forEach((file,n)=>{const button=document.createElement('button');button.type='button';button.className='mw-btn mw-btn--ghost';button.textContent='修改 '+(n+1)+' · '+file.path+' · '+(decisions[file.review?.decision] || '旧版记录')+' / '+(statuses[file.review?.execution] || '未知');button.setAttribute('aria-pressed',String(n===index));button.addEventListener('click',()=>{void open(nextRun,false,n);});list.append(button);});
      message.textContent=(result.reference?'固定 v'+result.reference.version+' · '+new Date(result.saved_at).toLocaleString('zh-CN'):'尚未保存；先固定原审查，再按行反馈。')+' 这里是本轮文本审查，包含未执行提案；命令和外部操作请看原回执。';
      q('[data-coding-change-save]').disabled=Boolean(result.reference);
      const output=q('[data-coding-change-output]'),selected=result.reference && result.output?.artifact_id===result.reference.artifact_id && result.output?.version===result.reference.version;
      if(scrollToStart)q('[data-coding-tools]').scrollTop=0;output.disabled=!result.reference || selected;output.textContent=selected?'已作为变更输出':'设为变更输出';renderComments();
    }catch(error){if(ticket===token){message.textContent=error.message;q('[data-coding-change-body]').replaceChildren();q('[data-coding-change-files]').replaceChildren();}}
  };
  root.addEventListener('click',async(event)=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.hasAttribute('data-coding-change-open')){await open(target.dataset.codingChangeOpen);return;}
    if(target.hasAttribute('data-coding-change-close')){close();return;}
    if(target.hasAttribute('data-coding-change-save') && runId){await open(runId,true,index);return;}
    if(target.hasAttribute('data-coding-change-output') && value?.reference){
      const id=ports.current(),run=runId,token=ticket;target.disabled=true;
      try{await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(run)+'/changeset/output','POST',{expected_reference:value.output});if(id===ports.current() && token===ticket)await open(run,false,index);}
      catch(error){if(token===ticket){message.textContent=error.message;target.disabled=false;}}return;
    }
    if(target.hasAttribute('data-coding-line') && value?.reference){
      if(comments.length>=30){message.textContent='一次最多填写 30 条意见。';return;}
      comments.push({change_index:index,side:target.dataset.codingLineSide,line:Number(target.dataset.codingLine),comment:''});remember();renderComments();
      q('[data-coding-feedback-list]').lastElementChild?.querySelector('textarea')?.focus();return;
    }
    if(target.hasAttribute('data-coding-feedback-return') && value?.reference){
      const id=ports.current(),run=runId,token=ticket;target.disabled=true;
      try{
        const result=await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(run)+'/changeset/feedback','POST',{comments});
        if(id!==ports.current() || ticket!==token)return;
        await ports.appendDraft(result.task);
        if(id!==ports.current() || ticket!==token)return;
        comments=[];remember();close();ports.focusDraft();
      }catch(error){if(ticket===token){message.textContent=error.message;target.disabled=false;}}
    }
  });
  return {close,active:()=>Boolean(runId),render:(runs)=>{
    const list=q('[data-coding-changes-list]'),ended=runs.filter(run=>['completed','failed','stopped','cancelled'].includes(run.phase));
    q('[data-coding-changes]').hidden=!ended.length;
    for(const run of ended){let button=[...list.children].find(node=>node.dataset.codingChangeOpen===run.ref.run_id);if(!button){button=document.createElement('button');button.type='button';button.className='mw-btn';button.dataset.codingChangeOpen=run.ref.run_id;list.append(button);}button.textContent='第 '+(runs.indexOf(run)+1)+' 轮 · 查看固定变更';}
  }};
}`;
