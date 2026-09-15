'use strict';
const pluginCatalog=[
  {id:'goals',name:'Goals',icon:'target',summary:'在画布里把目标变成进展',description:'组织目标与依赖，在同一个 Goal 中对话、检查成果、查看终端和时间线。',directory:'目标、关系与工作过程',scope:'为这个项目添加独立的 Goal 画布与目标目录。'},
  {id:'sessions',name:'Sessions',icon:'terminal',summary:'让每次执行都有上下文',description:'集中查看 Runtime 会话，知道在哪里运行、做过什么，以及从哪里继续。',directory:'执行内容、运行位置与续跑',scope:'为这个项目添加 Runtime 会话目录。原型不会启动真实进程。'},
  {id:'feed',name:'Feed',icon:'feed',summary:'留住进入项目的每条信息',description:'把观察、参考和新消息留在项目里，读完再决定下一步如何推进。',directory:'所有来源消息，完整保留',scope:'为这个项目添加信息流目录，现有项目内容保持不变。'},
  {id:'artifacts',name:'Artifacts',icon:'file',summary:'工作成果，随时可以回看',description:'集中阅读文档和其他工作产物，保留版本与来源，让结果有据可查。',directory:'插件发布的结果与版本',scope:'为这个项目添加成果目录，用来查看后续产生的内容。'},
];
const pluginNames=Object.fromEntries(pluginCatalog.map(plugin=>[plugin.id,plugin.name]));
Object.assign(pluginNames,{plugins:'插件市场',settings:'项目设置'});
let directory='root',marketFilter='all',installPlugin=null,installedProjectId=null;

