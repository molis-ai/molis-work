import { setTimeout } from "node:timers/promises";
import { ActionError, pinActionSubject, pinnableSubjectKinds, type ActionClient, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GovernanceApplicationApi } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { PluginDefinition, PluginExecutionControl } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createGoalsActionHandlers } from "./actions.js";
import { readMolisWorkSnapshot } from "./board-snapshot-query.js";
import { goalsRoutes } from "./http/index.js";
import { GOALS_CATCH_UP_JOB, goalsManifest } from "./manifest.js";
import { personalPlanningActions } from "./personal-planning-actions.js";
import { goalsTreeUiContribution } from "./tree-ui.js";
import { goalsSettingsUiContribution } from "./settings-ui.js";
import { GoalsModule, GoalInputBindings, resolvePlanningMethodPacks } from "./module/index.js";
import { requestHash } from "./module/command-support.js";
import { GovernanceCollaborationModule } from "./governance/index.js";
import { createGoalsApplication } from "./goals-application.js";
import { PluginSqlite } from "./plugin-sqlite.js";
import { attentionOver, journalOver, ledgerOver, PersonalMethodsSnapshot } from "./runtime-ports.js";

const READ_ARTIFACT = { capability_id: "artifacts.read", version: 1 } as const;
/** Their own windows: the artifact and the object's owner are asked outside any database window, and the rows written after. */
const SELF_WINDOWED = new Set<string>(["goals.deliverables.add", "goals.deliverables.remove", "goals.deliverables.list", "goals.deliverables.pin", "goals.deliverables.candidates",
  "goals.artifact_inputs.add", "goals.artifact_inputs.remove", "goals.artifact_inputs.list", "goals.artifact_inputs.pin"]);

/** What of the call's authority another plugin's action is run under (the directory runs it as this caller, never as Goals). */
function controlOf(caller: ActionExecutionContext): PluginExecutionControl {
  const { signal, beforeEffect, assert_authority_current, retainBackgroundAuthority, locale, page_context, query_only } = caller;
  return { beforeEffect, ...(signal ? { signal } : {}), ...(assert_authority_current ? { assert_authority_current } : {}),
    ...(retainBackgroundAuthority ? { retainBackgroundAuthority } : {}), ...(locale ? { locale } : {}), ...(page_context ? { page_context } : {}),
    ...(query_only ? { query_only } : {}) };
}

/**
 * Goals as a Plugin Runtime plugin in a project (PG-094 S11): the project half of the dual-instance plugin whose Home half is
 * `createHomeGoalsPlugin`. Its modules are built once over `PluginSqlite`, and each call lends them the platform's handle for the
 * length of one synchronous window: a read window for a query, the transaction of `services.project_database` for a command (after
 * the caller's authority is asked again). Attention, the Context Ledger and the journal join that transaction, so a Goal, its
 * event, its reminder and its link are written together or not at all.
 */
