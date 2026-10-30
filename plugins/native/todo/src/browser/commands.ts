import type { TodoBatch } from "../contract.js";
import { arrive, closeMenu } from "./dom.js";
import { undoOf } from "./page.js";
import { applyLabel, choiceFor, keptDecisions } from "./review-choices.js";
import type { ApplyPayload, CandidateDecision, ItemPayload, RevertPayload, TodoPage } from "./types.js";

const code = (error: unknown) => (error as { code?: string }).code;

/** Applies decisions to a batch of organizing candidates and says what was done. */
async function decide(page: TodoPage, batch: TodoBatch, decisions: CandidateDecision[], text: string): Promise<void> {
  const payload = await page.request<ApplyPayload>("POST", `/organize/${encodeURIComponent(batch.batch_id)}/apply`, { expected_revision: batch.revision, decisions });
  for (const decision of decisions) page.state.choices.delete(decision.candidate_id);
  await page.load();
  page.showNote(text, { undo: payload.results.some((result) => result.item_id) ? { batch_id: payload.change_batch_id } : null });
}

/** A command answers `true` once it has handled the click; the first to do so ends the chain. */
type Command = (page: TodoPage, button: HTMLButtonElement) => Promise<boolean>;

const listControls: Command = async (page, button) => {
  const { state, el, L } = page;
  const data = button.dataset;
  if (button.matches("[data-todo-view]")) { state.view = data.todoView ?? "today"; state.picked.clear(); await page.load(); return true; }
  if (button.matches("[data-todo-scope]")) { state.everything = !state.everything; await page.load(); return true; }
  if (button.matches("[data-todo-quick-drop]")) { state.dropped.add(data.todoQuickDrop ?? ""); page.renderQuick(); el.quickInput.focus(); return true; }
  if (button.matches("[data-todo-quick-placement-choice]")) {
    state.placeChoice = data.todoQuickPlacementChoice ?? "";
    try { window.localStorage.setItem("molis.todo.quick-placement", state.placeChoice); } catch { /* storage may be unavailable: the choice then lasts only this page */ }
    page.paintPlaces(el.quickPlacement, page.quickDefaultPlacement(), "data-todo-quick-placement-choice");
    return true;
  }
  if (button.matches("[data-todo-note-view]") && state.noteView) {
    const target = state.noteView;
    state.noteView = null;
    el.viewButton.hidden = true;
    state.view = target.key;
    state.picked.clear();
    await page.load();
    arrive(el.rowsEl.querySelector<HTMLElement>(`[data-todo-row="${target.id}"]`));
    return true;
  }
  if (button.matches("[data-todo-undo]") && state.undo) {
    const target = state.undo;
    state.undo = null;
    el.undoButton.hidden = true;
    const payload = await page.request<RevertPayload>("POST", "/revert", target);
    await page.load();
    if (state.selected && payload.removed_ids.includes(state.selected.id)) await page.closeDetail();
    else if (state.selected) await page.openDetail(state.selected.id, true);
    page.showNote(L("todo.note.undone"));
    return true;
  }
  if (button.matches("[data-todo-done]")) {
    const item = state.items.find((entry) => entry.id === data.todoDone);
    if (item) await page.setStatus(item.id, item.status === "done" ? "open" : "done", item.revision);
    return true;
  }
  if (button.matches("[data-todo-id]")) { await page.openDetail(data.todoId ?? ""); return true; }
  return false;
};

