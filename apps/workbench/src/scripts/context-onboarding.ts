/** Real onboarding. Account authorization is performed by the provider, never simulated here. */
export const CONTEXT_ONBOARDING_CLIENT = String.raw`
(() => {
  const app = document.getElementById('cx-app'), dialog = document.getElementById('cx-dialog');
  if (!app || !dialog) return;
  const L = globalThis.L || (s => s), esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => '<svg class="cx-icon" aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  const kinds = ['files','directory','browser','gmail','chat'];
  const names = {files:'本地文档',directory:'文件夹资料',browser:'浏览器内容',gmail:'Gmail',chat:'聊天记录'};
  const icons = {files:'book',directory:'folder',browser:'globe',gmail:'mail',chat:'message'};
  const desktop = document.body.dataset.nativeDesktop === 'true';
  const route = path => desktop ? path + (path.includes('?') ? '&' : '?') + 'desktop=1' : path;
  let config = {}, journey = null, expanded = null, busy = false, error = '', blank = false, materialsOnly = false, editing = false, timer = 0, inputTimer = 0, authTimer = 0, opener = null;
  let saveQueue = Promise.resolve();
  const api = async (path, body) => {
    const response = await fetch(path, {method: body === undefined ? 'GET' : 'POST', headers: globalThis.molisWorkControlHeaders(), ...(body === undefined ? {} : {body:JSON.stringify(body)})});
    const result = await response.json(); if (!response.ok) throw new Error(result.error || L('请求失败，请重试')); return result;
  };
  const endpoint = suffix => '/api/onboarding/context/' + journey.id + (suffix ? '/' + suffix : '');
  const source = kind => journey.sources.find(s => s.kind === kind);
  const connected = () => (config.connections || []).filter(c => c.state === 'connected');
  const picked = () => journey.sources.filter(s => s.selected);
  const ready = s => s.references?.length ? true : s.kind === 'gmail' ? Boolean(s.connection_id && connected().some(c => c.connection_id === s.connection_id)) : Boolean(s.files?.length || s.text?.trim() || s.path?.trim());
  const readable = () => picked().filter(ready);
  const pendingGoogle = () => picked().some(s => s.kind === 'gmail' && !ready(s)) && (config.gmail_configured || connected().length);
  const canPrepare = () => picked().some(s => s.kind !== 'gmail') || pendingGoogle();
  const sourceStatus = s => ready(s) ? '可读取' : s.kind === 'gmail' ? (connected().length ? '选择账号' : config.gmail_configured ? '待连接' : '暂不可连接') : '待添加';
  const startLabel = () => busy ? '正在保存…' : pendingGoogle() ? (connected().length ? '选择账号并继续' : '连接 Google 并继续') : readable().length ? (config.model ? '开始整理' : '先导入资料') : canPrepare() ? '添加内容' : picked().length ? '暂不可连接' : '开始整理';
  const recapText = () => L('已选') + ' ' + picked().length + ' ' + L('个来源') + ' · ' + readable().length + ' ' + L('个可读取');
  const preparationHint = () => !picked().length ? L('选择来源后，添加这次需要整理的内容。') : !readable().length ? L('先为选中的来源添加内容或连接账号。') : readable().length < picked().length ? L('部分来源尚未就绪，可以继续补充或先整理已有内容。') : L('所选来源已准备好。');
  function sourceIcon(kind) { return kind === 'gmail' ? document.getElementById('cx-gmail-icon').innerHTML : icon(icons[kind]); }
  function intro(step) {
    return '<aside class="cx-intro"><h1>' + (step === 1 ? L('让零散的内容，') + '<br>' + L('慢慢连起来。') : L('从你正在做的事') + '<br>' + L('开始。')) + '</h1><p>' + L('带上文件、网页和工作往来，Molis 帮你整理背景、进展与下一步。') + '</p><ol class="cx-steps">' + ['带入内容','整理脉络','开始工作'].map((s,i) => '<li class="' + (step === i ? 'current' : '') + '"><span class="cx-step">' + (i+1) + '</span>' + L(s) + '</li>').join('') + '</ol><div class="cx-trust">' + icon('shield') + '<span>' + L('只读取清单中选中的范围。') + '<br>' + L('原文件与消息保持原样。') + '</span></div></aside>';
  }
  function hint(s) {
    if (s.references?.length) return s.references.length+' '+L('份正文已保存；沿用本次快照');
    if (s.kind === 'gmail') { if (!ready(s) && connected().length) return L('选择一个已连接的 Google 账号'); if (!ready(s) && !config.gmail_configured) return L('Molis 尚未配置 Google 接入，可先使用其他来源'); const c = connected().find(c => c.connection_id === s.connection_id); return (c ? c.account_label || c.display_name : L('工作邮箱')) + ' · ' + L('最近') + ' ' + (s.days || 30) + ' ' + L('天，最多 20 封；不含附件'); }
    if (s.files?.length) return s.files.length + ' ' + L('份已选择的文件') + ' · ' + s.files.slice(0,2).map(f => f.path).join('、');
    if (s.path) return s.path;
    if (s.text?.trim()) return (s.url || L('已粘贴正文')) + ' · ' + s.text.length + ' ' + L('字符');
    return L({files:'选择 Markdown、文本或保存的网页',directory:'选择一个工作文件夹中的文本资料',browser:'粘贴网页正文与来源网址',chat:'导入飞书、Slack 等导出的文本记录'}[s.kind]);
  }
  function scope(s) {
    let content = '';
    if (s.kind === 'gmail') content = '<label for="cx-account">' + L('使用账号') + '</label><select class="cx-field" id="cx-account" data-field="connection_id" data-kind="gmail"><option value="">' + L(connected().length?'选择已有账号':'连接一个 Google 账号') + '</option>' + connected().map(c => '<option value="'+esc(c.connection_id)+'" '+(c.connection_id===s.connection_id?'selected':'')+'>'+esc(c.account_label || c.display_name)+'</option>').join('') + '</select><label for="cx-days">'+L('读取时间')+'</label><select class="cx-field" id="cx-days" data-field="days" data-kind="gmail"><option value="7" '+(s.days===7?'selected':'')+'>'+L('最近 7 天')+'</option><option value="30" '+(s.days!==7?'selected':'')+'>'+L('最近 30 天')+'</option></select><p>'+L('只读取最多 20 封邮件正文，不读取附件，不发送邮件。')+'</p>' + (!config.gmail_configured ? '<p>'+L('Google 连接尚未由 Molis 配置好。可以先整理其他材料，账号接入准备好后再连接。')+'</p>' : '<button type="button" class="cx-button small" data-action="connect">'+L('连接其他 Google 账号')+' '+icon('arrow')+'</button>');
    else if (s.kind === 'browser') content = '<label for="cx-url">'+L('原网页网址（可选）')+'</label><input type="url" class="cx-field" id="cx-url" data-kind="browser" data-field="url" placeholder="https://" value="'+esc(s.url || '')+'"><label for="cx-browser-text">'+L('网页正文')+'</label><textarea class="cx-field" id="cx-browser-text" data-kind="browser" data-field="text" maxlength="100000" placeholder="'+L('从网页复制需要整理的内容，粘贴到这里')+'">'+esc(s.text || '')+'</textarea><p>'+L('只使用粘贴的内容，不访问其他标签页或浏览记录。')+'</p>';
    else content = '<label for="cx-upload-'+s.kind+'">'+L(s.kind==='directory'?'选择文件夹':s.kind==='chat'?'选择聊天导出文件':'选择文件')+'</label><input id="cx-upload-'+s.kind+'" type="file" multiple '+(s.kind==='directory'?'webkitdirectory directory':'accept=".md,.markdown,.txt,.csv,.json,.html,.htm"')+' data-upload="'+s.kind+'"><div class="cx-file-list">'+esc((s.files||[]).map(f=>f.path).join('\n'))+'</div><p>'+L(s.kind==='chat'?'当前支持导出的文本；飞书 / Slack 会话正文的直接连接还未接入。':'每轮最多 50 份文本，总大小 6 MB。长材料会分批整理；隐藏文件、依赖目录和非文本文件不读取。')+'</p>';
    return '<div class="cx-scope" id="cx-scope-'+s.kind+'"><div>'+content+'</div></div>';
  }
  function resumeNotice() {
    return config.resume && config.resume.id !== journey.id ? '<section class="cx-panel cx-resume"><span>'+L('上次还有一份未完成的整理')+' · '+esc(config.resume.title)+'</span><button class="cx-button small" data-action="resume">'+L('继续上次整理')+'</button></section>' : '';
  }
  function savingProject() {
    const saving=journey.phase==='adopting';
    return '<main class="cx-layout">'+intro(2)+'<section class="cx-panel"><div class="cx-blank"><h2>'+esc(journey.adoption.title)+'</h2><p>'+L(saving?'正在保存项目与资料，请稍候。':'项目内容已经确认。继续保存会恢复同一个项目。')+'</p><p class="cx-error" role="alert">'+esc(error||journey.error)+'</p><button class="cx-button primary" data-action="adopt" '+(busy||saving?'disabled':'')+'>'+L(saving?'正在保存…':'继续保存项目')+'</button></div></section></main>';
  }
  function checklist() {
    if (blank) return '<main class="cx-layout">'+intro(0)+'<section class="cx-panel"><form id="cx-blank-form" class="cx-blank"><h2>'+L('给新项目一个名字')+'</h2><p>'+L(materialsOnly?'已导入的资料会带入项目，摘要可以稍后整理。':'先建一个空间，资料和下一步可以慢慢补充。')+'</p><label for="cx-blank-name">'+L('项目名称')+'</label><input class="cx-field" id="cx-blank-name" maxlength="120" required autocomplete="off" placeholder="'+L('例如：秋季内容计划')+'"><p class="cx-error" role="alert">'+esc(error)+'</p><div class="cx-actions"><button class="cx-button quiet" type="button" data-action="back">'+L('返回')+'</button><button class="cx-button primary" type="submit" '+(busy?'disabled':'')+'>'+L(busy?'正在创建…':'创建项目')+'</button></div></form></section></main>';
    return '<main class="cx-layout">'+intro(0)+'<div>'+resumeNotice()+(journey.summary?'<p class="cx-hint">'+L('已保留读入的资料。再次开始整理会替换当前摘要，请确认所选范围。')+'</p>':'')+(journey.oauth_status==='pending'?'<div class="cx-error" role="status">'+L('请在浏览器中完成 Google 授权，完成后会继续。')+' <button class="cx-button small" data-action="skip-auth">'+L('跳过 Gmail，继续')+'</button></div>':'')+'<p class="cx-error" role="alert">'+esc(error)+'</p><section class="cx-panel" aria-label="'+L('选择材料来源')+'"><header class="cx-panel-head"><h2>'+L('想带入哪些内容？')+'</h2><label class="cx-select-all"><input type="checkbox" class="cx-check" id="cx-all" '+(picked().length===5?'checked':'')+'>'+L('全选')+'</label></header>'+journey.sources.map(s=>'<article class="cx-row '+(s.selected?'selected':'')+'"><div class="cx-row-main"><label class="cx-source" for="cx-select-'+s.kind+'"><input type="checkbox" class="cx-check" id="cx-select-'+s.kind+'" data-select="'+s.kind+'" '+(s.selected?'checked':'')+'>'+sourceIcon(s.kind)+'<span class="cx-source-copy"><span class="cx-source-title">'+L(names[s.kind])+'<span class="cx-status '+(ready(s)?'ready':'')+'">'+L(sourceStatus(s))+'</span></span><small>'+esc(hint(s))+'</small></span></label>'+(s.kind==='gmail'&&!ready(s)&&(config.gmail_configured||connected().length)?'<button class="cx-button small" data-action="'+(connected().length?'choose-account':'connect')+'" '+(busy?'disabled':'')+'>'+L(connected().length?'选择已有账号':'连接 Google')+' '+icon('arrow')+'</button>':'')+'<button class="cx-button quiet small cx-row-action" data-scope="'+s.kind+'" aria-controls="cx-scope-'+s.kind+'" aria-expanded="'+(expanded===s.kind)+'" aria-label="'+L('调整')+L(names[s.kind])+L('范围')+'">'+icon('chevron-down')+'</button></div>'+(expanded===s.kind?scope(s):'')+'</article>').join('')+'<footer class="cx-footer"><div class="cx-recap"><span>'+recapText()+'</span><span class="cx-model">'+(config.model?esc(config.model):'<a href="'+route('/settings/models')+'" target="_blank" rel="noopener">'+L('连接文字模型')+'</a>')+'</span></div><p class="cx-preparation" role="status">'+preparationHint()+'</p><div class="cx-actions"><button class="cx-button quiet" data-action="blank">'+L('空白开始')+' '+icon('arrow')+'</button><button class="cx-button primary" data-action="start" '+(!picked().length||(!readable().length&&!canPrepare())||busy?'disabled':'')+'>'+L(startLabel())+' '+icon('arrow')+'</button></div></footer></section><p class="cx-footnote">'+L(config.model?'点击开始后，所选正文会发送给上方模型整理。':'尚未连接文字模型。可以先导入资料，连接模型后再生成摘要。')+'<br>'+L('只做本次整理，不自动持续同步。')+'</p></div></main>';
  }
  function reading() {
    const done = picked().filter(s => s.references || s.error).length;
    return '<main class="cx-layout">'+intro(1)+'<section class="cx-panel"><div class="cx-reading-head"><h2>'+L(journey.phase==='reading'?(done===picked().length?'正在整理工作脉络':'正在读入你的材料'):'材料已保留')+'</h2><p role="status">'+L(journey.phase==='reading'?'可以离开，回来后接着整理。':'修复连接或模型设置后，可以接着完成。')+'</p><div class="cx-progress"><span style="transform:scaleX('+(done/Math.max(1,picked().length))+')"></span></div></div>'+(journey.synthesis?'<p class="cx-hint" role="status">'+L('分批整理')+' · '+L('第')+' '+journey.synthesis.stage+' '+L('轮')+' · '+journey.synthesis.completed+' / '+journey.synthesis.total+'</p>':'')+picked().map(s=>'<div class="cx-receipt">'+sourceIcon(s.kind)+'<div>'+L(names[s.kind])+'<small>'+esc(s.error || (s.references?s.references.length+' '+L('份正文已保存')+(s.skipped?' · '+s.skipped+' '+L('项已跳过'):''):hint(s)))+'</small></div><span>'+L(s.error?'未读取':s.references?'已读取':'等待中')+'</span></div>').join('')+'<footer class="cx-footer"><p class="cx-error" role="alert">'+esc(journey.error||error)+'</p>'+(journey.phase==='failed'?'<div class="cx-actions"><a class="cx-button quiet" href="'+route('/settings/models')+'" target="_blank" rel="noopener">'+L('模型设置')+'</a><button class="cx-button primary" data-action="retry" '+(busy?'disabled':'')+'>'+L('继续整理')+'</button></div><button class="cx-button quiet small" data-action="restart">'+L('返回清单，调整范围')+'</button>'+(picked().some(s=>s.references?.length)?'<button class="cx-button quiet small" data-action="materials-only">'+L('带入资料，先开始')+'</button>':''):'<span class="cx-model">'+esc(journey.model || config.model || L('尚未连接文字模型'))+'</span>')+'</footer></section></main>';
  }
  function markdown(text) {
    const out=[];let paragraph=[];
    const flush=()=>{if(paragraph.length){out.push('<p>'+paragraph.join('\n')+'</p>');paragraph=[];}};
    for(const line of esc(text).split('\n')){const heading=/^#{1,3} (.+)$/.exec(line);if(heading){flush();out.push('<h3>'+heading[1]+'</h3>');}else if(!line.trim())flush();else paragraph.push(line);}
    flush();return out.join('').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\[S(\d+)\]/g,'<button class="cx-citation" data-cite="S$1" aria-label="'+L('查看来源')+' S$1">[S$1]</button>');
  }
  function review() {
    const s=journey.summary;
    return '<main class="cx-review"><div class="cx-review-header"><button class="cx-button quiet small" data-action="restart">'+L('调整来源并重新整理')+'</button></div><h1>'+L('这就是你工作的起点。')+'</h1><p class="cx-subtitle">'+L('根据已有材料，整理了一份项目建议。名字和摘要都可以修改。')+'</p><p class="cx-error" role="alert">'+esc(error||journey.error)+'</p><div class="cx-review-grid"><section class="cx-document"><label for="cx-project-title">'+L('项目名称')+'</label><input id="cx-project-title" class="cx-field cx-title-input" maxlength="120" value="'+esc(s.title)+'"><div class="cx-actions"><span class="cx-status">'+L('工作摘要')+'</span><button class="cx-button quiet small" data-action="edit">'+L(editing?'完成编辑':'编辑摘要')+'</button></div>'+(editing?'<textarea id="cx-summary-editor" class="cx-field cx-summary-editor" maxlength="100000" aria-label="'+L('编辑摘要')+'">'+esc(s.body)+'</textarea>':'<div class="cx-summary">'+markdown(s.body)+'</div>')+'</section><aside class="cx-sources"><h2>'+L('依据这些材料')+' · '+s.references.length+'</h2>'+s.references.map(r=>'<button class="cx-reference" data-cite="'+r.label+'"><span>'+r.label+' · '+L('版本')+' '+r.revision+'</span>'+esc(r.title)+'</button>').join('')+picked().filter(s=>s.error).map(s=>'<p class="cx-source-meta">'+L(names[s.kind])+': '+esc(s.error)+'</p>').join('')+'</aside></div><footer class="cx-review-actions"><span>'+L('摘要和来源快照会一起保存在项目中。')+'</span><button class="cx-button primary" data-action="adopt" '+(busy?'disabled':'')+'>'+L(busy?'正在保存…':'采用，开始工作')+' '+icon('arrow')+'</button></footer></main>';
  }
  function render(focus) {
    app.setAttribute('aria-busy',String(busy));
    app.innerHTML = !journey ? '<main class="cx-review"><p class="cx-error" role="alert">'+esc(error)+'</p><button class="cx-button" data-action="reload">'+L('重新加载')+'</button></main>' : journey.adoption ? savingProject() : blank ? checklist() : journey.phase==='selecting' ? checklist() : journey.summary ? review() : reading();
    const all=document.getElementById('cx-all'); if(all)all.indeterminate=picked().length>0&&picked().length<5;
    if(focus)document.getElementById(focus)?.focus({preventScroll:true});
  }
  function invalidateSource(s) { delete s.references;delete s.preview_id;delete s.error;delete s.skipped; }
  function refreshSelection() {
    for(const s of journey.sources){const box=document.getElementById('cx-select-'+s.kind);if(box){box.checked=s.selected;const copy=box.closest('label').querySelector('.cx-source-copy');copy.querySelector('small').textContent=hint(s);const status=copy.querySelector('.cx-status');status.textContent=L(sourceStatus(s));status.classList.toggle('ready',ready(s));}}
    const all=document.getElementById('cx-all');if(all){all.checked=picked().length===5;all.indeterminate=picked().length>0&&picked().length<5;}
    const recap=app.querySelector('.cx-recap>span');if(recap)recap.textContent=recapText();
    const preparation=app.querySelector('.cx-preparation');if(preparation)preparation.textContent=preparationHint();
    const start=app.querySelector('[data-action="start"]');if(start){start.disabled=!picked().length||(!readable().length&&!canPrepare())||busy;start.innerHTML=L(startLabel())+' '+icon('arrow');}
  }
  function save() {
    clearTimeout(inputTimer);
    const id=journey.id, sources=JSON.parse(JSON.stringify(journey.sources)),autoStart=journey.auto_start===true;
    const next=saveQueue.catch(()=>{}).then(()=>api('/api/onboarding/context/'+id+'/selection',{sources,auto_start:autoStart}));
    saveQueue=next; return next;
  }
  function preserveEdits() {
    if(!journey.summary)return;
    const name=document.getElementById('cx-project-title'), body=document.getElementById('cx-summary-editor');
    if(name)journey.summary.title=name.value;if(body)journey.summary.body=body.value;
  }
  function projectLocation() { return route('/projects/'+encodeURIComponent(journey.project_id)+'/?openPlugin=pages&openItem='+encodeURIComponent(journey.document_id || '')+'&openTitle='+encodeURIComponent((journey.adoption?.title || journey.summary?.title || L('项目'))+' · '+L('工作摘要'))); }
  async function poll() {
    clearTimeout(timer);
    try { journey=await api(endpoint()); if(journey.phase==='complete'){location.assign(projectLocation());return;} render();if(journey.phase==='reading'||journey.phase==='adopting')timer=setTimeout(poll,1800); }
    catch(e){error=e.message;render();timer=setTimeout(poll,5000);}
  }
  async function connect(auto=false) {
    if(!config.gmail_configured) { expanded='gmail';error=L('Google 接入还未准备好，可先使用其他来源。');render();return; }
    source('gmail').selected=true;journey.auto_start=auto;await save();
    const result=await api('/api/settings/connectors/gmail/oauth/start',{manage_connection:true,onboarding_id:journey.id,desktop});
    if(globalThis.molisWorkOpenExternalUrl){
      await globalThis.molisWorkOpenExternalUrl(result.authorizationUrl);journey.oauth_status='pending';render();authTimer=setTimeout(pollAuthorization,1500);
    }else location.assign(result.authorizationUrl);
  }
  async function pollAuthorization() {
    clearTimeout(authTimer);
    try {
      const latest=await api(endpoint());
      if(latest.oauth_status==='pending'){authTimer=setTimeout(pollAuthorization,1800);return;}
      journey=latest;config=await api('/api/onboarding/context');
      if(latest.oauth_status==='connected'){error='';if(journey.auto_start&&journey.phase==='selecting')await start();else if(journey.phase==='reading'||journey.phase==='adopting')await poll();}
      else error=journey.error||L('Google 连接未完成。可以重试，或先使用其他来源。');
      render();
    }catch(e){error=e.message;render();authTimer=setTimeout(pollAuthorization,5000);}
  }
  async function start() {
    const gmail=source('gmail');
    if(journey.phase==='selecting') {
      if(gmail?.selected&&!ready(gmail)&&connected().length){expanded='gmail';render('cx-account');return;}
      if(gmail?.selected&&!ready(gmail)&&config.gmail_configured){await connect(true);return;}
      await save();
    }
    journey=await api(endpoint('start'),{});render();timer=setTimeout(poll,800);
  }
  async function restart() {
    const previous=journey?.sources || [];
    journey=await api('/api/onboarding/context',{id:crypto.randomUUID()});
    journey.sources=kinds.map(kind=>{const old=previous.find(s=>s.kind===kind);return {kind,selected:false,days:30,...(kind==='gmail'&&old?.connection_id?{connection_id:old.connection_id}:{})};});
    const url=new URL(location.href);url.searchParams.set('journey',journey.id);url.searchParams.delete('oauth');history.replaceState(null,'',url);blank=false;error='';await save();render();
  }
  async function reopen() {
    await saveQueue;journey=await api(endpoint('reopen'),{});blank=false;error='';editing=false;render();
  }
  function saveDraft() {
    const id=journey.id, draft={title:journey.summary.title,body:journey.summary.body};
    const next=saveQueue.catch(()=>{}).then(()=>api('/api/onboarding/context/'+id+'/draft',draft));saveQueue=next;return next;
  }
  async function adopt(isBlank=false) {
    preserveEdits();await saveQueue;
    const accepted=journey.adoption;
    const name=accepted?.title ?? (isBlank?document.getElementById('cx-blank-name').value:journey.summary.title);
    journey=await api(endpoint('adopt'),{title:name,body:accepted?.body ?? (isBlank?'':journey.summary.body),blank:isBlank&&!materialsOnly,materials_only:materialsOnly});
    blank=false;
    if(journey.phase==='complete')location.assign(projectLocation());else{error=journey.error||L('保存尚未完成，请重试');render();}
  }
  app.addEventListener('input',e=>{if(e.target.id==='cx-project-title'||e.target.id==='cx-summary-editor')preserveEdits();else if(e.target.dataset.field){const s=source(e.target.dataset.kind),value=e.target.dataset.field==='days'?Number(e.target.value):e.target.value;if(s[e.target.dataset.field]!==value)invalidateSource(s);s[e.target.dataset.field]=value;s.selected=true;refreshSelection();clearTimeout(inputTimer);inputTimer=setTimeout(()=>save().catch(e=>{error=e.message;render();}),400);}});
  app.addEventListener('change',async e=>{
    const el=e.target;
    try {
      if(el.id==='cx-project-title'||el.id==='cx-summary-editor'){preserveEdits();await saveDraft();}
      else if(el.id==='cx-all'){journey.sources.forEach(s=>s.selected=el.checked);render(el.id);await save();}
      else if(el.dataset.select){source(el.dataset.select).selected=el.checked;render(el.id);await save();}
      else if(el.dataset.field){const s=source(el.dataset.kind),value=el.dataset.field==='days'?Number(el.value):el.value;if(s[el.dataset.field]!==value)invalidateSource(s);s[el.dataset.field]=value;s.selected=true;refreshSelection();await save();}
      else if(el.dataset.upload){
        const chosen=[...el.files].filter(f=>!/(^|\/)(\.[^/]*|node_modules|vendor|dist|build)(\/|$)/.test(f.webkitRelativePath||f.name)&&/\.(md|markdown|txt|csv|json|html?)$/i.test(f.name));
        if(chosen.length>50||chosen.reduce((n,f)=>n+f.size,0)>6000000)throw new Error(L('请缩小选择：最多 50 份文本，总大小 6 MB。'));
        if(!chosen.length)throw new Error(L('没有找到支持的文本文件。'));
        const files=[];for(const file of chosen){const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));files.push({path:file.webkitRelativePath||file.name,data:btoa(binary)});}
        const s=source(el.dataset.upload);invalidateSource(s);s.files=files;s.selected=true;error='';await save();render();
      }
    } catch(e){error=e.message;render();}
  });
  app.addEventListener('submit',async e=>{if(e.target.id!=='cx-blank-form')return;e.preventDefault();busy=true;try{await adopt(true);}catch(e){error=e.message;}finally{busy=false;render();}});
  app.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.scope){expanded=expanded===b.dataset.scope?null:b.dataset.scope;render();return;}
    if(b.dataset.cite){const ref=journey.summary.references.find(r=>r.label===b.dataset.cite);if(!ref)return;opener=b;dialog.innerHTML='<h2 id="cx-dialog-title">'+esc(ref.title)+'</h2><div class="cx-source-meta">'+esc(ref.path)+' · '+L('版本')+' '+ref.revision+'</div><div class="cx-source-body">'+esc(ref.body)+'</div><div class="cx-actions"><button class="cx-button" data-close>'+L('关闭')+'</button></div>';dialog.showModal();return;}
    const action=b.dataset.action;if(!action)return;
    if(action==='start'&&!readable().length&&!pendingGoogle()){expanded=picked().find(s=>s.kind!=='gmail')?.kind;render(expanded==='browser'?'cx-browser-text':'cx-upload-'+expanded);return;}
    if(action==='choose-account'){source('gmail').selected=true;expanded='gmail';render('cx-account');try{await save();}catch(e){error=e.message;render();}return;}
    if(action==='edit'){preserveEdits();if(editing){try{await saveDraft();}catch(e){error=e.message;render('cx-summary-editor');return;}}editing=!editing;render(editing?'cx-summary-editor':'cx-project-title');return;}
    if(action==='blank'||action==='materials-only'){materialsOnly=action==='materials-only';blank=true;error='';render('cx-blank-name');return;}
    if(action==='back'){blank=false;error='';render();return;}
    if(action==='reload'){location.reload();return;}
    busy=true;error='';b.disabled=true;
    try{if(action==='resume'){await save();const url=new URL(location.href);url.searchParams.set('journey',config.resume.id);url.searchParams.delete('oauth');location.assign(url);}else if(action==='skip-auth'){clearTimeout(authTimer);source('gmail').selected=false;journey.auto_start=false;journey.oauth_status=undefined;await save();if(picked().length)await start();}else if(action==='connect')await connect();else if(action==='start'||action==='retry')await start();else if(action==='restart')await reopen();else if(action==='adopt')await adopt();}
    catch(e){error=e.message;}finally{busy=false;render();}
  });
  dialog.addEventListener('click',e=>{if(e.target.closest('[data-close]'))dialog.close();});dialog.addEventListener('close',()=>opener?.focus());
  document.getElementById('cx-theme').addEventListener('click',()=>{const theme=document.documentElement.dataset.resolvedTheme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;document.documentElement.dataset.resolvedTheme=theme;try{localStorage.setItem('molis-work:theme',theme);}catch{}});
  document.getElementById('cx-exit').addEventListener('click',async()=>{try{await saveQueue;if(document.body.dataset.onboardingMode==='first_run')await api('/api/onboarding/dismiss',{kind:'first_run',user_confirmed:true});location.assign(route('/'));}catch(e){error=e.message;render();}});
  (async()=>{try{
    config=await api('/api/onboarding/context');
    const url=new URL(location.href), id=url.searchParams.get('journey');
    if(id)journey=await api('/api/onboarding/context/'+encodeURIComponent(id));else await restart();
    if(journey.phase==='selecting'&&!journey.sources.length)journey.sources=kinds.map(kind=>({kind,selected:false,days:30}));
    if(journey.phase==='selecting'){const gmail=source('gmail');if(gmail&&!gmail.connection_id&&connected().length===1)gmail.connection_id=connected()[0].connection_id;}
    const oauth=url.searchParams.get('oauth');if(oauth==='failed'||oauth==='cancelled'||journey.oauth_status==='failed'){error=journey.error||L('Google 连接未完成。可以重新连接，或取消勾选 Gmail 后先整理其他材料。');expanded='gmail';}
    render();if(desktop&&oauth&&!globalThis.molisWorkOpenExternalUrl){app.innerHTML='<main class="cx-review"><h1>'+L(oauth==='connected'?'Google 已连接':'Google 连接未完成')+'</h1><p>'+L('请回到 Molis Work，原来的整理流程会自动接续。')+'</p></main>';return;}if(journey.oauth_status==='pending'&&globalThis.molisWorkOpenExternalUrl)authTimer=setTimeout(pollAuthorization,1000);if(journey.phase==='complete')location.assign(projectLocation());else if(journey.phase==='reading'||journey.phase==='adopting')await poll();else if(oauth==='connected'&&journey.auto_start)await start();
  }catch(e){error=e.message;render();}})();
})();
`;
