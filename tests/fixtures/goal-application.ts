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
import { approvalOutcomeCollection, projectApprovalRules, projectReviewDecisions, readApprovalOutcome } from "@molis-ai/molis-work-service-project-approvals";
import { goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { openAcceptance, type AcceptanceService } from "@molis-ai/molis-work-module-acceptance";
import { ACCEPTANCE_PROVIDER_ID, type AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import type { GoalAcceptanceReading, GoalHungRequirement } from "@molis-ai/molis-work-plugin-goals/contract";
import {
  createGoalsApplication, GOALS_PLUGIN_ID, GoalInputBindings, GoalsModule, GovernanceCollaborationModule, GovernanceEventDecisions, GovernanceProvenance, readMolisWorkSnapshot,
  type GoalsApplication,
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
    // The platform reads the result where Goals' Manifest declares it (44B).
    const outcome = record && record.review.target.subject.kind === kind
      ? readApprovalOutcome(store.db, approvalOutcomeCollection(goalsManifest.sync?.collections)!, project, id, record.review.target.subject) : null;
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
    }),
    treeApprovals: {
      current: () => current,
      read(project: string, id: string) { return history(project).findCommitted(id); },
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

  /**
   * The platform's acceptance of each project's Goals, over this same library (contract-design §10). As the plugin does, a command
   * that stands on the requirements is handed the platform's reading when the test gave none, and what a new Goal hung is set on
   * the platform once its write has returned. A test drives the acceptance itself (delivering, reporting, deciding) through it.
   */
  acceptanceOf(projectId: string): AcceptanceService {
    let service = this.acceptances.get(projectId);
    // As the Host opens it (`acceptance-library.ts`): a person's decision counts once this library holds its trusted-decision record.
    if (!service) this.acceptances.set(projectId, service = openAcceptance(this.store.db, projectId, { now: () => this.clock().toISOString(),
      vouched: id => projectReviewDecisions(this.store.db, projectId).findCommitted(id) !== null }));
    return service;
  }
  /** The platform's view of a Goal's requirements. */
  acceptanceView(projectId: string, goalId: string): AcceptanceView {
    return this.acceptanceOf(projectId).read(acceptanceCaller(projectId), { subjects: [goalSubject(goalId)] }).views[0]!;
  }
  /** The Goal's requirements as listed on the platform, replacing the list (Goals hanging them before a delivery, the person after). */
  setRequirements(projectId: string, goalId: string, requirements: ReadonlyArray<{ requirement_id: string; statement: string; human_decision_required?: boolean }>, person = false): AcceptanceView {
    return this.acceptanceOf(projectId).set(person ? personCaller(projectId) : acceptanceCaller(projectId), { subject: goalSubject(goalId), requirements: requirements.map(item => ({
      id: item.requirement_id, statement: item.statement, requires_person: item.human_decision_required === true })) });
  }
  /**
   * One more delivered version of the Goal, touching every current requirement. With no evidence to look up (no `made_in`) the
   * platform writes it before its first wait, so it is done when this returns; the round is read back to be sure.
   */
  deliver(projectId: string, goalId: string): AcceptanceView {
    const before = this.acceptanceView(projectId, goalId);
    const pending = this.acceptanceOf(projectId).deliver(acceptanceCaller(projectId), { subject: goalSubject(goalId), version: `v${before.round + 1}`,
      ...(before.round > 0 ? { touches: before.requirements.map(requirement => requirement.id) } : {}) }, NO_EVIDENCE);
    pending.catch(() => undefined);
    const after = this.acceptanceView(projectId, goalId);
    if (after.round !== before.round + 1) throw new Error("the delivery was not recorded");
    return after;
  }
  /** The person accepts (or returns) the named requirements on the delivery they stand on; a Goal with none delivered gets its first. */
  decide(projectId: string, goalId: string, accepts: readonly string[], returns: readonly string[] = []): AcceptanceView {
    const view = this.acceptanceView(projectId, goalId).round ? this.acceptanceView(projectId, goalId) : this.deliver(projectId, goalId);
    const version = (id: string) => {
      const requirement = view.requirements.find(item => item.id === id);
      if (!requirement) throw new Error(`requirement ${id} is not listed on the platform`);
      return { id, version: requirement.version };
    };
    // The version the person looked at: the latest delivered, whatever it is called (a moved Goal's keep Goals' names).
    const input = { subject: goalSubject(goalId), version: view.version!, accepts: accepts.map(version), returns: returns.map(id => ({ ...version(id), note: "还不行" })) };
    // The item decisions and the platform's trusted-decision record commit together, as `acceptance.decide@1` does behind the protected entry.
    const decisionId = randomUUID(), at = this.clock().toISOString();
    return this.store.db.transaction(() => this.acceptanceOf(projectId).decide(personCaller(projectId), input, decisionId, () => {
      const owner = { scope: "project", project_id: projectId, provider_id: ACCEPTANCE_PROVIDER_ID } as const, key = `fixture-acceptance:${decisionId}`;
      projectReviewDecisions(this.store.db, projectId).commit({ reference: { owner: { kind: "trusted-decision", ...owner }, id: key, version: input.version }, choice_id: "apply", request_key: key },
        { actor_id: "web-user", source: { kind: "person", actor_id: "web-user", entry: { source: "web", conversation_ref: "fixture", message_ref: key } } },
        input, { publisher_signature: `system:${ACCEPTANCE_PROVIDER_ID}`, review: { target: { owner: { kind: "system", ...owner }, subject: goalSubject(goalId).subject, version: input.version }, requirements: [] } },
        at, () => undefined, decisionId);
    })).immediate();
  }
  private readonly acceptances = new Map<string, AcceptanceService>();
  private readonly hanging: Array<{ project_id: string; goal_id: string; requirements: GoalHungRequirement[] }> = [];

  /** Each Goal's confirmed deliverables, as the plugin reads them from the Context Ledger; a test sets what the person confirmed. */
  readonly confirmedDeliverables = new Map<string, Array<{ artifact_id: string; version: number }>>();

  constructor(
    readonly store: LocalProjectDatabase,
    private readonly clock: () => Date = () => new Date(),
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
      { now: this.clock,
        approvalRules: (project, history) => projectApprovalRules(store.db, project).read(history, approvalOwner).rules,
        deliverables: (_projectId, goalId) => this.confirmedDeliverables.get(goalId) ?? [] });
    this.goalsModule = goalsModule;
    this.goalAcknowledgements = goalsModule.acknowledgements;
    this.goals = { commands: goalsModule.commands, lifecycle: goalsModule.lifecycle, planning: goalsModule.planning };
    const attention = new AttentionModule(this.store.db,
      { exists: (projectId, subjectType, subjectId) => subjectType === "goal_decision" && this.goalsModule.query.getGoal(projectId, subjectId) !== null },
      { eventSink: event => { this.store.appendEvent({ eventId: `event-${randomUUID()}`, projectId: event.project_id, actorId: LOCAL_PERSON_ACTOR_ID,
        objectType: "inbox_entry", objectId: event.entry_id, type: event.type, reason: event.reason, payload: event.payload, at: event.at }); } });
    const application = createGoalsApplication({ goals: { ...this.goals, query: goalsModule.query, events: goalsModule.events }, governance: this.governance, attention, clock: this.clock,
      requirementsHung: (goal, requirements) => { this.hanging.push({ project_id: goal.project_id, goal_id: goal.goal_id, requirements }); } });
    this.goalEvents = application.goalEvents;
    const createIntent = application.goalEvents.createIntent.bind(application.goalEvents);
    this.goalEvents.createIntent = input => {
      this.hanging.length = 0;
      const result = createIntent(input);
      for (const hung of this.hanging.splice(0)) this.hang(hung.project_id, hung.goal_id, hung.requirements);
      return result;
    };
    // The commands that stand on the requirements, each given the platform's reading as the plugin's before-hook gives it.
    const wrap = <I extends { project_id: string; goal_id: string; acceptance?: GoalAcceptanceReading }, R>(fn: (input: I) => R) => (input: I): R => fn(this.withReading(input));
    this.goalEvents.configure = wrap(application.goalEvents.configure.bind(application.goalEvents));
    this.goalEvents.applyConcern = wrap(application.goalEvents.applyConcern.bind(application.goalEvents));
    this.goalEvents.requestDecision = wrap(application.goalEvents.requestDecision.bind(application.goalEvents));
    this.goalEvents.citeDecision = wrap(application.goalEvents.citeDecision.bind(application.goalEvents));
    this.goalEvents.setAgreement = wrap(application.goalEvents.setAgreement.bind(application.goalEvents));
    this.goalEvents.submitClosure = wrap(application.goalEvents.submitClosure.bind(application.goalEvents));
    const record = application.goalEvents.recordTrustedDecision.bind(application.goalEvents);
    this.goalEvents.recordTrustedDecision = input => approvals.event(input.project_id, () => record(this.withReading(input)));
    this.goalQueries = application.goalQueries;
    this.goalTree = application.goalTree;
    this.goalTreeSubmission = application.goalTreeSubmission;
    this.goalTreeCheck = application.goalTreeCheck;
    this.goalTreeDecision = { decideGoalTreeProposal: input => approvals.tree(input.project_id, input.proposal_id, input.idempotency_key,
      input.authority, input, () => application.goalTreeDecision.decideGoalTreeProposal(input)) } as GoalsApplication["goalTreeDecision"];
    this.goalDecisionAttention = application.goalDecisionAttention;
    this.projectOpened = projectId => { this.ensureBoard(projectId); application.projectOpened(projectId); };
  }

  /** The input with the platform's reading of its Goal, unless the test gave one (or a Goal the platform cannot read). */
  private withReading<T extends { project_id: string; goal_id: string; acceptance?: GoalAcceptanceReading }>(input: T): T {
    if (input.acceptance !== undefined || typeof input.goal_id !== "string") return input;
    const view = this.acceptanceView(input.project_id, input.goal_id);
    return { ...input, acceptance: { round: view.round, complete: view.complete,
      requirements: view.requirements.map(({ id, statement, requires_person, person, satisfied }) => ({ id, statement, requires_person, person, satisfied })) } };
  }

  /** What a new Goal hung goes to the platform, as the plugin sends it after the write: the platform's list plus the ones it lacks. */
  private hang(projectId: string, goalId: string, hung: readonly GoalHungRequirement[]): void {
    const view = this.acceptanceView(projectId, goalId);
    if (view.round > 0) return;
    const listed = new Set(view.requirements.map(requirement => requirement.id));
    const missing = hung.filter(requirement => !listed.has(requirement.requirement_id));
    if (!missing.length) return;
    this.acceptanceOf(projectId).set(acceptanceCaller(projectId), { subject: goalSubject(goalId), requirements: [
      ...view.requirements.map(({ id, statement, expected, part, requires_person }) => ({ id, statement, requires_person,
        ...(expected !== null ? { expected } : {}), ...(part !== null ? { part } : {}) })),
      ...missing.map(requirement => ({ id: requirement.requirement_id, statement: requirement.statement, requires_person: requirement.human_decision_required })),
    ] });
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

/** A Goal as the platform's acceptance names it: Goals provides it (contract-design §10.3). */
export const goalSubject = (goalId: string) => ({ provider_id: GOALS_PLUGIN_ID, subject: { kind: "goal", id: goalId } });
/** Goals itself, reading and hanging its Goals' requirements; not the person. */
export const acceptanceCaller = (projectId: string) => ({ project_id: projectId, actor_id: GOALS_PLUGIN_ID, person: false, session: null });
/** The person, in the platform's requirement column. */
export const personCaller = (projectId: string) => ({ project_id: projectId, actor_id: "web-user", person: true, session: null });
/** Nothing to look up: a delivery or report with no cited evidence. */
const NO_EVIDENCE = { artifactReadable: async () => false, checkRun: async () => "none" as const, stopped: () => false };

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
