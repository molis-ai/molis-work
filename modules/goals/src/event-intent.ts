import { randomUUID } from "node:crypto";
import type {
  CreateGoalIntentRequirementInput,
  CreateGoalIntentResult,
  GoalIntentSourceKind,
} from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsCommandContext } from "./command-support.js";
import type { GoalEventFactsRepository } from "./event-facts-repository.js";
import type { GoalEventState } from "./event-state.js";

export class GoalEventIntent {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly records: GoalEventFactsRepository,
    private readonly state: GoalEventState,
    private readonly actorKind: (kind: "user" | "runtime" | undefined) => "user" | "runtime" | null,
  ) {}

  replay(boardId: string, actorId: string, idempotencyKey: string, hash: string): CreateGoalIntentResult | null {
    return this.context.replay(boardId, actorId, "create_goal_intent", idempotencyKey, hash);
  }

  remember(
    boardId: string,
    actorId: string,
    idempotencyKey: string,
    hash: string,
    result: CreateGoalIntentResult,
    at: string,
  ): void {
    this.context.remember(boardId, actorId, "create_goal_intent", idempotencyKey, hash, result, at);
  }

  recordArtifacts(input: {
    board_id: string;
    goal_id: string;
    actor_id: string;
    actor_kind?: "user" | "runtime";
    source_kind?: GoalIntentSourceKind;
    outcome?: string;
    requirements?: CreateGoalIntentRequirementInput[];
  }): void {
    const goal = this.context.requireGoal(input.board_id, input.goal_id);
    this.state.adoptOwner({
      board_id: input.board_id,
      goal_id: input.goal_id,
      actor_id: input.actor_id,
      source: "intent",
      outcome: input.outcome,
    });
    const at = this.context.now().toISOString();
    for (const requirement of input.requirements ?? []) {
      const requirementId = requirement.requirement_id?.trim() || `req-${randomUUID()}`;
      this.records.insertRequirement({
        requirement_id: requirementId,
        board_id: input.board_id,
        goal_id: input.goal_id,
        statement: requirement.statement.trim(),
        created_in_config_version: 0,
        actor_id: input.actor_id,
        source: { kind: "create_input" },
        human_decision_required: requirement.human_decision_required === true,
        current_status: "active",
        revision: 1,
        support_valid_after_seq: 0,
        created_at: at,
      });
    }
    this.state.insertSystem(goal, input.actor_id, this.actorKind(input.actor_kind), "保存原始意图", {
      operation: "intent_created",
      source_kind: input.source_kind ?? "web",
    });
  }
}
