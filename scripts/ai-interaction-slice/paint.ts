import { formats, labels, topics, references, fieldOrder, type DemoState, type Values } from "./model.ts";
import { draftable, editable } from "./state.ts";
import { attr, find, show, text, disable } from "./dom.ts";
import { nextSteps, offerSteps, stepLive, type RecommendationState } from "./recommendation.ts";

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
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function weekday(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const day = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value ? "" : weekdays[day.getUTCDay()]!;
}
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
/** Fields are never re-rendered: only values nobody is typing into are written back, so a refresh keeps a draft. */
function paintFields(root: HTMLElement, state: DemoState, recommendation: RecommendationState): void {
  const write = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    if (document.activeElement !== input && input.value !== value) input.value = value;
  };
  for (const name of ["notes", "minutes", "date"] as const) write(find(root, `[data-value="${name}"]`), state.values[name]);
  write(find(root, '[data-when-part="date"]'), state.whenParts.date);
  write(find(root, '[data-when-part="time"]'), state.whenParts.time);
  const composer = find<HTMLInputElement | HTMLTextAreaElement>(root, "[data-composer]");
  if (!recommendation.composing) write(composer, state.draft);
  root.querySelectorAll<HTMLElement>("[data-date-field]").forEach(field => {
    const input = find<HTMLInputElement>(field, "input");
    text(field, "[data-weekday]", weekday(input.value));
  });
  // Only submitting fixes the fields; an invalidated question keeps its draft editable but cannot be answered.
  find<HTMLFieldSetElement>(root, "[data-fields]").disabled = !draftable(state) && !recommendation.composing;
  for (const name of ["format", "topics"] as const) {
    root.querySelectorAll<HTMLButtonElement>(`[data-choice="${name}"]`).forEach(button => {
      attr(button, "aria-pressed", String(state.values[name].includes(Number(button.dataset.index))));
    });
  }
  const chosen = state.values.references;
  root.querySelectorAll<HTMLButtonElement>("[data-reference]").forEach(button => {
    attr(button, "aria-pressed", String(chosen.some(ref => ref.id === references[Number(button.dataset.reference)]?.id)));
  });
  text(root, "[data-reference-count]", `已选 ${chosen.length}`);
  for (const name of fieldOrder) {
    const box = find(root, `[data-field="${name}"]`);
    text(box, ".field-error", state.errors[name] ?? "");
    show(box, ".field-error", Boolean(state.errors[name]));
    show(box, "[data-refreshed]", state.refreshed.includes(name));
    box.querySelectorAll("input,textarea,[role=group]").forEach(control => attr(control, "aria-invalid", String(Boolean(state.errors[name]))));
  }
  show(root, "[data-conflict]", state.conflict !== null);
  text(root, "[data-conflict-text]", `补充里写了「时长 ${state.conflict ?? ""} 分钟」，字段里是 ${state.values.minutes} 分钟。用哪个？`);
}
function paintQuestion(root: HTMLElement, state: DemoState): void {
  const received = state.question === "received";
  show(root, "[data-question-card]", !state.questionClosed);
  show(root, "[data-closed]", state.questionClosed);
  badge(find(root, "[data-question-badge]"), questionBadge[state.question]);
  text(root, "[data-question-kicker]", received ? "已交回 · 7 项回答" : "需要你补充 · 7 项");
  const banner = find(root, "[data-question-state]");
  const message = questionMessages[state.question];
  banner.hidden = !message;
  attr(banner, "data-tone", ["cancelled", "submitting"].includes(state.question) ? "quiet" : "waiting");
  text(banner, "[data-question-message]", message);
  const reopen = find(banner, '[data-action="reopen"]');
  text(reopen, "[data-slot=button-label]", state.version !== state.objectVersion ? "按新版本重新准备" : state.question === "cancelled" ? "重新打开问题" : "请助理重新问");
  show(banner, '[data-action="reopen"]', ["expired", "replaced", "cancelled"].includes(state.question));
  disable(banner, '[data-action="reopen"]', state.execution === "unknown");
  show(root, "[data-question-form]", !received);
  show(root, "[data-answered]", received);
  if (received && state.received) list(find(root, "[data-answered-summary]"), summary(state.received));
  disable(root, "[data-submit]", !editable(state));
  const submit = find(root, "[data-submit]");
  text(submit, "[data-slot=button-label]", state.question === "submitting" ? "交回中…" : state.question === "failed" ? "重试交回" : "提交回答");
  attr(submit, "aria-busy", state.question === "submitting" ? "true" : null);
  disable(root, '[data-action="cancel"]', !editable(state));
  disable(root, '[data-answered] [data-action="revise"]', ["running", "unknown", "done"].includes(state.execution));
  const status = find(root, "[data-question-status]");
  const errors = Object.keys(state.errors).length;
  text(root, "[data-question-status]", state.question === "submitting" ? "正在交回，不会创建任何东西。" : state.question === "failed" ? "模拟交回失败，填写都在。可以直接重试。" :
    errors ? `还有 ${errors} 项要修正，填写都在。` : "草稿只在本页保留");
  attr(status, "data-tone", errors || state.question === "failed" ? "error" : null);
  show(banner, '[data-action="cancel-pending"]', state.question === "submitting");
}
function paintOperation(root: HTMLElement, state: DemoState): void {
  const visible = Boolean(state.received) || ["running", "unknown", "done"].includes(state.execution);
  show(root, "[data-op-turn]", visible);
  badge(find(root, "[data-execution-badge]"), state.execution === "ready" && state.preview ? ["待你执行", "waiting"] : executionBadge[state.execution]);
  const version = `版本 ${state.objectVersion}`;
  root.querySelectorAll<HTMLElement>("[data-version-chip], [data-object-version-side]").forEach(chip => {
    if (chip.textContent !== version) chip.textContent = version;
    attr(chip, "data-changed", state.version !== state.objectVersion ? "" : null);
  });
  show(root, "[data-preview]", Boolean(state.preview));
  show(root, "[data-preview-actions]", ["ready", "failed"].includes(state.execution));
  show(root, "[data-op-actions]", !state.preview && ["ready", "failed"].includes(state.execution) && state.question === "received");
  disable(root, '[data-action="preview"]', state.question !== "received" || !["ready", "failed"].includes(state.execution));
  disable(root, '[data-operation] [data-action="revise"]', ["running", "unknown", "done"].includes(state.execution));
  disable(root, '[data-action="execute"]', state.question !== "received" || !["ready", "failed"].includes(state.execution) || state.previewVersion !== state.objectVersion);
  const exec = find(root, "[data-execution-message]");
  const message = executionMessages[state.execution];
  if (exec.dataset.state !== state.execution) {
    exec.replaceChildren(...(state.execution === "running" ? [Object.assign(document.createElement("span"), { className: "mw-spinner" })] : []), document.createTextNode(message));
    exec.dataset.state = state.execution;
  }
  attr(exec, "data-tone", state.execution === "failed" ? "failed" : state.execution === "unknown" ? "waiting" : null);
  show(root, "[data-recovery]", state.execution === "failed" || state.execution === "unknown");
  show(root, '[data-action="reconcile"]', state.execution === "unknown");
  show(root, '[data-action="retry"]', state.execution === "failed");
  show(root, "[data-result]", state.execution === "done");
  if (state.preview) {
    const pairs = summary(state.preview);
    list(find(root, "[data-summary]"), pairs);
    text(root, "[data-version]", `· 版本 ${state.previewVersion}`);
    text(root, "[data-result-summary]", pairs.map(([label, value]) => `${label}：${value}`).join("；"));
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
  root.ownerDocument.querySelectorAll<HTMLElement>("[data-object-version-page]").forEach(element => { element.textContent = `版本 ${state.objectVersion}`; });
}
/** The steps beside the composer keep their place while the person is in that row (§3.6, AC-15). */
function paintSteps(root: HTMLElement, state: DemoState, recommendation: RecommendationState): void {
  offerSteps(recommendation, nextSteps(state));
  root.querySelectorAll<HTMLButtonElement>("[data-step-index]").forEach(button => {
    const step = recommendation.visible ? recommendation.shown[Number(button.dataset.stepIndex)] : undefined;
    button.hidden = !step;
    if (!step) return;
    text(button, "[data-step-label]", step.label);
    attr(button, "data-step-action", step.action);
    attr(button, "data-secondary", step.primary ? null : "");
    attr(button, "data-busy", step.busy ? "" : null);
    attr(button, "aria-busy", step.busy ? "true" : null);
    attr(button, "title", `来自${step.source}`);
    button.disabled = !stepLive(recommendation, step);
  });
  const composerOpen = draftable(state) && !state.questionClosed;
  show(root, "[data-composer-target]", composerOpen);
  const composer = find<HTMLInputElement | HTMLTextAreaElement>(root, "[data-composer]");
  attr(composer, "placeholder", composerOpen ? "补充要求，回车放进问卷…" : state.question === "received" ? "继续说，或用旁边的下一步…" : "补充这一轮的要求…");
}
export function paint(root: HTMLElement, state: DemoState, recommendation: RecommendationState): void {
  paintFields(root, state, recommendation);
  paintQuestion(root, state);
  paintOperation(root, state);
  paintWork(root, state);
  paintSteps(root, state, recommendation);
  root.querySelectorAll<HTMLElement>("[data-notice]").forEach(element => { if (element.textContent !== state.notice) element.textContent = state.notice; });
  root.dataset.questionState = state.question;
  root.dataset.executionState = state.execution;
}
