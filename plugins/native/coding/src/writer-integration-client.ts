/** Select current child-worktree contents; only the Host review surface can approve them. */
export const CODING_WRITER_INTEGRATION_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const {q,api,host}=ports,dialog=q('[data-coding-integration-dialog]'),list=q('[data-coding-integration-files]'),message=q('[data-coding-integration-status]'),prepare=q('[data-coding-integration-prepare]');
  let endpoint='',workspace='',view=null,ticket=0,busy=false,reading=false,reviewing=false,operation='',selection=new Map(),draft='';
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const remember=()=>{try{sessionStorage.setItem(draft,JSON.stringify([...selection]));}catch{}};
  const update=()=>{prepare.disabled=busy || reading || ![...selection.values()].some(Boolean);};
  const refreshReviews=async()=>{if(!dialog.open || !workspace || reviewing)return;reviewing=true;try{await host.showReviews?.(q('[data-coding-integration-reviews]'),[],null,workspace);}finally{reviewing=false;}};
  const refresh=async()=>{
    if(reading || busy)return;reading=true;message.textContent='正在读取原子任务的当前成果…';update();const at=ticket;
    try{const data=await api(endpoint);if(at!==ticket || !dialog.open)return;view=data;workspace=data.workspace_id;operation='';list.replaceChildren();
      q('[data-coding-integration-source]').textContent='来源：'+data.source_path+' · '+data.branch;
      q('[data-coding-integration-target]').textContent='带回到：'+data.target_path;
      const previous=selection;selection=new Map();
      if(!data.files.length)list.append(el('p','这个独立工作树相对原基线没有变更。'));
      for(const file of data.files){
        const key=file.path.join('/'),row=el('section');row.className='coding-material';
        const label=el('label'),check=el('input');label.className='mw-check-row';check.type='checkbox';check.className='mw-check';check.disabled=!file.selectable;check.checked=file.selectable && previous.get(key)===file.revision;check.setAttribute('aria-label','整合：'+key);
        if(check.checked)selection.set(key,file.revision);
        check.addEventListener('change',()=>{if(check.checked)selection.set(key,file.revision);else selection.delete(key);operation='';remember();update();});
        label.append(check,el('span',key+' · '+({added:'新增',modified:'修改',deleted:'删除'}[file.target])));row.append(label);
        if(file.reason)row.append(el('p',file.reason));
        if(file.before_text!==undefined){const before=el('details');before.append(el('summary','主工作区当前内容'),el('pre',file.before_text===null?'文件尚不存在':file.before_text || '（空文件）'));row.append(before);}
        if(file.after_text!==undefined){const after=el('details');after.append(el('summary','子工作树当前内容'),el('pre',file.after_text===null?'删除此文件':file.after_text || '（空文件）'));row.append(after);}
        list.append(row);
      }
      remember();message.textContent='请选择文件，再准备宿主审查。';await refreshReviews();
    }catch(error){if(at===ticket){view=null;selection.clear();message.textContent=error.message;}}
    finally{reading=false;update();}
  };
  q('[data-coding-integration-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{ticket++;});
  q('[data-coding-integration-refresh]').addEventListener('click',()=>void refresh());
  prepare.addEventListener('click',async()=>{
    if(busy || reading || !view)return;busy=true;message.textContent='正在准备整合审查…';update();operation ||= crypto.randomUUID();const at=ticket;
    try{await api(endpoint,'POST',{operation_id:operation,files:view.files.filter(f=>selection.get(f.path.join('/'))===f.revision).map(f=>({path:f.path,revision:f.revision}))});
      operation='';if(at===ticket){message.textContent='已准备审查。执行状态以下方原回执为准。';await refreshReviews();}
    }catch(error){if(at===ticket)message.textContent=error.message;}finally{busy=false;update();}
  });
  return {refreshReviews,open:async(id,run,child)=>{
    if(busy || reading){ports.status('原成果操作仍在处理，请稍后重新打开',true);return;}
    endpoint='/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(run)+'/subagents/'+encodeURIComponent(child.subagent_id)+'/integration';
    draft='coding-integration:'+location.pathname+':'+endpoint;selection=new Map();try{const saved=JSON.parse(sessionStorage.getItem(draft)||'null');if(Array.isArray(saved))selection=new Map(saved);}catch{}
    ticket++;workspace='';view=null;operation='';list.replaceChildren();message.textContent='正在读取原子任务的当前成果…';const reviews=q('[data-coding-integration-reviews]');reviews.replaceChildren();delete reviews.dataset.reviewHtml;dialog.showModal();await refresh();
  }};
}`;
