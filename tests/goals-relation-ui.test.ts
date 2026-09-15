import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchGoalsRelationRenderer, createWorkbenchUiHost } from "@molis-ai/molis-work-app-workbench";
import { GOALS_RELATION_UI_CONTRIBUTION_ID, type GoalsRelationItem } from "@molis-ai/molis-work-plugin-goals";
import type { GoalRelationRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import { icon } from "@molis-ai/molis-work-design-system";
import { L, runWithLocale } from "@molis-ai/molis-work-app-local-host";

const escapeHtml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const renderer = createWorkbenchGoalsRelationRenderer({ translate: L, escapeHtml, icon });
const item = (id: string, title = id): GoalsRelationItem => ({ goal: { goal_id: id, title, archived_at: null, priority: 1, created_at: "2026-09-05" },
  status: "execution_pending", display_status: "continue", relations: [], events: [] });
const relation = (id: string, type: GoalRelationRecord["type"], from: string, to: string): GoalRelationRecord => ({
  relation_id: id, board_id: "board", type, from_goal_id: from, to_goal_id: to, state: "active", reason: 'Keep "direction" <safe>',
  created_by: "user", created_at: "2026-09-05", deactivated_at: null });

test("relation contribution preserves all nine types, direction, target ordering, and separate Decision history", () => {
  assert.ok(createWorkbenchUiHost().list().some(entry => entry.contribution_id === GOALS_RELATION_UI_CONTRIBUTION_ID));
  const current = item("current", 'Current "<goal>');
  const target = item("target", "Target");
  const later = { ...item("later"), display_status: "completed" as const };
  current.relations = [relation("up", "depends_on", "current", "target"), relation("down", "part_of", "target", "current")];
  const view = { goals: [current, later, target], archived_goals: [] };
  const html = renderer.renderRelations(current, view, true, '<aside data-decision-history="owner">Decision history</aside>');
  assert.match(html, /data-current-goal-name="Current &quot;&lt;goal&gt;"/);
  assert.match(html, /value="target" data-goal-name="Target"/);
  assert.ok(html.indexOf('value="target" data-goal-name') < html.indexOf('value="later" data-goal-name'));
  assert.match(html, /name="direction" required/);
  assert.match(html, /value="outgoing" selected/);
  assert.match(html, /value="incoming"/);
  for (const type of ["part_of", "depends_on", "conflicts_with", "mitigates", "extends", "replaces", "corrects", "invalidates", "migrates_from"]) {
    assert.match(html, new RegExp('option value="' + type + '"'));
  }
  assert.match(html, /Keep &quot;direction&quot; &lt;safe&gt;/);
  assert.match(html, /<span class="relation-kind">依赖<\/span>/);
  assert.match(html, /<span class="relation-kind">包含<\/span>/);
  assert.ok(html.trimEnd().endsWith('<aside data-decision-history="owner">Decision history</aside>'));
});

test("inactive relation retains reason and direction without writable controls; archived/read-only forms disappear", () => {
  const current = item("current");
  const archived = item("archived", "Archived target");
  archived.goal.archived_at = "2026-09-05";
  current.relations = [{ ...relation("old", "extends", "archived", "current"), state: "inactive" }];
  current.events = [{ type: "relation.deactivated", object_id: "old", reason: "No longer needed" }];
  const view = { goals: [current], archived_goals: [archived] };
  const html = renderer.renderRelations(current, view);
  assert.match(html, /relation-inactive-history/);
  assert.match(html, /Archived target/);
  assert.match(html, /No longer needed/);
  assert.match(html, /data-select-goal="archived"/);
  assert.doesNotMatch(html, /data-relation-deactivate-open|data-relation-deactivate-form/);
  assert.match(html, /还没有可关联的其他 Goal/);
  current.relations = [relation("active", "depends_on", "current", "archived")];
  assert.doesNotMatch(renderer.renderRelations(current, view, false), /<form|data-relation-deactivate-open/);
  current.goal.archived_at = "2026-09-05";
  assert.doesNotMatch(renderer.renderRelations(current, view), /<form|data-relation-deactivate-open/);
  assert.equal(renderer.renderRelationForm(current, view), "");
});

test("relation form preserves selectors and request-local English copy without translating Goal titles", () => {
  const current = item("current", "用户标题");
  const view = { goals: [current, item("other", "另一个用户标题")], archived_goals: [] };
  const english = runWithLocale("en", () => renderer.renderRelationForm(current, view));
  assert.match(english, /data-relation-form/);
  assert.match(english, /data-live-form="relation-current"/);
  assert.match(english, /name="reason" rows="3" required/);
  assert.match(english, /另一个用户标题/);
  assert.doesNotMatch(english, /你正在直接修改 Goal 关系/);
  assert.match(runWithLocale("zh", () => renderer.renderRelationForm(current, view)), /你正在直接修改 Goal 关系/);
});
