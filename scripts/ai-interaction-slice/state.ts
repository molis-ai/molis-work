import { cloneValues, composeWhen, type DemoState, type Field, type Values, type WhenParts } from "./model.ts";
import { validateValues } from "./validation.ts";

const durationAsk = /时长(?:改为|改成|设为)\s*(\d+)\s*分钟/;
/** The question can still take this answer. */
export function editable(state: DemoState): boolean {
  return state.question === "open" || state.question === "failed";
}
/** The draft can still change: also after the question expired, was replaced or was declined, so nobody is cut off
 * mid-sentence; only submitting is refused then. While submitting or once received the answer is fixed. */
export function draftable(state: DemoState): boolean {
  return editable(state) || ["expired", "replaced", "cancelled"].includes(state.question);
}
function noteProposal(state: DemoState): void {
  const suggested = state.values.notes.match(durationAsk)?.[1] ?? null;
  if (suggested !== state.dismissedSuggestion) state.dismissedSuggestion = null;
  state.conflict = suggested !== state.values.minutes && suggested !== state.dismissedSuggestion ? suggested : null;
}
export function edit<K extends Field>(state: DemoState, field: K, value: Values[K]): boolean {
  if (!draftable(state) || state.execution === "running") return false;
  state.values[field] = value;
  state.edited.add(field);
  state.refreshed = state.refreshed.filter(name => name !== field);
  delete state.errors[field];
  state.preview = null;
  if (field === "notes") noteProposal(state);
  if (field === "minutes") {
    state.dismissedSuggestion = state.values.notes.match(durationAsk)?.[1] ?? null;
    state.conflict = null;
  }
  return true;
}
/** One half of the start time; the composed value is the single answer the question receives. */
export function editWhen(state: DemoState, part: keyof WhenParts, value: string): boolean {
  if (!draftable(state) || state.execution === "running") return false;
  state.whenParts = { ...state.whenParts, [part]: value };
  return edit(state, "when", composeWhen(state.whenParts));
}
/** A composition that ends after the question changed still lands in the draft whenever the draft is open. */
export function finishComposition(state: DemoState, field: "notes" | "minutes" | "date" | "when", value: string): void {
  edit(state, field, value);
}
/** The composer keeps its own words until they are sent, whatever happens to the question meanwhile. */
export function setDraft(state: DemoState, value: string): void {
  state.draft = value;
}
/** Sending from the composer while a question waits puts the words into that question's notes; nothing is answered. */
export function appendDraft(state: DemoState): boolean {
  const words = state.draft.trim();
  if (!words) return false;
  if (!draftable(state)) {
    state.notice = "这份问题现在不能填写，文字留在输入框里。";
    return false;
  }
  const notes = state.values.notes.trim();
  edit(state, "notes", notes ? `${notes}\n${words}` : words);
  state.draft = "";
  state.notice = !editable(state) ? "已放进「补充要求」草稿；这份问题不能再交回。" :
    state.conflict === null ? "已放进「补充要求」，还没有提交。" : "已放进「补充要求」。里面提到的时长需要你确认。";
  return true;
}
export function resolveConflict(state: DemoState, adopt: boolean): void {
  if (!draftable(state) || state.conflict === null) return;
  const proposal = state.conflict;
  if (adopt) edit(state, "minutes", proposal);
  state.dismissedSuggestion = proposal;
  state.conflict = null;
  state.notice = adopt ? "时长已改为文字里的数；补充原文保留。" : "保留字段里的时长；原文只作补充，不覆盖参数。";
}
export function backgroundUpdate(state: DemoState): void {
  state.refreshed = [];
  if (editable(state) && !state.edited.has("minutes") && state.values.minutes !== "45") {
    state.values.minutes = "45";
    state.refreshed = ["minutes"];
  }
  state.notice = state.refreshed.length ? "示例材料已同步：未改过的时长更新为 45 分钟，你填过的内容不变。" : "示例材料已同步；你填过的内容与阅读位置保持不变。";
}
export function invalidate(state: DemoState, kind: "expired" | "replaced" | "object"): void {
  state.epoch++;
  state.question = kind === "object" ? "replaced" : kind;
  if (kind === "object") state.objectVersion++;
  state.execution = state.execution === "running" || state.execution === "unknown" ? "unknown" : "stale";
  state.preview = null;
  state.previewVersion = null;
  state.notice = kind === "object" ? "原对象已变为新版本。旧参数不能执行，需要重新准备。" : "旧问题不能再提交。填写内容保留，可以请助理重新问。";
}
export function reopen(state: DemoState): boolean {
  if (state.execution === "running" || state.execution === "unknown" || state.execution === "done") return false;
  state.epoch++;
  state.version = state.objectVersion;
  state.question = "open";
  state.execution = "ready";
  state.received = null;
  state.preview = null;
  state.previewVersion = null;
  state.errors = {};
  state.questionClosed = false;
  state.notice = "已重新准备演示问题，请复核保留的草稿。";
  return true;
}
export function cancelAnswer(state: DemoState): void {
  if (!editable(state) && state.question !== "submitting") return;
  state.epoch++;
  state.question = "cancelled";
  state.notice = "没有交回答案。草稿留在这里。";
}
export function beginAnswer(state: DemoState): number | null {
  if (!editable(state) || state.version !== state.objectVersion) return null;
  state.errors = validateValues(state.values);
  if (state.conflict !== null) state.errors.notes = "补充里提到了新的时长：先选择采用它，或保留字段值。";
  if (Object.keys(state.errors).length) {
    const count = Object.keys(state.errors).length;
    state.notice = `还有 ${count} 项需要修正，已保留全部填写。`;
    return null;
  }
  state.question = "submitting";
  state.answerAttempts++;
  state.notice = "正在交回演示答案，不会创建日程或修改文件。";
  return ++state.epoch;
}
export function settleAnswer(state: DemoState, ticket: number, fail = false): boolean {
  if (state.epoch !== ticket || state.question !== "submitting" || state.version !== state.objectVersion) return false;
  state.question = fail ? "failed" : "received";
  state.received = fail ? null : cloneValues(state.values);
  state.notice = fail ? "模拟交回失败，填写已保留。可以重试。" : "回答已接收（模拟）。下一步先预览参数，尚未执行任何操作。";
  return true;
}
