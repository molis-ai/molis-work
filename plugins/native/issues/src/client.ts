import { ISSUES_STYLES } from "./ui.js";
import { ISSUE_ASSISTANT_CLIENT_SCRIPT } from "./assistant-client.js";
import { ISSUE_IMAGES_CLIENT_SCRIPT } from "./image-client.js";

export const ISSUES_CLIENT_FACTORY_SCRIPT = String.raw`(host) => {
  const root = host.root || document.querySelector('[data-issues="workbench"]');
  if (!root) return;
  const scope = host.mountPluginClient(root); if (!scope) return;
  root.dataset.ready = 'true';
  const style = document.createElement('style'); style.textContent = ${JSON.stringify(ISSUES_STYLES)}; root.appendChild(style);
  scope.own(() => { style.remove(); delete root.dataset.ready; });
  const L = host.translate || ((text) => text), $ = key => root.querySelector('[data-issue-'+key+']');
  const form = $('form'), list = $('list'), workspace = $('workspace');
  const description = form.elements.description;
  const fitDescription = () => {
    if (!description.clientWidth) return;
    const scroll = $('scroll').scrollTop;
    description.style.height = 'auto'; description.style.height = description.scrollHeight + 'px';
    $('scroll').scrollTop = scroll;
  };
  let descriptionWidth = 0;
  scope.observe(new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === descriptionWidth) return;
    descriptionWidth = entry.contentRect.width; fitDescription();
  }), description);
  scope.listen(description, 'input', fitDescription);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kind = {bug:'Bug',experience:'体验问题',feature:'功能需求'};
  let selected = null, comparison = null, editing = false, dirty = false, busy = false, imageBusy = false, images = [], next = null, rows = [], readEpoch = 0, listEpoch = 0, editRevision = 0, noticeTimer, viewSignal;
  const viewing = () => Boolean(selected && !editing);
  const fields = ['title','type','description'], values = () => ({...Object.fromEntries(fields.map(key => [key,form.elements[key].value])),images});
  const content = issue => ({...Object.fromEntries(fields.map(key => [key,issue?.[key] || ''])),images:issue?.images || []});
  const changes = () => Object.fromEntries(Object.entries(values()).filter(([key,value]) => JSON.stringify(value) !== JSON.stringify(content(selected)[key])));
  const note = (message, error = false) => {
    if (!scope.alive) return;
    scope.clearTimeout(noticeTimer);
    const el = $(workspace.hidden ? 'list-note' : 'note');
    for (const key of ['note','list-note']) { $(key).textContent=''; $(key).hidden=true; }
    el.textContent = message; el.hidden = !message; el.classList.toggle('is-error', error);
    if (message && !error) noticeTimer = scope.timeout(() => { el.hidden = true; }, 4500);
  };
  const request = async (path, body, signal = body === undefined ? viewSignal : undefined) => {
    let response, result;
    try {
      response = await scope.fetch(path.startsWith('/') ? path : '/api/plugins/io.molis.work.issues/' + path, {signal,method:body === undefined ? 'GET' : 'POST',
        headers:globalThis.molisWorkControlHeaders(), ...(body === undefined ? {} : {body:JSON.stringify(body)})});
      result = await response.json(); scope.assertCurrent(signal);
    } catch (error) { if (scope.signal.aborted || signal?.aborted) throw error;
      throw new Error(L(body === undefined ? '读取失败，请稍后重试。' : /^(create|update|delete)$|\/cards\/[^/]+\/run$/.test(path) ? '未能确认提交结果，请先刷新列表核对，避免重复提交。' : '整理连接中断，草稿仍保留。请重试或手动填写。')); }
    if (!response.ok) throw Object.assign(new Error(result.error || L('操作失败，请重试')), {status:response.status});
    return result;
  };
  const run = (work) => { void Promise.resolve().then(work).catch((error) => { if (error.name !== 'AbortError') note(error.message, true); }); };
  for (const dialog of root.querySelectorAll('dialog')) {
    let background;
    scope.listen(dialog,'pointerdown',event => { background=event.target===dialog || event.target.matches('.issues-image-canvas') ? event.target : null; });
    scope.listen(dialog,'click',event => { if(background && event.target===background) dialog.close(); background=null; });
  }
  const confirm = (title, text, label, danger = false) => new Promise((resolve) => {
    const dialog = $('dialog');
    if (dialog.open) { resolve(false); return; }
    $('dialog-title').textContent = L(title); $('dialog-text').textContent = L(text); $('dialog-ok').textContent = L(label);
    $('dialog-ok').classList.toggle('mw-btn--danger',danger); $('dialog-ok').classList.toggle('mw-btn--primary',!danger);
    const cancel = scope.own(() => resolve(false));
    dialog.returnValue = ''; scope.listen(dialog, 'close', () => { resolve(dialog.returnValue === 'confirm'); cancel(); }, {once:true}); dialog.showModal();
  });
  const mayLeave = async () => {
    if(busy || imageBusy || dirty && !await confirm('放弃未保存的修改？','当前输入还没有保存。你可以取消并继续编辑。','放弃修改')) return false;
    await release(); return true;
  };
  const load = async (more = false) => {
    const epoch = ++listEpoch;
    const result = await request('list' + (more && next ? '?cursor=' + encodeURIComponent(JSON.stringify(next)) : ''));
    if (epoch !== listEpoch) return;
    rows = more ? [...rows,...result.items] : result.items; next = result.next_cursor;
    const scroll = list.scrollTop;
    list.innerHTML = rows.length ? rows.map((row) => '<button type="button" class="feed-stage-entry directory-list-row issues-row" data-issue-id="'+esc(row.id)+'" aria-current="'+(selected?.id===row.id)+'"><span class="issues-row-title">'+esc(row.title)+'</span><span class="issues-row-meta">'+esc(L(kind[row.type]))+'</span></button>').join('')
      : '<div class="mw-empty"><span class="mw-empty__mark"><svg aria-hidden="true"><use href="#icon-circle-alert"></use></svg></span><h2>'+L('还没有问题记录')+'</h2><p>'+L('点击「记录问题」，记下你遇到的问题。')+'</p></div>';
    list.scrollTop = scroll; $('more').hidden = !next;
  };
  const meta = (issue) => {
    $('meta').textContent = issue ? L('提交人：我')+' · '+L('录入时间：')+new Date(issue.context.recorded_at).toLocaleString() : '';
    $('meta').title = issue ? L('最近修改：')+new Date(issue.updated_at).toLocaleString() : '';
  };
  const fill = (issue, patch = {}, edit = false) => {
    selected = issue; editing = edit; comparison = null; manual = false; assistant = null; assistantNote(''); $('comparison').hidden = true;
    const data = {...content(issue),...patch};
    for (const field of fields) form.elements[field].value = data[field];
    images = data.images; renderImages();
    dirty = Object.keys(changes()).length > 0;
    $('view-title').textContent = issue?.title || ''; $('view-type').textContent = L(kind[issue?.type] || '');
    $('view-description').textContent = issue?.description || ''; $('view-images').innerHTML = imageMarkup(issue?.images || []);
    $('reread').hidden = !issue;
    meta(issue);
    root.dataset.expanded = 'true'; workspace.hidden = false; note(''); mode();
  };
  const compare = (issue) => {
    comparison = issue;
    const latest = content(issue), draft = values();
    for (const field of [...fields,'images']) for (const [side,data] of [['latest',latest],['draft',draft]]) {
      const el=$(side+'="'+field+'"'); el.parentElement.hidden=JSON.stringify(latest[field])===JSON.stringify(draft[field]);
      if(field==='images') el.innerHTML=imageMarkup(data.images)||L('无图片'); else el.textContent=field==='type' ? L(kind[data[field]]||data[field]) : data[field];
    }
    $('comparison').hidden = false;
  };
  const open = async (id) => {
    if (imageBusy) return;
    if (selected?.id !== id && !await mayLeave()) return;
    const epoch = ++readEpoch, revision = editRevision;
    note(L('正在读取问题…'));
    const issue = await request('read?id=' + encodeURIComponent(id));
    if (epoch !== readEpoch) return;
    if (selected?.id===id && issue.version===selected.version) { note(L('已是最新版本，当前草稿已保留。')); return; }
    if (selected?.id === id && assistant) await release();
    if (selected?.id === id && dirty) {
      compare(issue); note(L('请先核对最新内容与草稿。')); $('comparison').scrollIntoView({block:'nearest'}); return;
    }
    if (revision !== editRevision) { note(L('读取期间输入已变化，已保留当前草稿。')); return; }
    fill(issue);
  };
  const edited = event => {
    if(viewing() || event && !fields.includes(event.target.name)) return;
    dirty = true; editRevision++; note(''); if (comparison) compare(comparison);
  };
  ${ISSUE_ASSISTANT_CLIENT_SCRIPT}
  ${ISSUE_IMAGES_CLIENT_SCRIPT}
  scope.listen(form, 'input', edited); scope.listen(form, 'change', edited);
  scope.listen(description, 'compositionend', edited);
  scope.listen(form, 'submit', (event) => { event.preventDefault(); run(async () => {
    if (viewing() || busy || imageBusy || !form.reportValidity()) return;
    if(!selected && !manual && !assistant?.card) return;
    if (comparison) { note(L('请先核对最新内容与草稿。'), true); return; }
    const data = selected ? changes() : values();
    if (selected && !assistant && !Object.keys(data).length) { fill(selected); note(L('没有需要保存的修改。')); return; }
    busy = true; form.inert = true; note(''); ++readEpoch; $('save').disabled = true;
    try {
      const saved = assistant?.card ? await saveCard() : await request(selected ? 'update' : 'create', {...data, ...(selected ? {id:selected.id,expected_version:selected.version} : {})});
      fill(saved); $('edit').focus();
      try { if (scope.visible) await load(); note(L('已保存')); } catch { note(L('问题已保存，列表刷新失败，请稍后刷新列表。'), true); }
    } catch (error) { if (error.status === 409 && selected) { await release(); await open(selected.id); } else throw error; }
    finally { busy = false; form.inert = false; $('save').disabled = false; }
  }); });
  scope.listen(root, 'click', (event) => run(async () => {
    const button = event.target.closest('button'); if (!button || busy || imageBusy) return;
    const is = key => button.hasAttribute('data-issue-'+key);
    if (is('edit') && viewing()) { editing=true; mode(); description.focus(); return; }
    if (is('cancel-edit') && selected) { await release(); fill(comparison || selected); $('edit').focus(); return; }
    if (is('organize')) { await organize(); return; }
    if (is('retry')) { await release(); await organize(); return; }
    if (is('manual')) { await release(); manual=true; note(''); mode(); form.elements.title.focus(); return; }
    if (is('revise')) { await release(); manual=false; note(''); mode(); description.focus(); return; }
    if (is('pick')) { picker.click(); return; }
    if (is('remove') && !viewing() && !assistant) { images = images.filter((_,index) => index !== Number(button.dataset.issueRemove)); renderImages(); edited(); return; }
    if (is('preview')) { preview(button.querySelector('img')); return; }
    if (is('zoom')) { zoom($('image-dialog').dataset.zoom!=='true'); return; }
    if (is('new')) { if (await mayLeave()) { ++readEpoch; fill(null); description.focus(); } }
    else if (button.dataset.issueId) await open(button.dataset.issueId);
    else if (is('back')) { if (await mayLeave()) { ++readEpoch; selected = null; dirty = false; workspace.hidden = true; root.dataset.expanded = 'false'; mode(); $('new').focus(); } }
    else if (is('refresh')) await load();
    else if (is('more')) await load(true);
    else if (is('reread') && selected) await open(selected.id);
    else if (is('keep') && comparison) { const patch = changes(); ++readEpoch; fill(comparison,patch,true); note(L('已保留你的修改，请核对后保存。')); }
    else if (is('accept') && comparison) { ++readEpoch; fill(comparison); }
    else if (is('delete') && selected) {
      const target = selected; ++readEpoch;
      if (!await confirm('删除这条问题？',target.title+'\n\n'+L('删除后无法在 Issue 中恢复。'),'删除问题',true) || selected !== target) return;
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
    viewSignal = signal; run(load); if(assistant?.work) run(poll);
    return scope.listen(window, 'molis:assistant-effect', event => { if (event.detail?.capability_id?.startsWith('issues.')) run(load); }, {signal});
  });
}`;
