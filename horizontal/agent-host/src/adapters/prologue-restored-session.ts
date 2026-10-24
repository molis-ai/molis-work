import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import type { PrologueControlPort, PrologueRestoredSession, RunRecord, SessionRecord } from "./prologue.js";
import { applyRunEvent, closeInterruptedPrologueStream, runStreamState } from "./prologue-stream.js";

/** Restore only immutable observations. SDK reads and active execution stay with their existing owners. */
export function restoredSessionRecords(restored: PrologueRestoredSession): { session: SessionRecord; records: RunRecord[] } {
  const session: SessionRecord = { title: restored.title, owner: restored.owner, workspace: restored.workspace ?? "required", runs: [],
    ...(restored.recovery ? { recovery: restored.recovery } : {}) };
  const records: RunRecord[] = [];
  for (const saved of restored.runs) {
    const { state, endedAt } = restorePrologueRun(saved);
    // Replayed records are immutable observations. A new Run continues the
    // same SDK session; old control handles cannot be resurrected.
    const unavailable = (): never => { throw agentErrors.capability_unavailable("历史执行没有活动控制句柄，不能重放停止、回答或继续指令"); };
    const control: PrologueControlPort = { state: state.phase === "reconcile-required" ? "reconcile-required" : "running",
      stop: unavailable, pause: unavailable, resume: unavailable, steer: unavailable, subscribe: () => () => {} };
    const view: AgentRunView = { ref: saved.ref, frozen: saved.frozen, started_at: saved.started_at, ended_at: endedAt,
      phase: state.phase, turns: [], activity: [], usage: state.usage, awaiting_input: [],
      ...(saved.original_input ? { original_input: structuredClone(saved.original_input) } : {}),
      ...(saved.memory_context?.class_restrictions ? { class_restrictions: structuredClone(saved.memory_context.class_restrictions), memory_scene: saved.memory_context.current_scene } : {}) };
    records.push({ view, state, control, unsubscribe: () => {}, listeners: new Set(), timingReady: true,
      ...(saved.memory_context ? { memory_context: saved.memory_context } : {}) });
    session.runs.push(saved.ref);
  }
  return { session, records };
}

function isEnded(phase: string): boolean {
  return phase === "completed" || phase === "failed" || phase === "cancelled" || phase === "stopped";
}

/** One interpretation of persisted progress for both the directory and full history. */
export function restorePrologueRun(saved: PrologueRestoredSession["runs"][number]) {
  const state = runStreamState(saved.frozen.model_context?.prompt_includes_cache ?? false, saved);
  state.turns.push({ turn_id: "user-1", kind: "user", text: saved.task, at: saved.started_at, sequence: 0 });
  let firstPrompt = true;
  let endedAt: string | null = null;
  for (const event of saved.events ?? []) {
    if (event.type === "prompt" && event.role === "user" && firstPrompt) {
      firstPrompt = false;
      if (event.text === saved.task) continue;
    }
    const atMs = (event as { atMs?: unknown }).atMs;
    const at = typeof atMs === "number" && Number.isFinite(atMs) ? new Date(atMs).toISOString() : null;
    applyRunEvent(state, event, at);
    if (isEnded(state.phase) && typeof atMs === "number") endedAt = at;
  }
  if (saved.timing) {
    const turns = new Map(saved.timing.turns.map(item => [item.turn_id, item.at]));
    const activity = new Map(saved.timing.activity.map(item => [item.call_id, item.at]));
    state.turns = state.turns.map(item => turns.has(item.turn_id) ? { ...item, at: turns.get(item.turn_id)! } : item);
    state.activity = state.activity.map(item => activity.has(item.call_id) ? { ...item, at: activity.get(item.call_id)! } : item);
    if (isEnded(state.phase)) endedAt = saved.timing.ended_at;
  }
  for (const question of saved.original_questions ?? []) {
    if (!state.awaiting_input.some(held => held.pending_id === question.pending_id)) state.awaiting_input.push({ ...question, sequence: state.next_sequence++ });
  }
  if (!saved.events || !isEnded(state.phase)) {
    closeInterruptedPrologueStream(state);
    if (saved.terminal) {
      // The runtime sealed the run; only its progress stopped short (the service went down while it was ending).
      // Nothing is left to reconcile for it — an operation with an unknown outcome would still be open work, and that
      // holds the whole session for checking — so it reads as ended, and says why the record is short.
      state.phase = saved.stop_intent === "stopped" ? "stopped" : "failed";
      state.stop_reason = saved.stop_intent === "stopped"
        ? "已停止（服务在这一轮结束时中断，过程记录不完整；运行时确认它已结束，没有待核对的操作）"
        : "这一轮在服务中断时结束，过程记录不完整；运行时确认它已结束，没有待核对的操作。不会自动重跑。";
    } else {
      state.phase = "reconcile-required";
      state.stop_reason = "这轮执行在中断前没有提交完整事件账，已发生的操作需要核对；不会自动重跑。";
    }
  }
  if (state.phase === "cancelled" && saved.stop_intent === "stopped") { state.phase = "stopped"; state.stop_reason = saved.stop_reason ?? "已停止"; }
  return { state, endedAt };
}
