import { canonicalJsonValue as canonicalize } from "@molis-ai/molis-work-plugin-sdk";
import { treeErrors, type TreeErrorCode } from "./goal-tree-errors.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { createHash } from "node:crypto";
import type { GoalsQueryApi, GoalsApplicationApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GovernanceApplicationApi, GoalTreeProposalDecideInput, GoalTreeProposalItemRecord, ProposalAffectedObject } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalTreeApplicationApi, GoalTreeProposalDecisionResult } from "./goal-tree-contract.js";
import type { GoalTreeQueryApplication } from "./goal-tree-query.js";
import type { GoalTreeInputReader } from "./goal-tree-inputs.js";
import type { GoalTreeDecisionNormalizer, NormalizedGoalTreeProposalDecision } from "./goal-tree-decision-inputs.js";
import type { NormalizedGoalTreeProposalItem } from "./proposal-normalizer.js";
import type { GoalTreeMaterializationConflicts } from "./goal-tree-materialization-conflicts.js";
import type { GoalTreeMaterializationApplication } from "./goal-tree-materialization.js";
import type { GoalTreeDecisionFollowup } from "./goal-tree-decision-followup.js";
import { GoalTreeDecisionPlan } from "./goal-tree-decision-plan.js";
import { goalTreeMaterializationGroups } from "./goal-tree-materialization-order.js";
import type { GoalDecisionAttentionSync } from "./goal-decision-attention.js";

/**
 * What makes two decisions the same request: who decided, from which entry, and what was decided. Which message carried it (the page's
 * one-time key, a management command's evidence) is an audit locator the entry names, not part of what was decided, so the same decision
 * retried under another transport key is still the same request and replays its result.
 */
function decisionIdentity<A extends { conversation_ref: string; message_ref: string }>(authority: A): Omit<A, "conversation_ref" | "message_ref"> {
  const { conversation_ref: _conversation, message_ref: _message, ...decider } = authority;
  return decider;
}

/** Applies a subset or a pristine whole proposal under the original all-owner transaction. */
export class GoalTreeDecisionApplication implements Pick<GoalTreeApplicationApi, "decideGoalTreeProposal"> {
  private readonly plan: GoalTreeDecisionPlan;
  constructor(private readonly ports: {
    goals: Pick<GoalsApplicationApi, "planning" | "lifecycle"> & { query: GoalsQueryApi };
    governance: Pick<GovernanceApplicationApi, "records">;
    query: GoalTreeQueryApplication; inputs: GoalTreeInputReader; normalizer: GoalTreeDecisionNormalizer;
    conflicts: GoalTreeMaterializationConflicts; materialization: GoalTreeMaterializationApplication;
    followup: GoalTreeDecisionFollowup; clock: () => Date;
    attention?: Pick<GoalDecisionAttentionSync, "settleProposal">;
  }) { this.plan = new GoalTreeDecisionPlan(ports); }

