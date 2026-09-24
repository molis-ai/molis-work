import { CODING_WRITER_INTEGRATION_CLIENT_FACTORY_SCRIPT } from "./writer-integration-client.js";
import { CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT } from "./taskboard-client.js";
import { CODING_STEPS_CLIENT_FACTORY_SCRIPT } from "./steps-client.js";
import { CODING_CHARACTERS_CLIENT_FACTORY_SCRIPT } from "./characters-client.js";
import { CODING_SUBAGENTS_CLIENT_FACTORY_SCRIPT } from "./subagents-client.js";
import { CODING_PLANS_CLIENT_FACTORY_SCRIPT } from "./plans-client.js";
import { CODING_WRITER_DIRECTORIES_CLIENT_FACTORY_SCRIPT } from "./writers-client.js";
import { codingGoalVersionLabel } from "./goal-versions.js";
import { CODING_CHANGESET_CLIENT_FACTORY_SCRIPT } from "./changeset-client.js";
import { codingUsageSummary } from "./usage.js";
import { atBottom, onContentAppended, onReaderScrolled, READER_INTENT_MS, STICK_THRESHOLD_PX } from "./reading.js";
import { CONTINUATION_MARKER, HISTORY_DIGEST_MARKER, HISTORY_DIGEST_TASK_HEAD, MENTIONS_MARKER, digestTask } from "./continuation.js";
import { SESSION_PAGE, SESSION_WINDOW } from "./session-window.js";
import { CODING_USAGE_METER_CLIENT_FACTORY_SCRIPT } from "./usage-meter-client.js";
import { CODING_COOPERATION_CLIENT_FACTORY_SCRIPT } from "./cooperation-client.js";
import { codeLanguage, codeTokens } from "./highlight.js";
import { CODING_COMMANDS_CLIENT_FACTORY_SCRIPT } from "./commands-client.js";
import { CODING_PLAN_PROGRESS_CLIENT_FACTORY_SCRIPT } from "./plan-progress-client.js";
import { CODING_SUBAGENT_CARDS_CLIENT_FACTORY_SCRIPT } from "./subagent-cards-client.js";
import { createCodingTimeline } from "./timeline.js";

