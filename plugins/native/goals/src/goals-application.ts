import type { GoalEventFactsApi, GoalsApplicationApi, GoalsQueryApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GovernanceApplicationApi } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { GoalEventApplication } from "./goal-event-application.js";
import { GoalReadApplication } from "./goal-query-application.js";
import { GoalDecisionAttentionSync, type GoalDecisionAttentionPort } from "./goal-decision-attention.js";
import { GOALS_PLUGIN_ID } from "./manifest.js";
import { GoalTreeQueryApplication } from "./goal-tree-query.js";
import { GoalTreeSubmissionApplication } from "./goal-tree-submission.js";
import { GoalTreeInputReader } from "./goal-tree-inputs.js";
import { GoalTreeFactMaterializer } from "./goal-tree-fact-materializer.js";
import { GoalTreeMaterializationConflicts } from "./goal-tree-materialization-conflicts.js";
import { GoalTreeMaterializationApplication } from "./goal-tree-materialization.js";
import { GoalTreeCheckApplication } from "./goal-tree-check.js";
import { GoalTreeDecisionNormalizer } from "./goal-tree-decision-inputs.js";
import { GoalTreeDecisionFollowup } from "./goal-tree-decision-followup.js";
import { GoalTreeDecisionApplication } from "./goal-tree-decision.js";

/** What Goals' own composition is given: Goal facts, governance records, attention and a clock, each as its contract describes it. */
export interface GoalsApplicationPorts {
  readonly goals: GoalsApplicationApi & { readonly query: GoalsQueryApi; readonly events: GoalEventFactsApi };
  readonly governance: GovernanceApplicationApi;
  readonly attention: GoalDecisionAttentionPort;
  readonly clock: () => Date;
}

/**
 * Goals composes its own application from the ports it is given (D3, PG094-07): how the goal tree's proposals are read, checked,
 * decided and turned into Goal facts stays inside the package. What it hands back is what its callers use.
 */
export function createGoalsApplication(ports: GoalsApplicationPorts) {
  const { goals, governance, clock } = ports;
  const goalEvents = new GoalEventApplication({ query: goals.query, commands: goals.commands, events: goals.events, planning: goals.planning,
    recordTrustedDecision: input => governance.eventDecisions.record(input) });
  const goalTree = new GoalTreeQueryApplication({ goals: goals.query, governance });
  const goalDecisionAttention = new GoalDecisionAttentionSync({ attention: ports.attention, owner: GOALS_PLUGIN_ID,
    listProposals: projectId => goalTree.listGoalTreeProposals({ project_id: projectId }).proposals,
    goalExists: (projectId, goalId) => goals.query.getGoal(projectId, goalId) !== null });
  const goalTreeSubmission = new GoalTreeSubmissionApplication({ goals: { query: goals.query, commands: goals.commands, planning: goals.planning },
    governance, query: goalTree, clock, attention: goalDecisionAttention });
  const inputs = new GoalTreeInputReader({ commands: goals.commands });
  const facts = new GoalTreeFactMaterializer({ commands: goals.commands, query: goals.query }, inputs, input => goalEvents.createIntent(input));
  const conflicts = new GoalTreeMaterializationConflicts({ query: goals.query, planning: goals.planning }, governance, inputs);
  const materialization = new GoalTreeMaterializationApplication({ goals: goals.query, transactions: governance.decisions, facts, conflicts });
  const followup = new GoalTreeDecisionFollowup({ goals: { query: goals.query, planning: goals.planning }, governance, query: goalTree, inputs });
  const goalQueries = new GoalReadApplication(goals.query, { now: () => clock(),
    goalTreeProposals: (projectId, rootGoalId) => goalTree.listGoalTreeProposals({ project_id: projectId, root_goal_id: rootGoalId }).proposals });
  const goalTreeDecision = new GoalTreeDecisionApplication({ goals: { lifecycle: goals.lifecycle, planning: goals.planning, query: goals.query },
    governance, query: goalTree, inputs, normalizer: new GoalTreeDecisionNormalizer(governance.provenance), conflicts, materialization, followup, clock,
    attention: goalDecisionAttention });
  const goalTreeCheck = new GoalTreeCheckApplication({ goals: { query: goals.query, planning: goals.planning }, governance, query: goalTree, materialization, clock });
  // Each proposal write settles its own Goal's decision reminder. What drifted while the project was closed (a restored copy,
  // maintenance, a status set from Inbox) catches up once when it opens, not on every request (PG-033 step 1, PG094-08).
  const projectOpened = (projectId: string) => { if (goals.query.getBoard(projectId)) goalDecisionAttention.reconcile(projectId); };
  return { goalEvents, goalQueries, goalTree, goalTreeSubmission, goalTreeCheck, goalTreeDecision, goalDecisionAttention, projectOpened };
}

export type GoalsApplication = ReturnType<typeof createGoalsApplication>;
