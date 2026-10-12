import { cloneValues, type DemoState, type Outcome } from "./model.ts";

export function preparePreview(state: DemoState): boolean {
  if (state.question !== "received" || !state.received || state.version !== state.objectVersion ||
      !["ready", "failed"].includes(state.execution)) return false;
  const afterFailure = state.execution === "failed";
  state.preview = cloneValues(state.received);
  state.previewVersion = state.objectVersion;
  // Looking at the parameters again acknowledges the failure: the card is ready for one explicit new attempt.
  state.execution = "ready";
  state.notice = afterFailure ? "上次执行没有成功；参数已重新展开，确认后再点「执行（模拟）」。" : "参数已展开。只有点「执行（模拟）」才会执行。";
  return true;
}
export function beginExecution(state: DemoState): number | null {
  if (state.question !== "received" || !state.preview || state.previewVersion !== state.objectVersion ||
      !["ready", "failed"].includes(state.execution)) return null;
  state.execution = "running";
  state.effectAttempts++;
  state.notice = "正在模拟执行；重复点击不会再次执行。";
  return ++state.epoch;
}
export function settleExecution(state: DemoState, ticket: number, outcome: Outcome): boolean {
  if (state.epoch !== ticket || state.execution !== "running" || state.previewVersion !== state.objectVersion) return false;
  state.execution = outcome;
  state.notice = outcome === "done" ? "演示结果已生成，没有创建真实日程或修改文件。" :
    outcome === "unknown" ? "模拟连接中断，结果未知。请先核对，不会自动再次执行。" : "模拟执行被拒绝，未产生结果。可检查参数后重试。";
  return true;
}
export function reconcile(state: DemoState): boolean {
  if (state.execution !== "unknown") return false;
  state.execution = state.version === state.objectVersion ? "done" : "stale";
  state.notice = state.execution === "done" ? "模拟核对：此前的执行已完成。本次只读取示例结果，没有再次执行。" :
    "模拟核对：旧版本执行已落定；对象已变化，需重新准备。没有再次执行。";
  return true;
}
export function continueDraft(state: DemoState): boolean {
  if (state.execution !== "done") return false;
  state.epoch++;
  state.question = "open";
  state.execution = "ready";
  state.received = null;
  state.preview = null;
  state.previewVersion = null;
  state.questionClosed = false;
  state.notice = "继续调整的是新一份演示草稿；不会重复之前的执行。";
  return true;
}
