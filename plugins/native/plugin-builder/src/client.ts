import {RECORD_CLIENT_FACTORY_SCRIPT} from './record-client.js';
import {builderIcons,builderMark} from './visuals.js';
/**
 * The creation surface. Everything an agent appears to do here is read from the build's recorded steps;
 * the only local animation is the travel between two real states.
 */
export const BUILDER_CLIENT_FACTORY_SCRIPT=String.raw`(host)=>{
 const root=document.querySelector('[data-builder]');if(!root)return;
 const icons=${JSON.stringify(builderIcons)},mark=${JSON.stringify(builderMark)};
 const $=selector=>root.querySelector(selector),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const route=host.route||((p)=>p),base=route('/api/plugins/io.molis.work.plugin-builder');
 const reducedMotion=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
 root.style.setProperty('--pb-atlas','url("'+base+'/assets/inspiration-atlas.png")');
 let current=null,selection=null,state=null,busy=false,timer=null,renderedId=null,chatKey='',trying=false,loading=false,selectedNode=null,replay=null,replayTimer=null,placement=null,placementTimer=null,wiredFlash=null,attachment=null,lastPointer={},seenTrials=0,docErrorShown=false;
 const api=async(path,method='GET',body,query)=>{const url=new URL(base+path,location.origin);if(query)Object.entries(query).forEach(([k,v])=>{if(v)url.searchParams.set(k,v);});const response=await fetch(url,{method,cache:'no-store',headers:method==='GET'?{}:(globalThis.molisWorkControlHeaders?.()||host.headers?.()||{'content-type':'application/json'}),...(method==='GET'?{}:{body:JSON.stringify(body??{})})});const result=await response.json();if(!response.ok)throw new Error(result.error||'请求失败');return result;};
 const error=message=>{const el=$('[data-pb-error]');el.innerHTML=message?icons.alert+'<span>'+esc(message)+'</span>':'';el.hidden=!message;};
 const active=()=>current&&['clarifying','building'].includes(current.phase);
 const config=()=>{const pair=$('[data-pb-model]').value.split('\n');return {workspace_id:$('[data-pb-workspace]').value,provider_id:pair[0],model_id:pair[1]};};
 const settings=()=>{$('[data-pb-settings-panel]').hidden=false;};
 const schedule=()=>{clearTimeout(timer);if(active()&&!document.hidden&&!root.closest('[data-work-surface]')?.hidden)timer=setTimeout(advance,900);};
 const nodeArea=n=>!n?'':['heading','form','actions'].includes(n.kind)?'head':['search','filter'].includes(n.kind)?'query':'body';
 const speaker=(label,ai)=>'<div class="pb-speaker '+(ai?'ai':'')+'"><span>'+icons[ai?'sparkles':'user']+'</span>'+label+'</div>';
 const LAYOUT={cards:'灵感',list:'阅读',table:'整理'},LAYOUT_NAME={cards:'卡片',list:'列表',table:'表格'};
 const PART_ICON={heading:'text',form:'input',search:'search',filter:'filter',collection:'cards',summary:'hash',actions:'upload'};
 const AGENT={design:'主线设计',ui:'UI Agent',behavior:'功能 Agent',host:'完整性检查'};
 const steps=d=>d?.steps||[];
 const uiDecision=d=>steps(d).find(s=>s.agent==='ui'&&s.action==='decide'&&s.status==='waiting');
 const designDecision=d=>steps(d).find(s=>s.agent==='design'&&s.action==='decide'&&s.status==='waiting');
 const lastOf=(d,agent,filter=()=>true)=>[...steps(d)].reverse().find(s=>s.agent===agent&&filter(s));
 const placedIds=d=>new Set(d.nodes.map(n=>n.id));
 /** The function agent's next real unit of work: the first queued wiring whose part is already on the page. */
 const nextWiring=d=>{if(!d.behavior)return;const queued=steps(d).filter(s=>s.agent==='behavior'&&s.action==='connect'&&s.status==='queued'&&placedIds(d).has(s.target));return queued.sort((a,b)=>WIRING.indexOf(d.nodes.find(n=>n.id===a.target)?.kind)-WIRING.indexOf(d.nodes.find(n=>n.id===b.target)?.kind))[0];};
 const WIRING=['collection','form','search','filter','summary','actions'];
 const behaviorRun=d=>d.active?.stage==='behavior'?steps(d).find(s=>s.id==='run:'+d.active.token):null;
 const selectionBadge=s=>{const x=s?.selection;if(!x||!x.choice)return x?.source==='jev'?'<em class="pb-badge jev">Jev · '+x.candidates.length+' 个候选</em>':'';if(x.source==='jev')return '<em class="pb-badge jev" title="'+esc('候选：'+x.candidates.map(partName).join('、'))+'">Jev · '+x.candidates.length+' 选 1'+(x.elapsedMs!==undefined?' · '+x.elapsedMs+'ms':'')+'</em>';if(x.source==='user')return '<em class="pb-badge user">你选择</em>';return '<em class="pb-badge rule" title="'+esc(x.reason||'')+'">规则选择</em>';};
 const partName=kind=>kind==='finish'?'完成装配':state?.specBoard?.find(p=>p.kind===kind)?.name||kind;
 const empty=()=>{records.clear();$('[data-pb-preview]').innerHTML='<div class="pb-canvas-empty"><div class="pb-empty-mark">'+mark+'</div><h2>让一个想法，长成工具。</h2><p>说说你想完成的事。我会先理解使用场景，给你几种可以直接比较的方案，<br>再和你一起看着它一点点搭起来。</p><div class="pb-starters"><button class="pb-idea" data-pb-idea="做一个收集灵感的插件：保存标题、笔记、封面和来源，按标签分类，随时搜索回看。">'+icons.idea+'灵感收藏</button><button class="pb-idea" data-pb-idea="做一个库存小账本：录入商品、数量和单价，自动算出每件的库存价值和总额，能导入导出 CSV。">'+icons.database+'库存小账本</button><button class="pb-idea" data-pb-idea="做一个读书清单：记录书名、作者、阅读状态和评分，按状态筛选，统计今年读完了几本。">'+icons.book+'读书清单</button></div><button class="pb-button" data-pb-starter="inspiration">'+icons.play+'直接体验灵感库示例</button><small>示例不调用模型 · 数据只在本机</small></div>';$('[data-pb-chat]').innerHTML='<article class="pb-message">'+speaker('Molis AI',true)+'<p>你希望这个插件帮你完成什么？告诉我谁会用它、平时怎么用，以及你希望留下什么结果。也可以附上一份已有的 CSV 或文字资料。</p></article>';$('[data-pb-title]').textContent='你的新插件';renderShelf(null);};
 const records=(${RECORD_CLIENT_FACTORY_SCRIPT})({root:$('[data-pb-preview]'),request:(method,body,query)=>api('/builds/'+current.id+'/records',method,body,query),samples:()=>current?.phase==='choosing'?current.candidates.find(c=>c.id===selection)?.samples||[]:current?.samples||[],onInspect:id=>inspect(id),onLayout:layout=>action('layout',{layout}),onChange:()=>requestAnimationFrame(positionAgents),onPlace:placeElement,onWired:(element,node)=>{wiredFlash={element,node,at:Date.now()};requestAnimationFrame(positionAgents);setTimeout(()=>{if(wiredFlash?.element===element){wiredFlash=null;positionAgents();}},1500);}});
 const thumb=c=>{const covers=current?.example||(c.samples||[]).some(s=>Object.values(s).some(v=>/^https:\/\/molis\.example\/plugin-builder\/samples\//.test(String(v))));const items=Array.from({length:c.layout==='table'?5:4},(_,j)=>'<div class="pb-mini-item"><i class="pb-mini-cover '+(covers?'sample':'')+'" style="background-position:'+(j%2?'100%':'0')+' '+(j>1?'100%':'0')+'"></i><div><span></span><span></span></div></div>').join('');return '<div class="pb-mini '+esc(c.layout)+'" aria-hidden="true"><div class="pb-mini-head"><b>'+esc(c.title)+'</b><i></i></div>'+(c.layout==='table'?'<div class="pb-mini-cols"><span></span><span></span><span></span></div>':'')+'<div class="pb-mini-items">'+items+'</div></div>';};
 const action=async(name,extra={})=>{if(!current||(busy&&!['pause','stop'].includes(name)))return false;let succeeded=false;stopReplay();busy=true;error('');render();try{const result=await api('/builds/'+current.id+'/action','POST',{action:name,revision:current.revision,...config(),...extra});current=result.build;succeeded=true;if(result.release){await loadState();$('[data-pb-connected]').innerHTML='<a href="'+esc(route('/plugins/'+result.release.pluginId))+'" target="_blank" rel="noopener">已发布 v'+result.release.version+' · 独立打开 '+icons.external+'</a>';}}catch(e){error(e.message);try{current=(await api('/builds/'+current.id)).build;}catch{}}finally{busy=false;render();schedule();}return succeeded;};
 const advance=async()=>{if(busy||!active())return;busy=true;try{const id=current.id,result=await api('/builds/'+id+'/action','POST',{action:'advance'});if(current?.id===id)current=result.build;}catch(e){error(e.message);}finally{busy=false;render();schedule();}};
 const stateText=d=>uiDecision(d)?'等你决定下一个零件':({draft:d.questions.length?'等你回答几个问题':'等待你的补充',clarifying:'主线设计 · 正在理解需求',choosing:'比较方案，选择你的使用方式',building:'UI Agent 与功能 Agent 正在协作',paused:'已暂停 · 内容已保留',ready:'界面与功能已接通，可以试用',failed:'这一轮需要处理'})[d.phase];
 const liveState=d=>d.phase==='failed'?'failed':uiDecision(d)||designDecision(d)?'waiting':d.phase==='ready'?'ready':d.phase==='paused'?'paused':active()?'running':'idle';
 function agentLine(d,agent){
  if(agent==='ui'){
   const wait=uiDecision(d);if(wait)return {state:'waiting',text:'等你选择下一个零件',badge:''};
   const step=lastOf(d,'ui',s=>s.status!=='cancelled');
   if(step?.status==='active')return {state:'active',text:step.label,badge:selectionBadge(step)};
   if(replay!==null)return {state:'active',text:'回放已保存的界面',badge:''};
   if(d.assembling)return {state:'active',text:step?.status==='done'?step.label:'准备放入第一个零件',badge:selectionBadge(step)};
   if(d.design&&d.nodes.length)return {state:'done',text:'界面装配完成 · '+d.nodes.length+' 个零件',badge:''};
   return {state:'idle',text:d.design?'等待开始装配':'等待方案确定',badge:''};
  }
  const run=behaviorRun(d);if(run)return {state:'active',text:run.label,badge:''};
  const failed=lastOf(d,'behavior',s=>s.status==='failed');if(d.phase==='failed'&&failed)return {state:'failed',text:failed.detail||failed.label,badge:''};
  const next=nextWiring(d);if(next)return {state:'active',text:next.label,badge:''};
  const queued=steps(d).find(s=>s.agent==='behavior'&&s.action==='connect'&&s.status==='queued');
  if(queued)return {state:'idle',text:'等「'+(d.pendingNodes.concat(d.nodes).find(n=>n.id===queued.target)?.label||'零件')+'」出现后接通',badge:''};
  if(d.behavior&&d.nodes.length)return {state:'done',text:'数据与操作已接通',badge:''};
  return {state:'idle',text:d.design?'等待主线设计交付':'等待主线设计',badge:''};
 }
 function stepItem(s){const icon=s.status==='done'?icons.check:s.status==='failed'?icons.alert:s.status==='waiting'?icons.waiting:s.status==='cancelled'?icons.close:'';return '<li class="pb-step '+esc(s.agent)+' '+esc(s.status)+'"><i>'+icon+'</i><div><span><b>'+esc(AGENT[s.agent])+'</b>'+esc(s.label)+selectionBadge(s)+'</span>'+(s.detail&&s.status!=='queued'?'<small title="'+esc(s.detail)+'">'+esc(s.detail)+'</small>':'')+'</div></li>';}
 function renderLive(d){
  const live=liveState(d),ui=agentLine(d,'ui'),fn=agentLine(d,'behavior');
  const say=replay!==null?'这是示例装配回放，不会启动模型或改写数据。':d.phase==='choosing'?'这 '+d.candidates.length+' 个方案在使用方式上各有侧重。点一下就能在右侧看到实际界面，选定后我们就开始搭建。':designDecision(d)?'回答完这几个问题，我就能给出可以比较的方案。':live==='failed'?(d.error||'这一轮没有完成，已完成的部分都保留着。'):uiDecision(d)?'Jev 这一步没给出可用的选择。你来定下一个零件，其余进度都保留着。':d.phase==='clarifying'?(d.revising?'我在理解你'+(d.revising.target?'对「'+d.revising.target.label+'」':'')+'的修改。已经成立的部分会保留，只调整需要变的地方。':'我在理解你的需求，马上给你几种可以比较的方案。'):d.phase==='ready'?'已经可以用了。切到「试用」亲手试试，再把它发布成自己的插件。':d.phase==='paused'?'已暂停。已放入的零件和已接通的功能都保留着，随时可以继续。':'开始搭建。你可以看着它成形，也可以点画布上的任何部分提出修改。';
  const visible=steps(d).filter(s=>s.status!=='queued'&&!(s.action==='decide'&&s.status==='waiting')).slice(-6);const upcoming=[nextWiring(d)].filter(Boolean);
  let html='<section class="pb-live" data-live="'+live+'">'+speaker('Molis AI',true)+'<p>'+esc(say)+'</p>';
  html+='<div class="pb-agent-status"><div class="ui '+ui.state+'"><i class="pb-agent-dot"></i><b>UI Agent</b><span>'+esc(ui.text)+'</span>'+ui.badge+'</div><div class="fn '+fn.state+'"><i class="pb-agent-dot"></i><b>功能 Agent</b><span>'+esc(fn.text)+'</span></div></div>';
  const wait=uiDecision(d);if(wait)html+='<div class="pb-decision"><strong>'+icons.waiting+esc(wait.label)+'</strong><p>'+esc(wait.detail||'')+'</p><div>'+wait.selection.candidates.map(k=>'<button class="pb-chip" data-pb-pick="'+esc(k)+'">'+(icons[PART_ICON[k]]||icons.check)+esc(partName(k))+'</button>').join('')+'</div></div>';
  if(visible.length||upcoming.length)html+='<details class="pb-steps-wrap" '+(live==='running'||live==='waiting'?'open':'')+'><summary>协作记录 <small>'+steps(d).filter(s=>s.status==='done').length+' 步已完成</small>'+icons.chevron+'</summary><ol class="pb-steps">'+visible.map(stepItem).join('')+upcoming.map(s=>'<li class="pb-step next '+esc(s.agent)+'"><i></i><div><span><b>接下来</b>'+esc(s.label)+'</span></div></li>').join('')+'</ol></details>';
  html+='<div class="pb-playback">'+(active()?'<button data-pb-action="pause">'+icons.pause+'暂停</button>':'')+(d.active?'<button data-pb-action="stop">停止本轮</button>':'')+(['paused','failed'].includes(d.phase)&&(d.design||!d.active)?'<button class="pb-resume" data-pb-action="resume">'+icons.play+(uiDecision(d)?'重新交给 Jev':d.design?'继续构建':'重新理解需求')+'</button>':'')+(d.example&&d.phase==='ready'?'<button data-pb-replay>'+icons[replay!==null?'pause':'play']+(replay!==null?'停止示例回放':'回放示例装配')+'</button>':'')+(d.history.length&&!d.active?'<button data-pb-action="undo" title="撤回上一次改动">'+icons.undo+'撤回</button>':'')+'</div></section>';
  return html;
 }
 const previewCandidate=candidate=>records.update(candidate,[{id:'candidate-heading',kind:'heading',label:candidate.title},{id:'candidate-form',kind:'form',label:candidate.presentation?.addLabel||'添加记录'},{id:'candidate-search',kind:'search',label:'搜索'},{id:'candidate-collection',kind:'collection',label:'集合'}],null);
 function renderChat(d){
  const key=JSON.stringify([d.revision,selection,busy,replay!==null,state?.selectionAvailable]);if(key===chatKey)return;chatKey=key;const chat=$('[data-pb-chat]'),stick=chat.scrollHeight-chat.scrollTop-chat.clientHeight<40,scroll=chat.scrollTop;
  const firstReply=d.messages.find(m=>m.role==='assistant');const selected=d.candidates.find(c=>c.id===selection)||d.design;
  let html='<article class="pb-message user">'+speaker('我',false)+'<p>'+esc(d.brief)+'</p></article><article class="pb-message">'+speaker('Molis AI',true)+'<p>'+esc(firstReply?.text||'我会先理清使用过程，再给出几种可以直接比较的方案。')+'</p></article>';
  if(d.phase==='clarifying'&&!d.design)html+='<div class="pb-thinking">'+icons.sparkles+'<span>正在分析谁会用、怎么用、留下什么结果</span><i></i><i></i><i></i></div>';
  if(selected)html+='<details class="pb-reasoning" open><summary>需求解析与设计依据 '+icons.chevron+'</summary><p>'+esc(d.example?'先收集，再整理，随时找回。':selected.description)+'</p><small>'+esc(d.example?'轻量录入 · 本地保存 · 按主题浏览':selected.journey.join(' → '))+'</small>'+(d.phase==='choosing'?'<ul class="pb-fields">'+selected.fields.map(f=>'<li>'+esc(f.label)+'<small>'+esc(({text:'文字',url:'链接',number:'数字',tags:'标签',boolean:'是/否'})[f.type])+'</small></li>').join('')+(selected.calculations||[]).map(c=>'<li class="calc">'+esc(c.label)+'<small>计算</small></li>').join('')+'</ul>':'')+'</details>';
  if(d.questions.length)html+='<div class="pb-questions"><strong>'+icons.question+'还需要确认 '+d.questions.length+' 件事</strong><ol>'+d.questions.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ol><button class="pb-text-button" data-pb-answer>'+icons.message+'在下方回答</button></div>';
  if(d.candidates.length){const ordered=[...d.candidates].sort((a,b)=>['list','table','cards'].indexOf(a.layout)-['list','table','cards'].indexOf(b.layout));const pressed=c=>d.phase==='choosing'?selection===c.id:d.example?d.design?.layout===c.layout:d.design?.id===c.id;
   html+='<h3>'+(d.phase==='choosing'?'选择一个适合你的使用方式':'方案与当前方向')+'</h3><div class="pb-candidates">'+ordered.map(c=>'<button class="pb-candidate" data-pb-candidate="'+esc(c.id)+'" aria-pressed="'+pressed(c)+'" title="'+esc(c.rationale)+'">'+thumb(c)+'<strong>'+esc(LAYOUT[c.layout])+'</strong></button>').join('')+'</div>';
   const focus=d.candidates.find(c=>c.id===selection);
   if(focus)html+='<div class="pb-compare"><strong>'+esc(focus.title)+' <small>'+esc(LAYOUT_NAME[focus.layout])+'布局</small></strong><p>'+esc(focus.rationale)+'</p><small>'+esc(focus.journey.join(' → '))+'</small></div>';
   else if(d.phase==='choosing')html+='<p class="pb-hint">点一个方案，右侧立刻换成它的实际界面。也可以在下方说说想怎么组合。</p>';
   if(d.phase==='choosing'||selection&&selection!==d.design?.id&&!d.example)html+='<div class="pb-choose-actions"><button class="pb-button pb-primary" data-pb-confirm '+(!selection||busy?'disabled':'')+'>采用方案并开始搭建 '+icons.arrow+'</button>'+(state?.selectionAvailable?'<label><input type="checkbox" data-pb-jev> 让 Jev 选择集合布局</label>':'')+'</div>';}
  if(d.design)html+='<details class="pb-design"><summary><span>主线已确定 <small>第 '+(d.history.length+1)+' 版</small><span class="pb-journey">'+esc(d.example?'收集 → 分类 → 回看':d.design.journey.join(' → '))+'</span></span>'+icons.chevron+'</summary><ul>'+d.design.acceptance.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>'+(d.selection?'<small>'+esc(d.selection.source==='jev'?'集合布局由 '+d.selection.model+' 选择 · '+d.selection.elapsedMs+'ms':d.selection.reason)+'</small>':'')+'<small class="pb-selector">界面零件由'+(state?.selectionAvailable?' Jev 从规格板候选中逐个选择':'规格板规则逐个选择（Jev 未配置）')+'</small></details>';
  const firstAssistant=d.messages.indexOf(firstReply);const later=d.messages.filter((m,i)=>i>0&&i!==firstAssistant).slice(-6);
  const conversation=later.map((m,i)=>'<article class="pb-message '+(m.role==='user'?'user':'')+'">'+(later[i-1]?.role===m.role?'':speaker(m.role==='user'?'我':'Molis AI',m.role!=='user'))+'<p>'+esc(m.text)+'</p></article>').join('');
  if(d.design||d.steps?.length)html+=conversation+renderLive(d);else html+=conversation;
  chat.innerHTML=html;chat.scrollTop=stick?chat.scrollHeight:scroll;
 }
 function renderShelf(d){
  const shelf=$('.pb-shelf');const board=state?.specBoard||[];if(!d?.design||trying||!board.length){shelf.hidden=true;return;}
  const placed=new Set(d.nodes.map(n=>n.kind)),pick=lastOf(d,'ui',s=>s.status==='active')||uiDecision(d);const legal=pick?.selection?new Set(pick.selection.candidates):null;
  const tags=d.design.fields.some(f=>f.type==='tags'),numbers=d.design.fields.some(f=>f.type==='number')||d.design.calculations.length;
  const selectedKind=d.nodes.find(n=>n.id===(selectedNode||placement?.id))?.kind;
  shelf.hidden=false;shelf.innerHTML='<span class="pb-shelf-label">'+icons.frame+'规格板</span>'+board.map(p=>{const unavailable=(p.kind==='filter'&&!tags)||(p.kind==='summary'&&!numbers);const cls=[placed.has(p.kind)?'placed':'',legal?.has(p.kind)?'candidate':'',selectedKind===p.kind?'selected':'',unavailable?'unavailable':''].join(' ');
   const icon=icons[p.kind==='collection'?({cards:'cards',list:'list',table:'table'})[d.design.layout]:PART_ICON[p.kind]];
   return '<button class="'+cls+'" data-pb-part="'+esc(p.kind)+'" '+(d.assembling&&!placed.has(p.kind)&&!unavailable?'draggable="true" ':'')+(unavailable?'disabled ':'')+'title="'+esc(unavailable?p.name+'：这个设计没有对应字段':p.name+' · '+p.purpose+(placed.has(p.kind)?'（已放入，点一下检查）':d.assembling?'（点一下由你放入）':''))+'">'+icon+'<span>'+esc(p.name)+'</span>'+(placed.has(p.kind)?'<i>'+icons.check+'</i>':'')+'</button>';}).join('');
 }
 function render(){
  if(!current)return;const d=current;if(renderedId!==d.id){records.clear();renderedId=d.id;chatKey='';selection=null;trying=false;selectedNode=null;error('');$('[data-pb-connected]').textContent='';}
  root.classList.toggle('pb-trying',trying);root.dataset.live=liveState(d);$('[data-pb-title]').textContent=d.title;$('[data-pb-badge]').textContent=replay!==null?'示例回放':d.example?'示例草稿':d.phase==='ready'?'可试用':'草稿';$('[data-pb-status]').textContent=replay!==null?'示例装配回放 · 不调用模型':stateText(d);
  $('[data-pb-build]').classList.toggle('selected',!trying);$('[data-pb-try]').classList.toggle('selected',trying);$('[data-pb-build]').setAttribute('aria-pressed',String(!trying));$('[data-pb-try]').setAttribute('aria-pressed',String(trying));$('[data-pb-try]').disabled=!d.design;
  const publish=$('[data-pb-action="publish"]');publish.hidden=d.phase!=='ready'||Boolean(d.active);publish.disabled=busy||replay!==null;
  $('[data-pb-send]').disabled=busy||Boolean(d.active);$('[data-pb-send]').setAttribute('aria-label',d.design?'发送修改':'开始设计');$('[data-pb-compose] textarea').placeholder=d.active?'这一轮完成后可以继续提出修改…':selectedNode?'说说想怎么改这里…':d.design?'告诉我，下一步想怎么改…':d.phase==='choosing'?'想组合方案或补充要求？直接说…':'描述你想做的插件…';
  if(d.phase==='choosing'&&!d.candidates.some(c=>c.id===selection))selection=[...d.candidates].sort((a,b)=>['list','table','cards'].indexOf(a.layout)-['list','table','cards'].indexOf(b.layout))[0]?.id??null;
  renderChat(d);
  if(d.phase==='choosing'){const candidate=d.candidates.find(c=>c.id===selection);if(candidate){previewCandidate(candidate);records.setMode('proposal');}}
  else if(d.design){records.update(d.design,d.nodes,d.behavior,d.connected);records.setMode(trying?'try':'building');const trial=steps(d).filter(s=>s.id.startsWith('samples:')).length;if(trial!==seenTrials){seenTrials=trial;void records.refresh();}}
  else if(d.phase==='clarifying'||d.phase==='draft')renderThinking(d);
  $('[data-pb-layout]').disabled=busy||Boolean(d.active);if(d.design)$('[data-pb-layout]').value=d.design.layout;
  $('[data-pb-runs]').innerHTML=(d.runs||[]).map(r=>'<div><strong>'+esc(({design:'主线设计',ui:'UI Agent',behavior:'功能 Agent'})[r.stage])+'</strong> · '+esc(r.phase)+'<small>'+esc(r.model_id)+' · '+esc(r.run_id||'等待运行标识')+'</small></div>').join('')||'此草稿还没有 Prologue 运行记录。';
  if(!$('[data-pb-connected]').querySelector('a'))$('[data-pb-connected]').textContent=d.example?'示例内容 · 预览与正式数据分开':d.behavior?'预览数据保存在本机，与正式插件分开':'功能待接通 · 输入会保留';
  renderShelf(d);if(d.error&&d.phase==='failed'){error(d.error);docErrorShown=true;}else if(docErrorShown){error('');docErrorShown=false;}requestAnimationFrame(positionAgents);
 }
 /** Before a design exists the canvas shows what is being understood, never a fabricated page. */
 function renderThinking(d){const preview=$('[data-pb-preview]');if(preview.querySelector('.pb-app-head'))return;const text=d.phase==='clarifying'?'正在理解需求':'等你补充';if(preview.dataset.thinking===d.id+text)return;preview.dataset.thinking=d.id+text;
  preview.innerHTML='<div class="pb-canvas-thinking" data-phase="'+esc(d.phase)+'"><div class="pb-brief-card"><small>你的想法</small><p>'+esc(d.brief)+'</p></div><div class="pb-skeleton" aria-hidden="true"><i class="h"></i><i class="q"></i><div><i></i><i></i><i></i></div></div><p>'+(d.phase==='clarifying'?icons.sparkles+'主线设计正在梳理旅程、字段与候选方案':icons.question+'回答左侧的问题后，我会给出方案')+'</p></div>';}
 function inspect(id){if(!current?.design||trying)return;selectedNode=id||null;const panel=$('[data-pb-inspector-panel]');panel.hidden=false;
  const chosen=current.nodes.find(n=>n.id===selectedNode),nodes=chosen?[chosen]:current.nodes;const locked=busy||Boolean(current.active)||current.pendingNodes.length>0;
  const wired=new Set(current.connected||current.nodes.map(n=>n.id));
  $('[data-pb-inspector]').innerHTML=(chosen?'<p class="pb-inspector-lead">'+(icons[PART_ICON[chosen.kind]]||'')+'<b>'+esc(partName(chosen.kind))+'</b><span class="'+(chosen.kind==='heading'||current.behavior&&wired.has(chosen.id)?'on':'')+'">'+(chosen.kind==='heading'?'纯展示':current.behavior&&wired.has(chosen.id)?'功能已接通':'功能待接通')+'</span></p>':'<p class="pb-hint">同一区域内可调整顺序，记录会保留。</p>')+nodes.map(n=>{const i=current.nodes.indexOf(n);return '<div class="pb-inspector-row"><label>'+esc(chosen?'显示文字':partName(n.kind))+'<input aria-label="零件标签" data-pb-node-label="'+esc(n.id)+'" value="'+esc(n.label)+'" '+(locked?'disabled':'')+'></label><button data-pb-node-up="'+esc(n.id)+'" '+(nodeArea(current.nodes[i-1])!==nodeArea(n)||locked?'disabled':'')+' aria-label="上移零件">'+icons.arrow+'</button><button data-pb-node-down="'+esc(n.id)+'" '+(nodeArea(current.nodes[i+1])!==nodeArea(n)||locked?'disabled':'')+' aria-label="下移零件">'+icons.arrow+'</button></div>';}).join('')+(chosen?'<button class="pb-ask" data-pb-ask>'+icons.message+'对这里提修改</button>':'');
  $('[data-pb-layout-wrap]').hidden=Boolean(chosen&&chosen.kind!=='collection');
  $('[data-pb-context]').hidden=!chosen;$('[data-pb-context]').innerHTML=chosen?icons.target+'<span>指向 · '+esc(chosen.label)+'</span><button type="button" data-pb-context-clear aria-label="取消指向">'+icons.close+'</button>':'';render();
 }
 function clearInspect(){$('[data-pb-inspector-panel]').hidden=true;selectedNode=null;$('[data-pb-context]').hidden=true;render();}
 function finishPlacement(){clearTimeout(placementTimer);if(placement){const element=placement.element;element.classList.remove('pb-awaiting-placement');element.removeAttribute('aria-busy');element.inert=false;element.classList.add('pb-just-placed');setTimeout(()=>element.classList.remove('pb-just-placed'),700);placement=null;}}
 /** The page already holds the part; it stays a marked target until the pointer arrives, then materializes. */
 function placeElement(element,label){
  if((!active()&&replay===null)||trying||reducedMotion())return;
  finishPlacement();placement={element,label,id:element.closest('[data-node-id]')?.dataset.nodeId};element.classList.add('pb-awaiting-placement');element.dataset.placeLabel=label;element.setAttribute('aria-busy','true');element.inert=true;
  // A timer, not an animation frame: a hidden tab must never leave a part stuck as a placeholder.
  placementTimer=setTimeout(()=>{if(placement?.element!==element)return;finishPlacement();positionAgents();},720);requestAnimationFrame(positionAgents);
 }
 const OP_TARGET={form:'[data-record-add]',actions:'[data-record-export]',search:'[data-record-search]',filter:'[data-record-filters]',collection:'[data-record-list]',summary:'[data-record-totals]'};
 const nodeEl=id=>[...$('[data-pb-preview]').querySelectorAll('[data-node-id]')].find(n=>n.dataset.nodeId===id);
 const opEl=node=>{const el=node&&nodeEl(node.id);return el&&(el.querySelector(OP_TARGET[node.kind])||el);};
 function pointerPlan(d){
  const shelf=$('.pb-shelf');const plans={};
  if(trying||!d?.design)return plans;
  // UI Agent
  const wait=uiDecision(d),picking=lastOf(d,'ui',s=>s.status==='active');const lastPlaced=lastOf(d,'ui',s=>s.status==='done'&&s.target);
  if(placement)plans.ui={el:placement.element,text:'放入'+placement.label,mode:'act'};
  else if(wait&&!shelf.hidden)plans.ui={el:shelf,text:'等你选零件',mode:'waiting',dock:'top'};
  else if(picking&&!shelf.hidden)plans.ui={el:shelf,text:'Jev 在 '+picking.selection.candidates.length+' 个候选中选择',mode:'thinking',dock:'top'};
  else if(replay!==null)plans.ui={el:$('[data-pb-preview] .pb-record:last-of-type')||nodeEl('collection'),text:'回放素材卡片',mode:'act'};
  else if((d.assembling||d.phase==='building')&&lastPlaced&&nodeEl(lastPlaced.target))plans.ui={el:nodeEl(lastPlaced.target),text:lastPlaced.label,mode:d.assembling?'act':'done'};
  // The example replay shows an already wired plugin, so the function agent only points at a finished connection.
  if(replay!==null){const form=d.nodes.find(n=>n.kind==='form');if(form)plans.fn={el:opEl(form),text:'保存已接通',mode:'done'};return plans;}
  // 功能 Agent
  const run=behaviorRun(d),next=nextWiring(d);
  if(wiredFlash&&document.contains(wiredFlash.element))plans.fn={el:opEl(wiredFlash.node)||wiredFlash.element,text:wiredFlash.element.dataset.wireLabel||'已接通',mode:'done'};
  else if(next){const node=d.nodes.find(n=>n.id===next.target);plans.fn={el:opEl(node),text:next.label,mode:'act',hint:true};}
  else if(run){const anchor=opEl(d.nodes.find(n=>n.kind==='form'))||nodeEl('heading');if(anchor)plans.fn={el:anchor,text:'编写数据与行为',mode:'thinking'};}
  return plans;
 }
 function positionAgents(){
  const d=current,canvas=$('.pb-canvas'),bounds=canvas.getBoundingClientRect();const plans=pointerPlan(d);
  const outline=$('[data-pb-selection]'),hint=$('[data-pb-hint]');
  const outlined=selectedNode?nodeEl(selectedNode):placement?.element||(plans.ui&&plans.ui.el!==$('.pb-shelf')&&plans.ui.mode==='act'?plans.ui.el:null);
  outline.hidden=trying||!outlined;outline.classList.toggle('placing',Boolean(placement));
  if(!outline.hidden){const b=outlined.getBoundingClientRect();outline.style.transform='translate('+(b.left-bounds.left-5)+'px,'+(b.top-bounds.top-5)+'px)';outline.style.width=(b.width+10)+'px';outline.style.height=(b.height+10)+'px';if(b.bottom<bounds.top||b.top>bounds.bottom)outline.hidden=true;}
  hint.hidden=!plans.fn?.hint;if(!hint.hidden){const b=plans.fn.el.getBoundingClientRect();hint.style.transform='translate('+(b.left-bounds.left-4)+'px,'+(b.top-bounds.top-4)+'px)';hint.style.width=(b.width+8)+'px';hint.style.height=(b.height+8)+'px';}
  for(const [kind,key] of [['ui','ui'],['behavior','fn']]){
   const el=$('[data-pb-pointer="'+kind+'"]'),plan=plans[key];if(!plan?.el){el.hidden=true;continue;}
   const b=plan.el.getBoundingClientRect();if(b.bottom<bounds.top||b.top>bounds.bottom||!b.width){el.hidden=true;continue;}
   let x,y;if(plan.dock==='top'){x=b.left-bounds.left+b.width*0.5-10;y=b.top-bounds.top-76;}else if(key==='ui'){x=b.right-bounds.left-18;y=b.top-bounds.top+10;}else{x=b.right-bounds.left+2;y=b.top-bounds.top+Math.min(b.height*0.55,40);}
   x=Math.max(4,Math.min(bounds.width-120,x));y=Math.max(4,Math.min(bounds.height-66,y));
   const wasHidden=el.hidden;el.hidden=false;if(wasHidden)el.style.transition='none';el.style.transform='translate('+x+'px,'+y+'px)';if(wasHidden){void el.offsetWidth;el.style.transition='';}
   el.dataset.mode=plan.mode;el.querySelector('small').textContent=plan.text;
   const signature=plan.text+'|'+plan.mode;if(lastPointer[key]!==signature&&plan.mode==='act'){el.classList.remove('clicking');void el.offsetWidth;el.classList.add('clicking');}lastPointer[key]=signature;
  }
 }
 function stopReplay(){finishPlacement();clearTimeout(replayTimer);if(replay!==null){replay=null;records.setVisibleCount(Infinity);chatKey='';}}
 function playExample(){if(replay!==null){stopReplay();render();return;}trying=false;selectedNode=null;replay=0;records.setVisibleCount(0);render();const next=()=>{if(replay===null)return;replay++;records.setVisibleCount(replay);chatKey='';render();if(replay<4)replayTimer=setTimeout(next,1100);else replayTimer=setTimeout(()=>{stopReplay();render();},2200);};replayTimer=setTimeout(next,600);}
 const loadState=async()=>{state=await api('/state');const workspace=$('[data-pb-workspace]'),model=$('[data-pb-model]'),w=workspace.value,m=model.value;workspace.innerHTML='<option value="">选择工作区</option>'+state.workspaces.map(x=>'<option value="'+esc(x.workspace_id)+'">'+esc(x.label)+'</option>').join('');model.innerHTML='<option value="">选择模型</option>'+state.models.map(x=>'<option value="'+esc(x.provider_id+'\n'+x.model_id)+'">'+esc(x.label)+'</option>').join('');if(w)workspace.value=w;else if(state.workspaces.length===1)workspace.selectedIndex=1;if(m)model.value=m;else if(state.models.length===1)model.selectedIndex=1;
  $('[data-pb-config-hint]').textContent=!state.runtimeAvailable?'Prologue 尚未装配，请检查运行环境。':!state.models.length?'先在模型设置中配置一个模型，再开始真实构建。可先体验灵感库示例。':!state.workspaces.length?'先将工作区关联到当前项目，再开始设计。':'配置已就绪。'+(state.selectionAvailable?' Jev 会从规格板候选中逐个选择界面零件。':' Jev 未配置：界面零件按规格板规则选择，并如实标注。');updateModelLabel();};
 const updateModelLabel=()=>{$('[data-pb-model-label]').textContent=($('[data-pb-model]').value?'Prologue · '+$('[data-pb-model]').selectedOptions[0].textContent:'Prologue · 设置工作区与模型')+(state?.selectionAvailable?' · Jev':'');};
 const openBuild=async id=>{stopReplay();clearTimeout(timer);current=(await api('/builds/'+id)).build;render();schedule();};
 const library=async()=>{await loadState();const installedRelease=version=>Number(/^([0-9]+)\.0\.0$/.exec(version||'')?.[1]||0);$('[data-pb-library-panel]').hidden=false;$('[data-pb-library-list]').innerHTML=state.builds.length?state.builds.map(b=>{const release=state.releases.find(r=>r.buildId===b.id),installed=release&&state.installedVersions[release.pluginId],installedNumber=installedRelease(installed),openVersion=installedNumber||release?.version;return '<article class="pb-library-entry"><div><strong>'+esc(b.title)+'</strong><small>'+esc(b.brief.slice(0,100))+'</small></div><button class="pb-button" data-pb-open="'+esc(b.id)+'">继续编辑</button>'+(release?'<a href="'+esc(route('/plugins/'+release.pluginId))+'" target="_blank" rel="noopener">打开 v'+openVersion+' '+icons.external+'</a><small>'+(installedNumber?'已安装 v'+installedNumber+(release.version>installedNumber?' · 最新发布 v'+release.version:''):'未安装 · 首次打开时安装')+'</small>'+(installedNumber&&release.version>installedNumber?'<button class="pb-button pb-primary" data-pb-upgrade="'+esc(b.id)+'" data-pb-upgrade-version="'+release.version+'">升级到 v'+release.version+'</button>':''):'<small>未发布</small>'+(b.active?'<small>构建结束后可删除</small>':'<button class="pb-button" data-pb-remove="'+esc(b.id)+'">删除草稿</button>'))+'</article>';}).join(''):'<p>还没有插件。写下一句需求，开始第一个。</p>';};
 const composeText=()=>$('[data-pb-compose] textarea');
 const resize=()=>{const t=composeText();t.style.height='auto';t.style.height=Math.min(160,t.scrollHeight)+'px';};
 /** Drag within an area to reorder, or from the spec board onto the canvas to place a part yourself. */
 const whenIdle=async()=>{for(let i=0;i<40&&busy;i++)await new Promise(r=>setTimeout(r,50));};
 let dragging=null;const preview=$('[data-pb-preview]'),dropLine=$('[data-pb-drop]');
 const canArrange=()=>current?.design&&!trying&&!current.active&&!current.pendingNodes.length&&!current.assembling;
 preview.addEventListener('pointerdown',event=>{const node=event.target.closest('[data-node-id]');if(!node||!canArrange()||event.target.closest('input,textarea,select,button,a,dialog'))return;node.draggable=true;});
 preview.addEventListener('dragstart',event=>{const node=event.target.closest?.('[data-node-id]');if(!node?.draggable)return;dragging={node:node.dataset.nodeId,area:nodeArea(current.nodes.find(n=>n.id===node.dataset.nodeId))};event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',node.dataset.nodeId);node.classList.add('pb-dragging');});
 const dropTarget=event=>{if(!dragging?.node)return null;const node=event.target.closest?.('[data-node-id]');if(!node||node.dataset.nodeId===dragging.node)return null;const n=current.nodes.find(x=>x.id===node.dataset.nodeId);if(nodeArea(n)!==dragging.area)return null;const b=node.getBoundingClientRect(),row=getComputedStyle(node.parentElement).flexDirection==='row'||getComputedStyle(node.parentElement).display==='grid';const after=row?event.clientX>b.left+b.width/2:event.clientY>b.top+b.height/2;const siblings=current.nodes.filter(x=>nodeArea(x)===dragging.area);const next=after?siblings[siblings.indexOf(n)+1]:n;return {el:node,row,after,before:next?.id??null};};
 preview.addEventListener('dragover',event=>{if(dragging?.part){event.preventDefault();preview.classList.add('pb-drop-ready');return;}const target=dropTarget(event);dropLine.hidden=!target;if(!target)return;event.preventDefault();const c=$('.pb-canvas').getBoundingClientRect(),b=target.el.getBoundingClientRect();if(target.row){dropLine.style.transform='translate('+((target.after?b.right+6:b.left-6)-c.left)+'px,'+(b.top-c.top)+'px)';dropLine.style.width='2px';dropLine.style.height=b.height+'px';}else{dropLine.style.transform='translate('+(b.left-c.left)+'px,'+((target.after?b.bottom+6:b.top-6)-c.top)+'px)';dropLine.style.width=b.width+'px';dropLine.style.height='2px';}});
 preview.addEventListener('dragleave',event=>{if(!preview.contains(event.relatedTarget)){dropLine.hidden=true;preview.classList.remove('pb-drop-ready');}});
 preview.addEventListener('drop',async event=>{const target=dropTarget(event),part=dragging?.part,nodeId=dragging?.node;event.preventDefault();dropLine.hidden=true;preview.classList.remove('pb-drop-ready');dragging=null;try{await whenIdle();if(part)await action('part',{kind:part});else if(target&&nodeId)await action('node',{nodeId,before:target.before});}catch(e){error(e.message);}finally{schedule();}});
 root.addEventListener('dragend',()=>{preview.querySelectorAll('.pb-dragging').forEach(n=>{n.classList.remove('pb-dragging');n.draggable=false;});dropLine.hidden=true;preview.classList.remove('pb-drop-ready');dragging=null;});
 $('.pb-shelf').addEventListener('dragstart',event=>{const button=event.target.closest('[data-pb-part]');if(!button||!current?.assembling||current.nodes.some(n=>n.kind===button.dataset.pbPart)){event.preventDefault();return;}dragging={part:button.dataset.pbPart};event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('text/plain',button.dataset.pbPart);});
 root.addEventListener('click',async event=>{const el=event.target.closest('button,[data-pb-home]');if(!el)return;try{
  if(el.matches('[data-pb-home]')){event.preventDefault();await library();return;}
  if(el.matches('[data-pb-settings]')){settings();return;}if(el.matches('[data-pb-settings-close]')){$('[data-pb-settings-panel]').hidden=true;return;}
  if(el.matches('[data-pb-library]')){await library();return;}if(el.matches('[data-pb-library-close]')){$('[data-pb-library-panel]').hidden=true;return;}
  if(el.dataset.pbOpen){$('[data-pb-library-panel]').hidden=true;await openBuild(el.dataset.pbOpen);return;}
  if(el.dataset.pbRemove){if(!confirm('删除这份未发布的插件草稿和试用记录？'))return;const id=el.dataset.pbRemove,d=(await api('/builds/'+id)).build;await api('/builds/'+id+'/action','POST',{action:'remove',revision:d.revision});if(current?.id===id){stopReplay();clearTimeout(timer);current=null;renderedId=null;empty();}await library();return;}
  if(el.dataset.pbUpgrade){const d=(await api('/builds/'+el.dataset.pbUpgrade)).build;await api('/builds/'+el.dataset.pbUpgrade+'/action','POST',{action:'upgrade',revision:d.revision,version:Number(el.dataset.pbUpgradeVersion)});await library();return;}
  if(el.matches('[data-pb-new]')){stopReplay();current=null;renderedId=null;selectedNode=null;clearTimeout(timer);error('');$('[data-pb-compose]').reset();attach(null);$('[data-pb-action="publish"]').hidden=true;$('[data-pb-inspector-panel]').hidden=true;$('[data-pb-context]').hidden=true;root.querySelectorAll('[data-pb-pointer],[data-pb-selection],[data-pb-hint]').forEach(e=>e.hidden=true);$('[data-pb-connected]').textContent='';delete root.dataset.live;empty();root.classList.add('pb-chat-open');composeText().focus();return;}
  if(el.dataset.pbIdea){composeText().value=el.dataset.pbIdea;resize();composeText().focus();return;}
  if(el.matches('[data-pb-action="publish"]')){const hasPrior=state?.releases?.some(release=>release.buildId===current?.id);if(hasPrior){const dialog=$('[data-pb-publish-dialog]');root.querySelectorAll('[data-pb-compatibility]').forEach(input=>input.checked=false);$('[data-pb-publish-confirm]').disabled=true;dialog.showModal();}else await action('publish');return;}
  if(el.matches('[data-pb-publish-cancel]')){$('[data-pb-publish-dialog]').close();return;}
  if(el.matches('[data-pb-publish-confirm]')){const choice=root.querySelector('[data-pb-compatibility]:checked')?.value;if(!choice)return;$('[data-pb-publish-dialog]').close();await action('publish',{compatibility:choice});return;}
  if(el.dataset.pbStarter){if(busy)return;busy=true;try{current=(await api('/builds','POST',{starter:el.dataset.pbStarter})).build;renderedId=null;render();}finally{busy=false;render();}return;}
  if(el.matches('[data-pb-chat-close]')){root.classList.remove('pb-chat-open');$('[data-pb-chat-toggle]').focus();return;}if(el.matches('[data-pb-chat-toggle]')){root.classList.toggle('pb-chat-open');return;}
  if(el.matches('[data-pb-answer]')){composeText().focus();return;}
  if(el.matches('[data-pb-attach]')){$('[data-pb-file]').click();return;}if(el.matches('[data-pb-attach-clear]')){attach(null);return;}
  if(el.dataset.pbCandidate){const candidate=current.candidates.find(c=>c.id===el.dataset.pbCandidate);if(!candidate)return;if(current.example){await action('layout',{layout:candidate.layout});selection=null;return;}if(current.phase!=='choosing'&&current.design?.id===candidate.id){selection=null;chatKey='';render();return;}selection=candidate.id;chatKey='';render();return;}
  if(el.matches('[data-pb-confirm]')){if(!config().model_id){settings();throw new Error('选择模型后开始构建。');}const chosen=await action('choose',{candidateId:selection,selection:$('[data-pb-jev]')?.checked?'jev':'manual'});selection=null;if(chosen)await action('resume');root.classList.remove('pb-chat-open');return;}
  if(el.dataset.pbPick){await whenIdle();await action('part',{kind:el.dataset.pbPick});if(current.phase==='building')schedule();return;}
  if(el.dataset.pbAction){if(el.dataset.pbAction==='resume'&&!config().model_id){settings();throw new Error('选择模型后继续构建。');}await action(el.dataset.pbAction);return;}
  if(el.matches('[data-pb-try],[data-pb-build]')){stopReplay();trying=el.hasAttribute('data-pb-try');selectedNode=null;$('[data-pb-inspector-panel]').hidden=true;$('[data-pb-context]').hidden=true;render();return;}
  if(el.matches('[data-pb-replay]')){playExample();return;}
  if(el.matches('[data-pb-inspector-close]')){clearInspect();return;}
  if(el.matches('[data-pb-context-clear]')){clearInspect();return;}
  if(el.matches('[data-pb-ask]')){composeText().focus();root.classList.add('pb-chat-open');return;}
  if(el.matches('[data-pb-inspect-all]')){inspect();return;}
  if(el.dataset.pbPart){const kind=el.dataset.pbPart,node=current?.nodes.find(n=>n.kind===kind);if(node){inspect(node.id);return;}if(current?.assembling){await whenIdle();await action('part',{kind});schedule();return;}error('「'+partName(kind)+'」没有放入这个插件。想加上它，可以在左侧直接告诉我。');return;}
  if(el.dataset.pbNodeUp||el.dataset.pbNodeDown){await action('node',{nodeId:el.dataset.pbNodeUp||el.dataset.pbNodeDown,direction:el.dataset.pbNodeUp?-1:1});inspect(selectedNode);return;}
 }catch(e){error(e.message);}});
 root.addEventListener('change',async event=>{const el=event.target;try{if(el.matches('[data-pb-model],[data-pb-workspace]')){updateModelLabel();return;}if(el.matches('[data-pb-file]')){const file=el.files?.[0];el.value='';if(!file)return;if(file.size>200000)throw new Error('资料不能超过 200KB，可以只保留有代表性的部分。');attach({name:file.name,text:(await file.text()).slice(0,6000)});return;}if(el.dataset.pbNodeLabel){await action('node',{nodeId:el.dataset.pbNodeLabel,label:el.value});return;}if(el.matches('[data-pb-layout]')){await action('layout',{layout:el.value});return;}}catch(e){error(e.message);}});
 root.addEventListener('change',event=>{if(event.target.matches('[data-pb-compatibility]'))$('[data-pb-publish-confirm]').disabled=!root.querySelector('[data-pb-compatibility]:checked');});
 function attach(file){attachment=file;const chip=$('[data-pb-attachment]');chip.hidden=!file;chip.innerHTML=file?icons.paperclip+'<span>'+esc(file.name)+'</span><small>'+file.text.split('\n').length+' 行</small><button type="button" data-pb-attach-clear aria-label="移除资料">'+icons.close+'</button>':'';}
 $('[data-pb-compose]').addEventListener('submit',async event=>{event.preventDefault();if(busy)return;const input=composeText();let message=input.value.trim();if(!message&&!attachment)return;error('');try{
  if(!config().workspace_id||!config().model_id){settings();throw new Error('先选择已授权工作区和模型，你写下的需求会保留。');}
  if(attachment)message=(message||'参考这份资料来设计。')+'\n\n［已有内容：'+attachment.name+'］\n'+attachment.text;
  if(!current){current=(await api('/builds','POST',{brief:message})).build;renderedId=null;input.value='';attach(null);resize();render();await action('design');return;}
  if(current.design){const ok=await action('revise',{message,target:selectedNode||null});if(ok){input.value='';attach(null);resize();clearInspect();}return;}
  if(!await action('message',{message}))return;input.value='';attach(null);resize();render();await action('design');
 }catch(e){error(e.message);}});
 composeText().addEventListener('input',resize);
 composeText().addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&(event.metaKey||event.ctrlKey||!matchMedia('(pointer:coarse)').matches)){event.preventDefault();$('[data-pb-compose]').requestSubmit();}});
 $('.pb-canvas-scroll').addEventListener('scroll',positionAgents,{passive:true});new ResizeObserver(positionAgents).observe($('.pb-canvas'));
 root.addEventListener('keydown',event=>{if(event.key==='Escape'){root.classList.remove('pb-chat-open');$('[data-pb-settings-panel]').hidden=true;if(selectedNode||!$('[data-pb-inspector-panel]').hidden)clearInspect();}});
 const initialize=async()=>{if(loading)return;loading=true;try{await loadState();const requested=new URL(location.href).searchParams.get('build');if(requested)await openBuild(requested);else if(state.builds.length)await openBuild(state.builds[0].id);else empty();}catch(e){error(e.message);}finally{loading=false;}};
 const surface=root.closest('[data-work-surface]');if(!surface?.hidden)void initialize();if(surface)new MutationObserver(()=>{if(!surface.hidden&&!state)void initialize();else if(!surface.hidden)schedule();else clearTimeout(timer);}).observe(surface,{attributes:true,attributeFilter:['hidden','class']});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else schedule();});
}`;
