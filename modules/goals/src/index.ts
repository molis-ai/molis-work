import { MolisWorkCommands } from "./board-commands.js";
import type {
  AddGoalRelationInput,
  AddProjectGuidanceInput,
  CreateGoalInput,
  GoalEventFactsApi,
  PlanningMethodPack,
  GoalsCommandApi,
  GoalsLifecycleApi,
  GoalsQueryApi,
  GoalsActorWrite,
  GoalsImpactApi,
  GoalPolicy,
  UpdateProjectGuidanceInput,
} from "@molis-ai/molis-work-contracts/modules/goals";

import {
  GoalsCommandContext,
  type GoalsCommandContextOptions,
} from "./command-support.js";
import {
  GoalCommands,
  type GoalRelationGraphIssue,
} from "./goal-commands.js";
import { GuidanceCommands } from "./guidance-commands.js";
import { ProjectPolicyCommands } from "./policy-commands.js";
import { LegacyGoalCoverage } from "./legacy-coverage.js";
import { GoalImpactRepository } from "./impact-repository.js";
import { ConfirmedRelationCommands } from "./confirmed-relations.js";
import {
  GoalLifecycleCommands,
  type GoalsLifecycleHooks,
} from "./lifecycle-commands.js";
import {
  migrateActiveGoalLifecycle,
  migrateGoalArchiveSchema,
  migrateGoalContractCoverageSchema,
  migrateGoalLifecycleState,
  migratePlanningMethodPacksSchema,
  migrateGoalTrashSchema,
  type GoalLifecycleMigrationDatabase,
} from "./migrations.js";
import { GoalsPlanningEngine } from "./planning/engine.js";
import { GoalsQueryService } from "./query.js";
import { GoalEventFacts } from "./event-facts.js";
import { GoalsRepository, type GoalsSqliteDatabase } from "./repository.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-goals",
  packagePath: "modules/goals",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/goals",
  migrationGoals: [
    "goal-reorg-f2",
    "goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8",
    "goal-reorg-gw1",
    "goal-reorg-gw2",
    "goal-reorg-gw3",
    "goal-reorg-gw4",
  ],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "goals.command.v1",
    "goals.repository.v1",
    "goals.lifecycle.v1",
    "goals.planning.v1",
    "goals.query.v1",
  ],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export interface GoalsModuleHooks
  extends Pick<GoalsLifecycleHooks, "blockingWork"> {
  validateRelationGraph?(boardId: string, input: AddGoalRelationInput): GoalRelationGraphIssue | null;
}

export interface GoalsModuleOptions extends GoalsCommandContextOptions {
  personalPlanningMethodPacks?: readonly PlanningMethodPack[] | (() => readonly PlanningMethodPack[]);
}

export class GoalsModule {
  readonly impacts: GoalsImpactApi;
  readonly repository: GoalsRepository;
  readonly commands: GoalsCommandApi;
  readonly lifecycle: GoalsLifecycleApi;
  readonly planning: GoalsPlanningEngine;
  readonly query: GoalsQueryApi;
  readonly events: GoalEventFactsApi;

