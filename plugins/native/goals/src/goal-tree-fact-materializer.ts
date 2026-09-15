import type { GoalsCommandApi, GoalsQueryApi, CreateGoalIntentInput, CreateGoalIntentResult } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalTreeProposalItemRecord, ProposalAffectedObject } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { GoalTreeInputReader } from "./goal-tree-inputs.js";

/** Convert confirmed proposal payloads; Goals retains rules, events and persistence. */
export class GoalTreeFactMaterializer {
  constructor(
    private readonly goals: { commands: Pick<GoalsCommandApi, "applyConfirmedRelations">; query: Pick<GoalsQueryApi, "getGoal"> },
    private readonly inputs: GoalTreeInputReader,
    private readonly errorFactory: (code: string, message: string, details?: Record<string, unknown>) => Error,
    private readonly createIntent: (input: CreateGoalIntentInput) => CreateGoalIntentResult,
  ) {}

  materializeGoalTreeRelations(
    boardId: string,
    item: GoalTreeProposalItemRecord,
    actorId: string,
    reasonText: string,
    at: string,
  ): ProposalAffectedObject[] {
    return this.goals.commands.applyConfirmedRelations({
      board_id: boardId, actor_id: actorId, reason: reasonText, at, source_item_id: item.item_id,
      relations: this.inputs.goalTreeRelationEntries(item).map(raw => this.inputs.normalizeGoalTreeRelation(item, raw)),
    }).map(relation => ({ object_type: "relation", object_id: relation.relation_id }));
  }

  materializeGoalTreeGoal(
    boardId: string,
    item: GoalTreeProposalItemRecord,
    actorId: string,
    _reasonText: string,
    _at: string,
  ): ProposalAffectedObject {
    if (item.kind !== "goal" || item.operation !== "create") {
      throw this.errorFactory("goal_tree_proposal.kind_retired", "结构提案只能落地新 Goal 或关系");
    }
    const goal = this.inputs.goalTreeGoalInput(item);
    const goalId = this.inputs.goalTreeTargetGoalId(item, goal);
    const payload = this.inputs.goalTreePayloadRecord(item.payload, "Goal 条目");
    const requirements = Array.isArray(payload.requirements)
      ? payload.requirements.map((requirement) => {
          const value = this.inputs.goalTreePayloadRecord(requirement, "Goal 要求");
          return {
            requirement_id: value.requirement_id == null ? undefined : String(value.requirement_id),
            statement: String(value.statement ?? ""),
            human_decision_required: value.human_decision_required === true,
          };
        })
      : undefined;
    this.createIntent({
      board_id: boardId,
      goal_id: goalId,
      title: String(payload.title ?? goal.title),
      outcome: payload.outcome == null ? undefined : String(payload.outcome),
      why: payload.why == null ? undefined : String(payload.why),
      business_logic: payload.business_logic == null ? undefined : String(payload.business_logic),
      priority: typeof payload.priority === "number" ? payload.priority : undefined,
      requirements,
      actor_id: actorId,
      idempotency_key: `tree-goal:${item.item_id}`,
      source_kind: "tree",
    });
    return { object_type: "goal", object_id: goalId };
  }
}
