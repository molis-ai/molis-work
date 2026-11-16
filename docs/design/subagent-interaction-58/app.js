/* Demonstration only: task facts, replies and transport outcomes are simulated here. */
(() => {
  const K = window.mwKit, esc = K.escapeHtml;
  const query = new URLSearchParams(location.search);
  let lang = query.get('lang') === 'en' ? 'en' : 'zh';
  let scheme = query.get('scheme') === 'B' ? 'B' : 'A';
  let theme = query.get('theme') === 'dark' ? 'dark' : 'light';
  let selected = query.get('task') || 'parent', fault = 'normal', handle;
  const tx = pair => pair[lang === 'en' ? 1 : 0];
  const key = 'molis-prototype-58:';
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
  const stateLabels = {
    running: ['进行中', 'Working'], answer: ['等你回答', 'Needs your answer'], 'round-ended': ['本轮结束', 'Round ended'],
    failed: ['未完成', 'Could not finish'], stopped: ['已停止', 'Stopped'], interrupted: ['已中断', 'Interrupted'],
    unavailable: ['已收回', 'Reassigned'], approval: ['等你审查', 'Needs approval']
  };
  const status = id => stateLabels[tasks[id].state] || stateLabels.running;
  const save = () => localStorage.setItem(key + 'state', JSON.stringify(tasks));
  function rememberView() { const url = new URL(location.href); for (const [k,v] of Object.entries({ task: selected, scheme, lang, theme })) url.searchParams.set(k,v); history.replaceState(null,'',url); }
  const btn = (label, action, options = {}) => K.renderButton({ label: tx(label), variant: 'secondary', size: 'sm', attrs: { 'data-action': action }, ...options });
  const ring = id => K.renderStateRing({ state: tasks[id].state, label: tx(status(id)) });
  const badge = id => K.renderBadge({ label: tx(status(id)), tone: ['failed', 'answer', 'approval'].includes(tasks[id].state) ? 'warning' : 'neutral' });
  const icon = name => K.icon(name);

  function prototypeBar() {
    const option = (v, label, current) => `<option value="${v}" ${v === current ? 'selected' : ''}>${esc(tx(label))}</option>`;
    document.getElementById('prototype').innerHTML = `<b>${tx(['58 · 子任务对话样稿', '58 · Subtask conversation prototype'])}</b>
      <label>${tx(['布局', 'Layout'])}<select id="scheme">${option('A', ['A 同卡聚焦', 'A Focus in card'], scheme)}${option('B', ['B 拆解常驻', 'B Keep step list'], scheme)}</select></label>
      <label><select id="fault" aria-label="${tx(['演示状态', 'Demo state'])}">${Object.entries({ normal: ['正常', 'Normal'], failed: ['发送失败', 'Send fails'], unknown: ['发送结果未知', 'Send outcome unknown'], unreadable: ['读取失败', 'Read fails'], revoked: ['子任务已收回', 'Subtask reassigned'], interrupted: ['重启后中断', 'Interrupted after restart'], approval: ['等待审批', 'Awaiting approval'], long: ['长对话', 'Long conversation'] }).map(([v,l]) => option(v,l,fault)).join('')}</select></label>
      ${btn(['后台来一条更新', 'Background update'], 'background')}
      ${btn(lang === 'zh' ? ['EN', 'EN'] : ['中文', '中文'], 'language')}
      ${btn(theme === 'light' ? ['深色', 'Dark'] : ['浅色', 'Light'], 'theme')}
      ${btn(['重置演示', 'Reset demo'], 'reset', { variant: 'ghost' })}`;
  }
  function frame() {
    rememberView();
    document.documentElement.lang = lang;
    document.documentElement.dataset.resolvedTheme = theme;
    document.documentElement.dataset.theme = theme;
    prototypeBar();
    document.getElementById('workspace-nav').innerHTML = `<div class="brand">molis work</div><div class="nav-item">${icon('home')} ${tx(['今天', 'Today'])}</div><div class="nav-item current">${icon('message')} ${tx(['助理', 'Assistant'])}</div><div class="nav-project">${tx(['当前项目', 'Current project'])}</div><div class="nav-item">${icon('folder')} ${tx(['墨问西东', 'Mowen'])}</div>`;
    document.getElementById('stage-header').innerHTML = `<h1>${tx(['墨问西东', 'Mowen'])}</h1><span>${tx(['演示数据 · 不调用模型', 'Demo data · no model calls'])}</span>`;
    document.getElementById('intro').innerHTML = `<div class="speaker">${icon('message')} ${tx(['个人助理', 'Personal assistant'])}</div><p>${tx(['邀请文案和体验核对都在推进。需要你决定的一项，已放进任务卡。', 'The invitation and experience checks are moving along. One step needs your decision.'])}</p>`;
    drawCard(); mountComposer();
  }
  function row(id) {
    const t = tasks[id];
    return `<button class="task-row" data-task="${id}" aria-current="${selected === id}">${ring(id)}<span><strong>${esc(tx(t.name))}</strong><small>${esc(tx(t.role))}${t.attempt ? ` · ${tx(['第', 'Attempt '])}${t.attempt}${tx(['次', ''])}` : ''}</small></span><span class="trailing">${t.unread ? K.renderBadge({ label: tx(['有更新', 'Updated']), tone: 'info' }) : badge(id)}${icon('chevron-right')}</span></button>`;
  }
  function heading(id) { return `<div class="card-heading">${ring(id)}<div class="heading-copy"><h2>${esc(tx(tasks[id].name))}</h2><p>${esc(tx(tasks[id].brief))}</p></div></div>`; }
  function drawCard() {
    const card = document.getElementById('task-card');
    if (selected === 'parent') {
      card.innerHTML = `${heading('parent')}<div class="task-summary"><p>${esc(tx(tasks.parent.messages[0][1]))}</p>${badge('parent')}</div><div class="section-label"><span>${tx(['任务拆解', 'Steps'])}</span><span>${tx(['3 个步骤', '3 steps'])}</span></div>${siblings.map(row).join('')}`;
      return;
    }
    const id = selected, t = tasks[id], list = t.parent ? ['mobile'] : siblings, index = list.indexOf(id);
    card.innerHTML = `<div class="child-toolbar">${btn(t.parent ? ['返回体验核对', 'Back to experience check'] : ['返回父任务', 'Back to parent task'], 'parent', { icon: 'chevron-left', variant: 'ghost' })}<div class="siblings">${btn(['上一个', 'Previous'], 'previous', { icon: 'chevron-left', iconOnly: true, disabled: index === 0 })}<span class="count">${index + 1} / ${list.length}</span>${btn(['下一个', 'Next'], 'next', { icon: 'chevron-right', iconOnly: true, disabled: index === list.length - 1 })}</div></div>
      <div class="child-body ${scheme === 'B' ? 'split' : ''}">${scheme === 'B' ? `<nav class="task-index" aria-label="${tx(['同级步骤', 'Sibling steps'])}">${list.map(row).join('')}</nav>` : ''}
      <div class="conversation">${heading(id)}<div class="conversation-head">${badge(id)}<span class="message-meta">${esc(tx(t.role))}${t.attempt ? ` · ${tx(['第', 'Attempt '])}${t.attempt}${tx(['次尝试', ''])}` : ''}</span><div class="control">${['running','answer','approval'].includes(t.state) ? btn(['停止', 'Stop'], 'stop') : t.state !== 'unavailable' ? btn(['继续此子任务', 'Continue subtask'], 'continue') : ''}</div></div>
      <div class="local-feedback" id="local-feedback">${['stopped','failed','interrupted'].includes(t.state) ? K.renderAlert({ tone: 'warning', title: tx(t.state === 'stopped' ? ['子任务已停止', 'This subtask is stopped'] : t.state === 'interrupted' ? ['上次执行已中断', 'The last attempt was interrupted'] : ['这次没有完成', 'This attempt did not finish']), body: tx(['此前的对话和结果仍保留。选择「继续此子任务」会开始一次新的尝试。', 'Earlier messages and results are preserved. Continue subtask starts a new attempt.']) }) : t.state === 'unavailable' ? K.renderAlert({ tone: 'warning', title: tx(['这一步已交给其他执行者', 'This step has been reassigned']), body: tx(['这里可以查看原对话。请返回父任务，找到现在负责这一步的对象。', 'You can read this conversation. Return to the parent task to find the current owner.']) }) : ''}</div>
      <div class="message-list" id="message-list" tabindex="0" aria-label="${tx(['子任务对话', 'Subtask conversation'])}"></div><div class="latest-row" id="latest-row"></div></div></div>`;
    drawMessages();
    const scroller = document.getElementById('message-list');
    scroller.scrollTop = reading.get(id) || 0;
    scroller.addEventListener('scroll', () => reading.set(id, scroller.scrollTop), { passive: true });
  }
  function messageHtml(entry, id, index) {
    const [who, content] = entry;
    const name = who === 'user' ? ['你', 'You'] : who === 'receipt' ? ['', ''] : tasks[id].role;
    return `<article class="message ${who}" data-message="${index}">${who !== 'receipt' ? `<div class="message-meta"><strong>${esc(tx(name))}</strong><span>${tx(['刚刚', 'Just now'])}</span></div>` : ''}<p>${esc(tx(content))}</p></article>`;
  }
  function drawMessages() {
    const list = document.getElementById('message-list'); if (!list) return;
    const id = selected, t = tasks[id];
    if (fault === 'unreadable') { list.innerHTML = K.renderAlert({ tone: 'warning', title: tx(['暂时读不到对话', 'The conversation could not load']), body: tx(['任务仍在原处。重试只重新读取，不会重新派出子任务。', 'The task is still here. Retry reads it again without starting work.']), actions: [{ label: tx(['重新读取', 'Retry reading']), variant: 'secondary', attrs: { 'data-action': 'reload' } }] }); return; }
    const history = fault === 'long' ? Array.from({ length: 30 }, (_, i) => ['assistant', [`第 ${i + 1} 项核对：保留已确认的内容，继续核对手机上的阅读与播放。`, `Check ${i + 1}: preserve the confirmed content and continue checking mobile reading and playback.`]]) : [];
    list.innerHTML = [...history, ...t.messages].map((m,i) => messageHtml(m,id,i)).join('') + (t.process ? `<details class="process" data-process="${id}" ${expanded.has(id) ? 'open' : ''}><summary>${tx(['查看过程', 'View activity'])}</summary><p>${esc(tx(t.process))}</p></details>` : '') + (t.state === 'answer' ? `<section class="question"><h3>${tx(['首次收听先给哪段样例？', 'Which sample should play first?'])}</h3><p>${tx(['普通补充不会替你选；在这里回答后才继续。', 'An ordinary message does not answer this. Choose here to continue.'])}</p><div class="actions">${btn(['90 秒观点', '90-second perspective'], 'answer-short', { variant: 'primary' })}${btn(['完整访谈片段', 'Full interview excerpt'], 'answer-long')}</div></section>` : '') + (t.state === 'approval' ? `<section class="question"><h3>${tx(['允许访问内测发布页？', 'Allow access to the beta page?'])}</h3><p>${tx(['仅查看页面，不发布。聊天补充不会代替这次审查。', 'Read the page only; no publishing. A message does not approve this request.'])}</p><div class="actions">${btn(['允许这一次', 'Allow once'], 'approve', { variant: 'primary' })}${btn(['不允许', 'Deny'], 'deny')}</div></section>` : '') + (id === 'check' ? `<div class="section-label">${tx(['这一步的拆解', 'Steps within this task'])}</div>${row('mobile')}` : '');
    list.querySelectorAll('details').forEach(d => d.addEventListener('toggle', () => d.open ? expanded.add(id) : expanded.delete(id)));
  }
  function navigate(id, focus = true) {
    if (!tasks[id]) return;
    const field = document.querySelector('#composer textarea');
    if (field) localStorage.setItem(key + 'draft:' + selected, field.value);
    handle?.destroy(); selected = id; tasks[id].unread = false; save(); rememberView();
    drawCard(); mountComposer();
    if (focus) document.querySelector(id === 'parent' ? `[data-task="${siblings[0]}"]` : '[data-action="parent"]')?.focus();
  }
  function adapter(id) {
    if (!drafts.has(id)) drafts.set(id, { read: async () => localStorage.getItem(key + 'draft:' + id) || '', write: async text => localStorage.setItem(key + 'draft:' + id, text) });
    return drafts.get(id);
  }
  function mountComposer() {
    handle?.destroy();
    const id = selected, t = tasks[id];
    handle = window.molisComposerProgram(document.getElementById('composer'), {
      kind: 'ai', entry: 'subtask-prototype-58', labels: { ...window.prototypeLabels(lang), input: tx(id === 'parent' ? ['给个人助理发消息', 'Message your assistant'] : ['直接给这一步补充要求', 'Add instructions to this step']) },
      sources: false, draft: { adapter: adapter(id) },
      receiver: () => ({ label: tx(id === 'parent' ? t.role : t.name), detail: tx(id === 'parent' ? ['父任务', 'Parent task'] : ['子任务', 'Subtask']), others: ['parent', ...siblings].filter(k => k !== id).map(k => ({ id: k, label: tx(tasks[k].name), detail: tx(tasks[k].role) })), choose: next => navigate(next), open: () => navigate(id) }),
      notice: () => ['stopped','failed','interrupted','unavailable'].includes(t.state) ? { text: tx(t.state === 'unavailable' ? ['已收回，无法向原执行者发送。', 'Reassigned; the former owner cannot receive messages.'] : ['先继续此子任务，再发送补充。', 'Continue this subtask before sending.']) } : null,
      required: () => ['stopped','failed','interrupted','unavailable'].includes(t.state) ? tx(['当前不能发送', 'Sending is not available']) : null,
      delivery: () => ({ 'next-boundary': { available: true }, interrupt: { available: false, reason: tx(['此样稿只演示下一边界补充', 'This prototype demonstrates delivery at the next boundary']) }, 'after-run': { available: true } }),
      submit: async input => {
        // The closure freezes id. Switching the visible task does not change this request's destination.
        const sentFault = fault;
        await new Promise(resolve => setTimeout(resolve, 900));
        if (sentFault === 'failed') return { state: 'failed', message: tx(['没有送达。文字已保留，可恢复正常后重试。', 'Not delivered. Your text is kept; retry after restoring the connection.']) };
        if (t.state === 'unavailable' || t.state === 'stopped') return { state: 'failed', message: tx(['任务状态已改变，消息未投递。', 'The task changed state. Your message was not delivered.']) };
        const accept = () => {
          if (pending.has(input.request_id)) return;
          pending.set(input.request_id, id);
          t.messages.push(['user', [input.text, input.text]], ['receipt', ['已接收 · 等待子任务下一次处理', 'Received · waiting for the subtask’s next processing boundary']]);
          if (t.state === 'round-ended') { t.attempt = (t.attempt || 1) + 1; t.state = 'running'; }
          save(); updateVisible(id);
          setTimeout(() => {
            if (!['running','answer','approval'].includes(t.state)) return;
            t.messages.push(['assistant', [t.state === 'answer' ? '补充已记下。上面的样例选择仍需要你回答，普通消息不会替你做选择。' : t.state === 'approval' ? '补充已记下。访问请求仍在等你审查，我还没有打开页面。' : '收到。我会按这条补充继续，保留此前的结果；有影响整体任务的变化会回报给父任务。', t.state === 'answer' ? 'Your note is recorded. The sample choice above still needs your answer.' : t.state === 'approval' ? 'Your note is recorded. Page access still awaits approval; I have not opened it.' : 'Understood. I’ll use this instruction, preserve earlier results, and report relevant changes to the parent task.']]);
            tasks.parent.unread = true; save(); updateVisible(id);
          }, 1600);
        };
        if (sentFault === 'unknown') return { state: 'unknown', check: async () => { accept(); return 'sent'; } };
        accept(); return { state: 'sent' };
      }
    });
    handle.setRunning(['running','answer','approval'].includes(t.state));
    if (['stopped','failed','interrupted','unavailable'].includes(t.state)) handle.hold(tx(['当前不能发送，已保留草稿', 'Sending is unavailable; your draft is kept']));
  }
  function updateVisible(id) {
    if (selected !== id) { tasks[id].unread = true; save(); if (selected === 'parent') drawCard(); else if (scheme === 'B') document.querySelector('.task-index')?.replaceChildren(...new DOMParser().parseFromString(siblings.map(row).join(''), 'text/html').body.childNodes); return; }
    const list = document.getElementById('message-list'); if (!list) return;
    const y = list.scrollTop, bottom = list.scrollHeight - y - list.clientHeight < 45;
    drawMessages(); list.scrollTop = bottom ? list.scrollHeight : y;
    document.getElementById('latest-row').innerHTML = bottom ? '' : btn(['有新消息 ↓', 'New message ↓'], 'latest');
  }
  document.addEventListener('click', event => {
    const task = event.target.closest('[data-task]'); if (task) return navigate(task.dataset.task);
    const action = event.target.closest('[data-action]')?.dataset.action; if (!action) return;
    const t = tasks[selected];
    if (action === 'parent') return navigate(t.parent || 'parent');
    if (action === 'previous' || action === 'next') return navigate(siblings[siblings.indexOf(selected) + (action === 'next' ? 1 : -1)]);
    if (action === 'language') { lang = lang === 'zh' ? 'en' : 'zh'; return frame(); }
    if (action === 'theme') { theme = theme === 'light' ? 'dark' : 'light'; return frame(); }
    if (action === 'reset') { Object.keys(localStorage).filter(k => k.startsWith(key)).forEach(k => localStorage.removeItem(k)); location.href = location.pathname + '?scheme=' + scheme + '&lang=' + lang + '&theme=' + theme; return; }
    if (action === 'background') { const id = selected === 'research' ? 'copy' : 'research'; tasks[id].messages.push(['assistant', ['补充核对完成，已把新的来源附在原结果后。', 'An additional check is complete; the source is attached to the earlier result.']]); return updateVisible(id); }
    if (action === 'latest') { const list = document.getElementById('message-list'); list.scrollTop = list.scrollHeight; document.getElementById('latest-row').innerHTML = ''; return; }
    if (action === 'reload') { fault = 'normal'; prototypeBar(); return drawMessages(); }
    if (action === 'stop') { t.state = 'stopped'; save(); drawCard(); handle.setRunning(false); handle.hold(tx(['已停止；先继续此子任务，再发送', 'Stopped; continue this subtask before sending'])); return; }
    if (action === 'continue') { t.attempt = (t.attempt || 1) + 1; t.state = 'running'; t.messages.push(['receipt', ['已开始新尝试 · 旧结果仍保留', 'New attempt started · previous results preserved']]); save(); drawCard(); mountComposer(); return; }
    if (action.startsWith('answer-') || action === 'approve' || action === 'deny') {
      t.messages.push(['user', action === 'answer-short' ? ['选择 90 秒观点。', 'Use the 90-second perspective.'] : action === 'answer-long' ? ['选择完整访谈片段。', 'Use the full interview excerpt.'] : action === 'approve' ? ['允许这一次访问。', 'Allow this access once.'] : ['不允许访问。', 'Deny access.']]);
      t.state = action === 'deny' ? 'stopped' : 'running'; save(); drawCard(); mountComposer();
    }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'scheme') { scheme = event.target.value; rememberView(); return drawCard(); }
    if (event.target.id === 'fault') {
      fault = event.target.value;
      if (selected === 'parent') navigate('copy', false);
      if (fault === 'revoked') tasks[selected].state = 'unavailable';
      if (fault === 'interrupted') tasks[selected].state = 'interrupted';
      if (fault === 'approval') tasks[selected].state = 'approval';
      if (fault === 'normal') tasks[selected].state = base[selected].state;
      drawCard(); mountComposer();
    }
  });
  document.getElementById('icons').innerHTML = window.mwKitSprite;
  const client = document.createElement('script'); client.textContent = window.mwKitClient; document.body.appendChild(client);
  frame();
})();
