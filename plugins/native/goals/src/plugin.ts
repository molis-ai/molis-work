import { syncBindings } from "./sync-binding.js";
import { materialsActions, type MaterialsPinnedResult, type MaterialsReadResult } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { setTimeout } from "node:timers/promises";
import { ActionError, pinActionSubject, pinnableSubjectKinds, type ActionClient, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginExecutionControl, PluginProjectDatabase } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalEntryActions } from "./contract/goal-actions.js";
import { createGoalItemHandlers, createGoalsPresentationHandlers } from "./presentation.js";
import { createGoalsActionHandlers, goalsActions } from "./actions.js";
import { ATTACH_SELF_WINDOWED } from "./attach-actions.js";
import { confirmedGoalDeliverables } from "./deliverable-actions.js";
import { goalsEventActions, type GoalReportTrust } from "./event-command-actions.js";
import { goalActor } from "./action-contract.js";
import { assessGoalReport, type GoalEvidenceArtifact, type GoalEvidenceRunCheck } from "./evidence-check.js";
import { createGoalsTerminalActionHandlers, goalsTerminalActions } from "./terminal-actions.js";
import { readMolisWorkSnapshot } from "./snapshot-query.js";
import { goalsRoutes } from "./http/index.js";
import { GOALS_CATCH_UP_JOB, goalsManifest } from "./manifest.js";
import { goalsTreeUiContribution } from "./tree-ui.js";
import { goalsStageUiContribution } from "./page/workbench-stage.js";
import { GoalsModule, GoalInputBindings } from "./module/index.js";
import { requestHash } from "./module/command-support.js";
import { GovernanceCollaborationModule, GovernanceEventDecisions } from "./governance/index.js";
import { createGoalsApplication } from "./goals-application.js";
import { PluginSqlite } from "./plugin-sqlite.js";
import { eventDecisionVersion, goalsDecisionOfferHandlers, treeDecisionVersion } from "./decision-offers.js";
import { goalForDecisionRequest } from "./module/event-state-decision-records.js";
import { attentionOver, journalOver, ledgerOver } from "./runtime-ports.js";

const CHECK_EVIDENCE = { capability_id: "agent.evidence.check", version: /* @version action.agent.evidence.check */ 1 } as const;
const READ_ARTIFACT = { capability_id: "artifacts.read", version: /* @version action.artifacts.read */ 1 } as const;
/** The platform's materials service: a reference read back (head), and what fixed versions stand for. */
const READ_MATERIAL = { capability_id: materialsActions.read.capability_id, version: materialsActions.read.version } as const;
const READ_PINNED = { capability_id: materialsActions.pinned.capability_id, version: materialsActions.pinned.version } as const;
/** Their own windows: the artifact and the object's owner are asked outside any database window, and the rows written after. */
const SELF_WINDOWED = new Set<string>(["goals.deliverables.add", "goals.deliverables.remove", "goals.deliverables.list", "goals.deliverables.pin", "goals.deliverables.candidates",
  "goals.artifact_inputs.add", "goals.artifact_inputs.remove", "goals.artifact_inputs.list", "goals.artifact_inputs.pin", "goals.inputs.bind", "goals.inputs.list",
  ...ATTACH_SELF_WINDOWED, ...Object.values(goalsTerminalActions).map(definition => definition.capability_id)]);

/** What of the call's authority another plugin's action is run under (the directory runs it as this caller, never as Goals). */
function controlOf(caller: ActionExecutionContext): PluginExecutionControl {
  const { signal, beforeEffect, assert_authority_current, retainBackgroundAuthority, locale, page_context, query_only } = caller;
  return { beforeEffect, ...(signal ? { signal } : {}), ...(assert_authority_current ? { assert_authority_current } : {}),
    ...(retainBackgroundAuthority ? { retainBackgroundAuthority } : {}), ...(locale ? { locale } : {}), ...(page_context ? { page_context } : {}),
    ...(query_only ? { query_only } : {}) };
}


/** Goals receives the platform's own decision, and can read its transferred history in this project. */
function projectGovernance(sqlite: PluginSqlite, projectId: string, journal: ReturnType<typeof journalOver>,
  approvalHistory: NonNullable<PluginProjectDatabase["approvalHistory"]>): GovernanceCollaborationModule {
  const eventDecisions = new GovernanceEventDecisions(() => {
    const decision = sqlite.currentDecision();
    if (!decision) throw new ActionError("actions.forbidden", "需要平台记录的本人决定");
    return decision;
  }, (project, id) => {
    if (project !== projectId) return null;
    const record = approvalHistory.read(id);
    return record && "kind" in record ? record : null;
  });
  return new GovernanceCollaborationModule({ db: sqlite, journal, eventDecisions, treeApprovals: {
    current: () => sqlite.currentDecision(),
    read(project, id) {
      const record = project === projectId ? approvalHistory.read(id) : null;
      return record && "request_key" in record ? record : null;
    },
    transferred: project => project === projectId ? approvalHistory.transferred("proposal-item") : [],
  } });
}

