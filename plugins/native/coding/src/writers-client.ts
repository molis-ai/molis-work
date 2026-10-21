/** Git and the project catalog own directory facts; this view owns the next-run assignment draft, not execution state. */
export const CODING_WRITER_DIRECTORIES_CLIENT_FACTORY_SCRIPT = `(ports) => {
  const lifetime=ports.lifetime;
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
        if(!data.directories.length)list.append(node('p',L('coding.writers.none')));
        for(const directory of data.directories){
          const row=node('section',undefined,'coding-material');row.append(node('p',directory.canonical_path),node('p',L('coding.writers.branch',{branch:directory.branch || L('coding.writers.no-branch')})));
          // A directory whose branch or origin no longer matches is listed so it is not a mystery, but it takes no work.
          if(directory.problem){row.append(node('p',L('coding.writers.problem',{reason:directory.problem})));list.append(row);continue;}
          row.append(node('p',L('coding.writers.base',{commit:directory.base_commit})));
          if(directory.workspace_id){
            const draft=assignments.get(directory.workspace_id) || {task:'',selected:false};assignments.set(directory.workspace_id,draft);
            const label=node('label',undefined,'mw-check-row'),check=node('input');check.type='checkbox';check.setAttribute('aria-label',L('coding.writers.assign-label',{path:directory.canonical_path}));check.className='mw-check';check.checked=draft.selected;
            label.append(check,node('span',L('coding.writers.join')));row.append(label);
            const field=node('label',undefined,'mw-field'),task=node('textarea');task.setAttribute('aria-label',L('coding.writers.task-label',{path:directory.canonical_path}));task.className='mw-textarea';task.rows=3;task.maxLength=8000;task.value=draft.task;task.disabled=!draft.selected;
            field.append(node('span',L('coding.writers.task')),task);row.append(field);
            lifetime.listen(check,'change',()=>{draft.selected=check.checked;task.disabled=!check.checked;remember();});lifetime.listen(task,'input',()=>{draft.task=task.value;remember();});
            const use=node('button',L('coding.writers.use'),'mw-btn');use.type='button';lifetime.listen(use,'click',async()=>{
            if(busy)return;busy=true;use.disabled=true;
            try{await ports.select(owner,directory.workspace_id);dialog.close();}catch(error){if(!lifetime.alive)return;message.textContent=error.message;}finally{busy=false;use.disabled=false;}
          });row.append(use);}else row.append(node('p',L('coding.writers.unauthorized')));
          list.append(row);
        }
        for(const [id,draft] of assignments)if(draft.selected && !data.directories.some(item=>item.workspace_id===id && !item.problem)){
          const row=node('section',undefined,'coding-material');row.append(node('p',L('coding.writers.saved-gone',{id})),node('p',draft.task || L('coding.writers.no-task')));
          const remove=node('button',L('coding.writers.remove'),'mw-btn');remove.type='button';lifetime.listen(remove,'click',()=>{assignments.delete(id);remember();renderKey='';void refresh();});row.append(remove);list.append(row);
        }
      }
      await host.showReviews?.(q('[data-coding-writer-directory-reviews]'),[],null,parent);
    } catch(error){if(!lifetime.alive)return;if(at===ticket && dialog.open)message.textContent=error.message;}
    finally{reading=false;}
  };
  lifetime.listen(q('[data-coding-writer-directories-open]'),'click',()=>{
    if(busy){ports.status(L('coding.writers.busy'),true);return;}
    const next=ports.workspace();if(parent!==next)operation='';parent=next;owner=ports.current();assignments=new Map(ports.assignments().map(row=>[row.workspace_id,{task:row.task,selected:true}]));try{const saved=JSON.parse(sessionStorage.getItem(draftKey()) || 'null');if(Array.isArray(saved))assignments=new Map(saved);}catch{}ticket++;renderKey='';list.replaceChildren();message.textContent='';
    q('[data-coding-writer-parent]').textContent=L('coding.writers.parent',{path:ports.workspaceLabel()});
    if(!parent || !owner){ports.status(L('coding.writers.choose-first'),true);return;}
    dialog.showModal();void refresh();
  });
  lifetime.listen(q('[data-coding-writer-assignments-save]'),'click',async()=>{
    if(busy)return;busy=true;const button=q('[data-coding-writer-assignments-save]');button.disabled=true;
    const key=draftKey(),snapshot=JSON.stringify([...assignments]);
    try{await ports.saveAssignments(owner,parent,[...assignments].filter(([,row])=>row.selected).map(([workspace_id,row])=>({workspace_id,task:row.task})));if(snapshot===JSON.stringify([...assignments])){try{sessionStorage.removeItem(key);}catch{}}message.textContent=L('coding.writers.saved');}
    catch(error){if(!lifetime.alive)return;message.textContent=error.message;}finally{busy=false;button.disabled=false;}
  });
  lifetime.listen(q('[data-coding-writer-directories-close]'),'click',()=>dialog.close());
  lifetime.listen(dialog,'close',()=>{ticket++;});
  lifetime.listen(q('[data-coding-writer-directories-refresh]'),'click',()=>void refresh());
  lifetime.listen(create,'click',async()=>{
    if(busy)return;busy=true;create.disabled=true;const at=ticket;
    operation ||= crypto.randomUUID();
    try{await api(path(),'POST',{operation_id:operation});operation='';if(at===ticket){message.textContent='';await refresh();}}
    catch(error){if(!lifetime.alive)return;if(at===ticket)message.textContent=error.message;}
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
    const details=node('details');details.append(node('summary',L('coding.writers.turn',{count:rows.length})));
    for(const row of rows){const section=node('section',undefined,'coding-material'),body=node('p',row.task);body.style.whiteSpace='pre-wrap';section.append(node('p',row.directory),body,node('p',L('coding.writers.branch-base',{branch:row.branch,commit:row.base_commit})));details.append(section);}
    target.append(details);return true;
  };
  return {refresh,renderTurn};
}`;
