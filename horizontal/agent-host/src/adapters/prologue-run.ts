import { runMemoryContext } from "./prologue-memory-usage.js";
import { recordOriginalInput } from "./prologue-original-inputs.js";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ExactRef, PackTool, Runtime } from "@prologue/sdk";
import { BUSINESS_HOST_TOOLS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { requireSynchronous, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentTextMaterialContent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import { gatewayProblem, prologueActionGateway } from "./prologue-action-gateway.js";
import { prologueActionTools, SUGGEST_HOST_TOOL } from "./prologue-action-tools.js";
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
import { runModelParams } from "./prologue-run-params.js";
import { blockId, canTakeUp, collaborates, eligibleContinuation, planPrefix, readyStep, releaseStartClaim, sessionBlock } from "./prologue-collaboration.js";
import type { PlanPlace } from "./prologue-plan-steps.js";
import { exactCharacterKey, verifySubagentStart, type PrologueSubagentRoot } from "./prologue-subagents.js";
import { DESKTOP_GUIDANCE, SURFACE_GUIDANCE, type PrologueSurfaces, type SurfaceAttachment } from "./prologue-surfaces.js";
import { placeOf, type createPrologueTaskBoards } from "./prologue-taskboard.js";
import type { createPrologueWaits } from "./prologue-waits.js";
import type { PrologueEvent, PrologueUsageReceipt } from "./prologue-stream.js";
import type { PrologueRuntimePort, PrologueStartInput } from "./prologue.js";
import { prologueToolName, sameRef, stageInstructions, stageTextResource, type DispatchGuards, type PrologueNodeAdapterOptions, type RoundState } from "./prologue-node-kit.js";
import type { SessionIndex, SessionIndexStore } from "./prologue-session-index.js";
import { ensureStopGuard, guardRound, watchRoundFacts } from "./prologue-stop-guard.js";

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
  readonly options: PrologueNodeAdapterOptions;
  readonly state: RoundState;
  readonly index: SessionIndexStore;
  readonly dispatchGuards: DispatchGuards;
  readonly surfaces: () => PrologueSurfaces | undefined;
  readonly mcpLibrary: ReturnType<typeof createPrologueMcpLibrary>;
  readonly memoryAuthority: Pick<ReturnType<typeof import("./prologue-memory-authority.js").createPrologueMemoryAuthority>, "forAttempt">;
  readonly platformMemory: ReturnType<typeof createPrologueMemory>;
  readonly credentials: PrologueCredentialBridge;
  readonly stepBoards: ReturnType<typeof createPrologueTaskBoards>;
  readonly projectWork: ReturnType<typeof createProjectWork>;
  readonly workGraphs: ReturnType<typeof createWorkGraphs>;
  readonly messages: ReturnType<typeof createSessionMessages>;
  readonly waitsPort: ReturnType<typeof createPrologueWaits>;
  readonly checkpoints: ReturnType<typeof createPrologueCheckpoints> | undefined;
  readonly approvals: PrologueApprovalBridge | undefined;
}

type Started = Awaited<ReturnType<Runtime["startAgentRun"]>>;
type Session = NonNullable<Awaited<ReturnType<Runtime["sessions"]["open"]>>>;
type ChildRole = NonNullable<PrologueStartInput["subagents"]>[number];
type Memory = RoundState["memoryRounds"] extends Map<string, infer M> ? M : never;
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
    || input.subagents?.length || input.subagent_workspaces?.length || input.provenance.frozen.execution_plan
    || input.character.tools.some(tool => !(BUSINESS_HOST_TOOLS as readonly string[]).includes(tool)))) throw new Error("业务会话只能使用宿主冻结的动作与不碰目录的工具");
  if (!none && !business && !input.root_path) throw new Error("执行缺少已授权工作区");
}

/** The round's Prologue system tools. Suggesting is the round's own action pack tool (prologue-action-tools.ts), not one of them. */
const systemTools = (input: PrologueStartInput) => input.character.tools.filter(tool => tool !== SUGGEST_HOST_TOOL).map(prologueToolName);

/**
 * The round's actions: the business gateway's three tools, or one tool per frozen action. What the round really keeps,
 * forgets and changes is counted for the stop check; a call to a capability that is gone is refused before review.
 */