  constructor(
    db: GoalsSqliteDatabase,
    hooks: GoalsModuleHooks,
    options: GoalsModuleOptions = {},
  ) {
    this.repository = new GoalsRepository(db);
    const context = new GoalsCommandContext(this.repository, options);
    const impactQuery = new GoalImpactRepository(db);
    this.impacts = {
      list: (boardId) => impactQuery.list(boardId),
      get: (boardId, bindingId) => impactQuery.get(boardId, bindingId),
    };
    const query = new GoalsQueryService(this.repository, options);
    this.planning = new GoalsPlanningEngine(
      context,
      options.personalPlanningMethodPacks,
    );
    this.events = new GoalEventFacts(context);
    const lifecycle = new GoalLifecycleCommands(context, hooks);
    const goals = new GoalCommands(context, {
      validateRelationGraph: hooks.validateRelationGraph,
    });
    const guidance = new GuidanceCommands(context);
    const projectPolicy = new ProjectPolicyCommands(context);
    const confirmedRelations = new ConfirmedRelationCommands(context);
    const boards = new MolisWorkCommands(context);
    this.commands = {
      saveProjectPolicy: input => projectPolicy.save(input),
      initializeBoard: input => boards.initializeBoard(input),
      completeLegacyBoardImport: input => boards.completeLegacyBoardImport(input),
      setActiveGoal: (...args) => boards.setActiveGoal(...args),
      importLegacyCoverage: (boardId, rows) => new LegacyGoalCoverage(context).import(boardId, rows),
      applyConfirmedRelations: input => confirmedRelations.applyConfirmedRelations(input),
      createGoal: (boardId: string, input: CreateGoalInput, write: GoalsActorWrite) =>
        goals.createGoal(boardId, input, write),
      addRelation: (boardId: string, input: AddGoalRelationInput, write: GoalsActorWrite) =>
        goals.addRelation(boardId, input, write),
      deactivateRelation: (
        boardId: string,
        input: { relation_id: string; reason: string },
        write: GoalsActorWrite,
      ) => goals.deactivateRelation(boardId, input, write),
      validateGoalInput: (input: CreateGoalInput) => goals.validateGoalInput(input),
      addProjectGuidance: (input: AddProjectGuidanceInput) => guidance.add(input),
      updateProjectGuidance: (input: UpdateProjectGuidanceInput) => guidance.update(input),
    };
    this.lifecycle = lifecycle;
    this.query = {
      listBoardIds: () => query.listBoardIds(),
      listActivePolicyBindings: (...args) => query.listActivePolicyBindings(...args),
      listLegacyCoverage: boardId => query.listLegacyCoverage(boardId),
      listPolicyHistory: boardId => query.listPolicyHistory(boardId),
      listGoalRiskLinks: boardId => query.listGoalRiskLinks(boardId),
      listDependencies: (boardId, goalId) => query.listDependencies(boardId, goalId),
      listOpenGoalRisks: (boardId, goalId) => query.listOpenGoalRisks(boardId, goalId),
      activeReplacement: (boardId, goalId) => query.activeReplacement(boardId, goalId),
      listLifecycleEvents: boardId => query.listLifecycleEvents(boardId),
      listContractRevisions: boardId => query.listContractRevisions(boardId),
      listCoverageRevisions: boardId => query.listCoverageRevisions(boardId),
      getRelation: (boardId, relationId) => query.getRelation(boardId, relationId),
      policyBindingState: (boardId, bindingId) => query.policyBindingState(boardId, bindingId),
      criterionGoalId: criterionId => query.criterionGoalId(criterionId),
      policyBindingVersion: (boardId, bindingId, mode) => query.policyBindingVersion(boardId, bindingId, mode),
      getBoard: (boardId: string) => query.getBoard(boardId),
      getGoal: (boardId: string, goalId: string) => query.getGoal(boardId, goalId),
      hasGoalIdentity: goalId => query.hasGoalIdentity(goalId),
      listGoals: (boardId: string, queryOptions) => query.listGoals(boardId, queryOptions),
      listRelations: (boardId: string, goalId?: string) => query.listRelations(boardId, goalId),
      listTrashedGoals: (boardId: string) => query.listTrashedGoals(boardId),
      snapshot: (boardId: string) => query.snapshot(boardId),
      resolvePolicy: (boardId: string, goalId: string, strengthen?: Partial<GoalPolicy>) =>
        query.resolvePolicy(boardId, goalId, strengthen),
      readGoal: (boardId: string, goalId: string) => query.readGoal(boardId, goalId),
      getRisk: (boardId: string, riskId: string) => this.repository.getRisk(boardId, riskId),
      readProjectGuidance: (boardId: string) => query.readProjectGuidance(boardId),
    };
  }
}

