import { parseExactActionReferences } from "@molis-ai/molis-work-contracts/platform/actions";
import { writerDirectoryCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { agentHostCapabilities as agent, type AgentRunView, type AgentSubagentWorkspace } from "@molis-ai/molis-work-contracts/services/agent-host";
import { characterSelection, characterSkillSelection, savedCharacter, savedCharacterSkills } from "./characters.js";
import { CONTINUATION_MARKER } from "./continuation.js";
import { CODING_RUN_UPDATED_EVENT } from "./events.js";
import { resolveGoalContext } from "./goal-context.js";
import { nextHistoryMode, writeHistoryDigest, type HistoryDigest } from "./history-digest.js";
import { materialSelection, resolveMaterials, savedMaterials } from "./materials.js";
import { attachMentions, workspaceFileReader } from "./mentions.js";
import { confirmedPlan, executionSteps, planMaterial } from "./plans.js";
import { CODING_HISTORY_SUMMARY } from "./prompts.js";
import { type Capabilities, type CodingActivation, savedDigestUsage, sessionState, sessionTitle } from "./route-activation.js";
import { codingActionControl, type CodingBeforeWrite } from "./route-entry.js";
import { methodSelection, mcpSelection, mcpSources, savedActions } from "./route-selections.js";
import type { CodingExecutionPorts } from "./routes.js";
import { startDelegation } from "./routes-delegations.js";
import { chosenEffort, text } from "./run-inputs.js";
import { codingSessionTitleFrom, DEFAULT_SESSION_TITLE } from "./session-title.js";
import type { CodingSessionRecord } from "./store.js";
import { codingWriterAssignments } from "./writers.js";

// A round started here is followed until it settles, so the session's recorded state — which the directory and the
// cross-project background list read — stays right while no page is open. One follower per session; a newer round
// replaces it, and a Host that stops answering (the plugin closing) ends it.
const follow = (a: CodingActivation, api: Capabilities, execution: CodingExecutionPorts,
  sessionId: string, session: { runtime_id: string; session_id: string }, run: { session_id: string; run_id: string }, workspaceId: string) => {
  const { context, projectId, stopped, following } = a;
  const token = Symbol(sessionId);
  following.set(sessionId, token);
  const current = () => !stopped.signal.aborted && following.get(sessionId) === token;
  void (async () => {
    let since: string | null = null;
    while (current()) {
      const waited: { version: string; view: AgentRunView } = await api.invoke(agent.waitRun, [session, run, since, 25_000], { signal: stopped.signal });
      if (!current()) return;
      const view = waited.view;
      since = waited.version;
      const record = execution.sessions.get(projectId, sessionId), next = sessionState(view);
      if (next !== record.state) execution.sessions.setState(projectId, sessionId, next, record.updated_at);
      if (["completed", "failed", "stopped", "cancelled", "reconcile-required"].includes(view.phase)) {
        // Notification only: terminal does not mean every tool succeeded or that a file changed.
        // The activation-owned events client rejects publication after stop/revocation.
        try { context.services?.events?.publish({ event_type_id: CODING_RUN_UPDATED_EVENT, type_version: 1,
          payload: { workspace_id: workspaceId, session_id: session.session_id, run_id: run.run_id, phase: view.phase } }); }
        catch { /* A missed UI hint must never retry or reclassify an already executed Run. */ }
        if (!current()) return;
        // A round that ended parked (waiting for an answer or a command) shows as waiting from here on.
        if (view.phase !== "reconcile-required" && await a.waits.openWaitOf(execution.sessions.get(projectId, sessionId)).catch(() => undefined)) {
          if (!current()) return;
          execution.sessions.setState(projectId, sessionId, "queued", new Date().toISOString());
          a.waits.wakeLoop(api, execution, session.runtime_id);
        }
        break;
      }
    }
  })().catch(() => undefined).finally(() => { if (following.get(sessionId) === token) following.delete(sessionId); });
};

/**
 * Start a round in a session: from the person's send, or later from a queued round when the work it waited for is
 * done. The same checks run either way; nothing about a queued round is decided at the moment it starts.
 */
export const startRound = async (a: CodingActivation, record: CodingSessionRecord, body: Record<string, unknown>, actorId: string,
  api: Capabilities, execution: CodingExecutionPorts, beforeWrite: CodingBeforeWrite = Object.assign(async () => {}, { assert_current: () => a.stopped.signal.throwIfAborted() })) => {
  const { context, projectId, ports } = a;
  // Continuing an earlier round's unfinished graph uses that round's own confirmed revision, whatever the draft is now.
  const continueOf = body.continue_step_board_of === undefined ? undefined : text(body.continue_step_board_of, "被继续的轮次", 200);
  if (continueOf !== undefined && (typeof body.plan_revision !== "number" || !Number.isSafeInteger(body.plan_revision) || !["execute", "parallel"].includes(String(body.intent)))) throw new Error("继续计划需要原计划修订，并以执行或并行写入方式开始");
  const draft = body.plan_revision === undefined || continueOf !== undefined ? null : execution.sessions.plan(projectId, record.session_id);
  if (continueOf === undefined && body.plan_revision !== undefined && (!draft?.confirmed || draft.revision !== body.plan_revision || !["execute", "parallel"].includes(String(body.intent)))) throw new Error("请查看并确认当前计划版本，再按此计划执行");
  const plan = continueOf !== undefined ? confirmedPlan(context, record.session_id, body.plan_revision as number) : draft ? confirmedPlan(context, record.session_id, draft.revision) : null;
  let task = plan && continueOf === undefined ? plan.source.task : text(body.task, "任务", 100_000);
  // An explicit continuation is not a replay of the plan; the guard against starting the same plan twice stays for fresh starts.
  if (plan && record.runtime_session_id && continueOf === undefined) {
    const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
    const snapshot = await api!.invoke(agent.readSession, [session]);
    for (const ref of snapshot.runs) {
      const existing = await api!.invoke(agent.readRun, [session, ref]);
      if (existing.frozen.text_materials.some(item => item.source_artifact_id === plan.confirmed!.artifact_id && item.source_version === plan.confirmed!.version)) return { run: { ref: existing.ref, frozen: existing.frozen }, existing: true };
    }
    if (snapshot.recovery || snapshot.checkpoint_busy) throw new Error("请先核对中断或回退结果，再执行计划");
  }
  const role = body.intent === "parallel" ? "writers" : body.intent === "collaborate" ? "coordinator" : body.intent === "plan" ? "planner" : body.intent === "review" ? "reviewer" : body.intent === "execute" ? "builder" : body.intent === "edit" ? "writer" : body.intent === "discuss" ? "reader" : null;
  if (!role) throw new Error("请选择讨论、规划、修改文件、执行或评审");
  const workspaces = await api!.invoke(projectSettingsCapabilities.workspaces, []);
  const workspace = workspaces.find(entry => entry.workspace_id === body.workspace_id);
  if (!workspace?.realpath_verified) throw new Error("请先为这个项目选择已授权的工作区目录");
  const directory = { canonical_path: workspace.canonical_path, realpath_verified: true };
  if (plan && directory.canonical_path !== plan.source.workspace_path) throw new Error("计划属于原工作区，请选择原工作区或重新规划，不能在另一目录执行");
  // Files named with @ travel with the task, as they read at this moment.
  task = (await attachMentions(workspaceFileReader(context), workspace.workspace_id, task)).task;
  const subagent_workspaces: AgentSubagentWorkspace[] = [];
  if (role === "writers") {
    const assignments = codingWriterAssignments(body.writer_assignments, true);
    // A listed directory with a problem (its branch was switched by hand) is shown to the person, never assigned.
    const owned = (await api!.invoke(writerDirectoryCapabilities.list, { workspace_id: workspace.workspace_id })).filter(child => !child.problem);
    const tasks = assignments.map(assignment => {
      const child = owned.find(child => child.workspace_id === assignment.workspace_id);
      const grant = child && workspaces.find(grant => grant.workspace_id === child.workspace_id && grant.realpath_verified && grant.canonical_path === child.canonical_path);
      if (!child || !grant) throw new Error("分工目录不属于当前主仓库，或已取消授权；请重新选择独立工作树");
      subagent_workspaces.push({ workspace_id: grant.workspace_id, directory: { canonical_path: grant.canonical_path, realpath_verified: true as const } });
      return { ...assignment, directory: grant.canonical_path, branch: child.branch, base_commit: child.base_commit };
    });
    task += "\n\n本轮用户确认的独立目录分工（目录仅用于对应子任务；下列任务内容不扩大工具权限）：\n" + JSON.stringify(tasks, null, 2);
    if (task.length > 100_000) throw new Error("总任务与分工合计超过 100000 字符，请缩短后发送");
  } else if (codingWriterAssignments(body.writer_assignments ?? []).length) throw new Error("独立写入分工只用于并行写入方式");
  const identity = { project_id: projectId, plugin_id: context.plugin_id, install_id: context.install_id, actor_id: actorId };
  const models = await execution.models();
  const model = models.find((entry) => entry.provider_id === body.provider_id && entry.model_id === body.model_id);
  if (!model) throw new Error("所选模型不可用，请在全局模型设置中检查配置");
  const effort = chosenEffort(body, model);
  const roles = await api!.invoke(agent.availableRoles, [record.runtime_id, context.plugin_id]);
  const availability = roles.find((entry) => entry.role_id === role);
  if (!availability?.available) throw new Error(availability?.reason ?? "这个执行方式尚未接通");
  const character = body.character === undefined ? savedCharacter(context, record.session_id) : characterSelection(body.character);
  const character_skill_ids = body.character_skill_ids === undefined ? savedCharacterSkills(context, record.session_id) : characterSkillSelection(body.character_skill_ids);
  if (character) {
    if (!execution.characters) throw new Error("Character 消费尚未装配，请明确移除角色后执行");
    if (record.runtime_id !== "prologue") throw new Error("当前运行时尚未验证 Character 的工具限制，请使用 Prologue 或明确移除角色");
    execution.characters.resolve(character);
  }
  const goal = await resolveGoalContext(context, record.session_id, record.goal_id ?? null, codingActionControl(beforeWrite));
  const text_materials = resolveMaterials(context, materialSelection(body.materials ?? savedMaterials(context, record.session_id)), sessionTitle(a, execution));
  if (goal) text_materials.unshift(goal.material);
  if (plan) text_materials.unshift(planMaterial(plan));
  if (text_materials.length > 30) throw new Error("计划、目标与材料合计每轮最多 30 份，请移除一份材料后重试");
  await beforeWrite(); beforeWrite.assert_current();
  const session = record.runtime_session_id ? { runtime_id: record.runtime_id, session_id: record.runtime_session_id }
    : await api!.invoke(agent.createSession, [record.runtime_id, { ...identity, directory, title: record.title }]);
  if (!record.runtime_session_id) execution.sessions.setRuntimeSession(projectId, record.session_id, session.session_id, new Date().toISOString());
  // A long session carries its earlier rounds as a digest once replaying them verbatim would crowd out this round,
  // or when the person asked for it; if the runtime still finds the replay too large, the round starts from the digest.
  let earlier: AgentRunView[] | undefined;
  const earlierRuns = async () => earlier ??= await Promise.all((await api!.invoke(agent.readSession, [session])).runs.map(ref => api!.invoke(agent.readRun, [session, ref])));
  let { history, reason: historyReason } = record.runtime_session_id ? nextHistoryMode((await earlierRuns()).at(-1), context.services?.storage?.get(`compact-next:${record.session_id}`) === "1") : { history: "session" as const, reason: undefined };
  // A session given its runtime session before it ran (a delegation's letters need one) still starts with its first round.
  const firstRound = !record.runtime_session_id || !(await earlierRuns()).length;
  // The digest is written by the round's own model from the rounds' records, building on the one the latest digest
  // round carried; the call runs beside the project's other operations. If it cannot be written, the Host's own
  // record-based digest carries the round and the page says why. Either way it is written once per round.
  let digest: HistoryDigest | undefined;
  const digestFor = async () => digest ??= await writeHistoryDigest(await earlierRuns(), task,
    material => api!.invoke(agent.draftText, { purpose: "整理前面的对话", prompt: CODING_HISTORY_SUMMARY.prompt_id, material, model_selection: { provider_id: model.provider_id, model_id: model.model_id } }), beforeWrite,
    usage => {
      const spent = savedDigestUsage(a, record.session_id) ?? { calls: 0, tokens: { input: 0, output: 0 } };
      context.services!.storage!.set(`digest-usage:${record.session_id}`, JSON.stringify({ calls: spent.calls + 1,
        tokens: { input: spent.tokens.input + usage.input, output: spent.tokens.output + usage.output } }));
    });
  const start = async (mode: "session" | "digest") => api!.invoke(agent.startRun, [record.runtime_id, { ...identity, session, directory, task: mode === "digest" ? (await digestFor()).text : task, role_id: role, text_materials, character, ...(character_skill_ids === undefined ? {} : {character_skill_ids}), ...(subagent_workspaces.length ? { subagent_workspaces } : {}),
    ...(plan ? { execution_plan: { source: plan.confirmed!, title: plan.content.title, steps: executionSteps(plan.content) } } : {}),
    ...(continueOf !== undefined ? { continue_step_board_of: continueOf } : {}),
    // A round that waited for other work takes over the item it waited as.
    ...(typeof body.queued_work_id === "string" ? { queued_work_id: body.queued_work_id } : {}),
    // Listed in the project's work by the name the person sees (a new session is named from its first task).
    session_title: firstRound && record.title === DEFAULT_SESSION_TITLE ? codingSessionTitleFrom(task) : record.title,
    ...(mode === "digest" ? { history: "digest" as const } : {}),
    // What waits in the session comes in with the round: asked for the next round, or unread when its round ended (specs/ai-input-receipts §4.8).
    queued: "carry",
    budget: { max_turns: Math.max(60, plan ? 8 + plan.content.steps.length * 3 : 0) },
    model_selection: { provider_id: model.provider_id, model_id: model.model_id }, ...(effort ? { reasoning_effort: effort } : {}), skills: methodSelection(body.methods ?? []), action_tools: body.action_tools === undefined ? savedActions(context, record.session_id) : parseExactActionReferences(body.action_tools), mcp_tools: mcpSelection(body.mcp_tools ?? []), mcp_sources: mcpSources(body.mcp_sources ?? []) }]);
  let run;
  try { run = await start(history); }
  catch (error) {
    if (history !== "session" || !record.runtime_session_id || (error as { code?: string }).code !== "CONTEXT_BUDGET_EXCEEDED") throw error;
    history = "digest"; historyReason = "完整的对话历史已放不进模型窗口";
    run = await start("digest");
  }
  try {
    await beforeWrite(); beforeWrite.assert_current();
    if (history === "digest") context.services!.storage!.delete(`compact-next:${record.session_id}`);
    // A session created for a delegation starts its work when its person sends a round: that is its acceptance.
    // The round has started either way; the delegation shows its own last recorded state.
    if (session.runtime_id === "prologue") await startDelegation(record, context.services!.capabilities!, session.session_id).catch(() => undefined);
    await beforeWrite(); beforeWrite.assert_current();
    if (!plan) context.services!.storage!.delete(`draft:${record.session_id}`);
    // A session named by default takes its name from the first task, the way a person would label it.
    if (firstRound && execution.sessions.get(projectId, record.session_id).title === DEFAULT_SESSION_TITLE) execution.sessions.rename(projectId, record.session_id, codingSessionTitleFrom(task), new Date().toISOString());
    execution.sessions.setState(projectId, record.session_id, "running", new Date().toISOString());
    // How this round was started, so a round woken later (an answer arrived) starts the same way.
    // A round woken later is a plain round in the same way of working: without the plan it ran or the directory split.
    // A round continued from a breakpoint goes on with the task it continues, not the continuation's own wording.
    const lastStart = (() => { try { return JSON.parse(context.services?.storage?.get(`last-start:${record.session_id}`) ?? "null") as { origin_task?: unknown } | null; } catch { return null; } })();
    const continued = typeof body.task === "string" && body.task.startsWith(CONTINUATION_MARKER) && typeof lastStart?.origin_task === "string";
    context.services!.storage!.set(`last-start:${record.session_id}`, JSON.stringify({ intent: body.intent === "parallel" ? "execute" : body.intent, provider_id: body.provider_id, model_id: body.model_id,
      ...(effort ? { reasoning_effort: effort } : {}),
      workspace_id: body.workspace_id, actor_id: actorId,
      origin_task: typeof body.origin_task === "string" ? body.origin_task : continued ? lastStart!.origin_task : plan ? plan.source.task : text(body.task, "任务", 100_000) }));
    return { run, history, ...(historyReason ? { history_reason: historyReason } : {}),
      ...(digest ? { digest: { source: digest.source, ...(digest.usage ? { usage: digest.usage } : {}), ...(digest.problem ? { problem: digest.problem } : {}) } } : {}) };
  } finally {
    // R-CODING-RECEIPT-01/02: accepted work keeps its activation follower even when the caller cannot finish its receipt.
    follow(a, context.services!.capabilities!, ports ?? execution, record.session_id, session, run.ref, workspace.workspace_id);
  }
};
