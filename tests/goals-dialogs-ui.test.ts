import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchGoalsDialogsRenderer } from "@molis-ai/molis-work-app-workbench";
import type { GoalsDialogItem } from "@molis-ai/molis-work-plugin-goals";
import { L, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { icon } from "@molis-ai/molis-work-design-system";

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const renderer = createWorkbenchGoalsDialogsRenderer({ translate: L, escapeHtml, icon });
const goal = (id: string, display_status: GoalsDialogItem["display_status"], priority: number): GoalsDialogItem => ({
  goal: { goal_id: id, title: 'Title "<safe> ' + id, created_at: "2026-09-05", priority }, status: "execution_pending", display_status,
});

test("create dialog preserves editable Draft fields, limits and parent/dependency ordering without altering input", () => {
  const items = [goal("finished", "completed", 100), goal("later", "continue", 10), goal('first"', "continue", 90)];
  const before = structuredClone(items), html = renderer.renderCreateDialog(items);
  assert.deepEqual(items, before);
  for (const name of ["goal_id", "priority", "title", "outcome", "why", "business_logic", "acceptance_criteria", "parent_goal_id", "dependency_goal_ids"]) assert.ok(html.includes('name="' + name + '"'));
  assert.match(html, /name="title" required maxlength="120"/);
  assert.match(html, /name="priority" type="number" min="0" max="100" value="50"/);
  assert.match(html, /Title &quot;&lt;safe&gt;/);
  const optionIds = [...html.matchAll(/<option value="([^"]*)"/g)].map(match => match[1]);
  assert.deepEqual(optionIds, ["", "first&quot;", "later", "finished"]);
  const dependencyIds = [...html.matchAll(/name="dependency_goal_ids" value="([^"]*)"/g)].map(match => match[1]);
  assert.deepEqual(dependencyIds, ["first&quot;", "later", "finished"]);
  assert.match(html, /data-create-error role="alert" hidden/);
  assert.match(html, /创建 Goal/);
  assert.doesNotMatch(html, /name="user_confirmed"/);
});

test("empty create and recoverable trash dialogs retain independent creation and explicit reason requirements", () => {
  const empty = renderer.renderCreateDialog([]);
  assert.match(empty, /作为独立 Goal，不指定上级/);
  assert.doesNotMatch(empty, /name="dependency_goal_ids"/);
  assert.match(empty, /data-parent-preview/);
  assert.match(empty, /data-dependency-preview/);
  const trash = renderer.renderGoalTrashDialog();
  assert.match(trash, /name="reason" rows="3" required maxlength="4000"/);
  assert.match(trash, /未结束的历史活动记录/);
  assert.match(trash, /Goal 历史会保留/);
  assert.match(trash, /data-goal-trash-error role="alert" hidden/);
  for (const hook of ["data-goal-trash-form", "data-goal-trash-title", "data-goal-trash-description", "data-goal-trash-target-title", "data-goal-trash-target-id", "data-goal-trash-note", "data-goal-trash-reason-label", "data-goal-trash-submit", "data-close-goal-trash"]) assert.ok(trash.includes(hook));
  const english = runWithLocale("en", () => renderer.renderCreateDialog([]));
  assert.doesNotMatch(english, /创建 Goal|作为独立 Goal/);
});
