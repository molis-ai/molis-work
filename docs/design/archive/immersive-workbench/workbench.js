'use strict';
const $ = (selector) => document.querySelector(selector);
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHtml = (value) => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
let goals = [
  { id:'experience', title:'让首次使用顺利开始', outcome:'从安装到第一次有效推进，让用户知道自己在哪、接下来做什么。', caption:'一个清楚的入口，一次真实的推进。', x:638,y:138, state:'active',status:'3 条路径',kind:'root',symbol:'target', parent:'项目目标',requirements:['用户能看懂第一步','能够接上正在使用的 Runtime','能查看第一次工作的结果'] },
  { id:'connect',title:'连接正在用的 Runtime',outcome:'用户能把当前使用的 Codex 或 Claude 连接到项目，并理解新会话会读取哪些信息。',caption:'让工具带着正确的项目上下文开始。',x:162,y:433,state:'done',status:'已完成',symbol:'terminal',parent:'首次使用体验',requirements:['连接步骤可照着操作','新会话能读到项目','出错时知道如何重试'] },
  { id:'guide',title:'让用户知道下一步',outcome:'用户第一次打开 Molis Work，就能找到值得开始的 Goal，并在同一处看过程、给反馈、检查结果。',caption:'进入画布之后，自然走向第一件事。',x:634,y:405,state:'waiting',status:'等你确认',kind:'focus',symbol:'chat',parent:'首次使用体验',requirements:['看得懂项目正在做什么','可以直接展开一个 Goal 开始工作','确认首次打开时的引导方式'] },
  { id:'result',title:'让工作结果可以检查',outcome:'每次工作都有可读的成果和证据，用户能在 Goal 中直接检查，而不是到处寻找。',caption:'把成果、检查和决定放在一起。',x:1126,y:440,state:'active',status:'准备开始',symbol:'file',parent:'首次使用体验',requirements:['成果能在对话中直接打开','版本和来源清楚','决定保留在时间线'] },
  { id:'trial',title:'完成一轮内部试用',outcome:'从创建 Goal 到得到成果，完整走过一次流程，并记录实际遇到的问题。',caption:'沿着完整路径走一次，看看哪里还会停住。',x:658,y:802,state:'waiting',status:'等待前置',symbol:'play',parent:'首次使用体验',requirements:['完成真实首次使用','记录过程中的疑问','逐项确认修复结果'] },
  { id:'research',title:'找出第一次使用的断点',outcome:'整理安装、连接、首次打开三个阶段最容易让用户困惑的地方。',caption:'已找到 4 个需要说明的时刻。',x:143,y:745,state:'done',status:'已完成',symbol:'note',parent:'首次使用体验',requirements:['回看现有安装说明','记录首次打开的疑问','把观察关联到对应 Goal'] },
];
let edges = [['experience','connect'],['experience','guide'],['experience','result'],['research','guide'],['connect','trial'],['guide','trial'],['result','trial']];
let work = new Map();
function stateFor(goal) {
  if (!work.has(goal.id)) work.set(goal.id,{
    draft:'',terminalDraft:'',requirementsEditing:false,requirementsDraft:goal.requirements.join('\n'),mode:'conversation',noteMode:false,attachment:'',paused:false,artifactOpen:false,decision:'',messages:[],scroll:0,requirementsOpen:false,
    outcome:goal.outcome,terminal:goal.fresh?`Molis Work · 模拟终端\n\n  Goal    ${goal.title}\n  状态    尚未连接 Runtime\n\n  输入 help 查看演示命令，不执行真实命令。\n`:`Molis Work · Runtime preview\n\n  Goal    ${goal.title}\n  Session codex / design-preview\n  Scope   仅为界面演示，不执行真实命令\n\n› 读取当前 Goal 与关联资料\n  ✓ 目标、完成要求已载入\n  ✓ 已关联首次使用观察\n  ✓ 已整理工作结果\n\n  当前状态：等待用户反馈\n  输入 help 查看演示命令。\n`,
    events:goal.fresh?[{kind:'note',title:'创建 Goal',meta:'刚刚 · 你',body:goal.outcome}]:[
      {kind:'decision',title:goal.id==='guide'?'引导方式需要你确认':'等待下一步反馈',meta:'刚刚 · Codex',body:'工作过程和成果已经保留。你可以在当前对话中继续，也可以先检查相关资料。'},
      {kind:'result',title:goal.id==='guide'?'首次使用说明已整理':'阶段成果已整理',meta:'10:42 · Codex',body:'这一份演示成果保留在当前 Goal。点击对话中的文件可展开阅读。',file:goal.id==='guide'?'首次使用说明.md':'阶段工作说明.md'},
      {kind:'work',title:'检查了当前入口和上下文',meta:'10:36 · Codex',body:'阅读现有说明，核对 Goal 与 Runtime 的连接方式，并整理用户需要理解的最小信息。'},
      {kind:'note',title:'先让用户完成一件真实的事',meta:'10:28 · 你',body:'先不堆概念说明。让用户选一个 Goal，看到一次有结果的协作，再逐步认识其他能力。'},
      {kind:'work',title:'Goal 已放入项目画布',meta:'昨天 · 你',day:'昨天',body:goal.outcome},
    ],
  });
  return work.get(goal.id);
}
const canvas = $('#canvas'), world = $('#world'), workspace = $('#goal-workspace');
let activeGoal = null, returnTarget = null, handMode = false;
const projects=[
  {id:'molis-work',name:'Molis Work',plugins:['goals','sessions','feed','artifacts'],lastPlugin:'goals',suspendedGoal:null,goals,edges,work,camera:null,folded:new Set()},
  {id:'ideas',name:'灵感收集',plugins:['feed','artifacts'],lastPlugin:'feed',suspendedGoal:null,goals:[],edges:[],work:new Map(),camera:null,folded:new Set()},
];
let currentProject=projects[0], currentPlugin='goals';
const hasGoals=()=>currentProject.plugins.includes('goals');
function canvasSize(){return {width:canvas.clientWidth,height:canvas.clientHeight};}
function narrowWorkArea(){return canvas.clientWidth<=760;}
let camera = {x:0,y:0,scale:1};
let previousCanvasSize=canvasSize();
let drag = null, suppressNodeClick = false, toastTimer;
let wasNarrow = narrowWorkArea();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function renderNodes() {
  $('#canvas-empty').hidden=goals.length>0;
  document.querySelectorAll('.canvas-annotation,.canvas-group-label').forEach(label=>label.hidden=currentProject.id!=='molis-work');
  $('#nodes').innerHTML = goals.map(g => `<button class="goal-node ${g.kind ? g.kind+'-node' : ''}" data-goal="${g.id}" style="left:${g.x}px;top:${g.y}px" aria-label="展开 Goal：${escapeHtml(g.title)}">
    <span class="node-top"><span class="node-symbol">${icon(g.symbol)}</span><span class="node-state ${g.state}"><i></i>${escapeHtml(g.status)}</span></span>
    <strong>${escapeHtml(g.title)}</strong><span class="node-caption">${escapeHtml(g.caption)}</span>
    ${g.kind==='focus'?`<span class="node-preview">${icon('file')}<span>首次使用说明.md<br>已整理好，等待你的反馈</span></span>`:''}
    <span class="node-footer">${g.kind==='focus'?'<span class="node-person">C</span><span>在这里继续工作</span>':icon(g.state==='done'?'check':'clock')+'<span>'+ (g.state==='done'?'结果已留在 Goal 里':'上下文已准备好')+'</span>'}${g.kind==='focus'?icon('chevron'):''}</span>
  </button>`).join('');
  drawEdges();
  renderList();
  syncDirectorySelection();
}
function drawEdges() {
  const points = new Map(goals.map(g => {const node=$(`[data-goal="${g.id}"]`);return [g.id,{...g,w:node.offsetWidth,h:node.offsetHeight}];}));
  $('#connections').innerHTML = `<defs><marker id="edge-end" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="m0 0 5 3-5 3" style="stroke:currentColor;fill:none;stroke-width:1"/></marker></defs>` + edges.map(([from,to])=>{
    const a=points.get(from), b=points.get(to);if(!a||!b)return '';
    let x1=a.x+a.w/2,y1=a.y+a.h+9,x2=b.x+b.w/2,y2=b.y-10;
    let d=`M ${x1} ${y1} C ${x1} ${y1+(y2-y1)*.48},${x2} ${y2-(y2-y1)*.48},${x2} ${y2}`;
    if(from==='research'){x1=a.x+a.w+10;y1=a.y+a.h/2;x2=b.x-10;y2=b.y+b.h*.7;d=`M ${x1} ${y1} C ${x1+85} ${y1},${x2-90} ${y2},${x2} ${y2}`;}
    const ownership=from==='experience';
    return `<path class="${ownership?'ownership-path':to==='guide'||from==='guide'?'focus-path':''}" d="${d}" ${ownership?'':'marker-end="url(#edge-end)"'}/>${ownership&&to==='guide'?`<text class="line-label" x="${x1+12}" y="${y1+35}">拆解</text>`:''}`;
  }).join('');
}
function renderList(){renderGoalDirectory();}
function applyCamera(){currentProject.camera={...camera};world.style.transform=`translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;$('#zoom-value').textContent=Math.round(camera.scale*100)+'%';canvas.style.backgroundSize=`${22*camera.scale}px ${22*camera.scale}px`;canvas.style.backgroundPosition=`${camera.x}px ${camera.y}px`;}
function fitCanvas(initial=false){
  const {width,height}=canvasSize();
  if(!goals.length){camera={scale:1,x:width/2-800,y:height/2-500};}
  else if(initial&&width<=760){const g=goals.find(g=>g.id==='guide')||goals[0];camera={scale:.82,x:width/2-(g.x+164)*.82,y:height*.43-(g.y+130)*.82};}
  else {const scale=Math.max(.25,Math.min((width-80)/1510,(height-120)/995,1));camera={scale,x:(width-1600*scale)/2,y:(height-1050*scale)/2-5};}
  applyCamera();
}
function zoom(factor,x=canvas.clientWidth/2,y=canvas.clientHeight/2){const scale=Math.min(1.65,Math.max(.25,camera.scale*factor));camera.x=x-(x-camera.x)*scale/camera.scale;camera.y=y-(y-camera.y)*scale/camera.scale;camera.scale=scale;applyCamera();}
function setList(open,focus=true){setDirectory(open?'goals':'root');if(open){setSidebar(true,false);if(focus)$('#goal-search').focus();}}
function notify(message){clearTimeout(toastTimer);const toast=$('#toast');(workspace.open?workspace:document.body).append(toast);toast.textContent=message;toast.hidden=false;toastTimer=setTimeout(()=>{toast.hidden=true;},2700);}

function openGoal(id,source){
  const goal=goals.find(g=>g.id===id);if(!goal)return;
  if(activeGoal)saveDraft();
  activeGoal=goal;returnTarget=source||$(`[data-goal="${id}"]`);
  const sourceRect=returnTarget.getBoundingClientRect();
  $('#inline-tools').hidden=true;
  $('#goal-edit-form').hidden=true;$('#goal-outcome').hidden=false;
  $('#workspace-title').textContent=goal.title;
  $('#workspace-subtitle').textContent=`${goal.parent} / ${goal.id==='guide'?'首次引导':goal.title}`;
  workspace.classList.toggle('context-hidden',narrowWorkArea());
  renderWorkspace();
  if(!workspace.open){
    workspace.show();
    $('#canvas-surface').inert=true;$('#goal-backdrop').hidden=false;
    syncDirectorySelection();
    if(!reducedMotion){const r=workspace.getBoundingClientRect();workspace.animate([{transform:`translate(${sourceRect.x+sourceRect.width/2-r.x-r.width/2}px,${sourceRect.y+sourceRect.height/2-r.y-r.height/2}px) scale(${Math.min(.65,sourceRect.width/r.width)})`,opacity:.25},{transform:'none',opacity:1}],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)'});}
  }
  syncContext();
  $('#workspace-title').tabIndex=-1;$('#workspace-title').focus({preventScroll:true});
  requestAnimationFrame(()=>{$('#conversation-view').scrollTop=stateFor(goal).scroll;});
}
function saveDraft(){if(!activeGoal)return;const s=stateFor(activeGoal);s.draft=$('#message-input').value;s.terminalDraft=$('#terminal-command').value;s.scroll=$('#conversation-view').scrollTop;}
function closeGoal(restoreFocus=true){saveDraft();const target=activeGoal?$(`[data-goal="${activeGoal.id}"]`):returnTarget;workspace.close();$('#canvas-surface').inert=false;$('#goal-backdrop').hidden=true;$('#toast').hidden=true;activeGoal=null;syncDirectorySelection();if(restoreFocus)target?.focus({preventScroll:true});}
function syncContext(){const hidden=workspace.classList.contains('context-hidden');$('#toggle-context').setAttribute('aria-expanded',String(!hidden));$('#toggle-context').setAttribute('aria-label',hidden?'展开 Goal 信息与时间线':'收起 Goal 信息与时间线');$('.work-main').inert=!hidden&&narrowWorkArea();}
function renderWorkspace(){
  const s=stateFor(activeGoal);
  $('#workspace-status').textContent=s.paused?'已暂停':s.decision?'可以继续':activeGoal.status;
  $('#runtime-state').textContent=s.paused?'已暂停':s.decision?'已记录你的选择':activeGoal.fresh?'尚未开始':'等待你的反馈';
  $('#message-input').value=s.draft;
  $('#goal-outcome').textContent=s.outcome;
  $('#outcome-edit').value=s.outcome;
  $('#context-relations').innerHTML=icon('target')+`<span>属于 ${escapeHtml(activeGoal.parent)}</span>`;
  renderConversation();renderTimeline();renderRequirements();renderComposer();setMode(s.mode,false);
  $('#pause-action').innerHTML=icon(s.paused?'play':'pause')+`<span>${s.paused?'继续':'暂停'}</span>`;
}
function renderConversation(){
  const s=stateFor(activeGoal), guide=activeGoal.id==='guide';
  if(activeGoal.fresh){$('#conversation').innerHTML=`<div class="conversation-date">新 Goal · 尚未开始</div><section class="fresh-conversation"><h3>先说说，你想从哪里开始？</h3><p>${escapeHtml(s.outcome)}</p><p>可以补充要求或资料，再从下方继续。当前为设计演示，尚未连接真实 Runtime。</p></section>${s.messages.map(message=>`<section class="fresh-conversation"><strong>${message.role==='user'?'你':'Codex · 演示回复'}</strong><p>${escapeHtml(message.body)}</p></section>`).join('')}`;return;}
  $('#conversation').innerHTML=`<div class="conversation-date">今天 · 在这个 Goal 里继续</div>
    <div class="user-message">${guide?'第一次打开后，不要让用户先理解一堆概念。让他在画布上找到一件事，展开后就能开始。':escapeHtml(s.outcome)}</div>
    <section class="assistant-message"><div class="message-author"><span class="assistant-logo">C</span><span>Codex</span><time>10:42</time></div>
      <div class="message-copy"><p>${guide?'我梳理了首次使用的路径。画布负责让人看清全貌，展开的 Goal 负责把一件事做下去。这里先收敛成三个步骤。':'我已把这件事的目标、已有资料和完成要求放到一起。工作结果会留在当前 Goal，后续可以沿着同一份上下文继续。'}</p>
        <ul class="work-steps"><li>${icon('check')}梳理现有入口</li><li>${icon('check')}整理工作结果</li><li class="pending-step"><i></i>${s.decision?'按你的选择继续':'等你确认方向'}</li></ul>
        <div class="artifact"><button class="artifact-button" id="artifact-toggle" aria-expanded="${s.artifactOpen}"><span class="artifact-icon">${icon('file')}</span><span><strong>${guide?'首次使用说明.md':'阶段工作说明.md'}</strong><small>文档 · ${s.decision?'v2 · 已按你的选择更新':'v1 · 本次工作产出'}</small></span>${icon(s.artifactOpen?'down':'chevron')}</button>
          <div class="artifact-preview" ${s.artifactOpen?'hidden':''}>${guide?'看见项目全貌 → 展开一个 Goal → 在原地开始协作。<br>只在需要的时候，再带出资料、记录和终端。':'围绕当前目标整理工作路径、检查依据与后续事项。'}</div>
          <div class="artifact-body" ${s.artifactOpen?'':'hidden'}><h3>${guide?'第一次打开 Molis Work':'这件事接下来怎么做'}</h3><p>${guide?'先看看画布：每个 Goal 都是一件想做成的事，连线告诉你它们如何配合。':escapeHtml(s.outcome)}</p><h4>找到一件值得开始的事</h4><p>${s.decision==='direct'?'首次进入时，直接展开推荐的 Goal；用户可以随时收起回到画布。':'首次进入时，保留完整项目画布，轻轻提示一个适合开始的 Goal。'}</p><h4>展开，在原地继续</h4><p>查看当前进展和成果，补充你的想法。需要核对技术过程时切到终端；想看为什么这么做，就打开右边的时间线。</p><h4>收起，回到全貌</h4><p>对话、输入和工作结果都留在 Goal 里。再次打开时，从刚才的位置接着做。</p><button type="button" id="revise-artifact">把这份文档带入下一条反馈</button></div>
        </div>
        ${s.decision?`<div class="accepted-decision">${icon('check')}已选择：${s.decision==='canvas'?'先看项目画布':'直接打开一个 Goal'}。文档和时间线已同步。</div>`:guide?`<div class="decision-prompt"><div class="decision-label"><i></i>有一处想听听你的判断</div><p>新用户第一次进入，先看到完整画布，还是直接展开推荐 Goal？</p><div class="decision-options"><button class="recommended" data-decision="canvas">先看项目画布</button><button data-decision="direct">直接打开一个 Goal</button></div></div>`:'<p>你可以直接补充要求，或打开右侧资料核对现有约定。</p>'}
      </div></section>
    ${s.messages.map(m=>m.role==='user'?`<div class="user-message">${escapeHtml(m.body)}</div>`:`<section class="assistant-message"><div class="message-author"><span class="assistant-logo">C</span>Codex<time>刚刚</time></div><div class="message-copy"><p>${escapeHtml(m.body)}</p><div class="simulation-reply">演示回复 · 真实版本由已连接的 Runtime 继续执行</div></div></section>`).join('')}`;
}
function renderTimeline(){const s=stateFor(activeGoal);let previousDay;$('#timeline').innerHTML=s.events.map((e,i)=>{const day=e.day||'今天';const heading=day!==previousDay?`<div class="timeline-day">${day}</div>`:'';previousDay=day;return `${heading}<section class="timeline-entry ${e.kind}"><i class="timeline-marker"></i><button class="timeline-event-button" data-timeline="${i}" aria-expanded="false"><strong>${escapeHtml(e.title)}</strong><small>${escapeHtml(e.meta)}</small>${e.file?`<span class="timeline-preview-file">${icon('file')}${escapeHtml(e.file)}</span>`:''}</button><p class="timeline-event-body" hidden>${escapeHtml(e.body)}</p></section>`;}).join('');}
function renderRequirements(){const s=stateFor(activeGoal);const done=activeGoal.fresh?0:activeGoal.state==='done'||s.decision?activeGoal.requirements.length:Math.max(0,activeGoal.requirements.length-1);$('#requirements-count').textContent=`${done} / ${activeGoal.requirements.length} 已满足`;$('#requirements-list').hidden=!s.requirementsOpen||s.requirementsEditing;$('#requirements-edit-form').hidden=!s.requirementsOpen||!s.requirementsEditing;$('#requirements-edit').value=s.requirementsDraft;$('#requirements-summary').setAttribute('aria-expanded',String(s.requirementsOpen));$('#requirements-list').innerHTML=activeGoal.requirements.map((r,i)=>`<div class="requirement-item">${i<done?icon('check'):'<i></i>'}<span>${escapeHtml(r)}</span></div>`).join('')+'<button type="button" class="text-button" id="edit-requirements">编辑完成要求</button>';}
function renderComposer(){const s=stateFor(activeGoal);$('#message-input').placeholder=s.noteMode?'只记在时间线里，写下你的观察…':s.paused?'工作已暂停，草稿会保留…':'继续这件事，或补充你的想法…';$('#composer-hint').textContent=s.noteMode?'保存到 Goal 时间线，不会发给 AI':s.paused?'先点击「继续」，再发送给 Runtime':'当前 Goal、要求和资料已在上下文中';$('#send-message').disabled=s.paused&&!s.noteMode;$('#send-message').setAttribute('aria-label',s.noteMode?'保存演示备注':'发送演示消息');const text=s.noteMode?'记一笔':s.attachment;$('#composer-context').hidden=!text;$('#composer-context').innerHTML=text?`${icon(s.noteMode?'note':'file')}<span>${escapeHtml(text)}</span><button id="clear-context" type="button" aria-label="取消输入上下文">${icon('close')}</button>`:'';}
function setMode(mode,focus=true){const s=stateFor(activeGoal);s.mode=mode;const terminal=mode==='terminal';workspace.classList.toggle('terminal-mode',terminal);$('#conversation-view').hidden=terminal;$('#terminal-view').hidden=!terminal;for(const name of ['conversation','terminal']){const selected=mode===name;$(`#${name}-tab`).classList.toggle('active',selected);$(`#${name}-tab`).setAttribute('aria-selected',String(selected));}$('#terminal-output').textContent=s.terminal;$('#terminal-command').value=s.terminalDraft;if(focus)(terminal?$('#terminal-command'):$('#message-input')).focus({preventScroll:true});}
function addEvent(kind,title,body){stateFor(activeGoal).events.unshift({kind,title,body,meta:'刚刚 · 你'});renderTimeline();}

canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0||workspace.open)return;
  const node=event.target.closest('[data-goal]');
  if(!node&&event.target.closest('button,input,textarea,select'))return;
  const goal=node&&!handMode?goals.find(g=>g.id===node.dataset.goal):null;
  drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:camera.x,y:camera.y,goal,goalX:goal?.x,goalY:goal?.y,moved:false};
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove',event=>{
  if(!drag)return;const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
  if(Math.hypot(dx,dy)>4){drag.moved=true;canvas.classList.add('is-dragging');}
  if(!drag.moved)return;
  if(drag.goal){drag.goal.x=drag.goalX+dx/camera.scale;drag.goal.y=drag.goalY+dy/camera.scale;const n=$(`[data-goal="${drag.goal.id}"]`);n.style.left=drag.goal.x+'px';n.style.top=drag.goal.y+'px';drawEdges();}
  else {camera.x=drag.x+dx;camera.y=drag.y+dy;applyCamera();}
});
canvas.addEventListener('pointerup',event=>{
  if(!drag)return;const previous=drag;drag=null;canvas.classList.remove('is-dragging');canvas.releasePointerCapture(event.pointerId);suppressNodeClick=previous.moved;
  if(!previous.moved&&previous.goal)openGoal(previous.goal.id,$(`[data-goal="${previous.goal.id}"]`));
});
canvas.addEventListener('pointercancel',()=>{drag=null;canvas.classList.remove('is-dragging');});
canvas.addEventListener('click',event=>{if(event.detail===0&&!suppressNodeClick){const node=event.target.closest('[data-goal]');if(node)openGoal(node.dataset.goal,node);}suppressNodeClick=false;});
canvas.addEventListener('wheel',event=>{event.preventDefault();if(event.ctrlKey||event.metaKey)zoom(Math.exp(-event.deltaY*.006),event.clientX-canvas.getBoundingClientRect().left,event.clientY-canvas.getBoundingClientRect().top);else {camera.x-=event.deltaX;camera.y-=event.deltaY;applyCamera();}},{passive:false});
$('#zoom-in').onclick=()=>zoom(1.15);$('#zoom-out').onclick=()=>zoom(1/1.15);$('#fit-canvas').onclick=()=>fitCanvas();
for(const [id,hand] of [['hand-tool',true],['select-tool',false]])$( '#'+id).onclick=()=>{handMode=hand;canvas.classList.toggle('hand-mode',hand);$('#hand-tool').classList.toggle('selected',hand);$('#select-tool').classList.toggle('selected',!hand);$('#hand-tool').setAttribute('aria-pressed',String(hand));$('#select-tool').setAttribute('aria-pressed',String(!hand));};
$('#list-toggle').onclick=()=>setList($('#goal-list').hidden);
$('#goal-search').oninput=renderList;
$('#goal-list-items').onclick=e=>{const toggle=e.target.closest('[data-toggle-goal]');if(toggle){const id=toggle.dataset.toggleGoal;currentProject.folded.has(id)?currentProject.folded.delete(id):currentProject.folded.add(id);renderList();return;}const button=e.target.closest('[data-list-goal]');if(button){openGoal(button.dataset.listGoal,$(`[data-goal="${button.dataset.listGoal}"]`));if(innerWidth<=600)setSidebar(false,false);}};

