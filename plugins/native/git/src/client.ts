/** Reads through declared plugin routes; no Git process or approval lives in the browser. */
export const GIT_CLIENT_FACTORY_SCRIPT = `(host) => {
  const directory=document.querySelector('[data-git-browser]'),result=document.querySelector('[data-git-results]');
  if(!directory || !result)return null;
  const q=selector=>result.querySelector(selector),list=directory.querySelector('[data-git-list]'),notice=directory.querySelector('[data-git-status]'),reopen=directory.querySelector('[data-git-reopen]'),history=directory.querySelector('[data-git-history]');
  let workspace='',generation=0,ticket=0,selected=null,displayed=null,preparing=false;
  const action=q('[data-git-index-action]'),reviews=q('[data-git-reviews]');
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
  function title(item){q('[data-git-title]').textContent=item.path.join('/');q('[data-git-scope]').textContent=(item.side==='index'?'已暂存 · HEAD → 暂存区':'未暂存 · 暂存区 → 工作区')+(item.previous_path?' · 原路径 '+item.previous_path.join('/'):'');}
  async function fixed(item,serial,epoch){
    const value=await host.request('diff','/state?artifact_id='+encodeURIComponent(item.reference.artifact_id)+'&version='+item.reference.version);
    if(serial!==ticket || epoch!==generation)return;
    title(item);q('[data-git-diff]').innerHTML=value.html || '';q('[data-git-notice]').textContent='读取时的固定差异 · v'+item.reference.version+'；磁盘或暂存区后续变化不会改写本次预览。';
    resultPanel.hidden=true;displayed=item;action.hidden=false;action.textContent=item.side==='index'?'取消暂存…':'暂存此版本…';await showReviews();
  }
  async function open(path,side){
    const serial=++ticket,epoch=generation,id=workspace;displayed=null;action.hidden=true;host.openResult();result.hidden=false;q('[data-git-title]').textContent=path.join('/');q('[data-git-scope]').textContent='';q('[data-git-diff]').replaceChildren();q('[data-git-notice]').textContent='正在读取差异…';
    try{
      const value=await request('/diff','POST',{workspace_id:id,path,side});
      if(serial!==ticket || epoch!==generation)return;
      if(value.result.outcome!=='diff'){q('[data-git-notice]').textContent=value.result.message;return;}
      selected=value.selected;reopen.hidden=false;await fixed(selected,serial,epoch);
    }catch(error){if(serial===ticket && epoch===generation)q('[data-git-notice]').textContent=error.message;}
  }
  async function refresh(){
    const epoch=++generation;ticket++;notice.textContent='正在读取 Git…';list.replaceChildren();reopen.hidden=true;history.disabled=true;
    try{
      const value=await request('/state');if(epoch!==generation)return;
      if(workspace!==value.workspace.workspace_id){resultsTicket++;resultRows=[];resultChoice.replaceChildren();renderResult();if(workspace && !result.hidden){result.hidden=true;host.closeResult();}}
      workspace=value.workspace.workspace_id;selected=value.selected;reopen.hidden=!selected;
      await showReviews();if(epoch!==generation)return;
      const view=value.view;notice.textContent=view.phase==='ready'?[view.head,view.tracking,view.message].filter(Boolean).join(' · '):view.message;
      for(const [label,items,side] of [['冲突',view.conflicts,'worktree'],['已暂存',view.staged,'index'],['未暂存',view.changes,'worktree']]){
        if(!items.length)continue;
        const group=document.createElement('section'),heading=document.createElement('h4');heading.textContent=label;group.append(heading);
        for(const item of items){const button=document.createElement('button');button.type='button';button.className='mw-btn mw-btn--ghost';button.textContent=item.label;button.title=label+' · '+item.label;button.setAttribute('aria-label',label+'：'+item.label);button.addEventListener('click',()=>void open(item.path,side));group.append(button);}
        list.append(group);
      }
      history.disabled=false;
    }catch(error){if(epoch===generation){workspace='';selected=null;resultsTicket++;resultRows=[];resultChoice.replaceChildren();renderResult();history.disabled=true;notice.textContent=error.message;if(!result.hidden){q('[data-git-diff]').replaceChildren();q('[data-git-notice]').textContent=error.message;}}}
  }
  async function afterDecision(outcome){
    if(!outcome.workspaceId || outcome.workspaceId!==workspace)return;
    const receipt=outcome.receipt;
    let message;
    if(outcome.error)message='本次请求未取得执行回执：'+outcome.error+'。请核对下方操作记录，不要直接重试。';
    else if(receipt?.effect_uncertain)message='执行结果待核对：'+receipt.effect_uncertain;
    else if(receipt?.status==='rejected')message='已拒绝，本次没有更新暂存区。';
    else if(receipt?.reconciliation)message='已核对原操作未发生，已解除阻塞；原操作不会重试。';
    else if(receipt?.effect_error)message='已批准，但执行未完成：'+receipt.effect_error;
    else if(receipt?.effect_settled)message='所审查的暂存区操作已完成，工作区文件未改写。';
    else message='决定已记录，执行结果尚未确认，请查看下方操作记录。';
    displayed=null;action.hidden=true;
    q('[data-git-notice]').textContent=message+' 再次操作请从左侧重新打开当前差异。';
    await refresh();if(!resultPanel.hidden)await loadResults();
  }
  directory.querySelector('[data-git-refresh]').addEventListener('click',()=>void refresh());
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
  history.addEventListener('click',async()=>{if(!workspace || history.disabled)return;ticket++;displayed=null;action.hidden=true;host.openResult();result.hidden=false;q('[data-git-title]').textContent='Git 操作记录';q('[data-git-scope]').textContent='当前工作区的宿主审查与执行结果';q('[data-git-diff]').replaceChildren();q('[data-git-notice]').textContent='';resultPanel.hidden=false;await showReviews();await loadResults();});
  reopen.addEventListener('click',async()=>{if(!selected)return;host.openResult();result.hidden=false;const serial=++ticket,epoch=generation;try{await fixed(selected,serial,epoch);}catch(error){if(serial===ticket && epoch===generation)q('[data-git-notice]').textContent=error.message;}});
  q('[data-git-close]').addEventListener('click',()=>{ticket++;result.hidden=true;host.closeResult();});
  return {refresh,afterDecision,show(face){directory.hidden=face!=='files';if(face!=='files'){ticket++;result.hidden=true;}else void refresh();}};
}`;
