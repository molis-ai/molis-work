import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalPolicy } from "./contract/goals.js";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { mergeGoalPolicyFormValues, type GoalsPolicyBinding, type GoalsPolicyItem, type GoalsPolicyUiPrimitives } from "./policy-ui-model.js";

export const GOALS_POLICY_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.policy.v1";

function createPolicyRenderer(primitives: GoalsPolicyUiPrimitives) {
  const { escapeHtml, formatDate, icon, defaultPolicy: DEFAULT_GOAL_POLICY } = primitives;

  function renderHeadingHint(id: string, label: string, text: string): string {
    const ident = id.replace(/[^a-zA-Z0-9_-]+/g, "-") || "hint";
    const anchor = `--${ident}`;
    return `<span class="mw-hint"><button type="button" class="mw-hint__trigger" popovertarget="${escapeHtml(ident)}" aria-label="${escapeHtml(label)}" style="anchor-name: ${anchor}">${icon("circle-alert")}</button><div id="${escapeHtml(ident)}" class="mw-tooltip mw-hint__tooltip" data-slot="tooltip" role="tooltip" popover="auto" style="position-anchor: ${anchor}">${escapeHtml(text)}</div></span>`;
  }

  function activePolicyBinding(
  item: GoalsPolicyItem,
): GoalsPolicyBinding | undefined {
  return item.policy_bindings
    .filter(binding => binding.state === "active" && binding.scope === "project_default" && binding.goal_id == null)
    .at(-1);
}

function renderPolicyToggle(
  name: "human_approval",
  checked: boolean,
  title: string,
  description: string,
): string {
  return `<label class="policy-toggle"><input type="checkbox" name="${name}"${checked ? " checked" : ""}><span class="policy-switch" aria-hidden="true"></span><span class="policy-toggle-copy"><strong>${uiText(title)}</strong><small>${uiText(description)}</small></span></label>`;
}

function renderPolicyForm(
  item: GoalsPolicyItem | null,
  scope: "project_default",
  policy: GoalPolicy,
  binding: GoalsPolicyBinding | undefined,
  contextKey = item?.goal.goal_id ?? "project",
  openByDefault = false,
): string {
  const scopeLabel = uiText.text("goals.policy-ui.project-default-rules");
  const description = uiText.text("goals.policy-ui.baseline-every-goal-change-applies-closures-now");
  const saved = binding
    ? `${uiText.text("goals.policy-ui.saved")}${formatDate(binding.created_at)} · ${binding.created_by}`
    : uiText.text("goals.policy-ui.not-set-separately-using-system-default");
  const scopeState = binding ? uiText.text("goals.policy-ui.project-baseline-set") : uiText.text("goals.policy-ui.system-default");
  const context = binding
      ? uiText.text("goals.policy-ui.these-rules-shared-minimum-every-goal-goal-can")
      : uiText.text("goals.policy-ui.system-default-still-use-after-save-these-rules");
  return `<details class="policy-source policy-source--project"${openByDefault ? " open" : ""}>
    <summary><span class="policy-source-title"><span class="policy-scope-index">01</span><span><small>PROJECT DEFAULT</small><strong>${scopeLabel}</strong><span>${escapeHtml(description)}</span></span></span><span class="policy-source-state"><strong>${escapeHtml(scopeState)}</strong><small>${escapeHtml(saved)}</small>${icon("chevron-down")}</span></summary>
    <form class="policy-form" data-policy-form data-live-form="policy-${escapeHtml(scope)}-${escapeHtml(contextKey)}" novalidate>
      <input type="hidden" name="scope" value="${scope}">
      <p class="policy-scope-notice">${icon("database")}<span>${escapeHtml(context)}</span></p>
      <section class="policy-form-group"><header><span>${icon("shield")}</span><div><h3>${uiText("goals.policy-ui.completion-requirement")}</h3><p>${uiText("goals.policy-ui.whether-confirm-result-before-goal-closes")}</p></div></header>
        <div class="policy-toggle-list">${renderPolicyToggle("human_approval", policy.human_approval, "goals.policy-ui.final-confirmation", "goals.policy-ui.must-confirm-work-result-before-goal-can-be")}</div>
      </section>
      <p class="form-error" data-policy-error role="alert" hidden></p>
      <p class="settings-footnote">${uiText("goals.policy-ui.old-rule-marked-replaced-history-kept")}</p><footer class="form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="reset" data-policy-cancel>${uiText("goals.policy-ui.cancel")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${uiText("goals.policy-ui.save")}${scopeLabel}</button></footer>
    </form>
  </details>`;
}

function renderPolicyEditor(
  item: GoalsPolicyItem,
  options: { editGoal?: boolean; editProject?: boolean } = { editGoal: true, editProject: false },
): string {
  const projectBinding = activePolicyBinding(item);
  const projectPolicy = mergeGoalPolicyFormValues(DEFAULT_GOAL_POLICY, projectBinding);
  const policy = item.resolved_policy;
  const requirements = item.event_document?.state.requirements ?? [];
  return `<div class="policy-workbench">
    <section class="policy-effective"><header><span class="policy-effective-icon">${icon("shield")}</span><div><h3>${uiText("goals.policy-ui.effective-rules-now")}</h3><p>${uiText("goals.policy-ui.project-rules-checked-closure-goal-s-completion-requirements")}</p></div></header><dl><div><dt>${uiText("goals.policy-ui.confirmation")}</dt><dd><strong>${policy.human_approval ? uiText("goals.policy-ui.required") : uiText("goals.policy-ui.not-required")}</strong><small>${policy.human_approval ? uiText("goals.policy-ui.have-final-confirmation") : uiText("goals.policy-ui.no-final-user-approval-required")}</small></dd></div></dl></section>
    <section class="rule-summary" data-goal-policy-requirements><h3>${uiText("goals.policy-ui.goal-s-completion-requirements")}</h3>${requirements.length ? `<ul>${requirements.map(requirement => `<li>${escapeHtml(requirement.statement)}</li>`).join("")}</ul>` : `<p>${uiText("goals.policy-ui.completion-requirements-have-not-been-defined-yet")}</p>`}${options.editGoal ? `<button type="button" class="mw-btn mw-btn--link" data-event-reader="requirements">${uiText("goals.policy-ui.view-completion-requirements")}</button>` : ""}</section>
    ${options.editProject ? renderPolicyForm(item, "project_default", projectPolicy, projectBinding) : `<p class="policy-scope-note">${icon("folder")}<span><strong>${uiText("goals.policy-ui.project-defaults-maintained-project-settings")}</strong><small>${projectBinding ? uiText("goals.policy-ui.project-baseline-set-2") : uiText("goals.policy-ui.using-system-default")}</small></span><a href="__PROJECT_RULES_SETTINGS__">${uiText("goals.policy-ui.open-project-settings")}</a></p>`}
  </div>`;
}

  function renderProgressCheckSummary(policy: GoalsPolicyItem["resolved_policy"]): string {
    return `<div class="rule-summary"><h3>${uiText("goals.policy-ui.checks-still-required-before-completion")}</h3><ul><li>${policy.human_approval ? uiText("goals.policy-ui.need-approve-final-result") : uiText("goals.policy-ui.final-approval-not-required")}</li></ul></div>`;
  }
  function renderProjectPolicyDocument(view: { project?: { project_id: string } | null; policy_bindings: GoalsPolicyBinding[] }): string {
    const projectId = view.project?.project_id;
    const projectBinding = view.policy_bindings
      .filter(binding => binding.scope === "project_default" && binding.goal_id == null && binding.state === "active").at(-1);
    const projectPolicy = mergeGoalPolicyFormValues(DEFAULT_GOAL_POLICY, projectBinding);
    const toggle = (name: string, checked: boolean, title: string, description: string) => `<label class="settings-setting-row settings-toggle-row"><span class="setting-copy"><strong>${uiText(title)}</strong><span>${uiText(description)}</span></span><span class="mw-switch" data-slot="switch"><input type="checkbox" role="switch" name="${name}"${checked ? " checked" : ""}><span class="mw-switch__track" aria-hidden="true"></span></span></label>`;
    return `<section class="settings-document project-rules-document" aria-labelledby="project-rules-title">
      <header class="settings-heading"><div class="settings-heading-title"><h1 id="project-rules-title">${uiText("goals.policy-ui.project-work-rules")}</h1>${renderHeadingHint("settings-hint-rules", uiText.text("goals.policy-ui.when-these-rules-take-effect"), uiText.text("goals.policy-ui.these-rules-checked-when-goal-closes"))}</div><p>${uiText("goals.policy-ui.set-minimum-requirements-shared-every-goal-project-individual")}</p></header>
      <div class="settings-body"><form class="settings-rules-form" data-policy-form data-project-rules-form data-live-form="policy-project_default-${escapeHtml(projectId ?? "current-project")}" novalidate>
        <aside class="project-rules-receipt" data-project-rules-receipt role="status" tabindex="-1" hidden><strong data-project-rules-receipt-title></strong><span data-project-rules-receipt-detail></span></aside>
        <p class="settings-state-note">${projectBinding ? uiText("goals.policy-ui.saved") + escapeHtml(formatDate(projectBinding.created_at)) : uiText("goals.policy-ui.using-system-defaults")}</p>
        <input type="hidden" name="scope" value="project_default">
        <section class="settings-section"><h2>${uiText("goals.policy-ui.completion-requirement")}</h2>
          ${toggle("human_approval", projectPolicy.human_approval, "goals.policy-ui.final-confirmation", "goals.policy-ui.must-confirm-work-result-before-goal-can-be")}
        </section>
        <p class="form-error" data-policy-error role="alert" hidden></p><footer class="settings-save-footer form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="reset" data-policy-cancel>${uiText("goals.policy-ui.cancel")}</button><button class="mw-btn mw-btn--primary" type="submit">${uiText("goals.policy-ui.save-project-rules")}</button></footer>
      </form></div>
    </section>`;
  }
  return { renderPolicyForm, renderPolicyEditor, renderProgressCheckSummary, renderProjectPolicyDocument };
}

