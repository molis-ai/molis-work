import type { GoalsQueryApi, GoalsPlanningApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalTreeProposalItemRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { GoalTreeInputReader } from "./goal-tree-inputs.js";

/** Proposal reference checks combine owner queries; they do not write or simulate changes. */
export class GoalTreeMaterializationConflicts {
  constructor(private readonly goals: {
    query: Pick<GoalsQueryApi, "hasGoalIdentity" | "getGoal" | "listRelations">;
    planning: Pick<GoalsPlanningApi, "wouldCreatePartOfCycle">;
  }, _governance: unknown,
    private readonly inputs: GoalTreeInputReader) {}

  read(
    boardId: string,
    item: GoalTreeProposalItemRecord,
  ): Record<string, unknown> | null {
    if (item.kind !== "goal" && item.kind !== "relation") {
      return { code: "goal_tree_proposal.kind_retired", message: "历史结构条目不能从新 check/decide 落地", kind: item.kind };
    }
    const onBoard = (goalId: string) => this.goals.query.getGoal(boardId, goalId);
    if (item.kind === "goal") {
      const payload = this.inputs.goalTreePayloadRecord(item.payload, "Goal 条目");
      const goalId = String(payload.goal_id ?? "").trim();
      if (!goalId) return { code: "goal_tree_proposal.goal_id_required", message: "创建 Goal 需要稳定 goal_id" };
      const existing = onBoard(goalId);
      if (existing) return { code: "goal_tree_proposal.goal_exists", message: `Goal 已存在: ${goalId}`, objects: [{ object_type: "goal", object_id: goalId }] };
      if (this.goals.query.hasGoalIdentity(goalId)) {
        return { code: "goal_tree_proposal.cross_board", message: `不能引用其他项目的 Goal: ${goalId}`, objects: [{ object_type: "goal", object_id: goalId }] };
      }
      return null;
    }
    const payload = this.inputs.goalTreePayloadRecord(item.payload, "关系条目");
    const relations = Array.isArray(payload.relations) ? payload.relations : [payload];
    for (const raw of relations) {
      const relation = this.inputs.goalTreePayloadRecord(raw, "关系");
      const fromId = String(relation.from_goal_id ?? "").trim();
      const toId = String(relation.to_goal_id ?? "").trim();
      for (const goalId of [fromId, toId].filter(Boolean)) {
        const existing = onBoard(goalId);
        if (existing?.trashed_at) {
          return { code: "goal_tree_proposal.goal_trashed", message: `不能关联回收站 Goal: ${goalId}`, objects: [{ object_type: "goal", object_id: goalId }] };
        }
        if (existing?.archived_at) {
          return { code: "goal_tree_proposal.goal_archived", message: `不能关联已归档 Goal: ${goalId}`, objects: [{ object_type: "goal", object_id: goalId }] };
        }
        if (!existing && this.goals.query.hasGoalIdentity(goalId)) {
          return { code: "goal_tree_proposal.cross_board", message: `不能引用其他项目的 Goal: ${goalId}`, objects: [{ object_type: "goal", object_id: goalId }] };
        }
      }
      const type = String(relation.type ?? "").trim();
      if (item.operation !== "deactivate" && type === "part_of" && fromId && toId && this.goals.planning.wouldCreatePartOfCycle(boardId, fromId, toId)) {
        return { code: "goal_tree_proposal.part_of_cycle", message: "父子关系会形成循环", goal_ids: [fromId, toId] };
      }
    }
    return null;
  }
}
