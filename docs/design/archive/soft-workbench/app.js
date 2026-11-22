import { icon as i, escape as e, load, persist, applyPreferences, toast, button as b, iconButton as ib } from './shared.js';
import { goals, articles } from './data.js';
import { mountOnboarding } from './onboarding.js';

const root = document.querySelector('#app');
let state = load();
let route = 'home', selectedGoal = goals[0].id, selectedArticle = articles[0].id;
let feedFilter = 'all', goalFilter = 'active', feedQuery = '', goalTab = 'overview', day = 28;
let destroyOnboarding = null, lastTrigger = null;
const labels = { home:'项目首页', goals:'目标', feed:'信息流' };
const save = () => { if (!persist(state)) toast('浏览器存储不可用，内容暂留在本次预览中'); };
const status = (text, tone='muted') => `<span class="status ${tone}"><span></span>${e(text)}</span>`;
const routeIcons = {home:'home',goals:'target',feed:'inbox'};
let showDetail=false, assistantOpen=false, assistantBusy=false;
function dockLink(id,name,ico) {return `<a href="#${id}" class="dock-link" aria-label="${name}" title="${name}" ${route===id?'aria-current="page"':''}>${i(ico)}<span>${name}</span></a>`;}
function shell() {
 root.innerHTML=`<div class="workbench"><div class="workspace"><header class="workspace-header"><div class="breadcrumb"><span class="project-mark small">m</span><span>${e(state.project)}</span>${i('chevron-right')}<strong>${labels[route]}</strong></div><div class="header-end"><span class="preview-indicator">设计预览<span> · 示例数据</span></span>${ib('切换浅深色','theme','sun')}</div></header><main id="main" class="main-surface ${route}-surface" tabindex="-1"></main></div>
 <footer class="workbench-dock" aria-label="底部统一菜单与对话栏"><div class="dock-start">${ib('打开菜单','dock-menu','grid','aria-expanded="false" aria-haspopup="true"')}<span class="dock-divider"></span><nav aria-label="常驻插件">${dockLink('home','项目首页','home')}${dockLink('goals','目标','target')}${dockLink('feed','信息流','inbox')}</nav></div><div class="dock-center"><section id="assistant-panel" class="assistant-panel" aria-label="统一对话" ${assistantOpen?'':'hidden'}></section><form id="unified-composer" class="unified-composer" aria-label="统一对话栏"><button type="button" class="plugin-picker" data-action="plugin-picker" aria-label="切换插件" aria-expanded="false">${i(routeIcons[route])}<span>${labels[route]}</span>${i('chevron-up')}</button><span class="composer-divider"></span><label for="assistant-input" class="sr-only">发给 Assistant</label><input id="assistant-input" autocomplete="off" maxlength="1000" placeholder="问 Assistant，或搜索" value="${e(state.composerDraft)}">${ib('搜索项目内容','search','search')}<button type="submit" class="composer-send" aria-label="发送给 Assistant" ${state.composerDraft.trim()&&!assistantBusy?'':'disabled'}>${i(assistantBusy?'refresh':'send',assistantBusy?'spin':'')}</button></form></div><div class="dock-end">${ib('展开统一对话','assistant-toggle','message',`aria-expanded="${assistantOpen}" aria-controls="assistant-panel"`)}<button class="dock-profile" data-action="preferences" aria-label="项目与外观偏好" title="项目与外观偏好" aria-expanded="false"><span>骏</span></button></div></footer></div><div id="popover" class="popover" hidden></div><dialog id="editor-dialog" class="sheet" aria-labelledby="editor-title"></dialog><dialog id="search-dialog" class="search-dialog" aria-labelledby="search-title"></dialog>`;
 renderMain();renderAssistant();
}
function pluginMenu(includeExtras=false) {return `<h3>${includeExtras?'工作空间':'切换插件'}</h3><div class="menu-options">${Object.entries(labels).map(([id,label])=>`<a href="#${id}">${i(routeIcons[id])}<span>${label}</span>${route===id?i('check'):''}</a>`).join('')}</div>${includeExtras?`<hr><a href="#onboarding">${i('play')}体验新手引导${i('arrow')}</a><button data-action="search">${i('search')}搜索项目内容<kbd>⌘ K</kbd></button><button data-action="preferences">${i('settings')}外观与偏好</button>`:''}`;}
function renderAssistant() {
 const panel=document.querySelector('#assistant-panel');if(!panel)return;
 panel.hidden=!assistantOpen;
 panel.innerHTML=`<header><div>${i('sparkles')}<strong>Assistant</strong><span>交互演示 · 未接入模型</span></div>${ib('收起统一对话','assistant-toggle','chevron-down')}</header><div class="assistant-context">${i(routeIcons[route])}<span>当前上下文 · ${labels[route]}${route==='goals'?' / '+e(goals.find(g=>g.id===selectedGoal).short):''}</span></div><div class="assistant-messages" aria-live="polite">${state.conversation.length?state.conversation.map(m=>`<div class="assistant-turn"><p class="user-message">${e(m.text)}</p><div class="assistant-reply"><span class="assistant-reply-label">示例回复 · ${e(labels[m.route])}</span><p>${m.route==='goals'?'这里可以围绕当前目标梳理下一步，并在你确认后记录进展。普通进展不会自动完成目标。':m.route==='feed'?'这里可以围绕当前资料提问、整理要点，再把有用的内容留下。阅读位置和文章继续保留。':'这里可以结合当前项目的目标、资料与当天事件，讨论接下来要做的事。'}</p><a class="text-action" href="#${m.route==='feed'?'feed':'goals'}">${m.route==='feed'?'继续阅读资料':'查看当前目标'}${i('arrow')}</a></div></div>`).join(''):`<div class="assistant-welcome"><h2>从手边的工作开始。</h2><p>当前页面会成为对话的上下文。切换插件，<br>仍在同一个对话入口继续。</p><button class="btn soft" data-action="suggest-prompt">${i('sparkles')}帮我梳理下一步</button></div>`}${assistantBusy?`<div class="assistant-wait">${i('refresh','spin')}正在展示回复…</div>`:''}</div>`;
 const list=panel.querySelector('.assistant-messages');list.scrollTop=list.scrollHeight;
 document.querySelector('[aria-controls="assistant-panel"]')?.setAttribute('aria-expanded',String(assistantOpen));
}
function renderMain() {
  const main = document.querySelector('#main');
  if (!main) return;
  main.innerHTML = route === 'home' ? home() : route === 'goals' ? goalsView() : feedView();
  main.querySelector('.split-view')?.classList.toggle('mobile-detail',showDetail);
  renderAssistant();
}
function home() {
  const events = day === 28 ? [
    ['10:42','inbox','收藏了一条值得再读的设计手记','好的界面，知道什么时候退后','feed','quiet'],
    ['10:16','target','产品体验升级有了新的进展','首页、目标与信息流已进入高保真探索','goals','experience'],
    ['09:30','message','还有一个体验细节需要你的判断','窄屏阅读时，如何保留返回列表的路径？','goals','reading'],
  ] : day === 27 ? [['16:20','note','留下了关于首次使用的想法','让每一步选择，都有一个可见的结果','goals','context']] : [];
  return `<div class="home-scroll"><div class="home-heading"><div><h1>今天的工作</h1><p>星期${day === 28 ? '一' : day === 27 ? '日' : day === 29 ? '二' : '三'}，9 月 ${day} 日。${events.length ? '让重要的事，继续向前。' : '给新的进展留一点空间。'}</p></div><div class="month-caption">${i('calendar')}2026 年 9 月</div></div>
    <div class="home-layout"><section class="day-work"><nav class="day-strip" aria-label="选择日期">${[['日',27],['一',28],['二',29],['三',30]].map(([w,d])=>`<button data-day="${d}" class="day-option" aria-pressed="${day===d}"><span>周${w}</span><strong>${d}</strong>${d===28 ? '<em>今天</em>' : ''}</button>`).join('')}<span class="date-line"></span>${ib('回到今天','today','calendar')}</nav>
    <section class="focus-work" aria-labelledby="focus-title"><div class="section-top"><span>${i('target')}正在推进</span>${status('进行中','copper')}</div><h2 id="focus-title">打磨 Molis Work<br>的第一印象。</h2><p>把布局、文字和每一次交互，<br>打磨成一个自然、完整的体验。</p><div class="focus-bottom"><a class="btn primary" href="#goals" data-goal="experience">继续这个目标 ${i('arrow')}</a><span class="requirement-note"><span class="tiny-progress"><span></span></span>2 / 3 项有依据</span></div><div class="focus-decoration" aria-hidden="true"><div class="abstract-sheet sheet-back"></div><div class="abstract-sheet sheet-front"><span></span><span></span><span></span><div>${i('check')}<span></span></div><div>${i('check')}<span></span></div><div>${i('circle')}<span></span></div></div></div></section>
    <section class="activity-section"><div class="section-heading"><h2>当天的事件 <small>${events.length}</small></h2><span>按时间排列</span></div><div class="activity-list">${events.length ? events.map(([time,ico,title,desc,r,id])=>`<details class="activity-row"><summary><time>${time}</time><span class="event-symbol">${i(ico)}</span><span class="event-text"><strong>${title}</strong><small>${desc}</small></span>${i('chevron-down')}</summary><div class="event-expanded"><p>${r==='feed'?'保留来源、阅读上下文和原始内容。可以进入信息流继续阅读。':'这条记录来自示例项目，说明工作进展；普通进展记录不会自动完成目标。'}</p><a href="#${r}" data-${r==='goals'?'goal':'article'}="${id}" class="text-action">${r==='feed'?'继续阅读':'查看目标'} ${i('arrow')}</a></div></details>`).join('') : `<div class="empty-state">${i('calendar')}<h3>这一天还没有事件</h3><p>已有工作仍在，可以从当前目标继续。</p>${b('回到今天','today','back')}</div>`}</div></section>
    </section><aside class="home-margin"><section class="note-pad"><div class="section-heading"><h2>${i('edit')}随手记</h2><span id="note-state">${state.notes?'已保存在此浏览器':'只在此浏览器保存'}</span></div><label class="sr-only" for="quick-note">随手记</label><textarea id="quick-note" placeholder="一个想法，一个下一步。\n先放在这里。">${e(state.notes)}</textarea><div class="note-foot"><span>不必现在就整理好</span>${i('note')}</div></section>
    <section class="quick-links"><h2>回到手边的内容</h2><a href="#goals"> <span class="quick-symbol">${i('target')}</span><span>目标<small>找到下一步</small></span>${i('chevron-right')}</a><a href="#feed"><span class="quick-symbol">${i('inbox')}</span><span>信息流<small>阅读与留下</small></span>${i('chevron-right')}</a><a href="#onboarding"><span class="quick-symbol">${i('play')}</span><span>新手引导<small>体验全新的开始</small></span>${i('chevron-right')}</a></section><p class="margin-note">${i('shield')}你的节奏，你的工作空间。</p></aside></div></div>`;
}
function goalsView() {
  const visible = goals.filter(g=>goalFilter==='all'||g.status!=='已完成');
  const g = goals.find(g=>g.id===selectedGoal) || goals[0];
  return `<div class="split-view ${selectedGoal?'has-selection':''}"><aside class="object-directory"><div class="directory-heading"><h1>目标</h1><span class="quiet-count">${goals.length}</span></div><div class="segmented" aria-label="目标筛选"><span class="segment-slider" style="--index:${goalFilter==='active'?0:1}"></span><button data-goal-filter="active" aria-pressed="${goalFilter==='active'}">正在推进</button><button data-goal-filter="all" aria-pressed="${goalFilter==='all'}">全部目标</button></div><div class="object-items">${visible.map(g=>`<button class="goal-item" data-select-goal="${g.id}" aria-pressed="${selectedGoal===g.id}"><span class="goal-item-icon ${g.tone}">${i(g.icon)}</span><span><strong>${g.title}</strong><small>${g.status}<span>·</span>${g.date}</small></span>${i('chevron-right')}</button>`).join('')}</div><div class="directory-footer">${i('shield')}进展有记录，完成有依据</div></aside>
    <section class="detail-pane" aria-label="目标详情"><header class="detail-toolbar">${b('返回目标','back-list','back','quiet mobile-back')}<span>${status(g.status,g.tone)}</span><div>${ib('目标更多操作','goal-menu','more','aria-expanded="false"')}</div></header><div class="goal-document content-arrive"><div class="goal-title"><span class="goal-emblem ${g.tone}">${i(g.icon)}</span><h1>${g.title}</h1><p>${g.description}</p></div><div class="goal-tabbar"><nav aria-label="目标详情视图"><button data-goal-tab="overview" aria-pressed="${goalTab==='overview'}">概览</button><button data-goal-tab="activity" aria-pressed="${goalTab==='activity'}">进展记录 <small>${1+state.entries.filter(x=>x.goal===g.id).length}</small></button><span style="--tab:${goalTab==='overview'?0:1}"></span></nav>${b('记录进展','add-progress','plus','primary')}</div>
    ${goalTab==='overview'?`<section class="goal-outcome"><h2>想要实现什么</h2><p>${g.result}</p></section><section class="requirements"><div class="section-heading"><h2>完成要求</h2><span>${g.checks.filter(x=>x[1]).length} / ${g.checks.length} 项有依据</span></div>${g.checks.map(([title,done])=>`<details class="requirement"><summary><span class="requirement-check ${done?'done':''}">${i(done?'check':'circle')}</span><span>${title}</span><small>${done?'已有依据':'待验证'}</small>${i('chevron-down')}</summary><div>${done?'示例依据：已记录对应设计与验证结果。可在真实项目中关联产物与验证记录。':'需要真实试用和明确确认。该项尚未验证，记录进展不会自动将它标为完成。'}</div></details>`).join('')}<p class="requirement-footnote">${i('info')}有依据的要求仍需检查；目标通过显式收尾完成。</p></section>`:''}
    <section class="goal-activity"><div class="section-heading"><h2>${goalTab==='overview'?'最近的进展':'全部进展'}</h2><span>项目记录</span></div>${state.entries.filter(x=>x.goal===g.id).map(x=>`<article class="timeline-entry"><span class="timeline-point"></span><div><header><strong>一骏记录了进展</strong><time>${e(x.time)}</time></header><p>${e(x.text)}</p><small>保存在本地原型</small></div></article>`).join('')}<article class="timeline-entry"><span class="timeline-point"></span><div><header><strong>${g.id==='local'?'完成了恢复验证':'明确了这一步的结果'}</strong><time>今天 10:16</time></header><p>${g.result}</p><small>示例记录 · 项目工作台</small></div></article></section></div></section></div>`;
}
function filteredArticles() {return articles.filter(a=>(feedFilter!=='unread'||!a.read)&&(feedFilter!=='saved'||state.saved.includes(a.id))&&(!feedQuery||[a.title,a.summary,a.source].join(' ').toLowerCase().includes(feedQuery.toLowerCase())));}
function feedItems() {
  const items = filteredArticles();
  return items.length ? items.map(a=>`<button class="feed-item" data-select-article="${a.id}" aria-pressed="${selectedArticle===a.id}"><span class="feed-item-meta">${i(a.sourceIcon)}${a.source}<time>${a.time}</time></span><strong>${!a.read?'<span class="unread-dot"></span>':''}${a.title}</strong><p>${a.summary}</p><span class="feed-item-bottom">${a.minutes}${state.saved.includes(a.id)?`<span class="saved-label">${i('bookmark')}已保存</span>`:''}</span></button>`).join('') : `<div class="empty-state">${i(feedFilter==='saved'?'bookmark':'search')}<h3>${feedQuery?'没有找到相关内容':feedFilter==='saved'?'还没有保存的资料':'未读内容已经读完了'}</h3><p>${feedQuery?'换个关键词，或查看全部内容。':'读到值得留下的内容时，可以随手保存。'}</p>${b('查看全部','feed-all','back')}</div>`;
}
function feedView() {
 return `<div class="split-view feed-split"><aside class="object-directory"><div class="directory-heading"><h1>信息流</h1>${ib('刷新示例内容','refresh-feed','refresh')}</div><label class="feed-search">${i('search')}<input id="feed-search" aria-label="搜索信息流" placeholder="搜索标题、来源…" value="${e(feedQuery)}"></label><div class="segmented three" aria-label="信息筛选"><span class="segment-slider" style="--index:${['all','unread','saved'].indexOf(feedFilter)}"></span>${[['all','全部'],['unread','未读'],['saved','已保存']].map(([id,t])=>`<button data-feed-filter="${id}" aria-pressed="${feedFilter===id}">${t}</button>`).join('')}</div><div class="object-items" id="article-list">${feedItems()}</div><div class="directory-footer">${i('check')}示例来源 · ${articles.length} 条内容</div></aside><article class="detail-pane reader" id="reader" aria-label="阅读正文">${reader()}</article></div>`;
}
function reader() {
 const a=articles.find(a=>a.id===selectedArticle); const saved=state.saved.includes(a.id);
 return `<header class="detail-toolbar">${b('返回列表','back-list','back','quiet mobile-back')}<span class="reader-source">${i(a.sourceIcon)}${a.source}</span><div>${b(saved?'已保存':'保存资料','bookmark',saved?'check':'bookmark',saved?'soft active':'quiet','aria-pressed="'+saved+'"')}${ib('文章更多操作','article-menu','more','aria-expanded="false"')}</div></header><div class="reading-content content-arrive"><div class="reading-meta"><span>${a.category}</span><span>${a.minutes}</span><span>9 月 28 日</span></div><h1>${a.title}</h1><div class="byline"><span class="author-avatar">${a.author[0]}</span>${a.author}<span>·</span>原型示例文章</div><div class="prose">${a.paragraphs.map(([type,text])=>type==='h2'?`<h2>${text}</h2>`:type==='quote'?`<blockquote>${text}</blockquote>`:`<p class="${type==='lead'?'lead':''}">${text}</p>`).join('')}</div><footer class="reading-end"><span>${i('check')}读到这里，留一点时间想想。</span>${b(saved?'已保存':'留下这篇','bookmark',saved?'check':'bookmark',saved?'soft active':'soft')}</footer></div>`;
}
function navigate() {
 destroyOnboarding?.(); destroyOnboarding=null;
 const hash=location.hash.slice(1);
 if(hash==='main'){document.querySelector('#main')?.focus();return;}
 if(hash==='onboarding' || (!hash&&location.pathname==='/onboarding')) {
  route='onboarding'; document.body.classList.add('onboarding-mode');
  destroyOnboarding=mountOnboarding(root,state,save,()=>{ location.hash='home'; }); return;
 }
 document.body.classList.remove('onboarding-mode');route=labels[hash]?hash:'home';
 applyPreferences(state);shell();
}
function openMenu(trigger, html) {
 const pop=document.querySelector('#popover'); const wasOpen=!pop.hidden&&lastTrigger===trigger; closeMenu();if(wasOpen)return;
 lastTrigger=trigger; trigger.setAttribute('aria-expanded','true');pop.innerHTML=html;pop.hidden=false;
 const box=trigger.getBoundingClientRect();const width=pop.offsetWidth;
 pop.style.left=Math.max(10,Math.min(innerWidth-width-10,box.right-width))+'px';
 const height=pop.offsetHeight;pop.style.top=(box.bottom+height+10>innerHeight?Math.max(10,box.top-height-8):box.bottom+8)+'px';
 pop.querySelector('button,a')?.focus();
}
function closeMenu(restore=false) {const pop=document.querySelector('#popover');if(pop)pop.hidden=true;lastTrigger?.setAttribute('aria-expanded','false');if(restore)lastTrigger?.focus();lastTrigger=null;}
function editor() {
 const dialog=document.querySelector('#editor-dialog');
 dialog.innerHTML=`<form id="progress-form"><header><div><span class="dialog-symbol">${i('edit')}</span><h2 id="editor-title">记录一点进展</h2><p>发生了什么，有什么值得留下？</p></div>${ib('关闭记录','close-editor','x')}</header><div class="editor-body"><label for="progress-text">进展内容</label><textarea id="progress-text" name="progress" required maxlength="2000" placeholder="例如：完成了首页布局，接下来验证窄屏下的阅读路径。"></textarea><p class="editor-hint">${i('target')}${e(goals.find(g=>g.id===selectedGoal).short)}</p><p class="form-error" id="progress-error" role="alert" hidden></p></div><footer><span>仅保存到本地原型</span><button type="submit" class="btn primary">${i('check')}保存记录</button></footer></form>`;
 dialog.showModal();
}
function searchDialog() {
 const dialog=document.querySelector('#search-dialog');
 dialog.innerHTML=`<div class="global-search-field">${i('search')}<label id="search-title" class="sr-only" for="global-query">搜索项目内容</label><input id="global-query" placeholder="搜索目标、文章…" autocomplete="off">${ib('关闭搜索','close-search','x')}</div><div class="search-results" id="global-results"></div><footer>搜索当前示例项目<span><kbd>esc</kbd>关闭</span></footer>`;
 dialog.showModal(); searchResults('');
}
function searchResults(query) {
 const results=[...goals.map(g=>({id:g.id,title:g.title,route:'goals',icon:'target'})),...articles.map(a=>({id:a.id,title:a.title,route:'feed',icon:'note'}))].filter(x=>x.title.toLowerCase().includes(query.toLowerCase()));
 document.querySelector('#global-results').innerHTML=results.length?results.map(x=>`<a href="#${x.route}" data-${x.route==='goals'?'goal':'article'}="${x.id}">${i(x.icon)}<span>${x.title}</span><small>${labels[x.route]}</small>${i('arrow')}</a>`).join(''):'<p class="search-empty">没有匹配内容，换一个关键词试试。</p>';
}
root.addEventListener('click',event=>{
 if(route==='onboarding')return;
 const t=event.target.closest('button,a');if(!t)return;
 if(t.dataset.goal){showDetail=true;selectedGoal=t.dataset.goal;document.querySelector('#search-dialog')?.close();if(route==='goals')renderMain();}
 if(t.dataset.article){showDetail=true;selectedArticle=t.dataset.article;document.querySelector('#search-dialog')?.close();if(route==='feed')renderMain();}
 if(t.matches('a[href]')&&!t.dataset.goal&&!t.dataset.article){showDetail=false;closeMenu();}
 if(t.dataset.day){day=Number(t.dataset.day);renderMain();return;}
 if(t.dataset.selectGoal){showDetail=true;selectedGoal=t.dataset.selectGoal;goalTab='overview';renderMain();document.querySelector('.split-view').classList.add('mobile-detail');return;}
 if(t.dataset.goalFilter){goalFilter=t.dataset.goalFilter;renderMain();return;}
 if(t.dataset.goalTab){goalTab=t.dataset.goalTab;renderMain();return;}
 if(t.dataset.selectArticle){showDetail=true;selectedArticle=t.dataset.selectArticle;articles.find(a=>a.id===selectedArticle).read=true;document.querySelector('#reader').innerHTML=reader();document.querySelector('#article-list').innerHTML=feedItems();document.querySelector('.split-view').classList.add('mobile-detail');return;}
 if(t.dataset.feedFilter){feedFilter=t.dataset.feedFilter;renderMain();return;}
 const action=t.dataset.action;
 if(!action)return;
 switch(action){
  case 'today': day=28;renderMain();break;
  case 'search':searchDialog();break;
  case 'close-search':document.querySelector('#search-dialog').close();break;
  case 'add-progress':editor();break;
  case 'close-editor':document.querySelector('#editor-dialog').close();break;
  case 'back-list':showDetail=false;document.querySelector('.split-view').classList.remove('mobile-detail');break;
  case 'dock-menu':openMenu(t,pluginMenu(true));break;
  case 'plugin-picker':openMenu(t,pluginMenu());break;
  case 'assistant-toggle':assistantOpen=!assistantOpen;renderAssistant();break;
  case 'suggest-prompt':state.composerDraft='帮我梳理下一步';save();document.querySelector('#assistant-input').value=state.composerDraft;document.querySelector('.composer-send').disabled=false;document.querySelector('#assistant-input').focus();break;
  case 'theme':state.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';save();applyPreferences(state);break;
  case 'bookmark':{
   const id=selectedArticle, saved=state.saved.includes(id);state.saved=saved?state.saved.filter(x=>x!==id):[...state.saved,id];save();document.querySelector('#reader').innerHTML=reader();document.querySelector('#article-list').innerHTML=feedItems();toast(saved?'已从保存的资料中移除':'已保存到本地原型',()=>{state.saved=saved?[...state.saved,id]:state.saved.filter(x=>x!==id);save();if(route==='feed')renderMain();});break;
  }
  case 'feed-all':feedFilter='all';feedQuery='';renderMain();break;
  case 'refresh-feed':{t.disabled=true;t.classList.add('spinning');setTimeout(()=>{t.disabled=false;t.classList.remove('spinning');toast('示例内容已是最新');},650);break;}
  case 'preferences':openMenu(t.closest('#popover')?document.querySelector('.dock-profile'):t,`<h3>外观与偏好</h3><p>仅影响此设计预览</p><div class="menu-options">${[['light','sun','浅色'],['dark','moon','深色'],['system','system','跟随系统']].map(([v,ico,text])=>`<button data-theme="${v}">${i(ico)}${text}${state.theme===v?i('check'):''}</button>`).join('')}</div><hr><button data-action="density">${i('rows')}${state.density==='comfortable'?'切换为紧凑密度':'切换为舒适密度'}</button><hr><button data-action="reset-preview">${i('refresh')}重置示例数据</button>`);break;
  case 'density':state.density=state.density==='comfortable'?'compact':'comfortable';save();applyPreferences(state);closeMenu(true);toast('已调整内容密度');break;
  case 'reset-preview':{
   state.saved=[];state.entries=[];state.notes='';state.composerDraft='';state.conversation=[];save();closeMenu();shell();toast('已重置示例内容，外观偏好已保留');break;
  }
  case 'goal-menu':openMenu(t,`<button data-action="copy-goal">${i('copy')}复制目标标题</button><button data-action="show-activity">${i('history')}查看全部记录</button>`);break;
  case 'article-menu':openMenu(t,`<button data-action="copy-article">${i('copy')}复制文章标题</button><button data-action="mark-unread">${i('mail')}标为未读</button><hr><p>本文是为设计预览撰写的示例内容，没有外部原文链接。</p>`);break;
  case 'copy-goal':copyText(goals.find(g=>g.id===selectedGoal).title);closeMenu(true);break;
  case 'copy-article':copyText(articles.find(a=>a.id===selectedArticle).title);closeMenu(true);break;
  case 'show-activity':goalTab='activity';closeMenu();renderMain();break;
  case 'mark-unread':articles.find(a=>a.id===selectedArticle).read=false;closeMenu(true);document.querySelector('#article-list').innerHTML=feedItems();toast('已标为未读');break;
 }
});
async function copyText(value) {try {await navigator.clipboard.writeText(value);toast('标题已复制');}catch{toast('浏览器未允许复制，请选中标题手动复制');}}
root.addEventListener('click',event=>{const t=event.target.closest('button[data-theme]');if(t){state.theme=t.dataset.theme;save();applyPreferences(state);closeMenu(true);}});
root.addEventListener('input',event=>{
 if(route==='onboarding')return;
 const t=event.target;
 if(t.id==='quick-note'){state.notes=t.value;const ok=persist(state);document.querySelector('#note-state').textContent=ok?'已保存在此浏览器':'暂存在本次预览';}
 if(t.id==='feed-search'){feedQuery=t.value;document.querySelector('#article-list').innerHTML=feedItems();}
 if(t.id==='global-query')searchResults(t.value);
 if(t.id==='assistant-input'){state.composerDraft=t.value;save();document.querySelector('.composer-send').disabled=!t.value.trim()||assistantBusy;}
});
root.addEventListener('submit',event=>{
 if(event.target.id==='unified-composer'){
  event.preventDefault();const text=state.composerDraft.trim();if(!text||assistantBusy)return;
  const messageRoute=route;assistantOpen=true;assistantBusy=true;renderAssistant();document.querySelector('.composer-send').disabled=true;
  setTimeout(()=>{state.conversation.push({text,route:messageRoute});state.composerDraft='';assistantBusy=false;save();const input=document.querySelector('#assistant-input');if(input)input.value='';renderAssistant();},650);return;
 }
 if(event.target.id!=='progress-form')return;event.preventDefault();
 const input=event.target.querySelector('textarea');const text=input.value.trim();
 if(!text){const error=document.querySelector('#progress-error');error.hidden=false;error.textContent='先写下一点进展，再保存。';input.focus();return;}
 const button=event.target.querySelector('[type="submit"]');button.disabled=true;button.innerHTML=`${i('refresh','spin')}保存中`;
 setTimeout(()=>{state.entries.unshift({goal:selectedGoal,text,time:'刚刚'});save();document.querySelector('#editor-dialog').close();goalTab='activity';renderMain();toast('进展已保存，目标状态保持不变');},480);
});
document.addEventListener('click',event=>{if(!event.composedPath().some(node=>node.id==='popover'||node.hasAttribute?.('aria-expanded')))closeMenu();});
document.addEventListener('keydown',event=>{
 if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&route!=='onboarding'){event.preventDefault();searchDialog();}
 if(event.key==='Escape'){closeMenu(true);if(assistantOpen){assistantOpen=false;renderAssistant();}}
 if(['ArrowDown','ArrowUp'].includes(event.key)&&event.target.closest('#popover')){event.preventDefault();const buttons=[...document.querySelectorAll('#popover button,#popover a')];const idx=buttons.indexOf(document.activeElement);buttons[(idx+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>applyPreferences(state));
window.addEventListener('hashchange',navigate);
applyPreferences(state);navigate();
