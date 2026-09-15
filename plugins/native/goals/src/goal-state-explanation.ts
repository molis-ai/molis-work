import type { GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalPresentationState } from "./tree-order.js";
import { WORK_STATE_COPY, type WorkStateExplanation } from "./goal-state-copy.js";
export type GoalStatusTranslate = (text: string, values?: Record<string, string | number>) => string;
export interface ParentCompletionExplanation {
    label: string;
    meaning: string;
    tone: "progress";
}
export function createGoalStateExplainer(L: GoalStatusTranslate) {
    function explainWorkState(state: GoalPresentationState): WorkStateExplanation {
        const copy = WORK_STATE_COPY[state];
        return {
            label: L(copy.label),
            meaning: L(copy.meaning),
            nextAction: L(copy.nextAction),
            howToContinue: L(copy.howToContinue),
            actionKind: copy.actionKind,
        };
    }
    function explainParentCompletion(_goal: Pick<GoalRecord, "definition_state" | "decomposition_state" | "decomposition_review" | "fulfillment_state">, completedChildren: number, totalChildren: number): ParentCompletionExplanation {
        return {
            label: L("子 Goal 进度"),
            meaning: L("已完成 {done} / {total} 个子 Goal。每条 Goal 按自己的当前约定收尾；子 Goal 完成不会自动完成父 Goal。", {
                done: completedChildren,
                total: totalChildren,
            }),
            tone: "progress",
        };
    }
    return { explainWorkState, explainParentCompletion };
}
