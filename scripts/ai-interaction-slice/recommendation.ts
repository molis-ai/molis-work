import type { DemoState } from "./model.ts";

/**
 * A step beside the composer is only a view of an existing record (§15.6): the operation card, the question, or a
 * professional follow-up the plugin derives from the run. Pressing it does what that record does; it never executes
 * on appearance. At most one primary and one secondary sit in the row.
 */
export interface NextStep {
  /** The record it speaks for: `card` (operation card), `question`, `result`, `changes`, `continue`. */
  id: string;
  label: string;
  action: string;
  primary: boolean;
  busy?: boolean;
  /** Where the step comes from, read out with it. */
  source: string;
}
export interface RecommendationState {
  visible: boolean;
  eligible: boolean;
  focused: boolean;
  hovered: boolean;
  composing: boolean;
  /** What the row shows; it changes only while nobody is pointing at, focused in or composing in the row. */
  shown: NextStep[];
  /** What the records currently offer. */
  latest: NextStep[];
}
export function createRecommendation(): RecommendationState {
  return { visible: true, eligible: true, focused: false, hovered: false, composing: false, shown: [], latest: [] };
}
/** Typing and composing always hold the row; a pointer holds it only while a shown step could still be pressed. */
function locked(state: RecommendationState): boolean {
  if (state.focused || state.composing) return true;
  return state.hovered && !(state.shown.length > 0 && state.shown.every(step => step.busy));
}
/** A stale step disables at once but keeps its slot until the interaction ends. */
export function syncRecommendation(state: RecommendationState): void {
  if (locked(state)) return;
  state.visible = state.eligible;
  state.shown = state.latest;
}
export function setEligible(state: RecommendationState, eligible: boolean): void {
  state.eligible = eligible;
  syncRecommendation(state);
}
export function setInteraction(state: RecommendationState, kind: "focused" | "hovered" | "composing", value: boolean): void {
  state[kind] = value;
  syncRecommendation(state);
}
/** A change the person caused by pressing a step shows at once, under their hand. */
export function adoptSteps(state: RecommendationState): void {
  state.shown = state.latest;
  state.visible = state.eligible;
}
export function offerSteps(state: RecommendationState, steps: NextStep[]): void {
  state.latest = steps;
  setEligible(state, steps.length > 0);
}
/** A shown step may run only while the same record still offers the same operation. */
export function stepLive(state: RecommendationState, step: NextStep): boolean {
  return !step.busy && state.latest.some(next => next.id === step.id && next.action === step.action && !next.busy);
}
export function nextSteps(state: DemoState): NextStep[] {
  const card = state.layout === "coding" ? "验收安排操作卡" : "复盘安排操作卡";
  const step = (id: string, label: string, action: string, source: string, primary = true, busy = false): NextStep =>
    ({ id, label, action, primary, busy, source });
  if (state.execution === "running") return [step("card", "执行中…", "execute", card, true, true)];
  if (state.execution === "unknown") return [step("card", "核对结果", "reconcile", card)];
  if (state.execution === "done") {
    return [
      state.layout === "coding" ? step("changes", "查看变更", "changes", "Coding 的审查") : step("result", "打开结果", "result", card),
      step("continue", "继续调整", "continue", card, false),
    ];
  }
  if (state.question === "received") {
    if (state.execution === "failed") return [step("card", "检查参数并重试", "retry", card)];
    return state.preview ? [step("card", "执行（模拟）", "execute", card)] : [step("card", "预览参数", "preview", card)];
  }
  if (["expired", "replaced", "cancelled"].includes(state.question)) {
    return [step("question", state.version !== state.objectVersion ? "按新版本重新准备" : "请助理重新问", "reopen", "问卷")];
  }
  if (state.questionClosed && (state.question === "open" || state.question === "failed")) {
    return [step("question", "继续填写", "open", "问卷")];
  }
  return [];
}
