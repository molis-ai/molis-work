import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalTreeProposalRecord } from "./contract/governance-collaboration.js";
import { goalTreeProposalNeedsDecision } from "./decision-groups.js";
import { goalRelationLabel } from "./relation-presentation.js";
import { createGoalsDecisionPresentation } from "./decision-common-ui.js";
import { createGoalsProposalPresentation } from "./proposal-presentation.js";
import { findGoalView, type GoalsProposalView, type GoalsProposalUiPrimitives } from "./proposal-ui-model.js";

function renderProposalList(primitives: GoalsProposalUiPrimitives, proposals: readonly GoalTreeProposalRecord[], view: GoalsProposalView): string {
  const { escapeHtml } = primitives;
  const { renderGoalTreeProposalDecision } = createProposalRenderer(primitives);
  const pending = proposals.filter(goalTreeProposalNeedsDecision);
  return pending.length ? `<section data-goal-proposals aria-label="${uiText("goals.proposal-ui.needs-decision")}"><h2>${uiText("goals.proposal-ui.needs-decision")}</h2>${pending.map(proposal =>
    `<details class="decision-details" id="${escapeHtml(proposal.proposal_id)}" data-persist-open="${escapeHtml(proposal.proposal_id)}" data-goal-proposal-entry><summary>${escapeHtml(proposal.summary)}</summary>${renderGoalTreeProposalDecision(proposal, view)}</details>`).join("")}</section>` : "";
}

export const GOALS_PROPOSAL_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.proposal";
function createProposalRenderer(primitives: GoalsProposalUiPrimitives) {
const { translate: readText, escapeHtml, icon } = primitives;
const { renderNewDecisionBadge, renderDecisionGuidance, renderDecisionScenario, proposedGoalNextStage } = createGoalsDecisionPresentation(primitives);
const { proposedGoalName, goalTreeRelationPayloads, goalTreeProposalItemCopy } = createGoalsProposalPresentation(readText);
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
  const type = String(relation.type ?? "");
  if (type === "part_of") {
    if (subjectGoalId && fromGoalId === subjectGoalId) {
      return uiText.text("goals.proposal-ui.becomes-child-parent", { parent: to });
    }
    return uiText.text("goals.proposal-ui.goal-child-becomes-child-parent", { child: from, parent: to });
  }
  if (type === "depends_on") {
    if (subjectGoalId && fromGoalId === subjectGoalId) {
      return uiText.text("goals.proposal-ui.waits-dependency-finish-first", { dependency: to });
    }
    return uiText.text("goals.proposal-ui.goal-goal-waits-dependency-finish-first", { goal: from, dependency: to });
  }
  const relationLabel = goalRelationLabel(type, "out") ?? uiText.text("goals.proposal-ui.create-relation");
  return uiText.text("goals.proposal-ui.goal-get-relation-relationship", { from, to, relation: relationLabel });
}

function renderGoalTreeProposalScenario(
  proposal: GoalTreeProposalRecord,
  view: GoalsProposalView,
  items: GoalTreeProposalRecord["items"],
): string {
  const goalItem = items.find((item) => item.kind === "goal");
  const relationItem = items.find((item) => item.kind === "relation");
  const goal = goalItem ? goalItem.payload : null;
  const goalTitle = goal
    ? String(goal.title ?? proposedGoalName(goal.goal_id, view, proposal))
    : proposedGoalName(relationItem ? goalTreeRelationPayloads(relationItem.payload)[0]?.from_goal_id : proposal.root_goal_id, view, proposal);
  const goalId = goal ? String(goal.goal_id ?? "") : "";
  const goalEffect = goalItem
    ? uiText.text("goals.proposal-ui.goal-title-added", { title: goalTitle })
    : uiText.text("goals.proposal-ui.goal-title-has-its-relationships-updated-proposed", { title: goalTitle });
  const relationEffect = relationItem
    ? goalTreeRelationScenario(relationItem, view, proposal, goalId)
    : uiText.text("goals.proposal-ui.proposal-does-not-automatically-change-goal-title-ownership", { title: goalTitle });
  const nextStage = goal ? proposedGoalNextStage() : uiText.text("goals.proposal-ui.whether-existing-goals-can-start-still-depends-their");
  return renderDecisionScenario({
    confirmLabel: uiText.text("goals.proposal-ui.if-apply"),
    confirmEffect: `${goalEffect}${relationEffect}${nextStage}`,
    rejectLabel: uiText.text("goals.proposal-ui.if-send-back"),
    rejectEffect: uiText.text("goals.proposal-ui.none-goal-relationship-changes-above-written-current-goal"),
  });
}

