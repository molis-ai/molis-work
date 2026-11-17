/* Demonstration only: task facts, replies and transport outcomes are simulated here. */
(() => {
  const K = window.mwKit, W = window.prototypeWorkLine, esc = K.escapeHtml;
  const query = new URLSearchParams(location.search);
  let lang = query.get('lang') === 'en' ? 'en' : 'zh';
  let theme = query.get('theme') === 'dark' ? 'dark' : 'light';
  let selected = query.get('task') || 'parent', fault = 'normal', mainHandle, childHandle, mountedChild;
  const tx = pair => pair[lang === 'en' ? 1 : 0];
  const key = 'molis-prototype-58-v4:';
  const drafts = new Map(), reading = new Map(), expanded = new Set(), pending = new Map();
  const base = {
    parent: { name: ['准备墨问西东内测发布', 'Prepare Mowen for private beta'], role: ['个人助理', 'Personal assistant'], state: 'running',
      brief: ['把访谈观点变成可听的内容，先邀请 20 位朋友试用。', 'Turn interview perspectives into listening. Invite 20 people to try it first.'],
      messages: [['assistant', ['我把工作分成了三个步骤。文案和体验核对同时推进；你可以直接点进任一步补充要求，我会在这里收拢进展。', 'I split the work into three steps. Copy and experience checks are underway together. Open any step to add instructions; I’ll collect the updates here.']]] },
    research: { name: ['整理首批试用者反馈', 'Synthesize first-user feedback'], role: ['研究员', 'Researcher'], state: 'round-ended',
      brief: ['读完 8 份访谈，保留原话与来源。', 'Read eight interviews and keep quotes with their sources.'],
      messages: [['assistant', ['最一致的诉求是：先听到一个鲜明观点，再决定是否继续探索。\n\n三位试用者提到，第一次打开时不要先选一大组兴趣。建议先提供一个 90 秒样例，把个性化选择放到听完以后。', 'The clearest request: hear one distinctive perspective before deciding to explore.\n\nThree participants said the first visit should not begin with a long interest survey. Offer a 90-second sample and personalize after listening.']]], process: ['已阅读 8 份访谈 · 关联 5 条原话', 'Read 8 interviews · linked 5 quotes'] },
    copy: { name: ['写一封内测邀请', 'Write a private beta invitation'], role: ['文案助理', 'Writer'], state: 'running',
      brief: ['短一点，像写给朋友；先说明能听到什么。', 'Keep it brief and personal. Start with what they can hear.'],
      messages: [['assistant', ['我先写了一版开头：\n\n「最近做了一个叫墨问西东的小东西。它把访谈里值得停一下的观点，变成一段可以听的声音。想邀请你当第一批听众。」\n\n正在补上试用方式和反馈问题。', 'Here’s a first opening:\n\n“I’ve been making Mowen, a small listening experience built around the ideas in interviews that make you pause. I’d love you to be one of its first listeners.”\n\nI’m adding the trial instructions and one feedback question.']]], process: ['已读取访谈摘要 · 正在整理邀请正文', 'Read the interview summary · drafting the invitation'] },
    check: { name: ['核对首次收听体验', 'Check the first listening experience'], role: ['体验检查员', 'Experience reviewer'], state: 'answer',
      brief: ['检查手机上的首次打开、播放和返回。', 'Check opening, playback and returning on mobile.'],
      messages: [['assistant', ['手机上的播放和返回都能走通。有一个内容选择需要你定，确认后我再检查首次引导。', 'Playback and return work on mobile. I need your choice on the opening sample before checking onboarding.']]], process: ['播放、暂停、返回已核对', 'Checked playback, pause and return'] },
    mobile: { name: ['检查窄屏播放控件', 'Check narrow-screen playback'], role: ['界面检查员', 'UI reviewer'], state: 'failed', parent: 'check',
      brief: ['归属「核对首次收听体验」', 'Part of “Check the first listening experience”'],
      messages: [['assistant', ['录音页面暂时读不到，已保留此前的检查结果。这次没有重新执行播放操作。', 'The recording page is unavailable. Earlier checks are preserved; playback was not repeated.']]] }
  };
  let tasks = structuredClone(base);
  try { const saved = JSON.parse(localStorage.getItem(key + 'state') || 'null'); if (saved) for (const id of Object.keys(base)) if (saved[id]) Object.assign(tasks[id], saved[id]); } catch { /* Demo may start fresh. */ }
  if (!tasks[selected]) selected = 'parent';
  const siblings = ['research', 'copy', 'check'];
  let panelOpen = selected !== 'parent' || query.has('panel'), panelMode = selected !== 'parent' ? 'conversation' : query.get('panel') === 'list' ? 'list' : 'task', dialogOpen = true;
  const stateLabels = {
    running: ['进行中', 'Working'], answer: ['等你回答', 'Needs your answer'], 'round-ended': ['本轮结束', 'Round ended'],
    failed: ['未完成', 'Could not finish'], stopped: ['已停止', 'Stopped'], interrupted: ['已中断', 'Interrupted'],
    unavailable: ['已收回', 'Reassigned'], approval: ['等你审查', 'Needs approval']
  };
  const status = id => stateLabels[tasks[id].state] || stateLabels.running;
  const save = () => localStorage.setItem(key + 'state', JSON.stringify(tasks));
  function rememberView() { const url = new URL(location.href); url.searchParams.delete('scheme'); for (const [k,v] of Object.entries({ task: selected, lang, theme })) url.searchParams.set(k,v); history.replaceState(null,'',url); }
  const btn = (label, action, options = {}) => K.renderButton({ label: tx(label), variant: 'secondary', size: 'sm', attrs: { 'data-action': action }, ...options });
  const ring = id => K.renderStateRing({ state: tasks[id].state, label: tx(status(id)) });
  const badge = id => K.renderBadge({ label: tx(status(id)), tone: ['failed', 'answer', 'approval'].includes(tasks[id].state) ? 'warning' : 'neutral' });
  const icon = name => K.icon(name);

  function prototypeBar() {
    const option = (v, label, current) => `<option value="${v}" ${v === current ? 'selected' : ''}>${esc(tx(label))}</option>`;
    document.getElementById('prototype').innerHTML = `<b>${tx(['58 · 子任务对话样稿', '58 · Subtask conversation prototype'])}</b>
      <label><select id="fault" aria-label="${tx(['演示状态', 'Demo state'])}">${Object.entries({ normal: ['正常', 'Normal'], failed: ['发送失败', 'Send fails'], unknown: ['发送结果未知', 'Send outcome unknown'], unreadable: ['读取失败', 'Read fails'], revoked: ['子任务已收回', 'Subtask reassigned'], interrupted: ['重启后中断', 'Interrupted after restart'], approval: ['等待审批', 'Awaiting approval'], long: ['长对话', 'Long conversation'] }).map(([v,l]) => option(v,l,fault)).join('')}</select></label>
      ${btn(['后台来一条更新', 'Background update'], 'background')}
      ${btn(lang === 'zh' ? ['EN', 'EN'] : ['中文', '中文'], 'language')}
      ${btn(theme === 'light' ? ['深色', 'Dark'] : ['浅色', 'Light'], 'theme')}
      ${btn(['重置演示', 'Reset demo'], 'reset', { variant: 'ghost' })}`;
  }
  function frame() {
    rememberView(); window.prototypeLocale(lang);
    document.documentElement.lang = lang;
    document.documentElement.dataset.resolvedTheme = theme;
    document.documentElement.dataset.theme = theme;
    prototypeBar();
    document.getElementById('desktop').innerHTML = `<header class="desktop-top">${icon('home')}<span class="desktop-tab">${icon('file')} ${tx(['内测发布计划', 'Private beta plan'])}</span><span class="project">${tx(['墨问西东', 'Mowen'])}</span></header><article class="document"><div class="eyebrow">${tx(['项目文档 · 草稿', 'Project document · Draft'])}</div><h1>${tx(['让第一个观点，值得听。', 'Make the first perspective worth hearing.'])}</h1><p>${tx(['墨问西东 · 首轮内测计划', 'Mowen · First private beta'])}</p><h2>${tx(['这一次想知道什么', 'What we want to learn'])}</h2><p>${tx(['一段 90 秒的语音观点，能否让人愿意听完，再往下探索？先邀请 20 位朋友，留下他们在第一次收听时最自然的反应。', 'Can a 90-second perspective make someone want to listen and explore? Invite twenty friends and capture their first reactions.'])}</p><div class="document-row">${icon('check')} ${tx(['访谈摘要', 'Interview summary'])}<small>${tx(['8 份已整理', '8 interviews reviewed'])}</small></div><div class="document-row">${icon('file')} ${tx(['邀请文案', 'Invitation copy'])}<small>${tx(['助理正在处理', 'Assistant is working'])}</small></div><div class="document-row">${icon('play')} ${tx(['首次收听样例', 'First listening sample'])}<small>${tx(['待选择', 'Awaiting a choice'])}</small></div></article>`;
    const mainField=document.querySelector('#composer textarea');
    if(mainField)localStorage.setItem(key+'draft:parent',mainField.value);
    mainHandle?.destroy();unmountChild();
    const owner = { name: tx(['助理', 'Assistant']), glyph: 'sparkles', hue: 'blue' };
    document.getElementById('line-zone').innerHTML = W.renderWorkLine({
      head: W.renderLineHead({ name: tx(['墨问西东', 'Mowen']), waiting: 1 }), past: [],
      active: [{ id: 'beta', title: tx(['内测发布', 'Private beta']), owner, kind: tx(['发布准备', 'Launch preparation']), state: 'running', stateLabel: tx(['在办', 'In progress']), tasks: { count: 3, lead: 'answer' } }],
      next: [{ id: 'invite', title: tx(['邀请第一批听众', 'Invite first listeners']), owner, kind: tx(['待办', 'Next step']), state: '', stateLabel: tx(['接下来', 'Next']) }],
      slot: `<div class="bar-center" data-assistant-island><section id="assistant-panel" class="assistant-panel" data-side="closed" aria-label="${tx(['个人助理对话', 'Personal assistant conversation'])}"></section><div class="task-float" id="task-float"></div><div id="peek" class="peek" hidden></div><div id="composer"></div></div>`
    });
    drawCard(); mainHandle=mountComposer('parent',document.getElementById('composer')); placeFloat();
  }
  function row(id) {
    return `<button class="task-link" data-task="${id}">${ring(id)}<span>${esc(tx(tasks[id].name))}</span><small>${esc(tx(status(id)))}</small>${icon('chevron-right')}</button>`;
  }
  function drawCard() {
    const panel=document.getElementById('assistant-panel'); if(!panel)return;
    panel.hidden=!dialogOpen;
    const mark=W.renderTaskMark({count:3,lead:'answer',needsYou:true,expanded:panelOpen,panel:'tasks-popover'});
    // Child navigation never replaces the main conversation or its scroll container.
    if(!panel.querySelector('#main-messages')) {
      panel.innerHTML=`<header class="assistant-tabbar"><div class="assistant-tabs" data-work-tabs><div class="assistant-tab" data-current="true"><button class="assistant-tab-main" data-action="main-chat">${icon('sparkles')}<span class="assistant-tab-title">${tx(['助理','Assistant'])}</span></button></div></div><span class="assistant-tabbar-actions">${mark}<button class="dock-window-action" data-action="minimize" aria-label="${tx(['收起助理','Minimize assistant'])}">${icon('chevron-down')}</button></span></header><div class="assistant-body"><div class="assistant-main"><div class="assistant-thread" id="main-messages" tabindex="0" role="log" aria-label="${tx(['助理主对话','Main assistant conversation'])}"></div></div></div>`;
      drawMessages('parent');
      const main=panel.querySelector('#main-messages');main.scrollTop=reading.get('parent')||0;
      main.addEventListener('scroll',()=>reading.set('parent',main.scrollTop),{passive:true});
    }
    const peek=document.getElementById('peek');peek.hidden=dialogOpen;
    peek.innerHTML=`<span>${tx(['个人助理','Personal assistant'])} · ${tx(['有进展，点开继续看','Updates available'])}</span>${btn(['展开对话','Open conversation'],'expand')}${mark}`;
    drawTaskFloat(); requestAnimationFrame(placeFloat);
  }
  function childDialog() {
    const id=selected,t=tasks[id];
    return `<section class="work-task-panel subtask-dialog" id="tasks-popover" role="region" aria-label="${esc(tx(t.name))}"><header class="subtask-float-head">${btn(t.parent?['返回上级子任务','Back to parent subtask']:['返回任务卡','Back to task card'],'parent',{icon:'chevron-left',iconOnly:true,variant:'ghost'})}<strong>${esc(tx(t.role))}</strong>${btn(['关闭','Close'],'close-float',{icon:'x',iconOnly:true,variant:'ghost'})}</header><div class="subtask-strip"><div class="source">${icon('git-branch')}<span>${esc(tx(tasks[t.parent||'parent'].name))}</span></div><div class="control">${['running','answer','approval'].includes(t.state) ? btn(['停止','Stop'],'stop') : t.state!=='unavailable' ? btn(['继续','Continue'],'continue') : ''}</div></div><div class="subtask-thread" id="message-list" tabindex="0" role="log" aria-label="${tx(['子任务对话','Subtask conversation'])}"></div><div class="latest-row" id="latest-row"></div><div class="child-composer" id="child-composer"></div></section>`;
  }
  function drawTaskFloat() {
    const root=document.getElementById('task-float'); if(!root)return;
    document.querySelectorAll('.work-task-mark').forEach(mark=>mark.setAttribute('aria-expanded',String(panelOpen)));
    unmountChild();
    root.hidden=!panelOpen;
    if(!panelOpen)return;
    if(panelMode==='conversation' && selected!=='parent') {
      root.innerHTML=childDialog();drawMessages();
      mountedChild=selected;childHandle=mountComposer(selected,document.getElementById('child-composer'));
      const scroller=document.getElementById('message-list');scroller.scrollTop=reading.get(selected)||0;
      const id=selected;scroller.addEventListener('scroll',()=>reading.set(id,scroller.scrollTop),{passive:true});
    } else if(panelMode==='list') {
      root.innerHTML=W.renderTaskPanel({id:'tasks-popover',live:[{id:'parent',title:tx(tasks.parent.name),ring:'running',step:tx(['邀请文案与体验核对正在推进','Invitation and experience checks underway']),serves:tx(['内测发布','Private beta'])}],returned:[]});
    } else {
      root.innerHTML=W.renderTaskCard({id:'parent',panel:'tasks-popover',title:tx(tasks.parent.name),owner:{name:tx(['助理','Assistant']),glyph:'sparkles',hue:'blue'},ring:'running',state:tx(['进行中','Working']),who:tx(['个人助理','Personal assistant']),serves:tx(['内测发布','Private beta']),returnsTo:tx(['助理主对话','Main assistant conversation']),steps:siblings.map(id=>({name:tx(tasks[id].name),at:tasks[id].state==='round-ended'?'done':'current',ring:tasks[id].state,who:tx(tasks[id].role)})),actions:btn(['回主对话','Main conversation'],'main-chat')});
      root.querySelectorAll('.work-task-step').forEach((step,i)=>{const button=document.createElement('button');button.type='button';button.className=step.className;button.dataset.step=step.dataset.step;button.dataset.task=siblings[i];button.setAttribute('aria-current',String(selected===siblings[i]));button.innerHTML=step.innerHTML+icon('chevron-right');step.replaceWith(button);});
    }
    placeFloat();
  }
  function placeFloat() {
    const panel=document.getElementById('assistant-panel'),float=document.getElementById('task-float');if(!panel||!float)return;
    if(!panel.hidden){panel.style.height='';const box=panel.getBoundingClientRect(),bar=document.getElementById('prototype').getBoundingClientRect();panel.style.height=Math.min(box.height,Math.max(180,box.bottom-bar.bottom-52))+'px';}
    const top=panel.hidden?-340:panel.offsetTop+(innerWidth<=1250?42:0);
    float.style.top=top+'px';float.style.setProperty('--panel-height',panel.clientHeight+'px');
    float.style.setProperty('--float-height',Math.max(180,panel.clientHeight-(innerWidth<=1250?42:0))+'px');
    document.getElementById('desktop').style.top=document.getElementById('prototype').getBoundingClientRect().height+'px';
  }

  function messageHtml(entry, id, index) {
    const [who, content] = entry;
    if (who === 'receipt') return `<div class="receipt" data-message="${index}">${esc(tx(content))}</div>`;
    return `<div class="assistant-round"><div class="assistant-msg assistant-msg--${who==='user'?'user':'assistant'}" data-message="${index}">${who==='assistant'?`<div class="message-meta"><strong>${esc(tx(tasks[id].role))}</strong></div>`:''}<p>${esc(tx(content))}</p></div></div>`;
  }
  function drawMessages(id = selected) {
    const list = document.getElementById(id==='parent'?'main-messages':'message-list'); if (!list) return;
    const t = tasks[id];
    if (id === 'parent') { list.innerHTML = messageHtml(['user',['帮我准备第一轮内测邀请。文案和首次体验一起看看。','Help prepare the first beta invitation. Review the copy and first-use experience together.']], id, 0) + t.messages.map((m,i)=>messageHtml(m,id,i+1)).join('') + `<button class="task-link" data-action="open-task">${ring('parent')}<span>${esc(tx(t.name))}</span><small>${tx(['看任务 · 3 步','View task · 3 steps'])}</small>${icon('chevron-right')}</button>`; return; }
    if (fault === 'unreadable') { list.innerHTML = K.renderAlert({ tone: 'warning', title: tx(['暂时读不到对话', 'The conversation could not load']), body: tx(['任务仍在原处。重试只重新读取，不会重新派出子任务。', 'The task is still here. Retry reads it again without starting work.']), actions: [{ label: tx(['重新读取', 'Retry reading']), variant: 'secondary', attrs: { 'data-action': 'reload' } }] }); return; }
    const history = fault === 'long' ? Array.from({ length: 30 }, (_, i) => ['assistant', [`第 ${i + 1} 项核对：保留已确认的内容，继续核对手机上的阅读与播放。`, `Check ${i + 1}: preserve the confirmed content and continue checking mobile reading and playback.`]]) : [];
    list.innerHTML = `<div><h2 class="subtask-title">${esc(tx(t.name))}</h2><p class="subtask-brief">${esc(tx(t.brief))}</p>${badge(id)}</div>` + [...history, ...t.messages].map((m,i) => messageHtml(m,id,i)).join('') + (t.process ? `<details class="process" data-process="${id}" ${expanded.has(id) ? 'open' : ''}><summary>${tx(['查看过程', 'View activity'])}</summary><p>${esc(tx(t.process))}</p></details>` : '') + (t.state === 'answer' ? `<section class="question"><h3>${tx(['首次收听先给哪段样例？', 'Which sample should play first?'])}</h3><p>${tx(['普通补充不会替你选；在这里回答后才继续。', 'An ordinary message does not answer this. Choose here to continue.'])}</p><div class="actions">${btn(['90 秒观点', '90-second perspective'], 'answer-short', { variant: 'primary' })}${btn(['完整访谈片段', 'Full interview excerpt'], 'answer-long')}</div></section>` : '') + (t.state === 'approval' ? `<section class="question"><h3>${tx(['允许访问内测发布页？', 'Allow access to the beta page?'])}</h3><p>${tx(['仅查看页面，不发布。聊天补充不会代替这次审查。', 'Read the page only; no publishing. A message does not approve this request.'])}</p><div class="actions">${btn(['允许这一次', 'Allow once'], 'approve', { variant: 'primary' })}${btn(['不允许', 'Deny'], 'deny')}</div></section>` : '') + (id === 'check' ? `<div class="section-label">${tx(['这一步的拆解', 'Steps within this task'])}</div>${row('mobile')}` : '');
    list.querySelectorAll('details').forEach(d => d.addEventListener('toggle', () => d.open ? expanded.add(id) : expanded.delete(id)));
  }
  function unmountChild() {
    const field=document.querySelector('#child-composer textarea');
    if(field&&mountedChild)localStorage.setItem(key+'draft:'+mountedChild,field.value);
    childHandle?.destroy();childHandle=undefined;mountedChild=undefined;
  }
  function navigate(id, focus = true) {
    if (!tasks[id]) return;
    unmountChild();selected=id;dialogOpen=true;panelOpen=true;panelMode=id==='parent'?'task':'conversation';tasks[id].unread=false;save();rememberView();
    drawCard();
    if(focus)document.querySelector(id==='parent'?'#task-float [data-task]':'#task-float [data-action=parent]')?.focus();
  }
  function adapter(id) {
    if (!drafts.has(id)) drafts.set(id, { read: async () => localStorage.getItem(key + 'draft:' + id) || '', write: async text => localStorage.setItem(key + 'draft:' + id, text) });
    return drafts.get(id);
  }
  function mountComposer(id, root) {
    const t=tasks[id];
    const instance=window.molisComposerProgram(root, {
      kind: 'ai', entry: 'subtask-prototype-58', labels: { ...window.prototypeLabels(lang), input: tx(id === 'parent' ? ['给个人助理发消息', 'Message your assistant'] : ['直接给这一步补充要求', 'Add instructions to this step']) },
      sources: false, draft: { adapter: adapter(id) },
      receiver: () => ({ label: tx(t.role), detail: tx(id==='parent'?['主助理','Main assistant']:t.name) }),
      notice: () => ['stopped','failed','interrupted','unavailable'].includes(t.state) ? { text: tx(t.state === 'unavailable' ? ['已收回，无法向原执行者发送。', 'Reassigned; the former owner cannot receive messages.'] : ['继续会开始新尝试；对话和草稿已保留。', 'Continue starts a new attempt. History and draft are kept.']) } : null,
      required: () => ['stopped','failed','interrupted','unavailable'].includes(t.state) ? tx(['当前不能发送', 'Sending is not available']) : null,
      delivery: () => ({ 'next-boundary': { available: true }, interrupt: { available: false, reason: tx(['此样稿只演示下一边界补充', 'This prototype demonstrates delivery at the next boundary']) }, 'after-run': { available: true } }),
      submit: async input => {
        // The closure freezes id. Switching the visible task does not change this request's destination.
        const sentFault=id==='parent'?'normal':fault;
        await new Promise(resolve => setTimeout(resolve, 900));
        if (sentFault === 'failed') return { state: 'failed', message: tx(['没有送达。文字已保留，可恢复正常后重试。', 'Not delivered. Your text is kept; retry after restoring the connection.']) };
        if (t.state === 'unavailable' || t.state === 'stopped') return { state: 'failed', message: tx(['任务状态已改变，消息未投递。', 'The task changed state. Your message was not delivered.']) };
        const accept = () => {
          if (pending.has(input.request_id)) return;
          pending.set(input.request_id, id);
          t.messages.push(['user', [input.text, input.text]], ['receipt', ['已接收 · 等待下一次处理', 'Received · waiting for the next processing boundary']]);
          if (t.state === 'round-ended') { t.attempt = (t.attempt || 1) + 1; t.state = 'running'; }
          save(); updateVisible(id);
          setTimeout(() => {
            if (!['running','answer','approval'].includes(t.state)) return;
            t.messages.push(['assistant', [t.state === 'answer' ? '补充已记下。上面的样例选择仍需要你回答，普通消息不会替你做选择。' : t.state === 'approval' ? '补充已记下。访问请求仍在等你审查，我还没有打开页面。' : id==='parent' ? '收到，我会在主任务里处理这条补充，继续汇总各步骤的进展。' : '收到。我会按这条补充继续，保留此前的结果；有影响整体任务的变化会回报给父任务。', t.state === 'answer' ? 'Your note is recorded. The sample choice above still needs your answer.' : t.state === 'approval' ? 'Your note is recorded. Page access still awaits approval; I have not opened it.' : id==='parent' ? 'Understood. I’ll handle this in the main task and keep collecting progress from each step.' : 'Understood. I’ll use this instruction, preserve earlier results, and report relevant changes to the parent task.']]);
            tasks.parent.unread = true; save(); updateVisible(id);
          }, 1600);
        };
        if (sentFault === 'unknown') return { state: 'unknown', check: async () => { accept(); return 'sent'; } };
        accept(); return { state: 'sent' };
      }
    });
    instance.setRunning(['running','answer','approval'].includes(t.state));
    if (['stopped','failed','interrupted','unavailable'].includes(t.state)) instance.hold(tx(['当前不能发送，已保留草稿', 'Sending is unavailable; your draft is kept']));
    return instance;
  }
  function updateVisible(id) {
    if(id!==selected && id!=='parent') { tasks[id].unread=true;save();if(panelMode!=='conversation')drawTaskFloat();return; }
    const list=document.getElementById(id==='parent'?'main-messages':'message-list');if(!list)return;
    const y=list.scrollTop,bottom=list.scrollHeight-y-list.clientHeight<45;
    drawMessages(id);list.scrollTop=bottom?list.scrollHeight:y;
    if(id!=='parent')document.getElementById('latest-row').innerHTML=bottom?'':btn(['有新消息 ↓','New message ↓'],'latest');
  }
  function closeFloat() {
    if(selected!=='parent')navigate('parent',false);
    panelOpen=false;drawTaskFloat();document.querySelector('#assistant-panel .work-task-mark')?.focus();
  }
  document.addEventListener('click', event => {
    if(event.target.closest('.work-task-mark')){if(panelOpen)return closeFloat();panelOpen=true;panelMode='list';drawTaskFloat();return;}
    if(event.target.closest('[data-task-panel-close]'))return closeFloat();
    if(event.target.closest('[data-task-panel-list]')){panelMode='list';drawTaskFloat();return;}
    if(event.target.closest('[data-task-open]')){panelMode='task';drawTaskFloat();return;}
    if(event.target.closest('[data-work-line-head]')||event.target.closest('.work-event')){panelOpen=true;panelMode='task';dialogOpen=true;drawCard();return;}
    const task = event.target.closest('[data-task]'); if (task) return navigate(task.dataset.task);
    const action = event.target.closest('[data-action]')?.dataset.action; if (!action) return;
    const t = tasks[selected];
    if(action==='open-task')return navigate('parent');
    if(action==='main-chat'||action==='close-float')return closeFloat();
    if(action==='minimize'){closeFloat();dialogOpen=false;return drawCard();}
    if(action==='expand'){dialogOpen=true;return drawCard();}
    if (action === 'parent') return navigate(t.parent || 'parent');
    if (action === 'previous' || action === 'next') return navigate(siblings[siblings.indexOf(selected) + (action === 'next' ? 1 : -1)]);
    if (action === 'language') { lang = lang === 'zh' ? 'en' : 'zh'; return frame(); }
    if (action === 'theme') { theme = theme === 'light' ? 'dark' : 'light'; return frame(); }
    if (action === 'reset') { Object.keys(localStorage).filter(k => k.startsWith(key)).forEach(k => localStorage.removeItem(k)); location.href = location.pathname + '?panel=task&lang=' + lang + '&theme=' + theme; return; }
    if (action === 'background') { const id = selected === 'research' ? 'copy' : 'research'; tasks[id].messages.push(['assistant', ['补充核对完成，已把新的来源附在原结果后。', 'An additional check is complete; the source is attached to the earlier result.']]); return updateVisible(id); }
    if (action === 'latest') { const list = document.getElementById('message-list'); list.scrollTop = list.scrollHeight; document.getElementById('latest-row').innerHTML = ''; return; }
    if (action === 'reload') { fault = 'normal'; prototypeBar(); return drawMessages(); }
    if (action === 'stop') { t.state='stopped';save();drawCard();return; }
    if (action === 'continue') { t.attempt = (t.attempt || 1) + 1; t.state = 'running'; t.messages.push(['receipt', ['已开始新尝试 · 旧结果仍保留', 'New attempt started · previous results preserved']]); save(); drawCard(); return; }
    if (action.startsWith('answer-') || action === 'approve' || action === 'deny') {
      t.messages.push(['user', action === 'answer-short' ? ['选择 90 秒观点。', 'Use the 90-second perspective.'] : action === 'answer-long' ? ['选择完整访谈片段。', 'Use the full interview excerpt.'] : action === 'approve' ? ['允许这一次访问。', 'Allow this access once.'] : ['不允许访问。', 'Deny access.']]);
      t.state = action === 'deny' ? 'stopped' : 'running'; save(); drawCard();
    }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'fault') {
      fault = event.target.value;
      if (selected === 'parent') navigate('copy', false);
      if (fault === 'revoked') tasks[selected].state = 'unavailable';
      if (fault === 'interrupted') tasks[selected].state = 'interrupted';
      if (fault === 'approval') tasks[selected].state = 'approval';
      if (fault === 'normal') tasks[selected].state = base[selected].state;
      drawCard();
    }
  });
  document.addEventListener('keydown', event => {
    if(event.defaultPrevented||event.isComposing)return;
    if(event.key==='Escape'&&panelOpen){closeFloat();event.preventDefault();}
  });
  document.getElementById('icons').innerHTML = window.mwKitSprite;
  const client = document.createElement('script'); client.textContent = window.mwKitClient; document.body.appendChild(client);
  window.addEventListener('resize', placeFloat);
  frame();
})();
