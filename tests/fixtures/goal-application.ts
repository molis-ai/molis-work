import { randomUUID } from "node:crypto";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { listProjectRoots, writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type { GovernanceApplicationApi } from "@molis-ai/molis-work-plugin-goals/contract";
import type { GoalEventAcknowledgementsApi, GoalInputBindingsApi, GoalsApplicationApi } from "@molis-ai/molis-work-plugin-goals/contract";
import type { GoalEventTrustedAuthority, GoalTreeProposalDecisionAuthority, RecordGoalUserDecisionInput } from "@molis-ai/molis-work-plugin-goals/contract";
import type { ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { projectApprovalRules, projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
import { goalsManifest, readGoalApprovalOutcome } from "@molis-ai/molis-work-plugin-goals";
import {
  createGoalsApplication, GOALS_PLUGIN_ID, GoalInputBindings, GoalsModule, GovernanceCollaborationModule, GovernanceEventDecisions, GovernanceProvenance, readMolisWorkSnapshot,
  type GoalsApplication, type PlanningMethodPack,
} from "./goals-modules.js";
import { goalsSqlite, governanceSqlite } from "./governance-sqlite.js";

const approvalOwner = { kind: "plugin", plugin_id: GOALS_PLUGIN_ID, publisher_signature: goalsManifest.publisher.signature } as const;
type TestDecisionSubject = { kind: "goal" | "goal-tree-proposal"; id: string };

/** Unit fixtures compose the owners directly. The Web and management tests exercise the real protected dispatch. */
export function fixtureApprovals(store: LocalProjectDatabase, clock: () => Date) {
  let current: ProjectTrustedDecision | undefined;
  const history = (project: string) => projectReviewDecisions(store.db, project);
  const commit = (project: string, subject: TestDecisionSubject, identity: GoalEventTrustedAuthority, key: string,
    choice: unknown, requirements: ProjectTrustedDecision["review"]["requirements"] = []) => {
    const { actor_id, authority_source, conversation_ref, message_ref } = identity;
    const owner = { scope: "project", project_id: project, plugin_id: GOALS_PLUGIN_ID,
      install_id: "fixture-goals", installation_generation: "fixture-generation" } as const;
    const receiptKey = JSON.stringify([subject.kind, subject.id, actor_id, key]);
    return history(project).commit({ reference: { owner: { kind: "trusted-decision", ...owner },
      id: receiptKey, version: key }, choice_id: "apply", request_key: receiptKey },
    { actor_id, source: { kind: "person", actor_id, entry: { source: authority_source, conversation_ref, message_ref } } },
    choice, { publisher_signature: approvalOwner.publisher_signature,
      review: { target: { owner: { kind: "plugin", ...owner, provider_id: GOALS_PLUGIN_ID }, subject, version: key }, requirements } },
    clock().toISOString(), () => undefined).record;
  };
  const provenance = new GovernanceProvenance();
  const finish = (project: string, id: string, kind: TestDecisionSubject["kind"]) => {
    const decisions = history(project), record = decisions.findCommitted(id);
    const outcome = readGoalApprovalOutcome(store.db, project, id, kind);
    if (record && !record.outcome_digest && outcome) decisions.freezeOutcome(record, outcome.digest);
  };
  return {
    event<T extends { decision: { governance_decision_id: string } }>(project: string, run: () => T): T {
      return store.db.transaction(() => {
        const result = run();
        finish(project, result.decision.governance_decision_id, "goal");
        return result;
      }).immediate();
    },
    eventDecisions: new GovernanceEventDecisions((input: RecordGoalUserDecisionInput) => {
      const authority = provenance.validateEventDecisionAuthority(input.authority);
      return commit(input.project_id, { kind: "goal", id: input.goal_id }, authority, input.idempotency_key, input);
    }, (project, id) => {
      const record = history(project).read(id);
      return record && "kind" in record ? record : null;
    }),
    treeApprovals: {
      current: () => current,
      read(project: string, id: string) { return history(project).findCommitted(id); },
      transferred(project: string) { return history(project).transferred(approvalOwner, "proposal-item"); },
    },
    tree<T>(project: string, id: string, key: string, raw: GoalTreeProposalDecisionAuthority, input: unknown, run: () => T): T {
      if (raw?.authority_source !== "web" && raw?.authority_source !== "management") return run();
      return store.db.transaction(() => {
        const authority = provenance.validateEventDecisionAuthority({ ...raw, authority_source: raw.authority_source as "web" | "management" });
        current = commit(project, { kind: "goal-tree-proposal", id }, authority, key, input);
        try {
          const result = run();
          finish(project, current.decision_id, "goal-tree-proposal");
          return result;
        } finally { current = undefined; }
      }).immediate();
    },
  };
}

export function fixtureProjectRule(store: LocalProjectDatabase, project: string, actor: string, requiresPerson: boolean, reason: string) {
  const owner = projectApprovalRules(store.db, project);
  return store.db.transaction(() => owner.commit({ kind: "set", scope: { kind: "project_default" }, reason,
    expected_revision: owner.read(false).revision, requires_person: requiresPerson }, actor, new Date().toISOString(), () => undefined)).immediate();
}

/**
 * Goals' modules and application steps composed over one project library, as a test drives them directly. The Host used to build
 * this for every project (`GoalProjectApplication`); since PG-094 S12 Goals composes its own application inside its plugin
 * (`createGoalsPlugin`) and the Host holds none, so a test that needs the facts without the action layer composes them here, over
 * the library it opened itself, with the same pieces and no rule of its own.
 */
export class GoalProjectApplication {
  private readonly goalsModule: GoalsModule;
  private readonly governanceQuery: GovernanceApplicationApi["query"];
  readonly governance: GovernanceApplicationApi;
  readonly goals: GoalsApplicationApi;
  readonly goalEvents: GoalsApplication["goalEvents"];
  readonly goalInputs: GoalInputBindingsApi;
  readonly goalAcknowledgements: GoalEventAcknowledgementsApi;
  readonly goalQueries: GoalsApplication["goalQueries"];
  readonly goalTree: GoalsApplication["goalTree"];
  readonly goalTreeSubmission: GoalsApplication["goalTreeSubmission"];
  readonly goalTreeCheck: GoalsApplication["goalTreeCheck"];
  readonly goalTreeDecision: GoalsApplication["goalTreeDecision"];
  readonly goalDecisionAttention: GoalsApplication["goalDecisionAttention"];
  readonly projectOpened: GoalsApplication["projectOpened"];

  /** Each Goal's confirmed deliverables, as the plugin reads them from the Context Ledger; a test sets what the person confirmed. */
  readonly confirmedDeliverables = new Map<string, Array<{ artifact_id: string; version: number }>>();

  constructor(
    readonly store: LocalProjectDatabase,
    private readonly clock: () => Date = () => new Date(),
    private readonly personalPlanningMethodPacks: readonly PlanningMethodPack[] | (() => readonly PlanningMethodPack[]) = [],
    /** Writes the way the plugin does (events, receipts and ledger edges under Goals' own names), so a Host that runs the plugin over this library reads them. */
    readonly owned = true,
  ) {
    const journal = owned ? ownedJournal(this.store) : this.store;
    const approvals = fixtureApprovals(store, this.clock);
    const governanceModule = new GovernanceCollaborationModule({ db: governanceSqlite(this.store.db), journal, ...approvals });
    this.governanceQuery = governanceModule.query;
    this.governance = { provenance: governanceModule.provenance, query: governanceModule.query, records: governanceModule.records,
      decisions: governanceModule.decisions, eventDecisions: governanceModule.eventDecisions };
    const ledger = createContextLedger(this.store.db, { authorize: access => access.scope.kind === "personal", now: () => this.clock() });
    this.goalInputs = new GoalInputBindings(this.store.db, owned ? ownedLedger(ledger) : ledger);
    let goalsModule!: GoalsModule;
    goalsModule = new GoalsModule(goalsSqlite(this.store.db), journal,
      { validateRelationGraph: (projectId, input) => goalsModule.planning.validateRelationAddition(projectId, input) },
      { now: this.clock, personalPlanningMethodPacks: this.personalPlanningMethodPacks,
        approvalRules: (project, history) => projectApprovalRules(store.db, project).read(history, approvalOwner).rules,
        deliverables: (_projectId, goalId) => this.confirmedDeliverables.get(goalId) ?? [] });
    this.goalsModule = goalsModule;
    this.goalAcknowledgements = goalsModule.acknowledgements;
    this.goals = { commands: goalsModule.commands, lifecycle: goalsModule.lifecycle, planning: goalsModule.planning };
    const attention = new AttentionModule(this.store.db,
      { exists: (projectId, subjectType, subjectId) => subjectType === "goal_decision" && this.goalsModule.query.getGoal(projectId, subjectId) !== null },
      { eventSink: event => { this.store.appendEvent({ eventId: `event-${randomUUID()}`, projectId: event.project_id, actorId: LOCAL_PERSON_ACTOR_ID,
        objectType: "inbox_entry", objectId: event.entry_id, type: event.type, reason: event.reason, payload: event.payload, at: event.at }); } });
    const application = createGoalsApplication({ goals: { ...this.goals, query: goalsModule.query, events: goalsModule.events }, governance: this.governance, attention, clock: this.clock });
    this.goalEvents = application.goalEvents;
    const record = application.goalEvents.recordTrustedDecision.bind(application.goalEvents);
    this.goalEvents.recordTrustedDecision = input => approvals.event(input.project_id, () => record(input));
    this.goalQueries = application.goalQueries;
    this.goalTree = application.goalTree;
    this.goalTreeSubmission = application.goalTreeSubmission;
    this.goalTreeCheck = application.goalTreeCheck;
    this.goalTreeDecision = { decideGoalTreeProposal: input => approvals.tree(input.project_id, input.proposal_id, input.idempotency_key,
      input.authority, input, () => application.goalTreeDecision.decideGoalTreeProposal(input)) } as GoalsApplication["goalTreeDecision"];
    this.goalDecisionAttention = application.goalDecisionAttention;
    this.projectOpened = projectId => { this.ensureBoard(projectId); application.projectOpened(projectId); };
  }

  /** The board of a project whose library has its root row alone, made under the key and for the person creating the project used to give it. */
  private ensureBoard(projectId: string): void {
    if (this.goalsModule.query.getBoard(projectId) || !listProjectRoots(this.store.db).some(root => root.project_id === projectId)) return;
    this.initializeBoard({ project_id: projectId, actor_id: LOCAL_PERSON_ACTOR_ID, idempotency_key: `project-catalog-create-${projectId}` });
  }

  /** The library's root row, then Goals' board, in one transaction; a project that has its root row keeps it. */
  initializeBoard(input: { project_id: string; actor_id: string; idempotency_key: string }): { project_id: string; replayed: boolean; observed_event_cursor: number } {
    return this.store.db.transaction(() => {
      writeProjectRoot(this.store.db, input.project_id, this.clock().toISOString());
      return this.goals.commands.initializeBoard(input);
    }).immediate();
  }

  /** Goals' own reads over this library: what `LocalProjectDatabase.goalsQuery` was before the library stopped carrying Goals' modules. */
  get goalsQuery(): GoalsModule["query"] { return this.goalsModule.query; }
  /** The board as one snapshot (the read `LocalProjectDatabase.snapshot` was). */
  snapshot(projectId: string) { return readMolisWorkSnapshot({ goals: this.goalsModule.query, governance: this.governanceQuery }, projectId); }

  /** The events Goals wrote in this library, newest first, under the names its modules use (what the plugin's own reader gives). */
  ownedEvents(projectId: string) {
    if (!this.owned) return this.store.readEventsDescending(projectId);
    const namespace = `${GOALS_PLUGIN_ID}:`;
    return this.store.readOwnedEventsDescending(projectId, namespace).map(event => ({ ...event, type: event.type.slice(namespace.length), object_type: event.object_type.slice(namespace.length) }));
  }

  readProjectGuidance(projectId: string) { return this.goalQueries.readProjectGuidance(projectId); }
  saveProjectApproval(project: string, actor: string, requiresPerson: boolean, reason: string) {
    return fixtureProjectRule(this.store, project, actor, requiresPerson, reason);
  }
  setActiveGoal(projectId: string, input: { goal_id: string; reason: string }, write: { actor_id: string; actor_kind?: "user" | "runtime"; idempotency_key: string; reason?: string }) {
    return this.goals.commands.setActiveGoal(projectId, input, write);
  }
  listTrashedGoals(projectId: string) { return this.goalQueries.listTrashedGoals(projectId); }
  getResolvedGoalPolicy(input: { project_id: string; goal_id: string }) { return this.goalQueries.getResolvedGoalPolicy(input); }
  readGoalContract(projectId: string, goalId: string) { return this.goalQueries.readGoalContract(projectId, goalId); }
}

const applications = new WeakMap<LocalProjectDatabase, GoalProjectApplication>();
/** The project's journal as Goals writes it in a plugin: this plugin's names on its events and receipts, and its own events' cursor (the platform's `projectJournalBinding`). */
function ownedJournal(store: LocalProjectDatabase) {
  const namespace = `${GOALS_PLUGIN_ID}:`;
  return {
    eventCursor: (projectId: string) => store.ownedEventCursor(projectId, namespace),
    appendEvent: (input: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent({ ...input, type: namespace + input.type, objectType: namespace + input.objectType }),
    getIdempotency: (projectId: string, actorId: string, operation: string, key: string) => store.getIdempotency(projectId, actorId, namespace + operation, key),
    putIdempotency: (input: Parameters<LocalProjectDatabase["putIdempotency"]>[0]) => store.putIdempotency({ ...input, operation: namespace + input.operation }),
  };
}

/** The Context Ledger as Goals reaches it in a plugin: its edges are stored as `<plugin id>:<key>` and a list shows its own edges only (`pluginContextLedgerFor`). */
function ownedLedger(ledger: ContextLedgerApi): ContextLedgerApi {
  const prefix = `${GOALS_PLUGIN_ID}:`;
  const named = (key: string) => key === "" ? key : prefix + key;
  const bare = <T extends { key: string }>(edge: T): T => ({ ...edge, key: edge.key.slice(prefix.length) });
  const bareOrNull = <T extends { key: string }>(edge: T | null): T | null => edge === null ? null : bare(edge);
  return {
    query: {
      get: (access, key) => bareOrNull(ledger.query.get(access, named(key))),
      list: (access, query) => ledger.query.list(access, query).filter(edge => edge.key.startsWith(prefix)).map(bare),
      history: (access, key) => ledger.query.history(access, named(key)).map(bare),
    },
    commands: {
      put: (access, input) => bare(ledger.commands.put(access, { ...input, key: named(input.key) })),
      remove: (access, key, cause, recordedAt) => bareOrNull(ledger.commands.remove(access, named(key), cause, recordedAt)),
    },
  };
}

/** The Goals facts of a project the Host has open, as a test reads or writes them: one composition over the open library (the Host holds none). */
export function goalApplicationOf(runtime: { readonly store: LocalProjectDatabase }): GoalProjectApplication {
  return goalApplicationFor(runtime.store);
}
export function goalApplicationFor(store: LocalProjectDatabase): GoalProjectApplication {
  let application = applications.get(store);
  if (!application) applications.set(store, application = new GoalProjectApplication(store));
  return application;
}
/** The board of a project as one snapshot, read from a library the test opened. */
export const boardSnapshot = (store: LocalProjectDatabase, projectId: string) => goalApplicationFor(store).snapshot(projectId);
/** Goals' reads over a library the test opened. */
export const goalsQueryOf = (store: LocalProjectDatabase) => goalApplicationFor(store).goalsQuery;

/**
 * A new project's library with the platform's root row and Goals' board, made at once and without a Host: what the sample was before
 * Goals became a plugin (PG-094 S12), minus the sample's Goals (`seedDemoGoals` makes those through Goals' actions). The board is
 * written under the key Goals' own catch-up gives it, so a Host that opens the library later finds it made.
 */
export function seedBoard(databasePath: string, projectId = DEMO_PROJECT_ID): void {
  seedDemoBoard(databasePath, projectId);
  const store = new LocalProjectDatabase(databasePath);
  try {
    new GoalProjectApplication(store).initializeBoard({ project_id: projectId, actor_id: LOCAL_PERSON_ACTOR_ID, idempotency_key: `project-catalog-create-${projectId}` });
    store.checkpoint();
  } finally { store.close(); }
}
