import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalRecord } from "./contract/goals.js";
import type { GoalPresentationState } from "./tree-order.js";
import { WORK_STATE_COPY, type WorkStateExplanation } from "./goal-state-copy.js";
export type GoalStatusTranslate = (text: string, values?: Record<string, string | number>) => string;
export interface ParentCompletionExplanation {
    label: string;
    meaning: string;
    tone: "progress";
}
export function createGoalStateExplainer(_readText: GoalStatusTranslate) {
    function explainWorkState(state: GoalPresentationState): WorkStateExplanation {
        const copy = WORK_STATE_COPY[state];
        return {
            label: uiText.text(copy.label),
            meaning: uiText.text(copy.meaning),
            nextAction: uiText.text(copy.nextAction),
            howToContinue: uiText.text(copy.howToContinue),
            actionKind: copy.actionKind,
        };
    }
    function explainParentCompletion(_goal: Pick<GoalRecord, "definition_state" | "decomposition_state" | "decomposition_review" | "fulfillment_state">, completedChildren: number, totalChildren: number): ParentCompletionExplanation {
        return {
            label: uiText.text("goals.goal-state-explanation.child-goal-progress"),
            meaning: uiText.text("goals.goal-state-explanation.done-total-child-goals-complete-each-goal-closes", {
                done: completedChildren,
                total: totalChildren,
            }),
            tone: "progress",
        };
    }
    return { explainWorkState, explainParentCompletion };
}
