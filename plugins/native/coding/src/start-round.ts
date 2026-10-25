import { parseExactActionReferences } from "@molis-ai/molis-work-contracts/platform/actions";
import { writerDirectoryCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { agentHostCapabilities as agent, type AgentRunView, type AgentSubagentWorkspace } from "@molis-ai/molis-work-contracts/services/agent-host";
import { characterSelection, characterSkillSelection, savedCharacter, savedCharacterSkills } from "./characters.js";
import { CONTINUATION_MARKER } from "./continuation.js";
import { codingDraft } from "./drafts.js";
import { CODING_RUN_UPDATED_EVENT } from "./events.js";
import { resolveGoalContext } from "./goal-context.js";
import { WRITER_SPLIT_HEAD } from "./writer-split.js";
import { nextHistoryMode, writeHistoryDigest, type HistoryDigest } from "./history-digest.js";
import { knowledgeCatalogMaterial, withKnowledgeTools } from "./knowledge-tools.js";
import { materialSelection, resolveMaterials, savedMaterials } from "./materials.js";
import { MODEL_UNAVAILABLE } from "./models.js";
import { attachMentions, workspaceFileReader } from "./mentions.js";
import { executionSteps } from "./plan-content.js";
import { confirmedPlan, planMaterial } from "./plans.js";
import { reaskMaterial } from "./reask.js";
import { QUESTION_REASK } from "@molis-ai/molis-work-plugin-sdk";
import { limitsCharacters } from "./runtime-choice.js";
import { CODING_HISTORY_SUMMARY } from "./prompts.js";
import { type Capabilities, type CodingActivation, savedDigestUsage, sessionState } from "./route-activation.js";
import { codingActions, codingActionControl, type CodingBeforeWrite } from "./route-entry.js";
import { methodSelection, mcpSelection, mcpSources, savedActions } from "./route-selections.js";
import type { CodingExecution } from "./routes.js";
import { startDelegation } from "./routes-delegations.js";
import { chosenEffort, text } from "./run-inputs.js";
import { codingSessionTitleFrom, DEFAULT_SESSION_TITLE } from "./session-title.js";
import type { CodingSessionRecord } from "./store.js";
import { continuedBody } from "./waits.js";
import { codingWriterAssignments } from "./writers.js";
import { codingFailure, codingText } from "./words.js";

const SETTLED = ["completed", "failed", "stopped", "cancelled", "reconcile-required"];

// A round started here is followed until it settles, so the session's recorded state — which the directory and the
// cross-project background list read — stays right while no page is open. The follower is the activation's `follow` job
// (PG-038): kept by the call that asks for the Run, before it asks, so no Run is accepted without one, and begun once that
// call has recorded its receipt. It holds the installation's own authority, never the call's: a call cancelled or revoked once
// its Run was accepted still has that Run followed (R-CODING-RECEIPT-02). One follower per session; a newer round's replaces
// it, and the plugin stopping ends it (its signal ends the wait under way, and each write asks the job first).
const follow = (a: CodingActivation, execution: CodingExecution, sessionId: string, session: { runtime_id: string; session_id: string }, workspaceId: string) => {
  const { context, projectId, following } = a;
  if (!context.services?.background) throw new Error("宿主没有提供后台作业（services.background），跟不住这一轮，不开始");
  let begin!: (accepted: { run: { session_id: string; run_id: string }; receipted: boolean } | null) => void;
  const accepted = new Promise<Parameters<typeof begin>[0]>(resolve => { begin = resolve; });
  const job = context.services.background.keep("follow", async control => {
    const round = await accepted;
    if (!round) return;
    const api = context.services!.actions!, { run } = round;
    let since: string | null = null;
    for (;;) {
      // As the installation (R8): the job's signal ends the wait, and its check drops an answer that arrives after the job lost its authority.
      const waited: { version: string; view: AgentRunView } = await context.services!.actions!.invoke(agent.waitRun, [session, run, since, 25_000],
        { signal: control.signal, beforeEffect: control.beforeEffect });
      control.signal.throwIfAborted();
      const view = waited.view;
      since = waited.version;
      const record = execution.sessions.get(projectId, sessionId), next = sessionState(view);
      if (next !== record.state) await execution.sessions.setState(control.beforeEffect, projectId, sessionId, next, record.updated_at);
      if (!SETTLED.includes(view.phase)) continue;
      // Notification only: terminal does not mean every tool succeeded or that a file changed.
      // The activation-owned events client rejects publication after stop/revocation.
      try { context.services?.events?.publish({ event_type_id: CODING_RUN_UPDATED_EVENT, type_version: 1,
        payload: { workspace_id: workspaceId, session_id: session.session_id, run_id: run.run_id, phase: view.phase } }); }
      catch { /* A missed UI hint must never retry or reclassify an already executed Run. */ }
      // A round that ended parked (waiting for an answer or a command) shows as waiting from here on.
      if (view.phase !== "reconcile-required" && await a.waits.openWaitOf(execution.sessions.get(projectId, sessionId)).catch(() => undefined)) {
        await execution.sessions.setState(control.beforeEffect, projectId, sessionId, "queued", new Date().toISOString());
        // A call refused after its Run was accepted has that Run's result recorded, and nothing set off in its name: the loop that
        // would start the next round is not asked for here (§12.10).
        if (round.receipted) a.waits.wakeLoop(api, execution, session.runtime_id);
      }
      return;
    }
  });
  return {
    /** The Run was accepted: follow it from here. `receipted`: the call that asked for it recorded its receipt. */
    begin(run: { session_id: string; run_id: string }, receipted: boolean) {
      following.get(sessionId)?.cancel();
      following.set(sessionId, job);
      void job.done.catch(() => undefined).finally(() => { if (following.get(sessionId) === job) following.delete(sessionId); });
      begin({ run, receipted });
    },
    /** No Run was accepted: the job ends having written nothing. */
    cancel() { begin(null); job.cancel(); },
  };
};

/**
 * Start a round in a session: from the person's send, or later from a queued round when the work it waited for is
 * done. The same checks run either way; nothing about a queued round is decided at the moment it starts.
 */
export const startRound = async (a: CodingActivation, record: CodingSessionRecord, body: Record<string, unknown>,
  // A round woken by the activation's own loop (an answer arrived, a wait ended) answers to that loop's job (wake-loop.ts).
  api: Capabilities, execution: CodingExecution, beforeWrite: CodingBeforeWrite) => {
  const { context, projectId } = a;
  // Continuing an earlier round's unfinished graph uses that round's own confirmed revision, whatever the draft is now.
  const continueOf = body.continue_step_board_of === undefined ? undefined : text(body.continue_step_board_of, "coding.field.continued-run", 200);
  if (continueOf !== undefined && (typeof body.plan_revision !== "number" || !Number.isSafeInteger(body.plan_revision) || !["execute", "parallel"].includes(String(body.intent)))) throw codingFailure("coding.server.continue-plan");
  const draft = body.plan_revision === undefined || continueOf !== undefined ? null : execution.sessions.plan(projectId, record.session_id);
  if (continueOf === undefined && body.plan_revision !== undefined && (!draft?.confirmed || draft.revision !== body.plan_revision || !["execute", "parallel"].includes(String(body.intent)))) throw codingFailure("coding.server.plan-confirm-first");
  const plan = continueOf !== undefined ? confirmedPlan(context, record.session_id, body.plan_revision as number) : draft ? confirmedPlan(context, record.session_id, draft.revision) : null;
  // 「请 AI 重新问」: the Host writes the round's words; the page names only the question.
  let task = plan && continueOf === undefined ? plan.source.task : body.reask !== undefined ? QUESTION_REASK.task : text(body.task, "coding.field.task", 100_000);
  // An explicit continuation is not a replay of the plan; the guard against starting the same plan twice stays for fresh starts.
  if (plan && record.runtime_session_id && continueOf === undefined) {
    const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
    const snapshot = await codingActions(a.context, beforeWrite).invoke(agent.readSession, [session]);
    for (const ref of snapshot.runs) {
      const existing = await codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, ref]);
      if (existing.frozen.text_materials.some(item => item.source_artifact_id === plan.confirmed!.artifact_id && item.source_version === plan.confirmed!.version)) return { run: { ref: existing.ref, frozen: existing.frozen }, existing: true };
    }
    if (snapshot.recovery || snapshot.checkpoint_busy) throw codingFailure("coding.server.check-before-plan");
  }
  const role = body.intent === "parallel" ? "writers" : body.intent === "collaborate" ? "coordinator" : body.intent === "plan" ? "planner" : body.intent === "review" ? "reviewer" : body.intent === "execute" ? "builder" : body.intent === "edit" ? "writer" : body.intent === "discuss" ? "reader" : null;
  if (!role) throw codingFailure("coding.server.pick-intent");
  const workspaces = await api!.invoke(projectSettingsCapabilities.workspaces, []);
  const workspace = workspaces.find(entry => entry.workspace_id === body.workspace_id);
  if (!workspace?.realpath_verified) throw codingFailure("coding.server.authorize-workspace");
  const directory = { canonical_path: workspace.canonical_path, realpath_verified: true };
  if (plan && directory.canonical_path !== plan.source.workspace_path) throw codingFailure("coding.server.plan-workspace");
  // Files named with @ travel with the task, as they read at this moment.
  task = (await attachMentions(workspaceFileReader(context), workspace.workspace_id, task)).task;
  const subagent_workspaces: AgentSubagentWorkspace[] = [];
  if (role === "writers") {
    const assignments = codingWriterAssignments(body.writer_assignments, true);
    // A listed directory with a problem (its branch was switched by hand) is shown to the person, never assigned.
    const owned = (await context.services!.actions!.invoke(writerDirectoryCapabilities.list, { workspace_id: workspace.workspace_id }, codingActionControl(beforeWrite))).filter(child => !child.problem);
    const tasks = assignments.map(assignment => {
      const child = owned.find(child => child.workspace_id === assignment.workspace_id);
      const grant = child && workspaces.find(grant => grant.workspace_id === child.workspace_id && grant.realpath_verified && grant.canonical_path === child.canonical_path);
      if (!child || !grant) throw codingFailure("coding.server.worktree-unauthorized");
      subagent_workspaces.push({ workspace_id: grant.workspace_id, directory: { canonical_path: grant.canonical_path, realpath_verified: true as const } });
      return { ...assignment, directory: grant.canonical_path, branch: child.branch, base_commit: child.base_commit };
    });
    task += WRITER_SPLIT_HEAD + JSON.stringify(tasks, null, 2);
    if (task.length > 100_000) throw codingFailure("coding.server.task-too-long");
  } else if (codingWriterAssignments(body.writer_assignments ?? []).length) throw codingFailure("coding.server.parallel-only");
  // The one model list the platform keeps (`services.model`, PG-047): the chosen model must be on it and able to run now.
  const model = execution.models.list().find((entry) => entry.provider_id === body.provider_id && entry.model_id === body.model_id);
  const modelRefusal = model ? execution.models.unavailable(model) : MODEL_UNAVAILABLE;
  if (!model || modelRefusal !== undefined) throw new Error(modelRefusal);
  const effort = chosenEffort(body, model);
  const roles = await codingActions(context, beforeWrite).invoke(agent.availableRoles, [record.runtime_id]);
  const availability = roles.find((entry) => entry.role_id === role);
  if (!availability?.available) throw availability?.reason ? new Error(availability.reason) : codingFailure("coding.server.role-unavailable");
  const character = body.character === undefined ? savedCharacter(context, record.session_id) : characterSelection(body.character);
  const character_skill_ids = body.character_skill_ids === undefined ? savedCharacterSkills(context, record.session_id) : characterSkillSelection(body.character_skill_ids);
  let characterTools: readonly import("@molis-ai/molis-work-contracts/platform/actions").ExactActionReference[] | null | undefined;
  if (character) {
    if (!limitsCharacters(await codingActions(context, beforeWrite).invoke(agent.listRuntimes, []), record.runtime_id)) throw codingFailure("coding.server.character-unverified");
    characterTools = await execution.characters.actionTools(character, codingActionControl(beforeWrite));
  }
  const action_tools = withKnowledgeTools(body.action_tools === undefined ? savedActions(context, record.session_id) : parseExactActionReferences(body.action_tools),
    await codingActions(context, beforeWrite).invoke(agent.listActions, [record.runtime_id]), characterTools);
  const goal = await resolveGoalContext(context, record.session_id, record.goal_id ?? null, codingActionControl(beforeWrite));
  const text_materials = await resolveMaterials(context, materialSelection(body.materials ?? savedMaterials(context, record.session_id)), codingActionControl(beforeWrite));
  if (goal) text_materials.unshift(goal.material);
  if (plan) text_materials.unshift(planMaterial(plan));
  // 「请 AI 重新问」: the closed question and the person's draft, read here, never from the request.
  if (body.reask !== undefined) text_materials.push(await reaskMaterial(context, record, body.reask, codingActions(context, beforeWrite)));
  if (text_materials.length > 30) throw codingFailure("coding.server.materials-30");
  const catalog = await knowledgeCatalogMaterial(context.services?.actions, action_tools, `${record.title}\n${task}`, record.session_id, codingActionControl(beforeWrite));
  if (catalog) text_materials.push(catalog);
  await beforeWrite(); beforeWrite.assert_current();
  const session = record.runtime_session_id ? { runtime_id: record.runtime_id, session_id: record.runtime_session_id }
    : await codingActions(a.context, beforeWrite).invoke(agent.createSession, [record.runtime_id, { directory, title: record.title }]);
  if (!record.runtime_session_id) await execution.sessions.setRuntimeSession(beforeWrite, projectId, record.session_id, session.session_id, new Date().toISOString());
  // A long session carries its earlier rounds as a digest once replaying them verbatim would crowd out this round,
  // or when the person asked for it; if the runtime still finds the replay too large, the round starts from the digest.
  let earlier: AgentRunView[] | undefined;
  const earlierRuns = async () => earlier ??= await Promise.all((await codingActions(a.context, beforeWrite).invoke(agent.readSession, [session])).runs.map(ref => codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, ref])));
  let { history, reason: historyReason } = record.runtime_session_id ? nextHistoryMode((await earlierRuns()).at(-1), context.services?.storage?.get(`compact-next:${record.session_id}`) === "1") : { history: "session" as const, reason: undefined };
  // A session given its runtime session before it ran (a delegation's letters need one) still starts with its first round.
  const firstRound = !record.runtime_session_id || !(await earlierRuns()).length;
  // The digest is written by the round's own model from the rounds' records, building on the one the latest digest
  // round carried; the call runs beside the project's other operations. If it cannot be written, the Host's own
  // record-based digest carries the round and the page says why. Either way it is written once per round.
  let digest: HistoryDigest | undefined;
  const digestFor = async () => digest ??= await writeHistoryDigest(await earlierRuns(), task,
    material => codingDraft(context, { purpose: "整理前面的对话", prompt: CODING_HISTORY_SUMMARY.prompt_id, material, model_selection: { provider_id: model.provider_id, model_id: model.model_id } }, beforeWrite), beforeWrite,
    usage => {
      const spent = savedDigestUsage(a, record.session_id) ?? { calls: 0, tokens: { input: 0, output: 0 } };
      context.services!.storage!.set(`digest-usage:${record.session_id}`, JSON.stringify({ calls: spent.calls + 1,
        tokens: { input: spent.tokens.input + usage.input, output: spent.tokens.output + usage.output } }));
    });
  const start = async (mode: "session" | "digest") => codingActions(a.context, beforeWrite).invoke(agent.startRun, [record.runtime_id, { session, directory, task: mode === "digest" ? (await digestFor()).text : task, role_id: role, text_materials, character, ...(character_skill_ids === undefined ? {} : {character_skill_ids}), ...(subagent_workspaces.length ? { subagent_workspaces } : {}),
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
    model_selection: { provider_id: model.provider_id, model_id: model.model_id }, ...(effort ? { reasoning_effort: effort } : {}), skills: methodSelection(body.methods ?? []), action_tools, mcp_tools: mcpSelection(body.mcp_tools ?? []), mcp_sources: mcpSources(body.mcp_sources ?? []) }]);
  const follower = follow(a, execution, record.session_id, session, workspace.workspace_id);
  let run, receipted = false;
  try { run = await start(history).catch(async error => {
    if (history !== "session" || !record.runtime_session_id || (error as { code?: string }).code !== "CONTEXT_BUDGET_EXCEEDED") throw error;
    history = "digest"; historyReason = "完整的对话历史已放不进模型窗口";
    return start("digest");
  }); } catch (error) { follower.cancel(); throw error; }
  try {
    await beforeWrite(); beforeWrite.assert_current();
    if (history === "digest") context.services!.storage!.delete(`compact-next:${record.session_id}`);
    // A session created for a delegation starts its work when its person sends a round: that is its acceptance.
    // The round has started either way; the delegation shows its own last recorded state.
    // A Runtime without letters between sessions has none to accept: the read comes back empty.
    await startDelegation(record, codingActions(context, beforeWrite), session.session_id).catch(() => undefined);
    await beforeWrite(); beforeWrite.assert_current();
    if (!plan) context.services!.storage!.delete(`draft:${record.session_id}`);
    // A session named by default takes its name from the first task, the way a person would label it.
    // The name and the running state are one write: the directory never shows the new name beside the old state.
    await execution.sessions.roundStarted(beforeWrite, projectId, record.session_id, new Date().toISOString(), firstRound ? { from: DEFAULT_SESSION_TITLE, to: codingSessionTitleFrom(task) } : null);
    // How this round was started, so a round woken later (an answer arrived) starts the same way.
    // A round woken later is a plain round in the same way of working: without the plan it ran or the directory split.
    // A round continued from a breakpoint goes on with the task it continues, not the continuation's own wording.
    const lastStart = (() => { try { return JSON.parse(context.services?.storage?.get(`last-start:${record.session_id}`) ?? "null") as { origin_task?: unknown } | null; } catch { return null; } })();
    const continued = typeof body.task === "string" && body.task.startsWith(CONTINUATION_MARKER) && typeof lastStart?.origin_task === "string";
    context.services!.storage!.set(`last-start:${record.session_id}`, JSON.stringify({ intent: body.intent === "parallel" ? "execute" : body.intent, provider_id: body.provider_id, model_id: body.model_id,
      ...(effort ? { reasoning_effort: effort } : {}),
      workspace_id: body.workspace_id,
      origin_task: typeof body.origin_task === "string" ? body.origin_task : continued ? lastStart!.origin_task : plan ? plan.source.task : body.reask !== undefined ? QUESTION_REASK.task : text(body.task, "coding.field.task", 100_000) }));
    receipted = true;
    return { run, history, ...(historyReason ? { history_reason: historyReason } : {}),
      ...(digest ? { digest: { source: digest.source, ...(digest.usage ? { usage: digest.usage } : {}), ...(digest.problem ? { problem: digest.problem } : {}) } } : {}) };
  } finally {
    // R-CODING-RECEIPT-01/02: accepted work keeps its follower even when the caller cannot finish its receipt.
    follower.begin(run.ref, receipted);
  }
};

