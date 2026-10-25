import { requestErrors } from "./errors.js";
import { randomUUID } from "node:crypto";
import type { GovernanceRecordsApi, GoalTreeProposalDecisionResult } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { GovernanceRepository, type GovernanceJournal, type GovernanceSqliteDatabase } from "./repository.js";

/** Goal Tree submission, check and decision keys share one idempotent journal. */
export class GovernanceProposalOperationStore {
  private readonly repository: GovernanceRepository;
  constructor(db: GovernanceSqliteDatabase, private readonly journal: GovernanceJournal) {
    this.repository = new GovernanceRepository(db, journal);
  }

  executeSubmission(input: Parameters<GovernanceRecordsApi["executeGoalTreeSubmission"]>[0],
    operation: Parameters<GovernanceRecordsApi["executeGoalTreeSubmission"]>[1]) {
    const result = this.execute("submit_goal_tree_proposal", input, () => {
      const value = operation();
      return { value, at: value.proposal.created_at };
    });
    return { ...result.value, replayed: result.replayed };
  }

  executeCheck(input: Parameters<GovernanceRecordsApi["executeGoalTreeCheck"]>[0],
    operation: Parameters<GovernanceRecordsApi["executeGoalTreeCheck"]>[1]) {
    return this.execute("check_goal_tree_proposal", input, operation).value;
  }

  executeGoalTreeDecision<TTransition>(input: Parameters<GovernanceRecordsApi["executeGoalTreeDecision"]>[0],
    operation: () => { value: Omit<GoalTreeProposalDecisionResult<TTransition>, "replayed">; at: string }): GoalTreeProposalDecisionResult<TTransition> {
    const result = this.execute("decide_goal_tree_proposal", input, operation);
    return { ...result.value, replayed: result.replayed };
  }

  recordGoalTreeDecision(input: Parameters<GovernanceRecordsApi["recordGoalTreeDecision"]>[0]): number {
    this.repository.appendEvent({
      event_id: randomUUID(), project_id: input.project_id, actor_id: input.authority.actor_id,
      type: "goal_tree_proposal.decided", object_type: "goal_tree_proposal", object_id: input.proposal_id,
      reason: "用户在当前入口明确决定了 Goal Tree 提案中的部分条目",
      payload: {
        runtime_actor_id: input.runtime_actor_id, authority_source: input.authority.authority_source,
        conversation_ref: input.authority.conversation_ref, message_ref: input.authority.message_ref,
        whole_confirmation_prompted: input.authority.whole_confirmation_prompted === true,
        prompted_proposal_id: input.authority.prompted_proposal_id ?? null,
        applied_item_ids: input.applied_item_ids, rejected_item_ids: input.rejected_item_ids,
        revised_item_ids: input.revised_item_ids, conflict_item_ids: input.conflict_item_ids,
        revision_proposal_ids: input.revision_proposal_ids, semantic_review: input.semantic_review,
      }, at: input.at,
    });
    return this.repository.eventCursor(input.project_id);
  }

  private execute<T>(operationName: "submit_goal_tree_proposal" | "check_goal_tree_proposal" | "decide_goal_tree_proposal",
    input: Parameters<GovernanceRecordsApi["executeGoalTreeSubmission"]>[0],
    operation: () => { value: T; at: string }): { value: T; replayed: boolean } {
    return this.repository.immediate(() => {
      const saved = this.journal.getIdempotency(input.project_id, input.actor_id, operationName, input.idempotency_key);
      if (saved) {
        if (saved.request_hash !== input.request_hash) {
          throw requestErrors.idempotency_key_reused(`幂等键 ${input.idempotency_key} 已被不同请求使用`);
        }
        const value = saved.outcome as T | null;
        if (value) return { value, replayed: true };
      }
      const result = operation();
      this.journal.putIdempotency({
        projectId: input.project_id, actorId: input.actor_id, operation: operationName, key: input.idempotency_key,
        requestHash: input.request_hash, outcome: result.value, at: result.at,
      });
      return { value: result.value, replayed: false };
    });
  }

  recordRevision(input: Parameters<GovernanceRecordsApi["recordGoalTreeRevision"]>[0]): number {
    this.repository.appendEvent({
      event_id: randomUUID(), project_id: input.project_id, actor_id: input.authority.actor_id,
      type: "goal_tree_proposal.revision_requested", object_type: "goal_tree_proposal", object_id: input.proposal_id,
      reason: "用户在当前对话要求修订部分 Goal Tree 条目",
      payload: {
        supersedes_proposal_id: input.supersedes_proposal_id, supersedes_item_ids: input.supersedes_item_ids,
        authority_source: input.authority.authority_source, conversation_ref: input.authority.conversation_ref,
        message_ref: input.authority.message_ref,
      }, at: input.at,
    });
    return this.repository.eventCursor(input.project_id);
  }

  recordCheck(input: Parameters<GovernanceRecordsApi["recordGoalTreeCheck"]>[0]): number {
    const conflict = input.conflict_item_ids.length > 0;
    this.repository.appendEvent({
      event_id: randomUUID(), project_id: input.project_id, actor_id: input.actor_id,
      type: "goal_tree_proposal.checked", object_type: "goal_tree_proposal", object_id: input.proposal_id,
      reason: conflict ? "当前 Runtime 检查到部分 Goal Tree 提案条目不再满足当前校验或基准" : "当前 Runtime 检查到 Goal Tree 提案的各条目基准仍有效",
      payload: { conflict_item_ids: input.conflict_item_ids, planning_issue_codes: input.planning_issue_codes },
      at: input.at,
    });
    return this.repository.eventCursor(input.project_id);
  }

  recordSubmission(input: Parameters<GovernanceRecordsApi["recordGoalTreeSubmission"]>[0]): number {
    this.repository.appendEvent({
      event_id: randomUUID(), project_id: input.project_id, actor_id: input.actor_id,
      type: input.supersedes_proposal_id ? "goal_tree_proposal.revised" : "goal_tree_proposal.submitted",
      object_type: "goal_tree_proposal", object_id: input.proposal_id,
      reason: input.supersedes_proposal_id
        ? "当前 Runtime 提交了保留历史的 Goal Tree 提案修订版本"
        : "当前 Runtime 提交了等待用户确认的统一 Goal Tree 提案",
      payload: { root_goal_id: input.root_goal_id,
        base_event_cursor: input.base_event_cursor, version: input.version,
        supersedes_proposal_id: input.supersedes_proposal_id, item_ids: input.item_ids },
      at: input.at,
    });
    return this.repository.eventCursor(input.project_id);
  }
}
