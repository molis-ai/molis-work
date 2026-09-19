import assert from "node:assert/strict";
import test from "node:test";
import { createTabWorkspaceOps } from "../apps/workbench/src/tab-workspace-ops.js";

const ops = createTabWorkspaceOps();

test("fresh workspace opens on the home tab", () => {
  const state = ops.create();
  assert.equal(ops.countTabs(state), 1);
  assert.equal(ops.activeTab(state)?.kind, "home");
  assert.equal(state.exclusive, null);
});

test("opening a plugin shows its default view without adding a mother tab", () => {
  const state = ops.create();
  ops.openPlugin(state, "goals");
  assert.equal(ops.countTabs(state), 1);
  assert.equal(ops.activeTab(state), null);
  assert.equal(ops.focused(state).viewPlugin, "goals");
  assert.ok(ops.focused(state).tabs.some((tab) => tab.kind === "home"));
  assert.equal(ops.focused(state).tabs.some((tab) => tab.kind === "mother"), false);
});

test("Shelf is a named plugin view, not a later-only plugin", () => {
  const state = ops.create();
  const tab = ops.openPlugin(state, "shelf");
  assert.equal(tab.plugin, "shelf");
  assert.equal(ops.pluginTitle("shelf"), "Shelf");
  assert.equal(ops.focused(state).viewPlugin, "shelf");
  assert.equal(ops.activeTab(state), null);
});

test("opening the same plugin again stays on the default view", () => {
  const state = ops.create();
  const first = ops.openPlugin(state, "goals");
  const second = ops.openPlugin(state, "goals");
  assert.equal(first.id, second.id);
  assert.equal(ops.focused(state).viewPlugin, "goals");
  assert.equal(ops.activeTab(state), null);
  assert.equal(ops.focused(state).tabs.filter((tab) => tab.kind === "mother").length, 0);
});

test("an item tab sits beside home without a plugin mother tab", () => {
  const state = ops.create();
  ops.openPlugin(state, "goals");
  ops.openItem(state, "goals", "goal-1", "发布");
  const pane = ops.focused(state);
  assert.equal(pane.tabs.filter((tab) => tab.plugin === "goals").length, 1);
  assert.equal(ops.activeTab(state)?.itemId, "goal-1");
  assert.equal(pane.groups.length, 0);
  assert.equal(pane.tabs.some((tab) => tab.groupId), false);
  assert.equal(pane.tabs.some((tab) => tab.kind === "mother"), false);
});

test("closing the last tab in the workspace restores home", () => {
  const state = ops.create();
  const home = ops.activeTab(state);
  ops.closeTab(state, state.focusedPaneId, home.id);
  assert.equal(ops.activeTab(state)?.kind, "home");
  assert.equal(ops.countTabs(state), 1);
});

test("closing home while a plugin view is open leaves that work", () => {
  const state = ops.create();
  const home = ops.activeTab(state);
  ops.openPlugin(state, "sessions");
  ops.closeTab(state, state.focusedPaneId, home.id);
  assert.equal(ops.activeTab(state), null);
  assert.equal(ops.focused(state).viewPlugin, "sessions");
  assert.equal(ops.focused(state).tabs.some((tab) => tab.kind === "home"), false);
});

test("moving the last tab out of a plugin view keeps that pane", () => {
  const state = ops.create();
  const home = ops.activeTab(state);
  const paneId = state.focusedPaneId;
  ops.openPlugin(state, "goals");
  ops.splitPane(state, paneId, "left", "move", paneId, home.id);
  assert.equal(state.panes.length, 2);
  assert.equal(state.panes.some((pane) => pane.viewPlugin === "goals" && pane.tabs.length === 0), true);
  assert.equal(state.panes.some((pane) => pane.tabs.some((tab) => tab.kind === "home")), true);
});

test("empty panes are allowed after a split, and plugin defaults can exist in two panes", () => {
  const state = ops.create();
  ops.openPlugin(state, "goals");
  ops.splitPane(state, state.focusedPaneId, "right", "copy");
  assert.equal(state.panes.length, 2);
  assert.equal(state.panes[0].viewPlugin, "goals");
  assert.equal(state.panes[1].viewPlugin, "goals");
  assert.equal(state.panes.every((pane) => pane.tabs.some((tab) => tab.kind === "mother")), false);
  assert.notEqual(state.panes[0].id, state.panes[1].id);
});

test("split supports nested groups beyond three panes", () => {
  const state = ops.create();
  ops.splitPane(state, state.focusedPaneId, "right", "copy");
  ops.splitPane(state, state.focusedPaneId, "right", "copy");
  ops.splitPane(state, state.focusedPaneId, "right", "copy");
  assert.equal(state.panes.length, 4);
});

test("closing a split pane restores a single full-width pane", () => {
  const state = ops.create();
  ops.splitPane(state, state.focusedPaneId, "right", "copy");
  assert.equal(state.panes.length, 2);
  ops.closePane(state, state.panes[1].id);
  assert.equal(state.panes.length, 1);
  assert.deepEqual(state.layout.sizes, [1]);
});

