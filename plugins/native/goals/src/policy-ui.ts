import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalsPolicyItem, GoalsPolicyUiPrimitives } from "./policy-ui-model.js";

export const GOALS_POLICY_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.policy.v1";

function createPolicyRenderer(primitives: GoalsPolicyUiPrimitives) {
  const { escapeHtml, icon } = primitives;

function renderPolicyEditor(
  item: GoalsPolicyItem,
  options: { editGoal?: boolean } = { editGoal: true },
): string {
  const policy = item.resolved_policy;
  const requirements = item.event_document?.state.requirements ?? [];
  return `<div class="policy-workbench">
    <section class="policy-effective"><header><span class="policy-effective-icon">${icon("shield")}</span><div><h3>${uiText("goals.policy-ui.effective-rules-now")}</h3><p>${uiText("goals.policy-ui.project-rules-checked-closure-goal-s-completion-requirements")}</p></div></header><dl><div><dt>${uiText("goals.policy-ui.confirmation")}</dt><dd><strong>${policy.human_approval ? uiText("goals.policy-ui.required") : uiText("goals.policy-ui.not-required")}</strong><small>${policy.human_approval ? uiText("goals.policy-ui.have-final-confirmation") : uiText("goals.policy-ui.no-final-user-approval-required")}</small></dd></div></dl></section>
    <section class="rule-summary" data-goal-policy-requirements><h3>${uiText("goals.policy-ui.goal-s-completion-requirements")}</h3>${requirements.length ? `<ul>${requirements.map(requirement => `<li>${escapeHtml(requirement.statement)}</li>`).join("")}</ul>` : `<p>${uiText("goals.policy-ui.completion-requirements-have-not-been-defined-yet")}</p>`}${options.editGoal ? `<button type="button" class="mw-btn mw-btn--link" data-event-reader="requirements">${uiText("goals.policy-ui.view-completion-requirements")}</button>` : ""}</section>
    <p class="policy-scope-note">${icon("folder")}<a href="__PROJECT_RULES_SETTINGS__">${uiText("goals.policy-ui.open-project-settings")}</a></p>
  </div>`;
}

  function renderProgressCheckSummary(policy: GoalsPolicyItem["resolved_policy"]): string {
    return `<div class="rule-summary"><h3>${uiText("goals.policy-ui.checks-still-required-before-completion")}</h3><ul><li>${policy.human_approval ? uiText("goals.policy-ui.need-approve-final-result") : uiText("goals.policy-ui.final-approval-not-required")}</li></ul></div>`;
  }
  return { renderPolicyEditor, renderProgressCheckSummary };
}

export type GoalsPolicyRenderer = ReturnType<typeof createPolicyRenderer>;
export type GoalsPolicyEditorArguments = Parameters<ReturnType<typeof createPolicyRenderer>["renderPolicyEditor"]>;
export type GoalsPolicyCheckSummaryArguments = Parameters<ReturnType<typeof createPolicyRenderer>["renderProgressCheckSummary"]>;
export type GoalsPolicyUiModel = {
  primitives: GoalsPolicyUiPrimitives;
} & ({ kind: "editor"; args: GoalsPolicyEditorArguments } | { kind: "check-summary"; args: GoalsPolicyCheckSummaryArguments });

/** Which surface each renderer method mounts (W5-06): the shell builds its renderer from this, and the descriptor lists these. */
export const GOALS_POLICY_UI_SURFACES = { renderPolicyEditor: "editor", renderProgressCheckSummary: "check-summary" } as const satisfies Record<keyof GoalsPolicyRenderer, GoalsPolicyUiModel["kind"]>;
export const goalsPolicyUiContribution: UiContribution<GoalsPolicyUiModel> = {
  descriptor: {
    contribution_id: GOALS_POLICY_UI_CONTRIBUTION_ID,
    kind: "embedded",
    label: "Goal work rules",
    surfaces: Object.values(GOALS_POLICY_UI_SURFACES).map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })),
    slots: [],
  },
  render({ surface, model }) {
    if (surface !== model.kind) throw new Error("Goals policy surface does not match its model");
    const renderer = createPolicyRenderer(model.primitives);
    switch (model.kind) {
      case "editor": return renderer.renderPolicyEditor(...model.args);
      case "check-summary": return renderer.renderProgressCheckSummary(...model.args);
    }
  },
};
