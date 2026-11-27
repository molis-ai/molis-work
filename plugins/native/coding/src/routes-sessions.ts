import { changeCodingSessionLifecycle } from "./session-lifecycle.js";
import { codingSessionEntry, codingSessionSubject } from "./session-source.js";
import { readCodingSessions } from "./session-observation.js";
import { characterSelection, characterSkillSelection, saveCharacter } from "./characters.js";
import { materialSelection, resolveMaterials, savedMaterials } from "./materials.js";
import { confirmedPlan } from "./plans.js";
import { type Capabilities, type CodingActivation, selected, sessionState } from "./route-activation.js";
import { codingActions, codingActionControl, type CodingBeforeWrite } from "./route-entry.js";
import { codingError, codingFailure, codingText } from "./words.js";
import { bodyOf, skillSelection, mcpSelection, mcpSources, unlessMissing } from "./route-selections.js";
import type { CodingExecution } from "./routes.js";
import { chosenEffort, nextConfiguration, runControl, text, codingBudgetSelection } from "./run-inputs.js";
import { projectRuntime, requireProjectRuntime, runtimeDirectory, supports } from "./runtime-choice.js";
import { DEFAULT_SESSION_TITLE, codingSessionTitleFrom } from "./session-title.js";
import { chosenWorktree, roleForIntent, roundAfterParkedAnswer, startRound } from "./start-round.js";
import { codingSkillChoices } from "./skill-choices.js";
import { codingInputPatch } from "./inputs.js";
import { modelUnavailableMessage } from "./models.js";
import { roundImages } from "./routes-images.js";
import { codingWriterAssignments } from "./writers.js";
import type { CodingSessionRecord } from "./store.js";
import type { CodingSessionState } from "./projection.js";
import { projectDirectories, projectFolders } from "./project-folders.js";
import { inspectCodingEnvironment } from "./environment-prep.js";
import { ActionError, defineErrorCodes, parseExactActionReferences, searchEntriesPage } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, agentTextMaterialContent, isTerminalAgentPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentInputActions } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { QUESTION_REASK } from "@molis-ai/molis-work-plugin-sdk";

/** A control for a round this session does not have, or for one that has ended (a second tab answering after the first, AC-08). */
const codingRunErrors = defineErrorCodes("coding", { run_not_found: "not_found", round_ended: "conflict" });


/** Coding routes for sessions and their rounds: the directory, creating and changing a session, starting, queueing and steering a round. */

/** What this file refuses about a session that is archived, busy, or not waiting: each code says what sort of refusal it is (W3-02). */
const codingSessionErrors = defineErrorCodes("coding", {
  session_busy: "conflict",
  archived_edit: "conflict",
  archived_run: "conflict",
  waiting: "conflict",
  wait_round_open: "conflict",
  not_waiting: "conflict",
  never_run: "conflict",
  wait_target_gone: "not_found",
  question_drafts_long: "too_large",
  choose_workspace: "invalid",
  compact_unclear: "invalid",
  compact_nothing: "invalid",
  materials_busy: "conflict",
  question_drafts_invalid: "invalid",
  draft_invalid: "invalid",
  budget_range: "invalid",
  wait_choose: "invalid",
});

/** A directory row's current SDK fact, through this installation's original owner-scoped Action. Drafts need no Runtime. */
const executionState = async (actions: ReturnType<typeof codingActions>, record: CodingSessionRecord) => record.runtime_session_id
  ? actions.invoke(agent.readSessionLifecycle, [{ runtime_id: record.runtime_id, session_id: record.runtime_session_id }]).then(view => view.state, () => null) : null;