/** Host supplies navigation; this client only handles Coding's own surface. */
export const CODING_CLIENT_FACTORY_SCRIPT = `(host) => {
  const root = document.querySelector('[data-coding-workbench]');
  const directory = root?.querySelector('[data-coding-directory]');
  if (!root || !directory) return;
  const q = (selector) => root.querySelector(selector);
  const turns = q('[data-coding-turns]'), input = q('[data-coding-task]');
  const resultVisibility=()=>q('[data-coding-results-open]').setAttribute('aria-expanded',String(root.dataset.codingResults==='true'));
  new MutationObserver(resultVisibility).observe(root,{attributes:true,attributeFilter:['data-coding-results']});resultVisibility();
  const prefix = root.dataset.codingPrefix + '/api/plugins/io.molis.work.coding';
  const STICK_THRESHOLD_PX = ${STICK_THRESHOLD_PX};
  const atBottom = ${atBottom.toString()};
  const onContentAppended = ${onContentAppended.toString()};
  const onReaderScrolled = ${onReaderScrolled.toString()};
  const CONTINUATION_MARKER = ${JSON.stringify(CONTINUATION_MARKER)};
  const SESSION_WINDOW = ${SESSION_WINDOW}, SESSION_PAGE = ${SESSION_PAGE};
  const HISTORY_DIGEST_MARKER = ${JSON.stringify(HISTORY_DIGEST_MARKER)}, HISTORY_DIGEST_TASK_HEAD = ${JSON.stringify(HISTORY_DIGEST_TASK_HEAD)}, MENTIONS_MARKER = ${JSON.stringify(MENTIONS_MARKER)};
  const digestTask = ${digestTask.toString()};
  const ownTask = (text) => { const own = digestTask(text), at = own.indexOf(MENTIONS_MARKER); return at < 0 ? own : own.slice(0, at); };
  const READER_INTENT_MS = ${READER_INTENT_MS};
  const codingGoalVersionLabel = ${codingGoalVersionLabel.toString()};
  const codingUsageSummary = ${codingUsageSummary.toString()};
  const timeline = (${createCodingTimeline.toString()})();
  setInterval(()=>timeline.tick(turns),1000);
  const position = () => ({ offset: turns.scrollTop, viewport: turns.clientHeight, content: turns.scrollHeight });
  const renderedText = new WeakMap();
  const directoryRows = new Map(), directoryGroups = new Map();
  let directoryClaimed = false;
  const drafts = new Map(), offsets = new Map(), draftWrites = new Map();
  const materialSelections = new Map(), characterSelections = new Map(), characterSkills = new Map(), characterTitles = new Map();
  const questionDrafts = new Map(), methodSelections = new Map(), configurations = new Map(), mcpSelections = new Map(), mcpSourceSelections = new Map();
  let mcpChoices = [], mcpSourceChoices = [];
  let methodChoices = [], methodDocumentTicket = 0;
  const answeredQuestions = new Set();
  const draftKey = (id) => 'molis-coding-draft:' + root.dataset.codingPrefix + ':' + id;
  const terminal = (phase) => ['completed','failed','stopped','cancelled','reconcile-required'].includes(phase);
  const phases = { starting:'正在准备', running:'执行中', compacting:'正在整理上下文', pausing:'正在暂停', paused:'已暂停', 'awaiting-input':'等待回答', 'awaiting-review':'等待审查', completed:'本轮结束', failed:'执行失败', stopped:'已停止', cancelled:'已取消', 'reconcile-required':'需要核对结果' };
  let runtimeSessionId = null;
  let state = { sessions:[], models:[], runtimes:[] }, current = '', workspaceId = '', lastRun = null, generation = 0, sending = false, loading = false, pinned = true, recovery = false, checkpointBusy = false, checkpointLoading = false, checkpointKey = "", draftTimer, selectionTask, statusKey = '';
  let recoveryLoading = false, recoveryBusy = false, recoveryKey = '';
  let reportOutput=null, artifactRows=[], artifactTicket=0;
  let reportRun = '', reportTicket = 0, reportSaving = false, reportTrigger, dialogueOffset = 0;
  let progressView=null,progressTicket=0,progressSaving=false,reportItem='',changeItem='',itemTicket=0;
  let goalRows=[],goalCursor=null,goalChoice=null,goalTicket=0,goalReading=0,goalSaving=false;
  /** The header names the folder; the full path stays one hover away. */
  const showWorkspace=(path,fallback)=>{const label=q('[data-coding-workspace-label]'),name=path?path.split('/').filter(Boolean).at(-1):fallback;label.innerHTML=(path?'<svg aria-hidden="true"><use href="#icon-folder"></use></svg>':'')+'<span></span>';label.lastChild.textContent=name;label.title=path||'';label.dataset.empty=String(!path);root.dataset.codingWorkspaceName=path?name:'';turns.querySelectorAll('[data-coding-welcome-workspace]').forEach(node=>{node.textContent=path?name:'当前工作区';node.parentElement.title=path||'';});};
  const status = (message, error = false) => { q('[data-coding-status]').textContent = message; q('[data-coding-status]').dataset.error = String(error); };
  const api = async (path, method = 'GET', body) => {
    const response = await fetch(prefix + path, { method, cache:'no-store',
      ...(method === 'GET' ? {} : { headers:molisWorkControlHeaders(), body:JSON.stringify(body ?? {}) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '无法完成 Coding 操作');
    return result;
  };
  const integrations = (${CODING_WRITER_INTEGRATION_CLIENT_FACTORY_SCRIPT})({q,api,host,status});
  const stepReports = (${CODING_STEPS_CLIENT_FACTORY_SCRIPT})({q,api,current:()=>current,status,refresh:()=>readCurrent(),prepareRework:reason=>plans.prepareStepRework(reason)});
  let planEntries=[],subagentGroups=[];
  // A long session is read as a window: the latest rounds in full, earlier ones as summaries until scrolled back to.
  let lastData=null;
  let earlierRuns=[],earlierFingerprint='',olderViews=new Map(),olderPlanEntries=[],olderSubagents=[],windowRuns=[],allRuns=[],pageLoading=false;
  const resetWindow=()=>{earlierRuns=[];earlierFingerprint='';olderViews=new Map();olderPlanEntries=[];olderSubagents=[];windowRuns=[];allRuns=[];pageLoading=false;};
  const subagentCards = (${CODING_SUBAGENT_CARDS_CLIENT_FACTORY_SCRIPT})({api,current:()=>current,status,refresh:()=>readCurrent(),timeline,
    showReviews:(container,refs,sid)=>host.showReviews?.(container,refs,sid),sessionId:()=>runtimeSessionId,
    parentLive:(run)=>!terminal(run.phase),prefill:(text)=>{const next=input.value.trim()?input.value+'\\n\\n'+text:text;input.value=next;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();},
    openInPanel:(childId)=>{root.dataset.codingResults='true';const row=q('[data-coding-subagents] details[data-child="'+CSS.escape(childId)+'"]');if(row){row.open=true;row.scrollIntoView({block:'center'});row.querySelector('textarea')?.focus({preventScroll:true});}}});
  const usageMeter = (${CODING_USAGE_METER_CLIENT_FACTORY_SCRIPT})({q,api,current:()=>current,status,refresh:()=>readCurrent()});
  const cooperationUi = (${CODING_COOPERATION_CLIENT_FACTORY_SCRIPT})({q,api,current:()=>current,status,
    openSession:(id,title)=>{host.openItem('coding',id,title || '');return select(id);},refreshSessions:()=>refreshState(),
    rounds:()=>allRuns.map((run,index)=>({run_id:run.ref.run_id,number:index+1,phase:run.phase})),
    prefill:(text)=>{if(input.value.trim()!==text.trim()){input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));}input.focus();},
    // The Host attached a taken delivery to the session's materials; the page's selection follows, or the next send would drop it.
    materialsChanged:async()=>{const id=current;const data=await api('/sessions/'+encodeURIComponent(id)+'?window=1');if(id===current){materialSelections.set(id,data.materials || []);controls();}}});
  const planProgress = (${CODING_PLAN_PROGRESS_CLIENT_FACTORY_SCRIPT})({api,current:()=>current,status,refresh:()=>readCurrent(),openStep:(runId,stepId)=>stepReports.open(current,runId,stepId)});
  const taskboard = (${CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT})({directory,current:()=>current,status,ownTask,navigate:async(id,target)=>{
    const record=state.sessions.find(item=>item.session_id===id);if(!record)throw new Error('原会话暂不可读，请刷新后重试。');
    host.openItem('coding',id,record.title);await openCodingItem(id);if(current!==id)return;
    host.revealTask?.();
    if(target.kind==='session')return;
    if(target.kind==='step'){await stepReports.open(id,target.run_id,target.step_id);return;}
    if(target.kind==='fixed-plan'){await plans.openFixed(target.revision);return;}
    const node=target.kind==='plan'?q('[data-coding-plan]'):target.kind==='recovery'?q('[data-coding-recovery]'):target.kind==='reviews'?q('[data-coding-host-reviews]'):
      target.kind==='child'?[...q('[data-coding-subagents]').querySelectorAll('details[data-child]')].find(node=>node.dataset.child===target.child_id):[...turns.children].find(node=>node.dataset.run===target.run_id);
    if(!node || node.hidden)throw new Error('原内容暂不可读，请等待任务刷新后重试。');
    if(target.kind==='child')node.open=true;
    node.scrollIntoView({block:'nearest'});node.tabIndex=-1;node.focus({preventScroll:true});
  }});
  const subagents = (${CODING_SUBAGENTS_CLIENT_FACTORY_SCRIPT})({q,api,current:()=>current,status,openIntegration:integrations.open,usageSummary:codingUsageSummary,refresh:()=>readCurrent(),prepareRework:async(id,runId,child,notes)=>{
    if(current!==id)return;
    const instruction='请针对原子任务 '+child.subagent_id+'（父执行 '+runId+'）准备返工，保留原结果和评价。原目录：'+child.workspace_path+'。需要写入时请先明确选择该独立工作树与并行写入方式。原任务：'+child.task+'\\n返工原因：'+notes+'\\n请独立复核新结果；不要把运行结束当成用户验收。';
    const value=input.value.trim()?input.value+'\\n\\n'+instruction:instruction;
    input.value=value;rememberDraft(id,value);await saveDraft(id,value);
  }});
  const writerDirectories = (${CODING_WRITER_DIRECTORIES_CLIENT_FACTORY_SCRIPT})({q,api,host,current:()=>current,workspace:()=>workspaceId,workspaceLabel:()=>state.workspaces?.find(item=>item.workspace_id===workspaceId)?.canonical_path || workspaceId,status,assignments:()=>configurations.get(current)?.writer_assignments || [],saveAssignments:async(owner,parent,assignments)=>{
    if(owner!==current || parent!==workspaceId)throw new Error('会话或主工作区已改变，请重新打开分工');
    rememberConfiguration();const previous=configurations.get(current);configurations.set(current,{...previous,writer_assignments:assignments});
    try{await flushDraft();status('分工已保存；选择并行写入并发送任务后才开始。');}catch(error){configurations.set(owner,previous);throw error;}
  },select:async(owner,id)=>{
    if(owner!==current)throw new Error('会话已改变，请重新打开独立工作树');
    workspaceId=id;rememberConfiguration();await flushDraft();await refreshState();status('下一轮将使用所选独立目录；原任务与主工作区保持原状态。');
  }});
  const plans = (${CODING_PLANS_CLIENT_FACTORY_SCRIPT})({q,api,current:()=>current,status,execute:async revision=>{
    if(sending || recovery || checkpointBusy || !current)throw new Error('请先完成当前操作或核对中断结果');
    const id=current,[provider_id,model_id]=JSON.parse(q('[data-coding-model]').value),intent=q('[data-coding-intent]').value==='parallel'?'parallel':'execute';
    const request={plan_revision:revision,intent,provider_id,model_id,workspace_id:workspaceId,
      ...(intent==='parallel'?{writer_assignments:structuredClone(configurations.get(id)?.writer_assignments || [])}:{}),
      methods:structuredClone(methodSelections.get(id)||[]),materials:structuredClone(materialSelections.get(id)||[]),character:structuredClone(characterSelections.get(id)??null),character_skill_ids:characterSkills.get(id),
      mcp_tools:structuredClone(mcpSelections.get(id)||[]),mcp_sources:structuredClone(mcpSourceSelections.get(id)||[])};
    sending=true;controls();
    try{
      await flushDraft();
      await api('/sessions/'+encodeURIComponent(id)+'/runs','POST',request);
      await refreshState();if(id===current)await readCurrent();
    }finally{sending=false;controls();}
  }});
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
    const list=q('[data-coding-goal-list]'),search=q('[data-coding-goal-search]').value.trim().toLowerCase();
    const selectedId=goalChoice?.snapshot?.goal?.goal_id || '';
    list.replaceChildren();
    for(const row of goalRows.filter(item=>item.title.toLowerCase().includes(search))){
      const button=document.createElement('button');
      button.type='button';
      button.className='mw-dir-row mw-dir-row--compact directory-list-row';
      button.dataset.codingGoalId=row.goal_id;
      button.title=row.title;
      const selected=row.goal_id===selectedId;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      const mark=document.createElement('span');
      mark.className='mw-dir-row__icon';
      mark.innerHTML='<svg aria-hidden="true"><use href="#icon-target"></use></svg>';
      const copy=document.createElement('span');
      copy.className='mw-dir-row__copy';
      const headline=document.createElement('span');
      headline.className='mw-dir-row__headline';
      const title=document.createElement('strong');
      title.textContent=row.title;
      headline.append(title);
      if(row.work_status==='completed' || row.work_status==='cancelled'){
        const status=document.createElement('span');
        status.className='mw-dir-row__status';
        status.textContent=row.work_status==='completed'?'已完成':'已取消';
        headline.append(status);
      }
      copy.append(headline);
      button.append(mark, copy);
      list.append(button);
    }
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
    const body={draft:value, ...(characterSkills.has(id)?{character_skill_ids:characterSkills.get(id)}:{}), ...(characterSelections.has(id)?{character:structuredClone(characterSelections.get(id))}:{}), ...(selectedMaterials ? {materials:structuredClone(selectedMaterials)} : {}), ...(mcpSourceSelections.has(id)?{mcp_sources:structuredClone(mcpSourceSelections.get(id))}:{}), ...(mcpSelections.has(id)?{mcp_tools:structuredClone(mcpSelections.get(id))}:{}), ...(configurations.get(id) ? {configuration:structuredClone(configurations.get(id))} : {}), ...(selectedMethods ? {methods:structuredClone(selectedMethods)} : {}), ...(questionDrafts.has(id) ? {question_drafts:structuredClone(questionDrafts.get(id))} : {})};
    const next = (draftWrites.get(id) || Promise.resolve()).catch(() => {}).then(() => api('/sessions/' + encodeURIComponent(id),'PATCH',body));
    draftWrites.set(id,next);
    return next.then(() => { if (current === id && input.value === value) q('[data-coding-draft-status]').textContent = '草稿已保存；模型与方式用于下一轮。'; });
  };
  const flushDraft = () => { clearTimeout(draftTimer); return current ? saveDraft(current,input.value) : Promise.resolve(); };
  const returnFromChange = () => {const fromArtifact=changeItem;changeItem='';renderArtifacts();if(fromArtifact)host.openItem('coding',current,state.sessions.find(item=>item.session_id===current)?.title);};
  const changeReview = (${CODING_CHANGESET_CLIENT_FACTORY_SCRIPT})({root,q,api,turns,current:()=>current,closeReport:()=>closeReport(),
    returnToTask:returnFromChange,onRunOpen:()=>{changeItem='';reportItem='';renderArtifacts();},
    appendDraft:async(task)=>{const id=current,next=input.value.endsWith(task)?input.value:(input.value?input.value+'\\n\\n':'')+task;if(next.length>100000)throw new Error('意见与现有草稿合计过长，请减少意见或先处理现有草稿；意见仍然保留。');clearTimeout(draftTimer);input.value=next;rememberDraft(id,input.value);await saveDraft(id,input.value);},
    focusDraft:()=>{returnFromChange();input.focus();status('行级意见已加入原任务草稿；请确认执行方式后发送。');}});
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
      if(!materialRows.length)list.textContent='还没有固定材料。先在左侧「文件」保存快照或选区、打开 Git 差异，或在 Shelf 将文字保存到项目材料，再回来选择。';
      q('[data-coding-material-save]').disabled=false;
    } catch(error){if(current===id && ticket===materialTicket)q('[data-coding-material-error]').textContent=error.message;}
  };
  const contextLabel=(selector,label,count=0)=>{const button=q(selector);button.querySelector('[data-slot=button-label]').textContent=label;button.title=label;button.dataset.count=count ? String(count) : '';button.setAttribute('aria-label',label);};
  const controls = () => {
    const active = lastRun && !terminal(lastRun.phase);
    input.disabled = !current || sending;
    q('[data-coding-send]').disabled = !current || sending || recovery || checkpointBusy || (!active && (!state.models.some(model=>JSON.stringify([model.provider_id,model.model_id])===q('[data-coding-model]').value) || !state.workspaces?.some(workspace=>workspace.workspace_id===workspaceId)));
    q('[data-coding-send]').textContent = sending ? '正在提交…' : active ? '补充要求' : '发送';
    q('[data-coding-stop]').hidden = !active;
    q('[data-coding-stop]').disabled = sending;
    // Pausing lets the current step finish; a paused round resumes with its context intact.
    const pause=q('[data-coding-pause]'),paused=lastRun && ['paused','pausing'].includes(lastRun.phase),pausable=lastRun && ['starting','running','compacting'].includes(lastRun.phase);
    pause.hidden=!(paused || pausable);pause.dataset.action=paused?'resume':'pause';
    pause.textContent=lastRun?.phase==='pausing'?'正在暂停…':paused?'恢复':'暂停';pause.disabled=sending || lastRun?.phase==='pausing';
    q('[data-coding-intent]').disabled = Boolean(active || sending);
    q('[data-coding-model]').disabled = Boolean(active || sending);
    q('[data-coding-rename]').hidden = !current;
    q('[data-coding-goal-open]').disabled = !current || sending;
    q('[data-coding-material-open]').disabled = !current || sending;
    const materialCount=(materialSelections.get(current) || []).length;contextLabel('[data-coding-material-open]','材料'+(materialCount?' · '+materialCount:''),materialCount);
    const character=characterSelections.get(current),characterButton=q('[data-coding-character-open]');
    characterButton.disabled=!current || sending;contextLabel('[data-coding-character-open]',character?'角色 · v'+character.version:'角色',character?1:0);
    characterButton.title=character?'下一轮：'+(characterTitles.get(current) || character.artifact_id)+' · v'+character.version:'下一轮不使用 Character';
    q('[data-coding-method-open]').disabled = !current || sending;
    q('[data-coding-mcp-open]').disabled=!current || sending;
    const mcpCount=(mcpSelections.get(current) || []).length+(mcpSourceSelections.get(current) || []).length; contextLabel('[data-coding-mcp-open]','MCP'+(mcpCount?' · '+mcpCount:''),mcpCount);
    const writable=['edit','execute'].includes(q('[data-coding-intent]').value);
    q('[data-coding-checkpoints-refresh]').disabled=!current || checkpointLoading;
    q('[data-coding-checkpoints-list]').querySelectorAll('button').forEach(button=>{
      button.disabled=Boolean(!writable || active || sending || recovery || checkpointBusy || checkpointLoading);
      button.title=!writable?'请先选择修改文件或执行方式':active?'等待本轮结束':checkpointBusy?'回退尚未结束或结果待核对':'';
    });
    const count=(methodSelections.get(current) || []).length;
    contextLabel('[data-coding-method-open]','方法'+(count?' · '+count:''),count);
  };
  (${CODING_CHARACTERS_CLIENT_FACTORY_SCRIPT})({q,api,current:()=>current,selections:characterSelections,titles:characterTitles,skillSelections:characterSkills,
    save:id=>saveDraft(id,id===current?input.value:localDraft(id) || ''),controls,status});
  const renderArtifacts = () => {
    const list=directory.querySelector('[data-coding-artifact-list]'),needle=directory.querySelector('[data-coding-artifact-search]').value.trim().toLocaleLowerCase();list.replaceChildren();
    for(const item of artifactRows.filter(item=>item.title.toLocaleLowerCase().includes(needle))) {
      const row=document.createElement('button');row.type='button';row.className='mw-btn mw-btn--ghost coding-session-row';
      row.dataset.codingArtifact=item.reference.artifact_id;row.setAttribute('aria-current',String((reportItem || changeItem)===item.reference.artifact_id));
      const title=document.createElement('strong'),meta=document.createElement('span');title.textContent=item.title;meta.textContent=(item.kind==='changeset'?'固定变更 · '+item.file_count+' 个修改':'执行报告')+' · v'+item.reference.version+' · '+new Date(item.saved_at).toLocaleString()+(item.archived?' · 已归档':'');row.append(title,meta);list.append(row);
    }
    if(!list.children.length)list.textContent=artifactRows.length?'没有匹配的成果。':'还没有可读取的固定成果。打开已结束的一轮，保存报告或固定变更。';
  };
  const loadArtifacts = async () => {
    const ticket=++artifactTicket,notice=directory.querySelector('[data-coding-artifact-status]');notice.textContent='正在读取已保存成果…';
    try{const value=await api('/artifacts');if(ticket!==artifactTicket)return;artifactRows=value.artifacts;renderArtifacts();notice.textContent='只列出已保存的报告与固定变更；打开不会开始新执行。';}
    catch(error){if(ticket===artifactTicket)notice.textContent=error.message+'；可点击刷新重试。';}
  };
  const renderDirectory = () => {
    const selectedFilter = directory.querySelector('[data-coding-filter][aria-pressed=true]')?.dataset.codingFilter || 'all';
    // The filters double as the background-task overview: how many rounds are working and how many wait on you.
    const counts={running:state.sessions.filter(session=>session.state==='running').length,'needs-you':state.sessions.filter(session=>session.checkpoint_busy || ['paused','waiting-answer','waiting-approval','failed','reconcile-required'].includes(session.state)).length};
    directory.querySelectorAll('[data-coding-filter]').forEach(button=>{const count=counts[button.dataset.codingFilter];if(count===undefined)return;let badge=button.querySelector('.coding-filter-count');if(!badge){badge=document.createElement('span');badge.className='coding-filter-count';button.append(badge);}badge.textContent=count?String(count):'';badge.hidden=!count;});
    const needle = directory.querySelector('[data-coding-search]').value.trim().toLocaleLowerCase();
    const list = directory.querySelector('[data-coding-sessions]');
    // Replace the server's first paint once, then preserve live pointer targets.
    if (!directoryClaimed) { list.replaceChildren(); directoryClaimed=true; }
    const visible = state.sessions.filter((session) => session.title.toLocaleLowerCase().includes(needle)
      && (selectedFilter === 'all' || selectedFilter === 'running' && session.state === 'running' || selectedFilter === 'needs-you' && (session.checkpoint_busy || ['paused','waiting-answer','waiting-approval','failed','reconcile-required'].includes(session.state))));
    const visibleIds=new Set(visible.map(session=>session.session_id));
    for(const [id,row] of directoryRows) if(!visibleIds.has(id)) {row.remove();directoryRows.delete(id);}
    list.querySelector('.mw-empty')?.remove();
    if (!visible.length) { const empty=document.createElement('div');empty.className='mw-empty';const label=document.createElement('p');label.textContent=needle ? '没有匹配的会话' : selectedFilter!=='all' ? '当前没有这类会话' : '还没有编码会话';empty.append(label);list.append(empty); return; }
    const labels = { idle:'尚未执行', running:'执行中', paused:'已暂停', 'waiting-answer':'等你回答', 'waiting-approval':'等你审查', failed:'失败待处理', stopped:'已停止', cancelled:'已取消', 'reconcile-required':'待核对结果', done:'本轮结束' };
    for (const session of visible) {
      let row=directoryRows.get(session.session_id);
      if(!row) {
        row=document.createElement('a');row.className='mw-dir-row mw-dir-row--meta coding-session-row';row.href='#session-'+encodeURIComponent(session.session_id);row.dataset.codingSession=session.session_id;
        const icon=document.createElement('span');icon.className='mw-dir-row__icon';icon.innerHTML=root.querySelector('[data-coding-face=sessions] svg')?.outerHTML || '';
        const copy=document.createElement('span');copy.className='mw-dir-row__copy';
        const headline=document.createElement('span');headline.className='mw-dir-row__headline';
        const title=document.createElement('strong');title.className='coding-session-title';
        const time=document.createElement('time');time.className='mw-dir-row__count coding-session-time';
        const mark=document.createElement('small');mark.className='coding-session-state';
        headline.append(title,time);copy.append(headline,mark);row.append(icon,copy);directoryRows.set(session.session_id,row);
      }
      row.setAttribute('aria-current',String(current===session.session_id));row.classList.toggle('is-selected',current===session.session_id);
      const title=row.querySelector('.coding-session-title'),time=row.querySelector('time'),mark=row.querySelector('.coding-session-state');
      if(title.textContent!==session.title) title.textContent=session.title;title.title=session.title;
      if(time.dateTime!==session.updated_at) {
        // Local time: today reads as a clock time, earlier days as a date.
        const at=new Date(session.updated_at),now=new Date(),pad=(n)=>String(n).padStart(2,'0');
        time.textContent=Number.isNaN(at.getTime()) ? session.updated_at.slice(5,10) : at.toDateString()===now.toDateString() ? pad(at.getHours())+':'+pad(at.getMinutes()) : pad(at.getMonth()+1)+'-'+pad(at.getDate());
        time.dateTime=session.updated_at;time.title=Number.isNaN(at.getTime()) ? session.updated_at : at.toLocaleString('zh-CN');
      }
      const label=session.checkpoint_busy ? '回退待处理' : labels[session.state] || session.state;if(mark.textContent!==label) mark.textContent=label;
      mark.dataset.state=session.checkpoint_busy ? 'waiting-approval' : session.state;
      const goalKey=session.goal_id || '';let group=directoryGroups.get(goalKey);
      if(!group) {group=document.createElement('section');group.className='coding-session-group';const heading=document.createElement('h2');heading.className='mw-dir__heading';group.append(heading);directoryGroups.set(goalKey,group);}
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
    showWorkspace(workspace?.canonical_path,workspaceId?'原工作区暂不可用，请重新选择':'选择已授权工作区后开始');
    if(!q('[data-coding-workspace-dialog]').open)q('[data-coding-workspace-choice]').value=workspaceId;
  };
  const rememberConfiguration = () => {
    if(!current)return;
    const [provider_id,model_id]=JSON.parse(q('[data-coding-model]').value || '[]');
    configurations.set(current,{intent:q('[data-coding-intent]').value,provider_id:provider_id || '',model_id:model_id || '',workspace_id:workspaceId,...(configurations.get(current)?.writer_assignments ? {writer_assignments:configurations.get(current).writer_assignments} : {})});
  };
  const refreshState = async () => {
    const result=await api('/state'); state=result;
    const models=q('[data-coding-model]'); const previous=models.value;
    const options=result.models.map((model) => { const option=document.createElement('option'); option.value=JSON.stringify([model.provider_id,model.model_id]); option.textContent=model.label; return option; });
    if (!options.length) { const option=document.createElement('option'); option.textContent='先配置可用模型'; option.value=''; options.push(option); }
    q('[data-coding-model-setup]').hidden=result.models.length>0;
    const modelKey=JSON.stringify(result.models);
    if(models.dataset.options!==modelKey) { models.replaceChildren(...options);models.dataset.options=modelKey;if(options.some(option=>option.value===previous)) models.value=previous; }
    const selectedWorkspace=result.workspaces.find(item=>item.workspace_id===workspaceId) || result.workspace || (result.workspaces.length===1 ? result.workspaces[0] : null);
    if(!configurations.get(current))workspaceId=selectedWorkspace?.workspace_id || '';
    showWorkspace(selectedWorkspace?.canonical_path,'选择已授权工作区后开始');
    const workspaceChoice=q('[data-coding-workspace-choice]');
    const workspaceKey=JSON.stringify(result.workspaces);
    if(workspaceChoice.dataset.options!==workspaceKey) {workspaceChoice.replaceChildren(...result.workspaces.map(item=>{const option=document.createElement('option');option.value=item.workspace_id;option.textContent=item.canonical_path;return option;}));workspaceChoice.dataset.options=workspaceKey;workspaceChoice.value=workspaceId;}
    if(!q('[data-coding-workspace-dialog]').open) workspaceChoice.value=workspaceId;
    const roles=result.runtimes.find(runtime=>runtime.runtime_id==='prologue')?.roles || [];
    q('[data-coding-intent] option[value=parallel]').disabled=!roles.find(role=>role.role_id==='writers')?.available;
    const collaborate=q('[data-coding-intent] option[value=collaborate]');collaborate.disabled=!roles.find(role=>role.role_id==='coordinator')?.available;
    const execute=q('[data-coding-intent] option[value=execute]'); const available=roles.find(role=>role.role_id==='builder');
    execute.disabled=!available?.available; execute.textContent=available?.available ? '执行' : '执行（待接通审批）';
    const edit=q('[data-coding-intent] option[value=edit]'); const writable=roles.find(role=>role.role_id==='writer')?.available;
    edit.disabled=!writable; edit.textContent=writable ? '修改文件' : '修改文件（待接通审批）';
    applyConfiguration();renderDirectory();taskboard.sessions(state.sessions); controls();
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
  // Code reads as code: fenced blocks and diff lines are coloured from text pieces, never from model-written markup.
  const codeLanguageOf = ${codeLanguage.toString()};
  const tokensOf = ${codeTokens.toString()};
  const paintInto = (target, text, language) => {
    if(!language || text.length > 40000)return false;
    const pieces=tokensOf(text,language);target.replaceChildren(...pieces.map(([kind,value])=>{if(!kind)return document.createTextNode(value);const span=document.createElement('span');span.className='tok-'+kind;span.textContent=value;return span;}));return true;
  };
  const paintBlock = (code) => {
    if(code.dataset.painted)return;code.dataset.painted='true';
    const named=[...code.classList].find(name=>name.startsWith('language-'))||'',text=code.textContent;
    paintInto(code,text,codeLanguageOf(named) || (/^\s*[\[{]/.test(text) && /[\]}]\s*$/.test(text) ? 'json' : /^\s*\$ /.test(text) ? 'sh' : ''));
  };
  // Diff lines keep their sign; the rest of each line is coloured by the file's language, one line at a time.
  const paintDiffs = (scope) => scope.querySelectorAll('[data-code-path] .diff-rows li:not([data-painted]) > code').forEach(code => {
    const row=code.parentElement;row.dataset.painted='true';
    const language=codeLanguageOf(code.closest('[data-code-path]').dataset.codePath || '');if(!language)return;
    const sign=code.querySelector('.diff-sign'),text=[...code.childNodes].filter(node=>node!==sign).map(node=>node.textContent).join(''),holder=document.createElement('span');
    if(paintInto(holder,text,language))code.replaceChildren(...(sign?[sign]:[]),...holder.childNodes);
  });
  let paintFrame=0;new MutationObserver(()=>{if(paintFrame)return;paintFrame=requestAnimationFrame(()=>{paintFrame=0;paintDiffs(root);});}).observe(root,{childList:true,subtree:true});
  const enrichCode = (node) => node.querySelectorAll('pre').forEach(pre => {
    const code=pre.querySelector('code');if(code)paintBlock(code);
    const button=document.createElement('button'); button.type='button'; button.className='mw-btn coding-code-copy'; button.textContent='复制';
    button.addEventListener('click',async()=>{ try { await navigator.clipboard.writeText(pre.querySelector('code')?.textContent || pre.textContent); button.textContent='已复制'; } catch { button.textContent='复制失败，请手动选择'; } }); pre.append(button);
  });
  const renderCommands = (runs) => {
    const region=q('[data-coding-commands]');
    // A summarized round names its command targets itself; a loaded one is read from its activity.
    const refs=runs.flatMap((run,index)=>(run.command_outputs || []).map(({target,...ref})=>({ref,number:index+1,target:target ?? run.activity?.find(item=>item.call_id===ref.call_id)?.target ?? ''})));
    region.hidden=!refs.length;
    const shown=new Set([...region.children].map(node=>node.dataset.command));
    for(const {ref,number,target} of refs) {
      const key=JSON.stringify(ref);
      if(shown.has(key)) continue;shown.add(key);
      const detail=document.createElement('details');detail.className='coding-command';detail.dataset.command=key;
      // The row names the command itself; its exit state is read from the durable receipt when opened.
      const summary=document.createElement('summary'),line=document.createElement('code'),state=document.createElement('span'),round=document.createElement('span');
      line.textContent=target ? '$ '+target : '命令回执';line.title=target;state.className='coding-command-state';round.className='coding-command-round';round.textContent='第 '+number+' 轮';
      summary.append(line,state,round);
      const body=document.createElement('div');detail.append(summary,body);region.insertBefore(detail,region.querySelector(':scope > h3')?.nextSibling || null);
      let loaded=false,busy=false;
      const load=async()=>{
        if(loaded || busy) return;busy=true;body.textContent='正在读取执行回执…';
        const id=current,ticket=generation;
        try {
          const receipt=await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(ref.run_id)+'/commands/'+encodeURIComponent(ref.call_id));
          if(id!==current || ticket!==generation) return;
          loaded=true;body.replaceChildren();
          const condition=receipt.stop_reason==='timed-out' || receipt.timed_out ? '超时' : receipt.stop_reason==='cancelled' || receipt.cancelled ? '已取消' : receipt.exit_code===null ? '退出码未知' : '退出码 '+receipt.exit_code;
          state.textContent=condition.replace('退出码 ','exit ');state.dataset.tone=receipt.exit_code===0 && !receipt.timed_out && !receipt.cancelled ? 'done' : 'failed';if(!target){line.textContent='$ '+receipt.command;line.title=receipt.command;}
          const command=document.createElement('p');command.className='coding-command-recorded';command.textContent='回执记录的命令：'+receipt.command;body.append(command);
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
  const loadReportOutput = async (id,runId,ticket) => {
    if(ticket!==reportTicket || id!==current)return;
    const button=q('[data-coding-report-output]'),message=q('[data-coding-report-output-status]');button.disabled=true;reportOutput=null;
    try {
      const value=await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(runId)+'/report/output');
      if(ticket!==reportTicket || id!==current)return;
      reportOutput=value;button.textContent=value.selected?'已作为报告输出':'设为报告输出';button.disabled=value.selected;
      message.hidden=false;message.textContent=value.selected?'连接到 Coding 报告端口的插件可读取这一固定版本；报告正文、原目标与历史不变。':'选择后，连接到 Coding 报告端口的插件将读取这一固定版本；不会复制报告、运行模型或记录 Goal 进展。';
    } catch(error) {if(ticket===reportTicket && id===current){message.hidden=false;message.textContent='无法读取当前报告输出：'+error.message;button.textContent='重试读取输出';button.disabled=false;}}
  };
  const showReport = async (runId, save = false) => {
    if(changeReview.active())changeReview.close();
    const id=current,generationAtStart=generation,ticket=++reportTicket;
    if(!reportRun) dialogueOffset=turns.scrollTop;
    reportRun=runId;reportSaving=save;
    turns.hidden=true;q('[data-coding-report-reader]').hidden=false;q('[data-coding-latest]').hidden=true;
    q('[data-coding-report-save]').disabled=true;q('[data-coding-report-save]').hidden=false;q('[data-coding-report-progress]').hidden=true;reportOutput=null;q('[data-coding-report-output]').hidden=true;q('[data-coding-report-output-status]').hidden=true;
    q('[data-coding-report-status]').textContent=save?'正在保存固定报告…':'正在读取执行报告…';
    if(!save) q('[data-coding-report-body]').replaceChildren();
    try {
      const result=await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(runId)+'/report'+(reportItem && !save?'?fixed=1':''),save?'POST':'GET');
      if(current!==id || generation!==generationAtStart || ticket!==reportTicket) return;
      q('[data-coding-report-body]').innerHTML=result.html;enrichCode(q('[data-coding-report-body]'));
      q('[data-coding-report-status]').textContent=result.reference?'已保存固定版本 v'+result.reference.version+' · '+result.saved_at:'尚未保存；保存后保留这轮证据，不代表任务验收。';
      q('[data-coding-report-save]').disabled=Boolean(result.reference);q('[data-coding-report-save]').hidden=Boolean(result.reference);
      q('[data-coding-report-progress]').hidden=!(result.reference && result.report.goal && !result.report.goal_source_error);
      q('[data-coding-report-output]').hidden=!result.reference;
      if(result.reference)void loadReportOutput(id,runId,ticket);
      if(!save) {q('[data-coding-report-reader]').scrollTop=0;q('[data-coding-report-close]').focus({preventScroll:true});}
    } catch(error) {
      if(current===id && ticket===reportTicket) {
        q('[data-coding-report-status]').textContent=error.message;
        q('[data-coding-report-save]').disabled=!save;
      }
    } finally {if(ticket===reportTicket)reportSaving=false;}
  };
  // A new decision takes keyboard focus once — Enter approves, Tab reaches reject — unless the person is typing.
  const offeredApprovals=new Set();
  const offerApproval = (inline) => {
    const card=inline.querySelector('[data-agent-review-phase=pending]'),id=card?.dataset.agentReviewItem,approve=card?.querySelector('[data-agent-review-approve]');
    if(!inline.isConnected || !id || !approve || approve.disabled || offeredApprovals.has(id))return;
    offeredApprovals.add(id);
    if(document.activeElement?.matches?.('input,textarea,select,[contenteditable=""],[contenteditable=true]') || document.querySelector('dialog[open]'))return;
    approve.focus({preventScroll:true});
  };
  // runs: the rounds to (re)draw, a contiguous stretch. all: the whole session in order, where rounds that are not
  // loaded are summaries. Numbering and "latest" are always read against the whole session.
  const renderRuns = (runs, all=runs) => {
    // Following is the reader's choice, made by scrolling; content that grows after a render must not revoke it.
    const follow = !reportRun && onContentAppended({position:position(),pinned}).follow;
    if(all.length)q('[data-coding-welcome]')?.remove();
    else if(!q('[data-coding-welcome]')) {turns.append(q('[data-coding-welcome-template]').content.cloneNode(true));const name=root.dataset.codingWorkspaceName;if(name)turns.querySelectorAll('[data-coding-welcome-workspace]').forEach(node=>{node.textContent=name;});}
    turns.querySelectorAll('[data-coding-prompt]').forEach(button=>{button.disabled=Boolean(input.value.trim());});
    for (const run of runs) {
      let block=[...turns.children].find(node=>node.dataset.run===run.ref.run_id);
      if(!block) { block=document.createElement('section'); block.dataset.run=run.ref.run_id; block.dataset.runIndex=String(all.indexOf(run)); turns.insertBefore(block,[...turns.querySelectorAll(':scope > [data-run]')].find(node=>Number(node.dataset.runIndex)>all.indexOf(run)) || null); }
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
          const renderKey=turn.text+'|'+(turn.steer?.state || '')+(run.frozen.role_id==='planner'?'|'+run.phase:'');
          if(renderedText.get(node)!==renderKey) {
            if(!plans.renderTurn(node,run,turn) && !writerDirectories.renderTurn(node,run,turn)){node.innerHTML=turn.html || ''; if(!turn.html) node.textContent=turn.text;}
            // A round that started from the digest of earlier rounds shows the person's own request; the digest it carried
            // stays one click away, with the plain statement that tool output was not carried.
            const digestAt=turn.kind==='user' && turn.text.startsWith(HISTORY_DIGEST_MARKER) ? turn.text.indexOf(HISTORY_DIGEST_TASK_HEAD) : -1;
            if(digestAt>=0){
              const digest=turn.text.slice(HISTORY_DIGEST_MARKER.length,digestAt),own=turn.text.slice(digestAt+HISTORY_DIGEST_TASK_HEAD.length),count=(digest.match(/前 (\\d+) 轮/)||[])[1]||'';
              node.classList.add('has-digest');node.replaceChildren();
              const details=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('pre'),text=document.createElement('div');
              details.className='coding-digest';summary.innerHTML='<svg aria-hidden="true"><use href="#icon-history"></use></svg>';summary.append(document.createTextNode('带入了前 '+count+' 轮的摘要 · 工具输出原文没有带入'));
              body.textContent=digest;details.append(summary,body);
              text.className='coding-turn-own';text.textContent=own.startsWith(CONTINUATION_MARKER)?'从断点继续 · '+own.slice(CONTINUATION_MARKER.length).split('\\n')[0].replace(/请从断点继续完成原任务。?$/,'').trim():own;
              node.append(details,text);
            }
            // Files named with @ were attached after the person's words; the words show, the attachments fold away.
            else if(turn.kind==='user' && turn.text.includes(MENTIONS_MARKER) && !turn.text.startsWith(CONTINUATION_MARKER)){
              const at=turn.text.indexOf(MENTIONS_MARKER),own=turn.text.slice(0,at),attached=turn.text.slice(at+MENTIONS_MARKER.length),count=(attached.match(/^### /gm)||[]).length;
              node.replaceChildren();const text=document.createElement('div'),details=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('pre');
              text.className='coding-turn-own';text.textContent=own;details.className='coding-digest';summary.innerHTML='<svg aria-hidden="true"><use href="#icon-paperclip"></use></svg>';summary.append(document.createTextNode('附带了 '+count+' 个文件（发送时的内容）'));
              body.textContent=attached;details.append(summary,body);node.append(text,details);
            }
            // A continuation the Host composed reads as one line; the facts it handed the model stay one click away.
            else if(turn.kind==='user' && turn.text.startsWith(CONTINUATION_MARKER)){
              const body=node.innerHTML,line=turn.text.slice(CONTINUATION_MARKER.length).split('\\n')[0].replace(/请从断点继续完成原任务。?$/,'').trim();
              node.classList.add('is-continuation');node.innerHTML='';
              const details=document.createElement('details'),summary=document.createElement('summary'),facts=document.createElement('div');
              summary.innerHTML='<svg aria-hidden="true"><use href="#icon-play"></use></svg>';summary.append(document.createTextNode('从断点继续 · '+line));
              facts.className='coding-continuation-facts';facts.innerHTML=body;details.append(summary,facts);node.append(details);
            }
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
          if(!detail) { detail=document.createElement('details'); detail.className='coding-activity'; detail.dataset.codingActivity=key; }
          timeline.renderGroup(detail,activities,run,entry===groups.findLast(group=>group.kind==='activity') && run===all.at(-1));
          ordered.push(detail);
        } else {
          const question=entry.value,key=JSON.stringify([run.ref.run_id,question.pending_id,question.pending_revision]);
          const form=[...block.querySelectorAll('[data-coding-question]')].find(node=>node.dataset.questionKey===key);
          if(form) ordered.push(form);
        }
      }
      // The running plan sits right under the task it came from, kept in place by the same ordering as every entry.
      // A graph continued by a later round is shown once, on the round now working on it.
      const planEntry=planEntries.find(entry=>entry.run_id===run.ref.run_id),boardId=planEntry?.board?.board_id;
      const laterOnSameGraph=boardId && all.slice(all.indexOf(run)+1).some(later=>planEntries.find(entry=>entry.run_id===later.ref.run_id)?.board?.board_id===boardId);
      if(laterOnSameGraph)block.querySelector(':scope > .coding-plan-progress')?.remove();
      const planCard=laterOnSameGraph?null:planProgress.render(run,planEntry,run===all.at(-1) && !terminal(run.phase));
      if(planCard){const at=ordered.findIndex(node=>node.dataset?.kind==='user');ordered.splice(at+1,0,planCard);}
      // Children appear right after the step that sent them.
      const children=subagentCards.render(run,subagentGroups.find(group=>group.run_id===run.ref.run_id));
      if(children){const at=ordered.map(node=>Boolean(node.classList?.contains('coding-activity') && node.querySelector('[data-kind="dispatch-subagent"]'))).lastIndexOf(true);ordered.splice(at>=0?at+1:ordered.length,0,children);}
      // While the model is still writing its latest reply, a caret marks the end of that text — and only that text.
      const writing=run===all.at(-1) && ['starting','running'].includes(run.phase) && groups.at(-1)?.kind==='turn' && groups.at(-1).value.kind==='assistant';
      ordered.forEach((node,at)=>{if(node.classList?.contains('coding-turn'))node.classList.toggle('is-writing',writing && at===ordered.length-1);});
      for(const detail of block.querySelectorAll(':scope > [data-coding-activity]')) if(!ordered.includes(detail)) detail.remove();
      // Insert only missing/misplaced entries: polling keeps open tools and a
      // focused question form intact. Live and replay use the same ordering.
      let cursor=block.firstElementChild;
      for(const node of ordered) {
        if(node!==cursor) block.insertBefore(node,cursor);
        cursor=node.nextElementSibling;
      }
      // The pending decision sits where the work stopped. The Host renders it and owns the decision.
      let inline=block.querySelector(':scope > [data-coding-inline-review]');
      if(run===all.at(-1) && run.phase==='awaiting-review') {
        if(!inline){inline=document.createElement('div');inline.className='coding-inline-review';inline.dataset.codingInlineReview='';}
        const footer=block.querySelector(':scope > .coding-run-footer');if(inline.nextElementSibling!==footer || inline.parentElement!==block)block.insertBefore(inline,footer);void Promise.resolve(host.showReviews?.(inline,[run.ref],runtimeSessionId)).then(()=>offerApproval(inline));
      } else inline?.remove();
      timeline.renderFooter(block,run,all.indexOf(run),run===all.at(-1) && (run.phase==='reconcile-required' || !recovery && !checkpointBusy));
    }
    renderCommands(all);
    // One row per finished round: its changes and its report, newest first.
    const ended=all.filter(run=>['completed','failed','stopped','cancelled'].includes(run.phase)),outcomeList=q('[data-coding-outcome-list]');
    q('[data-coding-outcomes]').hidden=!ended.length;
    const outcomeIcon=(name)=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS('http://www.w3.org/2000/svg','use');svg.setAttribute('aria-hidden','true');use.setAttribute('href','#icon-'+name);svg.append(use);return svg;};
    const rows=new Map([...outcomeList.children].map(node=>[node.dataset.codingOutcome,node]));
    for(const run of ended) {
      let row=rows.get(run.ref.run_id);
      if(!row) {
        row=document.createElement('div');row.className='coding-outcome';row.dataset.codingOutcome=run.ref.run_id;
        const name=document.createElement('span'),phase=document.createElement('span'),change=document.createElement('button'),report=document.createElement('button');
        name.className='coding-outcome-name';phase.className='coding-outcome-phase';
        change.type='button';change.className='mw-btn mw-btn--ghost';change.dataset.codingChangeOpen=run.ref.run_id;change.append(outcomeIcon('columns'),'变更');
        report.type='button';report.className='mw-btn mw-btn--ghost';report.dataset.codingReportOpen=run.ref.run_id;report.append(outcomeIcon('file'),'报告');
        row.append(name,phase,change,report);outcomeList.prepend(row);
      }
      row.querySelector('.coding-outcome-name').textContent='第 '+(all.indexOf(run)+1)+' 轮';
      const phase=row.querySelector('.coding-outcome-phase');phase.textContent=phases[run.phase] || run.phase;phase.dataset.tone=run.phase==='completed'?'done':run.phase==='failed'?'failed':'idle';
    }
    lastRun=all.at(-1)||null;
    const result=q('[data-coding-result]');
    if(!lastRun) { result.textContent="本轮的成果、检查与执行记录会显示在这里。"; delete result.dataset.content; if(statusKey!=='idle'){statusKey='idle';status('');} }
    if(lastRun) {
      // Only what this round actually used is listed; what it did not use is named once, so nothing is silently omitted.
      const f=lastRun.frozen,values=[['模型',f.model_id],['用量',codingUsageSummary(lastRun.usage)],['工作范围',f.directory.canonical_path]],unused=[];
      if(f.subagent_workspaces?.length) values.push(['本轮独立目录',f.subagent_workspaces.map(item=>item.directory.canonical_path).join('；')]);
      values.push(['身份',f.role_id+' · v'+f.role_version]);
      if(f.skills.length) values.push(['本轮方法',f.skills.map(method=>method.name+' · v'+method.version).join('、')]); else unused.push('方法');
      if(f.mcp_tools?.length) values.push(['本轮 MCP',f.mcp_tools.map(tool=>(tool.server_label || tool.server)+' / '+tool.tool+' · 配置 '+(tool.configuration_version ?? '未记录')+' · '+tool.version).join('、')]); else unused.push('MCP');
      if((f.mcp_sources || []).length) values.push(['本轮 MCP 资料',f.mcp_sources.map(source=>(source.server_label || source.server)+' · 配置 '+source.configuration_version).join('、')]); else unused.push('MCP 资料来源');
      const character=f.character;
      if(character) values.push(['本轮 Character',character.title+' · v'+character.reference.version],['本轮内置工具',f.host_tools?.join('、') || '不使用内置工具']); else unused.push('Character');
      if(f.text_materials.length) values.push(['本轮固定材料',f.text_materials.map(material=>(material.title || material.source_artifact_id)+' · v'+material.source_version).join('、')]); else unused.push('固定材料');
      if(f.compaction) values.push(['上下文整理','自动 · 估计超过 '+f.compaction.above_tokens+' tokens 时选择较早原文 · v'+f.compaction.version]);
      if(!lastRun.usage.compaction && lastRun.activity.some(item=>item.name==='上下文整理')) values.push(['用量范围','以上仅主执行；上下文整理的额外模型请求尚未计入此小计。']);
      const phaseLabel=phases[lastRun.phase]||lastRun.phase,tone=lastRun.phase==='completed'?'done':lastRun.phase==='failed'?'failed':terminal(lastRun.phase)?'idle':'live';
      const key=JSON.stringify([all.length,phaseLabel,values,unused]);
      if(result.dataset.content!==key) {
        const head=document.createElement('header'),title=document.createElement('h3'),phase=document.createElement('span'),round=document.createElement('span'),dl=document.createElement('dl');
        head.className='coding-facts-head';title.textContent='本轮概况';phase.className='coding-facts-phase';phase.dataset.tone=tone;phase.textContent=phaseLabel;round.className='coding-facts-round';round.textContent='第 '+all.length+' 轮';head.append(title,phase,round);
        values.forEach(([label,value])=>{const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=value;if(label==='工作范围'||label==='本轮独立目录')dd.className='is-path';dl.append(dt,dd);});
        result.replaceChildren(head,dl);
        if(unused.length){const note=document.createElement('p');note.className='coding-facts-unused';note.textContent='本轮未使用：'+unused.join('、');result.append(note);}
        result.dataset.content=key;
      }
      const nextStatus=lastRun.ref.run_id+':'+lastRun.phase+':'+lastRun.stop_reason;
      // The round's own footer shows its live state and outcome; this line only carries a failure worth reading twice.
      if(statusKey!==nextStatus){statusKey=nextStatus;status(lastRun.phase==='failed' ? (lastRun.stop_reason || phases.failed) : '',lastRun.phase==='failed');}
    }
    const pill=q('[data-coding-phase]'),live=lastRun && !terminal(lastRun.phase);pill.hidden=!live;if(live){pill.dataset.phase=lastRun.phase;pill.textContent=phases[lastRun.phase]||lastRun.phase;}
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
  // A live round is followed as it happens: the Host answers the moment it changes, so text arrives as it is written
  // rather than on the next timer tick. The regular refresh keeps everything else current at a slower pace.
  let liveRun='';
  const followLive=async(id,runId)=>{
    if(liveRun===runId)return;liveRun=runId;let since=null,failures=0;
    while(current===id && liveRun===runId){
      try{
        const data=await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(runId)+'/live?timeout=20000'+(since?'&since='+encodeURIComponent(since):''));
        if(current!==id || liveRun!==runId)break;failures=0;since=data.version;
        const run=data.runs[0],at=windowRuns.findIndex(held=>held.ref.run_id===runId);if(at<0)break;
        windowRuns[at]=run;allRuns=allRuns.map(held=>held.ref.run_id===runId?run:held);
        renderRuns([run],allRuns);usageMeter.render({...lastData,runs:windowRuns},lastRun);
        if(terminal(run.phase)){void readCurrent();break;}
      }catch{if(++failures>3)break;await new Promise(resolve=>setTimeout(resolve,1000));}
    }
    if(liveRun===runId)liveRun='';
  };
  // Earlier rounds come back a page at a time as the reader scrolls up; what they were reading stays where it was.
  const loadEarlier=async()=>{
    const start=allRuns.findIndex(run=>!run.light);
    if(pageLoading || !current || start<=0)return;
    const id=current,ticket=generation;pageLoading=true;renderEarlier();
    try{
      const page=await api('/sessions/'+encodeURIComponent(id)+'/runs?before='+start+'&limit='+SESSION_PAGE);
      if(current!==id || ticket!==generation)return;
      page.runs.forEach(run=>olderViews.set(run.ref.run_id,run));olderPlanEntries.push(...(page.taskboard_plans || []));olderSubagents.push(...(page.subagents || []));
      allRuns=allRuns.map(run=>run.light && olderViews.get(run.ref.run_id) || run);
      planEntries=[...olderPlanEntries,...planEntries.filter(entry=>!olderPlanEntries.includes(entry))];subagentGroups=[...olderSubagents,...subagentGroups.filter(group=>!olderSubagents.includes(group))];
      // Drawn two rounds a frame, nearest first, so scrolling never waits on a whole page; the round being read stays put.
      const pending=page.runs.map(run=>olderViews.get(run.ref.run_id)).reverse();
      while(pending.length){
        if(current!==id || ticket!==generation)return;
        const anchor=[...turns.querySelectorAll(':scope > [data-run]')].find(node=>node.getBoundingClientRect().bottom>turns.getBoundingClientRect().top),before=anchor?.getBoundingClientRect().top;
        renderRuns(pending.splice(0,2).reverse(),allRuns);
        if(anchor)turns.scrollTop+=anchor.getBoundingClientRect().top-before;
        if(pending.length)await new Promise(resolve=>requestAnimationFrame(resolve));
      }
    }catch(error){if(current===id)status(error.message,true);}
    finally{pageLoading=false;if(current===id)renderEarlier();}
  };
  const earlierWatch=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))void loadEarlier();},{root:turns,rootMargin:'900px 0px 0px 0px'});
  const renderEarlier=()=>{
    const hidden=allRuns.findIndex(run=>!run.light);
    let bar=turns.querySelector(':scope > [data-coding-earlier]');
    if(hidden<=0){if(bar){earlierWatch.unobserve(bar);bar.remove();}return;}
    if(!bar){bar=document.createElement('button');bar.type='button';bar.className='coding-earlier';bar.dataset.codingEarlier='';bar.addEventListener('click',()=>void loadEarlier());earlierWatch.observe(bar);}
    if(turns.firstElementChild!==bar)turns.prepend(bar);
    bar.disabled=pageLoading;bar.textContent=pageLoading?'正在读取更早的轮次…':'显示更早的 '+hidden+' 轮';
  };
  const readCurrent = async (fresh=false) => {
    if(!current || loading && !fresh) return;
    const id=current, ticket=generation; loading=true;
    try {
      const read=(known)=>api('/sessions/'+encodeURIComponent(id)+'?window='+SESSION_WINDOW+(earlierFingerprint?'&earlier='+earlierFingerprint:'')+(known.length?'&known='+known.join(','):''));
      let data=await read(fresh?[]:windowRuns.map(run=>run.fingerprint).filter(Boolean));
      if(current!==id || ticket!==generation) return;
      // An unchanged round keeps the very view already drawn, so nothing about it is redrawn either.
      data.runs=data.runs.map(run=>run.unchanged ? windowRuns.find(held=>held.fingerprint===run.fingerprint) || run : run);
      if(data.runs.some(run=>run.unchanged)){data=await read([]);if(current!==id || ticket!==generation) return;}
      if(data.earlier){earlierRuns=data.earlier;earlierFingerprint=data.earlier_fingerprint;}
      // A round that leaves the window keeps its full view: it is already drawn and settled.
      for(const run of windowRuns) if(!data.runs.some(next=>next.ref.run_id===run.ref.run_id)) olderViews.set(run.ref.run_id,run);
      windowRuns=data.runs;allRuns=[...earlierRuns.map(summary=>olderViews.get(summary.ref.run_id) || summary),...data.runs];
      recovery=Boolean(data.recovery_required);checkpointBusy=Boolean(data.checkpoint_busy);
      q('[data-coding-recovery]').hidden=!recovery;
      const resultsLabel=recovery || checkpointBusy || data.runs.some(run=>run.phase==='awaiting-review')?'结果 · 待审查':'结果与审查';
      q('[data-coding-results-label]').textContent=resultsLabel;
      q('[data-coding-results-open]').setAttribute('aria-label', resultsLabel);
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
      if(!characterSelections.has(id)){characterSelections.set(id,data.character ?? null);characterTitles.set(id,data.character_title || '');if(data.character_skill_ids!==undefined)characterSkills.set(id,data.character_skill_ids);}
      if(!methodSelections.has(id)) methodSelections.set(id,data.methods || []);
      if(!questionDrafts.has(id)) {
        let saved;try{saved=JSON.parse(sessionStorage.getItem(draftKey(id)+':questions') || 'null');}catch{}
        questionDrafts.set(id,saved && typeof saved==='object' && !Array.isArray(saved) ? saved : data.question_drafts || {});
      }
      if(fresh) { input.value=localDraft(id) ?? data.draft ?? ''; rememberDraft(id,input.value); q('[data-coding-draft-status]').textContent='草稿已恢复；模型与方式用于下一轮。'; turns.replaceChildren(); pinned=!offsets.has(id); }
      runtimeSessionId=data.session.runtime_session_id;planEntries=[...olderPlanEntries,...(data.taskboard_plans || [])];subagentGroups=[...olderSubagents,...(data.subagents || [])];renderRuns(data.runs,allRuns);renderEarlier();lastData=data;usageMeter.render(data,lastRun);void cooperationUi.refresh();
      if(lastRun && !terminal(lastRun.phase))void followLive(id,lastRun.ref.run_id);
      plans.update(id,data.plan ?? null,allRuns);
      subagents.update(id,data.subagents ?? []);
      taskboard.update(id,{...data,runs:allRuns});
      stepReports.sync(id);
      if(checkpointBusy){statusKey='checkpoint';status('回退操作尚未结束，请查看右侧审查或核对结果。');}
      // The results panel lists this session's reviews by session, not by naming every round: open items always, and the
      // latest settled history with the rest one click away. It is only read while the panel is open.
      if(root.dataset.codingResults==='true')void host.showReviews?.(q('[data-coding-host-reviews]'), (data.subagents || []).flatMap(group=>(group.children || []).flatMap(child=>child.child_run ? [child.child_run] : [])), data.session.runtime_session_id, undefined, data.session.runtime_session_id ? {runSession:data.session.runtime_session_id,limit:30} : undefined);
      const nextCheckpointKey=JSON.stringify([id,data.runs.at(-1)?.ref.run_id,data.runs.at(-1)?.ended_at,checkpointBusy]);
      if(fresh || checkpointKey!==nextCheckpointKey){checkpointKey=nextCheckpointKey;void readCheckpoints();}
      if(data.error) status(data.error,true);
      if(fresh && offsets.has(id)) { turns.scrollTop=offsets.get(id); pinned=atBottom(position()); }
      renderDirectory(); controls();
    } catch(error) { if(current===id && ticket===generation){status(error.message,true);taskboard.fail(id,error.message);} }
    finally { if(ticket===generation) loading=false; }
  };
  const select = async(id) => {
    host.revealTask?.();
    root.dataset.codingResults='false';
    root.dataset.codingDetail='true';
    if(id===current) return selectionTask;
    if(changeReview.active())changeReview.close();q('[data-coding-outcome-list]').replaceChildren();q('[data-coding-outcomes]').hidden=true;
    materialTicket++;q('[data-coding-material-dialog]').close();
    closeReport();
    if(current) { offsets.set(current,turns.scrollTop); void flushDraft().catch(error=>status(error.message,true)); }
    void host.showReviews?.(q('[data-coding-host-reviews]'), []);
    recoveryLoading=false;recoveryBusy=false;recoveryKey='';q('[data-coding-recovery-list]').replaceChildren();q('[data-coding-recovery]').hidden=true;
    resetWindow();cooperationUi.reset();current=id; generation++; loading=false; lastRun=null; recovery=false;checkpointBusy=false;checkpointLoading=false;checkpointKey='';statusKey='';
    taskboard.loading(id);
    q('[data-coding-checkpoints-list]').replaceChildren();q('[data-coding-checkpoints-status]').textContent='正在读取检查点…';
    q('[data-coding-commands]').querySelectorAll(':scope > .coding-command').forEach(node=>node.remove());q('[data-coding-commands]').hidden=true;
    input.disabled=true; selectionTask=readCurrent(true);await selectionTask;
  };
  const openCodingItem = async(itemId) => {
    const ticket=++itemTicket;reportItem='';changeItem='';
    const prefix=itemId.startsWith('coding-changeset:')?'coding-changeset:':itemId.startsWith('coding-report:')?'coding-report:':'';
    if(!prefix){await select(itemId);if(ticket===itemTicket){closeReport();changeReview.close();renderArtifacts();}return;}
    const parts=itemId.slice(prefix.length).split(':');
    if(parts.length!==2)throw new Error('固定成果引用无效');
    const id=decodeURIComponent(parts[0]),runId=decodeURIComponent(parts[1]);
    await select(id);if(ticket!==itemTicket || current!==id)return;
    if(prefix==='coding-changeset:'){changeItem=itemId;await changeReview.openFixed(runId);}else{reportItem=itemId;await showReport(runId);}if(ticket===itemTicket)renderArtifacts();
  };
  root.addEventListener('molis-work:select-item',event=>{
    root.dataset.codingDetail=String(Boolean(event.detail.itemId));
    if(event.detail.itemId) void openCodingItem(event.detail.itemId).catch(error=>status(error.message,true));
    else void flushDraft().catch(error=>status(error.message,true));
  });
  // A new session is only worth keeping once something is written in it: an untouched empty one is reused
  // instead of piling up. Anything with a draft, a Goal or a past run is left alone.
  const untouched = async() => {
    for(const session of state.sessions.filter(item=>item.state==='idle' && item.title==='新编码会话' && !item.goal_id)) {
      if(localDraft(session.session_id)) continue;
      try{const data=await api('/sessions/'+encodeURIComponent(session.session_id)+'?window=1');if(!data.runs.length && !(data.draft || '').trim() && !data.character && !(data.materials || []).length)return session;}catch{}
    }
    return null;
  };
  const create = async() => {
    const reuse=await untouched();
    const session=reuse || (await api('/sessions','POST',{title:'新编码会话'})).session;
    if(!reuse)await refreshState();
    host.openItem('coding',session.session_id,session.title);await select(session.session_id);input.focus();
  };
  let creatingCharacterSession=false;
  window.addEventListener('molis-work:character-coding',event=>{
    if(creatingCharacterSession)return;
    const selected=event.detail;if(!selected?.reference)return;
    creatingCharacterSession=true;
    void (async()=>{
      const result=await api('/sessions','POST',{title:selected.title});const id=result.session.session_id;
      // Persist the exact publication and task before navigation; never start a paid run automatically.
      await api('/sessions/'+encodeURIComponent(id),'PATCH',{draft:selected.task || '',character:selected.reference,character_skill_ids:selected.skill_ids || []});
      await refreshState();host.openItem('coding',id,selected.title);await select(id);
      if(selected.workspace_id){workspaceId=selected.workspace_id;rememberConfiguration();await flushDraft();await refreshState();}
      input.focus();status('已带入角色固定版本。选择模型和执行方式后开始任务。');
    })().catch(error=>{status(error.message,true);window.alert('创建 Character 编码会话失败：'+error.message);}).finally(()=>{creatingCharacterSession=false;});
  });
  /** The composer keeps rarely used context behind one "+" so the bar stays about the task. */
  const attachMenu=q('[data-coding-attach-menu]'),attachToggle=q('[data-coding-attach-toggle]');
  const setAttach=open=>{attachMenu.hidden=!open;attachToggle.setAttribute('aria-expanded',String(open));};
  document.addEventListener('click',event=>{if(attachMenu.hidden)return;if(event.target.closest('[data-coding-attach-toggle]'))return;setAttach(false);});
  root.addEventListener('keydown',event=>{if(event.key==='Escape' && !attachMenu.hidden){setAttach(false);attachToggle.focus();}});
  attachToggle.addEventListener('click',()=>setAttach(attachMenu.hidden));
  const click = async(event) => {
    const target=event.target.closest('button,a'); if(!target) return;
    try {
      if(target.matches('[data-coding-artifact-refresh]')) await loadArtifacts();
      if(target.matches('[data-coding-artifact]')) {event.preventDefault();host.openItem('coding',target.dataset.codingArtifact,target.querySelector('strong').textContent);}
      if(target.matches('[data-coding-report-open]')) {reportItem='';changeItem='';renderArtifacts();reportTrigger=target;await showReport(target.dataset.codingReportOpen);}
      if(target.matches('[data-coding-report-close]')) {const fromArtifact=reportItem;reportItem='';closeReport(true);if(fromArtifact)host.openItem('coding',current,state.sessions.find(item=>item.session_id===current)?.title);}
      if(target.matches('[data-coding-report-progress]') || target.matches('[data-coding-progress-refresh]'))await openProgress();
      if(target.matches('[data-coding-progress-close]'))closeProgress();
      if(target.matches('[data-coding-progress-goal]') && progressView?.preview && !progressSaving){const goal=progressView.preview.report_goal;closeProgress();host.openItem('goals',goal.goal_id,goal.title);}
      if(target.matches('[data-coding-goal-open]')) await openGoals();
      if(target.matches('[data-coding-goal-close]') && !goalSaving){goalTicket++;goalReading++;q('[data-coding-goal-dialog]').close();}
      if(target.matches('[data-coding-goal-none]') && !goalSaving){goalReading++;goalChoice=null;renderGoalPreview();q('[data-coding-goal-list]').querySelectorAll('[data-coding-goal-id]').forEach(node=>{node.classList.remove('is-selected');node.setAttribute('aria-pressed','false');});q('[data-coding-goal-save]').disabled=false;q('[data-coding-goal-error]').textContent='';}
      if(target.matches('[data-coding-goal-more]')){target.disabled=true;try{await loadGoals(goalTicket);}finally{target.disabled=false;}}
      if(target.matches('[data-coding-goal-id]') && !goalSaving){
        const ticket=goalTicket,reading=++goalReading;q('[data-coding-goal-save]').disabled=true;q('[data-coding-goal-error]').textContent='';
        try{const value=await api('/goals/'+encodeURIComponent(target.dataset.codingGoalId));if(ticket!==goalTicket || reading!==goalReading)return;goalChoice=value;renderGoalPreview();q('[data-coding-goal-list]').querySelectorAll('[data-coding-goal-id]').forEach(node=>{const on=node.dataset.codingGoalId===target.dataset.codingGoalId;node.classList.toggle('is-selected', on);node.setAttribute('aria-pressed', String(on));});q('[data-coding-goal-save]').disabled=false;}
        catch(error){if(ticket===goalTicket && reading===goalReading)q('[data-coding-goal-error]').textContent=error.message;}
      }
      if(target.matches('[data-coding-report-output]') && reportRun && !target.disabled) {
        const id=current,runId=reportRun,ticket=reportTicket;
        if(!reportOutput) {await loadReportOutput(id,runId,ticket);return;}
        target.disabled=true;
        try {await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(runId)+'/report/output','POST',{expected_reference:reportOutput.current});await loadReportOutput(id,runId,ticket);}
        catch(error) {if(ticket===reportTicket && id===current){await loadReportOutput(id,runId,ticket);if(ticket===reportTicket)q('[data-coding-report-output-status]').textContent=error.message+'；已重新读取当前输出，请核对后再选择。';}}
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
      if(target.matches('[data-coding-delegate-open]')) await cooperationUi.openDialog();
      if(target.matches('[data-coding-material-close]')) {materialTicket++;q('[data-coding-material-dialog]').close();input.focus();}
      if(target.matches('[data-coding-method-open]')) openMethods();
      if(target.matches('[data-coding-method-close]')) {methodDocumentTicket++;q('[data-coding-method-dialog]').close();input.focus();}
      if(target.matches('[data-coding-search-toggle]')){const query=directory.querySelector('[data-coding-query]');query.hidden=!query.hidden;target.setAttribute('aria-expanded',String(!query.hidden));if(!query.hidden)directory.querySelector('[data-coding-search]').focus();}
      if(target.matches('[data-coding-context-toggle]')){const context=q('[data-coding-context]');context.hidden=!context.hidden;target.setAttribute('aria-expanded',String(!context.hidden));}
      if(target.matches('[data-coding-workspace-open]')) { q('[data-coding-workspace-dialog]').showModal(); }
      if(target.matches('[data-coding-workspace-close]')) q('[data-coding-workspace-dialog]').close();
      if(target.matches('[data-coding-results-open]')) {root.dataset.codingResults=root.dataset.codingResults==='true'?'false':'true';if(root.dataset.codingResults==='true'){q('[data-coding-results-close]').focus({preventScroll:true});void readCurrent();}}
      if(target.matches('[data-coding-results-close]')) {root.dataset.codingResults='false';q('[data-coding-results-open]').focus({preventScroll:true});}
      if(target.matches('[data-coding-directory-back]')) {root.dataset.codingDetail='false';(directory.querySelector('[aria-current=true]') || directory.querySelector('[data-coding-new]'))?.focus({preventScroll:true});}
      if(target.matches('[data-coding-prompt]') && !input.value.trim() && !input.disabled){const intent=q('[data-coding-intent]'),wanted=[...intent.options].find(option=>option.value===target.dataset.codingPromptIntent && !option.disabled);if(wanted){intent.value=wanted.value;intent.dispatchEvent(new Event('change',{bubbles:true}));}input.value=target.dataset.codingPrompt;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();input.setSelectionRange(input.value.length,input.value.length);}
      if(target.matches('[data-coding-new]')) { event.preventDefault(); target.disabled=true; try { await create(); } finally { target.disabled=false; } }
      if(target.matches('[data-coding-session]')) { event.preventDefault(); const session=state.sessions.find(item=>item.session_id===target.dataset.codingSession);host.openItem('coding',session.session_id,session.title);await select(session.session_id); }
      if(target.matches('[data-coding-filter]')) { directory.querySelectorAll('[data-coding-filter]').forEach(item=>{item.setAttribute('aria-pressed',String(item===target));}); renderDirectory(); }
      if(target.matches('[data-coding-face]')) {
        const face=target.dataset.codingFace;
        if(face==='taskboard' || face==='artifacts' || host.onDirectoryFace?.(face) || face==='sessions') {
          if(face==='artifacts'||face==='taskboard')host.onDirectoryFace?.('sessions');
          directory.dataset.codingCurrentFace=face;
          directory.querySelector('[data-coding-artifact-directory]').hidden=face!=='artifacts';
          directory.querySelector('[data-coding-taskboard]').hidden=face!=='taskboard';
          directory.querySelectorAll('[data-coding-face]').forEach(button=>{button.setAttribute('aria-pressed',String(button===target));});
          directory.querySelector('.mw-dir__label').textContent=face==='taskboard'?'TaskBoard':face==='artifacts'?'产物':face==='files'?'文件':'会话';
          if(face==='taskboard'){taskboard.sessions(state.sessions);taskboard.show();if(current)await readCurrent();}
          if(face==='artifacts')await loadArtifacts();
        } else if(face==='goals') await openGoals();
        else status('这个导航面尚未装配，现阶段可使用会话、目标关联和文件入口。');
      }
      if(target.matches('[data-coding-latest]')) { pinned=true;turns.scrollTop=turns.scrollHeight;target.hidden=true; }
      if(target.matches('[data-coding-continue]')) { target.disabled=true; await continueRound(target.dataset.codingContinue); target.disabled=false; }
      if(target.matches('[data-coding-recover-continue]')) { target.disabled=true; await recoverAndContinue(target.dataset.codingRecoverContinue); target.disabled=false; }
      if(target.matches('[data-coding-pause]') && lastRun) {
        const action=target.dataset.action==='resume'?'resume':'pause';target.disabled=true;
        try { await api('/sessions/'+encodeURIComponent(current)+'/control','POST',{run_id:lastRun.ref.run_id,kind:action});status(action==='pause'?'暂停请求已收到：当前这一步做完后停下，已开始的操作不会中断。':'已恢复，这一轮从暂停处接着执行。');await readCurrent(); }
        catch(error) { status(error.message,true); } finally { controls(); }
      }
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
  root.addEventListener('click',click);
  directory.querySelector('[data-coding-search]').addEventListener('input',renderDirectory);
  let readerIntentAt=-Infinity;const readerIntent=()=>{readerIntentAt=performance.now();};
  for(const type of ['wheel','touchstart','touchmove','pointerdown','keydown'])turns.addEventListener(type,readerIntent,{passive:true});
  turns.addEventListener('scroll',()=>{if(reportRun)return;pinned=onReaderScrolled(position(),{pinned,by_reader:performance.now()-readerIntentAt<READER_INTENT_MS});q('[data-coding-latest]').hidden=pinned;},{passive:true});
  // Late growth (a review card loading, a group opening) keeps a following reader at the newest line.
  let followFrame=0;new MutationObserver(()=>{if(!pinned || reportRun || followFrame)return;followFrame=requestAnimationFrame(()=>{followFrame=0;if(pinned && !reportRun)turns.scrollTop=turns.scrollHeight;});}).observe(turns,{childList:true,subtree:true,characterData:true});
  // Browsers without field-sizing still grow the field as the person writes.
  if(!globalThis.CSS?.supports?.('field-sizing','content'))input.addEventListener('input',()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,Math.min(innerHeight*0.4,320))+'px';});
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
  directory.querySelector('[data-coding-artifact-search]').addEventListener('input',renderArtifacts);
  // The same commands in the composer's slash menu, the palette and the shortcuts; each says when it is not available.
  const SESSION_STATE={idle:'尚未执行',running:'执行中',paused:'已暂停','waiting-answer':'等你回答','waiting-approval':'等你审查',failed:'失败待处理',stopped:'已停止',cancelled:'已取消','reconcile-required':'待核对结果',done:'本轮结束'};
  const codingCommands=()=>{
    const intents=[...q('[data-coding-intent]').options].map(option=>({slash:option.value,label:'方式：'+option.textContent.replace(/（.*）/,''),hint:'下一轮用这个方式',keywords:['方式','intent'],enabled:!option.disabled && Boolean(current),
      run:()=>{const select=q('[data-coding-intent]');select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));status('下一轮方式：'+option.textContent+'。');input.focus();}}));
    return [...intents,
      {slash:'compact',label:'下一轮整理上下文',hint:'把前面的对话整理成摘要带入',keywords:['摘要','整理','context'],enabled:Boolean(current && runtimeSessionId),
        run:async()=>{const id=current;await api('/sessions/'+encodeURIComponent(id)+'/compact','POST',{on:true});status('下一轮会把前面的对话整理成摘要带入。');if(id===current)await readCurrent();}},
      {slash:'usage',label:'上下文与用量',hint:'窗口占比、会话用量、预算',keywords:['cost','费用','预算','context'],enabled:!q('[data-coding-meter]').hidden,run:()=>q('[data-coding-meter-toggle]').click()},
      {slash:'materials',label:'固定材料',hint:'引用文件、差异或其他会话的成果',keywords:['引用','材料','reference'],enabled:Boolean(current) && !sending,run:()=>openMaterials()},
      {slash:'methods',label:'方法',hint:'选择这一轮使用的方法',keywords:['skill','技能'],enabled:Boolean(current) && !sending,run:()=>openMethods()},
      {slash:'delegate',label:'委派给新会话',hint:'新会话接受并发送后才执行',keywords:['委派','delegate'],enabled:Boolean(current),run:()=>cooperationUi.openDialog()},
      {slash:'model',label:'选择模型',hint:'下一轮使用的模型',keywords:['model'],enabled:Boolean(current),run:()=>{const select=q('[data-coding-model]'),trigger=select.closest('.mw-select-picker')?.querySelector('.mw-select-picker__trigger');if(trigger){trigger.focus();trigger.click();}else select.focus();}},
      {slash:'workspace',label:'选择工作区',hint:'下一轮在哪个目录工作',keywords:['目录','folder'],enabled:Boolean(current),run:()=>q('[data-coding-workspace-dialog]').showModal()},
      {slash:'new',label:'新建会话',keys:'Mod+Alt+N',keywords:['new','会话'],run:()=>q('[data-coding-new]').click()},
      {slash:'stop',label:'停止这一轮',hint:'已开始的操作不会被撤销',keys:'',keywords:['stop','停止'],enabled:!q('[data-coding-stop]').hidden && !q('[data-coding-stop]').disabled,run:()=>q('[data-coding-stop]').click()},
      {slash:'results',label:'结果与审查',keys:'Mod+Alt+R',keywords:['review','审查','结果'],run:()=>q('[data-coding-results-open]').click()},
      {slash:'palette',label:'命令面板',keys:'Mod+Shift+P',keywords:['command','命令'],run:()=>commandsUi.openPalette()},
    ];
  };
  const commandsUi=(${CODING_COMMANDS_CLIENT_FACTORY_SCRIPT})({q,input,status,commands:codingCommands,current:()=>current,
    workspace:()=>workspaceId,files:(key)=>api('/sessions/'+encodeURIComponent(current)+'/files?workspace_id='+encodeURIComponent(key)),
    sessions:()=>state.sessions.map(session=>({...session,state_label:SESSION_STATE[session.state] || ''})),
    openSession:(id,title)=>{host.openItem('coding',id,title || '');return select(id);}});
  // Esc in the composer stops a live round, as in terminal agents — never mid-IME, never while the + menu is open.
  input.addEventListener('keydown',event=>{if(event.key!=='Escape' || event.isComposing || event.keyCode===229 || !attachMenu.hidden)return;const stop=q('[data-coding-stop]');if(stop.hidden || stop.disabled)return;event.preventDefault();stop.click();});
  input.addEventListener('input',()=>turns.querySelectorAll('[data-coding-prompt]').forEach(button=>{button.disabled=Boolean(input.value.trim());}));
  input.addEventListener('keydown' ,event=>{if(event.key==='Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing){event.preventDefault();q('[data-coding-composer]').requestSubmit();}});
  // One way to start a round, shared by the composer and by continuing from a breakpoint.
  const startRound = async (id,task,intent,modelValue,selection,extra={}) => {
    const [provider_id,model_id]=JSON.parse(modelValue);
    await api('/sessions/'+encodeURIComponent(id)+'/runs','POST',{...extra,task,intent,provider_id,model_id,workspace_id:selection.workspace_id,methods:selection.methods,mcp_tools:selection.mcp_tools,mcp_sources:selection.mcp_sources,materials:selection.materials,character:selection.character,character_skill_ids:characterSkills.get(id),...(intent==='parallel'?{writer_assignments:selection.writer_assignments}:{})});
  };
  const currentSelection = (id) => ({workspace_id:workspaceId,methods:structuredClone(methodSelections.get(id) || []),mcp_tools:structuredClone(mcpSelections.get(id) || []),mcp_sources:structuredClone(mcpSourceSelections.get(id) || []),materials:structuredClone(materialSelections.get(id) || []),character:structuredClone(characterSelections.get(id) ?? null),writer_assignments:[]});
  // Continue an unfinished round: the Host states what already happened, the composer draft stays untouched.
  const continueRound = async (runId) => {
    if(sending || !current)return;
    const id=current,modelValue=q('[data-coding-model]').value;sending=true;controls();
    try {
      if(!state.models.some(model=>JSON.stringify([model.provider_id,model.model_id])===modelValue))throw new Error('请先选择可用的模型');
      const next=await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(runId)+'/continuation');
      if(current!==id)return;
      // A plan round continues on its own graph; everything else starts a fresh round with the Host's facts.
      await startRound(id,next.task,next.intent,modelValue,currentSelection(id),next.continue_step_board_of?{plan_revision:next.plan_revision,continue_step_board_of:next.continue_step_board_of}:{});
      status('已从断点继续：宿主核实的已发生操作已附在这一轮任务里，新的写入和命令仍需你审查。');
      pinned=true;await refreshState();await readCurrent();
    } catch(error) {if(current===id)status(error.message,true);}
    finally {sending=false;controls();}
  };
  // An interrupted round is checked first; only a round whose outcomes are all known is closed and continued.
  const recoverAndContinue = async (runId) => {
    if(sending || !current)return;
    const id=current;
    try {
      const report=await api('/sessions/'+encodeURIComponent(id)+'/recovery');
      const entry=report.runs.find(run=>run.run_id===runId);
      if(!entry || !entry.can_close || report.blockers.length) {
        root.dataset.codingResults='true';recoveryKey='';void readRecovery();
        status((report.blockers.length?report.blockers.join('；'):entry?.blockers?.join('；') || '这一轮还有结果未知的操作')+'。请在右侧核对后再继续。',true);return;
      }
      await api('/sessions/'+encodeURIComponent(id)+'/runs/'+encodeURIComponent(runId)+'/recover','POST',{expected_version:entry.version});
      if(current!==id)return;
      await continueRound(runId);
    } catch(error) {if(current===id)status(error.message,true);}
  };
  q('[data-coding-composer]').addEventListener('submit',async(event)=>{
    event.preventDefault();if(sending || recovery || checkpointBusy || !current || !input.value.trim()) return;
    const id=current,task=input.value,character=structuredClone(characterSelections.get(current) ?? null),materials=structuredClone(materialSelections.get(current) || []),mcp_sources=structuredClone(mcpSourceSelections.get(current) || []),mcp_tools=structuredClone(mcpSelections.get(current) || []),methods=structuredClone(methodSelections.get(current) || []),activeRun=lastRun,modelValue=q('[data-coding-model]').value,intent=q('[data-coding-intent]').value,workspace_id=workspaceId,writer_assignments=structuredClone(configurations.get(id)?.writer_assignments || []); sending=true;controls();
    try {
      rememberConfiguration();await flushDraft();
      if(activeRun && !terminal(activeRun.phase)) {
        await api('/sessions/'+encodeURIComponent(id)+'/control','POST',{kind:'steer',run_id:activeRun.ref.run_id,text:task});
        status('补充要求已交给执行引擎，等待后续处理。');
      } else await startRound(id,task,intent,modelValue,{workspace_id,methods,mcp_tools,mcp_sources,materials,character,writer_assignments});
      if(current===id && input.value===task) input.value='';
      if(localDraft(id)===task) await saveDraft(id,''); await refreshState();await readCurrent();
    } catch(error) { status(error.message,true); }
    finally { sending=false;controls(); }
  });
  void refreshState().catch(error=>status(error.message,true));
  let pollingTicks=0;
  const poll=setInterval(()=>{if(!root.isConnected){clearInterval(poll);return;}void writerDirectories.refresh();void integrations.refreshReviews();if(++pollingTicks%5===0) void refreshState().catch(error=>status(error.message,true));},1000);
  // The conversation refreshes as fast as the work moves: near-continuous while the model is producing,
  // slower while it waits on the person or rests, slowest in a background tab. readCurrent never overlaps itself.
  const conversationDelay=()=>document.hidden ? 5000 : !lastRun ? 2500 : ['starting','running','compacting','pausing'].includes(lastRun.phase) ? (liveRun ? 1200 : 350) : terminal(lastRun.phase) ? 2500 : 1000;
  const followConversation=async()=>{if(!root.isConnected)return;if(current)await readCurrent().catch(()=>{});setTimeout(followConversation,conversationDelay());};
  setTimeout(followConversation,conversationDelay());
}`;