function renderGoalTreeProposalDecision(proposal: GoalTreeProposalRecord, view: GoalsProposalView): string {
  const undecidedItems = proposal.items.filter((item) => item.state === "pending" || item.state === "conflict");
  const issuesByItem = new Map<string, Array<{ message: string; recovery: string }>>();
  for (const item of undecidedItems) {
    const persistedConflict = item.state === "conflict"
      ? [{
          message: String(item.conflict?.message ?? uiText.text("goals.proposal-ui.some-parts-proposal-still-cannot-be-written-safely")),
          recovery: String(item.conflict?.recovery ?? uiText.text("goals.proposal-ui.current-goal-tree-stays-unchanged-runtime-will-revise")),
        }]
      : [];
    if (persistedConflict.length) issuesByItem.set(item.item_id, persistedConflict);
  }
  const invalidItemCount = issuesByItem.size;
  const actionableItems = undecidedItems.filter((item) => item.state === "pending" && !issuesByItem.has(item.item_id));
  const conflictCount = undecidedItems.filter((item) => item.state === "conflict").length;
  const problemItems = undecidedItems.filter((item) => item.state === "conflict" || issuesByItem.has(item.item_id));
  const otherItems = undecidedItems.filter((item) => !problemItems.includes(item));
  const problemCount = problemItems.length;
  const contractItem = proposal.items.find((item) =>
    item.kind === "goal" && String(item.payload.goal_id ?? "") === String(proposal.root_goal_id ?? ""),
  ) ?? proposal.items.find((item) => item.kind === "goal");
  const contractPayload = contractItem ? contractItem.payload : null;
  const proposedTitle = String(contractPayload?.title ?? findGoalView(view, proposal.root_goal_id)?.goal.title ?? uiText.text("goals.proposal-ui.goal-plan"));
  const proposedOutcome = String(contractPayload?.outcome ?? proposal.summary).trim();
  const requirements = Array.isArray(contractPayload?.requirements)
    ? contractPayload.requirements as Array<Record<string, unknown>>
    : [];
  const semanticItemCopies = new Map(
    proposal.items.map((item) => [item.item_id, goalTreeProposalItemCopy(item, view, proposal)]),
  );
  const prefilledRejectReason = [...new Set(problemItems.flatMap((item) => {
    const title = semanticItemCopies.get(item.item_id)?.title ?? "";
    const issues = issuesByItem.get(item.item_id) ?? (item.state === "conflict"
      ? [{
          message: String(item.conflict?.message ?? uiText.text("goals.proposal-ui.some-parts-proposal-still-cannot-be-written-safely")),
          recovery: "",
        }]
      : []);
    return issues
      .map((issue) => issue.message.trim())
      .filter(Boolean)
      .map((message) => title ? `${title}${uiText.text("common.punctuation.label-separator")}${message}` : message);
  }))].join("\n");
  const narrative = proposal.narrative;
  const narrativeSummary = narrative
    ? `<section class="goal-tree-proposal-narrative" aria-label="${uiText("goals.proposal-ui.change-note")}">
        <h4>${uiText("goals.proposal-ui.what-problem-does-change-set-solve")}</h4>
        <dl>
          <div><dt>${uiText("goals.proposal-ui.why-change-now")}</dt><dd>${escapeHtml(narrative.why_now)}</dd></div>
          <div><dt>${uiText("goals.proposal-ui.what-no-longer-works-current-goal-tree")}</dt><dd>${escapeHtml(narrative.problem)}</dd></div>
          <div><dt>${uiText("goals.proposal-ui.main-path-after-change")}</dt><dd><ol>${narrative.main_path.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></dd></div>
          <div><dt>${uiText("goals.proposal-ui.expected-effect")}</dt><dd>${escapeHtml(narrative.expected_effect)}</dd></div>
          <div><dt>${uiText("goals.proposal-ui.what-change-does-not-alter")}</dt><dd>${narrative.non_goals.length ? `<ul>${narrative.non_goals.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : uiText("goals.proposal-ui.no-additional-non-goals")}</dd></div>
        </dl>
      </section>`
    : "";
  const renderItemRow = (item: GoalTreeProposalRecord["items"][number]): string => {
    const copy = goalTreeProposalItemCopy(item, view, proposal);
    const explanation = item.explanation;
    const dependencyLabels = (explanation?.depends_on_item_ids ?? []).map((itemId) =>
      semanticItemCopies.get(itemId)?.title ?? itemId);
    const semanticExplanation = `<dl class="goal-tree-proposal-item-explanation">
      <div><dt>${uiText("goals.proposal-ui.problem-addressed")}</dt><dd>${escapeHtml(explanation?.problem ?? item.reason)}</dd></div>
      ${explanation ? `<div><dt>${uiText("goals.proposal-ui.what-changes")}</dt><dd>${escapeHtml(explanation.expected_effect)}</dd></div>
      <div><dt>${uiText("goals.proposal-ui.what-stays-unchanged")}</dt><dd>${explanation.non_goals.length ? escapeHtml(explanation.non_goals.join(uiText.text("common.punctuation.semicolon"))) : uiText("goals.proposal-ui.no-additional-boundary")}</dd></div>
      <div><dt>${uiText("goals.proposal-ui.related-changes")}</dt><dd>${dependencyLabels.length ? escapeHtml(dependencyLabels.join(uiText.text("common.punctuation.semicolon"))) : uiText("goals.proposal-ui.can-be-understood-independently-no-prerequisite-change")}</dd></div>` : ""}
    </dl>`;
    const issueCopy = issuesByItem.get(item.item_id) ?? [];
    const blocked = item.state === "conflict" || issueCopy.length > 0;
    return `<li class="goal-tree-proposal-item${item.state === "conflict" ? " is-conflict" : ""}${issueCopy.length ? " is-invalid" : ""}">
      <input type="hidden" name="item_id" value="${escapeHtml(item.item_id)}">
      <span>${icon(blocked ? "blocked" : "check")}</span><div><strong>${escapeHtml(copy.title)}</strong><small>${escapeHtml(copy.detail)}</small>${semanticExplanation}${copy.facts.length ? `<ul class="goal-tree-proposal-item-facts">${copy.facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>` : ""}${issueCopy.length ? `<div class="goal-tree-proposal-item-error"><strong>${uiText("goals.proposal-ui.item-cannot-be-applied-yet")}</strong>${issueCopy.map((issue) => `<p>${escapeHtml(issue.message)} ${escapeHtml(issue.recovery)}</p>`).join("")}</div>` : ""}</div>
    </li>`;
  };
  const itemRows = undecidedItems.map(renderItemRow).join("");
  const problemRows = problemItems.map(renderItemRow).join("");
  const otherRows = otherItems.map(renderItemRow).join("");
  const conflictMessage = conflictCount
    ? `<p class="goal-tree-proposal-conflict" role="status">${uiText("goals.proposal-ui.count-item-s-no-longer-match-current-molis", { count: conflictCount })}</p>`
    : "";
  const invalidHeading = uiText.text("goals.proposal-ui.proposal-has-count-item-s-that-need-correction", { count: invalidItemCount });
  const invalidSummary = uiText.text("goals.proposal-ui.some-content-does-not-meet-molis-work-s");
  const invalidWhy = uiText.text("goals.proposal-ui.some-parts-proposal-still-cannot-be-written-safely");
  const invalidBasis = uiText.text("goals.proposal-ui.count-item-s-cannot-be-written-sending-proposal", { count: invalidItemCount });
  const invalidMessage = invalidItemCount
    ? `<section class="goal-tree-proposal-readiness" role="alert"><div>${icon("blocked")}</div><div><h4>${uiText("goals.proposal-ui.proposal-cannot-be-applied-yet")}</h4><p>${invalidSummary}</p><strong>${uiText("goals.proposal-ui.what-do-now-select-return-correction-return-reason")}</strong></div></section>`
    : "";
  return `<form class="decision-record goal-tree-proposal-decision" data-goal-tree-decision-form data-live-form="goal-tree-${escapeHtml(proposal.proposal_id)}" data-goal-tree-proposal-id="${escapeHtml(proposal.proposal_id)}" data-has-system-issues="${problemCount ? "true" : "false"}" novalidate>
    <header class="decision-record-heading"><span class="decision-kind">${icon("tree")} ${uiText("goals.proposal-ui.goal-summary")}${renderNewDecisionBadge(proposal.created_at, view, "goalTree", proposal.proposal_id)}</span><details class="decision-record-tech"><summary>${uiText("goals.proposal-ui.record-details")}</summary><small>${uiText("goals.proposal-ui.plan-version-version", { version: proposal.version })} · ${escapeHtml(proposal.proposal_id)}</small></details></header>
    <div class="decision-record-body"><h3>${invalidItemCount ? invalidHeading : uiText("goals.proposal-ui.use-goal-plan-send-back-changes")}</h3><p>${invalidItemCount ? uiText("goals.proposal-ui.can-still-review-rest-proposal-but-cannot-be") : uiText("goals.proposal-ui.runtime-has-organized-goal-completion-conditions-relationship-ch")}</p>
      <div class="goal-tree-proposal-summary"><small>${uiText("goals.proposal-ui.goal-ready-approval")}</small><strong>${escapeHtml(proposedTitle)}</strong><p>${escapeHtml(proposedOutcome)}</p></div>
      ${narrativeSummary}
      ${invalidMessage}
      ${renderDecisionGuidance({
        whyNow: invalidItemCount
          ? invalidWhy
          : uiText.text("goals.proposal-ui.goal-fully-organized-remaining-step-confirm-that-plan"),
        recommendation: invalidItemCount ? uiText.text("goals.proposal-ui.return-correction") : null,
        recommendationBasis: invalidItemCount ? invalidBasis : undefined,
        insufficient: uiText.text("goals.proposal-ui.only-can-decide-whether-plan-matches-intent"),
        consequences: invalidItemCount
          ? [
              { choice: uiText.text("goals.proposal-ui.return-correction"), effect: uiText.text("goals.proposal-ui.current-goal-tree-stays-unchanged-rejection-reason-prefilled") },
              { choice: uiText.text("goals.proposal-ui.apply-full-proposal-currently-unavailable"), effect: uiText.text("goals.proposal-ui.system-will-not-write-any-changes-until-proposal") },
            ]
          : [
              { choice: uiText.text("goals.proposal-ui.use-whole-plan"), effect: uiText.text("goals.proposal-ui.listed-goal-relationship-changes-take-effect-together-goal") },
              { choice: uiText.text("goals.proposal-ui.send-back-changes"), effect: uiText.text("goals.proposal-ui.current-goal-tree-stays-unchanged-runtime-will-revise") },
            ],
      })}${renderGoalTreeProposalScenario(proposal, view, undecidedItems)}
    </div>
    ${problemCount
      ? `<details class="decision-details goal-tree-proposal-changes" open><summary><span>${uiText("goals.proposal-ui.handle-these-count-item-s-first", { count: problemCount })}<small>${uiText("goals.proposal-ui.choose-option-have-runtime-complete-item")}</small></span>${icon("chevron-down")}</summary><ol>${problemRows}</ol>${conflictMessage}</details>${otherItems.length ? `<details class="decision-details goal-tree-proposal-changes"><summary><span>${uiText("goals.proposal-ui.view-other-count-change-s", { count: otherItems.length })}<small>${uiText("goals.proposal-ui.no-action-needed-these-items-right-now")}</small></span>${icon("chevron-down")}</summary><ol>${otherRows}</ol></details>` : ""}`
      : `<details class="decision-details goal-tree-proposal-changes"><summary><span>${uiText("goals.proposal-ui.view-count-count-will-apply", { count: undecidedItems.length })}<small>${uiText("goals.proposal-ui.expand-review-each-change")}</small></span>${icon("chevron-down")}</summary><ol>${itemRows}</ol></details>`}
    ${requirements.length ? `<details class="decision-details"><summary>${uiText("goals.proposal-ui.view-completion-requirements")}${icon("chevron-down")}</summary><div class="goal-tree-proposal-details">
      <section class="goal-tree-proposal-acceptance"><h4>${uiText("goals.proposal-ui.completion-requirement")}</h4><ol>${requirements.map((requirement) => `<li><strong>${escapeHtml(requirement.statement)}</strong>${requirement.human_decision_required ? `<small>${uiText("goals.proposal-ui.needs-user-acceptance")}</small>` : ""}</li>`).join("")}</ol></section>
    </div></details>` : ""}
    ${problemCount
      ? `<label class="decision-reason"><span>${uiText("goals.proposal-ui.decision-reason-revision-note")}${uiText.text("common.punctuation.in-parens", { value: uiText("goals.proposal-ui.required") })}</span><textarea name="reason" rows="3" required placeholder="${uiText("goals.proposal-ui.prefilled-issues-below-submit-rewrite")}">${escapeHtml(prefilledRejectReason)}</textarea></label>`
      : `<label class="decision-reason"><span>${uiText("goals.proposal-ui.decision-reason-revision-note")}${uiText.text("common.punctuation.in-parens", { value: uiText("goals.proposal-ui.required") })}</span><textarea name="reason" rows="3" required placeholder="${uiText("goals.proposal-ui.when-using-say-why-plan-accurate-when-sending")}"></textarea></label>`}
    <p class="form-error" data-decision-error role="alert" hidden></p>
    <footer class="decision-actions"><button type="submit" name="decision" value="reject">${problemCount ? uiText("goals.proposal-ui.return-correction") : uiText("goals.proposal-ui.send-back-changes")}</button><button class="mw-btn mw-btn--primary" type="submit" name="decision" value="confirm"${problemCount || !actionableItems.length ? ` disabled aria-disabled="true"` : ""}>${invalidItemCount ? uiText("goals.proposal-ui.correct-proposal-first") : conflictCount ? uiText("goals.proposal-ui.update-conflicting-items-first") : uiText("goals.proposal-ui.use-whole-plan")}</button></footer>
  </form>`;
}
return { renderGoalTreeProposalDecision, renderGoalTreeProposalList: (proposals: readonly GoalTreeProposalRecord[], view: GoalsProposalView) => renderProposalList(primitives, proposals, view) };
}
export type GoalsProposalRenderer = ReturnType<typeof createProposalRenderer>;
export type GoalsProposalUiModel = { primitives: GoalsProposalUiPrimitives } & (
  | { kind: "decision"; args: Parameters<GoalsProposalRenderer["renderGoalTreeProposalDecision"]> }
  | { kind: "list"; args: Parameters<GoalsProposalRenderer["renderGoalTreeProposalList"]> }
);
/** Which surface each renderer method mounts (W5-06): the shell builds its renderer from this, and the descriptor lists these. */
export const GOALS_PROPOSAL_UI_SURFACES = { renderGoalTreeProposalDecision: "decision", renderGoalTreeProposalList: "list" } as const satisfies Record<keyof GoalsProposalRenderer, GoalsProposalUiModel["kind"]>;
export const goalsProposalUiContribution: UiContribution<GoalsProposalUiModel> = {
  descriptor: { contribution_id: GOALS_PROPOSAL_UI_CONTRIBUTION_ID, kind: "embedded", label: "Goal tree proposal decision",
    surfaces: Object.values(GOALS_PROPOSAL_UI_SURFACES).map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })), slots: [] },
  render({ surface, model }) {
    if (surface !== model.kind) throw new Error("Goals proposal surface does not match its model");
    const renderer = createProposalRenderer(model.primitives);
    return model.kind === "list" ? renderer.renderGoalTreeProposalList(...model.args) : renderer.renderGoalTreeProposalDecision(...model.args);
  },
};
