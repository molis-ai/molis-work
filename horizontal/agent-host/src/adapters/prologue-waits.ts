import type { BackgroundTask, ExactRef, HeldWait, Runtime, WaitCondition } from "@prologue/sdk";
import type { AgentBackgroundTask } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentCollaborationCondition, AgentCollaborationControl, AgentCollaborationPort, AgentCollaborationSessionView, AgentCollaborationWait, AgentContinuationView } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { agentErrors } from "../errors.js";
import { readyStep } from "./prologue-collaboration.js";

/** What the waits need to know about a session: its project, and how the person knows it. */
export interface WaitSessions {
  project(sessionId: string): Promise<string | undefined>;
  /** How the person knows a session. */
  title(sessionId: string): Promise<string>;
}

/** How long the Host's own waits (a round queued behind another) may last: a week, like a request between sessions. */
export const APP_WAIT_MS = 7 * 24 * 60 * 60 * 1000;

const iso = (ms: number) => new Date(ms).toISOString();
/** A continuation (and its step) held for the person: the wait failed or expired, or its result needs reconciling. */
const HELD: readonly string[] = ["blocked", "needs-reconciliation"];
const boardRef = (id: string) => ({ kind: "task-board", id, revision: 1 }) as ExactRef<"task-board">;
const task = (one: BackgroundTask): AgentBackgroundTask => ({
  task_id: one.id, session_id: one.session.id, ...(one.run ? { run_id: one.run.id } : {}), summary: one.summary, state: one.state,
  ...(one.exitCode === undefined ? {} : { exit_code: one.exitCode }), started_at_ms: one.startedAtMs, ...(one.endedAtMs === undefined ? {} : { ended_at_ms: one.endedAtMs }),
});

/**
 * The project's waits and continuations as Molis reads them, and its background commands (specs/prologue-adoption
 * §4.6.10). The SDK's task graph owns every wait (it hangs on a step) and the step's one continuation; nothing here
 * keeps a copy: each view is read from the graph when asked. A wait over while its session runs a round is handed to
 * that round by the SDK; otherwise the continuation stays eligible until the session's next round is started under its
 * request key.
 */
