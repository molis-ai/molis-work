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
  const questionDrafts = new Map(), methodSelections = new Map(), configurations = new Map(), mcpSelections = new Map(), mcpSourceSelections = new Map();
  let mcpChoices = [], mcpSourceChoices = [];
  let methodChoices = [], methodDocumentTicket = 0;
  const answeredQuestions = new Set();
  const draftKey = (id) => 'molis-coding-draft:' + root.dataset.codingPrefix + ':' + id;
  const terminal = (phase) => ['completed','failed','stopped','cancelled','reconcile-required'].includes(phase);
  const phases = { starting:'正在准备', running:'执行中', compacting:'正在整理上下文', pausing:'正在暂停', paused:'已暂停', 'awaiting-input':'等待回答', 'awaiting-review':'等待审查', completed:'本轮结束', failed:'执行失败', stopped:'已停止', cancelled:'已取消', 'reconcile-required':'需要核对结果' };
  let state = { sessions:[], models:[], runtimes:[] }, current = '', workspaceId = '', lastRun = null, generation = 0, sending = false, loading = false, pinned = true, recovery = false, checkpointBusy = false, checkpointLoading = false, checkpointKey = "", draftTimer, selectionTask, statusKey = '';
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
  const saveDraft = (id, value, selectedMethods = methodSelections.get(id)) => {
    if (!id) return Promise.resolve();
    rememberDraft(id,value);
    const body={draft:value, ...(mcpSourceSelections.has(id)?{mcp_sources:structuredClone(mcpSourceSelections.get(id))}:{}), ...(mcpSelections.has(id)?{mcp_tools:structuredClone(mcpSelections.get(id))}:{}), ...(configurations.get(id) ? {configuration:structuredClone(configurations.get(id))} : {}), ...(selectedMethods ? {methods:structuredClone(selectedMethods)} : {}), ...(questionDrafts.has(id) ? {question_drafts:structuredClone(questionDrafts.get(id))} : {})};
    const next = (draftWrites.get(id) || Promise.resolve()).catch(() => {}).then(() => api('/sessions/' + encodeURIComponent(id),'PATCH',body));
    draftWrites.set(id,next);
    return next.then(() => { if (current === id && input.value === value) q('[data-coding-draft-status]').textContent = '草稿已保存；模型与方式用于下一轮。'; });
  };
  const flushDraft = () => { clearTimeout(draftTimer); return current ? saveDraft(current,input.value) : Promise.resolve(); };
  const controls = () => {
    const active = lastRun && !terminal(lastRun.phase);
    input.disabled = !current || sending;
    q('[data-coding-send]').disabled = !current || sending || recovery || checkpointBusy || (!active && (!state.models.some(model=>JSON.stringify([model.provider_id,model.model_id])===q('[data-coding-model]').value) || !state.workspaces?.some(workspace=>workspace.workspace_id===workspaceId)));
    q('[data-coding-send]').textContent = sending ? '正在提交…' : active ? '补充要求' : '发送';
    q('[data-coding-stop]').hidden = !active;
    q('[data-coding-stop]').disabled = sending;
    q('[data-coding-intent]').disabled = Boolean(active || sending);
    q('[data-coding-model]').disabled = Boolean(active || sending);
    q('[data-coding-rename]').hidden = !current;
    q('[data-coding-method-open]').disabled = !current || sending;
    q('[data-coding-mcp-open]').disabled=!current || sending;
    const mcpCount=(mcpSelections.get(current) || []).length+(mcpSourceSelections.get(current) || []).length; q('[data-coding-mcp-open]').textContent='MCP'+(mcpCount?' · '+mcpCount:'');
    const writable=['edit','execute'].includes(q('[data-coding-intent]').value);
    q('[data-coding-checkpoints-refresh]').disabled=!current || checkpointLoading;
    q('[data-coding-checkpoints-list]').querySelectorAll('button').forEach(button=>{
      button.disabled=Boolean(!writable || active || sending || recovery || checkpointBusy || checkpointLoading);
      button.title=!writable?'请先选择修改文件或执行方式':active?'等待本轮结束':checkpointBusy?'回退尚未结束或结果待核对':'';
    });
    const count=(methodSelections.get(current) || []).length;
    q('[data-coding-method-open]').textContent='/ 方法'+(count?' · '+count:'');
  };
  const renderDirectory = () => {
    const selectedFilter = directory.querySelector('[data-coding-filter][aria-selected=true]')?.dataset.codingFilter || 'all';
    const needle = directory.querySelector('[data-coding-search]').value.trim().toLocaleLowerCase();
    const list = directory.querySelector('[data-coding-sessions]');
    // Replace the server's first paint once, then preserve live pointer targets.
    if (!directoryClaimed) { list.replaceChildren(); directoryClaimed=true; }
    const visible = state.sessions.filter((session) => session.title.toLocaleLowerCase().includes(needle)
      && (selectedFilter === 'all' || selectedFilter === 'running' && session.state === 'running' || selectedFilter === 'needs-you' && (session.checkpoint_busy || ['waiting-answer','waiting-approval','failed','reconcile-required'].includes(session.state))));
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
      const label=session.checkpoint_busy ? '回退待处理' : labels[session.state] || session.state;if(mark.textContent!==label) mark.textContent=label;
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
  const applyConfiguration = () => {
    const config=configurations.get(current),models=q('[data-coding-model]');
    models.querySelector('[data-unavailable]')?.remove();
    if(config){
      q('[data-coding-intent]').value=config.intent;
      const value=config.provider_id && config.model_id ? JSON.stringify([config.provider_id,config.model_id]) : '';
      if(![...models.options].some(option=>option.value===value)){
        const unavailable=document.createElement('option');unavailable.value=value;unavailable.dataset.unavailable='true';unavailable.textContent='原模型暂不可用，请重新选择';models.append(unavailable);
      }
      models.value=value;workspaceId=config.workspace_id;
    }
    const workspace=state.workspaces?.find(item=>item.workspace_id===workspaceId);
    q('[data-coding-workspace-label]').textContent=workspace?.canonical_path || (workspaceId?'原工作区暂不可用，请重新选择':'选择已授权工作区后开始');
    if(!q('[data-coding-workspace-dialog]').open)q('[data-coding-workspace-choice]').value=workspaceId;
  };
  const rememberConfiguration = () => {
    if(!current)return;
    const [provider_id,model_id]=JSON.parse(q('[data-coding-model]').value || '[]');
    configurations.set(current,{intent:q('[data-coding-intent]').value,provider_id:provider_id || '',model_id:model_id || '',workspace_id:workspaceId});
  };
  const refreshState = async () => {
    const result=await api('/state'); state=result;
    const models=q('[data-coding-model]'); const previous=models.value;
    const options=result.models.map((model) => { const option=document.createElement('option'); option.value=JSON.stringify([model.provider_id,model.model_id]); option.textContent=model.label; return option; });
    if (!options.length) { const option=document.createElement('option'); option.textContent='先配置可用模型'; option.value=''; options.push(option); }
    const modelKey=JSON.stringify(result.models);
    if(models.dataset.options!==modelKey) { models.replaceChildren(...options);models.dataset.options=modelKey;if(options.some(option=>option.value===previous)) models.value=previous; }
    const selectedWorkspace=result.workspaces.find(item=>item.workspace_id===workspaceId) || result.workspace || (result.workspaces.length===1 ? result.workspaces[0] : null);
    if(!configurations.get(current))workspaceId=selectedWorkspace?.workspace_id || '';
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
    applyConfiguration();renderDirectory(); controls();
  };
  const renderMcp = () => {
    const list=q('[data-coding-mcp-list]');list.replaceChildren();const catalog=(state.mcp || []).flatMap(server=>server.tools.map(tool=>({...tool,label:server.label,available:server.enabled && server.health==='connected'})));
    const key=ref=>JSON.stringify([ref.server,ref.tool,ref.version,ref.configuration_version]);
    for(const selected of mcpChoices)if(!catalog.some(tool=>key(tool)===key(selected)))catalog.push({...selected,label:(state.mcp || []).find(server=>server.id===selected.server)?.label || selected.server,available:false,description:'原服务配置或工具版本已不可用，请取消后重新选择。'});
    for(const tool of catalog){
      const row=document.createElement('label');row.className='mw-check-row';const check=document.createElement('input');check.type='checkbox';check.className='mw-check';check.checked=mcpChoices.some(item=>key(item)===key(tool));check.disabled=!tool.available && !check.checked;
      const copy=document.createElement('span');copy.textContent=tool.label+' / '+tool.tool+(tool.available?'':'（不可用）')+' · '+tool.description;
      check.addEventListener('change',()=>{mcpChoices=mcpChoices.filter(item=>key(item)!==key(tool));if(check.checked)mcpChoices.push({server:tool.server,tool:tool.tool,version:tool.version,configuration_version:tool.configuration_version});});row.append(check,copy);list.append(row);
    }
    const sourceKey=ref=>JSON.stringify([ref.server,ref.configuration_version]);
    const sources=(state.mcp || []).filter(server=>server.resources?.length).map(server=>({server:server.id,configuration_version:server.version,label:server.label,resources:server.resources,available:server.enabled && server.health==='connected'}));
    for(const selected of mcpSourceChoices)if(!sources.some(item=>sourceKey(item)===sourceKey(selected)))sources.push({...selected,label:(state.mcp || []).find(server=>server.id===selected.server)?.label || selected.server,resources:[],available:false});
    for(const source of sources){
      const row=document.createElement('label');row.className='mw-check-row';const check=document.createElement('input');check.type='checkbox';check.className='mw-check';check.checked=mcpSourceChoices.some(item=>sourceKey(item)===sourceKey(source));check.disabled=!source.available && !check.checked;
      const copy=document.createElement('span');copy.textContent=source.label+' · 只读资料'+(source.available?'（'+source.resources.length+' 份）':'（不可用，请重新连接或选择）');
      check.addEventListener('change',()=>{mcpSourceChoices=mcpSourceChoices.filter(item=>sourceKey(item)!==sourceKey(source));if(check.checked)mcpSourceChoices.push({server:source.server,configuration_version:source.configuration_version});});row.append(check,copy);list.append(row);
    }
    if(!catalog.length && !sources.length)list.textContent='没有已连接的 MCP 工具或资料。先在 Coding 设置中配置并连接服务。';
  };
  const renderMethods = () => {
    const list=q('[data-coding-method-list]'),needle=q('[data-coding-method-search]').value.trim().toLocaleLowerCase();
    list.replaceChildren();
    const catalog=state.methods || [];
    const rows=catalog.filter(item=>(item.name+' '+item.summary).toLocaleLowerCase().includes(needle));
    for(const method of rows) {
      const row=document.createElement('div');row.className='mw-field';
      const label=document.createElement('label'),check=document.createElement('input');label.className='mw-check-row';check.className='mw-check';check.type='checkbox';
      check.checked=methodChoices.some(ref=>ref.skill_id===method.skill_id && ref.version===method.version);check.disabled=!method.enabled;
      const name=document.createElement('span');name.textContent=method.name+' · v'+method.version;label.append(check,name);
      const description=document.createElement('small');description.textContent=method.summary+(method.enabled?'':'（当前运行时不可用）');
      check.addEventListener('change',()=>{methodChoices=methodChoices.filter(ref=>ref.skill_id!==method.skill_id);if(check.checked)methodChoices.push({skill_id:method.skill_id,version:method.version});});
      const read=document.createElement('button');read.type='button';read.className='mw-btn mw-btn--ghost';read.textContent='查看正文';read.setAttribute('aria-label','查看方法：'+method.name);read.disabled=!method.enabled;
      read.addEventListener('click',async()=>{const ticket=++methodDocumentTicket,doc=q('[data-coding-method-document]');doc.hidden=false;doc.textContent='正在读取方法…';try{
        const result=await api('/methods/'+encodeURIComponent(method.skill_id)+'/'+method.version);if(ticket!==methodDocumentTicket)return;
        const title=document.createElement('h3');title.textContent=result.method.name+' · v'+result.method.version;const body=document.createElement('p');body.textContent=result.method.body;doc.replaceChildren(title,body);doc.scrollIntoView({block:'nearest'});
      }catch(error){if(ticket===methodDocumentTicket)doc.textContent=error.message;}});
      const heading=document.createElement('div');heading.className='coding-method-heading';heading.append(label,read);row.append(heading,description);list.append(row);
    }
    if(!rows.length){const empty=document.createElement('p');empty.textContent=needle?'没有匹配的方法':'当前没有可用方法';list.append(empty);}
    for(const ref of methodChoices.filter(ref=>!catalog.some(method=>method.skill_id===ref.skill_id && method.version===ref.version))) {
      const remove=document.createElement('button');remove.type='button';remove.className='mw-btn';remove.textContent='移除失效方法 '+ref.skill_id+' · v'+ref.version;
      remove.addEventListener('click',()=>{methodChoices=methodChoices.filter(item=>item!==ref);renderMethods();});list.append(remove);
    }
  };
  const openMethods = () => {
    if(!current || sending)return;methodChoices=structuredClone(methodSelections.get(current) || []);methodDocumentTicket++;
    q('[data-coding-method-search]').value='';q('[data-coding-method-document]').hidden=true;q('[data-coding-method-error]').textContent='';renderMethods();q('[data-coding-method-dialog]').showModal();
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
  const renderQuestions = (block,run) => {
    const live=new Set();
    for(const question of run.awaiting_input || []) {
      const key=JSON.stringify([run.ref.run_id,question.pending_id,question.pending_revision]);live.add(key);
      if(answeredQuestions.has(key)) continue;
      let form=[...block.querySelectorAll('[data-coding-question]')].find(node=>node.dataset.questionKey===key);
      const definition=JSON.stringify([question.kind,question.prompt,question.options,question.allows_free_text,question.questions]);
      const hasDefinition=question.kind==='text' || question.questions?.length || question.options?.length;
      if(form && hasDefinition && form.dataset.questionDefinition!==definition) {form.remove();form=null;}
      if(!form) {
        if(!question.html) continue;
        const template=document.createElement('template');template.innerHTML=question.html;
        form=template.content.firstElementChild;if(!form) continue;
        form.dataset.questionKey=key;form.dataset.questionDefinition=definition;block.append(form);
        const id=current;
        const saved=questionDrafts.get(id)?.[key];
        const written=form.querySelector('[data-coding-answer-text]');
        if(written && typeof saved?.text==='string') written.value=saved.text;
        for(const field of form.querySelectorAll('[data-question-index]')) {
          const answer=Array.isArray(saved?.answers) ? saved.answers.find(item=>item?.question===Number(field.dataset.questionIndex)) : null;
          for(const option of field.querySelectorAll('input')) option.checked=Array.isArray(answer?.indexes) && answer.indexes.includes(Number(option.value));
          const other=field.querySelector('textarea');if(other && typeof answer?.other==='string') other.value=answer.other;
        }
        const collect=()=>written ? {text:written.value} : {answers:[...form.querySelectorAll('[data-question-index]')].map(field=>({
          question:Number(field.dataset.questionIndex),indexes:[...field.querySelectorAll('input:checked')].map(option=>Number(option.value)),
          ...(field.querySelector('textarea')?.value.trim() ? {other:field.querySelector('textarea').value} : {}),
        }))};
        const remember=()=>{
          const drafts=questionDrafts.get(id) || {};drafts[key]=collect();questionDrafts.set(id,drafts);
          try{sessionStorage.setItem(draftKey(id)+':questions',JSON.stringify(drafts));}catch{}
        };
        form.addEventListener('input',()=>{
          remember();clearTimeout(draftTimer);
          draftTimer=setTimeout(()=>{void saveDraft(id,localDraft(id) || '').catch(error=>{form.querySelector('[data-question-status]').textContent='答案暂未写入服务，当前窗口仍保留：'+error.message;});},400);
        });
        form.addEventListener('keydown',event=>{if(event.isComposing && event.key==='Enter')event.preventDefault();});
        form.addEventListener('submit',async event=>{
          event.preventDefault();if(form.dataset.busy==='true' || form.dataset.answerable!=='true') return;
          remember();const answer=collect(),message=form.querySelector('[data-question-status]');
          if(written ? !answer.text.trim() : answer.answers.some(item=>!item.indexes.length && !item.other?.trim())) {message.textContent='请回答每一道问题后再提交。';return;}
          form.dataset.busy='true';form.querySelectorAll('input,textarea,button').forEach(node=>node.disabled=true);message.textContent='正在提交原问题的回答…';
          try {
            await api('/sessions/'+encodeURIComponent(id)+'/control','POST',{kind:'answer',run_id:run.ref.run_id,pending_id:question.pending_id,pending_revision:question.pending_revision,...answer});
            answeredQuestions.add(key);
            const drafts=questionDrafts.get(id);if(drafts)delete drafts[key];
            try{sessionStorage.setItem(draftKey(id)+':questions',JSON.stringify(drafts || {}));}catch{}
            form.replaceChildren();const receipt=document.createElement('p');receipt.textContent='回答已交给原执行者，继续这一轮任务。';form.append(receipt);
            void saveDraft(id,localDraft(id) || '').catch(()=>{});
            if(current===id) {void readCurrent();void refreshState().catch(()=>{});}
          } catch(error) {
            message.textContent=error.message;form.querySelectorAll('input,textarea,button').forEach(node=>node.disabled=form.dataset.answerable!=='true');
          } finally {delete form.dataset.busy;}
        });
      }
      const canAnswer=!terminal(run.phase) && question.answerable!==false;
      if(canAnswer && form.dataset.answerable==='false') form.querySelector('[data-question-status]').textContent='';
      form.dataset.answerable=String(canAnswer);
      form.querySelector('[data-question-label]').textContent=canAnswer ? '需要你回答' : '问题不可回答';
      form.querySelector('[data-question-hint]').textContent=canAnswer ? '回答用于继续这一轮任务；离开会话不会取消等待。' : '保留原问题与未提交内容，便于核对；这不表示答案已交付。';
      if(form.dataset.busy!=='true') form.querySelectorAll('input,textarea,button,fieldset').forEach(node=>node.disabled=!canAnswer);
      if(!canAnswer && form.dataset.busy!=='true') form.querySelector('[data-question-status]').textContent=question.unavailable_reason || '这一轮已结束，原问题不可再回答。';
    }
    for(const form of block.querySelectorAll('[data-coding-question]')) {
      if(!live.has(form.dataset.questionKey)) {
        const hadFocus=form.contains(document.activeElement);form.remove();if(hadFocus)input.focus({preventScroll:true});
      }
    }
  };
  const renderRuns = (runs) => {
    const follow = pinned && atBottom(position());
    q('[data-coding-welcome]')?.remove();
    for (const run of runs) {
      let block=[...turns.children].find(node=>node.dataset.run===run.ref.run_id);
      if(!block) { block=document.createElement('section'); block.dataset.run=run.ref.run_id; turns.append(block); }
      renderQuestions(block,run);
      const entries=[
        ...run.turns.filter(turn=>turn.kind!=='system').map((value,index)=>({kind:'turn',value,sequence:value.sequence ?? index})),
        ...run.activity.map((value,index)=>({kind:'activity',value,sequence:value.sequence ?? run.turns.length+index})),
        ...(run.awaiting_input || []).map((value,index)=>({kind:'question',value,sequence:value.sequence ?? run.turns.length+run.activity.length+index})),
      ].sort((a,b)=>a.sequence-b.sequence);
      const groups=[];
      for(const entry of entries) {
        const previous=groups.at(-1);
        if(entry.kind==='activity' && previous?.kind==='activity' && previous.lastSequence+1===entry.sequence) {
          previous.values.push(entry.value);previous.lastSequence=entry.sequence;
        } else groups.push({...entry,values:[entry.value],lastSequence:entry.sequence});
      }
      const ordered=[];
      for(const entry of groups) {
        if(entry.kind==='turn') {
          const turn=entry.value;
          let node=[...block.children].find(node=>node.dataset.turn===turn.turn_id);
          if(!node) { node=document.createElement('article'); node.className='coding-turn'; node.dataset.turn=turn.turn_id; node.dataset.kind=turn.kind; }
          if(renderedText.get(node)!==turn.text) { node.innerHTML=turn.html || ''; if(!turn.html) node.textContent=turn.text; renderedText.set(node,turn.text); enrichCode(node); }
          ordered.push(node);
        } else if(entry.kind==='activity') {
          const activities=entry.values,key=activities[0].call_id;
          let detail=[...block.querySelectorAll('[data-coding-activity]')].find(node=>node.dataset.codingActivity===key);
          if(!detail) { detail=document.createElement('details'); detail.className='coding-activity'; detail.dataset.codingActivity=key; detail.append(document.createElement('summary'),document.createElement('pre')); }
          const unfinished=activities.filter(item=>item.state==='started').length;
          detail.querySelector('summary').textContent=activities.length+' 项执行活动'+(unfinished ? ' · '+unfinished+(terminal(run.phase)?' 项未收到结果':' 项进行中') : '');
          const text=activities.map(item=>item.name+' '+item.target+' · '+({started:terminal(run.phase)?'本轮已结束，工具结果未返回':'进行中',completed:'已返回',failed:'失败',unknown:'历史结果状态未知'}[item.state] || item.state)+(item.output?'\\n'+item.output:'')+(item.output_truncated?'\\n（内容已截断）':'')).join('\\n\\n');
          if(detail.querySelector('pre').textContent!==text) detail.querySelector('pre').textContent=text;
          ordered.push(detail);
        } else {
          const question=entry.value,key=JSON.stringify([run.ref.run_id,question.pending_id,question.pending_revision]);
          const form=[...block.querySelectorAll('[data-coding-question]')].find(node=>node.dataset.questionKey===key);
          if(form) ordered.push(form);
        }
      }
      for(const detail of block.querySelectorAll('[data-coding-activity]')) if(!ordered.includes(detail)) detail.remove();
      // Insert only missing/misplaced entries: polling keeps open tools and a
      // focused question form intact. Live and replay use the same ordering.
      let cursor=block.firstElementChild;
      for(const node of ordered) {
        if(node!==cursor) block.insertBefore(node,cursor);
        cursor=node.nextElementSibling;
      }
    }
    renderCommands(runs);
    lastRun=runs.at(-1)||null;
    const result=q('[data-coding-result]');
    if(!lastRun) { result.textContent="本轮的成果、检查与执行记录会显示在这里。"; delete result.dataset.content; if(statusKey!=='idle'){statusKey='idle';status("输入任务后开始；本轮方式与模型在发送时固定。");} }
    if(lastRun) {
      const values=[['这一轮',phases[lastRun.phase]||lastRun.phase],['模型',lastRun.frozen.model_id],['工作范围',lastRun.frozen.directory.canonical_path],['身份',lastRun.frozen.role_id+' · v'+lastRun.frozen.role_version],['本轮方法',lastRun.frozen.skills.length ? lastRun.frozen.skills.map(method=>method.name+' · v'+method.version).join('、') : '未使用方法'],['本轮 MCP',lastRun.frozen.mcp_tools?.length ? lastRun.frozen.mcp_tools.map(tool=>(tool.server_label || tool.server)+' / '+tool.tool+' · 配置 '+(tool.configuration_version ?? '未记录')+' · '+tool.version).join('、') : '未使用 MCP'],['本轮 MCP 资料',(lastRun.frozen.mcp_sources || []).length ? lastRun.frozen.mcp_sources.map(source=>(source.server_label || source.server)+' · 配置 '+source.configuration_version).join('、') : '未单独选择资料来源'],['用量',lastRun.usage.unavailable_reason || ('输入 '+lastRun.usage.tokens.input+' · 输出 '+lastRun.usage.tokens.output)]];
      if(lastRun.frozen.compaction) values.push(['上下文整理','自动 · 估计超过 '+lastRun.frozen.compaction.above_tokens+' tokens 时选择较早原文 · v'+lastRun.frozen.compaction.version]);
      if(lastRun.activity.some(item=>item.name==='上下文整理')) values.push(['用量范围','以上仅主执行；上下文整理的额外模型请求尚未计入此小计。']);
      const key=JSON.stringify(values); if(result.dataset.content!==key) { const dl=document.createElement('dl'); values.forEach(([label,value])=>{const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=value;dl.append(dt,dd);}); result.replaceChildren(dl);result.dataset.content=key; }
      const nextStatus=lastRun.ref.run_id+':'+lastRun.phase+':'+lastRun.stop_reason;
      if(statusKey!==nextStatus){statusKey=nextStatus;status(lastRun.stop_reason || phases[lastRun.phase] || lastRun.phase,lastRun.phase==='failed');}
    }
    if(follow) turns.scrollTop=turns.scrollHeight;
    q('[data-coding-latest]').hidden=follow || atBottom(position()); controls();
  };
  const readCheckpoints = async () => {
    if(!current || checkpointLoading) return;
    const id=current, ticket=generation;checkpointLoading=true;controls();
    try {
      const data=await api('/sessions/'+encodeURIComponent(id)+'/checkpoints');
      if(current!==id || generation!==ticket)return;
      const list=q('[data-coding-checkpoints-list]');list.replaceChildren();
      data.checkpoints.forEach(item=>{
        const row=document.createElement('section'), label=document.createElement('p'), meta=document.createElement('small'), button=document.createElement('button');
        label.textContent=item.label;meta.textContent=new Date(item.created_at).toLocaleString()+(item.origin_run_id?' · 原轮次 '+item.origin_run_id:'')+(item.directory?' · '+item.directory.canonical_path:'');
        button.className='mw-btn';button.type='button';button.dataset.codingRewind=item.checkpoint_id;button.textContent='预览回退';button.setAttribute('aria-label','预览回退 '+item.label+' '+item.checkpoint_id);
        row.append(label,meta,button);list.append(row);
      });
      q('[data-coding-checkpoints-status]').textContent=checkpointBusy?'回退尚未结束或结果待核对，请查看下方审查。':data.checkpoints.length?'先查看完整预览，再由你批准这一次。':'本会话暂无可读取的检查点；命令修改不在文件检查点范围内。';
    } catch(error) {
      if(current===id && generation===ticket){checkpointKey='';q('[data-coding-checkpoints-status]').textContent='检查点暂不可读：'+error.message;}
    } finally {if(generation===ticket){checkpointLoading=false;controls();}}
  };
  const readCurrent = async (fresh=false) => {
    if(!current || loading && !fresh) return;
    const id=current, ticket=generation; loading=true;
    try {
      const data=await api('/sessions/'+encodeURIComponent(id));
      if(current!==id || ticket!==generation) return;
      recovery=Boolean(data.recovery_required);checkpointBusy=Boolean(data.checkpoint_busy);
      if(!q('[data-coding-title] input')) q('[data-coding-title]').textContent=data.session.title;
      state.sessions=state.sessions.map(record=>record.session_id===id ? data.session : record);
      if(!configurations.has(id)) configurations.set(id,data.configuration);
      if(fresh) {
        if(!configurations.get(id)){
          q('[data-coding-intent]').value='discuss';
          q('[data-coding-model]').value=state.models[0] ? JSON.stringify([state.models[0].provider_id,state.models[0].model_id]) : '';
          workspaceId=state.workspace?.workspace_id || (state.workspaces?.length===1?state.workspaces[0].workspace_id:'');
        }
        applyConfiguration();
      }
      if(!mcpSourceSelections.has(id))mcpSourceSelections.set(id,data.mcp_sources || []);
      if(!mcpSelections.has(id))mcpSelections.set(id,data.mcp_tools || []);
      if(!methodSelections.has(id)) methodSelections.set(id,data.methods || []);
      if(!questionDrafts.has(id)) {
        let saved;try{saved=JSON.parse(sessionStorage.getItem(draftKey(id)+':questions') || 'null');}catch{}
        questionDrafts.set(id,saved && typeof saved==='object' && !Array.isArray(saved) ? saved : data.question_drafts || {});
      }
      if(fresh) { input.value=localDraft(id) ?? data.draft ?? ''; rememberDraft(id,input.value); q('[data-coding-draft-status]').textContent='草稿已恢复；模型与方式用于下一轮。'; turns.replaceChildren(); pinned=!offsets.has(id); }
      renderRuns(data.runs);
      if(checkpointBusy){statusKey='checkpoint';status('回退操作尚未结束，请查看右侧审查或核对结果。');}
      void host.showReviews?.(q('[data-coding-host-reviews]'), data.runs.map(run=>run.ref), data.session.runtime_session_id);
      const nextCheckpointKey=JSON.stringify([id,data.runs.at(-1)?.ref.run_id,data.runs.at(-1)?.ended_at,checkpointBusy]);
      if(fresh || checkpointKey!==nextCheckpointKey){checkpointKey=nextCheckpointKey;void readCheckpoints();}
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
    current=id; generation++; loading=false; lastRun=null; recovery=false;checkpointBusy=false;checkpointLoading=false;checkpointKey='';statusKey='';
    q('[data-coding-checkpoints-list]').replaceChildren();q('[data-coding-checkpoints-status]').textContent='正在读取检查点…';
    q('[data-coding-commands]').replaceChildren();q('[data-coding-commands]').hidden=true;
    input.disabled=true; selectionTask=readCurrent(true);await selectionTask;
  };
  document.addEventListener('molis-work:plugin-item-selected',(event)=>{ if(event.detail.plugin==='coding' && event.detail.itemId) void select(event.detail.itemId); });
  const create = async() => { const result=await api('/sessions','POST',{title:'新编码会话'}); await refreshState(); host.openItem('coding',result.session.session_id,result.session.title); await select(result.session.session_id); input.focus(); };
  const click = async(event) => {
    const target=event.target.closest('button,a'); if(!target) return;
    try {
      if(target.matches('[data-coding-checkpoints-refresh]')) await readCheckpoints();
      if(target.matches('[data-coding-rewind]')) {
        const id=current,ticket=generation;checkpointBusy=true;controls();
        try {
          await api('/sessions/'+encodeURIComponent(id)+'/checkpoints/'+encodeURIComponent(target.dataset.codingRewind)+'/rewind','POST',{intent:q('[data-coding-intent]').value});
          if(current===id && generation===ticket){status('回退预览已准备，请在右侧审查当前内容与回退后的内容。');await readCurrent();}
        } catch(error) {if(current===id && generation===ticket){checkpointBusy=false;throw error;}}
        finally {controls();}
      }
      if(target.matches('[data-coding-mcp-open]')) {await refreshState();mcpChoices=structuredClone(mcpSelections.get(current) || []);mcpSourceChoices=structuredClone(mcpSourceSelections.get(current) || []);renderMcp();q('[data-coding-mcp-error]').textContent='';q('[data-coding-mcp-dialog]').showModal();}
      if(target.matches('[data-coding-mcp-settings-link]'))q('[data-coding-mcp-dialog]').close();
      if(target.matches('[data-coding-mcp-close]'))q('[data-coding-mcp-dialog]').close();
      if(target.matches('[data-coding-method-open]')) openMethods();
      if(target.matches('[data-coding-method-close]')) {methodDocumentTicket++;q('[data-coding-method-dialog]').close();input.focus();}
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
  for(const field of [q('[data-coding-intent]'),q('[data-coding-model]')])field.addEventListener('change',()=>{
    rememberConfiguration();controls();void flushDraft().catch(error=>status('配置暂未保存：'+error.message,true));
  });
  q('[data-coding-method-search]').addEventListener('input',renderMethods);
  q('[data-coding-method-dialog]').addEventListener('cancel',()=>{methodDocumentTicket++;});
  q('[data-coding-mcp-form]').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
    const id=current,previous=mcpSelections.get(id),previousSources=mcpSourceSelections.get(id);mcpSelections.set(id,structuredClone(mcpChoices));mcpSourceSelections.set(id,structuredClone(mcpSourceChoices));
    try{await flushDraft();q('[data-coding-mcp-dialog]').close();controls();status('MCP 选择已保存，仅用于下一轮。');}
    catch(error){mcpSelections.set(id,previous || []);mcpSourceSelections.set(id,previousSources || []);q('[data-coding-mcp-error]').textContent=error.message;}finally{button.disabled=false;}
  });
  q('[data-coding-method-form]').addEventListener('submit',async event=>{
    event.preventDefault();const submit=event.currentTarget.querySelector('[type=submit]');if(submit.disabled)return;
    submit.disabled=true;const id=current,selection=structuredClone(methodChoices);
    try {await saveDraft(id,input.value,selection);methodSelections.set(id,selection);q('[data-coding-method-dialog]').close();controls();input.focus();status('方法选择已保存，用于下一轮；当前执行保持原方法。');}
    catch(error){q('[data-coding-method-error]').textContent=error.message;}finally{submit.disabled=false;}
  });
  q('[data-coding-workspace-form]').addEventListener('submit',async event=>{
    event.preventDefault(); const form=event.currentTarget,submit=form.querySelector('[type=submit]'); if(submit.disabled) return;submit.disabled=true;
    try {
      const path=q('[data-coding-workspace-path]').value.trim();
      if(path) {
        if(!q('[data-coding-workspace-confirm]').checked) throw new Error('请确认将这个目录关联到当前项目');
        const workspace=await host.addWorkspace(path);workspaceId=workspace.workspace_id;
      } else workspaceId=q('[data-coding-workspace-choice]').value;
      if(!workspaceId) throw new Error('请选择或关联一个工作目录');
      rememberConfiguration();await flushDraft();await refreshState();q('[data-coding-workspace-error]').textContent='';q('[data-coding-workspace-path]').value='';q('[data-coding-workspace-confirm]').checked=false;q('[data-coding-workspace-dialog]').close();
    } catch(error) { q('[data-coding-workspace-error]').textContent=error.message; }
    finally {submit.disabled=false;}
  });
  input.addEventListener('keydown',event=>{if(event.key==='/' && !event.isComposing && !input.value.trim()){event.preventDefault();openMethods();}});
  input.addEventListener('keydown' ,event=>{if(event.key==='Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing){event.preventDefault();q('[data-coding-composer]').requestSubmit();}});
  q('[data-coding-composer]').addEventListener('submit',async(event)=>{
    event.preventDefault();if(sending || recovery || checkpointBusy || !current || !input.value.trim()) return;
    const id=current,task=input.value,mcp_sources=structuredClone(mcpSourceSelections.get(current) || []),mcp_tools=structuredClone(mcpSelections.get(current) || []),methods=structuredClone(methodSelections.get(current) || []),activeRun=lastRun,modelValue=q('[data-coding-model]').value,intent=q('[data-coding-intent]').value,workspace_id=workspaceId; sending=true;controls();
    try {
      rememberConfiguration();await flushDraft();
      if(activeRun && !terminal(activeRun.phase)) {
        await api('/sessions/'+encodeURIComponent(id)+'/control','POST',{kind:'steer',run_id:activeRun.ref.run_id,text:task});
        status('补充要求已交给执行引擎，等待后续处理。');
      } else {
        const [provider_id,model_id]=JSON.parse(modelValue);
        await api('/sessions/'+encodeURIComponent(id)+'/runs','POST',{task,intent,provider_id,model_id,workspace_id,methods,mcp_tools,mcp_sources});
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
