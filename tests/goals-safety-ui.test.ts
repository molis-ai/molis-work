import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchGoalsSafetyRenderer, createWorkbenchUiHost } from "@molis-ai/molis-work-app-workbench";
import { GOALS_SAFETY_UI_CONTRIBUTION_ID, type GoalsSafetyItem, type GoalsSafetyRisk } from "@molis-ai/molis-work-plugin-goals";
import { icon } from "@molis-ai/molis-work-design-system";
import { L, currentLocale, runWithLocale } from "@molis-ai/molis-work-app-local-host";

const escapeHtml = (value: unknown) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const renderer = createWorkbenchGoalsSafetyRenderer({ translate: L, currentLocale, icon, escapeHtml,
  formatDate: value => value ?? "", renderReference: value => `<code>${escapeHtml(value)}</code>`,
  renderList: (values, empty) => values.length ? values.map(value => `<li>${escapeHtml(value)}</li>`).join("") : empty });
function fixture() {
  const risk: GoalsSafetyRisk = { risk_id: "risk-one", board_id: "board", goal_ids: ["goal-one", "archived"],
    description: '<script>alert("risk")</script>', probability: "medium", impact: "Missing release",
    affected_surfaces: ["installer"], trigger: "Installation fails", treatment: "mitigate", treatment_plan: "Rehearse installation",
    blocking_mode: "completion", revisit_condition: "After rehearsal", owner: "release-owner", state: "open",
    resolution_basis: null, created_at: "2026-09-05", updated_at: "2026-09-05" };
  const item: GoalsSafetyItem = { goal: { goal_id: "goal-one", title: "Release", archived_at: null, priority: 10, created_at: "2026-09-05" },
    status: "execution_pending", display_status: "continue", risks: [risk], impacts: [] };
  const archived: GoalsSafetyItem = { ...item, goal: { ...item.goal, goal_id: "archived", title: 'Old <release>', archived_at: "2026-09-05" },
    display_status: "completed", risks: [], impacts: [] };
  return { risk, item, archived, view: { goals: [item], archived_goals: [archived] } };
}

test("Goals safety contribution preserves editable facts, linked archived Goals and escaped content", () => {
  assert.ok(createWorkbenchUiHost().list().some(entry => entry.contribution_id === GOALS_SAFETY_UI_CONTRIBUTION_ID));
  const { item, view } = fixture();
  const html = renderer.renderRiskWorkbench(item, view);
  assert.match(html, /href="\/archive\/goals\/archived"/);
  assert.match(html, /Old &lt;release&gt;/);
  assert.match(html, /&lt;script&gt;alert\(&quot;risk&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|risk-decision-link|<form/);
  assert.match(html, /历史风险记录/);
});

test("archive and record views stay read-only", () => {
  const { item, view } = fixture();
  const records = renderer.renderRiskWorkbench(item, view, false);
  assert.match(records, /id="risk-risk-one"/);
  assert.doesNotMatch(records, /<form|risk-decision-link/);
  item.goal.archived_at = "2026-09-05";
  assert.doesNotMatch(renderer.renderRiskWorkbench(item, view), /<form|<input|<textarea/);
  assert.doesNotMatch(renderer.renderImpactWorkbench(item), /<form|<input|<textarea/);
});

test("resolved risk evidence and missing historical basis are displayed without rewriting state", () => {
  const { item, risk, view } = fixture();
  risk.state = "resolved";
  assert.match(renderer.renderRiskWorkbench(item, view), /未记录解决依据（历史数据）/);
  assert.equal(risk.resolution_basis, null);
  risk.resolution_basis = { summary: "Rehearsal passed", evidence_refs: ["project://checks.md"], residual_gaps: ["Intel pending"] };
  const html = renderer.renderRiskWorkbench(item, view);
  assert.match(html, /Rehearsal passed/);
  assert.match(html, /<code>project:\/\/checks.md<\/code>/);
  assert.match(html, /<li>Intel pending<\/li>/);
  assert.doesNotMatch(html, /risk-resolution--unrecorded/);
  assert.match(html, /历史事实/);
});

test("impact history preserves escaped facts, deactivation reason and request locale", () => {
  const { item, view } = fixture();
  const impact = { binding_id: "impact-one", board_id: "board", goal_id: item.goal.goal_id, surface: 'release <files>',
    access: "read" as const, input_snapshot: "commit://release", state: "confirmed" as const, reason: "Review release",
    created_by: "user", created_at: "2026-09-05", updated_at: "2026-09-05", deactivated_at: null, deactivation_reason: null };
  item.impacts = [impact, { ...impact, binding_id: "old-impact", state: "inactive", deactivated_at: "2026-09-05", deactivation_reason: "Replaced scope" }];
  const html = renderer.renderImpactWorkbench(item);
  assert.match(html, /release &lt;files&gt;/);
  assert.match(html, /Replaced scope/);
  const history = html.slice(html.indexOf('id="impact-old-impact"'));
  assert.doesNotMatch(history, /<form/);
  assert.doesNotMatch(html, /data-impact-edit-form|data-impact-create-form/);
  const english = runWithLocale("en", () => renderer.renderRiskWorkbench(item, view) + renderer.renderImpactWorkbench(item));
  assert.match(english, /Replaced scope/);
  item.risks = [];
  assert.match(renderer.renderRiskWorkbench(item, view, false), /当前没有已记录的风险/);
});