function roundGateway(deps: RunDeps, input: PrologueStartInput, none: boolean) {
  const { state, runtime } = deps;
  const actionController = new AbortController();
  // A business round the person gave no memory (switched off) keeps nothing, so any claim of keeping is held too.
  const memory = input.action_gateway?.client.memory;
  const memoryDone: Memory = { keep: 0, forget: 0, off: !memory, without: { keep: !!memory && !memory.remember, forget: !!memory && !memory.forget } };
  if (input.action_gateway) state.memoryRounds.set(input.session_id, memoryDone); else state.memoryRounds.delete(input.session_id);
  const client = input.action_gateway?.client;
  const changesDone = client ? { client, invoked: [] as ExactActionReference[] } : undefined;
  if (changesDone) state.changeRounds.set(input.session_id, changesDone); else state.changeRounds.delete(input.session_id);
  const gatewayForRun = input.action_gateway && client ? { ...input.action_gateway, client: { ...client,
    invoke: async (...args: Parameters<typeof client.invoke>) => { const [reference] = args; const result = await client.invoke(...args); changesDone!.invoked.push(reference); return result; },
    ...(memory ? { memory: {
      ...(memory.remember ? { remember: async (...args: Parameters<NonNullable<typeof memory.remember>>) => { const kept = await memory.remember!(...args); memoryDone.keep += 1; return kept; } } : {}),
      ...(memory.list ? { list: memory.list.bind(memory) } : {}),
      ...(memory.forget ? { forget: async (...args: Parameters<NonNullable<typeof memory.forget>>) => { const result = await memory.forget!(...args); if (result.forgotten) memoryDone.forget += 1; return result; } } : {}),
      ...(memory.propose ? { propose: memory.propose.bind(memory) } : {}),
    } } : {}),
  } } : input.action_gateway;
  const gatewayTools = none || !gatewayForRun ? undefined : prologueActionGateway(gatewayForRun, Math.min(60_000, runtime.tools.limits.maxTimeoutMs), actionController.signal);
  const actionTools = none ? undefined : gatewayTools ? { ...gatewayTools, scope: "gateway" }
    : prologueActionTools(input.actions, Math.min(60_000, runtime.tools.limits.maxTimeoutMs), actionController.signal, input.character.tools.includes(SUGGEST_HOST_TOOL));
  if (input.action_gateway) {
    state.gatewayRuns.set(input.session_id, { ...input.action_gateway, declare: gatewayTools?.declare });
    if (gatewayTools) { state.gatewayKnown.set(input.session_id, gatewayTools.known); state.gatewayOffered.set(input.session_id, gatewayTools.offered); }
    // Refused before any review: a call to a capability that is gone, switched off or asked through the wrong tool.
    if (!state.gatewayHooks.has(input.session_id)) {
      state.gatewayHooks.add(input.session_id);
      const sessionId = input.session_id;
      runtime.hooks.register({ id: `molis-action-gateway-${sessionId}`, event: "tool-before", forSession: sessionId, handler: async context => {
        const gateway = state.gatewayRuns.get(sessionId);
        if (!gateway || !context.toolName) return { kind: "allow" as const };
        const problem = await gatewayProblem(gateway, context.toolName, context.input, state.gatewayKnown.get(sessionId), state.gatewayOffered.get(sessionId));
        return problem ? { kind: "deny" as const, why: problem } : { kind: "allow" as const };
      } });
    }
  }
  return { actionController, actionTools, parameterBranches: gatewayTools?.parameterBranches };
}

/**
 * A Coding round's after-write check (specs/prologue-adoption §6.0p.3): given when the round's pack declares the check and
 * the round works in a directory whose workspace has the person's checkers now. Without it the pack may still declare the
 * check, and nothing is asked.
 */
async function roundChecks(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, mode: Mode, attempt: { run_id?: string }, tools: readonly PackTool[] | undefined) {
  const workspaceAt = deps.options.checks?.workspaceAt, projectId = index.owner.project_id, store = createPrologueWriteCheckers(deps.runtime);
  const declared = tools?.some(tool => tool.afterWriteCheck === true) === true;
  const workspace = !declared || mode.none || mode.business || !input.root_path || !workspaceAt ? undefined : await workspaceAt(projectId, input.root_path);
  if (!workspace || !(await store.read(projectId, workspace)).checkers.length) return undefined;
  return afterWriteExecutor({ projectId, rootPath: input.root_path!, workspaceAt: workspaceAt!, store, ...(input.beforeDispatch ? { beforeDispatch: input.beforeDispatch } : {}),
    // A round stopped while the index was being read keeps nothing either: the check is in the change itself, just before the write.
    note: (key, note, signal) => deps.index.update(input.session_id, saved => { signal?.throwIfAborted(); const held = attempt.run_id && saved.attempts.find(item => item.run_id === attempt.run_id); if (held) (held.write_checks ??= {})[key] = note; }) });
}

