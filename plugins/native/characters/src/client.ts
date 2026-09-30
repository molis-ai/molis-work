import { CHARACTER_IMPORT_CLIENT_FACTORY } from "./import-client.js";
import { CHARACTER_ACTION_CLIENT } from "./action-client.js";
/** Personal editing and exact project publication. No polling replaces an active editor. */
export const CHARACTERS_CLIENT_FACTORY_SCRIPT = `() => {
  const root = document.querySelector('[data-characters]');
  if (!root) return;
  const q = name => root.querySelector('[data-character-' + name + ']');
  const api = root.dataset.characterApi, key = 'molis.characters.drafts:' + api;
  const list = q('list'), form = q('editor'), dialog = q('dialog');
  let records = [], publications = [], selected = null, revision = null, busy = false, confirmation = null;
  let importsView, actionsView;
  let drafts = {};
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || '{}');
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      drafts = Object.fromEntries(Object.entries(stored).filter(([id, value]) => typeof id === 'string' && value && typeof value.title === 'string'
        && typeof value.instructions === 'string' && Number.isSafeInteger(value.expected_revision) && value.expected_revision > 0
        && (value.host_tools === null || Array.isArray(value.host_tools) && value.host_tools.every(tool => typeof tool === 'string'))));
    }
  } catch {}
  const persist = () => { try { sessionStorage.setItem(key, JSON.stringify(drafts)); } catch { q('notice').textContent = '浏览器无法保存临时草稿，请在离开前保存。'; } };
  const note = text => { q('notice').textContent = text; };
  const current = () => records.find(item => item.character_id === selected);
  const values = () => ({ title: q('title').value, instructions: q('instructions').value,
    host_tools: q('inherit').checked ? null : q('tools').value.split(',').map(tool => tool.trim()).filter(Boolean), action_tools: actionsView.value() });
  const dirty = () => Boolean(selected && drafts[selected]);
  const remember = () => {
    if (!selected || busy) return;
    drafts[selected] = { ...values(), expected_revision: revision };
    persist(); q('draft-note').textContent = '有未保存的修改，已暂存在此窗口；发布前会先保存。';
    q('tools-field').hidden = q('inherit').checked;
  };
  const request = async (method, path, body) => {
    const response = await fetch(api + path, { method, headers: molisWorkControlHeaders(), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '角色请求失败');
    return payload;
  };
  const firstLine = text => String(text || '').split('\\n').map(line => line.trim()).find(Boolean) || '';
  const tag = (text, tone) => { const node = document.createElement('span'); node.className = 'characters-tag' + (tone ? ' characters-tag--' + tone : ''); node.textContent = text; return node; };
  const chevron = () => { const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); mark.setAttribute('class', 'characters-row-chevron'); mark.setAttribute('aria-hidden', 'true'); const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#icon-chevron-right'); mark.append(use); return mark; };
  // One row per Character: its name, the first line of how it works, and where it stands (state, what is published, unsaved edits).
  const renderList = () => {
    list.replaceChildren();
    const visible = records.filter(record => record.state !== 'tombstoned');
    q('empty').hidden = visible.length > 0;
    for (const record of visible) {
      const item = document.createElement('div'); item.setAttribute('role', 'listitem');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'characters-row';
      button.dataset.characterId = record.character_id; button.setAttribute('aria-current', record.character_id === selected ? 'page' : 'false');
      const copy = document.createElement('span'); copy.className = 'characters-row-copy';
      const title = document.createElement('strong'); title.textContent = record.title || '未命名角色';
      const line = document.createElement('small'); line.textContent = firstLine(record.instructions) || '还没写做事方式';
      copy.append(title, line);
      const meta = document.createElement('span'); meta.className = 'characters-row-meta';
      const latest = publications.filter(item => item.payload?.character_id === record.character_id && item.lifecycle_state === 'active').sort((a, b) => b.version - a.version)[0];
      if (record.state === 'disabled') meta.append(tag('已停用', 'quiet'));
      if (latest) meta.append(tag('已发布 v' + latest.version, 'done')); else meta.append(tag('未发布', 'quiet'));
      if (record.import_snapshot) meta.append(tag('本机导入'));
      if (drafts[record.character_id]) meta.append(tag('有未保存的修改', 'attention'));
      button.append(copy, meta, chevron()); button.addEventListener('click', () => { if (!busy) select(record.character_id); });
      item.append(button); list.append(item);
    }
  };
  const renderVersions = () => {
    const target = q('publications'); target.replaceChildren();
    const versions = publications.filter(record => record.payload?.character_id === selected).sort((a, b) => b.version - a.version);
    if (!versions.length) { target.textContent = '尚未发布到当前项目。'; return; }
    for (const record of versions) {
      const details = document.createElement('details'), summary = document.createElement('summary'), content = document.createElement('pre');
      summary.textContent = 'v' + record.version + ' · ' + record.payload.title + ' · ' + (record.lifecycle_state !== 'active' || record.availability !== 'available' ? '当前不可用' : '已发布') + ' · 草稿修订 ' + record.payload.source.draft_revision;
      content.textContent = record.payload.instructions + '\\n\\n内置工具：' + (record.payload.host_tools === null ? '沿用调用方' : record.payload.host_tools.join(', ') || '不用内置工具');
      content.textContent += '\\n动作能力：' + actionsView.describe(record.payload.action_tools);
      details.append(summary, content); importsView?.renderPublication(record, details); target.append(details);
    }
  };
  const renderEditor = () => {
    const record = current(); q('workspace').hidden = !record; root.dataset.expanded = record ? 'true' : 'false';
    if (!record) { importsView?.render(null); return; }
    const local = drafts[selected], value = local || record;
    revision = local ? local.expected_revision : record.revision;
    q('title').value = value.title; q('instructions').value = value.instructions;
    q('inherit').checked = value.host_tools === null; q('tools').value = (value.host_tools || []).join(', '); q('tools-field').hidden = q('inherit').checked;
    actionsView.render(value.action_tools);
    q('heading').textContent = record.title;
    const published = publications.filter(item => item.payload?.character_id === record.character_id && item.lifecycle_state === 'active').sort((a, b) => b.version - a.version)[0];
    q('status').textContent = record.state === 'disabled' ? '已停用' : record.state === 'tombstoned' ? '已删除'
      : published ? '已发布 v' + published.version + (published.payload.source?.draft_revision === record.revision ? '' : ' · 草稿有新修改') : '草稿 · 未发布';
    q('toggle').textContent = record.state === 'disabled' ? '启用' : '停用';
    q('draft-note').textContent = local ? (record.revision !== revision ? '其他窗口已更新；你的修改仍保留。请核对后重新读取，不能直接覆盖新修订。' : '已恢复此窗口未保存的修改。') : '已保存。发布会固定这份内容，已有执行保持原版本。';
    renderVersions(); importsView?.render(record); controls();
  };
  const controls = () => {
    const record = current();
    root.querySelectorAll('button, input, textarea').forEach(element => { if(!element.closest('[data-character-import-dialog], [data-character-run-dialog]')) element.disabled = busy; });
    if (record?.state === 'tombstoned') form.querySelectorAll('button, input, textarea').forEach(element => { element.disabled = true; });
    if (record?.state !== 'active') q('preview').disabled = true;
    actionsView?.controls(busy || record?.state === 'tombstoned');
  };
  const select = (id, focus = true) => {
    const previous = selected;
    selected = id; note(''); renderList(); renderEditor();
    if (!focus) return;
    // Opening a Character lands on its heading; going back lands on the row it came from.
    requestAnimationFrame(() => {
      if (id) q('heading')?.focus({ preventScroll: false });
      else if (previous) list.querySelector('[data-character-id="' + CSS.escape(previous) + '"]')?.focus();
      root.scrollIntoView?.({ block: 'start' });
    });
  };
  const load = async () => { const result = await request('GET', '/drafts'); records = result.drafts; publications = result.publications; renderList(); renderEditor(); };
  const act = async action => {
    if (busy) return; busy = true; controls();
    try { await action(); } catch (error) { note(error.message || '操作失败，未保存的修改仍保留。'); }
    finally { busy = false; controls(); }
  };
  const save = async () => {
    const id = selected;
    const result = await request('PUT', '/drafts/' + encodeURIComponent(id), { ...values(), expected_revision: revision });
    delete drafts[id]; persist(); records = records.map(record => record.character_id === id ? result.draft : record); revision = result.draft.revision;
    renderList(); renderEditor(); note('草稿已保存。'); return result.draft;
  };
  const confirm = (title, description, content, label, action) => {
    confirmation = action; q('dialog-title').textContent = title; q('dialog-description').textContent = description;
    q('dialog-content').textContent = content; q('confirm').textContent = label; dialog.showModal();
  };
  const editable = event => { if(event.target.matches('[data-character-title], [data-character-instructions], [data-character-inherit], [data-character-tools]')) remember(); };
  form.addEventListener('input', editable);
  form.addEventListener('change', editable);
  form.addEventListener('submit', event => { event.preventDefault(); void act(save); });
  q('new').addEventListener('click', () => void act(async () => { const result = await request('POST', '/drafts', {}); await load(); select(result.draft.character_id, false); requestAnimationFrame(() => { q('title').focus(); q('title').select(); }); }));
  q('back').addEventListener('click', () => { if (!busy) select(null); });
  q('preview').addEventListener('click', () => void act(async () => {
    const record = dirty() ? await save() : current();
    if (!record?.instructions.trim()) throw new Error('先填写角色的做事方式，再发布。');
    const frozenId = record.character_id, frozenRevision = record.revision;
    confirm('发布「' + record.title + '」', '将草稿修订 ' + frozenRevision + ' 的以下内容发布到当前项目。Coding 仍需明确选择此版本。',
      record.instructions + '\\n\\n内置工具：' + (record.host_tools === null ? '沿用调用方' : record.host_tools.join(', ') || '不用内置工具') + '\\n动作能力：' + actionsView.describe(record.action_tools), '发布到当前项目', async () => {
        const result = await request('POST', '/drafts/' + encodeURIComponent(frozenId) + '/publish', { expected_revision: frozenRevision });
        dialog.close(); await load(); note((result.replayed ? '当前草稿已发布，复用' : '已发布') + ' v' + result.reference.version + '，内容已固定。');
      });
  }));
  q('toggle').addEventListener('click', () => {
    const record = current(); if (!record) return;
    const id = record.character_id, expected = revision, state = record.state === 'disabled' ? 'active' : 'disabled';
    confirm(state === 'active' ? '启用角色' : '停用角色', state === 'active' ? '启用后，可在新执行中明确选择已发布版本。' : '新的执行不能再选择此角色；内置引擎后续动作调用也会停止。已完成的操作和历史版本保持。', record.title, state === 'active' ? '启用' : '停用', async () => {
      await request('POST', '/drafts/' + encodeURIComponent(id) + '/state', { expected_revision: expected, state });
      // Keep unsubmitted text; state transitions advance the revision without changing that text.
      if (drafts[id]) { drafts[id].expected_revision = expected + 1; persist(); }
      dialog.close(); await load(); note(state === 'active' ? '已启用。' : '已停用。');
    });
  });
  q('delete').addEventListener('click', () => {
    const record = current(); if (!record) return;
    const id = record.character_id, expected = revision;
    confirm('删除角色', '删除后不能恢复这个角色；所有项目的新执行都不能再选择它。历史执行及其固定内容保留。', record.title, '删除角色', async () => {
      await request('POST', '/drafts/' + encodeURIComponent(id) + '/state', { expected_revision: expected, state: 'tombstoned' });
      delete drafts[id]; persist(); selected = null; dialog.close(); await load(); note('角色已删除，历史执行保留。');
    });
  });
  q('reload').addEventListener('click', () => {
    const id = selected;
    confirm('重新读取草稿', '放弃此窗口尚未保存的修改，读取最新保存版本。', '', '重新读取', async () => { delete drafts[id]; persist(); dialog.close(); await load(); note('已读取最新草稿。'); });
  });
  q('confirm').addEventListener('click', () => void act(async () => { if (confirmation) await confirmation(); }));
  dialog.addEventListener('close', () => { confirmation = null; });
  // The system's and Plugins' Characters are registered with the Host; they are changed where their prompts are.
  const EXECUTION = { 'read-only': '只读', 'text-edit': '可改文字', 'workspace-write': '可改文件、运行命令', operate: '可调用业务能力' };
  const renderBuiltin = async () => {
    const box = q('builtin-list'), section = q('builtin');
    try {
      const response = await fetch(section.dataset.characterBuiltinApi, { headers: molisWorkControlHeaders() });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '读取失败');
      const roles = [...payload.roles].sort((a, b) => (a.source.kind === 'system' ? 0 : 1) - (b.source.kind === 'system' ? 0 : 1));
      box.replaceChildren();
      if (!roles.length) { box.textContent = '没有登记的系统或插件角色。'; return; }
      // They are the Home's, not the project's; the prompts page opens in the same settings, for this project.
      const parts = location.pathname.split('/'), project = parts[1] === 'projects' ? parts[2] : '';
      const groups = new Map();
      for (const role of roles) {
        const owner = role.source.kind === 'system' ? '系统' : role.source.title + (role.source.plugin_version ? ' ' + role.source.plugin_version : '');
        if (!groups.has(owner)) groups.set(owner, []);
        groups.get(owner).push(role);
      }
      for (const [owner, members] of groups) {
        const heading = document.createElement('p'); heading.className = 'characters-group-label'; heading.textContent = owner; box.append(heading);
        for (const role of members) {
          const item = document.createElement('div'); item.setAttribute('role', 'listitem');
          const link = document.createElement('a'); link.className = 'characters-row characters-builtin-item';
          link.href = section.dataset.characterBuiltinSettings + '?role=' + encodeURIComponent(role.key) + (project ? '&project=' + project : '') + (new URLSearchParams(location.search).get('desktop') === '1' ? '&desktop=1' : '');
          const copy = document.createElement('span'); copy.className = 'characters-row-copy';
          const name = document.createElement('strong'); name.textContent = role.name;
          const line = document.createElement('small'); line.textContent = '由 ' + role.prompt_keys.length + ' 段提示词组成 · 打开可以查看和修改';
          copy.append(name, line);
          const meta = document.createElement('span'); meta.className = 'characters-row-meta';
          meta.append(tag(EXECUTION[role.execution] || role.execution));
          if (role.subagent) meta.append(tag('子任务', 'quiet'));
          if (role.edited) meta.append(tag('含你的修改', 'attention'));
          link.append(copy, meta, chevron());
          item.append(link); box.append(item);
        }
      }
    } catch (error) {
      box.textContent = '系统与插件角色暂时读不到：' + (error.message || '请稍后重试');
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'mw-btn mw-btn--secondary mw-btn--sm'; retry.textContent = '重试';
      retry.addEventListener('click', () => { retry.disabled = true; void renderBuiltin(); });
      box.append(' ', retry);
    }
  };
  void renderBuiltin();
  importsView = (${CHARACTER_IMPORT_CLIENT_FACTORY})({root,q,request,current,load,select,act,save,dirty,note});
  actionsView = (${CHARACTER_ACTION_CLIENT})({q,request,changed:remember});
  void actionsView.refresh();
  void act(load);
}`;
