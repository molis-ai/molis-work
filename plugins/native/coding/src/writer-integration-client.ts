/** Select current child-worktree contents; only the Host review surface can approve them. */
export const CODING_WRITER_INTEGRATION_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const {q,api,host}=ports,dialog=q('[data-coding-integration-dialog]'),list=q('[data-coding-integration-files]'),message=q('[data-coding-integration-status]'),prepare=q('[data-coding-integration-prepare]');
  let endpoint='',workspace='',view=null,ticket=0,busy=false,reading=false,reviewing=false,operation='',selection=new Map(),resolutions=new Map(),draft='';
  const MARKER=/^(<{7}|={7}|>{7}|\\|{7})( |$)/m,markers=(text)=>(text.match(/^<{7}( |$)/gm)||[]).length;
  // One conflict block: main's lines, the original base, then the subtask's. Taking a side rewrites only that block, like accept current/incoming/both.
  const HUNKS=/^<{7}[^\\n]*\\n([\\s\\S]*?)(?:^\\|{7}[^\\n]*\\n[\\s\\S]*?)?^={7}[^\\n]*\\n([\\s\\S]*?)^>{7}[^\\n]*(?:\\n|$)/gm;
  const hunks=(text)=>[...text.matchAll(HUNKS)].map(match=>({ours:match[1],theirs:match[2]}));
  const take=(text,index,how)=>{let at=0;return text.replace(HUNKS,(all,ours,theirs)=>at++!==index?all:how==='ours'?ours:how==='theirs'?theirs:ours+theirs);};
  const lines=(text)=>text?text.replace(/\\n$/,'').split('\\n').length:0;
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
        // What would change in the main workspace, as a folded diff; the full texts stay one level down.
        if(file.diff_html){const diff=el('details');diff.className='coding-integration-diff';diff.open=data.files.length<=3;diff.append(el('summary','与主工作区的差异'));const body=el('div');body.innerHTML=file.diff_html;diff.append(body);row.append(diff);}
        else{
          if(file.before_text!==undefined){const before=el('details');before.append(el('summary','主工作区当前内容'),el('pre',file.before_text===null?'文件尚不存在':file.before_text || '（空文件）'));row.append(before);}
          if(file.after_text!==undefined){const after=el('details');after.append(el('summary','子工作树当前内容'),el('pre',file.after_text===null?'删除此文件':file.after_text || '（空文件）'));row.append(after);}
        }
        // Both sides changed this file: a three-way merge a person finishes, never the child's version over the main one.
        if(file.conflict){
          const merge=el('div');merge.className='coding-merge';
          const open=el('button',file.conflict.clean?'查看三方合并结果':'三方合并并解决冲突');open.type='button';open.className='mw-btn';
          merge.append(open);row.append(merge);
          open.addEventListener('click',()=>{
            open.remove();
            const editor=el('textarea'),state=el('p'),use=el('label'),useCheck=el('input');
            editor.className='mw-textarea coding-merge-editor';editor.rows=Math.min(18,Math.max(6,file.conflict.merged_text.split('\\n').length+1));editor.spellcheck=false;
            editor.value=resolutions.get(key) ?? file.conflict.merged_text;editor.setAttribute('aria-label','合并结果：'+key);
            useCheck.type='checkbox';useCheck.className='mw-check';use.className='mw-check-row';use.append(useCheck,el('span','用这个合并结果整合'));
            const picks=el('div');picks.className='coding-merge-picks';
            const sync=()=>{const left=markers(editor.value),blocked=MARKER.test(editor.value);
              const found=hunks(editor.value);picks.hidden=!found.length;picks.replaceChildren();
              found.forEach((hunk,index)=>{const pick=el('div');pick.className='coding-merge-pick';
                pick.append(el('span','冲突 '+(index+1)+' · 主工作区 '+lines(hunk.ours)+' 行，子任务 '+lines(hunk.theirs)+' 行'));
                for(const [how,label] of [['ours','用主工作区'],['theirs','用子任务'],['both','两边都保留']]){const b=el('button',label);b.type='button';b.className='mw-btn mw-btn--ghost';
                  b.setAttribute('aria-label','冲突 '+(index+1)+'：'+label);
                  b.addEventListener('click',()=>{editor.value=take(editor.value,index,how);sync();(picks.querySelector('button')||editor).focus();});pick.append(b);}
                picks.append(pick);});
              state.textContent=blocked?'还有 '+Math.max(left,1)+' 处冲突没有解决（<<<<<<< / ||||||| / ======= / >>>>>>> 标记还在），选好内容并删掉标记后才能整合。':file.conflict.clean&&editor.value===file.conflict.merged_text?'自动合并没有冲突：保留了主工作区和子任务各自的改动。':'冲突已处理，可以用这个结果整合。';
              state.dataset.tone=blocked?'attention':'done';useCheck.disabled=blocked;if(blocked){useCheck.checked=false;selection.delete(key);resolutions.delete(key);}
              else if(useCheck.checked){selection.set(key,file.revision);resolutions.set(key,editor.value);}
              operation='';remember();update();};
            editor.addEventListener('input',sync);useCheck.addEventListener('change',()=>{if(useCheck.checked){selection.set(key,file.revision);resolutions.set(key,editor.value);}else{selection.delete(key);resolutions.delete(key);}operation='';remember();update();});
            merge.append(el('p',file.conflict.clean?'这是自动三方合并的结果，保留了双方的改动；可以再修改后整合。':'每处冲突依次是：<<<<<<< 主工作区 下面是主工作区的内容，||||||| 原基线 下面是两边改动前的原内容，======= 下面是子任务的内容，到 >>>>>>> 子任务 结束。可以用每处冲突旁的按钮选一边或两边都保留，也可以直接编辑。'),editor,picks,state,use);sync();editor.focus();
          });
        }
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
    try{await api(endpoint,'POST',{operation_id:operation,files:view.files.filter(f=>selection.get(f.path.join('/'))===f.revision).map(f=>({path:f.path,revision:f.revision,...(resolutions.has(f.path.join('/'))?{resolution:resolutions.get(f.path.join('/'))}:{})}))});
      operation='';if(at===ticket){message.textContent='已准备审查。执行状态以下方原回执为准。';await refreshReviews();}
    }catch(error){if(at===ticket)message.textContent=error.message;}finally{busy=false;update();}
  });
  return {refreshReviews,open:async(id,run,child)=>{
    if(busy || reading){ports.status('原成果操作仍在处理，请稍后重新打开',true);return;}
    endpoint='/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(run)+'/subagents/'+encodeURIComponent(child.subagent_id)+'/integration';resolutions=new Map();
    draft='coding-integration:'+location.pathname+':'+endpoint;selection=new Map();try{const saved=JSON.parse(sessionStorage.getItem(draft)||'null');if(Array.isArray(saved))selection=new Map(saved);}catch{}
    ticket++;workspace='';view=null;operation='';list.replaceChildren();message.textContent='正在读取原子任务的当前成果…';const reviews=q('[data-coding-integration-reviews]');reviews.replaceChildren();delete reviews.dataset.reviewHtml;dialog.showModal();await refresh();
  }};
}`;
