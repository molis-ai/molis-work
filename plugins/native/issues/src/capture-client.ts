/**
 * A capture in the background. Sending hands the words and screenshots to a draft the Issue plugin keeps, then asks
 * the Work Assistant (its public attachment, send and work contracts) to name and save it; the Assistant saves it
 * directly because the save can be undone. The page only watches the work: a saved record shows up in the list with
 * Undo, anything else (a question, a failure, a card when the person asked to confirm every time) stays as a row that
 * opens into the editor with nothing lost. Watching does not depend on the panel being open.
 */
export const ISSUE_CAPTURE_CLIENT_SCRIPT = String.raw`
  const ready = () => { $('submit').disabled = Boolean(importing) || !desc.value.trim() && !images.length; };
  // The page the person was on, as the shell reports it; a report, never proof of what was on screen.
  const where = () => { try { return host.page?.() || null; } catch { return null; } };
  const message = item => {
    const long = item.text.length > 19000, first = item.text.trim().split('\n')[0].slice(0, 40);
    return '记录 Issue：' + (first || '截图 ×' + item.images.length) + '\n录入草稿 ' + item.id + '。请按 Issue 方法处理。'
      + (item.page?.title ? '\n记录时所在页面：' + item.page.title + (item.page.url ? '（' + item.page.url + '）' : '') : '')
      + (item.images.length ? '\n附带 ' + item.images.length + ' 张截图。' : '')
      + '\n本次问题描述：\n' + (long ? '见附带的“问题描述”全文材料。' : item.text || '（没有文字，只有截图）');
  };
  // Unfinished captures are kept on this device as well, so leaving the page loses none of their words (pictures stay
  // with the page) nor why one is waiting. Coming back, one the Assistant has saved meanwhile drops out once the list shows it.
  // Another open Issue view keeps its own entries: each view replaces only the ones it holds.
  const UNSENT = 'molis:issue-unsent';
  let held = new Set();
  const remember = () => { try {
    const others = JSON.parse(localStorage.getItem(UNSENT) || '[]').filter(entry => !held.has(entry.id));
    held = new Set(pending.map(item => item.id));
    localStorage.setItem(UNSENT, JSON.stringify([...others, ...pending.map(({ images, state, ...entry }) => ({ ...entry, shots: images.length }))]));
  } catch { /* Kept in this page only. */ } };
  // The row is the one place to continue (more words, a card to check, a failure): the work behind it is stopped and
  // filed away, so the Assistant does not wait on the same question and the person meets it only once.
  const attention = (item, note, kind = 'failed') => { item.state = 'attention'; item.note = note; item.kind = kind; render(); void quiet(item, 1); };
  // Once this page has the outcome, the capture's work is filed away: the record (or this page) already says how it
  // went, so the Assistant's list and notices are not filled with one entry per Issue.
  const quiet = async (item, stop) => {
    if (!item.work) return;
    const at = '/api/assistant/works/' + encodeURIComponent(item.work);
    for (const [path, body] of [...(stop ? [[at + '/control', { kind: 'stop' }]] : []), [at + '/archive', { archived: true }], ['/api/assistant/notices', { work_id: item.work, state: 'dismissed' }]])
      await api(path, body).catch(() => { /* Over already, or not there: nothing to file away. */ });
  };
  const saved = (item, issue) => {
    drop(item); add(issue); render(); void quiet(item);
    toast(L('已记录：') + issue.title, L('撤销'), () => undo(issue, item));
  };
  const watch = async item => {
    if (!scope.alive || item.state !== 'organizing') return;
    let view;
    try { view = await api('/api/assistant/works/' + encodeURIComponent(item.work)); }
    catch (error) { if (error.name !== 'AbortError') scope.timeout(() => watch(item), 2000); return; }
    const round = view.rounds.at(-1), question = round?.awaiting_input?.find(entry => entry.answerable !== false);
    const card = view.cards.find(card => card.capability_id === 'issues.capture' && card.status === 'ready' && card.fields.some(field => field.key === 'draft_id' && field.value === item.id));
    if (['idle', 'running'].includes(view.work.state) && !question && !card) {
      if (Date.now() - item.at <= 120000) { scope.timeout(() => watch(item), 900); return; }
      // Too slow: the draft is retired first, so a late save cannot land beside one made by hand.
      const already = await release(item).catch(() => null);
      if (already) saved(item, already); else attention(item, L('整理超时，点开补全标题和类型'));
      return;
    }
    try { saved(item, await api('read?id=' + encodeURIComponent(item.id))); return; }
    catch (error) { if (error.status !== 404) { attention(item, error.message); return; } }
    if (card) {
      const field = key => card.fields.find(entry => entry.key === key);
      item.card = { title: field('title')?.value, type: field('type')?.raw || field('type')?.value };
      attention(item, L('请确认标题和类型后保存'), 'card');
    } else if (question) attention(item, L('需要补充：') + (question.questions?.[0]?.prompt || question.prompt), 'question');
    else attention(item, L(/MODEL_|model/i.test(round?.stop_reason || '') ? '模型暂时不可用，点开手动保存，或检查模型设置' : '没能自动整理，点开补全标题和类型'));
  };
  const organize = async item => {
    item.state = 'organizing'; item.note = ''; item.at = Date.now(); render();
    try {
      await api('prepare', { draft_id: item.id, description: item.text, images: item.images, ...(item.page ? { page: item.page } : {}) });
      const materials = [{ material_id: 'issue-method', kind: 'method', title: 'Issue', explicit: true, method: { method_id: 'io.molis.work.issues/issues-capture' } }];
      if (item.text.length > 19000) materials.push({ material_id: 'issue-description', kind: 'text', title: L('问题描述'), explicit: true, text: item.text });
      for (const image of item.images) materials.push((await api('/api/assistant/attachments', { name: image.name, data: image.data_url.split(',')[1] })).material);
      const result = await api('/api/assistant/send', { request_id: item.id, scope: { kind: 'personal' }, written_by: 'page', text: message(item), materials,
        context: { source: { surface: 'issues', title: item.page?.title || 'Issue' }, captured_at: new Date(item.at).toISOString() } });
      item.work = result.work.work_id; await watch(item);
    } catch (error) {
      if (error.name !== 'AbortError') attention(item, (error.message || L('没能交给助理整理')) + ' ' + L('点开可手动保存。'));
    }
  };
  const submit = async () => {
    if (importing || !desc.value.trim() && !images.length) return;
    const item = { id: crypto.randomUUID(), text: desc.value, images, page: where(), at: Date.now() };
    pending.unshift(item); desc.value = ''; images = [];
    try { localStorage.removeItem(KEY); } catch { /* Nothing kept, nothing to clear. */ }
    paint(); fit(desc); desc.focus();
    await organize(item);
  };
  // Undo takes the record back while nobody has changed it, and returns the words to an empty composer.
  const undo = async (issue, item) => {
    await api('discard', { id: issue.id, expected_version: issue.version });
    rows = rows.filter(row => row.id !== issue.id); render();
    if (!desc.value.trim() && !images.length) { desc.value = item.text; images = item.images; paint(); fit(desc); desc.focus(); toast(L('已撤销，内容放回了输入框')); }
    else toast(L('已撤销'));
  };
  const drop = item => { pending = pending.filter(entry => entry !== item); };
  const add = issue => { rows = [issue, ...rows.filter(row => row.id !== issue.id)]; fresh = issue.id; };
  // Retires an unfinished draft. The Assistant may have saved it meanwhile: then that record is the result.
  const release = async item => {
    await api('cancel-capture', { draft_id: item.id }); void quiet(item, true);
    try { return await api('read?id=' + encodeURIComponent(item.id)); }
    catch (error) { if (error.status !== 404) throw error; return null; }
  };
  const settled = async (item, issue, original) => {
    drop(item); add(issue); current = null; editing = false; await back();
    toast(L('已记录：') + issue.title, original ? L('撤销') : '', original && (() => undo(issue, original)));
  };
  const keep = async (item, data) => {
    const already = await release(item);
    if (already) return settled(item, already);
    // Retain the request identity before dispatch: a lost receipt is checked before another write.
    if (!item.manual) item.id = crypto.randomUUID();
    Object.assign(item, { manual: true, text: data.description, images: data.images, card: { title: data.title, type: data.type } }); remember();
    const id = item.id;
    await api('prepare', { draft_id: id, description: data.description, images: data.images, ...(item.page ? { page: item.page } : {}) });
    const issue = await api('capture', { draft_id: id, title: data.title, type: data.type });
    await settled(item, issue, item);
  };
  const redo = async item => {
    const text = detailInput.value, shot = edits;
    if (!text.trim() && !shot.length) { flag(L('先写一句话或加一张截图。')); return; }
    const already = await release(item);
    if (already) return settled(item, already);
    const next = { id: crypto.randomUUID(), text, images: shot, page: item.page, at: Date.now() };
    pending[pending.indexOf(item)] = next; current = null; editing = false; await back();
    await organize(next);
  };
  const abandon = async item => {
    if (!await confirm('放弃这条记录？', L('写下的内容和截图都不会保存。'), '放弃')) return;
    const already = await release(item);
    if (already) return settled(item, already);
    drop(item); current = null; editing = false; await back(); toast(L('已放弃这条记录'));
  };
  try {
    for (const entry of JSON.parse(localStorage.getItem(UNSENT) || '[]')) held.add(entry.id), pending.push({ ...entry, images: [], restored: true, state: 'attention', kind: entry.kind || 'failed',
      note: (entry.note || L('上次没有完成，点开继续')) + (entry.shots ? L('（截图要重新添加）') : '') });
  } catch { /* Nothing kept on this device. */ }
`;
