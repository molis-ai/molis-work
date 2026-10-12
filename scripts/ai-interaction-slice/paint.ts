import { formats, labels, topics, references, fieldOrder, type DemoState, type Values } from "./model.ts";
import { editable } from "./state.ts";
import { find, show, text, disable } from "./dom.ts";
import { setEligible, type RecommendationState } from "./recommendation.ts";

const questionMessages = {
  open: "", submitting: "正在交回演示答案…", received: "回答已接收（模拟）。下方可以预览操作参数。",
  expired: "这份问题已过期，旧回答不会提交。", replaced: "问题或对象版本已变化，请重新准备。",
  cancelled: "已选择不回答，草稿仍在。", failed: "模拟提交失败。可直接修正或重试，草稿没有丢失。",
};
const executionMessages = {
  ready: "尚未执行", running: "正在模拟执行…", done: "模拟执行完成", failed: "模拟执行失败 · 可重试",
  unknown: "结果未知 · 先核对，不能直接重试", stale: "参数已经失效 · 需要重新准备",
};
export function summary(values: Values): Array<[string, string]> {
  return [
    [labels.format, formats[values.format[0] ?? 0]?.label ?? "未选择"],
    [labels.topics, values.topics.map(index => topics[index]).join("、")],
    [labels.notes, values.notes], [labels.minutes, `${values.minutes} 分钟`],
    [labels.date, values.date], [labels.when, values.when.replace("T", " ")],
    [labels.references, values.references.map(ref => ref.label).join("、")],
  ];
}
function paintFields(root: HTMLElement, state: DemoState, recommendation: RecommendationState): void {
  for (const name of ["notes", "minutes", "date", "when"] as const) {
    const input = find<HTMLInputElement | HTMLTextAreaElement>(root, `[data-value="${name}"]`);
    if (document.activeElement !== input && input.value !== state.values[name]) input.value = state.values[name];
  }
  const composer = find<HTMLTextAreaElement>(root, "[data-composer]");
  if (!recommendation.composing && document.activeElement !== composer && composer.value !== state.values.notes) composer.value = state.values.notes;
  // An invalidated question cannot submit, but a composition already in progress must finish.
  composer.disabled = !editable(state) && !recommendation.composing;
  find<HTMLFieldSetElement>(root, "[data-fields]").disabled = !editable(state) && !recommendation.composing;
  for (const name of ["format", "topics"] as const) {
    root.querySelectorAll<HTMLButtonElement>(`[data-choice="${name}"]`).forEach(button => {
      button.setAttribute("aria-pressed", String(state.values[name].includes(Number(button.dataset.index))));
    });
  }
  root.querySelectorAll<HTMLButtonElement>("[data-reference]").forEach(button => {
    button.setAttribute("aria-pressed", String(state.values.references.some(ref => ref.id === references[Number(button.dataset.reference)]?.id)));
  });
  for (const name of fieldOrder) {
    const box = find(root, `[data-field="${name}"]`);
    text(box, ".field-error", state.errors[name] ?? "");
    show(box, ".field-error", Boolean(state.errors[name]));
    box.querySelectorAll("input,textarea,[role=group]").forEach(control => control.setAttribute("aria-invalid", String(Boolean(state.errors[name]))));
  }
  show(root, "[data-conflict]", state.conflict !== null);
  text(root, "[data-conflict-text]", `文字里提出 ${state.conflict ?? ""} 分钟，字段里是 ${state.values.minutes} 分钟。请确认使用哪个。`);
}
function paintQuestion(root: HTMLElement, state: DemoState): void {
  show(root, ".question-panel", !state.questionClosed);
  show(root, "[data-closed]", state.questionClosed);
  show(root, "[data-question-state]", state.question !== "open");
  text(root, "[data-question-message]", questionMessages[state.question]);
  disable(root, "[data-submit]", !editable(state));
  text(root, "[data-submit] [data-slot=button-label]", state.question === "submitting" ? "提交中…" : state.question === "failed" ? "重试回答 · 演示" : "提交回答 · 演示");
  show(root, "[data-action=reopen]", ["expired", "replaced", "cancelled"].includes(state.question));
  disable(root, "[data-action=reopen]", state.execution === "unknown");
  show(root, "[data-action=cancel-pending]", state.question === "submitting");
  disable(root, "[data-action=cancel]", !editable(state));
  text(root, "[data-draft-label]", state.question === "received" ? "已接收 · 模拟" : "未提交草稿");
}
function paintOperation(root: HTMLElement, state: DemoState): void {
  show(root, "[data-operation]", Boolean(state.received) || state.execution === "unknown");
  show(root, "[data-preview]", Boolean(state.preview));
  disable(root, "[data-action=preview]", state.question !== "received" || !["ready", "failed"].includes(state.execution));
  disable(root, "[data-action=revise]", ["running", "unknown", "done"].includes(state.execution));
  disable(root, "[data-action=execute]", state.question !== "received" || !["ready", "failed"].includes(state.execution) || state.previewVersion !== state.objectVersion);
  text(root, "[data-execution-message]", executionMessages[state.execution]);
  show(root, "[data-recovery]", state.execution === "failed" || state.execution === "unknown");
  show(root, "[data-action=reconcile]", state.execution === "unknown");
  show(root, "[data-action=retry]", state.execution === "failed");
  show(root, "[data-result]", state.execution === "done");
  if (state.preview) {
    const list = find(root, "[data-summary]");
    const pairs = summary(state.preview);
    const signature = JSON.stringify(pairs);
    if (list.dataset.signature !== signature) {
      const nodes = pairs.flatMap(([label, value]) => {
        const dt = document.createElement("dt"); dt.textContent = label;
        const dd = document.createElement("dd"); dd.textContent = value;
        return [dt, dd];
      });
      list.replaceChildren(...nodes);
      list.dataset.signature = signature;
    }
    text(root, "[data-version]", `· 示例版本 ${state.previewVersion}`);
    text(root, "[data-result-summary]", pairs.map(([label, value]) => `${label}：${value}`).join("；"));
  }
}
export function paint(root: HTMLElement, state: DemoState, recommendation: RecommendationState): void {
  paintFields(root, state, recommendation);
  paintQuestion(root, state);
  paintOperation(root, state);
  text(root, "[data-notice]", state.notice);
  setEligible(recommendation, state.question === "open" || state.question === "failed" || state.question === "received");
  show(root, "[data-next]", recommendation.visible);
  disable(root, "[data-next]", !recommendation.eligible || state.execution === "running" || state.execution === "unknown");
  root.dataset.questionState = state.question;
  root.dataset.executionState = state.execution;
}
