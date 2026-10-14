import path from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ExactRef, Runtime } from "@prologue/sdk";
import { BUSINESS_HOST_TOOLS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { actionEffect, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentTextMaterialContent, type AgentActionClient } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ANNOUNCE_HELD, BUTTON_CLAIM_HELD, SAVED_CLAIM_HELD, WRITTEN_CALL_HELD, announcesWithoutActing, claimsButton, claimsMemoryChange, claimsSavedChange, internalIdsHeld, memoryHeld, mentionsInternalIds, writesToolCallAsText } from "./announce-guard.js";
import { gatewayProblem, prologueActionGateway } from "./prologue-action-gateway.js";
import { prologueActionTools } from "./prologue-action-tools.js";
import type { PrologueApprovalBridge } from "./prologue-approvals.js";
import type { createPrologueCheckpoints } from "./prologue-checkpoints.js";
import { createPrologueCompactor } from "./prologue-compaction.js";
import type { PrologueCredentialBridge } from "./prologue-credentials.js";
import { mcpConnectionId, type createPrologueMcpLibrary } from "./prologue-mcp.js";
import type { createPrologueMemory } from "./prologue-memory.js";
import type { createSessionMessages } from "./prologue-messages.js";
import { inlineMethods } from "./prologue-methods.js";
import { projectWorkDigest, workPaths, type createProjectWork } from "./prologue-project-work.js";
import { withInteractionRepairLimit } from "./prologue-questions.js";
import { runModelParams } from "./prologue-run-params.js";
import { collaborates, eligibleContinuation, PLAN_STEP, readyStep, SESSION_STEP, sessionBoard } from "./prologue-collaboration.js";
import { exactCharacterKey, verifySubagentStart, type PrologueSubagentRoot } from "./prologue-subagents.js";
import { DESKTOP_GUIDANCE, SURFACE_GUIDANCE, type PrologueSurfaces } from "./prologue-surfaces.js";
import type { createPrologueTaskBoards } from "./prologue-taskboard.js";
import type { createPrologueWaits } from "./prologue-waits.js";
import type { PrologueEvent, PrologueUsageReceipt } from "./prologue-stream.js";
import type { PrologueRuntimePort, PrologueStartInput } from "./prologue.js";
import { prologueToolName, sameRef, stageInstructions, stageTextResource, type DispatchGuards, type HeldKind, type PrologueNodeAdapterOptions, type RoundState } from "./prologue-node-kit.js";
import type { SessionIndex, SessionIndexStore } from "./prologue-session-index.js";

/**
 * Starting one round on the Prologue runtime (W4-06 moved `startAgentRun` here from the Node composition, in stages):
 * the session's workspace mode is checked, the round's gateway, stop check, child roles, materials, surface and
 * Character are put together, its intent is saved before the SDK can dispatch anything, then the run is started and
 * handed back with its controls.
 */

/** Turns a round started without a budget may take: the SDK's own default, unchanged. */
const ROUND_DEFAULT_TURNS = 8;
/** One model call's wait for its answer to start, and between its parts, when the round has no time budget. */
export const MODEL_CALL_TIMEOUT_MS = 180_000;
// Codes the runtime raises before it creates a run: nothing ran, so the attempt is a settled refusal.
const REFUSED_BEFORE_RUN = new Set(["AGENT_START_INVALID", "CONTEXT_BUDGET_EXCEEDED", "CONTEXT_SOURCE_MISSING", "CONTEXT_INBOUND_HELD", "EFFECT_RECONCILE_REQUIRED"]);

