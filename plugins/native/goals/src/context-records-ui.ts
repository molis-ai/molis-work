import { t as uiText, renderStateRing } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalsContextItem, GoalsContextUiPrimitives } from "./context-ui-model.js";
import { displayedPassedCriterionIds } from "./tree-presentation.js";

export function createGoalContextRecordsRenderer(primitives: GoalsContextUiPrimitives) {
  const { escapeHtml } = primitives;
  function renderAcceptanceSummary(item: GoalsContextItem): string {
    if (!item.goal.acceptance_criteria.length) {
      return `<p class="empty-row empty-row--warning">${uiText("goals.context-records-ui.definition-done-missing-add-criteria-that-can-be")}</p>`;
    }
    const passedCriteria = new Set(displayedPassedCriterionIds(item));
    return `<ul class="check-list check-list--human">${item.goal.acceptance_criteria.map((criterion) => {
      const passed = passedCriteria.has(criterion.criterion_id);
      return `<li><span>${renderStateRing({ state: passed ? "done" : "idle" })}</span><span><strong>${escapeHtml(criterion.statement)}</strong><small>${uiText("goals.context-records-ui.passes-when")}${escapeHtml(criterion.pass_condition)}</small></span></li>`;
    }).join("")}</ul>`;
  }
  return { renderAcceptanceSummary };
}