function bindProjectWindows(window: {
  read<T>(body: () => T): T;
  write<T>(caller: ActionExecutionContext, body: () => T): Promise<T>;
}, before: ReadonlyMap<string, (caller: ActionExecutionContext, input: unknown) => Promise<unknown>>, ready: Promise<void>, assertReviewCurrent: () => void) {
  return (binding: ActionHandlerBinding): ActionHandlerBinding => {
    if (SELF_WINDOWED.has(binding.capability_id)) return { ...binding, handle: async (caller, input) => { await ready; return binding.handle(caller, input); } };
    const definition = goalsManifest.actions!.find(entry => entry.capability_id === binding.capability_id && entry.version === binding.version);
    if (!definition) throw new ActionError("actions.unredeemed", `${binding.capability_id} 不在 Goals 的 Manifest 里`);
    // Only a call with something prepared before its window gets a third argument; every other handler is called as the platform calls it.
    const handle = (caller: ActionExecutionContext, input: unknown, prepared: unknown) => prepared === undefined
      ? binding.handle(caller, input) : (binding.handle as (caller: ActionExecutionContext, input: unknown, prepared: unknown) => unknown)(caller, input, prepared);
    const apply = (caller: ActionExecutionContext, input: unknown, prepared: unknown) => {
      if (definition.action.requires_trusted_decision) assertReviewCurrent();
      return handle(caller, input, prepared);
    };
    const run = definition.operation === "command"
      ? (caller: ActionExecutionContext, input: unknown, prepared: unknown) => window.write(caller, () => apply(caller, input, prepared))
      : async (caller: ActionExecutionContext, input: unknown, prepared: unknown) => window.read(() => handle(caller, input, prepared));
    const prepare = before.get(binding.capability_id);
    return { ...binding, handle: async (caller, input) => { await ready; const prepared = await prepare?.(caller, input); return run(caller, input, prepared); } };
  };
}

