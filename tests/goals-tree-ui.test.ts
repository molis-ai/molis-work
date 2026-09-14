import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchGoalsTreeRenderer, createWorkbenchUiHost } from "@adeptify/goalboard-app-workbench";
import { buildGoalCollectionModel, GOALS_TREE_UI_CONTRIBUTION_ID, type GoalsTreeItem, type GoalsTreeView } from "@adeptify/goalboard-plugin-goals";
import type { GoalRelationRecord } from "@adeptify/goalboard-contracts/modules/goals";
import { icon } from "@adeptify/goalboard-design-system";
import { L, currentLocale, listJoin, runWithLocale } from "@adeptify/goalboard-app-local-host";
import { GOAL_DISPLAY_STATUSES } from "@adeptify/goalboard-plugin-goals";

const escapeHtml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const renderer = createWorkbenchGoalsTreeRenderer({ translate: L, escapeHtml, icon, currentLocale, listJoin,
  renderStatus: status => `<span>${status}</span>`, renderActionStatus: status => `<span>${status}</span>`,
  renderVisibleGoalStatus: item => `<span>${item.display_status}</span>`, displayStatuses: GOAL_DISPLAY_STATUSES });
const item = (id: string, title = id): GoalsTreeItem => ({ goal: { goal_id: id, title, priority: 1, created_at: "2026-09-05", fulfillment_state: "unmet", acceptance_criteria: [] },
  status: "execution_pending", display_status: "continue", passed_criteria: [], relations: [] });
const relation = (id: string, type: GoalRelationRecord["type"], from: string, to: string): GoalRelationRecord => ({
  relation_id: id, board_id: "board", type, from_goal_id: from, to_goal_id: to, state: "active", reason: 'Dependency "reason" <safe>',
  created_by: "user", created_at: "2026-09-05", deactivated_at: null });
const view = (goals: GoalsTreeItem[], relations: GoalRelationRecord[] = []): GoalsTreeView => ({ goals, archived_goals: [], trashed_goals: [], snapshot: { relations } });

test("Goals root directory contribution keeps its count, selection and navigation actions", () => {
  const active = renderer.renderGoalRootEntry(3, true);
  assert.match(active, /class="desktop-module-item is-current"/);
  assert.match(active, /data-directory-open="goals" data-work-surface-open="goal" aria-current="page"/);
  assert.match(active, /<strong>Goals<\/strong><small>3 个 Goal<\/small>/);
  const inactive = renderer.renderGoalRootEntry(0, false);
  assert.doesNotMatch(inactive, /is-current|aria-current/);
  assert.match(inactive, /data-directory-open="goals" data-work-surface-open="goal"/);
  assert.match(inactive, /<small>0 个 Goal<\/small>/);
});

test("collection selection preserves requested/active/first precedence and archive, trash, decision and empty boundaries", () => {
  const first = item("first"), active = item("active"), requested = item("requested");
  const model = { ...view([first, active, requested]), archived_goals: [requested, active], trashed_goals: [first],
    active_goal_id: "active", counts: { waiting_for_human: 1, executing: 2, execution_pending: 0,
      execution_blocked: 2, invalidated: 6 } };
  const before = structuredClone(model);
  const select = (id?: string, archive = false, trash = false, decision = false) =>
    buildGoalCollectionModel(model, id, archive, trash, decision, L);
  assert.equal(select("requested").selected, requested);
  assert.equal(select("missing").selected, active);
  assert.equal(select(undefined, true).selected, requested, "Archive does not use the current active Goal");
  assert.equal(select("active", true).selected, active);
  assert.equal(select("active", false, true).selected, first);
  assert.equal(select("requested", false, false, true).selected, undefined);
  const current = select();
  assert.equal(current.collectionNote, "需要你决定 1 · 正在推进 2 · 受阻 8");
  const full = renderer.renderGoalDirectory(model, current, true);
  const compact = renderer.renderGoalRefreshDirectory(model, current);
  assert.match(full, /data-directory-panel="goals">/);
  assert.match(full, /data-goal-list-view/);
  assert.doesNotMatch(full, /data-tree-footer|tree-footer|共 3 个目标/);
  assert.match(compact, /data-refresh-tree-chrome hidden/);
  assert.doesNotMatch(compact, /data-directory-panel|data-goal-list-view|data-tree-footer|共 3 个目标/);
  assert.match(full, /data-select-goal="active" aria-pressed="true"/);
  const archive = runWithLocale("en", () => {
    const collection = select(undefined, true);
    return renderer.renderGoalDirectory(model, collection, false);
  });
  assert.match(archive, /data-directory-panel="goals" hidden/);
  assert.match(archive, /Can be restored any time/);
  assert.match(archive, /Search archived Goals/);
  const empty = buildGoalCollectionModel({ ...model, goals: [] }, undefined, false, false, false, L);
  assert.equal(empty.selected, undefined);
  assert.equal(empty.selectedId, "");
  assert.equal(empty.title, "GoalBoard");
  assert.match(renderer.renderGoalRefreshDirectory(model, empty), /data-tree-scroll/);
  assert.doesNotMatch(renderer.renderGoalRefreshDirectory(model, empty), /data-tree-footer|共 0 个目标/);
  assert.deepEqual(model, before);
});