$('#close-workspace').onclick=()=>closeGoal();
$('#goal-backdrop').onclick=()=>closeGoal();
workspace.addEventListener('cancel',e=>{e.preventDefault();closeGoal();});
$('#toggle-context').onclick=()=>{workspace.classList.toggle('context-hidden');syncContext();if(!workspace.classList.contains('context-hidden')&&narrowWorkArea())$('#edit-goal').focus();};
$('#conversation-tab').onclick=()=>setMode('conversation');$('#terminal-tab').onclick=()=>setMode('terminal');
$('#message-input').oninput=()=>{if(activeGoal)stateFor(activeGoal).draft=$('#message-input').value;};
$('#conversation').onclick=e=>{
  if(e.target.closest('#artifact-toggle')){const s=stateFor(activeGoal);s.artifactOpen=!s.artifactOpen;renderConversation();$('#artifact-toggle').focus({preventScroll:true});}
  if(e.target.closest('#revise-artifact')){const s=stateFor(activeGoal);s.attachment='首次使用说明.md';s.noteMode=false;renderComposer();$('#message-input').focus();}
  const decision=e.target.closest('[data-decision]');
  if(decision){const s=stateFor(activeGoal);s.decision=decision.dataset.decision;activeGoal.status='可以继续';activeGoal.state='active';addEvent('decision',s.decision==='canvas'?'已决定先展示项目画布':'已决定先展开推荐 Goal','此选择已进入当前 Goal 的演示上下文，首次使用说明已更新到 v2。');s.terminal+='\n› 用户确认引导方式\n  ✓ 决定已记录，说明文档更新至 v2（模拟）\n';renderWorkspace();renderNodes();notify('选择已记录，文档更新到 v2（演示）');}
};
$('#timeline').onclick=e=>{const button=e.target.closest('[data-timeline]');if(!button)return;const body=button.nextElementSibling;body.hidden=!body.hidden;button.setAttribute('aria-expanded',String(!body.hidden));};
function showRequirements(){workspace.classList.remove('context-hidden');stateFor(activeGoal).requirementsOpen=true;renderRequirements();syncContext();$('#requirements-summary').focus({preventScroll:true});}
$('#requirements-summary').onclick=()=>{const s=stateFor(activeGoal);s.requirementsOpen=!s.requirementsOpen;renderRequirements();};
$('#requirements-action').onclick=showRequirements;
$('#requirements-list').onclick=e=>{if(!e.target.closest('#edit-requirements'))return;const s=stateFor(activeGoal);s.requirementsEditing=true;s.requirementsDraft=activeGoal.requirements.join('\n');renderRequirements();$('#requirements-edit').focus();};
$('#requirements-edit').oninput=()=>{stateFor(activeGoal).requirementsDraft=$('#requirements-edit').value;};
$('#cancel-requirements-edit').onclick=()=>{const s=stateFor(activeGoal);s.requirementsEditing=false;s.requirementsDraft=activeGoal.requirements.join('\n');renderRequirements();$('#edit-requirements').focus();};
$('#requirements-edit-form').onsubmit=e=>{e.preventDefault();const s=stateFor(activeGoal),items=$('#requirements-edit').value.split('\n').map(x=>x.trim()).filter(Boolean);if(!items.length){$('#requirements-edit').focus();return;}activeGoal.requirements=items;s.requirementsDraft=items.join('\n');s.requirementsEditing=false;renderRequirements();addEvent('note','更新了完成要求',items.join('；'));$('#edit-requirements').focus();notify('完成要求已更新（仅演示）');};
$('#note-action').onclick=()=>{stateFor(activeGoal).noteMode=true;renderComposer();$('#message-input').focus();};
$('#composer-context').onclick=e=>{if(e.target.closest('#clear-context')){const s=stateFor(activeGoal);s.noteMode=false;s.attachment='';renderComposer();$('#message-input').focus();}};
$('#attach-action').onclick=()=>{const box=$('#inline-tools');box.hidden=!box.hidden;box.innerHTML='<span>把一份资料带入当前 Goal</span><button type="button" data-attach="首次使用观察.md">首次使用观察.md</button><button type="button" data-attach="安装与连接说明.md">安装与连接说明.md</button>';};
$('#inline-tools').onclick=e=>{const button=e.target.closest('[data-attach]');if(button){stateFor(activeGoal).attachment=button.dataset.attach;stateFor(activeGoal).noteMode=false;$('#inline-tools').hidden=true;renderComposer();$('#message-input').focus();}};
$('#pause-action').onclick=()=>{const s=stateFor(activeGoal);s.paused=!s.paused;s.terminal+=s.paused?'\n  暂停演示，保留当前上下文。\n':'\n  恢复演示，从当前上下文继续。\n';renderWorkspace();notify(s.paused?'已暂停演示，草稿和成果都保留':'已恢复演示，继续同一个 Goal');};
$('#composer').onsubmit=e=>{
  e.preventDefault();const s=stateFor(activeGoal),message=$('#message-input').value.trim();if(!message){$('#message-input').focus();return;}
  if(s.paused&&!s.noteMode)return;
  if(s.noteMode){addEvent('note',message.length>32?message.slice(0,32)+'…':message,message);s.noteMode=false;notify('备注已留在时间线，没有发给 AI');}
  else {s.messages.push({role:'user',body:message});s.messages.push({role:'assistant',body:`这条反馈已与「${activeGoal.title}」放在一起${s.attachment?'，并带上 '+s.attachment:''}。实际接入后，Runtime 会从这份上下文继续工作，结果仍显示在这里。`});addEvent('work','补充了新的工作要求',message);}
  s.draft='';s.attachment='';$('#message-input').value='';renderConversation();renderComposer();$('#conversation-view').scrollTop=$('#conversation-view').scrollHeight;$('#message-input').focus();
};
$('#message-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();$('#composer').requestSubmit();}});
$('#terminal-command').oninput=()=>{if(activeGoal)stateFor(activeGoal).terminalDraft=$('#terminal-command').value;};
$('#terminal-form').onsubmit=e=>{e.preventDefault();const input=$('#terminal-command'),text=input.value.trim();if(!text)return;const s=stateFor(activeGoal);s.terminal+='\n› '+text+'\n'+(text==='help'?'  help    查看演示命令\n  status  查看当前 Goal 的演示状态\n  clear   清空这段模拟输出\n':text==='status'?`  Goal: ${activeGoal.title}\n  状态: ${s.paused?'暂停':s.decision?'已确认方向':'等待反馈'}\n  输入与成果均保留在当前 Goal。\n`:text==='clear'?'': '  这是终端外观演示，不执行真实命令。\n');if(text==='clear')s.terminal='Molis Work · 模拟终端\n';input.value='';s.terminalDraft='';$('#terminal-output').textContent=s.terminal;$('#terminal-output').scrollTop=$('#terminal-output').scrollHeight;};
$('#edit-goal').onclick=()=>{$('#goal-edit-form').hidden=false;$('#goal-outcome').hidden=true;$('#outcome-edit').focus();};
$('#cancel-goal-edit').onclick=()=>{$('#goal-edit-form').hidden=true;$('#goal-outcome').hidden=false;$('#outcome-edit').value=stateFor(activeGoal).outcome;$('#edit-goal').focus();};
$('#goal-edit-form').onsubmit=e=>{e.preventDefault();const text=$('#outcome-edit').value.trim();if(!text)return;stateFor(activeGoal).outcome=text;$('#goal-outcome').textContent=text;$('#goal-edit-form').hidden=true;$('#goal-outcome').hidden=false;addEvent('note','调整了预期结果',text);$('#edit-goal').focus();notify('预期结果已更新（仅演示）');};
$('#add-goal').onclick=()=>{$('#create-dialog').showModal();$('#new-title').focus();};
$('#cancel-create').onclick=()=>$('#create-dialog').close();
$('#create-form').onsubmit=e=>{e.preventDefault();const title=$('#new-title').value.trim();if(!title)return;const id='goal-'+(goals.length+1),x=(canvas.clientWidth/2-camera.x)/camera.scale-137,y=(canvas.clientHeight/2-camera.y)/camera.scale-75;goals.push({id,title,fresh:true,outcome:$('#new-outcome').value.trim()||'期待的结果可以在工作中继续补充。',caption:$('#new-outcome').value.trim()||'一个新的想法，从这里开始。',x,y,state:'active',status:'新想法',symbol:'target',parent:currentProject.name,requirements:['补充希望得到的结果']});renderNodes();$('#create-dialog').close();$('#create-form').reset();notify('新的 Goal 已放到画布上（仅演示）');$(`[data-goal="${id}"]`).focus({preventScroll:true});};
$('#theme-toggle').onclick=()=>{const dark=document.documentElement.classList.toggle('dark');$('#theme-toggle').innerHTML=icon(dark?'sun':'moon');$('#theme-toggle').setAttribute('aria-label',dark?'切换浅色外观':'切换深色外观');};
document.addEventListener('keydown',e=>{
  if($('#install-dialog').open||$('#create-dialog').open||$('#project-menu').matches(':popover-open'))return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openGoalSearch();return;}
  if(e.key==='Escape'&&document.body.classList.contains('sidebar-mobile-open')){e.preventDefault();setSidebar(false);return;}
  if(e.key==='Escape'&&workspace.open){e.preventDefault();closeGoal();return;}
  if(e.key==='Escape'&&!$('#goal-list').hidden){setList(false);$('#list-toggle').focus();return;}
  if(currentPlugin!=='goals'||workspace.open||$('#create-dialog').open||e.target.matches('input,textarea,select'))return;
  if(e.key==='+'||e.key==='='){e.preventDefault();zoom(1.15);}if(e.key==='-'){e.preventDefault();zoom(1/1.15);}
  const delta={ArrowLeft:[60,0],ArrowRight:[-60,0],ArrowUp:[0,60],ArrowDown:[0,-60]}[e.key];if(delta&&e.target===canvas){e.preventDefault();camera.x+=delta[0];camera.y+=delta[1];applyCamera();}
});