export function createPrologueWaits(runtime: Runtime, sessions: WaitSessions) {
  const now = async () => (await runtime.readClock()).wallTimeMs;
  const listeners = new Set<() => void>();
  const changed = () => { for (const listener of [...listeners]) listener(); };
  const unsubscribe = [runtime.waits.subscribe(changed), runtime.boards.subscribe(event => { if (event.type === "wait") changed(); })];
  const inProject = async (project: string, sessionId: string) => (await sessions.project(sessionId)) === project;
  const nodeOf = (board: string, node: string) => { try { return runtime.boards.get(boardRef(board)).nodes.find(one => one.id === node); } catch { return undefined; } };
  /** One condition as a person would say it. */
  const label = async (condition: WaitCondition): Promise<{ ref: string; label: string }> => {
    if (condition.kind === "command") return { ref: condition.task, label: `后台命令 ${runtime.background.get(condition.task)?.summary ?? condition.task}${condition.until === "output" ? (condition.match ? `输出「${condition.match}」` : "的新输出") : "结束"}` };
    if (condition.kind === "envelope") {
      let to: string | undefined;
      try { to = runtime.delivery.get(condition.envelope).to.id; } catch { to = undefined; }
      return { ref: condition.envelope.id, label: `会话「${to ? await sessions.title(to) : "?"}」的答复` };
    }
    if (condition.kind === "node") {
      const title = nodeOf(condition.board, condition.node)?.title;
      // A project work item's title is 「session」task: the person knows it by the session.
      return { ref: `${condition.board}/${condition.node}`, label: `${title?.match(/^「[^」]*」/)?.[0] ?? title ?? condition.node}那一步` };
    }
    if (condition.kind === "pending") return { ref: condition.pending.id, label: "你的回答" };
    return { ref: `${condition.check.checker.id}@${condition.check.checker.version}`, label: condition.check.source ? `${condition.check.source.kind} ${condition.check.source.id}` : "外部检查" };
  };
  const waitView = async (wait: HeldWait): Promise<AgentCollaborationWait> => {
    const conditions: AgentCollaborationCondition[] = [];
    for (const [index, condition] of wait.on.entries()) {
      const seen = wait.observations[index]!, named = await label(condition);
      conditions.push({ kind: condition.kind, ...named, last: { status: seen.status, at: iso(seen.atMs), ...(seen.note ? { note: seen.note } : {}), ...(seen.checkerError ? { checker_error: seen.checkerError.code } : {}) } });
    }
    return { wait_id: wait.ref.id, session_id: wait.session.id, ...(wait.run ? { run_id: wait.run.id } : {}), graph_id: wait.scope.board, node_id: wait.scope.node,
      by: wait.by, reason: wait.reason, mode: wait.mode, until: wait.until, on_failure: wait.onFailure, deadline_at: iso(wait.deadlineMs), conditions, state: wait.state,
      ...(wait.continued ? { continued: true as const } : {}), created_at: iso(wait.createdAtMs), ...(wait.settledAtMs === undefined ? {} : { settled_at: iso(wait.settledAtMs) }),
      ...(wait.note === undefined ? {} : { note: wait.note }) };
  };
  const continuationOf = (wait: HeldWait): AgentContinuationView | undefined => {
    const continuation = nodeOf(wait.scope.board, wait.scope.node)?.continuation;
    if (!continuation || continuation.wait.ref.id !== wait.ref.id) return undefined;
    return { graph_id: wait.scope.board, node_id: wait.scope.node, session_id: continuation.target.session.id, request_key: continuation.requestKey, state: continuation.state,
      auto: continuation.auto, ...(continuation.run ? { run_id: continuation.run.id } : {}), ...(continuation.reason ? { reason: { code: continuation.reason.code, ...(continuation.reason.note ? { note: continuation.reason.note } : {}) } } : {}) };
  };
  /**
   * A continuation held for the person stays held while its step does: once the person starts a round or gives the wait
   * up, the step is given back and the continuation is left as it was (the SDK has no way out of it but a new wait).
   */
  const stillHeld = (wait: HeldWait, continuation: AgentContinuationView) => HELD.includes(continuation.state) && HELD.includes(nodeOf(wait.scope.board, wait.scope.node)?.state ?? "");
  /** A session's wait that still matters: the open one, or the latest whose continuation was not taken up or given up. */
  const sessionView = async (sessionId: string): Promise<AgentCollaborationSessionView> => {
    const held = [...runtime.waits.list({ session: sessionId })].sort((a, b) => b.createdAtMs - a.createdAtMs);
    for (const wait of held) {
      const continuation = continuationOf(wait);
      if (wait.state === "waiting" || continuation && !["started", "cancelled"].includes(continuation.state) && (!HELD.includes(continuation.state) || stillHeld(wait, continuation))) {
        return { session_id: sessionId, wait: await waitView(wait), ...(continuation ? { continuation } : {}) };
      }
    }
    return { session_id: sessionId };
  };
  const read = async (project: string, sessionId?: string): Promise<AgentCollaborationSessionView[]> => {
    const ids = sessionId ? [sessionId] : [...new Set(runtime.waits.list().map(wait => wait.session.id))];
    const out: AgentCollaborationSessionView[] = [];
    for (const id of ids) if (await inProject(project, id)) out.push(await sessionView(id));
    return out;
  };
  const ready = async (project: string, exclude: readonly string[]) => (await read(project))
    .filter(view => view.continuation && ["eligible", "blocked", "needs-reconciliation"].includes(view.continuation.state) && !exclude.includes(view.continuation.request_key));
  const owned = async (project: string, waitId: string) => {
    const wait = runtime.waits.get(waitId);
    if (!wait || !(await inProject(project, wait.session.id))) throw agentErrors.collaboration_unknown("这个等待不属于这个项目");
    return wait;
  };
  const collaboration: AgentCollaborationPort = {
    read,
    async awaitReady(project, timeoutMs, exclude = [], signal) {
      // A change is not yet a continuation that may go on (a wait's look, another project's step): look again until one
      // is, the time is up, or the caller stops.
      for (const deadline = Date.now() + timeoutMs; ;) {
        const found = await ready(project, exclude), left = deadline - Date.now();
        if (found.length || left <= 0 || signal?.aborted) return found;
        await new Promise<void>(resolve => {
          const done = () => { clearTimeout(timer); listeners.delete(done); signal?.removeEventListener("abort", done); resolve(); };
          const timer = setTimeout(done, left);
          listeners.add(done);
          signal?.addEventListener("abort", done);
        });
      }
    },
    async control(project, control: AgentCollaborationControl, actorId) {
      const wait = await owned(project, control.wait_id), at = await now();
      if (wait.state !== "waiting") {
        // Over already, its step held for the person: giving it up gives the step back (the person's decision, on the
        // step's record); going on is the round the person starts now, which gives it back the same way.
        const continuation = continuationOf(wait);
        if (!continuation || !stillHeld(wait, continuation)) throw agentErrors.collaboration_conflict("这个等待已经结束");
        if (control.kind === "cancel-wait") await readyStep(runtime, wait.scope.board, wait.scope.node, actorId, control.note ?? "用户取消了等待");
        return sessionView(wait.session.id);
      }
      if (control.kind === "cancel-wait") await runtime.waits.cancel(wait.ref.id, at, control.note ?? "用户取消了等待");
      else await runtime.waits.continueEarly(wait.ref.id, at, control.note ?? "用户选择不再等，直接接着做");
      return sessionView(wait.session.id);
    },
  };
  return {
    collaboration,
    background: {
      async read(project: string, sessionId?: string): Promise<AgentBackgroundTask[]> {
        const out: AgentBackgroundTask[] = [];
        for (const one of runtime.background.list(sessionId ? { session: sessionId } : undefined)) if (await inProject(project, one.session.id)) out.push(task(one));
        return out;
      },
      async stop(project: string, taskId: string): Promise<boolean> {
        const one = runtime.background.get(taskId);
        if (!one || !(await inProject(project, one.session.id))) throw new Error("这个后台命令不属于这个项目");
        return runtime.background.stop(taskId);
      },
    },
    /**
     * The person queued a round behind another piece of the project's work: the session's step waits, by "app", for that
     * work's step; once it succeeds the step may go on, and the queued round is started under the continuation's key.
     * Work that does not succeed holds the step for the person.
     */
    async queueBehind(session: ExactRef<"session">, at: { board: string; node: string }, work: { board: string; node: string }, reason: string): Promise<{ waitId: string; already: boolean }> {
      let step = nodeOf(at.board, at.node);
      if (!step) throw new Error("会话的任务图不可读，不能排队");
      // A wait hangs on a step under way: a session that never ran is put under way, and waits once the wait is armed.
      if (step.state === "ready") { await runtime.boards.transition({ ref: boardRef(at.board), nodeId: at.node, to: "running" }); step = nodeOf(at.board, at.node)!; }
      const nowMs = await now();
      const armed = await runtime.waits.arm({ session, reason, by: "app", arrangement: {
        scope: { board: at.board, node: at.node, generation: step.generation }, on: [{ kind: "node", board: work.board, node: work.node }],
        mode: "all", until: "success", onFailure: "block", onEarlyContinue: "keep", deadlineMs: nowMs + APP_WAIT_MS, autoContinue: true,
      } }, nowMs);
      // No round of this session runs now: the step waits (a running round would hand it over when it ends).
      if (!armed.already && nodeOf(at.board, at.node)?.state === "running") await runtime.boards.transition({ ref: boardRef(at.board), nodeId: at.node, to: "waiting" });
      return { waitId: armed.wait.ref.id, already: armed.already };
    },
    /** The queued round started anyway and took over its waiting item: the wait that would have started it goes. */
    async queueTakenOver(sessionId: string, at: { board: string; node: string }) {
      const nowMs = await now();
      for (const wait of runtime.waits.list({ session: sessionId })) if (wait.state === "waiting" && wait.by === "app" && wait.scope.board === at.board && wait.scope.node === at.node)
        await runtime.waits.cancel(wait.ref.id, nowMs, "等待中的那一轮已开始");
    },
    close() { for (const off of unsubscribe) off(); changed(); },
  };
}
