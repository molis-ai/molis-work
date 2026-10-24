// This fragment runs in the Workflows factory. Each queued patch owns its source object and an immutable body;
// only its revision advances after a receipt. A failed save pauses that object's later patches and keeps its
// latest edits in this tab's session storage, until the person explicitly retries. Reads never replace them.
// Debounced fields flush before another edit or navigation, so an old timer cannot overwrite a later chain.
export const WORKFLOW_SAVE_SCRIPT = String.raw`
  const edits = new Map();
  const pendingEdits = new Map();
  let queue = Promise.resolve();
  let saveId = 0;
  const draftId = () => stateKey() + ':drafts';
  function retain() {
    try { sessionStorage.setItem(draftId(), JSON.stringify([...edits].filter(([, edit]) => Object.keys(edit.patch).length).map(([id, edit]) => [id, { flow: edit.flow, patch: edit.patch, error: edit.error }]))); }
    catch { /* The live editor still retains its draft if session storage is unavailable. */ }
  }
  try {
    for (const [id, edit] of JSON.parse(sessionStorage.getItem(draftId()) || '[]')) edits.set(id, { ...edit, pending: 0, error: edit.error || L('workflows.save.failed') });
  } catch { /* An unreadable saved draft does not prevent opening the stored workflow. */ }
  const draftOf = (flow) => {
    if (!edits.has(flow.workflow_id)) edits.set(flow.workflow_id, { flow, patch: {}, pending: 0, error: null });
    return edits.get(flow.workflow_id);
  };
  const applyPatch = (flow, patch) => Object.assign(flow, patch.chain || {}, patch.title === undefined ? {} : { title: patch.title });
  function adoptFlow(row) {
    const edit = edits.get(row.workflow_id);
    if (!edit) return row;
    if (!edit.pending && row.revision >= edit.flow.revision) applyPatch(Object.assign(edit.flow, row), edit.patch);
    return edit.flow;
  }
  function paintSave(mode) {
    const edit = ui.workflow && edits.get(ui.workflow.workflow_id);
    mode ||= edit?.error ? 'error' : edit?.pending ? 'unsaved' : 'saved';
    const el = root.dataset.wfMode === 'workflow' && view.querySelector('[data-wf-save-state]');
    if (!el) return;
    el.dataset.state = mode; el.dataset.mwState = mode === 'error' ? 'failed' : mode; el.title = edit?.error || '';
    el.innerHTML = mode === 'error' ? tx('workflows.save.failed') + ' <button type="button" class="mw-btn mw-btn--link" data-wf-action="retry-save"' + (edit?.pending ? ' disabled' : '') + '>' + tx('workflows.save.retry') + '</button>'
      : mode === 'saving' ? '<span class="mw-spinner" aria-hidden="true"></span><span>' + tx('workflows.save.saving') + '</span>' : mode === 'unsaved' ? tx('workflows.save.unsaved') : ico('check') + '<span>' + tx('workflows.save.saved') + '</span>';
  }
  function flushSave() {
    const pending = [...pendingEdits.values()]; pendingEdits.clear();
    for (const edit of pending) { clearTimeout(edit.timer); saveFlow(edit.patch, edit.flow); }
  }
  function debounce(flow, patch, field, delay) {
    clearTimeout(pendingEdits.get(field)?.timer);
    const edit = { flow, patch: JSON.parse(JSON.stringify(patch)), timer: 0 };
    edit.timer = setTimeout(() => { pendingEdits.delete(field); saveFlow(edit.patch, flow); }, delay);
    pendingEdits.set(field, edit);
  }
  const undos = [];
  const configured = (link) => link.kind !== 'manual' || Boolean(link.title_template || link.body_template || link.instructions);
  function undo() {
    const flow = ui.workflow; const last = undos.pop();
    if (!flow || !last || last.id !== flow.workflow_id) { undos.length = 0; return false; }
    if (pop.matches(':popover-open')) pop.hidePopover();
    saveFlow({ chain: last.chain, undo: true }); toast(L('workflows.toast.undone')); return true;
  }
  function saveFlow(patch, flow = ui.workflow) {
    if (!flow) return;
    flushSave();
    if (patch.chain && patch.undoable) {
      undos.push({ id: flow.workflow_id, chain: JSON.parse(JSON.stringify({ stations: flow.stations, links: flow.links })) });
      if (undos.length > 30) undos.shift();
    }
    const lost = patch.chain && patch.undoable ? flow.links.filter(configured).length - patch.chain.links.filter(configured).length : 0;
    applyPatch(flow, patch);
    const body = JSON.parse(JSON.stringify({ ...(patch.chain ? { chain: patch.chain } : {}), ...(patch.title === undefined ? {} : { title: patch.title }) }));
    const edit = draftOf(flow); Object.assign(edit.patch, JSON.parse(JSON.stringify(body))); retain();
    if (!edit.error) edit.pending += 1;
    if (ui.workflow === flow) {
      drawFlow(); drawList();
      if (patch.announce) toast(patch.announce, '', { label: L('workflows.toast.undo'), run: undo });
      else if (lost > 0) toast(L('workflows.toast.back-to-manual', { count: lost }), '', { label: L('workflows.toast.undo'), run: undo });
    }
    if (edit.error) { if (ui.workflow === flow) paintSave(); return; }
    clearTimeout(saveId); saveId = setTimeout(() => { if (ui.workflow === flow && edit.pending) paintSave('saving'); }, 260);
    queue = queue.then(async () => {
      try {
        if (edit.error) return;
        const res = await api('/' + flow.workflow_id, { ...body, revision: flow.revision });
        flow.revision = res.workflow.revision;
        const row = ui.workflows.find(item => item.workflow_id === flow.workflow_id);
        if (row) { Object.assign(row, res.workflow); drawList(); }
        if (edit.pending === 1) edit.patch = {};
      } catch (err) {
        edit.error = err.message; retain();
        try { const res = await api('/' + flow.workflow_id); applyPatch(Object.assign(flow, res.workflow), edit.patch); }
        catch { /* Keep the original save error and local edits when the owner cannot be reloaded. */ }
        if (ui.workflow === flow) { drawFlow(); toast(err.message, 'error'); }
      } finally {
        edit.pending -= 1; retain();
        if (ui.workflow === flow) { clearTimeout(saveId); paintSave(); emitCtx(); }
      }
    });
  }
  function retrySave() {
    const flow = ui.workflow; const edit = flow && edits.get(flow.workflow_id);
    if (!edit?.error || edit.pending) return;
    edit.error = null; saveFlow(edit.patch, flow);
  }
`;
