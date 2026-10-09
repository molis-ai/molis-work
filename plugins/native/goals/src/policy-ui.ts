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
  scope: "project_default" | "goal",
): GoalsPolicyBinding | undefined {
  return item.policy_bindings
    .filter(
      (binding) =>
        binding.state === "active" &&
        binding.scope === scope &&
        (scope === "project_default"
          ? binding.goal_id == null
          : binding.goal_id === item.goal.goal_id),
    )
    .at(-1);
}

function renderPolicyToggle(
  name: "human_approval",
  checked: boolean,
  title: string,
  description: string,
  locked = false,
): string {
  return `<label class="policy-toggle"><input type="checkbox" name="${name}"${checked ? " checked" : ""}${locked ? " disabled" : ""}><span class="policy-switch" aria-hidden="true"></span><span class="policy-toggle-copy"><strong>${L(title)}</strong><small>${locked ? L("项目共同规则已要求，当前 Goal 不能关闭") : L(description)}</small></span></label>`;
}

function renderPolicyForm(
  item: GoalsPolicyItem | null,
  scope: "project_default" | "goal",
  policy: GoalPolicy,
  binding: GoalsPolicyBinding | undefined,
  contextKey = item?.goal.goal_id ?? "project",
  openByDefault = scope === "goal",
  minimumPolicy?: GoalPolicy,
): string {
  const goalScope = scope === "goal";
  if (goalScope && !item) throw new Error("Goal 规则表单必须绑定 Goal");
  const goalId = item?.goal.goal_id ?? "";
  const scopeLabel = goalScope
    ? binding
      ? L("当前 Goal 额外规则")
      : L("为当前 Goal 增加要求")
    : L("项目默认规则");
  const description = goalScope
    ? binding
      ? L("只作用于当前 Goal；可以继续增加要求，但不能削弱项目共同规则。")
      : L("当前完全沿用项目规则；只有需要更严格时才在这里增加要求。")
    : L("所有 Goal 的共同基线；修改后影响之后的收尾。");
  const saved = binding
    ? `${L("已保存 · ")}${formatDate(binding.created_at)} · ${binding.created_by}`
    : goalScope
      ? L("尚未单独设置，当前沿用项目默认")
      : L("尚未单独设置，当前使用系统默认");
  const scopeState = binding ? (goalScope ? L("已设置 Goal 规则") : L("已设置项目基线")) : (goalScope ? L("完全继承") : L("系统默认"));
  const context = goalScope
    ? binding
      ? L("下面是当前 Goal 保存的完整规则。项目默认仍是最低门槛，不能被这里削弱。")
      : L("字段先展示继承后的当前值；只有修改并保存，才会建立这条 Goal 的单独规则。")
    : binding
      ? L("这组规则是所有 Goal 的共同最低门槛；当前 Goal 只能在它之上增加要求。")
      : L("当前仍使用系统默认。保存后，这组规则会成为整个项目的共同最低门槛。");
  return `<details class="policy-source policy-source--${goalScope ? "goal" : "project"}"${openByDefault ? " open" : ""}>
    <summary><span class="policy-source-title"><span class="policy-scope-index">${goalScope ? "02" : "01"}</span><span><small>${goalScope ? "GOAL OVERRIDE" : "PROJECT DEFAULT"}</small><strong>${scopeLabel}</strong><span>${escapeHtml(description)}</span></span></span><span class="policy-source-state"><strong>${escapeHtml(scopeState)}</strong><small>${escapeHtml(saved)}</small>${icon("chevron-down")}</span></summary>
    <form class="policy-form" data-policy-form data-live-form="policy-${escapeHtml(scope)}-${escapeHtml(contextKey)}" novalidate>
      <input type="hidden" name="scope" value="${scope}">
      ${goalScope ? `<input type="hidden" name="goal_id" value="${escapeHtml(goalId)}">` : ""}
      <p class="policy-scope-notice">${icon(goalScope ? "target" : "database")}<span>${escapeHtml(context)}</span></p>
      ${goalScope && binding ? `<p class="policy-current-reason"><strong>${L("上次修改原因")}</strong><span>${escapeHtml(binding.reason)}</span></p>` : ""}
      <section class="policy-form-group"><header><span>${icon("shield")}</span><div><h3>${L("完成要求")}</h3><p>${L("收尾时是否需要你确认结果。")}</p></div></header>
        <div class="policy-toggle-list">${renderPolicyToggle("human_approval", policy.human_approval, "用户最终确认", "完成前必须由用户确认工作结果", Boolean(minimumPolicy?.human_approval))}</div>
      </section>
      ${goalScope ? `<section class="policy-form-group policy-form-group--reason"><header><span>${icon("history")}</span><div><h3>${L("变更说明")}</h3><p>${L("工作规则会进入完整记录，请说明为什么现在需要调整。")}</p></div></header><label class="policy-reason"><span>${L("修改原因")}</span><textarea name="reason" rows="2" required placeholder="${L("例如：这个 Goal 涉及用户数据，需要独立检查和最终确认")}"></textarea></label></section>` : ""}
      <p class="form-error" data-policy-error role="alert" hidden></p>
      <p class="settings-footnote">${goalScope ? L("保存后会与项目默认合并，在这条 Goal 收尾时检查。") : L("旧规则会标记为已替换，历史仍保留。")}</p><footer class="form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="reset" data-policy-cancel>${L("取消")}</button><button class="mw-btn mw-btn--primary mw-btn--lg" type="submit">${L("保存")}${scopeLabel}</button></footer>
    </form>
  </details>`;
}

