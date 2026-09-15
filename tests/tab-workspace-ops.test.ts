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

test("opening a plugin adds a mother tab without removing home", () => {
  const state = ops.create();
  ops.openPlugin(state, "goals");
  assert.equal(ops.countTabs(state), 2);
  assert.equal(ops.activeTab(state)?.kind, "mother");
  assert.equal(ops.activeTab(state)?.plugin, "goals");
  assert.ok(ops.focused(state).tabs.some((tab) => tab.kind === "home"));
});

test("opening the same plugin again only activates the mother tab", () => {
  const state = ops.create();
  ops.openPlugin(state, "goals");
  ops.openPlugin(state, "goals");
  assert.equal(ops.focused(state).tabs.filter((tab) => tab.plugin === "goals" && tab.kind === "mother").length, 1);
});

test("an item tab shares the plugin group and can sit beside the mother tab", () => {
  const state = ops.create();
  ops.openPlugin(state, "goals");
  ops.openItem(state, "goals", "goal-1", "发布");
  const pane = ops.focused(state);
  assert.equal(pane.tabs.filter((tab) => tab.plugin === "goals").length, 2);
  assert.equal(ops.activeTab(state)?.itemId, "goal-1");
});

test("closing the last tab in the workspace restores home", () => {
  const state = ops.create();
  const home = ops.activeTab(state);
  ops.closeTab(state, state.focusedPaneId, home.id);
  assert.equal(ops.activeTab(state)?.kind, "home");
  assert.equal(ops.countTabs(state), 1);
});

test("closing home while another tab is open leaves that work", () => {
  const state = ops.create();
  const home = ops.activeTab(state);
  ops.openPlugin(state, "sessions");
  ops.closeTab(state, state.focusedPaneId, home.id);
  assert.equal(ops.activeTab(state)?.plugin, "sessions");
  assert.equal(ops.focused(state).tabs.some((tab) => tab.kind === "home"), false);
});

test("empty panes are allowed after a split, and the same tab can exist in two panes", () => {
  const state = ops.create();
  ops.openPlugin(state, "goals");
  const mother = ops.activeTab(state);
  ops.splitPane(state, state.focusedPaneId, "right", "copy");
  assert.equal(state.panes.length, 2);
  assert.equal(state.panes[0].tabs.some((tab) => ops.tabKey(tab) === ops.tabKey(mother)), true);
  assert.equal(state.panes[1].tabs.some((tab) => tab.plugin === "goals" && tab.kind === "mother"), true);
  assert.notEqual(state.panes[0].tabs[0].id, state.panes[1].tabs[0].id);
});

test("split stops at three panes", () => {
  const state = ops.create();
  ops.splitPane(state, state.focusedPaneId, "right", "copy");
  ops.splitPane(state, state.focusedPaneId, "right", "copy");
  ops.splitPane(state, state.focusedPaneId, "right", "copy");
  assert.equal(state.panes.length, 3);
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