  decideGoalTreeProposal(input: GoalTreeProposalDecideInput): GoalTreeProposalDecisionResult {
    const authority = this.ports.normalizer.normalizeAuthority(input.authority);
    const wholeConfirmation = input.confirm_all_pending === true;
    const proposalId = this.requiredText(
      input.proposal_id,
      "goals.goal_tree_proposal.id_required",
      "需要指定要决定的 Goal Tree proposal_id",
    );
    const runtimeActorId = nullableDialogueText(input.runtime_actor_id);
    const hash = requestHash({
      project_id: input.project_id,
      proposal_id: proposalId,
      runtime_actor_id: runtimeActorId,
      authority: decisionIdentity(authority),
      decisions: input.decisions ?? [],
      reason: input.reason ?? null,
      confirm_all_pending: wholeConfirmation,
    });
    const result = this.ports.governance.records.executeGoalTreeDecision({
      project_id: input.project_id, actor_id: authority.actor_id, idempotency_key: input.idempotency_key, request_hash: hash,
    }, () => {
      this.requireBoard(input.project_id);
      const proposal = this.ports.query.readNative(input.project_id, proposalId);
      if (proposal.state !== "pending" && proposal.state !== "partially_applied") {
        throw treeErrors["goals.goal_tree_proposal.decision_not_pending"]("只有仍有待处理条目的 Goal Tree 提案可以继续决定");
      }
      const { decisions, itemsById, planningConflicts } = this.plan.prepare(input, proposal, authority);

      const now = this.ports.clock().toISOString();
      const appliedItemIds: string[] = [];
      const rejectedItemIds: string[] = [];
      const revisedItemIds: string[] = [];
      const conflictItemIds: string[] = [];
      const confirmed: Array<{ item: GoalTreeProposalItemRecord; decision: NormalizedGoalTreeProposalDecision }> = [];

      for (const decision of decisions) {
        const item = itemsById.get(decision.item_id)!;
        if (decision.decision === "reject") {
          this.ports.governance.records.recordGoalTreeItemDecision({
            project_id: input.project_id,
            proposal_id: proposal.proposal_id,
            item,
            item_state: "rejected",
            decision: "rejected",
            authority,
            runtime_actor_id: runtimeActorId,
            reason: decision.reason,
            conflict: null,
            materialized_objects: [],
            revision_proposal_id: null,
            at: now,
          });
          rejectedItemIds.push(item.item_id);
          continue;
        }
        if (decision.decision === "revise") continue;
        const planningConflict = planningConflicts.get(item.item_id);
        if (planningConflict) {
          if (wholeConfirmation) {
            this.plan.abortWholeConfirmation(item, {
              code: planningConflict.code,
              message: planningConflict.message,
              goal_ids: planningConflict.goal_ids,
              relation_ids: planningConflict.relation_ids,
              path: planningConflict.path,
            });
          }
          this.ports.governance.records.recordGoalTreeItemDecision({
            project_id: input.project_id,
            proposal_id: proposal.proposal_id,
            item,
            item_state: "conflict",
            decision: "conflict",
            authority,
            runtime_actor_id: runtimeActorId,
            reason: decision.reason,
            conflict: {
              code: planningConflict.code,
              message: planningConflict.message,
              goal_ids: planningConflict.goal_ids,
              relation_ids: planningConflict.relation_ids,
              path: planningConflict.path,
            },
            materialized_objects: [],
            revision_proposal_id: null,
            at: now,
          });
          conflictItemIds.push(item.item_id);
          continue;
        }
        const conflicts = this.ports.query.baselines.itemConflicts(input.project_id, item);
        if (conflicts.length > 0) {
          if (wholeConfirmation) {
            this.plan.abortWholeConfirmation(item, {
              code: "goals.goal_tree_proposal.baseline_changed",
              message: "条目依赖的 Molis Work 事实已经变化",
              objects: conflicts,
            });
          }
          this.ports.governance.records.recordGoalTreeItemDecision({
            project_id: input.project_id,
            proposal_id: proposal.proposal_id,
            item,
            item_state: "conflict",
            decision: "conflict",
            authority,
            runtime_actor_id: runtimeActorId,
            reason: decision.reason,
            conflict: { objects: conflicts },
            materialized_objects: [],
            revision_proposal_id: null,
            at: now,
          });
          conflictItemIds.push(item.item_id);
          continue;
        }
        confirmed.push({ item, decision });
      }

      const confirmedById = new Map(confirmed.map(entry => [entry.item.item_id, entry]));
      const materializationOrder = goalTreeMaterializationGroups(
        input.project_id, confirmed.map(entry => entry.item),
      );
      for (const group of materializationOrder) {
        for (const orderedItem of group) {
          const entry = confirmedById.get(orderedItem.item_id)!;
          const conflict = this.ports.conflicts.read(input.project_id, entry.item);
          if (conflict) {
            if (wholeConfirmation) this.plan.abortWholeConfirmation(entry.item, conflict);
            this.ports.governance.records.recordGoalTreeItemDecision({
              project_id: input.project_id,
              proposal_id: proposal.proposal_id,
              item: entry.item,
              item_state: "conflict",
              decision: "conflict",
              authority,
              runtime_actor_id: runtimeActorId,
              reason: entry.decision.reason,
              conflict,
              materialized_objects: [],
              revision_proposal_id: null,
              at: now,
            });
            conflictItemIds.push(entry.item.item_id);
            continue;
          }
          let materializedObjects: ProposalAffectedObject[];
          try {
            materializedObjects = this.ports.materialization.materialize(
              input.project_id,
              entry.item,
              authority.actor_id,
              entry.decision.reason,
              now,
            );
          } catch (error) {
            if (wholeConfirmation && error instanceof ActionError) {
              this.plan.abortWholeConfirmation(entry.item, {
                code: error.code,
                message: error.message,
                ...(error.details ?? {}),
              });
            }
            throw error;
          }
          this.ports.governance.records.recordGoalTreeItemDecision({
            project_id: input.project_id,
            proposal_id: proposal.proposal_id,
            item: entry.item,
            item_state: "applied",
            decision: "confirmed",
            authority,
            runtime_actor_id: runtimeActorId,
            reason: entry.decision.reason,
            conflict: null,
            materialized_objects: materializedObjects,
            revision_proposal_id: null,
            at: now,
          });
          appliedItemIds.push(entry.item.item_id);
        }
      }

      if (appliedItemIds.length > 0) {
        const graph = this.ports.goals.planning.validateBoardGraph(input.project_id);
        const blocking = graph.issues.filter((issue) =>
          issue.code === "goals.planning.part_of_cycle" || issue.code === "goals.planning.dependency_cycle" || issue.code === "goals.planning.execution_cycle");
        if (blocking[0]) {
          throw treeErrors[blocking[0].code as "goals.planning.part_of_cycle" | "goals.planning.dependency_cycle" | "goals.planning.execution_cycle"](blocking[0].message, {
            goal_ids: blocking[0].goal_ids,
            relation_ids: blocking[0].relation_ids,
          });
        }
      }

      const revisionInputs = decisions.filter(
        (decision): decision is NormalizedGoalTreeProposalDecision & { revised_item: NormalizedGoalTreeProposalItem } =>
          decision.decision === "revise" && decision.revised_item != null,
      );
      const revisionProposals = revisionInputs.length > 0
        ? [
            this.ports.followup.createGoalTreeProposalRevision(
              input.project_id,
              proposal,
              revisionInputs,
              authority,
              runtimeActorId,
              now,
            ),
          ]
        : [];
      const revisionProposal = revisionProposals[0] ?? null;
      for (const decision of revisionInputs) {
        const item = itemsById.get(decision.item_id)!;
        this.ports.governance.records.recordGoalTreeItemDecision({
          project_id: input.project_id,
          proposal_id: proposal.proposal_id,
          item,
          item_state: "superseded",
          decision: "revised",
          authority,
          runtime_actor_id: runtimeActorId,
          reason: decision.reason,
          conflict: null,
          materialized_objects: [],
          revision_proposal_id: revisionProposal?.proposal_id ?? null,
          at: now,
        });
        revisedItemIds.push(item.item_id);
      }

      const changedGoalIds = confirmed
        .filter((entry) => appliedItemIds.includes(entry.item.item_id))
        .flatMap((entry) => entry.item.affected_objects)
        .filter((object) => object.object_type === "goal")
        .map((object) => object.object_id);
      const semanticReview = this.ports.followup.goalTreeSemanticReview(input.project_id, changedGoalIds);
      this.ports.governance.records.refreshGoalTreeProposalState(
        input.project_id,
        proposal.proposal_id,
        authority.actor_id,
        now,
        semanticReview,
      );
      const cursor = this.ports.governance.records.recordGoalTreeDecision({
        project_id: input.project_id, proposal_id: proposal.proposal_id, authority, runtime_actor_id: runtimeActorId,
        applied_item_ids: appliedItemIds, rejected_item_ids: rejectedItemIds, revised_item_ids: revisedItemIds,
        conflict_item_ids: conflictItemIds, revision_proposal_ids: revisionProposals.map(item => item.proposal_id),
        semantic_review: semanticReview, at: now,
      });
      const outcome: Omit<GoalTreeProposalDecisionResult, "replayed"> = {
        proposal: this.ports.query.readNative(input.project_id, proposal.proposal_id),
        revision_proposals: revisionProposals.map((item) => this.ports.query.readNative(input.project_id, item.proposal_id)),
        applied_item_ids: appliedItemIds,
        rejected_item_ids: rejectedItemIds,
        revised_item_ids: revisedItemIds,
        conflict_item_ids: conflictItemIds,
        semantic_review: semanticReview,
        transitions: [],
        observed_event_cursor: cursor,
      };
      return { value: outcome, at: now };
    });
    this.ports.attention?.settleProposal(input.project_id, result.proposal);
    for (const revision of result.revision_proposals) {
      this.ports.attention?.settleProposal(input.project_id, revision);
    }
    return result;
  }

  private requireBoard(projectId: string): void {
    if (!this.ports.goals.query.getBoard(projectId)) throw treeErrors["goals.board.not_found"](`这个项目还没有初始化目标资料库: ${projectId}`);
  }
  private requiredText(value: string, code: TreeErrorCode, message: string): string {
    const text = value.trim();
    if (!text) throw treeErrors[code](message);
    return text;
  }
}

function nullableDialogueText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value.trim();
  return text || null;
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}
