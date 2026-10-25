import type { GoalPolicy } from "@molis-ai/molis-work-contracts/modules/goals";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { mergeGoalPolicyFormValues, type GoalsPolicyBinding, type GoalsPolicyItem, type GoalsPolicyUiPrimitives } from "./policy-ui-model.js";

export const GOALS_POLICY_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.policy.v1";

function createPolicyRenderer(primitives: GoalsPolicyUiPrimitives) {
  const { translate: L, escapeHtml, formatDate, icon, defaultPolicy: DEFAULT_GOAL_POLICY } = primitives;

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
  return `<label class="policy-toggle"><input type="checkbox" name="${name}"${checked ? " checked" : ""}><span class="policy-switch" aria-hidden="true"></span><span class="policy-toggle-copy"><strong>${L(title)}</strong><small>${L(description)}</small></span></label>`;
}

function renderPolicyForm(
  item: GoalsPolicyItem | null,
  scope: "project_default",
  policy: GoalPolicy,
  binding: GoalsPolicyBinding | undefined,
  contextKey = item?.goal.goal_id ?? "project",
  openByDefault = false,
): string {
  const scopeLabel = L("项目默认规则");
  const description = L("所有 Goal 的共同基线；修改后影响之后的收尾。");
  const saved = binding
    ? `${L("已保存 · ")}${formatDate(binding.created_at)} · ${binding.created_by}`
    : L("尚未单独设置，当前使用系统默认");
  const scopeState = binding ? L("已设置项目基线") : L("系统默认");
  const context = binding
      ? L("这组规则是所有 Goal 的共同最低门槛；当前 Goal 只能在它之上增加要求。")
      : L("当前仍使用系统默认。保存后，这组规则会成为整个项目的共同最低门槛。");
  return `<details class="policy-source policy-source--project"${openByDefault ? " open" : ""}>
    <summary><span class="policy-source-title"><span class="policy-scope-index">01</span><span><small>PROJECT DEFAULT</small><strong>${scopeLabel}</strong><span>${escapeHtml(description)}</span></span></span><span class="policy-source-state"><strong>${escapeHtml(scopeState)}</strong><small>${escapeHtml(saved)}</small>${icon("chevron-down")}</span></summary>
    <form class="policy-form" data-policy-form data-live-form="policy-${escapeHtml(scope)}-${escapeHtml(contextKey)}" novalidate>
      <input type="hidden" name="scope" value="${scope}">
      <p class="policy-scope-notice">${icon("database")}<span>${escapeHtml(context)}</span></p>
      <section class="policy-form-group"><header><span>${icon("shield")}</span><div><h3>${L("完成要求")}</h3><p>${L("收尾时是否需要你确认结果。")}</p></div></header>
        <div class="policy-toggle-list">${renderPolicyToggle("human_approval", policy.human_approval, "用户最终确认", "完成前必须由用户确认工作结果")}</div>
      </section>
      <p class="form-error" data-policy-error role="alert" hidden></p>
      <p class="settings-footnote">${L("旧规则会标记为已替换，历史仍保留。")}</p><footer class="mw-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="reset" data-policy-cancel>${L("取消")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${L("保存")}${scopeLabel}</button></footer>
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
    <section class="policy-effective"><header><span class="policy-effective-icon">${icon("shield")}</span><div><h3>${L("当前最终生效规则")}</h3><p>${L("项目规则在收尾时检查；本 Goal 的完成要求由事件记录维护。")}</p></div></header><dl><div><dt>${L("用户确认")}</dt><dd><strong>${policy.human_approval ? L("需要") : L("不需要")}</strong><small>${policy.human_approval ? L("用户拥有最终确认权") : L("无需用户最终确认")}</small></dd></div></dl></section>
    <section class="rule-summary" data-goal-policy-requirements><h3>${L("当前 Goal 完成要求")}</h3>${requirements.length ? `<ul>${requirements.map(requirement => `<li>${escapeHtml(requirement.statement)}</li>`).join("")}</ul>` : `<p>${L("还没有明确完成要求。")}</p>`}${options.editGoal ? `<button type="button" class="mw-btn mw-btn--link" data-event-reader="requirements">${L("查看完成要求")}</button>` : ""}</section>
    ${options.editProject ? renderPolicyForm(item, "project_default", projectPolicy, projectBinding) : `<p class="policy-scope-note">${icon("folder")}<span><strong>${L("项目默认规则在项目设置中维护")}</strong><small>${projectBinding ? L("项目基线已设置") : L("使用系统默认")}</small></span><a href="__PROJECT_RULES_SETTINGS__">${L("打开项目设置")}</a></p>`}
  </div>`;
}

  function renderProgressCheckSummary(policy: GoalsPolicyItem["resolved_policy"]): string {
    return `<div class="rule-summary"><h3>${L("完成前还需要哪些检查")}</h3><ul><li>${policy.human_approval ? L("最后需要你确认结果。") : L("不需要你的最终确认。")}</li></ul></div>`;
  }
  function renderProjectPolicyDocument(view: { project?: { project_id: string } | null; policy_bindings: GoalsPolicyBinding[] }): string {
    const projectId = view.project?.project_id;
    const projectBinding = view.policy_bindings
      .filter(binding => binding.scope === "project_default" && binding.goal_id == null && binding.state === "active").at(-1);
    const projectPolicy = mergeGoalPolicyFormValues(DEFAULT_GOAL_POLICY, projectBinding);
    const toggle = (name: string, checked: boolean, title: string, description: string) => `<label class="settings-setting-row settings-toggle-row"><span class="setting-copy"><strong>${L(title)}</strong><span>${L(description)}</span></span><span class="mw-switch" data-slot="switch"><input type="checkbox" role="switch" name="${name}"${checked ? " checked" : ""}><span class="mw-switch__track" aria-hidden="true"></span></span></label>`;
    return `<section class="settings-document project-rules-document" aria-labelledby="project-rules-title">
      <header class="settings-heading"><div class="settings-heading-title"><h1 id="project-rules-title">${L("项目工作规则")}</h1>${renderHeadingHint("settings-hint-rules", L("这些规则什么时候生效"), L("这些规则在 Goal 收尾时检查。"))}</div><p>${L("设置这个项目里所有 Goal 共同遵守的最低要求。单个 Goal 可以增加要求，但不能降低这里的规则。")}</p></header>
      <div class="settings-body"><form class="settings-rules-form" data-policy-form data-project-rules-form data-live-form="policy-project_default-${escapeHtml(projectId ?? "current-project")}" novalidate>
        <aside class="project-rules-receipt" data-project-rules-receipt role="status" tabindex="-1" hidden><strong data-project-rules-receipt-title></strong><span data-project-rules-receipt-detail></span></aside>
        <p class="settings-state-note">${projectBinding ? L("已保存 · ") + escapeHtml(formatDate(projectBinding.created_at)) : L("当前使用系统默认")}</p>
        <input type="hidden" name="scope" value="project_default">
        <section class="settings-section"><h2>${L("完成要求")}</h2>
          ${toggle("human_approval", projectPolicy.human_approval, "用户最终确认", "完成前必须由用户确认工作结果")}
        </section>
        <p class="form-error" data-policy-error role="alert" hidden></p><footer class="settings-save-footer mw-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="reset" data-policy-cancel>${L("取消")}</button><button class="mw-btn mw-btn--primary" type="submit">${L("保存项目默认规则")}</button></footer>
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
