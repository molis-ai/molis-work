import { cloneValues, type DemoState, type Field, type Values } from "./model.ts";
import { validateValues } from "./validation.ts";

export function editable(state: DemoState): boolean {
  return state.question === "open" || state.question === "failed";
}
function noteProposal(state: DemoState): void {
  const suggested = state.values.notes.match(/时长(?:改为|改成|设为)\s*(\d+)\s*分钟/)?.[1] ?? null;
  if (suggested !== state.dismissedSuggestion) state.dismissedSuggestion = null;
  state.conflict = suggested !== state.values.minutes && suggested !== state.dismissedSuggestion ? suggested : null;
}
export function edit<K extends Field>(state: DemoState, field: K, value: Values[K]): boolean {
  if (!editable(state) || state.execution === "running") return false;
  state.values[field] = value;
  state.edited.add(field);
  delete state.errors[field];
  state.preview = null;
  if (field === "notes") noteProposal(state);
  if (field === "minutes") {
    state.dismissedSuggestion = state.values.notes.match(/时长(?:改为|改成|设为)\s*(\d+)\s*分钟/)?.[1] ?? null;
    state.conflict = null;
  }
  return true;
}
export function finishComposition(state: DemoState, field: "notes" | "minutes" | "date" | "when", value: string): void {
  if (editable(state)) { edit(state, field, value); return; }
  if (!["expired", "replaced", "cancelled"].includes(state.question)) return;
  state.values[field] = value;
  state.edited.add(field);
  if (field === "notes") noteProposal(state);
}
export function resolveConflict(state: DemoState, adopt: boolean): void {
  if (!editable(state) || state.conflict === null) return;
  const proposal = state.conflict;
  if (adopt) edit(state, "minutes", proposal);
  state.dismissedSuggestion = proposal;
  state.conflict = null;
  state.notice = adopt ? "时长已更新；补充原文仍然保留。" : "保留字段里的时长；原文作为补充，不覆盖参数。";
}
export function backgroundUpdate(state: DemoState): void {
  if (editable(state) && !state.edited.has("minutes")) state.values.minutes = "45";
  state.notice = "示例材料已同步；已编辑的字段与阅读位置保持不变。";
}
export function invalidate(state: DemoState, kind: "expired" | "replaced" | "object"): void {
  state.epoch++;
  state.question = kind === "object" ? "replaced" : kind;
  if (kind === "object") state.objectVersion++;
  state.execution = state.execution === "running" || state.execution === "unknown" ? "unknown" : "stale";
  state.preview = null;
  state.previewVersion = null;
  state.notice = kind === "object" ? "原对象已变为另一版本。旧参数不能执行，请重新准备。" : "旧问题不能再提交。填写内容保留，可重新准备演示。";
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
  if (state.conflict !== null) state.errors.notes = "请先选择采用文字中的时长，或保留字段值。";
  if (Object.keys(state.errors).length) { state.notice = "还有字段需要修正，已保留全部填写。"; return null; }
  state.question = "submitting";
  state.answerAttempts++;
  state.notice = "正在交回演示答案，不会创建日程或修改文件。";
  return ++state.epoch;
}
export function settleAnswer(state: DemoState, ticket: number, fail = false): boolean {
  if (state.epoch !== ticket || state.question !== "submitting" || state.version !== state.objectVersion) return false;
  state.question = fail ? "failed" : "received";
  state.received = fail ? null : cloneValues(state.values);
  state.notice = fail ? "模拟提交失败，填写已保留。可以重试。" : "已接收 · 模拟答案。下一步先预览参数，尚未执行任何操作。";
  return true;
}
