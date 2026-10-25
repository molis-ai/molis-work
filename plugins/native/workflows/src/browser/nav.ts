import { esc, required } from "./dom.js";
import { drawFlow } from "./flow.js";
import { drawList } from "./list.js";
import type { WorkflowsPage } from "./page.js";
import { checkReady } from "./link.js";
import { drawRun } from "./run.js";
import { adoptFlow, flushSave } from "./save.js";
import { stateKey } from "./state.js";
import type { Flow, FlowAnswer, ListAnswer, RunAnswer } from "./types.js";

export type Mode = "list" | "workflow" | "instance";

/** The place the person was in, kept for this tab so a reload comes back to it. */
export function remember(page: WorkflowsPage) {
  const { ui } = page;
  try { sessionStorage.setItem(stateKey(page), JSON.stringify({ workflow: ui.workflow?.workflow_id || null, instance: ui.instance?.instance_id || null, step: ui.step })); } catch { /* A tab that cannot keep it simply opens on the list. */ }
}

export function recalled(page: WorkflowsPage): { workflow?: string | null; instance?: string | null; step?: number } | null {
  try { return JSON.parse(sessionStorage.getItem(stateKey(page)) || "null"); } catch { return null; }
}

/** What the Assistant is told this page shows: the open workflow, or the one a run belongs to. */
export function emitCtx(page: WorkflowsPage) {
  const { root, ui, L } = page;
  const mode = root.dataset.wfMode;
  const flow = mode === "workflow" ? ui.workflow : null;
  const runOf = mode === "instance" && ui.instance ? { id: ui.instance.workflow_id, title: ui.instanceWorkflowTitle } : null;
  const context: { plugin_id: string; surface_title: string; object?: { kind: "workflow"; id: string; version?: string; title: string }; unsaved?: boolean } = { plugin_id: page.host.pluginId, surface_title: L("workflows.page.title") };
  if (flow) {
    context.object = { kind: "workflow", id: flow.workflow_id, version: String(flow.revision), title: flow.title };
    context.unsaved = Boolean(Object.keys(page.edits.get(flow.workflow_id)?.patch || {}).length);
  } else if (runOf?.id) context.object = { kind: "workflow", id: runOf.id, title: runOf.title || "" };
  root.setAttribute("data-assistant-context", JSON.stringify(context));
}

export function setMode(page: WorkflowsPage, mode: Mode) {
  const { root, pop, space, view } = page;
  flushSave(page);
  if (pop.matches(":popover-open")) pop.hidePopover();
  if (mode === "list") view.replaceChildren();
  root.dataset.wfMode = mode;
  const expanded = mode !== "list";
  root.dataset.expanded = expanded ? "true" : "false";
  space.hidden = !expanded;
  emitCtx(page);
}

export async function loadList(page: WorkflowsPage) {
  const { ui } = page;
  try {
    const answer = await page.api<ListAnswer>("");
    ui.workflows = answer.workflows; ui.stations = answer.stations; ui.ai = answer.ai_available; ui.loaded = true;
    drawList(page);
  } catch (error) { page.listEl.innerHTML = `<p class="wf-error">${esc((error as Error).message)}</p>`; }
}

/** The text model came or went: the list, the open page and an open link read it again. */
export function onModelReady(page: WorkflowsPage) {
  const { ui, root } = page;
  return page.api<ListAnswer>("").then((answer) => {
    ui.ai = answer.ai_available; drawList(page);
    if (root.dataset.wfMode === "instance") drawRun(page); else if (root.dataset.wfMode === "workflow") drawFlow(page);
    if (ui.openLink !== null) checkReady(page, ui.openLink);
  });
}

export async function showFlow(page: WorkflowsPage, id: string, { keepInstance = false, revision = ++page.navId } = {}): Promise<Flow | undefined> {
  const { ui, root } = page;
  flushSave(page); required(root, "[data-wf-gone]").hidden = true;
  const answer = await page.api<FlowAnswer>("/" + id);
  if (revision !== page.navId) return undefined;
  if (ui.workflow?.workflow_id !== id) page.undos.length = 0;
  ui.workflow = adoptFlow(page, answer.workflow); ui.instances = answer.instances; ui.ai = answer.ai_available;
  if (ui.returnTo && ui.returnTo.workflow !== id) ui.returnTo = null;
  if (!keepInstance) ui.instance = null;
  remember(page);
  setMode(page, "workflow"); drawList(page); drawFlow(page);
  return ui.workflow;
}

export async function openRun(page: WorkflowsPage, id: string, step?: number, revision = ++page.navId) {
  const { ui } = page;
  const answer = await page.api<RunAnswer>("/instances/" + id);
  if (revision !== page.navId) return;
  ui.instance = answer.instance; ui.instanceWorkflowTitle = answer.workflow_title; ui.ai = answer.ai_available;
  ui.step = step !== undefined && Number.isInteger(step) ? Math.min(step, answer.instance.steps.length - 1) : answer.instance.current;
  ui.handoff = null; ui.returnTo = null;
  remember(page);
  setMode(page, "instance"); drawRun(page);
}
