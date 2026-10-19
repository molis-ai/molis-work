/**
 * A capture in the background. Sending hands the words and screenshots to a draft the Issue plugin keeps, then asks
 * Issue to name and save it (`issues.name_draft`: one call to the Host's text model inside Issue's own action, ISSUE-50);
 * the save can be undone, so nobody confirms it first. A saved record shows up in the list with Undo; anything else
 * (a question, a failure, no model) stays as a row that opens into the editor with nothing lost.
 */
export const ISSUE_CAPTURE_CLIENT_SCRIPT = String.raw`
  const ready = () => { $('submit').disabled = Boolean(importing || restoring || pictureWrites) || !desc.value.trim() && !images.length; };
  // The page the person was on, as the shell reports it; a report, never proof of what was on screen.
  const where = () => { try { return host.page?.() || null; } catch { return null; } };
  // Unfinished captures are kept on this device as well, so leaving the page loses none of their words (pictures stay
  // with the page) nor why one is waiting. Coming back, one that was saved meanwhile drops out once the list shows it.
  // Another open Issue view keeps its own entries: each view replaces only the ones it holds.
  const UNSENT = 'molis:issue-unsent';
  let held = new Set();
  const remember = () => { try {
    const others = JSON.parse(localStorage.getItem(UNSENT) || '[]').filter(entry => !held.has(entry.id));
    held = new Set(pending.map(item => item.id));
    localStorage.setItem(UNSENT, JSON.stringify([...others, ...pending.map(({ images, state, ...entry }) => ({ ...entry, shots: images.length }))]));
  } catch { /* Kept in this page only. */ } };
  // The row is the one place to continue (more words, a failure): opening it shows the words and pictures as they were.
  const attention = (item, note, kind = 'failed') => { item.state = 'attention'; item.note = note; item.kind = kind; render(); };
  const saved = (item, issue) => {
    drop(item); add(issue); render();
    toast(L('已记录：') + issue.title, L('撤销'), () => undo(issue, item));
  };
  // Why naming did not work, as the person reads it on the row; the words and pictures are kept either way. A refusal with
  // its own reason (a picture over the limit, too many unsaved captures, a model reply Issue cannot use) says it in its own
  // words; a failure with no code of ours, an internal one, or a model answer that was not JSON has no wording worth showing.
  const failure = error => ['actions.connection_required', 'plugin.model_failed'].includes(error.code) ? L('模型暂时不可用，点开手动保存，或检查模型设置')
    : error.code === 'actions.timeout' ? L('整理超时，点开补全标题和类型')
    : error.code && !['actions.execution_failed', 'plugin.model_output_invalid'].includes(error.code) ? error.message : L('没能自动整理，点开补全标题和类型');
  const organize = async item => {
    item.state = 'organizing'; item.note = ''; item.at = Date.now(); render();
    let over = false;
    const live = () => !over && item.state === 'organizing' && pending.includes(item);
    // Beside the model's own limit: still waiting after two minutes, the draft is retired first, so a late answer
    // cannot save beside one made by hand.
    const overdue = () => {
      if (!live()) return;
      if (Date.now() - item.at <= 120000) { scope.timeout(overdue, 1000); return; }
      over = true;
      release(item).then(already => { if (already) saved(item, already); else attention(item, L('整理超时，点开补全标题和类型')); }, error => attention(item, error.message));
    };
    overdue();
    try {
      await api('prepare', { draft_id: item.id, description: item.text, images: item.images, ...(item.page ? { page: item.page } : {}) });
      const result = await api('name-draft', { draft_id: item.id });
      if (!live()) return;
      if (result.status === 'saved') saved(item, result.issue); else attention(item, L('需要补充：') + L(result.question), 'question');
    } catch (error) {
      if (error.name === 'AbortError' || !live()) return;
      // The answer was lost on the way back: the record may be there already.
      if (error.status === undefined) { const already = await read(item.id).catch(() => null); if (already) { saved(item, already); return; } }
      attention(item, failure(error));
    }
  };
  const submit = async () => {
    if (importing || restoring || pictureWrites || !desc.value.trim() && !images.length) return;
    const item = { id: crypto.randomUUID(), text: desc.value, images, page: where(), at: Date.now() };
    const cleared = pictures(() => []);
    pending.unshift(item); desc.value = ''; images = [];
    try { localStorage.removeItem(KEY); } catch { /* Nothing kept, nothing to clear. */ }
    paint(); fit(desc); desc.focus();
    try { await cleared; await organize(item); } catch (error) { attention(item, error.message); }
  };
  // Undo takes the record back while nobody has changed it, and returns the words to an empty composer.
  const undo = async (issue, item) => {
    await api('discard', { id: issue.id, expected_version: issue.version });
    rows = rows.filter(row => row.id !== issue.id); render();
    if (!desc.value.trim() && !images.length) { desc.value = item.text; const restored = pictures(() => item.images); try { localStorage.setItem(KEY, desc.value); } catch { /* The live draft remains available. */ } paint(); fit(desc); desc.focus(); toast(L('已撤销，内容放回了输入框')); await restored; }
    else toast(L('已撤销'));
  };
  const drop = item => { pending = pending.filter(entry => entry !== item); };
  const add = issue => { rows = [issue, ...rows.filter(row => row.id !== issue.id)]; fresh = issue.id; };
  // Retires an unfinished draft. It may have been saved meanwhile: then that record is the result.
  const release = async item => {
    await api('cancel-capture', { draft_id: item.id });
    try { return await read(item.id); }
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
