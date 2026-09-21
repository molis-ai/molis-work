import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { ArtifactsModule, type ArtifactsSqliteDatabase } from "@molis-ai/molis-work-module-artifacts";
import type { ArtifactsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { EvidenceVerificationModule, type EvidenceSqliteDatabase } from "@molis-ai/molis-work-module-evidence-verification";
import type { EvidenceVerificationApplicationApi } from "@molis-ai/molis-work-contracts/modules/evidence-verification";
import { ExecutionModule, type ExecutionSqliteDatabase } from "@molis-ai/molis-work-module-execution";
import type { ExecutionApplicationApi } from "@molis-ai/molis-work-contracts/modules/execution";
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
  GoalTreeWebDecisionInput,
  GoalTreeDecisionFollowup,
  GoalTreeDecisionNormalizer,
  GoalEventApplication,
  GoalReadApplication,
  GoalDecisionAttentionSync,
  projectGoalLifecycle,
} from "@molis-ai/molis-work-plugin-goals";
import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import { LocalProjectDatabase } from "./project-database.js";
import type { BoardSnapshot } from "@molis-ai/molis-work-plugin-goals";
import type { GoalRecord, ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/goals";
import type { ExecutionClaimRecord as ClaimRecord, ExecutionRunRecord as RunRecord } from "@molis-ai/molis-work-contracts/modules/execution";

export { projectGoalLifecycle } from "@molis-ai/molis-work-plugin-goals";
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
  private readonly evidenceVerificationModule: EvidenceVerificationModule;
  private readonly executionModule: ExecutionModule;
  private readonly goalsModule: GoalsModule;
  readonly evidenceVerification: EvidenceVerificationApplicationApi;
  readonly execution: ExecutionApplicationApi;
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
  readonly goalTreeWebInput: GoalTreeWebDecisionInput;
  readonly goalTreeDecisionFollowup: GoalTreeDecisionFollowup;
  readonly goalDecisionAttention: GoalDecisionAttentionSync;

  constructor(
    readonly store: LocalProjectDatabase,
    private readonly clock: () => Date = () => new Date(),
    private readonly personalPlanningMethodPacks: readonly PlanningMethodPack[] = [],
  ) {
    const artifactsModule = new ArtifactsModule({
      db: this.store.db as unknown as ArtifactsSqliteDatabase,
      now: () => this.clock().toISOString(),
      errorFactory: (code, message, details) => new MolisWorkV1Error(code, message, details),
      appendEvent: (input) => this.store.appendEvent(input),
    });
    this.artifacts = {
      query: artifactsModule.query,
      commands: artifactsModule.commands,
    };
    this.executionModule = new ExecutionModule({
      db: this.store.db as unknown as ExecutionSqliteDatabase,
    });
    this.execution = {
      query: this.executionModule.query,
    };
    this.evidenceVerificationModule = new EvidenceVerificationModule({
      db: this.store.db as unknown as EvidenceSqliteDatabase,
    });
    this.evidenceVerification = {
      query: this.evidenceVerificationModule.query,
    };
    const governanceModule = new GovernanceCollaborationModule({
      db: this.store.db as unknown as GovernanceSqliteDatabase,
      now: () => this.clock().toISOString(),
      errorFactory: (code, message, details) => new MolisWorkV1Error(code, message, details),
    });
    this.governance = {
      clarification: governanceModule.clarification,
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
        validateRelationGraph: (boardId, input) => goalsModule.planning.validateRelationAddition(boardId, input),
        blockingWork: (boardId, goalId, now) => ({
          claim_ids: this.execution.query.activeClaimIdsForGoal(boardId, goalId, now),
          run_ids: this.execution.query.activeRunIdsForGoal(boardId, goalId),
        }),
      },
      {
        now: this.clock,
        errorFactory: (code, message, details) => new MolisWorkV1Error(code, message, details),
        personalPlanningMethodPacks: this.personalPlanningMethodPacks,
      },
    );
    this.goalsModule = goalsModule;
    this.goals = {
      impacts: goalsModule.impacts,
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
          boardId: event.project_id,
          actorId: "web-user",
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
      listProposals: (boardId) => this.goalTree.listGoalTreeProposals({ board_id: boardId }).proposals,
      goalExists: (boardId, goalId) => this.goalsModule.query.getGoal(boardId, goalId) !== null,
      runGoalId: (boardId, runId) => this.store.snapshot(boardId).runs.find((run) => run.run_id === runId)?.goal_id ?? null,
    });
    this.goalTreeSubmission = new GoalTreeSubmissionApplication({
      goals: { query: this.goalsModule.query, commands: this.goals.commands, planning: this.goals.planning },
      governance: this.governance, query: this.goalTree, clock: this.clock,
      errorFactory: (code, message, details) => new MolisWorkV1Error(code, message, details),
      attention: this.goalDecisionAttention,
    });
    this.goalTreeInputs = new GoalTreeInputReader({ query: this.goalsModule.query, commands: this.goals.commands,
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
      snapshot: (boardId) => this.store.snapshot(boardId),
      goalTreeProposals: (boardId, rootGoalId) =>
        this.goalTree.listGoalTreeProposals({ board_id: boardId, root_goal_id: rootGoalId }).proposals,
    });
    this.goalTreeDecision = new GoalTreeDecisionApplication({
      goals: { ...this.goals, query: this.goalsModule.query }, governance: this.governance, query: this.goalTree,
      inputs: this.goalTreeInputs, normalizer: this.goalTreeDecisionInputs, conflicts: this.goalTreeConflicts,
      materialization: this.goalTreeMaterialization, followup: this.goalTreeDecisionFollowup, clock: this.clock,
      errorFactory: (code, message, details) => new MolisWorkV1Error(code, message, details),
      isDomainError: (error): error is MolisWorkV1Error => error instanceof MolisWorkV1Error,
      attention: this.goalDecisionAttention,
    });
    this.goalTreeWebInput = new GoalTreeWebDecisionInput();
    this.goalTreeCheck = new GoalTreeCheckApplication({
      goals: { query: this.goalsModule.query, planning: this.goals.planning }, governance: this.governance,
      query: this.goalTree, materialization: this.goalTreeMaterialization, clock: this.clock,
      errorFactory: (code, message, details) => new MolisWorkV1Error(code, message, details),
      isDomainError: (error): error is MolisWorkV1Error => error instanceof MolisWorkV1Error,
    });
  }

  projectGoalLifecycle(
    snapshot: Pick<BoardSnapshot, "claims" | "runs">,
    goalId: string,
  ): { claims: ClaimRecord[]; runs: RunRecord[] } {
    return projectGoalLifecycle(snapshot, goalId);
  }

  initializeBoard(input: {
    board_id: string;
    title: string;
    actor_id: string;
    idempotency_key: string;
  }): { board_id: string; replayed: boolean; observed_event_cursor: number } {
    return this.goals.commands.initializeBoard(input);
  }

  readProjectGuidance(boardId: string): ProjectGuidanceView {
    return this.goalQueries.readProjectGuidance(boardId);
  }

  setActiveGoal(
    boardId: string,
    input: { goal_id: string; reason: string },
    write: ActorWrite,
  ): { active_goal_id: string; replayed: boolean; observed_event_cursor: number } {
    return this.goals.commands.setActiveGoal(boardId, input, write);
  }

  /** A dedicated read path for a later trash UI/MCP; ordinary work lists exclude these Goals. */
  listTrashedGoals(boardId: string): GoalRecord[] {
    return this.goalQueries.listTrashedGoals(boardId);
  }

  getResolvedGoalPolicy(input: { board_id: string; goal_id: string }) {
    return this.goalQueries.getResolvedGoalPolicy(input);
  }

  readGoalContract(boardId: string, goalId: string) {
    return this.goalQueries.readGoalContract(boardId, goalId);
  }
}

export type MolisWorkDatabase = SqliteDatabase;