/** What a parent that hands its children their own directories may hold: reading, dispatching, asking the person, the board,
 * the project's sessions and saying how it handles a supplement (receipts 3e-0b); no tool that writes or runs anything. */
const WORKSPACE_PARENT_TOOLS: readonly string[] = ["read-file", "list", "search", "context-remaining", "dispatch-subagent", "await-subagents", "steer-subagent", "ask-user", "acknowledge-inputs", "board-read", "board-report", "session-send"];

/** The round's child directories and fixed child roles, each a published Character, and what the round is told of them. */
async function childSetup(deps: RunDeps, input: PrologueStartInput) {
  const { runtime } = deps;
  const childRoots: PrologueSubagentRoot[] = [];
  if (input.subagent_workspaces?.length && input.character.tools.some(tool => !WORKSPACE_PARENT_TOOLS.includes(tool))) throw agentErrors.role_execution_exceeded("独立目录协调者只能读取和分派，不能持有其他执行工具");
  for (const grant of input.subagent_workspaces ?? []) {
    const overlaps = (a: string, b: string) => { const relative = path.relative(a, b); return !relative || !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative); };
    if ([input.root_path!, ...childRoots.map(root => root.path)].some(other => overlaps(other, grant.directory.canonical_path) || overlaps(grant.directory.canonical_path, other))) throw new Error("子任务目录必须与主目录及其他子目录互不包含");
    const authorized = await runtime.workspace.authorize({ path: grant.directory.canonical_path });
    childRoots.push({ id: grant.workspace_id, rootRef: authorized.ref, path: grant.directory.canonical_path });
  }
  const childRoles = new Map<string, ChildRole>();
  for (const role of input.subagents ?? []) {
    const allowed = ["read-file", "list", "search", "context-remaining", ...(childRoots.length && role.execution !== "read-only" ? ["write", "edit-file"] : []), ...(role.execution === "workspace-write" ? ["run-command"] : []),
      // A child may read and wait on its parent's background commands when the parent waits on them itself.
      ...(input.character.tools.includes("await-commands") ? ["command-output", "await-commands"] : [])];
    if (!childRoots.length && role.execution === "text-edit" || role.host_tools.some(tool => !allowed.includes(tool) || !childRoots.length && !input.character.tools.includes(tool))) throw new Error("子角色超出本轮允许的工具与目录");
    const ref = await stageInstructions(runtime, role.prompts.map(prompt => prompt.body).join("\n\n"));
    const draft = runtime.characters.create({ id: `molis-child-${randomUUID()}`, version: role.version, name: role.name, role: role.role_id,
      ...(ref ? { instructionsRef: ref } : {}), tools: role.host_tools.map(prologueToolName) });
    const published = runtime.characters.publish(draft.ref);
    childRoles.set(exactCharacterKey(published.ref), role);
  }
  const childScope = childRoots.length
    ? "每个子任务必须选择一个不同的 workspace 标识：" + JSON.stringify(childRoots.map(root => ({ id: root.id, path: root.path }))) + "。主任务只读，不能直接修改主工作区。子任务只在自己的目录里执行，修改仍经过宿主审查。"
      + "核对子任务成果时，可以给 read、list、search 加 workspace 参数（上面的标识）只读查看对应目录；不加就是主工作区。你的查看不代替子任务自己的先读后改，也不能在这些目录里写入或运行命令。"
    : "本轮没有分配独立子目录，不得填写 workspace 参数；所有子任务沿用当前授权目录，都不能修改文件；开放了运行命令的子角色可以运行检查命令，每条都经用户审查。";
  // Facts only: a named role brings the tools it declares, whatever `tools` says; runTools below always holds them all.
  const childInstructions = childRoles.size ? childScope + "可分派的固定子角色（character 用这里的引用，别的会被拒绝）：\n" + [...childRoles].map(([ref, role]) => `${ref}: ${role.name}; tools=${JSON.stringify(role.host_tools.map(prologueToolName))}`).join("\n") + "\n给子任务写清任务、必要上下文、依据路径与完成条件；不继承父聊天或材料。子任务不能再次分派。需要用户信息时作为阻塞返回给父任务。" : "";
  return { childRoots, childRoles, childInstructions };
}

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
  const digest = stepBoard ? stepBoards.digest(stepBoard, session.ref.id) : earlier ? stepBoards.standing(earlier, session.ref.id) : "";
  if (digest) textResources.push({ ref: await stageTextResource(runtime, digest, "coding-board-digest"), as: "original" });
  // What other sessions in the project are doing, and where it overlaps this round, as the round starts.
  const project = index.owner.project_id, workText = `${input.task}\n${(plan?.steps ?? []).map(step => `${step.title}\n${step.acceptance}`).join("\n")}`;
  const scopePaths = none ? [] : workPaths(workText);
  if (!none && input.root_path && !index.parent_run) {
    try {
      const seen = await projectWork.read(project, { session_id: session.ref.id, directory: input.root_path, paths: scopePaths });
      const note = projectWorkDigest(await projectWork.projectId(project), seen.items, session.ref.id, seen.overlaps, input.character.tools.includes("session-send"));
      if (note) textResources.push({ ref: await stageTextResource(runtime, note, "coding-project-work"), as: "original" });
    } catch { /* the project's list is a courtesy to the round; a failed read leaves it out rather than stopping the round */ }
    // Messages other sessions left for this one while it was not running.
    const inbox = await messages.inbox(session.ref.id, project).catch(() => "");
    if (inbox) textResources.push({ ref: await stageTextResource(runtime, inbox, "coding-session-inbox"), as: "original" });
    // Steps other sessions handed to this one and not yet done: where they are, so this round can go on with them.
    const board = await projectBoardOf(deps, index).catch(() => undefined);
    const handed = board ? handedSteps(runtime, board, session.ref, `s-${session.ref.id}`) : [];
    if (handed.length) textResources.push({ ref: await stageTextResource(runtime, ["别的会话交给你、还没做完的步骤（项目任务图上现在归你）：",
      ...handed.map(node => `- 任务图 ${board!.id}：${node.id}「${node.title.slice(0, 60)}」（${node.state}）`),
      "用 board-read / board-report（board 写上面的任务图编号）处理这些步骤；做完后在交接信上答复对方。"].join("\n"), "coding-handed-steps"), as: "original" });
  }
  return { textResources, stepBoard, project, scopePaths };
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
async function roundSurface(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, session: Session, business: boolean): Promise<SurfaceAttachment> {
  const surfaceHost = deps.surfaces();
  if (!(business && surfaceHost && input.browser !== false)) return { tools: [] as readonly string[], note: null, surfaces: [] as readonly ("browser" | "desktop")[] };
  return surfaceHost.attach(session, index.owner.project_id, input.session_id, { readOnly: input.provenance.frozen.execution === "read-only",
    live: sessionRefId => [...deps.state.activeRuns.entries()].some(([runId, run]) => run.live() && deps.state.runSessions.get(runId) === sessionRefId), goal: input.task, projectId: index.owner.project_id })
    .catch((error: unknown) => ({ tools: [] as readonly string[], note: `界面控制这一轮不可用：${error instanceof Error ? error.message : String(error)}` as string | null, surfaces: [] as readonly ("browser" | "desktop")[] }));
}

