/** Git and the project catalog own directory facts; this view only selects the next workspace. */
export const CODING_WRITER_DIRECTORIES_CLIENT_FACTORY_SCRIPT = `(ports) => {
  const {q,api,host}=ports,dialog=q('[data-coding-writer-directories-dialog]');
  const list=q('[data-coding-writer-directories-list]'),message=q('[data-coding-writer-directories-status]'),create=q('[data-coding-writer-directories-create]');
  let parent='',owner='',operation='',busy=false,reading=false,ticket=0,renderKey='';
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
          const row=node('section',undefined,'coding-material');row.append(node('p',directory.canonical_path),node('p','分支：'+directory.branch),node('p','原始起点：'+directory.base_commit));
          if(directory.workspace_id){const use=node('button','用于下一轮','mw-btn');use.type='button';use.addEventListener('click',async()=>{
            if(busy)return;busy=true;use.disabled=true;
            try{await ports.select(owner,directory.workspace_id);dialog.close();}catch(error){message.textContent=error.message;}finally{busy=false;use.disabled=false;}
          });row.append(use);}else row.append(node('p','目录已存在，但尚未授权给本项目；请通过工作区入口关联此目录。'));
          list.append(row);
        }
      }
      await host.showReviews?.(q('[data-coding-writer-directory-reviews]'),[],null,parent);
    } catch(error){if(at===ticket && dialog.open)message.textContent=error.message;}
    finally{reading=false;}
  };
  q('[data-coding-writer-directories-open]').addEventListener('click',()=>{
    if(busy){ports.status('原目录操作仍在处理，请稍后重新打开',true);return;}
    const next=ports.workspace();if(parent!==next)operation='';parent=next;owner=ports.current();ticket++;renderKey='';list.replaceChildren();message.textContent='';
    q('[data-coding-writer-parent]').textContent='主仓库：'+ports.workspaceLabel();
    if(!parent || !owner){ports.status('请先选择编码会话和已授权的主工作区',true);return;}
    dialog.showModal();void refresh();
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
  return {refresh};
}`;
