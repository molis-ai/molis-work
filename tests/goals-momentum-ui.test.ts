import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchGoalsMomentumRenderer, createWorkbenchUiHost } from "@molis-ai/molis-work-app-workbench";
import { GOALS_MOMENTUM_UI_CONTRIBUTION_ID, type GoalsMomentumItem, type GoalsMomentumBoardView } from "@molis-ai/molis-work-plugin-goals";
import type { GoalRelationRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import { icon } from "@molis-ai/molis-work-design-system";
import { L, currentLocale, runWithLocale } from "@molis-ai/molis-work-app-local-host";

const escapeHtml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const renderer = createWorkbenchGoalsMomentumRenderer({ translate: L, escapeHtml, icon, currentLocale,
  renderVisibleGoalStatus: item => `<span>${item.display_status}</span>` });
const item = (id: string, title = id): GoalsMomentumItem => ({ goal: { goal_id: id, title, priority: 1, created_at: "2026-08-01", updated_at: "2026-09-05", fulfillment_state: "unmet", acceptance_criteria: [] },
  status: "execution_pending", work_state: "execution_pending", display_status: "continue", passed_criteria: [], relations: [], reasons: [], runs: [], evidence: [], reviews: [], risks: [], events: [] });
const relation = (id: string, type: GoalRelationRecord["type"], from: string, to: string): GoalRelationRecord => ({
  relation_id: id, board_id: "board", type, from_goal_id: from, to_goal_id: to, state: "active", reason: 'Provider "result" <safe>',
  created_by: "user", created_at: "2026-09-05", deactivated_at: null });
const view = (goals: GoalsMomentumItem[], relations: GoalRelationRecord[] = []): GoalsMomentumBoardView => ({ goals, archived_goals: [], trashed_goals: [], snapshot: { relations } });

test("canvas renders provider-to-consumer edges, keeps parent membership separate, and escapes Goal content", () => {
  assert.ok(createWorkbenchUiHost().list().some(entry => entry.contribution_id === GOALS_MOMENTUM_UI_CONTRIBUTION_ID));
  const consumer = item("APP", 'User "<title>'), provider = item("API"), parent = item("ROOT", "Parent");
  const dependency = relation("app-api", "depends_on", "APP", "API");
  const membership = relation("app-root", "part_of", "APP", "ROOT");
  consumer.relations = [dependency, membership];
  const model = view([consumer, provider, parent], [dependency, membership]);
  const html = renderer.renderGoalMomentum(model, "APP", model.goals);
  assert.match(html, /data-edge-from="API" data-edge-to="APP"/);
  assert.doesNotMatch(html, /data-edge-from="ROOT"|data-edge-to="ROOT"/);
  assert.match(html, /属于：Parent/);
  assert.match(html, /API → User &quot;&lt;title&gt; · Provider &quot;result&quot; &lt;safe&gt;/);
  assert.match(html, /展开 Goal：User &quot;&lt;title&gt;/);
  assert.match(html, /打开 Frame：User &quot;&lt;title&gt;/);
  assert.match(html, /class="goal-canvas-frame"/);
  assert.match(html, /class="goal-canvas-open"/);
  assert.match(html, /data-graph-frame/);
  assert.match(html, /data-graph-open/);
  const providerX = Number(html.match(/data-goal-id="API" data-node-x="(\d+)"/)?.[1]);
  const consumerX = Number(html.match(/data-goal-id="APP" data-node-x="(\d+)"/)?.[1]);
  assert.ok(providerX < consumerX, "the provider is placed before its consumer");
});

test("canvas retains completed Goals and incomplete relationship diagnostics without action suggestions", () => {
  const done = item("DONE"), blocked = item("BLOCKED"), missing = relation("missing", "depends_on", "BLOCKED", "MISSING");
  done.goal.fulfillment_state = "satisfied";
  done.display_status = "completed";
  blocked.status = "execution_blocked";
  blocked.display_status = "blocked";
  const model = view([done, blocked], [missing]);
  const html = renderer.renderGoalMomentum(model, "BLOCKED", model.goals);
  assert.match(html, /class="goal-canvas-node is-complete"[^>]*data-goal-id="DONE"/);
  assert.match(html, /部分关系不完整/);
  assert.match(html, /data-goal-id="BLOCKED"/);
  assert.doesNotMatch(html, /data-edge-from="MISSING"|<form|data-run-start|data-claim|行动队列/);
});

test("canvas has an honest empty state and localizes controls without translating user titles", () => {
  const empty = view([]);
  assert.match(renderer.renderGoalMomentum(empty, "", []), /还没有目标/);
  assert.doesNotMatch(renderer.renderGoalMomentum(empty, "", []), /从想要的结果开始|创建第一条 Goal/);
  assert.match(renderer.renderGoalMomentum(empty, "", []), /data-open-create/);
  const user = item("USER", "目标关系");
  const model = view([user]);
  const html = runWithLocale("en", () => renderer.renderGoalMomentum(model, "USER", model.goals));
  assert.match(html, /<strong>目标关系<\/strong>/);
  assert.doesNotMatch(html, /<h1>|Goal relationships|Arrows lead from prerequisites|Click to trace relations/);
  assert.match(html, /Open Frame/);
  assert.match(html, /Open Goal/);
  assert.doesNotMatch(renderer.renderGoalMomentum(model, "USER", model.goals), /<h1>|目标关系<\/h1>|箭头从前置成果指向后续工作|单击看血缘/);
});


test("default canvas target prefers the highest-priority startable leaf and falls back honestly", () => {
  const root = item("ROOT"), later = item("LATER"), next = item("NEXT"), active = item("ACTIVE");
  root.goal.decomposition_state = "closed_compound";
  root.goal.priority = 100;
  next.goal.priority = 10;
  active.display_status = "in_progress";
  const model = view([root, later, active, next]);
  assert.match(renderer.renderGoalMomentum(model, "LATER", model.goals), /data-default-goal="NEXT"/);
  later.display_status = next.display_status = "blocked";
  assert.match(renderer.renderGoalMomentum(model, "LATER", model.goals), /data-default-goal="ACTIVE"/);
  active.display_status = "completed";
  assert.match(renderer.renderGoalMomentum(model, "LATER", model.goals), /data-default-goal="LATER"/);
  assert.match(renderer.renderGoalMomentum(view([]), "", []), /data-default-goal=""/);
});
