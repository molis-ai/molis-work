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
    const { translate: L, escapeHtml, icon, renderFocusSectionDeck } = primitives;
    function renderGoalFactors(item: GoalsFactorsItem, content: GoalsFactorsContent): string {
        const goalId = escapeHtml(item.goal.goal_id);
        return `<section class="goal-factors" data-goal-section="factors">
    <header class="goal-factors-heading"><span>${icon("link")}</span><div><h2>${L("关联与约束")}</h2><p>${L("查看会影响这条 Goal 的关系和完成规则；需要时再修改。")}</p></div></header>
    ${renderFocusSectionDeck([
            {
                key: "relations", iconName: "link", title: L("Goal 关系"), description: L("归属、依赖和对其他 Goal 的影响"), count: item.relations.filter((relation) => relation.state !== "inactive").length, active: true,
                triggerAttributes: `id="goal-factor-tab-relations-${goalId}" role="tab" aria-selected="true" aria-controls="goal-factor-panel-relations-${goalId}" tabindex="0" data-goal-factor-tab="relations"`,
                bodyClass: "goal-factor-panel", bodyAttributes: `id="goal-factor-panel-relations-${goalId}" role="tabpanel" aria-labelledby="goal-factor-tab-relations-${goalId}" data-goal-factor-panel="relations"`,
                body: `<header><h3>${L("Goal 关系")}</h3><p>${L("说明这条 Goal 属于什么、依赖什么，以及会影响哪些其他 Goal。")}</p></header>${content.relationsHtml}`,
            },
            {
                key: "rules", iconName: "shield", title: L("工作规则"), description: L("执行、检查和完成前必须遵守的规则"),
                triggerAttributes: `id="goal-factor-tab-rules-${goalId}" role="tab" aria-selected="false" aria-controls="goal-factor-panel-rules-${goalId}" tabindex="-1" data-goal-factor-tab="rules"`,
                bodyClass: "goal-factor-panel", bodyAttributes: `id="goal-factor-panel-rules-${goalId}" role="tabpanel" aria-labelledby="goal-factor-tab-rules-${goalId}" data-goal-factor-panel="rules"`,
                body: `<header><h3>${L("工作规则")}</h3><p>${L("说明执行和完成前需要哪些检查；项目默认与当前 Goal 的额外要求会合并生效。")}</p></header>${content.policyHtml}`,
            },
        ], L("关联与约束"), "goal-factor-nav", `role="tablist"`)}
  </section>`;
    }
    return renderGoalFactors;
}
export type GoalsFactorsRenderer = ReturnType<typeof createFactorsRenderer>;
export const GOALS_FACTORS_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.factors.v1";
export const goalsFactorsUiContribution: UiContribution<{
    primitives: GoalsFactorsPrimitives;
    args: Parameters<GoalsFactorsRenderer>;
}> = {
    descriptor: { contribution_id: GOALS_FACTORS_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.native.goals", kind: "embedded", label: "Goal relations and constraints",
        surfaces: [{ surface_id: "factors", target_slot_id: "workbench.main", format: "declarative-html" }], slots: [] },
    render({ model }) { return createFactorsRenderer(model.primitives)(...model.args); },
};
