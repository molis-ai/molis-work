import { GIT_SENTENCE_TABLE, sayHostSentence, sayUpstream } from "./sentences.js";

/** Reads through declared plugin routes; no Git process or approval lives in the browser. */
export const GIT_CLIENT_FACTORY_SCRIPT = `(host) => {
  const scope=host.root || document,L=host.translate;
  // A sentence the Host or an action wrote (a refusal, a result, a summary) in the page's language; the times the page shows are the page's too.
  const say=${sayHostSentence.toString()},U=${sayUpstream.toString()},sentences=${JSON.stringify(GIT_SENTENCE_TABLE)},S=sentence=>say(L,sentences,sentence);
  const when=value=>new Date(value).toLocaleString(document.documentElement.lang||'zh-CN');
  const directory=scope.querySelector('[data-git-browser]'),result=scope.querySelector('[data-git-results]');
  if(!directory || !result)return null;
  const lifetime=host.mountPluginClient(directory);if(!lifetime)return null;
  let viewSignal,initialRead=true;
  const q=selector=>result.querySelector(selector),list=directory.querySelector('[data-git-list]'),notice=directory.querySelector('[data-git-status]'),reopen=directory.querySelector('[data-git-reopen]'),history=directory.querySelector('[data-git-history]');
  const refreshButton=directory.querySelector('[data-git-refresh]');let opener=null;
  let workspace='',generation=0,ticket=0,selected=null,displayed=null,preparing=false;
  const action=q('[data-git-index-action]'),reviews=q('[data-git-reviews]'),diffNotice=q('[data-git-notice]');
  const reveal=(source)=>{opener=source;host.openResult();result.hidden=false;result.classList.add('is-arriving');result.setAttribute('aria-busy','false');q('[data-git-close]').focus({preventScroll:true});};
  const showReviews=()=>host.showReviews?.(reviews,[],null,workspace,undefined,{lifetime,signal:viewSignal});
  let resultRows=[],resultsTicket=0,resultSaving=false;
  const resultPanel=q('[data-git-saved-results]'),resultChoice=q('[data-git-result-choice]'),resultSave=q('[data-git-result-save]'),resultStatus=q('[data-git-result-status]');
  const active=epoch=>lifetime.alive && lifetime.visible && !viewSignal?.aborted && epoch===generation;
  const requestPlugin=async(plugin,path,method='GET',body)=>{
    const signal=viewSignal;lifetime.assertCurrent(signal);
    if(!signal || !lifetime.visible)throw new DOMException('View hidden','AbortError');
    const value=await host.request(plugin,path,method,body,method==='GET'?signal:lifetime.signal);
    lifetime.assertCurrent(signal);return value;
  };
  const request=(path,method='GET',body)=>requestPlugin('git',path,method,body);
  const outcomeLabel={succeeded:L('git.outcome.succeeded'),failed:L('git.outcome.failed'),denied:L('git.outcome.denied'),cancelled:L('git.outcome.cancelled'),expired:L('git.outcome.expired')};
  function renderResult(){
    const row=resultRows.find(item=>item.result.review.review_id===resultChoice.value),item=row?.saved?.result || row?.result;
    resultSave.disabled=resultSaving || !row || Boolean(row.saved || row.unavailable);
    q('[data-git-result-summary]').textContent=S(item?.summary || '');
    q('[data-git-result-paths]').textContent=item?.review.paths.join(L('git.list.joiner')) || '';
    const reconciliation=item?.review.reconciliation;
    q('[data-git-result-provenance]').textContent=item ? L('git.result.decided',{who:item.review.decided_by || L('git.result.no-decider'),when:item.review.decided_at ? when(item.review.decided_at) : L('git.result.no-time')})+(reconciliation?L('git.result.checked',{who:reconciliation.actor_id,when:when(reconciliation.at),why:reconciliation.reason}):item.review.reconciliation_reason?L('git.result.checked-old',{why:item.review.reconciliation_reason}):item.review.failure_reason?L('git.result.original',{why:S(item.review.failure_reason)}):'') : '';
    resultStatus.textContent=row?.unavailable ? S(row.unavailable) : row?.saved ? L('git.result.saved',{version:row.saved.reference.version}) : row ? L('git.result.unsaved') : L('git.result.none');
  }
  async function loadResults(){
    const epoch=generation,serial=++resultsTicket,id=workspace,selectedId=resultChoice.value;
    resultSave.disabled=true;
    try{
      const data=await request('/results');if(!active(epoch) || serial!==resultsTicket || id!==workspace)return;
      resultRows=data.results;resultChoice.replaceChildren();
      for(const row of resultRows){const item=row.result,option=document.createElement('option');option.value=item.review.review_id;option.textContent=L(item.review.action==='stage'?'git.action.stage':'git.action.unstage')+' · '+((item.review.reconciliation || item.review.reconciliation_reason)?L('git.result.checked-none'):outcomeLabel[item.outcome])+' · '+item.review.paths.join(L('git.list.joiner'))+' · '+when(item.review.requested_at);resultChoice.append(option);}
      if(resultRows.some(row=>row.result.review.review_id===selectedId))resultChoice.value=selectedId;
      resultChoice.disabled=!resultRows.length;renderResult();
    }catch(error){if(active(epoch) && serial===resultsTicket && id===workspace){resultRows=[];resultChoice.replaceChildren();resultChoice.disabled=true;renderResult();resultStatus.textContent=S(error.message);}}
  }
  lifetime.listen(resultChoice,'change',renderResult);
  lifetime.listen(resultSave,'click',async()=>{
    const row=resultRows.find(item=>item.result.review.review_id===resultChoice.value);if(!row || resultSaving)return;
    const epoch=generation,id=workspace,reviewId=row.result.review.review_id;resultSaving=true;resultSave.disabled=true;resultStatus.textContent=L('git.result.saving');
    try{
      const saved=await request('/results','POST',{workspace_id:id,review_id:reviewId});
      if(!active(epoch) || id!==workspace)return;
      const current=resultRows.find(item=>item.result.review.review_id===reviewId);if(current)current.saved=saved;
      renderResult();
    }catch(error){if(active(epoch) && id===workspace)resultStatus.textContent=L('git.result.save-failed',{reason:S(error.message)});}
    finally{resultSaving=false;if(active(epoch) && id===workspace)resultSave.disabled=Boolean(resultRows.find(item=>item.result.review.review_id===resultChoice.value)?.saved);}
  });
  function title(item){q('[data-git-scope]').dataset.mwState=item.side==='index'?'staged':'unstaged';q('[data-git-kind]').textContent=L('git.diff.kind');q('[data-git-title]').textContent=item.path.join('/');q('[data-git-scope]').textContent=L(item.side==='index'?'git.diff.staged-scope':'git.diff.unstaged-scope')+(item.previous_path?' · '+L('git.diff.renamed-from',{path:item.previous_path.join('/')}):'');}
  async function fixed(item,serial,epoch){
    const value=await requestPlugin('diff','/state?artifact_id='+encodeURIComponent(item.reference.artifact_id)+'&version='+item.reference.version);
    if(serial!==ticket || !active(epoch))return;
    title(item);q('[data-git-diff]').innerHTML=value.html || '';diffNotice.textContent=L('git.diff.as-read',{version:item.reference.version});
    resultPanel.hidden=true;displayed=item;action.hidden=false;action.textContent=L(item.side==='index'?'git.diff.unstage':'git.diff.stage');await showReviews();
  }
  async function open(path,side,button){
    opener=button || opener;list.querySelectorAll('[data-git-path]').forEach(row=>row.classList.toggle('is-selected',row.dataset.gitPath===JSON.stringify([path,side])));
    const serial=++ticket,epoch=generation,id=workspace;displayed=null;action.hidden=true;reveal(button || opener);result.setAttribute('aria-busy','true');q('[data-git-title]').textContent=path.join('/');q('[data-git-scope]').textContent='';q('[data-git-diff]').replaceChildren();diffNotice.textContent=L('git.diff.reading');
    try{
      const value=await request('/diff','POST',{workspace_id:id,path,side});
      if(serial!==ticket || !active(epoch))return;
      if(value.result.outcome!=='diff'){diffNotice.textContent=S(value.result.message);return;}
      selected=value.selected;reopen.hidden=false;await fixed(selected,serial,epoch);
    }catch(error){if(serial===ticket && active(epoch))diffNotice.textContent=S(error.message);}
    finally{if(serial===ticket && active(epoch))result.setAttribute('aria-busy','false');}
  }
  async function refresh(){
    if(!lifetime.visible)return;const epoch=++generation;ticket++;result.setAttribute('aria-busy','false');refreshButton.disabled=true;refreshButton.toggleAttribute('data-loading',true);refreshButton.querySelector('.mw-spinner').hidden=false;list.setAttribute('aria-busy','true');notice.textContent=L('git.list.reading');reopen.hidden=true;history.disabled=true;
    try{
      const value=await request('/state');if(!active(epoch))return;
      if(workspace!==value.workspace.workspace_id){list.replaceChildren();resultsTicket++;resultRows=[];resultChoice.replaceChildren();renderResult();if(workspace && !result.hidden){result.hidden=true;host.closeResult();}}
      workspace=value.workspace.workspace_id;selected=value.selected;reopen.hidden=!selected;
      await showReviews();if(!active(epoch))return;
      await loadSource();if(!active(epoch))return;
      const view=value.view;notice.textContent=view.phase==='ready'?[S(view.head),U(L,view.upstream),view.message&&S(view.message)].filter(Boolean).join(' · '):S(view.message);
      const entries=[[L('git.group.conflicts'),view.conflicts,'worktree','conflict'],[L('git.group.staged'),view.staged,'index','staged'],[L('git.group.unstaged'),view.changes,'worktree','unstaged']];
      const groups=new Map([...list.children].map(group=>[group.dataset.gitGroup,group])),rows=new Map([...list.querySelectorAll('[data-git-path]')].map(row=>[row.dataset.gitPath,row]));
      const wanted=new Set(entries.flatMap(([,items,side])=>items.map(item=>JSON.stringify([item.path,side]))));
      for(const [key,row] of rows)if(!wanted.has(key)){row.remove();rows.delete(key);}
      const ordered=[];
      for(const [label,items,side,state] of entries){
        if(!items.length)continue;
        let group=groups.get(state);if(!group){group=document.createElement('section');group.dataset.gitGroup=state;group.append(document.createElement('h4'));}
        groups.delete(state);ordered.push(group);
        const heading=group.querySelector('h4');heading.textContent=label+' · '+items.length;heading.dataset.mwState=state;let previous=heading;
        for(const item of items){const key=JSON.stringify([item.path,side]);let button=rows.get(key);
          if(!button){button=document.createElement('button');button.type='button';button.className='mw-dir-row mw-dir-row--compact';button.dataset.gitPath=key;const copy=document.createElement('span');copy.className='mw-dir-row__copy';const headline=document.createElement('span');headline.className='mw-dir-row__headline';headline.append(document.createElement('strong'));copy.append(headline);button.append(copy);lifetime.listen(button,'click',()=>void open(item.path,side,button));}
          button.querySelector('strong').textContent=item.label;button.title=label+' · '+item.label;button.setAttribute('aria-label',L('git.group.row-label',{group:label,name:item.label}));
          button.classList.toggle('is-selected',Boolean(displayed && displayed.workspace_id===workspace && displayed.side===side && JSON.stringify(displayed.path)===JSON.stringify(item.path) || opener===button && result.getAttribute('aria-busy')==='true'));
          if(previous.nextElementSibling!==button)group.insertBefore(button,previous.nextElementSibling);previous=button;
        }
      }
      for(const group of groups.values())group.remove();
      ordered.forEach((group,index)=>{if(list.children[index]!==group)list.insertBefore(group,list.children[index] || null);});
      history.disabled=false;
    }catch(error){if(active(epoch)){list.replaceChildren();workspace='';selected=null;resultsTicket++;resultRows=[];resultChoice.replaceChildren();renderResult();history.disabled=true;notice.textContent=S(error.message);if(!result.hidden){q('[data-git-diff]').replaceChildren();diffNotice.textContent=S(error.message);}}}
    finally{if(active(epoch)){refreshButton.disabled=false;refreshButton.removeAttribute('data-loading');refreshButton.querySelector('.mw-spinner').hidden=true;list.setAttribute('aria-busy','false');}}
  }
  async function afterDecision(outcome){
    if(!lifetime.visible || !outcome.workspaceId || outcome.workspaceId!==workspace)return;
    const state=outcome.state,reason=L('git.decision.details');
    const notice=L({unavailable:'git.decision.no-receipt',uncertain:'git.decision.uncertain',rejected:'git.decision.rejected',reconciled:'git.decision.reconciled',failed:'git.decision.failed',settled:'git.decision.settled'}[state] || 'git.decision.pending',{reason});
    // A commit, branch, push or PR decided here reads as that operation, never as an index change.
    if(lastPrepared){
      const done=state==='settled',label=OPERATION[lastPrepared] || L('git.op.other');
      if(lastPrepared==='commit' && done){message.value='';try{sessionStorage.removeItem('molis-commit-draft:'+scWorkspace);}catch{}}
      scStatus.textContent=state==='unavailable'?L('git.op.no-receipt',{reason}):state==='rejected'?L('git.op.rejected',{op:label}):state==='failed'?L('git.op.failed',{op:label,reason}):done?L('git.op.done',{op:label}):L('git.op.recorded');
      lastPrepared='';diffNotice.textContent=scStatus.textContent;await refresh();return;
    }
    if(result.getAttribute('aria-busy')==='true')return;
    if(action.hidden){displayed=null;diffNotice.textContent=notice+' '+L('git.decision.reopen');}
    const signal=viewSignal;await refresh();if(!signal.aborted && !resultPanel.hidden)await loadResults();
  }
  lifetime.listen(refreshButton,'click',()=>void (host.refreshWorkspace ? host.refreshWorkspace() : refresh()));
  lifetime.listen(action,'click',async()=>{
    if(!displayed || preparing)return;
    const item=displayed,epoch=generation;preparing=true;action.disabled=true;diffNotice.textContent=L('git.index.preparing');
    try{
      await request('/prepare-index','POST',{workspace_id:item.workspace_id,path:item.path,revision:item.revision,action:item.side==='index'?'unstage':'stage',operation_id:crypto.randomUUID()});
      if(!active(epoch))return;
      action.hidden=true;diffNotice.textContent=L('git.index.review');await showReviews();
    }catch(error){if(active(epoch))diffNotice.textContent=S(error.message);}
    finally{preparing=false;if(lifetime.alive)action.disabled=false;}
  });
  lifetime.listen(history,'click',async()=>{if(!workspace || history.disabled)return;const epoch=generation;ticket++;displayed=null;action.hidden=true;reveal(history);q('[data-git-title]').textContent=L('git.history.title');q('[data-git-scope]').textContent=L('git.history.scope');q('[data-git-diff]').replaceChildren();diffNotice.textContent='';resultPanel.hidden=false;await showReviews();if(active(epoch))await loadResults();});
  lifetime.listen(reopen,'click',async()=>{if(!selected)return;reveal(reopen);const serial=++ticket,epoch=generation;try{await fixed(selected,serial,epoch);}catch(error){if(serial===ticket && active(epoch))diffNotice.textContent=S(error.message);}});
  lifetime.listen(q('[data-git-close]'),'click',()=>{ticket++;result.setAttribute('aria-busy','false');result.hidden=true;result.classList.remove('is-arriving');host.closeResult();if(opener?.isConnected)opener.focus({preventScroll:true});else (list.querySelector('.is-selected') || refreshButton).focus({preventScroll:true});});
  // Source control: branch, commit, push and PR. Each is prepared for Host review against the repository as shown here,
  // and runs only if approved and the repository has not moved since.
  const sc=directory.querySelector('[data-git-sc]'),message=sc.querySelector('[data-git-commit-message]'),scStatus=sc.querySelector('[data-git-sc-status]'),operations=sc.querySelector('[data-git-operations]');
  let summary=null,draft='',scWorkspace='',busy=false,lastPrepared='';
  lifetime.listen(sc.querySelector('[data-git-pr-base]'),'change',event=>{event.currentTarget.dataset.chosen='true';});
  const OUTCOME={...outcomeLabel,pending:L('git.outcome.pending'),running:L('git.outcome.running'),unknown:L('git.outcome.unknown')};
  // The operations by what they are called, here and in the record (whose tools carry a git- prefix).
  const OPERATION={commit:L('git.op.commit'),'branch-create':L('git.op.branch-create'),'branch-switch':L('git.op.branch-switch'),push:L('git.op.push'),'pr-create':L('git.op.pr-create'),merge:L('git.op.merge'),pull:L('git.op.pull'),resolve:L('git.op.resolve'),'merge-abort':L('git.op.merge-abort')};
  const options=(select,values,keep)=>{select.replaceChildren(...values.map(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;return option;}));if(keep && values.includes(keep))select.value=keep;};
  async function loadOperations(){const epoch=generation;try{const value=await request('/operations');if(!active(epoch))return;operations.replaceChildren(...value.operations.slice(0,6).map(op=>{const item=document.createElement('li');item.dataset.outcome=op.outcome;const text=(OPERATION[String(op.tool).replace(/^git-/,'')]||op.tool)+' · '+(OUTCOME[op.outcome]||op.outcome)+' · '+S(op.detail||op.failure_reason||op.summary||'');
      // An address in the result (the PR that was opened) is a link; in the desktop app it opens in the system browser.
      for(const [index,part] of text.split(/(https:\\/\\/[^\\s，。）)]+)/).entries()){
        if(index%2===0){item.append(part);continue;}
        const link=document.createElement('a');link.href=part;link.textContent=part;link.target='_blank';link.rel='noopener noreferrer';
        lifetime.listen(link,'click',event=>{if(!globalThis.molisWorkOpenExternalUrl)return;event.preventDefault();void globalThis.molisWorkOpenExternalUrl(part);});
        item.append(link);
      }
      return item;}));}catch{}}
  async function loadSource(){
    const epoch=generation;try{
      const value=await request('/summary');if(!active(epoch))return;summary=value.summary;scWorkspace=value.workspace.workspace_id;sc.hidden=!summary;
      if(!summary){scStatus.textContent=S(value.message||'');return;}
      draft=value.draft||'';
      // A commit message handed over from a Coding round arrives once, to be edited before anything runs.
      // It stays until that commit is made, so a reload keeps it, and it never replaces what the person has typed.
      try{const handed=sessionStorage.getItem('molis-commit-draft:'+scWorkspace);if(handed && !message.value.trim()){message.value=handed;scStatus.textContent=L('git.commit.handed');}}catch{}
      sc.querySelector('[data-git-branch]').textContent=summary.branch||L('git.branch.detached',{commit:(summary.head_commit||'').slice(0,8)});
      sc.querySelector('[data-git-sync]').textContent=summary.upstream?('↑'+summary.ahead+' ↓'+summary.behind+' · '+summary.upstream):(summary.remotes.length?L('git.sync.unpushed'):L('git.sync.no-remote'));
      const commit=sc.querySelector('[data-git-commit]');commit.disabled=!summary.staged.length && !summary.merging;
      commit.textContent=summary.staged.length?L('git.commit.staged',{count:summary.staged.length}):summary.merging?L('git.commit.merge'):L('git.commit.nothing');
      const push=sc.querySelector('[data-git-push]');push.disabled=!summary.branch || !summary.remotes.length || !summary.head_commit || Boolean(summary.upstream && !summary.ahead);
      push.textContent=!summary.remotes.length?L('git.sync.no-remote'):summary.upstream?(summary.ahead?L('git.push.count',{count:summary.ahead}):L('git.push.synced')):L('git.push.upstream');
      // Branches Coding keeps for its independent writer directories are checked out there: they can be neither
      // switched to here nor a sensible PR target, so they are not offered.
      const others=summary.branches.filter(branch=>branch!==summary.branch && !branch.startsWith('molis-work/writer/'));
      options(sc.querySelector('[data-git-branch-choice]'),others,sc.querySelector('[data-git-branch-choice]').value);
      options(sc.querySelector('[data-git-merge-choice]'),others,sc.querySelector('[data-git-merge-choice]').value);
      const pull=sc.querySelector('[data-git-pull]');pull.disabled=!summary.upstream || summary.merging;
      pull.textContent=!summary.upstream?L('git.pull.no-upstream'):summary.behind?L('git.pull.count',{count:summary.behind}):L('git.pull.any');
      renderConflicts();
      // The PR target follows the repository's main branch unless the person picked one; a value left over from the
      // branch previously checked out is not a choice.
      const base=sc.querySelector('[data-git-pr-base]');
      options(base,others,base.dataset.chosen==='true' && others.includes(base.value) ? base.value : ['main','master'].find(branch=>others.includes(branch)));
      if(summary.conflicted.length)scStatus.textContent=L('git.conflict.count',{count:summary.conflicted.length});
      await loadOperations();
    }catch(error){if(active(epoch))sc.hidden=true;}
  }
  async function prepare(operation,label,source){
    if(!summary || busy || !lifetime.visible)return;const epoch=generation;busy=true;lastPrepared=operation.action;scStatus.textContent=L('git.op.preparing',{op:label});
    try{
      await request('/operations','POST',{workspace_id:scWorkspace,operation_id:crypto.randomUUID(),revision:summary.revision,operation});if(!active(epoch))return;
      scStatus.textContent=L('git.op.review',{op:label});
      ticket++;displayed=null;action.hidden=true;resultPanel.hidden=true;reveal(source);
      q('[data-git-title]').textContent=label;q('[data-git-kind]').textContent=L('git.op.review-kind');q('[data-git-scope]').textContent='';q('[data-git-diff]').replaceChildren();diffNotice.textContent=L('git.op.review-note');
      await showReviews();if(active(epoch))await loadOperations();
    }catch(error){if(active(epoch)){scStatus.textContent=S(error.message);await loadSource();}}
    finally{busy=false;}
  }
  // Merge conflicts: each conflicted file opens with its markers; pick a side per conflict or edit it, then resolve it
  // through a Host review. Resolving is refused while any marker is left; the commit above then finishes the merge.
  const conflicts=sc.querySelector('[data-git-conflicts]'),conflictEditor=sc.querySelector('[data-git-conflict-editor]'),conflictText=sc.querySelector('[data-git-conflict-text]');
  let conflictTicket=0,conflictPath='',conflictSides={ours:L('git.conflict.ours'),theirs:L('git.conflict.theirs')};
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
    blocks.forEach((block,index)=>{const row=document.createElement('div');row.className='git-sc-pick';row.append(document.createTextNode(L('git.conflict.at',{index:index+1,line:block.start+1})));
      for(const [side,label] of [['ours',L('git.conflict.use',{side:conflictSides.ours})],['theirs',L('git.conflict.use',{side:conflictSides.theirs})],['both',L('git.conflict.both')]]){
        const pick=document.createElement('button');pick.type='button';pick.className='mw-btn mw-btn--ghost';pick.textContent=label;
        lifetime.listen(pick,'click',()=>{const lines=conflictText.value.split('\\n'),now=blocksOf(conflictText.value)[index];if(!now)return;
          lines.splice(now.start,now.end-now.start+1,...(side==='ours'?now.ours:side==='theirs'?now.theirs:[...now.ours,...now.theirs]));conflictText.value=lines.join('\\n');syncConflict();});
        row.append(pick);}
      picks.append(row);});
    sc.querySelector('[data-git-conflict-state]').textContent=left?L('git.conflict.marks-left'):L('git.conflict.marks-gone');
    sc.querySelector('[data-git-conflict-resolve]').disabled=left;};
  lifetime.listen(conflictText,'input',syncConflict);
  const openConflict=async(path)=>{const epoch=generation,serial=++conflictTicket;conflictEditor.hidden=false;sc.querySelector('[data-git-conflict-state]').textContent=L('git.conflict.reading',{path});
    try{const file=await request('/conflict?path='+encodeURIComponent(path));if(!active(epoch) || serial!==conflictTicket)return;if(file.outcome!=='conflict-file')throw new Error(file.message ? S(file.message) : L('git.conflict.unreadable'));
      conflictPath=path;conflictSides={ours:file.ours==='当前'?L('git.conflict.ours'):file.ours,theirs:file.theirs==='合并进来的一方'?L('git.conflict.theirs'):file.theirs};
      sc.querySelector('[data-git-conflict-file]').textContent=L('git.conflict.file',{path,count:file.conflicts,ours:conflictSides.ours,theirs:conflictSides.theirs});
      conflictText.value=file.text;syncConflict();conflictText.focus();}
    catch(error){if(active(epoch) && serial===conflictTicket)sc.querySelector('[data-git-conflict-state]').textContent=S(error.message);}};
  function renderConflicts(){const merging=Boolean(summary && (summary.merging || summary.conflicted.length));conflicts.hidden=!merging;
    if(!merging){conflictEditor.hidden=true;conflictPath='';return;}
    sc.querySelector('[data-git-conflict-note]').textContent=summary.conflicted.length?L('git.conflict.merging',{count:summary.conflicted.length}):L('git.conflict.all-resolved');
    sc.querySelector('[data-git-conflict-list]').replaceChildren(...summary.conflicted.map(path=>{const item=document.createElement('li'),open=document.createElement('button');open.type='button';open.className='mw-btn mw-btn--ghost';open.textContent=L('git.conflict.resolve-file',{path});lifetime.listen(open,'click',()=>void openConflict(path));item.append(open);return item;}));
    if(conflictPath && !summary.conflicted.includes(conflictPath)){conflictEditor.hidden=true;conflictPath='';}}
  lifetime.listen(sc.querySelector('[data-git-conflict-resolve]'),'click',event=>{if(!conflictPath || conflictText.value.split('\\n').some(isMark))return;void prepare({action:'resolve',path:conflictPath,content:conflictText.value},L('git.op.resolve-file',{path:conflictPath}),event.currentTarget);});
  lifetime.listen(sc.querySelector('[data-git-merge-abort]'),'click',event=>void prepare({action:'merge-abort'},OPERATION['merge-abort'],event.currentTarget));
  lifetime.listen(sc.querySelector('[data-git-merge]'),'click',event=>{const branch=sc.querySelector('[data-git-merge-choice]').value;if(branch)void prepare({action:'merge',branch},L('git.op.merge-branch',{branch}),event.currentTarget);});
  lifetime.listen(sc.querySelector('[data-git-pull]'),'click',event=>void prepare({action:'pull'},OPERATION.pull,event.currentTarget));
  const toggle=(button,form)=>lifetime.listen(button,'click',()=>{const open=form.hidden;form.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open)form.querySelector('input,select,textarea')?.focus();});
  toggle(sc.querySelector('[data-git-branch-toggle]'),sc.querySelector('[data-git-branch-form]'));
  const prForm=sc.querySelector('[data-git-pr-form]'),prToggle=sc.querySelector('[data-git-pr-toggle]');toggle(prToggle,prForm);
  lifetime.listen(prToggle,'click',async()=>{
    if(prForm.hidden)return;const epoch=generation,note=sc.querySelector('[data-git-pr-support]'),create=sc.querySelector('[data-git-pr-create]');note.textContent=L('git.pr.checking');create.disabled=true;
    const lines=message.value.trim().split('\\n'),title=sc.querySelector('[data-git-pr-title]'),body=sc.querySelector('[data-git-pr-body]');
    if(!title.value)title.value=lines[0] || summary?.branch || '';if(!body.value)body.value=lines.slice(1).join('\\n').trim();
    try{const support=await request('/pr-support');if(!active(epoch))return;note.textContent=S(support.message);create.disabled=support.tool!=='ready';}catch(error){if(active(epoch))note.textContent=S(error.message);}
  });
  lifetime.listen(sc.querySelector('[data-git-commit-draft]'),'click',()=>{message.value=draft;message.focus();if(!draft)scStatus.textContent=L('git.commit.empty-index');});
  lifetime.listen(sc.querySelector('[data-git-commit]'),'click',event=>{if(!message.value.trim()){scStatus.textContent=L('git.commit.need-message');message.focus();return;}void prepare({action:'commit',message:message.value},OPERATION.commit,event.currentTarget);});
  lifetime.listen(sc.querySelector('[data-git-push]'),'click',event=>{const remote=summary?.upstream?.split('/')[0] || summary?.remotes.find(item=>item.name==='origin')?.name || summary?.remotes[0]?.name;void prepare({action:'push',remote,set_upstream:!summary?.upstream},OPERATION.push,event.currentTarget);});
  lifetime.listen(sc.querySelector('[data-git-branch-switch]'),'click',event=>{const name=sc.querySelector('[data-git-branch-choice]').value;if(name)void prepare({action:'branch-switch',name},L('git.op.switch-to',{name}),event.currentTarget);});
  lifetime.listen(sc.querySelector('[data-git-branch-create]'),'click',event=>{const field=sc.querySelector('[data-git-branch-name]'),name=field.value.trim();if(!name){scStatus.textContent=L('git.branch.need-name');field.focus();return;}void prepare({action:'branch-create',name,checkout:sc.querySelector('[data-git-branch-checkout]').checked},L('git.op.create-branch',{name}),event.currentTarget);});
  lifetime.listen(sc.querySelector('[data-git-pr-create]'),'click',event=>void prepare({action:'pr-create',base:sc.querySelector('[data-git-pr-base]').value,title:sc.querySelector('[data-git-pr-title]').value,body:sc.querySelector('[data-git-pr-body]').value,draft:sc.querySelector('[data-git-pr-draft]').checked},OPERATION['pr-create'],event.currentTarget));
  lifetime.whenVisible(signal=>{
    viewSignal=signal;initialRead=true;refreshButton.disabled=true;refreshButton.toggleAttribute('data-loading',true);refreshButton.querySelector('.mw-spinner').hidden=false;list.setAttribute('aria-busy','true');notice.textContent=L('git.list.reading-workspace');
    return ()=>{generation++;ticket++;resultsTicket++;conflictTicket++;result.setAttribute('aria-busy','false');refreshButton.disabled=false;refreshButton.removeAttribute('data-loading');refreshButton.querySelector('.mw-spinner').hidden=true;list.setAttribute('aria-busy','false');};
  });
  lifetime.watchRevision(signal=>host.request('git','/view-revision','GET',undefined,signal),async()=>{
    if(preparing || result.getAttribute('aria-busy')==='true' || refreshButton.disabled && !initialRead)return false;
    initialRead=false;await refresh();
  });
  return {refresh,afterDecision,show(face){directory.hidden=face!=='files';if(face!=='files'){ticket++;result.hidden=true;}}};
}`;