/** How a held ending reads in the round: what was wrong with it, and that the round was let go on to correct it. */
export const HELD_LABELS: Record<HeldKind, { target: string; summary: string }> = {
  announce: { target: "上一段只说了要做什么，没有实际执行", summary: "这一轮只说明了接下来要做什么、没有调用工具，已让它接着实际去做（每轮最多一次）" },
  memory: { target: "上一段说记住或删掉了，但这一轮没有做到", summary: "回答说已经记住或删掉，可这一轮没有成功的记忆调用，已让它真正去做或如实更正" },
  written: { target: "上一段把调用写成了文字，并没有执行", summary: "回答里写的是调用的文字而不是调用本身，已让它真正去调用或改用平常的话回答" },
  button: { target: "上一段说按钮准备好了，但这一轮没有做出按钮", summary: "回答说按钮已经准备好，可这一轮没有成功准备操作卡，已让它真正去准备或如实更正" },
  ids: { target: "上一段写出了内部标识，已让它改用名称重写", summary: "回答里出现了工具名、能力标识或编号，已让它改用标题和名称重写" },
  saved: { target: "上一段说已经保存或建好，但这一轮没有成功的改动", summary: "回答说已经保存或建好，可这一轮没有成功的改动，已让它真正去做或如实更正" },
};

