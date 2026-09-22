import { icon, type MolisWorkIcon } from '../../../packages/design-system/src/icons';
import { renderButton, escapeHtml as esc, renderInput, renderTextarea } from '../../../packages/design-system/src/primitives/index';
import { mountMaterialApp } from './material-preview';
import './builder.css';
import './material-preview.css';

type Layout = 'list' | 'table' | 'cards';
type Phase = 'brief' | 'analyzing' | 'directions' | 'build' | 'ready';
type Draft = { phase: Phase; layout: Layout; tick: number; revision: number; request: string; name: string; summary: string; mixed: boolean };
const DRAFT_BASE = 'molis-builder-draft-v3';
const draftId = new URLSearchParams(location.search).get('draft');
let DRAFT_KEY = DRAFT_BASE + (draftId && /^[a-z0-9-]{1,80}$/.test(draftId) ? ':' + draftId : '');
const RELEASE_KEY = 'molis-builder-release-v3';
const initial: Draft = {phase:'build',layout:'cards',tick:8,revision:1,request:'做一个收集灵感的插件，能保存、分类和快速检索。',name:'灵感库',summary:'轻量录入 · 本地保存 · 按主题浏览',mixed:true};
function readDraft(): Draft {
  try {const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');if(d&&['brief','analyzing','directions','build','ready'].includes(d.phase)&&['list','table','cards'].includes(d.layout)&&Number.isInteger(d.tick)&&d.tick>=0&&d.tick<=13&&typeof d.name==='string'&&typeof d.request==='string'&&typeof d.summary==='string')return {...initial,...d};}catch{}
  return {...initial};
}
let copyError=false;
if(location.pathname==='/'&&new URLSearchParams(location.search).get('edit')==='release') {
  try {const r=JSON.parse(localStorage.getItem(RELEASE_KEY)||'null');if(r&&['list','table','cards'].includes(r.layout)) {
    const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
    const draft:Draft={...initial,...r.draft,name:r.name,layout:r.layout,mixed:r.bulk!==false,revision:(Number(r.revision)||1)+1,phase:'ready',tick:13};
    localStorage.setItem(DRAFT_BASE+':'+id,JSON.stringify(draft));DRAFT_KEY=DRAFT_BASE+':'+id;window.history.replaceState(null,'','/?draft='+id);
  }}catch{copyError=true;}
}
let state=readDraft();
let mode:'building'|'try'=state.phase==='ready'?'try':'building';
let running=false, pausedForGap=false, activeInspector='', analysisStep=state.phase==='analyzing'?0:4;
let timer:ReturnType<typeof setTimeout>|undefined, commitTimer:ReturnType<typeof setTimeout>|undefined, analysisTimer:ReturnType<typeof setTimeout>|undefined;
let history:Draft[]=[];
let preview:ReturnType<typeof mountMaterialApp>|undefined;
let returnFocus:HTMLElement|null=null;
const root=document.querySelector<HTMLElement>('#app')!;
const btn=(label:string,action:string,glyph?:MolisWorkIcon,variant:'primary'|'secondary'|'ghost'='ghost')=>renderButton({label,icon:glyph,variant,attrs:{'data-action':action}});
const iconBtn=(label:string,action:string,glyph:MolisWorkIcon)=>renderButton({label,icon:glyph,iconOnly:true,variant:'ghost',attrs:{'data-action':action,title:label}});
const tag=(text:string,tone='muted')=>`<span class="b-tag ${tone}">${text}</span>`;
const JOURNEY=['录入素材','浏览与筛选','批量选择','导出内容'];
const STEPS=[
 {uiStep:0,featureStep:0,part:'frame',fnPart:'frame',pool:'页面容器',ui:'选择页面容器',fn:'等待页面结构',title:'先搭起界面',event:'UI Agent 先搭页面。功能 Agent 根据已经出现的界面，逐步补齐行为。'},
 {uiStep:1,featureStep:0,part:'frame',fnPart:'frame',pool:'页面容器',ui:'放入页面容器',fn:'读取主线中的数据约定',title:'页面有了自己的空间',event:'先确定页面的边界和留白，再逐个放入内容。'},
 {uiStep:2,featureStep:0,part:'title',fnPart:'title',pool:'标题与文本',ui:'放入标题与说明',fn:'定义素材字段',title:'补上标题与说明',event:'标题、链接、标签和备注，成为这件工具共用的数据结构。'},
 {uiStep:3,featureStep:0,part:'search',fnPart:'title',pool:'搜索框',ui:'放入搜索框',fn:'准备素材读取',title:'放入第一个控件',event:'搜索框先出现在页面里。输入可以保留，搜索行为还在准备。'},
 {uiStep:4,featureStep:0,part:'filters',fnPart:'content',pool:'标签筛选',ui:'补上标签筛选',fn:'接入素材数据',title:'找到内容的方式开始清晰',event:'UI Agent 配置筛选入口，功能 Agent 同时准备素材数据。'},
 {uiStep:5,featureStep:1,part:'content',fnPart:'content',pool:'素材卡片',ui:'放入第一张素材卡片',fn:'素材读取已接通',title:'内容出现在页面上',event:'素材读取已接通。绿色勾落在列表上，表示这一块已经有数据。'},
 {uiStep:6,featureStep:1,part:'add',fnPart:'add',pool:'录入表单',ui:'补上添加入口与表单',fn:'实现校验与本地保存',title:'界面先行，行为跟进',event:'现在可以打开表单输入。功能 Agent 正在接通校验和保存，输入会一直保留。'},
 {uiStep:7,featureStep:1,part:'content',fnPart:'add',pool:'素材卡片',ui:'补齐主题素材',fn:'连接保存与失败反馈',title:'补齐批量操作',event:'UI Agent 继续补齐选择控件，功能 Agent 留在录入区域处理保存。'},
 {uiStep:8,featureStep:2,part:'card',fnPart:'add',pool:'素材卡片',ui:'放入素材卡片',fn:'本地保存已接通',title:'保存已经能用了',event:'开始搭建。你可以看着它成形。'},
 {uiStep:8,featureStep:2,part:'filters',fnPart:'search',pool:'空状态',ui:'检查筛选后的空状态',fn:'连接搜索与标签',title:'让输入开始起作用',event:'功能 Agent 根据搜索框和标签入口，实现对应的查询行为。'},
 {uiStep:8,featureStep:3,part:'content',fnPart:'search',pool:'内容反馈',ui:'检查内容与筛选反馈',fn:'搜索筛选已接通',title:'搜索和筛选已经接通',event:'搜索区域出现了勾。之前输入的查询会立即生效。'},
 {uiStep:8,featureStep:3,part:'export',fnPart:'export',pool:'状态提示',ui:'核对导出反馈',fn:'连接批量选择与 CSV',title:'完成最后一个动作',event:'功能 Agent 将所选素材接到导出按钮，保留标题、链接、标签和备注。'},
 {uiStep:8,featureStep:4,part:'export',fnPart:'export',pool:'导出按钮',ui:'页面装配完成',fn:'选择与导出已接通',title:'每个动作，都接上了',event:'导出按钮旁的勾已出现。现在请亲自走一遍录入、筛选和导出。'},
 {uiStep:8,featureStep:4,part:'title',fnPart:'export',pool:'完整页面',ui:'交给你试用',fn:'全部行为已连接',title:'轮到你亲手试试',event:'演示装配已完成。用自己的内容试用，然后保存为可独立打开的插件。'},
];
function persist(){try{localStorage.setItem(DRAFT_KEY,JSON.stringify(state));}catch{toast('草稿未能写入浏览器，请保留当前页面。');}}
function snapshot(){history.push({...state});if(history.length>20)history.shift();}
let toastTimer:ReturnType<typeof setTimeout>|undefined;
function toast(text:string){const el=document.querySelector<HTMLElement>('#b-toast');if(!el)return;el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4400);}
function revision(){document.querySelectorAll('.b-revision').forEach(el=>el.textContent='v'+state.revision);}
const pointer=`<svg viewBox="0 0 24 30" fill="none" aria-hidden="true"><path d="M3 2L21 18L12.5 19L9 27L3 2Z" fill="currentColor" stroke="var(--paper)" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const molisMark=`<svg viewBox="0 0 24 24" class="b-molis-mark" aria-hidden="true"><path d="M5 5L19 19M18 5v9" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><circle cx="5" cy="19" r="3" fill="currentColor" stroke="none"/></svg>`;
const aiAvatar=`<span class="b-ai-avatar">${icon('sparkles')}</span>`;
function shell(){
 root.innerHTML=`<div class="b-shell">
 <header class="b-top"><a href="/" class="b-brand" aria-label="Molis 插件 Builder">${molisMark}<span>Molis</span></a><span class="b-top-divider">/</span><span class="b-top-title">插件 Builder</span><div class="b-top-right"><button data-action="library" class="b-project-menu">灵感库项目 ${icon('chevron-down')}</button><span class="b-top-separator"></span>${iconBtn('从新需求开始','new','plus')}${iconBtn('切换深浅色','theme','sun')}<span class="b-account" aria-label="当前用户">A</span></div></header>
 <aside class="b-sidebar"><header class="b-sidebar-title"><h2>一起把想法做出来</h2><span class="b-mobile-chat">${iconBtn('收起协同对话','chat','x')}</span></header>
 <div class="b-conversation"><div class="b-user-message"><div class="b-speaker"><span>${icon('user')}</span>我</div><p id="b-request">${esc(state.request)}</p></div>
 <section class="b-understanding"><div class="b-agent-heading">${aiAvatar}<span>Molis AI</span></div><p class="b-understanding-intro">好的，我来帮你设计一个专注于收集、整理和回看的灵感插件。</p><div id="b-reasoning"></div></section>
 <section class="b-design-choices" id="b-design-choices"><h3>选择一个适合你的使用方式</h3><div class="b-thumbnail-options" id="b-thumbnail-options"></div></section>
 <button class="b-brief-card" data-action="brief"><span>主线已确定 <span class="b-revision">v${state.revision}</span>${icon('chevron-right')}</span><span class="b-mini-journey">收集 <i>→</i> 分类 <i>→</i> 回看</span><span id="b-summary" class="mw-sr-only">${esc(state.summary)}</span></button>
 <div class="b-agent-message b-next-note"><div class="b-agent-heading">${aiAvatar}<span>Molis AI</span></div><p id="b-agent-note"></p></div>
 <div id="b-work-note" class="b-work-note" hidden><div><span class="b-person-dot ui"></span><b>UI Agent</b><span id="b-ui-status"></span></div><div><span class="b-person-dot fn"></span><b>功能 Agent</b><span id="b-fn-status"></span></div></div>
 <div class="b-playback" id="b-playback"></div><div id="b-chat-log" class="b-chat-log" aria-live="polite"></div></div>
 <div class="b-composer-wrap"><div class="b-context-chip" id="b-context" hidden></div><form id="b-composer"><span class="b-composer-icon">${icon('message')}</span><label class="mw-sr-only" for="b-message">告诉协同 Agent 你的想法</label><textarea id="b-message" rows="1" placeholder="告诉我，下一步想怎么改…"></textarea><button class="b-send" type="submit" aria-label="发送修改">${icon('arrow')}</button></form><span class="b-composer-note">交互原型 · 模型解析与 Agent 调度为 Mock</span></div>
 </aside>
 <main class="b-main"><header class="b-heading"><div><span class="b-mobile-chat">${iconBtn('打开协同对话','chat','message')}</span><span class="b-project-icon">${icon('columns')}</span><h1 id="b-heading-title">${esc(state.name)}</h1><span class="b-draft-label">草稿</span></div><div class="b-mode" aria-label="画布模式"><button data-action="edit-mode" class="selected">构建</button><button data-action="try-mode">试用</button></div><div class="b-heading-actions"><span id="b-main-action"></span>${iconBtn('查看主线与设计','brief','file')}</div></header><div class="b-stage" id="b-stage"></div></main>
 </div><div id="b-toast" class="b-toast" role="status"></div><dialog id="b-dialog" class="b-dialog"></dialog>`;
 bindShell();renderReasoning();renderPhase();if(state.phase==='analyzing')runAnalysis();if(copyError)toast('无法创建新草稿，原有草稿和使用版本均已保留。');
}

const ANALYSIS=[
 ['提炼目标','让保存的素材在下一次创作时找得到、用得上。'],
 ['梳理使用过程','快速录入 → 浏览回看 → 按标签筛选 → 选择后导出。'],
 ['确定当前边界','先做单人、本地保存；自动抓取和团队协作暂不加入。'],
 ['形成设计判断','保留同一套数据，比较阅读、批量整理与主题浏览三种交互。'],
];
function renderReasoning(){
 const el=document.querySelector('#b-reasoning');if(!el)return;const done=analysisStep>=4;
 el.innerHTML=`<details class="b-reasoning" open><summary><span>需求解析与设计依据</span>${icon('chevron-down')}</summary><div class="b-reasoning-body">${done?`<p>先收集，再整理，随时找回。</p><span>轻量录入 · 本地保存 · 按主题浏览</span><button data-action="reasoning" class="b-reason-more">查看设计判断 ${icon('arrow')}</button>`:ANALYSIS.map(([title,body],i)=>i<analysisStep?`<div class="b-reason-item"><span>${icon('check')}${title}</span><p>${body}</p></div>`:i===analysisStep?`<div class="b-reason-item thinking"><span><i></i>${title}</span><p>正在整理这一部分…</p></div>`:'').join('')}</div></details>`;
}

function runAnalysis(){stop();clearTimeout(analysisTimer);analysisStep=0;renderReasoning();const next=()=>{analysisStep++;renderReasoning();if(analysisStep<4){analysisTimer=setTimeout(next,1250);}else{state.phase='directions';persist();renderPhase();}};analysisTimer=setTimeout(next,1100);}
function analyze(request:string){clearTimeout(analysisTimer);stop();state.request=request;state.phase='analyzing';state.tick=0;document.querySelector('#b-request')!.textContent=request;persist();renderPhase();runAnalysis();}
function miniature(layout:Layout){
 return `<div class="b-mini-app ${layout}" aria-hidden="true"><div class="b-mini-top"><i></i><span>灵感库</span><b>+</b></div><div class="b-mini-toolbar"></div><div class="b-mini-content">${[0,1,2,3].map(i=>`<div class="b-mini-item"><span class="b-mini-photo cover-${i}"></span><i></i><i></i><small></small></div>`).join('')}</div></div>`;
}
function renderChoices(){
 const host=document.querySelector('#b-thumbnail-options')!;
 host.innerHTML=([['list','阅读','连续阅读，逐条编辑'],['table','整理','比较字段，批量导出'],['cards','灵感','浏览摘要，按主题回看']] as const).map(([id,title,desc])=>`<button class="b-thumbnail ${state.layout===id?'selected':''}" data-direction="${id}" aria-label="${title}：${desc}" aria-pressed="${state.layout===id}" title="${desc}">${miniature(id)}<span>${title}</span>${state.layout===id?`<b>${icon('check')}</b>`:''}</button>`).join('');
}
function assemblyAt(tick:number){const s=STEPS[tick];return {uiStep:s.uiStep,featureStep:s.featureStep,cardCount:Math.max(0,Math.min(4,tick-4))};}
function renderPhase(){
 const stage=document.querySelector<HTMLElement>('#b-stage')!;preview?.destroy();preview=undefined;activeInspector='';
 document.querySelector('#b-heading-title')!.textContent=state.name;document.querySelector('#b-summary')!.textContent=state.summary;document.querySelector('#b-request')!.textContent=state.request;revision();
 analysisStep=state.phase==='analyzing'?analysisStep:state.phase==='brief'?0:4;document.querySelector<HTMLElement>('.b-understanding')!.hidden=state.phase==='brief';renderReasoning();renderChoices();
 const building=state.phase==='build'||state.phase==='ready',planning=state.phase==='directions';
 document.querySelector<HTMLElement>('#b-work-note')!.hidden=!building;document.querySelector<HTMLElement>('#b-context')!.hidden=true;
 document.querySelector<HTMLElement>('#b-design-choices')!.hidden=!building&&!planning;
 document.querySelector<HTMLElement>('.b-brief-card')!.hidden=!building&&!planning;
 document.querySelector('#b-main-action')!.innerHTML=planning?btn('开始构建','start','arrow','primary'):btn('打开插件',state.tick===13?'install':'open-preview','external','secondary');
 document.querySelector<HTMLElement>('.b-mode')!.hidden=!building;
 document.querySelector('#b-playback')!.innerHTML=building?`<button class="b-play-control" data-action="pause">${icon('play')}继续构建</button><button data-action="replay" aria-label="从空画布重播构建" title="从空画布重播">${icon('refresh')}</button><button data-action="step" aria-label="构建下一步" title="下一步">${icon('arrow')}</button><button data-action="undo" aria-label="撤销上次界面修改" title="撤销">${icon('undo')}</button>`:'';
 if(state.phase==='brief'||state.phase==='analyzing'){
  document.querySelector('#b-agent-note')!.textContent=state.phase==='brief'?'你希望这个插件帮你完成什么？':'从目标和使用过程出发，整理三个方向。';
  stage.innerHTML=`<div class="b-design-wait"><span class="b-wait-mark">${molisMark}</span><h2>${state.phase==='brief'?'让一个想法，长成工具。':'正在理解你的想法。'}</h2><p>${state.phase==='brief'?'在左侧说说，你想完成什么。':'理清目标、交互与范围，再开始设计。'}</p>${state.phase==='brief'?btn('试试灵感库这个例子','example','arrow','secondary'):''}<div class="b-wait-lines"><i></i><i></i><i></i></div></div>`;return;
 }
 stage.innerHTML=`<div class="b-canvas-area"><div class="b-canvas-scroll"><div class="b-artboard" id="b-artboard"><div id="b-material"></div></div></div><div class="b-agent-layer" aria-hidden="true" ${planning?'hidden':''}><div class="b-placement" id="b-placement"></div><div class="b-virtual-cursor ui" id="b-ui-cursor">${pointer}<div class="b-cursor-label"><strong>UI Agent</strong><span></span></div><i></i></div><div class="b-virtual-cursor fn" id="b-fn-cursor">${pointer}<div class="b-cursor-label"><strong>功能 Agent</strong><span></span></div><i></i></div></div><aside class="b-inspector" id="b-inspector" hidden></aside><div class="b-component-shelf" aria-label="界面零件池">${[['frame','容器'],['type','文本'],['input','输入'],['review','按钮'],['list','列表'],['columns','卡片']].map(([glyph,title],i)=>`<button data-action="${i===5?'selection':'pool'}" class="${i===5?'selected':''}">${icon((glyph==='type'?'file':glyph) as MolisWorkIcon)}<span>${title}</span></button>`).join('')}<button class="b-shelf-more" data-action="gap" aria-label="模拟组件缺口" title="模拟组件缺口">${icon('more')}</button></div></div>`;
 preview=mountMaterialApp(document.querySelector<HTMLElement>('#b-material')!,{mode:planning?'try':mode,name:state.name,bulk:state.mixed,layout:state.layout,stage:7,onInspect:inspect,onAction:toast,onLayout:layout=>{snapshot();state.layout=layout;state.revision++;persist();revision();renderChoices();positionAgents(state.tick);}});
 preview.setAssembly(planning?{uiStep:8,featureStep:0,cardCount:4}:assemblyAt(state.tick));
 document.querySelector('.b-canvas-scroll')!.addEventListener('scroll',()=>positionAgents(state.tick),{passive:true});
 if(planning){document.querySelector('#b-agent-note')!.textContent='三个方向的区别在于如何使用。选一个，我会按照当前主线开始构建。';stage.classList.add('is-planning');}
 else{stage.classList.remove('is-planning');updateBuildView();}
 requestAnimationFrame(()=>positionAgents(state.tick));
}

function closeInspector(){const panel=document.querySelector<HTMLElement>('#b-inspector');if(panel)panel.hidden=true;activeInspector='';const context=document.querySelector<HTMLElement>('#b-context');if(context)context.hidden=true;}
function updateBuildView(){
 if(state.phase!=='build'&&state.phase!=='ready')return;const s=STEPS[state.tick];
 document.querySelector('#b-agent-note')!.textContent=pausedForGap?'这里还缺一个合适的零件，页面已保留。':s.event;
 document.querySelector('#b-main-action')!.innerHTML=btn('打开插件',state.tick===13?'install':'open-preview','external','secondary');
 document.querySelector('#b-ui-status')!.textContent=s.ui;document.querySelector('#b-fn-status')!.textContent=s.fn;
 const pause=document.querySelector<HTMLButtonElement>('[data-action="pause"]');if(pause){pause.innerHTML=icon(running?'pause':state.tick===13?'check':'play')+(running?'暂停':state.tick===13?'构建已完成':'继续构建');pause.disabled=state.tick===13;}
 const next=document.querySelector<HTMLButtonElement>('[data-action="step"]');if(next)next.disabled=state.tick===13;
 const stage=document.querySelector('.b-stage')!;stage.classList.toggle('is-running',running);stage.classList.toggle('is-ready',state.tick===13);stage.classList.toggle('is-trying',mode==='try');
 document.querySelector('[data-action="edit-mode"]')?.classList.toggle('selected',mode==='building');document.querySelector('[data-action="try-mode"]')?.classList.toggle('selected',mode==='try');
 document.querySelectorAll('.mp-item.is-agent-target').forEach(el=>el.classList.remove('is-agent-target'));
 if(mode==='building'&&state.tick===8)document.querySelector('[data-build-part="card"]')?.classList.add('is-agent-target');
 if(activeInspector)inspect(activeInspector,false);
}

function pointFor(part:string,owner:'ui'|'fn'){
 const area=document.querySelector<HTMLElement>('.b-canvas-area')!,frame=document.querySelector<HTMLElement>('#b-artboard')!;
 const a=area.getBoundingClientRect(),f=frame.getBoundingClientRect();let target=document.querySelector<HTMLElement>(`#b-material [data-build-part="${part}"]`);
 if(part==='frame')target=frame;
 const r=target?.getBoundingClientRect();const visible=r&&r.width>0&&r.height>0;
 const defaults:Record<string,[number,number]>={frame:[.12,46],title:[.18,65],search:[.38,146],filters:[.55,146],content:[.28,265],card:[.64,460],add:[.88,64],select:[.07,290],export:[.78,64]};
 const d=defaults[part]||defaults.content;
 let x=visible?r!.right-a.left+5:f.left-a.left+f.width*d[0];
 let y=visible?r!.top-a.top+Math.min(24,r!.height*.3):f.top-a.top+d[1];
 if(owner==='fn'&&visible){x=r!.right-a.left-16;y=r!.bottom-a.top+1;}
 return {offscreen:!!(visible&&(r!.top>a.bottom-65||r!.bottom<a.top+8)),x:Math.max(8,Math.min(a.width-115,x)),y:Math.max(20,Math.min(a.height-145,y)),width:visible?Math.min(r!.width,500):220,height:visible?Math.min(r!.height,220):42};
}

