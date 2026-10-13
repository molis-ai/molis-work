import { ISSUES_STYLES } from "./ui.js";
import { ISSUE_CAPTURE_CLIENT_SCRIPT } from "./capture-client.js";
import { ISSUE_IMAGES_CLIENT_SCRIPT } from "./image-client.js";

/**
 * One view in every place it mounts. Writing is never blocked: a capture leaves the composer at once and the
 * Assistant names it in the background (capture-client). Opening a record replaces the list; Back returns to it.
 */
export const ISSUES_CLIENT_FACTORY_SCRIPT = String.raw`function mountIssues(host) {
  const root = host.root || document.querySelector('[data-issues="workbench"]');
  if (!root) return;
  const scope = host.mountPluginClient(root); if (!scope) return;
  root.dataset.ready = 'true';
  const style = document.createElement('style'); style.textContent = ${JSON.stringify(ISSUES_STYLES)}; root.appendChild(style);
  scope.own(() => { style.remove(); delete root.dataset.ready; });
  const L = host.translate || (text => text), $ = key => root.querySelector('[data-issue-' + key + ']');
  const home = $('home'), detail = $('detail'), composer = $('composer'), editor = $('editor'), list = $('list'), toastBox = $('toast');
  const desc = composer.elements.description, kinds = { bug: 'Bug', experience: '体验问题', feature: '功能需求' };
  const via = { assistant: '助理整理', manual: '手动记录', mcp: '外部客户端' }, mac = /Mac|iP/.test(navigator.platform);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'molis:issue-draft';
  let rows = [], next = null, pending = [], current = null, editing = false, images = [], edits = [], fresh = null, listEpoch = 0, readEpoch = 0, toastTimer, toastRun;
  $('key').textContent = mac ? '⌘↵' : 'Ctrl↵';
  const api = async (path, body) => {
    let response, result;
    try {
      response = await scope.fetch(path[0] === '/' ? path : '/api/plugins/io.molis.work.issues/' + path, { method: body === undefined ? 'GET' : 'POST',
        headers: globalThis.molisWorkControlHeaders(), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      result = await response.json();
    } catch (error) {
      if (scope.signal.aborted) throw error;
      // A write that lost its answer may have happened: say so instead of inviting a blind repeat.
      throw new Error(L(/(update|delete|capture|discard|run)$/.test(path) ? '没收到结果，可能已经生效，请刷新列表核对。' : '连接中断，请稍后重试。'));
    }
    if (!response.ok) throw Object.assign(new Error(result.error || L('操作失败，请重试')), { status: response.status });
    return result;
  };
  const run = work => { void Promise.resolve().then(work).catch(error => { if (error.name !== 'AbortError') toast(error.message); }); };
  const toast = (text, action = '', then = null) => {
    scope.clearTimeout(toastTimer); toastRun = then;
    toastBox.firstChild.textContent = text; toastBox.lastChild.textContent = action; toastBox.hidden = false;
    toastTimer = scope.timeout(() => { toastBox.hidden = true; toastRun = null; }, action ? 7000 : 3500);
  };
  const fit = area => { if (!area.clientWidth) return; area.style.height = 'auto'; area.style.height = area.scrollHeight + 'px'; };
  const when = iso => {
    const date = new Date(iso), now = new Date(), minutes = Math.round((now - date) / 60000), today = new Date(now).setHours(0, 0, 0, 0);
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return minutes < 1 ? L('刚刚') : minutes < 60 ? minutes + L(' 分钟前') : date >= today ? L('今天 ') + time
      : date >= today - 864e5 ? L('昨天 ') + time : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };
  const full = iso => new Date(iso).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const excerpt = item => item.text.trim().split('\n')[0].slice(0, 90) || L('截图') + ' ×' + item.images.length;
  const row = (id, title, meta, state = '') => '<li><button type="button" class="issues-row' + (id === fresh ? ' is-new' : '') + '" data-issue-id="' + esc(id) + '"'
    + (state ? ' data-state="' + state + '"' : '') + '>' + (state === 'organizing' ? '<i class="mw-spinner" aria-hidden="true"></i>' : state ? '<i class="issues-dot"></i>' : '')
    + '<span><b>' + esc(title) + '</b><small>' + esc(meta) + '</small></span></button></li>';
  let reported = '';
  const render = () => {
    // The shell marks this tool while a capture is on its way or needs the person, also when the panel is closed.
    const status = pending.some(item => item.state === 'attention') ? 'attention' : pending.length ? 'busy' : '';
    if (status !== reported) { reported = status; host.status?.(status); }
    remember();
    list.removeAttribute('aria-busy');
    list.innerHTML = pending.map(item => row(item.id, excerpt(item), item.state === 'organizing' ? L('整理中…') : item.note, item.state)).join('')
      // Where it was written (the place before the project) tells two short titles apart at a glance.
      + rows.map(issue => row(issue.id, issue.title, [L(kinds[issue.type]), when(issue.created_at), issue.context?.page?.title?.split(' · ')[0],
        issue.image_count ? issue.image_count + L(' 张截图') : ''].filter(Boolean).join(' · '))).join('')
      || '<li class="issues-empty">' + esc(L('还没有记录。遇到问题时按 ')) + (mac ? '⌘⇧I' : 'Ctrl+Shift+I') + esc(L(' 随手记一笔。')) + '</li>';
    $('more').hidden = !next; fresh = null;
  };
  const load = async (more = false) => {
    const epoch = ++listEpoch, result = await api('list' + (more && next ? '?cursor=' + encodeURIComponent(JSON.stringify(next)) : ''));
    if (epoch !== listEpoch) return;
    rows = more ? [...rows, ...result.items] : result.items; next = result.next_cursor;
    pending = pending.filter(item => !item.restored || !rows.some(row => row.id === item.id)); render();
  };
  const refresh = () => load().catch(error => {
    if (error.name === 'AbortError') return;
    list.removeAttribute('aria-busy');
    list.innerHTML = '<li class="issues-empty">' + esc(L('列表没读出来。')) + ' <button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-issue-reload>' + esc(L('重试')) + '</button></li>';
  });
  const confirm = (title, text, label) => new Promise(resolve => {
    const dialog = $('dialog'), [ok] = dialog.querySelectorAll('[value=confirm]');
    if (dialog.open) { resolve(false); return; }
    dialog.querySelector('h2').textContent = L(title); dialog.querySelector('p').textContent = text; ok.textContent = L(label);
    const cancel = scope.own(() => resolve(false));
    dialog.returnValue = ''; scope.listen(dialog, 'close', () => { resolve(dialog.returnValue === 'confirm'); cancel(); }, { once: true }); dialog.showModal();
  });
  const pick = (type = '') => { editor.dataset.type = type; for (const button of editor.querySelectorAll('[data-type]')) button.setAttribute('aria-pressed', String(button.dataset.type === type)); };
  const flag = (text = '') => { const box = $('flag'); box.hidden = !text; box.textContent = text;
    if (/模型/.test(text)) box.insertAdjacentHTML('beforeend', ' <a href="/settings/models">' + esc(L('模型设置')) + '</a>'); };
  const fill = data => { editor.elements.title.value = data.title || ''; pick(data.type); editor.elements.description.value = data.text ?? data.description ?? ''; edits = data.images || []; paint(); };
  const draft = () => Boolean(current && !current.version);
  const values = () => ({ title: editor.elements.title.value.trim(), type: editor.dataset.type, description: editor.elements.description.value, images: edits });
  const changed = () => { const now = values(); return Object.fromEntries(Object.entries(now).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(current[key]))); };
  const mode = () => {
    $('view').hidden = editing; editor.hidden = !editing; $('edit').hidden = $('delete').hidden = editing;
    $('redo').hidden = !draft(); $('cancel').textContent = L(draft() ? '放弃' : '取消');
    if (!draft()) $('save').className = 'mw-btn mw-btn--sm mw-btn--primary';
    if (editing) scope.frame(() => fit(editor.elements.description));
  };
  const show = issue => {
    current = issue; editing = false; flag(); home.hidden = true; detail.hidden = false;
    $('type').textContent = L(kinds[issue.type]); $('when').textContent = full(issue.created_at); $('title').textContent = issue.title;
    $('text').textContent = issue.description; $('view-shots').innerHTML = shots(issue.images, false);
    $('source').textContent = [issue.context?.page?.title && L('记录于 ') + issue.context.page.title, L(via[issue.entered_via]),
      issue.version > 1 && L('修改于 ') + full(issue.updated_at)].filter(Boolean).join(' · ');
    mode(); $('page').scrollTop = 0; $('back').focus();
  };
  const open = async id => {
    const item = pending.find(entry => entry.id === id);
    if (item) { if (item.state === 'organizing') { toast(L('还在整理，稍等几秒')); return; }
      current = item; editing = true; fill(item.card ? { ...item, ...item.card } : item); flag(item.note); home.hidden = true; detail.hidden = false; mode();
      // Asked for a fact: the words come first and the Assistant tries again. Failed: name it by hand.
      const asked = item.kind === 'question', area = editor.elements.description;
      $('redo').className = 'mw-btn mw-btn--sm mw-btn--' + (asked ? 'primary' : 'secondary'); $('save').className = 'mw-btn mw-btn--sm mw-btn--' + (asked ? 'secondary' : 'primary');
      if (asked) { area.focus(); area.setSelectionRange(area.value.length, area.value.length); } else editor.elements.title.focus();
      return; }
    const epoch = ++readEpoch, issue = await api('read?id=' + encodeURIComponent(id));
    if (epoch === readEpoch) show(issue);
  };
  const back = async () => {
    if (draft()) Object.assign(current, { text: editor.elements.description.value, images: edits, card: { title: editor.elements.title.value, type: editor.dataset.type } });
    else if (editing && Object.keys(changed()).length && !await confirm('放弃这次修改？', L('修改还没有保存。'), '放弃修改')) return;
    const id = current?.id; ++readEpoch; current = null; editing = false; detail.hidden = true; home.hidden = false; render();
    (list.querySelector('[data-issue-id="' + CSS.escape(id || '') + '"]') || desc).focus();
  };
  ${ISSUE_IMAGES_CLIENT_SCRIPT}
  ${ISSUE_CAPTURE_CLIENT_SCRIPT}
  const save = async () => {
    const data = values();
    if (!data.title || !data.type) { flag(L('写个标题并选一个类型再保存。')); (data.title ? editor.querySelector('[data-type]') : editor.elements.title).focus(); return; }
    if (draft()) { await keep(current, data); return; }
    const patch = changed();
    if (!Object.keys(patch).length) { show(current); return; }
    try {
      const issue = await api('update', { id: current.id, expected_version: current.version, ...patch });
      rows = rows.map(row => row.id === issue.id ? issue : row); show(issue); toast(L('已保存'));
    } catch (error) {
      if (error.status !== 409) throw error;
      // Someone else saved first: their fields stay, this person's edits go on top, and nothing is written until they save again.
      current = await api('read?id=' + encodeURIComponent(current.id)); fill({ ...current, ...patch });
      flag(L('这条 Issue 刚在别处更新过，已合并你的修改，核对后再保存。'));
    }
  };
  scope.listen(composer, 'submit', event => { event.preventDefault(); run(submit); });
  scope.listen(editor, 'submit', event => { event.preventDefault(); run(save); });
  scope.listen(root, 'keydown', event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing) {
      const form = event.target.closest?.('form'); if (form === composer || form === editor) { event.preventDefault(); form.requestSubmit(); }
    } else if (event.key === 'Escape' && !detail.hidden && !editing && !root.querySelector('dialog[open]')) { event.preventDefault(); run(back); }
  });
  scope.listen(root, 'input', event => {
    if (event.target === desc) { fit(desc); ready(); try { localStorage.setItem(KEY, desc.value); } catch { /* A draft that cannot be kept still sends. */ } }
    if (event.target.form === editor) fit(editor.elements.description);
  });
  scope.listen(root, 'click', event => run(async () => {
    const button = event.target.closest('button, a[data-issue-id]'); if (!button) return;
    const is = key => button.hasAttribute('data-issue-' + key);
    if (button.dataset.issueId) await open(button.dataset.issueId);
    else if (button.dataset.type) { pick(button.dataset.type); flag(); }
    else if (is('back')) await back();
    else if (is('edit')) { editing = true; fill(current); mode(); editor.elements.title.focus(); }
    else if (is('cancel')) { if (draft()) await abandon(current); else show(current); }
    else if (is('redo')) await redo(current);
    else if (is('delete')) {
      const target = current;
      if (!await confirm('删除这条 Issue？', target.title + '\n\n' + L('删除后无法恢复。'), '删除') || current !== target) return;
      await api('delete', { id: target.id, expected_version: target.version });
      rows = rows.filter(row => row.id !== target.id); await back(); toast(L('已删除'));
    }
    else if (is('more')) await load(true);
    else if (is('reload')) await refresh();
    else if (is('toast-action') && toastRun) { const then = toastRun; toastBox.hidden = true; toastRun = null; await then(); }
  }));
  scope.listen(root, 'molis-work:select-item', event => { if (typeof event.detail?.itemId === 'string') run(() => open(event.detail.itemId)); });
  scope.listen(window, 'beforeunload', event => {
    if (pending.some(item => item.state === 'organizing') || editing && !draft() && Object.keys(changed()).length) { event.preventDefault(); event.returnValue = ''; }
  });
  // The side panel focuses this frame when it is summoned: land in the composer, ready to type. A click into the
  // frame also focuses it; that click goes where it was aimed, with nothing moved under it.
  let pointed = 0;
  scope.listen(document, 'pointerdown', () => { pointed = Date.now(); }, true);
  scope.listen(window, 'focus', () => {
    if (Date.now() - pointed < 500 || home.hidden || ![document.body, null].includes(document.activeElement)) return;
    home.scrollTop = 0; desc.focus({ preventScroll: true });
  });
  scope.listen(window, 'storage', event => { if (event.key === KEY && document.activeElement !== desc) { desc.value = event.newValue || ''; fit(desc); ready(); } });
  try { desc.value = localStorage.getItem(KEY) || ''; } catch { /* Storage may be off; the composer starts empty. */ }
  ready();
  scope.whenVisible(() => {
    run(refresh); scope.frame(() => fit(desc));
    return scope.listen(window, 'molis:assistant-effect', event => { if (event.detail?.capability_id?.startsWith('issues.')) run(refresh); });
  });
}`;