function renderPolicyEditor(
  item: GoalsPolicyItem,
  options: { editGoal?: boolean; editProject?: boolean } = { editGoal: true, editProject: false },
): string {
  const projectBinding = activePolicyBinding(item, "project_default");
  const goalBinding = activePolicyBinding(item, "goal");
  const projectPolicy = mergeGoalPolicyFormValues(DEFAULT_GOAL_POLICY, projectBinding);
  const goalPolicy = mergeGoalPolicyFormValues(projectPolicy, goalBinding);
  const policy = item.resolved_policy;
  return `<div class="policy-workbench">
    <section class="policy-effective"><header><span class="policy-effective-icon">${icon("shield")}</span><div><h3>${L("当前最终生效规则")}</h3><p>${L("项目默认和当前 Goal 的额外要求已经合并，实际会按下面的结果执行。")}</p></div></header><dl><div><dt>${L("用户确认")}</dt><dd><strong>${policy.human_approval ? L("需要") : L("不需要")}</strong><small>${policy.human_approval ? L("用户拥有最终确认权") : L("无需用户最终确认")}</small></dd></div></dl></section>
    <div class="policy-inheritance" aria-label="${L("工作规则继承关系")}"><span><small>${L("01 · 项目默认")}</small><strong>${projectBinding ? L("项目基线已设置") : L("使用系统默认")}</strong></span>${icon("arrow")}<span><small>${L("02 · 当前 Goal")}</small><strong>${goalBinding ? L("已增加单独规则") : L("完全继承项目")}</strong></span>${icon("arrow")}<span><small>${L("结果")}</small><strong>${L("最终生效门槛")}</strong></span></div>
    ${options.editProject ? renderPolicyForm(item, "project_default", projectPolicy, projectBinding) : `<p class="policy-scope-note">${icon("folder")}<span><strong>${L("项目默认规则在项目设置中维护")}</strong><small>${L("这里显示合并后的结果；当前 Goal 只能增加自己的要求。")}</small></span><a href="__PROJECT_RULES_SETTINGS__">${L("打开项目设置")}</a></p>`}
    ${options.editGoal ? renderPolicyForm(item, "goal", goalPolicy, goalBinding, item.goal.goal_id, Boolean(goalBinding), projectPolicy) : ""}
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
        <p class="form-error" data-policy-error role="alert" hidden></p><footer class="settings-save-footer form-actions mw-form__footer"><button class="mw-btn mw-btn--secondary" type="reset" data-policy-cancel>${L("取消")}</button><button class="mw-btn mw-btn--primary" type="submit">${L("保存项目默认规则")}</button></footer>
      </form></div>
    </section>`;
  }
  return { renderPolicyForm, renderPolicyEditor, renderProgressCheckSummary, renderProjectPolicyDocument };
}

export type GoalsPolicyFormArguments = Parameters<ReturnType<typeof createPolicyRenderer>["renderPolicyForm"]>;
export type GoalsPolicyEditorArguments = Parameters<ReturnType<typeof createPolicyRenderer>["renderPolicyEditor"]>;
export type GoalsPolicyCheckSummaryArguments = Parameters<ReturnType<typeof createPolicyRenderer>["renderProgressCheckSummary"]>;
export type GoalsProjectPolicyArguments = Parameters<ReturnType<typeof createPolicyRenderer>["renderProjectPolicyDocument"]>;
export type GoalsPolicyUiModel = {
  primitives: GoalsPolicyUiPrimitives;
} & ({ kind: "form"; args: GoalsPolicyFormArguments } | { kind: "editor"; args: GoalsPolicyEditorArguments } | { kind: "check-summary"; args: GoalsPolicyCheckSummaryArguments } | { kind: "project"; args: GoalsProjectPolicyArguments });

export const goalsPolicyUiContribution: UiContribution<GoalsPolicyUiModel> = {
  descriptor: {
    contribution_id: GOALS_POLICY_UI_CONTRIBUTION_ID,
    plugin_id: "io.molis.work.native.goals",
    kind: "embedded",
    label: "Goal work rules",
    surfaces: ["form", "editor", "check-summary", "project"].map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })),
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