test("a leftover half-width size is normalized to fill the stage", () => {
  const state = ops.create();
  state.layout.sizes = [0.5];
  ops.normalizeLayout(state);
  assert.deepEqual(state.layout.sizes, [1]);
});

test("market is exclusive and does not add a tab", () => {
  const state = ops.create();
  ops.setExclusive(state, "market");
  assert.equal(state.exclusive, "market");
  assert.equal(ops.activeTab(state)?.kind, "home");
});


test("splitting a target uses the dragged tab and preserves an orthogonal layout", () => {
  const state = ops.create();
  const original = state.focusedPaneId;
  const goal = ops.openItem(state, "goals", "CORE", "Core");
  ops.splitPane(state, original, "right", "copy");
  const right = state.focusedPaneId;
  ops.openPlugin(state, "feed");
  ops.splitPane(state, right, "bottom", "move", original, goal.id);
  assert.equal(state.layout.tree.direction, "row");
  assert.equal(state.layout.tree.children[1].direction, "column");
  assert.equal(ops.activeTab(state)?.itemId, "CORE");
  assert.equal(state.panes.find(p => p.id === original).tabs.some(t => t.id === goal.id), false);
  const restored = JSON.parse(JSON.stringify(state));
  ops.normalizeLayout(restored);
  assert.deepEqual(restored.layout.tree, state.layout.tree);
});

test("moving tabs reorders and closing the last tab merges its split", () => {
  const state = ops.create();
  const home = ops.activeTab(state);
  const goal = ops.openItem(state, "goals", "CORE", "Core");
  ops.moveTab(state, state.focusedPaneId, goal.id, state.focusedPaneId, home.id);
  assert.equal(ops.focused(state).tabs[0].id, goal.id);
  ops.splitPane(state, state.focusedPaneId, "bottom", "copy");
  ops.closeTab(state, state.focusedPaneId, ops.activeTab(state).id);
  assert.equal(state.panes.length, 1);
  assert.equal(state.layout.tree.paneId, state.panes[0].id);
});

test('pinning keeps tabs first without duplicates and survives moving, copying and restoring', () => {
  const state = ops.create();
  const home = ops.activeTab(state);
  const goal = ops.openItem(state, 'goals', 'CORE', '主目标');
  ops.openPlugin(state, 'feed');
  const pane = ops.focused(state);
  ops.togglePinned(state, pane.id, goal.id);
  assert.equal(pane.tabs[0].id, goal.id);
  assert.equal(pane.tabs[0].pinned, true);
  assert.equal(ops.activeTab(state), null);
  assert.equal(ops.focused(state).viewPlugin, "feed");
  ops.openItem(state, 'goals', 'SECOND', '另一个目标');
  assert.equal(pane.tabs[0].id, goal.id);
  assert.equal(pane.tabs[1].id, home.id);
  ops.splitPane(state, pane.id, 'bottom', 'copy', pane.id, goal.id);
  const other = ops.focused(state);
  assert.equal(other.tabs[0].pinned, true);
  ops.togglePinned(state, other.id, other.tabs[0].id);
  assert.equal(other.tabs[0].pinned, false);
  assert.equal(pane.tabs[0].pinned, true);
  ops.moveTab(state, pane.id, goal.id, other.id, null);
  assert.equal(other.tabs.filter(tab => tab.itemId === 'CORE').length, 2);
  assert.equal(ops.activeTab(state)?.id, goal.id);
  assert.equal(goal.pinned, true);
  const restored = JSON.parse(JSON.stringify(state));
  ops.ensureHome(restored);
  assert.equal(ops.activeTab(restored)?.itemId, 'CORE');
  assert.equal(ops.activeTab(restored)?.pinned, true);
});

test("opening another plugin or item adds a tab without replacing existing ones", () => {
  const state = ops.create();
  const canvas = ops.openPlugin(state, "goals");
  assert.equal(ops.countTabs(state), 1);
  const goal = ops.openItem(state, "goals", "goal-1", "发布");
  assert.notEqual(goal.id, canvas.id);
  assert.equal(goal.kind, "item");
  assert.equal("preview" in goal, false);
  assert.equal(ops.focused(state).tabs.some((tab) => tab.kind === "mother"), false);
  const again = ops.openItem(state, "goals", "goal-1", "发布");
  assert.equal(again.id, goal.id);
  const other = ops.openItem(state, "goals", "goal-2", "下一个");
  assert.notEqual(other.id, goal.id);
  assert.equal(ops.focused(state).tabs.filter((tab) => tab.plugin === "goals").length, 2);
  assert.equal(ops.openPlugin(state, "goals").id, canvas.id);
  assert.equal(ops.activeTab(state), null);
  assert.equal(ops.focused(state).tabs.some((tab) => tab.id === goal.id), true);
});