export interface RunDeps {
  readonly runtime: Runtime;
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

/** Whether any call this round finished was a change (a capability no longer offered counts as one: nothing is held then). */
async function changedThisRound(done: { client: AgentActionClient; invoked: ExactActionReference[] }): Promise<boolean> {
  if (!done.invoked.length) return false;
  const views = await done.client.discover().catch(() => null);
  if (!views) return true;
  return done.invoked.some(reference => {
    const view = views.find(row => row.capability_id === reference.capability_id && row.version === reference.version && row.provider.provider_id === reference.provider_id);
    return !view || actionEffect(view.action, view.capability_id) !== "read";
  });
}

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

/**
 * The round's actions: the business gateway's three tools, or one tool per frozen action. What the round really keeps,
 * forgets, offers and changes is counted for the stop check; a call to a capability that is gone is refused before review.
 */
function roundGateway(deps: RunDeps, input: PrologueStartInput, none: boolean) {
  const { state, runtime } = deps;
  const actionController = new AbortController();
  // A business round the person gave no memory (switched off) keeps nothing, so any claim of keeping is held too.
  const memory = input.action_gateway?.client.memory;
  // What the round has said so far: a claim made before the call that then failed counts as much as one at the end.
  const memoryDone: Memory = { keep: 0, forget: 0, off: !memory, spoken: "", without: { keep: !!memory && !memory.remember, forget: !!memory && !memory.forget } };
  if (input.action_gateway) state.memoryRounds.set(input.session_id, memoryDone); else state.memoryRounds.delete(input.session_id);
  const offer = input.action_gateway?.client.offer;
  const offersDone = { offered: 0 };
  if (offer) state.offerRounds.set(input.session_id, offersDone); else state.offerRounds.delete(input.session_id);
  const client = input.action_gateway?.client;
  const changesDone = client ? { client, invoked: [] as ExactActionReference[] } : undefined;
  if (changesDone) state.changeRounds.set(input.session_id, changesDone); else state.changeRounds.delete(input.session_id);
  const gatewayForRun = input.action_gateway && client ? { ...input.action_gateway, client: { ...client,
    invoke: async (reference: ExactActionReference, value: unknown, signal?: AbortSignal) => { const result = await client.invoke(reference, value, signal); changesDone!.invoked.push(reference); return result; },
    ...(memory ? { memory: {
      ...(memory.remember ? { remember: async (value: Parameters<NonNullable<typeof memory.remember>>[0]) => { const kept = await memory.remember!(value); memoryDone.keep += 1; return kept; } } : {}),
      list: () => memory.list(),
      ...(memory.forget ? { forget: async (id: string) => { const result = await memory.forget!(id); if (result.forgotten) memoryDone.forget += 1; return result; } } : {}),
      ...(memory.propose ? { propose: memory.propose.bind(memory) } : {}),
    } } : {}),
    ...(offer ? { offer: async (proposal: Parameters<typeof offer>[0]) => { const made = await offer(proposal); offersDone.offered += 1; return made; } } : {}),
  } } : input.action_gateway;
  const actionTools = none ? undefined : gatewayForRun
    ? { ...prologueActionGateway(gatewayForRun, Math.min(60_000, runtime.tools.limits.maxTimeoutMs), actionController.signal), scope: "gateway" }
    : prologueActionTools(input.actions, Math.min(60_000, runtime.tools.limits.maxTimeoutMs), actionController.signal);
  if (input.action_gateway) {
    state.gatewayRuns.set(input.session_id, input.action_gateway);
    if (actionTools && "known" in actionTools) state.gatewayKnown.set(input.session_id, actionTools.known as Set<string>);
    // Refused before any review: a call to a capability that is gone, switched off or asked through the wrong tool.
    if (!state.gatewayHooks.has(input.session_id)) {
      state.gatewayHooks.add(input.session_id);
      const sessionId = input.session_id;
      runtime.hooks.register({ id: `molis-action-gateway-${sessionId}`, event: "tool-before", forSession: sessionId, handler: async context => {
        const gateway = state.gatewayRuns.get(sessionId);
        if (!gateway || !context.toolName) return { kind: "allow" as const };
        const problem = await gatewayProblem(gateway, context.toolName, context.input, state.gatewayKnown.get(sessionId));
        return problem ? { kind: "deny" as const, why: problem } : { kind: "allow" as const };
      } });
    }
  }
  return { actionController, actionTools, memoryDone };
}

/**
 * The session's stop check, registered once: an ending that only announces, claims a change no call made, writes a call
 * as text or names internal ids is held once per kind per round. A session may alternate discussing and executing rounds,
 * so the check follows the round now starting.
 */
function ensureStopGuard(deps: RunDeps, input: PrologueStartInput, business: boolean): void {
  const { state, runtime } = deps;
  const guard = state.stopGuards.get(input.session_id);
  if (guard) { guard.writing = input.provenance.frozen.execution !== "read-only"; return; }
  const sessionId = input.session_id, created = { writing: input.provenance.frozen.execution !== "read-only", held: new Map<string, Set<HeldKind>>() };
  state.stopGuards.set(sessionId, created);
  runtime.hooks.register({ id: `molis-announce-guard-${sessionId}`, event: "session-stop", forSession: sessionId, handler: async context => {
    const run = context.origin?.run, text = (context.input as { text?: unknown } | undefined)?.text;
    if (!run || typeof text !== "string") return { kind: "allow" as const };
    // Each kind of ending is held at most once per round: a second, different slip is still caught, the same one is not
    // held again (the person chose one automatic continuation per round for an ending that only announces).
    const held = created.held.get(run) ?? new Set<HeldKind>();
    const hold = (kind: HeldKind, why: string) => { held.add(kind); created.held.set(run, held); state.heldLabels.set(run, [...(state.heldLabels.get(run) ?? []), HELD_LABELS[kind]]); return { kind: "deny" as const, why }; };
    // A claim of keeping or forgetting that no call made this round is held, whatever the round's execution.
    const tracked = state.memoryRounds.get(sessionId);
    const claim = tracked && !held.has("memory") ? claimsMemoryChange(tracked.spoken.trim() ? tracked.spoken.slice(-1200) : text) : null;
    if (claim && state.memoryRounds.get(sessionId)![claim] === 0) return hold("memory", memoryHeld(state.memoryRounds.get(sessionId)!, claim));
    if (business && !held.has("written") && writesToolCallAsText(text)) return hold("written", WRITTEN_CALL_HELD);
    if (!held.has("button") && state.offerRounds.get(sessionId)?.offered === 0 && claimsButton(text)) return hold("button", BUTTON_CLAIM_HELD);
    // Tool names, capability ids this round found, UUIDs and error codes are ours, not the person's words.
    const ids = business && !held.has("ids") ? mentionsInternalIds(text, state.gatewayKnown.get(sessionId) ?? []) : [];
    if (ids.length) return hold("ids", internalIdsHeld(ids));
    // A claim of having saved or created something, from a round where no change went through. Memory has its own check.
    const done = state.changeRounds.get(sessionId), kept = state.memoryRounds.get(sessionId);
    if (business && created.writing && done && !held.has("saved") && !claim && !(kept && kept.keep + kept.forget) && claimsSavedChange(text)
      && !(await changedThisRound(done))) return hold("saved", SAVED_CLAIM_HELD);
    if (!created.writing || !announcesWithoutActing(text)) return { kind: "allow" as const };
    // Continued once and still only announcing: it ends (the round then says plainly that nothing was done, see endedOnPromise).
    if (held.has("announce")) return { kind: "allow" as const };
    return hold("announce", ANNOUNCE_HELD);
  } });
}

/** The round's child directories and fixed child roles, each a published Character, and what the round is told of them. */
async function childSetup(deps: RunDeps, input: PrologueStartInput) {
  const { runtime } = deps;
  const childRoots: PrologueSubagentRoot[] = [];
  if (input.subagent_workspaces?.length && input.character.tools.some(tool => !["read-file", "list", "search", "context-remaining", "dispatch-subagent", "await-subagents", "steer-subagent", "ask-user", "board-read", "board-report", "session-send"].includes(tool))) throw new Error("独立目录协调者只能读取和分派，不能持有其他执行工具");
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
  const childInstructions = childRoles.size ? childScope + "可分派的固定子角色：\n" + [...childRoles].map(([ref, role]) => `${ref}: ${role.name}; tools=${JSON.stringify(role.host_tools.map(prologueToolName))}`).join("\n") + "\n必须选择上述精确 character，并显式提供该角色列出的完整 tools 清单；不能遗漏角色需要的工具或增加其他工具。给子任务写清任务、必要上下文、依据路径与完成条件；不继承父聊天或材料。子任务只能使用所选角色的工具，不能再次分派。需要用户信息时作为阻塞返回给父任务。" : "";
  return { childRoots, childRoles, childInstructions };
}

/**
 * What the round is given to read beside its task: the person's text materials, where its plan stands, and in a main
 * round what other sessions are doing and the messages left for it.
 */
async function roundMaterials(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, session: Session, none: boolean, plan: PrologueStartInput["provenance"]["frozen"]["execution_plan"], textResources: Array<{ ref: ExactRef<"resource">; as: "original" }>) {
  const { runtime, stepBoards, projectWork, messages } = deps;
  const continued = input.provenance.frozen.continues_step_board_of;
  // A continued plan keeps its graph — with every step a person inserted, skipped or reordered — rather than starting over.
  const stepBoard = plan ? continued ? await stepBoards.resume({ session_id: input.session_id, run_id: continued }) : await stepBoards.admit(plan, session.ref) : undefined;
  // A round without a plan of its own still starts knowing where the session's unfinished graph stands.
  const earlier = plan ? undefined : [...index.attempts].reverse().find(attempt => attempt.step_board && attempt.frozen.execution_plan);
  // The graph as it stands travels with this round's task, where it reads as newer than the conversation before it.
  const digest = plan && stepBoard ? stepBoards.digest(stepBoard, plan, session.ref.id)
    : earlier ? stepBoards.standing(earlier.step_board!, earlier.frozen.execution_plan!, session.ref.id) : "";
  if (digest) textResources.push({ ref: await stageTextResource(runtime, digest, "coding-board-digest"), as: "original" });
  // What other sessions in the project are doing, and where it overlaps this round, as the round starts.
  const project = index.owner.project_id, workText = `${input.task}\n${(plan?.steps ?? []).map(step => `${step.title}\n${step.acceptance}`).join("\n")}`;
  const scopePaths = none ? [] : workPaths(workText);
  if (!none && input.root_path && !index.parent_run) {
    try {
      const seen = await projectWork.read(project, { session_id: session.ref.id, directory: input.root_path, paths: scopePaths });
      const note = projectWorkDigest(await projectWork.projectId(project), seen.items, session.ref.id, seen.overlaps);
      if (note) textResources.push({ ref: await stageTextResource(runtime, note, "coding-project-work"), as: "original" });
    } catch { /* the project's list is a courtesy to the round; a failed read leaves it out rather than stopping the round */ }
    // Messages other sessions left for this one while it was not running.
    const inbox = await messages.inbox(session.ref.id, project).catch(() => "");
    if (inbox) textResources.push({ ref: await stageTextResource(runtime, inbox, "coding-session-inbox"), as: "original" });
  }
  return { textResources, stepBoard, project, scopePaths };
}

/**
 * Where a round that works with others stands (specs/prologue-adoption §4.6.10): a continuation of this session that may
 * go on now (the round takes it up, under its request key), else the plan's root step, else the session's own step. A
 * subtask session and a round that does not collaborate stand nowhere.
 */
async function roundBinding(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, session: Session, stepBoard: Awaited<ReturnType<typeof roundMaterials>>["stepBoard"]) {
  const { runtime } = deps;
  if (index.parent_run || !collaborates(input.character.tools.map(prologueToolName), Boolean(stepBoard))) return undefined;
  const own = await sessionBoard(runtime, session.ref);
  const plans = [...new Set(index.attempts.flatMap(attempt => attempt.step_board ? [attempt.step_board.id] : []))];
  const boards = [own, ...(stepBoard ? [stepBoard.ref] : []), ...plans.map(id => ({ kind: "task-board", id, revision: 1 }) as ExactRef<"task-board">)];
  const ready = eligibleContinuation(runtime, session.ref, boards);
  if (ready) return { board: ready.board, node: ready.node, requestKey: ready.requestKey };
  const at = stepBoard ? { board: stepBoard.ref.id, node: PLAN_STEP } : { board: own.id, node: SESSION_STEP };
  await readyStep(runtime, at.board, at.node, index.owner.actor_id ?? "user");
  return at;
}

/**
 * The project's side panel browser, for this session only: its tools join the round and the round is told how to use
 * them. Read-only rounds only look; a page another live round holds is not shared, and the round is told why.
 */
async function roundSurface(deps: RunDeps, input: PrologueStartInput, index: SessionIndex, session: Session, business: boolean) {
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
  readonly plan: PrologueStartInput["provenance"]["frozen"]["execution_plan"]; readonly session: Session; readonly actionTools: ReturnType<typeof roundGateway>["actionTools"];
}) {
  const { runtime, stepBoards, mcpLibrary } = deps;
  const { mode: { none, business }, surface, plan, stepBoard, session, childRoles } = parts;
  const instructions = await stageInstructions(runtime, [input.character.instructions, parts.childInstructions, ...parts.methods,
    ...(surface.surfaces.includes("browser") ? [SURFACE_GUIDANCE] : []), ...(surface.surfaces.includes("desktop") ? [DESKTOP_GUIDANCE] : []), ...(surface.note ? [`## 界面控制\n${surface.note}`] : []),
    ...(plan && stepBoard ? [stepBoards.instructions(stepBoard, plan, { session: session.ref.id, dispatch: childRoles.size > 0 })] : []), (none || business ? "" : await deps.checkpoints?.context(input.session_id) ?? "")].join("\n\n"));
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
  const tools = [...input.character.tools.map(prologueToolName), ...mcpTools, ...(parts.actionTools?.names ?? []), ...surface.tools];
  const runTools = [...new Set([...tools, ...[...childRoles.values()].flatMap(role => role.host_tools.map(prologueToolName))])];
  // The memories the Host chose for this run, as exact references (one deleted meanwhile is simply not given).
  const pinnedMemory = input.memory?.pinned.length ? await deps.platformMemory.refsFor(input.memory.pinned) : [];
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
    ...(pinnedMemory.length ? { memoryPolicy: { recall: true, write: false } } : {}),
  });
  return { character: runtime.characters.publish(created.ref), runTools, pinnedMemory };
}

