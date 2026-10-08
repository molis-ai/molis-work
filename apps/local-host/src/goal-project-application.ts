import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { ArtifactsModule, ProcessItemsModule, type ArtifactsSqliteDatabase } from "@molis-ai/molis-work-module-artifacts";
import { builtinTypeDeclared } from "./declared-types.js";
import type { ArtifactsApplicationApi, ProcessItemsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { GovernanceCollaborationModule, type GovernanceSqliteDatabase } from "@molis-ai/molis-work-module-governance-collaboration";
import type { GovernanceApplicationApi } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import {
  GoalsModule,
  GoalInputBindings,
  type GoalsSqliteDatabase,
  type PlanningMethodPack,
} from "@molis-ai/molis-work-module-goals";
import type { GoalsApplicationApi, GoalInputBindingsApi } from "@molis-ai/molis-work-contracts/modules/goals";
import {
  GoalTreeQueryApplication,
  GoalTreeInputReader,
  GoalTreeSubmissionApplication,
  GoalTreeFactMaterializer,
  GoalTreeMaterializationConflicts,
  GoalTreeMaterializationApplication,
  GoalTreeCheckApplication,
  GoalTreeDecisionApplication,
  GoalTreeDecisionFollowup,
  GoalTreeDecisionNormalizer,
  GoalEventApplication,
  GoalReadApplication,
  GoalDecisionAttentionSync,
} from "@molis-ai/molis-work-plugin-goals";
import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import { LocalProjectDatabase } from "./project-database.js";
import type { GoalRecord, ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/goals";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

export { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";

export type GoalTreeProposalListQuery = import("@molis-ai/molis-work-plugin-goals").GoalTreeProposalListQuery;
export type GoalTreeProposalListResult = import("@molis-ai/molis-work-plugin-goals").GoalTreeProposalListResult;
export type GoalTreeProposalCheckResult = import("@molis-ai/molis-work-plugin-goals").GoalTreeProposalCheckResult;
export type GoalTreeProposalDecisionResult = import("@molis-ai/molis-work-plugin-goals").GoalTreeProposalDecisionResult;
export type GoalTreeSemanticReview = import("@molis-ai/molis-work-plugin-goals").GoalTreeSemanticReview;

interface ActorWrite {
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  reason?: string;
}

export class GoalProjectApplication {
  readonly artifacts: ArtifactsApplicationApi;
  /** Exchange data plugins record for each other, kept out of the 成果库 (specs/artifact-positioning A2). */
  readonly processItems: ProcessItemsApplicationApi;
  private readonly goalsModule: GoalsModule;
  readonly governance: GovernanceApplicationApi;
  readonly goals: GoalsApplicationApi;
  readonly goalEvents: GoalEventApplication;
  readonly goalInputs: GoalInputBindingsApi;
  readonly goalQueries: GoalReadApplication;
  readonly goalTree: GoalTreeQueryApplication;
  readonly goalTreeInputs: GoalTreeInputReader;
  readonly goalTreeSubmission: GoalTreeSubmissionApplication;
  readonly goalTreeFacts: GoalTreeFactMaterializer;
  readonly goalTreeConflicts: GoalTreeMaterializationConflicts;
  readonly goalTreeMaterialization: GoalTreeMaterializationApplication;
  readonly goalTreeDecisionInputs: GoalTreeDecisionNormalizer;
  readonly goalTreeCheck: GoalTreeCheckApplication;
  readonly goalTreeDecision: GoalTreeDecisionApplication;
  readonly goalTreeDecisionFollowup: GoalTreeDecisionFollowup;
  readonly goalDecisionAttention: GoalDecisionAttentionSync;

  constructor(
    readonly store: LocalProjectDatabase,
    private readonly clock: () => Date = () => new Date(),
    private readonly personalPlanningMethodPacks: readonly PlanningMethodPack[] | (() => readonly PlanningMethodPack[]) = [],
  ) {
    const artifactsModule = new ArtifactsModule({
      db: this.store.db as unknown as ArtifactsSqliteDatabase,
      now: () => this.clock().toISOString(),
      errorFactory: (code, message, details) => new MolisWorkV1Error(code, message, details),
      appendEvent: (input) => this.store.appendEvent(input),
      declared: builtinTypeDeclared,
    });
    this.artifacts = {
      query: artifactsModule.query,
      commands: artifactsModule.commands,
    };
    const processItemsModule = new ProcessItemsModule({
      db: this.store.db as unknown as ArtifactsSqliteDatabase,
      now: () => this.clock().toISOString(),
      errorFactory: (code, message, details) => new MolisWorkV1Error(code, message, details),
      appendEvent: (input) => this.store.appendEvent(input),
      declared: builtinTypeDeclared,
    });
    this.processItems = { query: processItemsModule.query, commands: processItemsModule.commands };
    const governanceModule = new GovernanceCollaborationModule({
      db: this.store.db as unknown as GovernanceSqliteDatabase,
      now: () => this.clock().toISOString(),
      errorFactory: (code, message, details) => new MolisWorkV1Error(code, message, details),
    });
    this.governance = {
      provenance: governanceModule.provenance,
      query: governanceModule.query,
      records: governanceModule.records,
      decisions: governanceModule.decisions,
      eventDecisions: governanceModule.eventDecisions,
    };
    this.goalInputs = new GoalInputBindings(this.store.db, createContextLedger(this.store.db, {
      authorize: (access) => access.scope.kind === "personal",
      now: () => this.clock(),
    }));
    let goalsModule!: GoalsModule;
    goalsModule = new GoalsModule(
      this.store.db as unknown as GoalsSqliteDatabase,
      {
        validateRelationGraph: (projectId, input) => goalsModule.planning.validateRelationAddition(projectId, input),
      },
      {
        now: this.clock,
        errorFactory: (code, message, details) => new MolisWorkV1Error(code, message, details),
        personalPlanningMethodPacks: this.personalPlanningMethodPacks,
      },
    );
    this.goalsModule = goalsModule;
    this.goals = {
      commands: goalsModule.commands,
      lifecycle: goalsModule.lifecycle,
      planning: goalsModule.planning,
    };
    this.goalEvents = new GoalEventApplication({
      query: goalsModule.query,
      commands: goalsModule.commands,
      events: goalsModule.events,
      planning: goalsModule.planning,
      recordTrustedDecision: (input) => this.governance.eventDecisions.record(input),
    });
    this.goalTree = new GoalTreeQueryApplication({
      goals: this.goalsModule.query,
      governance: this.governance,
      errorFactory: (code, message) => new MolisWorkV1Error(code, message),
    });
    const attention = new AttentionModule(this.store.db, {
      exists: (projectId, subjectType, subjectId) => subjectType === "goal_decision"
        && this.goalsModule.query.getGoal(projectId, subjectId) !== null,
    }, {
      eventSink: (event) => {
        this.store.appendEvent({
          eventId: `event-${randomUUID()}`,
          projectId: event.project_id,
          actorId: LOCAL_PERSON_ACTOR_ID,
          objectType: "inbox_entry",
          objectId: event.entry_id,
          type: event.type,
          reason: event.reason,
          payload: event.payload,
          at: event.at,
        });
      },
    });
    this.goalDecisionAttention = new GoalDecisionAttentionSync({
      attention,
      listProposals: (projectId) => this.goalTree.listGoalTreeProposals({ project_id: projectId }).proposals,
      goalExists: (projectId, goalId) => this.goalsModule.query.getGoal(projectId, goalId) !== null,
    });
    this.goalTreeSubmission = new GoalTreeSubmissionApplication({
      goals: { query: this.goalsModule.query, commands: this.goals.commands, planning: this.goals.planning },
      governance: this.governance, query: this.goalTree, clock: this.clock,
      errorFactory: (code, message, details) => new MolisWorkV1Error(code, message, details),
      attention: this.goalDecisionAttention,
    });
    this.goalTreeInputs = new GoalTreeInputReader({ commands: this.goals.commands,
      errorFactory: (code, message) => new MolisWorkV1Error(code, message) });
    this.goalTreeFacts = new GoalTreeFactMaterializer(
      { commands: this.goals.commands, query: this.goalsModule.query },
      this.goalTreeInputs,
      (code, message, details) => new MolisWorkV1Error(code, message, details),
      (input) => this.goalEvents.createIntent(input),
    );
    this.goalTreeConflicts = new GoalTreeMaterializationConflicts({ query: this.goalsModule.query, planning: this.goals.planning },
      this.governance, this.goalTreeInputs);
    this.goalTreeMaterialization = new GoalTreeMaterializationApplication({
      goals: this.goalsModule.query, transactions: this.governance.decisions, facts: this.goalTreeFacts,
      conflicts: this.goalTreeConflicts,
      isDomainError: (error): error is MolisWorkV1Error => error instanceof MolisWorkV1Error,
    });
    this.goalTreeDecisionInputs = new GoalTreeDecisionNormalizer(this.governance.provenance,
      (code, message) => new MolisWorkV1Error(code, message));
    this.goalTreeDecisionFollowup = new GoalTreeDecisionFollowup({
      goals: { query: this.goalsModule.query, planning: this.goals.planning }, governance: this.governance,
      query: this.goalTree, inputs: this.goalTreeInputs, errorFactory: (code, message) => new MolisWorkV1Error(code, message),
    });
    this.goalQueries = new GoalReadApplication(goalsModule.query, {
      now: () => this.clock(),
      goalTreeProposals: (projectId, rootGoalId) =>
        this.goalTree.listGoalTreeProposals({ project_id: projectId, root_goal_id: rootGoalId }).proposals,
    });
    this.goalTreeDecision = new GoalTreeDecisionApplication({
      goals: { ...this.goals, query: this.goalsModule.query }, governance: this.governance, query: this.goalTree,
      inputs: this.goalTreeInputs, normalizer: this.goalTreeDecisionInputs, conflicts: this.goalTreeConflicts,
      materialization: this.goalTreeMaterialization, followup: this.goalTreeDecisionFollowup, clock: this.clock,
      errorFactory: (code, message, details) => new MolisWorkV1Error(code, message, details),
      isDomainError: (error): error is MolisWorkV1Error => error instanceof MolisWorkV1Error,
      attention: this.goalDecisionAttention,
    });
    this.goalTreeCheck = new GoalTreeCheckApplication({
      goals: { query: this.goalsModule.query, planning: this.goals.planning }, governance: this.governance,
      query: this.goalTree, materialization: this.goalTreeMaterialization, clock: this.clock,
      errorFactory: (code, message, details) => new MolisWorkV1Error(code, message, details),
      isDomainError: (error): error is MolisWorkV1Error => error instanceof MolisWorkV1Error,
    });
  }

  initializeBoard(input: {
    project_id: string;
    title: string;
    actor_id: string;
    idempotency_key: string;
  }): { project_id: string; replayed: boolean; observed_event_cursor: number } {
    return this.goals.commands.initializeBoard(input);
  }

  readProjectGuidance(projectId: string): ProjectGuidanceView {
    return this.goalQueries.readProjectGuidance(projectId);
  }

  setActiveGoal(
    projectId: string,
    input: { goal_id: string; reason: string },
    write: ActorWrite,
  ): { active_goal_id: string; replayed: boolean; observed_event_cursor: number } {
    return this.goals.commands.setActiveGoal(projectId, input, write);
  }

  /** A dedicated read path for a later trash UI/MCP; ordinary work lists exclude these Goals. */
  listTrashedGoals(projectId: string): GoalRecord[] {
    return this.goalQueries.listTrashedGoals(projectId);
  }

  getResolvedGoalPolicy(input: { project_id: string; goal_id: string }) {
    return this.goalQueries.getResolvedGoalPolicy(input);
  }

  readGoalContract(projectId: string, goalId: string) {
    return this.goalQueries.readGoalContract(projectId, goalId);
  }
}

export type MolisWorkDatabase = SqliteDatabase;