function positionAgents(tick:number){if(!document.querySelector('#b-ui-cursor'))return;const s=STEPS[tick];for(const owner of ['ui','fn'] as const){const cursor=document.querySelector<HTMLElement>(`#b-${owner}-cursor`)!;const p=pointFor(owner==='ui'?s.part:s.fnPart,owner);cursor.style.transform=`translate(${p.x}px,${p.y}px)`;cursor.style.visibility=p.offscreen?'hidden':'visible';cursor.querySelector('span')!.textContent=owner==='ui'?s.ui:s.fn;cursor.classList.toggle('waiting',owner==='fn'&&tick<3);}}
function start(){snapshot();stop();document.querySelector('#b-chat-log')!.innerHTML='';clearTimeout(analysisTimer);state.phase='build';state.tick=0;state.revision++;mode='building';pausedForGap=false;persist();renderReasoning();renderPhase();resume();}
function stop(){running=false;clearTimeout(timer);clearTimeout(commitTimer);timer=undefined;commitTimer=undefined;document.querySelectorAll('.b-virtual-cursor').forEach(el=>el.classList.remove('clicking'));document.querySelector('#b-placement')?.classList.remove('visible');}
function resume(){if(state.tick>=13)return;if(pausedForGap){showGap();return;}running=true;updateBuildView();advance();}
function advance(){
 if(state.tick>=13||pausedForGap||commitTimer)return;const next=state.tick+1,s=STEPS[next];positionAgents(next);
 const placement=document.querySelector<HTMLElement>('#b-placement')!;const p=pointFor(s.part,'ui');
 placement.style.transform=`translate(${Math.max(12,p.x-34)}px,${Math.max(12,p.y-12)}px)`;placement.style.width=Math.min(p.width,340)+'px';placement.style.height=p.height+'px';placement.classList.toggle('visible',s.uiStep>STEPS[state.tick].uiStep);
 document.querySelector('#b-ui-status')!.textContent=s.ui;document.querySelector('#b-fn-status')!.textContent=s.fn;
 commitTimer=setTimeout(()=>{commitTimer=undefined;state.tick=next;preview?.setAssembly(assemblyAt(next));placement.classList.remove('visible');document.querySelectorAll('.b-virtual-cursor').forEach(el=>el.classList.add('clicking'));positionAgents(next);

  if(next===13){stop();state.phase='ready';mode='try';closeInspector();preview?.setMode('try');document.querySelector('[data-action="edit-mode"]')?.classList.remove('selected');document.querySelector('[data-action="try-mode"]')?.classList.add('selected');log('演示装配完成。接下来由你试用，保存后可在创作台之外打开。');}
  persist();updateBuildView();if(running)timer=setTimeout(advance,2100);
 },900);
}
function log(message:string,who='协同 Agent'){const host=document.querySelector('#b-chat-log')!;const el=document.createElement('div');el.className='b-log-entry';el.innerHTML=`<span>${icon(who==='你'?'user':'network')}${esc(who)}</span><p>${esc(message)}</p>`;host.append(el);const con=document.querySelector('.b-conversation')!;con.scrollTop=con.scrollHeight;}

