import { CODING_WRITER_INTEGRATION_CLIENT_FACTORY_SCRIPT } from "./writer-integration-client.js";
import { CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT } from "./taskboard-client.js";
import { CODING_STEPS_CLIENT_FACTORY_SCRIPT } from "./steps-client.js";
import { CODING_CHARACTERS_CLIENT_FACTORY_SCRIPT } from "./characters-client.js";
import { CODING_ACTIONS_CLIENT } from "./actions-client.js";
import { CODING_SUBAGENTS_CLIENT_FACTORY_SCRIPT } from "./subagents-client.js";
import { CODING_PLANS_CLIENT_FACTORY_SCRIPT } from "./plans-client.js";
import { CODING_WRITER_DIRECTORIES_CLIENT_FACTORY_SCRIPT } from "./writers-client.js";
import { codingGoalVersionLabel } from "./goal-versions.js";
import { CODING_CHANGESET_CLIENT_FACTORY_SCRIPT } from "./changeset-client.js";
import { codingUsageSummary } from "./usage.js";
import { CONTINUATION_MARKER, HISTORY_DIGEST_MARKER, HISTORY_DIGEST_TASK_HEAD, MENTIONS_MARKER, digestTask } from "./continuation.js";
import { MODEL_DIGEST_HEAD } from "./history-digest.js";
import { SESSION_PAGE, SESSION_WINDOW } from "./session-window.js";
import { CODING_USAGE_METER_CLIENT_FACTORY_SCRIPT } from "./usage-meter-client.js";
import { CODING_COMPOSER_MODEL_CLIENT_FACTORY_SCRIPT } from "./composer-model-client.js";
import { CODING_COOPERATION_CLIENT_FACTORY_SCRIPT } from "./cooperation-client.js";
import { codeLanguage, codeTokens, diffRowTokens, growCodeTokens } from "@molis-ai/molis-work-plugin-sdk/highlight";
import { CODING_COMMANDS_CLIENT_FACTORY_SCRIPT } from "./commands-client.js";
import { CODING_PLAN_PROGRESS_CLIENT_FACTORY_SCRIPT } from "./plan-progress-client.js";
import { CODING_SUBAGENT_CARDS_CLIENT_FACTORY_SCRIPT } from "./subagent-cards-client.js";
import { createCodingTimeline } from "./timeline.js";
import { codingTimelineWords } from "./timeline-words.js";
import { createCodingTurnChanges } from "./turn-changes-client.js";
import { createCodingCodePaint } from "./code-paint-client.js";
import { CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT } from "./input-receipts-client.js";
import { CODING_DRAFT_CLIENT_FACTORY_SCRIPT } from "./draft-client.js";
import { codingQuestionAnswered } from "./question-answered-client.js";
import { CODING_SESSION_MARKS } from "./session-marks.js";

