/* Interaction specimen only. No microphone, network, model, Host, or persistent draft access. */
(() => {
  const $ = (s) => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const en = params.get('lang') === 'en';
  const layout = params.get('layout') === 'B' ? 'B' : 'A';
  const scenario = params.get('scenario') || 'idle';
  const t = (zh, english) => en ? english : zh;
  const { renderComposer, COMPOSER_STYLES } = window.voicePreviewParts;
  const { renderButton, icon, escapeHtml: esc } = window.mwKit;
  const style = document.createElement('style');
  style.textContent = COMPOSER_STYLES;
  document.head.insertBefore(style, document.querySelector('link[href="preview.css"]'));
  document.documentElement.lang = en ? 'en' : 'zh-CN';
  document.documentElement.dataset.resolvedTheme = params.get('theme') || 'light';
  $('#icons').innerHTML = window.mwKitSprite;
  const names = { coding: 'Coding', assistant: t('助理', 'Assistant'), home: t('新工作', 'New work') };
  const glyphs = { coding: 'code', assistant: 'message', home: 'home' };
  const drafts = { coding: '', assistant: '', home: '' };
  let target = 'coding', phase = 'idle', voice = null, prepared = true;
  let clock = null, pending = null, generation = 0, progress = 0, seconds = 6, notice = '';
  let input, composer, panel = $('#voice-panel');
  const sentence = t('先把录音流程理清楚，再一起确认体验。', 'Let’s work through the recording flow, then review the experience together.');
  const busy = () => ['recording', 'limit', 'transcribing'].includes(phase);
  const speak = (message) => { $('#sr').textContent = message; };
  const button = (label, action, variant = 'ghost', glyph) => renderButton({ label, variant,
    size: glyph ? 'icon' : 'sm', ...(glyph ? { icon: glyph, iconOnly: true } : {}),
    attrs: { 'data-action': action, title: label } });
  function cancelTimers() { clearInterval(clock); clearTimeout(pending); clock = null; pending = null; generation++; }
  function fit() {
    composer.toggleAttribute('data-rest', !input.value && phase === 'idle' && !notice);
    input.style.height = '0px';
    input.style.height = Math.min(Math.max(input.scrollHeight, 22), Math.min(240, innerHeight * .36)) + 'px';
    $('[data-composer-send]').disabled = !input.value.trim() || busy();
  }
  function mount() {
    panel.remove();
    $('#composer').innerHTML = renderComposer({ kind: 'ai', voice: t('语音输入', 'Voice input'),
      text: drafts[target], placeholder: t('说说你想做什么…', 'What would you like to do?'),
      receiver: { label: names[target], icon: glyphs[target], open: true },
      labels: { input: t('发给 ', 'Message to ') + names[target], send: t('发送', 'Send'),
        sendTitle: t('发送（⌘ / Ctrl + 回车）', 'Send (⌘ / Ctrl + Enter)'), add: t('添加资料', 'Add sources'), more: t('更多', 'More'), to: t('发给：', 'To:') } });
    composer = $('.mw-composer'); input = $('.mw-composer__input');
    if (layout === 'A') $('.mw-composer__box').insertBefore(panel, $('.mw-composer__foot'));
    else $('#input-column').prepend(panel);
    const mic = $('[data-composer-voice]'); mic.removeAttribute('aria-disabled');
    mic.onclick = () => prepared ? record() : setPhase('first');
    $('[data-composer-receiver]').onclick = () => { $('#receiver-menu').hidden = !$('#receiver-menu').hidden; };
    $('[data-composer-add]').onclick = () => {
      const menu = $('[data-compose-menu]'); menu.hidden = !menu.hidden;
      menu.innerHTML = `<p class="notice">${t('此定样只演示语音；资料入口沿用现行组件。', 'This specimen covers voice. Sources use the existing component.')}</p>`;
    };
    $('[data-composer-send]').onclick = send;
    input.addEventListener('input', () => { drafts[target] = input.value; notice = ''; fit(); });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault(); send();
      }
    });
    renderPanel(); renderPage();
  }
  function send() {
    if (busy() || !input.value.trim()) return;
    const text = input.value; drafts[target] = ''; input.value = '';
    $('#bubble').textContent = text;
    $('#reply').textContent = t('模拟发送完成。此预览没有连接模型。', 'Simulated send complete. No model is connected to this specimen.');
    notice = ''; fit(); speak(t('已模拟发送', 'Simulated send complete'));
  }
  function changeTarget(next) {
    drafts[target] = input.value; target = next; $('#receiver-menu').hidden = true; mount();
  }
  function renderPage() {
    $('#mock-label').textContent = t('交互模拟 · 不录音', 'Prototype · no audio capture');
    $('#side-toggle').textContent = t('侧栏', 'Side panel');
    $('#project-label').textContent = t('项目', 'Project'); $('#project-name').textContent = t('产品工作室', 'Product studio');
    $('#crumb').textContent = names[target];
    $('#title').textContent = t('把想法变成下一步', 'Turn an idea into a next step');
    $('#intro').textContent = t('今天，先把最重要的一件事做好。', 'Today, focus on one thing that matters.');
    $('#bubble').textContent = t('帮我整理一下新用户第一次使用的流程。', 'Help me map the experience for someone using the app for the first time.');
    $('#reply').textContent = t('可以从一个小任务开始：写下想做的事，补充上下文，然后确认下一步。', 'Start with a small task: describe what you want to do, add context, then choose the next step.');
    $('#task-name').textContent = t('初次使用流程', 'First-use experience');
    $('#task-note').textContent = t('整理好后，我们一起看。', 'We’ll review it together when it’s ready.');
    $('#body-note').textContent = t('在下方继续补充想法。', 'Continue with your thoughts below.');
    $('#dock-icon').innerHTML = icon(glyphs[target]); $('#dock-name').textContent = names[target];
    $('#side-title').textContent = t('资料', 'Sources');
    $('#side-note').textContent = t('打开侧栏后，继续检查录音操作是否完整可见。', 'Check that recording controls remain reachable with this panel open.');
    $('#destinations').innerHTML = Object.entries(names).map(([id, label]) => `<button data-target="${id}" aria-current="${id === target}">${icon(glyphs[id])}${esc(label)}</button>`).join('');
    $('#receiver-menu').innerHTML = Object.entries(names).map(([id, label]) => `<button data-target="${id}">${esc(label)}</button>`).join('');
    document.querySelectorAll('[data-target]').forEach(b => b.onclick = () => changeTarget(b.dataset.target));
  }
  function setPhase(next) { phase = next; renderPanel(); speak(panel.innerText); }
  function record() {
    cancelTimers(); notice = ''; seconds = 0;
    voice = { owner: target, original: input.value, start: input.selectionStart, end: input.selectionEnd };
    setPhase('recording');
    clock = setInterval(() => { seconds++; const elapsed = $('.elapsed'); if (elapsed) elapsed.textContent = elapsedTime(); }, 1000);
  }
  function elapsedTime() { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
  function stop() {
    cancelTimers(); setPhase('transcribing');
    const ticket = generation;
    pending = setTimeout(() => { if (ticket === generation && phase === 'transcribing') finish(); }, 3200);
  }
  function discard() {
    cancelTimers(); voice = null; notice = t('录音已丢弃，原有文字保留。', 'Recording discarded. Your draft is unchanged.'); setPhase('idle');
    $('[data-composer-voice]').focus();
  }
  function finish() {
    cancelTimers(); if (!voice) return;
    if (drafts[voice.owner] !== voice.original) { setPhase('confirm'); return; }
    const original = voice.original;
    drafts[voice.owner] = original.slice(0, voice.start) + sentence + original.slice(voice.end);
    if (target !== voice.owner) { setPhase('returned'); return; }
    input.value = drafts[target]; notice = ''; voice = null; setPhase('idle');
    input.focus(); speak(t('文字已加入草稿，尚未发送。', 'Text added to your draft. It has not been sent.'));
  }
  function download() {
    cancelTimers(); progress = 0; setPhase('downloading');
    clock = setInterval(() => {
      progress += 20;
      if (progress >= 100) {
        cancelTimers(); setPhase('preparing'); const ticket = generation;
        pending = setTimeout(() => { if (ticket === generation) { prepared = true; setPhase('ready'); } }, 1500);
      } else {
        $('.progress>i').style.width = progress + '%'; $('.download-percent').textContent = progress + '%';
      }
    }, 350);
  }
  function card(title, detail, actions = '', extra = '') {
    return `<h2>${esc(title)}</h2><p>${esc(detail)}</p>${extra}${actions ? `<div class="actions">${actions}</div>` : ''}`;
  }
  function renderPanel() {
    panel.className = 'voice-ui'; panel.dataset.layout = layout; panel.dataset.phase = phase;
    panel.setAttribute('aria-label', t('语音状态', 'Voice status')); panel.hidden = phase === 'idle' && !notice;
    $('[data-composer-voice]').hidden = phase !== 'idle';
    let html = '';
    const drop = button(t('丢弃录音', 'Discard recording'), 'discard', 'ghost', 'x');
    const wave = '<span class="wave" aria-hidden="true">' + [9, 18, 12, 21, 7].map((h, i) => `<i style="--h:${h}px;--d:${-i * 170}ms"></i>`).join('') + '</span>';
    if (phase === 'recording' || phase === 'limit') {
      html = `<div class="voice-line"><span class="label"><span class="dot" aria-hidden="true"></span>${t('录音中', 'Recording')}</span><span class="elapsed">${elapsedTime()}</span>${wave}<span class="spacer"></span>${button(t('停止录音', 'Stop'), 'stop', 'secondary')}${drop}</div>`;
      if (phase === 'limit') html += `<p class="hint">${t('即将达到单段上限，将自动停止并转写。', 'Near the recording limit. Recording will stop and transcribe automatically.')}</p>`;
    } else if (phase === 'transcribing') {
      html = `<div class="voice-line"><span class="label">${window.mwKit.renderStateRing({ state: 'running' })}${t('正在转文字…', 'Transcribing…')}</span><span class="spacer"></span>${button(t('取消转写', 'Cancel'), 'discard')}</div>`;
    } else if (phase === 'first') {
      html = card(t('先准备本机语音', 'Prepare local voice'), t('首次需下载约 626 MB 模型。音频在这台电脑转写，结果先放入草稿；发送后按接收者的模型设置处理文字。', 'Download a model of about 626 MB once. Audio is transcribed on this computer and added to your draft. Sending text uses the recipient’s model settings.'), button(t('稍后', 'Later'), 'close') + button(t('下载模型', 'Download model'), 'download', 'primary'));
    } else if (phase === 'downloading') {
      html = card(t('正在下载模型', 'Downloading model'), t('下载完成后，还需要在本机准备一次。', 'Once downloaded, the model needs to be prepared on this computer.'), button(t('取消下载', 'Cancel download'), 'close'), `<div class="progress"><i style="width:${progress}%"></i></div><div class="meter-note"><span>626 MB</span><span class="download-percent">${progress}%</span></div>`);
    } else if (phase === 'preparing') {
      html = card(t('正在准备本机模型…', 'Preparing the local model…'), t('首次准备可能需要一些时间，完成后再开始录音。', 'The first preparation may take a while. Start recording once it is ready.'), button(t('取消准备', 'Cancel preparation'), 'close'));
    } else if (phase === 'ready') {
      html = card(t('可以开始录音了', 'Ready to record'), t('转写结果先放入草稿，由你确认后发送。', 'Transcribed text goes into your draft for you to review and send.'), button(t('稍后', 'Later'), 'close') + button(t('开始录音', 'Start recording'), 'record', 'primary'));
    } else if (phase === 'failed') {
      html = card(t('没能转成文字', 'Couldn’t transcribe'), t('这段录音暂时保留，可以重试。原有草稿未改动。', 'This recording is kept temporarily for retry. Your existing draft is unchanged.'), button(t('丢弃录音', 'Discard recording'), 'discard') + button(t('重试转写', 'Retry'), 'retry', 'primary'));
    } else if (phase === 'permission') {
      html = card(t('还没有麦克风权限', 'Microphone access is off'), t('请在系统设置中允许 Molis Work 使用麦克风，再回来重试。', 'Allow Molis Work to use the microphone in system settings, then return and try again.'), button(t('先用文字', 'Use text'), 'close') + button(t('已允许，重试', 'Retry after allowing'), 'record', 'primary'));
    } else if (phase === 'device') {
      html = card(t('麦克风断开了', 'Microphone disconnected'), t('重新连接后可以重录，也可以转写已录下的部分。', 'Reconnect to record again, or transcribe the audio already captured.'), button(t('丢弃', 'Discard'), 'discard') + button(t('重新录音', 'Record again'), 'record') + button(t('转写已录部分', 'Transcribe captured audio'), 'retry', 'primary'));
    } else if (phase === 'empty') {
      html = card(t('这次没有听清', 'No speech recognized'), t('靠近麦克风再试一次。原有草稿未改动。', 'Try again closer to the microphone. Your existing draft is unchanged.'), button(t('先用文字', 'Use text'), 'close') + button(t('重新录音', 'Record again'), 'record', 'primary'));
    } else if (phase === 'download-failed') {
      html = card(t('模型下载未完成', 'Model download didn’t finish'), t('检查网络和可用空间后重试，也可以先用文字。', 'Check your connection and available space, then retry. You can use text in the meantime.'), button(t('先用文字', 'Use text'), 'close') + button(t('重试下载', 'Retry download'), 'download', 'primary'));
    } else if (phase === 'confirm') {
      html = card(t('草稿变了，确认后再插入', 'Your draft changed'), t('原有文字不会被覆盖。把这段话插入光标位置，或放弃这次结果。', 'Existing text won’t be overwritten. Insert this text at the cursor, or discard the result.'), button(t('放弃结果', 'Discard result'), 'close') + button(target === voice?.owner ? t('插入光标位置', 'Insert at cursor') : t('返回原草稿', 'Return to original draft'), 'insert', 'primary'), `<p class="preview-text">${esc(sentence)}</p>`);
    } else if (phase === 'returned') {
      html = card(t('文字已回到原草稿', 'Text added to the original draft'), t('尚未发送。当前输入框的文字没有改变。', 'It has not been sent. The text in the current composer is unchanged.'), button(t('知道了', 'Dismiss'), 'close') + button(t('查看草稿', 'View draft'), 'return', 'primary'));
    } else if (phase === 'interrupted') {
      html = card(t('上次录音已中断', 'The last recording was interrupted'), t('文字草稿已恢复，未完成的录音没有保留。', 'Your text draft was restored. The unfinished recording was not kept.'), button(t('知道了', 'Dismiss'), 'close') + button(t('重新录音', 'Record again'), 'record', 'primary'));
    } else if (phase === 'unavailable') {
      html = card(t('本机语音组件尚未就绪', 'Local voice is not ready'), t('请在组件设置中完成安装与检查。现在仍可以用文字。', 'Complete installation and checks in component settings. You can still use text.'), button(t('先用文字', 'Use text'), 'close') + button(t('查看组件状态', 'Component status'), 'components', 'secondary'));
    } else if (phase === 'components') {
      html = card(t('本机语音组件', 'Local voice component'), t('组件安装与修复界面随第 26 批确定。此预览只保留入口，不模拟安装成功。', 'Installation and repair are defined in batch 26. This specimen provides the entry only, without simulating a successful installation.'), button(t('返回', 'Back'), 'unavailable'));
    } else if (notice) html = `<p>${esc(notice)}</p>`;
    if (voice && voice.owner !== target && !['idle', 'returned'].includes(phase)) html = `<div class="voice-owner"><span>${t('录音属于 ', 'Recording for ')}${esc(names[voice.owner])}</span>${button(t('返回', 'Return'), 'owner')}</div>` + html;
    panel.innerHTML = html;
    $('#simulate-complete').hidden = !['transcribing', 'limit'].includes(phase);
    $('#simulate-complete').textContent = phase === 'limit' ? t('模拟达到上限', 'Simulate limit reached') : t('模拟转写完成', 'Simulate completion');
    fit();
  }
  panel.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'record') { prepared = true; record(); }
    else if (action === 'stop' || action === 'retry') stop();
    else if (action === 'discard') discard();
    else if (action === 'download') download();
    else if (action === 'close') { cancelTimers(); voice = null; notice = ''; setPhase('idle'); $('[data-composer-voice]').focus(); }
    else if (action === 'components' || action === 'unavailable') setPhase(action);
    else if (action === 'owner') changeTarget(voice.owner);
    else if (action === 'return') { const owner = voice.owner; voice = null; phase = 'idle'; changeTarget(owner); input.focus(); }
    else if (action === 'insert') {
      if (target !== voice.owner) { changeTarget(voice.owner); input.focus(); return; }
      input.setRangeText(sentence, input.selectionStart, input.selectionEnd, 'end');
      drafts[target] = input.value; voice = null; setPhase('idle'); input.focus();
    }
  });
  const completeButton = document.createElement('button');
  completeButton.id = 'simulate-complete'; completeButton.className = 'mw-btn mw-btn--ghost mw-btn--sm';
  completeButton.hidden = true; $('.app-head').insertBefore(completeButton, $('#side-toggle'));
  completeButton.onclick = () => phase === 'limit' ? stop() : finish();
  $('#side-toggle').onclick = () => { $('#side-panel').hidden = !$('#side-panel').hidden; $('.workbench').toggleAttribute('data-side', !$('#side-panel').hidden); fit(); };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { $('#receiver-menu').hidden = true; $('[data-compose-menu]').hidden = true; } });
  document.addEventListener('click', event => { if (!event.target.closest('#receiver-menu, [data-composer-receiver]')) $('#receiver-menu').hidden = true; });
  addEventListener('resize', fit);
  if (scenario !== 'idle') {
    drafts.coding = t('先把第一次使用的流程理清楚。', 'Let’s clarify the first-use experience.');
    phase = scenario;
    prepared = !['first', 'download-failed', 'unavailable'].includes(scenario);
    if (['recording', 'transcribing', 'failed', 'device', 'confirm', 'limit'].includes(scenario)) {
      voice = { owner: 'coding', original: drafts.coding, start: drafts.coding.length, end: drafts.coding.length };
      if (scenario === 'confirm') drafts.coding += t('\n这句是转写时补充的。', '\nThis sentence was added while transcribing.');
    }
  }
  mount();
})();
