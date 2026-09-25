import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchGoalsTreeRenderer, createWorkbenchUiHost } from "@molis-ai/molis-work-app-workbench";
import { buildGoalCollectionModel, GOALS_NAVIGATION_CLIENT_FACTORY_SCRIPT, GOALS_REFRESH_CLIENT_FACTORY_SCRIPT, GOALS_TREE_CLIENT_FACTORY_SCRIPT, GOALS_TREE_EN, GOALS_TREE_UI_CONTRIBUTION_ID, goalTreeCreatedLabel, goalTreeCreatorHue, goalTreeCreatorInitial, type GoalsTreeItem, type GoalsTreeView } from "@molis-ai/molis-work-plugin-goals";
import type { GoalRelationRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import { icon } from "@molis-ai/molis-work-design-system";
import { L, currentLocale, listJoin, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { GOAL_DISPLAY_STATUSES } from "@molis-ai/molis-work-plugin-goals";

const escapeHtml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const renderer = createWorkbenchGoalsTreeRenderer({ translate: L, escapeHtml, icon, currentLocale, listJoin,
  renderStatus: status => `<span>${status}</span>`, renderActionStatus: status => `<span>${status}</span>`,
  renderVisibleGoalStatus: item => `<span>${item.display_status}</span>`, displayStatuses: GOAL_DISPLAY_STATUSES });
const item = (id: string, title = id, acceptedBy?: string): GoalsTreeItem => ({
  goal: { goal_id: id, title, priority: 1, created_at: "2026-09-05", fulfillment_state: "unmet", acceptance_criteria: [], ...(acceptedBy ? { accepted_by: acceptedBy } : {}) },
  status: "execution_pending", display_status: "continue", passed_criteria: [], relations: [] });
const relation = (id: string, type: GoalRelationRecord["type"], from: string, to: string): GoalRelationRecord => ({
  relation_id: id, board_id: "board", type, from_goal_id: from, to_goal_id: to, state: "active", reason: 'Dependency "reason" <safe>',
  created_by: "user", created_at: "2026-09-05", deactivated_at: null });
const view = (goals: GoalsTreeItem[], relations: GoalRelationRecord[] = []): GoalsTreeView => ({ goals, archived_goals: [], trashed_goals: [], snapshot: { relations } });

test("Goals root directory contribution keeps its count, selection and navigation actions", () => {
  const active = renderer.renderGoalRootEntry(3, true);
  assert.match(active, /class="desktop-module-item is-current"/);
  assert.match(active, /data-work-surface-open="goal" aria-current="page"/);
  assert.doesNotMatch(active, /data-directory-open/);
  assert.match(active, /<strong>Goals<\/strong><small>3 个 Goal<\/small>/);
  const inactive = renderer.renderGoalRootEntry(0, false);
  assert.doesNotMatch(inactive, /is-current|aria-current|data-directory-open/);
  assert.match(inactive, /data-work-surface-open="goal"/);
  assert.match(inactive, /<small>0 个 Goal<\/small>/);
});

test("collection selection preserves requested/active precedence without defaulting the current list to the first Goal", () => {
  const first = item("first"), active = item("active"), requested = item("requested");
  const model = { ...view([first, active, requested]), archived_goals: [requested, active], trashed_goals: [first],
    active_goal_id: "active", counts: { waiting_for_human: 1, executing: 2, execution_pending: 0,
      execution_blocked: 2, invalidated: 6 } };
  const before = structuredClone(model);
  const select = (id?: string, archive = false, trash = false, decision = false) =>
    buildGoalCollectionModel(model, id, archive, trash, decision, L);
  assert.equal(select("requested").selected, requested);
  assert.equal(select("missing").selected, active);
  assert.equal(select().selected, active);
  assert.equal(select(undefined, true).selected, requested, "Archive does not use the current active Goal");
  assert.equal(select("active", true).selected, active);
  assert.equal(select("active", false, true).selected, first);
  assert.equal(select("requested", false, false, true).selected, undefined);
  const noDefault = buildGoalCollectionModel({ ...model, active_goal_id: null }, undefined, false, false, false, L);
  assert.equal(noDefault.selected, undefined, "Current list does not open the first Goal by default");
  assert.doesNotMatch(
    renderer.renderGoalStageList({ ...model, active_goal_id: null }, noDefault),
    /aria-pressed="true"/,
  );
  const current = select();
  assert.equal(current.collectionNote, "需要你决定 1 · 正在推进 2 · 受阻 8");
  const full = renderer.renderGoalDirectory(model, current, true);
  const compact = renderer.renderGoalRefreshDirectory(model, current);
  const stage = renderer.renderGoalStageList(model, current);
  const chrome = renderer.renderTreeChrome(model);
  assert.equal(full, "");
  assert.match(chrome, /tree-create[^>]*>[\s\S]*新建 Goal/);
  assert.match(chrome, /class="[^"]*tree-filter-trigger"[^>]*data-tree-filter-trigger/);
  assert.match(stage, /data-goal-stage-list/);
  assert.match(stage, /data-goal-list-view/);
  assert.match(stage, /data-goal-collection-fold="current"[^>]*\sopen/);
  assert.match(stage, /class="goal-collection-mark"/);
  assert.match(stage, /data-goal-collection-fold="archive"/);
  assert.match(stage, /data-goal-collection-fold="trash"/);
  assert.match(stage, /data-tree-root/);
  assert.match(stage, /data-collection-tree="archive"/);
  assert.match(stage, /data-collection-tree="trash"/);
  assert.doesNotMatch(stage, /data-goal-collection-fold="archive"[^>]*\sopen/);
  assert.match(stage, /data-select-goal="active" aria-pressed="true"/);
  assert.match(compact, /data-refresh-tree-chrome hidden/);
  assert.doesNotMatch(compact, /data-directory-panel|data-goal-list-view/);
  assert.match(compact, /data-tree-scroll/);
  assert.match(compact, /data-goal-collection-fold="current"/);
  const archive = runWithLocale("en", () => {
    const collection = select(undefined, true);
    return {
      directory: renderer.renderGoalDirectory(model, collection, false),
      stage: renderer.renderGoalStageList(model, collection),
      refresh: renderer.renderGoalRefreshDirectory(model, collection),
    };
  });
  assert.equal(archive.directory, "");
  assert.match(archive.refresh, /Can be restored any time/);
  assert.doesNotMatch(archive.refresh, /data-global-search|tree-search|data-archive-link|data-trash-link|data-directory-panel/);
  assert.match(archive.stage, /data-goal-collection-fold="archive"[^>]*\sopen/);
  assert.match(archive.stage, /data-collection-open/);
  assert.match(archive.stage, /data-tree-root/);
  const empty = buildGoalCollectionModel({ ...model, goals: [] }, undefined, false, false, false, L);
  assert.equal(empty.selected, undefined);
  assert.equal(empty.selectedId, "");
  assert.equal(empty.title, "Molis Work");
  assert.match(renderer.renderGoalRefreshDirectory({ ...model, goals: [] }, empty), /共 0 个目标/);
  assert.deepEqual(model, before);
});

test("tree contribution retains nesting, sibling order, selected row, progress, and cyclic leftovers once", () => {
  assert.ok(createWorkbenchUiHost().list().some(entry => entry.contribution_id === GOALS_TREE_UI_CONTRIBUTION_ID));
  const parent = item("parent", 'Parent "<title>');
  const ready = item("ready");
  const blocked = { ...item("blocked"), status: "execution_blocked" as const, display_status: "blocked" as const };
  const done = { ...item("done"), display_status: "completed" as const };
  const cycleA = item("cycle-a"), cycleB = item("cycle-b");
  const leaf = item("leaf");
  const relations = [relation("c1", "part_of", "done", "parent"), relation("c2", "part_of", "blocked", "parent"), relation("c3", "part_of", "ready", "parent"),
    relation("c4", "part_of", "leaf", "ready"),
    relation("cycle1", "part_of", "cycle-a", "cycle-b"), relation("cycle2", "part_of", "cycle-b", "cycle-a")];
  const html = renderer.renderGoalTree(view([parent, done, blocked, ready, leaf, cycleA, cycleB], relations), "ready");
  assert.match(html, /Parent &quot;&lt;title&gt;/);
  assert.match(html, /class="tree-children"/);
  assert.match(html, /data-tree-toggle/);
  assert.match(html, /data-tree-depth="0"/);
  assert.match(html, /data-tree-depth="1"/);
  assert.match(html, /data-tree-depth="2"/);
  assert.match(html, /class="tree-leading"/);
  assert.equal((html.match(/class="tree-avatar is-unknown"/g) ?? []).length, 7);
  assert.equal((html.match(/<time class="tree-created"/g) ?? []).length, 7);
  assert.match(html, />9月5日</);
  assert.doesNotMatch(html, /class="tree-ref"/);
  assert.doesNotMatch(html, /tree-progress is-empty/);
  assert.ok(html.indexOf('data-goal-id="ready"') < html.indexOf('data-goal-id="blocked"'));
  assert.ok(html.indexOf('data-goal-id="blocked"') < html.indexOf('data-goal-id="done"'));
  assert.match(html, /data-select-goal="ready" aria-pressed="true"/);
  assert.match(html, /aria-label="1\/3 完成，1 个阻塞"/);
  assert.match(html, /--tree-progress:33%/);
  const leafChunk = html.split('data-goal-id="leaf"')[1]?.split("data-goal-id=")[0] ?? "";
  const doneChunk = html.split('data-goal-id="done"')[1]?.split("data-goal-id=")[0] ?? "";
  const blockedChunk = html.split('data-goal-id="blocked"')[1]?.split("data-goal-id=")[0] ?? "";
  assert.match(leafChunk, /aria-label="0\/1 完成"/);
  assert.match(doneChunk, /aria-label="1\/1 完成"/);
  assert.match(blockedChunk, /tree-progress is-blocked/);
  assert.match(blockedChunk, /aria-label="0\/1 完成，1 个阻塞"/);
  for (const id of ["parent", "ready", "blocked", "done", "leaf", "cycle-a", "cycle-b"]) assert.equal(html.split(`data-goal-id="${id}"`).length - 1, 1);
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
  assert.match(html, /tree-relations-copy/);
  assert.doesNotMatch(html, /tree-relations-mark|tree-meta-line/);
  assert.match(html, /data-select-goal="archived"/);
  assert.match(html, /已完成，不再挡住/);
  assert.match(html, /data-select-goal="missing"/);
  assert.match(html, /dependency &quot;reason&quot; &lt;safe&gt;/);
  assert.doesNotMatch(html, /data-select-goal="upstream"|data-select-goal="inactive"/);
});

test("tree chrome keeps status counts, localized copy, and empty states", () => {
  const ready = item("ready"), completed = { ...item("done"), display_status: "completed" as const };
  const archived = { ...item("old"), status: "archived" as const };
  const model = { ...view([ready, item("also-ready"), completed]), archived_goals: [archived], trashed_goals: [item("trash")] };
  const html = renderer.renderTreeChrome(model);
  assert.match(html, /value="continue" data-status-filter><span><span>continue<\/span><\/span><small>2<\/small>/);
  assert.match(html, /value="completed" data-status-filter/);
  assert.doesNotMatch(html, /value="blocked" data-status-filter/);
  assert.doesNotMatch(html, /value="archived" data-status-filter|value="trashed" data-status-filter/);
  assert.doesNotMatch(html, /data-global-search|tree-search|data-archive-link|data-trash-link|data-navigator-view/);
  assert.match(html, /class="[^"]*tree-filter-trigger"[^>]*data-tree-filter-trigger/);
  assert.match(html, /tree-create[^>]*>[\s\S]*新建 Goal/);
  assert.match(html, /data-open-create/);
  assert.doesNotMatch(html, /data-collapse-all|折叠全部|Collapse all/);
  const english = runWithLocale("en", () => renderer.renderTreeChrome(model));
  assert.match(english, /New Goal/);
  assert.doesNotMatch(english, /value="archived" data-status-filter/);
  assert.doesNotMatch(english, /data-collapse-all|折叠全部|Collapse all/);
  assert.equal("折叠全部" in GOALS_TREE_EN, false);
  assert.doesNotMatch(GOALS_TREE_CLIENT_FACTORY_SCRIPT, /data-collapse-all|handleTreeCollapseAllClick/);
  assert.match(GOALS_TREE_CLIENT_FACTORY_SCRIPT, /\[data-tree-root\] \[data-tree-item\]/);
  assert.match(GOALS_TREE_CLIENT_FACTORY_SCRIPT, /syncGoalCollectionFolds/);
  assert.doesNotMatch(GOALS_NAVIGATION_CLIENT_FACTORY_SCRIPT, /visibleGoals\(\)\[0\]|getActiveGoalId\(\)/);
  assert.doesNotMatch(GOALS_REFRESH_CLIENT_FACTORY_SCRIPT, /currentGoals\[0\]/);
  assert.match(renderer.renderTreeChrome(view([])), /当前没有可筛选的 Goal/);
  assert.equal(renderer.renderGoalTree(view([]), ""), '<ul class="goal-tree" data-tree-root></ul>');
});

test("stage list keeps current, archive and trash collection folds", () => {
  const emptyModel = {
    ...view([]), active_goal_id: null, counts: { waiting_for_human: 0, executing: 0, execution_pending: 0, execution_blocked: 0, invalidated: 0 },
  };
  const emptyCollection = buildGoalCollectionModel(emptyModel, undefined, false, false, false, L);
  const emptyDirectory = renderer.renderGoalDirectory(view([]), emptyCollection, true);
  const empty = renderer.renderGoalStageList(view([]), emptyCollection);
  assert.doesNotMatch(emptyDirectory, /data-goal-collection-fold|data-select-goal|data-tree-root/);
  assert.match(empty, /data-goal-collection-fold="current"[^>]*\sopen/);
  assert.match(empty, /还没有 Goal/);
  assert.match(empty, /data-goal-collection-fold="archive"/);
  assert.match(empty, /data-goal-collection-fold="trash"/);
  assert.match(empty, /没有已归档的 Goal/);
  assert.match(empty, /回收站是空的/);
  assert.doesNotMatch(empty, /data-goal-collection-fold="archive"[^>]*\sopen/);
  assert.doesNotMatch(empty, /data-goal-collection-fold="trash"[^>]*\sopen/);
  const archived = { ...item("old"), status: "archived" as const };
  const trashed = item("gone");
  const current = item("live");
  const model = { ...view([current]), archived_goals: [archived], trashed_goals: [trashed],
    active_goal_id: "live", counts: { waiting_for_human: 0, executing: 0, execution_pending: 0, execution_blocked: 0, invalidated: 0 } };
  const html = renderer.renderGoalStageList(model, buildGoalCollectionModel(model, "old", true, false, false, L));
  assert.match(html, /data-tree-root/);
  assert.match(html, /data-select-goal="live"/);
  assert.doesNotMatch(html, /data-goal-collection-fold="current"[^>]*\sopen/);
  assert.match(html, /data-collection-tree="archive"/);
  assert.match(html, /data-select-goal="old" aria-pressed="true"/);
  assert.match(html, /data-goal-collection-fold="archive"[^>]*\sopen/);
  assert.match(html, /data-collection-tree="trash"/);
  assert.match(html, /data-select-goal="gone"/);
  const english = runWithLocale("en", () => renderer.renderGoalStageList(view([]), buildGoalCollectionModel({
    ...view([]), active_goal_id: null, counts: { waiting_for_human: 0, executing: 0, execution_pending: 0, execution_blocked: 0, invalidated: 0 },
  }, undefined, false, false, false, L)));
  assert.match(english, />Current<\/strong>/);
  assert.match(english, /No Goals yet/);
});

test("list rows show created date and creator avatar instead of Goal id", () => {
  assert.equal(goalTreeCreatedLabel("2026-09-17T08:12:00.000Z"), "Sep 17");
  assert.equal(goalTreeCreatorInitial("demo-user"), "D");
  assert.equal(typeof goalTreeCreatorHue("demo-user"), "number");
  const html = renderer.renderGoalTree(view([item("V1", "Root", "demo-user")]), "V1");
  assert.match(html, /class="tree-avatar"[^>]*>D</);
  const fromCreatedBy = renderer.renderGoalTree({
    ...view([item("draft")]),
    goals: [{ ...item("draft"), created_by: "demo-user" }],
  }, "draft");
  assert.match(fromCreatedBy, /class="tree-avatar"[^>]*>D</);
  assert.match(html, /<span class="tree-copy"><span class="tree-title-line">/);
  assert.match(html, /class="tree-created-meta"/);
  assert.match(html, /aria-label="创建人 demo-user"/);
  assert.match(html, /<time class="tree-created" datetime="2026-09-05"[^>]*>9月5日<\/time>/);
  assert.doesNotMatch(html, /class="tree-ref"|Goal 编号/);
});
