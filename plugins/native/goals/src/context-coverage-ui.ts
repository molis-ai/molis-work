import { t as uiText, renderStateRing } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalsContextItem, GoalsContextView, GoalsContextUiPrimitives } from "./context-ui-model.js";
import { findGoalTreeItem as findGoalView, goalWorkSatisfied, partOfChildViews } from "./tree-presentation.js";
import { sortGoalTreeItems as sortGoals } from "./tree-order.js";

export function createGoalContextCoverageRenderer(primitives: GoalsContextUiPrimitives) {
  const { escapeHtml, icon, subsectionHeading, explainWorkState, explainParentCompletion } = primitives;
function renderChildProgress(item: GoalsContextItem, view: GoalsContextView): string {
  const children = sortGoals(partOfChildViews(item.goal.goal_id, view));
  if (!children.length) return "";
  const done = children.filter(goalWorkSatisfied).length;
  const completion = explainParentCompletion(item.goal, done, children.length);
  return `<div class="child-progress child-progress--${completion.tone}"><header><div><h3>${uiText("goals.context-coverage-ui.child-goal-progress")}</h3><p class="child-progress-rule"><strong>${escapeHtml(completion.label)}</strong><span>${escapeHtml(completion.meaning)}</span></p></div><strong>${done}/${children.length}</strong></header><ul>${children.map((child) => {
    const explanation = explainWorkState(child.status);
    return `<li><a href="/goals/${encodeURIComponent(child.goal.goal_id)}"><span><strong>${escapeHtml(child.goal.title)}</strong><small>${escapeHtml(explanation.nextAction)}</small></span><em>${escapeHtml(explanation.label)}</em>${icon("chevron-right")}</a></li>`;
  }).join("")}</ul></div>`;
}

function renderContractCoverage(item: GoalsContextItem, view: GoalsContextView): string {
  const goal = item.goal;
  const satisfaction = goalWorkSatisfied(item)
    ? `<p class="contract-scope-status">${renderStateRing({ state: "done" })}<strong>${uiText("goals.context-coverage-ui.goal-has-closed-against-its-own-current-agreement")}</strong><span>${uiText("goals.context-coverage-ui.only-means-current-goal-s-own-agreement-satisfied")}</span></p>`
    : "";
  const ownCoverage = goal.decomposition_state !== "closed_compound"
    ? ""
    : goal.decomposition_review?.contract_coverage == null
      ? `<p class="empty-row">${uiText("goals.context-coverage-ui.no-parent-child-contract-coverage-was-recorded-historical")}</p>`
      : `<div class="contract-coverage-group"><h4>${uiText("goals.context-coverage-ui.historical-parent-child-contract-coverage")}</h4>${[
          ...goal.decomposition_review.contract_coverage.promised_outputs.map((entry) =>
            `<article><strong>${escapeHtml(entry.parent_promised_output)}</strong><small>${escapeHtml(uiText.text(entry.status === "complete" ? "goals.context-coverage-ui.fully-covered" : entry.status === "partial" ? "goals.context-coverage-ui.partially-covered" : entry.status === "integration_required" ? "goals.context-coverage-ui.parent-integration-required" : "goals.context-coverage-ui.uncovered"))}</small><p>${escapeHtml(entry.reason)}</p><ul>${entry.child_outputs.map((reference) => `<li><button type="button" data-select-goal="${escapeHtml(reference.goal_id)}">${escapeHtml(reference.promised_output)}</button></li>`).join("")}</ul></article>`,
          ),
          ...goal.decomposition_review.contract_coverage.acceptance_criteria.map((entry) =>
            `<article><strong>${escapeHtml(entry.parent_criterion_id)}</strong><small>${escapeHtml(uiText.text(entry.status === "complete" ? "goals.context-coverage-ui.fully-covered" : entry.status === "partial" ? "goals.context-coverage-ui.partially-covered" : entry.status === "integration_required" ? "goals.context-coverage-ui.parent-integration-required" : "goals.context-coverage-ui.uncovered"))}</small><p>${escapeHtml(entry.reason)}</p><ul>${entry.child_criteria.map((reference) => `<li><button type="button" data-select-goal="${escapeHtml(reference.goal_id)}">${escapeHtml(reference.criterion_id)}</button></li>`).join("")}</ul></article>`,
          ),
        ].join("")}</div>`;
  const parents = view.snapshot.relations
    .filter((relation) => relation.state === "active" && relation.type === "part_of" && relation.from_goal_id === goal.goal_id)
    .map((relation) => findGoalView(view, relation.to_goal_id))
    .filter((parent): parent is GoalsContextItem => parent != null);
  const parentContributions = parents.length === 0
    ? ""
    : `<div class="contract-coverage-group"><h4>${uiText("goals.context-coverage-ui.historical-contribution-parent-goal")}</h4>${parents.map((parent) => {
        const coverage = parent.goal.decomposition_review?.contract_coverage;
        if (!coverage) {
          return `<article><strong>${escapeHtml(parent.goal.title)}</strong><p>${uiText("goals.context-coverage-ui.historical-parent-goal-has-no-recorded-contract-coverage")}</p></article>`;
        }
        const outputs = coverage.promised_outputs.filter((entry) =>
          entry.child_outputs.some((reference) => reference.goal_id === goal.goal_id),
        );
        const criteria = coverage.acceptance_criteria.filter((entry) =>
          entry.child_criteria.some((reference) => reference.goal_id === goal.goal_id),
        );
        return `<article><strong><button type="button" data-select-goal="${escapeHtml(parent.goal.goal_id)}">${escapeHtml(parent.goal.title)}</button></strong><ul>${[
          ...outputs.map((entry) => `<li>${escapeHtml(entry.parent_promised_output)} · ${escapeHtml(uiText.text(entry.status === "complete" ? "goals.context-coverage-ui.fully-covered" : "goals.context-coverage-ui.gaps-remain"))}</li>`),
          ...criteria.map((entry) => `<li>${escapeHtml(entry.parent_criterion_id)} · ${escapeHtml(uiText.text(entry.status === "complete" ? "goals.context-coverage-ui.fully-covered" : "goals.context-coverage-ui.gaps-remain"))}</li>`),
        ].join("")}</ul></article>`;
      }).join("")}</div>`;
  if (!satisfaction && !ownCoverage && !parentContributions) return "";
  return `<div class="document-subsection contract-coverage-summary">${subsectionHeading("link", "历史 Contract 覆盖", "这些是保留的历史覆盖事实；每条 Goal 仍按自己的当前约定收尾。")}${satisfaction}${ownCoverage}${parentContributions}</div>`;
}


  return { renderChildProgress, renderContractCoverage };
}