function renderProjectNavigation(){
  $('#selected-project-name').textContent=currentProject.name;
  $('.project-emblem').textContent=currentProject.name.slice(0,1);
  $('#project-title').textContent=currentProject.name;
  $('#project-options').innerHTML=projects.map(project=>`<button data-project-option="${project.id}" aria-label="切换到项目：${escapeHtml(project.name)}" ${project===currentProject?'aria-current="true"':''}><span class="project-option-icon">${escapeHtml(project.name.slice(0,1))}</span><span><strong>${escapeHtml(project.name)}</strong><small>${project.plugins.length} 个已安装插件</small></span>${project===currentProject?icon('check'):''}</button>`).join('');
  $('#project-plugins').innerHTML=currentProject.plugins.map(name=>{const plugin=pluginCatalog.find(item=>item.id===name);return `<button class="module-row" data-plugin="${name}" ${currentPlugin===name?'aria-current="page"':''}>${icon(plugin.icon)}<span><strong>${plugin.name}</strong><small>${name==='goals'?goals.length+' 个 Goal':plugin.directory}</small></span>${icon('chevron')}</button>`;}).join('');
  $('#plugin-strip').innerHTML=currentProject.plugins.map(name=>{const plugin=pluginCatalog.find(item=>item.id===name);return `<button class="plugin-strip-link" data-plugin="${name}" aria-label="切换到插件：${plugin.name}"><span>${plugin.name}</span></button>`;}).join('');
  syncDirectorySelection();
}
function setDirectory(name){
  if(name!==directory)$('#plugin-item-search').value='';
  directory=name;
  $('#project-plugins').hidden=name!=='root';
  $('#directory-heading').hidden=name==='root';
  $('#goal-list').hidden=name!=='goals';
  $('#plugin-items').hidden=name==='root'||name==='goals';
  $('#list-toggle').setAttribute('aria-expanded',String(name==='goals'));
  if(name==='root')return;
  revealDirectoryPlugin();
  if(name==='goals')renderGoalDirectory();
  else renderPluginItems();
}
function updatePluginStrip(){
  const strip=$('#plugin-strip');if(!strip.clientWidth)return;
  const overflow=strip.scrollWidth>$('#plugin-strip-frame').clientWidth+1;
  $('#plugin-scroll-left').hidden=!overflow;$('#plugin-scroll-right').hidden=!overflow;
  $('#plugin-scroll-left').disabled=strip.scrollLeft<=1;
  $('#plugin-scroll-right').disabled=strip.scrollLeft>=strip.scrollWidth-strip.clientWidth-1;
}
function revealDirectoryPlugin(){
  if(directory==='root'||!$('#plugin-strip').clientWidth)return;
  updatePluginStrip();
  $('#plugin-strip [data-plugin="'+directory+'"]').scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  updatePluginStrip();
}
function renderPluginItems(){
  const query=$('#plugin-item-search').value.trim().toLocaleLowerCase();
  const records=recordsFor(directory),visible=records.filter(record=>(record.title+' '+record.body+' '+record.meta).toLocaleLowerCase().includes(query));
  $('#plugin-record-list').innerHTML=visible.length?visible.map(record=>`<button class="directory-record" data-directory-record="${record.id}">${icon(pluginCatalog.find(plugin=>plugin.id===directory).icon)}<span><strong>${record.title}</strong><small>${record.meta}</small></span></button>`).join(''):`<div class="directory-empty">${records.length?'没有找到匹配的内容。':'还没有内容。<br>这个项目后续的记录会显示在这里。'}</div>`;
}
function renderGoalDirectory(){
  const query=$('#goal-search').value.trim().toLocaleLowerCase();
  const children=goal=>goals.filter(candidate=>goal.id==='experience'&&candidate.id!=='experience'&&candidate.parent==='首次使用体验');
  const matches=goal=>(goal.title+' '+goal.outcome).toLocaleLowerCase().includes(query)||children(goal).some(matches);
  const render=goal=>{
    const nested=children(goal),expanded=!!query||!currentProject.folded.has(goal.id);
    return `<div class="goal-tree-branch"><div class="goal-tree-row">${nested.length?`<button class="tree-disclosure" data-toggle-goal="${goal.id}" aria-label="${expanded?'折叠':'展开'} ${escapeHtml(goal.title)}" aria-expanded="${expanded}">${icon(expanded?'down':'chevron')}</button>`:'<span class="tree-leaf">'+icon(goal.state==='done'?'check':'target')+'</span>'}<button class="tree-goal" data-list-goal="${goal.id}" ${activeGoal?.id===goal.id?'aria-current="true"':''}><span>${escapeHtml(goal.title)}</span><i class="tree-state ${goal.state}" title="${escapeHtml(goal.status)}"></i></button></div>${nested.length&&expanded?'<div class="goal-tree-children">'+nested.filter(matches).map(render).join('')+'</div>':''}</div>`;
  };
  const roots=goals.filter(goal=>goal.id==='experience'||goal.parent!=='首次使用体验');
  const visible=roots.filter(matches);
  $('#goal-list-items').innerHTML=visible.length?visible.map(render).join(''):`<div class="directory-empty">${goals.length?'没有找到这个 Goal。':'还没有 Goal。点击上方 +，放入第一件想做成的事。'}</div>`;
  $('#goal-count').textContent=`共 ${goals.length} 个目标`;
}
function syncDirectorySelection(){
  const count=$('#project-plugins [data-plugin="goals"] small');if(count)count.textContent=goals.length+' 个 Goal';
  document.querySelectorAll('[data-list-goal]').forEach(button=>{if(activeGoal?.id===button.dataset.listGoal)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');});
  document.querySelectorAll('[data-plugin]').forEach(button=>{if(button.dataset.plugin===currentPlugin)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
}
function selectProject(id){
  const next=projects.find(project=>project.id===id);
  $('#project-menu').hidePopover();
  if(!next||next===currentProject)return;
  if(currentPlugin==='goals')currentProject.suspendedGoal=activeGoal?.id||null;
  if(workspace.open)closeGoal(false);
  currentProject=next;currentPlugin=null;goals=next.goals;edges=next.edges;work=next.work;camera=next.camera?{...next.camera}:{x:0,y:0,scale:1};
  $('#goal-search').value='';
  renderProjectNavigation();
  selectPlugin(next.lastPlugin,{directory:false,keepSidebar:true});
  setDirectory('root');
  $('#project-trigger').focus({preventScroll:true});
}
function recordsFor(name){
  if(currentProject.id==='molis-work'){
    if(name==='sessions')return [
      {id:'guide-session',title:'梳理首次使用路径',body:'整理首次使用说明，等待确认引导方式。',meta:'Codex · 今天',goal:'guide',state:'等待反馈'},
      {id:'connect-session',title:'检查 Runtime 连接',body:'连接步骤、目录和启动上下文已核对。',meta:'Claude · 昨天',goal:'connect',state:'已结束'},
    ];
    if(name==='feed')return [
      {id:'first-use',title:'首次使用观察',body:'第一次打开时，需要更清楚地告诉用户可以从哪里开始。',meta:'项目观察 · 今天',goal:'guide'},
      {id:'connection-guide',title:'安装与连接说明',body:'把配置步骤与实际执行分开，让用户能判断连接是否成功。',meta:'参考资料 · 昨天',goal:'connect'},
    ];
    if(name==='artifacts')return [
      {id:'guide-artifact',title:'首次使用说明.md',body:'看见项目全貌，展开一个 Goal，在原地开始协作。',meta:'文档 · '+(stateFor(goals.find(goal=>goal.id==='guide')).decision?'v2':'v1')+' · Codex',goal:'guide',artifact:true},
      {id:'connect-artifact',title:'Runtime 连接检查.md',body:'安装入口、工作目录与上下文读取的检查记录。',meta:'文档 · v1 · Claude',goal:'connect',artifact:true},
    ];
  }
  if(name==='feed')return [
    {id:'capture-idea',title:'让记录发生在灵感出现时',body:'随手写下一句话，也可以稍后补充来源和想尝试的方向。',meta:'灵感收集 · 今天'},
    {id:'spatial-reading',title:'空间式阅读的参考',body:'用位置和关联帮助人回想资料，把注意力留给内容本身。',meta:'灵感收集 · 昨天'},
  ];
  if(name==='artifacts')return [{id:'idea-notes',title:'灵感摘记.md',body:'整理随手记录中的共同主题，留下下一次值得继续的线索。',meta:'文档 · v1 · 草稿'}];
  return [];
}
function renderOtherPlugin(name,recordId=null){
  if(name==='plugins'){renderMarket();return;}
  if(name==='settings'){
    $('#other-plugin').innerHTML=`<header class="plugin-intro"><h1>项目设置</h1><p>${escapeHtml(currentProject.name)}</p></header><dl class="plugin-settings"><dt>项目</dt><dd>${escapeHtml(currentProject.name)}</dd><dt>工作区</dt><dd>本地</dd><dt>已安装插件</dt><dd>${currentProject.plugins.map(id=>pluginNames[id]).join('、')}</dd><dt>演示状态</dt><dd>仅保留在当前页面，刷新后重置。</dd></dl>`;return;
  }
  const plugin=pluginCatalog.find(item=>item.id===name),records=recordsFor(name),visible=recordId?records.filter(record=>record.id===recordId):records;
  $('#other-plugin').innerHTML=`<header class="plugin-intro"><h1>${plugin.name}</h1><p>${plugin.description}</p></header><div class="plugin-records">${visible.length?visible.map(record=>`<article class="plugin-record" tabindex="-1">${icon(plugin.icon)}<div><strong>${record.title}</strong><p>${record.body}</p><small>${record.meta}</small>${record.goal?`<div><button data-open-related-goal="${record.goal}" ${record.artifact?'data-artifact-link':''}>${record.artifact?'在 Goal 中阅读':'打开关联 Goal'} ${icon('chevron')}</button></div>`:''}</div>${record.state?`<span class="record-state">${record.state}</span>`:''}</article>`).join(''):`<div class="plugin-empty">${icon(plugin.icon)}<h2>这个项目还没有 ${plugin.name}</h2><p>插件已经安装，后续产生的内容会留在这个项目中。</p><small>当前仅演示导航与安装，未连接真实业务。</small></div>`}</div>`;
}
function selectPlugin(name,{restore=true,directory:enterDirectory=true,keepSidebar=false}={}){
  if(!currentProject.plugins.includes(name)&&!['plugins','settings'].includes(name))return;
  if(currentPlugin==='goals'&&name!=='goals'){currentProject.suspendedGoal=activeGoal?.id||null;if(workspace.open)closeGoal(false);}
  currentPlugin=name;if(currentProject.plugins.includes(name))currentProject.lastPlugin=name;
  $('#goals-plugin').hidden=name!=='goals';$('#other-plugin').hidden=name==='goals';$('#goal-view-tools').hidden=name!=='goals';$('#plugin-title').textContent=pluginNames[name];
  if(enterDirectory)setDirectory(currentProject.plugins.includes(name)?name:'root');
  if(innerWidth<=600&&!keepSidebar)setSidebar(false,false);
  if(name==='goals'){
    renderNodes();
    if(!currentProject.camera)fitCanvas(true);else applyCamera();
    previousCanvasSize=canvasSize();
    if(restore&&currentProject.suspendedGoal){const id=currentProject.suspendedGoal;currentProject.suspendedGoal=null;openGoal(id);}
    else if(!restore)currentProject.suspendedGoal=null;
  }else renderOtherPlugin(name);
  syncDirectorySelection();
}
function openRecentGoal(id,artifact=false){if(!hasGoals())return;selectPlugin('goals',{restore:false});const goal=goals.find(goal=>goal.id===id);if(artifact)stateFor(goal).artifactOpen=true;openGoal(id);}
function openGoalSearch(){if(!hasGoals())return;selectPlugin('goals',{keepSidebar:true});setList(true);}
function setSidebar(open,returnFocus=true){
  if(innerWidth<=600){document.body.classList.toggle('sidebar-mobile-open',open);$('#sidebar-scrim').hidden=!open;$('#app-main').inert=open;$('#show-sidebar').hidden=false;if(open&&returnFocus)$('#hide-sidebar').focus();else if(!open&&returnFocus)$('#show-sidebar').focus();}
  else{document.body.classList.toggle('sidebar-collapsed',!open);$('#show-sidebar').hidden=open;if(returnFocus)(open?$('#hide-sidebar'):$('#show-sidebar')).focus();}
}
function renderMarket(){
  $('#other-plugin').innerHTML=`<div class="market"><header class="market-heading"><div><h1>插件市场</h1><p>为每个项目，选择合适的工作方式。</p></div><span class="market-demo">安装仅在此原型中生效</span></header><div class="market-toolbar"><div class="market-filters"><button data-market-filter="all" aria-pressed="${marketFilter==='all'}">全部插件</button><button data-market-filter="installed" aria-pressed="${marketFilter==='installed'}">当前项目已安装</button></div><label class="market-search">${icon('search')}<input id="market-search" aria-label="搜索插件" placeholder="搜索插件…"></label></div><div class="market-grid" id="market-grid"></div><p class="market-footnote">每个项目独立选择插件，工作内容也各自保留。</p></div>`;
  $('#market-search').oninput=renderMarketCards;renderMarketCards();
}
function renderMarketCards(){
  const query=$('#market-search').value.trim().toLocaleLowerCase();
  const visible=pluginCatalog.filter(plugin=>(marketFilter==='all'||currentProject.plugins.includes(plugin.id))&&(plugin.name+plugin.description).toLocaleLowerCase().includes(query));
  $('#market-grid').innerHTML=visible.length?visible.map(plugin=>{
    const installed=projects.filter(project=>project.plugins.includes(plugin.id));
    return `<article class="market-card"><div class="market-card-heading"><span class="market-icon ${plugin.id}">${icon(plugin.icon)}</span><span class="plugin-origin">内置</span></div><h2>${plugin.name}</h2><h3>${plugin.summary}</h3><p>${plugin.description}</p><div class="market-card-installed">${icon(installed.length?'check':'plus')}<span>${installed.length?'已安装到 '+installed.map(project=>escapeHtml(project.name)).join('、'):'还没有项目安装'}</span></div><footer><button data-install-plugin="${plugin.id}">添加到项目 ${icon('plus')}</button></footer></article>`;
  }).join(''):'<div class="market-empty">没有找到这个插件，换个关键词试试。</div>';
}
function openInstall(id){
  installPlugin=pluginCatalog.find(plugin=>plugin.id===id);installedProjectId=null;
  $('#install-title').textContent='添加 '+installPlugin.name;
  $('#install-description').textContent=installPlugin.summary;
  $('#install-icon').innerHTML=icon(installPlugin.icon);
  $('#install-project').innerHTML=projects.map(project=>`<option value="${project.id}">${escapeHtml(project.name)}</option>`).join('');
  $('#install-project').value=currentProject.id;updateInstallState();$('#install-dialog').showModal();$('#install-project').focus();
}
function updateInstallState(){
  const project=projects.find(project=>project.id===$('#install-project').value),installed=project.plugins.includes(installPlugin.id);
  installedProjectId=null;$('#install-success').hidden=true;$('#visit-installed').hidden=true;$('#confirm-install').hidden=false;$('#confirm-install').disabled=installed;
  $('#confirm-install').textContent=installed?'已安装':'安装到 '+project.name;
  $('#install-scope').textContent=installed?`${project.name} 已安装 ${installPlugin.name}，无需重复安装。`:installPlugin.scope;
}
$('#install-form').onsubmit=event=>{
  event.preventDefault();const project=projects.find(project=>project.id===$('#install-project').value);if(project.plugins.includes(installPlugin.id))return;
  project.plugins.push(installPlugin.id);installedProjectId=project.id;
  renderProjectNavigation();if(currentPlugin==='plugins')renderMarketCards();
  $('#install-success').hidden=false;$('#install-success').textContent=`${installPlugin.name} 已添加到 ${project.name}。项目目录中已出现对应入口。`;
  $('#install-scope').textContent='此操作仅改变原型中的演示状态。';$('#confirm-install').hidden=true;$('#visit-installed').hidden=false;$('#visit-installed').focus();
};
$('#install-project').onchange=updateInstallState;
$('#close-install').onclick=()=>$('#install-dialog').close();
$('#install-dialog').addEventListener('close',()=>{if(installPlugin)$(`[data-install-plugin="${installPlugin.id}"]`)?.focus();});
$('#visit-installed').onclick=()=>{const id=installedProjectId,name=installPlugin.id;$('#install-dialog').close();selectProject(id);selectPlugin(name,{restore:false});setDirectory(name);};
$('#project-menu').addEventListener('beforetoggle',event=>{if(event.newState==='open'){const trigger=$('#project-trigger').getBoundingClientRect(),sidebar=$('#app-sidebar').getBoundingClientRect();Object.assign($('#project-menu').style,{left:sidebar.left+10+'px',top:trigger.bottom+8+'px',width:sidebar.width-20+'px'});}});
$('#project-options').onclick=event=>{const button=event.target.closest('[data-project-option]');if(button)selectProject(button.dataset.projectOption);};
$('#project-menu').addEventListener('toggle',event=>{if(event.newState==='closed')$('#project-trigger').focus({preventScroll:true});});
$('#directory-back').onclick=()=>{const previous=directory;setDirectory('root');$(`#project-plugins [data-plugin="${previous}"]`)?.focus();};
$('#plugin-scroll-left').onclick=()=>$('#plugin-strip').scrollBy({left:-$('#plugin-strip').clientWidth*.8});
$('#plugin-scroll-right').onclick=()=>$('#plugin-strip').scrollBy({left:$('#plugin-strip').clientWidth*.8});
$('#plugin-strip').addEventListener('scroll',updatePluginStrip);
$('#plugin-item-search').oninput=renderPluginItems;
new ResizeObserver(revealDirectoryPlugin).observe($('#plugin-strip-frame'));
$('#directory-add-goal').onclick=()=>{if(innerWidth<=600)setSidebar(false,false);$('#add-goal').click();};
$('#empty-add-goal').onclick=()=>$('#add-goal').click();
$('#collapse-goals').onclick=()=>{const folded=currentProject.folded.has('experience');folded?currentProject.folded.clear():currentProject.folded.add('experience');$('#collapse-goals').setAttribute('aria-label',folded?'折叠全部':'展开全部');renderGoalDirectory();};
$('#plugin-record-list').onclick=event=>{const button=event.target.closest('[data-directory-record]');if(!button)return;renderOtherPlugin(directory,button.dataset.directoryRecord);document.querySelectorAll('[data-directory-record]').forEach(row=>row.classList.toggle('is-current',row===button));if(innerWidth<=600)setSidebar(false,false);$('.plugin-record')?.focus({preventScroll:true});};
$('#hide-sidebar').onclick=()=>setSidebar(false);$('#show-sidebar').onclick=()=>setSidebar(true);$('#sidebar-scrim').onclick=()=>setSidebar(false);
$('#app-sidebar').addEventListener('click',event=>{const plugin=event.target.closest('[data-plugin]');if(!plugin)return;selectPlugin(plugin.dataset.plugin,{keepSidebar:currentProject.plugins.includes(plugin.dataset.plugin)});if(plugin.closest('#plugin-strip'))plugin.focus({preventScroll:true});});
$('#other-plugin').onclick=event=>{
  const related=event.target.closest('[data-open-related-goal]');if(related)openRecentGoal(related.dataset.openRelatedGoal,related.hasAttribute('data-artifact-link'));
  const install=event.target.closest('[data-install-plugin]');if(install)openInstall(install.dataset.installPlugin);
  const filter=event.target.closest('[data-market-filter]');if(filter){marketFilter=filter.dataset.marketFilter;document.querySelectorAll('[data-market-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button===filter)));renderMarketCards();}
};
let sidebarWasMobile=innerWidth<=600;
window.addEventListener('resize',()=>{const mobile=innerWidth<=600;if(mobile!==sidebarWasMobile){document.body.classList.remove('sidebar-mobile-open');$('#sidebar-scrim').hidden=true;$('#app-main').inert=false;$('#show-sidebar').hidden=!mobile&&!document.body.classList.contains('sidebar-collapsed');}sidebarWasMobile=mobile;});
renderProjectNavigation();selectPlugin('goals',{directory:false});setDirectory('root');$('#show-sidebar').hidden=innerWidth>600;
new ResizeObserver(()=>{const size=canvasSize();if(!size.width||!size.height)return;camera.x+=(size.width-previousCanvasSize.width)/2;camera.y+=(size.height-previousCanvasSize.height)/2;applyCamera();if(workspace.open){if(narrowWorkArea()&&!wasNarrow)workspace.classList.add('context-hidden');syncContext();}wasNarrow=narrowWorkArea();previousCanvasSize=size;}).observe(canvas);
