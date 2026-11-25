import assert from "node:assert/strict";
import { createWorkbenchUiHost } from "@molis-ai/molis-work-app-workbench";
import { goalsRenderers, testGoalUi as test, withGoalLocale } from "./goals-page-mount.js";
import { GOALS_POLICY_UI_CONTRIBUTION_ID, type GoalsPolicyItem } from "@molis-ai/molis-work-plugin-goals";
import { icon, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { currentLocale } from "@molis-ai/molis-work-app-local-host";

const base = { human_approval: true };
const escapeHtml = (value: unknown) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const renderer = goalsRenderers.policy({ translate: t.text, currentLocale, icon, escapeHtml,
  formatDate: value => value ?? "", defaultPolicy: base });
const item: GoalsPolicyItem = {
  goal: { goal_id: 'goal-"<unsafe>' },
  policy_bindings: [{ policy_binding_id: "policy-project", goal_id: null, scope: "project_default", policy: base,
    state: "active", created_by: "user", reason: "Minimum baseline", created_at: "2026-09-05" }],
  resolved_policy: base,
};

test("W1-18-GOAL-POLICY-01 Workbench mounts current rules and Goal requirements without a Goal override form", () => {
  const host = createWorkbenchUiHost();
  assert.ok(host.list().some(entry => entry.contribution_id === GOALS_POLICY_UI_CONTRIBUTION_ID));
  const html = renderer.renderPolicyEditor(item);
  assert.match(html, /data-goal-policy-requirements/);
  assert.match(html, /data-event-reader="requirements"/);
  assert.doesNotMatch(html, /data-policy-form|name="goal_id"|GOAL OVERRIDE|<input|<textarea/);
  assert.match(html, /<dt>你的确认<\/dt><dd><strong>需要<\/strong>/);
  assert.doesNotMatch(html, /data-live-form="policy-project_default-/);
});

test("progress checks describe the resolved policy without writing it", () => {
  for (const { policy, phrase } of [{ policy: base, phrase: "最后需要你确认结果。" }, { policy: { human_approval: false }, phrase: "不需要你的最终确认。" }]) {
    const before = structuredClone(policy), html = renderer.renderProgressCheckSummary(policy);
    assert.ok(html.includes(phrase));
    assert.doesNotMatch(html, /<form|<input|type="submit"/);
    assert.deepEqual(policy, before);
  }
  const english = withGoalLocale("en", () => renderer.renderProgressCheckSummary(base));
  assert.match(english, /You need to approve the final result/);
});

test("archived/read-only policy presentation has no writable forms and locale remains request-local", () => {
  const readOnly = withGoalLocale("en", () => renderer.renderPolicyEditor(item, { editGoal: false }));
  assert.match(readOnly, /Effective rules now/);
  assert.match(readOnly, /You have the final confirmation/);
  assert.doesNotMatch(readOnly, /data-policy-form|<input|<textarea/);
  const chinese = withGoalLocale("zh", () => renderer.renderPolicyEditor(item));
  assert.match(chinese, /当前最终生效规则/);
  assert.doesNotMatch(chinese, /Effective rules now/);
});

test("APR-19 Goals renders the resolved approval rule and the link to its platform owner", () => {
  const view = { ...item, resolved_policy: { human_approval: false } };
  const before = structuredClone(view);
  const html = renderer.renderPolicyEditor(view);
  assert.match(html, /href="__PROJECT_RULES_SETTINGS__"/);
  assert.doesNotMatch(html, /<form|name="reason"|name="goal_id"|name="human_approval"|Minimum baseline/);
  assert.deepEqual(view, before);
  const english = withGoalLocale("en", () => renderer.renderPolicyEditor(view));
  assert.match(english, /Effective rules now/);
  assert.match(english, /No final user approval required/i);
});
