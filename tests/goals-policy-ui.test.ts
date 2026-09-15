import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchGoalsPolicyRenderer, createWorkbenchUiHost, type GoalsPolicyItem } from "@molis-ai/molis-work-app-workbench";
import { GOALS_POLICY_UI_CONTRIBUTION_ID } from "@molis-ai/molis-work-plugin-goals";
import { icon } from "@molis-ai/molis-work-design-system";
import { L, currentLocale, runWithLocale } from "@molis-ai/molis-work-app-local-host";

const base = { goal_mode: "required" as const, required_capabilities: ["browser"], self_verification: true,
  cross_reviewers: 2, adversarial_reviewers: 1, human_approval: true, max_lease_seconds: 600 };
const escapeHtml = (value: unknown) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const renderer = createWorkbenchGoalsPolicyRenderer({ translate: L, currentLocale, icon, escapeHtml,
  formatDate: value => value ?? "", defaultPolicy: base });
const item: GoalsPolicyItem = {
  goal: { goal_id: 'goal-"<unsafe>' },
  policy_bindings: [{ policy_binding_id: "policy-project", goal_id: null, scope: "project_default", policy: base,
    state: "active", created_by: "user", reason: "Minimum baseline", created_at: "2026-09-05" }],
  resolved_policy: { ...base, required_capabilities: ["browser", "image"], cross_reviewers: 3, max_lease_seconds: 300 },
};

test("Workbench mounts Goals policy UI with inherited locked controls and the authoritative effective policy", () => {
  const host = createWorkbenchUiHost();
  assert.ok(host.list().some(entry => entry.contribution_id === GOALS_POLICY_UI_CONTRIBUTION_ID));
  const html = renderer.renderPolicyEditor(item);
  assert.match(html, /name="goal_id" value="goal-&quot;&lt;unsafe&gt;"/);
  assert.match(html, /name="goal_mode" value="disabled" disabled/);
  assert.match(html, /name="self_verification" checked disabled/);
  assert.match(html, /name="human_approval" checked disabled/);
  assert.match(html, /name="cross_reviewers" type="number" min="2"/);
  assert.match(html, /name="max_lease_seconds" type="number" min="1" max="600" data-policy-max="600"/);
  assert.match(html, /<strong>300 秒<\/strong>/);
  assert.match(html, /browser、image/);
  assert.doesNotMatch(html, /data-live-form="policy-project_default-/);
  assert.deepEqual(base.required_capabilities, ["browser"]);
});

test("progress checks describe the resolved policy, including mixed independent and human requirements, without writing it", () => {
  const policies = [
    { policy: base, phrases: ["推进者需要先检查自己的结果。", "还需要 3 次独立检查。", "最后需要你确认结果。"] },
    { policy: { ...base, self_verification: false, cross_reviewers: 0, adversarial_reviewers: 0, human_approval: false },
      phrases: ["不要求推进者额外自检。", "不要求额外的独立检查。", "不需要你的最终确认。"] },
    { policy: { ...base, self_verification: false, cross_reviewers: 0, adversarial_reviewers: 2 },
      phrases: ["不要求推进者额外自检。", "还需要 2 次独立检查。", "最后需要你确认结果。"] },
  ];
  for (const { policy, phrases } of policies) {
    const before = structuredClone(policy), html = renderer.renderProgressCheckSummary(policy);
    for (const phrase of phrases) assert.ok(html.includes(phrase));
    assert.doesNotMatch(html, /<form|<input|type="submit"/);
    assert.deepEqual(policy, before);
  }
  const english = runWithLocale("en", () => renderer.renderProgressCheckSummary(base));
  assert.match(english, /3 independent check\(s\) are still required/);
});

test("archived/read-only policy presentation has no writable forms and locale remains request-local", () => {
  const readOnly = runWithLocale("en", () => renderer.renderPolicyEditor(item, { editGoal: false, editProject: false }));
  assert.match(readOnly, /Effective rules now/);
  assert.match(readOnly, /browser, image/);
  assert.doesNotMatch(readOnly, /data-policy-form|<input|<textarea/);
  const chinese = runWithLocale("zh", () => renderer.renderPolicyEditor(item));
  assert.match(chinese, /当前最终生效规则/);
  assert.doesNotMatch(chinese, /Effective rules now/);
});

test("project policy form preserves scope and save fields, and refuses an unbound Goal form", () => {
  const html = renderer.renderPolicyForm(null, "project_default", base, undefined, "project-one", true);
  assert.match(html, /name="scope" value="project_default"/);
  assert.match(html, /data-live-form="policy-project_default-project-one"/);
  assert.match(html, /name="reason" rows="2" required/);
  assert.match(html, /name="required_capabilities" value="browser"/);
  assert.doesNotMatch(html, /name="goal_id"/);
  assert.throws(() => renderer.renderPolicyForm(null, "goal", base, undefined), /必须绑定 Goal/);
});

test("project policy document selects the last active project binding, preserves explanations and uses default values when absent", () => {
  const active = item.policy_bindings[0]!;
  const recent = { ...active, policy_binding_id: "recent", policy: { cross_reviewers: 4 }, reason: 'Latest "<safe>' };
  const view = { project: { project_id: 'project-"<safe>' }, policy_bindings: [active, recent,
    { ...active, state: "inactive", policy: { cross_reviewers: 8 } },
    { ...active, scope: "goal", goal_id: "other", policy: { cross_reviewers: 9 } }] };
  const before = structuredClone(view);
  const html = renderer.renderProjectPolicyDocument(view);
  assert.match(html, /id="project-rules-title">项目工作规则/);
  assert.match(html, /data-project-rules-receipt role="status" tabindex="-1" hidden/);
  assert.match(html, /这些规则什么时候生效/);
  assert.match(html, /不会改写 Goal 内容，也不会自动启动任何执行工具/);
  assert.match(html, /name="cross_reviewers"[^>]*value="4"/);
  assert.match(html, /name="max_lease_seconds"[^>]*value="600"/);
  assert.match(html, /Latest &quot;&lt;safe&gt;/);
  assert.match(html, /data-live-form="policy-project_default-project-&quot;&lt;safe&gt;"/);
  assert.equal(html.split("data-policy-form").length - 1, 1);
  assert.deepEqual(view, before);
  const defaults = renderer.renderProjectPolicyDocument({ project: null, policy_bindings: [] });
  assert.match(defaults, /name="cross_reviewers"[^>]*value="2"/);
  assert.match(defaults, /policy-project_default-current-project/);
  const english = runWithLocale("en", () => renderer.renderProjectPolicyDocument(view));
  assert.match(english, /Project work rules/);
  assert.match(english, /When these rules take effect/);
});
