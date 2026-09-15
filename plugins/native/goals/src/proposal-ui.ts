import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalTreeProposalRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { goalTreeProposalItemValidationIssues } from "./proposal-item-validation.js";
import { GOALS_RELATION_LABELS as RELATION_LABELS } from "./relation-presentation.js";
import { createGoalsDecisionPresentation } from "./decision-common-ui.js";
import { createGoalsProposalPresentation } from "./proposal-presentation.js";
import { createGoalsProposalIssueCopy } from "./proposal-issue-copy.js";
import { findGoalView, type GoalsProposalView, type GoalsProposalUiPrimitives } from "./proposal-ui-model.js";

export const GOALS_PROPOSAL_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.proposal";
function createProposalRenderer(primitives: GoalsProposalUiPrimitives) {
const { translate: L, escapeHtml, icon, renderList } = primitives;
const { renderNewDecisionBadge, renderDecisionGuidance, renderDecisionScenario, proposedGoalNextStage } = createGoalsDecisionPresentation(primitives);
const { proposedGoalName, goalTreeGoalPayload, goalTreeRelationPayloads, goalTreeProposalItemCopy } = createGoalsProposalPresentation(L);
const { goalTreeProposalIssueCopy } = createGoalsProposalIssueCopy(L);
function goalTreeRelationScenario(
  item: GoalTreeProposalRecord["items"][number],
  view: GoalsProposalView,
  proposal: GoalTreeProposalRecord,
  subjectGoalId?: string,
): string | null {
  const relation = goalTreeRelationPayloads(item.payload)[0];
  if (!relation) return null;
  const fromGoalId = String(relation.from_goal_id ?? "");
  const from = proposedGoalName(relation.from_goal_id, view, proposal);
  const to = proposedGoalName(relation.to_goal_id, view, proposal);
  const type = String(relation.type ?? (item.kind === "dependency" ? "depends_on" : ""));
  if (type === "part_of") {
    if (subjectGoalId && fromGoalId === subjectGoalId) {
      return L("它会成为「{parent}」的子 Goal。", { parent: to });
    }
    return L("Goal「{child}」会成为「{parent}」的子 Goal。", { child: from, parent: to });
  }
  if (type === "depends_on") {
    if (subjectGoalId && fromGoalId === subjectGoalId) {
      return L("它会等待「{dependency}」先完成。", { dependency: to });
    }
    return L("Goal「{goal}」会等待「{dependency}」先完成。", { goal: from, dependency: to });
  }
  const relationLabel = L(RELATION_LABELS[type]?.out ?? "建立关系");
  return L("Goal「{from}」和「{to}」会建立“{relation}”关系。", { from, to, relation: relationLabel });
}

function renderGoalTreeProposalScenario(
  proposal: GoalTreeProposalRecord,
  view: GoalsProposalView,
  items: GoalTreeProposalRecord["items"],
): string {
  const goalItem = items.find((item) =>
    (item.kind === "goal" || item.kind === "contract") && item.operation === "create",
  ) ?? items.find((item) => item.kind === "goal" || item.kind === "contract" || item.kind === "candidate");
  const relationItem = items.find((item) =>
    item.kind === "relation" || item.kind === "dependency" ||
    (item.kind === "candidate" && goalTreeRelationPayloads(item.payload).length > 0),
  );
  const goal = goalItem ? goalTreeGoalPayload(goalItem.payload) : null;
  const goalTitle = goal
    ? String(goal.title ?? proposedGoalName(goal.goal_id, view, proposal))
    : proposedGoalName(relationItem ? goalTreeRelationPayloads(relationItem.payload)[0]?.from_goal_id : proposal.root_goal_id, view, proposal);
  const goalId = goal ? String(goal.goal_id ?? "") : "";
  const goalEffect = goalItem?.kind === "candidate" && goalItem.operation === "update"
    ? L("会把已有 Candidate 晋升为 Goal「{title}」，并关闭原 Candidate 的待决定状态。", { title: goalTitle })
    : goalItem?.operation === "create"
    ? L("会新增 Goal「{title}」。", { title: goalTitle })
    : goalItem?.operation === "deactivate"
      ? L("会停止使用 Goal「{title}」。", { title: goalTitle })
      : goalItem
        ? L("会更新 Goal「{title}」的目标说明或状态。", { title: goalTitle })
        : L("会按方案更新 Goal「{title}」的关系。", { title: goalTitle });
  const relationEffect = relationItem
    ? goalTreeRelationScenario(relationItem, view, proposal, goalId)
    : L("本次不会自动改变 Goal「{title}」与其他 Goal 的归属或依赖。", { title: goalTitle });
  const nextStage = goal ? proposedGoalNextStage(goal) : L("现有 Goal 是否能开始，仍由各自的状态和前置条件决定。");
  return renderDecisionScenario({
    confirmLabel: L("如果采用"),
    confirmEffect: `${goalEffect}${relationEffect}${nextStage}`,
    rejectLabel: L("如果退回"),
    rejectEffect: L("不会写入上面这些 Goal 和关系变化；当前 Goal Tree 保持不变。"),
  });
}

function renderGoalTreeProposalDecision(proposal: GoalTreeProposalRecord, view: GoalsProposalView): string {
  const undecidedItems = proposal.items.filter((item) => item.state === "pending" || item.state === "conflict");
  const riskIssuesByItem = new Map(
    undecidedItems
      .map((item) => [item.item_id, goalTreeProposalItemValidationIssues(item)] as const)
      .filter(([, issues]) => issues.length),
  );
  const issuesByItem = new Map<string, Array<{ message: string; recovery: string }>>();
  for (const item of undecidedItems) {
    const persistedConflict = item.state === "conflict"
      ? [{
          message: String(item.conflict?.message ?? L("这份方案仍有不能安全写入的内容，需要修正后再确认。")),
          recovery: String(item.conflict?.recovery ?? L("当前 Goal Tree 不会改变；Runtime 会根据你的意见重新整理方案。")),
        }]
      : [];
    const issues = [
      ...persistedConflict,
      ...(riskIssuesByItem.get(item.item_id) ?? []).map(goalTreeProposalIssueCopy),
    ];
    if (issues.length) issuesByItem.set(item.item_id, issues);
  }
  const repairableRiskItemIds = new Set<string>();
  const repairableRiskItemCount = 0;
  const riskInvalidItemCount = riskIssuesByItem.size;
  const decompositionInvalidItemCount = 0;
  const leafInvalidItemCount = 0;
  const compoundInvalidItemCount = 0;
  const leafOnly = leafInvalidItemCount > 0 && compoundInvalidItemCount === 0 && riskInvalidItemCount === 0;
  const invalidItemCount = issuesByItem.size;
  const runtimeInvalidItemCount = [...issuesByItem.keys()].filter((itemId) => !repairableRiskItemIds.has(itemId)).length;
  const actionableItems = undecidedItems.filter((item) => item.state === "pending" && !issuesByItem.has(item.item_id));
  const conflictCount = undecidedItems.filter((item) => item.state === "conflict").length;
  const problemItems = undecidedItems.filter((item) => item.state === "conflict" || issuesByItem.has(item.item_id));
  const otherItems = undecidedItems.filter((item) => !problemItems.includes(item));
  const problemCount = problemItems.length;
  const contractItem = proposal.items.find((item) =>
    (item.kind === "contract" || item.kind === "goal") &&
    String(goalTreeGoalPayload(item.payload).goal_id ?? "") === String(proposal.root_goal_id ?? ""),
  ) ?? proposal.items.find((item) => item.kind === "contract")
    ?? proposal.items.find((item) => item.kind === "goal");
  const contractPayload = contractItem ? goalTreeGoalPayload(contractItem.payload) : null;
  const proposedTitle = String(contractPayload?.title ?? findGoalView(view, proposal.root_goal_id)?.goal.title ?? L("这份 Goal 方案"));
  const proposedOutcome = String(contractPayload?.outcome ?? proposal.summary).trim();
  const acceptance = Array.isArray(contractPayload?.acceptance_criteria)
    ? contractPayload.acceptance_criteria as Array<Record<string, unknown>>
    : [];
  const inScope = Array.isArray(contractPayload?.in_scope) ? contractPayload.in_scope.map(String) : [];
  const outOfScope = Array.isArray(contractPayload?.out_of_scope) ? contractPayload.out_of_scope.map(String) : [];
  const semanticItemCopies = new Map(
    proposal.items.map((item) => [item.item_id, goalTreeProposalItemCopy(item, view, proposal)]),
  );
  const prefilledRejectReason = [...new Set(problemItems.flatMap((item) => {
    const title = semanticItemCopies.get(item.item_id)?.title ?? "";
    const issues = issuesByItem.get(item.item_id) ?? (item.state === "conflict"
      ? [{
          message: String(item.conflict?.message ?? L("这份方案仍有不能安全写入的内容，需要修正后再确认。")),
          recovery: "",
        }]
      : []);
    return issues
      .map((issue) => issue.message.trim())
      .filter(Boolean)
      .map((message) => title ? `${title}：${message}` : message);
  }))].join("\n");
  const narrative = proposal.narrative;
  const narrativeSummary = narrative
    ? `<section class="goal-tree-proposal-narrative" aria-label="${L("变更说明")}">
        <h4>${L("这次变更主要解决什么？")}</h4>
        <dl>
          <div><dt>${L("为什么现在改")}</dt><dd>${escapeHtml(narrative.why_now)}</dd></div>
          <div><dt>${L("原目标哪里不再成立")}</dt><dd>${escapeHtml(narrative.problem)}</dd></div>
          <div><dt>${L("变更后的主链路")}</dt><dd><ol>${narrative.main_path.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></dd></div>
          <div><dt>${L("预期效果")}</dt><dd>${escapeHtml(narrative.expected_effect)}</dd></div>
          <div><dt>${L("本次不改变")}</dt><dd>${narrative.non_goals.length ? `<ul>${narrative.non_goals.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : L("没有额外非目标")}</dd></div>
        </dl>
      </section>`
    : proposal.items.length >= 5
      ? `<section class="goal-tree-proposal-narrative is-missing" role="note"><h4>${L("这份历史方案缺少整体验证说明")}</h4><p>${L("它创建于语义摘要成为大型提案必填项之前。请先让 Runtime 补充原问题、变更后的主链路、预期效果和非目标，再决定是否采用。")}</p></section>`
      : "";
  const renderItemRow = (item: GoalTreeProposalRecord["items"][number]): string => {
    const copy = goalTreeProposalItemCopy(item, view, proposal);
    const explanation = item.explanation;
    const dependencyLabels = (explanation?.depends_on_item_ids ?? []).map((itemId) =>
      semanticItemCopies.get(itemId)?.title ?? itemId);
    const semanticExplanation = `<dl class="goal-tree-proposal-item-explanation">
      <div><dt>${L("主要解决")}</dt><dd>${escapeHtml(explanation?.problem ?? item.reason)}</dd></div>
      ${explanation ? `<div><dt>${L("会改变什么")}</dt><dd>${escapeHtml(explanation.expected_effect)}</dd></div>
      <div><dt>${L("明确不改变")}</dt><dd>${explanation.non_goals.length ? escapeHtml(explanation.non_goals.join(L("；"))) : L("没有额外边界")}</dd></div>
      <div><dt>${L("关联变更")}</dt><dd>${dependencyLabels.length ? escapeHtml(dependencyLabels.join(L("；"))) : L("可独立理解，无前置 change")}</dd></div>` : ""}
    </dl>`;
    const issueCopy = issuesByItem.get(item.item_id) ?? [];
    const blocked = item.state === "conflict" || issueCopy.length > 0;
    return `<li class="goal-tree-proposal-item${item.state === "conflict" ? " is-conflict" : ""}${issueCopy.length ? " is-invalid" : ""}">
      <input type="hidden" name="item_id" value="${escapeHtml(item.item_id)}">
      <span>${icon(blocked ? "blocked" : "check")}</span><div><strong>${escapeHtml(copy.title)}</strong><small>${escapeHtml(copy.detail)}</small>${semanticExplanation}${copy.facts.length ? `<ul class="goal-tree-proposal-item-facts">${copy.facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>` : ""}${issueCopy.length ? `<div class="goal-tree-proposal-item-error"><strong>${L("这项现在不能采用")}</strong>${issueCopy.map((issue) => `<p>${escapeHtml(issue.message)} ${escapeHtml(issue.recovery)}</p>`).join("")}</div>` : ""}</div>
    </li>`;
  };
  const itemRows = undecidedItems.map(renderItemRow).join("");
  const problemRows = problemItems.map(renderItemRow).join("");
  const otherRows = otherItems.map(renderItemRow).join("");
  const conflictMessage = conflictCount
    ? `<p class="goal-tree-proposal-conflict" role="status">${L("其中 {count} 项已经和当前 Molis Work 状态不一致。请退回方案，让 Runtime 按最新状态重新整理。", { count: conflictCount })}</p>`
    : "";
  const riskOnly = riskInvalidItemCount > 0 && decompositionInvalidItemCount === 0;
  const decompositionOnly = decompositionInvalidItemCount > 0 && riskInvalidItemCount === 0;
  const invalidHeading = repairableRiskItemCount
    ? runtimeInvalidItemCount
      ? L("这份方案有 {riskCount} 条风险需要你选择，另有 {otherCount} 项需要补全", {
          riskCount: repairableRiskItemCount,
          otherCount: runtimeInvalidItemCount,
        })
      : L("这份方案有 {count} 条风险需要你选择处理方式", { count: repairableRiskItemCount })
    : riskOnly
      ? L("这份方案有 {count} 条风险信息需要修正", { count: invalidItemCount })
      : leafOnly
        ? L("这份方案有 {count} 个 Goal 还没拆到可以直接执行", { count: leafInvalidItemCount })
        : decompositionOnly
        ? L("这份方案有 {count} 个 Goal 的拆解还不完整", { count: invalidItemCount })
        : L("这份方案有 {count} 项内容需要修正", { count: invalidItemCount });
  const invalidSummary = repairableRiskItemCount
    ? runtimeInvalidItemCount
      ? L("先为下面 {riskCount} 条风险选择处理方式并保存。选择不会丢失；保存后仍有 {otherCount} 项需要 Runtime 补全。", {
          riskCount: repairableRiskItemCount,
          otherCount: runtimeInvalidItemCount,
        })
      : L("请为下面 {count} 条风险选择处理方式。原来的具体措施已经保留，你可以修改后一起保存。", { count: repairableRiskItemCount })
    : riskOnly
      ? L("其中 {count} 条风险信息需要 Runtime 修正。这些风险还没有写入 Molis Work。", { count: invalidItemCount })
      : leafOnly
        ? L("这些 Goal 仍包含多个可独立交付的结果，或没有说明唯一主要结果和完成依据。", { count: leafInvalidItemCount })
        : decompositionOnly
        ? L("其中 {count} 个 Goal 还没有交代通用结果链、当前任务的必要路径，或下面仍有目标没有拆完。", { count: invalidItemCount })
        : L("当前有内容不满足 Molis Work 的写入规则，修正前不会写入 Goal Tree。");
  const invalidWhy = repairableRiskItemCount
    ? L("风险怎么处理应当由你决定。Molis Work 会把处理类别和具体措施分开保存，并保留方案的其他内容。")
    : riskOnly
      ? L("Runtime 提交的风险信息不符合 Molis Work 的记录规则，需要修正后才能采用整份方案。")
      : leafOnly
        ? L("一条可执行 Goal 只能交付一个主要结果；能单独交付、验收或返工的工作需要拆开。")
        : decompositionOnly
        ? L("这份方案还不能证明任务要完成所需的结果、核心能力和支撑基础都有人负责，也不能证明所有子 Goal 已经拆到可执行。")
        : L("这份方案仍有不能安全写入的内容，需要修正后再确认。");
  const invalidBasis = repairableRiskItemCount
    ? runtimeInvalidItemCount
      ? L("你可以先保存 {riskCount} 条风险选择；另外 {otherCount} 项不会被掩盖，仍会明确留在待处理。", {
          riskCount: repairableRiskItemCount,
          otherCount: runtimeInvalidItemCount,
        })
      : L("保存后会生成完整修订版，其他 Goal 和关系内容保持不变。")
    : riskOnly
      ? L("当前有 {count} 条风险无法写入；退回不会改变现有 Goal Tree。", { count: invalidItemCount })
      : leafOnly
        ? L("当前有 {count} 个 Goal 仍需继续拆分；退回不会改变现有 Goal Tree。", { count: leafInvalidItemCount })
        : decompositionOnly
        ? L("当前有 {count} 个 Goal 的结果链、任务路径或开放分支没有交代清楚；退回不会改变现有 Goal Tree。", { count: invalidItemCount })
        : L("当前有 {count} 项内容无法写入；退回不会改变现有 Goal Tree。", { count: invalidItemCount });
  const disabledConfirmLabel = repairableRiskItemCount
    ? runtimeInvalidItemCount ? L("还需补全其余问题") : L("先保存风险处理")
    : riskOnly
      ? L("先修正方案中的风险")
      : leafOnly
        ? L("先拆成可执行 Goal")
        : decompositionOnly
        ? L("先补全 Goal 拆解")
        : L("先修正方案");
  const invalidMessage = invalidItemCount
    ? `<section class="goal-tree-proposal-readiness" role="alert"><div>${icon("blocked")}</div><div><h4>${L("这份方案暂时不能采用")}</h4><p>${invalidSummary}</p><strong>${repairableRiskItemCount ? L("你现在需要做：逐条选择风险处理方式，然后保存选择。") : L("你现在需要做：点击“退回修正”。退回理由已按下方问题预填，可以直接提交，也可以改写。")}</strong></div></section>`
    : "";
  return `<form class="decision-record goal-tree-proposal-decision" data-goal-tree-decision-form data-live-form="goal-tree-${escapeHtml(proposal.proposal_id)}" data-goal-tree-proposal-id="${escapeHtml(proposal.proposal_id)}" data-has-system-issues="${problemCount ? "true" : "false"}" novalidate>
    <header class="decision-record-heading"><span class="decision-kind">${icon("tree")} ${L("目标说明")}${renderNewDecisionBadge(proposal.created_at, view, "goalTree", proposal.proposal_id)}</span><details class="decision-record-tech"><summary>${L("记录信息")}</summary><small>${L("方案版本 {version}", { version: proposal.version })} · ${escapeHtml(proposal.proposal_id)}</small></details></header>
    <div class="decision-record-body"><h3>${invalidItemCount ? invalidHeading : L("这份 Goal 方案要采用，还是退回修改？")}</h3><p>${invalidItemCount ? repairableRiskItemCount ? L("方案中的其他内容仍可查看。先完成下面的风险选择；保存后页面会继续列出剩余问题。") : L("方案中的其他内容仍可查看，但当前不能写入 Goal Tree。请先退回，让 Runtime 修正后重新提交。") : L("Runtime 已经把目标、完成条件和关系变化整理成一份方案。采用后这些内容才会进入 Goal Tree；退回则保持当前内容不变。")}</p>
      <div class="goal-tree-proposal-summary"><small>${L("准备确认的 Goal")}</small><strong>${escapeHtml(proposedTitle)}</strong><p>${escapeHtml(proposedOutcome)}</p></div>
      ${narrativeSummary}
      ${invalidMessage}
      ${renderDecisionGuidance({
        whyNow: invalidItemCount
          ? invalidWhy
          : L("目标已经整理完，现在只差你确认这份方案是否准确。"),
        recommendation: invalidItemCount ? repairableRiskItemCount ? L("先完成风险选择") : L("退回修正") : null,
        recommendationBasis: invalidItemCount ? invalidBasis : undefined,
        insufficient: L("方案是否符合你的真实意图，需要由你判断。"),
        consequences: invalidItemCount
          ? [
              ...(repairableRiskItemCount ? [{
                choice: L("保存风险处理"),
                effect: runtimeInvalidItemCount
                  ? L("风险选择会进入完整修订版；其余 {count} 项仍会留在页面等待补全。", { count: runtimeInvalidItemCount })
                  : L("风险选择会进入完整修订版；其他方案内容保持不变，之后可以确认整份方案。"),
              }] : []),
              { choice: L("退回修正"), effect: L("当前 Goal Tree 保持不变；退回理由已预填下方问题，你可以直接采用或改写后再提交。") },
              { choice: L("采用整份方案（当前不可用）"), effect: L("方案修正前，系统不会写入任何变化。") },
            ]
          : [
              { choice: L("采用整份方案"), effect: L("下面列出的目标和关系变化会一起生效，Goal 会进入相应的下一阶段。") },
              { choice: L("退回修改"), effect: L("当前 Goal Tree 不会改变；Runtime 会根据你的意见重新整理方案。") },
            ],
      })}${renderGoalTreeProposalScenario(proposal, view, undecidedItems)}
    </div>
    ${problemCount
      ? `<details class="decision-details goal-tree-proposal-changes" open><summary><span>${L("先处理这 {count} 项", { count: problemCount })}<small>${L("需要你选择或让 Runtime 补全")}</small></span>${icon("chevron-down")}</summary><ol>${problemRows}</ol>${conflictMessage}</details>${otherItems.length ? `<details class="decision-details goal-tree-proposal-changes"><summary><span>${L("查看其余 {count} 项变化", { count: otherItems.length })}<small>${L("这些内容当前不需要你操作")}</small></span>${icon("chevron-down")}</summary><ol>${otherRows}</ol></details>` : ""}`
      : `<details class="decision-details goal-tree-proposal-changes"><summary><span>${L("查看采用后的 {count} 项变化", { count: undecidedItems.length })}<small>${L("展开查看每项变化")}</small></span>${icon("chevron-down")}</summary><ol>${itemRows}</ol></details>`}
    ${(acceptance.length || inScope.length || outOfScope.length) ? `<details class="decision-details"><summary>${L("查看范围和完成条件")}${icon("chevron-down")}</summary><div class="goal-tree-proposal-details">
      ${inScope.length ? `<section><h4>${L("这次会做")}</h4>${renderList(inScope, "")}</section>` : ""}
      ${outOfScope.length ? `<section><h4>${L("这次不做")}</h4>${renderList(outOfScope, "")}</section>` : ""}
      ${acceptance.length ? `<section class="goal-tree-proposal-acceptance"><h4>${L("完成条件")}</h4><ol>${acceptance.map((criterion) => `<li><strong>${escapeHtml(criterion.statement)}</strong><small>${escapeHtml(criterion.pass_condition)}</small></li>`).join("")}</ol></section>` : ""}
    </div></details>` : ""}
    ${problemCount
      ? `<label class="decision-reason"><span>${L("决定理由或修改意见")}（${L("必填")}）</span><textarea name="reason" rows="3" required placeholder="${L("已按下方问题预填，可以直接采用，也可以改写")}">${escapeHtml(prefilledRejectReason)}</textarea></label>`
      : `<label class="decision-reason"><span>${L("决定理由或修改意见")}（${L("必填")}）</span><textarea name="reason" rows="3" required placeholder="${L("采用时说明为什么方案准确；退回时写清需要修改什么")}"></textarea></label>`}
    <p class="form-error" data-decision-error role="alert" hidden></p>
    <footer class="decision-actions"><button type="submit" name="decision" value="reject">${problemCount ? L("退回修正") : L("退回修改")}</button><button class="button-primary" type="submit" name="decision" value="confirm"${problemCount || !actionableItems.length ? ` disabled aria-disabled="true"` : ""}>${invalidItemCount ? disabledConfirmLabel : conflictCount ? L("先更新冲突项") : L("采用整份方案")}</button></footer>
  </form>`;
}
return { renderGoalTreeProposalDecision };
}
export type GoalsProposalRenderer = ReturnType<typeof createProposalRenderer>;
export interface GoalsProposalUiModel {
  primitives: GoalsProposalUiPrimitives;
  proposal: GoalTreeProposalRecord;
  view: GoalsProposalView;
}
export const goalsProposalUiContribution: UiContribution<GoalsProposalUiModel> = {
  descriptor: { contribution_id: GOALS_PROPOSAL_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.native.goals", kind: "embedded", label: "Goal tree proposal decision",
    surfaces: [{ surface_id: "decision", target_slot_id: "workbench.main", format: "declarative-html" }], slots: [] },
  render({ surface, model }) {
    if (surface !== "decision") throw new Error("Unknown Goals proposal surface");
    return createProposalRenderer(model.primitives).renderGoalTreeProposalDecision(model.proposal, model.view);
  },
};
