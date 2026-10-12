import { createDemo, references, fieldOrder, type Layout, type Outcome } from "./model.ts";
import { backgroundUpdate, beginAnswer, cancelAnswer, edit, finishComposition, invalidate, reopen, resolveConflict, settleAnswer } from "./state.ts";
import { beginExecution, continueDraft, preparePreview, reconcile, settleExecution } from "./execution.ts";
import { createRecommendation, setInteraction } from "./recommendation.ts";
import { find, focusField, show } from "./dom.ts";
import { paint } from "./paint.ts";

export function mountScene(root: HTMLElement, layout: Layout, updateCounters: () => void) {
  const state = createDemo(layout);
  const recommendation = createRecommendation();
  let nextOutcome: Outcome = "done";
  let answerFails = false;
  const refresh = () => { paint(root, state, recommendation); updateCounters(); };
  const begin = () => {
    const ticket = beginAnswer(state);
    refresh();
    if (ticket === null) {
      const first = fieldOrder.find(name => state.errors[name]);
      if (first) focusField(root, first);
      return;
    }
    const fail = answerFails;
    setTimeout(() => { settleAnswer(state, ticket, fail); refresh(); }, 700);
  };
  const execute = () => {
    const ticket = beginExecution(state);
    if (ticket === null) return;
    const outcome = nextOutcome;
    refresh();
    setTimeout(() => { settleExecution(state, ticket, outcome); refresh(); }, 900);
  };
  function action(name: string): void {
    switch (name) {
      case "close": state.questionClosed = true; break;
      case "open": state.questionClosed = false; break;
      case "cancel": case "cancel-pending": cancelAnswer(state); break;
      case "reopen": case "revise": reopen(state); break;
      case "adopt": resolveConflict(state, true); break;
      case "keep": resolveConflict(state, false); break;
      case "background": backgroundUpdate(state); break;
      case "expire": invalidate(state, "expired"); break;
      case "replace": invalidate(state, "replaced"); break;
      case "object": invalidate(state, "object"); break;
      case "preview": case "retry": preparePreview(state); break;
      case "execute": execute(); return;
      case "reconcile": reconcile(state); break;
      case "result": show(root, "[data-result-details]", true); break;
      case "continue": continueDraft(state); show(root, "[data-result-details]", false); break;
      case "next": {
        if (!recommendation.eligible || state.execution === "unknown" || state.execution === "running") return;
        if (state.execution === "done") { find(root, "[data-result]").focus(); return; }
        if (state.question === "received") preparePreview(state);
        else state.questionClosed = false;
        refresh();
        if (state.question === "received") find(root, "[data-action=execute]").focus();
        else focusField(root, "format");
        return;
      }
      case "outcome-done": nextOutcome = "done"; answerFails = false; break;
      case "answer-failure": answerFails = true; break;
      case "outcome-failed": nextOutcome = "failed"; answerFails = false; break;
      case "outcome-unknown": nextOutcome = "unknown"; answerFails = false; break;
    }
    refresh();
  }
  root.addEventListener("submit", event => { event.preventDefault(); begin(); });
  root.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;
    if (button.dataset.action) action(button.dataset.action);
    const name = button.dataset.choice;
    if (name === "format" || name === "topics") {
      const index = Number(button.dataset.index);
      edit(state, name, name === "format" ? [index] : state.values.topics.includes(index) ? state.values.topics.filter(value => value !== index) : [...state.values.topics, index]);
    }
    if (button.dataset.reference !== undefined) {
      const ref = references[Number(button.dataset.reference)];
      if (ref) edit(state, "references", state.values.references.some(value => value.id === ref.id) ? state.values.references.filter(value => value.id !== ref.id) : [...state.values.references, { ...ref }]);
    }
    refresh();
  });
  root.addEventListener("input", event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
    const field = input.hasAttribute("data-composer") ? "notes" : input.dataset.value;
    if (field === "notes" || field === "minutes" || field === "date" || field === "when") edit(state, field, input.value);
    refresh();
  });
  const row = find(root, "[data-composer-row]");
  const interaction = (kind: "focused" | "hovered" | "composing", value: boolean) => { setInteraction(recommendation, kind, value); refresh(); };
  row.addEventListener("focusin", () => interaction("focused", true));
  row.addEventListener("focusout", () => queueMicrotask(() => interaction("focused", row.contains(document.activeElement))));
  row.addEventListener("mouseenter", () => interaction("hovered", true));
  row.addEventListener("mouseleave", () => interaction("hovered", false));
  root.addEventListener("compositionstart", () => interaction("composing", true));
  root.addEventListener("compositionend", event => {
    const input = event.target;
    // Preserve the final composition text even if this question expired mid-composition.
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      const field = input.hasAttribute("data-composer") ? "notes" : input.dataset.value;
      if (field === "notes" || field === "minutes" || field === "date" || field === "when") finishComposition(state, field, input.value);
    }
    interaction("composing", false);
  });
  root.addEventListener("focusout", () => queueMicrotask(refresh));
  paint(root, state, recommendation);
  return {
    state, action, refresh,
    description: () => `下次：回答${answerFails ? "失败" : "成功"} / 执行${nextOutcome === "done" ? "完成" : nextOutcome === "failed" ? "失败" : "未知"}`,
  };
}