// The directory reads current facts without changing any persistent record or starting background execution.
const readState = async (a: CodingActivation, api: Capabilities, execution: CodingExecution, beforeWrite: CodingBeforeWrite) => {
  const { context } = a, actions = codingActions(context, beforeWrite);
  const directory = await runtimeDirectory(actions, api), { runtimes } = directory;
  const sessions = await readCodingSessions(a, execution, beforeWrite);
  // The MCP servers are the project's Runtime's, and only what its own capability matrix offers (PG-054).
  const { runtime: library } = projectRuntime(directory);
  const mcp = library && supports(library, "mcp") ? await actions.invoke(agent.listMcp, [library.runtime_id]) : [];
  const folders = await unlessMissing(projectDirectories(api), null);
  const shown = await Promise.all(sessions.map(async record => ({ ...record, execution_state: await executionState(actions, record) })));
  const outputWorkspace = folders?.directories.find(folder => folder.roles.includes("output")) ?? null;
  return { sessions: shown, skills: await codingSkillChoices(a, actions), mcp, models: execution.models.list(),
    // The Runtime a new session runs on; the page reads the role matrix of the open session's Runtime, or this one when none is open.
    project_runtime_id: library?.runtime_id ?? null,
    // Where the page's new rounds run unless the person picks another folder on the page: the project's output (SSC-17). Which folder
    // the page shows is the page's own state, never a setting (specs/shared-sources-and-surfaces §4).
    // A host without workspace settings offers none of these: sessions still list and open, and a round asks for a directory.
    workspace: outputWorkspace,
    workspaces: folders?.directories ?? [],
    // Whether the next round reads the output's instruction files, and if not why (batch12-design §3.7): the rules menu's buttons.
    ...(folders ? { instructions: folders.instructions } : {}),
    runtimes: await Promise.all(runtimes.map(async (runtime) => ({ ...runtime,
      roles: await actions.invoke(agent.availableRoles, [runtime.runtime_id]),
    }))),
  };
};

async function readWorkspaceEnvironment(
  a: CodingActivation,
  base: Awaited<ReturnType<typeof readState>>,
  requestedWorkspaceId: string | undefined,
  beforeWrite: CodingBeforeWrite,
) {
  const target = (requestedWorkspaceId ? base.workspaces.find(folder => folder.workspace_id === requestedWorkspaceId) : undefined) ?? base.workspace;
  if (!target?.realpath_verified) return null;
  const hasRunningSession = base.sessions.some(item => item.state === "running" || item.state === "waiting-approval" || item.state === "waiting-answer");
  const cacheKey = `${target.workspace_id}:${hasRunningSession ? "live" : "idle"}`;
  const cached = a.environmentChecks.get(cacheKey);
  if (cached && Date.now() - cached.at < 15_000) return cached.value;
  const forgetFailed = () => { if (a.environmentChecks.get(cacheKey)?.value === pending) a.environmentChecks.delete(cacheKey); };
  const pending = inspectCodingEnvironment(a.context, target.workspace_id, target.canonical_path, hasRunningSession, beforeWrite).then(value => {
    if (value?.status === "unavailable") forgetFailed();
    return value;
  }, error => { forgetFailed(); throw error; });
  a.environmentChecks.set(cacheKey, { at: Date.now(), value: pending });
  return pending;
}
/** The workspace a send names, as the directory it will run in. */
const directoryOf = async (api: Capabilities, workspaceId: unknown) => {
  const workspace = (await projectFolders(api)).find(entry => entry.workspace_id === workspaceId);
  if (!workspace?.realpath_verified) throw codingError(codingSessionErrors.choose_workspace, "coding.server.choose-workspace");
  return workspace.canonical_path;
};
/** Other sessions' work that overlaps what a send names: its text, and its plan's steps when it runs one. */
const overlapsFor = async (a: CodingActivation, api: Capabilities, execution: CodingExecution, record: CodingSessionRecord, body: Record<string, unknown>, beforeWrite: CodingBeforeWrite, directoryOverride?: string) => {
  const { context, projectId } = a;
  const directory = directoryOverride ?? await directoryOf(api, body.workspace_id);
  const draft = body.plan_revision !== undefined ? execution.sessions.plan(projectId, record.session_id) : null;
  const plan = draft?.confirmed ? confirmedPlan(context, record.session_id, draft.revision) : null;
  const text = [typeof body.task === "string" ? body.task : "", plan ? plan.source.task : "", ...(plan?.content.steps ?? []).map(step => `${step.title}\n${step.acceptance}`)].join("\n");
  const found = await codingActions(context, beforeWrite).invoke(agent.readProjectWork, [record.runtime_id, { ...(record.runtime_session_id ? { session_id: record.runtime_session_id } : {}), directory, text }]);
  const sessions = execution.sessions.list(projectId);
  return { directory, text, overlaps: found.overlaps.map(overlap => {
    const other = sessions.find(entry => entry.runtime_session_id === overlap.work.session_id);
    return { work_id: overlap.work.work_id, state: overlap.work.state, title: other?.title ?? overlap.work.title, task: overlap.work.task, paths: overlap.paths,
      session_id: other?.session_id ?? null, ...(overlap.work.run_id ? { run_id: overlap.work.run_id } : {}), runtime_session_id: overlap.work.session_id };
  }) };
};

