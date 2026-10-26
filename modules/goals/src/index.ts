import { MolisWorkCommands } from "./board-commands.js";
import type {
  AddGoalRelationInput,
  AddProjectGuidanceInput,
  CreateGoalInput,
  GoalEventAcknowledgementsApi,
  GoalEventFactsApi,
  PlanningMethodPack,
  GoalsCommandApi,
  GoalsLifecycleApi,
  GoalsQueryApi,
  GoalsActorWrite,
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
import { ConfirmedRelationCommands } from "./confirmed-relations.js";
import { GoalLifecycleCommands } from "./lifecycle-commands.js";
import { GoalsPlanningEngine } from "./planning/engine.js";
import { GoalsQueryService } from "./query.js";
import { GoalEventAcknowledgements } from "./event-acknowledgement.js";
import { GoalEventFacts } from "./event-facts.js";
import { GoalEventFactsRepository } from "./event-facts-repository.js";
import { GoalEventStateRepository } from "./event-state-repository.js";
import { GoalsRepository, type GoalsJournal, type GoalsSqliteDatabase } from "./repository.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-goals",
  packagePath: "modules/goals",
  kind: "module",
  maturity: "production",
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

export interface GoalsModuleHooks {
  validateRelationGraph?(projectId: string, input: AddGoalRelationInput): GoalRelationGraphIssue | null;
}

export interface GoalsModuleOptions extends GoalsCommandContextOptions {
  personalPlanningMethodPacks?: readonly PlanningMethodPack[] | (() => readonly PlanningMethodPack[]);
}

export class GoalsModule {
  readonly commands: GoalsCommandApi;
  readonly lifecycle: GoalsLifecycleApi;
  readonly planning: GoalsPlanningEngine;
  readonly query: GoalsQueryApi;
  readonly events: GoalEventFactsApi;
  readonly acknowledgements: GoalEventAcknowledgementsApi;

  constructor(
    db: GoalsSqliteDatabase,
    journal: GoalsJournal,
    hooks: GoalsModuleHooks,
    options: GoalsModuleOptions = {},
  ) {
    const repository = new GoalsRepository(db, journal);
    const context = new GoalsCommandContext(repository, options);
    const query = new GoalsQueryService(repository, options);
    this.planning = new GoalsPlanningEngine(
      context,
      options.personalPlanningMethodPacks,
    );
    this.events = new GoalEventFacts(context);
    this.acknowledgements = new GoalEventAcknowledgements(context, new GoalEventFactsRepository(db), new GoalEventStateRepository(db));
    const lifecycle = new GoalLifecycleCommands(context, { validateRelationGraph: hooks.validateRelationGraph });
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
      setActiveGoal: (...args) => boards.setActiveGoal(...args),
      applyConfirmedRelations: input => confirmedRelations.applyConfirmedRelations(input),
      createGoal: (projectId: string, input: CreateGoalInput, write: GoalsActorWrite) =>
        goals.createGoal(projectId, input, write),
      addRelation: (projectId: string, input: AddGoalRelationInput, write: GoalsActorWrite) =>
        goals.addRelation(projectId, input, write),
      deactivateRelation: (
        projectId: string,
        input: { relation_id: string; reason: string },
        write: GoalsActorWrite,
      ) => goals.deactivateRelation(projectId, input, write),
      validateGoalInput: (input: CreateGoalInput) => goals.validateGoalInput(input),
      addProjectGuidance: (input: AddProjectGuidanceInput) => guidance.add(input),
      updateProjectGuidance: (input: UpdateProjectGuidanceInput) => guidance.update(input),
    };
    this.lifecycle = lifecycle;
    this.query = {
      listProjectIds: () => query.listProjectIds(),
      listActivePolicyBindings: (...args) => query.listActivePolicyBindings(...args),
      listPolicyHistory: projectId => query.listPolicyHistory(projectId),
      listWorkEventGoalLinks: projectId => query.listWorkEventGoalLinks(projectId),
      listDependencies: (projectId, goalId) => query.listDependencies(projectId, goalId),
      activeReplacement: (projectId, goalId) => query.activeReplacement(projectId, goalId),
      getRelation: (projectId, relationId) => query.getRelation(projectId, relationId),
      policyBindingState: (projectId, bindingId) => query.policyBindingState(projectId, bindingId),
      criterionGoalId: criterionId => query.criterionGoalId(criterionId),
      getBoard: (projectId: string) => query.getBoard(projectId),
      getGoal: (projectId: string, goalId: string) => query.getGoal(projectId, goalId),
      hasGoalIdentity: goalId => query.hasGoalIdentity(goalId),
      listGoals: (projectId: string, queryOptions) => query.listGoals(projectId, queryOptions),
      listRelations: (projectId: string, goalId?: string) => query.listRelations(projectId, goalId),
      listTrashedGoals: (projectId: string) => query.listTrashedGoals(projectId),
      snapshot: (projectId: string) => query.snapshot(projectId),
      resolvePolicy: (projectId: string, goalId: string, strengthen?: Partial<GoalPolicy>) =>
        query.resolvePolicy(projectId, goalId, strengthen),
      readGoal: (projectId: string, goalId: string) => query.readGoal(projectId, goalId),
      readProjectGuidance: (projectId: string) => query.readProjectGuidance(projectId),
    };
  }
}

export { GoalLifecycleCommands } from "./lifecycle-commands.js";
export { GoalEventFacts } from "./event-facts.js";
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
export type { GoalsJournal, GoalsSqliteDatabase } from "./repository.js";
export { GoalInputBindings } from "./input-bindings.js";
export { createPersonalPlanningMethodSchema, PersonalPlanningMethods, readPersonalPlanningMethods } from "./planning/personal-methods.js";

/** Read-only Module assembly; callers do not construct Goals repositories. */
export function createGoalReadServices(db: GoalsSqliteDatabase, journal: GoalsJournal): {
  query: GoalsQueryApi;
  events: Pick<GoalEventFactsApi, "readConfig" | "listEvents" | "listLatestEvents" | "listLatestTimeline" | "listLatestReports" | "readEvent" | "readCurrentRequirements" | "isEventStateOwner" | "readWorkState">;
} {
  const repository = new GoalsRepository(db, journal);
  const context = new GoalsCommandContext(repository);
  return {
    query: new GoalsQueryService(repository),
    events: new GoalEventFacts(context),
  };
}

export { DEFAULT_GOAL_POLICY } from "./query.js";
/** The module's refusals as declared, each with its kind (specs/repository-anti-corruption W3-02). */
export { goalErrors } from "./errors.js";