export function createGoalsPlugin(): PluginDefinition {
  let problem: string | null = null;
  return { manifest: goalsManifest, async start(context) {
    for (const permission of goalsManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const projectId = context.project_id, services = context.services;
    const database = services?.project_database, attention = services?.attention, ledger = services?.contextLedger, actions = services?.actions, background = services?.background;
    if (!projectId || !database || !attention || !ledger || !actions?.directory || !background) {
      throw new ActionError("actions.unredeemed", "Goals 需要项目库、提醒、引用账本、动作目录与后台服务");
    }
    const directory = actions.directory;
    const sqlite = new PluginSqlite(), personal = new PersonalMethodsSnapshot(), clock = () => new Date();
    const journal = journalOver(sqlite, projectId), attentionPort = attentionOver(sqlite, attention, projectId), ledgerApi = ledgerOver(sqlite, ledger, projectId);

    const governanceModule = new GovernanceCollaborationModule({ db: sqlite, journal, now: () => clock().toISOString() });
    const governance: GovernanceApplicationApi = { provenance: governanceModule.provenance, query: governanceModule.query, records: governanceModule.records,
      decisions: governanceModule.decisions, eventDecisions: governanceModule.eventDecisions };
    const inputs = new GoalInputBindings(sqlite, ledgerApi);
    const goals: GoalsModule = new GoalsModule(sqlite, journal, { validateRelationGraph: (project, input) => goals.planning.validateRelationAddition(project, input) },
      { now: clock, personalPlanningMethodPacks: () => personal.read() });
    const application = createGoalsApplication({ goals: { commands: goals.commands, lifecycle: goals.lifecycle, planning: goals.planning, query: goals.query, events: goals.events },
      governance, attention: attentionPort, clock });
    // The board of a project is made when Goals first starts over its root row (the catch-up below), before anyone has asked for it, so a
    // person's first explicit initialization (`molis-work v1 init` over a database no catalog made) finds it there. It is the board that
    // call asked for: it is answered with that board and recorded as the call's own receipt (a retry replays), not refused as existing.
    // Only the board this very start made is adopted, and once; a board made in an earlier run or by an earlier call is still refused.
    let madeByCatchUp: { project_id: string; observed_event_cursor: number } | null = null;
    const catchUpActor = context.actor_id ?? "", catchUpKey = `project-catalog-create-${projectId}`;
    const initializeBoard = (input: { project_id: string; actor_id: string; idempotency_key: string }) => {
      try { return goals.commands.initializeBoard(input); } catch (error) {
        if (!(error instanceof ActionError) || error.code !== "goals.board.exists" || !madeByCatchUp) throw error;
        const outcome = madeByCatchUp;
        madeByCatchUp = null;
        journal.putIdempotency({ projectId, actorId: input.actor_id, operation: "initialize_board", key: input.idempotency_key, requestHash: requestHash({}), outcome, at: clock().toISOString() });
        return { ...outcome, replayed: false };
      }
    };
    const snapshot = () => readMolisWorkSnapshot({ goals: goals.query, governance: governanceModule.query }, projectId);
    const events = () => sqlite.journalReader().readEventsDescending();

    const clientFor = (caller: ActionExecutionContext): ActionClient => ({ discover: () => directory.discover(), invoke: (_context, reference, input) => directory.invoke(reference, input, controlOf(caller)) });
    const window = {
      read: <T>(body: () => T): T => sqlite.read(database, body, database.journal),
      write: <T>(caller: ActionExecutionContext, body: () => T): Promise<T> => database.transaction(() => caller.beforeEffect(), transaction => sqlite.write(transaction, body)),
    };
    const handlers = createGoalsActionHandlers({ events: application.goalEvents, acknowledgements: goals.acknowledgements, projectId,
      board: { initializeBoard },
      collection: { snapshot, events, goals: application.goalQueries, inputs, eventWork: application.goalEvents },
      readGoal: goalId => application.goalQueries.getGoal(projectId, goalId),
      readContract: goalId => application.goalQueries.readGoalContract(projectId, goalId),
      deliverables: { ledger: ledgerApi, ...window,
        readArtifact: async (caller, reference) => (await directory.invoke<{ selected: { title: string; artifact_type_id: string; availability: string; lifecycle_state: string } | null }>(READ_ARTIFACT, { reference }, controlOf(caller))).selected,
        pin: async (caller, subject) => (await pinActionSubject(clientFor(caller), caller, subject)).artifact,
        pinnableKinds: caller => pinnableSubjectKinds(clientFor(caller), caller) },
      history: { snapshot, journalEvents: events },
      planning: { planning: goals.planning, baseMethods: () => resolvePlanningMethodPacks(personal.read()) },
      guidance: { commands: goals.commands, read: project => application.goalQueries.readProjectGuidance(project) },
      lifecycle: { lifecycle: goals.lifecycle, setActiveGoal: (...args) => goals.commands.setActiveGoal(...args), eventCursor: () => journal.eventCursor(projectId) },
      configuration: { commands: goals.commands, query: goals.query, eventCursor: () => journal.eventCursor(projectId) },
      tree: { submitGoalTreeProposal: input => application.goalTreeSubmission.submitGoalTreeProposal(input),
        listGoalTreeProposals: query => application.goalTree.listGoalTreeProposals(query),
        checkGoalTreeProposal: input => application.goalTreeCheck.checkGoalTreeProposal(input),
        decideGoalTreeProposal: input => application.goalTreeDecision.decideGoalTreeProposal(input) } });

    // The person's methods are the plugin's own data, in its other instance: asked as the plugin (its own action), never as the caller,
    // whose grants (an agent's, say) need not reach a Home-wide action.
    const loadPersonal = async (caller: ActionExecutionContext) => (await actions.invoke(personalPlanningActions.list, {}, controlOf(caller))).methods
      .filter(method => method.scope === "personal");
    let ready: Promise<void> = Promise.resolve();
    const windowed = (binding: ActionHandlerBinding): ActionHandlerBinding => {
      if (SELF_WINDOWED.has(binding.capability_id)) return { ...binding, handle: async (caller, input) => { await ready; return binding.handle(caller, input); } };
      const definition = goalsManifest.actions!.find(entry => entry.capability_id === binding.capability_id && entry.version === binding.version);
      if (!definition) throw new ActionError("actions.unredeemed", `${binding.capability_id} 不在 Goals 的 Manifest 里`);
      const run = definition.operation === "command"
        ? (caller: ActionExecutionContext, input: unknown, packs: Parameters<PersonalMethodsSnapshot["within"]>[0]) =>
          window.write(caller, () => personal.within(packs, () => binding.handle(caller, input)))
        : async (caller: ActionExecutionContext, input: unknown, packs: Parameters<PersonalMethodsSnapshot["within"]>[0]) =>
          window.read(() => personal.within(packs, () => binding.handle(caller, input)));
      return { ...binding, handle: async (caller, input) => { await ready; return personal.run(() => loadPersonal(caller), packs => run(caller, input, packs)); } };
    };

    // What drifted while the project was closed catches up once: the board of a library the platform made with its root row alone,
    // and the decision reminders. It runs as the installation's own job, the one place a write outside an action may reach Attention.
    // A call waits for the catch-up to end (it ends in one transaction), so the first call of a new project meets its board.
    ready = background.keep(GOALS_CATCH_UP_JOB, async control => {
      // Nothing is written inside activation: the Runtime registers the contribution and marks the installation running first.
      await setTimeout(0, undefined, { signal: control.signal });
      try {
        let made: { project_id: string; observed_event_cursor: number } | null = null;
        await database.transaction(() => control.beforeEffect(), transaction => sqlite.write(transaction, () => {
          if (!goals.query.getBoard(projectId)) {
            const { project_id, observed_event_cursor } = goals.commands.initializeBoard({ project_id: projectId, actor_id: catchUpActor, idempotency_key: catchUpKey });
            made = { project_id, observed_event_cursor };
          }
          application.projectOpened(projectId);
        }));
        madeByCatchUp = made;
        problem = null;
      } catch (error) {
        control.assert_authority_current();
        problem = error instanceof Error ? error.message : "Goals 的开板与提醒补齐失败";
      }
    }).done.then(() => undefined, () => undefined);

    return { kind: "app", views: [goalsTreeUiContribution, goalsSettingsUiContribution],
      actions: handlers.map(windowed),
      routes: goalsRoutes({ actions: request => ({ discover: async () => [], invoke: (definition, input) => actions.invoke(definition, input, request.execution) }) }) };
  }, async health() { return problem ? { ok: false, message: problem } : { ok: true, message: "Goals 已接通" }; } };
}