function openDialog(html:string,cls=''){const d=document.querySelector<HTMLDialogElement>('#b-dialog')!;returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;d.className='b-dialog '+cls;d.innerHTML=html;d.showModal();}
function closeDialog(){const d=document.querySelector<HTMLDialogElement>('#b-dialog')!;d.close();returnFocus?.focus();}
function brief(){openDialog(`<form id="b-brief-form"><header><div>${icon('file')}<h2>主线设计</h2>${tag('v'+state.revision)}</div>${iconBtn('关闭主线设计','close','x')}</header><div class="b-dialog-body"><p class="b-dialog-lede">UI 与功能都以这里的当前版本为准。</p><label class="b-field">插件名称${renderInput({id:'b-brief-name',value:state.name})}</label><label class="b-field">要完成的事${renderTextarea({id:'b-brief-summary',value:state.summary,rows:3})}</label><label class="b-bulk-option"><input type="checkbox" id="b-brief-bulk" ${state.mixed?'checked':''}>保留批量选择与导出</label><div class="b-brief-section"><h3>用户旅程</h3><div class="b-journey">${JOURNEY.map((x,i)=>`<span>${i+1}. ${x}</span>${i<3?icon('arrow'):''}`).join('')}</div></div><div class="b-definition-grid"><div><h3>页面与状态</h3><p>素材列表、详情与录入；空、加载、保存失败、导出完成。</p></div><div><h3>数据与存储</h3><p>标题、链接、标签、备注。演示数据保存在当前浏览器。</p></div><div><h3>完成标准</h3><p>能录入、筛选、批量导出，独立打开后内容仍在。</p></div><div><h3>明确不做</h3><p>自动抓取、团队协作、云端同步。</p></div></div></div><footer>${btn('取消','close')}${renderButton({label:'保存主线',icon:'check',type:'submit'})}</footer></form>`);document.querySelector('#b-brief-form')!.addEventListener('submit',e=>{e.preventDefault();const name=(document.querySelector('#b-brief-name') as HTMLInputElement).value.trim();const summary=(document.querySelector('#b-brief-summary') as HTMLTextAreaElement).value.trim();if(!name||!summary){toast('名称和要完成的事都需要填写。');return;}snapshot();state.name=name;state.summary=summary;state.mixed=(document.querySelector('#b-brief-bulk') as HTMLInputElement).checked;preview?.setBulk(state.mixed);state.revision++;persist();closeDialog();document.querySelectorAll('.b-revision').forEach(el=>el.textContent='v'+state.revision);document.querySelector('#b-summary')!.textContent=summary;document.querySelector('#b-heading-title')!.textContent=name;preview?.setName(name);const caption=document.querySelector('#b-artboard-name');if(caption)caption.textContent=name;log('主线更新为 v'+state.revision+'。这次修改的是名称与目标说明，当前组件和数据保持。');});}
function showPool(selected=''){openDialog(`<header><div>${icon('grid')}<h2>规格板的零件池</h2></div>${iconBtn('关闭零件池','close','x')}</header><div class="b-dialog-body"><p class="b-dialog-lede">只包含 UI 组件。保存、筛选和导出由功能线负责。</p><div class="b-pool-grid">${[['容器','frame','承载页面与区域'],['输入框','input','输入文字与链接'],['列表','list','连续阅读素材'],['表格','grid','并排比较字段'],['卡片','columns','按内容浏览'],['按钮','review','触发已绑定操作'],['弹窗','message','集中录入内容'],['状态提示','info','呈现成功与失败']].map(([n,i,h])=>`<div class="b-pool-item ${selected===n?'selected':''}">${icon(i as MolisWorkIcon)}<span>${n}<small>${h}</small></span>${tag('可用','done')}</div>`).join('')}</div><div class="b-pool-rule">${icon('shield')}先检查页面、插槽和属性约束，再交给选择模型。</div></div><footer>${btn('查看控件缺口示例','gap','alert')}${btn('回到画布','close','arrow','primary')}</footer>`,'b-pool-dialog');}
function inspect(id:string,focus=true){activeInspector=id;const panel=document.querySelector<HTMLElement>('#b-inspector');if(!panel)return;panel.hidden=false;const label=({header:'页面标题',toolbar:'搜索与筛选',content:'内容区域',form:'录入表单',save:'保存按钮',filter:'标签筛选',export:'导出按钮'} as Record<string,string>)[id]||'内容区域';const connected=state.tick>=({save:8,filter:10,export:12,form:8,toolbar:10} as Record<string,number>)[id]||(['header','content'].includes(id)&&state.tick>=5);panel.innerHTML=`<header><span>${icon('input')}组件与连接</span>${iconBtn('关闭组件检查','inspect-close','x')}</header><div class="b-inspector-body"><h3>${label}</h3>${tag(connected?'已连接':'功能待连接',connected?'done':'attention')}<h4>当前组件</h4><div class="b-inspector-value">${icon('grid')} ${id==='content'?({list:'列表',table:'表格',cards:'卡片'}[state.layout]):label}</div>${id==='content'?`<h4>替换界面，保留行为</h4><div class="b-layout-choices">${(['list','table','cards'] as Layout[]).map(x=>`<button data-replace="${x}" class="${state.layout===x?'selected':''}">${icon(({list:'list',table:'grid',cards:'columns'} as const)[x])}${{list:'列表',table:'表格',cards:'卡片'}[x]}</button>`).join('')}</div>`:''}<h4>功能绑定</h4><div class="b-binding-line">${icon('input')} ${label}</div><div class="b-binding-arrow">${icon('arrow')}</div><div class="b-binding-line fn">${icon('code')} ${id==='save'||id==='form'?'校验并保存素材':id==='export'?'导出所选素材':id==='header'?'插件标题':'读取与筛选素材'}</div><p class="b-inspector-help">${connected?'界面事件和数据已接通。修改外观保留现有绑定。':'界面已经装配。功能线完成后，这里的操作才会生效。'}</p>${btn('只修改这一块','context','edit','secondary')}</div>`;
  panel.querySelectorAll<HTMLElement>('[data-replace]').forEach(el=>el.addEventListener('click',()=>replaceLayout(el.dataset.replace as Layout)));
  if(focus)document.querySelector('#b-context')!.innerHTML=icon('input')+'<span>已选中 '+label+'</span>';
  (document.querySelector('#b-context') as HTMLElement).hidden=false;
}
function replaceLayout(layout:Layout){snapshot();state.layout=layout;state.revision++;preview?.setLayout(layout);renderChoices();persist();document.querySelectorAll('.b-revision').forEach(el=>el.textContent='v'+state.revision);inspect('content',false);log('内容区域已换成'+{list:'列表',table:'表格',cards:'卡片'}[layout]+'。只调整这个区域，素材数据、筛选与导出绑定保持。');}
function showSelection(){const part=STEPS[state.tick].pool;openDialog(`<header><div>${icon('sparkles')}<h2>这一步，为什么选它</h2>${tag('Mock')}</div>${iconBtn('关闭选择详情','close','x')}</header><div class="b-dialog-body"><p class="b-dialog-lede">主线 v${state.revision} · ${esc(STEPS[state.tick].title)}</p><div class="b-selection-chosen">${icon('check')}<div><h3>${esc(part)}</h3><p>满足当前页面、放置位置与数据约束</p></div>${tag('本步选择','progress')}</div><h3 class="b-selection-label">选择发生之前</h3><ol class="b-selection-reasons"><li>从主线取得当前要完成的界面任务。</li><li>按插槽、属性与数据类型排除不成立的零件。</li><li>把合法候选交给 Jev，再配置并装配所选组件。</li></ol><p class="b-release-note">此处演示选择结果与交互，没有发送真实 Jev 请求，也不展示虚构概率。</p></div><footer>${btn('查看零件池','selection-pool','grid')}${btn('回到构建','close','arrow','primary')}</footer>`);}
function showGap(){if(state.phase==='directions'||state.phase==='brief'||state.phase==='analyzing'){toast('开始构建后，可以模拟“没有合适控件”的处理。');return;}const d=document.querySelector<HTMLDialogElement>('#b-dialog')!;if(d.open)d.close();stop();pausedForGap=true;updateBuildView();openDialog(`<header><div>${icon('alert')}<h2>这里还缺一个合适的零件</h2></div>${iconBtn('关闭缺口说明','close','x')}</header><div class="b-dialog-body"><p class="b-dialog-lede">示例需求：在素材卡片内裁剪封面。</p><div class="b-gap-fact"><span>需要</span><p>图片裁剪控件，支持预览与比例选择</p><span>当前零件池</span><p>有图片展示组件，但不支持裁剪</p></div><div class="b-gap-note">${icon('shield')}规格板保持原样。不会用图片组件假装已经支持裁剪。</div></div><footer>${btn('保持暂停','close')}${btn('继续使用现有组件','resolve-gap','play','primary')}</footer>`);log('没有能完成图片裁剪的合法 UI 零件，当前画布已保留。等待决定是否保留现有范围。');}
function install(){stop();openDialog(`<header><div>${icon('package')}<h2>保存为独立演示插件</h2></div>${iconBtn('关闭保存面板','close','x')}</header><div class="b-dialog-body"><div class="b-release-card">${icon('bookmark')}<div><h3>${esc(state.name)}</h3><p>录入、筛选、选择与导出</p></div>${tag('可试用','done')}</div><div class="b-release-checks"><p>${icon('check')} 独立页面打开，共用已保存的素材</p><p>${icon('check')} 关闭创作台后仍可使用</p><p>${icon('check')} 再次编辑会产生新草稿</p></div><p class="b-release-note">本次是浏览器本地演示实例，未安装到 Molis Work 正式插件运行时。刷新和关闭页面后数据保留；清理网站数据会移除它。</p></div><footer>${btn('再试一下','close')}${btn('保存并独立打开','publish-demo','external','primary')}</footer>`);}
function library(){let release:any=null;try{release=JSON.parse(localStorage.getItem(RELEASE_KEY)||'null');}catch{}openDialog(`<header><div>${icon('grid')}<h2>生成的插件</h2></div>${iconBtn('关闭插件列表','close','x')}</header><div class="b-dialog-body">${release?`<div class="b-release-card">${icon('bookmark')}<div><h3>${esc(release.name||'灵感素材库')}</h3><p>已保存 · 主线 v${Number(release.revision)||1}</p></div>${tag('本地演示','done')}</div><p class="b-dialog-lede">正在编辑的草稿不会覆盖这个版本。</p>`:`<div class="b-library-empty">${icon('package')}<h3>第一个插件正在路上</h3><p>完成构建并试用后，就能把它保存到这里。</p></div>`}</div><footer>${release?`<a class="mw-btn mw-btn--primary" href="/plugin/materials" target="_blank" rel="noopener">${icon('external')}独立打开</a>`:btn('继续创作','close','arrow','primary')}</footer>`);}
function bindShell(){
 root.addEventListener('click',e=>{
  const direction=(e.target as Element).closest<HTMLElement>('[data-direction]');if(direction){snapshot();state.layout=direction.dataset.direction as Layout;state.revision++;preview?.setLayout(state.layout);persist();revision();renderChoices();positionAgents(state.tick);return;}const button=(e.target as Element).closest<HTMLElement>('[data-action]');if(!button)return;
  switch(button.dataset.action){
   case 'start':case 'replay':start();break;
   case 'open-preview':mode='try';closeInspector();preview?.setMode('try');updateBuildView();toast('可以直接试用。尚未接通的功能保留提示；构建完成后可保存独立版本。');break;
   case 'reasoning':openDialog(`<header><div>${icon('sparkles')}<h2>设计依据</h2>${tag('Mock')}</div>${iconBtn('关闭设计依据','close','x')}</header><div class="b-dialog-body">${ANALYSIS.map(([title,body])=>`<div class="b-reason-item"><h3>${title}</h3><p>${body}</p></div>`).join('')}</div><footer>${btn('回到创作','close','arrow','primary')}</footer>`);break;
   case 'pause':if(running){stop();positionAgents(state.tick);updateBuildView();}else resume();break;
   case 'step':stop();advance();break;
   case 'chat':document.querySelector('.b-sidebar')?.classList.toggle('mobile-open');break;
   case 'directions':stop();state.phase='directions';persist();renderPhase();break;
   case 'analyze':analyze(state.request);break;
   case 'example':analyze(initial.request);break;
   case 'brief':brief();break;
   case 'close':closeDialog();break;
   case 'selection':showSelection();break;
   case 'pool':showPool();break;
   case 'selection-pool':closeDialog();showPool();break;
   case 'gap':showGap();break;
   case 'resolve-gap':pausedForGap=false;closeDialog();updateBuildView();resume();break;
   case 'inspect-close':closeInspector();positionAgents(state.tick);break;
   case 'context':document.querySelector('.b-sidebar')?.classList.add('mobile-open');document.querySelector<HTMLTextAreaElement>('#b-message')!.focus();break;
   case 'edit-mode':case 'try-mode':mode=button.dataset.action==='edit-mode'?'building':'try';if(mode==='try')closeInspector();preview?.setMode(mode);document.querySelector('[data-action="edit-mode"]')!.classList.toggle('selected',mode==='building');document.querySelector('[data-action="try-mode"]')!.classList.toggle('selected',mode==='try');updateBuildView();break;
   case 'theme':document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';break;
   case 'install':install();break;
   case 'publish-demo':try{
    localStorage.setItem(RELEASE_KEY,JSON.stringify({name:state.name,revision:state.revision,layout:state.layout,bulk:state.mixed,draft:{...state},at:new Date().toISOString()}));closeDialog();log('已保存独立使用版本。接下来的设计修改留在草稿中。');window.open('/plugin/materials','_blank','noopener');toast('独立版本已保存，可从“生成的插件”再次打开。');
   }catch{toast('保存失败，浏览器本地存储不可用。');}break;
   case 'library':library();break;
   case 'new':stop();clearTimeout(analysisTimer);snapshot();state={...initial,phase:'brief',request:''};analysisStep=0;persist();renderReasoning();renderPhase();document.querySelector<HTMLTextAreaElement>('#b-message')!.focus();break;
   case 'undo':if(!history.length){toast('还没有可撤销的界面修改。');break;}stop();clearTimeout(analysisTimer);state=history.pop()!;mode=state.phase==='ready'?'try':'building';persist();renderPhase();if(state.phase==='analyzing')runAnalysis();toast('已恢复上一次草稿，素材数据保持。');break;
  }
 });
 document.querySelector('#b-composer')!.addEventListener('submit',e=>{
  e.preventDefault();const input=document.querySelector<HTMLTextAreaElement>('#b-message')!;const value=input.value.trim();if(!value)return;input.value='';
  if(state.phase==='brief'||state.phase==='directions'||state.phase==='analyzing'){analyze(value);return;}
  log(value,'你');
  if(/多人|云端|同步|抓取|团队/.test(value)){stop();updateBuildView();openDialog(`<header><div>${icon('impact')}<h2>这会扩大当前范围</h2></div>${iconBtn('关闭','close','x')}</header><div class="b-dialog-body"><p class="b-dialog-lede">${esc(value)}</p><p>当前主线是单人、本地素材整理。新增能力可能需要账号、共享存储、同步或外部来源。</p><p>UI 和功能都需要重新设计。当前画布保留，这部分能力尚未接入演示。</p></div><footer>${btn('保留当前范围','close',undefined,'primary')}</footer>`);return;}
  if(/卡片|表格|列表/.test(value)){replaceLayout(/卡片/.test(value)?'cards':/表格/.test(value)?'table':'list');return;}
  log('已记录这条修改。演示支持选中内容区、切换列表/表格/卡片；其他修改暂不自动执行。');
 });
 document.querySelector<HTMLDialogElement>('#b-dialog')!.addEventListener('click',e=>{if(e.target===e.currentTarget)closeDialog();});
 document.querySelector<HTMLDialogElement>('#b-dialog')!.addEventListener('cancel',()=>returnFocus?.focus());
 document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&document.activeElement?.id==='b-message'){e.preventDefault();(document.querySelector('#b-composer') as HTMLFormElement).requestSubmit();}});
 window.addEventListener('resize',()=>positionAgents(state.tick));
}
function standalone(){
 let release:any;try{release=JSON.parse(localStorage.getItem(RELEASE_KEY)||'null');}catch{}
 if(!release){root.innerHTML=`<div class="b-standalone-empty">${icon('package')}<h1>还没有保存的演示插件</h1><p>先在插件 Builder 中完成构建，再保存独立版本。</p><a class="mw-btn mw-btn--primary" href="/">打开插件 Builder</a></div>`;return;}
 document.title=`${release.name||'灵感素材库'} · 独立演示插件`;
 root.innerHTML=`<div class="b-standalone"><header><a href="/" aria-label="返回插件 Builder">${icon('brand')}<span>Molis Work</span></a><div>${tag('独立演示插件','demo')}<span>主线 v${Number(release.revision)||1}</span><a class="mw-btn mw-btn--secondary" href="/?edit=release">${icon('edit')}编辑新草稿</a></div></header><main id="b-standalone-app"></main><footer>${icon('database')}数据保存在此浏览器，关闭创作台后仍可使用。<span>尚未接入正式插件运行时</span></footer></div><div id="b-toast" class="b-toast" role="status"></div>`;
 mountMaterialApp(document.querySelector<HTMLElement>('#b-standalone-app')!,{mode:'standalone',name:release.name,bulk:release.bulk!==false,layout:['list','table','cards'].includes(release.layout)?release.layout:'list',stage:7,onAction:toast});
}
if(location.pathname==='/plugin/materials')standalone();else shell();
window.addEventListener('pagehide',()=>{stop();clearTimeout(analysisTimer);});