export { GoalsCommandError, type GoalsErrorFactory } from "./errors.js";
export { GOAL_BOARDS_SCHEMA_SQL, GOALS_SCHEMA_SQL } from "./schema.js";
export { migrateRiskTreatmentPlan, migrateProjectGuidance, migrateProjectGuidanceRevisions } from "./guidance-migrations.js";
export { migrateGoalContractRevisionColumn, backfillGoalContractRevisions } from "./revision-migration.js";
export { GoalImpactRepository, GOAL_IMPACTS_SCHEMA_SQL, migrateGoalImpactHistory } from "./impact-repository.js";
export {
  GoalLifecycleCommands,
  type GoalsLifecycleHooks,
} from "./lifecycle-commands.js";
export {
  migrateActiveGoalLifecycle,
  migrateGoalArchiveSchema,
  migrateGoalContractCoverageSchema,
  migrateGoalLifecycleState,
  migratePlanningMethodPacksSchema,
  migrateGoalTrashSchema,
  type GoalLifecycleMigrationDatabase,
};
export { GoalEventFacts } from "./event-facts.js";
export {
  GOAL_EVENT_FACTS_MIGRATION_ID,
  GOAL_EVENT_FACTS_SCHEMA_SQL,
  ensureGoalEventRequirementSourceColumn,
  ensureGoalEventRequirementCurrentColumns,
  migrateGoalEventFactsSchema,
} from "./event-facts-schema.js";
export {
  GOAL_EVENT_STATE_MIGRATION_ID,
  GOAL_EVENT_OWNER_CONTINUE_MIGRATION_ID,
  GOAL_EVENT_AGREEMENT_CHANGE_MIGRATION_ID,
  GOAL_EVENT_STATE_SCHEMA_SQL,
  ensureGoalEventDecisionAuthorizationColumns,
  ensureGoalEventAgreementChangeColumns,
  migrateGoalEventStateSchema,
  migrateGoalEventOwnerContinueSource,
  migrateGoalEventAgreementChange,
} from "./event-state-schema.js";
export { migrateGoalEventWorkflow } from "./event-workflow-migration.js";
export { goalHasEventStateOwner } from "./event-state-repository.js";
export {
  GoalsPlanningEngine,
} from "./planning/engine.js";
export { GoalsQueryService, resolveGoalPolicy } from "./query.js";
export {
  analyzeGoalChangeImpact,
  planningMetrics,
  projectPlanningRelations,
  validatePlanningGraph,
  validatePlanningProposalGraph,
  type GoalChangeImpact,
  type PlanningGraphIssue,
  type PlanningMetric,
  type PlanningRelationChange,
  type PlanningWorkStatus,
} from "./planning/goal-graph.js";
export {
  loadPlanningMethodSources,
  parsePlanningMethodMarkdown,
  type ParsedPlanningMethodSource,
} from "./planning/method-catalog.js";
export { instantiatePlanningRequirementId, resolvePlanningEventAdoption } from "./planning/event-adoption.js";
export {
  BUILTIN_PLANNING_METHOD_PACKS,
  PLANNING_METHOD_CATALOG_DIRECTORY,
  TASK_CONTEXT_METHOD_IDS,
  compilePlanningMethodInstructions,
  composePlanningMethodPacks,
  hydratePlanningMethodPack,
  loadBuiltinPlanningMethodPacks,
  mergedCoverageRules,
  methodPacksForReview,
  normalizePlanningMethodPack,
  resolvePlanningMethodPacks,
  validatePlanningMethodPack,
  type PlanningCoverageRule,
  type PlanningDependencyRule,
  type PlanningMethodComposition,
  type PlanningMethodKind,
  type PlanningMethodPack,
  type PlanningMethodPackInput,
  type PlanningMethodPath,
  type PlanningMethodScope,
  type ResolvedPlanningMethodPack,
} from "./planning/method-packs.js";
export type {
  ConfigureGoalEventsApplicationInput,
  ConfigureGoalEventsInput,
  CreateGoalIntentInput,
  GoalEventConfigView,
  GoalEventFactsApi,
  GoalEventLatestReports,
  GoalEventStateView,
  GoalWorkEventRecord,
  GoalsPlanningApi,
  GoalsQueryApi,
  SaveProjectPlanningMethodInput,
} from "@molis-ai/molis-work-contracts/modules/goals";
export { GoalsRepository, type GoalsSqliteDatabase } from "./repository.js";
export { GOAL_INPUT_BINDINGS_SCHEMA_SQL, GoalInputBindings } from "./input-bindings.js";
export { createPersonalPlanningMethodSchema, PersonalPlanningMethods, readPersonalPlanningMethods } from "./planning/personal-methods.js";

/** Read-only Module assembly; callers do not construct Goals repositories. */
export function createGoalReadServices(db: GoalsSqliteDatabase): {
  query: GoalsQueryApi;
  impacts: GoalsImpactApi;
  events: Pick<GoalEventFactsApi, "readConfig" | "listEvents" | "listLatestEvents" | "listLatestTimeline" | "listLatestReports" | "readEvent" | "readCurrentRequirements" | "isEventStateOwner" | "readWorkState">;
} {
  const repository = new GoalsRepository(db);
  const context = new GoalsCommandContext(repository);
  const impacts = new GoalImpactRepository(db);
  return {
    query: new GoalsQueryService(repository),
    impacts: {
      list: (boardId) => impacts.list(boardId),
      get: (boardId, bindingId) => impacts.get(boardId, bindingId),
    },
    events: new GoalEventFacts(context),
  };
}

export { DEFAULT_GOAL_POLICY } from "./query.js";
