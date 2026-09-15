import { randomUUID } from "node:crypto";
import type {
  ApplyGoalConcernInput,
  GoalEventConcernResult,
  GoalEventConcernStatus,
  GoalEventScope,
  GoalRecord,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { requestHash, type GoalsCommandContext } from "./command-support.js";
import { requiredText } from "./event-facts-validation.js";
import type { GoalEventFactsRepository } from "./event-facts-repository.js";
import {
  decisionCoversConcern,
  decisionHasEffect,
  requiredConcernAction,
} from "./event-state-authorization.js";
import type { GoalEventStateCore } from "./event-state-host.js";
import type { GoalEventStateRepository } from "./event-state-repository.js";
import { emptyScope, scopeIsSubset } from "./event-state-repository.js";

export class GoalEventConcerns {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly facts: GoalEventFactsRepository,
    private readonly records: GoalEventStateRepository,
    private readonly core: GoalEventStateCore,
  ) {}

  applyConcern(input: ApplyGoalConcernInput): GoalEventConcernResult {
    const action = requiredConcernAction(this.core.error, input.action);
    const hash = requestHash({
      board_id: input.board_id,
      goal_id: input.goal_id,
      action,
      concern_id: input.concern_id ?? null,
      title: input.title ?? null,
      statement: input.statement ?? null,
      scope: input.scope ?? null,
      blocks_closure: input.blocks_closure ?? null,
      reason: input.reason ?? null,
      supporting_event_ids: input.supporting_event_ids ?? [],
      cited_decision_id: input.cited_decision_id ?? null,
    });
    return this.core.mutate(input, "apply_goal_concern", hash, (goal, actorKind) => {
      if (action === "open") return this.openConcern(goal, { ...input, action }, actorKind);
      return this.concludeConcern(goal, { ...input, action }, actorKind);
    });
  }

  private openConcern(
    goal: GoalRecord,
    input: ApplyGoalConcernInput,
    actorKind: "user" | "runtime" | null,
  ): Omit<GoalEventConcernResult, "replayed"> {
    const title = requiredText(this.core.error, input.title, "event_concern.title_required", "Concern 需要标题");
    const statement = requiredText(this.core.error, input.statement, "event_concern.statement_required", "Concern 需要说明");
    const scope = this.core.requireLocalScope(goal, input.scope);
    if (emptyScope(scope)) {
      throw this.context.error("event_concern.scope_required", "Concern 必须明确影响的要求、事件或动作，不能变成全局阻塞");
    }
    const concernId = `gcon-${randomUUID()}`;
    const event = this.core.insertSystem(goal, input.actor_id, actorKind, `提出 Concern：${title}`, {
      operation: "concern_opened",
      concern_id: concernId,
      title,
      statement,
      scope,
      blocks_closure: input.blocks_closure === true,
    });
    this.records.insertConcern({
      concernId,
      boardId: goal.board_id,
      goalId: goal.goal_id,
      eventId: event.event_id,
      title,
      statement,
      scope,
      blocksClosure: input.blocks_closure === true,
      at: event.received_at,
    });
    return {
      event_id: event.event_id,
      observed_event_cursor: event.journal_seq,
      recorded: true as const,
      concern: this.records.getConcern(goal.board_id, goal.goal_id, concernId)!,
    };
  }

  private concludeConcern(
    goal: GoalRecord,
    input: ApplyGoalConcernInput,
    actorKind: "user" | "runtime" | null,
  ): Omit<GoalEventConcernResult, "replayed"> {
    const concernId = requiredText(this.core.error, input.concern_id, "event_concern.id_required", "处理 Concern 需要 concern_id");
    const concern = this.records.getConcern(goal.board_id, goal.goal_id, concernId);
    if (!concern) throw this.context.error("event_concern.not_found", "Concern 不存在或不属于当前 Goal");
    const reason = requiredText(this.core.error, input.reason, "event_concern.reason_required", "处理 Concern 需要理由和来源");
    const status: GoalEventConcernStatus = input.action === "resolve"
      ? "resolved"
      : input.action === "accept"
        ? "accepted"
        : "overturned";
    const citedDecisionId = input.cited_decision_id?.trim() || null;
    const supporting = unique(input.supporting_event_ids ?? []);
    this.assertCitedSources(goal, concern, status, supporting, citedDecisionId);
    const operation = status === "resolved" ? "concern_resolved" : status === "accepted" ? "concern_accepted" : "concern_overturned";
    const event = this.core.insertSystem(goal, input.actor_id, actorKind, `Concern ${status}`, {
      operation,
      concern_id: concernId,
      status,
      reason,
      supporting_event_ids: supporting,
      cited_decision_id: citedDecisionId,
      previous_status: concern.status,
    });
    this.records.updateConcern({
      concernId,
      status,
      previousStatus: concern.status,
      reason,
      resolutionEventId: event.event_id,
      citedDecisionId,
      at: event.received_at,
    });
    return {
      event_id: event.event_id,
      observed_event_cursor: event.journal_seq,
      recorded: true as const,
      concern: this.records.getConcern(goal.board_id, goal.goal_id, concernId)!,
    };
  }

  private assertCitedSources(
    goal: GoalRecord,
    concern: { concern_id: string; event_id: string; scope: GoalEventScope },
    status: GoalEventConcernStatus,
    supporting: string[],
    citedDecisionId: string | null,
  ): void {
    const cited = citedDecisionId
      ? this.records.getAppliedDecision(goal.board_id, goal.goal_id, citedDecisionId)
        ?? this.records.getAppliedDecisionByGovernanceId(goal.board_id, goal.goal_id, citedDecisionId)
      : null;
    if (citedDecisionId && !cited) {
      throw this.context.error("event_decision.not_found", "引用的决定不属于当前 Goal");
    }
    if (cited && emptyScope(cited.scope)) {
      throw this.context.error("event_decision.scope_expanded", "空范围的决定不能作为授权");
    }
    if (status === "accepted") {
      if (!cited) {
        throw this.context.error("event_concern.accept_requires_user_decision", "接受风险需要适用的可信用户授权，不能由 Runtime 自行接受");
      }
      if (!decisionHasEffect(cited, "accept_concerns") || !decisionCoversConcern(cited, concern)) {
        throw this.context.error("event_concern.accept_requires_user_decision", "接受风险必须引用明确接受该 Concern 的可信决定，拒绝不是授权");
      }
      return;
    }
    if (cited) {
      if (!decisionCoversConcern(cited, concern) && !scopeIsSubset(concern.scope, cited.scope)) {
        throw this.context.error("event_decision.scope_expanded", "引用的决定没有覆盖这个 Concern 的作用范围");
      }
      return;
    }
    if (supporting.length === 0) {
      throw this.context.error("event_concern.evidence_required", "处理 Concern 需要关联后续实际事件或已有用户决定");
    }
    const opened = this.facts.getWorkEvent(goal.board_id, goal.goal_id, concern.event_id);
    for (const eventId of supporting) {
      const event = this.facts.getWorkEvent(goal.board_id, goal.goal_id, eventId);
      if (!event) throw this.context.error("event_concern.cross_goal_reference", `事件 ${eventId} 不属于当前 Goal`);
      if (opened && event.journal_seq <= opened.journal_seq) {
        throw this.context.error("event_concern.evidence_not_subsequent", "解决或推翻 Concern 必须关联打开之后的实际事件");
      }
    }
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
