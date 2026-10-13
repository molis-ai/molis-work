import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchGoalsPolicyRenderer, createWorkbenchUiHost, type GoalsPolicyItem } from "@molis-ai/molis-work-app-workbench";
import { GOALS_POLICY_UI_CONTRIBUTION_ID } from "@molis-ai/molis-work-plugin-goals";
import { icon } from "@molis-ai/molis-work-design-system";
import { L, currentLocale, runWithLocale } from "@molis-ai/molis-work-app-local-host";

const base = { human_approval: true };
const escapeHtml = (value: unknown) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const renderer = createWorkbenchGoalsPolicyRenderer({ translate: L, currentLocale, icon, escapeHtml,
  formatDate: value => value ?? "", defaultPolicy: base });
const item: GoalsPolicyItem = {
  goal: { goal_id: 'goal-"<unsafe>' },
  policy_bindings: [{ policy_binding_id: "policy-project", goal_id: null, scope: "project_default", policy: base,
    state: "active", created_by: "user", reason: "Minimum baseline", created_at: "2026-09-05" }],
  resolved_policy: base,
};

test("Workbench mounts Goals policy UI with inherited locked controls and the authoritative effective policy", () => {
  const host = createWorkbenchUiHost();
  assert.ok(host.list().some(entry => entry.contribution_id === GOALS_POLICY_UI_CONTRIBUTION_ID));
  const html = renderer.renderPolicyEditor(item);
  assert.match(html, /name="goal_id" value="goal-&quot;&lt;unsafe&gt;"/);
  assert.match(html, /name="human_approval" checked disabled/, "the project requires it, so this Goal cannot turn it off");
  assert.match(html, /<dt>用户确认<\/dt><dd><strong>需要<\/strong>/);
  assert.doesNotMatch(html, /data-live-form="policy-project_default-/);
});

test("progress checks describe the resolved policy without writing it", () => {
  for (const { policy, phrase } of [{ policy: base, phrase: "最后需要你确认结果。" }, { policy: { human_approval: false }, phrase: "不需要你的最终确认。" }]) {
    const before = structuredClone(policy), html = renderer.renderProgressCheckSummary(policy);
    assert.ok(html.includes(phrase));
    assert.doesNotMatch(html, /<form|<input|type="submit"/);
    assert.deepEqual(policy, before);
  }
  const english = runWithLocale("en", () => renderer.renderProgressCheckSummary(base));
  assert.match(english, /You need to approve the final result/);
});

test("archived/read-only policy presentation has no writable forms and locale remains request-local", () => {
  const readOnly = runWithLocale("en", () => renderer.renderPolicyEditor(item, { editGoal: false, editProject: false }));
  assert.match(readOnly, /Effective rules now/);
  assert.match(readOnly, /You have the final confirmation/);
  assert.doesNotMatch(readOnly, /data-policy-form|<input|<textarea/);
  const chinese = runWithLocale("zh", () => renderer.renderPolicyEditor(item));
  assert.match(chinese, /当前最终生效规则/);
  assert.doesNotMatch(chinese, /Effective rules now/);
});

test("project policy form preserves scope and save fields, and refuses an unbound Goal form", () => {
  const html = renderer.renderPolicyForm(null, "project_default", base, undefined, "project-one", true);
  assert.match(html, /name="scope" value="project_default"/);
  assert.match(html, /data-live-form="policy-project_default-project-one"/);
  assert.doesNotMatch(html, /name="reason"/);
  assert.match(html, /name="human_approval" checked>/);
  assert.doesNotMatch(html, /name="goal_id"/);
  assert.throws(() => renderer.renderPolicyForm(null, "goal", base, undefined), /必须绑定 Goal/);
});

test("project policy document selects the last active project binding and uses default values when absent", () => {
  const active = item.policy_bindings[0]!;
  const recent = { ...active, policy_binding_id: "recent", policy: { human_approval: false }, reason: 'Latest "<safe>' };
  const view = { project: { project_id: 'project-"<safe>' }, policy_bindings: [active, recent,
    { ...active, state: "inactive", policy: { human_approval: true } },
    { ...active, scope: "goal", goal_id: "other", policy: { human_approval: true } }] };
  const before = structuredClone(view);
  const html = renderer.renderProjectPolicyDocument(view);
  assert.match(html, /id="project-rules-title">项目工作规则/);
  assert.match(html, /data-project-rules-receipt role="status" tabindex="-1" hidden/);
  assert.match(html, /class="mw-hint"/);
  assert.match(html, /<section class="settings-section"><h2>完成要求<\/h2>/);
  assert.doesNotMatch(html, /data-rules-advanced|<details/);
  assert.match(html, /settings-save-footer/);
  assert.doesNotMatch(html, /name="reason"|修改原因/);
  assert.match(html, /class="mw-switch"/);
  assert.match(html, /name="human_approval">/, "the last active project binding turned it off");
  assert.doesNotMatch(html, /Latest &quot;&lt;safe&gt;/);
  assert.match(html, /data-live-form="policy-project_default-project-&quot;&lt;safe&gt;"/);
  assert.equal(html.split("data-policy-form").length - 1, 1);
  assert.deepEqual(view, before);
  const defaults = renderer.renderProjectPolicyDocument({ project: null, policy_bindings: [] });
  assert.match(defaults, /name="human_approval" checked>/, "with no binding the system default applies");
  assert.match(defaults, /policy-project_default-current-project/);
  const english = runWithLocale("en", () => renderer.renderProjectPolicyDocument(view));
  assert.match(english, /Project work rules/);
  assert.match(english, /These rules are checked when a Goal closes/);
});