const reviewControls: Command = async (page, button) => {
  const { state, L } = page;
  const data = button.dataset;
  const candidateId = data.todoCandidateIgnore || data.todoCandidateEditToggle || data.todoCandidateSuggest || data.candidate;
  const owner = candidateId ? page.candidateOf(candidateId) : null;
  if (owner && candidateId) {
    const { batch, candidate } = owner;
    const choice = choiceFor(page, candidate);
    if (data.todoCandidateIgnore) { await decide(page, batch, [{ candidate_id: candidateId, action: "ignore" }], L("todo.note.ignored-one", { title: candidate.title })); return true; }
    if (data.todoCandidateEditToggle) { choice.editing = !choice.editing; page.renderReview(); return true; }
    if (data.todoCandidateSuggest) { choice.edits.planned_date = candidate.suggested_date; page.renderReview(); return true; }
    if (data.todoCandidatePlacement) { choice.edits.placement = data.todoCandidatePlacement; page.renderReview(); return true; }
  }
  const batchId = data.todoApply || data.todoIgnoreRest || data.todoCloseBatch;
  const batch = batchId ? state.batches.find((entry) => entry.batch_id === batchId) : null;
  if (!batch) return false;
  if (data.todoCloseBatch) {
    await page.request("POST", `/organize/${encodeURIComponent(batch.batch_id)}/close`, {});
    await page.load();
    page.showNote(L("todo.note.put-away", { title: batch.title }));
    return true;
  }
  if (data.todoIgnoreRest) {
    const rest = batch.candidates.filter((candidate) => !candidate.decision && !choiceFor(page, candidate).picked);
    await decide(page, batch, rest.map((candidate) => ({ candidate_id: candidate.candidate_id, action: "ignore" })), L("todo.note.ignored-many", { count: rest.length }));
    return true;
  }
  await decide(page, batch, keptDecisions(page, batch), L("todo.note.processed", { what: applyLabel(page, batch) }));
  return true;
};

const reminderControls: Command = async (page, button) => {
  const { state, L } = page;
  const data = button.dataset;
  const reminder = state.reminders.find((entry) => [data.todoReminderDone, data.todoReminderAck, data.todoReminderClose, data.todoReminderLater].includes(entry.item.id));
  if (!reminder) return false;
  const item = reminder.item;
  if (data.todoReminderAck) { await page.request("POST", `/items/${encodeURIComponent(item.id)}/acknowledge`, {}); await page.loadReminders(); return true; }
  if (data.todoReminderDone) { await page.setStatus(item.id, "done", item.revision); return true; }
  const remindAt = data.todoReminderLater ? data.todoReminderAt ?? null : null;
  if (data.todoReminderLater) closeMenu(button);
  const payload = await page.post<ItemPayload>(item, "", { remind_at: remindAt });
  await page.load();
  if (state.selected && state.selected.id === item.id) await page.openDetail(item.id, true);
  page.showNote(remindAt ? L("todo.note.remind-again", { time: page.timeLabel(remindAt), title: item.title }) : L("todo.note.remind-off", { title: item.title }), { undo: undoOf(payload) });
  return true;
};

const batchControls: Command = async (page, button) => {
  const { state, L } = page;
  const data = button.dataset;
  if (button.matches("[data-todo-batch-action]")) {
    const action = data.todoBatchAction;
    if (action === "clear") { state.picked.clear(); page.renderList(); return true; }
    if (action === "done") await page.runBatch({ status: "done" }, (count) => L("todo.note.batch-done", { count }));
    if (action === "shift") await page.runBatch({ shift_days: 1 }, (count) => L("todo.note.batch-shift", { count }));
    if (action === "today") await page.runBatch({ planned_date: state.today }, (count) => L("todo.note.batch-today", { count }));
    if (action === "unplan") await page.runBatch({ planned_date: null }, (count) => L("todo.note.batch-unplan", { count }));
    if (action === "archive") await page.runBatch({ archive: true }, (count) => L("todo.note.batch-archive", { count }));
    return true;
  }
  if (button.matches("[data-todo-batch-placement]")) {
    closeMenu(button);
    const place = data.todoBatchPlacement ?? "";
    await page.runBatch({ placement: place }, (count) => L("todo.note.batch-moved-to", { count }) + page.placeName(place));
    return true;
  }
  return false;
};

/** What the open todo's page offers once something is open: another item, the Assistant, and the editor's own buttons. */
const detailControls: Command = async (page, button) => {
  const { state } = page;
  const data = button.dataset;
  if (button.matches("[data-todo-open-linked]")) { await page.openDetail(data.todoOpenLinked ?? ""); return true; }
  // Handing over or continuing: the same work whether started here or from the bottom bar, so an unfinished one goes on.
  if (button.matches("[data-todo-delegate]") && state.selected) {
    const going = state.works.find((work) => !["completed", "failed", "stopped"].includes(work.state));
    page.tellAssistant("delegate", state.selected, { materials: [page.material(state.selected)], ...(going ? { work_id: going.work_id } : {}) });
    page.watchWorks();
    return true;
  }
  if (button.matches("[data-todo-continue-work]") && state.selected) {
    page.tellAssistant("delegate", state.selected, { materials: [page.material(state.selected)], work_id: data.todoContinueWork });
    page.watchWorks();
    return true;
  }
  if (button.matches("[data-todo-back]")) { await page.closeDetail(); return true; }
  return false;
};

