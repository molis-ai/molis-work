import type { GoalsContextItem, GoalsContextView, GoalsContextUiPrimitives } from "./context-ui-model.js";
import { findGoalTreeItem as findGoalView, goalWorkSatisfied, partOfChildViews } from "./tree-presentation.js";
import { sortGoalTreeItems as sortGoals } from "./tree-order.js";

export function createGoalContextCoverageRenderer(primitives: GoalsContextUiPrimitives) {
  const { translate: L, escapeHtml, icon, explainWorkState, explainParentCompletion } = primitives;
function renderChildProgress(item: GoalsContextItem, view: GoalsContextView): string {
  const children = sortGoals(partOfChildViews(item.goal.goal_id, view));
  if (!children.length) return "";
  const done = children.filter(goalWorkSatisfied).length;
  const completion = explainParentCompletion(item.goal, done, children.length);
  return `<div class="child-progress child-progress--${completion.tone}"><header><div><h3>${L("子 Goal 进度")}</h3><p class="child-progress-rule"><strong>${escapeHtml(completion.label)}</strong><span>${escapeHtml(completion.meaning)}</span></p></div><strong>${done}/${children.length}</strong></header><ul>${children.map((child) => {
    const explanation = explainWorkState(child.status);
    return `<li><a href="/goals/${encodeURIComponent(child.goal.goal_id)}"><span><strong>${escapeHtml(child.goal.title)}</strong><small>${escapeHtml(explanation.nextAction)}</small></span><em>${escapeHtml(explanation.label)}</em>${icon("chevron-right")}</a></li>`;
  }).join("")}</ul></div>`;
}

function renderContractCoverage(item: GoalsContextItem, view: GoalsContextView): string {
  const goal = item.goal;
  const satisfaction = goalWorkSatisfied(item)
    ? `<p class="contract-scope-status">${icon("completed")}<strong>${L("本 Goal 已按自己的当前约定收尾")}</strong><span>${L("这只表示当前 Goal 自己的约定已满足，不自动等于父 Goal 已经完成。")}</span></p>`
    : "";
  const ownCoverage = goal.decomposition_state !== "closed_compound"
    ? ""
    : goal.decomposition_review?.contract_coverage == null
      ? `<p class="empty-row">${L("未记录父子 Contract 覆盖（历史数据）；现有完成状态不会因此被自动改写。")}</p>`
      : `<div class="contract-coverage-group"><h4>${L("历史父子 Contract 覆盖")}</h4>${[
          ...goal.decomposition_review.contract_coverage.promised_outputs.map((entry) =>
            `<article><strong>${escapeHtml(entry.parent_promised_output)}</strong><small>${escapeHtml(L(entry.status === "complete" ? "完整覆盖" : entry.status === "partial" ? "部分覆盖" : entry.status === "integration_required" ? "仍需父级集成" : "尚未覆盖"))}</small><p>${escapeHtml(entry.reason)}</p><ul>${entry.child_outputs.map((reference) => `<li><button type="button" data-select-goal="${escapeHtml(reference.goal_id)}">${escapeHtml(reference.promised_output)}</button></li>`).join("")}</ul></article>`,
          ),
          ...goal.decomposition_review.contract_coverage.acceptance_criteria.map((entry) =>
            `<article><strong>${escapeHtml(entry.parent_criterion_id)}</strong><small>${escapeHtml(L(entry.status === "complete" ? "完整覆盖" : entry.status === "partial" ? "部分覆盖" : entry.status === "integration_required" ? "仍需父级集成" : "尚未覆盖"))}</small><p>${escapeHtml(entry.reason)}</p><ul>${entry.child_criteria.map((reference) => `<li><button type="button" data-select-goal="${escapeHtml(reference.goal_id)}">${escapeHtml(reference.criterion_id)}</button></li>`).join("")}</ul></article>`,
          ),
        ].join("")}</div>`;
  const parents = view.snapshot.relations
    .filter((relation) => relation.state === "active" && relation.type === "part_of" && relation.from_goal_id === goal.goal_id)
    .map((relation) => findGoalView(view, relation.to_goal_id))
    .filter((parent): parent is GoalsContextItem => parent != null);
  const parentContributions = parents.length === 0
    ? ""
    : `<div class="contract-coverage-group"><h4>${L("历史对父 Goal 的贡献")}</h4>${parents.map((parent) => {
        const coverage = parent.goal.decomposition_review?.contract_coverage;
        if (!coverage) {
          return `<article><strong>${escapeHtml(parent.goal.title)}</strong><p>${L("这条历史父 Goal 未记录父子 Contract 覆盖；当前子 Goal 的完成不会被解释成父级完整能力。")}</p></article>`;
        }
        const outputs = coverage.promised_outputs.filter((entry) =>
          entry.child_outputs.some((reference) => reference.goal_id === goal.goal_id),
        );
        const criteria = coverage.acceptance_criteria.filter((entry) =>
          entry.child_criteria.some((reference) => reference.goal_id === goal.goal_id),
        );
        return `<article><strong><button type="button" data-select-goal="${escapeHtml(parent.goal.goal_id)}">${escapeHtml(parent.goal.title)}</button></strong><ul>${[
          ...outputs.map((entry) => `<li>${escapeHtml(entry.parent_promised_output)} · ${escapeHtml(L(entry.status === "complete" ? "完整覆盖" : "尚有缺口"))}</li>`),
          ...criteria.map((entry) => `<li>${escapeHtml(entry.parent_criterion_id)} · ${escapeHtml(L(entry.status === "complete" ? "完整覆盖" : "尚有缺口"))}</li>`),
        ].join("")}</ul></article>`;
      }).join("")}</div>`;
  if (!satisfaction && !ownCoverage && !parentContributions) return "";
  return `<div class="contract-coverage-summary">${satisfaction}${ownCoverage}${parentContributions}</div>`;
}


  return { renderChildProgress, renderContractCoverage };
}
