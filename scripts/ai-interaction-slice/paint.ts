import { formats, labels, topics, fieldOrder, timeLimits, type DemoState, type Values } from "./model.ts";
import { draftable, editable } from "./state.ts";
import { attr, find, show, text, disable } from "./dom.ts";
import { nextSteps, offerSteps, stepLive, type RecommendationState } from "./recommendation.ts";
import type { InteractionClient } from "@molis-ai/molis-work-plugin-sdk/page-globals";

type Tone = "waiting" | "progress" | "done" | "failed" | "quiet";
const questionBadge: Record<DemoState["question"], [string, Tone]> = {
  open: ["等你回答", "waiting"], submitting: ["交回中", "progress"], received: ["已交回 · 模拟", "done"],
  expired: ["已过期", "quiet"], replaced: ["已被替换", "quiet"], cancelled: ["未回答", "quiet"], failed: ["交回失败", "failed"],
};
const questionMessages: Record<DemoState["question"], string> = {
  open: "", submitting: "正在交回答案。现在取消，迟到的结果也不会生效。", received: "",
  expired: "这份问题已过期，旧回答不会再交回。草稿还在，可以请助理带着它重新问。",
  replaced: "问题或作用对象已经换了版本，旧回答不会交回。草稿还在。",
  cancelled: "你选择了不回答，助理会据此继续。草稿还在，需要时可以重新打开。",
  failed: "",
};
const executionBadge: Record<DemoState["execution"], [string, Tone]> = {
  ready: ["待你预览", "waiting"], running: ["执行中", "progress"], done: ["已完成 · 模拟", "done"],
  failed: ["未执行", "failed"], unknown: ["结果未知", "waiting"], stale: ["已失效", "quiet"],
};
const executionMessages: Record<DemoState["execution"], string> = {
  ready: "", running: "正在模拟执行；再点不会重复执行。", done: "",
  failed: "模拟执行被拒绝，没有产生结果。可以检查参数后重试。",
  unknown: "连接在执行途中断开，结果未知。先核对，不会自动再执行一次。",
  stale: "作用对象已改版，这组参数不能再执行。按新版本重新准备上面的问题。",
};
function badge(element: HTMLElement, [label, tone]: [string, Tone]): void {
  if (element.textContent !== label) element.textContent = label;
  attr(element, "data-tone", tone);
}
export function summary(values: Values): Array<[string, string]> {
  return [
    [labels.format, formats[values.format[0] ?? 0]?.label ?? "未选择"],
    [labels.topics, values.topics.map(index => topics[index]).join("、")],
    [labels.notes, values.notes], [labels.minutes, `${values.minutes} 分钟`],
    [labels.date, values.date], [labels.when, values.when.replace("T", " ").replace(/([+-]\d{2}:\d{2})$/, "（UTC$1）")],
    [labels.references, values.references.map(ref => ref.label).join("、")],
  ];
}
function list(element: HTMLElement, pairs: Array<[string, string]>): void {
  const signature = JSON.stringify(pairs);
  if (element.dataset.signature === signature) return;
  element.replaceChildren(...pairs.flatMap(([label, value]) => {
    const dt = document.createElement("dt"); dt.textContent = label;
    const dd = document.createElement("dd"); dd.textContent = value;
    return [dt, dd];
  }));
  element.dataset.signature = signature;
}
/** Fields are never re-rendered: the shared client writes back only values nobody is typing into, so a refresh keeps a draft. */
function paintFields(root: HTMLElement, state: DemoState, recommendation: RecommendationState, client: InteractionClient): void {
  const { values } = state;
  client.write({
    notes: values.notes, minutes: values.minutes, date: values.date, when: { ...state.whenParts },
    format: values.format.map(String), topics: values.topics.map(String), references: values.references.map(ref => ({ value: ref.id, label: ref.label })),
  });
  const composer = find<HTMLInputElement | HTMLTextAreaElement>(root, "[data-composer]");
  if (!recommendation.composing && document.activeElement !== composer && composer.value !== state.draft) composer.value = state.draft;
  // Only submitting fixes the fields; an invalidated question keeps its draft editable but cannot be answered.
  find<HTMLFieldSetElement>(root, "[data-ix-fields]").disabled = !draftable(state) && !recommendation.composing;
  const chosen = state.values.references;
  text(root, '[data-ix-field="references"] .mw-ix-hint', `输入名称搜索，选 1–${timeLimits.maxReferences} 份 · 已选 ${chosen.length}`);
  client.showErrors(state.errors as Record<string, string>);
  for (const name of fieldOrder) show(find(root, `[data-ix-field="${name}"]`), "[data-ix-refreshed]", state.refreshed.includes(name));
  show(root, "[data-ix-notice]", state.conflict !== null);
  text(root, "[data-ix-notice-text]", `补充里写了「时长 ${state.conflict ?? ""} 分钟」，字段里是 ${state.values.minutes} 分钟。用哪个？`);
}
function paintQuestion(root: HTMLElement, state: DemoState): void {
  // Once an answer was received, the card keeps its summary even if the question is invalidated afterwards; the form
  // comes back only when the person re-prepares it, so a change from elsewhere never pushes the conversation around.
  const received = Boolean(state.received);
  const card = find(root, "[data-ix-question]");
  card.hidden = state.questionClosed;
  show(root, "[data-closed]", state.questionClosed);
  badge(find(card, "[data-ix-badge]"), questionBadge[state.question]);
  text(card, "[data-ix-kicker]", received ? "已交回 · 7 项回答" : "需要你补充 · 7 项");
  const banner = find(card, "[data-ix-banner]");
  const message = questionMessages[state.question];
  banner.hidden = !message;
  attr(banner, "data-tone", ["cancelled", "submitting"].includes(state.question) ? "quiet" : "waiting");
  text(banner, "[data-ix-banner-text]", message);
  const reopen = find(banner, '[data-ix-action="reopen"]');
  text(reopen, "[data-slot=button-label]", state.version !== state.objectVersion ? "按新版本重新准备" : state.question === "cancelled" ? "重新打开问题" : "请助理重新问");
  show(banner, '[data-ix-action="reopen"]', ["expired", "replaced", "cancelled"].includes(state.question));
  disable(banner, '[data-ix-action="reopen"]', state.execution === "unknown");
  show(banner, '[data-ix-action="cancel-pending"]', state.question === "submitting");
  show(card, "[data-ix-form]", !received);
  show(card, "[data-ix-answered]", received);
  if (received && state.received) list(find(card, "[data-ix-answered] [data-ix-summary]"), summary(state.received));
  const submit = find(card, '[data-ix-action="submit"]');
  disable(card, '[data-ix-action="submit"]', !editable(state));
  text(submit, "[data-slot=button-label]", state.question === "submitting" ? "交回中…" : state.question === "failed" ? "重试交回" : "提交回答");
  attr(submit, "aria-busy", state.question === "submitting" ? "true" : null);
  disable(card, '[data-ix-action="cancel"]', !editable(state));
  disable(card, '[data-ix-answered] [data-ix-action="revise"]', ["running", "unknown", "done"].includes(state.execution));
  const errors = Object.keys(state.errors).length;
  const note = find(card, "[data-ix-note]");
  text(card, "[data-ix-note]", state.question === "submitting" ? "正在交回，不会创建任何东西。" : state.question === "failed" ? "模拟交回失败，填写都在。可以直接重试。" :
    errors ? `还有 ${errors} 项要修正，填写都在。` : "草稿只在本页保留");
  attr(note, "data-tone", errors || state.question === "failed" ? "error" : null);
}
function paintOperation(root: HTMLElement, state: DemoState): void {
  show(root, "[data-op-turn]", Boolean(state.received) || ["running", "unknown", "done"].includes(state.execution));
  const card = find(root, "[data-ix-operation]");
  badge(find(card, "[data-ix-badge]"), state.execution === "ready" && state.preview ? ["待你执行", "waiting"] : executionBadge[state.execution]);
  const version = `版本 ${state.objectVersion}`;
  root.querySelectorAll<HTMLElement>("[data-ix-version], [data-object-version-side]").forEach(chip => {
    if (chip.textContent !== version) chip.textContent = version;
    attr(chip, "data-changed", state.version !== state.objectVersion ? "" : null);
  });
  show(card, "[data-ix-preview]", Boolean(state.preview) && state.execution !== "done");
  show(card, "[data-ix-preview-actions]", ["ready", "failed"].includes(state.execution));
  show(card, "[data-ix-actions]", !state.preview && ["ready", "failed"].includes(state.execution) && state.question === "received");
  disable(card, '[data-ix-action="preview"]', state.question !== "received" || !["ready", "failed"].includes(state.execution));
  disable(card, '[data-ix-action="revise"]', ["running", "unknown", "done"].includes(state.execution));
  disable(card, '[data-ix-action="execute"]', state.question !== "received" || !["ready", "failed"].includes(state.execution) || state.previewVersion !== state.objectVersion);
  const status = find(card, "[data-ix-status]");
  if (status.dataset.state !== state.execution) {
    status.replaceChildren(...(state.execution === "running" ? [Object.assign(document.createElement("span"), { className: "mw-spinner" })] : []), document.createTextNode(executionMessages[state.execution]));
    status.dataset.state = state.execution;
  }
  attr(status, "data-tone", state.execution === "failed" ? "failed" : state.execution === "unknown" ? "waiting" : null);
  show(card, "[data-ix-recovery]", state.execution === "failed" || state.execution === "unknown");
  show(card, '[data-ix-action="reconcile"]', state.execution === "unknown");
  show(card, '[data-ix-action="retry"]', state.execution === "failed");
  show(card, "[data-ix-result]", state.execution === "done");
  if (state.preview) {
    const pairs = summary(state.preview);
    list(find(card, "[data-ix-preview] [data-ix-summary]"), pairs);
    text(card, "[data-ix-preview-note]", `目标：秋季工作台 · 内部试用 · 版本 ${state.previewVersion}`);
    text(card, "[data-ix-result-text]", pairs.map(([label, value]) => `${label}：${value}`).join("；"));
  }
}
/** The work's own summary (side pane, tab mark, minimised chip) speaks for the same two records. */
function paintWork(root: HTMLElement, state: DemoState): void {
  const [label, tone, now, mark] = state.execution === "running" ? ["执行中", "running", "正在模拟执行创建安排。", "running"]
    : state.execution === "done" ? ["已完成", "done", "安排已准备好（模拟）。", "done"]
    : state.execution === "unknown" ? ["需要核对", "waiting", "执行结果未知，等你核对。", "waiting"]
    : state.execution === "failed" ? ["未完成", "failed", "执行没有成功，可以重试。", "failed"]
    : state.question === "received" ? ["等你确认", "waiting", state.preview ? "参数已展开，等你决定是否执行。" : "回答已收到，等你预览参数。", "waiting"]
    : state.question === "submitting" ? ["交回中", "running", "正在交回你的回答。", "running"]
    : state.question === "open" || state.question === "failed" ? ["等你回答", "waiting", "等你补充 7 项安排信息。", "waiting"]
    : ["已暂停", "quiet", "问题已失效，等你决定是否重新问。", ""];
  root.querySelectorAll<HTMLElement>("[data-work-state]").forEach(element => { if (element.textContent !== label) element.textContent = label; });
  root.querySelectorAll<HTMLElement>("[data-summary-tone]").forEach(element => attr(element, "data-tone", tone));
  root.querySelectorAll<HTMLElement>("[data-work-now]").forEach(element => { if (element.textContent !== now) element.textContent = now; });
  root.querySelectorAll<HTMLElement>("[data-tab-mark], [data-target-mark], [data-session-mark]").forEach(element => attr(element, "data-mark", mark || null));
  const materials = root.querySelector<HTMLElement>("[data-side-materials]");
  if (materials) {
    const chosen = (state.received ?? state.values).references;
    const signature = chosen.map(ref => ref.id).join();
    if (materials.dataset.signature !== signature) {
      materials.replaceChildren(...chosen.map(ref => {
        const item = document.createElement("li");
        item.innerHTML = `<svg aria-hidden="true"><use href="#icon-${ref.kind === "goal" ? "target" : "file"}"></use></svg>`;
        item.append(ref.label);
        return item;
      }));
      materials.dataset.signature = signature;
    }
    show(root, "[data-side-empty]", chosen.length === 0);
  }
  root.querySelectorAll<HTMLElement>("[data-object-version-page]").forEach(element => { element.textContent = `版本 ${state.objectVersion}`; });
}
/** The steps beside the composer keep their place while the person is in that row (§3.6, AC-15). */
function paintSteps(root: HTMLElement, state: DemoState, recommendation: RecommendationState): void {
  offerSteps(recommendation, nextSteps(state));
  root.querySelectorAll<HTMLButtonElement>("[data-ix-step]").forEach(button => {
    const step = recommendation.visible ? recommendation.shown[Number(button.dataset.ixStep)] : undefined;
    button.hidden = !step;
    if (!step) return;
    text(button, "[data-ix-step-label]", step.label);
    attr(button, "data-ix-step-id", step.id);
    attr(button, "data-secondary", step.primary ? null : "");
    attr(button, "data-busy", step.busy ? "" : null);
    attr(button, "aria-busy", step.busy ? "true" : null);
    attr(button, "title", `来自${step.source}`);
    button.disabled = !stepLive(recommendation, step);
  });
  const composerOpen = draftable(state) && !state.questionClosed && !state.received;
  show(root, "[data-ix-into]", composerOpen);
  const composer = find<HTMLInputElement | HTMLTextAreaElement>(root, "[data-composer]");
  attr(composer, "placeholder", composerOpen ? "补充要求，回车放进问卷…" : state.question === "received" ? "继续说，或用旁边的下一步…" : "补充这一轮的要求…");
}
export function paint(root: HTMLElement, state: DemoState, recommendation: RecommendationState, client: InteractionClient | undefined): void {
  if (client) paintFields(root, state, recommendation, client);
  paintQuestion(root, state);
  paintOperation(root, state);
  paintWork(root, state);
  paintSteps(root, state, recommendation);
  root.querySelectorAll<HTMLElement>("[data-notice]").forEach(element => { if (element.textContent !== state.notice) element.textContent = state.notice; });
  root.dataset.questionState = state.question;
  root.dataset.executionState = state.execution;
}