/** Persist the intent before the SDK can dispatch a model or tool: a crash in this window stays visibly unresolved. */
async function recordAttempt(deps: RunDeps, input: PrologueStartInput, attempt: SessionIndex["attempts"][number]): Promise<number> {
  let attemptIndex = -1;
  await deps.index.update(input.session_id, index => {
    attemptIndex = index.attempts.length;
    index.attempts.push(attempt);
  });
  try { await input.beforeStart?.(); }
  catch (error) {
    // The SDK has not seen this intent, so it is known not to have dispatched.
    await deps.index.update(input.session_id, saved => {
      const held = saved.attempts[attemptIndex];
      if (held && !held.run_id && isDeepStrictEqual(held, attempt)) saved.attempts.splice(attemptIndex, 1);
    });
    throw error;
  }
  return attemptIndex;
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
  readonly pinnedMemory: Awaited<ReturnType<RunDeps["platformMemory"]["refsFor"]>>;
  readonly binding: { board: string; node: string; requestKey?: string } | undefined;
}): Parameters<Runtime["startAgentRun"]>[0] {
  const { session, root, business, credentialRef, childRoles, childRoots } = parts;
  const params = runModelParams(input.model, input.provenance.frozen.budget, input.provenance.frozen.reasoning_effort);
  const cache = input.model.prompt_cache === undefined || input.model.prompt_cache === "off" ? {} : { promptCache: input.model.prompt_cache };
  return {
    session,
    ...(parts.binding ? { collaboration: { board: parts.binding.board, node: parts.binding.node } } : {}),
    ...(root ? { rootRef: root.ref } : business ? { workspace: "app" as const } : { workspace: "none" as const }),
    // A digest round carries earlier rounds in its task; replaying them verbatim too is what stopped long sessions.
    ...(input.history === "digest" ? {} : { history: "session" as const }),
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
      ...(parts.pinnedMemory.length ? { memory: { pinned: parts.pinnedMemory, budgetChars: input.memory!.budget_chars } } : {}),
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
  if (at.plan && at.stepBoard) deps.stepBoards.follow(at.stepBoard.ref, { session_id: session.ref.id, run_id: started.run.ref.id }, at.plan);
  // A main round is work under way in its project until it ends; a subtask's work is its parent's.
  if (!at.none && input.root_path && !index.parent_run) {
    try {
      const workId = await deps.projectWork.begin(at.project, { session: session.ref, run_id: started.run.ref.id, title: input.session_title ?? index.title, task: input.task,
        directory: input.root_path, paths: at.scopePaths, ...(input.queued_work_id ? { queued: input.queued_work_id } : {}) });
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
  if (stepBoard) deps.stepBoards.unfollow(stepBoard.ref.id);
  if (state.liveSessions.get(session.ref.id) === started.run.ref.id) state.liveSessions.delete(session.ref.id);
  // The side panel stops saying the Assistant is using the page the moment its round is over, and this run's app approvals are dropped.
  if (surfaceHost) { void surfaceHost.release(session.ref.id).catch(() => undefined); surfaceHost.releaseRun(started.run.ref); } state.runRefs.delete(started.run.ref.id);
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
  readonly memoryDone: Memory; readonly stepBoard: { ref: { id: string } } | undefined; readonly stopping: { current: Promise<void> | undefined };
}): Awaited<ReturnType<PrologueRuntimePort["startAgentRun"]>> {
  const { started, actionController, memoryDone } = at;
  const control = started.control;
  return {
    run: {
      ref: { id: started.run.ref.id },
      subscribe: (listener: (event: PrologueEvent) => void) =>
        started.run.subscribe(withInteractionRepairLimit(control, (event) => {
          if (event.type === "text-delta" && typeof (event as { text?: unknown }).text === "string") memoryDone.spoken = (memoryDone.spoken + (event as { text: string }).text).slice(-4000);
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
      stop(reason) {
        if (["completed", "failed", "stopped", "cancelled"].includes(control.state)) return Promise.resolve();
        // Persist user intent before cancellation; the SDK still owns when
        // the run actually ends. Repeated clicks reuse the first request.
        return at.stopping.current ??= (async () => {
          await deps.index.update(input.session_id, index => { index.attempts[at.attemptIndex]!.stop_intent = reason; });
          actionController.abort();
          control.stop(reason);
        })().catch(error => { at.stopping.current = undefined; throw error; });
      },
      pause: () => control.pause(), resume: () => control.resume(),
      // The new model's key is exchanged first; the runtime refuses a target or frozen settings it cannot carry.
      switchModel: async target => control.switchModel({ protocol: target.protocol, endpoint: target.endpoint, model: target.model, credentialRef: await deps.credentials.prologueRefFor(target.credential_ref) }),
      steer: async input => { await control.steer(input); }, subscribe: listener => control.subscribe(listener),
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
  const { actionController, actionTools, memoryDone } = roundGateway(deps, input, mode.none);
  ensureStopGuard(deps, input, mode.business);
  const bindActions = !mode.none && (!!input.actions || !!input.action_gateway || state.actionToolSessions.has(input.session_id));
  const session = ref === undefined ? undefined : await runtime.sessions.open(ref, bindActions ? { pack: actionTools!.pack, executors: actionTools!.executors } : undefined);
  if (bindActions && session) state.actionToolSessions.add(input.session_id);
  if (session === undefined) throw new Error("agent.session_unknown");
  const root = mode.none || mode.business ? undefined : await runtime.workspace.authorize({ path: input.root_path! });
  const methods = inlineMethods(runtime, state.registeredMethods, input.skills ?? [], input.character.tools.map(prologueToolName), prologueToolName);
  const textResources: Array<{ ref: ExactRef<"resource">; as: "original" }> = [];
  for (const material of input.text_materials ?? []) textResources.push({ ref: await stageTextResource(runtime, agentTextMaterialContent(material), "coding-material"), as: "original" });
  const { childRoots, childRoles, childInstructions } = await childSetup(deps, input);
  const plan = input.provenance.frozen.execution_plan;
  const materials = await roundMaterials(deps, input, index, session, mode.none, plan, textResources);
  const surface = await roundSurface(deps, input, index, session, mode.business);
  const binding = await roundBinding(deps, input, index, session, materials.stepBoard);
  const { character, runTools, pinnedMemory } = await roundCharacter(deps, input, index, { mode, methods, childInstructions, childRoles, surface, stepBoard: materials.stepBoard, plan, session, actionTools });
  // Exchange our reference for one Prologue can resolve, before the Run is started rather than when it first calls out.
  const credentialRef = await deps.credentials.prologueRefFor(input.model.credential_ref);
  const attemptIndex = await recordAttempt(deps, input, { ...input.provenance, task: input.task, ...(root ? { root_ref: root.ref } : {}),
    ...(actionTools?.names.length ? { action_tool_scope: actionTools.scope } : {}),
    ...(materials.stepBoard ? { step_board: materials.stepBoard.ref } : {}), ...(childRoles.size ? { subagent_roles: [...childRoles], subagent_roots: childRoots } : {}) });
  const dispatchGuard = async () => {
    await input.beforeDispatch?.();
    if (!mode.none && !mode.business) {
      await deps.mcpLibrary.validate(index.owner, input.mcp_tools ?? []);
      await deps.mcpLibrary.validateSources(index.owner, input.mcp_sources ?? []);
    }
  };
  const started = await deps.dispatchGuards.run(dispatchGuard, () => runtime.startAgentRun(sdkStart(deps, input, index, {
    session, root, business: mode.business, credentialRef, childRoles, childRoots, runTools, character, textResources: materials.textResources, pinnedMemory, binding,
  }))).catch(async (error: unknown) => {
    // Refused while the context was still being packed: the runtime creates the run only after that, so nothing
    // ran and the attempt is a settled refusal rather than an unknown outcome that would block the session.
    const code = (error as { code?: string }).code;
    if (code && REFUSED_BEFORE_RUN.has(code)) await deps.index.update(input.session_id, saved => { saved.attempts[attemptIndex]!.refused = { code, at: new Date().toISOString() }; }).catch(() => undefined);
    throw error;
  });
  const stopping: { current: Promise<void> | undefined } = { current: undefined };
  // Every child this round dispatches is let out only after the round's own check passes again (the Runtime asks).
  state.dispatchChecks.set(started.run.ref.id, dispatchGuard);
  await afterStart(deps, input, index, { started, session, root, attemptIndex, actionController, hasActions: Boolean(actionTools?.names.length), none: mode.none,
    project: materials.project, scopePaths: materials.scopePaths, plan, stepBoard: materials.stepBoard, stopping: () => stopping.current !== undefined });
  return roundHandle(deps, input, { started, session, attemptIndex, actionController, memoryDone, stepBoard: materials.stepBoard, stopping });
}
