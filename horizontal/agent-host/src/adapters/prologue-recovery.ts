import { originalInputOf } from "./prologue-original-inputs.js";
import type { QueuedInput, Runtime } from "@prologue/sdk";
import type { AgentRecoveryReport, AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentQueuedInput } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { PrologueRestoredSession, PrologueRuntimePort } from "./prologue.js";
import type { createPrologueCheckpoints } from "./prologue-checkpoints.js";
import type { RoundState } from "./prologue-node-kit.js";
import type { SessionIndex, SessionIndexStore } from "./prologue-session-index.js";

/**
 * What a session needs checked after an interruption, and its runs read back for the page (W4-06 split this out of the
 * Node composition). Nothing here re-runs anything: an operation without a known outcome stays to be checked.
 */
interface RecoveryDeps {
  readonly runtime: Runtime;
  readonly index: SessionIndexStore;
  readonly state: Pick<RoundState, "sessions">;
  readonly checkpoints: ReturnType<typeof createPrologueCheckpoints> | undefined;
}

type OpenWork = Awaited<ReturnType<Runtime["listOpenWork"]>>;

/** A run or open item of the session that no start claims: the only thing a start without a reference could have made. */
export const unclaimedWork = (index: SessionIndex, terminal: readonly { id: string }[], open: OpenWork) =>
  terminal.some(ref => !index.attempts.some(attempt => attempt.run_id === ref.id))
  || open.items.some(item => item.origin.session === index.ref.id && !index.attempts.some(attempt => attempt.run_id === item.origin.run || attempt.run_id === item.id));

/** A supplement still waiting in the session, in the Host's words; the runtime's record stays its only owner. */
export const queuedInput = (input: QueuedInput): AgentQueuedInput => ({ input_id: input.inputId, text: input.text,
  ...(input.original ? { original: { ...input.original } } : {}),
  ...(input.acceptedAtMs === undefined ? {} : { accepted_at_ms: input.acceptedAtMs }),
  source: input.source === "app" ? "host" : input.source, ...(input.key ? { key: input.key } : {}), ...(input.about ? { about: input.about } : {}),
  ...(input.from ? { left_by: { run_id: input.from.run, applied: input.from.applied } } : {}) });

