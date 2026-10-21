/** Select current child-worktree contents; only the Host review surface can approve them. */
export const CODING_WRITER_INTEGRATION_CLIENT_FACTORY_SCRIPT = `(ports)=>{
  const lifetime=ports.lifetime;
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
    if(reading || busy)return;reading=true;message.textContent=L('coding.integration.reading');update();const at=ticket;
    try{const data=await api(endpoint);if(at!==ticket || !dialog.open)return;view=data;workspace=data.workspace_id;operation='';list.replaceChildren();
      q('[data-coding-integration-source]').textContent=L('coding.integration.source',{path:data.source_path,branch:data.branch});
      q('[data-coding-integration-target]').textContent=L('coding.integration.target',{path:data.target_path});
      const previous=selection;selection=new Map();
      if(!data.files.length)list.append(el('p',L('coding.integration.no-changes')));
      for(const file of data.files){
        const key=file.path.join('/'),row=el('section');row.className='coding-material';
        const label=el('label'),check=el('input');label.className='mw-check-row';check.type='checkbox';check.className='mw-check';check.disabled=!file.selectable;check.checked=file.selectable && previous.get(key)===file.revision;check.setAttribute('aria-label',L('coding.integration.file-label',{path:key}));
        if(check.checked)selection.set(key,file.revision);
        lifetime.listen(check,'change',()=>{if(check.checked)selection.set(key,file.revision);else selection.delete(key);operation='';remember();update();});
        label.append(check,el('span',key+' · '+({added:L('coding.integration.added'),modified:L('coding.integration.modified'),deleted:L('coding.integration.deleted')}[file.target])));row.append(label);
        if(file.reason)row.append(el('p',file.reason));
        // What would change in the main workspace, as a folded diff; the full texts stay one level down.
        if(file.diff_html){const diff=el('details');diff.className='coding-integration-diff';diff.open=data.files.length<=3;diff.append(el('summary',L('coding.integration.diff')));const body=el('div');body.dataset.codePath=key;body.innerHTML=file.diff_html;diff.append(body);row.append(diff);}
        else{
          if(file.before_text!==undefined){const before=el('details');before.append(el('summary',L('coding.integration.before')),el('pre',file.before_text===null?L('coding.integration.not-yet'):file.before_text || L('coding.integration.empty')));row.append(before);}
          if(file.after_text!==undefined){const after=el('details');after.append(el('summary',L('coding.integration.after')),el('pre',file.after_text===null?L('coding.integration.delete-file'):file.after_text || L('coding.integration.empty')));row.append(after);}
        }
        // Both sides changed this file: a three-way merge a person finishes, never the child's version over the main one.
        if(file.conflict){
          const merge=el('div');merge.className='coding-merge';
          const open=el('button',file.conflict.clean?L('coding.integration.merge-view'):L('coding.integration.merge-resolve'));open.type='button';open.className='mw-btn';
          merge.append(open);row.append(merge);
          lifetime.listen(open,'click',()=>{
            open.remove();
            const editor=el('textarea'),state=el('p'),use=el('label'),useCheck=el('input');
            editor.className='mw-textarea coding-merge-editor';editor.rows=Math.min(18,Math.max(6,file.conflict.merged_text.split('\\n').length+1));editor.spellcheck=false;
            editor.value=resolutions.get(key) ?? file.conflict.merged_text;editor.setAttribute('aria-label',L('coding.integration.merge-label',{path:key}));
            useCheck.type='checkbox';useCheck.className='mw-check';use.className='mw-check-row';use.append(useCheck,el('span',L('coding.integration.merge-use')));
            const picks=el('div');picks.className='coding-merge-picks';
            const sync=()=>{const left=markers(editor.value),blocked=MARKER.test(editor.value);
              const found=hunks(editor.value);picks.hidden=!found.length;picks.replaceChildren();
              found.forEach((hunk,index)=>{const pick=el('div');pick.className='coding-merge-pick';
                pick.append(el('span',L('coding.integration.hunk',{number:index+1,ours:lines(hunk.ours),theirs:lines(hunk.theirs)})));
                for(const [how,label] of [['ours',L('coding.integration.take-ours')],['theirs',L('coding.integration.take-theirs')],['both',L('coding.integration.take-both')]]){const b=el('button',label);b.type='button';b.className='mw-btn mw-btn--ghost';
                  b.setAttribute('aria-label',L('coding.integration.take-label',{number:index+1,choice:label}));
                  lifetime.listen(b,'click',()=>{editor.value=take(editor.value,index,how);sync();(picks.querySelector('button')||editor).focus();});pick.append(b);}
                picks.append(pick);});
              state.textContent=blocked?L('coding.integration.unresolved',{count:Math.max(left,1)}):file.conflict.clean&&editor.value===file.conflict.merged_text?L('coding.integration.clean'):L('coding.integration.resolved');
              state.dataset.tone=blocked?'attention':'done';useCheck.disabled=blocked;if(blocked){useCheck.checked=false;selection.delete(key);resolutions.delete(key);}
              else if(useCheck.checked){selection.set(key,file.revision);resolutions.set(key,editor.value);}
              operation='';remember();update();};
            lifetime.listen(editor,'input',sync);lifetime.listen(useCheck,'change',()=>{if(useCheck.checked){selection.set(key,file.revision);resolutions.set(key,editor.value);}else{selection.delete(key);resolutions.delete(key);}operation='';remember();update();});
            merge.append(el('p',file.conflict.clean?L('coding.integration.clean-note'):L('coding.integration.conflict-note')),editor,picks,state,use);sync();editor.focus();
          });
        }
        list.append(row);
      }
      remember();message.textContent=L('coding.integration.choose');await refreshReviews();
    }catch(error){if(!lifetime.alive)return;if(at===ticket){view=null;selection.clear();message.textContent=error.message;}}
    finally{reading=false;update();}
  };
  lifetime.listen(q('[data-coding-integration-close]'),'click',()=>dialog.close());
  lifetime.listen(dialog,'close',()=>{ticket++;});
  lifetime.listen(q('[data-coding-integration-refresh]'),'click',()=>void refresh());
  lifetime.listen(prepare,'click',async()=>{
    if(busy || reading || !view)return;busy=true;message.textContent=L('coding.integration.preparing');update();operation ||= crypto.randomUUID();const at=ticket;
    try{await api(endpoint,'POST',{operation_id:operation,files:view.files.filter(f=>selection.get(f.path.join('/'))===f.revision).map(f=>({path:f.path,revision:f.revision,...(resolutions.has(f.path.join('/'))?{resolution:resolutions.get(f.path.join('/'))}:{})}))});
      operation='';if(at===ticket){message.textContent=L('coding.integration.prepared');await refreshReviews();}
    }catch(error){if(!lifetime.alive)return;if(at===ticket)message.textContent=error.message;}finally{busy=false;update();}
  });
  return {refreshReviews,open:async(id,run,child)=>{
    if(busy || reading){ports.status(L('coding.integration.busy'),true);return;}
    endpoint='/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(run)+'/subagents/'+encodeURIComponent(child.subagent_id)+'/integration';resolutions=new Map();
    draft='coding-integration:'+location.pathname+':'+endpoint;selection=new Map();try{const saved=JSON.parse(sessionStorage.getItem(draft)||'null');if(Array.isArray(saved))selection=new Map(saved);}catch{}
    ticket++;workspace='';view=null;operation='';list.replaceChildren();message.textContent=L('coding.integration.reading');const reviews=q('[data-coding-integration-reviews]');reviews.replaceChildren();delete reviews.dataset.reviewHtml;dialog.showModal();await refresh();
  }};
}`;
