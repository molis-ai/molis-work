/** Fixed review reader; only the existing composer can submit model work. */
export const CODING_CHANGESET_CLIENT_FACTORY_SCRIPT = `(ports) => {
  const {root,q,api}=ports;
  let runId='',ticket=0,index=0,value=null,comments=[],fixed=false,net=false,netIndices=null;
  const reader=q('[data-coding-change-reader]'),message=q('[data-coding-change-status]');
  const key=()=> 'molis-coding-feedback:'+root.dataset.codingPrefix+':'+ports.current()+':'+runId;
  const remember=()=>{try{localStorage.setItem(key(),JSON.stringify(comments));}catch{message.textContent='意见暂未保存到本机，请保留当前窗口。';}};
  const close=()=>{ticket++;runId='';value=null;fixed=false;net=false;netIndices=null;reader.hidden=true;};
  const lineLabel=(comment)=>(comment.side==='before'?'修改前':'修改后')+' 第 '+comment.line+' 行';
  const renderComments=()=>{
    const list=q('[data-coding-feedback-list]');list.replaceChildren();
    comments.forEach((comment,n)=>{
      const file=value?.change.files[comment.change_index];
      const row=document.createElement('div'),head=document.createElement('div'),where=document.createElement('span'),input=document.createElement('textarea'),remove=document.createElement('button');
      row.className='coding-feedback-item';head.className='coding-feedback-where';
      where.textContent=(file?.path || '原文件')+' · 写入 '+(comment.change_index+1)+' · '+lineLabel(comment);where.title=where.textContent;
      input.className='mw-textarea';input.rows=2;input.value=comment.comment;input.maxLength=5000;input.placeholder='想让 Agent 怎么改这一行？';input.setAttribute('aria-label',where.textContent+' 的意见');
      input.addEventListener('input',()=>{comment.comment=input.value;remember();});
      remove.type='button';remove.className='mw-btn mw-btn--ghost coding-feedback-remove';remove.setAttribute('aria-label','移除这条意见');remove.title='移除这条意见';remove.innerHTML='<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
      remove.addEventListener('click',()=>{comments.splice(n,1);remember();renderComments();});
      head.append(where,remove);row.append(head,input);list.append(row);
    });
    q('[data-coding-feedback-count]').textContent=comments.length?comments.length+' 条':'';
    q('[data-coding-feedback-return]').disabled=!comments.length || !value?.reference;
    // In the net view, after-side lines are the last write's result and before-side lines the first write's original.
    const shown=(comment)=>net && netIndices ? (comment.side==='after' ? comment.change_index===netIndices.at(-1) : comment.change_index===netIndices[0]) : comment.change_index===index;
    const commented=new Set(comments.filter(shown).map(comment=>comment.side+':'+comment.line));
    reader.querySelectorAll('[data-coding-line]').forEach(button=>{button.closest('li')?.toggleAttribute('data-coding-commented',commented.has(button.dataset.codingLineSide+':'+button.dataset.codingLine));});
  };
  const TONES={applied:['done','已写入'],failed:['failed','写入失败'],unknown:['attention','结果未知'],'not-applied':['idle','未写入']};
  const DECISIONS={rejected:'已拒绝',cancelled:'已取消',expired:'已过期',pending:'待审'};
  const stateOf=(file)=>{
    if(!file.review)return ['idle','旧版记录'];
    if(file.review.decision!=='approved' && DECISIONS[file.review.decision])return ['idle',DECISIONS[file.review.decision]];
    return TONES[file.review.execution] || ['attention','结果未知'];
  };
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const counts=(file)=>{const box=el('span','coding-change-counts');box.append(el('ins','','+'+file.added_lines),el('del','','−'+file.removed_lines));return box;};
  const pathLabel=(path)=>{const box=el('span','coding-change-path'),cut=path.lastIndexOf('/');if(cut>=0)box.append(el('span','coding-change-dir',path.slice(0,cut+1)));box.append(el('b','',path.slice(cut+1)));box.title=path;return box;};
  const renderFiles=(files,runValue)=>{
    const nav=q('[data-coding-change-files]');nav.replaceChildren();
    const groups=new Map();files.forEach((file,n)=>{if(!groups.has(file.path))groups.set(file.path,[]);groups.get(file.path).push(n);});
    const pick=(n)=>{const button=el('button','coding-change-write');button.type='button';button.dataset.codingChangeIndex=String(n);button.setAttribute('aria-pressed',String(!net && n===index));button.addEventListener('click',()=>{if(net || n!==index)void open(runValue,false,n,fixed,'0');});return button;};
    const state=(file)=>{const [tone,label]=stateOf(file),node=el('span','coding-change-state',label);node.dataset.tone=tone;return node;};
    for(const [path,list] of groups){
      const first=files[list[0]],group=el('div','coding-change-file');group.dataset.kind=first.kind;
      if(list.length===1){const button=pick(list[0]);button.setAttribute('aria-pressed',String(list[0]===index));button.classList.add('is-file');button.append(el('span','coding-change-icon'),pathLabel(path),el('span','coding-change-kind',first.kind==='added'?'新建':'修改'),counts(first),state(first));button.firstChild.innerHTML='<svg aria-hidden="true"><use href="#icon-file"></use></svg>';group.append(button);}
      else{
        const head=el('div','coding-change-file-head'),writes=el('span','coding-change-kind',list.length+' 次写入'),netGroup=(value?.net_groups || []).find(item=>item.path===path);
        if(netGroup && !netGroup.available)writes.title=netGroup.reason;
        head.append(el('span','coding-change-icon'),pathLabel(path),writes);head.firstChild.innerHTML='<svg aria-hidden="true"><use href="#icon-file"></use></svg>';group.append(head);
        if(netGroup?.available){
          const whole=el('button','coding-change-write is-net');whole.type='button';whole.dataset.codingChangeNet=path;whole.setAttribute('aria-pressed',String(net && list.includes(index)));
          whole.append(el('span','coding-change-step','本轮净变更'));whole.addEventListener('click',()=>{if(!(net && list.includes(index)))void open(runValue,false,list[0],fixed,'1');});group.append(whole);
        }
        list.forEach((n,order)=>{const file=files[n],button=pick(n);button.append(el('span','coding-change-step','第 '+(order+1)+' 次'+(file.kind==='added'&&order===0?' · 新建':'')),counts(file),state(file));group.append(button);});
      }
      nav.append(group);
    }
    const paths=groups.size,writes=files.length;
    q('[data-coding-change-summary]').textContent=writes?paths+' 个文件 · '+writes+' 次写入':'这一轮没有文件写入';
  };
  const open=async(nextRun,save=false,nextIndex=0,requireFixed=false,mode='auto')=>{
    const id=ports.current(),token=++ticket,scrollToStart=!runId || runId!==nextRun || index!==nextIndex || (mode!=='auto' && net!==(mode==='1'));
    if(!runId)ports.closeReport();
    if(runId!==nextRun){comments=[];runId=nextRun;try{const saved=JSON.parse(localStorage.getItem(key()) || '[]');if(Array.isArray(saved))comments=saved;}catch{}}
    index=nextIndex;fixed=requireFixed;value=null;reader.hidden=false;
    q('[data-coding-change-save]').disabled=true;q('[data-coding-feedback-return]').disabled=true;
    message.textContent=save?'正在保存原审查的固定版本…':'正在读取本轮审查…';
    try{
      const result=await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(nextRun)+'/changeset?change_index='+index+'&net='+mode+(requireFixed?'&fixed=1':''),save?'POST':'GET');
      if(ticket!==token || id!==ports.current())return;
      value=result;net=result.view_mode==='net';netIndices=net?(result.net_groups || []).find(group=>group.indices.includes(index))?.indices || null:null;q('[data-coding-change-body]').innerHTML=result.html;q('[data-coding-change-body]').dataset.codePath=result.change.files[index]?.path || '';
      renderFiles(result.change.files,nextRun);
      if(net){const body=q('[data-coding-change-body]'),whole=q('[data-coding-change-files] .is-net[aria-pressed=true]');
        whole?.append(counts({added_lines:body.querySelectorAll('.diff-rows li[data-kind=insert]').length,removed_lines:body.querySelectorAll('.diff-rows li[data-kind=delete]').length}));}
      const fixedChip=q('[data-coding-change-fixed]'),saveButton=q('[data-coding-change-save]');
      fixedChip.hidden=!result.reference;saveButton.hidden=Boolean(result.reference);saveButton.disabled=Boolean(result.reference);
      if(result.reference){fixedChip.lastElementChild.textContent='已固定 v'+result.reference.version;fixedChip.title='固定于 '+new Date(result.saved_at).toLocaleString('zh-CN');}
      message.textContent=result.change.files.length?'':'这一轮没有经过审查的文件写入。';
      q('[data-coding-feedback-hint]').textContent=result.reference?'点击行号留下意见；加入原任务草稿后由你决定如何发送，意见不代表批准写入。':'固定此版本后，点击行号即可留下意见。';
      const output=q('[data-coding-change-output]'),selected=result.reference && result.output?.artifact_id===result.reference.artifact_id && result.output?.version===result.reference.version;
      output.hidden=!result.reference;
      if(scrollToStart)q('[data-coding-tools]').scrollTop=0;output.disabled=!result.reference || selected;output.textContent=selected?'已作为变更输出':'设为变更输出';renderComments();
    }catch(error){if(ticket===token){message.textContent=error.message;q('[data-coding-change-body]').replaceChildren();q('[data-coding-change-files]').replaceChildren();}}
  };
  root.addEventListener('click',async(event)=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.hasAttribute('data-diff-unfold') && reader.contains(target)){
      const group=target.dataset.diffUnfold,rows=target.closest('ol');
      rows?.querySelectorAll('[data-diff-folded="'+group+'"]').forEach(row=>{row.hidden=false;});target.closest('li')?.remove();return;
    }
    if(target.hasAttribute('data-coding-change-open')){ports.onRunOpen?.();await open(target.dataset.codingChangeOpen);return;}
    if(target.hasAttribute('data-coding-change-close')){close();ports.returnToTask?.();return;}
    if(target.hasAttribute('data-coding-change-save') && runId){await open(runId,true,index,fixed,net?'1':'0');return;}
    if(target.hasAttribute('data-coding-change-output') && value?.reference){
      const id=ports.current(),run=runId,token=ticket;target.disabled=true;
      try{await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(run)+'/changeset/output','POST',{expected_reference:value.output});if(id===ports.current() && token===ticket)await open(run,false,index,fixed);}
      catch(error){if(token===ticket){message.textContent=error.message;target.disabled=false;}}return;
    }
    if(target.hasAttribute('data-coding-line') && value?.reference){
      if(comments.length>=30){message.textContent='一次最多填写 30 条意见。';return;}
      const side=target.dataset.codingLineSide,at=net && netIndices ? (side==='after' ? netIndices.at(-1) : netIndices[0]) : index;
      comments.push({change_index:at,side,line:Number(target.dataset.codingLine),comment:''});remember();renderComments();
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
  return {close,openFixed:(run)=>open(run,false,0,true),active:()=>Boolean(runId)};
}`;