export function createPrologueRecovery(deps: RecoveryDeps) {
  const { runtime, index: sessionIndex } = deps;
  /** Subtasks of this session left without a known outcome, as the runtime projects them after a restart. */
  const childrenToReconcile = (sessionId: string) => runtime.subagents.list()
    .filter(child => child.parentSession.id === sessionId && child.state === "reconcile-required");

  /** What waits for the next round; a session that cannot be opened leaves it unknown (undefined), never empty. */
  const queued = async (ref: SessionIndex["ref"]) => (await (await runtime.sessions.open(ref))?.inputQueue())?.queued.map(queuedInput);

  const inspect = async (sessionId: string): Promise<AgentRecoveryReport> => {
    const current = sessionIndex.capture(sessionId);
    const index = await sessionIndex.read(sessionId);
    if (!index) throw new Error("会话执行索引不可用");
    const report = await runtime.sessions.inspectRecovery(index.ref);
    const open = await runtime.listOpenWork();
    const blockers: string[] = [];
    // Same rule as restoring the session: a start refused before its run existed, or one that provably made no run.
    if (index.attempts.some(attempt => !attempt.run_id && !attempt.refused)) {
      const opened = await runtime.sessions.open(index.ref);
      // Unreadable runs or open work leave the start unexplained; only a full, claimed picture rules it out.
      if (!opened || open.unavailable.length || unclaimedWork(index, await opened.terminalRuns(), open)) blockers.push("一次启动未保存完整引用，暂不能确认它对应的操作。");
    }
    if (report.runs.some(run => !index.attempts.some(attempt => attempt.run_id === run.ref.id))) blockers.push("存在未关联到此会话启动记录的轮次，需要核对来源。");
    if (open.unavailable.length) blockers.push("部分运行记录不可读取，请恢复存储访问后重新核对。");
    if (open.items.some(item => item.origin.session === sessionId && !report.runs.some(run => run.ref.id === item.origin.run || run.ref.id === item.id))) blockers.push("还有未关联到中断轮次的等待或操作，暂不能安全继续。");
    type RecoveredRun = Awaited<ReturnType<typeof runtime.sessions.inspectRecovery>>["runs"][number];
    const view = (run: RecoveredRun, subagent?: { subagent_id: string }) => {
      const reasons: string[] = [];
      if (run.live) reasons.push("此会话仍有活动执行，请通过执行控件停止。");
      if (run.operations.some(operation => operation.outcome === "unknown")) reasons.push("有操作缺少可核实的结果；不会自动重复执行，也不能将它标记为成功。");
      if (run.blockers.length && !reasons.length) reasons.push("执行或操作记录尚未核实，请稍后重新核对。");
      return { run_id: run.ref.id, version: run.version, live: run.live, waiting: run.waiting,
        operations: run.operations.map(operation => ({ ...operation })), blockers: reasons,
        can_close: run.canClose && blockers.length === 0, ...(run.canAnswer && blockers.length === 0 ? { can_answer: true as const } : {}),
        ...(run.questions.length ? { questions: run.questions.map(question => ({ pending_id: question.ref.id, pending_revision: question.ref.revision, kind: question.kind,
          prompt: question.prompt, ...(question.answered ? { answered: true as const } : {}) })) } : {}),
        ...(subagent ? { subagent } : {}) };
    };
    // A subtask cut off by a restart blocks every new round of its parent until its own interrupted run is closed.
    const children = [];
    for (const child of childrenToReconcile(sessionId)) {
      const own = await runtime.sessions.inspectRecovery(child.session).catch(() => undefined);
      if (!own) { blockers.push("有子任务的中断记录不可读取，暂不能安全继续。"); continue; }
      if (!own.runs.length) blockers.push("有子任务的结果需要核对，但找不到它可以结束的中断轮次。");
      children.push(...own.runs.map(run => view(run, { subagent_id: child.ref.id })));
    }
    const queue = await queued(index.ref);
    current();
    return { session_id: sessionId, blockers, ...(queue ? { inputs: queue } : {}),
      runs: [...report.runs.map(run => view(run)), ...children] };
  };

  /** Why a restored session needs checking before a new round, if it does. */
  const restoreReasons = async (id: string, index: SessionIndex, terminal: readonly { id: string }[], open: OpenWork): Promise<string[]> => {
    const reasons: string[] = [];
    if (open.unavailable.length) reasons.push("未能查清运行时的未结束工作，暂不能安全继续");
    const mine = open.items.filter(item => item.origin.session === id);
    // A round parked at a normal shutdown on a question that can still be answered waits for the person, not for checking.
    const parked = mine.length ? (await runtime.sessions.inspectRecovery(index.ref).catch(() => undefined))?.runs.filter(run => run.canAnswer && run.parked) ?? [] : [];
    if (mine.length && mine.every(item => parked.some(run => item.id === run.ref.id || item.id === run.parked!.pending.id))) reasons.push("上一轮停在一道等你回答的问题上：回答后接着做，也可以结束那一轮");
    else if (mine.length) reasons.push("此会话仍有中断的执行、等待或结果未知的操作，需要核对");
    if (childrenToReconcile(id).length) reasons.push("有子任务在中断后结果待核对：核对并结束它的中断轮次后，才能开始新一轮");
    if (terminal.some(ref => !index.attempts.some(attempt => attempt.run_id === ref.id))) reasons.push("SDK 有执行记录缺少宿主启动索引，需要核对对应关系");
    return reasons;
  };

  // Both paths inspect every start and all SDK recovery facts; only transcript replay is selective.
  const restore = async (id: string, statusOnly = false): Promise<(PrologueRestoredSession & { planned?: AgentRunRef }) | undefined> => {
    const current = sessionIndex.capture(id);
    const index = await sessionIndex.read(id);
    if (!index) return undefined;
    const session = await runtime.sessions.open(index.ref);
    if (!session) throw new Error("SDK 会话已不可读，保留原引用，不能创建新会话替代");
    if (index.workspace !== "none" && index.workspace !== "business") await deps.checkpoints?.restore(id);
    const terminal = await session.terminalRuns();
    const open = await runtime.listOpenWork();
    const reasons = await restoreReasons(id, index, terminal, open);
    const runs: PrologueRestoredSession["runs"] = [];
    const reverse = [...index.attempts].reverse();
    const last = reverse.find(attempt => attempt.run_id);
    const planned = reverse.find(attempt => attempt.run_id && attempt.frozen.execution_plan);
    const unclaimed = open.unavailable.length > 0 || unclaimedWork(index, terminal, open);
    for (const attempt of index.attempts) {
      // A start the runtime refused never created a run; one with no reference is only unknown while some run or
      // open item of this session is claimed by no start, because that is the only run it could have made.
      if (!attempt.run_id) { if (!attempt.refused && unclaimed) reasons.push("一次启动没有完整保存执行引用，不能判断是否发生过操作"); continue; }
      const ref = terminal.find(ref => ref.id === attempt.run_id);
      const pendingQuestions = !ref && (!statusOnly || attempt === last) ? (await runtime.effects.pendings.readByOrigin({ session: id, run: attempt.run_id })).filter(pending => pending.state !== "settled" && ["text", "questionnaire"].includes(pending.kind)) : [];
      if (!ref) reasons.push("中断轮次仅有已保存的过程，结束状态与操作仍需核对，不会自动重复执行");
      if (statusOnly && attempt !== last) continue;
      runs.push({ ref: { run_id: attempt.run_id, session_id: id }, frozen: attempt.frozen,
        started_at: attempt.started_at, task: attempt.task,
        original_input: originalInputOf(index, attempt.original_input?.ref ?? attempt.original_input_ref),
        ...(attempt.memory_context ? { memory_context: attempt.memory_context } : {}),
        ...(attempt.stop_intent ? { stop_intent: attempt.stop_intent } : {}),
        ...(attempt.stop_reason ? { stop_reason: attempt.stop_reason } : {}),
        ...(attempt.timing ? { timing: attempt.timing } : {}),
        ...(attempt.desktop_target ? { desktop_target: attempt.desktop_target } : {}),
        ...(ref ? { terminal: true } : {}),
        ...(!ref ? { original_questions: pendingQuestions.filter(pending => pending.origin?.run === attempt.run_id).map(pending => ({ pending_id: pending.ref.id, pending_revision: pending.ref.revision, kind: pending.kind, why: pending.why })) } : {}),
        events: ref ? await session.replay(ref) : await session.readRunProgress({ kind: "run", id: attempt.run_id, revision: 1 }) });
    }
    current(); deps.state.sessions.set(id, index.ref);
    return { title: index.title, owner: index.owner, workspace: index.workspace ?? "required", runs,
      ...(planned ? { planned: { session_id: id, run_id: planned.run_id! } } : {}),
      ...(reasons.length ? { recovery: { required: true as const, reason: [...new Set(reasons)].join("；") } } : {}) };
  };

  /** The recovery port: inspect, and close an interrupted round once nothing about it is left unknown. */
  const port: NonNullable<PrologueRuntimePort["recovery"]> = {
    inspect: session => inspect(session.session_id),
    close: async (session, runId, expectedVersion) => {
      const index = await sessionIndex.read(session.session_id);
      // The session's own round, or the interrupted round of one of its subtasks: that one closes in the child's session.
      const child = childrenToReconcile(session.session_id).find(entry => entry.run.id === runId);
      if (!index?.attempts.some(attempt => attempt.run_id === runId) && !child) throw new Error("这轮执行不属于当前会话");
      const before = await inspect(session.session_id);
      if (before.blockers.length || before.runs.some(run => run.run_id === runId && !run.can_close)) throw new Error("仍有待核实的操作，不能关闭中断轮次");
      await runtime.sessions.recoverRun(child ? child.session : index!.ref, { kind: "run", id: runId, revision: 1 }, expectedVersion);
      return inspect(session.session_id);
    },
  };
  /** The session's waiting supplements, read on their own: no recovery check (specs/ai-input-receipts D31). */
  const queuedOf = async (sessionId: string) => { const current = sessionIndex.capture(sessionId), index = await sessionIndex.read(sessionId); const result = index ? await queued(index.ref) : undefined; current(); return result; };
  return { inspect, restore, port, queued: queuedOf };
}
