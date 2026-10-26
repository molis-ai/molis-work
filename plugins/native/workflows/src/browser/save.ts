import type { WorkflowLink } from "../model.js";
import { EASE_STANDARD, copy, esc, ico, messageOf, motion, uid } from "./dom.js";
import { drawFlow } from "./flow.js";
import { drawList } from "./list.js";
import { emitCtx } from "./nav.js";
import type { WorkflowsPage } from "./page.js";
import { insertStn, moveStation, removeStn } from "./chain.js";
import { label, stateKey, stnMeta } from "./state.js";
import { toast } from "./toast.js";
import type { Chain, Edit, Flow, Patch, SaveAnswer } from "./types.js";

type SaveMode = "error" | "unsaved" | "saved" | "saving";

const draftId = (page: WorkflowsPage) => stateKey(page) + ":drafts";
const configured = (link: WorkflowLink) => link.kind !== "manual" || Boolean(link.title_template || link.body_template || link.instructions);
const applyPatch = (flow: Flow, patch: { chain?: Chain; title?: string }) => Object.assign(flow, patch.chain || {}, patch.title === undefined ? {} : { title: patch.title });

/** Keeps what is not saved yet in this tab, so a reload does not lose it. */
function retain(page: WorkflowsPage) {
  try { sessionStorage.setItem(draftId(page), JSON.stringify([...page.edits].filter(([, edit]) => Object.keys(edit.patch).length).map(([id, edit]) => [id, { flow: edit.flow, patch: edit.patch, error: edit.error }]))); }
  catch { /* The live editor still retains its draft if session storage is unavailable. */ }
}

export function restoreDrafts(page: WorkflowsPage) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftId(page)) || "[]") as [string, Pick<Edit, "flow" | "patch" | "error">][];
    for (const [id, edit] of saved) page.edits.set(id, { ...edit, pending: 0, error: edit.error || page.L("workflows.save.failed") });
  } catch { /* An unreadable saved draft does not prevent opening the stored workflow. */ }
}

function draftOf(page: WorkflowsPage, flow: Flow): Edit {
  let edit = page.edits.get(flow.workflow_id);
  if (!edit) { edit = { flow, patch: {}, pending: 0, error: null }; page.edits.set(flow.workflow_id, edit); }
  return edit;
}

/** The workflow as the Host sent it, with whatever this tab has not saved yet laid back on top. */
export function adoptFlow(page: WorkflowsPage, row: Flow): Flow {
  const edit = page.edits.get(row.workflow_id);
  if (!edit) return row;
  if (!edit.pending && row.revision >= edit.flow.revision) applyPatch(Object.assign(edit.flow, row), edit.patch);
  return edit.flow;
}

export function paintSave(page: WorkflowsPage, mode?: SaveMode) {
  const { ui, root, view, L } = page;
  const edit = ui.workflow && page.edits.get(ui.workflow.workflow_id);
  const state: SaveMode = mode || (edit?.error ? "error" : edit?.pending ? "unsaved" : "saved");
  const el = root.dataset.wfMode === "workflow" ? view.querySelector<HTMLElement>("[data-wf-save-state]") : null;
  if (!el) return;
  el.dataset.state = state; el.dataset.mwState = state === "error" ? "failed" : state; el.title = edit?.error || "";
  el.innerHTML = state === "error" ? esc(L("workflows.save.failed")) + ` <button type="button" class="mw-btn mw-btn--link" data-wf-action="retry-save"${edit?.pending ? " disabled" : ""}>${esc(L("workflows.save.retry"))}</button>`
    : state === "saving" ? `<span class="mw-spinner" aria-hidden="true"></span><span>${esc(L("workflows.save.saving"))}</span>` : state === "unsaved" ? esc(L("workflows.save.unsaved")) : `${ico("check")}<span>${esc(L("workflows.save.saved"))}</span>`;
}

/** Sends the changes waiting out their delay now. */
export function flushSave(page: WorkflowsPage) {
  const waiting = [...page.pendingEdits.values()]; page.pendingEdits.clear();
  for (const edit of waiting) { clearTimeout(edit.timer); saveFlow(page, edit.patch, edit.flow); }
}

export function debounce(page: WorkflowsPage, flow: Flow, patch: Patch, field: string, delay: number) {
  clearTimeout(page.pendingEdits.get(field)?.timer);
  const edit = { flow, patch: copy(patch), timer: setTimeout(() => { page.pendingEdits.delete(field); saveFlow(page, edit.patch, flow); }, delay) };
  page.pendingEdits.set(field, edit);
}

export function undo(page: WorkflowsPage) {
  const { ui, pop, L } = page;
  const flow = ui.workflow, last = page.undos.pop();
  if (!flow || !last || last.id !== flow.workflow_id) { page.undos.length = 0; return false; }
  if (pop.matches(":popover-open")) pop.hidePopover();
  saveFlow(page, { chain: last.chain }); toast(page, L("workflows.toast.undone"));
  return true;
}