type RouteMaker = (a: CodingActivation) => PluginRouteBinding | PluginRouteBinding[];

const ROUTES: RouteMaker[] = [
  a => a.route("coding.session-binding", async (request, _api, execution, beforeWrite) => {
    beforeWrite.assert_current();
    const record = execution.sessions.get(a.projectId, text(request.params.sessionId, "coding.field.session"));
    return { session_id: record.session_id, project_id: record.project_id, archived: record.archived,
      runtime: record.runtime_session_id ? { runtime_id: record.runtime_id, session_id: record.runtime_session_id } : null };
  }),
  a => a.route("coding.list-sessions", async (request, _api, execution, beforeWrite) => {
    const archived = request.query.archived;
    if (archived !== "true" && archived !== "false") throw new Error("请选择活动或已归档会话");
    beforeWrite.assert_current();
    const page = execution.sessions.page(a.projectId, archived === "true", request.query.limit === undefined ? 50 : Number(request.query.limit), request.query.cursor);
    const actions = codingActions(a.context, beforeWrite);
    return { ...page, sessions: await Promise.all(page.sessions.map(async record => ({ ...record, execution_state: await executionState(actions, record) }))) };
  }),
  (a) => {
    const { route } = a;
    return route("coding.state", async (request, api, execution, beforeWrite) => {
      // Every open page polls this, and each read asks the Host about every session, one call at a time in the
      // project's queue. However many pages ask, one read runs and at most one waits behind it; a request that arrives
      // mid-read gets the next one, so it still sees what was just changed. Each caller gets its own copy, plus the
      // environment readiness of the requested workspace (or the project's output folder by default).
      const run = () => { a.state.read = readState(a, api!, execution, beforeWrite).finally(() => { a.state.read = null; }); return a.state.read; };
      const basePromise = (!a.state.read
        ? run()
        : (a.state.next ??= a.state.read.catch(() => undefined).then(() => { a.state.next = null; return a.state.read ?? run(); }))) as Promise<Awaited<ReturnType<typeof readState>>>;
      const base = structuredClone(await basePromise);
      const requestedWorkspace = typeof request.query.workspace_id === "string" && request.query.workspace_id ? request.query.workspace_id : undefined;
      const environment_readiness = await readWorkspaceEnvironment(a, base, requestedWorkspace, beforeWrite);
      return environment_readiness ? { ...base, environment_readiness: structuredClone(environment_readiness) } : base;
    });
  },
  (a) => {
    const { projectId, route } = a;
    return route("coding.create-session", async (request, api, execution, beforeWrite) => {
      const body = bodyOf(request);
      // The project's picked Runtime, else the first one in the platform's directory that can host a session; with none, the session is refused and nothing is created.
      const runtime = requireProjectRuntime(await runtimeDirectory(codingActions(a.context, beforeWrite), api!));
      const record = await execution.sessions.create(beforeWrite, { project_id: projectId, session_id: crypto.randomUUID(),
        title: text(body.title ?? DEFAULT_SESSION_TITLE, "coding.field.session-title"), runtime_id: runtime.runtime_id, at: new Date().toISOString() });
      return { session: record };
    });
  },
  // What the session is and where it stands, for whoever holds a reference to it (the Assistant's work, a reference
  // in another plugin). Its revision moves with every round, so a holder can tell the session went on since.
  (a) => {
    const { projectId, route } = a;
    return route("coding.search-entries", async (request, _api, execution, beforeWrite) => {
      const records = execution.sessions.list(projectId).filter(record => !record.archived);
      await execution.goalTitles.read(records.flatMap(record => record.goal_id ? [record.goal_id] : []), beforeWrite);
      return searchEntriesPage(records.map(record => codingSessionEntry(record, record.goal_id ? execution.goalTitles.known(record.goal_id) : undefined)), { cursor: typeof request.query.cursor === "string" && request.query.cursor ? request.query.cursor : null,
        limit: Math.min(500, Math.max(1, Number(request.query.limit ?? 500) || 500)) });
    });
  },
  (a) => {
    const { route, projectId } = a;
    return route("coding.subject-state", async (request, _api, execution, _beforeWrite, control) => {
      const subject = { kind: "coding_session", id: request.params.sessionId ?? "" };
      const current = (): import("@molis-ai/molis-work-contracts/platform/actions").ActionSubjectCurrentState => {
        try {
          const record = execution.sessions.get(projectId, subject.id);
          return { subject, state: record.archived ? "archived" : "active", execution_session: record.runtime_session_id
            ? { runtime_id: record.runtime_id, session_id: record.runtime_session_id } : null };
        } catch (error) {
          if (error instanceof ActionError && error.code === "coding.session_unknown") return { subject, state: "deleted", execution_session: null };
          throw error;
        }
      };
      control?.provideSubjectState?.(current);
      const { state } = current();
      return { subject, state };
    });
  },
  (a) => a.route("coding.subject", (request, _api, execution, beforeWrite) => codingSessionSubject(a, request, execution, beforeWrite)),
  // Like /compact: the next round starts from the digest of earlier rounds instead of replaying them verbatim.
  (a) => {
    const { context, route } = a;
    return route("coding.compact-next", async (request, _api, execution) => {
      const record = selected(a, request, execution);
      const on = bodyOf(request).on;
      if (typeof on !== "boolean") throw codingError(codingSessionErrors.compact_unclear, "coding.server.compact-unclear");
      if (on && !record.runtime_session_id) throw codingError(codingSessionErrors.compact_nothing, "coding.server.compact-nothing");
      if (on) context.services!.storage!.set(`compact-next:${record.session_id}`, "1");
      else context.services!.storage!.delete(`compact-next:${record.session_id}`);
      return { compact_requested: on };
    });
  },
  (a) => {
    const { context, projectId, busy, route } = a;
    return route("coding.update-session", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      const body = bodyOf(request);
      if (typeof body.archive === "boolean") return { session: await changeCodingSessionLifecycle(a, execution, record, body.archive, beforeWrite) };
      if (record.archived) throw codingError(codingSessionErrors.archived_edit, "coding.server.archived-edit");
      const inputPatch=codingInputPatch(execution.sessions.inputs.read(record.session_id),body);
      const materials = body.materials === undefined ? undefined : materialSelection(body.materials);
      if (materials && busy.has(record.session_id)) throw codingError(codingSessionErrors.materials_busy, "coding.server.materials-busy");
      const configuration = body.configuration === undefined ? undefined : nextConfiguration(body.configuration);
      const picked = body.character === undefined ? undefined : characterSelection(body.character);
      // A chosen role is checked now and kept with its title; the Host pins its version at the session's next round.
      const character = picked ? await execution.characters.chosen(picked, codingActionControl(beforeWrite)) : picked;
      const characterSkills = body.character_skill_ids === undefined ? undefined : characterSkillSelection(body.character_skill_ids);
      const actionTools = body.action_tools === undefined ? undefined : parseExactActionReferences(body.action_tools);
      const sources = body.mcp_sources === undefined ? undefined : mcpSources(body.mcp_sources);
      const tools = body.mcp_tools === undefined ? undefined : mcpSelection(body.mcp_tools);
      const skills = body.skills === undefined ? undefined : skillSelection(body.skills);
      const budget = body.budget === undefined ? undefined : codingBudgetSelection(body.budget);
      const title = body.title === undefined ? undefined : text(body.title, "coding.field.session-title");
      const savedInputs=inputPatch?await execution.sessions.inputs.write(beforeWrite,record.session_id,inputPatch.expected,inputPatch.value):null;
      if (actionTools !== undefined) context.services!.storage!.set(`actions:${record.session_id}`, JSON.stringify(actionTools));
      if (sources !== undefined) context.services!.storage!.set(`mcp-sources:${record.session_id}`,JSON.stringify(sources));
      if (tools !== undefined) context.services!.storage!.set(`mcp:${record.session_id}`, JSON.stringify(tools));
      if (skills !== undefined) context.services!.storage!.set(`skills:${record.session_id}`, JSON.stringify(skills));
      if (character !== undefined) saveCharacter(context, record.session_id, character);
      if (characterSkills !== undefined) context.services!.storage!.set(`character-skills:${record.session_id}`, JSON.stringify(characterSkills));
      // The person's budget for this session: reaching it is reported, never enforced (the person's choice).
      if (budget === null) context.services!.storage!.delete(`budget:${record.session_id}`);
      else if (budget !== undefined) context.services!.storage!.set(`budget:${record.session_id}`, JSON.stringify(budget));
      if (materials) context.services!.storage!.set(`materials:${record.session_id}`, JSON.stringify(materials));
      let current = record;
      if (configuration) {
        const storage = context.services!.storage!, key = `configuration:${record.session_id}`, previous = storage.get(key);
        const oldIntent = typeof previous === "string" ? (JSON.parse(previous) as { intent?: string }).intent : undefined;
        if (oldIntent !== configuration.intent) {
          // Both ports use the project's single Host writer (plugin-project-library/private-storage). Defer this KV write
          // until after beforeWrite and the original record guard, inside the same SQLite transaction as source invalidation.
          current = await execution.sessions.setState(beforeWrite, projectId, record.session_id, record.state, new Date(Math.max(Date.now(), Date.parse(record.updated_at) + 1)).toISOString(), () => {
            const now = execution.sessions.get(projectId, record.session_id);
            if (now.archived || now.updated_at !== record.updated_at || now.runtime_id !== record.runtime_id
              || now.runtime_session_id !== record.runtime_session_id || storage.get(key) !== previous) throw codingSessionErrors.session_busy("会话在保存下一轮方式时发生变化，请重试");
            storage.set(key, JSON.stringify(configuration));
          });
        } else storage.set(key, JSON.stringify(configuration));
      }
      return { session: title === undefined ? current : await execution.sessions.rename(beforeWrite, projectId, record.session_id, title, new Date(Math.max(Date.now(), Date.parse(current.updated_at) + 1)).toISOString()), input_revision:savedInputs?.revision??execution.sessions.inputs.read(record.session_id).revision };
    });
  },
  (a) => {
    const { context, projectId, busy, route } = a;
    return route("coding.start-run", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (record.archived) throw codingError(codingSessionErrors.archived_run, "coding.server.archived-run");
      if (busy.has(record.session_id)) throw codingError(codingSessionErrors.session_busy, "coding.server.busy");
      busy.add(record.session_id);
      try {
        const body = bodyOf(request);
        if (await a.waits.openWaitOf(record)) throw codingError(codingSessionErrors.waiting, "coding.server.waiting");
        // "等它完成后再开始": the round is held as an item waiting on the other work, and starts on its own when it is done.
        if (typeof body.wait_for === "string") {
          if (["running", "paused", "waiting-answer", "waiting-approval"].includes(record.state)) throw codingError(codingSessionErrors.wait_round_open, "coding.server.wait-round-open");
          const role = roleForIntent(body.intent);
          const savedInput = execution.sessions.inputs.read(record.session_id);
          roundImages(body.images);
          const continueOf = body.continue_step_board_of === undefined ? undefined : text(body.continue_step_board_of, "coding.field.continued-run", 200);
          if (continueOf !== undefined && (typeof body.plan_revision !== "number" || !Number.isSafeInteger(body.plan_revision) || !["execute", "parallel"].includes(String(body.intent)))) throw codingFailure("coding.server.continue-plan");
          const draft = body.plan_revision === undefined || continueOf !== undefined ? null : execution.sessions.plan(projectId, record.session_id);
          if (continueOf === undefined && body.plan_revision !== undefined && (!draft?.confirmed || draft.revision !== body.plan_revision || !["execute", "parallel"].includes(String(body.intent)))) throw codingFailure("coding.server.plan-confirm-first");
          const plan = continueOf !== undefined ? confirmedPlan(context, record.session_id, body.plan_revision as number) : draft ? confirmedPlan(context, record.session_id, draft.revision) : null;
          const task = plan && continueOf === undefined ? plan.source.task : body.reask !== undefined ? QUESTION_REASK.task : text(body.task, "coding.field.task", 100_000, body.command_prompt === true);
          const workspaces = await projectFolders(api!);
          const workspace = workspaces.find(entry => entry.workspace_id === body.workspace_id);
          if (!workspace?.realpath_verified) throw codingError(codingSessionErrors.choose_workspace, "coding.server.choose-workspace");
          const tree = await chosenWorktree(a, body, workspace.workspace_id, role === "writers", beforeWrite);
          const directory = tree?.canonical_path ?? workspace.canonical_path;
          if (role === "writers") codingWriterAssignments(body.writer_assignments, true);
          else if (codingWriterAssignments(body.writer_assignments ?? []).length) throw codingFailure("coding.server.parallel-only");
          const model = execution.models.list().find(entry => entry.provider_id === body.provider_id && entry.model_id === body.model_id);
          const modelRefusal = model ? execution.models.unavailable(model) : modelUnavailableMessage();
          if (!model || modelRefusal !== undefined) throw new Error(modelRefusal);
          chosenEffort(body, model);
          const roles = await codingActions(context, beforeWrite).invoke(agent.availableRoles, [record.runtime_id]);
          const availability = roles.find(entry => entry.role_id === role);
          if (!availability?.available) throw availability?.reason ? new Error(availability.reason) : codingFailure("coding.server.role-unavailable");
          if (body.character !== undefined) characterSelection(body.character);
          if (body.character_skill_ids !== undefined) characterSkillSelection(body.character_skill_ids);
          if (body.action_tools !== undefined) parseExactActionReferences(body.action_tools);
          skillSelection(body.skills ?? []);
          mcpSelection(body.mcp_tools ?? []);
          mcpSources(body.mcp_sources ?? []);
          const { overlaps } = await overlapsFor(a, api!, execution, record, body, beforeWrite, directory);
          const target = overlaps.find(overlap => overlap.work_id === body.wait_for);
          if (!target) throw codingError(codingSessionErrors.wait_target_gone, "coding.server.wait-target-gone");
          // A wait is already a business write. Refuse unreadable selections before creating its Session or queue item;
          // the queued round reads these same references again with its authority when it can actually start.
          const materials = materialSelection(body.materials ?? savedMaterials(context, record.session_id));
          await resolveMaterials(context, materials, codingActionControl(beforeWrite));
          const session = record.runtime_session_id ? { runtime_id: record.runtime_id, session_id: record.runtime_session_id }
            : await codingActions(context, beforeWrite).invoke(agent.createSession, [record.runtime_id, { directory: { canonical_path: directory, realpath_verified: true }, title: record.title }]);
          if (!record.runtime_session_id) await execution.sessions.setRuntimeSession(beforeWrite, projectId, record.session_id, session.session_id, new Date().toISOString());
          const title = record.title === DEFAULT_SESSION_TITLE ? codingSessionTitleFrom(task) : record.title;
          if (title !== record.title) await execution.sessions.rename(beforeWrite, projectId, record.session_id, title, new Date().toISOString());
          const { wait_for: _dropped, ...sent } = body;
          // What the person chose goes with the queued round now (materials-ui-contract §2): an explicit choice as sent, else the draft as
          // it is; each piece is read by its reference when the round starts.
          const rest = { ...sent, materials, ...(tree ? { worktree_id: tree.worktree_id } : {}) };
          // The session's step waits on that work; the send is kept here, by the wait, to start when the work is done.
          const item = await codingActions(context, beforeWrite).invoke(agent.queueProjectRound, [record.runtime_id, { session, directory, task, after: target.work_id, title }]);
          if (item.wait_id) a.waits.keepQueued(item.wait_id, rest, item.work_id);
          const cleared_input_revision = !plan && savedInput.draft === body.task && await execution.sessions.inputs.clearIfUnchanged(beforeWrite, record.session_id, savedInput.revision) ? savedInput.revision + 1 : undefined;
          await execution.sessions.setState(beforeWrite, projectId, record.session_id, "queued", new Date().toISOString());
          a.waits.wakeLoop(api!, execution, record.runtime_id);
          return { queued: { work_id: item.work_id, ...(item.wait_id ? { wait_id: item.wait_id } : {}), after: target }, ...(cleared_input_revision === undefined ? {} : { cleared_input_revision }) };
        }
        return await startRound(a, record, body, api!, execution, beforeWrite);
      }
      finally { busy.delete(record.session_id); }
    });
  },
  // Before a send: other sessions' work under way in the same directory that names the same files.
  (a) => {
    const { route } = a;
    return route("coding.scope-check", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      const { overlaps } = await overlapsFor(a, api!, execution, record, bodyOf(request), beforeWrite);
      return { overlaps };
    });
  },
  // A parked session: start it now (the wait is taken up by the person), or give the wait up.
  (a) => {
    const { projectId, busy, route } = a;
    return route("coding.queued-round", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution), wait = await a.waits.openWaitOf(record), action = bodyOf(request).action;
      if (!wait) throw codingError(codingSessionErrors.not_waiting, "coding.server.not-waiting");
      if (action === "cancel") {
        // Giving up a wait for an answer withdraws the request; for the person's own wait, its project work item goes.
        await a.waits.cancel(record, wait, beforeWrite);
        let nextState: CodingSessionState = "idle";
        if (record.runtime_session_id) {
          const status = await codingActions(a.context, beforeWrite)
            .invoke(agent.readSessionStatuses, [record.runtime_id, [record.runtime_session_id]])
            .then(list => list[0], () => undefined);
          nextState = !status || "error" in status
            ? "done"
            : status.recovery
              ? "reconcile-required"
              : status.latest_phase
                ? sessionState({ phase: status.latest_phase })
                : "idle";
        }
        await execution.sessions.setState(beforeWrite, projectId, record.session_id, nextState, new Date().toISOString());
        return { cancelled: true };
      }
      if (action !== "start") throw codingError(codingSessionErrors.wait_choose, "coding.server.wait-choose");
      if (busy.has(record.session_id)) throw codingError(codingSessionErrors.session_busy, "coding.server.busy");
      busy.add(record.session_id);
      try {
        return await a.waits.goOn(api, execution, record, wait, beforeWrite);
      } finally { busy.delete(record.session_id); }
    });
  },
  // The person marks a session the priority: sessions whose work overlaps its own are asked to make way (only told).
  (a) => {
    const { context, projectId, route } = a;
    return route("coding.priority", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution), on = bodyOf(request).on === true;
      const key = `priority:${record.session_id}`;
      if (!on) { context.services!.storage!.delete(key); return { priority: false, notified: [] }; }
      context.services!.storage!.set(key, new Date().toISOString());
      if (!record.runtime_session_id) return { priority: true, notified: [], paths: [] };
      const told = await codingActions(context, beforeWrite).invoke(agent.prioritizeSession, [record.runtime_id, record.runtime_session_id]);
      const sessions = execution.sessions.list(projectId);
      return { priority: true, paths: told.paths, notified: told.notified.map(runtime => sessions.find(entry => entry.runtime_session_id === runtime)?.title ?? runtime) };
    });
  },
  (a) => {
    const { context, route, busy } = a;
    return route("coding.control-run", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (!record.runtime_session_id) throw codingError(codingSessionErrors.never_run, "coding.server.never-run");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await codingActions(context, beforeWrite).invoke(agent.readSession, [session]);
      const body = bodyOf(request);
      const run = snapshot.runs.find((entry) => entry.run_id === body.run_id);
      if (!run) throw codingError(codingRunErrors.run_not_found, "coding.server.run-not-found");
      const control = await runControl(body, async () => execution.models.list());
      if (control.kind === "steer") {
        const materials = await resolveMaterials(context, control.materials, codingActionControl(beforeWrite));
        const supplied = [control.send.text, ...materials.map(material => `【附带材料，数据】\n${agentTextMaterialContent(material)}`)].join("\n\n");
        // The runtime owns original text and delivery. Reject a whole oversize supplement before its input write, never truncate it.
        const supplement = text(supplied, "coding.field.supplement", 100_000, body.command_prompt === true);
        return { accepted: true, receipt: await context.services!.actions!.invoke(agentInputActions.send, { ...session, run_id: run.run_id, ...control.send, text: supplement }, codingActionControl(beforeWrite)) };
      }
      if (control.kind === "withdraw") return { accepted: true, withdrawn: await context.services!.actions!.invoke(agentInputActions.withdraw, { ...session, run_id: run.run_id, input_id: control.input_id }, codingActionControl(beforeWrite)) };
      const view = await codingActions(context, beforeWrite).invoke(agent.readRun, [session, run]);
      if (isTerminalAgentPhase(view.phase)) throw codingError(codingRunErrors.round_ended, "coding.server.round-ended");
      const question = control.kind === "answer" ? view.awaiting_input.find(item => item.pending_id === control.pending_id) : undefined;
      await codingActions(context, beforeWrite).invoke(agent.controlRun, [session, run, control]).catch((error: { code?: string }) => {
        // A refused answer goes back with the questions it answered, so each field's line can name the limit it crossed.
        throw error?.code === "agent.answer_invalid" && question?.questions ? Object.assign(error, { questions: question.questions }) : error;
      });
      if (control.kind !== "answer") return { accepted: true };
      // The answer's receipt, in the words the page shows. A round parked at a restart ended with the answer; the next round
      // takes it from the session's queue, or, refused, it waits there for 「从断点继续」.
      const say = codingText;
      if (!question?.parked || body.continue_after_answer === false) return { accepted: true, message: say("coding.server.answered") };
      const next = busy.has(record.session_id) ? { started: false as const, reason: say("coding.server.submitting") } : await (async () => {
        busy.add(record.session_id);
        try { return await roundAfterParkedAnswer(a, record, session, api!, execution, beforeWrite); } finally { busy.delete(record.session_id); }
      })();
      return { accepted: true, next_round: next,
        message: next.started ? say("coding.server.answered-next") : say("coding.server.answered-not-next", { reason: next.reason }) };
    });
  },
];

/** The session and round routes of one activation. */
export const sessionsRoutes = (a: CodingActivation): PluginRouteBinding[] => ROUTES.flatMap(make => make(a));
