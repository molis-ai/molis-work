import { atBottom, STICK_THRESHOLD_PX } from "./reading.js";

/** Host supplies navigation; this client only handles Coding's own surface. */
export const CODING_CLIENT_FACTORY_SCRIPT = `(host) => {
  const root = document.querySelector('[data-coding-workbench]');
  const directory = document.querySelector('[data-coding-directory]');
  if (!root || !directory) return;
  const q = (selector) => root.querySelector(selector);
  const turns = q('[data-coding-turns]'), input = q('[data-coding-task]');
  const prefix = root.dataset.codingPrefix + '/api/plugins/io.molis.work.coding';
  const STICK_THRESHOLD_PX = ${STICK_THRESHOLD_PX};
  const atBottom = ${atBottom.toString()};
  const position = () => ({ offset: turns.scrollTop, viewport: turns.clientHeight, content: turns.scrollHeight });
  const renderedText = new WeakMap();
  const directoryRows = new Map(), directoryGroups = new Map();
  let directoryClaimed = false;
  const drafts = new Map(), offsets = new Map(), draftWrites = new Map();
  const draftKey = (id) => 'molis-coding-draft:' + root.dataset.codingPrefix + ':' + id;
  const terminal = (phase) => ['completed','failed','stopped','cancelled','reconcile-required'].includes(phase);
  const phases = { starting:'正在准备', running:'执行中', pausing:'正在暂停', paused:'已暂停', 'awaiting-input':'等待回答', 'awaiting-review':'等待审查', completed:'本轮结束', failed:'执行失败', stopped:'已停止', cancelled:'已取消', 'reconcile-required':'需要核对结果' };
  let state = { sessions:[], models:[], runtimes:[] }, current = '', workspaceId = '', lastRun = null, generation = 0, sending = false, loading = false, pinned = true, recovery = false, draftTimer, selectionTask, statusKey = '';
  const status = (message, error = false) => { q('[data-coding-status]').textContent = message; q('[data-coding-status]').dataset.error = String(error); };
  const api = async (path, method = 'GET', body) => {
    const response = await fetch(prefix + path, { method, cache:'no-store',
      ...(method === 'GET' ? {} : { headers:molisWorkControlHeaders(), body:JSON.stringify(body ?? {}) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '无法完成 Coding 操作');
    return result;
  };
  const localDraft = (id) => {
    if (drafts.has(id)) return drafts.get(id);
    try { const value = sessionStorage.getItem(draftKey(id)); if (value !== null) return value; } catch {}
    return undefined;
  };
  const rememberDraft = (id, value) => {
    drafts.set(id, value);
    try { sessionStorage.setItem(draftKey(id), value); } catch {}
  };
  const saveDraft = (id, value) => {
    if (!id) return Promise.resolve();
    rememberDraft(id,value);
    const next = (draftWrites.get(id) || Promise.resolve()).catch(() => {}).then(() => api('/sessions/' + encodeURIComponent(id),'PATCH',{draft:value}));
    draftWrites.set(id,next);
    return next.then(() => { if (current === id && input.value === value) q('[data-coding-draft-status]').textContent = '草稿已保存；模型与方式用于下一轮。'; });
  };
  const flushDraft = () => { clearTimeout(draftTimer); return current ? saveDraft(current,input.value) : Promise.resolve(); };
  const controls = () => {
    const active = lastRun && !terminal(lastRun.phase);
    input.disabled = !current || sending;
    q('[data-coding-send]').disabled = !current || sending || recovery || !state.models.length || !workspaceId;
    q('[data-coding-send]').textContent = sending ? '正在提交…' : active ? '补充要求' : '发送';
    q('[data-coding-stop]').hidden = !active;
    q('[data-coding-stop]').disabled = sending;
    q('[data-coding-intent]').disabled = Boolean(active || sending);
    q('[data-coding-model]').disabled = Boolean(active || sending);
    q('[data-coding-rename]').hidden = !current;
  };
  const renderDirectory = () => {
    const selectedFilter = directory.querySelector('[data-coding-filter][aria-selected=true]')?.dataset.codingFilter || 'all';
    const needle = directory.querySelector('[data-coding-search]').value.trim().toLocaleLowerCase();
    const list = directory.querySelector('[data-coding-sessions]');
    // Replace the server's first paint once, then preserve live pointer targets.
    if (!directoryClaimed) { list.replaceChildren(); directoryClaimed=true; }
    const visible = state.sessions.filter((session) => session.title.toLocaleLowerCase().includes(needle)
      && (selectedFilter === 'all' || selectedFilter === 'running' && session.state === 'running' || selectedFilter === 'needs-you' && ['waiting-answer','waiting-approval','failed','reconcile-required'].includes(session.state)));
    const visibleIds=new Set(visible.map(session=>session.session_id));
    for(const [id,row] of directoryRows) if(!visibleIds.has(id)) {row.remove();directoryRows.delete(id);}
    list.querySelector('.mw-empty')?.remove();
    if (!visible.length) { const empty = document.createElement('p'); empty.className='mw-empty'; empty.textContent=needle ? '没有匹配的会话' : '还没有编码会话'; list.append(empty); return; }
    const labels = { idle:'尚未执行', running:'执行中', 'waiting-answer':'等你回答', 'waiting-approval':'等你审查', failed:'失败待处理', stopped:'已停止', cancelled:'已取消', 'reconcile-required':'待核对结果', done:'本轮结束' };
    for (const session of visible) {
      let row=directoryRows.get(session.session_id);
      if(!row) {
        row=document.createElement('a');row.className='coding-session-row';row.href='#session-'+encodeURIComponent(session.session_id);row.dataset.codingSession=session.session_id;
        const title=document.createElement('span');title.className='coding-session-title';
        const time=document.createElement('time');time.className='coding-session-time';
        const mark=document.createElement('span');mark.className='mw-status mw-status--plain';
        row.append(title,time,mark);directoryRows.set(session.session_id,row);
      }
      row.setAttribute('aria-current',String(current===session.session_id));
      const [title,time,mark]=row.children;
      if(title.textContent!==session.title) title.textContent=session.title;title.title=session.title;
      if(time.dateTime!==session.updated_at) {time.textContent=session.updated_at.slice(5,10);time.dateTime=session.updated_at;}
      const label=labels[session.state] || session.state;if(mark.textContent!==label) mark.textContent=label;
      const goalKey=session.goal_id || '';let group=directoryGroups.get(goalKey);
      if(!group) {group=document.createElement('section');group.className='coding-session-group';group.append(document.createElement('h3'));directoryGroups.set(goalKey,group);}
      const groupTitle=session.goal_title || (session.goal_id ? '关联 Goal 暂不可用' : '未关联 Goal');
      if(group.firstChild.textContent!==groupTitle) group.firstChild.textContent=groupTitle;
      if(!group.isConnected) list.append(group);
      if(row.parentElement!==group) group.append(row);
    }
    for(const [key,group] of directoryGroups) if(group.children.length===1) {group.remove();directoryGroups.delete(key);}
    // Reorder only when the underlying order changes, preserving pointer/focus targets.
    for(const [goalKey,group] of directoryGroups) {
      const rows=visible.filter(session=>(session.goal_id || '')===goalKey).map(session=>directoryRows.get(session.session_id));
      rows.forEach((row,index)=>{if(group.children[index+1]!==row) group.insertBefore(row,group.children[index+1] || null);});

    }
  };
  const refreshState = async () => {
    const result=await api('/state'); state=result;
    const models=q('[data-coding-model]'); const previous=models.value;
    const options=result.models.map((model) => { const option=document.createElement('option'); option.value=JSON.stringify([model.provider_id,model.model_id]); option.textContent=model.label; return option; });
    if (!options.length) { const option=document.createElement('option'); option.textContent='先配置可用模型'; option.value=''; options.push(option); }
    const modelKey=JSON.stringify(result.models);
    if(models.dataset.options!==modelKey) { models.replaceChildren(...options);models.dataset.options=modelKey;if(options.some(option=>option.value===previous)) models.value=previous; }
    const selectedWorkspace=result.workspaces.find(item=>item.workspace_id===workspaceId) || result.workspace || (result.workspaces.length===1 ? result.workspaces[0] : null);
    workspaceId=selectedWorkspace?.workspace_id || '';
    q('[data-coding-workspace-label]').textContent=selectedWorkspace?.canonical_path || '选择已授权工作区后开始';
    const workspaceChoice=q('[data-coding-workspace-choice]');
    const workspaceKey=JSON.stringify(result.workspaces);
    if(workspaceChoice.dataset.options!==workspaceKey) {workspaceChoice.replaceChildren(...result.workspaces.map(item=>{const option=document.createElement('option');option.value=item.workspace_id;option.textContent=item.canonical_path;return option;}));workspaceChoice.dataset.options=workspaceKey;workspaceChoice.value=workspaceId;}
    if(!q('[data-coding-workspace-dialog]').open) workspaceChoice.value=workspaceId;
    const roles=result.runtimes.find(runtime=>runtime.runtime_id==='prologue')?.roles || [];
    const execute=q('[data-coding-intent] option[value=execute]'); const available=roles.find(role=>role.role_id==='builder');
    execute.disabled=!available?.available; execute.textContent=available?.available ? '执行' : '执行（待接通审批）';
    const edit=q('[data-coding-intent] option[value=edit]'); const writable=roles.find(role=>role.role_id==='writer')?.available;
    edit.disabled=!writable; edit.textContent=writable ? '修改文件' : '修改文件（待接通审批）';
    renderDirectory(); controls();
  };
  const enrichCode = (node) => node.querySelectorAll('pre').forEach(pre => {
    const button=document.createElement('button'); button.type='button'; button.className='mw-btn coding-code-copy'; button.textContent='复制';
    button.addEventListener('click',async()=>{ try { await navigator.clipboard.writeText(pre.querySelector('code')?.textContent || pre.textContent); button.textContent='已复制'; } catch { button.textContent='复制失败，请手动选择'; } }); pre.append(button);
  });
  const renderCommands = (runs) => {
    const region=q('[data-coding-commands]');
    const refs=runs.flatMap((run,index)=>(run.command_outputs || []).map(ref=>({ref,number:index+1})));
    region.hidden=!refs.length;
    for(const {ref,number} of refs) {
      const key=JSON.stringify(ref);
      if([...region.children].some(node=>node.dataset.command===key)) continue;
      const detail=document.createElement('details');detail.className='coding-command';detail.dataset.command=key;
      const summary=document.createElement('summary');summary.textContent='第 '+number+' 轮 · 查看命令回执';
      const body=document.createElement('div');detail.append(summary,body);region.append(detail);
      let loaded=false,busy=false;
      const load=async()=>{
        if(loaded || busy) return;busy=true;body.textContent='正在读取执行回执…';
        const id=current,ticket=generation;
        try {
          const receipt=await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(ref.run_id)+'/commands/'+encodeURIComponent(ref.call_id));
          if(id!==current || ticket!==generation) return;
          loaded=true;body.replaceChildren();
          const condition=receipt.stop_reason==='timed-out' || receipt.timed_out ? '超时' : receipt.stop_reason==='cancelled' || receipt.cancelled ? '已取消' : receipt.exit_code===null ? '退出码未知' : '退出码 '+receipt.exit_code;
          summary.textContent='第 '+number+' 轮 · '+condition;
          const command=document.createElement('pre');command.textContent=receipt.command;body.append(command);
          for(const [label,value] of [['标准输出',receipt.stdout],['标准错误',receipt.stderr]]) {
            const heading=document.createElement('p');heading.textContent=label;const output=document.createElement('pre');output.textContent=value || '（无输出）';body.append(heading,output);
          }
          if(receipt.truncated){const note=document.createElement('p');note.textContent='输出已截断；以上不是完整日志。';body.append(note);}
        } catch(error) {
          if(id!==current || ticket!==generation) return;
          body.textContent=error.message;const retry=document.createElement('button');retry.className='mw-btn';retry.type='button';retry.textContent='重新读取';retry.addEventListener('click',load);body.append(retry);
        } finally {busy=false;}
      };
      detail.addEventListener('toggle',()=>{if(detail.open) void load();});
    }
  };
  const renderRuns = (runs) => {
    const follow = pinned && atBottom(position());
    q('[data-coding-welcome]')?.remove();
    for (const run of runs) {
      let block=[...turns.children].find(node=>node.dataset.run===run.ref.run_id);
      if(!block) { block=document.createElement('section'); block.dataset.run=run.ref.run_id; turns.append(block); }
      for(const turn of run.turns.filter(turn=>turn.kind!=='system')) {
        let node=[...block.children].find(node=>node.dataset.turn===turn.turn_id);
        if(!node) { node=document.createElement('article'); node.className='coding-turn'; node.dataset.turn=turn.turn_id; node.dataset.kind=turn.kind; block.append(node); }
        if(renderedText.get(node)!==turn.text) { node.innerHTML=turn.html || ''; if(!turn.html) node.textContent=turn.text; renderedText.set(node,turn.text); enrichCode(node); }
      }
      if(run.activity.length) {
        let detail=block.querySelector('[data-coding-activity]');
        if(!detail) { detail=document.createElement('details'); detail.className='coding-activity'; detail.dataset.codingActivity=''; detail.append(document.createElement('summary'),document.createElement('pre')); block.append(detail); }
        detail.querySelector('summary').textContent=run.activity.length+' 项工具活动 · '+run.activity.filter(item=>item.state==='started').length+' 项进行中';
        const text=run.activity.map(item=>item.name+' '+item.target+' · '+({started:'进行中',completed:'已返回',failed:'失败',unknown:'历史结果状态未知'}[item.state] || item.state)+(item.output?'\\n'+item.output:'')+(item.output_truncated?'\\n（内容已截断）':'')).join('\\n\\n');
        if(detail.querySelector('pre').textContent!==text) detail.querySelector('pre').textContent=text;
      }
    }
    renderCommands(runs);
    lastRun=runs.at(-1)||null;
    const result=q('[data-coding-result]');
    if(!lastRun) { result.textContent="本轮的成果、检查与执行记录会显示在这里。"; delete result.dataset.content; if(statusKey!=='idle'){statusKey='idle';status("输入任务后开始；本轮方式与模型在发送时固定。");} }
    if(lastRun) {
      const values=[['这一轮',phases[lastRun.phase]||lastRun.phase],['模型',lastRun.frozen.model_id],['工作范围',lastRun.frozen.directory.canonical_path],['身份',lastRun.frozen.role_id+' · v'+lastRun.frozen.role_version],['用量',lastRun.usage.unavailable_reason || ('输入 '+lastRun.usage.tokens.input+' · 输出 '+lastRun.usage.tokens.output)]];
      const key=JSON.stringify(values); if(result.dataset.content!==key) { const dl=document.createElement('dl'); values.forEach(([label,value])=>{const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=value;dl.append(dt,dd);}); result.replaceChildren(dl);result.dataset.content=key; }
      const nextStatus=lastRun.ref.run_id+':'+lastRun.phase+':'+lastRun.stop_reason;
      if(statusKey!==nextStatus){statusKey=nextStatus;status(lastRun.stop_reason || phases[lastRun.phase] || lastRun.phase,lastRun.phase==='failed');}
    }
    if(follow) turns.scrollTop=turns.scrollHeight;
    q('[data-coding-latest]').hidden=follow || atBottom(position()); controls();
  };
  const readCurrent = async (fresh=false) => {
    if(!current || loading && !fresh) return;
    const id=current, ticket=generation; loading=true;
    try {
      const data=await api('/sessions/'+encodeURIComponent(id));
      if(current!==id || ticket!==generation) return;
      recovery=Boolean(data.recovery_required);
      if(!q('[data-coding-title] input')) q('[data-coding-title]').textContent=data.session.title;
      state.sessions=state.sessions.map(record=>record.session_id===id ? data.session : record);
      if(fresh) { input.value=localDraft(id) ?? data.draft ?? ''; rememberDraft(id,input.value); q('[data-coding-draft-status]').textContent='草稿已恢复；模型与方式用于下一轮。'; turns.replaceChildren(); pinned=!offsets.has(id); }
      renderRuns(data.runs);
      void host.showReviews?.(q('[data-coding-host-reviews]'), data.runs.map(run=>run.ref));
      if(data.error) status(data.error,true);
      if(fresh && offsets.has(id)) { turns.scrollTop=offsets.get(id); pinned=atBottom(position()); }
      renderDirectory(); controls();
    } catch(error) { if(current===id && ticket===generation) status(error.message,true); }
    finally { if(ticket===generation) loading=false; }
  };
  const select = async(id) => {
    if(id===current) return selectionTask;
    if(current) { offsets.set(current,turns.scrollTop); void flushDraft().catch(error=>status(error.message,true)); }
    void host.showReviews?.(q('[data-coding-host-reviews]'), []);
    current=id; generation++; loading=false; lastRun=null; recovery=false;statusKey='';
    q('[data-coding-commands]').replaceChildren();q('[data-coding-commands]').hidden=true;
    input.disabled=true; selectionTask=readCurrent(true);await selectionTask;
  };
  document.addEventListener('molis-work:plugin-item-selected',(event)=>{ if(event.detail.plugin==='coding' && event.detail.itemId) void select(event.detail.itemId); });
  const create = async() => { const result=await api('/sessions','POST',{title:'新编码会话'}); await refreshState(); host.openItem('coding',result.session.session_id,result.session.title); await select(result.session.session_id); input.focus(); };
  const click = async(event) => {
    const target=event.target.closest('button,a'); if(!target) return;
    try {
      if(target.matches('[data-coding-workspace-open]')) { q('[data-coding-workspace-dialog]').showModal(); }
      if(target.matches('[data-coding-workspace-close]')) q('[data-coding-workspace-dialog]').close();
      if(target.matches('[data-coding-new]')) { event.preventDefault(); target.disabled=true; try { await create(); } finally { target.disabled=false; } }
      if(target.matches('[data-coding-session]')) { event.preventDefault(); const session=state.sessions.find(item=>item.session_id===target.dataset.codingSession);host.openItem('coding',session.session_id,session.title);await select(session.session_id); }
      if(target.matches('[data-coding-filter]')) { directory.querySelectorAll('[data-coding-filter]').forEach(item=>item.setAttribute('aria-selected',String(item===target))); renderDirectory(); }
      if(target.matches('[data-coding-face]') && target.dataset.codingFace!=='sessions') status('这个导航面尚未装配，现阶段可使用会话入口。');
      if(target.matches('[data-coding-latest]')) { pinned=true;turns.scrollTop=turns.scrollHeight;target.hidden=true; }
      if(target.matches('[data-coding-stop]') && lastRun) { target.disabled=true;await api('/sessions/'+encodeURIComponent(current)+'/control','POST',{run_id:lastRun.ref.run_id,kind:'stop'});status('停止请求已收到，正在确认执行结果。');await readCurrent(); }
      if(target.matches('[data-coding-rename]') && current) {
        const title=q('[data-coding-title]'); if(title.querySelector('input')) return;
        const field=document.createElement('input');field.className='mw-input';field.value=title.textContent;field.setAttribute('aria-label','会话名称');title.replaceChildren(field);field.focus();field.select();
        const save=async()=>{const id=current;const result=await api('/sessions/'+encodeURIComponent(id),'PATCH',{title:field.value});title.textContent=result.session.title;await refreshState();host.openItem('coding',id,result.session.title);status('会话名称已保存。');};
        field.addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();void save().catch(error=>status(error.message,true));}if(event.key==='Escape') title.textContent=state.sessions.find(item=>item.session_id===current)?.title || '';});
        status('输入名称后按 Enter 保存，Esc 取消。');
      }
    } catch(error) { status(error.message,true);controls(); }
  };
  root.addEventListener('click',click);directory.addEventListener('click',click);
  directory.querySelector('[data-coding-search]').addEventListener('input',renderDirectory);
  turns.addEventListener('scroll',()=>{pinned=atBottom(position());q('[data-coding-latest]').hidden=pinned;},{passive:true});
  input.addEventListener('input',()=>{rememberDraft(current,input.value);q('[data-coding-draft-status]').textContent='正在保存草稿…';clearTimeout(draftTimer);const id=current,value=input.value;draftTimer=setTimeout(()=>{void saveDraft(id,value).catch(error=>status('草稿暂未写入服务，当前窗口仍保留：'+error.message,true));},400);});
  q('[data-coding-workspace-form]').addEventListener('submit',async event=>{
    event.preventDefault(); const form=event.currentTarget,submit=form.querySelector('[type=submit]'); if(submit.disabled) return;submit.disabled=true;
    try {
      const path=q('[data-coding-workspace-path]').value.trim();
      if(path) {
        if(!q('[data-coding-workspace-confirm]').checked) throw new Error('请确认将这个目录关联到当前项目');
        const workspace=await host.addWorkspace(path);workspaceId=workspace.workspace_id;
      } else workspaceId=q('[data-coding-workspace-choice]').value;
      if(!workspaceId) throw new Error('请选择或关联一个工作目录');
      await refreshState();q('[data-coding-workspace-error]').textContent='';q('[data-coding-workspace-path]').value='';q('[data-coding-workspace-confirm]').checked=false;q('[data-coding-workspace-dialog]').close();
    } catch(error) { q('[data-coding-workspace-error]').textContent=error.message; }
    finally {submit.disabled=false;}
  });
  input.addEventListener('keydown' ,event=>{if(event.key==='Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing){event.preventDefault();q('[data-coding-composer]').requestSubmit();}});
  q('[data-coding-composer]').addEventListener('submit',async(event)=>{
    event.preventDefault();if(sending || !current || !input.value.trim()) return;
    const id=current,task=input.value,activeRun=lastRun,modelValue=q('[data-coding-model]').value,intent=q('[data-coding-intent]').value,workspace_id=workspaceId; sending=true;controls();
    try {
      await flushDraft();
      if(activeRun && !terminal(activeRun.phase)) {
        await api('/sessions/'+encodeURIComponent(id)+'/control','POST',{kind:'steer',run_id:activeRun.ref.run_id,text:task});
        status('补充要求已交给执行引擎，等待后续处理。');
      } else {
        const [provider_id,model_id]=JSON.parse(modelValue);
        await api('/sessions/'+encodeURIComponent(id)+'/runs','POST',{task,intent,provider_id,model_id,workspace_id});
      }
      if(current===id && input.value===task) input.value='';
      if(localDraft(id)===task) await saveDraft(id,''); await refreshState();await readCurrent();
    } catch(error) { status(error.message,true); }
    finally { sending=false;controls(); }
  });
  void refreshState().catch(error=>status(error.message,true));
  let pollingTicks=0;
  const poll=setInterval(()=>{if(!root.isConnected){clearInterval(poll);return;}if(current) void readCurrent();if(++pollingTicks%5===0) void refreshState().catch(error=>status(error.message,true));},1000);
}`;
