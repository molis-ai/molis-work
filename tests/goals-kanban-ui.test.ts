import { AsyncLocalStorage } from "node:async_hooks";
import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchGoalsMomentumRenderer, createWorkbenchLocale, createWorkbenchUiHost, type WebLocale } from "@molis-ai/molis-work-app-workbench";
import { GOAL_DISPLAY_STATUSES, GOALS_MOMENTUM_CLIENT_FACTORY_SCRIPT, GOALS_MOMENTUM_UI_CONTRIBUTION_ID, type GoalsMomentumItem, type GoalsMomentumBoardView } from "@molis-ai/molis-work-plugin-goals";
import type { GoalRelationRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import { icon } from "@molis-ai/molis-work-design-system";
import { GOAL_CANVAS_STYLES } from "../apps/workbench/src/styles/goal-canvas.ts";

const localeStore = new AsyncLocalStorage<WebLocale>();
const runWithLocale = <T,>(locale: WebLocale, fn: () => T) => localeStore.run(locale, fn);
const { L, currentLocale } = createWorkbenchLocale(() => localeStore.getStore() ?? "zh");

const escapeHtml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const renderer = createWorkbenchGoalsMomentumRenderer({ translate: L, escapeHtml, icon, currentLocale,
  renderVisibleGoalStatus: item => `<span>${item.display_status}</span>` });
const item = (id: string, title = id, display_status: GoalsMomentumItem["display_status"] = "continue"): GoalsMomentumItem => ({
  goal: { goal_id: id, title, priority: 1, created_at: "2026-08-01", updated_at: "2026-09-05", fulfillment_state: display_status === "completed" ? "satisfied" : "unmet", acceptance_criteria: [], outcome: `${id} outcome` },
  status: display_status === "completed" ? "satisfied" : "execution_pending", work_state: "execution_pending", display_status, passed_criteria: [], relations: [], reasons: [], runs: [], evidence: [], reviews: [], risks: [], events: [] });
const relation = (id: string, type: GoalRelationRecord["type"], from: string, to: string): GoalRelationRecord => ({
  relation_id: id, board_id: "board", type, from_goal_id: from, to_goal_id: to, state: "active", reason: "part",
  created_by: "user", created_at: "2026-09-05", deactivated_at: null });
const view = (goals: GoalsMomentumItem[], relations: GoalRelationRecord[] = []): GoalsMomentumBoardView => ({
  goals, archived_goals: [item("ARCHIVED")], trashed_goals: [item("TRASHED")], snapshot: { relations } });
const columnIds = (html: string) => [...html.matchAll(/data-kanban-column="([^"]+)"/g)].map((match) => match[1]);
const columnBody = (html: string, status: string) => {
  const match = html.match(new RegExp(`data-kanban-column="${status}"[\\s\\S]*?</section>`));
  return match?.[0] ?? "";
};

test("kanban keeps six visible-status columns, empty columns, and current-tree cards only", () => {
  assert.ok(createWorkbenchUiHost().list().some(entry => entry.contribution_id === GOALS_MOMENTUM_UI_CONTRIBUTION_ID));
  const parent = item("ROOT", "Parent", "waiting");
  const child = item("APP", 'User "<title>', "in_progress");
  const ready = item("NEXT", "Next");
  const membership = relation("app-root", "part_of", "APP", "ROOT");
  const model = view([ready, child, parent], [membership]);
  const html = renderer.renderGoalKanban(model, "APP", model.goals);
  assert.deepEqual(columnIds(html), [...GOAL_DISPLAY_STATUSES]);
  assert.match(html, /data-goal-kanban/);
  assert.match(html, /data-kanban-group/);
  assert.match(html, /goal-kanban-chevron/);
  assert.match(html, /goal-kanban-caret/);
  assert.match(html, /goal-kanban-status/);
  assert.match(columnBody(html, "in_progress"), /<span class="goal-kanban-status"[^>]*>[\s\S]*viewBox="0 0 16 16"/);
  assert.doesNotMatch(html, /#icon-chevron-right/);
  assert.match(columnBody(html, "continue"), /data-goal-id="NEXT"/);
  assert.match(columnBody(html, "in_progress"), /data-goal-id="APP"/);
  assert.match(columnBody(html, "waiting"), /data-goal-id="ROOT"/);
  assert.match(columnBody(html, "waiting_user"), /<details data-kanban-group>/);
  assert.match(columnBody(html, "waiting_user"), /class="goal-kanban-count">0</);
  assert.match(columnBody(html, "waiting_user"), /class="goal-kanban-empty">暂无 Goal</);
  assert.match(columnBody(html, "in_progress"), /class="goal-kanban-count">1</);
  assert.match(columnBody(html, "in_progress"), /<details open data-kanban-group>/);
  assert.doesNotMatch(columnBody(html, "in_progress"), /goal-kanban-empty/);
  assert.doesNotMatch(columnBody(html, "waiting_user"), /data-kanban-card(?!s)/);
  assert.match(columnBody(html, "in_progress"), /<strong>User &quot;&lt;title&gt;<\/strong>[\s\S]*goal-kanban-card-meta[\s\S]*属于：Parent/);
  assert.match(html, /属于：Parent/);
  assert.match(html, /User &quot;&lt;title&gt;/);
  assert.match(html, /APP outcome/);
  assert.match(html, /data-kanban-card[^>]*data-goal-id="APP"[^>]*class="[^"]*is-selected/);
  assert.doesNotMatch(html, /data-goal-id="ARCHIVED"|data-goal-id="TRASHED"/);
  assert.doesNotMatch(html, /data-graph-frame|draggable="true"|还没有目标|从想要的结果开始|创建第一条 Goal|data-open-create|<h1>/);
});

test("kanban localizes column labels without translating user titles or adding how-to copy", () => {
  const user = item("USER", "看板");
  const html = runWithLocale("en", () => renderer.renderGoalKanban(view([user]), "USER", [user]));
  assert.match(html, /<strong>看板<\/strong>/);
  assert.match(html, />Continue</);
  assert.match(html, />Active</);
  assert.match(html, />Needs you</);
  assert.match(html, />Waiting</);
  assert.match(html, />Blocked</);
  assert.match(html, />Completed</);
  assert.doesNotMatch(html, /Kanban|How to use|Click a card to open/);
});

test("kanban CSS shares six columns on desktop and stacks groups when the pane is narrow", () => {
  assert.match(GOAL_CANVAS_STYLES, /flex: 1 1 0/);
  assert.match(GOAL_CANVAS_STYLES, /container: goal-board \/ inline-size/);
  assert.match(GOAL_CANVAS_STYLES, /@container goal-board \(max-width: 839px\)/);
  assert.match(GOAL_CANVAS_STYLES, /data-board-view="list"/);
  assert.match(GOAL_CANVAS_STYLES, /goal-stage-list/);
  assert.match(GOAL_CANVAS_STYLES, /goal-kanban-chevron/);
  assert.match(GOAL_CANVAS_STYLES, /goal-kanban-status svg/);
  assert.match(GOAL_CANVAS_STYLES, /details > summary \{ display: flex; width: 100%/);
  assert.doesNotMatch(GOAL_CANVAS_STYLES, /inline-flex; width: max-content/);
  assert.doesNotMatch(GOAL_CANVAS_STYLES, /conic-gradient/);
  assert.doesNotMatch(GOAL_CANVAS_STYLES, /goal-kanban-group-mark/);
  assert.match(GOAL_CANVAS_STYLES, /goal-kanban-empty \{ display: none/);
  assert.match(GOAL_CANVAS_STYLES, /goal-kanban-card-outcome,/);
  assert.match(GOAL_CANVAS_STYLES, /goal-kanban-card-meta/);
  assert.match(GOAL_CANVAS_STYLES, /-webkit-line-clamp: 2/);
  assert.doesNotMatch(GOAL_CANVAS_STYLES, /flex: 0 0 252px/);
  assert.doesNotMatch(GOAL_CANVAS_STYLES, /min-width: 152px/);
});

test("momentum client keeps Frame clicks from rewriting the stage view", () => {
  assert.doesNotMatch(GOALS_MOMENTUM_CLIENT_FACTORY_SCRIPT, /shell\.dataset\.boardView = kanbanActive \? "kanban" : "canvas"/);
  assert.match(GOALS_MOMENTUM_CLIENT_FACTORY_SCRIPT, /boardView === "list"/);
  assert.match(GOALS_MOMENTUM_CLIENT_FACTORY_SCRIPT, /host\.applySelection\?\.\(id\)/);
  assert.match(GOALS_MOMENTUM_CLIENT_FACTORY_SCRIPT, /host\.openFrame\) host\.openFrame\(id\)/);
});
