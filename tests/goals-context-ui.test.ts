import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchGoalsContextRenderer, createWorkbenchUiHost } from "@molis-ai/molis-work-app-workbench";
import { GOALS_CONTEXT_UI_CONTRIBUTION_ID, type GoalsContextItem, type GoalsContextView } from "@molis-ai/molis-work-plugin-goals";
import type { GoalRelationRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import { L, currentLocale } from "@molis-ai/molis-work-app-local-host";
import { createGoalStateExplainer } from "@molis-ai/molis-work-plugin-goals";
import { icon } from "@molis-ai/molis-work-design-system";
const { explainWorkState, explainParentCompletion } = createGoalStateExplainer(L);

const escapeHtml = (v: unknown) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const renderer = createWorkbenchGoalsContextRenderer({ translate: L, escapeHtml, icon, currentLocale, explainWorkState, explainParentCompletion,
  subsectionHeading: (_icon, title, description = "") => "<header>" + escapeHtml(L(title)) + escapeHtml(L(description)) + "</header>" });
const item = (id: string): GoalsContextItem => ({
  goal: { goal_id: id, title: '用户 "<title>', priority: 1, created_at: "2026-09-05", fulfillment_state: "unmet",
    definition_state: "draft", decomposition_state: "abstract", decomposition_review: null,
    outcome: "", why: "", business_logic: "", in_scope: [], out_of_scope: [], constraints: [], required_inputs: [], promised_outputs: [],
    acceptance_criteria: [] },
  status: "execution_pending", display_status: "continue", passed_criteria: [], relations: [], input_bindings: [], coverage: [],
});
const relation = (id: string, type: GoalRelationRecord["type"], from: string, to: string): GoalRelationRecord => ({
  relation_id: id, board_id: "board", type, from_goal_id: from, to_goal_id: to, state: "active", reason: 'Reason "<x>',
  created_by: "user", created_at: "2026-09-05", deactivated_at: null });
const view = (goals: GoalsContextItem[], relations: GoalRelationRecord[] = []): GoalsContextView =>
  ({ goals, archived_goals: [], trashed_goals: [], snapshot: { relations } });

test("HumanReview summary keeps statements and pass conditions without becoming a second completion owner", () => {
  assert.ok(createWorkbenchUiHost().list().some(x => x.contribution_id === GOALS_CONTEXT_UI_CONTRIBUTION_ID));
  const value = item("criteria");
  value.goal.acceptance_criteria = [
    { goal_id: "criteria", criterion_id: "c1", statement: 'Measured "<x>', decision_method: "measurement", pass_condition: "At least 90", target: { value: 90 }, required_evidence: ["report", "check"] },
    { goal_id: "criteria", criterion_id: "c2", statement: "Object target", decision_method: "inspection", pass_condition: "Verified", target: { min: 1, max: 3 }, required_evidence: [] },
  ];
  value.passed_criteria = ["c1"];
  const summary = renderer.renderAcceptanceSummary(value);
  assert.equal((summary.match(/check-box is-checked/g) ?? []).length, 1);
  assert.match(summary, /Measured &quot;&lt;x&gt;/);
  assert.match(summary, /达到下面的结果就算通过：At least 90/);
  assert.doesNotMatch(summary, /criterion_id|decision_method|required_evidence|report、check/);
  assert.match(renderer.renderAcceptanceSummary(item("empty")), /还没有写清怎样才算完成/);
});

test("context distinguishes local satisfaction, historical parent coverage and child direction", () => {
  const parent = item("parent"), child = item("child");
  parent.goal.definition_state = "accepted"; parent.goal.decomposition_state = "closed_compound";
  child.goal.fulfillment_state = "satisfied"; child.display_status = "completed"; child.status = "satisfied";
  parent.goal.decomposition_review = { status: "complete", coverage: [], open_goal_ids: [], next_step: "",
    contract_coverage: { promised_outputs: [{ parent_promised_output: "Full product", status: "partial", child_outputs: [{ goal_id: "child", promised_output: "One slice" }], reason: "Integration remains" }], acceptance_criteria: [] } };
  const relations = [relation("part", "part_of", "child", "parent"), relation("dep", "depends_on", "parent", "missing")];
  parent.relations = relations; child.relations = relations;
  const model = view([parent, child], relations);
  const coverage = renderer.renderContractCoverage(parent, model);
  assert.match(coverage, /部分覆盖/);
  assert.match(coverage, /历史父子 Contract 覆盖/);
  const progress = renderer.renderChildProgress(parent, model);
  assert.match(progress, /已完成 1 \/ 1 个子 Goal/);
  assert.match(progress, /子 Goal 完成不会自动完成父 Goal/);
  assert.match(progress, /href="\/goals\/child"/);
  const childHtml = renderer.renderContractCoverage(child, model);
  assert.match(childHtml, /不自动等于父 Goal 已经完成/);
  assert.match(childHtml, /Full product · 尚有缺口/);
  parent.goal.decomposition_review = null;
  assert.match(renderer.renderContractCoverage(parent, model), /未记录父子 Contract 覆盖（历史数据）/);
});
