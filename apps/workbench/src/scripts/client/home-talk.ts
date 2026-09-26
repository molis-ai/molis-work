/** One draft per actual subject; the server remains the authority for delivery receipts. */
export const HOME_TALK_FACTORY_SCRIPT = `(host) => {
  const { root, current, projectKey, translate: L, prepareApi, messageApi, openItem, openPlugin, layout } = host;
  const body = root.querySelector('[data-home-talk-body]');
  const form = root.querySelector('[data-home-talk-form]');
  const input = form.querySelector('textarea');
  const submit = form.querySelector('[type="submit"]');
  const drafts = new Map();
  const esc = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  let activeKey = null;
  const keyFor = (subject) => JSON.stringify([projectKey, subject.kind, subject.id]);
  const save = (key, state) => {
    try { sessionStorage.setItem('molis.home-talk:' + key, JSON.stringify({ subject: state.subject, text: state.text, selected: state.selected,
      preparation: state.preparation, payload: state.payload, requestId: state.requestId, receipt: state.receipt })); }
    catch { state.storageError = L('草稿暂时只能保留在当前页面，请勿刷新。'); }
  };
  const load = (subject) => {
    const key = keyFor(subject);
    if (!drafts.has(key)) {
      let cached = {};
      try { cached = JSON.parse(sessionStorage.getItem('molis.home-talk:' + key) || '{}'); } catch {}
      drafts.set(key, { subject, text: typeof cached.text === 'string' ? cached.text : '', selected: cached.selected || null,
        preparation: cached.preparation || null, payload: cached.payload || null, requestId: cached.requestId || null,
        receipt: cached.receipt || null, busy: false, loading: false, error: '', checked: false });
    }
    return { key, state: drafts.get(key) };
  };
  const active = () => activeKey ? drafts.get(activeKey) : null;
  const button = (action, label) => '<button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-talk-action="' + action + '">' + esc(L(label)) + '</button>';
  const render = () => {
    const state = active(); if (!state) return;
    const locked = !!state.payload;
    input.value = state.text;
    input.disabled = state.busy || locked;
    submit.disabled = state.busy || state.loading || locked || !state.selected || !state.text.trim();
    submit.setAttribute('aria-label', L(state.busy ? '正在发送' : '发送消息'));
    let html = '';
    const preparation = state.preparation;
    if (state.loading) html += '<p role="status">' + L('正在读取事项和可用会话…') + '</p>';
    if (preparation) {
      const candidates = preparation.candidates || [];
      if (!locked) {
        html += '<fieldset class="mw-radio-group home-talk-targets"><legend>' + L(preparation.selection === 'associated' ? '发送到关联会话' : '请选择发送到哪条会话') + '</legend>';
        if (!candidates.length) html += '<p>' + L(preparation.selection === 'associated' ? '这件事还没有可接收消息的关联会话。' : '当前项目还没有可接收消息的会话。') + '</p>';
        html += candidates.map(session => '<label class="home-talk-target"><input class="mw-radio" type="radio" name="talk-session" value="' + esc(session.session_id) + '"' + (session.session_id === state.selected ? ' checked' : '') + (state.busy || state.loading ? ' disabled' : '') + '><span><b>' + esc(session.title || L('未命名会话')) + '</b><small>' + esc(session.runtime_id) + ' · ' + esc(new Date(session.updated_at).toLocaleString()) + '</small></span></label>').join('');
        html += '</fieldset>';
        if (!candidates.length) html += '<div class="home-talk-controls">' + button('sessions', '打开会话列表') + button('reload', '重新查找') + '</div>';
      } else {
        const session = candidates.find(row => row.session_id === state.payload.session_id);
        html += '<p class="home-talk-destination">' + L('发送到') + ' <strong>' + esc(session?.title || L('所选会话')) + '</strong></p>';
      }
      html += '<details class="home-talk-context"><summary>' + L('携带的事项上下文') + '</summary><p>' + esc(preparation.context.title) + '</p><pre>' + esc(preparation.context.content) + '</pre>' + (preparation.context.truncated ? '<p>' + L('内容较长，本次携带的是节选。') + '</p>' : '') + '</details>';
    }
    let status = '';
    if (state.busy) status = L(state.operation === 'check' ? '正在核对原请求的状态…' : '正在发送到所选会话…');
    else if (state.payload && !state.checked) status = L('正在核对原请求的状态…');
    else if (state.receipt?.state === 'accepted') status = L('消息已被会话接收。');
    else if (state.receipt?.state === 'failed') status = L('Runtime 明确未接收消息，可以重试原请求。');
    else if (state.payload) status = L('送达结果尚未确认。请核对原请求或查看会话，不要另发一遍。');
    html += '<p class="home-talk-status" role="status" aria-live="polite">' + esc(status) + '</p>';
    if (state.error) html += '<p class="home-talk-error" role="alert">' + esc(state.error) + '</p>';
    if (state.storageError) html += '<p class="home-talk-error">' + esc(state.storageError) + '</p>';
    if (!state.busy && !state.loading) {
      let controls = '';
      if (state.payload) {
        if (state.receipt?.state === 'accepted') controls = button('open', '打开会话') + button('new', '继续说一句');
        else if (state.receipt?.state === 'failed') controls = button('retry', '重试原请求') + button('edit', '修改后再发送');
        else controls = button('check', state.requestId ? '检查状态' : '核对原请求') + button('open', '查看会话');
      } else if (state.error) controls = button('reload', '重新载入');
      if (controls) html += '<div class="home-talk-controls">' + controls + '</div>';
    }
    body.innerHTML = html;
    requestAnimationFrame(layout);
  };
  const prepare = async (key, state) => {
    if (state.payload || state.loading) return;
    state.loading = true; state.error = ''; if (key === activeKey) render();
    try {
      const result = await prepareApi('/api/home/talk/prepare', 'POST', { subject: state.subject });
      state.preparation = result;
      if (!result.candidates.some(row => row.session_id === state.selected)) state.selected = result.selected_session_id;
      save(key, state);
    } catch (error) { state.preparation = null; state.selected = null; state.error = error.message || L('无法读取事项'); }
    finally { state.loading = false; if (key === activeKey) render(); }
  };
  const deliver = async (key, state, operation) => {
    if (state.busy || !state.payload) return;
    state.busy = true; state.operation = operation; state.error = ''; state.checked = false; if (key === activeKey) render();
    try {
      let result;
      if (operation === 'retry') result = await messageApi('/api/session-messages/' + encodeURIComponent(state.requestId) + '/retry', 'POST', {});
      else if (operation === 'check' && state.requestId) result = await messageApi('/api/session-messages/' + encodeURIComponent(state.requestId), 'GET');
      else result = await messageApi('/api/sessions/' + encodeURIComponent(state.payload.session_id) + '/messages', 'POST', state.payload);
      state.receipt = result; state.requestId = result.request_id;
      if (typeof result.text === 'string') state.text = result.text;
    } catch (error) { state.error = error.message || L('暂时无法核对送达结果'); }
    finally { state.busy = false; state.checked = true; save(key, state); if (key === activeKey) render(); }
  };
  form.addEventListener('input', () => { const state = active(); if (!state || state.payload) return; state.text = input.value; save(activeKey, state); submit.disabled = state.loading || state.busy || !state.selected || !state.text.trim(); });
  body.addEventListener('change', event => { const state = active(); if (!state || state.payload || !event.target.matches('[name="talk-session"]')) return; state.selected = event.target.value; save(activeKey, state); render(); });
  body.addEventListener('toggle', () => requestAnimationFrame(layout), true);
  body.addEventListener('click', event => {
    const action = event.target.closest('[data-talk-action]')?.dataset.talkAction;
    const state = active(); if (!action || !state || state.busy) return;
    const key = activeKey;
    if (action === 'sessions') { openPlugin?.('sessions'); return; }
    if (action === 'open') { openItem?.('sessions', state.payload.session_id, state.preparation?.candidates.find(row => row.session_id === state.payload.session_id)?.title || L('Session')); return; }
    if (action === 'reload') { prepare(key, state); return; }
    if (action === 'check' || action === 'retry') { deliver(key, state, action); return; }
    if (action === 'new' || action === 'edit') {
      if (action === 'new') state.text = '';
      state.payload = null; state.requestId = null; state.receipt = null; state.checked = false; state.error = '';
      save(key, state); prepare(key, state); input.focus();
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const state = active(); if (!state || state.busy || state.loading || state.payload || !input.value.trim()) return;
    const target = state.preparation?.candidates.find(row => row.session_id === state.selected); if (!target) return;
    state.text = input.value;
    const context = state.preparation.context;
    state.payload = { session_id: target.session_id, expected_goal_id: target.current_goal_id, idempotency_key: crypto.randomUUID(), text: state.text,
      context: { kind: context.subject.kind, id: context.subject.id, content: context.title + '\\n\\n' + context.content + (context.truncated ? '\\n（正文节选）' : '') } };
    save(activeKey, state); deliver(activeKey, state, 'send');
  });
  return { open() {
    const event = current();
    if (!event?.subject) { body.textContent = L('这件事尚未提供可引用的上下文。'); input.value = ''; submit.disabled = true; input.disabled = true; activeKey = null; return; }
    const { key, state } = load(event.subject); activeKey = key;
    if (state.payload) { render(); if (!state.busy) deliver(key, state, 'check'); }
    else prepare(key, state);
  } };
}`;
