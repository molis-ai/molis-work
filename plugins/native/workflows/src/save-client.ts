// This fragment runs in the Workflows factory. Each queued patch owns its source object and an immutable body;
// only its revision advances after a receipt. A failed save pauses that object's later patches and keeps its
// latest edits in this tab's session storage, until the person explicitly retries. Reads never replace them.
// Debounced fields flush before another edit or navigation, so an old timer cannot overwrite a later chain.
export const WORKFLOW_SAVE_SCRIPT = String.raw`
  const edits = new Map();
  const pendingEdits = new Map();
  let saveQueue = Promise.resolve();
  let saveShowTimer = 0;
  const draftKey = () => memoryKey() + ':drafts';
  function retainDrafts() {
    try { sessionStorage.setItem(draftKey(), JSON.stringify([...edits].filter(([, edit]) => Object.keys(edit.patch).length).map(([id, edit]) => [id, { flow: edit.flow, patch: edit.patch, error: edit.error }]))); }
    catch { /* The live editor still retains its draft if session storage is unavailable. */ }
  }
  try {
    for (const [id, edit] of JSON.parse(sessionStorage.getItem(draftKey()) || '[]')) edits.set(id, { ...edit, pending: 0, error: edit.error || L('保存失败') });
  } catch { /* An unreadable saved draft does not prevent opening the stored workflow. */ }
  const draftOf = (flow) => {
    if (!edits.has(flow.workflow_id)) edits.set(flow.workflow_id, { flow, patch: {}, pending: 0, error: null });
    return edits.get(flow.workflow_id);
  };
  const applyPatch = (flow, patch) => Object.assign(flow, patch.chain || {}, patch.title === undefined ? {} : { title: patch.title });
  function adoptWorkflow(row) {
    const edit = edits.get(row.workflow_id);
    if (!edit) return row;
    if (!edit.pending && row.revision >= edit.flow.revision) applyPatch(Object.assign(edit.flow, row), edit.patch);
    return edit.flow;
  }
  function setSaveState(mode) {
    const edit = state.workflow && edits.get(state.workflow.workflow_id);
    mode ||= edit?.error ? 'error' : edit?.pending ? 'saving' : 'saved';
    const el = root.dataset.wfMode === 'workflow' && view.querySelector('[data-wf-save-state]');
    if (!el) return;
    el.dataset.state = mode; el.title = edit?.error || '';
    el.innerHTML = mode === 'error' ? tx('保存失败') + ' <button type="button" class="mw-btn mw-btn--link" data-wf-action="retry-save"' + (edit?.pending ? ' disabled' : '') + '>' + tx('重试') + '</button>'
      : mode === 'saving' ? '<span class="mw-spinner" aria-hidden="true"></span><span>' + tx('正在保存…') + '</span>' : ico('check') + '<span>' + tx('已保存') + '</span>';
  }
  function flushEdits() {
    const pending = [...pendingEdits.values()]; pendingEdits.clear();
    for (const edit of pending) { clearTimeout(edit.timer); saveWorkflow(edit.patch, edit.flow); }
  }
  function debounceEdit(flow, patch, field, delay) {
    clearTimeout(pendingEdits.get(field)?.timer);
    const edit = { flow, patch: JSON.parse(JSON.stringify(patch)), timer: 0 };
    edit.timer = setTimeout(() => { pendingEdits.delete(field); saveWorkflow(edit.patch, flow); }, delay);
    pendingEdits.set(field, edit);
  }
  const undoStack = [];
  const configured = (link) => link.kind !== 'manual' || Boolean(link.title_template || link.body_template || link.instructions);
  function undo() {
    const flow = state.workflow; const last = undoStack.pop();
    if (!flow || !last || last.id !== flow.workflow_id) { undoStack.length = 0; return false; }
    if (pop.matches(':popover-open')) pop.hidePopover();
    saveWorkflow({ chain: last.chain, undo: true }); toast(L('已撤回这次改动')); return true;
  }
  function saveWorkflow(patch, flow = state.workflow) {
    if (!flow) return;
    flushEdits();
    if (patch.chain && patch.undoable) {
      undoStack.push({ id: flow.workflow_id, chain: JSON.parse(JSON.stringify({ stations: flow.stations, links: flow.links })) });
      if (undoStack.length > 30) undoStack.shift();
    }
    const lost = patch.chain && patch.undoable ? flow.links.filter(configured).length - patch.chain.links.filter(configured).length : 0;
    applyPatch(flow, patch);
    const body = JSON.parse(JSON.stringify({ ...(patch.chain ? { chain: patch.chain } : {}), ...(patch.title === undefined ? {} : { title: patch.title }) }));
    const edit = draftOf(flow); Object.assign(edit.patch, JSON.parse(JSON.stringify(body))); retainDrafts();
    if (state.workflow === flow) {
      renderWorkflow(); renderList();
      if (patch.announce) toast(patch.announce, '', { label: L('撤销'), run: undo });
      else if (lost > 0) toast(L('{count} 段交接变回了手动', { count: lost }), '', { label: L('撤销'), run: undo });
    }
    if (edit.error) { if (state.workflow === flow) setSaveState(); return; }
    edit.pending += 1;
    clearTimeout(saveShowTimer); saveShowTimer = setTimeout(() => { if (state.workflow === flow && edit.pending) setSaveState(); }, 260);
    saveQueue = saveQueue.then(async () => {
      try {
        if (edit.error) return;
        const result = await api('/' + flow.workflow_id, { ...body, revision: flow.revision });
        flow.revision = result.workflow.revision;
        const row = state.workflows.find(item => item.workflow_id === flow.workflow_id);
        if (row) { Object.assign(row, result.workflow); renderList(); }
        if (edit.pending === 1) edit.patch = {};
      } catch (error) {
        edit.error = error.message; retainDrafts();
        try { const result = await api('/' + flow.workflow_id); applyPatch(Object.assign(flow, result.workflow), edit.patch); }
        catch { /* Keep the original save error and local edits when the owner cannot be reloaded. */ }
        if (state.workflow === flow) { renderWorkflow(); toast(error.message, 'error'); }
      } finally {
        edit.pending -= 1; retainDrafts();
        if (state.workflow === flow) { clearTimeout(saveShowTimer); setSaveState(); publishContext(); }
      }
    });
  }
  function retrySave() {
    const flow = state.workflow; const edit = flow && edits.get(flow.workflow_id);
    if (!edit?.error || edit.pending) return;
    edit.error = null; saveWorkflow(edit.patch, flow);
  }
`;