const editorControls: Command = async (page, button) => {
  const { state, L } = page;
  const data = button.dataset;
  const current = state.selected;
  if (!current) return false;
  if (button.matches("[data-todo-status]")) { await page.setStatus(current.id, data.todoStatus ?? "open", current.revision); return true; }
  if (button.matches("[data-todo-placement]")) {
    const payload = await page.post<ItemPayload>(current, "", { placement: data.todoPlacement });
    await page.load();
    await page.openDetail(payload.item.id);
    page.showNote(L("todo.note.moved-to") + page.placeName(data.todoPlacement ?? ""), { undo: undoOf(payload) });
    return true;
  }
  if (button.matches("[data-todo-revert]")) {
    const payload = await page.request<RevertPayload>("POST", "/revert", { change_id: data.todoRevert });
    await page.load();
    if (payload.removed_ids.includes(current.id)) { await page.closeDetail(); page.showNote(L("todo.note.create-undone")); }
    else { await page.openDetail(current.id); page.showNote(L("todo.note.undone")); }
    return true;
  }
  if (button.matches("[data-todo-link-add]")) {
    const target = page.$<HTMLSelectElement>("[data-todo-link-target]").value;
    if (!target) { page.detailHint(L("todo.link.pick-first"), true); return true; }
    const other = state.linkPool.find((entry) => entry.id === target);
    await page.post(current, "/link", { add: { kind: "todo", subject: { kind: "todo_item", id: target }, title: other ? other.title : target, relation: page.$<HTMLSelectElement>("[data-todo-link-relation]").value } });
    await page.openDetail(current.id);
    return true;
  }
  if (button.matches("[data-todo-unlink]")) { await page.post(current, "/link", { remove_link_id: data.todoUnlink }); await page.openDetail(current.id); return true; }
  if (button.matches("[data-todo-archive]")) {
    closeMenu(button);
    const payload = await page.post<ItemPayload>(current, "/archive", { archived: !current.archived_at });
    await page.load();
    await page.openDetail(payload.item.id);
    page.showNote(payload.item.archived_at ? L("todo.note.archived") : L("todo.note.restored"), { undo: undoOf(payload) });
    return true;
  }
  if (button.matches("[data-todo-reload]")) {
    if (state.saving) await state.saving.catch(() => undefined);
    closeMenu(button);
    if (state.dirtyKeys.size && !(await page.ask(L("todo.confirm.reload"), L("todo.action.reload")))) return true;
    state.dirtyKeys = new Set();
    await page.openDetail(current.id);
    return true;
  }
  if (button.matches("[data-todo-delete]")) {
    closeMenu(button);
    const title = current.title;
    const confirmed = await page.ask(L("todo.confirm.delete", { title }), L("todo.action.delete"), async () => {
      clearTimeout(state.saveTimer);
      state.saveTimer = 0;
      if (state.saving) await state.saving.catch(() => undefined);
      const live = state.selected;
      if (!live) return;
      try { await page.post(live, "/delete"); } catch (error) { if (code(error) === "todo.conflict") void page.load().catch(() => undefined); throw error; }
    });
    if (!confirmed) return true;
    state.dirtyKeys = new Set();
    await page.closeDetail();
    await page.load();
    page.showNote(L("todo.note.deleted", { title }));
    return true;
  }
  return false;
};

const CHAIN: Command[] = [listControls, reviewControls, reminderControls, detailControls, batchControls, editorControls];

/** One click on a button of the page. Anything but reload and delete first saves what is being typed. */
export async function runCommand(page: TodoPage, button: HTMLButtonElement): Promise<void> {
  const { L } = page;
  try {
    if (!button.matches("[data-todo-reload],[data-todo-delete]")) await page.flush();
    for (const command of CHAIN) if (await command(page, button)) return;
  } catch (error) {
    const message = (error as Error).message || L("todo.error.request");
    if (page.state.selected && button.closest("[data-todo-stage-workspace]")) page.detailHint(message, true);
    else page.showNote(message, { error: true });
    if (code(error) === "todo.conflict") void page.load().catch(() => undefined);
  }
}
