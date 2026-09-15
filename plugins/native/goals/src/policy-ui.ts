import type { GoalPolicy } from "@molis-ai/molis-work-contracts/modules/goals";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { mergeGoalPolicyFormValues, type GoalsPolicyBinding, type GoalsPolicyItem, type GoalsPolicyUiPrimitives } from "./policy-ui-model.js";

export const GOALS_POLICY_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.policy.v1";

function createPolicyRenderer(primitives: GoalsPolicyUiPrimitives) {
  const { translate: L, escapeHtml, formatDate, icon, currentLocale, defaultPolicy: DEFAULT_GOAL_POLICY } = primitives;
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

const GOAL_MODE_COPY: Record<GoalPolicy["goal_mode"], { label: string; description: string }> = {
  disabled: { label: "不要求", description: "执行工具可以按普通会话工作" },
  preferred: { label: "建议使用", description: "提醒执行工具按当前 Goal 的边界工作" },
  required: { label: "必须使用", description: "未声明按 Goal 工作时不能开始" },
};

const GOAL_MODE_STRENGTH: Record<GoalPolicy["goal_mode"], number> = {
  disabled: 0,
  preferred: 1,
  required: 2,
};

function renderGoalModeChoices(
  selected: GoalPolicy["goal_mode"],
  minimum?: GoalPolicy["goal_mode"],
): string {
  return `<div class="policy-mode-options">${(
    Object.entries(GOAL_MODE_COPY) as Array<
      [GoalPolicy["goal_mode"], { label: string; description: string }]
    >
  )
    .map(
      ([value, copy]) => {
        const locked = minimum != null && GOAL_MODE_STRENGTH[value] < GOAL_MODE_STRENGTH[minimum];
        return `<label><input type="radio" name="goal_mode" value="${value}"${selected === value ? " checked" : ""}${locked ? " disabled" : ""}><span><strong>${L(copy.label)}</strong><small>${locked ? L("低于项目共同规则，不能选择") : L(copy.description)}</small></span></label>`;
      },
    )
    .join("")}</div>`;
}

function renderPolicyToggle(
  name: "self_verification" | "human_approval",
  checked: boolean,
  title: string,
  description: string,
  locked = false,
): string {
  return `<label class="policy-toggle"><input type="checkbox" name="${name}"${checked ? " checked" : ""}${locked ? " disabled" : ""}><span class="policy-switch" aria-hidden="true"></span><span class="policy-toggle-copy"><strong>${L(title)}</strong><small>${locked ? L("项目共同规则已要求，当前 Goal 不能关闭") : L(description)}</small></span></label>`;
}

function renderPolicyCounter(
  name: "cross_reviewers" | "adversarial_reviewers",
  value: number,
  title: string,
  description: string,
  minimum = 0,
): string {
  const minimumCopy = minimum > 0 ? L("项目共同规则至少要求 {count} 人", { count: minimum }) : L(description);
  return `<label class="policy-counter"><span><strong>${L(title)}</strong><small>${minimumCopy}</small></span><span class="policy-counter-input"><input name="${name}" type="number" min="${minimum}" step="1" value="${value}"${minimum > 0 ? ` data-policy-min="${minimum}"` : ""} aria-label="${L(title + "人数")}"><span>${L("人")}</span></span></label>`;
}

function policyLeaseDescription(seconds: number): string {
  if (seconds % 3600 === 0) return L("约 {hours} 小时", { hours: seconds / 3600 });
  if (seconds % 60 === 0) return L("约 {minutes} 分钟", { minutes: seconds / 60 });
  return L("到期后其他执行工具可以重新领取");
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
    : L("所有 Goal 的共同基线；修改后影响后续新的领取与 Review。");
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
  const additionalCapabilities = goalScope && minimumPolicy
    ? (binding?.policy.required_capabilities ?? []).filter((capability) => !minimumPolicy.required_capabilities.includes(capability))
    : policy.required_capabilities;
  const capabilityHelp = goalScope
    ? minimumPolicy?.required_capabilities.length
      ? L("项目已要求：{list}。这里只填写当前 Goal 额外需要的能力。", { list: minimumPolicy.required_capabilities.join("、") })
      : L("这里只填写当前 Goal 额外需要的能力；没有可以留空。")
    : L("所有能力都满足后才能开始；用逗号分隔。");
  return `<details class="policy-source policy-source--${goalScope ? "goal" : "project"}"${openByDefault ? " open" : ""}>
    <summary><span class="policy-source-title"><span class="policy-scope-index">${goalScope ? "02" : "01"}</span><span><small>${goalScope ? "GOAL OVERRIDE" : "PROJECT DEFAULT"}</small><strong>${scopeLabel}</strong><span>${escapeHtml(description)}</span></span></span><span class="policy-source-state"><strong>${escapeHtml(scopeState)}</strong><small>${escapeHtml(saved)}</small>${icon("chevron-down")}</span></summary>
    <form class="policy-form" data-policy-form data-live-form="policy-${escapeHtml(scope)}-${escapeHtml(contextKey)}" novalidate>
      <input type="hidden" name="scope" value="${scope}">
      ${goalScope ? `<input type="hidden" name="goal_id" value="${escapeHtml(goalId)}">` : ""}
      <p class="policy-scope-notice">${icon(goalScope ? "target" : "database")}<span>${escapeHtml(context)}</span></p>
      ${binding ? `<p class="policy-current-reason"><strong>${L("上次修改原因")}</strong><span>${escapeHtml(binding.reason)}</span></p>` : ""}
      <section class="policy-form-group"><header><span>${icon("shield")}</span><div><h3>${L("开始与完成要求")}</h3><p>${L("先设置最常用的三项：如何按 Goal 工作、是否自检、是否需要你最终确认。")}</p></div></header>
        <fieldset class="policy-control"><legend>${L("执行工具是否必须按 Goal 工作")}</legend><p>${L("按 Goal 工作时，执行工具会遵守当前目标、边界和完成标准。")}</p>${renderGoalModeChoices(policy.goal_mode, minimumPolicy?.goal_mode)}</fieldset>
        <div class="policy-toggle-list">${renderPolicyToggle("self_verification", policy.self_verification, "执行者自我验证", "执行者提交结果前先验证自己的完成依据", Boolean(minimumPolicy?.self_verification))}${renderPolicyToggle("human_approval", policy.human_approval, "用户最终确认", "完成前必须由用户确认工作结果", Boolean(minimumPolicy?.human_approval))}</div>
      </section>
      <details class="factor-advanced policy-advanced" data-progressive-fields><summary><span><strong>${L("高级执行与检查规则")}</strong><small>${L("只有需要指定能力、领取时长或额外检查人数时才修改")}</small></span>${icon("chevron-down")}</summary><div class="factor-advanced-grid">
        <label class="policy-input"><span><strong>${L("执行工具需要的能力")}</strong><small>${capabilityHelp}</small></span><input name="required_capabilities" value="${escapeHtml(additionalCapabilities.join(", "))}" placeholder="${L("例如：浏览器操作、图像处理、数据分析")}"></label>
        <label class="policy-input"><span><strong>${L("一次领取最长多久")}</strong><small>${minimumPolicy ? L("项目最长允许 {seconds} 秒；当前 Goal 只能缩短", { seconds: minimumPolicy.max_lease_seconds }) : escapeHtml(policyLeaseDescription(policy.max_lease_seconds))}</small></span><span class="policy-with-unit"><input name="max_lease_seconds" type="number" min="1"${minimumPolicy ? ` max="${minimumPolicy.max_lease_seconds}" data-policy-max="${minimumPolicy.max_lease_seconds}"` : ""} step="1" value="${policy.max_lease_seconds}"><span>${L("秒")}</span></span></label>
        <div class="policy-review-counts policy-form-wide">${renderPolicyCounter("cross_reviewers", policy.cross_reviewers, "独立复核", "由其他执行者检查结果与依据", minimumPolicy?.cross_reviewers ?? 0)}${renderPolicyCounter("adversarial_reviewers", policy.adversarial_reviewers, "反例检查", "主动寻找遗漏、反例和错误假设", minimumPolicy?.adversarial_reviewers ?? 0)}</div>
      </div></details>
      <section class="policy-form-group policy-form-group--reason"><header><span>${icon("history")}</span><div><h3>${L("变更说明")}</h3><p>${L("工作规则会进入完整记录，请说明为什么现在需要调整。")}</p></div></header><label class="policy-reason"><span>${L("修改原因")}</span><textarea name="reason" rows="2" required placeholder="${L("例如：这个 Goal 涉及用户数据，需要独立检查和最终确认")}"></textarea></label></section>
      <p class="form-error" data-policy-error role="alert" hidden></p>
      <footer><span>${goalScope ? L("保存后会与项目默认合并，并立即成为这条 Goal 的领取门槛。") : L("旧规则会标记为已替换，历史仍保留。")}</span><button class="button-primary" type="submit">${L("保存")}${scopeLabel}</button></footer>
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
  const mode = GOAL_MODE_COPY[policy.goal_mode];
  return `<div class="policy-workbench">
    <section class="policy-effective"><header><span class="policy-effective-icon">${icon("shield")}</span><div><h3>${L("当前最终生效规则")}</h3><p>${L("项目默认和当前 Goal 的额外要求已经合并，实际会按下面的结果执行。")}</p></div></header><dl><div><dt>${L("按 Goal 工作")}</dt><dd><strong>${escapeHtml(L(mode.label))}</strong><small>${escapeHtml(L(mode.description))}</small></dd></div><div><dt>${L("执行者自检")}</dt><dd><strong>${policy.self_verification ? L("需要") : L("不需要")}</strong><small>${policy.self_verification ? L("提交前必须验证") : L("不设自检门槛")}</small></dd></div><div><dt>${L("独立检查")}</dt><dd><strong>${policy.cross_reviewers + policy.adversarial_reviewers} ${L("人")}</strong><small>${L("独立复核")} ${policy.cross_reviewers} · ${L("反例检查")} ${policy.adversarial_reviewers}</small></dd></div><div><dt>${L("用户确认")}</dt><dd><strong>${policy.human_approval ? L("需要") : L("不需要")}</strong><small>${policy.human_approval ? L("用户拥有最终确认权") : L("无需用户最终确认")}</small></dd></div><div><dt>${L("一次领取最长")}</dt><dd><strong>${policy.max_lease_seconds} ${L("秒")}</strong><small>${escapeHtml(policyLeaseDescription(policy.max_lease_seconds))}</small></dd></div><div><dt>${L("需要的能力")}</dt><dd><strong>${escapeHtml(policy.required_capabilities.join(currentLocale() === "en" ? ", " : "、") || L("无"))}</strong><small>${policy.required_capabilities.length ? L("执行工具必须全部声明") : L("不限制能力标签")}</small></dd></div></dl></section>
    <div class="policy-inheritance" aria-label="${L("工作规则继承关系")}"><span><small>${L("01 · 项目默认")}</small><strong>${projectBinding ? L("项目基线已设置") : L("使用系统默认")}</strong></span>${icon("arrow")}<span><small>${L("02 · 当前 Goal")}</small><strong>${goalBinding ? L("已增加单独规则") : L("完全继承项目")}</strong></span>${icon("arrow")}<span><small>${L("结果")}</small><strong>${L("最终生效门槛")}</strong></span></div>
    ${options.editProject ? renderPolicyForm(item, "project_default", projectPolicy, projectBinding) : `<p class="policy-scope-note">${icon("folder")}<span><strong>${L("项目默认规则在项目设置中维护")}</strong><small>${L("这里显示合并后的结果；当前 Goal 只能增加自己的要求。")}</small></span><a href="__PROJECT_RULES_SETTINGS__">${L("打开项目设置")}</a></p>`}
    ${options.editGoal ? renderPolicyForm(item, "goal", goalPolicy, goalBinding, item.goal.goal_id, Boolean(goalBinding), projectPolicy) : ""}
  </div>`;
}

  function renderProgressCheckSummary(policy: GoalsPolicyItem["resolved_policy"]): string {
    const independentReviews = policy.cross_reviewers + policy.adversarial_reviewers;
    return `<div class="rule-summary"><h3>${L("完成前还需要哪些检查")}</h3><ul><li>${policy.self_verification ? L("推进者需要先检查自己的结果。") : L("不要求推进者额外自检。")}</li><li>${independentReviews ? L("还需要 {count} 次独立检查。", { count: independentReviews }) : L("不要求额外的独立检查。")}</li><li>${policy.human_approval ? L("最后需要你确认结果。") : L("不需要你的最终确认。")}</li></ul></div>`;
  }
  function renderProjectPolicyDocument(view: { project?: { project_id: string } | null; policy_bindings: GoalsPolicyBinding[] }): string {
    const projectId = view.project?.project_id;
    const projectBinding = view.policy_bindings
      .filter(binding => binding.scope === "project_default" && binding.goal_id == null && binding.state === "active").at(-1);
    const projectPolicy = mergeGoalPolicyFormValues(DEFAULT_GOAL_POLICY, projectBinding);
    return `<section class="settings-document" aria-labelledby="project-rules-title">
      <header class="settings-heading"><h1 id="project-rules-title">${L("项目工作规则")}</h1><p>${L("设置这个项目里所有 Goal 共同遵守的最低要求。单个 Goal 可以增加要求，但不能降低这里的规则。")}</p></header>
      <div class="settings-body"><aside class="project-rules-receipt" data-project-rules-receipt role="status" tabindex="-1" hidden><strong data-project-rules-receipt-title></strong><span data-project-rules-receipt-detail></span></aside>
      <section class="project-rules-intro" aria-labelledby="project-rules-how-title"><h2 id="project-rules-how-title">${L("这些规则什么时候生效")}</h2><p>${L("它们只约束之后开始或重新领取的工作，不会改写 Goal 内容，也不会自动启动任何执行工具。")}</p><ol><li><span>1</span><span><strong>${L("项目先定共同底线")}</strong><small>${L("例如必须自检，或完成前需要你确认")}</small></span></li><li><span>2</span><span><strong>${L("Goal 可以增加要求")}</strong><small>${L("涉及特殊风险时，可再要求额外检查")}</small></span></li><li><span>3</span><span><strong>${L("合并后执行")}</strong><small>${L("最终按两边更严格的要求工作")}</small></span></li></ol></section>
      ${renderPolicyForm(null, "project_default", projectPolicy, projectBinding, projectId ?? "current-project", true)}
      <p class="settings-footnote">${L("每次保存都会替换当前项目默认规则，但旧版本和修改原因会继续保留在事件记录中。")}</p></div>
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