/**
 * The next round after the person answered a round parked at a restart (BL-156): started the way the parked round was
 * (`last-start:<session>`) by the one who answered (the caller, as the Host knows it from the call), it takes the answer from the session's queue. Refused, the answer stays queued and the reason is
 * returned; 「从断点继续」 starts it later. A session still being recovered is read once and the round tried once more.
 */
export const roundAfterParkedAnswer = async (a: CodingActivation, record: CodingSessionRecord, session: { runtime_id: string; session_id: string },
  api: Capabilities, execution: CodingExecution, beforeWrite: CodingBeforeWrite): Promise<{ started: true; run_id: string } | { started: false; reason: string }> => {
  const saved = (() => { try { return JSON.parse(a.context.services?.storage?.get(`last-start:${record.session_id}`) ?? "null") as Record<string, unknown> | null; } catch { return null; } })();
  if (!saved) return { started: false, reason: codingText(execution.locale)("coding.server.start-unknown") };
  const body = continuedBody(saved, "服务重启前你问我的问题，我已经回答，回答附在后面。");
  const start = () => startRound(a, record, body, api, execution, beforeWrite);
  const reason = (error: unknown) => error instanceof Error ? error.message : String(error);
  try { return { started: true, run_id: (await start()).run.ref.run_id }; } catch (error) {
    if ((error as { code?: unknown }).code !== "agent.session_busy") return { started: false, reason: reason(error) };
  }
  await codingActions(a.context, beforeWrite).invoke(agent.inspectRecovery, [session]).catch(() => undefined);
  try { return { started: true, run_id: (await start()).run.ref.run_id }; } catch (error) { return { started: false, reason: reason(error) }; }
};
