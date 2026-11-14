// Design specimen only. No Home, model, action gateway, storage or success simulation.
(() => {
  const K = window.mwKit, e = K.escapeHtml;
  document.querySelector('#icons').innerHTML = window.mwKitSprite;
  const params = new URLSearchParams(location.search);
  const S = { lang: params.get('lang') === 'en' ? 'en' : 'zh', theme: params.get('theme') === 'dark' ? 'dark' : 'light', state: params.get('state') || 'decide', place: 'chat', long: params.has('long') };
  const zh = {
    specimen:'标本 · B 插件领头', boundary:'示例数据；只体验呈现、速览与本页定位。不执行动作，不连接 Home。',
    title:'同一件事，四种样子', subtitle:'插件拥有事实；所在位置决定展开多少。', state:'状态', place:'位置', language:'语言', appearance:'外观', light:'浅色',dark:'深色',long:'长标题',normal:'普通',running:'进行中',decide:'要你决定',accept:'要你验收',failed:'失败',partial:'部分完成',stale:'旧值',forbidden:'没有权限查看',deleted:'已删除',initial:'首次读取失败',
    chip:'名字片',row:'行',card:'卡片',peek:'速览',chat:'对话',discussion:'项目讨论',plugin:'插件内 · Inbox',wait:'等你',
    open:'打开到准确位置',close:'关闭',more:'更多',review:'查看待确认内容',send:'查看发送预备',retry:'查看重试预备',stop:'查看停止预备',source:'查看读取状态',permissions:'查看插件说明',
    normalBody:'完成要求已整理，下一步可以开始处理手机排版。',runningBody:'正在核对手机价格表的第三列，当前到第 3 步。',decideBody:'客户反馈手机价格表第三列掉行，回复草稿已备好，等你决定是否发送。',acceptBody:'手机排版的修改已交回；请对照这条完成要求查看结果。',failedBody:'导出未完成：图片服务没有响应。输入仍在，可查看失败步骤。',partialBody:'3 项已完成，2 项仍未完成；失败项可以分别重试。',
    staleBody:'暂时读不到 Goals，下面保留最后一次读到的内容。',initialBody:'这次还没有读到任何内容，因此没有可显示的旧值。',forbiddenBody:'这条内容属于 Inbox。当前没有查看权限。',deletedBody:'这条内容已删除。',notice:'当前不能执行此操作：来源不可用。',readTime:'示例最后读取时间：2026-11-08 09:40（UTC−08:00）',time:'11 月 8 日 09:40 · 小林',route:'Goals › 发布 v2 › 手机排版完成要求',
    consequenceSend:'将发给客户李女士；发送后不能撤回。',consequenceRetry:'重试会调用付费模型；预计消耗以执行前确认为准。',consequenceStop:'停止后本轮不能继续；已产出的文件保留。',
    reference:'速览引用',routeMenu:'打开到准确位置',why:'放在这里：这条反馈对上了正在做的「发布 v2」。',chatText:'这条反馈需要你决定：',discussText:'小林贴了一条客户反馈，想确认是否优先处理。',pluginText:'对上哪条要求',waitText:'等你决定是否发送这份回复。',
    localTitle:'本页定位标本',localBody:'这里是准确位置的示例落点，返回后仍保留原来的形态与状态。真实插件导航由产品接入。',back:'回到刚才的位置',actionTitle:'操作预备标本',actionBody:'这里仅展示操作前的信息。尚未连接动作网关，没有发出请求、计费、停止任务或写回执。',readTitle:'读取状态标本',readBody:'重试入口的示例落点。实际读取仍未接入；关闭后继续保留当前错误或旧值，不假装恢复成功。',permissionBody:'插件说明是可读的公共落点；对象正文、标题与对象操作没有保留。',progress:'第 3 步 / 共 5 步',partialProgress:'3 项完成 / 共 5 项',samplePeek:'这是速览的常驻标本；名字片聚焦、悬停或轻点也能打开同一内容。',
  };
  const en = {
    specimen:'Specimen · B, owner first',boundary:'Sample data. Presentation, peek and local navigation only. No actions or Home connection.',title:'One item, four forms',subtitle:'The plugin owns the facts. The place determines how much unfolds.',state:'State',place:'Place',language:'Language',appearance:'Theme',light:'Light',dark:'Dark',long:'Long title',normal:'Normal',running:'In progress',decide:'Needs your decision',accept:'Needs your review',failed:'Failed',partial:'Partly complete',stale:'Last known value',forbidden:'No access',deleted:'Deleted',initial:'First read failed',
    chip:'Name chip',row:'Row',card:'Card',peek:'Peek',chat:'Conversation',discussion:'Project discussion',plugin:'Inside Inbox',wait:'Waiting on you',open:'Open at the exact spot',close:'Close',more:'More',review:'Review prepared content',send:'Review prepared message',retry:'Review retry',stop:'Review stop',source:'View read status',permissions:'About this plugin',
    normalBody:'Completion criteria are ready. Mobile layout can be worked on next.',runningBody:'Checking the third column of the mobile pricing table, now at step 3.',decideBody:'A customer reported the third pricing column wrapping on phones. A reply is ready for your decision.',acceptBody:'The mobile layout change is ready. Compare the result with this completion criterion.',failedBody:'Export did not finish: the image service did not respond. Your input is retained; inspect the failed step.',partialBody:'3 items finished; 2 did not. Each failed item can be retried separately.',staleBody:'Goals cannot be read right now. The last known content remains below.',initialBody:'No content has been read yet, so there is no last known value to show.',forbiddenBody:'This item belongs to Inbox. You do not have access.',deletedBody:'This item has been deleted.',notice:'This action is unavailable because its source cannot be reached.',readTime:'Example last read: 2026-11-08 09:40 (UTC−08:00)',time:'Nov 8, 09:40 · Lin',route:'Goals › 发布 v2 › 手机排版完成要求',
    consequenceSend:'Sends to customer Ms Li. The message cannot be recalled.',consequenceRetry:'Uses a paid model. Review the cost estimate before execution.',consequenceStop:'This run cannot resume after stopping. Files already produced are kept.',reference:'Peek at reference',routeMenu:'Open at the exact spot',why:'Here because this feedback matches the active “发布 v2” goal.',chatText:'This feedback needs your decision:',discussText:'Lin shared customer feedback and wants to confirm its priority.',pluginText:'Matches requirement',waitText:'Your decision is needed before sending this reply.',localTitle:'Local destination specimen',localBody:'This is an example of the exact destination. Returning keeps the previous form and state. Product navigation is not connected.',back:'Back to where you were',actionTitle:'Prepared action specimen',actionBody:'Only the information before an action is shown. No gateway is connected; no request, charge, stop or receipt is produced.',readTitle:'Read status specimen',readBody:'An example destination for retry. Reading is not connected; closing keeps the error or old value without claiming recovery.',permissionBody:'Plugin information is a readable public destination. The object title, content and object actions are absent.',progress:'Step 3 of 5',partialProgress:'3 of 5 items finished',samplePeek:'A persistent peek specimen. Focus, hover or tap a name chip to open the same content.',
  };
  const t = key => (S.lang === 'en' ? en : zh)[key] || key;
  const states = ['normal','running','decide','accept','failed','partial','stale','forbidden','deleted','initial'];
  if (!states.includes(S.state)) S.state = 'decide';
  const owners = { goals:{name:'Goals',icon:'target'}, inbox:{name:'Inbox',icon:'inbox'}, coding:{name:'Coding',icon:'code'} };
  let peekTrigger = null, suppressPeek = false, timer;
  const btn = (label, attrs={}, variant='secondary') => K.renderButton({label,variant,attrs});
  function object() {
    const owner = ['running','failed','partial'].includes(S.state) ? 'coding' : ['decide','forbidden'].includes(S.state) ? 'inbox' : 'goals';
    // Access-denied data never carries the private title or body, even in DOM attributes.
    if (S.state === 'forbidden') return {owner,state:S.state};
    if (S.state === 'deleted') return {owner,state:S.state};
    if (S.state === 'initial') return {owner,state:S.state};
    return {owner,state:S.state,title:S.long ? '手机价格表第三列掉行：在窄屏、分屏和客户长名称下仍须完整显示金额、状态与发送后果 · Mobile pricing review with a very long customer name' : '修好手机价格表的第三列',body:t(S.state === 'stale' ? 'normalBody' : S.state+'Body')};
  }
  const route = o => o.owner==='inbox' ? `Inbox › ${S.lang==='en'?'Customer feedback':'客户反馈'} › 手机价格表` : o.owner==='coding' ? 'Coding › 手机价格表 › '+(S.lang==='en'?'Step 3':'第 3 步') : t('route');
  const restricted = o => ['forbidden','deleted','initial'].includes(o.state);
  const tile = o => `<span class="owner-tile owner-${o.owner}" aria-label="${owners[o.owner].name}">${K.icon(owners[o.owner].icon)}</span>`;
  function status(o) {
    const state = {normal:'idle',running:'running',decide:'answer',accept:'verify',failed:'failed',partial:'partial',stale:'stale',forbidden:'blocked',deleted:'trashed',initial:'disconnected'}[o.state];
    return `<span class="status" data-status="${o.state}">${K.renderStateRing({state,progress:o.state==='partial'?.6:undefined})}<span>${t(o.state)}</span></span>`;
  }
  function empty(o) {
    return `<div class="empty-form" data-protected="${o.state}">${tile(o)}<div>${status(o)}<p>${t(o.state+'Body')}</p>${o.state==='initial'?`<a href="#read-status" data-destination="read">${t('source')}</a>`:''}</div></div>`;
  }
  function chip(o) {
    if (restricted(o)) return empty(o);
    return `<button type="button" class="mw-tag name-chip owner-${o.owner}" data-peek aria-haspopup="dialog" aria-expanded="false">${tile(o)}<span class="chip-title">${e(o.title)}</span>${status(o)}</button>${o.state==='stale'?`<span class="read-time">${t('readTime')}</span>`:''}`;
  }
  function notice(o) {
    return `<div class="notice"><p>${t(o.state==='initial'?'initialBody':'notice')}</p>${o.state==='stale'?`<time class="read-time" datetime="2026-11-08T09:40:00-08:00">${t('readTime')}</time>`:''}<a href="#read-status" data-destination="read">${t('source')}</a></div>`;
  }
  function consequence(o) {
    const key = {decide:'consequenceSend',running:'consequenceStop',failed:'consequenceRetry',partial:'consequenceRetry'}[o.state];
    return key ? `<p class="consequence">${K.icon('info')}<span>${t(key)}</span></p>` : '';
  }
  function menu() {
    return `<details class="menu-anchor"><summary class="mw-btn mw-btn--ghost mw-btn--sm" aria-label="${t('more')}">${K.icon('more')}<span>${t('more')}</span></summary>${K.renderMenu({items:K.renderMenuItem({label:t('reference'),attrs:{'data-nested-peek':true}})+K.renderMenuItem({label:t('routeMenu'),attrs:{'data-destination':'exact'}})})}</details>`;
  }
  function actions(o) {
    if (o.state==='stale') return notice(o);
    if (restricted(o)) return '';
    const label = {decide:'send',running:'stop',failed:'retry',partial:'retry'}[o.state] || 'review';
    return `<div class="actions">${btn(t(label),{'data-prepare':true},'primary')}${btn(t('open'),{'data-destination':'exact'})}${menu()}</div>${consequence(o)}`;
  }
  function progress(o) {
    if (!['running','partial'].includes(o.state)) return '';
    return `<div class="progress-line"><span class="meta">${t(o.state==='running'?'progress':'partialProgress')}</span><div class="mw-progress" role="progressbar" aria-label="${t(o.state)}" aria-valuenow="60" aria-valuemin="0" aria-valuemax="100"><span style="width:60%"></span></div></div>`;
  }
  function row(o) {
    if (restricted(o)) return empty(o);
    const label = {decide:'send',running:'stop',failed:'retry',partial:'retry'}[o.state] || 'review';
    return `<div class="mw-item presentation-row owner-${o.owner}">${tile(o)}<div class="row-copy">${o.state==='stale'?`<span class="title-link" tabindex="0">${e(o.title)}</span>`:`<button class="title-link" data-destination="exact">${e(o.title)}</button>`}<span class="meta">${t('time')}</span></div><div class="row-end">${status(o)}${o.state==='stale'?'':`<div class="actions">${btn(t(label),{'data-prepare':true},'primary')}${menu()}</div>`}</div><div class="row-foot">${o.state==='stale'?notice(o):consequence(o)}</div></div>`;
  }
  function card(o) {
    if (restricted(o)) return empty(o);
    return `<section class="presentation-card owner-${o.owner}"><div class="owner-band">${K.icon(owners[o.owner].icon)}<span>${owners[o.owner].name}</span><time datetime="2026-11-08T09:40:00-08:00">${t('time')}</time>${status(o)}</div>${K.renderPreviewCard({title:o.title,body:o.body})}<div class="card-footer">${progress(o)}${actions(o)}</div></section>`;
  }
  function peekBody(o, live=false) {
    if (restricted(o)) return empty(o);
    return `<div class="peek-head">${tile(o)}<div><span>${owners[o.owner].name}</span><div class="peek-route">${e(route(o))}</div></div>${live?btn(t('close'),{'data-close-peek':true},'ghost'):''}</div><div class="peek-content"><h3>${e(o.title)}</h3>${status(o)}<p>${e(o.body)}</p>${progress(o)}${actions(o)}</div>`;
  }
  function context(o) {
    if(restricted(o))return empty(o);
    if (S.place==='wait') return `<p>${t('waitText')}</p>${row(o)}`;
    if (S.place==='plugin') return `<p>${t('pluginText')}</p>${chip(o)}${card(o)}`;
    return `<p class="${S.place==='discussion'?'discussion-author':'context-prose'}">${t(S.place==='discussion'?'discussText':'chatText')}</p>${chip(o)}${card(o)}<p class="reason">${t('why')}</p>`;
  }
  function controls() {
    const toggles = (key, values, labels=values.map(t)) => K.renderToggleGroup({label:t(key),items:values.map((v,i)=>({value:v,label:labels[i],current:S[key]===v,attrs:{['data-set-'+key]:v}}))});
    const group = (key,values) => `<div class="control-line"><span>${t(key)}</span>${toggles(key,values)}</div>`;
    document.querySelector('#controls').innerHTML = `<div class="spec-controls__top"><strong>${t('specimen')}</strong><p>${t('boundary')}</p><div class="control-set">${K.renderToggleGroup({label:t('language'),items:[{value:'zh',label:'中文',current:S.lang==='zh',attrs:{'data-lang':'zh'}},{value:'en',label:'EN',current:S.lang==='en',attrs:{'data-lang':'en'}}]})}${K.renderToggleGroup({label:t('appearance'),items:['light','dark'].map(v=>({value:v,label:t(v),current:S.theme===v,attrs:{'data-theme':v}}))})}${K.renderToggleGroup({label:t('long'),items:[{value:'long',label:t('long'),current:S.long,attrs:{'data-long':true}}]})}</div></div>${group('state',states)}${group('place',['chat','discussion','plugin','wait'])}`;
  }
  function render() {
    closePeek(false);const o=object();document.documentElement.lang=S.lang==='en'?'en':'zh-CN';document.documentElement.dataset.resolvedTheme=S.theme;document.documentElement.dataset.theme=S.theme;
    controls();document.querySelector('#app').innerHTML=`<div class="page-heading"><h1>${t('title')}</h1><p>${t('subtitle')}</p></div><div class="forms"><section class="form-sample"><h2 class="form-label">${t('chip')}</h2><div>${chip(o)}</div></section><section class="form-sample"><h2 class="form-label">${t('row')}</h2>${row(o)}</section><section class="form-sample"><h2 class="form-label">${t('card')}</h2>${card(o)}</section><section class="form-sample"><h2 class="form-label">${t('peek')}</h2>${K.renderPopover({preview:true,className:'peek-sample',body:peekBody(o)})}<p class="field-note">${t('samplePeek')}</p></section></div><section class="context"><h2>${t(S.place)}</h2><div class="context-content">${context(o)}</div></section><section id="destination" class="destination" tabindex="-1" hidden></section>`;
  }
  function closePeek(restore=true) {
    clearTimeout(timer);const active=document.querySelector('#live-peek');if (!active) return;
    const trigger=peekTrigger;peekTrigger=null;suppressPeek=true;
    if(active.tagName==='DIALOG') active.close();else if(active.matches(':popover-open')) active.hidePopover();active.remove();
    trigger?.setAttribute('aria-expanded','false');if(restore&&trigger?.isConnected)trigger.focus({preventScroll:true});
    requestAnimationFrame(()=>{suppressPeek=false;});
  }
  function openPeek(trigger,focus=false) {
    if(suppressPeek || restricted(object()))return;
    const existing=document.querySelector('#live-peek');
    if(peekTrigger===trigger&&existing){
      if(focus)existing.querySelector('button')?.focus();
      return;
    }
    closePeek(false);suppressPeek=false;peekTrigger=trigger;trigger.setAttribute('aria-expanded','true');
    const o=object(), mobile=matchMedia('(max-width:650px)').matches;
    const html=mobile?K.renderSheet({labelledBy:'peek-title',title:t('peek'),body:peekBody(o),footer:'',closeLabel:t('close'),className:'spec-sheet',attrs:{id:'live-peek'}}):K.renderPopover({body:peekBody(o,true),className:'peek-live',attrs:{id:'live-peek',role:'dialog','aria-label':t('peek')}});
    document.querySelector('#layers').innerHTML=html;const layer=document.querySelector('#live-peek');
    if(mobile){layer.showModal();layer.addEventListener('close',()=>closePeek());}
    else{const box=trigger.getBoundingClientRect();layer.style.left=Math.max(12,Math.min(innerWidth-412,box.left))+'px';layer.style.top=Math.max(12,Math.min(innerHeight-440,box.bottom+8))+'px';layer.showPopover();layer.addEventListener('toggle',event=>{if(event.newState==='closed'&&layer.isConnected)closePeek();});if(focus)layer.querySelector('button')?.focus();}
    layer.addEventListener('cancel',()=>{requestAnimationFrame(()=>closePeek());});
  }
  let destinationTrigger=null;
  function destination(kind,trigger) {
    destinationTrigger=peekTrigger||trigger;closePeek(false);document.querySelectorAll('details[open]').forEach(x=>x.open=false);
    const node=document.querySelector('#destination');const title=kind==='read'?'readTitle':'localTitle';
    node.innerHTML=`<h2>${t(title)}</h2>${kind==='exact'?`<p>${e(route(object()))}</p>`:''}<p>${t(kind==='read'?'readBody':'localBody')}</p>${btn(t('back'),{'data-back':true})}`;node.hidden=false;node.scrollIntoView({block:'center'});node.focus({preventScroll:true});
  }
  function prepare(trigger) {
    const parent=document.querySelector('#live-peek');
    const html=K.renderSheet({labelledBy:'action-title',title:t('actionTitle'),body:`${consequence(object())}<p class="simulation-boundary">${t('actionBody')}</p>`,footer:btn(t('close'),{'data-dialog-close':true}),closeLabel:t('close'),className:'spec-sheet',attrs:{id:'action-preview'}});
    const mount=parent||document.querySelector('#layers');mount.insertAdjacentHTML('beforeend',html);const d=document.querySelector('#action-preview');d.showModal();d.addEventListener('close',()=>{d.remove();trigger.focus({preventScroll:true});});
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a,summary');if(!target)return;
    const ds=target.dataset;
    if(ds.lang||ds.theme||ds.setState||ds.setPlace||'long'in ds){if(ds.lang)S.lang=ds.lang;if(ds.theme)S.theme=ds.theme;if(ds.setState)S.state=ds.setState;if(ds.setPlace)S.place=ds.setPlace;if('long'in ds)S.long=!S.long;const selector=ds.lang?`[data-lang="${ds.lang}"]`:ds.theme?`[data-theme="${ds.theme}"]`:ds.setState?`[data-set-state="${ds.setState}"]`:ds.setPlace?`[data-set-place="${ds.setPlace}"]`:'[data-long]';render();document.querySelector(selector)?.focus({preventScroll:true});return;}
    if('peek'in ds){event.preventDefault();openPeek(target,true);}
    if('closePeek'in ds)closePeek();
    if('prepare'in ds)prepare(target);
    if('dialogClose'in ds)target.closest('dialog')?.close();
    if(ds.destination){event.preventDefault();destination(ds.destination,target);}
    if('back'in ds){document.querySelector('#destination').hidden=true;suppressPeek=true;destinationTrigger?.focus();requestAnimationFrame(()=>suppressPeek=false);}
    if('nestedPeek'in ds){target.closest('details').open=false;const trigger=target.closest('.form-sample,.context')?.querySelector('[data-peek]')||document.querySelector('[data-peek]');openPeek(trigger,true);}
  });
  document.addEventListener('focusin',event=>{if(event.target.matches('[data-peek]')&&!suppressPeek&&!matchMedia('(hover:none)').matches)openPeek(event.target);});
  document.addEventListener('pointerover',event=>{const trigger=event.target.closest('[data-peek]');if(trigger&&event.pointerType!=='touch'&&!suppressPeek)timer=setTimeout(()=>openPeek(trigger),250);});
  document.addEventListener('pointerout',event=>{if(event.target.closest('[data-peek]'))clearTimeout(timer);});
  render();const client=document.createElement('script');client.textContent=window.mwKitClient;document.body.append(client);document.documentElement.dataset.theme=S.theme;document.documentElement.dataset.resolvedTheme=S.theme;
})();
