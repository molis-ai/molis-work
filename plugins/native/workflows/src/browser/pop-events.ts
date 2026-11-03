import { ruleKey } from "./chain.js";
import { messageOf, required, settle, targetOf } from "./dom.js";
import { linkView, checkReady, switchKind } from "./link.js";
import { openRun, } from "./nav.js";
import type { WorkflowsPage } from "./page.js";
import { markOpen, movePop } from "./popover.js";
import { chainOf, debounce, insertAt, saveFlow } from "./save.js";
import { checkStep, drawStep, saveStep, setMap, stepOf } from "./step.js";
import { toast } from "./toast.js";
import type { PayloadFieldName } from "./types.js";
import type { WorkflowLinkKind } from "../model.js";

/** What happens inside the popover: picking, switching a link's kind, filling its fields, mapping an action's inputs. */
export function wirePopover(page: WorkflowsPage) {
  const { pop, ui, root } = page;

  pop.addEventListener("click", (event) => {
    const el = targetOf(event);
    const token = el?.closest<HTMLElement>("[data-wf-token]");
    if (token) {
      const area = pop.querySelector<HTMLTextAreaElement>("[data-wf-link-field=body_template]");
      if (!area) return;
      const start = area.selectionStart ?? area.value.length, end = area.selectionEnd ?? start;
      area.setRangeText(token.dataset.wfToken!, start, end, "end");
      area.focus();
      area.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const tgt = el?.closest<HTMLElement>("[data-wf-action]");
    if (!tgt) return;
    const act = tgt.dataset.wfAction;
    if (act === "insert") { pop.hidePopover(); insertAt(page, Number(tgt.dataset.gap), tgt.dataset.plugin!, { focus: event.detail === 0 }); return; }
    if (act === "step-save") { saveStep(page); return; }
    if (act === "kind") { switchKind(page, Number(tgt.dataset.link), tgt.dataset.kind as WorkflowLinkKind, { pointer: event.detail > 0 }); return; }
    if (act === "return-to-run") {
      const back = ui.returnTo; if (!back) return;
      pop.hidePopover();
      openRun(page, back.instance, back.step).catch((error) => toast(page, messageOf(error), "error"));
    }
  });

  pop.addEventListener("keydown", (event) => {
    const items = [...pop.querySelectorAll<HTMLElement>(".wf-pop__item")];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0 || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]!.focus();
  });

  pop.addEventListener("toggle", (event) => {
    if ((event as Event & { newState?: string }).newState !== "closed") return;
    const anchor = page.popAt && page.popAt();
    const lostFocus = !document.activeElement || document.activeElement === document.body || pop.contains(document.activeElement);
    ui.openLink = null; ui.openGap = null; page.popAt = null;
    markOpen(page);
    if (lostFocus && anchor) (anchor as HTMLElement).focus({ preventScroll: true });
  });

  pop.addEventListener("change", (event) => {
    const el = targetOf(event);
    if (pop.dataset.mode === "step") {
      const draft = ui.stepDraft!;
      const picked = el?.closest<HTMLSelectElement>("[data-wf-step-action]");
      if (picked) {
        const row = (ui.actionSteps || []).find((item) => ruleKey(item.ref) === picked.value);
        if (row) ui.stepDraft = { ref: row.ref, title: row.title, group: row.group, mapping: {} };
        drawStep(page); settle(pop.querySelector("[data-wf-step-fields]"));
        pop.querySelector<HTMLElement>("[data-wf-step-action]")?.focus({ preventScroll: true });
        return;
      }
      const origin = el?.closest<HTMLSelectElement>("[data-wf-map-source]");
      if (origin) {
        const name = origin.dataset.wfMapSource!;
        const field = stepOf(page, draft)?.fields.find((item) => item.name === name);
        const mapping = { ...draft.mapping };
        if (!origin.value) delete mapping[name];
        else if (origin.value === "value") mapping[name] = { value: field?.enum ? field.enum[0] : field?.type === "boolean" ? true : "" };
        else mapping[name] = { from: origin.value.slice(5) as PayloadFieldName };
        ui.stepDraft = { ...draft, mapping };
        drawStep(page);
        (pop.querySelector<HTMLElement>(`[data-wf-map-value="${name}"]`) || pop.querySelector<HTMLElement>(`[data-wf-map-source="${name}"]`))?.focus({ preventScroll: true });
        return;
      }
      const value = el?.closest<HTMLSelectElement>("select[data-wf-map-value]");
      if (value) { setMap(page, value); checkStep(page); }
      return;
    }
    const index = Number(pop.dataset.link);
    const flow = ui.workflow!;
    const select = el?.closest<HTMLSelectElement>("[data-wf-judgment]");
    if (select) {
      const row = (ui.judgments || []).find((item) => ruleKey(item.ref) === select.value);
      if (!row) return;
      flow.links[index] = { ...flow.links[index]!, judgment: { ...row.ref, title: row.title }, pass: [] };
      const fields = required(pop, "[data-wf-link-fields]"); fields.innerHTML = linkView(page, flow.links[index]!); settle(fields);
      checkReady(page, index); saveFlow(page, { chain: chainOf(page) });
      return;
    }
    if (el?.closest("[data-wf-pass]")) {
      const pass = [...pop.querySelectorAll<HTMLInputElement>("[data-wf-pass]:checked")].map((box) => box.value);
      flow.links[index] = { ...flow.links[index]!, pass };
      checkReady(page, index); saveFlow(page, { chain: chainOf(page) });
    }
  });

  pop.addEventListener("input", (event) => {
    const el = targetOf(event);
    if (pop.dataset.mode === "step") {
      const search = el?.closest<HTMLInputElement>("input[data-wf-step-search]");
      if (search) {
        ui.stepQuery = search.value;
        const caret = search.selectionStart;
        drawStep(page);
        const again = pop.querySelector<HTMLInputElement>("[data-wf-step-search]");
        if (again) { again.focus({ preventScroll: true }); again.setSelectionRange(caret, caret); }
        return;
      }
      const value = el?.closest<HTMLInputElement>("input[data-wf-map-value]");
      if (value) { setMap(page, value); checkStep(page); }
      return;
    }
    const field = el?.closest<HTMLInputElement | HTMLTextAreaElement>("[data-wf-link-field]");
    if (!field) return;
    const index = Number(pop.dataset.link);
    const flow = ui.workflow!;
    flow.links[index] = { ...flow.links[index]!, [field.dataset.wfLinkField!]: field.value };
    checkReady(page, index);
    debounce(page, flow, { chain: chainOf(page) }, "chain", 450);
  });

  window.addEventListener("resize", () => movePop(page));
  root.addEventListener("scroll", () => movePop(page), true);
}
