import assert from "node:assert/strict";
import test from "node:test";
import { TAB_WORKSPACE_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/tab-workspace.js";
import { LINEAR_DENSITY_STYLES } from "../apps/workbench/src/styles/linear-density.js";
import { TAB_WORKSPACE_STYLES } from "../apps/workbench/src/styles/tab-workspace.js";
import { createTabWorkspaceOps } from "../apps/workbench/src/tab-workspace-ops.js";
import { tabIdsAfterMove, TAB_REORDER_MS } from "../apps/workbench/src/tab-reorder.js";

test("moveTab preview order matches the drop that will commit", () => {
  const ops = createTabWorkspaceOps();
  const state = ops.create();
  const home = ops.activeTab(state);
  const goal = ops.openItem(state, "goals", "CORE", "Core");
  const paneId = state.focusedPaneId;
  const moved = tabIdsAfterMove(state, ops, paneId, goal.id, paneId, home.id, false);
  assert.deepEqual(moved.ids, [goal.id, home.id]);
  assert.equal(moved.movingId, goal.id);
  assert.equal(ops.focused(state).tabs[0].id, home.id, "preview clones state and does not mutate the live workspace");
});

test("copy preview inserts a new id and leaves the source in place", () => {
  const ops = createTabWorkspaceOps();
  const state = ops.create();
  const home = ops.activeTab(state);
  const goal = ops.openItem(state, "goals", "CORE", "Core");
  const paneId = state.focusedPaneId;
  const copied = tabIdsAfterMove(state, ops, paneId, home.id, paneId, goal.id, true);
  assert.equal(copied.ids.length, 3);
  assert.equal(copied.ids[0], home.id);
  assert.equal(copied.ids[2], goal.id);
  assert.notEqual(copied.movingId, home.id);
  assert.equal(copied.ids[1], copied.movingId);
  assert.equal(ops.focused(state).tabs.length, 2);
});

test("strip reorder preview is a slot plus FLIP, not a pane overlay", () => {
  assert.equal(TAB_REORDER_MS, 190);
  assert.match(TAB_WORKSPACE_STYLES, /\[data-tab-reorder-slot\]/);
  assert.match(TAB_WORKSPACE_STYLES, /\.tab-item\.is-tab-drag-source/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /paintTabReorder/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /tabIdsAfterMove/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /prefers-reduced-motion: reduce/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /duration: reduce \? 0 : TAB_REORDER_MS/);
  assert.match(LINEAR_DENSITY_STYLES, /\[data-tab-reorder-slot\] \{ height: 26px/);
});
