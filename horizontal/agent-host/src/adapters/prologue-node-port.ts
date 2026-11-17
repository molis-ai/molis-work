import { readOriginalInput, resolveOriginalInput } from "./prologue-original-inputs.js";
import { createHash, randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { DEFAULT_CONTEXT_WINDOW_TOKENS, WORKSPACE_COMMAND_RECEIPT_KIND, createRuntime, type ConditionCheckers, type ExactRef, type ModelRequestObserved, type PendingAnswer, type QueuedTask, type Runtime, type SessionOpeningReader } from "@prologue/sdk";
import type { AgentReviewReceipt, AgentRunRef, AgentWriteCheckNote } from "@molis-ai/molis-work-contracts/services/agent-host";
import { GATEWAY_TOOLS, HOST_GOVERNED_TOOLS } from "./prologue-action-gateway.js";
import type { createPrologueCheckpoints } from "./prologue-checkpoints.js";
import { createCollaborationHost, readyStep, sessionBlock, type ContinuationStarts, type DispatchChecks } from "./prologue-collaboration.js";
import { createPrologueImageIntake } from "./prologue-images.js";
import { createPrologueGitReviews } from "./prologue-git.js";
import { MAX_BROADCAST } from "./prologue-messages.js";
import { workPaths } from "./prologue-project-work.js";
import { answerProblems, ownedReferences, projectQuestion, questionUnavailable } from "./prologue-questions.js";
import { queuedInput, type createPrologueRecovery } from "./prologue-recovery.js";
import { startPrologueRun, type RunDeps } from "./prologue-run.js";
import type { PrologueEffects } from "./prologue-effects.js";
import { runModelParams } from "./prologue-run-params.js";
import type { createPrologueSchedule } from "./prologue-schedule.js";
import { createPrologueSubagents, exactCharacterKey, runLineage, SUBAGENT_DEFAULT_MAX_ATTEMPTS, type PrologueSubagentHooks } from "./prologue-subagents.js";
import { surfaceRules, type PrologueSurfaces } from "./prologue-surfaces.js";
import { codingExecutionRules } from "./prologue-taskboard.js";
import type { PrologueAdapterOptions, PrologueRuntimePort } from "./prologue.js";
import { PROLOGUE_RUNTIME_ID } from "./prologue-adapter-capabilities.js";
import { agentErrors } from "../errors.js";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { withDispatchControl } from "./prologue-dispatch.js";
import { MAX_COMPOSED_INSTRUCTION_CHARS, readResource, sameRef, stageTextResource, unexecutedApprovalCallOf, type CommandEvent, type DispatchControl, type DispatchGuard, type NodeHost, type PrologueNodeAdapterOptions, type RoundState } from "./prologue-node-kit.js";
import { SESSION_INDEX_SCHEMA, type SessionIndexStore } from "./prologue-session-index.js";
import type { createPrologueMemoryAuthority } from "./prologue-memory-authority.js";
import type { ReviewDecisionStore } from "../review-decisions.js";

/**
 * The runtime the Node composition makes, and the port it hands the adapter (W4-06 split these out of
 * `initializePrologueNodeAdapter`, which now only puts the parts together).
 */

/** Turns a subagent may take when its dispatch does not say; the user set it to 20. */
export const SUBAGENT_DEFAULT_TURNS = 20;

/** The Prologue runtime on the Node host, with the Host's limits, posture and the rules every round runs under. */
export function createNodeRuntime(options: PrologueNodeAdapterOptions, host: NodeHost, runScheduled: (task: QueuedTask) => Promise<void>, surfaceHost: () => PrologueSurfaces | undefined, dispatchChecks: DispatchChecks, conditionCheckers: ConditionCheckers, memoryAccess: ReturnType<typeof createPrologueMemoryAuthority>, modelRequests: RoundState["modelRequests"], starts: ContinuationStarts) {
  return createRuntime({
    app: options.app,
    host,
    memoryAuthority: memoryAccess.authority,
    ...(memoryAccess.promotion ? { memoryPromotion: memoryAccess.promotion } : {}),
    ...(memoryAccess.sources ? { memorySources: memoryAccess.sources } : {}),
    // Before each child a round dispatches, the Host asks that round's own check again (specs/prologue-adoption §4.6.10); a
    // continuation that may go on by itself goes to the starter the composition root serves (specs/work-line, result return).
    collaborationHost: createCollaborationHost(dispatchChecks, starts),
    // What a step may wait on outside the runtime: the Host's checkers, each look checked again against the round (prologue-checkers.ts).
    conditionCheckers,
    // Screenshots leave only after the driver covered password, card and one-time-code fields (spec D10).
    ...(options.surfaces ? { surfaces: { screenshots: "redact" as const,
      redactScreenshot: (bytes: Uint8Array) => { const bound = surfaceHost(); return bound ? bound.redact(bytes) : Promise.reject(new Error("界面控制尚未就绪")); } } } : {}),
    preset: "local-agent",
    onQueuedWork: runScheduled,
    // Each request a round's loop sends, as the runtime handed it to the Host, for the round's work record (observation, batch 28).
    onModelRequest: request => { for (const listen of modelRequests) { try { listen(request); } catch { /* a listener's fault stays its own */ } } },
    slots: {
      ...(memoryAccess.extractor ? { "memory-extractor": { implementation: "molis-host-memory-extractor", version: /* @version protocol.prologue.implementation.node-port */ "1.0.0", impl: memoryAccess.extractor } } : {}),
    },
    // The runtime's turn default is what a subagent gets when its dispatch names none; the user set it to 20.
    // A request between sessions may wait for the other side's whole round, or a restart: a week, not half an hour.
    // Background commands belong to the session and keep running after its round (the person's decision), at most four
    // at a time; a step waits up to a week, like a request.
    // One intake batch holds the 50 originals one call may send (Prologue's default is 30; images from one folder are one batch).
    config: { ...(options.memory ? { memory: options.memory.policy } : {}), delivery: { defaultTtlMs: 7 * 24 * 60 * 60 * 1000, maxPeopleBodyChars: 24_000 }, background: { outliveRun: true, maxPerSession: 4 }, waits: { maxDeadlineMs: 7 * 24 * 60 * 60 * 1000 }, agent: { maxTurns: SUBAGENT_DEFAULT_TURNS }, tool: { deferToolSchemasBeyond: 32, maxTimeoutMs: 300_000, observation: { maxLines: 1000, maxBytes: 64 * 1024 }, inputWaitTtlMs: 24 * 60 * 60 * 1000, ...(options.questionTypes?.length ? { askUserQuestionTypes: options.questionTypes } : {}),
      ...(options.referenceKinds?.length && options.questionTypes?.includes("reference") ? { askUserReferenceKinds: options.referenceKinds } : {}) }, context: { maxInstructionChars: MAX_COMPOSED_INSTRUCTION_CHARS }, resource: { publish: { maxBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 }, intake: { maxItemsPerBatch: 50, maxItemBytes: 32 * 1024 * 1024, maxBatchBytes: 128 * 1024 * 1024 } }, model: { images: { maxResponseBytes: 40 * 1024 * 1024, maxImageBytes: 20 * 1024 * 1024, maxImages: 4 } } },
    network: { model: true, mcp: true, loopback: true },
    posture: options.reviewQueue
      ? { sandbox: "workspace-write", approval: "untrusted" }
      : { sandbox: "read-only", approval: "on-request" },
    // A step's wait only says what the step waits for and ends the run; what it rests on is checked when it is registered (prologue-checkers.ts).
    ...(options.reviewQueue ? { permissionMode: { mode: "auto-allow" as const, allow: [{ what: "tool" as const, name: "board-report" }, { what: "tool" as const, name: "board-wait" }, { what: "tool" as const, name: "session-send" }] }, rules: [...codingExecutionRules,
      // A change through the business gateway always stops for the person's review of its exact input; its reads do not.
      { source: "runtime" as const, effect: "ask" as const, match: { what: "tool" as const, name: GATEWAY_TOOLS.change } },
      // A reversible change the person lets run without asking: the gateway itself refuses any other change on this tool.
      { source: "runtime" as const, effect: "ask" as const, match: { what: "tool" as const, name: GATEWAY_TOOLS.direct } },
      // A suggestion, a delegated work, a memory: recorded under the Host's own rules and limits, as before, without asking.
      ...HOST_GOVERNED_TOOLS.map(name => ({ source: "runtime" as const, effect: "allow" as const, match: { what: "tool" as const, name } })),
      // The side panel's browser: looking is allowed, every action asks, the person's standing site decisions apply.
      ...(options.surfaces ? surfaceRules() : [])] } : {}),
    require: ["secrets", "network", "clock", "workspace.read", "storage"],
  });
}

/** Git index reviews, their decisions kept encrypted in the Host's store. Only when the Host owns a review queue. */
export function createNodeGitReviews(options: PrologueNodeAdapterOptions, host: NodeHost, runtime: Runtime, decisions: ReviewDecisionStore) {
  if (!options.reviewQueue) return undefined;
  const kind = `molis-git-review-${createHash("sha256").update(options.app.appId).digest("hex").slice(0, 24)}`;
  const update = async (id: string, patch: { failure_reason?: string; reconciliation?: NonNullable<AgentReviewReceipt["reconciliation"]> },
    decided?: Pick<AgentReviewReceipt, "status" | "decided_by" | "decided_at" | "note">) => {
    const record = await host.storage.get({ kind, id });
    if (record?.tombstoned || !record && !decided) throw new Error("原 Git 审查记录不可读取");
    // An explicit reconciliation uses the already restored decision, including
    // when the optional old projection never committed. No source is inferred here.
    const original = decided ? undefined : await host.storage.readSecure({ kind, id });
    let bytes: Uint8Array | undefined;
    try {
      const decision = decided ?? JSON.parse(new TextDecoder().decode(original));
      bytes = new TextEncoder().encode(JSON.stringify({ ...decision, ...patch }));
      await host.storage.commit({ kind, id, expectedVersion: record?.version ?? 0, metadata: { schema: 1 }, secureBody: bytes });
    } finally { original?.fill(0); bytes?.fill(0); }
  };
  return createPrologueGitReviews({ runtime, queue: options.reviewQueue, decisionStore: decisions,
    publish: value => stageTextResource(runtime, JSON.stringify(value), "git-index-review"), read: ref => readResource(runtime, ref),
    async saveDecision(id, value) {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      try { await host.storage.commit({ kind, id, expectedVersion: 0, metadata: { schema: 1 }, secureBody: bytes }); }
      finally { bytes.fill(0); }
    },
    async saveFailure(id, reason) {
      await update(id, { failure_reason: reason });
    },
    saveReconciliation: (id, reconciliation, decided) => update(id, { reconciliation }, decided),
    async readDecision(id) {
      const record = await host.storage.get({ kind, id });
      if (!record || record.tombstoned) return undefined;
      const bytes = await host.storage.readSecure({ kind, id });
      try { return JSON.parse(new TextDecoder().decode(bytes)); } finally { bytes.fill(0); }
    },
  });
}

interface PortDeps extends RunDeps {
  readonly host: NodeHost;
  readonly starts: ContinuationStarts;
  readonly schedule: ReturnType<typeof createPrologueSchedule>;
  readonly effects: PrologueEffects;
  readonly recovery: ReturnType<typeof createPrologueRecovery>;
  readonly checkpoints: ReturnType<typeof createPrologueCheckpoints> | undefined;
  readonly readQuestion: (run: AgentRunRef, id: string, revision: number) => ReturnType<Runtime["effects"]["pendings"]["read"]> extends Promise<infer P> ? Promise<NonNullable<P>> : never;
  readonly shutdown: PrologueRuntimePort["shutdown"];
}

/** Marking a session as priority: the other sessions working on the same files are asked to give them up for now. */
function prioritize(deps: PortDeps): NonNullable<PrologueRuntimePort["messages"]>["prioritize"] {
  return async (project, sessionId, actorId) => {
    const { projectWork, state } = deps;
    const index = await deps.index.read(sessionId).catch(() => undefined);
    if (!index || index.owner.project_id !== project) throw new Error("会话不属于这个项目");
    // Its work under way (or waiting): the files it names, against the other work under way in its directory.
    const mine = (await projectWork.read(project)).items.find(item => item.session_id === sessionId && ["running", "waiting"].includes(item.state));
    if (!mine) return { notified: [], paths: [] };
    const seen = await projectWork.read(project, { session_id: sessionId, directory: mine.directory, paths: mine.paths });
    const targets = [...new Set(seen.overlaps.map(overlap => overlap.work.session_id))].slice(0, MAX_BROADCAST);
    const paths = [...new Set(seen.overlaps.flatMap(overlap => overlap.paths))];
    // The person's word, said by the Host to each round running now: it is not a letter between the sessions' agents.
    const text = `（宿主代用户发出）用户把会话「${mine.title.slice(0, 40)}」标成了优先。它要改 ${paths.join("、")}：请让出这些文件——先别再改它们，手头和它们有关的修改先停下，说明你停在哪里；等它做完或用户另行安排再继续。和这些文件无关的部分照常做。（标记人：${actorId}）`;
    const notified: string[] = [];
    for (const target of targets) {
      const run = state.liveSessions.get(target), active = run ? state.activeRuns.get(run) : undefined;
      if (!active?.live()) continue;
      await active.steer(text).then(() => notified.push(target), () => undefined);
    }
    return { notified, paths };
  };
}

/** The project's work under way: read, queued behind another work (the session's step waits on it), released. */
function projectWorkPort(deps: PortDeps): NonNullable<PrologueRuntimePort["projectWork"]> {
  const { projectWork } = deps;
  return {
    read: (project, probe) => projectWork.read(project, probe && { ...(probe.session_id ? { session_id: probe.session_id } : {}), directory: probe.directory, paths: workPaths(probe.text) }),
    async queue(project, input, actorId) {
      const index = await deps.index.read(input.session.session_id);
      if (!index || index.owner.project_id !== project) throw new Error("会话不属于这个项目");
      const item = await projectWork.queue(project, { session: index.ref, title: input.title?.slice(0, 120) ?? index.title, task: input.task, directory: input.directory, paths: workPaths(input.task), after: input.after, person: actorId });
      // The session's own step waits on the work's step; whoever queued the round starts it once the step may go on.
      const target = (await projectWork.read(project)).items.find(work => work.work_id === input.after);
      let armed: { waitId: string; already: boolean };
      try {
        // The project's work board holds both: the session's block, and the work it waits for.
        const board = { kind: "task-board", id: await projectWork.projectId(project), revision: 1 } as ExactRef<"task-board">;
        const block = await sessionBlock(deps.runtime, board, index.ref, index.title);
        await readyStep(deps.runtime, board.id, block, actorId);
        armed = await deps.waitsPort.queueBehind(index.ref, { board: board.id, node: block }, { board: board.id, node: input.after },
          `等「${(target?.title ?? input.after).slice(0, 40)}」那一轮完成后再开始`);
      } catch (error) {
        // That work's session is already waiting on this one: they would wait on each other for ever.
        await projectWork.release(project, item.work_id, actorId, "没有排上：会互相等待").catch(() => undefined);
        if ((error as { code?: unknown }).code === "WAIT_CYCLE") throw new Error(`不能这样等：「${(target?.title ?? input.after).slice(0, 40)}」那边已经在等这个会话，两边会一直互相等。先让其中一边继续，或者不等直接开始。`);
        throw error;
      }
      if (armed.already) {
        await projectWork.release(project, item.work_id, actorId, "要等待的那项工作已经结束").catch(() => undefined);
        throw new Error("要等待的那项工作已经结束，可以直接开始");
      }
      return { ...item, wait_id: armed.waitId };
    },
    release: (project, workId, actorId, note) => projectWork.release(project, workId, actorId, note),
  };
}

/** A command's receipt, read back from the exact resource the runtime published for it; anything inconsistent is refused. */
function readCommandOutput(deps: PortDeps): NonNullable<PrologueRuntimePort["readCommandOutput"]> {
  return async (sessionId, ref) => {
    const { runtime, state } = deps;
    const index = await deps.index.read(sessionId);
    if (!index) throw new Error("会话执行索引不可用");
    const session = await runtime.sessions.open(index.ref);
    if (!session) throw new Error("SDK 会话不可读");
    const terminal = await session.terminalRuns();
    const matches: Array<{ event: CommandEvent; runId: string; root: ExactRef<"authorized-root">; check?: AgentWriteCheckNote }> = [];
    for (const attempt of index.attempts) {
      if (!attempt.run_id || !attempt.root_ref || ref.run_id && ref.run_id !== attempt.run_id) continue;
      const saved = terminal.find(run => run.id === attempt.run_id);
      const events = saved ? await session.replay(saved) : state.commandEvents.get(attempt.run_id) ?? [];
      for (const event of events) if (event.type === "command-receipt" && event.callId === ref.call_id) {
        // A person's after-write check answers one write: its receipt is that write's `<call id>:diagnostics`, and the
        // executor noted which checker it chose under the write's call id (§6.0p.4: the SDK's receipt names neither).
        const check = Object.values(attempt.write_checks ?? {}).find(note => note.write_call_id !== undefined && `${note.write_call_id}:diagnostics` === ref.call_id);
        matches.push({ event, runId: attempt.run_id, root: attempt.root_ref, ...(check ? { check } : {}) });
      }
    }
    if (matches.length !== 1) throw new Error(matches.length ? "命令引用对应多次执行，请指定轮次" : "没有这次命令的持久回执；结果未知，不能当作成功或自动重跑");
    const { event, runId, root, check } = matches[0]!;
    const record = await readResource(runtime, event.receiptRef);
    const receipt = record.receipt;
    if (record.kind !== WORKSPACE_COMMAND_RECEIPT_KIND || record.version !== 1 || !sameRef(record.rootRef, root)
      || typeof record.executable !== "string" || !Array.isArray(record.argv) || !record.argv.every((arg: unknown) => typeof arg === "string")
      || !receipt || receipt.commandId !== event.commandId || !sameRef(receipt.effectRef, event.effectRef)
      || typeof receipt.stdout !== "string" || typeof receipt.stderr !== "string" || typeof receipt.truncated !== "boolean"
      || typeof receipt.timedOut !== "boolean" || typeof receipt.cancelled !== "boolean"
      || receipt.exitCode !== undefined && !Number.isInteger(receipt.exitCode)
      || receipt.stopReason !== undefined && !["cancelled", "timed-out"].includes(receipt.stopReason)) throw new Error("命令回执与这轮执行不一致，不能展示为已确认结果");
    return { ref: { run_id: runId, call_id: ref.call_id }, command: [record.executable, ...record.argv.map((arg: string) => JSON.stringify(arg))].join(" "),
      exit_code: receipt.exitCode ?? null, stdout: receipt.stdout, stderr: receipt.stderr, truncated: receipt.truncated,
      timed_out: receipt.timedOut, cancelled: receipt.cancelled, ...(receipt.stopReason ? { stop_reason: receipt.stopReason } : {}),
      ...(check ? { after_write_check: { checker_id: check.checker_id, display_name: check.display_name, version: check.version } } : {}) };
  };
}

/** Sessions: created with their Host index, restored with their runs, read for their status only. */
function sessionsPort(deps: PortDeps): PrologueRuntimePort["sessions"] {
  const open = async (ref: import("@molis-ai/molis-work-contracts/services/agent-host").AgentSessionRef) => {
    if (ref.runtime_id !== PROLOGUE_RUNTIME_ID) throw agentErrors.session_unknown("执行会话不属于当前运行时");
    const index = await deps.index.read(ref.session_id);
    const session = index && await deps.runtime.sessions.open(index.ref);
    if (!index?.owner || !session || !["active", "archived"].includes(session.state)) throw agentErrors.session_unknown("原执行会话已不存在或已永久结束");
    return { index, session };
  };
  const read: NonNullable<PrologueRuntimePort["sessions"]["lifecycle"]>["read"] = async ref => {
    const { index, session } = await open(ref);
    if (session.state !== "active" && session.state !== "archived") throw agentErrors.session_unknown("原执行会话已永久结束");
    return { owner: { ...index.owner }, view: { session: { ...ref }, state: session.state } };
  };
  return {
    lifecycle: {
      async readOwner(ref) {
        if (ref.runtime_id !== PROLOGUE_RUNTIME_ID || typeof ref.session_id !== "string" || !ref.session_id)
          throw agentErrors.session_unknown("原会话引用不属于当前运行时");
        const saved = await deps.index.read(ref.session_id);
        if (!saved) return undefined;
        if (!saved.owner) throw agentErrors.session_unknown("原会话索引缺少可核验主人");
        return { ...saved.owner };
      },
      observeWrites(refs) {
        if (refs.some(ref => ref.runtime_id !== PROLOGUE_RUNTIME_ID || typeof ref.session_id !== "string" || !ref.session_id))
          throw agentErrors.session_unknown("来源会话引用不属于当前运行时");
        return deps.effects.observeSessionWrites([...new Set(refs.map(ref => ref.session_id))]);
      },
      read,
      async archive(ref) { const { session } = await open(ref); if (session.state !== "archived") await session.archive(); return (await read(ref)).view; },
      async unarchive(ref) { const { session } = await open(ref); if (session.state !== "active") await session.restore(); return (await read(ref)).view; },
    },
    create: (input, execution) => deps.effects.start(execution, async () => {
      const session = await deps.runtime.sessions.create();
      try { await deps.index.save({ schema: SESSION_INDEX_SCHEMA, ref: session.ref, title: input.title, workspace: input.workspace ?? "required",
        owner: { project_id: input.project_id, plugin_id: input.plugin_id, install_id: input.install_id, actor_id: input.actor_id }, attempts: [] }); }
      catch (error) {
        try {
          // Only this unpublished Session is eligible: a durable owner index is the Session acceptance point.
          if (!await deps.index.read(session.ref.id)) await deps.effects.detach(async () => session.purge(await session.previewPurge()));
        } catch (cleanup) { throw new AggregateError([error, cleanup], "新会话没有被接受，清理未完成"); }
        throw error;
      }
      deps.state.sessions.set(session.ref.id, session.ref);
      return session;
    }),
    restore: id => deps.recovery.restore(id),
    originalInput: (id, input) => resolveOriginalInput(deps.index, id, input),
    readOriginalInput: ref => readOriginalInput(deps.index, ref),
    async locateInput(sessionId, inputId) {
      const index = await deps.index.read(sessionId);
      if (!index) return undefined;
      const session = await deps.runtime.sessions.open(index.ref);
      const found = await session?.locateInput(inputId);
      if (!found) return undefined;
      if (found.state === "queued") return { state: "queued", input: queuedInput(found.input) };
      return found.state === "withdrawn" ? { state: "withdrawn" }
        : { state: "run", run: { session_id: sessionId, run_id: found.run.id } };
    },
    queued: id => deps.recovery.queued(id),
    async readStatus(id) {
      const saved = await deps.recovery.restore(id, true);
      return saved ? { owner: saved.owner, recovery: saved.recovery, latest: saved.runs.at(-1), planned: saved.planned } : undefined;
    },
  };
}

/** The runtime's session behind one of ours, or the reason it cannot be read. */
async function openSessionOf(deps: PortDeps, sessionId: string, unreadable: string) {
  const index = await deps.index.read(sessionId), session = index && await deps.runtime.sessions.open(index.ref);
  if (!session) throw agentErrors.session_unknown(unreadable);
  return session;
}

async function continueSubagentAttempt(
  deps: PortDeps,
  { parentRun, child, baseTask, reason, source, attemptNumber }: Parameters<NonNullable<PrologueSubagentHooks["continueChild"]>>[0],
): Promise<void> {
  const { runtime, state } = deps;
  const parentIndex = await deps.index.read(parentRun.session_id);
  const parentAttempt = parentIndex?.attempts.find(item => item.run_id === parentRun.run_id);
  if (!parentIndex || !parentAttempt) throw agentErrors.run_unknown("父任务执行记录不可用，不能重试子任务");
  const childIndex = await deps.index.read(child.session.id).catch(() => undefined);
  const role = child.character ? new Map(parentAttempt.subagent_roles ?? []).get(exactCharacterKey(child.character)) : undefined;
  const rootRef = childIndex?.attempts[0]?.root_ref;
  const baseFrozen = childIndex?.attempts[0]?.frozen;
  const model = parentAttempt.model_selection
    ? await deps.options.modelConfiguration(parentAttempt.model_selection)
    : parentAttempt.frozen_model ?? await deps.options.modelConfiguration();
  if (!model) throw agentErrors.model_not_configured("当前未配置可用模型，不能重试子任务");
  const credentialRef = await deps.credentials.prologueRefFor(model.credential_ref);
  const params = runModelParams(model, parentAttempt.frozen.budget ?? null, parentAttempt.frozen.reasoning_effort);
  const cache = model.prompt_cache === undefined || model.prompt_cache === "off" ? {} : { promptCache: model.prompt_cache };
  const retryText = reason?.trim()
    ? `${baseTask}\n\n[第 ${attemptNumber} 次尝试（来源：${source}）补充说明：${reason.trim()}]`
    : `${baseTask}\n\n[第 ${attemptNumber} 次尝试（来源：${source}）：请先核对前次尝试的结果与失败点，再继续完成任务。]`;
  const firstRunId = (child.attempts?.[0] ?? child.run).id;
  const retryTasksSnapshot = { ...parentAttempt.subagent_retry_tasks };
  const readOpening: SessionOpeningReader = async ({ sessionRef, runRef }) => {
    if (!sameRef(sessionRef, child.session) || runRef.kind !== "run" || runRef.revision !== 1) return { status: "unavailable" };
    if (runRef.id === firstRunId) return { status: "original", user: [baseTask] };
    const priorTask = retryTasksSnapshot[runRef.id];
    return priorTask ? { status: "original", user: [priorTask] } : { status: "unavailable" };
  };
  await deps.effects.beforeEffect();
  deps.effects.assertCurrent();
  const fallbackGuard: DispatchGuard = async () => {
    const latestParent = await deps.index.read(parentRun.session_id);
    if (!latestParent) throw agentErrors.session_unknown("父会话已不存在，不能继续子任务");
    const childDir = baseFrozen?.directory?.canonical_path ?? parentAttempt.frozen.directory?.canonical_path;
    if (childDir) {
      const resolved = await realpath(childDir).catch(() => undefined);
      if (resolved !== childDir) throw agentErrors.directory_unauthorized("子任务工作区路径不可读或已变更");
      if (deps.options.checks?.directoryAuthorized && !(await deps.options.checks.directoryAuthorized(latestParent.owner.project_id, childDir))) {
        throw agentErrors.directory_unauthorized("子任务工作区已不再授权");
      }
    }
    await deps.mcpLibrary.validate(latestParent.owner, parentAttempt.frozen.mcp_tools ?? []);
    await deps.mcpLibrary.validateSources(latestParent.owner, parentAttempt.frozen.mcp_sources ?? []);
    return () => {};
  };
  const guard = state.dispatchChecks.get(parentRun.run_id) ?? fallbackGuard;
  const parentActive = state.activeRuns.get(parentRun.run_id);
  const assertCurrent = () => { parentActive?.assertAuthority(); deps.effects.assertCurrent(); };
  const control: DispatchControl = {
    assertCurrent,
    prepareDispatch: guard,
    beforeEffect: async () => { const fence = await guard(); requireSynchronous(fence?.()); assertCurrent(); },
  };
  const continued = await deps.effects.detach(() => withDispatchControl(deps.dispatchGuards, control, () => runtime.subagents.continue({
    child: child.ref,
    history: "session",
    readOpening,
    start: {
      protocol: model.protocol,
      endpoint: model.endpoint,
      model: model.model,
      credentialRef,
      ...(Object.keys(params).length ? { params } : {}),
      timeoutMs: 180_000,
      messages: [{ role: "user", text: retryText }],
      ...cache,
    },
    agent: {
      idempotencyKey: `molis-child-retry-${child.ref.id}-${attemptNumber}-${randomUUID()}`,
      mode: child.envelope?.mode ?? "autonomous",
      toolNames: child.tools ? [...child.tools] : [],
    },
  })));
  const newRunId = continued.run.ref.id;
  const childRun = { session_id: child.session.id, run_id: newRunId };
  state.sessionRuns.add(newRunId);
  state.activeRuns.set(newRunId, {
    live: () => ["prepared", "running"].includes(continued.run.state),
    assertAuthority: () => { parentActive?.assertAuthority(); },
    steer: async text => { await continued.control.steer({ text }); },
  });
  state.liveSessions.set(child.session.id, newRunId);
  if (rootRef) state.runRoots.set(newRunId, rootRef);
  const bridgeFailed = async () => {
    const failReason = "子任务的宿主审查或归属记录失败，已停止执行；请核对原工具结果后继续";
    const errors = state.subagentBridgeErrors.get(parentRun.run_id) ?? {};
    errors[newRunId] = failReason;
    state.subagentBridgeErrors.set(parentRun.run_id, errors);
    continued.control.stop("cancelled");
    try {
      await deps.index.update(parentRun.session_id, saved => {
        const attempt = saved.attempts.find(item => item.run_id === parentRun.run_id);
        if (attempt) attempt.subagent_errors = { ...attempt.subagent_errors, [newRunId]: failReason };
      });
    } catch {
      errors[newRunId] = failReason + "；失败原因未能持久保存，请保留当前记录";
    }
  };
  continued.run.subscribe(event => {
    if (["completed", "failed", "cancelled", "tripped", "circuit-tripped"].includes(event.type)) {
      if (state.liveSessions.get(child.session.id) === newRunId) state.liveSessions.delete(child.session.id);
      state.activeRuns.delete(newRunId);
      state.runRoots.delete(newRunId);
    }
    if (!rootRef && !role) return;
    if (event.type === "command-receipt") {
      const events = state.commandEvents.get(newRunId) ?? [];
      if (!events.some(saved => sameRef(saved.receiptRef, event.receiptRef))) events.push(event);
      state.commandEvents.set(newRunId, events);
    }
    if (event.type === "awaiting-approval" && deps.approvals) {
      void deps.approvals.mirrorPending({ pendingRef: event.pendingRef, owner: parentIndex.owner, run: childRun })
        .catch(rootRef ? bridgeFailed : () => continued.control.stop("cancelled"));
    }
  });
  try {
    await deps.index.update(parentRun.session_id, saved => {
      const attempt = saved.attempts.find(item => item.run_id === parentRun.run_id);
      if (!attempt) return;
      (attempt.subagent_attempt_sources ??= {})[newRunId] = source;
      if (reason?.trim()) (attempt.subagent_attempt_reasons ??= {})[newRunId] = reason.trim();
      (attempt.subagent_retry_tasks ??= {})[newRunId] = retryText;
    });
    if (childIndex && rootRef && baseFrozen) {
      await deps.index.update(child.session.id, saved => {
        saved.attempts.push({ started_at: new Date().toISOString(), task: retryText, run_id: newRunId, root_ref: rootRef, frozen: structuredClone(baseFrozen) });
      });
    }
  } catch (error) {
    continued.control.stop("cancelled");
    throw error;
  }
}

function nodeSubagentsPort(deps: PortDeps): NonNullable<PrologueRuntimePort["subagents"]> {
  return {
    workspaces: true as const,
    ...createPrologueSubagents(deps.runtime, async run => {
      const index = await deps.index.read(run.session_id), attempts = index?.attempts.filter(attempt => attempt.run_id === run.run_id) ?? [], attempt = attempts[0];
      if (!attempt?.frozen.directory) throw agentErrors.directory_unauthorized("原父任务没有工作区归属，不能分派目录子任务");
      return {
        child_openings: attempts.length === 1 && !attempt.refused ? attempt.child_openings : undefined,
        path: attempt.frozen.directory.canonical_path,
        roles: attempt.subagent_roles ?? [],
        roots: attempt.subagent_roots,
        step_prefix: attempt.step_prefix,
        budgets: attempt.subagent_budgets,
        attempt_sources: attempt.subagent_attempt_sources,
        attempt_reasons: attempt.subagent_attempt_reasons,
        nodes: attempt.subagent_nodes,
        errors: { ...attempt.subagent_errors, ...deps.state.subagentBridgeErrors.get(run.run_id) },
      };
    }, {
      defaultMaxTurns: SUBAGENT_DEFAULT_TURNS,
      async extendBudget(parentRun, subagentId, addAttempts) {
        await deps.index.update(parentRun.session_id, saved => {
          const attempt = saved.attempts.find(item => item.run_id === parentRun.run_id);
          if (!attempt) throw agentErrors.run_unknown("父任务执行记录不可用，不能调整子任务预算");
          const budgets = attempt.subagent_budgets ??= {};
          const current = budgets[subagentId]?.max_attempts ?? SUBAGENT_DEFAULT_MAX_ATTEMPTS;
          budgets[subagentId] = { max_attempts: current + addAttempts };
        });
      },
      continueChild: input => continueSubagentAttempt(deps, input),
    }),
  };
}

/** The port the adapter drives: every capability the Node composition offers, each from its own part. */
export function createNodePort(deps: PortDeps): PrologueRuntimePort {
  const { runtime, state, stepBoards, messages, mcpLibrary } = deps;
  const openSession = (sessionId: string, unreadable: string) => openSessionOf(deps, sessionId, unreadable);
  return {
    defaultContextWindowTokens: DEFAULT_CONTEXT_WINDOW_TOKENS,
    listenModelRequests(listen) {
      const heard = (request: ModelRequestObserved) => listen(request, () => runLineage(runtime, request.runId));
      state.modelRequests.add(heard); return () => { state.modelRequests.delete(heard); };
    },
    unexecutedApprovalCall(run, waiting) {
      return unexecutedApprovalCallOf(runtime, run, waiting);
    },
    readStepBoard: run => stepBoards.read(run),
    messages: { read: (project, sessionId) => messages.read(project, sessionId), cancel: (project, id) => messages.cancel(project, id),
      sendForPeople: (project, input, actorId) => messages.sendForPeople(project, input, actorId),
      act: (project, id, action, detail, actorId) => messages.act(project, id, action, detail, actorId),
      prioritize: prioritize(deps) },
    collaboration: { ...deps.waitsPort.collaboration, serveStarts: starter => deps.starts.serve(starter), revise: (run, amendment, expectedVersion, actor, ledger) => stepBoards.amend(run, amendment, expectedVersion, actor, ledger), works: deps.workGraphs.port },
    // A supplement that is to wait for the next round, or whose round has ended: the session keeps it, under its key, and gives it back while it still waits.
    queue: {
      add: async (sessionId, input) => (await openSession(sessionId, "这条会话读不到，补充留不到下一轮")).queueInput(input),
      withdraw: async (sessionId, inputId) => (await openSession(sessionId, "这条会话读不到，撤不回排着的补充")).withdrawQueuedInput(inputId),
    },
    background: deps.waitsPort.background,
    projectWork: projectWorkPort(deps),
    images: createPrologueImageIntake(runtime, deps.options.storageRoot),
    memory: deps.platformMemory.capability,
    schedule: deps.schedule.port(runtime, deps.index, deps.effects),
    recovery: deps.recovery.port,
    ...(deps.options.reviewQueue ? { subagents: nodeSubagentsPort(deps) } : {}),
    workspaceNone: true,
    workspaceBusiness: true,
    inlineMethods: true,
    compaction: true,
    ...(deps.checkpoints ? { checkpoints: deps.checkpoints } : {}),
    async saveRunTiming(run, timing) {
      await deps.index.update(run.session_id, index => {
        const attempt = index.attempts.find(item => item.run_id === run.run_id);
        if (!attempt) throw new Error("这轮执行不属于宿主会话索引，不能保存显示时间");
        attempt.timing = structuredClone(timing);
      });
    },
    actionTools: true,
    mcpLibrary,
    async readPendingQuestion(run, id, revision) {
      const pending = await deps.readQuestion(run, id, revision);
      // The original persisted answer owns this fact, including after restart.
      // Do not turn an answered question back into an empty disabled form.
      if (pending.state === "settled") return null;
      const live = Boolean(state.activeRuns.get(run.run_id)?.live() && runtime.effects.pendings.hasLiveWaiter(pending.ref));
      const parked = !live && pending.state === "open" ? await parkedOn(runtime, deps.index, run, pending.ref) : undefined;
      const unavailable = questionUnavailable(pending, (await deps.host.readClock()).monotonicMs, live || parked !== undefined);
      return { pending_id: pending.ref.id, pending_revision: pending.ref.revision, kind: pending.kind,
        prompt: pending.why, options: [], allows_free_text: pending.kind === "text",
        ...(pending.kind === "questionnaire" ? { questions: pending.questions.map(projectQuestion) } : {}), answerable: unavailable === undefined,
        ...(parked && !unavailable ? { parked: true as const } : {}), ...(unavailable ? { unavailable_reason: unavailable } : {}) };
    },
    readCommandOutput: readCommandOutput(deps),
    sessions: sessionsPort(deps),
    startAgentRun: input => startPrologueRun(deps, input),
    shutdown: deps.shutdown,
  };
}

/** A question the round asked, read for its own run only (text or questionnaire). */
export function questionReader(runtime: Runtime) {
  return async (run: AgentRunRef, id: string, revision: number) => {
    const pending = await runtime.effects.pendings.read({ kind: "pending", id, revision });
    if (!pending || pending.origin?.session !== run.session_id || pending.origin.run !== run.run_id
      || !["text", "questionnaire"].includes(pending.kind)) {
      throw agentErrors.pending_not_open("原问题不属于本轮执行，不能提交答案");
    }
    return pending;
  };
}

/**
 * The round's parked view, when a normal shutdown parked it on exactly this question and the runtime says it can be answered
 * now (prologue#40). A crash orphan has no marker and is never answerable.
 */
async function parkedOn(runtime: Runtime, index: SessionIndexStore, run: AgentRunRef, pending: ExactRef<"pending">) {
  const saved = await index.read(run.session_id).catch(() => undefined);
  const report = saved && await runtime.sessions.inspectRecovery(saved.ref).catch(() => undefined);
  const view = report?.runs.find(entry => entry.ref.id === run.run_id && entry.parked && sameRef(entry.parked.pending, pending));
  return saved && view?.canAnswer ? { session: saved.ref, view } : undefined;
}

/**
 * The adapter's answer path: the original question, still open, answered in its own kind. A live run takes the answer at
 * once (`delivered`). A run parked at a normal shutdown ends with the question answered and the answer queued as the
 * person's input for the session's next round, which the caller opens (`queued`); the runtime settles it under this call's
 * own final authority check, the gateway's, at the moment it writes (S-33).
 */
export function answerPending(deps: Pick<PortDeps, "runtime" | "host" | "state" | "readQuestion" | "index" | "options" | "effects">): NonNullable<PrologueAdapterOptions["answerPending"]> {
  return async (run, answer) => {
    const { runtime } = deps;
    if (!Number.isInteger(answer.pending_revision) || answer.pending_revision! < 1) {
      throw agentErrors.pending_not_open("原问题缺少精确版本，不能提交答案");
    }
    const pending = await deps.readQuestion(run, answer.pending_id, answer.pending_revision!);
    const now = await deps.host.readClock();
    const live = Boolean(deps.state.activeRuns.get(run.run_id)?.live() && runtime.effects.pendings.hasLiveWaiter(pending.ref));
    const parked = !live && pending.state === "open" ? await parkedOn(runtime, deps.index, run, pending.ref) : undefined;
    const unavailable = questionUnavailable(pending, now.monotonicMs, live || parked !== undefined);
    if (unavailable) throw agentErrors.pending_not_open(unavailable);
    let reply: PendingAnswer;
    if (pending.kind === "text") {
      if (typeof answer.text !== "string" || !answer.text.trim() || answer.answers !== undefined) throw agentErrors.answer_invalid("请填写原问题的文字回答");
      reply = { kind: "text", text: answer.text };
    } else {
      if (!answer.answers || answer.text !== undefined) throw agentErrors.answer_invalid("请按原问卷逐题回答");
      // A picked object is used only while its owner still hands it to the session's owner, under the owner's label (S-26).
      const owned = await ownedReferences(deps.options.readReferences, (await deps.index.read(run.session_id).catch(() => undefined))?.owner, pending.questions, answer.answers);
      const problems = answerProblems(pending.questions, owned.answers);
      if (problems.length) throw Object.assign(agentErrors.answer_invalid(`有 ${problems.length} 道题的回答不能提交`, { problems }), { problems });
      if (owned.refused.length) throw Object.assign(agentErrors.answer_invalid("选的对象现在不能用，请重新选择", { problems: owned.refused }), { problems: owned.refused });
      reply = { kind: "questionnaire", answers: owned.answers };
    }
    await deps.effects.beforeEffect();
    if (!parked) {
      await runtime.effects.pendings.answer(pending.ref, reply, now, { assertBeforeAnswer: deps.effects.assertCurrent });
      return "delivered";
    }
    await runtime.sessions.answerInterrupted(parked.session, parked.view.ref, parked.view.version, pending.ref, reply, { assertBeforeAnswer: deps.effects.assertCurrent });
    return "queued";
  };
}

/** Before a workspace is merged: no unfinished run may still write to, wait on, or hold an unknown outcome in those directories. */
export function directoriesIdle(runtime: Runtime, index: SessionIndexStore) {
  return async (paths: readonly string[]) => {
    const open = await runtime.listOpenWork();
    if (open.unavailable.length) throw new Error("未能查清未结束执行，暂不能整合工作区");
    for (const item of open.items) {
      if (!item.origin.session) continue; // Manual Git operations are guarded by the existing review queue.
      const saved = await index.read(item.origin.session);
      if (!saved) throw new Error("未结束执行缺少目录归属，暂不能整合");
      const attempts = saved.attempts.filter(attempt => !item.origin.run || attempt.run_id === item.origin.run);
      if (!attempts.length || attempts.some(attempt => attempt.frozen.execution !== "read-only" && attempt.frozen.directory && paths.includes(attempt.frozen.directory.canonical_path)
        || attempt.subagent_roots?.some(root => paths.includes(root.path)))) throw new Error(`“${saved.title}”仍有涉及此目录的写入执行、待审或未知结果，请先核对原任务`);
    }
  };
}