/**
 * Goals as a Plugin Runtime plugin in a project (PG-094 S11). Its modules are built once over `PluginSqlite`, and each call lends them the platform's handle for the
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
    const approvalRules = database?.approvalRules, approvalHistory = database?.approvalHistory;
    if (!projectId || !database || !approvalRules || !approvalHistory || !attention || !ledger || !actions?.directory || !background) {
      throw new ActionError("actions.unredeemed", "Goals 需要项目库、项目审批规则、提醒、引用账本、动作目录与后台服务");
    }
    const directory = actions.directory;
    const sqlite = new PluginSqlite(), clock = () => new Date();
    const journal = journalOver(sqlite, projectId), attentionPort = attentionOver(sqlite, attention, projectId), ledgerApi = ledgerOver(sqlite, ledger, projectId);

    const governanceModule = projectGovernance(sqlite, projectId, journal, approvalHistory);
    const inputs = new GoalInputBindings(sqlite, ledgerApi);
    const goals: GoalsModule = new GoalsModule(sqlite, journal, { validateRelationGraph: (project, input) => goals.planning.validateRelationAddition(project, input) },
      { now: clock, deliverables: (project, goalId) => confirmedGoalDeliverables(ledgerApi, project, goalId),
        approvalRules: (project, history) => {
          if (project !== projectId) throw new ActionError("actions.scope_mismatch", "项目审批规则属于原项目");
          return approvalRules.read(history).rules;
        } });
    const application = createGoalsApplication({ goals: { commands: goals.commands, lifecycle: goals.lifecycle, planning: goals.planning, query: goals.query, events: goals.events },
      governance: governanceModule, attention: attentionPort, clock });
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
      materials: {
        readMaterial: (caller, ref) => directory.invoke<MaterialsReadResult>(READ_MATERIAL, { ref, mode: "head" }, controlOf(caller)),
        pinned: (caller, versions) => directory.invoke<MaterialsPinnedResult>(READ_PINNED, { versions }, controlOf(caller)) },
      history: { snapshot, journalEvents: events },
      planning: { planning: goals.planning },
      guidance: { commands: goals.commands, read: project => application.goalQueries.readProjectGuidance(project) },
      lifecycle: { lifecycle: goals.lifecycle, setActiveGoal: (...args) => goals.commands.setActiveGoal(...args), eventCursor: () => journal.eventCursor(projectId) },
      configuration: { commands: goals.commands, query: goals.query, eventCursor: () => journal.eventCursor(projectId) },
      tree: { submitGoalTreeProposal: input => application.goalTreeSubmission.submitGoalTreeProposal(input),
        listGoalTreeProposals: query => application.goalTree.listGoalTreeProposals(query),
        checkGoalTreeProposal: input => application.goalTreeCheck.checkGoalTreeProposal(input),
        decideGoalTreeProposal: input => {
          const entry = sqlite.currentDecision()?.source.entry;
          return application.goalTreeDecision.decideGoalTreeProposal({ ...input, authority: { ...input.authority,
            whole_confirmation_prompted: entry?.whole_confirmation_prompted, prompted_proposal_id: entry?.prompted_subject_id } });
        } } });
    handlers.push(...goalsDecisionOfferHandlers(id => application.goalEvents.readState(projectId, id),
      id => application.goalTree.readNative(projectId, id), id => goalForDecisionRequest(sqlite, projectId, id),
      { kind: "plugin", scope: "project", project_id: projectId, plugin_id: context.plugin_id,
        install_id: context.install_id, installation_generation: context.installation_generation, provider_id: context.provider_id ?? context.plugin_id }));
    handlers.push(...createGoalsTerminalActionHandlers({ terminal: services.terminal,
      goal: goalId => window.read(() => {
        try {
          const record = application.goalQueries.getGoal(projectId, goalId), state = application.goalEvents.readState(projectId, goalId);
          return { record, state: state.owner ? state : null };
        } catch (error) {
          if (error instanceof ActionError && error.code === "goals.not_found") return null;
          throw error;
        }
      }),
      guidancePrefix: async caller => (await actions.invoke(goalsActions.guidanceRead, {}, controlOf(caller))).runtime_prompt_prefix }));

    // What a call asks of other owners before its window opens (a window is synchronous). A report's cited evidence is looked up here.
    // What it worked out is handed to the handler as its third argument.
    const before = new Map<string, (caller: ActionExecutionContext, input: unknown) => Promise<unknown>>([[goalsEventActions.report.capability_id, async (caller, input): Promise<GoalReportTrust | undefined> => {
      if (typeof input !== "object" || input === null) return undefined;
      // A report already recorded under this key is answered from its record (or refused as a reused key): its evidence is not looked up again.
      const key = (input as { idempotency_key?: unknown }).idempotency_key;
      if (typeof key === "string" && window.read(() => goals.events.reportRecorded(projectId, goalActor(caller).actor_id, key))) return undefined;
      return assessGoalReport({
        deliverables: goalId => window.read(() => confirmedGoalDeliverables(ledgerApi, projectId, goalId)),
        selfSupportingSessions: (goalId, requirementId) => window.read(() => goals.events.selfSupportingSessions(projectId, goalId, requirementId)),
        readArtifact: async (as, reference) => (await directory.invoke<{ selected: GoalEvidenceArtifact | null }>(READ_ARTIFACT, { reference }, controlOf(as))).selected,
        checkRun: async (as, run_id, command_call_ids) => {
          try { return await directory.invoke<GoalEvidenceRunCheck>(CHECK_EVIDENCE, { run_id, command_call_ids }, controlOf(as)); } catch (error) {
            if (error instanceof ActionError && error.code === "agent.run_unknown") return "none";
            throw error;
          }
        },
      }, caller, input as Parameters<typeof assessGoalReport>[2]);
    }]]);

    // What drifted while the project was closed catches up once: the board of a library the platform made with its root row alone,
    // and the decision reminders. It runs as the installation's own job, the one place a write outside an action may reach Attention.
    // A call waits for the catch-up to end (it ends in one transaction), so the first call of a new project meets its board.
    const ready = background.keep(GOALS_CATCH_UP_JOB, async control => {
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

    const windowed = bindProjectWindows(window, before, ready, () => {
      const proof = sqlite.currentDecision();
      if (!proof) throw new ActionError("actions.forbidden", "需要平台记录的原决定");
      const { subject, version } = proof.review.target;
      const current = subject.kind === "goal" ? eventDecisionVersion(application.goalEvents.readState(projectId, subject.id))
        : treeDecisionVersion(application.goalTree.readNative(projectId, subject.id));
      if (current !== version) throw new ActionError("actions.conflict", "原目标或提案已变化");
    });

    return { kind: "app", sync: syncBindings(context), views: [goalsTreeUiContribution, goalsStageUiContribution],
      actions: [...handlers.map(windowed), ...createGoalsPresentationHandlers(projectId, goals.query, application.goalEvents, window.read, ready),
        // 「建成目标」 is Goals' own create, in its own write window; the next step is a read like the presentation values.
        ...createGoalItemHandlers(projectId, windowed(handlers.find(binding => binding.capability_id === goalEntryActions.create.capability_id)!), goals.query, application.goalEvents,
          window.read, ready)],
      routes: goalsRoutes({ actions: request => ({ discover: async () => [], invoke: (definition, input) => actions.invoke(definition, input, request.execution) }) }) };
  }, async health() { return problem ? { ok: false, message: problem } : { ok: true, message: "Goals 已接通" }; } };
}