test("opening an already open item activates it and leaves other tabs", () => {
  const state = ops.create();
  const first = ops.openItem(state, "goals", "goal-1", "发布");
  ops.openPlugin(state, "sessions");
  const again = ops.openItem(state, "goals", "goal-1", "发布");
  assert.equal(again.id, first.id);
  assert.equal(ops.focused(state).tabs.filter((tab) => tab.itemId === "goal-1").length, 1);
  assert.equal(ops.focused(state).tabs.some((tab) => tab.plugin === "sessions" && tab.kind === "mother"), false);
  assert.equal(ops.focused(state).viewPlugin, "goals");
});

test("a split pane can hold the same plugin default the other pane already has", () => {
  const state = ops.create();
  const left = state.focusedPaneId;
  ops.splitPane(state, left, "right", "copy");
  const right = state.panes.find((pane) => pane.id !== left).id;
  state.focusedPaneId = left;
  const leftGoals = ops.openPlugin(state, "goals");
  state.focusedPaneId = right;
  const rightGoals = ops.openPlugin(state, "goals");
  assert.equal(leftGoals.id, rightGoals.id);
  assert.equal(state.panes.every((pane) => pane.viewPlugin === "goals" && pane.tabs.every((tab) => tab.kind !== "mother")), true);
  assert.equal(ops.openPlugin(state, "goals").id, rightGoals.id);
  state.focusedPaneId = left;
  assert.equal(ops.openPlugin(state, "goals").id, leftGoals.id);
});

test("restored mother tabs are dropped", () => {
  const state = ops.create();
  const pane = ops.focused(state);
  pane.tabs.push({ id: "old-mother", plugin: "goals", kind: "mother", title: "画布", preview: true });
  pane.activeTabId = "old-mother";
  ops.normalizeLayout(state);
  assert.equal(pane.tabs.some((tab) => tab.kind === "mother"), false);
  assert.equal(pane.viewPlugin, "goals");
  assert.equal(ops.activeTab(state), null);
});

test("manual groups stay contiguous, collapse is recorded, and pinning leaves the group", () => {
  const state = ops.create();
  const home = ops.activeTab(state);
  const goal = ops.openItem(state, "goals", "CORE", "Core");
  ops.openPlugin(state, "sessions");
  const pane = ops.focused(state);
  ops.addTabToNewGroup(state, pane.id, goal.id);
  assert.equal(pane.groups.length, 1);
  ops.addTabToGroup(state, pane.id, home.id, pane.groups[0].id);
  const grouped = pane.tabs.filter((tab) => tab.groupId === pane.groups[0].id);
  assert.equal(grouped.length, 2);
  assert.equal(pane.tabs.indexOf(grouped[1]), pane.tabs.indexOf(grouped[0]) + 1);
  ops.toggleGroup(state, pane.id, pane.groups[0].id);
  assert.equal(pane.groups[0].collapsed, true);
  ops.togglePinned(state, pane.id, goal.id);
  assert.equal(goal.pinned, true);
  assert.equal(goal.groupId, undefined);
  assert.equal(pane.tabs[0].id, goal.id);
});

test("split copies do not keep the source group", () => {
  const state = ops.create();
  const goal = ops.openItem(state, "goals", "CORE", "Core");
  ops.addTabToNewGroup(state, state.focusedPaneId, goal.id);
  ops.splitPane(state, state.focusedPaneId, "right", "copy");
  const copy = ops.activeTab(state);
  assert.equal(copy.groupId, undefined);
  assert.equal(ops.focused(state).groups.length, 0);
  assert.equal(state.panes[0].groups.length, 1);
});

test("dropping a tab after a group joins that group", () => {
  const state = ops.create();
  const home = ops.activeTab(state);
  const goal = ops.openItem(state, "goals", "CORE", "Core");
  const session = ops.openItem(state, "sessions", "s1", "Session");
  ops.addTabToNewGroup(state, state.focusedPaneId, goal.id);
  ops.moveTab(state, state.focusedPaneId, session.id, state.focusedPaneId, null);
  assert.equal(session.groupId, goal.groupId);
  ops.moveTab(state, state.focusedPaneId, session.id, state.focusedPaneId, home.id);
  assert.equal(session.groupId, undefined);
});

test("closing the last item returns to the plugin default instead of home", () => {
  const state = ops.create();
  ops.openItem(state, "goals", "goal-1", "发布");
  ops.closeTab(state, state.focusedPaneId, ops.activeTab(state).id);
  assert.equal(ops.activeTab(state), null);
  assert.equal(ops.focused(state).viewPlugin, "goals");
  assert.equal(ops.focused(state).tabs.some((tab) => tab.kind === "home"), true);
});

test("old plugin collapsed maps are discarded and not restored as user groups", () => {
  const state = ops.create();
  ops.openPlugin(state, "goals");
  ops.openItem(state, "goals", "CORE", "Core");
  const pane = ops.focused(state);
  pane.collapsed = { goals: true };
  ops.normalizeLayout(state);
  assert.equal("collapsed" in pane, false);
  assert.equal(pane.groups.length, 0);
  assert.equal(pane.tabs.some((tab) => tab.groupId), false);
});