test("tree contribution retains nesting, sibling order, selected row, progress, and cyclic leftovers once", () => {
  assert.ok(createWorkbenchUiHost().list().some(entry => entry.contribution_id === GOALS_TREE_UI_CONTRIBUTION_ID));
  const parent = item("parent", 'Parent "<title>');
  const ready = item("ready");
  const blocked = { ...item("blocked"), status: "execution_blocked" as const, display_status: "blocked" as const };
  const done = { ...item("done"), display_status: "completed" as const };
  const cycleA = item("cycle-a"), cycleB = item("cycle-b");
  const relations = [relation("c1", "part_of", "done", "parent"), relation("c2", "part_of", "blocked", "parent"), relation("c3", "part_of", "ready", "parent"),
    relation("cycle1", "part_of", "cycle-a", "cycle-b"), relation("cycle2", "part_of", "cycle-b", "cycle-a")];
  const html = renderer.renderGoalTree(view([parent, done, blocked, ready, cycleA, cycleB], relations), "ready");
  assert.match(html, /Parent &quot;&lt;title&gt;/);
  assert.match(html, /class="tree-children"/);
  assert.ok(html.indexOf('data-goal-id="ready"') < html.indexOf('data-goal-id="blocked"'));
  assert.ok(html.indexOf('data-goal-id="blocked"') < html.indexOf('data-goal-id="done"'));
  assert.match(html, /data-select-goal="ready" aria-pressed="true"/);
  assert.match(html, /aria-label="1\/3 完成，1 个阻塞"/);
  assert.match(html, /--tree-progress:33%/);
  for (const id of ["parent", "ready", "blocked", "done", "cycle-a", "cycle-b"]) assert.equal(html.split(`data-goal-id="${id}"`).length - 1, 1);
});

test("tree dependencies preserve outgoing direction, archived results, missing targets, and searchable reasons", () => {
  const current = item("current"), blocked = { ...item("blocked"), status: "execution_blocked" as const };
  const archived = { ...item("archived", "Archived result"), display_status: "completed" as const };
  current.relations = [relation("a", "depends_on", "current", "archived"), relation("b", "depends_on", "current", "blocked"),
    relation("c", "depends_on", "current", "missing"), relation("d", "depends_on", "upstream", "current"),
    { ...relation("e", "depends_on", "current", "inactive"), state: "inactive" }];
  const model = { ...view([current, blocked]), archived_goals: [archived] };
  const html = renderer.renderGoalTree(model, "current", [current]);
  assert.match(html, /tree-relations is-blocked/);
  assert.match(html, /3 个前置/);
  assert.match(html, /1 个阻塞/);
  assert.match(html, /data-select-goal="archived"/);
  assert.match(html, /已完成，不再挡住/);
  assert.match(html, /data-select-goal="missing"/);
  assert.match(html, /dependency &quot;reason&quot; &lt;safe&gt;/);
  assert.doesNotMatch(html, /data-select-goal="upstream"|data-select-goal="inactive"/);
});

test("tree chrome keeps status counts, collection navigation, localized copy, and empty states", () => {
  const ready = item("ready"), completed = { ...item("done"), display_status: "completed" as const };
  const archived = { ...item("old"), status: "archived" as const };
  const model = { ...view([ready, item("also-ready"), completed]), archived_goals: [archived], trashed_goals: [item("trash")] };
  const html = renderer.renderTreeChrome(model, model.goals, false, false, "Search", "Goals");
  assert.match(html, /value="continue" data-status-filter><span><span>continue<\/span><\/span><small>2<\/small>/);
  assert.match(html, /value="completed" data-status-filter/);
  assert.doesNotMatch(html, /value="blocked" data-status-filter/);
  assert.match(html, /data-navigator-view="graph"/);
  assert.match(html, /data-archive-link href="\/archive"/);
  assert.match(html, /data-trash-link href="\/trash"/);
  const archive = runWithLocale("en", () => renderer.renderTreeChrome(model, model.archived_goals, true, false, "Search", "Goals"));
  assert.match(archive, /value="archived" data-status-filter/);
  assert.match(archive, /data-archive-link href="\/" aria-label="Return to Goal Tree"/);
  assert.doesNotMatch(archive, /data-navigator-view/);
  assert.match(renderer.renderTreeChrome(view([]), [], false, false, "", ""), /当前没有可筛选的 Goal/);
  assert.equal(renderer.renderGoalTree(view([]), ""), '<ul class="goal-tree" data-tree-root></ul>');
});
