import { matchCommandReceipts, type CommandReceiptMatch } from "./prologue-command-receipts.js";
import { personalContinuationOpenings } from "./prologue-session-opening.js";
import { bindBusinessSubagent } from "./prologue-business-child.js";
import { childRoleRestorer } from "./prologue-child-setup.js";
import { stopSdkRun } from "./prologue-stop-run.js";
import type { ReviewDecisionControl } from "../review-decisions.js";
import { bindExistingWorkDelegation } from "./prologue-work-delegation.js";
import { subagentAuthorityProblem } from "./prologue-subagent-conversation.js";
import { answerPending, readPendingQuestion, childQuestionScope } from "./prologue-question-port.js";
import { readOriginalInput, resolveOriginalInput, originalInputIdByKey, sessionNotifier } from "./prologue-original-inputs.js";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { WORKSPACE_COMMAND_RECEIPT_KIND, isTerminalEventType, DEFAULT_CONTEXT_WINDOW_TOKENS, createRuntime, type ConditionCheckers, type ExactRef, type ModelRequestObserved, type QueuedTask, type Runtime, type SessionOpeningReader, type StorageGuard, type SubagentHandle } from "@prologue/sdk";
import type { AgentCommandOutput, AgentReviewReceipt, AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { GATEWAY_TOOLS, HOST_GOVERNED_TOOLS } from "./prologue-action-gateway.js";
import type { createPrologueCheckpoints } from "./prologue-checkpoints.js";
import { createCollaborationHost, readyStep, sessionBlock, type ContinuationStarts, type DispatchChecks } from "./prologue-collaboration.js";
import { createPrologueImageIntake } from "./prologue-images.js";
import { createPrologueGitReviews, GIT_REVIEW_RULE } from "./prologue-git.js";
import { MAX_BROADCAST } from "./prologue-messages.js";
import { workPaths } from "./prologue-project-work.js";
import { queuedInput, type createPrologueRecovery } from "./prologue-recovery.js";
import { startPrologueRun, type RunDeps } from "./prologue-run.js";
import { watchRoundFacts } from "./prologue-stop-guard.js";
import type { PrologueEffects } from "./prologue-effects.js";
import { runModelParams } from "./prologue-run-params.js";
import type { createPrologueSchedule } from "./prologue-schedule.js";
import { createPrologueSubagents, exactCharacterKey, runLineage, SUBAGENT_DEFAULT_MAX_ATTEMPTS, type PrologueSubagentHooks } from "./prologue-subagents.js";
import { surfaceRules, type PrologueSurfaces } from "./prologue-surfaces.js";
import { agentExecutionRules } from "./prologue-taskboard.js";
import type { PrologueRuntimePort } from "./prologue.js";
import { PROLOGUE_RUNTIME_ID } from "./prologue-adapter-capabilities.js";
import { agentErrors } from "../errors.js";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { MAX_COMPOSED_INSTRUCTION_CHARS, readResource, sameRef, stageTextResource, unexecutedApprovalCallOf, type DispatchControl, type DispatchGuard, type NodeHost, type PrologueNodeAdapterOptions, type RoundState } from "./prologue-node-kit.js";
import { SESSION_INDEX_SCHEMA, type SessionIndex, type SessionIndexStore } from "./prologue-session-index.js";
import type { createPrologueMemoryAuthority } from "./prologue-memory-authority.js";
import type { ReviewDecisionStore } from "../review-decisions.js";

/**
 * The runtime the Node composition makes, and the port it hands the adapter (W4-06 split these out of
 * `initializePrologueNodeAdapter`, which now only puts the parts together).
 */

/** Turns a subagent may take when its dispatch does not say; the user set it to 20. */
export const SUBAGENT_DEFAULT_TURNS = 20;

/** The Prologue runtime on the Node host, with the Host's limits, posture and the rules every round runs under. */
export function createNodeRuntime(options: PrologueNodeAdapterOptions, host: NodeHost, storageGuard: StorageGuard, runScheduled: (task: QueuedTask) => Promise<void>, surfaceHost: () => PrologueSurfaces | undefined, dispatchChecks: DispatchChecks, conditionCheckers: ConditionCheckers, memoryAccess: ReturnType<typeof createPrologueMemoryAuthority>, modelRequests: RoundState["modelRequests"], starts: ContinuationStarts) {
  return createRuntime({
    app: options.app,
    host,
    storageGuard,
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
    ...(options.reviewQueue ? { permissionMode: { mode: "auto-allow" as const, allow: [{ what: "tool" as const, name: "board-report" }, { what: "tool" as const, name: "board-wait" }, { what: "tool" as const, name: "session-send" }] }, rules: [...agentExecutionRules,
      // A change through the business gateway always stops for the person's review of its exact input; its reads do not.
      { source: "runtime" as const, effect: "ask" as const, match: { what: "tool" as const, name: GATEWAY_TOOLS.change } },
      // A reversible change the person lets run without asking: the gateway itself refuses any other change on this tool.
      { source: "runtime" as const, effect: "ask" as const, match: { what: "tool" as const, name: GATEWAY_TOOLS.direct } },
      // Host-initiated Git reviews (index, worktree, integration, operations) always stop for explicit person approval.
      GIT_REVIEW_RULE,
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

/** Marking a session as priority: only the caller's own other sessions working on the same files are asked to give them up for now (R8 rules 3, 4). */
function prioritize(deps: PortDeps): NonNullable<PrologueRuntimePort["messages"]>["prioritize"] {
  return async (project, sessionId, actorId) => {
    const { projectWork, state } = deps;
    const index = await deps.index.read(sessionId).catch(() => undefined);
    if (!index || index.owner.project_id !== project) throw agentErrors.session_unknown("会话不属于这个项目");
    // Its work under way (or waiting): the files it names, against the other work under way in its directory.
    const mine = (await projectWork.read(project)).items.find(item => item.session_id === sessionId && ["running", "waiting"].includes(item.state));
    if (!mine) return { notified: [], paths: [] };
    const seen = await projectWork.read(project, { session_id: sessionId, directory: mine.directory, paths: mine.paths });
    // Never expose overlapping paths or inject steers into sessions of another plugin, installation or person.
    const ownOverlaps = [];
    for (const overlap of seen.overlaps) {
      const other = await deps.index.read(overlap.work.session_id).catch(() => undefined);
      if (other && sameOwner(other.owner, index.owner)) ownOverlaps.push(overlap);
    }
    const targets = [...new Set(ownOverlaps.map(overlap => overlap.work.session_id))].slice(0, MAX_BROADCAST);
    const paths = [...new Set(ownOverlaps.flatMap(overlap => overlap.paths))];
    if (!targets.length) return { notified: [], paths: [] };
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

/** A single read and a batch verify exactly the same resource, authorized root, command and effect. */
async function readReceipt(runtime: Runtime, runId: string, { event, root, check }: CommandReceiptMatch): Promise<AgentCommandOutput> {
  const record = await readResource(runtime, event.receiptRef);
  const receipt = record.receipt;
  if (record.kind !== WORKSPACE_COMMAND_RECEIPT_KIND || record.version !== 1 || !sameRef(record.rootRef, root)
    || typeof record.executable !== "string" || !Array.isArray(record.argv) || !record.argv.every((arg: unknown) => typeof arg === "string")
    || !receipt || receipt.commandId !== event.commandId || !sameRef(receipt.effectRef, event.effectRef)
    || typeof receipt.stdout !== "string" || typeof receipt.stderr !== "string" || typeof receipt.truncated !== "boolean"
    || typeof receipt.timedOut !== "boolean" || typeof receipt.cancelled !== "boolean"
    || receipt.exitCode !== undefined && !Number.isInteger(receipt.exitCode)
    || receipt.stopReason !== undefined && !["cancelled", "timed-out"].includes(receipt.stopReason)) throw new Error("命令回执与这轮执行不一致，不能展示为已确认结果");
  return { ref: { run_id: runId, call_id: event.callId }, command: [record.executable, ...record.argv.map((arg: string) => JSON.stringify(arg))].join(" "),
    exit_code: receipt.exitCode ?? null, stdout: receipt.stdout, stderr: receipt.stderr, truncated: receipt.truncated,
    timed_out: receipt.timedOut, cancelled: receipt.cancelled, ...(receipt.stopReason ? { stop_reason: receipt.stopReason } : {}),
    ...(check ? { after_write_check: { checker_id: check.checker_id, display_name: check.display_name, version: check.version } } : {}) };
}

export function commandReceipts(deps: Pick<RunDeps, "runtime" | "index" | "state">):
  Required<Pick<PrologueRuntimePort, "readCommandOutput" | "readWriteChecks">> {
  return {
    async readCommandOutput(sessionId, ref) {
      const match = (await matchCommandReceipts(deps, sessionId, ref.run_id, new Set([ref.call_id]))).get(ref.call_id);
      if (!match) throw new Error(match === null ? "命令引用对应多次执行" : "没有这次命令的持久回执；结果未知，不能当作成功或自动重跑");
      return readReceipt(deps.runtime, ref.run_id, match);
    },
    async readWriteChecks(sessionId, runId, writeIds) {
      const found = await matchCommandReceipts(deps, sessionId, runId, new Set(writeIds.map(id => `${id}:diagnostics`)));
      const results = [];
      for (const call_id of writeIds) {
        const match = found.get(`${call_id}:diagnostics`);
        if (!match) continue;
        const receipt = await readReceipt(deps.runtime, runId, match).catch(() => undefined);
        if (receipt) results.push({ call_id, checker: receipt.after_write_check?.display_name ?? null,
          version: receipt.after_write_check?.version ?? null, exit_code: receipt.exit_code,
          timed_out: receipt.timed_out === true || receipt.stop_reason === "timed-out",
          cancelled: receipt.cancelled === true || receipt.stop_reason === "cancelled" });
      }
      return results;
    },
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
    notify: sessionNotifier(deps.runtime, deps.index, deps.effects),
    async inputIdByKey(sessionId, key) {
      const index = await deps.index.read(sessionId), session = index && await deps.runtime.sessions.open(index.ref);
      return index && session ? originalInputIdByKey(index, session, key) : undefined;
    },
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

function sameOwner(a: SessionIndex["owner"], b: SessionIndex["owner"]): boolean {
  return a.project_id === b.project_id && a.plugin_id === b.plugin_id && a.install_id === b.install_id && a.actor_id === b.actor_id;
}

/** The SDK's retained worktree binding selects one frozen Host grant. Shared children inherit their original parent's directory. */
function continuationDirectory(child: SubagentHandle, parent: SessionIndex["attempts"][number]): string | undefined {
  if (!child.root) return undefined;
  const atDispatch = sameRef(child.attempts?.[0] ?? child.run, child.run);
  if (child.workspace) {
    const binding = child.workspace;
    const matches = parent.subagent_roots?.filter(root => root.id === binding.id && sameRef(root.rootRef, binding.rootRef));
    if (matches?.length === 1 && (!atDispatch || sameRef(child.root, binding.rootRef))) return matches[0]!.path;
  } else if (parent.root_ref && parent.frozen.directory?.realpath_verified && (!atDispatch || sameRef(child.root, parent.root_ref))) {
    return parent.frozen.directory.canonical_path;
  }
  throw agentErrors.directory_unauthorized("原子任务的目录授权不可核验");
}

async function assertContinuationDirectory(deps: PortDeps, owner: SessionIndex["owner"], directory: string): Promise<void> {
  const authorized = deps.options.checks?.directoryAuthorized;
  if (await realpath(directory).catch(() => undefined) !== directory || (authorized && !await authorized(owner.project_id, directory))) {
    throw agentErrors.directory_unauthorized("子任务的原目录已变更或不再授权");
  }
}

async function renewContinuationDirectory(deps: PortDeps, directory: string, posture: "workspace-write" | "read-only") {
  try {
    const grant = await deps.host.authorizeRoot({ path: directory, requireCanonical: true });
    return await deps.runtime.workspace.adopt(grant, { posture });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "ROOT_PATH_DENIED" || error.code === "ROOT_NOT_FOUND")) {
      throw agentErrors.directory_unauthorized("子任务的原目录已变更或不再授权");
    }
    throw error;
  }
}

/** Rechecks the original child directory and MCP grants for every new dispatch. */
function continuationGrantGuard(deps: PortDeps, parentRun: AgentRunRef, owner: SessionIndex["owner"], parentAttempt: SessionIndex["attempts"][number], directory: string | undefined, directoryProof?: ReviewDecisionControl): DispatchGuard {
  return async () => {
    const latestParent = await deps.index.read(parentRun.session_id);
    if (!latestParent || !sameOwner(latestParent.owner, owner)) throw agentErrors.session_unknown("原父会话已不可用，不能继续子任务");
    if (directoryProof) await directoryProof.beforeEffect();
    else if (directory) await assertContinuationDirectory(deps, owner, directory);
    await deps.mcpLibrary.validate(owner, parentAttempt.frozen.mcp_tools ?? []);
    await deps.mcpLibrary.validateSources(owner, parentAttempt.frozen.mcp_sources ?? []);
    return directoryProof?.assertCurrent;
  };
}

function continuationAuthority(deps: PortDeps, input: Pick<Parameters<NonNullable<PrologueSubagentHooks["continueChild"]>>[0], "parentRun" | "execution">,
  role: NonNullable<SessionIndex["attempts"][number]["subagent_roles"]>[number][1],
  work: Awaited<ReturnType<typeof bindExistingWorkDelegation>>, fallbackGuard: DispatchGuard) {
  const { runtime, state } = deps, { parentRun, execution } = input;
  let stopped = false;
  const policies = new Map<string, () => void>(), exact = new Map<string, { ref: ExactRef<"effect">; control: ReviewDecisionControl }>();
  const activeExact = () => {
    for (const [id, held] of exact) if (!["awaiting-approval", "authorized", "dispatching"].includes(runtime.effects.get(held.ref)?.state ?? "")) exact.delete(id);
    return exact.values();
  };
  const assertCurrent = () => {
    if (stopped) throw agentErrors.capability_unavailable("原子任务执行已结束");
    work?.assertCurrent();
    for (const check of policies.values()) check();
    for (const held of activeExact()) held.control.assertCurrent();
    requireSynchronous(execution?.assertBeforeDispatch?.()); execution?.assertSubagent?.(role);
  };
  let releaseBinding!: () => void, refuseBinding!: (reason: unknown) => void;
  const bound = { promise: new Promise<void>((resolve, reject) => { releaseBinding = resolve; refuseBinding = reject; }),
    resolve: () => releaseBinding(), reject: (reason: unknown) => refuseBinding(reason) };
  void bound.promise.catch(() => undefined);
  const guard: DispatchGuard = async () => {
    await bound.promise;
    assertCurrent();
    const assertGrant = await fallbackGuard();
    for (const held of activeExact()) await held.control.beforeEffect();
    const original = await state.dispatchChecks.get(parentRun.run_id)?.();
    const current = await execution?.beforeDispatch?.();
    execution?.assertSubagent?.(role);
    return () => { original?.(); current?.(); assertGrant?.(); assertCurrent(); };
  };
  const control: DispatchControl = {
    assertCurrent,
    prepareDispatch: guard,
    beforeEffect: async () => { const fence = await guard(); requireSynchronous(fence?.()); assertCurrent(); },
  };
  return { assertCurrent, control, bound, stopping: () => stopped,
    finish: () => { stopped = true; work?.release(); },
    usePolicy: (id: string, check: () => void) => { policies.set(id, check); },
    useExact: (id: string, control: ReviewDecisionControl) => {
      const ref = state.reviewEffects.get(`prologue:${id}`);
      if (!ref) throw agentErrors.review_not_permitted("原授权操作不可读");
      exact.set(id, { ref, control });
    },
  };
}

type ChildContinuation = Parameters<NonNullable<PrologueSubagentHooks["continueChild"]>>[0];

async function holdRenewalDirectory(deps: PortDeps, projectId: string, directory: string, worktreeId?: string): Promise<ReviewDecisionControl> {
  const refuse = () => agentErrors.directory_unauthorized("子任务的原目录已变更或不再授权");
  const proof = await deps.options.checks?.holdWorkspaceDirectory?.(projectId, directory, worktreeId).catch(() => undefined);
  if (!proof) throw refuse();
  return {
    beforeEffect: async () => { try { await proof.beforeEffect(); } catch { throw refuse(); } },
    assertCurrent: () => { try { requireSynchronous(proof.assertCurrent()); } catch { throw refuse(); } },
  };
}

async function prepareContinuationWorkspace(deps: PortDeps, { child, parentRun, actorId }: ChildContinuation,
  parent: SessionIndex, attempt: SessionIndex["attempts"][number], role: NonNullable<SessionIndex["attempts"][number]["subagent_roles"]>[number][1]) {
  const childIndex = await deps.index.read(child.session.id);
  const baseFrozen = childIndex?.attempts[0]?.frozen;
  const directory = continuationDirectory(child, attempt);
  if (childIndex && (!sameRef(childIndex.ref, child.session) || !sameOwner(childIndex.owner, parent.owner)
      || childIndex.parent_run?.session_id !== parentRun.session_id || childIndex.parent_run.run_id !== parentRun.run_id
      || directory !== baseFrozen?.directory?.canonical_path)) {
    throw agentErrors.directory_unauthorized("原子任务归属或工作区不可核验");
  }
  const currentRoot = child.root && deps.runtime.workspace.get(child.root);
  const renew = child.root !== undefined && !sameRef(currentRoot?.ref, child.root);
  if (renew && (!directory || actorId !== parent.owner.actor_id)) throw agentErrors.directory_unauthorized("当前用户不能更新原子任务的目录授权");
  const directoryProof = renew ? await holdRenewalDirectory(deps, parent.owner.project_id, directory!, child.workspace?.id) : undefined;
  if (directory && !directoryProof) await assertContinuationDirectory(deps, parent.owner, directory);
  const writes = role.execution === "workspace-write" || role.execution === "text-edit";
  const canWrite = child.envelope?.sandbox === "workspace-write" || child.envelope?.sandbox === "danger-full-access";
  const renewed = renew ? await renewContinuationDirectory(deps, directory!, writes && canWrite ? "workspace-write" : "read-only") : undefined;
  return { childIndex, baseFrozen, directory, directoryProof, rootRef: renewed?.ref ?? currentRoot?.ref, renewedRoot: renewed ? { previous: child.root!, current: renewed.ref } : undefined };
}

function continuationOpening(child: SubagentHandle, baseTask: string, retryTasks: Readonly<Record<string, string>> | undefined): SessionOpeningReader {
  const firstRunId = (child.attempts?.[0] ?? child.run).id;
  const original = { ...retryTasks };
  return async ({ sessionRef, runRef }) => {
    if (!sameRef(sessionRef, child.session) || runRef.kind !== "run" || runRef.revision !== 1) return { status: "unavailable" };
    if (runRef.id === firstRunId) return { status: "original", user: [baseTask] };
    const priorTask = original[runRef.id];
    return typeof priorTask === "string" ? { status: "original", user: priorTask ? [priorTask] : [] } : { status: "unavailable" };
  };
}

async function continueSubagentAttempt(
  deps: PortDeps,
  input: ChildContinuation,
  restoreRole: ReturnType<typeof childRoleRestorer>,
): Promise<AgentRunRef> {
  const { parentRun, child, baseTask, reason, source, attemptNumber, requestKey, text, queued, execution } = input;
  const { runtime, state } = deps;
  const parentIndex = await deps.index.read(parentRun.session_id);
  const parentAttempt = parentIndex?.attempts.find(item => item.run_id === parentRun.run_id);
  if (!parentIndex || !parentAttempt) throw agentErrors.run_unknown("父任务执行记录不可用，不能重试子任务");
  const role = child.character ? new Map(parentAttempt.subagent_roles ?? []).get(exactCharacterKey(child.character)) : undefined;
  if (!role || !child.character) throw agentErrors.role_not_declared("原子角色不可核验");
  const model = parentAttempt.model_selection
    ? await deps.options.modelConfiguration(parentAttempt.model_selection)
    : parentAttempt.frozen_model ?? await deps.options.modelConfiguration();
  if (!model) throw agentErrors.model_not_configured("当前未配置可用模型，不能重试子任务");
  const credentialRef = await deps.credentials.prologueRefFor(model.credential_ref);
  const params = runModelParams(model, parentAttempt.frozen.budget ?? null, parentAttempt.frozen.reasoning_effort);
  const cache = model.prompt_cache === undefined || model.prompt_cache === "off" ? {} : { promptCache: model.prompt_cache };
  const retryText = queued ? "" : text ?? (reason?.trim()
    ? `${baseTask}\n\n[第 ${attemptNumber} 次尝试（来源：${source}）补充说明：${reason.trim()}]`
    : `${baseTask}\n\n[第 ${attemptNumber} 次尝试（来源：${source}）：请先核对前次尝试的结果与失败点，再继续完成任务。]`);
  const readOpening = continuationOpening(child, baseTask, parentAttempt.subagent_retry_tasks);
  await deps.effects.beforeEffect();
  deps.effects.assertCurrent();
  execution?.assertSubagent?.(role);
  const { childIndex, baseFrozen, directory, directoryProof, rootRef, renewedRoot } = await prepareContinuationWorkspace(deps, input, parentIndex, parentAttempt, role);
  const business = parentAttempt.frozen.workspace === "business";
  await restoreRole(child.character, role, child, business);
  const work = await bindExistingWorkDelegation(deps.delegations, execution?.delegation, parentAttempt.frozen.role_id, parentIndex.owner);
  const authority = continuationAuthority(deps, { parentRun, execution }, role, work,
    continuationGrantGuard(deps, parentRun, parentIndex.owner, parentAttempt, directory, directoryProof));
  const { assertCurrent, control, bound } = authority;
  if (business) {
    if (!execution?.subagentGateway || !execution.beforeDispatch) throw agentErrors.capability_unavailable("业务子任务接续需要当前宿主动作授权");
    const gateway = await execution.subagentGateway(role, { runtime_id: PROLOGUE_RUNTIME_ID, session_id: child.session.id }).catch(error => { work?.release(); throw error; });
    await bindBusinessSubagent(deps, child.session, role, gateway, child.tools ?? [], { assertCurrent, stopping: authority.stopping, work }).catch(error => { work?.release(); throw error; });
    const stopGuard = state.stopGuards.get(child.session.id);
    if (stopGuard) stopGuard.task = retryText;
  }
  // A new child attempt has its own ongoing authority; the submitting call still controls the SDK acceptance write.
  const continued = await deps.dispatchGuards.run(control, () => runtime.subagents.continue({
    child: child.ref,
    expected: { parent: { session: child.parentSession, run: child.parentRun }, expectedRun: child.run },
    assertBeforeAccept: () => { requireSynchronous(execution?.assertBeforeStart?.()); execution?.assertSubagent?.(role); directoryProof?.assertCurrent(); },
    ...(renewedRoot ? { renewedRoot } : {}),
    history: "session",
    ...(queued ? { queued } : {}),
    readOpening,
    start: {
      protocol: model.protocol,
      endpoint: model.endpoint,
      model: model.model,
      credentialRef,
      ...(Object.keys(params).length ? { params } : {}),
      timeoutMs: 180_000,
      messages: retryText ? [{ role: "user", text: retryText }] : [],
      ...cache,
    },
    agent: {
      idempotencyKey: requestKey,
      mode: child.envelope?.mode ?? "autonomous",
      toolNames: child.tools ? [...child.tools] : [],
    },
  })).catch(error => { bound.reject(error); work?.release(); state.childActionControllers.get(child.session.id)?.abort(); state.childActionControllers.delete(child.session.id); throw error; });
  deps.effects.accept();
  try { work?.accept(continued.run); } catch (error) { bound.reject(error); continued.control.stop("cancelled"); work?.release(); throw error; }
  const newRunId = continued.run.ref.id;
  const childRun = { session_id: child.session.id, run_id: newRunId };
  state.sessionRuns.add(newRunId);
  state.activeRuns.set(newRunId, {
    live: () => ["prepared", "running"].includes(continued.run.state), policy: continued.policy,
    stop: () => stopSdkRun(continued.run), usePolicy: authority.usePolicy,
    ...(work ? { work, workSelection: work.permission.mode !== "original", useExact: authority.useExact } : {}),
    assertAuthority: assertCurrent,
    steer: async text => { await continued.control.steer({ text, source: "app" }); },
  });
  state.liveSessions.set(child.session.id, newRunId);
  state.runSessions.set(newRunId, child.session.id); state.runRefs.set(newRunId, continued.run.ref);
  const childController = state.childActionControllers.get(child.session.id);
  if (childController) {
    state.childActionControllers.delete(child.session.id);
    state.actionControllers.set(newRunId, childController);
    watchRoundFacts(state, continued.run);
  }
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
  let continuedDone = false;
  let unsubContinued: (() => void) | undefined;
  unsubContinued = continued.run.subscribe(event => {
    for (const changed of state.subagentListeners) changed(parentRun.run_id);
    if (isTerminalEventType(event.type)) {
      if (!continuedDone) {
        continuedDone = true;
        queueMicrotask(() => { unsubContinued?.(); });
      }
      authority.finish();
      if (state.liveSessions.get(child.session.id) === newRunId) state.liveSessions.delete(child.session.id);
      state.activeRuns.delete(newRunId);
      state.runRefs.delete(newRunId);
      state.runRoots.delete(newRunId);
      childController?.abort(); state.actionControllers.delete(newRunId);
    }
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
    await deps.effects.start(execution, async () => {
    await deps.index.update(parentRun.session_id, saved => {
      const attempt = saved.attempts.find(item => item.run_id === parentRun.run_id);
      if (!attempt) return;
      (attempt.subagent_attempt_sources ??= {})[newRunId] = source;
      if (reason?.trim()) (attempt.subagent_attempt_reasons ??= {})[newRunId] = reason.trim();
      (attempt.subagent_retry_tasks ??= {})[newRunId] = retryText;
      if (text !== undefined && !queued) (attempt.subagent_person_continuations ??= []).push(newRunId);
    });
    if (childIndex && baseFrozen && (rootRef || baseFrozen.workspace === "business")) {
      await deps.index.update(child.session.id, saved => {
        saved.attempts.push({ started_at: new Date().toISOString(), task: retryText, run_id: newRunId, ...(rootRef ? { root_ref: rootRef } : {}), frozen: structuredClone(baseFrozen) });
      });
    }
    });
    bound.resolve();
  } catch (error) {
    bound.reject(error);
    continued.control.stop("cancelled");
    throw error;
  }
  return childRun;
}

function nodeSubagentsPort(deps: PortDeps): NonNullable<PrologueRuntimePort["subagents"]> {
  const restoreRole = childRoleRestorer(deps.runtime);
  const port = createPrologueSubagents(deps.runtime, async run => {
      const index = await deps.index.read(run.session_id), attempts = index?.attempts.filter(attempt => attempt.run_id === run.run_id) ?? [], attempt = attempts[0];
      if (!attempt || !attempt.frozen.directory && attempt.frozen.workspace !== "business") throw agentErrors.directory_unauthorized("原父任务没有工作区或业务归属");
      return {
        child_openings: attempts.length === 1 && !attempt.refused ? attempt.child_openings : undefined,
        path: attempt.frozen.directory?.canonical_path ?? null,
        roles: attempt.subagent_roles ?? [],
        roots: attempt.subagent_roots,
        step_prefix: attempt.step_prefix,
        budgets: attempt.subagent_budgets,
        attempt_sources: attempt.subagent_attempt_sources,
        attempt_reasons: attempt.subagent_attempt_reasons,
        person_openings: personalContinuationOpenings(attempts),
        retry_openings: attempts.length === 1 && !attempt.refused ? attempt.subagent_retry_tasks : undefined,
        nodes: attempt.subagent_nodes,
        errors: { ...attempt.subagent_errors, ...deps.state.subagentBridgeErrors.get(run.run_id) },
      };
    }, {
      defaultMaxTurns: SUBAGENT_DEFAULT_TURNS,
      readQuestion: async (parent, child, id, revision) => readPendingQuestion(deps, { session_id: child.session.id, run_id: child.run.id }, id, revision, await childQuestionScope(deps.index, parent, child)),
      answerQuestion: async (parent, child, answer) => (await answerPending(deps, await childQuestionScope(deps.index, parent, child))({ session_id: child.session.id, run_id: child.run.id }, answer)) as "delivered" | "queued",
      async extendBudget(parentRun, subagentId, addAttempts) {
        await deps.index.update(parentRun.session_id, saved => {
          const attempt = saved.attempts.find(item => item.run_id === parentRun.run_id);
          if (!attempt) throw agentErrors.run_unknown("父任务执行记录不可用，不能调整子任务预算");
          const budgets = attempt.subagent_budgets ??= {};
          const current = budgets[subagentId]?.max_attempts ?? SUBAGENT_DEFAULT_MAX_ATTEMPTS;
          budgets[subagentId] = { max_attempts: current + addAttempts };
        });
      },
      continueChild: input => continueSubagentAttempt(deps, input, restoreRole),
    });
  return {
    workspaces: true as const,
    ...port,
    async subscribe(run, changed) {
      const listen = (parentRunId: string) => { if (parentRunId === run.run_id) changed(); };
      deps.state.subagentListeners.add(listen);
      const stopSdk = deps.runtime.subagents.subscribe(event => {
        if (event.handle.parentRun.id === run.run_id) changed();
      });
      return () => { deps.state.subagentListeners.delete(listen); stopSdk(); };
    },
    command: async (run, id, input, control) => {
      const child = deps.runtime.subagents.list().find(one => one.ref.id === id && one.parentRun.id === run.run_id && one.parentSession.id === run.session_id);
      if (!child) throw agentErrors.collaboration_unknown("Subtask does not belong to this parent run");
      const parent = await deps.index.read(run.session_id);
      const role = child?.character && new Map(parent?.attempts.find(one => one.run_id === run.run_id)?.subagent_roles ?? []).get(exactCharacterKey(child.character));
      if (!role) throw agentErrors.role_not_declared("原子角色不可核验");
      const execution = { ...control.execution, assertBeforeStart: () => {
        control.execution.assertBeforeStart?.(); control.execution.assertSubagent?.(role);
        if (input.kind !== "answer") return;
        const current = deps.runtime.subagents.list().find(one => one.ref.id === id);
        if (!current || current.parentSession.id !== run.session_id || current.parentRun.id !== run.run_id
          || current.run.id !== input.child_run.run_id || current.session.id !== input.child_run.session_id) throw agentErrors.collaboration_conflict("原子任务执行已改变");
        const problem = subagentAuthorityProblem(deps.runtime, current);
        if (problem) throw agentErrors.collaboration_conflict(problem);
      } };
      try { return await deps.effects.start(execution, () => port.command!(run, id, input, { ...control, execution })); }
      finally { for (const changed of deps.state.subagentListeners) changed(run.run_id); }
    },
  };
}

/** The port the adapter drives: every capability the Node composition offers, each from its own part. */
export function createNodePort(deps: PortDeps): PrologueRuntimePort {
  const { runtime, state, stepBoards, messages, mcpLibrary } = deps;
  const openSession = (sessionId: string, unreadable: string) => openSessionOf(deps, sessionId, unreadable);
  const ownerOfSession = async (sessionId: string): Promise<SessionIndex["owner"] | undefined> => {
    const saved = await deps.index.read(sessionId).catch(() => undefined);
    if (saved) return saved.owner;
    const child = runtime.subagents.list().find(one => one.session.id === sessionId);
    const parent = child && await deps.index.read(child.parentSession.id).catch(() => undefined);
    return parent?.owner;
  };
  const readEnvelope = (id: string) => {
    try { return runtime.delivery.get({ kind: "envelope", id, revision: 1 } as ExactRef<"envelope">); }
    catch { return undefined; }
  };
  const assertEnvelopeSameOwner = async (project: string, id: string) => {
    const envelope = readEnvelope(id);
    if (!envelope) throw agentErrors.session_unknown("这封信不属于这个项目");
    const from = await ownerOfSession(envelope.from.id);
    const to = await ownerOfSession(envelope.to.id);
    if (!from || !to || from.project_id !== project || !sameOwner(from, to)) throw agentErrors.session_unknown("这封信不属于这个项目");
  };
  // Enforce full (project, plugin, install, actor) owner isolation for model-initiated `session-send` calls (R8 rules 3, 4).
  const ownerHook = "molis-session-messages-owner";
  runtime.hooks.register({ id: ownerHook, event: "tool-before", blocking: true, handler: async context => {
    if (context.toolName !== "session-send" || !context.origin?.session) return { kind: "allow" };
    const deny = (why: string) => ({ kind: "deny" as const, why });
    const sender = await deps.index.read(context.origin.session).catch(() => undefined);
    if (!sender) return deny("这个会话缺少归属信息，不能发信");
    const input = context.input as { to?: unknown; recipients?: unknown } | undefined;
    if (Array.isArray(input?.recipients)) {
      const kept: string[] = [];
      for (const id of input.recipients.map(String)) {
        const target = await deps.index.read(id).catch(() => undefined);
        if (target && !target.parent_run && sameOwner(target.owner, sender.owner)) kept.push(id);
      }
      if (kept.length === input.recipients.length) return { kind: "allow" };
      if (!kept.length) return deny("只能发给同一个插件归属的其他会话");
      return { kind: "rewrite", input: { ...input, recipients: kept }, why: "只发给同归属会话" };
    }
    if (typeof input?.to === "string") {
      const target = await deps.index.read(input.to).catch(() => undefined);
      if (!target || target.parent_run || !sameOwner(target.owner, sender.owner)) return deny("只能发给同一个插件归属的另一个会话");
    }
    return { kind: "allow" };
  } });
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
    messages: {
      read: async (project, sessionId) => {
        if (sessionId !== undefined) {
          const target = await ownerOfSession(sessionId);
          if (!target || target.project_id !== project) return [];
          return messages.read(project, sessionId, async id => {
            const other = await ownerOfSession(id);
            return Boolean(other && sameOwner(other, target));
          });
        }
        const listed = await messages.read(project);
        const same = await Promise.all(listed.map(async letter => {
          const from = await ownerOfSession(letter.from_session);
          const to = await ownerOfSession(letter.to_session);
          return Boolean(from && to && from.project_id === project && sameOwner(from, to));
        }));
        return listed.filter((_letter, index) => same[index]);
      },
      cancel: async (project, id) => {
        await assertEnvelopeSameOwner(project, id);
        return messages.cancel(project, id);
      },
      sendForPeople: async (project, input, actorId) => {
        const from = await deps.index.read(input.from_session).catch(() => undefined);
        const to = await deps.index.read(input.to_session).catch(() => undefined);
        if (!from || !to || from.owner.project_id !== project || from.parent_run || to.parent_run || !sameOwner(from.owner, to.owner)) {
          throw new Error("只能在这个项目的两个会话之间发信");
        }
        if (input.in_reply_to) {
          const parent = readEnvelope(input.in_reply_to);
          const parentFrom = parent && await ownerOfSession(parent.from.id);
          const parentTo = parent && await ownerOfSession(parent.to.id);
          if (!parent || !parentFrom || !parentTo || !sameOwner(from.owner, parentFrom) || !sameOwner(from.owner, parentTo)) {
            throw agentErrors.session_unknown("这封信不属于当前会话归属");
          }
        }
        return messages.sendForPeople(project, input, actorId);
      },
      act: async (project, id, action, detail, actorId) => {
        await assertEnvelopeSameOwner(project, id);
        return messages.act(project, id, action, detail, actorId);
      },
      prioritize: prioritize(deps),
    },
    collaboration: { ...deps.waitsPort.collaboration, serveStarts: starter => deps.starts.serve(starter), revise: (run, amendment, expectedVersion, actor, ledger) => stepBoards.amend(run, amendment, expectedVersion, actor, ledger), works: deps.workGraphs.port },
    // A supplement that is to wait for the next round, or whose round has ended: the session keeps it, under its key, and gives it back while it still waits.
    queue: {
      add: async (sessionId, input) => (await openSession(sessionId, "这条会话读不到，补充留不到下一轮")).queueInput(input),
      withdraw: async (sessionId, inputId) => (await openSession(sessionId, "这条会话读不到，撤不回排着的补充")).withdrawQueuedInput(inputId),
    },
    background: {
      read: async (project, sessionId) => {
        if (sessionId !== undefined) {
          const target = await ownerOfSession(sessionId);
          if (!target || target.project_id !== project) return [];
          return deps.waitsPort.background.read(project, sessionId, async id => {
            const other = await ownerOfSession(id);
            return Boolean(other && sameOwner(other, target));
          });
        }
        return deps.waitsPort.background.read(project);
      },
      stop: (project, taskId) => deps.waitsPort.background.stop(project, taskId),
    },
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
    readPendingQuestion: (run, id, revision) => readPendingQuestion(deps, run, id, revision),
    ...commandReceipts(deps),
    sessions: sessionsPort(deps),
    startAgentRun: input => startPrologueRun(deps, input),
    shutdown: async () => {
      runtime.hooks.unregister(ownerHook);
      return deps.shutdown();
    },
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
