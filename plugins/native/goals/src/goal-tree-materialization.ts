import type { GoalsQueryApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GovernanceDecisionApi, GoalTreeProposalItemRecord, ProposalAffectedObject } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { MolisWorkV1Error } from "./errors.js";
import { GoalTreeFactMaterializer } from "./goal-tree-fact-materializer.js";
import { GoalTreeMaterializationConflicts } from "./goal-tree-materialization-conflicts.js";
import { goalTreeMaterializationGroups } from "./goal-tree-materialization-order.js";

interface MaterializationError extends Error { code: string; details?: Record<string, unknown> }

/** Preview and confirmation consume the same materializers; preview never commits their changes. */
export class GoalTreeMaterializationApplication {
  constructor(private readonly ports: {
    goals: Pick<GoalsQueryApi, "getGoal">;
    transactions: Pick<GovernanceDecisionApi, "previewMaterialization" | "previewMaterializationItem">;
    facts: GoalTreeFactMaterializer;
    conflicts: GoalTreeMaterializationConflicts;
    isDomainError: (error: unknown) => error is MaterializationError;
  }) {}

  preflight(boardId: string, items: GoalTreeProposalItemRecord[], actorId: string, at: string): Map<string, Record<string, unknown>> {
    const conflicts = new Map<string, Record<string, unknown>>();
    const groups = goalTreeMaterializationGroups(boardId, items);
    return this.ports.transactions.previewMaterialization(() => {
      for (const group of groups) {
        for (const item of group) {
          try {
            this.ports.transactions.previewMaterializationItem(() => {
              const conflict = this.ports.conflicts.read(boardId, item);
              if (conflict) {
                conflicts.set(item.item_id, { ...conflict, recovery: conflict.recovery ?? this.recovery(conflict) });
                return { keep: false, value: undefined };
              }
              this.materialize(boardId, item, actorId, "Goal Tree 提案只读预检", at);
              return { keep: true, value: undefined };
            });
          } catch (error) {
            if (!this.ports.isDomainError(error)) throw error;
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

  materialize(boardId: string, item: GoalTreeProposalItemRecord, actorId: string, reason: string, at: string): ProposalAffectedObject[] {
    if (item.kind === "goal") return [this.ports.facts.materializeGoalTreeGoal(boardId, item, actorId, reason, at)];
    if (item.kind === "relation") return this.ports.facts.materializeGoalTreeRelations(boardId, item, actorId, reason, at);
    throw new MolisWorkV1Error("goal_tree_proposal.kind_retired", "历史结构条目不能从新 check/decide 落地", { kind: item.kind });
  }
}