/** The round's Character: its instructions (role, methods, guidance, plan, recovery), its tools, and the memories chosen for it. */
async function roundCharacter(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, parts: {
  readonly mode: Mode; readonly methods: readonly string[]; readonly childInstructions: string; readonly childRoles: Map<string, ChildRole>;
  readonly surface: Awaited<ReturnType<typeof roundSurface>>; readonly stepBoard: Awaited<ReturnType<typeof roundMaterials>>["stepBoard"];
  readonly actionTools: ReturnType<typeof roundGateway>["actionTools"];
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
  const tools = [...systemTools(input), ...mcpTools, ...(parts.actionTools?.names ?? []), ...surface.tools];
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
  const intent = structuredClone({ ...attempt, ...runMemoryContext(input.memory) });
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
function watchChild(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, children: { readonly roles: Map<string, ChildRole>; readonly roots: PrologueSubagentRoot[]; readonly root: { ref: ExactRef<"authorized-root"> } | undefined }) {
  const { runtime, state } = deps;
  return async (observed: Parameters<NonNullable<NonNullable<Parameters<Runtime["startAgentRun"]>[0]["subagents"]>["onStarted"]>>[0]) => {
    verifySubagentStart(runtime, children.roles, children.roots)(observed);
    const registered = runtime.subagents.list().find(child => child.run.id === observed.run.ref.id && child.session.id === observed.childSession.ref.id)!;
    const role = children.roles.get(exactCharacterKey(registered.character!))!;
    // Every child's run hears what its neighbours on the task graph send it (letters are handed over by the Host).
    state.activeRuns.set(observed.run.ref.id, { live: () => ["prepared", "running"].includes(observed.run.state), steer: async text => { await observed.control.steer({ text, source: "app" }); } });
    state.liveSessions.set(observed.childSession.ref.id, observed.run.ref.id);
    observed.run.subscribe(event => { if (["completed", "failed", "cancelled"].includes(event.type) && state.liveSessions.get(observed.childSession.ref.id) === observed.run.ref.id) state.liveSessions.delete(observed.childSession.ref.id); });
    // A child with operations to review is tracked by the Host: one in its own directory, or one in the main
    // workspace that may run commands. A read-only child in the main workspace has nothing to review.
    // Without its own directory or a main workspace (workspace:none) there is nothing the Host could review.
    if (!children.roots.length && (role.execution !== "workspace-write" || !children.root || !input.root_path)) return;
    const granted = children.roots.length ? children.roots.find(root => root.id === observed.workspace!.id)! : { rootRef: children.root!.ref, path: input.root_path! };
    const childRun = { session_id: observed.childSession.ref.id, run_id: observed.run.ref.id };
    await deps.index.save({ schema: 1, ref: observed.childSession.ref, title: role.name, owner: index.owner,
      parent_run: { session_id: observed.parentSession.id, run_id: observed.parentRun.id },
      attempts: [{ started_at: new Date().toISOString(), task: "", run_id: childRun.run_id, root_ref: granted.rootRef,
        frozen: { ...input.provenance.frozen, role_id: role.role_id, role_version: role.version, execution: role.execution,
          subagent_workspaces: undefined, character: undefined, compaction: undefined, execution_plan: undefined, workspace: "required", directory: { canonical_path: granted.path, realpath_verified: true },
          host_tools: [...role.host_tools], text_materials: [], skills: [], mcp_tools: [], mcp_sources: [], budget: null,
          prompts: role.prompts.map(prompt => ({ prompt_id: prompt.prompt_id, version: prompt.version, layer: prompt.layer ?? "role" })) } }] });
    state.runRoots.set(childRun.run_id, granted.rootRef);
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
    observed.run.subscribe(event => {
      if (event.type === "command-receipt") {
        const events = state.commandEvents.get(childRun.run_id) ?? [];
        if (!events.some(saved => sameRef(saved.receiptRef, event.receiptRef))) events.push(event);
        state.commandEvents.set(childRun.run_id, events);
      }
      if (event.type === "prompt" && event.role === "user") void deps.index.update(childRun.session_id, saved => {
        if (!saved.attempts[0]!.task) saved.attempts[0]!.task = event.text;
      }).catch(bridgeFailed);
      if (event.type === "awaiting-approval") void deps.approvals!.mirrorPending({ pendingRef: event.pendingRef, owner: index.owner, run: childRun })
        .catch(bridgeFailed);
    });
  };
}

/** What the SDK is asked to start: the session, workspace, history, children, context, compaction, model and agent. */
function sdkStart(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, parts: {
  readonly session: Session; readonly root: { ref: ExactRef<"authorized-root"> } | undefined; readonly business: boolean; readonly credentialRef: ExactRef<"credential">;
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
    ...(input.history === "digest" ? {} : { history: "session" as const }),
    // Supplements kept in the session for the next round come in only when the Host says so (specs/ai-input-receipts §4.4).
    ...(input.queued ? { queued: input.queued } : {}),
    ...(childRoles.size ? { subagents: {
      // The user's decision: a parent that split work across directories may read (never write) exactly those.
      ...(childRoots.length ? { workspaces: childRoots.map(({ id, rootRef }) => ({ id, rootRef })), requireWorkspace: true, parentReads: true } : {}),
      onStarted: watchChild(deps, input, index, { roles: childRoles, roots: childRoots, root }),
    } } : {}),
    // Packed against the model's own window when it states a smaller one than the runtime default.
    ...(input.compaction || input.provenance.frozen.model_context ? { context: {
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
      ...(input.memory ? { memory: { consumer: input.memory.consumer, currentScene: input.memory.current_scene,
        ...(input.memory.facts ? { facts: { ...(input.memory.facts.plugins ? { plugins: input.memory.facts.plugins } : {}),
          ...(input.memory.facts.object_kinds ? { objectKinds: input.memory.facts.object_kinds } : {}),
          ...(input.memory.facts.goals ? { goals: input.memory.facts.goals } : {}) } } : {}),
        scopes: input.memory.scopes, resident: parts.pinnedMemory, task: input.memory.task, skip: input.memory.skip,
        budgetChars: input.memory.budget_chars, budgetTokens: input.memory.budget_tokens } } : {}),
      // This round's project's kinds replace the Runtime's built-in ones; its subagents keep them (BL-152).
      ...(parts.referenceKinds ? { askUserReferenceKinds: parts.referenceKinds } : {}),
    },
  };
}

/** After the SDK started the run: its root, its id in the index, its controls, and in a main round its project work. */
async function afterStart(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, at: {
  readonly started: Started; readonly session: Session; readonly root: { ref: ExactRef<"authorized-root"> } | undefined; readonly attemptIndex: number;
  readonly actionController: AbortController; readonly hasActions: boolean; readonly none: boolean; readonly project: string; readonly scopePaths: string[];
  readonly plan: PrologueStartInput["provenance"]["frozen"]["execution_plan"]; readonly stepBoard: Awaited<ReturnType<typeof roundMaterials>>["stepBoard"]; readonly stopping: () => boolean;
}): Promise<void> {
  const { state } = deps;
  const { started, session } = at;
  const surfaceHost = deps.surfaces();
  if (at.root) state.runRoots.set(started.run.ref.id, at.root.ref);
  try { await deps.index.update(input.session_id, saved => { saved.attempts[at.attemptIndex]!.run_id = started.run.ref.id; }); }
  catch (error) { at.actionController.abort(); started.control.stop("cancelled"); throw error; }
  if (at.hasActions) state.actionControllers.set(started.run.ref.id, at.actionController);
  // A round is live until it ends: before its first model event it is still "prepared", and it hears a steer then too.
  state.runSessions.set(started.run.ref.id, session.ref.id); state.runRefs.set(started.run.ref.id, started.run.ref); if (surfaceHost) surfaceHost.noteRun(session.ref.id, started.run.ref.id);
  state.activeRuns.set(started.run.ref.id, { live: () => ["prepared", "running"].includes(started.run.state) && !at.stopping(),
    steer: async text => { await started.control.steer({ text, source: "app" }); } });
  if (at.stepBoard) deps.stepBoards.follow(at.stepBoard, { session_id: session.ref.id, run_id: started.run.ref.id });
  // A main round is work under way in its project until it ends; a subtask's work is its parent's.
  if (!at.none && input.root_path && !index.parent_run) {
    try {
      const workId = await deps.projectWork.begin(at.project, { session: session.ref, run_id: started.run.ref.id, title: input.session_title ?? index.title, task: input.task,
        directory: input.root_path, paths: at.scopePaths, ...(input.queued_work_id ? { queued: input.queued_work_id } : {}) });
      if (workId === input.queued_work_id) await deps.waitsPort.queueTakenOver(session.ref.id, { board: await deps.projectWork.projectId(at.project), node: blockId(session.ref) });
      state.runWork.set(started.run.ref.id, { project: at.project, id: workId, session: session.ref, directory: input.root_path });
      state.liveSessions.set(session.ref.id, started.run.ref.id);
    } catch { /* not listed as project work; the round itself is unaffected */ }
  }
}

/** When the round ends: its actions and step board let go, the page released, its project work ended and its messages settled. */
function roundEnded(deps: RunDeps, started: Started, session: Session, stepBoard: { ref: { id: string } } | undefined, type: "completed" | "failed" | "cancelled", actionController: AbortController): void {
  const { state } = deps;
  const surfaceHost = deps.surfaces();
  actionController.abort(); state.actionControllers.delete(started.run.ref.id); state.dispatchChecks.delete(started.run.ref.id);
  if (stepBoard) deps.stepBoards.unfollow(started.run.ref.id);
  deps.workGraphs.ended(started.run.ref, session.ref, type);
  if (state.liveSessions.get(session.ref.id) === started.run.ref.id) state.liveSessions.delete(session.ref.id);
  // The side panel stops saying the Assistant is using the page the moment its round is over, and this run's app approvals are dropped.
  if (surfaceHost) { void surfaceHost.release(session.ref.id, type === "cancelled" ? "stopped" : type).catch(() => undefined); surfaceHost.releaseRun(started.run.ref); } state.runRefs.delete(started.run.ref.id);
  const work = state.runWork.get(started.run.ref.id);
  if (work) { state.runWork.delete(started.run.ref.id); void deps.projectWork.end(work.project, work.id, type === "cancelled" ? "stopped" : type).catch(() => undefined); }
  // A round that finished normally saw every message given to it; unanswered requests are settled.
  if (work && type === "completed") void deps.messages.settle(session.ref.id).catch(() => undefined);
  // One that failed will not answer the requests someone waits on; they are ended so the waiting session wakes.
  if (work && type === "failed") void deps.messages.failed(session.ref.id).catch(() => undefined);
}

/** The run and its controls as the adapter sees them; stopping saves the person's intent before the SDK stops the run. */
function roundHandle(deps: RunDeps, input: PrologueStartInput, at: {
  readonly started: Started; readonly session: Session; readonly attemptIndex: number; readonly actionController: AbortController;
  readonly stepBoard: { ref: { id: string } } | undefined; readonly stopping: { current: Promise<void> | undefined };
}): Awaited<ReturnType<PrologueRuntimePort["startAgentRun"]>> {
  const { started, actionController } = at;
  const control = started.control;
  // The Host stops a round itself (an interaction refused twice) before its next model call, then keeps why it did,
  // so the stop reads back with its reason live and after a restart; a failed save leaves only the live reason.
  let hostStop: string | undefined;
  const stopForHost = (reason: string) => {
    if (hostStop || ["completed", "failed", "stopped", "cancelled"].includes(control.state)) return;
    hostStop = reason; control.stop("stopped");
    void deps.index.update(input.session_id, index => { Object.assign(index.attempts[at.attemptIndex]!, { stop_intent: "stopped", stop_reason: reason }); }).catch(() => undefined);
  };
  return {
    memory: {
      expand: (references, signal) => deps.memoryAuthority.forAttempt(input.session_id, at.attemptIndex, async () => {
        await input.beforeDispatch?.();
        signal?.throwIfAborted();
        const receipt = await started.memory.expand({ references: references.map(({ memory_id, ...reference }) => ({ ...reference,
          ref: { kind: "memory" as const, id: memory_id, revision: 1 as const } })), ...(signal ? { signal } : {}) });
        return { mode: "run-expansion" as const, receipt_id: receipt.receiptId, outcome: receipt.outcome,
          ...(receipt.errorCode ? { error_code: receipt.errorCode } : {}),
          queued: receipt.queued.map(({ ref, version }) => ({ memory_id: ref.id, version })),
          omitted: receipt.omitted.map(({ ref, version }) => ({ memory_id: ref.id, version })),
          tokens: receipt.tokens, basis: receipt.basis, remaining_tokens: receipt.remainingTokens };
      }),
    },
    run: {
      ref: { id: started.run.ref.id },
      subscribe: (listener: (event: PrologueEvent) => void) =>
        started.run.subscribe(withInteractionRepairLimit(stopForHost, (event) => {
          if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") roundEnded(deps, started, at.session, at.stepBoard, event.type, actionController);
          if (event.type === "command-receipt") {
            const events = deps.state.commandEvents.get(started.run.ref.id) ?? [];
            if (!events.some(saved => sameRef(saved.receiptRef, event.receiptRef))) events.push(event);
            deps.state.commandEvents.set(started.run.ref.id, events);
          }
          if (event.type === "usage" || event.type === "usage-recorded") {
            const receipt: PrologueUsageReceipt = event.receipt;
            listener({ ...event, receipt });
          } else listener(event);
        })),
      cancel: () => { actionController.abort(); return started.run.cancel(); },
    },
    control: {
      get state() { const state = control.state; return state === "sleeping" ? "paused" : state; },
      get stopReason() { return hostStop; },
      stop(reason) {
        if (["completed", "failed", "stopped", "cancelled"].includes(control.state)) return Promise.resolve();
        // Persist user intent before cancellation; the SDK still owns when
        // the run actually ends. Repeated clicks reuse the first request.
        return at.stopping.current ??= (async () => {
          await deps.index.update(input.session_id, index => { index.attempts[at.attemptIndex]!.stop_intent = reason; });
          // The accepted Run owns its terminal settlement after this control invocation returns.
          deps.effects.detach(() => { actionController.abort(); control.stop(reason); });
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
      steer: input => control.steer(input), withdrawSteer: steerId => control.withdrawSteer(steerId), subscribe: listener => control.subscribe(listener),
    },
  };
}

/** Start one round: the stages above, in order. */
export async function startPrologueRun(deps: RunDeps, input: PrologueStartInput): ReturnType<PrologueRuntimePort["startAgentRun"]> {
  const { runtime, state } = deps;
  const mode: Mode = { none: input.workspace === "none", business: input.workspace === "business" };
  const index = await deps.index.read(input.session_id);
  assertWorkspace(input, index, state, mode);
  const ref = state.sessions.get(input.session_id);
  const { actionController, actionTools, parameterBranches } = roundGateway(deps, input, mode.none);
  ensureStopGuard(runtime, state, input.session_id);
  const attempted: { run_id?: string } = {}, afterWrite = await roundChecks(deps, input, index, mode, attempted, actionTools?.pack.tools);
  const bindActions = !mode.none && (!!input.actions || !!input.action_gateway || state.actionToolSessions.has(input.session_id) || !!afterWrite);
  // The gateway also declares, on its capability tools, the capabilities this round has found (prologue-gateway-declared.ts).
  const session = ref === undefined ? undefined : await runtime.sessions.open(ref, bindActions ? { pack: actionTools!.pack,
    executors: { ...actionTools!.executors, ...(afterWrite ? { [AFTER_WRITE_EXECUTOR]: afterWrite } : {}) }, ...(parameterBranches ? { parameterBranches } : {}) } : undefined);
  if (bindActions && session) state.actionToolSessions.add(input.session_id);
  if (session === undefined) throw new Error("agent.session_unknown");
  const root = mode.none || mode.business ? undefined : await runtime.workspace.authorize({ path: input.root_path! });
  const methods = inlineMethods(runtime, state.registeredMethods, input.skills ?? [], systemTools(input), prologueToolName);
  const textResources: Array<{ ref: ExactRef<"resource">; as: "original" }> = [];
  for (const material of input.text_materials ?? []) textResources.push({ ref: await stageTextResource(runtime, agentTextMaterialContent(material), "coding-material"), as: "original" });
  const { childRoots, childRoles, childInstructions } = await childSetup(deps, input);
  const plan = input.provenance.frozen.execution_plan;
  const materials = await roundMaterials(deps, input, index, session, mode.none, plan, textResources);
  const surface = await roundSurface(deps, input, index, session, mode.business);
  const binding = await roundBinding(deps, input, index, session, materials.stepBoard);
  const { character, runTools, pinnedMemory } = await roundCharacter(deps, input, index, { mode, methods, childInstructions, childRoles, surface, stepBoard: materials.stepBoard, actionTools });
  const referenceKinds = await roundReferenceKinds(deps.options, index.owner);
  // Exchange our reference for one Prologue can resolve, before the Run is started rather than when it first calls out.
  const credentialRef = await deps.credentials.prologueRefFor(input.model.credential_ref);
  const { attemptIndex, abandon } = await recordAttempt(deps, input, { ...input.provenance, task: input.task, ...(root ? { root_ref: root.ref } : {}),
    ...(actionTools?.names.length ? { action_tool_scope: actionTools.scope } : {}),
    ...(materials.stepBoard ? { step_board: materials.stepBoard.ref, step_prefix: materials.stepBoard.prefix } : {}), ...(childRoles.size ? { subagent_roles: [...childRoles], subagent_roots: childRoots } : {}),
    ...(surface.desktop_target ? { desktop_target: surface.desktop_target } : {}) });
  const dispatchGuard = async () => {
    await input.beforeDispatch?.();
    if (!mode.none && !mode.business) {
      await deps.mcpLibrary.validate(index.owner, input.mcp_tools ?? []);
      await deps.mcpLibrary.validateSources(index.owner, input.mcp_sources ?? []);
    }
  };
  // The stop check follows this round; its ending review, when the round's owner gave one, runs with the owner's
  // instructions on the round's own model, behind the same pre-dispatch check.
  guardRound(state, input, mode.business, input.ending_review ? { instructions: input.ending_review.prompt, protocol: input.model.protocol, endpoint: input.model.endpoint,
    model: input.model.model, credentialRef, dispatch: operation => deps.dispatchGuards.run(dispatchGuard, operation) } : undefined, actionController.signal);
  const started = await deps.memoryAuthority.forAttempt(input.session_id, attemptIndex, () => deps.dispatchGuards.run(dispatchGuard, () => runtime.startAgentRun(sdkStart(deps, input, index, {
    session, root, business: mode.business, credentialRef, childRoles, childRoots, runTools, character, textResources: materials.textResources, pinnedMemory, binding, referenceKinds,
  })))).catch(async (error: unknown) => {
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
    throw error;
  });
  attempted.run_id = started.run.ref.id;
  watchRoundFacts(state, started.run);
  const stopping: { current: Promise<void> | undefined } = { current: undefined };
  // Every child this round dispatches is let out only after the round's own check passes again (the Runtime asks).
  state.dispatchChecks.set(started.run.ref.id, dispatchGuard);
  await afterStart(deps, input, index, { started, session, root, attemptIndex, actionController, hasActions: Boolean(actionTools?.names.length), none: mode.none,
    project: materials.project, scopePaths: materials.scopePaths, plan, stepBoard: materials.stepBoard, stopping: () => stopping.current !== undefined });
  return { ...roundHandle(deps, input, { started, session, attemptIndex, actionController, stepBoard: materials.stepBoard, stopping }),
    ...(surface.desktop_target ? { desktop_target: surface.desktop_target } : {}) };
}
