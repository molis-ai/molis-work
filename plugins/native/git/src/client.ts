/** Reads through declared plugin routes; no Git process or approval lives in the browser. */
export const GIT_CLIENT_FACTORY_SCRIPT = `(host) => {
  const scope=host.root || document;
  const directory=scope.querySelector('[data-git-browser]'),result=scope.querySelector('[data-git-results]');
  if(!directory || !result)return null;
  const q=selector=>result.querySelector(selector),list=directory.querySelector('[data-git-list]'),notice=directory.querySelector('[data-git-status]'),reopen=directory.querySelector('[data-git-reopen]'),history=directory.querySelector('[data-git-history]');
  const refreshButton=directory.querySelector('[data-git-refresh]');let opener=null;
  let workspace='',generation=0,ticket=0,selected=null,displayed=null,preparing=false;
  const action=q('[data-git-index-action]'),reviews=q('[data-git-reviews]');
  const reveal=(source)=>{opener=source;host.openResult();result.hidden=false;result.classList.add('is-arriving');result.setAttribute('aria-busy','false');q('[data-git-close]').focus({preventScroll:true});};
  const showReviews=()=>host.showReviews?.(reviews,[],null,workspace);
  let resultRows=[],resultsTicket=0,resultSaving=false;
  const resultPanel=q('[data-git-saved-results]'),resultChoice=q('[data-git-result-choice]'),resultSave=q('[data-git-result-save]'),resultStatus=q('[data-git-result-status]');
  const request=(path,method='GET',body)=>host.request('git',path,method,body);
  const outcomeLabel={succeeded:'已完成',failed:'未完成',denied:'已拒绝',cancelled:'已撤回',expired:'已过期'};
  function renderResult(){
    const row=resultRows.find(item=>item.result.review.review_id===resultChoice.value),item=row?.saved?.result || row?.result;
    resultSave.disabled=resultSaving || !row || Boolean(row.saved || row.unavailable);
    q('[data-git-result-summary]').textContent=item?.summary || '';
    q('[data-git-result-paths]').textContent=item?.review.paths.join('、') || '';
    const reconciliation=item?.review.reconciliation;
    q('[data-git-result-provenance]').textContent=item ? '决定：'+(item.review.decided_by || '未记录决定者')+' · '+(item.review.decided_at ? new Date(item.review.decided_at).toLocaleString() : '未记录决定时间')+(reconciliation?'；核对：'+reconciliation.actor_id+' · '+new Date(reconciliation.at).toLocaleString()+'；依据：'+reconciliation.reason:item.review.reconciliation_reason?'；核对依据：'+item.review.reconciliation_reason+'（这份旧固定结果未记录核对者与核对时间）':item.review.failure_reason?'；原说明：'+item.review.failure_reason:'') : '';
    resultStatus.textContent=row?.unavailable || (row?.saved ? '已保存固定结果 · v'+row.saved.reference.version+'；后续操作不会改写这份结果。' : row ? '尚未保存' : '没有可保存的确定结果；进行中或仍未知的操作请查看下方审查。');
  }
  async function loadResults(){
    const serial=++resultsTicket,id=workspace,selectedId=resultChoice.value;
    resultSave.disabled=true;
    try{
      const data=await request('/results');if(serial!==resultsTicket || id!==workspace)return;
      resultRows=data.results;resultChoice.replaceChildren();
      for(const row of resultRows){const item=row.result,option=document.createElement('option');option.value=item.review.review_id;option.textContent=(item.review.action==='stage'?'暂存':'取消暂存')+' · '+((item.review.reconciliation || item.review.reconciliation_reason)?'已核对未发生':outcomeLabel[item.outcome])+' · '+item.review.paths.join('、')+' · '+new Date(item.review.requested_at).toLocaleString();resultChoice.append(option);}
      if(resultRows.some(row=>row.result.review.review_id===selectedId))resultChoice.value=selectedId;
      resultChoice.disabled=!resultRows.length;renderResult();
    }catch(error){if(serial===resultsTicket && id===workspace){resultRows=[];resultChoice.replaceChildren();resultChoice.disabled=true;renderResult();resultStatus.textContent=error.message;}}
  }
  resultChoice.addEventListener('change',renderResult);
  resultSave.addEventListener('click',async()=>{
    const row=resultRows.find(item=>item.result.review.review_id===resultChoice.value);if(!row || resultSaving)return;
    const id=workspace,reviewId=row.result.review.review_id;resultSaving=true;resultSave.disabled=true;resultStatus.textContent='正在保存固定结果…';
    try{
      const saved=await request('/results','POST',{workspace_id:id,review_id:reviewId});
      if(id!==workspace)return;
      const current=resultRows.find(item=>item.result.review.review_id===reviewId);if(current)current.saved=saved;
      renderResult();
    }catch(error){if(id===workspace)resultStatus.textContent='保存未完成：'+error.message;}
    finally{resultSaving=false;if(id===workspace)resultSave.disabled=Boolean(resultRows.find(item=>item.result.review.review_id===resultChoice.value)?.saved);}
  });
  function title(item){q('[data-git-kind]').textContent='固定差异';q('[data-git-title]').textContent=item.path.join('/');q('[data-git-scope]').textContent=(item.side==='index'?'已暂存 · HEAD → 暂存区':'未暂存 · 暂存区 → 工作区')+(item.previous_path?' · 原路径 '+item.previous_path.join('/'):'');}
  async function fixed(item,serial,epoch){
    const value=await host.request('diff','/state?artifact_id='+encodeURIComponent(item.reference.artifact_id)+'&version='+item.reference.version);
    if(serial!==ticket || epoch!==generation)return;
    title(item);q('[data-git-diff]').innerHTML=value.html || '';q('[data-git-notice]').textContent='读取时的固定差异 · v'+item.reference.version+'；磁盘或暂存区后续变化不会改写本次预览。';
    resultPanel.hidden=true;displayed=item;action.hidden=false;action.textContent=item.side==='index'?'取消暂存…':'暂存此版本…';await showReviews();
  }
  async function open(path,side,button){
    opener=button || opener;list.querySelectorAll('[data-git-path]').forEach(row=>row.classList.toggle('is-selected',row.dataset.gitPath===JSON.stringify([path,side])));
    const serial=++ticket,epoch=generation,id=workspace;displayed=null;action.hidden=true;reveal(button || opener);result.setAttribute('aria-busy','true');q('[data-git-title]').textContent=path.join('/');q('[data-git-scope]').textContent='';q('[data-git-diff]').replaceChildren();q('[data-git-notice]').textContent='正在读取差异…';
    try{
      const value=await request('/diff','POST',{workspace_id:id,path,side});
      if(serial!==ticket || epoch!==generation)return;
      if(value.result.outcome!=='diff'){q('[data-git-notice]').textContent=value.result.message;return;}
      selected=value.selected;reopen.hidden=false;await fixed(selected,serial,epoch);
    }catch(error){if(serial===ticket && epoch===generation)q('[data-git-notice]').textContent=error.message;}
    finally{if(serial===ticket && epoch===generation)result.setAttribute('aria-busy','false');}
  }
  async function refresh(){
    const epoch=++generation;ticket++;result.setAttribute('aria-busy','false');refreshButton.disabled=true;refreshButton.toggleAttribute('data-loading',true);refreshButton.querySelector('.mw-spinner').hidden=false;list.setAttribute('aria-busy','true');notice.textContent='正在读取 Git…';list.replaceChildren();reopen.hidden=true;history.disabled=true;
    try{
      const value=await request('/state');if(epoch!==generation)return;
      if(workspace!==value.workspace.workspace_id){resultsTicket++;resultRows=[];resultChoice.replaceChildren();renderResult();if(workspace && !result.hidden){result.hidden=true;host.closeResult();}}
      workspace=value.workspace.workspace_id;selected=value.selected;reopen.hidden=!selected;
      await showReviews();if(epoch!==generation)return;
      const view=value.view;notice.textContent=view.phase==='ready'?[view.head,view.tracking,view.message].filter(Boolean).join(' · '):view.message;
      for(const [label,items,side] of [['冲突',view.conflicts,'worktree'],['已暂存',view.staged,'index'],['未暂存',view.changes,'worktree']]){
        if(!items.length)continue;
        const group=document.createElement('section'),heading=document.createElement('h4');heading.textContent=label+' · '+items.length;group.append(heading);
        for(const item of items){const button=document.createElement('button');button.type='button';button.className='mw-dir-row mw-dir-row--compact';button.dataset.gitPath=JSON.stringify([item.path,side]);button.classList.toggle('is-selected',Boolean(displayed && displayed.side===side && JSON.stringify(displayed.path)===JSON.stringify(item.path)));const copy=document.createElement('span');copy.className='mw-dir-row__copy';const headline=document.createElement('span');headline.className='mw-dir-row__headline';const name=document.createElement('strong');name.textContent=item.label;headline.append(name);copy.append(headline);button.append(copy);button.title=label+' · '+item.label;button.setAttribute('aria-label',label+'：'+item.label);button.addEventListener('click',()=>void open(item.path,side,button));group.append(button);}
        list.append(group);
      }
      history.disabled=false;void loadSource();
    }catch(error){if(epoch===generation){workspace='';selected=null;resultsTicket++;resultRows=[];resultChoice.replaceChildren();renderResult();history.disabled=true;notice.textContent=error.message;if(!result.hidden){q('[data-git-diff]').replaceChildren();q('[data-git-notice]').textContent=error.message;}}}
    finally{if(epoch===generation){refreshButton.disabled=false;refreshButton.removeAttribute('data-loading');refreshButton.querySelector('.mw-spinner').hidden=true;list.setAttribute('aria-busy','false');}}
  }
  async function afterDecision(outcome){
    if(!outcome.workspaceId || outcome.workspaceId!==workspace)return;
    const receipt=outcome.receipt;
    let notice;
    if(outcome.error)notice='本次请求未取得执行回执：'+outcome.error+'。请核对下方操作记录，不要直接重试。';
    else if(receipt?.effect_uncertain)notice='执行结果待核对：'+receipt.effect_uncertain;
    else if(receipt?.status==='rejected')notice='已拒绝，本次没有更新暂存区。';
    else if(receipt?.reconciliation)notice='已核对原操作未发生，已解除阻塞；原操作不会重试。';
    else if(receipt?.effect_error)notice='已批准，但执行未完成：'+receipt.effect_error;
    else if(receipt?.effect_settled)notice='所审查的暂存区操作已完成，工作区文件未改写。';
    else notice='决定已记录，执行结果尚未确认，请查看下方操作记录。';
    // A commit, branch, push or PR decided here reads as that operation, never as an index change.
    if(lastPrepared){
      const done=receipt?.effect_settled,label={commit:'提交','branch-create':'新建分支','branch-switch':'切换分支',push:'推送','pr-create':'建 PR',merge:'合并',pull:'拉取',resolve:'解决冲突','merge-abort':'放弃合并'}[lastPrepared] || 'Git 操作';
      if(lastPrepared==='commit' && done){message.value='';try{sessionStorage.removeItem('molis-commit-draft:'+scWorkspace);}catch{}}
      scStatus.textContent=outcome.error?'本次请求未取得执行回执：'+outcome.error:receipt?.status==='rejected'?'已拒绝「'+label+'」，仓库没有改变。':receipt?.effect_error?'「'+label+'」没有完成：'+receipt.effect_error:done?'「'+label+'」已完成，结果见下方记录。':'决定已记录，结果尚未确认。';
      lastPrepared='';q('[data-git-notice]').textContent=scStatus.textContent;await refresh();return;
    }
    displayed=null;action.hidden=true;
    q('[data-git-notice]').textContent=notice+' 再次操作请从左侧重新打开当前差异。';
    await refresh();if(!resultPanel.hidden)await loadResults();
  }
  directory.querySelector('[data-git-refresh]').addEventListener('click',()=>void (host.refreshWorkspace ? host.refreshWorkspace() : refresh()));
  action.addEventListener('click',async()=>{
    if(!displayed || preparing)return;
    const item=displayed,epoch=generation;preparing=true;action.disabled=true;q('[data-git-notice]').textContent='正在准备固定版本审查，暂存区尚未更新…';
    try{
      await request('/prepare-index','POST',{workspace_id:item.workspace_id,path:item.path,revision:item.revision,action:item.side==='index'?'unstage':'stage',operation_id:crypto.randomUUID()});
      if(epoch!==generation)return;
      q('[data-git-notice]').textContent='请核对下方宿主审查；只有批准并执行成功，暂存区才会更新。';await showReviews();
    }catch(error){if(epoch===generation)q('[data-git-notice]').textContent=error.message;}
    finally{preparing=false;action.disabled=false;}
  });
  history.addEventListener('click',async()=>{if(!workspace || history.disabled)return;ticket++;displayed=null;action.hidden=true;reveal(history);q('[data-git-title]').textContent='Git 操作记录';q('[data-git-scope]').textContent='当前工作区的宿主审查与执行结果';q('[data-git-diff]').replaceChildren();q('[data-git-notice]').textContent='';resultPanel.hidden=false;await showReviews();await loadResults();});
  reopen.addEventListener('click',async()=>{if(!selected)return;reveal(reopen);const serial=++ticket,epoch=generation;try{await fixed(selected,serial,epoch);}catch(error){if(serial===ticket && epoch===generation)q('[data-git-notice]').textContent=error.message;}});
  q('[data-git-close]').addEventListener('click',()=>{ticket++;result.setAttribute('aria-busy','false');result.hidden=true;result.classList.remove('is-arriving');host.closeResult();if(opener?.isConnected)opener.focus({preventScroll:true});else (list.querySelector('.is-selected') || refreshButton).focus({preventScroll:true});});
  // Source control: branch, commit, push and PR. Each is prepared for Host review against the repository as shown here,
  // and runs only if approved and the repository has not moved since.
  const sc=directory.querySelector('[data-git-sc]'),message=sc.querySelector('[data-git-commit-message]'),scStatus=sc.querySelector('[data-git-sc-status]'),operations=sc.querySelector('[data-git-operations]');
  let summary=null,draft='',scWorkspace='',busy=false,lastPrepared='';
  const OUTCOME={pending:'等你审查',running:'执行中',succeeded:'已完成',failed:'未完成',denied:'已拒绝',cancelled:'已撤回',expired:'已过期',unknown:'结果待核对'};
  const TOOL={'git-commit':'提交','git-branch-create':'新建分支','git-branch-switch':'切换分支','git-push':'推送','git-pr-create':'建 PR','git-merge':'合并','git-pull':'拉取','git-resolve':'解决冲突','git-merge-abort':'放弃合并'};
  const options=(select,values,keep)=>{select.replaceChildren(...values.map(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;return option;}));if(keep && values.includes(keep))select.value=keep;};
  async function loadOperations(){try{const value=await request('/operations');operations.replaceChildren(...value.operations.slice(0,6).map(op=>{const item=document.createElement('li');item.dataset.outcome=op.outcome;const text=(TOOL[op.tool]||op.tool)+' · '+(OUTCOME[op.outcome]||op.outcome)+' · '+(op.detail||op.failure_reason||op.summary);
      // An address in the result (the PR that was opened) is a link; in the desktop app it opens in the system browser.
      for(const [index,part] of text.split(/(https:\\/\\/[^\\s，。）)]+)/).entries()){
        if(index%2===0){item.append(part);continue;}
        const link=document.createElement('a');link.href=part;link.textContent=part;link.target='_blank';link.rel='noopener noreferrer';
        link.addEventListener('click',event=>{if(!globalThis.molisWorkOpenExternalUrl)return;event.preventDefault();void globalThis.molisWorkOpenExternalUrl(part);});
        item.append(link);
      }
      return item;}));}catch{}}
  async function loadSource(){
    try{
      const value=await request('/summary');summary=value.summary;scWorkspace=value.workspace.workspace_id;sc.hidden=!summary;
      if(!summary){scStatus.textContent=value.message||'';return;}
      draft=value.draft||'';
      // A commit message handed over from a Coding round arrives once, to be edited before anything runs.
      // It stays until that commit is made, so a reload keeps it, and it never replaces what the person has typed.
      try{const handed=sessionStorage.getItem('molis-commit-draft:'+scWorkspace);if(handed && !message.value.trim()){message.value=handed;scStatus.textContent='已放入 Coding 这一轮的提交说明，确认或修改后再提交。';}}catch{}
      sc.querySelector('[data-git-branch]').textContent=summary.branch||('分离的 HEAD '+(summary.head_commit||'').slice(0,8));
      sc.querySelector('[data-git-sync]').textContent=summary.upstream?('↑'+summary.ahead+' ↓'+summary.behind+' · '+summary.upstream):(summary.remotes.length?'还没有推送到远端':'没有远端');
      const commit=sc.querySelector('[data-git-commit]');commit.disabled=!summary.staged.length && !summary.merging;
      commit.textContent=summary.staged.length?'提交 '+summary.staged.length+' 个已暂存文件…':summary.merging?'完成合并提交…':'没有已暂存的文件';
      const push=sc.querySelector('[data-git-push]');push.disabled=!summary.branch || !summary.remotes.length || !summary.head_commit || Boolean(summary.upstream && !summary.ahead);
      push.textContent=!summary.remotes.length?'没有远端':summary.upstream?(summary.ahead?'推送 '+summary.ahead+' 个提交…':'已与远端同步'):'推送并建立远端分支…';
      // Branches Coding keeps for its independent writer directories are checked out there: they can be neither
      // switched to here nor a sensible PR target, so they are not offered.
      const others=summary.branches.filter(branch=>branch!==summary.branch && !branch.startsWith('molis-work/writer/'));
      options(sc.querySelector('[data-git-branch-choice]'),others,sc.querySelector('[data-git-branch-choice]').value);
      options(sc.querySelector('[data-git-merge-choice]'),others,sc.querySelector('[data-git-merge-choice]').value);
      const pull=sc.querySelector('[data-git-pull]');pull.disabled=!summary.upstream || summary.merging;
      pull.textContent=!summary.upstream?'没有远端跟踪分支':summary.behind?'拉取 '+summary.behind+' 个提交…':'拉取…';
      renderConflicts();
      // The PR target follows the repository's main branch unless the person picked one; a value left over from the
      // branch previously checked out is not a choice.
      const base=sc.querySelector('[data-git-pr-base]');if(!base.dataset.watched){base.dataset.watched='true';base.addEventListener('change',()=>{base.dataset.chosen='true';});}
      options(base,others,base.dataset.chosen==='true' && others.includes(base.value) ? base.value : ['main','master'].find(branch=>others.includes(branch)));
      if(summary.conflicted.length)scStatus.textContent='有 '+summary.conflicted.length+' 个冲突文件；解决并暂存后才能提交。';
      await loadOperations();
    }catch(error){sc.hidden=true;}
  }
  async function prepare(operation,label,source){
    if(!summary || busy)return;busy=true;lastPrepared=operation.action;scStatus.textContent='正在准备「'+label+'」的审查，仓库尚未改动…';
    try{
      await request('/operations','POST',{workspace_id:scWorkspace,operation_id:crypto.randomUUID(),revision:summary.revision,operation});
      scStatus.textContent='请核对「'+label+'」的宿主审查；批准并执行成功后才会生效。';
      ticket++;displayed=null;action.hidden=true;resultPanel.hidden=true;reveal(source);
      q('[data-git-title]').textContent=label;q('[data-git-kind]').textContent='宿主审查';q('[data-git-scope]').textContent='';q('[data-git-diff]').replaceChildren();q('[data-git-notice]').textContent='只有批准并执行成功，仓库才会改变。';
      await showReviews();await loadOperations();
    }catch(error){scStatus.textContent=error.message;await loadSource();}
    finally{busy=false;}
  }
  // Merge conflicts: each conflicted file opens with its markers; pick a side per conflict or edit it, then resolve it
  // through a Host review. Resolving is refused while any marker is left; the commit above then finishes the merge.
  const conflicts=sc.querySelector('[data-git-conflicts]'),conflictEditor=sc.querySelector('[data-git-conflict-editor]'),conflictText=sc.querySelector('[data-git-conflict-text]');
  let conflictPath='',conflictSides={ours:'当前',theirs:'合并进来的'};
  const MARKS=['<<<<<<<','|||||||','=======','>>>>>>>'];
  const isMark=(line)=>MARKS.some(mark=>line===mark || line.startsWith(mark+' '));
  const blocksOf=(text)=>{const blocks=[];let block=null,part='';
    text.split('\\n').forEach((line,index)=>{
      if(line.startsWith('<<<<<<<')){block={start:index,ours:[],base:[],theirs:[]};part='ours';return;}
      if(!block)return;
      if(line.startsWith('|||||||')){part='base';return;}
      if(line.startsWith('=======')){part='theirs';return;}
      if(line.startsWith('>>>>>>>')){block.end=index;blocks.push(block);block=null;return;}
      block[part].push(line);});
    return blocks;};
  const syncConflict=()=>{const blocks=blocksOf(conflictText.value),left=conflictText.value.split('\\n').some(isMark);
    const picks=sc.querySelector('[data-git-conflict-picks]');picks.replaceChildren();
    blocks.forEach((block,index)=>{const row=document.createElement('div');row.className='git-sc-pick';row.append(document.createTextNode('第 '+(index+1)+' 处（第 '+(block.start+1)+' 行）'));
      for(const [side,label] of [['ours','用「'+conflictSides.ours+'」'],['theirs','用「'+conflictSides.theirs+'」'],['both','两边都保留']]){
        const pick=document.createElement('button');pick.type='button';pick.className='mw-btn mw-btn--ghost';pick.textContent=label;
        pick.addEventListener('click',()=>{const lines=conflictText.value.split('\\n'),now=blocksOf(conflictText.value)[index];if(!now)return;
          lines.splice(now.start,now.end-now.start+1,...(side==='ours'?now.ours:side==='theirs'?now.theirs:[...now.ours,...now.theirs]));conflictText.value=lines.join('\\n');syncConflict();});
        row.append(pick);}
      picks.append(row);});
    sc.querySelector('[data-git-conflict-state]').textContent=left?'还有冲突标记（<<<<<<< / ======= / >>>>>>>）：选好内容并删掉标记后才能标记为已解决。':'冲突标记都已去掉，可以标记为已解决。';
    sc.querySelector('[data-git-conflict-resolve]').disabled=left;};
  conflictText.addEventListener('input',syncConflict);
  const openConflict=async(path)=>{conflictEditor.hidden=false;sc.querySelector('[data-git-conflict-state]').textContent='正在读取 '+path+'…';
    try{const file=await request('/conflict?path='+encodeURIComponent(path));if(file.outcome!=='conflict-file')throw new Error(file.message || '读不到这个冲突文件');
      conflictPath=path;conflictSides={ours:file.ours,theirs:file.theirs};
      sc.querySelector('[data-git-conflict-file]').textContent=path+' · '+file.conflicts+' 处冲突 · 当前一方「'+file.ours+'」，合并进来的一方「'+file.theirs+'」';
      conflictText.value=file.text;syncConflict();conflictText.focus();}
    catch(error){sc.querySelector('[data-git-conflict-state]').textContent=error.message;}};
  function renderConflicts(){const merging=Boolean(summary && (summary.merging || summary.conflicted.length));conflicts.hidden=!merging;
    if(!merging){conflictEditor.hidden=true;conflictPath='';return;}
    sc.querySelector('[data-git-conflict-note]').textContent=summary.conflicted.length?'合并进行中：'+summary.conflicted.length+' 个文件有冲突。逐个解决后，用上面的提交完成合并；也可以放弃这次合并。':'冲突都已解决。写好提交说明后提交，即可完成合并。';
    sc.querySelector('[data-git-conflict-list]').replaceChildren(...summary.conflicted.map(path=>{const item=document.createElement('li'),open=document.createElement('button');open.type='button';open.className='mw-btn mw-btn--ghost';open.textContent='解决 '+path+'…';open.addEventListener('click',()=>void openConflict(path));item.append(open);return item;}));
    if(conflictPath && !summary.conflicted.includes(conflictPath)){conflictEditor.hidden=true;conflictPath='';}}
  sc.querySelector('[data-git-conflict-resolve]').addEventListener('click',event=>{if(!conflictPath || conflictText.value.split('\\n').some(isMark))return;void prepare({action:'resolve',path:conflictPath,content:conflictText.value},'解决冲突：'+conflictPath,event.currentTarget);});
  sc.querySelector('[data-git-merge-abort]').addEventListener('click',event=>void prepare({action:'merge-abort'},'放弃合并',event.currentTarget));
  sc.querySelector('[data-git-merge]').addEventListener('click',event=>{const branch=sc.querySelector('[data-git-merge-choice]').value;if(branch)void prepare({action:'merge',branch},'把「'+branch+'」合并进来',event.currentTarget);});
  sc.querySelector('[data-git-pull]').addEventListener('click',event=>void prepare({action:'pull'},'拉取',event.currentTarget));
  const toggle=(button,form)=>button.addEventListener('click',()=>{const open=form.hidden;form.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open)form.querySelector('input,select,textarea')?.focus();});
  toggle(sc.querySelector('[data-git-branch-toggle]'),sc.querySelector('[data-git-branch-form]'));
  const prForm=sc.querySelector('[data-git-pr-form]'),prToggle=sc.querySelector('[data-git-pr-toggle]');toggle(prToggle,prForm);
  prToggle.addEventListener('click',async()=>{
    if(prForm.hidden)return;const note=sc.querySelector('[data-git-pr-support]'),create=sc.querySelector('[data-git-pr-create]');note.textContent='正在检查 GitHub CLI…';create.disabled=true;
    const lines=message.value.trim().split('\\n'),title=sc.querySelector('[data-git-pr-title]'),body=sc.querySelector('[data-git-pr-body]');
    if(!title.value)title.value=lines[0] || summary?.branch || '';if(!body.value)body.value=lines.slice(1).join('\\n').trim();
    try{const support=await request('/pr-support');note.textContent=support.message;create.disabled=support.tool!=='ready';}catch(error){note.textContent=error.message;}
  });
  sc.querySelector('[data-git-commit-draft]').addEventListener('click',()=>{message.value=draft;message.focus();if(!draft)scStatus.textContent='暂存区是空的，先暂存要提交的文件。';});
  sc.querySelector('[data-git-commit]').addEventListener('click',event=>{if(!message.value.trim()){scStatus.textContent='请写提交说明，或按暂存内容生成一份再修改。';message.focus();return;}void prepare({action:'commit',message:message.value},'提交',event.currentTarget);});
  sc.querySelector('[data-git-push]').addEventListener('click',event=>{const remote=summary?.upstream?.split('/')[0] || summary?.remotes.find(item=>item.name==='origin')?.name || summary?.remotes[0]?.name;void prepare({action:'push',remote,set_upstream:!summary?.upstream},'推送',event.currentTarget);});
  sc.querySelector('[data-git-branch-switch]').addEventListener('click',event=>{const name=sc.querySelector('[data-git-branch-choice]').value;if(name)void prepare({action:'branch-switch',name},'切换到「'+name+'」',event.currentTarget);});
  sc.querySelector('[data-git-branch-create]').addEventListener('click',event=>{const field=sc.querySelector('[data-git-branch-name]'),name=field.value.trim();if(!name){scStatus.textContent='请写新分支的名字。';field.focus();return;}void prepare({action:'branch-create',name,checkout:sc.querySelector('[data-git-branch-checkout]').checked},'新建分支「'+name+'」',event.currentTarget);});
  sc.querySelector('[data-git-pr-create]').addEventListener('click',event=>void prepare({action:'pr-create',base:sc.querySelector('[data-git-pr-base]').value,title:sc.querySelector('[data-git-pr-title]').value,body:sc.querySelector('[data-git-pr-body]').value,draft:sc.querySelector('[data-git-pr-draft]').checked},'建 PR',event.currentTarget));
  return {refresh,afterDecision,show(face){directory.hidden=face!=='files';if(face!=='files'){ticket++;result.hidden=true;}else void refresh();}};
}`;
