import { randomUUID } from "node:crypto";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { listProjectRoots, writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type { GovernanceApplicationApi } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalEventAcknowledgementsApi, GoalInputBindingsApi, GoalsApplicationApi } from "@molis-ai/molis-work-contracts/modules/goals";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import {
  createGoalsApplication, GOALS_PLUGIN_ID, GoalInputBindings, GoalsModule, GovernanceCollaborationModule, readMolisWorkSnapshot,
  type GoalsApplication, type PlanningMethodPack,
} from "./goals-modules.js";
import { goalsSqlite, governanceSqlite } from "./governance-sqlite.js";

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

  constructor(
    readonly store: LocalProjectDatabase,
    private readonly clock: () => Date = () => new Date(),
    private readonly personalPlanningMethodPacks: readonly PlanningMethodPack[] | (() => readonly PlanningMethodPack[]) = [],
    /** Writes the way the plugin does (events, receipts and ledger edges under Goals' own names), so a Host that runs the plugin over this library reads them. */
    readonly owned = true,
  ) {
    const journal = owned ? ownedJournal(this.store) : this.store;
    const governanceModule = new GovernanceCollaborationModule({ db: governanceSqlite(this.store.db), journal, now: () => this.clock().toISOString() });
    this.governanceQuery = governanceModule.query;
    this.governance = { provenance: governanceModule.provenance, query: governanceModule.query, records: governanceModule.records,
      decisions: governanceModule.decisions, eventDecisions: governanceModule.eventDecisions };
    const ledger = createContextLedger(this.store.db, { authorize: access => access.scope.kind === "personal", now: () => this.clock() });
    this.goalInputs = new GoalInputBindings(this.store.db, owned ? ownedLedger(ledger) : ledger);
    let goalsModule!: GoalsModule;
    goalsModule = new GoalsModule(goalsSqlite(this.store.db), journal,
      { validateRelationGraph: (projectId, input) => goalsModule.planning.validateRelationAddition(projectId, input) },
      { now: this.clock, personalPlanningMethodPacks: this.personalPlanningMethodPacks });
    this.goalsModule = goalsModule;
    this.goalAcknowledgements = goalsModule.acknowledgements;
    this.goals = { commands: goalsModule.commands, lifecycle: goalsModule.lifecycle, planning: goalsModule.planning };
    const attention = new AttentionModule(this.store.db,
      { exists: (projectId, subjectType, subjectId) => subjectType === "goal_decision" && this.goalsModule.query.getGoal(projectId, subjectId) !== null },
      { eventSink: event => { this.store.appendEvent({ eventId: `event-${randomUUID()}`, projectId: event.project_id, actorId: LOCAL_PERSON_ACTOR_ID,
        objectType: "inbox_entry", objectId: event.entry_id, type: event.type, reason: event.reason, payload: event.payload, at: event.at }); } });
    const application = createGoalsApplication({ goals: { ...this.goals, query: goalsModule.query, events: goalsModule.events }, governance: this.governance, attention, clock: this.clock });
    this.goalEvents = application.goalEvents;
    this.goalQueries = application.goalQueries;
    this.goalTree = application.goalTree;
    this.goalTreeSubmission = application.goalTreeSubmission;
    this.goalTreeCheck = application.goalTreeCheck;
    this.goalTreeDecision = application.goalTreeDecision;
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
