import { renderStateRing } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalsContextItem, GoalsContextUiPrimitives } from "./context-ui-model.js";
import { displayedPassedCriterionIds } from "./tree-presentation.js";

export function createGoalContextRecordsRenderer(primitives: GoalsContextUiPrimitives) {
  const { translate: L, escapeHtml } = primitives;
  function renderAcceptanceSummary(item: GoalsContextItem): string {
    if (!item.goal.acceptance_criteria.length) {
      return `<p class="empty-row empty-row--warning">${L("还没有写清怎样才算完成。先补上可判断的完成标准，才能开始工作。")}</p>`;
    }
    const passedCriteria = new Set(displayedPassedCriterionIds(item));
    return `<ul class="check-list check-list--human">${item.goal.acceptance_criteria.map((criterion) => {
      const passed = passedCriteria.has(criterion.criterion_id);
      return `<li><span>${renderStateRing({ state: passed ? "done" : "idle" })}</span><span><strong>${escapeHtml(criterion.statement)}</strong><small>${L("达到下面的结果就算通过：")}${escapeHtml(criterion.pass_condition)}</small></span></li>`;
    }).join("")}</ul>`;
  }
  return { renderAcceptanceSummary };
}