/** Host supplies navigation; this client only handles Coding's own surface. */
export const CODING_CLIENT_FACTORY_SCRIPT = `(host) => {
  const root = document.querySelector('[data-coding-workbench]'), L = host.translate;
  const directory = root?.querySelector('[data-coding-directory]');
  if (!root || !directory) return;
  const lifetime=host.mountPluginClient(root);if(!lifetime)return;
  let viewSignal;
  const showReviews=(container,refs,sessionId,workspaceId,scope)=>host.showReviews?.(container,refs,sessionId,workspaceId,scope,{lifetime,signal:viewSignal});
  const make = tag => document.createElement(tag); const q = (selector) => root.querySelector(selector); const phaseRing = phase => ({starting:'starting',running:'running',compacting:'running',pausing:'paused',paused:'paused','awaiting-input':'answer','awaiting-review':'approval',completed:'round-ended',failed:'failed',stopped:'stopped',cancelled:'cancelled','reconcile-required':'verify'})[phase] || 'idle';
  const turns = q('[data-coding-turns]'), input = q('[data-coding-task]'), toInput=node=>(node||input).focus({preventScroll:true});
  // The results panel's index: one chip per section on show, to jump to it. It is rebuilt only when the set of
  // sections changes, so its own writes never loop back through the observer that schedules it.
  const SECTION_SHORT={[L('coding.results.cooperation')]:L('coding.short.cooperation'),[L('coding.checkpoints.title')]:L('coding.short.checkpoints'),[L('coding.results.recovery')]:L('coding.short.recovery'),[L('coding.results.facts')]:L('coding.short.facts'),[L('coding.outcomes.title')]:L('coding.short.outcomes'),[L('coding.change.title')]:L('coding.short.change'),[L('coding.commands.title')]:L('coding.short.commands'),[L('coding.results.background')]:L('coding.short.background')};
  let indexed=[],indexSignature='',indexTimer=0;
  const sectionLabel=(section)=>{const own=section.getAttribute('aria-label');if(own)return own;const by=section.getAttribute('aria-labelledby'),named=by?document.getElementById(by):null;
    return (named||section.querySelector(':scope > h3, :scope > header h3, :scope > details > summary'))?.textContent?.trim()||'';};
  const resultsIndex=()=>{
    const nav=q('[data-coding-results-index]'),tools=q('[data-coding-tools]');if(!nav||!tools)return;
    const sections=root.dataset.codingResults==='true'&&tools.dataset.companionOpen!=='true'
      ?[...tools.children].filter(node=>node!==nav&&!node.classList.contains('coding-tool-tabs')&&!node.hidden&&sectionLabel(node)&&getComputedStyle(node).display!=='none'):[];
    const signature=sections.map(sectionLabel).join('|');if(signature===indexSignature)return;indexSignature=signature;indexed=sections;
    nav.replaceChildren();
    sections.forEach((section,at)=>{const chip=make('button');chip.type='button';chip.className='mw-btn mw-btn--ghost';const text=sectionLabel(section);chip.textContent=SECTION_SHORT[text]||text;chip.title=L('coding.results.jump',{section:text});chip.dataset.codingResultsJump=String(at);nav.append(chip);});
    nav.hidden=sections.length<2;
  };
  const scheduleResultsIndex=()=>{lifetime.clearTimeout(indexTimer);indexTimer=lifetime.timeout(resultsIndex,80);};
  lifetime.listen(q('[data-coding-results-index]'),'click',event=>{const chip=event.target.closest('[data-coding-results-jump]'),tools=q('[data-coding-tools]'),section=chip&&indexed[Number(chip.dataset.codingResultsJump)];if(!section)return;
    tools.scrollTo({top:section.getBoundingClientRect().top-tools.getBoundingClientRect().top+tools.scrollTop-8,behavior:'smooth'});section.tabIndex=-1;section.focus({preventScroll:true});});
  lifetime.observe(new MutationObserver(scheduleResultsIndex),q('[data-coding-tools]'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','data-companion-open']});
  const resultVisibility=()=>{q('[data-coding-results-open]').setAttribute('aria-expanded',String(root.dataset.codingResults==='true'));scheduleResultsIndex();};
  lifetime.observe(new MutationObserver(resultVisibility),root,{attributes:true,attributeFilter:['data-coding-results']});resultVisibility();
  const prefix = root.dataset.codingPrefix + '/api/plugins/io.molis.work.coding';
  const CONTINUATION_MARKER = ${JSON.stringify(CONTINUATION_MARKER)};
  const SESSION_WINDOW = ${SESSION_WINDOW}, SESSION_PAGE = ${SESSION_PAGE};
  const HISTORY_DIGEST_MARKER = ${JSON.stringify(HISTORY_DIGEST_MARKER)}, HISTORY_DIGEST_TASK_HEAD = ${JSON.stringify(HISTORY_DIGEST_TASK_HEAD)}, MODEL_DIGEST_HEAD = ${JSON.stringify(MODEL_DIGEST_HEAD)}, MENTIONS_MARKER = ${JSON.stringify(MENTIONS_MARKER)};
  const digestTask = ${digestTask.toString()};
  const ownTask = (text) => { const own = digestTask(text), at = own.indexOf(MENTIONS_MARKER); return at < 0 ? own : own.slice(0, at); };
  const codingGoalVersionLabel = ${codingGoalVersionLabel.toString()};
  const codingUsageSummary = ${codingUsageSummary.toString()};
  const timeline = (${createCodingTimeline.toString()})((${codingTimelineWords.toString()})(L)), turnChanges = (${createCodingTurnChanges.toString()})(L);
  lifetime.poll(()=>timeline.tick(turns),1000);
  // The conversation's scroll has the page's one owner (design system molisFollow, VUX-26): only the reader stops the follow,
  // only the reader's return or a word from here (back to latest, a fresh session, a restored place) starts it again.
  const follow = window.molisFollow(turns, { onChange: (now) => { q('[data-coding-latest]').hidden = Boolean(reportRun) || now === 'following'; } });
  lifetime.own(()=>follow.dispose());
  const following = () => follow.state === 'following';
  // The project has one current directory: where new rounds run and what Files and Git show. Choosing it here sets it
  // for the whole project (the same setting as in project settings), then the embedded Files and Git views re-read it.
  const useProjectWorkspace = async (id) => {
    try{await host.selectWorkspace(id);}catch(error){throw new Error(L('coding.workspace.switch-failed-why',{reason:error.message}));}
    lifetime.assertCurrent();
    root.querySelectorAll('[data-git-refresh],[data-files-refresh]').forEach(button=>button.click());
  };
  // Opening a session, or pointing it at another directory, makes that directory the project's current one, so Files
  // and Git always show where the open session's next round runs. A directory that is no longer authorized is left alone.
  const followWorkspace = async () => {
    const target=state.workspaces?.find(item=>item.workspace_id===workspaceId && item.realpath_verified);
    if(!target || target.workspace_id===state.workspace?.workspace_id) return;
    try{await useProjectWorkspace(target.workspace_id);state.workspace=target;}
    catch(error){status(L('coding.workspace.files-git-unchanged',{reason:error.message}),true);}
  };
  const renderedText = new WeakMap();
  const directoryRows = new Map(), directoryGroups = new Map();
  let directoryClaimed = false, stateLoaded = false;
  const offsets = new Map();
  const materialSelections = new Map(), characterSelections = new Map(), characterSkills = new Map(), characterTitles = new Map();
  const questionDrafts = new Map(), methodSelections = new Map(), configurations = new Map(), adoptedConfigurations = new Map(), mcpSelections = new Map(), mcpSourceSelections = new Map();
  const actionSelections = new Map();
  let mcpChoices = [], mcpSourceChoices = [];
  let methodChoices = [], methodDocumentTicket = 0;
  const answeredQuestions = new Set();
  const draftKey = (id) => 'molis-coding-draft:' + root.dataset.codingPrefix + ':' + id;
  const terminal = (phase) => ['completed','failed','stopped','cancelled','reconcile-required'].includes(phase);
  const phases = { starting:L('coding.phase.starting'), running:L('coding.state.running'), compacting:L('coding.phase.compacting'), pausing:L('coding.phase.pausing'), paused:L('coding.state.paused'), 'awaiting-input':L('coding.phase.awaiting-input'), 'awaiting-review':L('coding.phase.awaiting-review'), completed:L('coding.state.done'), failed:L('coding.phase.failed'), stopped:L('coding.phase.stopped'), cancelled:L('coding.state.cancelled'), 'reconcile-required':L('coding.phase.reconcile-required') };
  let runtimeSessionId = null, queuedInputs;
  let state = { sessions:[], models:[], runtimes:[] }, current = '', workspaceId = '', lastRun = null, generation = 0, sending = false, loading = false, recovery = false, checkpointBusy = false, checkpointLoading = false, checkpointKey = "", selectionTask, statusKey = '', creating = false;
  let recoveryLoading = false, recoveryBusy = false, recoveryKey = '';
  let reportOutput=null, artifactRows=[], artifactTicket=0;
  let reportRun = '', reportTicket = 0, reportSaving = false, reportTrigger, dialogueOffset = 0;
  let progressView=null,progressTicket=0,progressSaving=false,reportItem='',changeItem='',itemTicket=0;
  let goalRows=[],goalCursor=null,goalChoice=null,goalTicket=0,goalReading=0,goalSaving=false;
  /** The header names the folder; the full path stays one hover away. */
  const showWorkspace=(path,fallback)=>{const label=q('[data-coding-workspace-label]'),name=path?path.split('/').filter(Boolean).at(-1):fallback;label.innerHTML=(path?'<svg aria-hidden="true"><use href="#icon-folder"></use></svg>':'')+'<span></span>';label.lastChild.textContent=name;label.title=path||'';label.dataset.empty=String(!path);root.dataset.codingWorkspaceName=path?name:'';turns.querySelectorAll('[data-coding-welcome-workspace]').forEach(node=>{node.textContent=path?name:L('coding.welcome.workspace');node.parentElement.title=path||'';});};
  const SESSION_MARKS=${JSON.stringify(Object.fromEntries(Object.entries(CODING_SESSION_MARKS).map(([state, mark]) => [state, [mark.label, mark.ring]])))},SESSION_STATE=Object.fromEntries(Object.entries(SESSION_MARKS).map(([state,[label]])=>[state,L(label)])),status=(message,error=false)=>{if(!lifetime.alive)return;const node=q('[data-coding-status]');node.textContent=message;node.dataset.error=String(error);},sessionPath=(id,run)=>'/sessions/'+encodeURIComponent(id)+(run===undefined?'':'/runs/'+encodeURIComponent(run));
  const api = async (path, method = 'GET', body, requestSignal) => {
    const signal=requestSignal || (method==='GET' && lifetime.visible && !viewSignal?.aborted ? viewSignal : undefined);
    const response = await lifetime.fetch(prefix + path, { method, cache:'no-store', signal,
      ...(method === 'GET' ? {} : { headers:molisWorkControlHeaders(), body:JSON.stringify(body ?? {}) }) });
    const result = await response.json();lifetime.assertCurrent(signal);
    if (!response.ok) throw Object.assign(new Error((method === 'GET' && host.readRefusal?.(response.status, result.code)) || result.error || L('coding.error.request')),{code:result.code,details:result.details,status:response.status});
    return result;
  },ports={lifetime,translate:L,q,api,current:()=>current,status,refresh:()=>readCurrent()};
  const ROLE_NAMES=Object.fromEntries(Object.entries({planner:'规划者',reader:'阅读者',reviewer:'评审者',coordinator:'协作',writers:'并行写入',builder:'构建者',writer:'改写者','coding-reader':'代码调查','coding-reviewer':'独立评审','coding-builder':'独立实现'}).map(([role,name])=>[role,L(name)]));
  const draft=(${CODING_DRAFT_CLIENT_FACTORY_SCRIPT})({...ports,input,key:draftKey,choices:{action_tools:actionSelections,character:characterSelections,character_skill_ids:characterSkills,
    configuration:configurations,materials:materialSelections,mcp_sources:mcpSourceSelections,mcp_tools:mcpSelections,methods:methodSelections,question_drafts:questionDrafts}});
  // The composer and what sets the next round (each a button by the box opening a dialog of that name) are shut while a
  // session is made, until its first read, and while sending.
  const unread=()=>creating || !draft.owns(current),shut=()=>sending || unread(),choosers=['workspace','goal','writer-directories','material','method','mcp','actions','character','delegate'];
  const integrations = (${CODING_WRITER_INTEGRATION_CLIENT_FACTORY_SCRIPT})({lifetime,q,api,host,status});
  const stepReports = (${CODING_STEPS_CLIENT_FACTORY_SCRIPT})({...ports,prepareRework:reason=>plans.prepareStepRework(reason),receipts:host.receipts});
  let planEntries=[],subagentGroups=[];
  // A long session is read as a window: the latest rounds in full, earlier ones as summaries until scrolled back to.
  let lastData=null;
  let earlierRuns=[],earlierFingerprint='',olderViews=new Map(),olderPlanEntries=[],olderSubagents=[],windowRuns=[],allRuns=[],pageLoading=false;
  const resetWindow=()=>{earlierRuns=[];earlierFingerprint='';olderViews=new Map();olderPlanEntries=[];olderSubagents=[];windowRuns=[];allRuns=[];pageLoading=false;};
  const subagentCards = (${CODING_SUBAGENT_CARDS_CLIENT_FACTORY_SCRIPT})({...ports,timeline,roleName:id=>ROLE_NAMES[id]||id||'Agent',
    showReviews:(container,refs,sid)=>showReviews(container,refs,sid),sessionId:()=>runtimeSessionId,
    parentLive:(run)=>!terminal(run.phase),prefill:(text)=>{const next=input.value.trim()?input.value+'\\n\\n'+text:text;input.value=next;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();},
    openInPanel:(childId)=>{root.dataset.codingResults='true';const row=q('[data-coding-subagents] details[data-child="'+CSS.escape(childId)+'"]');if(row){row.open=true;row.scrollIntoView({block:'center'});row.querySelector('textarea')?.focus({preventScroll:true});}}});
  const usageMeter = (${CODING_USAGE_METER_CLIENT_FACTORY_SCRIPT})(ports), composerModels = (${CODING_COMPOSER_MODEL_CLIENT_FACTORY_SCRIPT})({q,lifetime,status,switchModel:(run,model)=>api(sessionPath(current)+'/control','POST',{kind:'switch-model',run_id:run.ref.run_id,...model}).then(()=>readCurrent())});
  const cooperationUi = (${CODING_COOPERATION_CLIENT_FACTORY_SCRIPT})({...ports,roleName:id=>ROLE_NAMES[id]||id||'Agent',
    openSession:(id,title)=>{host.openItem('coding',id,title || '');return select(id);},refreshSessions:()=>refreshState(),
    openArtifact:(reference,title)=>host.openItem('coding',reference.artifact_id,title || reference.artifact_id),
    rounds:()=>allRuns.map((run,index)=>({run_id:run.ref.run_id,number:index+1,phase:run.phase})),
    prefill:(text)=>{if(input.value.trim()!==text.trim()){input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));}input.focus();},
    // The Host attached a taken delivery to the session's materials; the page's selection follows, or the next send would drop it.
    materialsChanged:async()=>{const id=current;const data=await api('/sessions/'+encodeURIComponent(id)+'?window=1');if(id===current){materialSelections.set(id,data.materials || []);controls();}}});
  const inputReceipts = (${CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT})({api,refresh:()=>readCurrent(),q,receipts:host.receipts,landed:(sent,said)=>{if(current===sent.id&&input.value===sent.text){input.value='';window.molisFit?.(input);if(draft.local(sent.id)===sent.text)void draft.save(sent.id,'');}status(said);}});
  // The board shows every round of the session: the loaded window as it is, earlier rounds from one read of the whole
  // session's plans and subagents, fetched again only when the number of rounds changes.
  let boardAll={key:'',id:'',value:null};
  const boardUpdate=(id,data)=>{
    const merged=()=>{
      const all=boardAll.id===id?boardAll.value:null;if(!all)return {...data,runs:allRuns};
      // The window read just now is the freshest for its own rounds; every other round comes from the whole-session read.
      const held=new Set((data.runs||[]).map(run=>run.ref.run_id));
      return {...data,runs:all.runs.map(run=>allRuns.find(own=>own.ref.run_id===run.ref.run_id&&!own.light)||run),
        taskboard_plans:[...all.taskboard_plans.filter(entry=>!held.has(entry.run_id)),...(data.taskboard_plans||[])],
        subagents:[...all.subagents.filter(group=>!held.has(group.run_id)),...(data.subagents||[])]};
    };
    taskboard.update(id,merged());
    const key=id+':'+(data.run_count??allRuns.length);
    if((root.dataset.codingBoardOpen==='true'||directory.dataset.codingCurrentFace==='taskboard')&&boardAll.key!==key){boardAll.key=key;
      void api(sessionPath(id)+'/taskboard').then(value=>{if(current!==id)return;boardAll={key,id,value};taskboard.update(id,merged());}).catch(()=>{boardAll.key='';});}
  };
  // The main area shows the conversation or the TaskBoard; the header's switch and the board's "回到对话" both set it.
  const showBoard=(open)=>{root.dataset.codingBoardOpen=String(open);
    root.querySelectorAll('[data-coding-view]').forEach(button=>{const on=(button.dataset.codingView==='board')===open;button.setAttribute('aria-pressed',String(on));button.classList.toggle('is-current',on);});
    if(open)taskboard.show();else taskboard.hide();};
  // A session is "on show" from the moment it is opened until its tab closes or it is archived. Going back to the
  // directory on a narrow screen does not end it: the faces there describe the session the person just left.
  let sessionOnShow=false;
  const onShow=()=>sessionOnShow&&Boolean(current);
  const taskboard = (${CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT})({lifetime,board:q('[data-coding-board]'),outline:directory.querySelector('[data-coding-board-outline]'),current:()=>current,onShow,status,ownTask,from:node=>inputReceipts.from(node,()=>showBoard(false)),roleName:id=>ROLE_NAMES[id]||id||'Agent',
    progress:text=>{const count=q('[data-coding-view-board-count]');count.textContent=text?' '+text:'';count.hidden=!text;},
    amend:async(runId,version,amendment,live=true)=>{
      const id=current;
      try{const result=await api(sessionPath(id,runId)+'/plan-amendments','POST',{amendment,expected_version:version});
        if(!live)status(result.board?.terminal?L('coding.board.saved-done'):L('coding.board.saved-continue'));
        else status(result.steered?L('coding.board.steered'):L('coding.board.steer-failed',{reason:result.steer_error||L('coding.common.unknown-reason')}),!result.steered);}
      catch(error){status(error.message,true);}
      // The board's copy of rounds outside the loaded window is kept by round count; a change to the graph renews it.
      boardAll.key='';
      if(id===current)await readCurrent();
    },
    navigate:async(id,target)=>{
    const record=state.sessions.find(item=>item.session_id===id);if(!record)throw new Error(L('coding.error.session-unreadable'));
    host.openItem('coding',id,record.title);await openCodingItem(id);if(current!==id)return;
    host.revealTask?.();
    if(target.kind==='session')return;
    if(target.kind==='step'){await stepReports.open(id,target.run_id,target.step_id);return;}
    if(target.kind==='fixed-plan'){await plans.openFixed(target.revision);return;}
    // Everything else lives in the conversation or the results panel: leave the board and show it there.
    showBoard(false);if(['plan','child','recovery','reviews'].includes(target.kind))root.dataset.codingResults='true';
    const node=target.kind==='plan'?q('[data-coding-plan]'):target.kind==='recovery'?q('[data-coding-recovery]'):target.kind==='reviews'?q('[data-coding-host-reviews]'):
      target.kind==='child'?[...q('[data-coding-subagents]').querySelectorAll('details[data-child]')].find(node=>node.dataset.child===target.child_id):[...turns.children].find(node=>node.dataset.run===target.run_id);
    if(!node || node.hidden)throw new Error(L('coding.error.content-unreadable'));
    if(target.kind==='child')node.open=true;
    if(turns.contains(node))follow.release();node.scrollIntoView({block:'nearest'});node.tabIndex=-1;node.focus({preventScroll:true});
  }});
  const planProgress = (${CODING_PLAN_PROGRESS_CLIENT_FACTORY_SCRIPT})({...ports,openStep:(runId,stepId)=>stepReports.open(current,runId,stepId),from:node=>inputReceipts.from(node),stepOf:taskboard.stepOf,skipped:taskboard.skipped,settled:taskboard.settled,word:state=>host.receipts.step(state)});
  const subagents = (${CODING_SUBAGENTS_CLIENT_FACTORY_SCRIPT})({...ports,roleName:id=>ROLE_NAMES[id]||id||'Agent',openIntegration:integrations.open,usageSummary:usage=>codingUsageSummary(usage,L),prepareRework:async(id,runId,child,notes)=>{
    if(current!==id)return;
    const instruction=L('coding.rework.instruction',{subagent:child.subagent_id,run:runId,path:child.workspace_path,task:child.task,notes});
    await draft.append(id,text=>text.trim()?text+'\\n\\n'+instruction:instruction,L('coding.rework.saved-not-added'));
  }});
  const writerDirectories = (${CODING_WRITER_DIRECTORIES_CLIENT_FACTORY_SCRIPT})({lifetime,q,api,host,current:()=>current,workspace:()=>workspaceId,workspaceLabel:()=>state.workspaces?.find(item=>item.workspace_id===workspaceId)?.canonical_path || workspaceId,status,assignments:()=>configurations.get(current)?.writer_assignments || [],saveAssignments:async(owner,parent,assignments)=>{
    if(owner!==current || parent!==workspaceId)throw new Error(L('coding.error.split-changed'));
    rememberConfiguration();const previous=configurations.get(current);configurations.set(current,{...previous,writer_assignments:assignments});
    try{await draft.flush();status(L('coding.worktrees.split-saved'));}catch(error){if(!lifetime.alive)return;configurations.set(owner,previous);throw error;}
  },select:async(owner,id)=>{
    if(owner!==current)throw new Error(L('coding.error.worktree-changed'));
    workspaceId=id;rememberConfiguration();await draft.flush();await refreshState();await followWorkspace();status(L('coding.worktrees.used-next'));
  }});
  const plans = (${CODING_PLANS_CLIENT_FACTORY_SCRIPT})({...ports,execute:async revision=>{
    if(sending || recovery || checkpointBusy || !current)throw new Error(L('coding.error.busy'));
    const id=current,[provider_id,model_id]=JSON.parse(q('[data-coding-model]').value),intent=q('[data-coding-intent]').value==='parallel'?'parallel':'execute';
    const request={plan_revision:revision,intent,provider_id,model_id,...composerModels.effort(),workspace_id:workspaceId,
      ...(intent==='parallel'?{writer_assignments:structuredClone(configurations.get(id)?.writer_assignments || [])}:{}),
      methods:structuredClone(methodSelections.get(id)||[]),materials:structuredClone(materialSelections.get(id)||[]),character:structuredClone(characterSelections.get(id)??null),character_skill_ids:characterSkills.get(id),
      action_tools:structuredClone(actionSelections.get(id)||[]),mcp_tools:structuredClone(mcpSelections.get(id)||[]),mcp_sources:structuredClone(mcpSourceSelections.get(id)||[])};
    sending=true;controls();
    try{
      await draft.flush();
      await api(sessionPath(id)+'/runs','POST',request);
      await refreshState();if(id===current)await readCurrent();
    }finally{sending=false;controls();}
  }});
  const renderGoalPreview = () => {
    const region=q('[data-coding-goal-preview]');region.replaceChildren();
    if(!goalChoice){region.textContent=L('coding.goal.none-next');return;}
    const goal=goalChoice.snapshot.goal,heading=make('h3'),body=make('p');
    heading.textContent=goal.title;body.textContent=goalChoice.snapshot.state.agreement.outcome || goal.outcome;region.append(heading,body);
    const versions=make('p');versions.textContent=codingGoalVersionLabel({agreement_version:goalChoice.snapshot.state.agreement.version},L);region.append(versions);
    const sections=[[L('coding.goal.why'),goal.why],[L('coding.goal.logic'),goal.business_logic],[L('coding.goal.scope'),goal.in_scope.join('\\n')],[L('coding.goal.out-of-scope'),goal.out_of_scope.join('\\n')],[L('coding.goal.constraints'),goal.constraints.join('\\n')],[L('coding.goal.inputs'),goal.required_inputs.join('\\n')],[L('coding.goal.outputs'),goal.promised_outputs.join('\\n')],[L('coding.goal.acceptance'),goal.acceptance_criteria.map(item=>L('coding.goal.criterion',{statement:item.statement,pass:item.pass_condition,method:item.decision_method})).join('\\n')]];
    for(const [title,value] of sections.filter(item=>item[1])){const label=make('strong'),content=make('p');label.textContent=title;content.textContent=value;content.style.whiteSpace='pre-wrap';region.append(label,content);}
    const requirements=goalChoice.snapshot.state.requirements;
    if(requirements.length){const label=make('strong'),list=make('ul');label.textContent=L('coding.goal.requirements');for(const item of requirements){const row=make('li');row.textContent=item.human_decision_required?L('coding.goal.needs-person',{statement:item.statement}):item.statement;list.append(row);}region.append(label,list);}
    const missing=sections.filter(item=>!item[1]).map(item=>item[0]);if(missing.length){const note=make('p');note.textContent=L('coding.goal.missing-fields',{fields:missing.join(L('coding.list.joiner'))});region.append(note);}
    const details=make('details'),summary=make('summary'),raw=make('pre');
    summary.textContent=L('coding.goal.fixed-context',{cursor:goalChoice.snapshot.state.goal_event_cursor});
    raw.textContent=goalChoice.material.text;details.append(summary,raw);region.append(details);
  };
  const renderGoalRows = () => {
    const list=q('[data-coding-goal-list]'),search=q('[data-coding-goal-search]').value.trim().toLowerCase();
    const selectedId=goalChoice?.snapshot?.goal?.goal_id || '';
    list.replaceChildren();
    for(const row of goalRows.filter(item=>item.title.toLowerCase().includes(search))){
      const button=make('button');
      button.type='button';
      button.className='mw-dir-row mw-dir-row--compact directory-list-row';
      button.dataset.codingGoalId=row.goal_id;
      button.title=row.title;
      const selected=row.goal_id===selectedId;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      const mark=make('span');
      mark.className='mw-dir-row__icon';
      mark.innerHTML='<svg aria-hidden="true"><use href="#icon-target"></use></svg>';
      const copy=make('span');
      copy.className='mw-dir-row__copy';
      const headline=make('span');
      headline.className='mw-dir-row__headline';
      const title=make('strong');
      title.textContent=row.title;
      headline.append(title);
      if(row.work_status==='completed' || row.work_status==='cancelled'){
        const status=make('span');
        status.className='mw-dir-row__status';
        status.textContent=row.work_status==='completed'?L('coding.goal.completed'):L('coding.state.cancelled');
        headline.append(status);
      }
      copy.append(headline);
      button.append(mark, copy);
      list.append(button);
    }
    if(!list.children.length)list.textContent=goalRows.length?L('coding.goal.no-match'):L('coding.goal.none-yet');
    q('[data-coding-goal-more]').hidden=!goalCursor;
  };
  const loadGoals = async (ticket) => {
    const data=await api('/goals'+(goalCursor?'?after_cursor='+encodeURIComponent(goalCursor):''));
    if(ticket!==goalTicket)return;
    const known=new Set(goalRows.map(item=>item.goal_id));goalRows.push(...data.goals.filter(item=>!known.has(item.goal_id)));goalCursor=data.next_cursor;renderGoalRows();
  };
  const openGoals = async () => {
    if(!current){status(L('coding.session.choose-first'));return;}
    const id=current,ticket=++goalTicket;goalReading++;goalChoice=null;goalRows=[];goalCursor=null;
    q('[data-coding-goal-dialog]').showModal();q('[data-coding-goal-save]').disabled=true;q('[data-coding-goal-error]').textContent='';q('[data-coding-goal-search]').value='';q('[data-coding-goal-list]').textContent=L('coding.goal.loading');q('[data-coding-goal-preview]').textContent=L('coding.goal.loading-version');
    try{const saved=await api(sessionPath(id)+'/goal');if(ticket!==goalTicket || current!==id)return;goalChoice=saved.selected;renderGoalPreview();
      if(saved.error || saved.goal_id && !saved.selected)q('[data-coding-goal-error]').textContent=saved.error || L('coding.goal.not-fixed');
      q('[data-coding-goal-save]').disabled=Boolean(saved.goal_id && !saved.selected);await loadGoals(ticket);
    }catch(error){if(!lifetime.alive)return;if(ticket===goalTicket)q('[data-coding-goal-error]').textContent=error.message;}
  };
  const returnFromChange = () => {const fromArtifact=changeItem;changeItem='';renderArtifacts();if(fromArtifact)host.openItem('coding',current,state.sessions.find(item=>item.session_id===current)?.title);};
  const changeReview = (${CODING_CHANGESET_CLIENT_FACTORY_SCRIPT})({lifetime,root,q,api,turns,current:()=>current,closeReport:()=>closeReport(),
    returnToTask:returnFromChange,onRunOpen:()=>{changeItem='';reportItem='';renderArtifacts();},
    appendDraft:task=>draft.append(current,text=>{const next=text.endsWith(task)?text:(text?text+'\\n\\n':'')+task;if(next.length>100000)throw new Error(L('coding.feedback.too-long'));return next;},L('coding.feedback.still-loading')),
    focusDraft:()=>{returnFromChange();input.focus();status(L('coding.feedback.added'));}});
  // Materials are picked in the one picker of project knowledge (specs/project-knowledge PMAT-17); the page holds it, this
  // surface asks for it and keeps the whole choice it hears back for the session that asked.
  let materialTicket=0;
  const openMaterials = async () => {
    const id=current,ticket=++materialTicket;
    if(document.documentElement.dataset.knowledgePicker!=='1'){status(L('coding.material.picker-unavailable'),true);return;}
    try{await draft.flush();}catch(error){if(lifetime.alive)status(error.message,true);return;}
    if(current!==id || ticket!==materialTicket)return;
    document.dispatchEvent(new CustomEvent('molis-work:knowledge-pick',{detail:{request_id:'coding:'+id+':'+ticket,selected:structuredClone(materialSelections.get(id) || []),max:30}}));
  };
  const contextLabel=(selector,label,count=0)=>{const button=q(selector);button.querySelector('[data-slot=button-label]').textContent=label;button.title=label;button.dataset.count=count ? String(count) : '';button.setAttribute('aria-label',label);};
  const controls = () => {
    if(!lifetime.alive)return;
    const active = lastRun && !terminal(lastRun.phase);
    input.disabled = shut();
    q('[data-coding-send]').disabled = input.disabled || recovery || checkpointBusy || (!active && (!state.models.some(model=>JSON.stringify([model.provider_id,model.model_id])===q('[data-coding-model]').value) || !state.workspaces?.some(workspace=>workspace.workspace_id===workspaceId)));
    q('[data-coding-send]').textContent = sending ? L('coding.composer.sending') : L('coding.composer.send');q('[data-coding-mode]').hidden=!active;
    q('[data-coding-stop]').hidden = !active;
    q('[data-coding-stop]').disabled = sending;
    // Pausing lets the current step finish; a paused round resumes with its context intact.
    const pause=q('[data-coding-pause]'),paused=lastRun && ['paused','pausing'].includes(lastRun.phase),pausable=lastRun && ['starting','running','compacting'].includes(lastRun.phase);
    pause.hidden=!(paused || pausable);pause.dataset.action=paused?'resume':'pause';
    pause.textContent=lastRun?.phase==='pausing'?L('coding.run.pausing'):paused?L('coding.run.resume'):L('coding.run.pause');pause.disabled=sending || lastRun?.phase==='pausing';
    q('[data-coding-intent]').disabled = Boolean(active || sending || unread());
    composerModels.controls({active,sending:sending || unread(),run:lastRun});
    q('[data-coding-rename]').hidden = !current;
    q('[data-coding-archive]').hidden = !current;
    for(const name of choosers)q('[data-coding-'+name+'-open]').disabled=input.disabled;
    const materialCount=(materialSelections.get(current) || []).length;contextLabel('[data-coding-material-open]',L('coding.attach.material')+(materialCount?' · '+materialCount:''),materialCount);
    const character=characterSelections.get(current);
    contextLabel('[data-coding-character-open]',character?L('coding.attach.character')+' · v'+character.version:L('coding.attach.character'),character?1:0);
    q('[data-coding-character-open]').title=character?L('coding.character.next',{title:characterTitles.get(current) || character.artifact_id,version:character.version}):L('coding.character.none-next');
    const actionCount=(actionSelections.get(current) || []).length;contextLabel('[data-coding-actions-open]',L('coding.attach.actions')+(actionCount?' · '+actionCount:''),actionCount);
    const mcpCount=(mcpSelections.get(current) || []).length+(mcpSourceSelections.get(current) || []).length; contextLabel('[data-coding-mcp-open]','MCP'+(mcpCount?' · '+mcpCount:''),mcpCount);
    const writable=['edit','execute'].includes(q('[data-coding-intent]').value);
    q('[data-coding-checkpoints-refresh]').disabled=!current || checkpointLoading;
    q('[data-coding-checkpoints-list]').querySelectorAll('button').forEach(button=>{
      button.disabled=Boolean(!writable || active || sending || recovery || checkpointBusy || checkpointLoading);
      button.title=!writable?L('coding.worktrees.needs-writing'):active?L('coding.run.wait-end'):checkpointBusy?L('coding.checkpoints.busy'):'';
    });
    const count=(methodSelections.get(current) || []).length;
    contextLabel('[data-coding-method-open]',L('coding.attach.method')+(count?' · '+count:''),count);
  };
  const {renderCards}=(${CODING_ACTIONS_CLIENT})({lifetime,translate:L,q,api,current:()=>current,selections:actionSelections,save:draft.saveChoices,controls,status,interaction:(node,options)=>host.interaction(node,options),make,sessionPath,readCurrent:()=>readCurrent()});
  (${CODING_CHARACTERS_CLIENT_FACTORY_SCRIPT})({lifetime,translate:L,q,api,current:()=>current,selections:characterSelections,titles:characterTitles,skillSelections:characterSkills,
    save:draft.saveChoices,controls,status});
  // Saved results read like the session rows: what it is by its icon, the title, when it was saved, and its version.
  const renderArtifacts = () => {
    const list=directory.querySelector('[data-coding-artifact-list]'),needle=directory.querySelector('[data-coding-artifact-search]').value.trim().toLocaleLowerCase();list.replaceChildren();
    const pad=(n)=>String(n).padStart(2,'0'),stamp=(value)=>{const at=new Date(value),now=new Date();if(Number.isNaN(at.getTime()))return '';return at.toDateString()===now.toDateString()?pad(at.getHours())+':'+pad(at.getMinutes()):pad(at.getMonth()+1)+'-'+pad(at.getDate());};
    for(const item of artifactRows.filter(item=>item.title.toLocaleLowerCase().includes(needle))) {
      const row=make('button');row.type='button';row.className='mw-dir-row mw-dir-row--meta coding-artifact-row';row.title=item.title;
      row.dataset.codingArtifact=item.reference.artifact_id;const open=(reportItem || changeItem)===item.reference.artifact_id;row.setAttribute('aria-current',String(open));row.classList.toggle('is-selected',open);
      const icon=make('span');icon.className='mw-dir-row__icon';icon.innerHTML='<svg aria-hidden="true"><use href="#icon-'+(item.kind==='changeset'?'git-compare':'file')+'"></use></svg>';
      const copy=make('span'),headline=make('span'),title=make('strong'),when=make('span'),meta=make('small');
      copy.className='mw-dir-row__copy';headline.className='mw-dir-row__headline';when.className='mw-dir-row__count';
      title.textContent=item.title;when.textContent=stamp(item.saved_at);when.title=new Date(item.saved_at).toLocaleString(document.documentElement.lang||'zh-CN');
      meta.textContent=(item.kind==='changeset'?L('coding.artifacts.changeset',{count:item.file_count}):L('coding.report.label'))+' · v'+item.reference.version+(item.archived?' · '+L('coding.artifacts.archived'):'');
      headline.append(title,when);copy.append(headline,meta);row.append(icon,copy);list.append(row);
    }
    if(!list.children.length){const empty=make('div');empty.className='mw-empty';const text=make('p');text.textContent=artifactRows.length?L('coding.artifacts.no-match'):L('coding.artifacts.none-yet');empty.append(text);list.append(empty);}
  };
  const loadArtifacts = async () => {
    const ticket=++artifactTicket,notice=directory.querySelector('[data-coding-artifact-status]');notice.textContent=L('coding.artifacts.loading');
    try{const value=await api('/artifacts');if(ticket!==artifactTicket)return;artifactRows=value.artifacts;renderArtifacts();notice.textContent=L('coding.artifacts.note');}
    catch(error){if(!lifetime.alive)return;if(ticket===artifactTicket)notice.textContent=L('coding.artifacts.failed',{reason:error.message});}
  };
  // The Goal face: the open session's Goal for the next round, with the way to change it and the way to it.
  const renderGoalFace = () => {
    const box=directory.querySelector('[data-coding-goal-face-current]'),open=directory.querySelector('[data-coding-goal-face-open]'),visit=directory.querySelector('[data-coding-goal-face-visit]');
    if(!box)return;
    // The session list may still be on its way when the open session has already been read; the read's own record serves.
    const session=current&&onShow()?(state?.sessions||[]).find(item=>item.session_id===current)||(lastData?.session?.session_id===current?lastData.session:null):null;
    box.replaceChildren();
    const line=(tag,text)=>{const node=make(tag);node.textContent=text;box.append(node);};
    if(!session){line('span',L('coding.goal-face.open-session-first'));open.disabled=true;visit.hidden=true;return;}
    open.disabled=false;
    if(session.goal_id){line('strong',session.goal_title || L('coding.goal-face.unavailable'));line('span',L('coding.goal-face.next',{session:session.title}));open.querySelector('[data-slot=button-label]').textContent=L('coding.goal-face.change');visit.hidden=false;visit.dataset.goalId=session.goal_id;visit.dataset.goalTitle=session.goal_title || '';}
    else {line('strong',L('coding.goal-face.none'));line('span',L('coding.goal-face.session',{session:session.title}));open.querySelector('[data-slot=button-label]').textContent=L('coding.goal.link');visit.hidden=true;}
  };
  const renderDirectory = () => {
    renderGoalFace();
    const selectedFilter = directory.querySelector('[data-coding-filter][aria-pressed=true]')?.dataset.codingFilter || 'all';
    // The filters double as the background-task overview: how many rounds are working and how many wait on you.
    const counts={running:state.sessions.filter(session=>session.state==='running').length,'needs-you':state.sessions.filter(session=>session.checkpoint_busy || ['paused','waiting-answer','waiting-approval','failed','reconcile-required'].includes(session.state)).length};
    directory.querySelectorAll('[data-coding-filter]').forEach(button=>{const count=counts[button.dataset.codingFilter];if(count===undefined)return;let badge=button.querySelector('.coding-filter-count');if(!badge){badge=make('span');badge.className='coding-filter-count';button.append(badge);}badge.textContent=count?String(count):'';badge.hidden=!count;});
    const needle = directory.querySelector('[data-coding-search]').value.trim().toLocaleLowerCase();
    const list = directory.querySelector('[data-coding-sessions]');
    // Replace the server's first paint once, then preserve live pointer targets. Until the session list has been read
    // (a restored tab reads its session first, and a cold start takes a while), the server's paint stays: replacing it
    // with "no sessions" would say something untrue.
    if (!directoryClaimed) { if(!stateLoaded) return; list.replaceChildren(); directoryClaimed=true; }
    const visible = state.sessions.filter((session) => session.title.toLocaleLowerCase().includes(needle)
      && (selectedFilter === 'all' || selectedFilter === 'running' && session.state === 'running' || selectedFilter === 'needs-you' && (session.checkpoint_busy || ['paused','waiting-answer','waiting-approval','failed','reconcile-required'].includes(session.state))));
    const visibleIds=new Set(visible.map(session=>session.session_id));
    for(const [id,row] of directoryRows) if(!visibleIds.has(id)) {row.remove();directoryRows.delete(id);}
    list.querySelector('.mw-empty')?.remove();
    if (!visible.length) { const empty=make('div');empty.className='mw-empty';const label=make('p');label.textContent=needle ? L('coding.directory.no-match') : selectedFilter!=='all' ? L('coding.directory.none-of-kind') : L('coding.directory.empty');empty.append(label);list.append(empty); return; }
    for (const session of visible) {
      let row=directoryRows.get(session.session_id);
      if(!row) {
        row=make('a');row.className='mw-dir-row mw-dir-row--meta coding-session-row';row.href='#session-'+encodeURIComponent(session.session_id);row.dataset.codingSession=session.session_id;
        const icon=make('span');icon.className='mw-dir-row__icon';icon.innerHTML=root.querySelector('[data-coding-face=sessions] svg')?.outerHTML || '';
        const copy=make('span');copy.className='mw-dir-row__copy';
        const headline=make('span');headline.className='mw-dir-row__headline';
        const title=make('strong');title.className='coding-session-title';
        const time=make('time');time.className='mw-dir-row__count coding-session-time';
        const mark=make('small');mark.className='coding-session-state';
        headline.append(title,time);copy.append(headline,mark);row.append(icon,copy);directoryRows.set(session.session_id,row);
      }
      row.setAttribute('aria-current',String(current===session.session_id));row.classList.toggle('is-selected',current===session.session_id);
      const title=row.querySelector('.coding-session-title'),time=row.querySelector('time'),mark=row.querySelector('.coding-session-state');
      if(title.textContent!==session.title) title.textContent=session.title;title.title=session.title;
      if(time.dateTime!==session.updated_at) {
        // Local time: today reads as a clock time, earlier days as a date.
        const at=new Date(session.updated_at),now=new Date(),pad=(n)=>String(n).padStart(2,'0');
        time.textContent=Number.isNaN(at.getTime()) ? session.updated_at.slice(5,10) : at.toDateString()===now.toDateString() ? pad(at.getHours())+':'+pad(at.getMinutes()) : pad(at.getMonth()+1)+'-'+pad(at.getDate());
        time.dateTime=session.updated_at;time.title=Number.isNaN(at.getTime()) ? session.updated_at : at.toLocaleString(document.documentElement.lang||'zh-CN');
      }
      // Who is on the open plan steps, after the state: what waits on the person first.
      const holders=session.steps?[session.steps.mine?L('coding.steps.mine',{count:session.steps.mine}):'',session.steps.subtasks?L('coding.steps.subtasks',{count:session.steps.subtasks}):'',session.steps.unowned?L('coding.steps.unowned',{count:session.steps.unowned}):''].filter(Boolean).join(' · '):'';
      // Two sessions under way on the same Goal may be doing the same thing twice.
      const busyStates=['running','paused','waiting-answer','waiting-approval','queued'],twin=session.goal_id&&busyStates.includes(session.state)?visible.find(other=>other!==session&&other.goal_id===session.goal_id&&busyStates.includes(other.state)):null;
      const label=(session.priority?L('coding.session.priority')+' · ':'')+(session.checkpoint_busy ? L('coding.session.rewind-pending') : SESSION_STATE[session.state] || session.state)+(session.background_unreadable?' · '+L('coding.session.background-unreadable'):'')+(holders?' · '+holders:'')+(twin?' · '+L('coding.session.twin',{title:twin.title.slice(0,16)}):'');if(mark.textContent!==label) mark.textContent=label;
      mark.dataset.state=session.checkpoint_busy ? 'waiting-approval' : session.state; mark.dataset.mwState=session.checkpoint_busy?'verify':SESSION_MARKS[session.state]?.[1]||'idle';
      const goalKey=session.goal_id || '';let group=directoryGroups.get(goalKey);
      if(!group) {group=make('section');group.className='coding-session-group';const heading=make('h2');heading.className='mw-dir__heading';group.append(heading);directoryGroups.set(goalKey,group);}
      const groupTitle=session.goal_title || (session.goal_id ? L('coding.directory.goal-unavailable') : L('coding.directory.no-goal'));
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
  const canonical=value=>JSON.stringify(value,(key,item)=>item && typeof item==='object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])) : item);
  const applyConfiguration = () => {
    const config=configurations.get(current),models=q('[data-coding-model]');
    models.querySelector('[data-unavailable]')?.remove();
    if(config){
      q('[data-coding-intent]').value=config.intent;
      const value=config.provider_id && config.model_id ? JSON.stringify([config.provider_id,config.model_id]) : '';
      if(![...models.options].some(option=>option.value===value)){
        const unavailable=make('option');unavailable.value=value;unavailable.dataset.unavailable='true';unavailable.textContent=L('coding.model.unavailable');models.append(unavailable);
      }
      models.value=value;workspaceId=config.workspace_id;composerModels.apply(config);
    }
    const workspace=state.workspaces?.find(item=>item.workspace_id===workspaceId);
    showWorkspace(workspace?.canonical_path,workspaceId?L('coding.workspace.unavailable'):L('coding.workspace.choose-first'));
    if(!q('[data-coding-workspace-dialog]').open)q('[data-coding-workspace-choice]').value=workspaceId;
  };
  const rememberConfiguration = () => {
    if(!draft.owns(current))return;
    const [provider_id,model_id]=JSON.parse(q('[data-coding-model]').value || '[]');
    configurations.set(current,{intent:q('[data-coding-intent]').value,provider_id:provider_id || '',model_id:model_id || '',...composerModels.effort(),workspace_id:workspaceId,...(configurations.get(current)?.writer_assignments ? {writer_assignments:configurations.get(current).writer_assignments} : {})});
  };
  // A session named by its first task renames its open tab too, while Coding is the surface on show (its tab is then
  // the active one and only its title changes). Whichever read sees the new name first does it.
  const retitle=(id,before,after)=>{if(id && id===current && before && after && before!==after && root.getBoundingClientRect().width>0)host.openItem('coding',id,after);};
  // One directory read at a time. The poll and every event ask for it; a slow read must not let them pile up in the
  // project's queue, where each would hold up reviews and every other call behind it. A caller arriving mid-read gets
  // the next read, which starts after this one, so it still sees whatever it just changed.
  let stateRead=null,stateNext=null;
  const refreshState = () => {
    const run=()=>{stateRead=readState().finally(()=>{stateRead=null;});return stateRead;};
    if(!stateRead)return run();
    stateNext??=stateRead.catch(()=>{}).then(()=>{stateNext=null;return stateRead??run();});
    return stateNext;
  };
  const readState = async () => {
    const before=current && state?.sessions?.find(item=>item.session_id===current)?.title;
    const result=await api('/state'); state=result; stateLoaded=true;
    retitle(current,before,current && result.sessions.find(item=>item.session_id===current)?.title);
    composerModels.fill(result.models);
    const selectedWorkspace=result.workspaces.find(item=>item.workspace_id===workspaceId) || result.workspace || (result.workspaces.length===1 ? result.workspaces[0] : null);
    if(!configurations.get(current))workspaceId=selectedWorkspace?.workspace_id || '';
    showWorkspace(selectedWorkspace?.canonical_path,L('coding.workspace.choose-first'));
    const workspaceChoice=q('[data-coding-workspace-choice]');
    const workspaceKey=JSON.stringify(result.workspaces);
    if(workspaceChoice.dataset.options!==workspaceKey) {workspaceChoice.replaceChildren(...result.workspaces.map(item=>{const option=make('option');option.value=item.workspace_id;option.textContent=item.canonical_path;return option;}));workspaceChoice.dataset.options=workspaceKey;workspaceChoice.value=workspaceId;}
    if(!q('[data-coding-workspace-dialog]').open) workspaceChoice.value=workspaceId;
    const rid=result.sessions.find(s=>s.session_id===current)?.runtime_id||result.project_runtime_id,roles=result.runtimes.find(r=>r.runtime_id===rid)?.roles||[];
    q('[data-coding-intent] option[value=parallel]').disabled=!roles.find(role=>role.role_id==='writers')?.available;
    const collaborate=q('[data-coding-intent] option[value=collaborate]');collaborate.disabled=!roles.find(role=>role.role_id==='coordinator')?.available;
    const execute=q('[data-coding-intent] option[value=execute]'); const available=roles.find(role=>role.role_id==='builder');
    execute.disabled=!available?.available; execute.textContent=available?.available ? L('coding.intent.execute') : L('coding.intent.execute-pending');
    const edit=q('[data-coding-intent] option[value=edit]'); const writable=roles.find(role=>role.role_id==='writer')?.available;
    edit.disabled=!writable; edit.textContent=writable ? L('coding.intent.edit') : L('coding.intent.edit-pending');
    applyConfiguration();renderDirectory(); controls();
  };
  const renderMcp = () => {
    const list=q('[data-coding-mcp-list]');list.replaceChildren();const catalog=(state.mcp || []).flatMap(server=>server.tools.map(tool=>({...tool,label:server.label,available:server.enabled && server.health==='connected'})));
    const key=ref=>JSON.stringify([ref.server,ref.tool,ref.version,ref.configuration_version]);
    for(const selected of mcpChoices)if(!catalog.some(tool=>key(tool)===key(selected)))catalog.push({...selected,label:(state.mcp || []).find(server=>server.id===selected.server)?.label || selected.server,available:false,description:L('coding.mcp.tool-gone')});
    for(const tool of catalog){
      const row=make('label');row.className='mw-check-row';const check=make('input');check.type='checkbox';check.className='mw-check';check.checked=mcpChoices.some(item=>key(item)===key(tool));check.disabled=!tool.available && !check.checked;
      const copy=make('span');copy.textContent=tool.label+' / '+tool.tool+(tool.available?'':' '+L('coding.mcp.unavailable-mark'))+' · '+tool.description;
      lifetime.listen(check,'change',()=>{mcpChoices=mcpChoices.filter(item=>key(item)!==key(tool));if(check.checked)mcpChoices.push({server:tool.server,tool:tool.tool,version:tool.version,configuration_version:tool.configuration_version});});row.append(check,copy);list.append(row);
    }
    const sourceKey=ref=>JSON.stringify([ref.server,ref.configuration_version]);
    const sources=(state.mcp || []).filter(server=>server.resources?.length).map(server=>({server:server.id,configuration_version:server.version,label:server.label,resources:server.resources,available:server.enabled && server.health==='connected'}));
    for(const selected of mcpSourceChoices)if(!sources.some(item=>sourceKey(item)===sourceKey(selected)))sources.push({...selected,label:(state.mcp || []).find(server=>server.id===selected.server)?.label || selected.server,resources:[],available:false});
    for(const source of sources){
      const row=make('label');row.className='mw-check-row';const check=make('input');check.type='checkbox';check.className='mw-check';check.checked=mcpSourceChoices.some(item=>sourceKey(item)===sourceKey(source));check.disabled=!source.available && !check.checked;
      const copy=make('span');copy.textContent=source.label+' · '+(source.available?L('coding.mcp.source',{count:source.resources.length}):L('coding.mcp.source-unavailable'));
      lifetime.listen(check,'change',()=>{mcpSourceChoices=mcpSourceChoices.filter(item=>sourceKey(item)!==sourceKey(source));if(check.checked)mcpSourceChoices.push({server:source.server,configuration_version:source.configuration_version});});row.append(check,copy);list.append(row);
    }
    if(!catalog.length && !sources.length)list.textContent=L('coding.mcp.none');
  };
  const renderMethods = () => {
    const list=q('[data-coding-method-list]'),needle=q('[data-coding-method-search]').value.trim().toLocaleLowerCase();
    list.replaceChildren();
    const catalog=state.methods || [];
    const rows=catalog.filter(item=>(item.name+' '+item.summary).toLocaleLowerCase().includes(needle));
    for(const method of rows) {
      const row=make('div');row.className='mw-field';
      const label=make('label'),check=make('input');label.className='mw-check-row';check.className='mw-check';check.type='checkbox';
      check.checked=methodChoices.some(ref=>ref.skill_id===method.skill_id && ref.version===method.version);check.disabled=!method.enabled;
      const name=make('span');name.textContent=L(method.name)+' · v'+method.version;label.append(check,name);
      const description=make('small');description.textContent=method.enabled?L(method.summary):L('coding.method.unavailable',{summary:L(method.summary)});
      lifetime.listen(check,'change',()=>{methodChoices=methodChoices.filter(ref=>ref.skill_id!==method.skill_id);if(check.checked)methodChoices.push({skill_id:method.skill_id,version:method.version});});
      const read=make('button');read.type='button';read.className='mw-btn mw-btn--ghost';read.textContent=L('coding.method.read');read.setAttribute('aria-label',L('coding.method.read-label',{name:L(method.name)}));read.disabled=!method.enabled;
      lifetime.listen(read,'click',async()=>{const ticket=++methodDocumentTicket,doc=q('[data-coding-method-document]');doc.hidden=false;doc.textContent=L('coding.method.loading');try{
        const result=await api('/methods/'+encodeURIComponent(method.skill_id)+'/'+method.version);if(ticket!==methodDocumentTicket)return;
        const title=make('h3');title.textContent=L(result.method.name)+' · v'+result.method.version;const body=make('p');body.textContent=result.method.body;doc.replaceChildren(title,body);doc.scrollIntoView({block:'nearest'});
      }catch(error){if(!lifetime.alive)return;if(ticket===methodDocumentTicket)doc.textContent=error.message;}});
      const heading=make('div');heading.className='coding-method-heading';heading.append(label,read);row.append(heading,description);list.append(row);
    }
    if(!rows.length){const empty=make('p');empty.textContent=needle?L('coding.method.no-match'):L('coding.method.none');list.append(empty);}
    for(const ref of methodChoices.filter(ref=>!catalog.some(method=>method.skill_id===ref.skill_id && method.version===ref.version))) {
      const remove=make('button');remove.type='button';remove.className='mw-btn';remove.textContent=L('coding.method.remove-gone',{method:ref.skill_id+' · v'+ref.version});
      lifetime.listen(remove,'click',()=>{methodChoices=methodChoices.filter(item=>item!==ref);renderMethods();});list.append(remove);
    }
  };
  const openMethods = () => {
    if(shut())return;methodChoices=structuredClone(methodSelections.get(current) || []);methodDocumentTicket++;
    q('[data-coding-method-search]').value='';q('[data-coding-method-document]').hidden=true;q('[data-coding-method-error]').textContent='';renderMethods();q('[data-coding-method-dialog]').showModal();
  };
  // Web addresses in a turn (a dev server the round started, a page it read) are links, built from text nodes, never
  // from model-written markup; the Workbench opens them in the side panel's browser (specs/archive/side-panel).
  const linkedText = (node, text) => {
    node.replaceChildren();let at=0;const pattern=/https?:\\/\\/[^\\s<>"'\\x60）】」]+[^\\s<>"'\\x60）】」.,;:!?。，；：！？)]/g;
    for(const match of text.matchAll(pattern)){
      if(match.index>at)node.append(document.createTextNode(text.slice(at,match.index)));
      const link=make('a');link.href=match[0];link.textContent=match[0];link.target='_blank';link.rel='noopener noreferrer';node.append(link);
      at=match.index+match[0].length;
    }
    if(at<text.length)node.append(document.createTextNode(text.slice(at)));
  };
  // Code reads as code: fenced blocks and diff lines are coloured from text pieces, never from model-written markup.
  const codeLanguageOf = ${codeLanguage.toString()};
  const tokensOf = ${codeTokens.toString()};
  const {pieceNode,paintInto,paintBlock,growCode,paintRows,source:codeSource}=(${createCodingCodePaint.toString()})(tokensOf,${growCodeTokens.toString()},codeLanguageOf);
  // Diff lines keep their sign; the rest of each line is coloured by the file's language, in order, so a block comment
  // spanning lines stays a comment (see diffRowTokens). Side by side colours each side on its own, as the file it shows.
  const diffRowTokens = ${diffRowTokens.toString()};
  const paintDiffs = (scope) => scope.querySelectorAll('[data-code-path] .diff-rows').forEach(list => (list.classList.contains('diff-split') ? ['.diff-left','.diff-right'] : ['']).forEach(side => {
    const codes=[...list.querySelectorAll(':scope > li > code'+side)].filter(code=>code.dataset.kind!=='blank');if(!codes.some(code=>!code.dataset.painted))return;
    const language=codeLanguageOf(list.closest('[data-code-path]').dataset.codePath || '');
    const rows=codes.map(code=>{const sign=code.querySelector('.diff-sign');return {code,sign,kind:code.dataset.kind||code.parentElement.dataset.kind||'',text:[...code.childNodes].filter(node=>node!==sign).map(node=>node.textContent).join('')};});
    // A line past 40,000 characters stays text and the rest are coloured, a slice a frame (paintRows); splitting is cheap.
    const painted=language ? diffRowTokens(rows,language,tokensOf) : null;
    const fresh=rows.map((row,index)=>({...row,pieces:painted?.[index]})).filter(row=>!row.code.dataset.painted && (row.code.dataset.painted='true') && row.pieces);
    paintRows(fresh,(step)=>lifetime.frame(()=>{if(list.isConnected)step();}),list,(release)=>host.mountPluginClient(list).own(release));
  }));
  let paintFrame=0;lifetime.observe(new MutationObserver(()=>{if(paintFrame)return;paintFrame=lifetime.frame(()=>{paintFrame=0;paintDiffs(root);});}),root,{childList:true,subtree:true});
  const enrichCode = (node) => node.querySelectorAll('pre:not([data-enriched])').forEach(pre => {
    pre.dataset.enriched='';const code=pre.querySelector('code');codeSource.set(pre,(code || pre).textContent);if(code)paintBlock(code); // copied as written, not from the colours
    const button=make('button'); button.type='button'; button.className='mw-btn coding-code-copy'; button.textContent=L('coding.copy.label');
    lifetime.listen(button,'click',()=>window.molisCopy?.(button,()=>codeSource.get(pre),{done:L('coding.copy.done'),failed:L('coding.copy.failed')})); pre.append(button);
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
      const detail=make('details');detail.className='coding-command';detail.dataset.command=key;
      // The row names the command itself; its exit state is read from the durable receipt when opened.
      const summary=make('summary'),line=make('code'),state=make('span'),round=make('span');
      line.textContent=target ? '$ '+target : L('coding.commands.title');line.title=target;state.className='coding-command-state';round.className='coding-command-round';round.textContent=L('coding.turn.number',{number});
      summary.append(line,state,round);
      const body=make('div');detail.append(summary,body);region.insertBefore(detail,region.querySelector(':scope > h3')?.nextSibling || null);
      let loaded=false,busy=false;
      const load=async()=>{
        if(loaded || busy) return;busy=true;body.textContent=L('coding.commands.loading');
        const id=current,ticket=generation;
        try {
          const receipt=await api(sessionPath(id,ref.run_id)+'/commands/'+encodeURIComponent(ref.call_id));
          if(id!==current || ticket!==generation) return;
          loaded=true;body.replaceChildren();
          const ended=receipt.stop_reason==='timed-out' || receipt.timed_out ? L('coding.commands.timed-out') : receipt.stop_reason==='cancelled' || receipt.cancelled ? L('coding.state.cancelled') : receipt.exit_code===null ? L('coding.commands.exit-unknown') : '';
          state.textContent=ended || 'exit '+receipt.exit_code;state.dataset.tone=receipt.exit_code===0 && !receipt.timed_out && !receipt.cancelled ? 'done' : 'failed';if(!target){line.textContent='$ '+receipt.command;line.title=receipt.command;}
          const command=make('p');command.className='coding-command-recorded';command.textContent=L('coding.commands.recorded',{command:receipt.command});body.append(command);
          for(const [label,value] of [[L('coding.commands.stdout'),receipt.stdout],[L('coding.commands.stderr'),receipt.stderr]]) {
            const heading=make('p');heading.textContent=label;const output=make('pre');output.textContent=value || L('coding.commands.no-output');body.append(heading,output);
          }
          if(receipt.truncated){const note=make('p');note.textContent=L('coding.commands.truncated');body.append(note);}
        } catch(error) {if(!lifetime.alive)return;
          if(id!==current || ticket!==generation) return;
          body.textContent=error.message;const retry=make('button');retry.className='mw-btn';retry.type='button';retry.textContent=L('coding.common.reload');lifetime.listen(retry,'click',load);body.append(retry);
        } finally {busy=false;}
      };
      lifetime.listen(detail,'toggle',()=>{if(detail.open) void load();});
    }
  };
  // A waiting question is the shared question card the Host draws (A2); the page restores its draft, binds it with the
  // shared client and answers with what it holds. A card that can no longer be answered keeps what was written, to check.
  const renderQuestions = (block,run) => {
    const live=new Set();
    for(const question of run.awaiting_input || []) {
      const key=JSON.stringify([run.ref.run_id,question.pending_id,question.pending_revision]);live.add(key);
      if(answeredQuestions.has(key)) continue;
      let form=[...block.querySelectorAll('[data-coding-question]')].find(node=>node.dataset.questionKey===key);
      if(form && question.html && form.dataset.questionDefinition!==question.html) {form.ix?.destroy();form.remove();form=null;}
      if(!form) {
        if(!question.html) continue;
        const template=make('template');template.innerHTML=question.html;
        form=template.content.firstElementChild;if(!form) continue;
        form.dataset.codingQuestion='';form.dataset.questionKey=key;form.dataset.questionDefinition=question.html;block.append(form);
        const id=current,card=form,note=card.querySelector('[data-ix-note]'),lock=on=>card.querySelectorAll('fieldset,button').forEach(node=>node.disabled=on),here=()=>current===id&&lifetime.visible&&card.isConnected;
        const remember=(values=client.read())=>{
          const drafts=questionDrafts.get(id) || {};if(values)drafts[key]=values;else delete drafts[key];questionDrafts.set(id,drafts);
          try{sessionStorage.setItem(draftKey(id)+':questions',JSON.stringify(drafts));}catch{}
        };
        const client=card.ix=host.interaction(card,{
          onAction:()=>void continueRound(null,{run_id:run.ref.run_id,pending_id:question.pending_id}),
          onChange:()=>{remember();
            draft.later(()=>{void draft.save(id,draft.local(id) || '').catch(error=>{note.textContent=L('coding.question.unsaved',{reason:error.message});});});},
          onSubmit:async()=>{
            if(card.dataset.busy==='true' || card.dataset.answerable!=='true') return;
            remember();
            card.dataset.busy='true';lock(true);note.textContent=L('coding.question.sending');
            try {
              const {message}=await api(sessionPath(id)+'/control','POST',{kind:'answer',run_id:run.ref.run_id,pending_id:question.pending_id,pending_revision:question.pending_revision,values:client.read()});
              answeredQuestions.add(key);remember(null);
              client.destroy();(${codingQuestionAnswered.toString()})(card,note,message,input,here());
              void draft.save(id,draft.local(id) || '').catch(()=>{});
              if(current===id) {void readCurrent();void refreshState().catch(()=>{});}
            } catch(error) {if(!lifetime.alive)return;
              const closed=['coding.round_ended','agent.pending_not_open'].includes(error.code),at=document.activeElement;if(closed){answeredQuestions.add(key);card.dataset.refused='true';if(current===id)void readCurrent();}
              note.textContent=error.message;const locked=closed||card.dataset.answerable!=='true';lock(locked);if(locked&&here()&&(card.contains(at)||at===document.body))toInput();if(error.details?.errors)client.showErrors(error.details.errors,{focus:true});
            } finally {delete card.dataset.busy;}
          },
        });
        const saved=questionDrafts.get(id)?.[key];if(saved && typeof saved==='object') client.write(saved);
      }
      const canAnswer=(question.parked || !terminal(run.phase)) && question.answerable!==false;
      form.dataset.answerable=String(canAnswer);
      const ring=form.querySelector('.mw-ix-kicker .mw-state-ring');if(ring)ring.dataset.mwState=canAnswer?'answer':'unavailable';
      if(form.dataset.busy!=='true') form.querySelectorAll('fieldset,button:not([data-ix-action=reask])').forEach(node=>node.disabled=!canAnswer);
      if(!canAnswer && form.dataset.busy!=='true') form.querySelector('[data-ix-note]').textContent=question.unavailable_reason || L('coding.question.closed');
    }
    for(const form of block.querySelectorAll('[data-coding-question]')) {
      if(!live.has(form.dataset.questionKey) && !(form.dataset.busy || form.dataset.refused)) {
        const had=form.contains(document.activeElement);form.ix?.destroy();form.remove();if(had)toInput();
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
    const add=(tag,value)=>{const element=make(tag);element.textContent=value;region.append(element);};
    if(value){
      add('h3',L('coding.progress.goal-title',{title:value.report_goal.title}));add('p',L('coding.progress.artifact',{title:value.title,version:value.reference.version}));
      if(value.current){
        const goal=value.current.goal,state=value.current.state;
        if(goal.title!==value.report_goal.title)add('p',L('coding.progress.goal-now',{title:goal.title}));
        add('p',state.agreement.outcome || goal.outcome || L('coding.progress.no-outcome'));
        for(const [key,label] of [['why',L('coding.goal.why')],['business_logic',L('coding.goal.logic')]])if(goal[key])add('p',L('coding.goal.field',{label,value:goal[key]}));
        for(const [key,label] of [['in_scope',L('coding.goal.scope')],['out_of_scope',L('coding.goal.not-doing')],['constraints',L('coding.goal.constraints')],['required_inputs',L('coding.goal.inputs')],['promised_outputs',L('coding.goal.expected')]]) if(goal[key]?.length)add('p',L('coding.goal.field',{label,value:goal[key].join(L('coding.list.semicolon'))}));
        for(const item of goal.acceptance_criteria)add('p',L('coding.goal.field',{label:L('coding.goal.acceptance'),value:L('coding.goal.criterion',{statement:item.statement,pass:item.pass_condition,method:item.decision_method})}));
        for(const requirement of state.requirements)add('p',requirement.human_decision_required?L('coding.goal.needs-person',{statement:requirement.statement}):requirement.statement);
        if(state.progress_summary)add('p',L('coding.progress.existing',{summary:state.progress_summary.summary}));
        if(state.goal_event_cursor!==value.report_goal.goal_event_cursor)add('p',L('coding.progress.goal-updated'));
      }
      q('[data-coding-progress-source]').textContent=value.reference.artifact_id+' v'+value.reference.version+'\\n'+L('coding.progress.source-goal',{goal:value.report_goal.goal_id})+'\\n'+L('coding.progress.source-basis',{version:codingGoalVersionLabel(value.report_goal,L),cursor:value.report_goal.goal_event_cursor})+(value.current?'\\n'+L('coding.progress.source-now',{version:codingGoalVersionLabel({agreement_version:value.current.state.agreement.version},L),cursor:value.current.state.goal_event_cursor}):'');
    }
    for(const selector of ['[data-coding-progress-summary]','[data-coding-progress-next]'])q(selector).readOnly=Boolean(recorded);
    q('[data-coding-progress-save]').disabled=!value || Boolean(recorded) || progressSaving || !q('[data-coding-progress-summary]').value.trim();
    q('[data-coding-progress-refresh]').disabled=progressSaving;
    q('[data-coding-progress-close]').disabled=progressSaving;
    q('[data-coding-progress-goal]').hidden=!value;q('[data-coding-progress-goal]').disabled=progressSaving;
    if(recorded){q('[data-coding-progress-summary]').value=recorded.progress_summary.summary;q('[data-coding-progress-next]').value=recorded.progress_summary.next_step || '';q('[data-coding-progress-status]').textContent=L('coding.progress.recorded',{at:recorded.progress_summary.recorded_at});}
  };
  const openProgress = async () => {
    if(!current || !reportRun || progressSaving)return;
    rememberProgressDraft();
    const view={id:current,runId:reportRun,preview:null,ticket:++progressTicket};progressView=view;
    const dialog=q('[data-coding-progress-dialog]');if(!dialog.open)dialog.showModal();
    let draft;try{draft=JSON.parse(sessionStorage.getItem(progressDraftKey(view.id,view.runId)) || 'null');}catch{}
    q('[data-coding-progress-summary]').value=draft?.summary || '';q('[data-coding-progress-next]').value=draft?.next_step || '';
    q('[data-coding-progress-source]').textContent='';q('[data-coding-progress-status]').textContent=L('coding.progress.loading');renderProgress();
    try{const preview=await api(sessionPath(view.id,view.runId)+'/report/progress');
      if(progressView!==view || view.ticket!==progressTicket)return;view.preview=preview;q('[data-coding-progress-status]').textContent=L('coding.progress.check');renderProgress();
    }catch(error){if(!lifetime.alive)return;if(progressView===view)q('[data-coding-progress-status]').textContent=error.message;}
  };
  const closeProgress = () => {if(progressSaving)return;rememberProgressDraft();progressTicket++;progressView=null;q('[data-coding-progress-dialog]').close();};
  const closeReport = (restoreFocus = false) => {
    const wasOpen=Boolean(reportRun);
    reportTicket++;reportRun='';reportSaving=false;
    q('[data-coding-report-reader]').hidden=true;turns.hidden=false;
    if(wasOpen) follow.restore(dialogueOffset);
    if(restoreFocus && reportTrigger?.isConnected) reportTrigger.focus({preventScroll:true});
  };
  const loadReportOutput = async (id,runId,ticket) => {
    if(ticket!==reportTicket || id!==current)return;
    const button=q('[data-coding-report-output]'),message=q('[data-coding-report-output-status]');button.disabled=true;reportOutput=null;
    try {
      const value=await api(sessionPath(id,runId)+'/report/output');
      if(ticket!==reportTicket || id!==current)return;
      reportOutput=value;button.textContent=value.selected?L('coding.report.is-output'):L('coding.report.set-output');button.disabled=value.selected;
      message.hidden=false;message.textContent=value.selected?L('coding.report.output-on'):L('coding.report.output-off');
    } catch(error) {if(!lifetime.alive)return;if(ticket===reportTicket && id===current){message.hidden=false;message.textContent=L('coding.report.output-failed',{reason:error.message});button.textContent=L('coding.report.output-retry');button.disabled=false;}}
  };
  const showReport = async (runId, save = false) => {
    if(changeReview.active())changeReview.close();
    const id=current,generationAtStart=generation,ticket=++reportTicket;
    if(!reportRun) dialogueOffset=turns.scrollTop;
    reportRun=runId;reportSaving=save;
    turns.hidden=true;q('[data-coding-report-reader]').hidden=false;q('[data-coding-latest]').hidden=true;
    q('[data-coding-report-save]').disabled=true;q('[data-coding-report-save]').hidden=false;q('[data-coding-report-progress]').hidden=true;reportOutput=null;q('[data-coding-report-output]').hidden=true;q('[data-coding-report-output-status]').hidden=true;
    q('[data-coding-report-status]').textContent=save?L('coding.report.saving'):L('coding.report.loading');
    if(!save) q('[data-coding-report-body]').replaceChildren();
    try {
      const result=await api(sessionPath(id,runId)+'/report'+(reportItem && !save?'?fixed=1':''),save?'POST':'GET');
      if(current!==id || generation!==generationAtStart || ticket!==reportTicket) return;
      q('[data-coding-report-body]').innerHTML=result.html;enrichCode(q('[data-coding-report-body]'));
      q('[data-coding-report-status]').textContent=result.reference?L('coding.report.saved',{version:result.reference.version,at:result.saved_at}):L('coding.report.unsaved');
      q('[data-coding-report-save]').disabled=Boolean(result.reference);q('[data-coding-report-save]').hidden=Boolean(result.reference);
      q('[data-coding-report-progress]').hidden=!(result.reference && result.report.goal && !result.report.goal_source_error);
      q('[data-coding-report-output]').hidden=!result.reference;
      if(result.reference)void loadReportOutput(id,runId,ticket);
      if(!save) {q('[data-coding-report-reader]').scrollTop=0;q('[data-coding-report-close]').focus({preventScroll:true});}
    } catch(error) {if(!lifetime.alive)return;
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
    if(!lifetime.visible || !inline.isConnected || !id || !approve || approve.disabled || offeredApprovals.has(id))return;
    offeredApprovals.add(id);
    if(document.activeElement?.matches?.('input,textarea,select,[contenteditable=""],[contenteditable=true]') || document.querySelector('dialog[open]'))return;
    approve.focus({preventScroll:true});
  };
  // runs: the rounds to (re)draw, a contiguous stretch. all: the whole session in order, where rounds that are not
  // loaded are summaries. Numbering and "latest" are always read against the whole session.
  const renderRuns = (runs, all=runs) => {
    // Following is the reader's choice, made by scrolling; content that grows after a render must not revoke it. Read back, the
    // part at the top of the view keeps its place: this is the one owner of the shift (overflow-anchor is none here; a WebView may have no scroll anchoring).
    const pinNow = !reportRun && following(), held = pinNow || reportRun ? null : [...turns.querySelectorAll(':scope > [data-run] > *')].find(node=>node.getBoundingClientRect().bottom>turns.getBoundingClientRect().top), heldTop = held?.getBoundingClientRect().top;
    turns.toggleAttribute('data-coding-welcoming',!all.length);if(all.length)q('[data-coding-welcome]')?.remove();
    else if(!q('[data-coding-welcome]')) {turns.append(q('[data-coding-welcome-template]').content.cloneNode(true));const name=root.dataset.codingWorkspaceName;if(name)turns.querySelectorAll('[data-coding-welcome-workspace]').forEach(node=>{node.textContent=name;});}
    turns.querySelectorAll('[data-coding-prompt]').forEach(button=>{button.disabled=Boolean(input.value.trim());});
    for (const run of runs) {
      let block=[...turns.children].find(node=>node.dataset.run===run.ref.run_id);
      if(!block) { block=make('section'); block.dataset.run=run.ref.run_id; block.dataset.runIndex=String(all.indexOf(run)); turns.insertBefore(block,[...turns.querySelectorAll(':scope > [data-run]')].find(node=>Number(node.dataset.runIndex)>all.indexOf(run)) || null); }
      renderQuestions(block,run);
      const entries=[
        ...run.turns.filter(turn=>turn.kind!=='system').map((value,index)=>({kind:'turn',value,sequence:value.sequence ?? index})),
        ...run.activity.map((value,index)=>({kind:'activity',value,sequence:value.sequence ?? run.turns.length+index})),
        ...(run.awaiting_input || []).map((value,index)=>({kind:'question',value,sequence:value.sequence ?? run.turns.length+run.activity.length+index})),
        ...(run.turn_changes || []).map(value=>({kind:'changes',value,sequence:value.sequence})),
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
          if(!node) { node=make('article'); node.className='coding-turn'; node.dataset.turn=turn.turn_id; node.dataset.kind=turn.kind; }
          const renderKey=turn.text+(run.frozen.role_id==='planner'?'|'+run.phase:'');
          if(renderedText.get(node)!==renderKey) {
            if(!plans.renderTurn(node,run,turn) && !writerDirectories.renderTurn(node,run,turn)){if(turn.html && window.molisStreamText) window.molisStreamText(node,turn.html,{reveal:renderedText.has(node) && turn.kind==='assistant' && run===all.at(-1) && ['starting','running'].includes(run.phase) && !document.hidden,grow:growCode}); else node.innerHTML=turn.html || ''; if(!turn.html) linkedText(node,turn.text);}
            // A round that started from the digest of earlier rounds shows the person's own request; the digest it carried
            // stays one click away, with the plain statement that tool output was not carried.
            const digestAt=turn.kind==='user' && turn.text.startsWith(HISTORY_DIGEST_MARKER) ? turn.text.indexOf(HISTORY_DIGEST_TASK_HEAD) : -1;
            if(digestAt>=0){
              const digest=turn.text.slice(HISTORY_DIGEST_MARKER.length,digestAt),own=turn.text.slice(digestAt+HISTORY_DIGEST_TASK_HEAD.length),count=(digest.match(/前 (\\d+) 轮/)||[])[1]||'';
              node.classList.add('has-digest');node.replaceChildren();
              const details=make('details'),summary=make('summary'),body=make('pre'),text=make('div');
              details.className='coding-digest';summary.innerHTML='<svg aria-hidden="true"><use href="#icon-history"></use></svg>';summary.append(document.createTextNode(L(digest.includes(MODEL_DIGEST_HEAD)?'coding.digest.by-model':'coding.digest.by-host',{count})));
              body.textContent=digest;details.append(summary,body);
              text.className='coding-turn-own';text.textContent=own.startsWith(CONTINUATION_MARKER)?L('coding.turn.continued',{line:own.slice(CONTINUATION_MARKER.length).split('\\n')[0].replace(/请从断点继续完成原任务。?$/,'').trim()}):own;
              node.append(details,text);
            }
            // Files named with @ were attached after the person's words; the words show, the attachments fold away.
            else if(turn.kind==='user' && turn.text.includes(MENTIONS_MARKER) && !turn.text.startsWith(CONTINUATION_MARKER)){
              const at=turn.text.indexOf(MENTIONS_MARKER),own=turn.text.slice(0,at),attached=turn.text.slice(at+MENTIONS_MARKER.length),folders=(attached.match(/^### .*（目录/gm)||[]).length,count=(attached.match(/^### /gm)||[]).length-folders;
              node.replaceChildren();const text=make('div'),details=make('details'),summary=make('summary'),body=make('pre');
              text.className='coding-turn-own';text.textContent=own;details.className='coding-digest';summary.innerHTML='<svg aria-hidden="true"><use href="#icon-paperclip"></use></svg>';summary.append(document.createTextNode(L('coding.turn.attached',{what:[count?L('coding.turn.attached-files',{count}):'',folders?L('coding.turn.attached-folders',{count:folders}):''].filter(Boolean).join(L('coding.list.joiner'))})));
              body.textContent=attached;details.append(summary,body);node.append(text,details);
            }
            // Material the runtime handed the model (a confirmed plan, a fixed report) arrives wrapped as reference data;
            // it reads as one line naming the material, with the text one click away.
            else if(turn.kind==='user' && turn.text.startsWith('Untrusted context data.')){
              let name=L('coding.turn.material');try{const outer=JSON.parse(turn.text.slice(turn.text.indexOf('{')));name=JSON.parse(String(outer.text).split('\\n')[0]).title||name;}catch{}
              node.classList.add('is-material');node.replaceChildren();
              const details=make('details'),summary=make('summary'),body=make('pre');
              details.className='coding-digest';summary.innerHTML='<svg aria-hidden="true"><use href="#icon-paperclip"></use></svg>';summary.append(document.createTextNode(L('coding.turn.material-named',{name})));
              body.textContent=turn.text;details.append(summary,body);node.append(details);
            }
            // A continuation the Host composed reads as one line; the facts it handed the model stay one click away.
            else if(turn.kind==='user' && turn.text.startsWith(CONTINUATION_MARKER)){
              const body=node.innerHTML,line=turn.text.slice(CONTINUATION_MARKER.length).split('\\n')[0].replace(/请从断点继续完成原任务。?$/,'').trim();
              node.classList.add('is-continuation');node.innerHTML='';
              const details=make('details'),summary=make('summary'),facts=make('div');
              summary.innerHTML='<svg aria-hidden="true"><use href="#icon-play"></use></svg>';summary.append(document.createTextNode(L('coding.turn.continued',{line})));
              facts.className='coding-continuation-facts';facts.innerHTML=body;details.append(summary,facts);node.append(details);
            }
            renderedText.set(node,renderKey); enrichCode(node);
          }
          const receipt=host.receipts.line(turns,turn,{run_id:run.ref.run_id,awaiting_input:run.awaiting_input,step_board:run.step_board},inputReceipts.act(current,run.ref.run_id));if(receipt&&receipt.parentNode!==node)node.append(receipt);ordered.push(node);
        } else if(entry.kind==='activity') {
          const activities=entry.values,key=activities[0].call_id;
          let detail=[...block.querySelectorAll('[data-coding-activity]')].find(node=>node.dataset.codingActivity===key);
          if(!detail) { detail=make('details'); detail.className='coding-activity'; detail.dataset.codingActivity=key; }
          timeline.renderGroup(detail,activities,run,entry===groups.findLast(group=>group.kind==='activity') && run===all.at(-1));
          ordered.push(detail);
        } else if(entry.kind==='changes') ordered.push(turnChanges.place(block,entry.value,run,terminal(run.phase) && run===all.at(-1) && !recovery && !checkpointBusy));
        else {
          const question=entry.value,key=JSON.stringify([run.ref.run_id,question.pending_id,question.pending_revision]);
          const form=[...block.querySelectorAll('[data-coding-question]')].find(node=>node.dataset.questionKey===key);
          if(form) ordered.push(form);
        }
      }
      // The running plan sits right under the task it came from, kept in place by the same ordering as every entry.
      // A graph continued by a later round is shown once, on the round now working on it.
      const planEntry=planEntries.find(entry=>entry.run_id===run.ref.run_id),projectId=planEntry?.board?.project_id;
      const laterOnSameGraph=projectId && all.slice(all.indexOf(run)+1).some(later=>planEntries.find(entry=>entry.run_id===later.ref.run_id)?.board?.project_id===projectId);
      if(laterOnSameGraph)block.querySelector(':scope > .coding-plan-progress')?.remove();
      // The latest plan round keeps its graph open to change when only ended conversation rounds came after it.
      const graphLatest=Boolean(planEntry?.board) && all.slice(all.indexOf(run)+1).every(later=>terminal(later.phase) && !planEntries.some(entry=>entry.run_id===later.ref.run_id));
      const planCard=laterOnSameGraph?null:planProgress.render(run,planEntry,run===all.at(-1) && !terminal(run.phase),run===all.at(-1) || graphLatest);
      if(planCard){const at=ordered.findIndex(node=>node.dataset?.kind==='user');ordered.splice(at+1,0,planCard);}
      // Children appear right after the step that sent them.
      const children=subagentCards.render(run,subagentGroups.find(group=>group.run_id===run.ref.run_id));
      if(children){const at=ordered.map(node=>Boolean(node.classList?.contains('coding-activity') && node.querySelector('[data-kind="dispatch-subagent"]'))).lastIndexOf(true);ordered.splice(at>=0?at+1:ordered.length,0,children);}const cards=renderCards(block,run);if(cards)ordered.push(cards);
      // While the model is still writing its latest reply, a caret marks the end of that text — and only that text.
      const writing=run===all.at(-1) && ['starting','running'].includes(run.phase) && groups.at(-1)?.kind==='turn' && groups.at(-1).value.kind==='assistant';
      ordered.forEach((node,at)=>{if(node.classList?.contains('coding-turn'))node.classList.toggle('is-writing',writing && at===ordered.length-1);});
      for(const detail of block.querySelectorAll(':scope > [data-coding-activity]')) if(!ordered.includes(detail)) detail.remove();
      // The supplement on its way shows after the round it goes to, until the round's own record has it; after that, the tray of what is still open (the queue, and the round's ledger).
      const last=run===all.at(-1),sending=last&&inputReceipts.bubble(current,run),waiting=last&&host.receipts.tray(turns,queuedInputs,{run_id:run.ref.run_id},inputReceipts.act(current,run.ref.run_id));for(const node of [sending,waiting])if(node)ordered.push(node);for(const node of block.querySelectorAll(':scope > .is-sending,:scope > .mw-tray'))if(node!==sending&&node!==waiting)node.remove();
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
        if(!inline){inline=make('div');inline.className='coding-inline-review';inline.dataset.codingInlineReview='';}
        const footer=block.querySelector(':scope > .coding-run-footer');if(inline.nextElementSibling!==footer || inline.parentElement!==block)block.insertBefore(inline,footer);const signal=viewSignal;void Promise.resolve(showReviews(inline,[run.ref],runtimeSessionId)).then(()=>{if(!signal?.aborted)offerApproval(inline);});
      } else inline?.remove();
      timeline.renderFooter(block,run,all.indexOf(run),run===all.at(-1) && (run.phase==='reconcile-required' || !recovery && !checkpointBusy),run!==all.at(-1) && graphLatest && !recovery && !checkpointBusy);
    }
    renderCommands(all);const row=q('[data-coding-steps]'),next=all.at(-1)?.next_html || '';if(row.dataset.html!==next){const at=document.activeElement,had=row.contains(at);row.innerHTML=next;row.dataset.html=next;row.hidden=!next;if(had)toInput(row.querySelector('[data-ix-step-id="'+CSS.escape(at.dataset.ixStepId)+'"]:not(:disabled)'));}
    // One row per finished round: its changes and its report, newest first.
    const ended=all.filter(run=>['completed','failed','stopped','cancelled'].includes(run.phase)),outcomeList=q('[data-coding-outcome-list]');
    q('[data-coding-outcomes]').hidden=!ended.length;
    const outcomeIcon=(name)=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS('http://www.w3.org/2000/svg','use');svg.setAttribute('aria-hidden','true');use.setAttribute('href','#icon-'+name);svg.append(use);return svg;};
    const rows=new Map([...outcomeList.children].map(node=>[node.dataset.codingOutcome,node]));
    for(const run of ended) {
      let row=rows.get(run.ref.run_id);
      if(!row) {
        row=make('div');row.className='coding-outcome';row.dataset.codingOutcome=run.ref.run_id;
        const name=make('span'),phase=make('span'),change=make('button'),report=make('button');
        name.className='coding-outcome-name';phase.className='coding-outcome-phase';
        change.type='button';change.className='mw-btn mw-btn--ghost';change.dataset.codingChangeOpen=run.ref.run_id;change.append(outcomeIcon('columns'),L('coding.short.change'));
        report.type='button';report.className='mw-btn mw-btn--ghost';report.dataset.codingReportOpen=run.ref.run_id;report.append(outcomeIcon('file'),L('coding.outcome.report'));
        row.append(name,phase,change,report);outcomeList.prepend(row);
      }
      row.querySelector('.coding-outcome-name').textContent=L('coding.turn.number',{number:all.indexOf(run)+1});
      const phase=row.querySelector('.coding-outcome-phase');phase.textContent=phases[run.phase] || run.phase;phase.dataset.mwState=phaseRing(run.phase);phase.dataset.tone=run.phase==='completed'?'done':run.phase==='failed'?'failed':'idle';
    }
    lastRun=all.at(-1)||null;
    const result=q('[data-coding-result]');
    if(!lastRun) { result.textContent=L('coding.facts.empty'); delete result.dataset.content; if(statusKey!=='idle'){statusKey='idle';status('');} }
    if(lastRun) {
      // Only what this round actually used is listed; what it did not use is named once, so nothing is silently omitted.
      const f=lastRun.frozen,values=[[L('coding.facts.model'),f.model_id],[L('coding.facts.usage'),codingUsageSummary(lastRun.usage,L)],[L('coding.facts.scope'),f.directory?.canonical_path || L('coding.facts.no-directory')]],unused=[];
      if(f.subagent_workspaces?.length) values.push([L('coding.facts.subagent-dirs'),f.subagent_workspaces.map(item=>item.directory.canonical_path).join(L('coding.list.semicolon'))]);
      values.push([L('coding.facts.role'),f.role_id+' · v'+f.role_version]);
      if(f.skills.length) values.push([L('coding.facts.methods'),f.skills.map(method=>L(method.name)+' · v'+method.version).join(L('coding.list.joiner'))]); else unused.push(L('coding.attach.method'));
      if((f.action_tools || []).length) values.push([L('coding.facts.actions'),f.action_tools.map(ref=>ref.capability_id+' · v'+ref.version+' · '+ref.provider_id).join(L('coding.list.joiner'))]); else unused.push(L('coding.attach.actions'));
      if(f.mcp_tools?.length) values.push([L('coding.facts.mcp'),f.mcp_tools.map(tool=>(tool.server_label || tool.server)+' / '+tool.tool+' · '+L('coding.facts.configuration',{version:tool.configuration_version ?? L('coding.facts.not-recorded')})+' · '+tool.version).join(L('coding.list.joiner'))]); else unused.push('MCP');
      if((f.mcp_sources || []).length) values.push([L('coding.facts.mcp-sources'),f.mcp_sources.map(source=>(source.server_label || source.server)+' · '+L('coding.facts.configuration',{version:source.configuration_version})).join(L('coding.list.joiner'))]); else unused.push(L('coding.facts.mcp-source-kind'));
      const character=f.character;
      if(character) values.push([L('coding.facts.character'),character.title+' · v'+character.reference.version],[L('coding.facts.host-tools'),f.host_tools?.join(L('coding.list.joiner')) || L('coding.facts.no-host-tools')]); else unused.push('Character');
      if(f.text_materials.length) values.push([L('coding.facts.materials'),f.text_materials.map(material=>material.title || material.source_artifact_id).join(L('coding.list.joiner'))]); else unused.push(L('coding.attach.material'));
      if(f.compaction) values.push([L('coding.facts.compaction'),L('coding.facts.compaction-value',{tokens:f.compaction.above_tokens,version:f.compaction.version})]);
      if(!lastRun.usage.compaction && lastRun.activity.some(item=>item.name==='上下文整理')) values.push([L('coding.facts.usage-scope'),L('coding.facts.usage-scope-value')]);
      const phaseLabel=phases[lastRun.phase]||lastRun.phase,tone=lastRun.phase==='completed'?'done':lastRun.phase==='failed'?'failed':terminal(lastRun.phase)?'idle':'live';
      const key=JSON.stringify([all.length,phaseLabel,values,unused]);
      if(result.dataset.content!==key) {
        const head=make('header'),title=make('h3'),phase=make('span'),round=make('span'),dl=make('dl');
        head.className='coding-facts-head';title.textContent=L('coding.results.facts');phase.className='coding-facts-phase';phase.dataset.tone=tone;phase.dataset.mwState=phaseRing(lastRun.phase);phase.textContent=phaseLabel;round.className='coding-facts-round';round.textContent=L('coding.turn.number',{number:all.length});head.append(title,phase,round);
        values.forEach(([label,value])=>{const dt=make('dt');dt.textContent=label;const dd=make('dd');dd.textContent=value;if(label===L('coding.facts.scope')||label===L('coding.facts.subagent-dirs'))dd.className='is-path';dl.append(dt,dd);});
        result.replaceChildren(head,dl);
        if(unused.length){const note=make('p');note.className='coding-facts-unused';note.textContent=L('coding.facts.unused',{what:unused.join(L('coding.list.joiner'))});result.append(note);}
        result.dataset.content=key;
      }
      const nextStatus=lastRun.ref.run_id+':'+lastRun.phase+':'+lastRun.stop_reason;
      // The round's own footer shows its live state and outcome; this line only carries a failure worth reading twice.
      if(statusKey!==nextStatus){statusKey=nextStatus;status(lastRun.phase==='failed' ? (lastRun.stop_reason || phases.failed) : '',lastRun.phase==='failed');}
    }
    const pill=q('[data-coding-phase]'),live=lastRun && !terminal(lastRun.phase);pill.hidden=!live;if(live){pill.dataset.phase=lastRun.phase;pill.dataset.mwState=phaseRing(lastRun.phase);pill.textContent=phases[lastRun.phase]||lastRun.phase;}
    if(pinNow) follow.pin(); else if(held?.isConnected) turns.scrollTop+=held.getBoundingClientRect().top-heldTop;
    q('[data-coding-latest]').hidden=Boolean(reportRun) || pinNow; controls();
  };
  const readRecovery = async () => {
    if (!current || recoveryLoading || recoveryBusy) return;
    const id=current, ticket=generation; recoveryLoading=true;
    const area=q('[data-coding-recovery]');area.hidden=false;
    q('[data-coding-recovery-status]').textContent=L('coding.recovery.loading');
    q('[data-coding-recovery-refresh]').disabled=true;
    try {
      const report=await api(sessionPath(id)+'/recovery');
      if(current!==id || ticket!==generation) return;
      const list=q('[data-coding-recovery-list]');list.replaceChildren();
      const labels={completed:L('coding.recovery.done'),failed:L('coding.recovery.failed'),'not-dispatched':L('coding.recovery.not-dispatched'),unknown:L('coding.recovery.unknown')};
      report.runs.forEach((run,index)=>{
        const section=make('section');
        // A subtask's interrupted round is named after the subtask, so the person knows what closing it settles.
        const child=run.subagent?subagentGroups.flatMap(group=>group.children||[]).find(entry=>entry.subagent_id===run.subagent.subagent_id):null;
        // Subtasks of one role read alike; the directory each one worked in tells them apart.
        const where=child?.workspace_path?child.workspace_path.split('/').at(-1):'';
        const heading=make('h4');heading.textContent=run.subagent?L(where?'coding.recovery.subtask-where':'coding.recovery.subtask',{role:child?.role_name||L('coding.results.subagents'),where}):L('coding.recovery.turn',{number:index+1});section.append(heading);
        if(run.subagent){const row=make('p');row.textContent=L('coding.recovery.subtask-note');section.append(row);}
        run.operations.forEach(operation=>{const row=make('p');row.textContent=L('coding.goal.field',{label:labels[operation.outcome],value:operation.summary});section.append(row);});
        if(!run.operations.length){const row=make('p');row.textContent=L('coding.recovery.no-operations');section.append(row);}
        if(run.waiting){const row=make('p');row.textContent=L('coding.recovery.waiting',{count:run.waiting});section.append(row);}
        run.blockers.forEach(message=>{const row=make('p');row.textContent=message;section.append(row);});
        const button=make('button');button.type='button';button.className='mw-btn';button.textContent=L('coding.recovery.end');
        button.dataset.codingRecover=run.run_id;button.dataset.version=String(run.version);button.disabled=!run.can_close;section.append(button);list.append(section);
      });
      // What waits in the session goes with the next round; the runtime's input record says what it is.
      if(report.inputs?.length){const row=make('p');row.textContent=L('coding.recovery.inputs',{count:report.inputs.length,inputs:report.inputs.map(input=>input.text).join(L('coding.list.semicolon'))});list.append(row);}
      q('[data-coding-recovery-status]').textContent=report.blockers.length?report.blockers.join('；'):report.runs.length?L('coding.recovery.checked'):L('coding.recovery.none');
    } catch(error) {if(!lifetime.alive)return;if(current===id && ticket===generation){recoveryKey='';q('[data-coding-recovery-list]').replaceChildren();q('[data-coding-recovery-status]').textContent=L('coding.recovery.check-failed',{reason:error.message});}}
    finally {if(ticket===generation){recoveryLoading=false;q('[data-coding-recovery-refresh]').disabled=false;}}
  };
  const readCheckpoints = async () => {
    if(!current || checkpointLoading) return;
    const id=current, ticket=generation;checkpointLoading=true;controls();
    try {
      const data=await api(sessionPath(id)+'/checkpoints');
      if(current!==id || generation!==ticket)return;
      const list=q('[data-coding-checkpoints-list]');list.replaceChildren();
      data.checkpoints.forEach(item=>{
        const row=make('section'), label=make('p'), meta=make('small'), button=make('button');
        label.textContent=item.label;const round=allRuns.findIndex(run=>run.ref?.run_id===item.origin_run_id);
        meta.textContent=new Date(item.created_at).toLocaleString()+(item.origin_run_id?' · '+(round>=0?L('coding.turn.number',{number:round+1}):L('coding.checkpoints.origin',{run:item.origin_run_id})):'')+(item.directory?' · '+item.directory.canonical_path:'');
        button.className='mw-btn';button.type='button';button.dataset.codingRewind=item.checkpoint_id;button.textContent=item.rewound_at?L('coding.checkpoints.preview-again'):L('coding.checkpoints.preview');button.setAttribute('aria-label',button.textContent+' '+item.label+' '+item.checkpoint_id);
        row.append(label,meta);
        // Already rewound here: say when, so the list does not read as untouched; the files may have changed since.
        if(item.rewound_at){const done=make('small');done.className='coding-checkpoint-done';done.textContent=L('coding.checkpoints.rewound',{at:new Date(item.rewound_at).toLocaleString()});row.append(done);}
        row.append(button);list.append(row);
      });
      q('[data-coding-checkpoints-status]').textContent=checkpointBusy?L('coding.checkpoints.busy-below'):data.checkpoints.length?L('coding.checkpoints.preview-first'):L('coding.checkpoints.none');
    } catch(error) {if(!lifetime.alive)return;
      if(current===id && generation===ticket){checkpointKey='';q('[data-coding-checkpoints-status]').textContent=L('coding.checkpoints.unreadable',{reason:error.message});}
    } finally {if(generation===ticket){checkpointLoading=false;controls();}}
  };
  // A live round is followed as it happens: the Host answers the moment it changes, so text arrives as it is written
  // rather than on the next timer tick. The regular refresh keeps everything else current at a slower pace.
  let liveRun='',liveTicket=0;
  const followLive=async(id,runId)=>{
    if(!lifetime.visible||liveRun===runId)return;liveRun=runId;const ticket=++liveTicket,signal=viewSignal;let since=null,failures=0;
    while(lifetime.visible && !signal?.aborted && current===id && liveRun===runId && ticket===liveTicket){
      try{
        const data=await api(sessionPath(id,runId)+'/live?timeout=20000'+(since?'&since='+encodeURIComponent(since):''),'GET',undefined,signal);
        if(current!==id || liveRun!==runId || ticket!==liveTicket)break;failures=0;since=data.version;
        const run=data.runs[0],at=windowRuns.findIndex(held=>held.ref.run_id===runId);if(at<0)break;
        windowRuns[at]=run;allRuns=allRuns.map(held=>held.ref.run_id===runId?run:held);
        renderRuns([run],allRuns);usageMeter.render({...lastData,runs:windowRuns},lastRun);
        if(terminal(run.phase)){void readCurrent();break;}
      }catch{if(signal?.aborted||!lifetime.visible||++failures>3)break;try{await lifetime.delay(1000,signal);}catch{break;}}
    }
    if(ticket===liveTicket&&liveRun===runId)liveRun='';
  };
  // Earlier rounds come back a page at a time as the reader scrolls up; what they were reading stays where it was.
  const loadEarlier=async()=>{
    const start=allRuns.findIndex(run=>!run.light);
    if(pageLoading || !current || start<=0)return;
    const id=current,ticket=generation;pageLoading=true;renderEarlier();
    try{
      const page=await api(sessionPath(id)+'/runs?before='+start+'&limit='+SESSION_PAGE);
      if(current!==id || ticket!==generation)return;
      page.runs.forEach(run=>olderViews.set(run.ref.run_id,run));olderPlanEntries.push(...(page.taskboard_plans || []));olderSubagents.push(...(page.subagents || []));
      allRuns=allRuns.map(run=>run.light && olderViews.get(run.ref.run_id) || run);
      planEntries=[...olderPlanEntries,...planEntries.filter(entry=>!olderPlanEntries.includes(entry))];subagentGroups=[...olderSubagents,...subagentGroups.filter(group=>!olderSubagents.includes(group))];
      // The results panel lists every loaded round's subtasks, so an earlier round's "评价并整合成果" finds its row.
      subagents.update(id,subagentGroups);
      // Drawn two rounds a frame, nearest first, so scrolling never waits on a whole page; renderRuns keeps the part being read put.
      const pending=page.runs.map(run=>olderViews.get(run.ref.run_id)).reverse();
      while(pending.length){
        if(current!==id || ticket!==generation)return;
        renderRuns(pending.splice(0,2).reverse(),allRuns);
        if(pending.length)await lifetime.nextFrame();
      }
    }catch(error){if(current===id)status(error.message,true);}
    finally{pageLoading=false;if(current===id)renderEarlier();}
  };
  const earlierWatch=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))void loadEarlier();},{root:turns,rootMargin:'900px 0px 0px 0px'});
  const renderEarlier=()=>{
    const hidden=allRuns.findIndex(run=>!run.light);
    let bar=turns.querySelector(':scope > [data-coding-earlier]');
    if(hidden<=0){if(bar){earlierWatch.unobserve(bar);bar.remove();}return;}
    if(!bar){bar=make('button');bar.type='button';bar.className='coding-earlier';bar.dataset.codingEarlier='';lifetime.listen(bar,'click',()=>void loadEarlier());earlierWatch.observe(bar);}
    if(turns.firstElementChild!==bar)turns.prepend(bar);
    bar.disabled=pageLoading;bar.textContent=pageLoading?L('coding.turns.loading-earlier'):L('coding.turns.show-earlier',{count:hidden});
  };
  const readCurrent = async (fresh=false) => {
    if(!current || loading && !fresh) return;
    const id=current, ticket=generation; loading=true;
    try {
      const read=(known)=>api(sessionPath(id)+'?window='+SESSION_WINDOW+(earlierFingerprint?'&earlier='+earlierFingerprint:'')+(known.length?'&known='+known.join(','):''));
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
      const resultsLabel=recovery || checkpointBusy || data.runs.some(run=>run.phase==='awaiting-review')?L('coding.results.pending'):L('coding.results.title');
      q('[data-coding-results-label]').textContent=resultsLabel;
      q('[data-coding-results-open]').setAttribute('aria-label', resultsLabel);
      if(recovery && recoveryKey!==id){recoveryKey=id;void readRecovery();}
      if(!q('[data-coding-title] input')) q('[data-coding-title]').textContent=data.session.title;
      // What the person is on, for the bottom Assistant: this session, at its round count. Data about the screen only.
      root.setAttribute('data-assistant-context',JSON.stringify({plugin_id:'io.molis.work.coding',surface_title:'Coding',
        object:{kind:'coding_session',id,title:data.session.title||L('coding.session.untitled'),version:String(data.run_count ?? data.runs.length)}}));
      q('[data-coding-goal-label]').textContent=data.session.goal_id?L('coding.goal.next',{title:data.session.goal_title || data.session.goal_id}):L('coding.goal.none-next-label');
      retitle(id,state.sessions.find(record=>record.session_id===id)?.title,data.session.title);
      state.sessions=state.sessions.map(record=>record.session_id===id ? data.session : record);
      // Settings saved elsewhere (the bottom Assistant, another window) are taken over unless this page holds a change of
      // its own not saved yet; otherwise its next save would quietly put the old choice back.
      const saved=canonical(data.configuration ?? null),adopted=adoptedConfigurations.get(id);
      if(!configurations.has(id)) configurations.set(id,data.configuration);
      else if(adopted!==undefined && saved!==adopted && canonical(configurations.get(id) ?? null)===adopted){configurations.set(id,data.configuration);if(!fresh){applyConfiguration();controls();}}
      // In step with what is saved: from here a difference is someone else's change. Out of step: this page's own change is still on its way.
      if(adopted===undefined || canonical(configurations.get(id) ?? null)===saved) adoptedConfigurations.set(id,saved);
      if(fresh) {
        if(!configurations.get(id)){
          q('[data-coding-intent]').value='discuss';
          q('[data-coding-model]').value=state.models[0] ? JSON.stringify([state.models[0].provider_id,state.models[0].model_id]) : '';
          workspaceId=state.workspace?.workspace_id || (state.workspaces?.length===1?state.workspaces[0].workspace_id:'');
        }
        applyConfiguration();void followWorkspace();
      }
      if(!mcpSourceSelections.has(id))mcpSourceSelections.set(id,data.mcp_sources || []);
      if(!mcpSelections.has(id))mcpSelections.set(id,data.mcp_tools || []);
      if(!actionSelections.has(id))actionSelections.set(id,data.action_tools || []);
      if(!materialSelections.has(id)) materialSelections.set(id,data.materials || []);
      if(!characterSelections.has(id)){characterSelections.set(id,data.character ?? null);characterTitles.set(id,data.character_title || '');if(data.character_skill_ids!==undefined)characterSkills.set(id,data.character_skill_ids);}
      if(!methodSelections.has(id)) methodSelections.set(id,data.methods || []);
      if(!questionDrafts.has(id)) {
        let saved;try{saved=JSON.parse(sessionStorage.getItem(draftKey(id)+':questions') || 'null');}catch{}
        questionDrafts.set(id,saved && typeof saved==='object' && !Array.isArray(saved) ? saved : data.question_drafts || {});
      }
      if(fresh || !draft.owns(id)) { draft.claim(id,data.draft); turns.replaceChildren(); if(!offsets.has(id))follow.resume(); }
      runtimeSessionId=data.session.runtime_session_id;queuedInputs=data.session.queued_inputs;planEntries=[...olderPlanEntries,...(data.taskboard_plans || [])];subagentGroups=[...olderSubagents,...(data.subagents || [])];renderRuns(data.runs,allRuns);renderEarlier();lastData=data;usageMeter.render(data,lastRun);void cooperationUi.refresh();
      if(lastRun && !terminal(lastRun.phase))void followLive(id,lastRun.ref.run_id);
      renderQueued(id,data.session.queued);
      renderPriority(id,data.session.priority===true);
      plans.update(id,data.plan ?? null,allRuns);
      subagents.update(id,subagentGroups);
      boardUpdate(id,data);
      stepReports.sync(id);
      if(checkpointBusy){statusKey='checkpoint';status(L('coding.checkpoints.busy-right'));}
      // The results panel lists this session's reviews by session, not by naming every round: open items always, and the
      // latest settled history with the rest one click away. It is only read while the panel is open.
      if(root.dataset.codingResults==='true')void showReviews(q('[data-coding-host-reviews]'), (data.subagents || []).flatMap(group=>(group.children || []).flatMap(child=>child.child_run ? [child.child_run] : [])), data.session.runtime_session_id, undefined, data.session.runtime_session_id ? {runSession:data.session.runtime_session_id,limit:30} : undefined);
      const nextCheckpointKey=JSON.stringify([id,data.runs.at(-1)?.ref.run_id,data.runs.at(-1)?.ended_at,checkpointBusy]);
      if(fresh || checkpointKey!==nextCheckpointKey){checkpointKey=nextCheckpointKey;void readCheckpoints();}
      if(data.error) status(data.error,true);
      if(fresh && offsets.has(id)) follow.restore(offsets.get(id));
      renderDirectory(); controls();
    } catch(error) {if(!lifetime.alive)return; if(error.name!=='AbortError'&&current===id && ticket===generation){if(error.code==='coding.session_unknown' || error.status===403)root.dispatchEvent(new CustomEvent('molis-work:item-unreadable',{bubbles:true,detail:{itemId:id}}));status(error.message,true);taskboard.fail(id,error.message);} }
    finally { if(ticket===generation) loading=false; }
  };
  const select = async(id) => {
    host.revealTask?.();
    root.dataset.codingResults='false';
    root.dataset.codingDetail='true';sessionOnShow=true;
    // The same session back on show (its tab reopened): the directory's faces read from what is already held.
    if(id===current){taskboard.refreshOutline();renderGoalFace();return selectionTask;}
    if(changeReview.active())changeReview.close();q('[data-coding-outcome-list]').replaceChildren();q('[data-coding-outcomes]').hidden=true;
    // A choice open in a dialog belongs to the session it was opened on: switching closes it unsaved.
    materialTicket++;goalTicket++;goalReading++;methodDocumentTicket++;
    // Materials are picked in the page's one knowledge picker, not a dialog here: the ticket above drops its answer.
    for(const name of choosers)if(name!=='material')q('[data-coding-'+name+'-dialog]').close();
    closeReport();
    if(current) { offsets.set(current,turns.scrollTop); void draft.flush().catch(error=>status(error.message,true)); }
    void showReviews(q('[data-coding-host-reviews]'), []);
    recoveryLoading=false;recoveryBusy=false;recoveryKey='';q('[data-coding-recovery-list]').replaceChildren();q('[data-coding-recovery]').hidden=true;
    resetWindow();cooperationUi.reset();current=id; draft.release(); generation++; loading=false; lastRun=null; recovery=false;checkpointBusy=false;checkpointLoading=false;checkpointKey='';statusKey='';
    taskboard.loading(id);
    q('[data-coding-checkpoints-list]').replaceChildren();q('[data-coding-checkpoints-status]').textContent=L('coding.checkpoints.loading');
    q('[data-coding-commands]').querySelectorAll(':scope > .coding-command').forEach(node=>node.remove());q('[data-coding-commands]').hidden=true;
    controls();selectionTask=readCurrent(true);await selectionTask;
  };
  const openCodingItem = async(itemId) => {
    const ticket=++itemTicket;reportItem='';changeItem='';
    const prefix=itemId.startsWith('coding-changeset:')?'coding-changeset:':itemId.startsWith('coding-report:')?'coding-report:':'';
    if(!prefix){await select(itemId);if(ticket===itemTicket){closeReport();changeReview.close();renderArtifacts();}return;}
    const parts=itemId.slice(prefix.length).split(':');
    if(parts.length!==2)throw new Error(L('coding.error.artifact-reference'));
    const id=decodeURIComponent(parts[0]),runId=decodeURIComponent(parts[1]);
    await select(id);if(ticket!==itemTicket || current!==id)return;
    if(prefix==='coding-changeset:'){changeItem=itemId;await changeReview.openFixed(runId);}else{reportItem=itemId;await showReport(runId);}if(ticket===itemTicket)renderArtifacts();
  };
  lifetime.listen(root,'molis-work:select-item',event=>{
    root.dataset.codingDetail=String(Boolean(event.detail.itemId));sessionOnShow=Boolean(event.detail.itemId);
    if(event.detail.itemId) void openCodingItem(event.detail.itemId).catch(error=>status(error.message,true));
    // Nothing on show any more (the tab closed): the faces say so rather than keep describing the closed session.
    else {taskboard.refreshOutline();renderGoalFace();void draft.flush().catch(error=>status(error.message,true));}
  });
  // A new session is only worth keeping once something is written in it: an untouched empty one is reused
  // instead of piling up. Anything with a draft, a Goal or a past run is left alone.
  const untouched = async() => {
    for(const session of state.sessions.filter(item=>item.state==='idle' && item.title===L('coding.session.new-title') && !item.goal_id)) {
      if(draft.local(session.session_id)) continue;
      try{const data=await api(sessionPath(session.session_id)+'?window=1');if(!data.runs.length && !(data.draft || '').trim() && !data.character && !(data.materials || []).length)return session;}catch{}
    }
    return null;
  };
  const create = async() => {
    const reuse=await untouched();
    const session=reuse || (await api('/sessions','POST',{title:L('coding.session.new-title')})).session;
    if(!reuse)await refreshState();
    host.openItem('coding',session.session_id,session.title);await select(session.session_id);
  };
  // Tells the bottom Assistant this session changed here (its mode, a new round), so a work it shows reads it again.
  const surfaceChanged=id=>{if(lifetime.alive && id)window.dispatchEvent(new CustomEvent('molis:assistant-surface-changed',{detail:{plugin_id:'coding',object:{kind:'coding-session',id}}}));};
  // The bottom Assistant can carry this same session through Coding's own actions. When it changes the session's
  // settings or starts a round, the page takes what is saved, so its next save cannot write the old choice back.
  lifetime.listen(window,'molis:assistant-effect',event=>{
    const detail=event.detail || {};
    if(typeof detail.capability_id!=='string' || detail.capability_id.indexOf('coding.')!==0 || !current || detail.session_id!==current)return;
    const id=current;
    void api(sessionPath(id)+'?window=1').then(data=>{
      if(current!==id || !data.configuration)return;
      const before=configurations.get(id)?.intent;
      configurations.set(id,{...configurations.get(id),...data.configuration});applyConfiguration();controls();
      if(before!==data.configuration.intent)status(L('coding.intent.changed-by-assistant',{intent:q('[data-coding-intent]').selectedOptions[0]?.textContent || data.configuration.intent}));
    }).catch(()=>{});
    void readCurrent();
  });
  let creatingCharacterSession=false;
  lifetime.listen(window,'molis-work:character-coding',event=>{
    if(creatingCharacterSession)return;
    const selected=event.detail;if(!selected?.reference)return;
    creatingCharacterSession=true;
    void (async()=>{
      const result=await api('/sessions','POST',{title:selected.title});const id=result.session.session_id;
      // Persist the exact publication and task before navigation; never start a paid run automatically.
      await api(sessionPath(id),'PATCH',{draft:selected.task || '',character:selected.reference,character_skill_ids:selected.skill_ids || []});
      await refreshState();host.openItem('coding',id,selected.title);await select(id);
      if(selected.workspace_id){workspaceId=selected.workspace_id;rememberConfiguration();await draft.flush();await refreshState();}
      input.focus();status(L('coding.character.brought-in'));
    })().catch(error=>{status(L('coding.character.session-failed',{reason:error.message}),true);}).finally(()=>{creatingCharacterSession=false;});
  });
  /** The composer keeps rarely used context behind one "+" so the bar stays about the task. */
  const attachMenu=q('[data-coding-attach-menu]'),attachToggle=q('[data-coding-attach-toggle]'),setAttach=open=>{attachMenu.hidden=!open;attachToggle.setAttribute('aria-expanded',String(open));};
  lifetime.listen(document,'click',event=>{if(!attachMenu.hidden && !event.target.closest('[data-coding-attach-toggle]'))setAttach(false);});
  lifetime.listen(root,'keydown',event=>{if(event.key==='Escape' && !attachMenu.hidden){setAttach(false);attachToggle.focus();}});
  lifetime.listen(attachToggle,'click',()=>setAttach(attachMenu.hidden));
  const click = async(event) => {
    const target=event.target.closest('button,a'); if(!target) return;
    try {
      // A next step presses the control it names on screen (FLOW-01): an option and its question's submit, or a round card's button.
      if(target.dataset.ixStepId){const id=target.dataset.ixStepId,form=[...turns.querySelectorAll('[data-coding-question]')].find(node=>(id+':').startsWith('question:'+JSON.parse(node.dataset.questionKey)[1]+':')),rest=form?id.slice(10+JSON.parse(form.dataset.questionKey)[1].length):'',cut=rest.indexOf(':'),option=cut>0 && form.querySelector('[data-ix-field="'+rest.slice(0,cut)+'"] [data-ix-option="'+CSS.escape(rest.slice(cut+1))+'"]'),card=id.startsWith('card:') && turns.querySelector('[data-card="'+CSS.escape(id.split(':')[1])+'"]'),first=form?.querySelector('[data-ix-focus]'),control=form?option && !option.disabled && form.querySelector('[type=submit]'):card?id.endsWith(':run') && card.ixBase===JSON.stringify(card.ix?.read()) && card.querySelector('[data-ix-action="run"]'):id.startsWith('[') && turns.querySelector(id);(form||card||undefined)?.scrollIntoView({block:'nearest'});if(!control)(card||first?.querySelector('[aria-checked=true]')||first?.querySelector('button:not(:disabled)')||first)?.focus();if(control && !control.disabled){option?.click();control.click();}return;}
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
        catch(error){if(!lifetime.alive)return;if(ticket===goalTicket && reading===goalReading)q('[data-coding-goal-error]').textContent=error.message;}
      }
      if(target.matches('[data-coding-report-output]') && reportRun && !target.disabled) {
        const id=current,runId=reportRun,ticket=reportTicket;
        if(!reportOutput) {await loadReportOutput(id,runId,ticket);return;}
        target.disabled=true;
        try {await api(sessionPath(id,runId)+'/report/output','POST',{expected_reference:reportOutput.current});await loadReportOutput(id,runId,ticket);}
        catch(error) {if(!lifetime.alive)return;if(ticket===reportTicket && id===current){await loadReportOutput(id,runId,ticket);if(ticket===reportTicket)q('[data-coding-report-output-status]').textContent=L('coding.report.output-reread',{reason:error.message});}}
      }
      if(target.matches('[data-coding-report-save]') && reportRun && !reportSaving) await showReport(reportRun,true);
      if(target.matches('[data-coding-recovery-refresh]')) await readRecovery();
      if(target.matches('[data-coding-recover]')) {
        if(recoveryBusy || target.disabled) return;
        const id=current,ticket=generation;recoveryBusy=true;
        q('[data-coding-recovery]').querySelectorAll('button').forEach(button=>button.disabled=true);
        try {
          await api(sessionPath(id,target.dataset.codingRecover)+'/recover','POST',{expected_version:Number(target.dataset.version)});
          if(current===id && generation===ticket){status(L('coding.recovery.ended'));await readCurrent();}
        } catch(error) {if(current===id && generation===ticket) status(L('coding.recovery.end-failed',{reason:error.message}),true);}
        finally {if(current===id && generation===ticket){recoveryBusy=false;if(recovery)await readRecovery();controls();}}
      }
      if(target.matches('[data-coding-checkpoints-refresh]')) await readCheckpoints();
      if(target.matches('[data-coding-rewind]')) {
        const id=current,ticket=generation;checkpointBusy=true;controls();
        try {
          // A rewind is the person's own reviewed file change, not a round: it does not depend on the composer's mode.
          const chosen=q('[data-coding-intent]').value,intent=['edit','execute'].includes(chosen)?chosen:'edit';
          await api(sessionPath(id)+'/checkpoints/'+encodeURIComponent(target.dataset.codingRewind)+'/rewind','POST',{intent});
          if(current===id && generation===ticket){status(L('coding.checkpoints.preview-ready'));await readCurrent();}
        } catch(error) {if(!lifetime.alive)return;if(current===id && generation===ticket){checkpointBusy=false;throw error;}}
        finally {controls();}
      }
      if(target.matches('[data-coding-mcp-open]')) {const id=current;await refreshState();if(current!==id || shut())return;mcpChoices=structuredClone(mcpSelections.get(current) || []);mcpSourceChoices=structuredClone(mcpSourceSelections.get(current) || []);renderMcp();q('[data-coding-mcp-error]').textContent='';q('[data-coding-mcp-dialog]').showModal();}
      if(target.matches('[data-coding-mcp-settings-link]'))q('[data-coding-mcp-dialog]').close();
      if(target.matches('[data-coding-mcp-close]'))q('[data-coding-mcp-dialog]').close();
      if(target.matches('[data-coding-material-open]')) await openMaterials();
      if(target.matches('[data-coding-delegate-open]')) await cooperationUi.openDialog();
      // A round that only announced its next step goes on when the person asks, with the same way of working.
      if(target.matches('[data-coding-nudge]') && !sending) {
        const run=allRuns.find(item=>item.ref.run_id===target.dataset.codingNudge);if(!run || run.light)return;
        const said=[...run.turns].reverse().find(turn=>turn.kind==='assistant')?.text.trim() || '',asked=ownTask(run.turns.find(turn=>turn.kind==='user')?.text || '');
        const intent={builder:'execute',writer:'edit',reader:'discuss',reviewer:'review',planner:'plan',coordinator:'collaborate'}[run.frozen.role_id] || q('[data-coding-intent]').value;
        const id=current,modelValue=q('[data-coding-model]').value;sending=true;controls();
        try{await startRound(id,'上一轮你说「'+said+'」之后就结束了，没有调用任何工具，所以还什么都没做。请直接调用工具执行下一步，完成原任务：\\n'+asked,intent,modelValue,currentSelection(id));status(L('coding.run.nudged'));follow.resume();await refreshState();await readCurrent();}
        catch(error){status(error.message,true);}finally{sending=false;controls();}
      }
      // Committing a round's changes happens in Git, under Host review; the round only drafts the message.
      if(target.matches('[data-coding-commit-round]')) {
        const run=allRuns.find(item=>item.ref.run_id===target.dataset.codingCommitRound);if(!run || run.light)return;
        // The person's own request titles the commit, unwrapped from a "let it continue" or a continuation the product composed.
        let request=ownTask(run.turns.find(turn=>turn.kind==='user')?.text || '');
        const handed=request.indexOf('完成原任务：\\n');if(request.startsWith('上一轮你说「') && handed>=0)request=request.slice(handed+'完成原任务：\\n'.length);
        if(request.startsWith(CONTINUATION_MARKER)){const from=request.indexOf('原任务：\\n'),to=request.indexOf('\\n\\n宿主核实的事实');if(from>=0)request=request.slice(from+'原任务：\\n'.length,to>from?to:undefined);}
        const asked=request.trim().split('\\n')[0].replace(/^#+\\s*/,'');
        const answer=[...run.turns].reverse().find(turn=>turn.kind==='assistant')?.text || '';
        const points=answer.split('\\n').map(line=>line.replace(/^[#>*\\-\\s\\d.、]+/,'').replace(/[*\x60]/g,'').trim()).filter(line=>line.length>4).slice(0,5);
        const files=[...new Set(run.activity.filter(item=>['edit','write'].includes(item.name) && item.state==='completed' && item.target).map(item=>item.target))];
        const title=asked.length>72?asked.slice(0,70)+'…':asked;
        let draft=[title,'',...points.map(point=>'- '+point),'',L('coding.commit.files'),...files.map(file=>'- '+file)].join('\\n').trim(),note,failed=false;
        // The model drafts from every recent round that changed files (a call that costs a little); the rule draft above stays as the fallback.
        const id=current;target.disabled=true;status(L('coding.commit.drafting'));
        try{const [provider_id,model_id]=JSON.parse(q('[data-coding-model]').value || '[]');
          const result=await api(sessionPath(id,run.ref.run_id)+'/commit-draft','POST',{provider_id,model_id});
          draft=result.message;note=L(result.usage?'coding.commit.drafted-usage':'coding.commit.drafted',{rounds:result.rounds.join(L('coding.list.joiner')),tokens:result.usage?(result.usage.input+result.usage.output).toLocaleString():''});}
        catch(error){if(!lifetime.alive)return;failed=true;note=L('coding.commit.draft-failed',{reason:error.message});}
        finally{target.disabled=false;}
        if(id!==current)return;
        // The Git view works on the project's browsing directory (project settings); point it at the round's own directory first.
        const ownWorkspace=(state.workspaces || []).find(item=>item.canonical_path===run.frozen.directory?.canonical_path),own=ownWorkspace?.workspace_id || workspaceId;
        try{sessionStorage.setItem('molis-commit-draft:'+own,draft);}catch{}
        let pointed=false;
        try{await useProjectWorkspace(own);pointed=true;}catch{}
        directory.querySelector('[data-coding-face=files]')?.click();
        // Git would otherwise stay on another directory, where this message does not belong: say so rather than claim it is there.
        status(pointed?note:L(ownWorkspace?'coding.commit.git-not-pointed-named':'coding.commit.git-not-pointed',{name:ownWorkspace?.display_name||''}),failed || !pointed);
      }
      if(target.matches('[data-coding-method-open]')) openMethods();
      if(target.matches('[data-coding-method-close]')) {methodDocumentTicket++;q('[data-coding-method-dialog]').close();input.focus();}
      if(target.matches('[data-coding-search-toggle]')){const query=directory.querySelector('[data-coding-query]');query.hidden=!query.hidden;target.setAttribute('aria-expanded',String(!query.hidden));if(!query.hidden)directory.querySelector('[data-coding-search]').focus();}
      if(target.matches('[data-coding-context-toggle]')){const context=q('[data-coding-context]');context.hidden=!context.hidden;target.setAttribute('aria-expanded',String(!context.hidden));}
      if(target.matches('[data-coding-workspace-open]')) { q('[data-coding-workspace-dialog]').showModal(); }
      if(target.matches('[data-coding-workspace-close]')) q('[data-coding-workspace-dialog]').close();
      if(target.matches('[data-coding-results-open]')) {root.dataset.codingResults=root.dataset.codingResults==='true'?'false':'true';if(root.dataset.codingResults==='true'){q('[data-coding-results-close]').focus({preventScroll:true});void readCurrent();}}
      if(target.matches('[data-coding-results-close]')) {root.dataset.codingResults='false';q('[data-coding-results-open]').focus({preventScroll:true});}
      if(target.matches('[data-coding-directory-back]')) {root.dataset.codingDetail='false';(directory.querySelector('[aria-current=true]') || directory.querySelector('[data-coding-new]'))?.focus({preventScroll:true});}
      if(target.matches('[data-coding-prompt]') && !input.value.trim() && !shut()){const intent=q('[data-coding-intent]'),wanted=[...intent.options].find(option=>option.value===target.dataset.codingPromptIntent && !option.disabled);if(wanted){intent.value=wanted.value;intent.dispatchEvent(new Event('change',{bubbles:true}));}input.value=target.dataset.codingPrompt;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();input.setSelectionRange(input.value.length,input.value.length);}
      if(target.matches('[data-coding-new]')) { event.preventDefault(); target.disabled=creating=true;controls(); try { await create(); } finally { target.disabled=creating=false;controls(); } input.focus(); }
      // The first list is drawn by the server, so a row can be clicked before the directory read has arrived.
      // ⌘/Ctrl-click opens the session in the pane beside this one; this pane keeps the session it shows.
      if(target.matches('[data-coding-session]')) { event.preventDefault(); const id=target.dataset.codingSession,session=state.sessions.find(item=>item.session_id===id),title=session?.title || (target.querySelector('.coding-session-title,strong,.mw-dir-row__title')?.textContent || '').trim();
        if((event.metaKey || event.ctrlKey) && host.openBeside){host.openBeside('coding',id,title);return;}
        host.openItem('coding',id,title);await select(id); }
      if(target.matches('[data-coding-open-beside]')) { host.openBeside?.('coding'); return; }
      if(target.matches('[data-coding-filter]')) { directory.querySelectorAll('[data-coding-filter]').forEach(item=>{item.setAttribute('aria-pressed',String(item===target));}); renderDirectory(); }
      // A face changes the directory column only. The Files face is the companion browsers' (the Host shows them);
      // every other face hides them and shows its own panel. The main area keeps whatever it shows.
      if(target.matches('[data-coding-face]')) {
        const face=target.dataset.codingFace,handled=host.onDirectoryFace?.(face) ?? false;
        if(face==='files' && !handled){status(L('coding.face.files-unavailable'));return;}
        directory.dataset.codingCurrentFace=face;
        directory.querySelector('[data-coding-artifact-directory]').hidden=face!=='artifacts';
        directory.querySelector('[data-coding-goal-face]').hidden=face!=='goals';
        directory.querySelectorAll('[data-coding-face]').forEach(button=>{button.setAttribute('aria-pressed',String(button===target));});
        directory.querySelector('.mw-dir__label').textContent=face==='taskboard'?'TaskBoard':face==='goals'?L('coding.face.goals'):face==='artifacts'?L('coding.face.artifacts'):face==='files'?L('coding.face.files'):L('coding.face.sessions');
        if(face==='taskboard'){taskboard.showOutline();if(current)await readCurrent();}else taskboard.hideOutline();
        if(face==='goals')renderGoalFace();
        if(face==='artifacts')await loadArtifacts();
      }
      if(target.matches('[data-coding-view]')){const open=target.dataset.codingView==='board';showBoard(open);if(open&&current)await readCurrent();}
      // Expanding from the directory brings the session's main area back on a narrow screen, where the two take turns.
      if(target.matches('[data-coding-board-expand]') && current && onShow()){host.revealTask?.();root.dataset.codingDetail='true';showBoard(true);await readCurrent();q('[data-coding-board]').focus({preventScroll:true});}
      if(target.matches('[data-coding-board-close]')){showBoard(false);q('[data-coding-view=dialogue]')?.focus({preventScroll:true});}
      if(target.matches('[data-coding-goal-face-open]')) await openGoals();
      if(target.matches('[data-coding-goal-face-visit]') && target.dataset.goalId) host.openItem('goals',target.dataset.goalId,target.dataset.goalTitle || '');
      if(target.matches('[data-coding-latest]')) { follow.toLatest();target.hidden=true; }
      if(target.matches('[data-coding-continue]')) { target.disabled=true; await continueRound(target.dataset.codingContinue); target.disabled=false; }
      if(target.matches('[data-coding-recover-continue]')) { target.disabled=true; await recoverAndContinue(target.dataset.codingRecoverContinue); target.disabled=false; }
      if(target.matches('[data-coding-pause]') && lastRun) {
        const action=target.dataset.action==='resume'?'resume':'pause';target.disabled=true;
        try { await api(sessionPath(current)+'/control','POST',{run_id:lastRun.ref.run_id,kind:action});status(action==='pause'?L('coding.run.pause-received'):L('coding.run.resumed'));await readCurrent(); }
        catch(error) { status(error.message,true); } finally { controls(); }
      }
      if(target.matches('[data-coding-stop]') && lastRun) { target.disabled=true;await api(sessionPath(current)+'/control','POST',{run_id:lastRun.ref.run_id,kind:'stop'});status(L('coding.run.stop-received'));await readCurrent(); }
      if(target.matches('[data-coding-archive]') && current) {
        if(!await host.confirm(L('coding.session.archive-confirm')))return;
        target.disabled=true;
        const id=current;
        try {
          await api(sessionPath(id),'PATCH',{archive:true});
          generation++;current='';lastRun=null;root.dataset.codingDetail='false';sessionOnShow=false;taskboard.loading('');renderGoalFace();
          await refreshState();status(L('coding.session.archived'));
        } finally {target.disabled=false;}
      }
      if(target.matches('[data-coding-rename]') && current) {
        const title=q('[data-coding-title]'); if(title.querySelector('input')) return;
        const field=make('input');field.className='mw-input';field.value=title.textContent;field.setAttribute('aria-label',L('coding.session.name'));title.replaceChildren(field);field.focus();field.select();
        const save=async()=>{const id=current;const result=await api(sessionPath(id),'PATCH',{title:field.value});title.textContent=result.session.title;await refreshState();host.openItem('coding',id,result.session.title);status(L('coding.session.name-saved'));};
        lifetime.listen(field,'keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();void save().catch(error=>status(error.message,true));}if(event.key==='Escape') title.textContent=state.sessions.find(item=>item.session_id===current)?.title || '';});
        status(L('coding.session.rename-hint'));
      }
    } catch(error) { status(error.message,true);controls(); }
  };
  lifetime.listen(root,'click',click);
  lifetime.listen(directory.querySelector('[data-coding-search]'),'input',renderDirectory);
  // Late growth (a review card loading, a group opening) keeps a following reader at the newest line.
  lifetime.observe(new MutationObserver(()=>{if(!reportRun)follow.pin();}),turns,{childList:true,subtree:true,characterData:true});
  for(const field of [q('[data-coding-intent]'),q('[data-coding-model]'),q('[data-coding-effort]')])lifetime.listen(field,'change',()=>{
    const id=current;rememberConfiguration();controls();void draft.flush().then(()=>surfaceChanged(id)).catch(error=>status(L('coding.configuration.unsaved',{reason:error.message}),true));
  });
  lifetime.listen(q('[data-coding-method-search]'),'input',renderMethods);
  lifetime.listen(q('[data-coding-goal-search]'),'input',renderGoalRows);
  lifetime.listen(q('[data-coding-goal-dialog]'),'cancel',event=>{if(goalSaving)event.preventDefault();else{goalTicket++;goalReading++;}});
  lifetime.listen(q('[data-coding-goal-form]'),'submit',async event=>{
    event.preventDefault();const button=q('[data-coding-goal-save]');if(button.disabled || goalSaving)return;
    const id=current,ticket=goalTicket,choice=goalChoice;goalSaving=true;button.disabled=true;
    try{await api(sessionPath(id)+'/goal','PUT',{goal_id:choice?.snapshot.goal.goal_id ?? null,expected_artifact_id:choice?.reference.artifact_id});
      if(ticket===goalTicket && current===id){q('[data-coding-goal-dialog]').close();await readCurrent();status(L('coding.goal.saved'));}
    }catch(error){if(!lifetime.alive)return;if(ticket===goalTicket)q('[data-coding-goal-error]').textContent=error.message;}
    finally{goalSaving=false;if(ticket===goalTicket)button.disabled=false;}
  });
  lifetime.listen(q('[data-coding-progress-dialog]'),'cancel',event=>{if(progressSaving){event.preventDefault();return;}rememberProgressDraft();progressTicket++;progressView=null;});
  for(const selector of ['[data-coding-progress-summary]','[data-coding-progress-next]'])lifetime.listen(q(selector),'input',()=>{rememberProgressDraft();q('[data-coding-progress-save]').disabled=!progressView?.preview?.current || progressSaving || !q('[data-coding-progress-summary]').value.trim();});
  lifetime.listen(q('[data-coding-progress-form]'),'submit',async event=>{
    event.preventDefault();const view=progressView;if(!view?.preview?.current || progressSaving || q('[data-coding-progress-save]').disabled)return;
    rememberProgressDraft();const currentGoal=view.preview.current;
    const body={summary:q('[data-coding-progress-summary]').value,next_step:q('[data-coding-progress-next]').value,expected_goal_cursor:currentGoal.state.goal_event_cursor};
    progressSaving=true;renderProgress();q('[data-coding-progress-status]').textContent=L('coding.progress.saving');
    try{const recorded=await api(sessionPath(view.id,view.runId)+'/report/progress','POST',body);
      if(progressView===view){view.preview.recorded=recorded;view.preview.current=null;try{sessionStorage.removeItem(progressDraftKey(view.id,view.runId));}catch{}}
    }catch(error){if(!lifetime.alive)return;if(progressView===view)q('[data-coding-progress-status]').textContent=L('coding.progress.save-failed',{reason:error.message});}
    finally{progressSaving=false;if(progressView===view)renderProgress();}
  });
  lifetime.listen(document,'molis-work:knowledge-picked',async event=>{
    const [owner,id,ticket]=String(event.detail?.request_id || '').split(':');
    if(owner!=='coding' || id!==current || Number(ticket)!==materialTicket)return;
    const selection=(event.detail.picks || []).map(pick=>({kind:pick.kind,id:pick.id,title:pick.title}));
    try{
      await draft.save(id,input.value,{materials:selection});materialSelections.set(id,selection);
      if(current===id){controls();input.focus();status(selection.length?L('coding.material.chosen',{count:selection.length}):L('coding.material.cleared'));}
    }catch(error){if(lifetime.alive)status(error.message,true);}
  });
  lifetime.listen(q('[data-coding-method-dialog]'),'cancel',()=>{methodDocumentTicket++;});
  lifetime.listen(q('[data-coding-mcp-form]'),'submit',async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
    const id=current,previous=mcpSelections.get(id),previousSources=mcpSourceSelections.get(id);mcpSelections.set(id,structuredClone(mcpChoices));mcpSourceSelections.set(id,structuredClone(mcpSourceChoices));
    try{await draft.saveChoices(id);q('[data-coding-mcp-dialog]').close();controls();status(L('coding.mcp.saved'));}
    catch(error){if(!lifetime.alive)return;mcpSelections.set(id,previous || []);mcpSourceSelections.set(id,previousSources || []);q('[data-coding-mcp-error]').textContent=error.message;}finally{button.disabled=false;}
  });
  lifetime.listen(q('[data-coding-method-form]'),'submit',async event=>{
    event.preventDefault();const submit=event.currentTarget.querySelector('[type=submit]');if(submit.disabled)return;
    submit.disabled=true;const id=current,selection=structuredClone(methodChoices);
    try {await draft.save(id,input.value,{methods:selection});methodSelections.set(id,selection);q('[data-coding-method-dialog]').close();controls();input.focus();status(L('coding.method.saved'));}
    catch(error){if(!lifetime.alive)return;q('[data-coding-method-error]').textContent=error.message;}finally{submit.disabled=false;}
  });
  lifetime.listen(q('[data-coding-workspace-form]'),'submit',async event=>{
    event.preventDefault(); const form=event.currentTarget,submit=form.querySelector('[type=submit]'),id=current; if(submit.disabled) return;submit.disabled=true;
    try {
      const path=q('[data-coding-workspace-path]').value.trim();
      if(path && !q('[data-coding-workspace-confirm]').checked) throw new Error(L('coding.workspace.confirm-needed'));
      const chosen=path?(await host.addWorkspace(path)).workspace_id:q('[data-coding-workspace-choice]').value;
      if(!chosen) throw new Error(L('coding.workspace.choose-needed'));
      // Chosen for the session it was opened on: once another one is on show (the switch closed this dialog), nothing more is set.
      if(current!==id)return;await useProjectWorkspace(chosen);if(current!==id)return;
      workspaceId=chosen;rememberConfiguration();await draft.flush();await refreshState();q('[data-coding-workspace-error]').textContent='';q('[data-coding-workspace-path]').value='';q('[data-coding-workspace-confirm]').checked=false;q('[data-coding-workspace-dialog]').close();
    } catch(error) {if(!lifetime.alive)return; q('[data-coding-workspace-error]').textContent=error.message; }
    finally {submit.disabled=false;}
  });
  lifetime.listen(directory.querySelector('[data-coding-artifact-search]'),'input',renderArtifacts);
  // The same commands in the composer's slash menu, the palette and the shortcuts; each says when it is not available.
  const codingCommands=()=>{
    const intents=[...q('[data-coding-intent]').options].map(option=>({slash:option.value,label:L('coding.palette.intent',{intent:option.textContent.replace(/\\s*[（(].*[）)]/,'')}),hint:L('coding.palette.intent-hint'),keywords:['方式','intent'],enabled:!option.disabled && !shut(),
      run:()=>{const select=q('[data-coding-intent]');select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));status(L('coding.intent.next',{intent:option.textContent}));input.focus();}}));
    return [...intents,
      {slash:'compact',label:L('coding.palette.compact'),hint:L('coding.palette.compact-hint'),keywords:['摘要','整理','context'],enabled:Boolean(!shut() && runtimeSessionId),
        run:async()=>{const id=current;await api(sessionPath(id)+'/compact','POST',{on:true});status(L('coding.palette.compact-done'));if(id===current)await readCurrent();}},
      {slash:'usage',label:L('coding.meter.title'),hint:L('coding.palette.usage-hint'),keywords:['cost','费用','预算','context'],enabled:!q('[data-coding-meter]').hidden,run:()=>q('[data-coding-meter-toggle]').click()},
      {slash:'materials',label:L('coding.attach.material'),hint:L('coding.palette.materials-hint'),keywords:['引用','材料','资料','reference'],enabled:!shut(),run:()=>openMaterials()},
      {slash:'methods',label:L('coding.attach.method'),hint:L('coding.palette.methods-hint'),keywords:['skill','技能'],enabled:!shut(),run:()=>openMethods()},
      {slash:'delegate',label:L('coding.delegate.title'),hint:L('coding.palette.delegate-hint'),keywords:['委派','delegate'],enabled:!shut(),run:()=>cooperationUi.openDialog()},
      {slash:'model',label:L('coding.palette.model'),hint:L('coding.palette.model-hint'),keywords:['model'],enabled:!shut(),run:()=>{const select=q('[data-coding-model]'),trigger=select.closest('.mw-select-picker')?.querySelector('.mw-select-picker__trigger');if(trigger){trigger.focus();trigger.click();}else select.focus();}},
      {slash:'workspace',label:L('coding.workspace.title'),hint:L('coding.palette.workspace-hint'),keywords:['目录','folder'],enabled:!shut(),run:()=>q('[data-coding-workspace-dialog]').showModal()},
      {slash:'new',label:L('coding.palette.new'),keys:'Mod+Alt+N',keywords:['new','会话'],run:()=>q('[data-coding-new]').click()},
      {slash:'stop',label:L('coding.run.stop-title'),hint:L('coding.palette.stop-hint'),keys:'',keywords:['stop','停止'],enabled:!q('[data-coding-stop]').hidden && !q('[data-coding-stop]').disabled,run:()=>q('[data-coding-stop]').click()},
      {slash:'results',label:L('coding.results.title'),keys:'Mod+Alt+R',keywords:['review','审查','结果'],run:()=>q('[data-coding-results-open]').click()},
      {slash:'palette',label:L('coding.palette.label'),keys:'Mod+Shift+P',keywords:['command','命令'],run:()=>commandsUi.openPalette()},
    ];
  };
  const commandsUi=(${CODING_COMMANDS_CLIENT_FACTORY_SCRIPT})({lifetime,q,input,status,commands:codingCommands,current:()=>current,
    workspace:()=>workspaceId,files:(key)=>api('/sessions/'+encodeURIComponent(current)+'/files?workspace_id='+encodeURIComponent(key)),
    symbols:(key,path)=>api('/sessions/'+encodeURIComponent(current)+'/symbols?workspace_id='+encodeURIComponent(key)+'&path='+encodeURIComponent(path)),
    sessions:()=>state.sessions.map(session=>({...session,state_label:SESSION_STATE[session.state] || ''})),
    openSession:(id,title)=>{host.openItem('coding',id,title || '');return select(id);}});
  lifetime.listen(input,'input',()=>turns.querySelectorAll('[data-coding-prompt]').forEach(button=>{button.disabled=Boolean(input.value.trim());}));
  lifetime.listen(input,'keydown' ,event=>{if(event.key==='Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing){event.preventDefault();q('[data-coding-composer]').requestSubmit();}});
  let queuedKey='';
  /** Marked the priority: others whose work overlaps it are asked to make way; nothing is paused. */
  const renderPriority=(id,on)=>{
    const button=q('[data-coding-priority]');if(!button)return;button.hidden=!id;button.dataset.session=id||'';
    button.setAttribute('aria-pressed',String(on));button.textContent=on?L('coding.priority.on'):L('coding.priority.mark');
  };
  lifetime.listen(q('[data-coding-priority]'),'click',async event=>{
    const button=event.currentTarget,id=button.dataset.session;if(!id)return;const on=button.getAttribute('aria-pressed')!=='true';button.disabled=true;
    try{const result=await api(sessionPath(id)+'/priority','POST',{on});renderPriority(id,result.priority);
      status(!on?L('coding.priority.cleared'):result.notified.length?L('coding.priority.notified',{sessions:result.notified.map(title=>L('coding.quote',{title})).join(L('coding.list.joiner')),paths:result.paths.join(L('coding.list.joiner'))}):L('coding.priority.no-one'));await refreshState();}
    catch(error){status(error.message,true);}finally{button.disabled=false;}
  });
  /** A round waiting for another session: what it waits for, and starting it now or giving the wait up. */
  const renderQueued=(id,queued)=>{
    const box=q('[data-coding-queued]'),next=JSON.stringify([id,queued]);if(next===queuedKey)return;queuedKey=next;
    box.hidden=!queued;box.replaceChildren();if(!queued)return;
    const text=make('p');text.textContent=queued.note||(queued.waiting_for==='reply'?L('coding.queued.reply',{title:queued.after_title})
      :queued.waiting_for==='command'?L('coding.queued.command',{title:queued.after_title}):L('coding.queued.run',{title:queued.after_title}));
    const act=(label,action,primary)=>{const b=make('button');b.type='button';b.className='mw-btn'+(primary?' mw-btn--primary':' mw-btn--ghost');b.textContent=label;
      lifetime.listen(b,'click',async()=>{b.disabled=true;try{await api(sessionPath(id)+'/queued','POST',{action});status(action==='start'?L('coding.queued.started'):queued.waiting_for==='reply'?L('coding.queued.reply-cancelled'):queued.waiting_for==='command'?L('coding.queued.command-cancelled'):L('coding.queued.cancelled'));queuedKey='';await refreshState();await readCurrent();}
        catch(error){status(error.message,true);}finally{b.disabled=false;}});return b;};
    const actions=make('div');actions.className='coding-queued-actions';actions.append(act(L('coding.queued.cancel'),'cancel'),act(L('coding.queued.start'),'start',true));
    box.append(text,actions);
  };
  /** Other work under way names the same files: wait for it, go ahead side by side, or not send. */
  const askOverlap = (overlaps) => new Promise(resolve => {
    const dialog=make('dialog');dialog.className='mw-dialog coding-overlap';dialog.setAttribute('aria-label',L('coding.overlap.label'));
    const box=make('div');box.className='mw-dialog__shell coding-overlap-body';
    const head=make('h2');head.textContent=L('coding.overlap.title');
    const list=make('ul');
    for(const overlap of overlaps){const item=make('li');const name=make('strong');name.textContent=L('coding.quote',{title:overlap.title});
      item.append(name,document.createTextNode(L(overlap.state==='running'?'coding.overlap.running':'coding.overlap.waiting',{task:(overlap.task||'').split('\\n')[0].slice(0,80),paths:overlap.paths.join(L('coding.list.joiner'))})));list.append(item);}
    const hint=make('p');hint.textContent=L('coding.overlap.hint');
    const actions=make('div');actions.className='coding-overlap-actions';
    const choose=(value)=>{dialog.close();dialog.remove();resolve(value);};
    const button=(label,value,primary)=>{const b=make('button');b.type='button';b.className='mw-btn'+(primary?' mw-btn--primary':'');b.textContent=label;b.dataset.codingOverlap=value;lifetime.listen(b,'click',()=>choose(value));actions.append(b);};
    button(L('coding.overlap.cancel'),'cancel');button(L('coding.overlap.parallel'),'parallel');button(L('coding.overlap.wait',{title:overlaps[0].title.slice(0,20)}),'wait',true);
    lifetime.listen(dialog,'cancel',event=>{event.preventDefault();choose('cancel');});
    box.append(head,list,hint,actions);dialog.append(box);root.append(dialog);dialog.showModal();
  });
  // One way to start a round, shared by the composer and by continuing from a breakpoint.
  const startRound = async (id,task,intent,modelValue,selection,extra={}) => {
    const [provider_id,model_id]=JSON.parse(modelValue);
    // A round that carries a digest waits for the model to write it first; say so rather than look stuck.
    if(id===current && lastData?.next_history?.history==='digest')status(L('coding.digest.writing'));
    const started=await api(sessionPath(id)+'/runs','POST',{...extra,task,intent,provider_id,model_id,...composerModels.effort(),workspace_id:selection.workspace_id,methods:selection.methods,...(selection.action_tools===undefined?{}:{action_tools:selection.action_tools}),mcp_tools:selection.mcp_tools,mcp_sources:selection.mcp_sources,materials:selection.materials,character:selection.character,character_skill_ids:characterSkills.get(id),...(intent==='parallel'?{writer_assignments:selection.writer_assignments}:{})});
    const digest=started?.digest;
    if(digest && id===current)status(digest.source==='model'?L(digest.usage?'coding.digest.model-usage':'coding.digest.model',{tokens:digest.usage?(digest.usage.input+digest.usage.output).toLocaleString():''})
      :L('coding.digest.host',{reason:digest.problem}),digest.source!=='model');
  };
  const currentSelection = (id) => ({workspace_id:workspaceId,methods:structuredClone(methodSelections.get(id) || []),mcp_tools:structuredClone(mcpSelections.get(id) || []),mcp_sources:structuredClone(mcpSourceSelections.get(id) || []),materials:structuredClone(materialSelections.get(id) || []),character:structuredClone(characterSelections.get(id) ?? null),writer_assignments:[]});
  // Continue an unfinished round (the Host states what already happened) or ask a closed question again; the composer draft stays untouched.
  const continueRound = async (runId,reask) => {
    if(sending || !current)return;
    const id=current,modelValue=q('[data-coding-model]').value;sending=true;controls();
    try {
      if(!state.models.some(model=>JSON.stringify([model.provider_id,model.model_id])===modelValue))throw new Error(L('coding.model.choose-first'));
      const next=reask?{intent:q('[data-coding-intent]').value}:await api(sessionPath(id,runId)+'/continuation');
      if(current!==id)return;
      // A plan round continues on its own graph; everything else starts a fresh round with the Host's facts.
      // The rest of a plan runs the way the person picks now: steps left after subtasks (such as running the tests) may
      // need execution rather than another round of parallel writers.
      const chosen=q('[data-coding-intent]').value,intent=next.continue_step_board_of&&['execute','parallel'].includes(chosen)?chosen:next.intent;
      // A parallel round goes on with the directories it was given; the saved split is what those subtasks used.
      const selection=currentSelection(id);if(intent==='parallel')selection.writer_assignments=structuredClone(configurations.get(id)?.writer_assignments || []);
      await startRound(id,next.task,intent,modelValue,selection,next.continue_step_board_of?{plan_revision:next.plan_revision,continue_step_board_of:next.continue_step_board_of}:{reask});
      if(!reask)status(L('coding.run.continued'));
      follow.resume();await refreshState();await readCurrent();
    } catch(error) {if(current===id)status(error.message,true);}
    finally {sending=false;controls();}
  };
  // An interrupted round is checked first; only a round whose outcomes are all known is closed and continued.
  const recoverAndContinue = async (runId) => {
    if(sending || !current)return;
    const id=current;
    try {
      const report=await api(sessionPath(id)+'/recovery');
      const entry=report.runs.find(run=>run.run_id===runId);
      // The round's subtasks were cut off with it; they are settled together, or a new round would be refused.
      const blocked=report.runs.find(run=>!run.can_close);
      if(!entry || blocked || report.blockers.length) {
        root.dataset.codingResults='true';recoveryKey='';void readRecovery();
        status(L('coding.run.blocked',{reason:report.blockers.length?report.blockers.join('；'):(blocked||entry)?.blockers?.join('；') || L('coding.run.unknown-operations')}),true);return;
      }
      for(const run of [...report.runs.filter(run=>run.subagent),entry])await api(sessionPath(id,run.run_id)+'/recover','POST',{expected_version:run.version});
      if(current!==id)return;
      await continueRound(runId);
    } catch(error) {if(current===id)status(error.message,true);}
  };
  lifetime.listen(q('[data-coding-composer]'),'submit',async(event)=>{
    event.preventDefault();if(shut() || recovery || checkpointBusy || !input.value.trim()) return;
    const id=current,task=input.value,action_tools=structuredClone(actionSelections.get(current)||[]),character=structuredClone(characterSelections.get(current) ?? null),materials=structuredClone(materialSelections.get(current) || []),mcp_sources=structuredClone(mcpSourceSelections.get(current) || []),mcp_tools=structuredClone(mcpSelections.get(current) || []),methods=structuredClone(methodSelections.get(current) || []),activeRun=lastRun,modelValue=q('[data-coding-model]').value,intent=q('[data-coding-intent]').value,workspace_id=workspaceId,writer_assignments=structuredClone(configurations.get(id)?.writer_assignments || []); sending=true;controls();
    try {
      rememberConfiguration();await draft.flush();
      if(activeRun && !terminal(activeRun.phase)) {
        const mode=q('[data-coding-send-mode]');status(await inputReceipts.steer(id,activeRun.ref.run_id,task,mode.value));mode.value='next-boundary';
      } else {
        // Another session already working on the same files in this directory: the person decides who goes first.
        const {overlaps}=await api('/sessions/'+encodeURIComponent(id)+'/scope-check','POST',{task,workspace_id});
        const choice=overlaps.length?await askOverlap(overlaps):'parallel';
        if(choice==='cancel'){status(L('coding.overlap.not-sent'));return;}
        if(choice==='wait'){
          await startRound(id,task,intent,modelValue,{workspace_id,methods,action_tools,mcp_tools,mcp_sources,materials,character,writer_assignments},{wait_for:overlaps[0].work_id});
          status(L('coding.overlap.will-wait',{title:overlaps[0].title}));
        } else await startRound(id,task,intent,modelValue,{workspace_id,methods,action_tools,mcp_tools,mcp_sources,materials,character,writer_assignments});
      }
      if(current===id && input.value===task){input.value='';window.molisFit?.(input);}
      if(draft.local(id)===task) await draft.save(id,''); surfaceChanged(id); await refreshState();await readCurrent();
    } catch(error) { status(error.message,true); }
    finally { sending=false;controls(); }
  });
  let pollingTicks=0;
  const conversationDelay=()=>!lastRun ? 2500 : ['starting','running','compacting','pausing'].includes(lastRun.phase) ? (liveRun ? 1200 : 350) : terminal(lastRun.phase) ? 2500 : 1000;
  lifetime.whenVisible(signal=>{
    viewSignal=signal;
    void refreshState().then(()=>{lifetime.assertCurrent(signal);return readCurrent();}).catch(error=>{if(!signal.aborted)status(error.message,true);});
    let timer=0;
    const followConversation=async()=>{
      try{lifetime.assertCurrent(signal);if(current)await readCurrent();}
      catch(error){if(!signal.aborted)status(error.message,true);}
      finally{if(!signal.aborted&&lifetime.visible)timer=lifetime.timeout(followConversation,conversationDelay());}
    };
    timer=lifetime.timeout(followConversation,conversationDelay());
    return()=>{lifetime.clearTimeout(timer);liveTicket++;liveRun='';};
  });
  lifetime.poll(async signal=>{
    await Promise.all([writerDirectories.refresh(),integrations.refreshReviews()]);lifetime.assertCurrent(signal);
    if(++pollingTicks%5===0)await refreshState();
  },1000,error=>status(error.message,true));
}`;
