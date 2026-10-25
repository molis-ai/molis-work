import { handLink } from "./chain.js";
import { esc, messageOf, targetOf, uid } from "./dom.js";
import { cancelHand, resumeRun, refreshFlow, selectStep } from "./handoff.js";
import { drawList } from "./list.js";
import { loadList, openRun, remember, setMode, showFlow } from "./nav.js";
import type { WorkflowsPage } from "./page.js";
import { openGapPicker } from "./popover.js";
import { drawRun } from "./run.js";
import { insertAt, moveTo, removeAt, retrySave } from "./save.js";
import { showForm, startRun } from "./dialog.js";
import { showLink } from "./link.js";
import { openStep } from "./step.js";
import { toast } from "./toast.js";
import type { Chain, InstanceAnswer, SaveAnswer } from "./types.js";

/** Everything the person presses on the page, by the `data-wf-*` attribute the server drew on it. */
export function wireClicks(page: WorkflowsPage) {
  const { root, pop, ui, view, dlg, L } = page;
  root.addEventListener("click", async (event) => {
    const tgt = targetOf(event)?.closest<HTMLElement>("[data-wf-action], [data-wf-open], [data-wf-open-instance], [data-wf-step]");
    if (!tgt || !root.contains(tgt) || pop.contains(tgt)) return;
    const act = tgt.dataset.wfAction;
    try {
      if (tgt.dataset.wfOpen) { if (ui.workflow?.workflow_id !== tgt.dataset.wfOpen || ui.instance) await showFlow(page, tgt.dataset.wfOpen); return; }
      if (tgt.dataset.wfOpenInstance) { await openRun(page, tgt.dataset.wfOpenInstance); return; }
      if (tgt.dataset.wfStep !== undefined && !act) { selectStep(page, Number(tgt.dataset.wfStep)); return; }
      if (act === "new" || act === "example") {
        const example = act === "example";
        const chain: Chain = example
          ? { stations: [{ station_id: uid(), plugin: "feed" }, { station_id: uid(), plugin: "inbox" }, { station_id: uid(), plugin: "pages" }],
              links: [handLink(), { kind: "ai", title_template: "", body_template: "", instructions: L("workflows.example.instructions") }] }
          : { stations: [], links: [] };
        const created = await page.api<SaveAnswer>("", { title: example ? L("workflows.example.title") : L("workflows.flow.new-title"), chain });
        await loadList(page);
        await showFlow(page, created.workflow.workflow_id);
        if (!example) view.querySelector<HTMLInputElement>("[data-wf-title]")?.select();
        return;
      }
      if (act === "back") { page.navId++; ui.workflow = null; ui.instance = null; ui.returnTo = null; remember(page); setMode(page, "list"); drawList(page); return; }
      if (act === "back-to-flow") { const id = ui.instance?.workflow_id; ui.instance = null; if (id) await showFlow(page, id); else setMode(page, "list"); return; }
      if (act === "return-to-run") { const back = ui.returnTo; if (back) await openRun(page, back.instance, back.step); return; }
      if (act === "retry-save") { retrySave(page); return; }
      if (act === "delete") {
        showForm(page, L("workflows.editor.delete"), `<p>${esc(L("workflows.dialog.delete-body", { title: ui.workflow!.title }))}</p>`, L("workflows.dialog.delete"), async () => {
          await page.api("/" + ui.workflow!.workflow_id + "/delete", {}); dlg.close(); ui.workflow = null; ui.returnTo = null; remember(page); setMode(page, "list"); await loadList(page);
        }, { tone: "danger" });
        return;
      }
      if (act === "gap") { openGapPicker(page, Number(tgt.dataset.gap)); return; }
      if (act === "append") { insertAt(page, ui.workflow!.stations.length, tgt.dataset.wfPlugin!); return; }
      if (act === "add-step") {
        if (!ui.workflow!.stations.length) { toast(page, L("workflows.step.start-with-picker"), "error"); return; }
        await openStep(page, null, () => view.querySelector("[data-wf-action=add-step]")); return;
      }
      if (act === "edit-step") { const index = Number(tgt.dataset.index); await openStep(page, index, () => view.querySelector(`[data-wf-chain] [data-wf-action=edit-step][data-index="${index}"]`)); return; }
      if (act === "remove") { await removeAt(page, Number(tgt.dataset.index)); return; }
      if (act === "move") { moveTo(page, Number(tgt.dataset.from), Number(tgt.dataset.gap), { focus: true }); return; }
      if (act === "link") {
        const index = Number(tgt.dataset.link);
        if (ui.openLink === index && pop.matches(":popover-open")) { pop.hidePopover(); return; }
        showLink(page, index); return;
      }
      if (act === "edit-link") {
        const run = ui.instance!, index = Number(tgt.dataset.link);
        ui.returnTo = { workflow: run.workflow_id, instance: run.instance_id, step: ui.step, title: run.title };
        const opened = await showFlow(page, run.workflow_id);
        if (!opened || ui.workflow !== opened) return;
        showLink(page, index);
        pop.querySelector<HTMLElement>("[data-wf-link-fields] input, [data-wf-link-fields] textarea")?.focus({ preventScroll: true });
        return;
      }
      if (act === "start") { await startRun(page); return; }
      if (act === "dialog-close") { if (!dlg.querySelector("[data-loading]")) dlg.close(); return; }
      if (act === "stop") {
        const run = ui.instance!;
        showForm(page, L("workflows.dialog.end-title"), `<p>${esc(L("workflows.dialog.end-body"))}</p>`, L("workflows.run.end"), async () => {
          const answer = await page.api<InstanceAnswer>("/instances/" + run.instance_id + "/stop", {});
          dlg.close(); ui.instance = answer.instance; ui.handoff = null; drawRun(page); refreshFlow(page);
        });
        return;
      }
      if (act === "continue") { await resumeRun(page, Number(tgt.dataset.index)); return; }
      if (act === "retry-action") { await resumeRun(page, Number(tgt.dataset.index), undefined, { retry: true }); return; }
      if (act === "handoff-cancel") { cancelHand(page); return; }
    } catch (error) { toast(page, messageOf(error), "error"); }
  });
}
