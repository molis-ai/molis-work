import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalStatusTranslate } from "./goal-state-explanation.js";
export interface GoalsFactorsItem {
    goal: {
        goal_id: string;
    };
    relations: readonly {
        state: string;
    }[];
}
export interface GoalsFactorsContent {
    /** Trusted output from the existing owner contributions, never user HTML. */
    relationsHtml: string;
    policyHtml: string;
}
type FactorIcon = "link" | "shield";
export interface GoalsFactorsPrimitives {
    translate: GoalStatusTranslate;
    escapeHtml(value: string): string;
    icon(name: FactorIcon): string;
    renderFocusSectionDeck(cards: Array<{
        key: string;
        iconName: FactorIcon;
        title: string;
        description: string;
        body: string;
        count?: number;
        active?: boolean;
        triggerAttributes?: string;
        bodyClass?: string;
        bodyAttributes?: string;
    }>, label: string, className?: string, attributes?: string): string;
}
function createFactorsRenderer(primitives: GoalsFactorsPrimitives) {
    const { escapeHtml, icon, renderFocusSectionDeck } = primitives;
    function renderGoalFactors(item: GoalsFactorsItem, content: GoalsFactorsContent): string {
        const goalId = escapeHtml(item.goal.goal_id);
        return `<section class="goal-factors" data-goal-section="factors">
    <header class="goal-factors-heading"><span>${icon("link")}</span><div><h2>${uiText("goals.factors-ui.relationships-constraints")}</h2><p>${uiText("goals.factors-ui.review-relationships-completion-rules-that-affect-goal-edit")}</p></div></header>
    ${renderFocusSectionDeck([
            {
                key: "relations", iconName: "link", title: uiText.text("goals.factors-ui.goal-relationships"), description: uiText.text("goals.factors-ui.hierarchy-dependencies-effects-other-goals"), count: item.relations.filter((relation) => relation.state !== "inactive").length, active: true,
                triggerAttributes: `id="goal-factor-tab-relations-${goalId}" role="tab" aria-selected="true" aria-controls="goal-factor-panel-relations-${goalId}" tabindex="0" data-goal-factor-tab="relations"`,
                bodyClass: "goal-factor-panel", bodyAttributes: `id="goal-factor-panel-relations-${goalId}" role="tabpanel" aria-labelledby="goal-factor-tab-relations-${goalId}" data-goal-factor-panel="relations"`,
                body: `<header><h3>${uiText("goals.factors-ui.goal-relationships")}</h3><p>${uiText("goals.factors-ui.see-what-goal-belongs-depends-which-other-goals")}</p></header>${content.relationsHtml}`,
            },
            {
                key: "rules", iconName: "shield", title: uiText.text("goals.factors-ui.work-rules"), description: uiText.text("goals.factors-ui.rules-execution-review-completion"),
                triggerAttributes: `id="goal-factor-tab-rules-${goalId}" role="tab" aria-selected="false" aria-controls="goal-factor-panel-rules-${goalId}" tabindex="-1" data-goal-factor-tab="rules"`,
                bodyClass: "goal-factor-panel", bodyAttributes: `id="goal-factor-panel-rules-${goalId}" role="tabpanel" aria-labelledby="goal-factor-tab-rules-${goalId}" data-goal-factor-panel="rules"`,
                body: `<header><h3>${uiText("goals.factors-ui.work-rules")}</h3><p>${uiText("goals.factors-ui.project-rules-checked-closure-goal-s-completion-requirements")}</p></header>${content.policyHtml}`,
            },
        ], uiText.text("goals.factors-ui.relationships-constraints"), "goal-factor-nav", `role="tablist"`)}
  </section>`;
    }
    return renderGoalFactors;
}
export type GoalsFactorsRenderer = ReturnType<typeof createFactorsRenderer>;
export const GOALS_FACTORS_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.factors.v1";
/** The contribution's one surface; the shell mounts the whole renderer there (W5-06). */
export const GOALS_FACTORS_UI_SURFACE = "factors";
export const goalsFactorsUiContribution: UiContribution<{
    kind: typeof GOALS_FACTORS_UI_SURFACE;
    primitives: GoalsFactorsPrimitives;
    args: Parameters<GoalsFactorsRenderer>;
}> = {
    descriptor: { contribution_id: GOALS_FACTORS_UI_CONTRIBUTION_ID, kind: "embedded", label: "Goal relations and constraints",
        surfaces: [{ surface_id: GOALS_FACTORS_UI_SURFACE, target_slot_id: "workbench.main", format: "declarative-html" }], slots: [] },
    render({ model }) { return createFactorsRenderer(model.primitives)(...model.args); },
};
