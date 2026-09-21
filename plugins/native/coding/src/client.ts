import { codingGoalVersionLabel } from "./goal-versions.js";
import { codingUsageSummary } from "./usage.js";
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
  const codingGoalVersionLabel = ${codingGoalVersionLabel.toString()};
  const codingUsageSummary = ${codingUsageSummary.toString()};
  const position = () => ({ offset: turns.scrollTop, viewport: turns.clientHeight, content: turns.scrollHeight });
  const renderedText = new WeakMap();
  const directoryRows = new Map(), directoryGroups = new Map();
  let directoryClaimed = false;
  const drafts = new Map(), offsets = new Map(), draftWrites = new Map();
  const materialSelections = new Map();
  const questionDrafts = new Map(), methodSelections = new Map(), configurations = new Map(), mcpSelections = new Map(), mcpSourceSelections = new Map();
  let mcpChoices = [], mcpSourceChoices = [];
  let methodChoices = [], methodDocumentTicket = 0;
  const answeredQuestions = new Set();
  const draftKey = (id) => 'molis-coding-draft:' + root.dataset.codingPrefix + ':' + id;
  const terminal = (phase) => ['completed','failed','stopped','cancelled','reconcile-required'].includes(phase);
  const phases = { starting:'正在准备', running:'执行中', compacting:'正在整理上下文', pausing:'正在暂停', paused:'已暂停', 'awaiting-input':'等待回答', 'awaiting-review':'等待审查', completed:'本轮结束', failed:'执行失败', stopped:'已停止', cancelled:'已取消', 'reconcile-required':'需要核对结果' };
  let state = { sessions:[], models:[], runtimes:[] }, current = '', workspaceId = '', lastRun = null, generation = 0, sending = false, loading = false, pinned = true, recovery = false, checkpointBusy = false, checkpointLoading = false, checkpointKey = "", draftTimer, selectionTask, statusKey = '';
  let recoveryLoading = false, recoveryBusy = false, recoveryKey = '';
  let reportRun = '', reportTicket = 0, reportSaving = false, reportTrigger, dialogueOffset = 0;
  let progressView=null,progressTicket=0,progressSaving=false,reportItem='',itemTicket=0;
  let goalRows=[],goalCursor=null,goalChoice=null,goalTicket=0,goalReading=0,goalSaving=false;
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
  const renderGoalPreview = () => {
    const region=q('[data-coding-goal-preview]');region.replaceChildren();
    if(!goalChoice){region.textContent='下一轮不关联目标。';return;}
    const goal=goalChoice.snapshot.goal,heading=document.createElement('h3'),body=document.createElement('p');
    heading.textContent=goal.title;body.textContent=goalChoice.snapshot.state.agreement.outcome || goal.outcome;region.append(heading,body);
    const versions=document.createElement('p');versions.textContent=codingGoalVersionLabel({contract_revision:goal.current_contract_revision,agreement_version:goalChoice.snapshot.state.agreement.version});region.append(versions);
    const sections=[['为什么',goal.why],['业务逻辑',goal.business_logic],['范围',goal.in_scope.join('\\n')],['不包含',goal.out_of_scope.join('\\n')],['约束',goal.constraints.join('\\n')],['必需输入',goal.required_inputs.join('\\n')],['承诺产物',goal.promised_outputs.join('\\n')],['验收条件',goal.acceptance_criteria.map(item=>item.statement+'；通过条件：'+item.pass_condition+'；判断方式：'+item.decision_method).join('\\n')]];
    for(const [title,value] of sections.filter(item=>item[1])){const label=document.createElement('strong'),content=document.createElement('p');label.textContent=title;content.textContent=value;content.style.whiteSpace='pre-wrap';region.append(label,content);}
    const requirements=goalChoice.snapshot.state.requirements;
    if(requirements.length){const label=document.createElement('strong'),list=document.createElement('ul');label.textContent='当前目标要求';for(const item of requirements){const row=document.createElement('li');row.textContent=item.statement+(item.human_decision_required?'（需要真人判断）':'');list.append(row);}region.append(label,list);}
    const missing=sections.filter(item=>!item[1]).map(item=>item[0]);if(missing.length){const note=document.createElement('p');note.textContent='单独字段未填写：'+missing.join('、')+'。仍以目标原文与已有要求为准，不自行补造。';region.append(note);}
    const details=document.createElement('details'),summary=document.createElement('summary'),raw=document.createElement('pre');
    summary.textContent='完整固定上下文 · 目标事件 '+goalChoice.snapshot.state.goal_event_cursor;
    raw.textContent=goalChoice.material.text;details.append(summary,raw);region.append(details);
  };
  const renderGoalRows = () => {
    const list=q('[data-coding-goal-list]'),search=q('[data-coding-goal-search]').value.trim().toLowerCase();list.replaceChildren();
    for(const row of goalRows.filter(item=>item.title.toLowerCase().includes(search))){const button=document.createElement('button');button.className='mw-btn mw-btn--ghost';button.type='button';button.dataset.codingGoalId=row.goal_id;button.textContent=row.title;list.append(button);}
    if(!list.children.length)list.textContent=goalRows.length?'没有匹配的已加载目标。':'当前项目还没有目标。可在 Goals 创建，也可以不关联直接执行。';
    q('[data-coding-goal-more]').hidden=!goalCursor;
  };
  const loadGoals = async (ticket) => {
    const data=await api('/goals'+(goalCursor?'?after_cursor='+encodeURIComponent(goalCursor):''));
    if(ticket!==goalTicket)return;
    const known=new Set(goalRows.map(item=>item.goal_id));goalRows.push(...data.goals.filter(item=>!known.has(item.goal_id)));goalCursor=data.next_cursor;renderGoalRows();
  };
  const openGoals = async () => {
    if(!current){status('请先选择或新建编码会话。');return;}
    const id=current,ticket=++goalTicket;goalReading++;goalChoice=null;goalRows=[];goalCursor=null;
    q('[data-coding-goal-dialog]').showModal();q('[data-coding-goal-save]').disabled=true;q('[data-coding-goal-error]').textContent='';q('[data-coding-goal-search]').value='';q('[data-coding-goal-list]').textContent='正在读取本项目目标…';q('[data-coding-goal-preview]').textContent='正在读取已选版本…';
    try{const saved=await api('/sessions/'+encodeURIComponent(id)+'/goal');if(ticket!==goalTicket || current!==id)return;goalChoice=saved.selected;renderGoalPreview();
      if(saved.error || saved.goal_id && !saved.selected)q('[data-coding-goal-error]').textContent=saved.error || '原关联尚未固定版本，请重新选择后确认。';
      q('[data-coding-goal-save]').disabled=Boolean(saved.goal_id && !saved.selected);await loadGoals(ticket);
    }catch(error){if(ticket===goalTicket)q('[data-coding-goal-error]').textContent=error.message;}
  };
  const rememberDraft = (id, value) => {
    drafts.set(id, value);
    try { sessionStorage.setItem(draftKey(id), value); } catch {}
  };
  const saveDraft = (id, value, selectedMethods = methodSelections.get(id), selectedMaterials = materialSelections.get(id)) => {
    if (!id) return Promise.resolve();
    rememberDraft(id,value);
    const body={draft:value, ...(selectedMaterials ? {materials:structuredClone(selectedMaterials)} : {}), ...(mcpSourceSelections.has(id)?{mcp_sources:structuredClone(mcpSourceSelections.get(id))}:{}), ...(mcpSelections.has(id)?{mcp_tools:structuredClone(mcpSelections.get(id))}:{}), ...(configurations.get(id) ? {configuration:structuredClone(configurations.get(id))} : {}), ...(selectedMethods ? {methods:structuredClone(selectedMethods)} : {}), ...(questionDrafts.has(id) ? {question_drafts:structuredClone(questionDrafts.get(id))} : {})};
    const next = (draftWrites.get(id) || Promise.resolve()).catch(() => {}).then(() => api('/sessions/' + encodeURIComponent(id),'PATCH',body));
    draftWrites.set(id,next);
    return next.then(() => { if (current === id && input.value === value) q('[data-coding-draft-status]').textContent = '草稿已保存；模型与方式用于下一轮。'; });
  };
  const flushDraft = () => { clearTimeout(draftTimer); return current ? saveDraft(current,input.value) : Promise.resolve(); };
  const materialKey = ref => ref.artifact_id+'@'+ref.version;
  let materialRows=[], materialTicket=0;
  const openMaterials = async () => {
    const id=current,ticket=++materialTicket;
    q('[data-coding-material-error]').textContent='';
    q('[data-coding-material-list]').textContent='正在读取固定材料…';
    q('[data-coding-material-save]').disabled=true;
    q('[data-coding-material-dialog]').showModal();
    try {
      await flushDraft();
      const data=await api('/sessions/'+encodeURIComponent(id)+'/materials');
      if(current!==id || ticket!==materialTicket) return;
      materialRows=data.materials;
      const selected=new Set((materialSelections.get(id) || []).map(materialKey));
      const list=q('[data-coding-material-list]');list.replaceChildren();
      for(const [index,item] of materialRows.entries()) {
        const row=document.createElement('section'),label=document.createElement('label'),box=document.createElement('input'),name=document.createElement('span');
        row.className='coding-material';label.className='mw-check-row';box.className='mw-check';box.type='checkbox';box.dataset.materialIndex=String(index);
        box.checked=selected.has(materialKey(item.reference));box.disabled=Boolean(item.error && !box.checked);
        name.textContent=item.title+' · v'+item.reference.version+' · '+item.source;label.append(box,name);row.append(label);
        if(item.error){const error=document.createElement('p');error.textContent=item.error;row.append(error);}
        else {const detail=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('pre');summary.textContent='查看固定正文 · '+item.text.length+' 字符';body.textContent=item.text;detail.append(summary,body);row.append(detail);}
        list.append(row);
      }
      if(!materialRows.length)list.textContent='还没有固定材料。先在左侧「文件」保存快照或选区、打开 Git 差异，或在 Git 操作记录中保存固定结果，再回来选择。';
      q('[data-coding-material-save]').disabled=false;
    } catch(error){if(current===id && ticket===materialTicket)q('[data-coding-material-error]').textContent=error.message;}
  };
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
    q('[data-coding-goal-open]').disabled = !current || sending;
    q('[data-coding-material-open]').disabled = !current || sending;
    q('[data-coding-material-open]').textContent = '＋ 材料'+((materialSelections.get(current) || []).length ? ' · '+materialSelections.get(current).length : '');
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
  const progressDraftKey = (id,runId) => draftKey(id)+':report-progress:'+runId;
  const rememberProgressDraft = () => {
    if(!progressView || progressView.preview?.recorded) return;
    try{sessionStorage.setItem(progressDraftKey(progressView.id,progressView.runId),JSON.stringify({summary:q('[data-coding-progress-summary]').value,next_step:q('[data-coding-progress-next]').value}));}catch{}
  };
  const renderProgress = () => {
    const value=progressView?.preview,recorded=value?.recorded,region=q('[data-coding-progress-facts]');region.replaceChildren();
    const add=(tag,value)=>{const element=document.createElement(tag);element.textContent=value;region.append(element);};
    if(value){
      add('h3','原目标：'+value.report_goal.title);add('p','固定成果：'+value.title+' · v'+value.reference.version);
      if(value.current){
        const goal=value.current.goal,state=value.current.state;
        if(goal.title!==value.report_goal.title)add('p','目标当前名称：'+goal.title);
        add('p',state.agreement.outcome || goal.outcome || '当前目标没有结果说明。');
        for(const [key,label] of [['why','为什么'],['business_logic','业务逻辑']])if(goal[key])add('p',label+'：'+goal[key]);
        for(const [key,label] of [['in_scope','范围'],['out_of_scope','不做'],['constraints','约束'],['required_inputs','必需输入'],['promised_outputs','预期成果']]) if(goal[key]?.length)add('p',label+'：'+goal[key].join('；'));
        for(const item of goal.acceptance_criteria)add('p','验收条件：'+item.statement+'；通过条件：'+item.pass_condition+'；判断方式：'+item.decision_method);
        for(const requirement of state.requirements)add('p',requirement.statement+(requirement.human_decision_required?'（需要真人判断）':''));
        if(state.progress_summary)add('p','已有进展：'+state.progress_summary.summary);
        if(state.goal_event_cursor!==value.report_goal.goal_event_cursor || goal.current_contract_revision!==value.report_goal.contract_revision)add('p','原目标在本轮开始后已有更新。请按上方当前要求核对，再决定这份历史报告能够说明什么。');
      }
      q('[data-coding-progress-source]').textContent=value.reference.artifact_id+' v'+value.reference.version+'\\n原目标：'+value.report_goal.goal_id+'\\n报告依据：'+codingGoalVersionLabel(value.report_goal)+' / 事件 '+value.report_goal.goal_event_cursor+(value.current?'\\n此次确认：'+codingGoalVersionLabel({contract_revision:value.current.goal.current_contract_revision,agreement_version:value.current.state.agreement.version})+' / 事件 '+value.current.state.goal_event_cursor:'');
    }
    for(const selector of ['[data-coding-progress-summary]','[data-coding-progress-next]'])q(selector).readOnly=Boolean(recorded);
    q('[data-coding-progress-save]').disabled=!value || Boolean(recorded) || progressSaving || !q('[data-coding-progress-summary]').value.trim();
    q('[data-coding-progress-refresh]').disabled=progressSaving;
    q('[data-coding-progress-close]').disabled=progressSaving;
    q('[data-coding-progress-goal]').hidden=!value;q('[data-coding-progress-goal]').disabled=progressSaving;
    if(recorded){q('[data-coding-progress-summary]').value=recorded.progress_summary.summary;q('[data-coding-progress-next]').value=recorded.progress_summary.next_step || '';q('[data-coding-progress-status]').textContent='已记录到原目标 · '+recorded.progress_summary.recorded_at+'。重复打开或重试不会再记一笔；这不是用户验收。';}
  };
  const openProgress = async () => {
    if(!current || !reportRun || progressSaving)return;
    rememberProgressDraft();
    const view={id:current,runId:reportRun,preview:null,ticket:++progressTicket};progressView=view;
    const dialog=q('[data-coding-progress-dialog]');if(!dialog.open)dialog.showModal();
    let draft;try{draft=JSON.parse(sessionStorage.getItem(progressDraftKey(view.id,view.runId)) || 'null');}catch{}
    q('[data-coding-progress-summary]').value=draft?.summary || '';q('[data-coding-progress-next]').value=draft?.next_step || '';
    q('[data-coding-progress-source]').textContent='';q('[data-coding-progress-status]').textContent='正在读取原目标与记录回执…';renderProgress();
    try{const preview=await api('/sessions/'+encodeURIComponent(view.id)+'/runs/'+encodeURIComponent(view.runId)+'/report/progress');
      if(progressView!==view || view.ticket!==progressTicket)return;view.preview=preview;q('[data-coding-progress-status]').textContent='请核对原目标、固定成果和拟记录的内容。';renderProgress();
    }catch(error){if(progressView===view)q('[data-coding-progress-status]').textContent=error.message;}
  };
  const closeProgress = () => {if(progressSaving)return;rememberProgressDraft();progressTicket++;progressView=null;q('[data-coding-progress-dialog]').close();};
  const closeReport = (restoreFocus = false) => {
    const wasOpen=Boolean(reportRun);
    reportTicket++;reportRun='';reportSaving=false;
    q('[data-coding-report-reader]').hidden=true;turns.hidden=false;
    if(wasOpen) turns.scrollTop=dialogueOffset;
    if(restoreFocus && reportTrigger?.isConnected) reportTrigger.focus({preventScroll:true});
  };
  const showReport = async (runId, save = false) => {
    const id=current,generationAtStart=generation,ticket=++reportTicket;
    if(!reportRun) dialogueOffset=turns.scrollTop;
    reportRun=runId;reportSaving=save;
    turns.hidden=true;q('[data-coding-report-reader]').hidden=false;q('[data-coding-latest]').hidden=true;
    q('[data-coding-report-save]').disabled=true;q('[data-coding-report-progress]').hidden=true;
    q('[data-coding-report-status]').textContent=save?'正在保存固定报告…':'正在读取执行报告…';
    if(!save) q('[data-coding-report-body]').replaceChildren();
    try {
      const result=await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(runId)+'/report'+(reportItem && !save?'?fixed=1':''),save?'POST':'GET');
      if(current!==id || generation!==generationAtStart || ticket!==reportTicket) return;
      q('[data-coding-report-body]').innerHTML=result.html;enrichCode(q('[data-coding-report-body]'));
      q('[data-coding-report-status]').textContent=result.reference?'已保存固定版本 v'+result.reference.version+' · '+result.saved_at:'尚未保存；保存后保留这轮证据，不代表任务验收。';
      q('[data-coding-report-save]').disabled=Boolean(result.reference);
      q('[data-coding-report-progress]').hidden=!(result.reference && result.report.goal && !result.report.goal_source_error);
      if(!save) {q('[data-coding-report-reader]').scrollTop=0;q('[data-coding-report-close]').focus({preventScroll:true});}
    } catch(error) {
      if(current===id && ticket===reportTicket) {
        q('[data-coding-report-status]').textContent=error.message;
        q('[data-coding-report-save]').disabled=!save;
      }
    } finally {if(ticket===reportTicket)reportSaving=false;}
  };
  const renderRuns = (runs) => {
    const follow = !reportRun && pinned && atBottom(position());
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
          const renderKey=turn.text+'|'+(turn.steer?.state || '');
          if(renderedText.get(node)!==renderKey) {
            node.innerHTML=turn.html || ''; if(!turn.html) node.textContent=turn.text;
            if(turn.steer) {
              const receipt=document.createElement('small'); receipt.className='coding-turn-receipt';
              receipt.textContent=turn.steer.state==='applied'?'已加入后续模型上下文':turn.steer.state==='unconfirmed'?'已保存，未确认应用':'已收到，等待后续处理';
              receipt.title='加入上下文不代表模型已遵循，也不会撤销先前操作；补充要求不代替问题回答。';
              node.append(receipt);
            }
            renderedText.set(node,renderKey); enrichCode(node);
          }
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
    const reportRuns=runs.filter(run=>['completed','failed','stopped','cancelled'].includes(run.phase));
    q('[data-coding-reports]').hidden=!reportRuns.length;
    const reportList=q('[data-coding-report-list]');
    for(const run of reportRuns) {
      let button=[...reportList.children].find(node=>node.dataset.codingReportOpen===run.ref.run_id);
      if(!button) {button=document.createElement('button');button.type='button';button.className='mw-btn';button.dataset.codingReportOpen=run.ref.run_id;reportList.append(button);}
      button.textContent='第 '+(runs.indexOf(run)+1)+' 轮 · '+(phases[run.phase] || run.phase)+' · 查看报告';
    }
    lastRun=runs.at(-1)||null;
    const result=q('[data-coding-result]');
    if(!lastRun) { result.textContent="本轮的成果、检查与执行记录会显示在这里。"; delete result.dataset.content; if(statusKey!=='idle'){statusKey='idle';status("输入任务后开始；本轮方式与模型在发送时固定。");} }
    if(lastRun) {
      const values=[['最新执行（第 '+runs.length+' 轮）',phases[lastRun.phase]||lastRun.phase],['模型',lastRun.frozen.model_id],['工作范围',lastRun.frozen.directory.canonical_path],['身份',lastRun.frozen.role_id+' · v'+lastRun.frozen.role_version],['本轮方法',lastRun.frozen.skills.length ? lastRun.frozen.skills.map(method=>method.name+' · v'+method.version).join('、') : '未使用方法'],['本轮 MCP',lastRun.frozen.mcp_tools?.length ? lastRun.frozen.mcp_tools.map(tool=>(tool.server_label || tool.server)+' / '+tool.tool+' · 配置 '+(tool.configuration_version ?? '未记录')+' · '+tool.version).join('、') : '未使用 MCP'],['本轮 MCP 资料',(lastRun.frozen.mcp_sources || []).length ? lastRun.frozen.mcp_sources.map(source=>(source.server_label || source.server)+' · 配置 '+source.configuration_version).join('、') : '未单独选择资料来源'],['用量',codingUsageSummary(lastRun.usage)]];
      values.push(['本轮固定材料',lastRun.frozen.text_materials.length ? lastRun.frozen.text_materials.map(material=>(material.title || material.source_artifact_id)+' · v'+material.source_version).join('、') : '未选择材料']);
      if(lastRun.frozen.compaction) values.push(['上下文整理','自动 · 估计超过 '+lastRun.frozen.compaction.above_tokens+' tokens 时选择较早原文 · v'+lastRun.frozen.compaction.version]);
      if(!lastRun.usage.compaction && lastRun.activity.some(item=>item.name==='上下文整理')) values.push(['用量范围','以上仅主执行；上下文整理的额外模型请求尚未计入此小计。']);
      const key=JSON.stringify(values); if(result.dataset.content!==key) { const dl=document.createElement('dl'); values.forEach(([label,value])=>{const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=value;dl.append(dt,dd);}); result.replaceChildren(dl);result.dataset.content=key; }
      const nextStatus=lastRun.ref.run_id+':'+lastRun.phase+':'+lastRun.stop_reason;
      if(statusKey!==nextStatus){statusKey=nextStatus;status(lastRun.stop_reason || phases[lastRun.phase] || lastRun.phase,lastRun.phase==='failed');}
    }
    if(follow) turns.scrollTop=turns.scrollHeight;
    q('[data-coding-latest]').hidden=Boolean(reportRun) || follow || atBottom(position()); controls();
  };
  const readRecovery = async () => {
    if (!current || recoveryLoading || recoveryBusy) return;
    const id=current, ticket=generation; recoveryLoading=true;
    const area=q('[data-coding-recovery]');area.hidden=false;
    q('[data-coding-recovery-status]').textContent='正在读取执行记录与宿主回执…';
    q('[data-coding-recovery-refresh]').disabled=true;
    try {
      const report=await api('/sessions/'+encodeURIComponent(id)+'/recovery');
      if(current!==id || ticket!==generation) return;
      const list=q('[data-coding-recovery-list]');list.replaceChildren();
      const labels={completed:'已执行',failed:'执行失败（可能部分生效）','not-dispatched':'未执行',unknown:'结果未知'};
      report.runs.forEach((run,index)=>{
        const section=document.createElement('section');
        const heading=document.createElement('h4');heading.textContent='中断轮次 '+(index+1);section.append(heading);
        run.operations.forEach(operation=>{const row=document.createElement('p');row.textContent=labels[operation.outcome]+'：'+operation.summary;section.append(row);});
        if(!run.operations.length){const row=document.createElement('p');row.textContent='未发现持久记录的副作用操作；这不代表原任务已完成。';section.append(row);}
        if(run.waiting){const row=document.createElement('p');row.textContent='结束时将关闭 '+run.waiting+' 项遗留等待，旧问题与审批不能继续回答。';section.append(row);}
        run.blockers.forEach(message=>{const row=document.createElement('p');row.textContent=message;section.append(row);});
        const button=document.createElement('button');button.type='button';button.className='mw-btn';button.textContent='结束中断轮次';
        button.dataset.codingRecover=run.run_id;button.dataset.version=String(run.version);button.disabled=!run.can_close;section.append(button);list.append(section);
      });
      q('[data-coding-recovery-status]').textContent=report.blockers.length?report.blockers.join('；'):report.runs.length?'核对完成。操作结果明确的轮次可以结束；之后由你发送下一轮要求。':'没有可关闭的中断轮次。如仍显示待核对，请检查下方审查或运行记录。';
    } catch(error) {if(current===id && ticket===generation){recoveryKey='';q('[data-coding-recovery-list]').replaceChildren();q('[data-coding-recovery-status]').textContent='核对失败：'+error.message;}}
    finally {if(ticket===generation){recoveryLoading=false;q('[data-coding-recovery-refresh]').disabled=false;}}
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
      q('[data-coding-recovery]').hidden=!recovery;
      if(recovery && recoveryKey!==id){recoveryKey=id;void readRecovery();}
      if(!q('[data-coding-title] input')) q('[data-coding-title]').textContent=data.session.title;
      q('[data-coding-goal-label]').textContent=data.session.goal_id?'下一轮目标：'+(data.session.goal_title || data.session.goal_id):'下一轮未关联目标';
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
      if(!materialSelections.has(id)) materialSelections.set(id,data.materials || []);
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
    materialTicket++;q('[data-coding-material-dialog]').close();
    closeReport();q('[data-coding-report-list]').replaceChildren();q('[data-coding-reports]').hidden=true;
    if(current) { offsets.set(current,turns.scrollTop); void flushDraft().catch(error=>status(error.message,true)); }
    void host.showReviews?.(q('[data-coding-host-reviews]'), []);
    recoveryLoading=false;recoveryBusy=false;recoveryKey='';q('[data-coding-recovery-list]').replaceChildren();q('[data-coding-recovery]').hidden=true;
    current=id; generation++; loading=false; lastRun=null; recovery=false;checkpointBusy=false;checkpointLoading=false;checkpointKey='';statusKey='';
    q('[data-coding-checkpoints-list]').replaceChildren();q('[data-coding-checkpoints-status]').textContent='正在读取检查点…';
    q('[data-coding-commands]').replaceChildren();q('[data-coding-commands]').hidden=true;
    input.disabled=true; selectionTask=readCurrent(true);await selectionTask;
  };
  const openCodingItem = async(itemId) => {
    const ticket=++itemTicket;reportItem='';
    if(!itemId.startsWith('coding-report:')){await select(itemId);if(ticket===itemTicket)closeReport();return;}
    const parts=itemId.slice('coding-report:'.length).split(':');
    if(parts.length!==2)throw new Error('固定报告引用无效');
    const id=decodeURIComponent(parts[0]),runId=decodeURIComponent(parts[1]);
    await select(id);if(ticket!==itemTicket || current!==id)return;
    reportItem=itemId;await showReport(runId);
  };
  document.addEventListener('molis-work:plugin-item-selected',(event)=>{ if(event.detail.plugin==='coding' && event.detail.itemId) void openCodingItem(event.detail.itemId).catch(error=>status(error.message,true)); });
  const create = async() => { const result=await api('/sessions','POST',{title:'新编码会话'}); await refreshState(); host.openItem('coding',result.session.session_id,result.session.title); await select(result.session.session_id); input.focus(); };
  const click = async(event) => {
    const target=event.target.closest('button,a'); if(!target) return;
    try {
      if(target.matches('[data-coding-report-open]')) {reportTrigger=target;await showReport(target.dataset.codingReportOpen);}
      if(target.matches('[data-coding-report-close]')) {const fromArtifact=reportItem;reportItem='';closeReport(true);if(fromArtifact)host.openItem('coding',current,state.sessions.find(item=>item.session_id===current)?.title);}
      if(target.matches('[data-coding-report-progress]') || target.matches('[data-coding-progress-refresh]'))await openProgress();
      if(target.matches('[data-coding-progress-close]'))closeProgress();
      if(target.matches('[data-coding-progress-goal]') && progressView?.preview && !progressSaving){const goal=progressView.preview.report_goal;closeProgress();host.openItem('goals',goal.goal_id,goal.title);}
      if(target.matches('[data-coding-goal-open]')) await openGoals();
      if(target.matches('[data-coding-goal-close]') && !goalSaving){goalTicket++;goalReading++;q('[data-coding-goal-dialog]').close();}
      if(target.matches('[data-coding-goal-none]') && !goalSaving){goalReading++;goalChoice=null;renderGoalPreview();q('[data-coding-goal-save]').disabled=false;q('[data-coding-goal-error]').textContent='';}
      if(target.matches('[data-coding-goal-more]')){target.disabled=true;try{await loadGoals(goalTicket);}finally{target.disabled=false;}}
      if(target.matches('[data-coding-goal-id]') && !goalSaving){
        const ticket=goalTicket,reading=++goalReading;q('[data-coding-goal-save]').disabled=true;q('[data-coding-goal-error]').textContent='';
        try{const value=await api('/goals/'+encodeURIComponent(target.dataset.codingGoalId));if(ticket!==goalTicket || reading!==goalReading)return;goalChoice=value;renderGoalPreview();q('[data-coding-goal-save]').disabled=false;}
        catch(error){if(ticket===goalTicket && reading===goalReading)q('[data-coding-goal-error]').textContent=error.message;}
      }
      if(target.matches('[data-coding-report-save]') && reportRun && !reportSaving) await showReport(reportRun,true);
      if(target.matches('[data-coding-recovery-refresh]')) await readRecovery();
      if(target.matches('[data-coding-recover]')) {
        if(recoveryBusy || target.disabled) return;
        const id=current,ticket=generation;recoveryBusy=true;
        q('[data-coding-recovery]').querySelectorAll('button').forEach(button=>button.disabled=true);
        try {
          await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(target.dataset.codingRecover)+'/recover','POST',{expected_version:Number(target.dataset.version)});
          if(current===id && generation===ticket){status('中断轮次已结束，原任务和核实结果已保留。请输入下一轮要求继续。');await readCurrent();}
        } catch(error) {if(current===id && generation===ticket) status('未能结束中断轮次：'+error.message,true);}
        finally {if(current===id && generation===ticket){recoveryBusy=false;if(recovery)await readRecovery();controls();}}
      }
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
      if(target.matches('[data-coding-material-open]')) await openMaterials();
      if(target.matches('[data-coding-material-close]')) {materialTicket++;q('[data-coding-material-dialog]').close();input.focus();}
      if(target.matches('[data-coding-method-open]')) openMethods();
      if(target.matches('[data-coding-method-close]')) {methodDocumentTicket++;q('[data-coding-method-dialog]').close();input.focus();}
      if(target.matches('[data-coding-workspace-open]')) { q('[data-coding-workspace-dialog]').showModal(); }
      if(target.matches('[data-coding-workspace-close]')) q('[data-coding-workspace-dialog]').close();
      if(target.matches('[data-coding-new]')) { event.preventDefault(); target.disabled=true; try { await create(); } finally { target.disabled=false; } }
      if(target.matches('[data-coding-session]')) { event.preventDefault(); const session=state.sessions.find(item=>item.session_id===target.dataset.codingSession);host.openItem('coding',session.session_id,session.title);await select(session.session_id); }
      if(target.matches('[data-coding-filter]')) { directory.querySelectorAll('[data-coding-filter]').forEach(item=>item.setAttribute('aria-selected',String(item===target))); renderDirectory(); }
      if(target.matches('[data-coding-face]')) {
        const face=target.dataset.codingFace;
        if(host.onDirectoryFace?.(face) || face==='sessions') {
          directory.dataset.codingCurrentFace=face;
          directory.querySelectorAll('[data-coding-face]').forEach(button=>button.setAttribute('aria-selected',String(button===target)));
          directory.querySelector('.coding-directory-head h2').textContent=face==='files'?'文件':'会话';
        } else if(face==='goals') await openGoals();
        else status('这个导航面尚未装配，现阶段可使用会话、目标关联和文件入口。');
      }
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
  turns.addEventListener('scroll',()=>{if(reportRun)return;pinned=atBottom(position());q('[data-coding-latest]').hidden=pinned;},{passive:true});
  input.addEventListener('input',()=>{rememberDraft(current,input.value);q('[data-coding-draft-status]').textContent='正在保存草稿…';clearTimeout(draftTimer);const id=current,value=input.value;draftTimer=setTimeout(()=>{void saveDraft(id,value).catch(error=>status('草稿暂未写入服务，当前窗口仍保留：'+error.message,true));},400);});
  for(const field of [q('[data-coding-intent]'),q('[data-coding-model]')])field.addEventListener('change',()=>{
    rememberConfiguration();controls();void flushDraft().catch(error=>status('配置暂未保存：'+error.message,true));
  });
  q('[data-coding-method-search]').addEventListener('input',renderMethods);
  q('[data-coding-goal-search]').addEventListener('input',renderGoalRows);
  q('[data-coding-goal-dialog]').addEventListener('cancel',event=>{if(goalSaving)event.preventDefault();else{goalTicket++;goalReading++;}});
  q('[data-coding-goal-form]').addEventListener('submit',async event=>{
    event.preventDefault();const button=q('[data-coding-goal-save]');if(button.disabled || goalSaving)return;
    const id=current,ticket=goalTicket,choice=goalChoice;goalSaving=true;button.disabled=true;
    try{await api('/sessions/'+encodeURIComponent(id)+'/goal','PUT',{goal_id:choice?.snapshot.goal.goal_id ?? null,expected_artifact_id:choice?.reference.artifact_id});
      if(ticket===goalTicket && current===id){q('[data-coding-goal-dialog]').close();await readCurrent();status('下一轮目标已保存；已开始的任务和历史成果保持原目标。');}
    }catch(error){if(ticket===goalTicket)q('[data-coding-goal-error]').textContent=error.message;}
    finally{goalSaving=false;if(ticket===goalTicket)button.disabled=false;}
  });
  q('[data-coding-progress-dialog]').addEventListener('cancel',event=>{if(progressSaving){event.preventDefault();return;}rememberProgressDraft();progressTicket++;progressView=null;});
  for(const selector of ['[data-coding-progress-summary]','[data-coding-progress-next]'])q(selector).addEventListener('input',()=>{rememberProgressDraft();q('[data-coding-progress-save]').disabled=!progressView?.preview?.current || progressSaving || !q('[data-coding-progress-summary]').value.trim();});
  q('[data-coding-progress-form]').addEventListener('submit',async event=>{
    event.preventDefault();const view=progressView;if(!view?.preview?.current || progressSaving || q('[data-coding-progress-save]').disabled)return;
    rememberProgressDraft();const currentGoal=view.preview.current;
    const body={summary:q('[data-coding-progress-summary]').value,next_step:q('[data-coding-progress-next]').value,expected_goal_cursor:currentGoal.state.goal_event_cursor,expected_contract_revision:currentGoal.goal.current_contract_revision};
    progressSaving=true;renderProgress();q('[data-coding-progress-status]').textContent='正在记录到原目标…';
    try{const recorded=await api('/sessions/'+encodeURIComponent(view.id)+'/runs/'+encodeURIComponent(view.runId)+'/report/progress','POST',body);
      if(progressView===view){view.preview.recorded=recorded;view.preview.current=null;try{sessionStorage.removeItem(progressDraftKey(view.id,view.runId));}catch{}}
    }catch(error){if(progressView===view)q('[data-coding-progress-status]').textContent=error.message+'。内容已保留；可重新读取目标和原回执后确认。';}
    finally{progressSaving=false;if(progressView===view)renderProgress();}
  });
  q('[data-coding-material-form]').addEventListener('submit',async event=>{
    event.preventDefault();const id=current,ticket=materialTicket,button=q('[data-coding-material-save]');button.disabled=true;
    const selection=[...q('[data-coding-material-list]').querySelectorAll('input:checked')].map(box=>materialRows[Number(box.dataset.materialIndex)].reference);
    try {
      await saveDraft(id,input.value,undefined,selection);materialSelections.set(id,selection);
      if(current===id && ticket===materialTicket){q('[data-coding-material-dialog]').close();controls();input.focus();status('固定材料已保存，仅用于下一轮；本轮执行与补充要求保持原材料。');}
    } catch(error){if(current===id && ticket===materialTicket)q('[data-coding-material-error]').textContent=error.message;}
    finally{if(ticket===materialTicket)button.disabled=false;}
  });
  q('[data-coding-material-dialog]').addEventListener('cancel',()=>{materialTicket++;});
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
    const id=current,task=input.value,materials=structuredClone(materialSelections.get(current) || []),mcp_sources=structuredClone(mcpSourceSelections.get(current) || []),mcp_tools=structuredClone(mcpSelections.get(current) || []),methods=structuredClone(methodSelections.get(current) || []),activeRun=lastRun,modelValue=q('[data-coding-model]').value,intent=q('[data-coding-intent]').value,workspace_id=workspaceId; sending=true;controls();
    try {
      rememberConfiguration();await flushDraft();
      if(activeRun && !terminal(activeRun.phase)) {
        await api('/sessions/'+encodeURIComponent(id)+'/control','POST',{kind:'steer',run_id:activeRun.ref.run_id,text:task});
        status('补充要求已交给执行引擎，等待后续处理。');
      } else {
        const [provider_id,model_id]=JSON.parse(modelValue);
        await api('/sessions/'+encodeURIComponent(id)+'/runs','POST',{task,intent,provider_id,model_id,workspace_id,methods,mcp_tools,mcp_sources,materials});
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
