import { randomUUID } from "node:crypto";
import type { GoalsQueryApi, GoalsPlanningApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GovernanceApplicationApi, GoalTreeSemanticReview, GoalTreeProposalRecord, GoalTreeProposalDecisionAuthority } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { NormalizedGoalTreeProposalDecision } from "./goal-tree-decision-inputs.js";
import type { NormalizedGoalTreeProposalItem } from "./proposal-normalizer.js";
import type { GoalTreeQueryApplication } from "./goal-tree-query.js";
import type { GoalTreeInputReader } from "./goal-tree-inputs.js";

/** Preserve proposal revisions under the original Goal Tree records. */
export class GoalTreeDecisionFollowup {
  constructor(private readonly ports: {
    goals: { query: Pick<GoalsQueryApi, "getRelation" | "listRelations">; planning: Pick<GoalsPlanningApi, "analyzeChange"> };
    governance: Pick<GovernanceApplicationApi, "records" | "query" | "provenance">;
    query: GoalTreeQueryApplication; inputs: GoalTreeInputReader;
    errorFactory: (code: string, message: string) => Error;
  }) {}
  goalTreeSemanticReview(boardId: string, changedGoalIds: string[]): GoalTreeSemanticReview | null {
    const changed = [...new Set(changedGoalIds)].sort();
    if (changed.length === 0) return null;
    const impact = this.ports.goals.planning.analyzeChange(boardId, changed);
    const required = impact.affected_ancestors.length > 0 ||
      impact.affected_dependents.length > 0 ||
      impact.adjacent_dependencies.length > 0;
    return {
      ...impact,
      structural_validation: "passed",
      status: required ? "required" : "not_required",
      next_action: required ? "review_affected_subgraph" : "continue",
      review_tool: "molis_work_v1_planning_analyze_change",
      canonical_changes_require_new_user_confirmation: true,
    };
  }

  createGoalTreeProposalRevision(
    boardId: string,
    proposal: GoalTreeProposalRecord,
    revisions: Array<NormalizedGoalTreeProposalDecision & { revised_item: NormalizedGoalTreeProposalItem }>,
    authority: GoalTreeProposalDecisionAuthority,
    runtimeActorId: string | null,
    at: string,
  ): GoalTreeProposalRecord {
    const proposalId = `goal-tree-proposal-${randomUUID()}`;
    const itemIds = new Set<string>();
    for (const revision of revisions) {
      if (itemIds.has(revision.revised_item.item_id)) {
        throw this.ports.errorFactory(
          "goal_tree_proposal.revision_item_id_duplicate",
          "同一份修订提案中的新 item_id 不能重复",
        );
      }
      itemIds.add(revision.revised_item.item_id);
      const existing = this.ports.governance.records.findGoalTreeItemOwner(
        revision.revised_item.item_id,
      );
      if (existing) {
        throw this.ports.errorFactory(
          "goal_tree_proposal.revision_item_id_exists",
          "修订条目必须使用新的稳定 item_id",
        );
      }
    }
    const version = proposal.version + 1;
    const summary = `用户要求修订 v${proposal.version}：${revisions.map((item) => item.reason).join("；")}`;
    this.ports.governance.records.insertGoalTreeProposal({
      proposal_id: proposalId,
      board_id: boardId,
      root_goal_id: proposal.root_goal_id,
      submitted_by: runtimeActorId ?? authority.actor_id,
      discovered_in_run_id: proposal.discovered_in_run_id,
      submitted_session_id: proposal.submitted_session_id,
      state: "pending",
      version,
      supersedes_proposal_id: proposal.proposal_id,
      base_event_cursor: this.ports.governance.query.eventCursor(boardId),
      summary,
      narrative: proposal.narrative,
      created_at: at,
      updated_at: at,
    });
    for (const [index, revision] of revisions.entries()) {
      const item = revision.revised_item;
      const baselineVersions = item.affected_objects.map((object) => this.ports.query.baselines.objectVersion(boardId, object, item));
      this.ports.governance.records.insertGoalTreeProposalItem({
        item_id: item.item_id,
        proposal_id: proposalId,
        board_id: boardId,
        ordinal: index + 1,
        kind: item.kind,
        operation: item.operation,
        payload: item.payload,
        source_refs: item.source_refs,
        reason: item.reason,
        explanation: item.explanation,
        confidence: item.confidence,
        affected_objects: item.affected_objects,
        baseline_versions: baselineVersions,
        requires_user_confirmation: true,
        state: "pending",
        supersedes_item_id: revision.item_id,
        created_at: at,
        updated_at: at,
      });
    }
    this.ports.governance.records.recordGoalTreeRevision({
      board_id: boardId, proposal_id: proposalId, authority, supersedes_proposal_id: proposal.proposal_id,
      supersedes_item_ids: revisions.map(item => item.item_id), at,
    });
    return this.ports.query.readNative(boardId, proposalId);
  }
}