export type GoalsPolicyRenderer = ReturnType<typeof createPolicyRenderer>;
export type GoalsPolicyFormArguments = Parameters<ReturnType<typeof createPolicyRenderer>["renderPolicyForm"]>;
export type GoalsPolicyEditorArguments = Parameters<ReturnType<typeof createPolicyRenderer>["renderPolicyEditor"]>;
export type GoalsPolicyCheckSummaryArguments = Parameters<ReturnType<typeof createPolicyRenderer>["renderProgressCheckSummary"]>;
export type GoalsProjectPolicyArguments = Parameters<ReturnType<typeof createPolicyRenderer>["renderProjectPolicyDocument"]>;
export type GoalsPolicyUiModel = {
  primitives: GoalsPolicyUiPrimitives;
} & ({ kind: "form"; args: GoalsPolicyFormArguments } | { kind: "editor"; args: GoalsPolicyEditorArguments } | { kind: "check-summary"; args: GoalsPolicyCheckSummaryArguments } | { kind: "project"; args: GoalsProjectPolicyArguments });

/** Which surface each renderer method mounts (W5-06): the shell builds its renderer from this, and the descriptor lists these. */
export const GOALS_POLICY_UI_SURFACES = { renderPolicyForm: "form", renderPolicyEditor: "editor", renderProgressCheckSummary: "check-summary", renderProjectPolicyDocument: "project" } as const satisfies Record<keyof GoalsPolicyRenderer, GoalsPolicyUiModel["kind"]>;
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
      case "project": return renderer.renderProjectPolicyDocument(...model.args);
      case "form": return renderer.renderPolicyForm(...model.args);
      case "editor": return renderer.renderPolicyEditor(...model.args);
      case "check-summary": return renderer.renderProgressCheckSummary(...model.args);
    }
  },
};
