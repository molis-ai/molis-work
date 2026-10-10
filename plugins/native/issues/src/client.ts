import { ISSUES_STYLES } from "./ui.js";

export const ISSUES_CLIENT_FACTORY_SCRIPT = String.raw`(host) => {
  const root = host.root || document.querySelector('[data-issues="workbench"]');
  if (!root) return;
  const scope = host.mountPluginClient(root); if (!scope) return;
  root.dataset.ready = 'true';
  const style = document.createElement('style'); style.textContent = ${JSON.stringify(ISSUES_STYLES)}; root.appendChild(style);
  scope.own(() => { style.remove(); delete root.dataset.ready; });
  const L = host.translate || ((text) => text), $ = (selector) => root.querySelector(selector);
  const form = $('[data-issue-form]'), list = $('[data-issue-list]'), workspace = $('[data-issue-workspace]');
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kind = {bug:'Bug',experience:'体验问题',feature:'功能需求'};
  let selected = null, dirty = false, busy = false, next = null, rows = [], readEpoch = 0, listEpoch = 0, editRevision = 0, noticeTimer, viewSignal;
  const note = (message, error = false) => {
    if (!scope.alive) return;
    scope.clearTimeout(noticeTimer);
    const el = $('[data-issue-note]'); el.textContent = message; el.hidden = !message; el.classList.toggle('is-error', error);
    if (message && !error) noticeTimer = scope.timeout(() => { el.hidden = true; }, 4500);
  };
  const request = async (path, body, signal = body === undefined ? viewSignal : undefined) => {
    let response, result;
    try {
      response = await scope.fetch('/api/plugins/io.molis.work.issues/' + path, {signal,method:body === undefined ? 'GET' : 'POST',
        headers:globalThis.molisWorkControlHeaders(), ...(body === undefined ? {} : {body:JSON.stringify(body)})});
      result = await response.json(); scope.assertCurrent(signal);
    } catch (error) { if (scope.signal.aborted || signal?.aborted) throw error;
      throw new Error(L(body === undefined ? '读取失败，请稍后重试。' : '未能确认提交结果，请先刷新列表核对，避免重复提交。')); }
    if (!response.ok) throw new Error(result.error || L('操作失败，请重试'));
    return result;
  };
  const run = (work) => { void Promise.resolve().then(work).catch((error) => { if (error.name !== 'AbortError') note(error.message, true); }); };
  const confirm = (title, text, label) => new Promise((resolve) => {
    const dialog = $('[data-issue-dialog]');
    if (dialog.open) { resolve(false); return; }
    $('[data-issue-dialog-title]').textContent = L(title); $('[data-issue-dialog-text]').textContent = L(text); $('[data-issue-dialog-ok]').textContent = L(label);
    const cancel = scope.own(() => resolve(false));
    dialog.returnValue = ''; scope.listen(dialog, 'close', () => { resolve(dialog.returnValue === 'confirm'); cancel(); }, {once:true}); dialog.showModal();
  });
  const mayLeave = async () => !busy && (!dirty || await confirm('放弃未保存的修改？','当前输入还没有保存。你可以取消并继续编辑。','放弃修改'));
  const load = async (more = false) => {
    const epoch = ++listEpoch;
    const result = await request('list' + (more && next ? '?cursor=' + encodeURIComponent(JSON.stringify(next)) : ''));
    if (epoch !== listEpoch) return;
    rows = more ? [...rows,...result.items] : result.items; next = result.next_cursor;
    const scroll = list.scrollTop;
    list.innerHTML = rows.length ? rows.map((row) => '<button type="button" class="feed-stage-entry directory-list-row issues-row" data-issue-id="'+esc(row.id)+'"><span class="issues-row-title">'+esc(row.title)+'</span><span class="issues-row-meta">'+esc(L(kind[row.type]))+' · '+L('我')+'</span></button>').join('')
      : '<div class="mw-empty"><span class="mw-empty__mark"><svg aria-hidden="true"><use href="#icon-circle-alert"></use></svg></span><h2>'+L('还没有问题记录')+'</h2><p>'+L('点击「记录问题」，记下你遇到的问题。')+'</p></div>';
    list.scrollTop = scroll; $('[data-issue-more]').hidden = !next;
  };
  const meta = (issue) => { $('[data-issue-meta]').textContent = issue ? L('提交人：我')+' · '+new Date(issue.created_at).toLocaleString()+'\n'+L('录入页面：')+(issue.context.page?.title || issue.context.page?.url || L('未取得')) : L('提交人：我。录入时间将在保存时记录。'); };
  const fill = (issue) => {
    selected = issue; dirty = false;
    for (const field of ['title','description','type']) form.elements[field].value = issue?.[field] || '';
    form.elements.supplement.value = issue?.context.supplement.text || '';
    $('[data-issue-heading]').textContent = L(issue ? '问题详情' : '记录问题');
    $('[data-issue-delete]').hidden = !issue; $('[data-issue-reread]').hidden = !issue;
    meta(issue);
    root.dataset.expanded = 'true'; workspace.hidden = false; note('');
  };
  const open = async (id) => {
    if (!await mayLeave()) return;
    const epoch = ++readEpoch, revision = editRevision;
    note(L('正在读取问题…'));
    const issue = await request('read?id=' + encodeURIComponent(id));
    if (epoch !== readEpoch) return;
    if (revision !== editRevision) { note(L('读取期间输入已变化，已保留当前草稿。')); return; }
    fill(issue);
  };
  scope.listen(form, 'input', () => { dirty = true; editRevision++; });
  scope.listen(form, 'change', () => { dirty = true; editRevision++; });
  scope.listen(form, 'submit', (event) => { event.preventDefault(); run(async () => {
    if (busy || !form.reportValidity()) return;
    busy = true; ++readEpoch; $('[data-issue-save]').disabled = true;
    const data = Object.fromEntries(new FormData(form)), savedRevision = editRevision;
    try {
      const saved = await request(selected ? 'update' : 'create', {...data, ...(selected ? {id:selected.id,expected_version:selected.version} : {})});
      selected = saved; dirty = editRevision !== savedRevision;
      $('[data-issue-delete]').hidden = false; $('[data-issue-reread]').hidden = false; $('[data-issue-heading]').textContent = L('问题详情');
      meta(saved);
      try { if (scope.visible) await load(); note(L('已保存')); } catch { note(L('问题已保存，列表刷新失败，请稍后刷新列表。'), true); }
    } finally { busy = false; $('[data-issue-save]').disabled = false; }
  }); });
  scope.listen(root, 'click', (event) => run(async () => {
    const button = event.target.closest('button'); if (!button || busy) return;
    if (button.hasAttribute('data-issue-new')) { if (await mayLeave()) { ++readEpoch; fill(null); form.elements.title.focus(); } }
    else if (button.dataset.issueId) await open(button.dataset.issueId);
    else if (button.hasAttribute('data-issue-back')) { if (await mayLeave()) { ++readEpoch; selected = null; dirty = false; workspace.hidden = true; root.dataset.expanded = 'false'; } }
    else if (button.hasAttribute('data-issue-refresh')) await load();
    else if (button.hasAttribute('data-issue-more')) await load(true);
    else if (button.hasAttribute('data-issue-reread') && selected) await open(selected.id);
    else if (button.hasAttribute('data-issue-delete') && selected) {
      const target = selected; ++readEpoch;
      if (!await confirm('删除这条问题？','删除后无法在 Issue 中恢复。','删除问题') || selected !== target) return;
      busy = true; form.inert = true;
      try { await request('delete',{id:target.id,expected_version:target.version}); selected = null; dirty = false; ++readEpoch;
        workspace.hidden = true; root.dataset.expanded = 'false'; await load(); note(L('已删除')); }
      finally { busy = false; form.inert = false; }
    }
  }));
  scope.listen(root, 'molis-work:select-item', (event) => { if (typeof event.detail?.itemId === 'string') run(() => open(event.detail.itemId)); });
  scope.listen(window, 'beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  workspace.hidden = true; root.dataset.expanded = 'false'; note('');
  scope.whenVisible(signal => {
    viewSignal = signal; run(load);
    return scope.listen(window, 'molis:assistant-effect', event => { if (event.detail?.capability_id?.startsWith('issues.')) run(load); }, {signal});
  });
}`;
