import type { GoalsQueryApi } from "./contract/goals.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GovernanceDecisionApi, GoalTreeProposalItemRecord, ProposalAffectedObject } from "./contract/governance-collaboration.js";
import { GoalTreeFactMaterializer } from "./goal-tree-fact-materializer.js";
import { GoalTreeMaterializationConflicts } from "./goal-tree-materialization-conflicts.js";
import { goalTreeMaterializationGroups } from "./goal-tree-materialization-order.js";

/** Preview and confirmation consume the same materializers; preview never commits their changes. */
export class GoalTreeMaterializationApplication {
  constructor(private readonly ports: {
    goals: Pick<GoalsQueryApi, "getGoal">;
    transactions: Pick<GovernanceDecisionApi, "previewMaterialization" | "previewMaterializationItem">;
    facts: GoalTreeFactMaterializer;
    conflicts: GoalTreeMaterializationConflicts;
  }) {}

  preflight(projectId: string, items: GoalTreeProposalItemRecord[], actorId: string, at: string): Map<string, Record<string, unknown>> {
    const conflicts = new Map<string, Record<string, unknown>>();
    const groups = goalTreeMaterializationGroups(items);
    return this.ports.transactions.previewMaterialization(() => {
      for (const group of groups) {
        for (const item of group) {
          try {
            this.ports.transactions.previewMaterializationItem(() => {
              const conflict = this.ports.conflicts.read(projectId, item);
              if (conflict) {
                conflicts.set(item.item_id, { ...conflict, recovery: conflict.recovery ?? this.recovery(conflict) });
                return { keep: false, value: undefined };
              }
              this.materialize(projectId, item, actorId, "Goal Tree 提案只读预检", at);
              return { keep: true, value: undefined };
            });
          } catch (error) {
            if (!(error instanceof ActionError)) throw error;
            conflicts.set(item.item_id, { code: error.code, message: error.message, ...(error.details ?? {}),
              recovery: this.recovery({ code: error.code }) });
          }
        }
      }
      return conflicts;
    });
  }

  recovery(_conflict: Record<string, unknown>): string {
    return "请先运行 goal_tree_check 并修订这个条目，再让用户决定整份提案。当前 Goal Tree 尚未改变。";
  }

  materialize(projectId: string, item: GoalTreeProposalItemRecord, actorId: string, reason: string, at: string): ProposalAffectedObject[] {
    if (item.kind === "goal") return [this.ports.facts.materializeGoalTreeGoal(projectId, item, actorId, reason, at)];
    return this.ports.facts.materializeGoalTreeRelations(projectId, item, actorId, reason, at);
  }
}
