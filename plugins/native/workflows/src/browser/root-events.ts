import { messageOf, required, settle, targetOf } from "./dom.js";
import { filterPicks } from "./dialog.js";
import { cancelHand, resumeRun } from "./handoff.js";
import type { WorkflowsPage } from "./page.js";
import { moveTo, removeAt, debounce, flushSave, saveFlow, undo } from "./save.js";

const manualFields = (form: HTMLFormElement) => ({
  title: (form.elements.namedItem("title") as HTMLInputElement).value,
  body: (form.elements.namedItem("body") as HTMLTextAreaElement).value,
});

/** Typing, keys and the dialog's submit: everything the page does outside the popover and outside plain presses. */
export function wireRoot(page: WorkflowsPage) {
  const { root, pop, ui, view, dlg, formEl, L } = page;

  const saveName = (input: HTMLInputElement) => {
    flushSave(page);
    if (!ui.workflow) return;
    const title = input.value.trim() || L("workflows.flow.new-title");
    if (title !== ui.workflow.title) saveFlow(page, { title });
  };

  root.addEventListener("input", (event) => {
    const el = targetOf(event);
    if (!el || pop.contains(el)) return;
    const title = el.closest<HTMLInputElement>("[data-wf-title]");
    if (title) { if (ui.workflow) debounce(page, ui.workflow, { title: title.value.trim() || L("workflows.flow.new-title") }, "title", 600); return; }
    const filter = el.closest<HTMLInputElement>("[data-wf-pick-filter]");
    if (filter) { filterPicks(page, filter.value); return; }
    const manual = el.closest<HTMLFormElement>("[data-wf-manual]");
    if (manual && ui.handoff) ui.handoff.draft = manualFields(manual);
  });
  root.addEventListener("change", (event) => {
    const input = targetOf(event)?.closest<HTMLInputElement>("[data-wf-title]");
    if (input) saveName(input);
  });
  root.addEventListener("focusin", (event) => {
    const el = targetOf(event);
    if (el?.matches("input[name=blank_title]")) { const radio = el.closest(".wf-pick")?.querySelector<HTMLInputElement>("input[type=radio]"); if (radio) radio.checked = true; }
  });
  root.addEventListener("dblclick", (event) => {
    const pick = targetOf(event)?.closest(".wf-pick[data-wf-pick-text]");
    if (pick && dlg.open) formEl.requestSubmit();
  });
  root.addEventListener("keydown", (event) => {
    const tgt = targetOf(event);
    if (!tgt || pop.contains(tgt)) return;
    const typing = tgt.matches("input, textarea, select, [contenteditable]");
    if (!typing && root.dataset.wfMode === "workflow" && event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
      if (undo(page)) event.preventDefault();
      return;
    }
    if (tgt.matches("[data-wf-title]")) {
      const input = tgt as HTMLInputElement;
      if (event.key === "Enter") { event.preventDefault(); input.blur(); }
      if (event.key === "Escape") { input.value = ui.workflow?.title || input.value; clearTimeout(page.pendingEdits.get("title")?.timer); page.pendingEdits.delete("title"); input.blur(); }
      return;
    }
    if (tgt.matches("[data-wf-pick-filter]") && event.key === "ArrowDown") {
      event.preventDefault();
      dlg.querySelector<HTMLElement>(".wf-pick:not([hidden]) input[type=radio]")?.focus();
      return;
    }
    const manual = tgt.closest<HTMLFormElement>("[data-wf-manual]");
    if (manual) {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); manual.requestSubmit(); return; }
      if (event.key === "Escape") { event.preventDefault(); cancelHand(page); return; }
    }
    const station = tgt.matches("[data-wf-station]") ? tgt as HTMLElement : null;
    if (station && ui.workflow) {
      const index = Number(station.dataset.wfStation), count = ui.workflow.stations.length;
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && event.altKey) {
        event.preventDefault();
        if (event.key === "ArrowLeft" && index > 0) moveTo(page, index, index - 1, { focus: true });
        if (event.key === "ArrowRight" && index < count - 1) moveTo(page, index, index + 2, { focus: true });
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : Math.max(0, Math.min(count - 1, index + (event.key === "ArrowRight" ? 1 : -1)));
        view.querySelector<HTMLElement>(`[data-wf-chain] [data-wf-station="${next}"]`)?.focus();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); void removeAt(page, index, { keyboard: true }); return; }
    }
    const vstep = tgt.closest<HTMLElement>("[data-wf-vchain] [data-wf-step]");
    if (vstep && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const steps = [...view.querySelectorAll<HTMLElement>("[data-wf-vchain] [data-wf-step]")];
      const at = steps.indexOf(vstep);
      const next = event.key === "Home" ? 0 : event.key === "End" ? steps.length - 1 : Math.max(0, Math.min(steps.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)));
      steps.forEach((step, index) => { step.tabIndex = index === next ? 0 : -1; });
      steps[next]!.focus();
    }
  });
  root.addEventListener("submit", async (event) => {
    const form = targetOf(event)?.closest<HTMLFormElement>("[data-wf-manual]");
    if (!form) return;
    event.preventDefault();
    await resumeRun(page, ui.handoff!.index, manualFields(form));
  });

  // Esc and Close do not pretend to cancel a submit on its way (VUX-29).
  dlg.addEventListener("cancel", (event) => { if (dlg.querySelector("[data-loading]")) event.preventDefault(); });
  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!page.submitForm) return;
    const submit = required(dlg, "[data-wf-dialog-submit]");
    if (submit.hasAttribute("data-loading")) return;
    submit.setAttribute("data-loading", ""); submit.insertAdjacentHTML("afterbegin", '<span class="mw-spinner" aria-hidden="true"></span>');
    try { await page.submitForm(); } catch (error) { const el = required(dlg, "[data-wf-dialog-error]"); el.textContent = messageOf(error); el.hidden = false; settle(el); }
    finally { submit.removeAttribute("data-loading"); submit.querySelector(".mw-spinner")?.remove(); }
  });
}
