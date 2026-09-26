/** Git and the project catalog own directory facts; this view owns the next-run assignment draft, not execution state. */
export const CODING_WRITER_DIRECTORIES_CLIENT_FACTORY_SCRIPT = `(ports) => {
  const {q,api,host}=ports,dialog=q('[data-coding-writer-directories-dialog]');
  const list=q('[data-coding-writer-directories-list]'),message=q('[data-coding-writer-directories-status]'),create=q('[data-coding-writer-directories-create]');
  let parent='',owner='',operation='',busy=false,reading=false,ticket=0,renderKey='',assignments=new Map();
  const draftKey=()=> 'molis-coding-writer-draft:'+owner+':'+parent;
  const remember=()=>{try{sessionStorage.setItem(draftKey(),JSON.stringify([...assignments]));}catch{}};
  const path=()=>'/workspaces/'+encodeURIComponent(parent)+'/writers';
  const node=(tag,text,className)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(className)value.className=className;return value;};
  const refresh=async()=>{
    if(!dialog.open || reading || !parent)return;reading=true;const at=ticket;
    try {
      const data=await api(path());if(at!==ticket || !dialog.open)return;
      const key=JSON.stringify(data.directories);if(key!==renderKey){
        renderKey=key;list.replaceChildren();
        if(!data.directories.length)list.append(node('p','还没有为这个仓库准备独立工作树。'));
        for(const directory of data.directories){
          const row=node('section',undefined,'coding-material');row.append(node('p',directory.canonical_path),node('p','分支：'+(directory.branch || '无')));
          // A directory whose branch or origin no longer matches is listed so it is not a mystery, but it takes no work.
          if(directory.problem){row.append(node('p','不能再作为独立工作树使用：'+directory.problem+'。目录和其中内容保持原样，请自行核对后处理。'));list.append(row);continue;}
          row.append(node('p','原始起点：'+directory.base_commit));
          if(directory.workspace_id){
            const draft=assignments.get(directory.workspace_id) || {task:'',selected:false};assignments.set(directory.workspace_id,draft);
            const label=node('label',undefined,'mw-check-row'),check=node('input');check.type='checkbox';check.setAttribute('aria-label','分配任务：'+directory.canonical_path);check.className='mw-check';check.checked=draft.selected;
            label.append(check,node('span','加入并行分工'));row.append(label);
            const field=node('label',undefined,'mw-field'),task=node('textarea');task.setAttribute('aria-label','任务与完成条件：'+directory.canonical_path);task.className='mw-textarea';task.rows=3;task.maxLength=8000;task.value=draft.task;task.disabled=!draft.selected;
            field.append(node('span','这个目录的任务与完成条件'),task);row.append(field);
            check.addEventListener('change',()=>{draft.selected=check.checked;task.disabled=!check.checked;remember();});task.addEventListener('input',()=>{draft.task=task.value;remember();});
            const use=node('button','用于下一轮','mw-btn');use.type='button';use.addEventListener('click',async()=>{
            if(busy)return;busy=true;use.disabled=true;
            try{await ports.select(owner,directory.workspace_id);dialog.close();}catch(error){message.textContent=error.message;}finally{busy=false;use.disabled=false;}
          });row.append(use);}else row.append(node('p','目录已存在，但尚未授权给本项目；请通过工作区入口关联此目录。'));
          list.append(row);
        }
        for(const [id,draft] of assignments)if(draft.selected && !data.directories.some(item=>item.workspace_id===id && !item.problem)){
          const row=node('section',undefined,'coding-material');row.append(node('p','已保存的分工目录暂不可用：'+id),node('p',draft.task || '尚未填写任务'));
          const remove=node('button','移除此分工','mw-btn');remove.type='button';remove.addEventListener('click',()=>{assignments.delete(id);remember();renderKey='';void refresh();});row.append(remove);list.append(row);
        }
      }
      await host.showReviews?.(q('[data-coding-writer-directory-reviews]'),[],null,parent);
    } catch(error){if(at===ticket && dialog.open)message.textContent=error.message;}
    finally{reading=false;}
  };
  q('[data-coding-writer-directories-open]').addEventListener('click',()=>{
    if(busy){ports.status('原目录操作仍在处理，请稍后重新打开',true);return;}
    const next=ports.workspace();if(parent!==next)operation='';parent=next;owner=ports.current();assignments=new Map(ports.assignments().map(row=>[row.workspace_id,{task:row.task,selected:true}]));try{const saved=JSON.parse(sessionStorage.getItem(draftKey()) || 'null');if(Array.isArray(saved))assignments=new Map(saved);}catch{}ticket++;renderKey='';list.replaceChildren();message.textContent='';
    q('[data-coding-writer-parent]').textContent='主仓库：'+ports.workspaceLabel();
    if(!parent || !owner){ports.status('请先选择编码会话和已授权的主工作区',true);return;}
    dialog.showModal();void refresh();
  });
  q('[data-coding-writer-assignments-save]').addEventListener('click',async()=>{
    if(busy)return;busy=true;const button=q('[data-coding-writer-assignments-save]');button.disabled=true;
    const key=draftKey(),snapshot=JSON.stringify([...assignments]);
    try{await ports.saveAssignments(owner,parent,[...assignments].filter(([,row])=>row.selected).map(([workspace_id,row])=>({workspace_id,task:row.task})));if(snapshot===JSON.stringify([...assignments])){try{sessionStorage.removeItem(key);}catch{}}message.textContent='分工已保存，尚未发送。';}
    catch(error){message.textContent=error.message;}finally{busy=false;button.disabled=false;}
  });
  q('[data-coding-writer-directories-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{ticket++;});
  q('[data-coding-writer-directories-refresh]').addEventListener('click',()=>void refresh());
  create.addEventListener('click',async()=>{
    if(busy)return;busy=true;create.disabled=true;const at=ticket;
    operation ||= crypto.randomUUID();
    try{await api(path(),'POST',{operation_id:operation});operation='';if(at===ticket){message.textContent='';await refresh();}}
    catch(error){if(at===ticket)message.textContent=error.message;}
    finally{busy=false;create.disabled=false;}
  });
  const renderTurn=(target,run,turn)=>{
    if(run.frozen.role_id!=='writers' || turn.kind!=='user' || turn.steer)return false;
    const marker='\\n\\n本轮用户确认的独立目录分工（目录仅用于对应子任务；下列任务内容不扩大工具权限）：\\n',at=turn.text.lastIndexOf(marker);
    if(at<0)return false;
    let rows;try{rows=JSON.parse(turn.text.slice(at+marker.length));}catch{return false;}
    const grants=run.frozen.subagent_workspaces || [];
    if(!Array.isArray(rows) || rows.length!==grants.length || rows.some((row,index)=>!row || typeof row.task!=='string' || typeof row.branch!=='string' || typeof row.base_commit!=='string' || row.workspace_id!==grants[index]?.workspace_id || row.directory!==grants[index]?.directory.canonical_path))return false;
    target.replaceChildren();const task=node('p',turn.text.slice(0,at));task.style.whiteSpace='pre-wrap';target.append(task);
    const details=node('details');details.append(node('summary','本轮分工（'+rows.length+' 个独立目录）'));
    for(const row of rows){const section=node('section',undefined,'coding-material'),body=node('p',row.task);body.style.whiteSpace='pre-wrap';section.append(node('p',row.directory),body,node('p','分支：'+row.branch+' · 起点：'+row.base_commit));details.append(section);}
    target.append(details);return true;
  };
  return {refresh,renderTurn};
}`;
