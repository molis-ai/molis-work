import type { UiContribution } from "@adeptify/goalboard-contracts/platform/ui";
import type { GoalStatusTranslate } from "./goal-state-explanation.js";
export interface GoalsFactorsItem {
    goal: {
        goal_id: string;
    };
    risks: readonly {
        state: string;
    }[];
    impacts: readonly {
        state: string;
    }[];
    relations: readonly {
        state: string;
    }[];
}
export interface GoalsFactorsContent {
    /** Trusted output from the existing owner contributions, never user HTML. */
    basicsHtml: string;
    coverageHtml: string;
    relationsHtml: string;
    risksHtml: string;
    impactsHtml: string;
    policyHtml: string;
}
type FactorIcon = "clipboard" | "history" | "link" | "risk" | "impact" | "shield";
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
    const { translate: L, escapeHtml, renderFocusSectionDeck } = primitives;
    function renderGoalFactors(item: GoalsFactorsItem, content: GoalsFactorsContent): string {
        const goalId = escapeHtml(item.goal.goal_id);
        const activeRisks = item.risks.filter((risk) => risk.state === "open" || risk.state === "triggered").length;
        const activeImpacts = item.impacts.filter((impact) => impact.state !== "inactive").length;
        return `<section class="goal-factors" data-goal-section="factors">
    ${renderFocusSectionDeck([
            {
                key: "basics", iconName: "clipboard", title: L("基础信息"), description: "", active: true,
                triggerAttributes: `id="goal-factor-tab-basics-${goalId}" role="tab" aria-selected="true" aria-controls="goal-factor-panel-basics-${goalId}" tabindex="0" data-goal-factor-tab="basics"`,
                bodyClass: "goal-factor-panel", bodyAttributes: `id="goal-factor-panel-basics-${goalId}" role="tabpanel" aria-labelledby="goal-factor-tab-basics-${goalId}" data-goal-factor-panel="basics"`,
                body: content.basicsHtml,
            },
            {
                key: "coverage", iconName: "history", title: L("历史覆盖"), description: "",
                triggerAttributes: `id="goal-factor-tab-coverage-${goalId}" role="tab" aria-selected="false" aria-controls="goal-factor-panel-coverage-${goalId}" tabindex="-1" data-goal-factor-tab="coverage"`,
                bodyClass: "goal-factor-panel", bodyAttributes: `id="goal-factor-panel-coverage-${goalId}" role="tabpanel" aria-labelledby="goal-factor-tab-coverage-${goalId}" data-goal-factor-panel="coverage"`,
                body: `<header><h3>${L("历史 Contract 覆盖")}</h3><p>${L("这些是保留的历史覆盖事实；每条 Goal 仍按自己的当前约定收尾。")}</p></header>${content.coverageHtml || `<p>${L("没有保留的历史覆盖事实。")}</p>`}`,
            },
            {
                key: "relations", iconName: "link", title: L("Goal 关系"), description: "", count: item.relations.filter((relation) => relation.state !== "inactive").length || undefined,
                triggerAttributes: `id="goal-factor-tab-relations-${goalId}" role="tab" aria-selected="false" aria-controls="goal-factor-panel-relations-${goalId}" tabindex="-1" data-goal-factor-tab="relations"`,
                bodyClass: "goal-factor-panel", bodyAttributes: `id="goal-factor-panel-relations-${goalId}" role="tabpanel" aria-labelledby="goal-factor-tab-relations-${goalId}" data-goal-factor-panel="relations"`,
                body: `<header><h3>${L("Goal 关系")}</h3><p>${L("说明这条 Goal 属于什么、依赖什么，以及会影响哪些其他 Goal。")}</p></header>${content.relationsHtml}`,
            },
            {
                key: "risks", iconName: "risk", title: L("风险"), description: "", count: activeRisks || undefined,
                triggerAttributes: `id="goal-factor-tab-risks-${goalId}" role="tab" aria-selected="false" aria-controls="goal-factor-panel-risks-${goalId}" tabindex="-1" data-goal-factor-tab="risks"`,
                bodyClass: "goal-factor-panel", bodyAttributes: `id="goal-factor-panel-risks-${goalId}" role="tabpanel" aria-labelledby="goal-factor-tab-risks-${goalId}" data-goal-factor-panel="risks"`,
                body: `<header><h3>${L("风险")} <span>${activeRisks}</span></h3><p>${L("只记录确实需要观察或处理、并可能改变推进结果的情况。")}</p></header>${content.risksHtml}`,
            },
            {
                key: "impacts", iconName: "impact", title: L("影响范围"), description: "", count: activeImpacts || undefined,
                triggerAttributes: `id="goal-factor-tab-impacts-${goalId}" role="tab" aria-selected="false" aria-controls="goal-factor-panel-impacts-${goalId}" tabindex="-1" data-goal-factor-tab="impacts"`,
                bodyClass: "goal-factor-panel", bodyAttributes: `id="goal-factor-panel-impacts-${goalId}" role="tabpanel" aria-labelledby="goal-factor-tab-impacts-${goalId}" data-goal-factor-panel="impacts"`,
                body: `<header><h3>${L("影响范围")} <span>${activeImpacts}</span></h3><p>${L("帮助多人或多个 Goal 判断哪些工作能并行，哪些会互相影响。")}</p></header>${content.impactsHtml}`,
            },
            {
                key: "rules", iconName: "shield", title: L("工作规则"), description: "",
                triggerAttributes: `id="goal-factor-tab-rules-${goalId}" role="tab" aria-selected="false" aria-controls="goal-factor-panel-rules-${goalId}" tabindex="-1" data-goal-factor-tab="rules"`,
                bodyClass: "goal-factor-panel", bodyAttributes: `id="goal-factor-panel-rules-${goalId}" role="tabpanel" aria-labelledby="goal-factor-tab-rules-${goalId}" data-goal-factor-panel="rules"`,
                body: content.policyHtml,
            },
        ], L("目标与要求"), "goal-factor-nav", `role="tablist"`)}
  </section>`;
    }
    return renderGoalFactors;
}
export type GoalsFactorsRenderer = ReturnType<typeof createFactorsRenderer>;
export const GOALS_FACTORS_UI_CONTRIBUTION_ID = "io.goalboard.native.goals.factors.v1";
export const goalsFactorsUiContribution: UiContribution<{
    primitives: GoalsFactorsPrimitives;
    args: Parameters<GoalsFactorsRenderer>;
}> = {
    descriptor: { contribution_id: GOALS_FACTORS_UI_CONTRIBUTION_ID, plugin_id: "io.goalboard.native.goals", kind: "embedded", label: "Goal relations and constraints",
        surfaces: [{ surface_id: "factors", target_slot_id: "workbench.main", format: "declarative-html" }], slots: [] },
    render({ model }) { return createFactorsRenderer(model.primitives)(...model.args); },
};
