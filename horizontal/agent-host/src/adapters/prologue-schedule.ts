import type { QueuedTask, Runtime } from "@prologue/sdk";
import type { AgentScheduledTask } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PrologueRuntimePort } from "./prologue.js";
import { agentErrors } from "../errors.js";
import type { SessionIndexStore } from "./prologue-session-index.js";

/**
 * Timed work the runtime keeps across restarts. Its runner is attached once, when the runtime is made; the Host registers
 * what each kind does later, so a task that falls due while the Host is still starting waits for its runner instead of
 * failing.
 */
export function createPrologueSchedule() {
  const runners = new Map<string, (task: AgentScheduledTask) => Promise<void>>();
  const view = (task: QueuedTask): AgentScheduledTask => ({
    task_id: task.ref.id, key: task.key, session_id: task.sessionRef.id, kind: task.work.kind, payload: { ...task.work.payload },
    due_at: new Date(task.dueAtMs).toISOString(), state: task.state, attempts: task.attempts, runs: task.runs, ...(task.lastFailure ? { last_failure: task.lastFailure } : {}) });
  const run = async (task: QueuedTask): Promise<void> => {
    for (let waited = 0; !runners.has(task.work.kind) && waited < 120_000; waited += 500) await new Promise(resolve => setTimeout(resolve, 500));
    const runner = runners.get(task.work.kind);
    if (!runner) throw new Error(`没有处理「${task.work.kind}」的执行者`);
    await runner(view(task));
  };
  /** The schedule port, once the runtime and the session index exist. */
  const port = (runtime: Runtime, index: SessionIndexStore): NonNullable<PrologueRuntimePort["schedule"]> => ({
    claim: () => { const claim = runtime.queue.claim(); return { survives_window_close: claim.survivesWindowClose, why: claim.why }; },
    enqueue: async input => {
      const session = await index.read(input.session_id);
      if (!session) throw agentErrors.session_unknown("会话不存在，不能安排定时");
      const due = Date.parse(input.due_at);
      if (!Number.isFinite(due)) throw agentErrors.capability_unavailable("定时的时间无效");
      return view(await runtime.queue.enqueue({ key: input.key, sessionRef: session.ref, work: { kind: input.kind, payload: { ...input.payload } }, dueAtMs: due,
        ...(input.max_attempts ? { maxAttempts: input.max_attempts } : {}) }));
    },
    cancel: async key => {
      const task = runtime.queue.find(key);
      if (!task) return null;
      if (task.state !== "queued") return view(task);
      return view(await runtime.queue.cancel(task.ref));
    },
    find: key => { const task = runtime.queue.find(key); return task ? view(task) : null; },
    list: kind => runtime.queue.list().filter(task => !kind || task.work.kind === kind).map(view),
    handle: (kind, runner) => { runners.set(kind, runner); return () => { if (runners.get(kind) === runner) runners.delete(kind); }; },
  });
  return { run, port };
}