export function saveFlow(page: WorkflowsPage, patch: Patch, flow: Flow | null = page.ui.workflow) {
  const { ui, L } = page;
  if (!flow) return;
  flushSave(page);
  if (patch.chain && patch.undoable) {
    page.undos.push({ id: flow.workflow_id, chain: copy({ stations: flow.stations, links: flow.links }) });
    if (page.undos.length > 30) page.undos.shift();
  }
  const lost = patch.chain && patch.undoable ? flow.links.filter(configured).length - patch.chain.links.filter(configured).length : 0;
  applyPatch(flow, patch);
  const body = copy({ ...(patch.chain ? { chain: patch.chain } : {}), ...(patch.title === undefined ? {} : { title: patch.title }) });
  const edit = draftOf(page, flow); Object.assign(edit.patch, copy(body)); retain(page);
  if (!edit.error) edit.pending += 1;
  if (ui.workflow === flow) {
    drawFlow(page); drawList(page);
    if (patch.announce) toast(page, patch.announce, "", { label: L("workflows.toast.undo"), run: () => undo(page) });
    else if (lost > 0) toast(page, L("workflows.toast.back-to-manual", { count: lost }), "", { label: L("workflows.toast.undo"), run: () => undo(page) });
  }
  if (edit.error) { if (ui.workflow === flow) paintSave(page); return; }
  clearTimeout(page.saveId); page.saveId = setTimeout(() => { if (ui.workflow === flow && edit.pending) paintSave(page, "saving"); }, 260);
  page.queue = page.queue.then(async () => {
    try {
      if (edit.error) return;
      const answer = await page.api<SaveAnswer>("/" + flow.workflow_id, { ...body, revision: flow.revision });
      flow.revision = answer.workflow.revision;
      const row = ui.workflows.find((item) => item.workflow_id === flow.workflow_id);
      if (row) { Object.assign(row, answer.workflow); drawList(page); }
      if (edit.pending === 1) edit.patch = {};
    } catch (error) {
      edit.error = messageOf(error); retain(page);
      try { const answer = await page.api<SaveAnswer>("/" + flow.workflow_id); applyPatch(Object.assign(flow, answer.workflow), edit.patch); }
      catch { /* Keep the original save error and local edits when the owner cannot be reloaded. */ }
      if (ui.workflow === flow) { drawFlow(page); toast(page, messageOf(error), "error"); }
    } finally {
      edit.pending -= 1; retain(page);
      if (ui.workflow === flow) { clearTimeout(page.saveId); paintSave(page); emitCtx(page); }
    }
  });
}

export function retrySave(page: WorkflowsPage) {
  const { ui } = page;
  const flow = ui.workflow, edit = flow && page.edits.get(flow.workflow_id);
  if (!flow || !edit?.error || edit.pending) return;
  edit.error = null; saveFlow(page, edit.patch, flow);
}

export const chainOf = (page: WorkflowsPage): Chain => ({ stations: [...page.ui.workflow!.stations], links: [...page.ui.workflow!.links] });

export async function removeAt(page: WorkflowsPage, index: number, { keyboard = false } = {}) {
  const { ui, view, root, L } = page;
  const flow = ui.workflow; if (!flow) return;
  const station = flow.stations[index]!;
  const leaving = motion(view.querySelector(`[data-wf-chain] [data-wf-station="${index}"]`), [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.88)" }], { duration: 130, easing: EASE_STANDARD, fill: "forwards" });
  if (leaving) await Promise.race([leaving.finished.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 180))]);
  if (ui.workflow !== flow || root.dataset.wfMode !== "workflow") return;
  const at = flow.stations.findIndex((item) => item.station_id === station.station_id);
  if (at < 0) return;
  if (keyboard) { const next = flow.stations[at + 1] || flow.stations[at - 1]; page.focusNext = next ? next.station_id : null; }
  saveFlow(page, { chain: removeStn(chainOf(page), at), undoable: true, announce: L("workflows.toast.removed", { plugin: label(page, flow.stations[at]!) }) });
}

export function insertAt(page: WorkflowsPage, gap: number, plugin: string, { focus = false } = {}) {
  const id = uid();
  if (focus) page.focusNext = id;
  saveFlow(page, { chain: insertStn(chainOf(page), stnMeta(page, plugin).receives === false ? 0 : gap, plugin, id), undoable: true });
}

export function moveTo(page: WorkflowsPage, from: number, gap: number, { focus = false } = {}) {
  const station = page.ui.workflow!.stations[from];
  if (focus && station) page.focusNext = station.station_id;
  saveFlow(page, { chain: moveStation(chainOf(page), from, gap), undoable: true });
}
