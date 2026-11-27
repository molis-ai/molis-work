import { bindBusinessSubagent } from "./prologue-business-child.js";
import { childSetup } from "./prologue-child-setup.js";
import { sessionOpeningReader, canonicalCallerOpening } from "./prologue-session-opening.js";
import { recordOriginalInput } from "./prologue-original-inputs.js";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { isTerminalEventType, type TerminalRunState, type ExactRef, type PackTool, type Runtime } from "@prologue/sdk";
import { compareCodeUnits } from "@molis-ai/molis-work-plugin-sdk";
import { BUSINESS_HOST_TOOLS, BUSINESS_SUBAGENT_HOST_TOOLS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentTextMaterialContent, type AgentFrozenStart } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import { projectPeerNotice } from "./prologue-peer-notices.js";
import { MEMORY_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/memory";
import { packToDynamicTools, SUGGEST_HOST_TOOL } from "./prologue-action-tools.js";
import { AFTER_WRITE_EXECUTOR, afterWriteExecutor } from "./prologue-after-write.js";
import type { PrologueApprovalBridge } from "./prologue-approvals.js";
import type { createPrologueCheckpoints } from "./prologue-checkpoints.js";
import { createPrologueCompactor } from "./prologue-compaction.js";
import type { PrologueCredentialBridge } from "./prologue-credentials.js";
import type { PrologueEffects } from "./prologue-effects.js";
import { mcpConnectionId, type createPrologueMcpLibrary } from "./prologue-mcp.js";
import type { createPrologueMemory } from "./prologue-memory.js";
import type { createSessionMessages } from "./prologue-messages.js";
import { inlineMethods } from "./prologue-methods.js";
import { projectWorkDigest, workPaths, type createProjectWork } from "./prologue-project-work.js";
import type { createWorkGraphs } from "./prologue-work-graphs.js";
import { createPrologueWriteCheckers } from "./prologue-write-checkers.js";
import { withInteractionRepairLimit } from "./prologue-questions.js";
import { roundReferenceKinds } from "./prologue-reference-kinds.js";
import { DEFAULT_ROUND_EXTENSIONS, type PreparedRoundExtension } from "./prologue-round-extension.js";
import { roundGateway } from "./prologue-round-gateway.js";
import { roundInstructions } from "./prologue-run-instructions.js";
import { runModelParams } from "./prologue-run-params.js";
import { blockId, canTakeUp, collaborates, eligibleContinuation, planPrefix, readyStep, releaseStartClaim, sessionBlock } from "./prologue-collaboration.js";
import type { PlanPlace } from "./prologue-plan-steps.js";
import { exactCharacterKey, verifySubagentStart, type PrologueSubagentRoot } from "./prologue-subagents.js";
import { DESKTOP_GUIDANCE, SURFACE_GUIDANCE, emptySurfaceAttachment, type PrologueSurfaces, type SurfaceAttachment } from "./prologue-surfaces.js";
import { placeOf, type createPrologueTaskBoards } from "./prologue-taskboard.js";
import type { createPrologueWaits } from "./prologue-waits.js";
import type { PrologueEvent, PrologueUsageReceipt } from "./prologue-stream.js";
import type { PrologueRuntimePort, PrologueStartInput } from "./prologue.js";
import { prologueToolName, sameRef, stageInstructions, stageTextResource, type DispatchGuards, type PrologueNodeAdapterOptions, type RoundState } from "./prologue-node-kit.js";
import { SESSION_INDEX_SCHEMA, type SessionIndex, type SessionIndexStore } from "./prologue-session-index.js";
import { ensureStopGuard, guardRound, watchRoundFacts } from "./prologue-stop-guard.js";
import { roundMcp, type RoundMcp } from "./prologue-round-mcp.js";
import { stopSdkRun } from "./prologue-stop-run.js";
import { bindWorkDelegation, type PrologueWorkDelegation } from "./prologue-work-delegation.js";
import type { WorkDelegationStore } from "../delegations.js";
import type { ReviewDecisionControl } from "../review-decisions.js";

/**
 * Starting one round on the Prologue runtime (W4-06 moved `startAgentRun` here from the Node composition, in stages):
 * the session's workspace mode is checked, the round's gateway, stop check, child roles, materials, surface and
 * Character are put together, its intent is saved before the SDK can dispatch anything, then the run is started and
 * handed back with its controls.
 */

/** Turns a round started without a budget may take: the SDK's own default, unchanged. */
const ROUND_DEFAULT_TURNS = 8;
/** One model call's wait for its answer to start, and between its parts, when the round has no time budget. */
const MODEL_CALL_TIMEOUT_MS = 180_000;

// Codes the runtime raises before it creates a run: nothing ran, so the attempt is a settled refusal. The session's
// checks before any write (a run parked on a question, one being recovered or handed over, a parked set it could not
// read back) are among them.
const REFUSED_BEFORE_RUN = new Set(["AGENT_START_INVALID", "CONTEXT_BUDGET_EXCEEDED", "CONTEXT_SOURCE_MISSING", "CONTEXT_INBOUND_HELD", "EFFECT_RECONCILE_REQUIRED",
  "SESSION_RUN_PARKED", "SESSION_RECOVERY_BUSY", "SESSION_HISTORY_UNAVAILABLE"]);

export interface RunDeps {
  readonly runtime: Runtime;
  /** Per-invocation commit checks (prologue-effects): the SDK's writes in a call re-check the caller first. */
  readonly effects: PrologueEffects;
  readonly memoryAuthority: ReturnType<typeof import("./prologue-memory-authority.js").createPrologueMemoryAuthority>;
  readonly options: PrologueNodeAdapterOptions;
  readonly state: RoundState;
  readonly index: SessionIndexStore;
  readonly dispatchGuards: DispatchGuards;
  readonly surfaces: () => PrologueSurfaces | undefined;
  readonly mcpLibrary: ReturnType<typeof createPrologueMcpLibrary>;
  readonly platformMemory: ReturnType<typeof createPrologueMemory>;
  readonly credentials: PrologueCredentialBridge;
  readonly stepBoards: ReturnType<typeof createPrologueTaskBoards>;
  readonly projectWork: ReturnType<typeof createProjectWork>;
  readonly workGraphs: ReturnType<typeof createWorkGraphs>;
  readonly messages: ReturnType<typeof createSessionMessages>;
  readonly waitsPort: ReturnType<typeof createPrologueWaits>;
  readonly checkpoints: ReturnType<typeof createPrologueCheckpoints> | undefined;
  readonly approvals: PrologueApprovalBridge | undefined;
  readonly delegations: WorkDelegationStore;
}

type Started = Awaited<ReturnType<Runtime["startAgentRun"]>>;
type Session = NonNullable<Awaited<ReturnType<Runtime["sessions"]["open"]>>>;
type ChildRole = NonNullable<PrologueStartInput["subagents"]>[number];
type Mode = { readonly none: boolean; readonly business: boolean };

/** The session's workspace mode fixes what the round may hold: none holds no tools; business holds only root-free ones. */
function assertWorkspace(input: PrologueStartInput, index: SessionIndex | undefined, state: RoundState, mode: Mode): asserts index is SessionIndex {
  const { none, business } = mode;
  if (!index || (index.workspace ?? "required") !== (input.workspace ?? "required")) throw new Error("会话工作区模式与原始归属不一致");
  if (none && (input.root_path !== undefined || input.provenance.frozen.directory !== undefined
    || input.character.tools.length || input.actions || input.mcp_tools?.length || input.mcp_sources?.length
    || input.subagents?.length || input.subagent_workspaces?.length || input.provenance.frozen.execution_plan
    || state.actionToolSessions.has(input.session_id))) throw new Error("无目录会话不能获得工具或工作区授权");
  if (business && (input.root_path !== undefined || input.provenance.frozen.directory !== undefined || input.mcp_tools?.length || input.mcp_sources?.length
    || input.subagent_workspaces?.length || input.provenance.frozen.execution_plan
    || input.character.tools.some(tool => !([...BUSINESS_HOST_TOOLS, ...(input.subagents?.length ? BUSINESS_SUBAGENT_HOST_TOOLS : [])] as readonly string[]).includes(tool)))) throw new Error("业务会话只能使用宿主冻结的动作与不碰目录的工具");
  if (!none && !business && !input.root_path) throw new Error("执行缺少已授权工作区");
}

/** The round's Prologue system tools. Suggesting is the round's own action pack tool (prologue-action-tools.ts), not one of them. */
/** The role's own tools in the Host's words, and as Prologue names them. */
const hostSystemTools = (input: PrologueStartInput) => input.character.tools.filter(tool => tool !== SUGGEST_HOST_TOOL);
const systemTools = (input: PrologueStartInput, overrides?: ReadonlyMap<string, string>, excluded?: ReadonlySet<string>) =>
  hostSystemTools(input)
    // A round whose pack does not hold an extension-provided tool must not show a name the pack cannot resolve.
    .filter(tool => !excluded?.has(tool) || overrides?.has(tool) === true)
    .map(tool => overrides?.get(tool) ?? prologueToolName(tool));

/**
 * A Coding round's after-write check (specs/prologue-adoption §6.0p.3): given when the round's pack declares the check and
 * the round works in a directory whose workspace has the person's checkers now. Without it the pack may still declare the
 * check, and nothing is asked.
 */
async function roundChecks(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, mode: Mode, tools: readonly PackTool[] | undefined) {
  const workspaceAt = deps.options.checks?.workspaceAt, projectId = index.owner.project_id, store = createPrologueWriteCheckers(deps.runtime);
  const declared = tools?.some(tool => tool.afterWriteCheck === true) === true;
  const workspace = !declared || mode.none || mode.business || !input.root_path || !workspaceAt ? undefined : await workspaceAt(projectId, input.root_path);
  if (!workspace || !(await store.read(projectId, workspace)).checkers.length) return undefined;
  return afterWriteExecutor({ projectId, rootPath: input.root_path!, workspaceAt: workspaceAt!, store, ...(input.beforeDispatch ? { beforeDispatch: async () => { const fence = await input.beforeDispatch!(); requireSynchronous(fence?.(), "最终派发检查必须同步完成"); } } : {}),
    // A round stopped while the index was being read keeps nothing either: the check is in the change itself, just before the write.
    note: (about, note, signal) => deps.index.update(about.session?.id ?? input.session_id, saved => {
      signal?.throwIfAborted();
      // A dispatched child inherits the parent's pack, so its check runs on the same executor: record it against the
      // child's own attempt (named by the Run the SDK sends), never the parent's. A run without an id falls back to the
      // latest attempt of its session.
      const held = about.run === undefined ? saved.attempts.at(-1) : saved.attempts.find(item => item.run_id === about.run!.id) ?? saved.attempts.at(-1);
      if (held) (held.write_checks ??= {})[about.operationKey] = note;
    }) });
}

/** Called at admission (before first-run freezing), and again under current authority for an explicit continuation. */
/** The project's work board, where every session of the project has its block (the user's B, 2026-10-14). */
const projectBoardOf = async (deps: RunDeps, index: SessionIndex) => ({ kind: "task-board", id: await deps.projectWork.projectId(index.owner.project_id), revision: 1 }) as ExactRef<"task-board">;

/** Steps another session handed to this one and not yet done: on the project's board, held by it, outside its own block. */
const handedSteps = (runtime: Runtime, board: ExactRef<"task-board">, session: ExactRef<"session">, block: string) => runtime.boards.get(board).nodes
  .filter(node => node.assignee?.kind === "session" && node.assignee.id === session.id && node.id !== block && !node.id.startsWith(`${block}.`)
    && !["succeeded", "failed", "cancelled"].includes(node.state) && node.reports.some(report => report.handover?.to?.kind === "session" && report.handover.to.id === session.id));

/**
 * What the round is given to read beside its task: the person's text materials, where its plan stands, and in a main
 * round what other sessions are doing, the messages left for it and the steps handed to it.
 */
async function roundMaterials(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, session: Session, none: boolean, plan: PrologueStartInput["provenance"]["frozen"]["execution_plan"], textResources: Array<{ ref: ExactRef<"resource">; as: "original" }>) {
  const { runtime, stepBoards, projectWork, messages } = deps;
  const continued = input.provenance.frozen.continues_step_board_of;
  // A confirmed plan's steps go under the session's block on the project's board; a continued plan keeps its steps —
  // with every step a person inserted, skipped or reordered — rather than starting over.
  let stepBoard: PlanPlace | undefined;
  if (plan && continued) stepBoard = await stepBoards.resume({ session_id: input.session_id, run_id: continued });
  else if (plan) {
    const board = await projectBoardOf(deps, index), block = await sessionBlock(runtime, board, session.ref, input.session_title ?? index.title);
    stepBoard = await stepBoards.admit(plan, session.ref, { board, block, prefix: planPrefix(block, index.attempts.filter(attempt => attempt.step_prefix).length + 1) });
  }
  // A round without a plan of its own still starts knowing where the session's unfinished plan stands.
  const earlier = plan ? undefined : [...index.attempts].reverse().map(placeOf).find(Boolean);
  // The plan as it stands travels with this round's task, where it reads as newer than the conversation before it.
  const digest = stepBoard ? await stepBoards.digest(stepBoard, session.ref.id) : earlier ? await stepBoards.standing(earlier, session.ref.id) : "";
  if (digest) textResources.push({ ref: await stageTextResource(runtime, digest, "agent-board-digest"), as: "original" });
  // What other sessions in the project are doing, and where it overlaps this round, as the round starts.
  const project = index.owner.project_id, workText = `${input.task}\n${(plan?.steps ?? []).map(step => `${step.title}\n${step.acceptance}`).join("\n")}`;
  const scopePaths = none ? [] : workPaths(workText);
  const projectDirectory = !none && !index.parent_run ? input.root_path : undefined;
  if (projectDirectory) {
    try {
      const seen = await projectWork.read(project, { session_id: session.ref.id, directory: projectDirectory, paths: scopePaths });
      const note = projectWorkDigest(await projectWork.projectId(project), seen.items, session.ref.id, seen.overlaps, input.character.tools.includes("session-send"));
      if (note) textResources.push({ ref: await stageTextResource(runtime, note, "agent-project-work"), as: "original" });
    } catch { /* the project's list is a courtesy to the round; a failed read leaves it out rather than stopping the round */ }
    // Messages other sessions left for this one while it was not running.
    const inbox = await messages.inbox(session.ref.id, project).catch(() => "");
    if (inbox) textResources.push({ ref: await stageTextResource(runtime, inbox, "agent-session-inbox"), as: "original" });
    // Steps other sessions handed to this one and not yet done: where they are, so this round can go on with them.
    const board = await projectBoardOf(deps, index).catch(() => undefined);
    const handed = board ? handedSteps(runtime, board, session.ref, `s-${session.ref.id}`) : [];
    if (handed.length) textResources.push({ ref: await stageTextResource(runtime, ["别的会话交给你、还没做完的步骤（项目任务图上现在归你）：",
      ...handed.map(node => `- 任务图 ${board!.id}：${node.id}「${node.title.slice(0, 60)}」（${node.state}）`),
      "用 board-read / board-report（board 写上面的任务图编号）处理这些步骤；做完后在交接信上答复对方。"].join("\n"), "agent-handed-steps"), as: "original" });
  }
  return { textResources, stepBoard, project, scopePaths, projectDirectory };
}

/**
 * Where a round that works with others stands (specs/prologue-adoption §4.6.10, the user's B): on its session's block
 * on the project's work board — under the continuation's request key when one of this session's may go on now, so the
 * round takes it up. A round of a session on a work's own graph stands on the step it holds there (§6.0k). A subtask
 * session and a round that does not collaborate stand nowhere.
 */
async function roundBinding(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, session: Session, stepBoard: PlanPlace | undefined) {
  const { runtime } = deps;
  if (index.work_graph) return deps.workGraphs.binding({ ...index, work_graph: index.work_graph }, session.ref, index.owner.actor_id ?? "user");
  if (index.parent_run || !collaborates(systemTools(input), Boolean(stepBoard))) return undefined;
  const board = stepBoard?.ref ?? await projectBoardOf(deps, index);
  const block = stepBoard?.block ?? await sessionBlock(runtime, board, session.ref, input.session_title ?? index.title);
  const ready = eligibleContinuation(runtime, session.ref, [board]);
  if (ready && await canTakeUp(runtime, ready)) return { board: ready.board, node: ready.node, requestKey: ready.requestKey };
  await readyStep(runtime, board.id, block, index.owner.actor_id ?? "user");
  return { board: board.id, node: block };
}

/**
 * The project's side panel browser, for this session only: its tools join the round and the round is told how to use
 * them. Read-only rounds only look; a page another live round holds is not shared, and the round is told why.
 */
async function roundSurface(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, session: Session, business: boolean, control: NonNullable<ReturnType<DispatchGuards["getStore"]>>): Promise<SurfaceAttachment> {
  const surfaceHost = deps.surfaces();
  if (!(business && surfaceHost && input.browser !== false)) return emptySurfaceAttachment();
  return surfaceHost.attach(session, index.owner.project_id, input.session_id, { readOnly: input.provenance.frozen.execution === "read-only",
    control, goal: input.task, projectId: index.owner.project_id })
    .catch((error: unknown) => {
      requireSynchronous(control.assertCurrent());
      if (error instanceof AggregateError) throw error;
      return emptySurfaceAttachment(`界面控制这一轮不可用：${error instanceof Error ? error.message : String(error)}`);
    });
}

/** The round's Character: its instructions (role, methods, guidance, plan, recovery), its tools, and the memories chosen for it. */
async function roundCharacter(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, parts: {
  readonly mode: Mode; readonly methods: readonly string[]; readonly childInstructions: string; readonly childRoles: Map<string, ChildRole>;
  readonly surface: Awaited<ReturnType<typeof roundSurface>>; readonly stepBoard: Awaited<ReturnType<typeof roundMaterials>>["stepBoard"];
  readonly actionTools: ReturnType<typeof roundGateway>["actionTools"];
  readonly toolOverrides?: ReadonlyMap<string, string>;
  readonly excludedHostTools?: ReadonlySet<string>;
}) {
  const { runtime, stepBoards, mcpLibrary } = deps;
  const { mode: { none, business }, surface, stepBoard, childRoles } = parts;
  const instructions = await stageInstructions(runtime, [input.character.instructions, parts.childInstructions, ...parts.methods,
    ...(surface.surfaces.includes("browser") ? [SURFACE_GUIDANCE] : []), ...(surface.surfaces.includes("desktop") ? [DESKTOP_GUIDANCE] : []), ...(surface.note ? [`## 界面控制\n${surface.note}`] : []),
    ...(stepBoard ? [stepBoards.instructions(stepBoard, { dispatch: childRoles.size > 0 })] : []), (none || business ? "" : await deps.checkpoints?.context(input.session_id) ?? "")].join("\n\n"));
  if (!none && !business) {
    await mcpLibrary.validate(index.owner, input.mcp_tools ?? []);
    await mcpLibrary.validateSources(index.owner, input.mcp_sources ?? []);
  }
  const mcpTools: string[] = [];
  for (const selected of input.mcp_tools ?? []) {
    const conn = runtime.mcp.list().find(item => item.id === mcpConnectionId(selected))!;
    const snapshot = runtime.mcp.snapshotOf(conn.ref);
    const at = snapshot.tools.findIndex(tool => tool.name === selected.tool && tool.shapeFingerprint === selected.version);
    const adopted = runtime.adoptMcpTools(conn.ref);
    if (at < 0 || !adopted[at]) throw new Error("MCP 工具已变化，请重新选择");
    mcpTools.push(adopted[at]!);
  }
  mcpTools.sort(compareCodeUnits);
  const tools = [...systemTools(input, parts.toolOverrides, parts.excludedHostTools), ...mcpTools, ...(parts.actionTools?.names ?? []), ...surface.tools];
  const runTools = [...new Set([...tools, ...[...childRoles.values()].flatMap(role => role.host_tools.map(prologueToolName))])];
  // The memories the Host chose for this run, as exact references (one deleted meanwhile is simply not given).
  const pinnedMemory = input.memory?.pinned.map(item => ({ scope: item.scope, owner: item.owner,
    ref: { kind: "memory" as const, id: item.memory_id, revision: 1 as const }, ...(item.version === undefined ? {} : { version: item.version }) })) ?? [];
  const created = runtime.characters.create({
    // This is a projection of the frozen role, not a user-managed Character.
    // A project prompt may change without changing the package role version.
    id: `molis-role-${randomUUID()}`,
    version: input.character.version,
    name: input.character.name,
    role: input.character.name,
    ...(instructions === undefined ? {} : { instructionsRef: instructions }),
    tools,
    // Reads memory only when the Host chose some for this run; never writes through the runtime's own path.
    ...(input.memory ? { memoryPolicy: { recall: true, write: false } } : {}),
  });
  return { character: runtime.characters.publish(created.ref), runTools, pinnedMemory };
}

/**
 * The caller is checked once more, then only this invocation's prepared intent is recorded: acceptance is the SDK's
 * initial durable Run commit. `abandon` takes back an intent the SDK never accepted.
 */
async function recordAttempt(deps: RunDeps, input: PrologueStartInput, attempt: SessionIndex["attempts"][number]): Promise<{ attemptIndex: number; abandon: () => Promise<void> }> {
  const intent = structuredClone({ ...attempt, ...(input.memory ? { memory_context: {
    class_restrictions: input.memory.class_restrictions, consumer: input.memory.consumer, current_scene: input.memory.current_scene,
    ...(input.memory.facts ? { facts: input.memory.facts } : {}),
    ...(input.memory.usage ? { usage: input.memory.usage } : {}),
  } } : {}) });
  await input.beforeStart?.(); requireSynchronous(input.assertBeforeStart?.(), "最终授权检查必须同步完成");
  let attemptIndex = -1;
  await deps.index.update(input.session_id, index => {
    attemptIndex = index.attempts.length;
    recordOriginalInput(index, intent, input.original_input);
    index.attempts.push(intent);
  });
  const abandon = () => deps.effects.detach(() => deps.index.update(input.session_id, saved => {
    const held = saved.attempts[attemptIndex];
    if (held && !held.run_id && isDeepStrictEqual(held, intent)) saved.attempts.splice(attemptIndex, 1);
  }));
  return { attemptIndex, abandon };
}

/**
 * A child the round dispatched, as the runtime starts it: checked against the round's fixed roles and directories, and
 * when it has operations to review, recorded under its own index and bridged to the Host's review queue.
 */
function watchChild(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, attemptIndex: number, children: { readonly work?: PrologueWorkDelegation; readonly roles: Map<string, ChildRole>; readonly roots: PrologueSubagentRoot[]; readonly root: { ref: ExactRef<"authorized-root"> } | undefined }) {
  const { runtime, state } = deps;
  return async (observed: Parameters<NonNullable<NonNullable<Parameters<Runtime["startAgentRun"]>[0]["subagents"]>["onStarted"]>>[0]) => {
    verifySubagentStart(runtime, children.roles, children.roots)(observed);
    let subagentDone = false;
    let unsubSubagent: (() => void) | undefined;
    unsubSubagent = observed.run.subscribe(event => {
      for (const changed of state.subagentListeners) changed(observed.parentRun.id);
      if (isTerminalEventType(event.type) && !subagentDone) {
        subagentDone = true;
        queueMicrotask(() => { unsubSubagent?.(); });
      }
    });
    const registered = runtime.subagents.list().find(child => child.run.id === observed.run.ref.id && child.session.id === observed.childSession.ref.id)!;
    const role = children.roles.get(exactCharacterKey(registered.character!))!;
    // Every child's run hears what its neighbours on the task graph send it (letters are handed over by the Host).
    state.sessionRuns.add(observed.run.ref.id); state.liveSessions.set(observed.childSession.ref.id, observed.run.ref.id);
    const parentWork = children.work;
    state.activeRuns.set(observed.run.ref.id, { live: () => ["prepared", "running"].includes(observed.run.state), policy: observed.policy,
      ...(parentWork ? { work: parentWork, workSelection: parentWork.permission.mode !== "original" } : {}),
      assertAuthority: () => { requireSynchronous(input.assertBeforeDispatch?.(), "最终授权检查必须同步完成"); },
      steer: async text => { await observed.control.steer({ text, source: "app" }); } });
    let endedDone = false;
    let unsubEnded: (() => void) | undefined;
    unsubEnded = observed.run.subscribe(event => {
      if (!isTerminalEventType(event.type)) return;
      if (!endedDone) {
        endedDone = true;
        queueMicrotask(() => { unsubEnded?.(); });
      }
      state.activeRuns.delete(observed.run.ref.id);
      if (state.liveSessions.get(observed.childSession.ref.id) === observed.run.ref.id) state.liveSessions.delete(observed.childSession.ref.id);
      state.runRefs.delete(observed.run.ref.id);
      state.runRoots.delete(observed.run.ref.id);
    });
    // SDK493 invokes this observer only for this claim's newly created child. Its held driver has not started.
    // subscribe replays the initial opening synchronously; peer/carried input is never this canonical caller.
    const opening: import("@prologue/sdk").ModelEvent[] = [];
    let prefix = true;
    const stopOpening = observed.run.subscribe(event => { if (prefix && event.type === "prompt") opening.push(event); else prefix = false; });
    stopOpening();
    const caller = canonicalCallerOpening(opening);
    if (caller === undefined) throw new Error("新子任务没有唯一 caller 开场，未开始子任务模型请求");
    const childController = state.childActionControllers.get(observed.childSession.ref.id);
    if (childController) {
      state.childActionControllers.delete(observed.childSession.ref.id);
      state.actionControllers.set(observed.run.ref.id, childController);
      const guard = state.stopGuards.get(observed.childSession.ref.id);
      if (guard) guard.task = caller;
      watchRoundFacts(state, observed.run);
      let controllerDone = false;
      let unsubController: (() => void) | undefined;
      unsubController = observed.run.subscribe(event => {
        if (!isTerminalEventType(event.type)) return;
        if (!controllerDone) {
          controllerDone = true;
          queueMicrotask(() => { unsubController?.(); });
        }
        childController.abort();
        state.actionControllers.delete(observed.run.ref.id);
      });
    }
    await deps.index.update(observed.parentSession.id, saved => {
      const attempt = saved.attempts[attemptIndex];
      if (saved.ref.id !== index.ref.id || observed.parentSession.id !== index.ref.id || !attempt || attempt.refused
        || attempt.task !== input.task || attempt.run_id && attempt.run_id !== observed.parentRun.id) throw new Error("子任务原启动身份不一致");
      const fact = { parent_run: observed.parentRun.id, session: { ...observed.childSession.ref }, run: { ...observed.run.ref }, format: "caller-only-v2" as const };
      const held = attempt.child_openings ??= [];
      if (held.some(item => item.session.id === fact.session.id || item.run.id === fact.run.id)) throw new Error("子任务生成事实已存在，不能重标旧记录");
      held.push(fact);
    });
    // A child with operations to review is tracked by the Host: one in its own directory, or one in the main
    // workspace that may run commands. A read-only child in the main workspace has nothing to review.
    // Without its own directory or a main workspace (workspace:none) there is nothing the Host could review.
    const business = input.workspace === "business";
    if (!business && !children.roots.length && (role.execution !== "workspace-write" || !children.root || !input.root_path)) return;
    const granted = business ? undefined : children.roots.length ? children.roots.find(root => root.id === observed.workspace!.id)! : { rootRef: children.root!.ref, path: input.root_path! };
    const childRun = { session_id: observed.childSession.ref.id, run_id: observed.run.ref.id };
    await deps.index.save({ schema: SESSION_INDEX_SCHEMA, ref: observed.childSession.ref, title: role.name, owner: index.owner,
      ...(business ? { workspace: "business" as const } : {}),
      parent_run: { session_id: observed.parentSession.id, run_id: observed.parentRun.id },
      attempts: [{ started_at: new Date().toISOString(), task: caller, run_id: childRun.run_id, ...(granted ? { root_ref: granted.rootRef } : {}),
        frozen: { ...input.provenance.frozen, role_id: role.role_id, role_version: role.version, execution: role.execution,
          subagent_workspaces: undefined, character: undefined, compaction: undefined, execution_plan: undefined,
          ...(granted ? { workspace: "required" as const, directory: { canonical_path: granted.path, realpath_verified: true } } : { workspace: "business" as const, directory: undefined }),
          host_tools: [...role.host_tools], text_materials: [], skills: [], mcp_tools: [], mcp_sources: [], budget: null,
          prompts: role.prompts.map(prompt => ({ prompt_id: prompt.prompt_id, version: prompt.version, layer: prompt.layer ?? "role" })) } }] });
    state.runSessions.set(childRun.run_id, childRun.session_id); state.runRefs.set(childRun.run_id, observed.run.ref);
    if (granted) state.runRoots.set(childRun.run_id, granted.rootRef);
    const bridgeFailed = async () => {
      const reason = "子任务的宿主审查或归属记录失败，已停止执行；请核对原工具结果后继续";
      const errors = state.subagentBridgeErrors.get(observed.parentRun.id) ?? {};
      errors[childRun.run_id] = reason;
      state.subagentBridgeErrors.set(observed.parentRun.id, errors);
      observed.control.stop("cancelled");
      try {
        await deps.index.update(observed.parentSession.id, saved => {
          const attempt = saved.attempts.find(attempt => attempt.run_id === observed.parentRun.id)!;
          attempt.subagent_errors = { ...attempt.subagent_errors, [childRun.run_id]: reason };
        });
      } catch { errors[childRun.run_id] = reason + "；失败原因未能持久保存，请保留当前记录"; }
    };
    let bridgeDone = false;
    let unsubBridge: (() => void) | undefined;
    unsubBridge = observed.run.subscribe(event => {
      if (event.type === "command-receipt") {
        const events = state.commandEvents.get(childRun.run_id) ?? [];
        if (!events.some(saved => sameRef(saved.receiptRef, event.receiptRef))) events.push(event);
        state.commandEvents.set(childRun.run_id, events);
      }
      if (event.type === "awaiting-approval") void deps.approvals!.mirrorPending({ pendingRef: event.pendingRef, owner: index.owner, run: childRun })
        .catch(bridgeFailed);
      if (isTerminalEventType(event.type)) {
        if (!bridgeDone) {
          bridgeDone = true;
          queueMicrotask(() => { unsubBridge?.(); });
        }
        state.runRefs.delete(childRun.run_id);
        state.runRoots.delete(childRun.run_id);
      }
    });
  };
}

/** What the SDK is asked to start: the session, workspace, history, children, context, compaction, model and agent. */
function sdkStart(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, parts: {
  readonly work?: PrologueWorkDelegation; readonly attemptIndex: number; readonly session: Session; readonly root: { ref: ExactRef<"authorized-root"> } | undefined; readonly business: boolean; readonly credentialRef: ExactRef<"credential">;
  readonly childRoles: Map<string, ChildRole>; readonly childRoots: PrologueSubagentRoot[]; readonly runTools: string[];
  readonly character: { ref: ExactRef<"character"> }; readonly textResources: Array<{ ref: ExactRef<"resource">; as: "original" }>;
  readonly pinnedMemory: Awaited<ReturnType<typeof roundCharacter>>["pinnedMemory"];
  readonly binding: { board: string; node: string; requestKey?: string } | undefined;
  readonly referenceKinds?: Array<{ kind: string; title: string }>;
}): Parameters<Runtime["startAgentRun"]>[0] {
  const { session, root, business, credentialRef, childRoles, childRoots } = parts;
  const params = runModelParams(input.model, input.provenance.frozen.budget, input.provenance.frozen.reasoning_effort);
  const cache = input.model.prompt_cache === undefined || input.model.prompt_cache === "off" ? {} : { promptCache: input.model.prompt_cache };
  return {
    session: deps.effects.session(session),
    ...(parts.binding ? { collaboration: { board: parts.binding.board, node: parts.binding.node } } : {}),
    ...(root ? { rootRef: root.ref } : business ? { workspace: "app" as const } : { workspace: "none" as const }),
    // A digest round carries earlier rounds in its task; replaying them verbatim too is what stopped long sessions.
    ...(input.history === "digest" ? {} : { history: "session" as const, readOpening: sessionOpeningReader(index, deps.index) }),
    // Supplements kept in the session for the next round come in only when the Host says so (specs/ai-input-receipts §4.4).
    ...(input.queued ? { queued: input.queued } : {}),
    ...(childRoles.size ? { subagents: {
      // The user's decision: a parent that split work across directories may read (never write) exactly those.
      ...(childRoots.length ? { workspaces: childRoots.map(({ id, rootRef }) => ({ id, rootRef })), requireWorkspace: true, parentReads: true } : {}),
      onStarted: watchChild(deps, input, index, parts.attemptIndex, { roles: childRoles, roots: childRoots, root, work: parts.work }),
    } } : {}),
    // Packed against the model's own window when it states a smaller one than the runtime default.
    ...(input.compaction || input.provenance.frozen.model_context || input.project_trusted ? { context: {
      // The repository's own instruction files come in only when the Host trusted the project (S-project-instructions-trust).
      ...(input.project_trusted ? { projectTrusted: true } : {}),
      // A failed early compaction does not end a round whose history still fits the window (the person chose this).
      ...(input.compaction ? { compactAboveTokens: input.compaction.above_tokens, continueWhenCompactionFails: true } : {}),
      ...(input.provenance.frozen.model_context ? { windowTokens: input.provenance.frozen.model_context.window_tokens } : {}),
    } } : {}),
    ...(input.compaction ? {
      compactor: createPrologueCompactor({ runtime: deps.runtime, prompt: input.compaction.prompt, connection: {
        protocol: input.model.protocol, endpoint: input.model.endpoint, model: input.model.model, credentialRef, ...cache } }),
    } : {}),
    start: {
      protocol: input.model.protocol,
      endpoint: input.model.endpoint,
      model: input.model.model,
      credentialRef,
      ...(Object.keys(params).length ? { params } : {}),
      // How long one model call may take to answer and then pause between parts. The SDK's 60 s default cut off
      // reasoning models on larger rounds before their first byte (MiniMax-M3, measured 2026-09-28); a round with
      // a time budget keeps that budget.
      timeoutMs: input.provenance.frozen.budget?.max_duration_ms ?? MODEL_CALL_TIMEOUT_MS,
      messages: [{ role: "user", text: input.task }],
      // Images the person brought ride on every model call of this Run; their bytes are spliced in by the Host.
      ...(input.image_materials?.length ? { attachments: input.image_materials.map(image => ({ ref: { kind: "resource" as const, id: image.resource.id, revision: image.resource.revision }, as: "original" as const })) } : {}),
      // `off` sends no field, so a Run with caching turned off is byte for byte the request it would have been before caching existed.
      ...cache,
    },
    agent: {
      // A round started without a budget keeps the turns it always had; only subagents use the raised default.
      budget: {
        maxTurns: input.provenance.frozen.budget?.max_turns ?? ROUND_DEFAULT_TURNS,
        ...(input.provenance.frozen.budget?.max_total_tokens === undefined ? {} : { maxTokens: input.provenance.frozen.budget.max_total_tokens }),
        ...(input.provenance.frozen.budget?.max_duration_ms === undefined ? {} : { maxWallClockMs: input.provenance.frozen.budget.max_duration_ms }),
      },
      // A round that takes up a continuation starts under its request key: the Runtime lets only one run do that.
      idempotencyKey: parts.binding?.requestKey ?? `molis-work-${input.session_id}-${randomUUID()}`,
      mode: input.mode,
      toolNames: parts.runTools,
      mcpConnections: [...new Set([...(input.mcp_tools ?? []), ...(input.mcp_sources ?? [])].map(mcpConnectionId))],
      characterRef: parts.character.ref,
      ...(parts.textResources.length ? { mount: { textResources: parts.textResources } } : {}),
      // Memory IDs reach the model only in a round that can address a memory: the business gateway (forget, replace, or a Memory
      // Action from the directory) or a frozen Memory Action. Elsewhere they were tokens on every recalled memory that nothing
      // could use (BL-1073).
      ...(input.memory ? { memory: { consumer: input.memory.consumer, currentScene: input.memory.current_scene,
        addressable: !!input.action_gateway || !!input.actions?.tools.some(tool => (tool.provider_id ?? tool.provider.provider_id) === MEMORY_PROVIDER_ID),
        ...(input.memory.facts ? { facts: { ...(input.memory.facts.plugins ? { plugins: input.memory.facts.plugins } : {}),
          ...(input.memory.facts.object_kinds ? { objectKinds: input.memory.facts.object_kinds } : {}),
          ...(input.memory.facts.objects ? { objects: input.memory.facts.objects.map(obj => ({ plugin: obj.plugin_id, kind: obj.kind, id: obj.id })) } : {}) } } : {}),
        scopes: input.memory.scopes, resident: parts.pinnedMemory, task: input.memory.task, skip: input.memory.skip,
        budgetChars: input.memory.budget_chars, budgetTokens: input.memory.budget_tokens } } : {}),
      // This round's project's kinds replace the Runtime's built-in ones; its subagents keep them (BL-152).
      ...(parts.referenceKinds ? { askUserReferenceKinds: parts.referenceKinds } : {}),
    },
  };
}

/** After the SDK started the run: its root, its id in the index, its controls, and in a main round its project work. */
export async function attachStartedRound(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, at: {
  readonly started: Started; readonly session: Session; readonly root: { ref: ExactRef<"authorized-root"> } | undefined; readonly attemptIndex: number;
  readonly actionController: AbortController; readonly surface: SurfaceAttachment; readonly hasActions: boolean; readonly projectDirectory?: string; readonly project: string; readonly scopePaths: string[];
  readonly plan: PrologueStartInput["provenance"]["frozen"]["execution_plan"]; readonly stepBoard: Awaited<ReturnType<typeof roundMaterials>>["stepBoard"]; readonly stopping: () => boolean;
  readonly work?: PrologueWorkDelegation; readonly appliedPolicies: Map<string, () => void>;
  readonly exactPermissions: Map<string, { ref: ExactRef<"effect">; control: ReviewDecisionControl }>; readonly mcp?: RoundMcp;
}): Promise<void> {
  const { state } = deps;
  const { started, session } = at;
  if (at.root) state.runRoots.set(started.run.ref.id, at.root.ref);
  try { await deps.index.update(input.session_id, saved => { saved.attempts[at.attemptIndex]!.run_id = started.run.ref.id; }); }
  catch (error) { at.actionController.abort(); started.control.stop("cancelled"); throw error; }
  if (at.hasActions) state.actionControllers.set(started.run.ref.id, at.actionController);
  // A round is live until it ends: before its first model event it is still "prepared", and it hears a steer then too.
  state.sessionRuns.add(started.run.ref.id); state.runSessions.set(started.run.ref.id, session.ref.id); state.runRefs.set(started.run.ref.id, started.run.ref); at.surface.noteRun(started.run.ref.id);
  state.activeRuns.set(started.run.ref.id, { live: () => ["prepared", "running"].includes(started.run.state), policy: started.policy,
    stop: () => stopSdkRun(started.run), usePolicy: (id, assert) => { at.appliedPolicies.set(id, assert); },
    ...(at.work ? { work: at.work, workSelection: at.work.permission.mode !== "original",
      useExact: (id: string, control: ReviewDecisionControl) => {
        const ref = state.reviewEffects.get(`prologue:${id}`);
        if (!ref) throw agentErrors.review_not_permitted("原授权操作不可读");
        at.exactPermissions.set(id, { ref, control });
      } } : {}), mcp: at.mcp,
    assertAuthority: () => {
      if (at.stopping()) throw agentErrors.review_not_permitted("原轮次正在停止");
      requireSynchronous(input.assertBeforeDispatch?.(), "最终授权检查必须同步完成");
    },
    steer: async text => { await started.control.steer({ text, source: "app" }); } });
  if (at.stepBoard) deps.stepBoards.follow(at.stepBoard, { session_id: session.ref.id, run_id: started.run.ref.id });
  // A main round is work under way in its project until it ends; a subtask's work is its parent's.
  if (at.projectDirectory) {
    state.liveSessions.set(session.ref.id, started.run.ref.id);
    try {
      const workId = await deps.projectWork.begin(at.project, { session: session.ref, run_id: started.run.ref.id, title: input.session_title ?? index.title, task: input.task,
        directory: at.projectDirectory, paths: at.scopePaths, ...(input.queued_work_id ? { queued: input.queued_work_id } : {}) });
      state.runWork.set(started.run.ref.id, { project: at.project, id: workId, session: session.ref, directory: at.projectDirectory });
      if (workId === input.queued_work_id) await deps.waitsPort.queueTakenOver(session.ref.id, { board: await deps.projectWork.projectId(at.project), node: blockId(session.ref) });
    } catch { /* Project registration and queue handoff are best effort; an admitted round keeps its inbox. */ }
  }
}

/** When the round ends: its actions and step board let go, the page released, its project work ended and its messages settled. */
function roundEnded(deps: RunDeps, at: RoundLifecycle, type: TerminalRunState): void {
  const { started, session, stepBoard, actionController, surface, onAborted } = at;
  const { state } = deps;
  const surfaceHost = deps.surfaces();
  const end = type === "completed" || type === "failed" ? type : "stopped";
  if (type === "cancelled" || type === "tripped" || type === "circuit-tripped") onAborted();
  actionController.abort(); state.actionControllers.delete(started.run.ref.id); state.dispatchChecks.delete(started.run.ref.id); state.activeRuns.delete(started.run.ref.id);
  deps.options.reviewQueue?.permissions.releaseRun(started.run.ref.id);
  state.childAdmissions.delete(started.run.ref.id);
  if (stepBoard) deps.stepBoards.unfollow(started.run.ref.id);
  deps.workGraphs.ended(started.run.ref, session.ref, type);
  if (state.liveSessions.get(session.ref.id) === started.run.ref.id) state.liveSessions.delete(session.ref.id);
  // The side panel stops saying the Assistant is using the page the moment its round is over, and this run's app approvals are dropped.
  void surface.release(end).catch(() => undefined);
  surfaceHost?.releaseRun(started.run.ref); state.runRefs.delete(started.run.ref.id); state.runRoots.delete(started.run.ref.id);
  const work = state.runWork.get(started.run.ref.id);
  if (work) { state.runWork.delete(started.run.ref.id); void deps.projectWork.end(work.project, work.id, end).catch(() => undefined); }
  // A round that finished normally saw every message given to it; unanswered requests are settled.
  if (at.projectDirectory && type === "completed") void deps.messages.settle(session.ref.id).catch(() => undefined);
  // A failure or a guardrail/circuit stop will not answer the requests someone waits on; they are ended so the waiting session wakes.
  // A person's cancellation stays on its existing wait-cancellation path.
  if (at.projectDirectory && type !== "completed" && type !== "cancelled") void deps.messages.endUnanswered(session.ref.id, type).catch(() => undefined);
}

interface RoundLifecycle {
  readonly projectDirectory?: string;
  readonly started: Started; readonly session: Session; readonly attemptIndex: number; readonly actionController: AbortController; readonly surface: SurfaceAttachment;
  readonly stepBoard: { ref: { id: string } } | undefined; readonly onAborted: () => void;
  readonly actionReviews: ReturnType<typeof roundGateway>["reviews"];
  readonly extensions?: { close(): Promise<void> };
  readonly codeIntelligence?: { close(): Promise<void> };
  readonly work?: PrologueWorkDelegation;
}

/** Single internal lifecycle observer for one round: repair-limit stop, command receipts, and idempotent terminal cleanup. */
export function watchRoundLifecycle(deps: RunDeps, input: PrologueStartInput, at: RoundLifecycle): { readonly hostStop: () => string | undefined; readonly markReady: () => void; readonly dispose: (type: TerminalRunState) => void; readonly isSettled: () => boolean } {
  const { started } = at;
  const control = started.control;
  // The Host stops a round itself (an interaction refused twice) before its next model call, then keeps why it did,
  // so the stop reads back with its reason live and after a restart; a failed save leaves only the live reason.
  let hostStop: string | undefined;
  let ready = false;
  let settled = false;
  let pendingTerminal: TerminalRunState | undefined;
  let unsubscribe: (() => void) | undefined;
  const stopForHost = (reason: string) => {
    if (hostStop || ["completed", "failed", "stopped", "cancelled"].includes(control.state)) return;
    hostStop = reason;
    at.onAborted();
    void at.surface.release("stopped").catch(() => undefined);
    control.stop("stopped");
    void deps.index.update(input.session_id, index => { Object.assign(index.attempts[at.attemptIndex]!, { stop_intent: "stopped", stop_reason: reason }); }).catch(() => undefined);
  };
  const settle = (type: TerminalRunState) => {
    if (settled) return;
    settled = true;
    queueMicrotask(() => { unsubscribe?.(); });
    if (at.actionReviews.releaseRun(started.run.ref.id) && deps.state.actionReviews.get(at.session.ref.id) === at.actionReviews) {
      deps.state.actionReviews.delete(at.session.ref.id);
    }
    void at.extensions?.close().catch(() => undefined);
    void at.codeIntelligence?.close().catch(() => undefined);
    at.work?.release();
    roundEnded(deps, at, type);
  };
  unsubscribe = started.run.subscribe(withInteractionRepairLimit(stopForHost, (event) => {
    if (event.type === "command-receipt") {
      const events = deps.state.commandEvents.get(started.run.ref.id) ?? [];
      if (!events.some(saved => sameRef(saved.receiptRef, event.receiptRef))) events.push(event);
      deps.state.commandEvents.set(started.run.ref.id, events);
    }
    if (isTerminalEventType(event.type)) {
      if (ready) settle(event.type);
      else pendingTerminal ??= event.type;
    }
  }));
  return {
    hostStop: () => hostStop,
    markReady: () => {
      ready = true;
      if (pendingTerminal) settle(pendingTerminal);
    },
    dispose: (type) => {
      ready = true;
      settle(pendingTerminal ?? type);
    },
    isSettled: () => settled,
  };
}

/** The run and its controls as the adapter sees them; stopping saves the person's intent before the SDK stops the run. */
function roundHandle(deps: RunDeps, input: PrologueStartInput, at: {
  readonly started: Started; readonly session: Session; readonly attemptIndex: number; readonly actionController: AbortController; readonly surface: SurfaceAttachment;
  readonly stopping: { current: Promise<void> | undefined }; readonly onAborted: () => void;
  readonly actionReviews: ReturnType<typeof roundGateway>["reviews"];
  readonly hostStop: () => string | undefined;
}): Awaited<ReturnType<PrologueRuntimePort["startAgentRun"]>> {
  const { started, actionController } = at;
  const control = started.control;
  return {
    memory: started.memory,
    run: {
      ref: { id: started.run.ref.id },
      subscribe: (listener: (event: PrologueEvent) => void) =>
        started.run.subscribe((event) => {
          if (event.type === "usage" || event.type === "usage-recorded") {
            const receipt: PrologueUsageReceipt = event.receipt;
            listener({ ...event, receipt });
          } else {
            listener(projectPeerNotice(deps.runtime, at.session.ref, event));
          }
        }),
      cancel: () => {
        at.onAborted();
        actionController.abort();
        void at.surface.release("stopped").catch(() => undefined);
        return started.run.cancel();
      },
    },
    control: {
      get state() {
        const state = control.state;
        if (state === "sleeping") return "paused";
        if (state === "reconcile-required" && at.actionReviews.hasReconciledResult
          && !deps.runtime.effects.openEffects().some(effect => effect.proposal.origin?.run === started.run.ref.id)) return "failed";
        return state;
      },
      get stopReason() { return at.hostStop(); },
      stop(reason) {
        if (["completed", "failed", "stopped", "cancelled"].includes(control.state)) return Promise.resolve();
        // Persist user intent before cancellation; the SDK still owns when
        // the run actually ends. Repeated clicks reuse the first request.
        return at.stopping.current ??= (async () => {
          await deps.index.update(input.session_id, index => { index.attempts[at.attemptIndex]!.stop_intent = reason; });
          // The accepted Run owns its terminal settlement after this control invocation returns.
          deps.effects.detach(() => { actionController.abort(); void at.surface.release("stopped").catch(() => undefined); control.stop(reason); });
        })().catch(error => { at.stopping.current = undefined; throw error; });
      },
      pause: () => control.pause(), resume: () => control.resume(),
      // The new model's key is exchanged first; the runtime refuses a target or frozen settings it cannot carry.
      beforeModelSwitch: deps.effects.beforeEffect,
      switchModel: async (target, beforeAccept) => {
        const credentialRef = await deps.credentials.prologueRefFor(target.credential_ref);
        await deps.effects.beforeEffect();
        return control.switchModel({ protocol: target.protocol, endpoint: target.endpoint, model: target.model, credentialRef }, { beforeAccept: () => { deps.effects.assertCurrent(); beforeAccept(); } });
      },
      steer: input => control.steer(input), withdrawSteer: steerId => control.withdrawSteer(steerId),
      subscribe(listener) {
        const controlSubscription = control.subscribe(listener), receiptSubscription = at.actionReviews.observeReconciliation(listener);
        return () => { controlSubscription(); receiptSubscription(); };
      },
    },
  };
}

/** Start one round: the stages above, in order. */
export async function startPrologueRun(deps: RunDeps, input: PrologueStartInput): ReturnType<PrologueRuntimePort["startAgentRun"]> {
  const mode: Mode = { none: input.workspace === "none", business: input.workspace === "business" };
  const index = await deps.index.read(input.session_id);
  assertWorkspace(input, index, deps.state, mode);
  const work = await bindWorkDelegation(deps.delegations, input, index.owner);
  let restore: (() => void) | undefined;
  if (work) {
    const original = input;
    const assertStart = () => { requireSynchronous(original.assertBeforeStart?.()); work.assertCurrent(); };
    const assertDispatch = () => { requireSynchronous(original.assertBeforeDispatch?.()); work.assertCurrent(); };
    input = { ...original, assertBeforeStart: assertStart, assertBeforeDispatch: assertDispatch, beforeStart: async () => {
      await original.beforeStart?.(); assertStart();
    } };
    restore = deps.effects.bindStart(input);
  }
  try { return await startBoundRound(deps, input, index, mode, work); }
  catch (error) { work?.release(); throw error; }
  finally { restore?.(); }
}

async function startBoundRound(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, mode: Mode, work?: PrologueWorkDelegation): ReturnType<PrologueRuntimePort["startAgentRun"]> {
  const { runtime, state } = deps;
  const ref = state.sessions.get(input.session_id);
  const stopping: { current: Promise<void> | undefined } = { current: undefined };
  let aborted = false;
  let accepted: Started | undefined;
  let lifecycle: ReturnType<typeof watchRoundLifecycle> | undefined;
  let actionController: AbortController | undefined;
  let actionReviews: ReturnType<typeof roundGateway>["reviews"] | undefined;
  let gatewayHookId: string | undefined;
  let extensions: PreparedRoundExtension | undefined;
  let surface: SurfaceAttachment | undefined;
  let unsubMcp: (() => void) | undefined;
  const onAborted = () => { aborted = true; };
  const appliedPolicies = new Map<string, () => void>();
  const exactPermissions = new Map<string, { ref: ExactRef<"effect">; control: ReviewDecisionControl }>();
  const activeExact = () => {
    for (const [id, { ref }] of exactPermissions) {
      const state = runtime.effects.get(ref)?.state;
      if (state !== "awaiting-approval" && state !== "authorized" && state !== "dispatching") exactPermissions.delete(id);
    }
    return exactPermissions.values();
  };
  try {
    const mcp = input.mcp_tools?.length || input.mcp_sources?.length ? roundMcp(runtime, deps.mcpLibrary, index.owner, input) : undefined;
    const gateway = roundGateway(deps, input, mode.none, () => stopping.current !== undefined || aborted, work, mcp, DEFAULT_ROUND_EXTENSIONS);
    actionController = gateway.actionController;
    actionReviews = gateway.reviews;
    gatewayHookId = gateway.hookId;
    extensions = gateway.extensions;
    const { actionTools, parameterBranches, toolOverrides, excludedHostTools, hasExtensionTools } = gateway;
    // Which languages this round can understand (A4), looked up while it starts: a directory listing and PATH, nothing started or fetched.
    const codeReadiness = extensions.codeIntelligenceReadiness?.();
    const assertDispatchCurrent = () => {
      if (stopping.current !== undefined || aborted) throw new Error("原轮次正在停止");
      for (const check of appliedPolicies.values()) check();
      for (const { control } of activeExact()) control.assertCurrent();
      requireSynchronous(input.assertBeforeDispatch?.(), "最终授权检查必须同步完成");
    };
    const prepareDispatch = async () => {
      assertDispatchCurrent();
      const original = await input.beforeDispatch?.();
      if (!mode.none && !mode.business) {
        await deps.mcpLibrary.validate(index.owner, input.mcp_tools ?? []);
        await deps.mcpLibrary.validateSources(index.owner, input.mcp_sources ?? []);
      }
      for (const { control } of activeExact()) await control.beforeEffect();
      return () => { requireSynchronous(original?.()); assertDispatchCurrent(); };
    };
    const dispatchGuard = { assertCurrent: assertDispatchCurrent, mcp: mcp?.dispatch, prepareDispatch,
      beforeEffect: async () => { const fence = await prepareDispatch(); fence(); } };
    const surfaceControl = { ...dispatchGuard,
      assertCurrent: () => { if (!accepted) requireSynchronous(input.assertBeforeStart?.(), "最终授权检查必须同步完成"); assertDispatchCurrent(); },
      beforeEffect: async () => { if (accepted) return dispatchGuard.beforeEffect(); await input.beforeStart?.(); surfaceControl.assertCurrent(); },
    };
    ensureStopGuard(runtime, state, input.session_id);
    const afterWrite = await roundChecks(deps, input, index, mode, actionTools?.pack.tools);
    const bindActions = !mode.none && (!!input.actions || !!input.action_gateway || state.actionToolSessions.has(input.session_id) || !!afterWrite || hasExtensionTools);
    // The gateway also declares, on its capability tools, the capabilities this round has found (prologue-gateway-declared.ts).
    const dynamicTools = bindActions ? packToDynamicTools(actionTools!.pack,
      { ...actionTools!.executors, ...(afterWrite ? { [AFTER_WRITE_EXECUTOR]: afterWrite } : {}) }, parameterBranches) : undefined;
    const session = ref === undefined ? undefined : await runtime.sessions.open(ref, dynamicTools ? { tools: dynamicTools } : undefined);
    if (bindActions && session) state.actionToolSessions.add(input.session_id);
    if (session === undefined) throw new Error("agent.session_unknown");
    const root = mode.none || mode.business ? undefined : await runtime.workspace.authorize({ path: input.root_path! });
    const resolveHostTool = (tool: string) => toolOverrides.get(tool) ?? prologueToolName(tool);
    const methods = inlineMethods(runtime, state.registeredMethods, input.skills ?? [],
      hostSystemTools(input).filter(tool => !excludedHostTools.has(tool) || toolOverrides.has(tool)), resolveHostTool);
    const textResources: Array<{ ref: ExactRef<"resource">; as: "original" }> = [];
    for (const material of input.text_materials ?? []) textResources.push({ ref: await stageTextResource(runtime, agentTextMaterialContent(material), "agent-material"), as: "original" });
    const { childRoots, childRoles, childInstructions } = await childSetup(deps, input, actionTools?.names ?? [], work);
    const plan = input.provenance.frozen.execution_plan;
    const materials = await roundMaterials(deps, input, index, session, mode.none, plan, textResources);
    surface = await roundSurface(deps, input, index, session, mode.business, surfaceControl);
    const binding = await roundBinding(deps, input, index, session, materials.stepBoard);
    const { character, runTools, pinnedMemory } = await roundCharacter(deps, input, index, { mode, methods, childInstructions, childRoles, surface, stepBoard: materials.stepBoard, actionTools,
      toolOverrides, excludedHostTools });
    const referenceKinds = await roundReferenceKinds(deps.options, index.owner);
    // Exchange our reference for one Prologue can resolve, before the Run is started rather than when it first calls out.
    const credentialRef = await deps.credentials.prologueRefFor(input.model.credential_ref);
    const { attemptIndex, abandon } = await recordAttempt(deps, input, { ...input.provenance, task: input.task, ...(root ? { root_ref: root.ref } : {}),
      ...(input.model_selection ? { model_selection: structuredClone(input.model_selection) } : {}),
      frozen_model: structuredClone(input.model),
      ...(actionTools?.names.length ? { action_tool_scope: actionTools.scope } : {}),
      ...(materials.stepBoard ? { step_board: materials.stepBoard.ref, step_prefix: materials.stepBoard.prefix } : {}), ...(childRoles.size ? { subagent_roles: [...childRoles], subagent_roots: childRoots } : {}),
      ...(surface.desktop_target ? { desktop_target: surface.desktop_target } : {}) });
    // The stop check follows this round; its ending review, when the round's owner gave one, runs with the owner's
    // instructions on the round's own model, behind the same pre-dispatch check.
    const reviewCache = input.model.prompt_cache === undefined || input.model.prompt_cache === "off" ? {} : { promptCache: input.model.prompt_cache };
    guardRound(state, input, mode.business, input.ending_review ? { instructions: input.ending_review.prompt, protocol: input.model.protocol, endpoint: input.model.endpoint,
      model: input.model.model, credentialRef, ...reviewCache, dispatch: operation => deps.dispatchGuards.run(dispatchGuard, operation) } : undefined, actionController.signal);
    // A new Run owns its dispatch scope. A callback from a completed Run may have asked for this start.
    const started = await deps.memoryAuthority.forAttempt(input.session_id, attemptIndex, () =>
      deps.dispatchGuards.run(dispatchGuard, () => runtime.startAgentRun(sdkStart(deps, input, index, {
        attemptIndex, session, root, business: mode.business, credentialRef, childRoles, childRoots, runTools, character, work, textResources: materials.textResources, pinnedMemory, binding, referenceKinds,
      }))), input.disposeDispatch).catch(async (error: unknown) => {
      onAborted(); actionController?.abort();
      // Not accepted by the SDK: refused while the context was still being packed (the runtime creates the run only after
      // that) is a settled refusal; anything else, or a caller no longer current, takes the intent back.
      if (!deps.effects.accepted()) {
        const code = (error as { code?: string }).code;
        let current = true;
        try { requireSynchronous(input.assertBeforeStart?.(), "最终授权检查必须同步完成"); } catch { current = false; }
        if (!current || !code || !REFUSED_BEFORE_RUN.has(code)) await abandon();
        else await deps.index.update(input.session_id, saved => { saved.attempts[attemptIndex]!.refused = { code, at: new Date().toISOString() }; }).catch(() => undefined);
        // The continuation the SDK claimed for this start: its own give-back is refused with the rest once the caller is not current.
        const requestKey = binding?.requestKey;
        if (requestKey) await deps.effects.detach(() => releaseStartClaim(runtime, { ...binding!, requestKey })).catch(() => undefined);
      }
      if ((error as { code?: string }).code === "SESSION_HISTORY_UNAVAILABLE") throw agentErrors.capability_unavailable("旧会话开场无法可靠核验，不能继续携带历史，没有发给模型。原记录仍可查看，请新建会话并补充必要背景。");
      throw error;
    });
    accepted = started;
    work?.accept(started.run);
    lifecycle = watchRoundLifecycle(deps, input, { started, session, projectDirectory: materials.projectDirectory, attemptIndex, actionController, surface, stepBoard: materials.stepBoard, onAborted, actionReviews, work, extensions });
    if (mcp) {
      let mcpDone = false;
      unsubMcp = started.run.subscribe(event => {
        if (event.type === "tool-result") mcp.release((event as Extract<PrologueEvent, { type: "tool-result" }>).callId);
        if (isTerminalEventType(event.type) && !mcpDone) {
          mcpDone = true;
          queueMicrotask(() => { unsubMcp?.(); });
        }
      });
    }
    watchRoundFacts(state, started.run, true);
    // Every child this round dispatches is let out only after the round's own check passes again (the Runtime asks).
    state.dispatchChecks.set(started.run.ref.id, prepareDispatch);
    if (mode.business && childRoles.size) state.childAdmissions.set(started.run.ref.id, async request => {
      const role = request.character && childRoles.get(exactCharacterKey(request.character));
      if (!role || !input.subagentGateway) throw agentErrors.role_not_declared("没有可用的业务子角色授权");
      const ref = { kind: "session", id: request.childSessionId, revision: 1 } as const;
      const gateway = await input.subagentGateway(role, { runtime_id: "prologue", session_id: ref.id });
      await bindBusinessSubagent(deps, ref, role, gateway, request.tools, {
        assertCurrent: assertDispatchCurrent, stopping: () => stopping.current !== undefined || aborted, work,
      });
    });

    await attachStartedRound(deps, input, index, { started, session, root, attemptIndex, actionController, surface, appliedPolicies, exactPermissions, work, mcp,
      hasActions: Boolean(actionTools?.names.length), projectDirectory: materials.projectDirectory,
      project: materials.project, scopePaths: materials.scopePaths, plan, stepBoard: materials.stepBoard, stopping: () => stopping.current !== undefined || aborted });
    lifecycle.markReady();
    // Recorded once with the round, and reported only when the owner update succeeded: the files the SDK actually packed, and which languages it can understand (A4).
    const freeze = async <K extends "instructions" | "code_intelligence">(key: K, value: AgentFrozenStart[K] | undefined) => value
      && await deps.index.update(input.session_id, saved => { saved.attempts[attemptIndex]!.frozen[key] = structuredClone(value); }).then(() => value, () => undefined);
    const instructions = await freeze("instructions", roundInstructions(input, started.pack)), code_intelligence = await freeze("code_intelligence", await codeReadiness);
    work?.assertCurrent();
    const desktopTargets = [...new Set([...index.attempts.flatMap(item => item.desktop_target ? [item.desktop_target] : []),
      ...(surface.desktop_target ? [surface.desktop_target] : [])])];
    return { ...roundHandle(deps, input, { started, session, attemptIndex, actionController, surface, stopping, onAborted, actionReviews, hostStop: lifecycle.hostStop }),
      ...(surface.desktop_target ? { desktop_target: surface.desktop_target } : {}),
      ...(desktopTargets.length ? { desktop_targets: desktopTargets } : {}), ...(instructions ? { instructions } : {}), ...(code_intelligence ? { code_intelligence } : {}) };
  } catch (error) {
    onAborted();
    actionController?.abort();
    const failures: unknown[] = [error];
    let lifecycleDisposed = false;
    let cancelFailed = false;
    if (accepted) {
      accepted.control.stop("cancelled");
      try {
        await accepted.run.cancel();
        if (lifecycle) {
          lifecycle.dispose("cancelled");
          lifecycleDisposed = true;
        }
      } catch (failure) {
        cancelFailed = true;
        lifecycle?.markReady();
        failures.push(failure);
      }
    }
    if (!accepted || lifecycleDisposed) unsubMcp?.();
    const lifecycleOwnsCleanup = lifecycleDisposed || (lifecycle !== undefined && (cancelFailed || lifecycle.isSettled()));
    if (!lifecycleOwnsCleanup) {
      if (actionReviews && state.actionReviews.get(input.session_id) === actionReviews) state.actionReviews.delete(input.session_id);
      if (!accepted && gatewayHookId) {
        runtime.hooks.unregister(gatewayHookId);
        state.gatewayHooks.delete(input.session_id);
      }
      if (surface) {
        try { await surface.release("failed"); } catch (failure) { failures.push(failure); }
      }
      if (extensions) {
        try { await extensions.close(); } catch (failure) { failures.push(failure); }
      }
    }
    if (failures.length > 1) throw new AggregateError(failures, "启动失败，原执行或界面仍需收口");
    throw error;
  }
}
