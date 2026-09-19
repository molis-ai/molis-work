import assert from "node:assert/strict";
import test from "node:test";
import { TAB_WORKSPACE_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/tab-workspace.js";
import { LINEAR_DENSITY_STYLES } from "../apps/workbench/src/styles/linear-density.js";
import { TAB_WORKSPACE_STYLES } from "../apps/workbench/src/styles/tab-workspace.js";
import { createTabWorkspaceOps } from "../apps/workbench/src/tab-workspace-ops.js";
import {
  clampSplitRatio,
  focusedPaneBoxAfterDrop,
  layoutPaneBoxes,
  splitDropEdge,
  TAB_SPLIT_EDGE_X,
  TAB_SPLIT_EDGE_X_CSS,
  TAB_SPLIT_EDGE_Y,
  TAB_SPLIT_RATIO,
} from "../apps/workbench/src/tab-split-drop.js";
import { COSS_CONTROL_STYLES } from "../packages/design-system/src/styles/coss-controls.js";

test("split drop edges prefer left/right over top/bottom and leave a center rest zone", () => {
  assert.equal(splitDropEdge(0.1, 0.5), "left");
  assert.equal(splitDropEdge(0.9, 0.5), "right");
  assert.equal(splitDropEdge(0.5, 0.1), "top");
  assert.equal(splitDropEdge(0.5, 0.9), "bottom");
  assert.equal(splitDropEdge(0.4, 0.5), null);
  assert.equal(splitDropEdge(TAB_SPLIT_EDGE_X - 0.001, 0.5), "left");
  assert.equal(splitDropEdge(TAB_SPLIT_EDGE_X + 0.001, 0.5), null);
  assert.equal(splitDropEdge(0.1, 0.1), "left");
  assert.equal(splitDropEdge(0.9, 0.1), "right");
});

test("split ratio clamp is shared by preview layout and sash resizing", () => {
  assert.equal(clampSplitRatio(0.5), 0.5);
  assert.equal(clampSplitRatio(0.05), 0.15);
  assert.equal(clampSplitRatio(0.95), 0.85);
});

test("split preview uses the same half-pane ratio as the real split", () => {
  assert.equal(TAB_SPLIT_RATIO, 0.5);
  assert.match(createTabWorkspaceOps.toString(), /ratio:\.5/);
  assert.match(TAB_WORKSPACE_STYLES, /\[data-split-drop-preview\]::after \{ content: ""; position: fixed/);
  assert.match(TAB_WORKSPACE_STYLES, /animation: feedback-reveal 120ms ease-out/);
  assert.doesNotMatch(TAB_WORKSPACE_STYLES, /--tab-split-ratio/);
  assert.doesNotMatch(TAB_WORKSPACE_STYLES, /\[data-drop-preview="left"\]::after/);
  assert.doesNotMatch(TAB_WORKSPACE_STYLES, /\[data-drop-preview\]::after \{[^}]*inset: 44px/);
  assert.doesNotMatch(LINEAR_DENSITY_STYLES, /\[data-drop-preview\]::after \{ inset: 32px/);
  assert.match(TAB_WORKSPACE_STYLES, new RegExp(`--tab-split-edge-x: ${TAB_SPLIT_EDGE_X_CSS.replace("%", "\\%")}`));
  assert.match(TAB_WORKSPACE_STYLES, /\[data-split\] \.tab-drop-edges \{ top: var\(--tab-strip-h\); \}/);
  assert.match(TAB_WORKSPACE_STYLES, /\[data-tab-edge="left"\], body\.immersive-workbench \.tab-drop-edges \[data-tab-edge="right"\] \{ top: 0; bottom: 0; width: var\(--tab-split-edge-x\); z-index: 5; \}/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, new RegExp(`const TAB_SPLIT_EDGE_X = ${TAB_SPLIT_EDGE_X}`));
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, new RegExp(`const TAB_SPLIT_EDGE_Y = ${TAB_SPLIT_EDGE_Y}`));
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /const clampSplitRatio/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /paintResultPreview/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /paintTabReorder/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /paintDropPreview/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /focusedPaneBoxAfterDrop/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /tabDragCopy/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /querySelector\("\[data-tab-pane-body\]"\)/);
  assert.match(TAB_WORKSPACE_STYLES, /--tab-sash-gutter: 8px;/);
  assert.match(TAB_WORKSPACE_STYLES, /--tab-sash-hit: 12px;/);
  assert.match(TAB_WORKSPACE_STYLES, /\.tab-sash-handle \{/);
  assert.match(TAB_WORKSPACE_STYLES, /\.tab-split\[data-direction="row"\] > \.tab-sash::before \{[\s\S]*width: 1px;/);
  assert.doesNotMatch(TAB_WORKSPACE_STYLES, /\.tab-sash:hover, body\.immersive-workbench \.tab-sash:focus-visible \{ background: var\(--blue\)/);
  assert.doesNotMatch(TAB_WORKSPACE_STYLES, /\.tab-split\[data-direction="row"\] > \.tab-sash \{ width: 5px;/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /tab-sash-handle/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /#icon-grip/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /TAB_SASH_INSET/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /is-dragging/);
  assert.doesNotMatch(COSS_CONTROL_STYLES, /tab-sash:is\(:hover,:active\) \{ background: var\(--blue\)/);
  assert.doesNotMatch(TAB_WORKSPACE_STYLES, /tab-pane\.is-focused > \.tab-strip \{ box-shadow: inset 0 2px var\(--line-strong\)/);
});

test("layout pane boxes follow nested split ratios", () => {
  const boxes = layoutPaneBoxes({
    direction: "row",
    ratio: 0.5,
    children: [
      { paneId: "left" },
      { direction: "column", ratio: 0.5, children: [{ paneId: "top" }, { paneId: "bottom" }] },
    ],
  });
  assert.deepEqual(boxes.find((box) => box.paneId === "left"), { paneId: "left", x: 0, y: 0, w: 50, h: 100 });
  assert.deepEqual(boxes.find((box) => box.paneId === "top"), { paneId: "top", x: 50, y: 0, w: 50, h: 50 });
  assert.deepEqual(boxes.find((box) => box.paneId === "bottom"), { paneId: "bottom", x: 50, y: 50, w: 50, h: 50 });
});

test("already-split later drags preview the pane that exists after drop", () => {
  const ops = createTabWorkspaceOps();
  const state = ops.create();
  const left = state.focusedPaneId;
  const home = ops.activeTab(state);
  ops.splitPane(state, left, "right", "copy");
  const right = state.focusedPaneId;

  const copyLeft = focusedPaneBoxAfterDrop(state, ops, { paneId: right, edge: "left" }, true, left, home.id);
  assert.equal(copyLeft?.x, 50);
  assert.equal(copyLeft?.y, 0);
  assert.equal(copyLeft?.w, 25);
  assert.equal(copyLeft?.h, 100);

  const copyRight = focusedPaneBoxAfterDrop(state, ops, { paneId: right, edge: "right" }, true, left, home.id);
  assert.equal(copyRight?.x, 75);
  assert.equal(copyRight?.w, 25);

  const copyTop = focusedPaneBoxAfterDrop(state, ops, { paneId: right, edge: "top" }, true, left, home.id);
  assert.equal(copyTop?.x, 50);
  assert.equal(copyTop?.y, 0);
  assert.equal(copyTop?.w, 50);
  assert.equal(copyTop?.h, 50);

  const copyBottom = focusedPaneBoxAfterDrop(state, ops, { paneId: right, edge: "bottom" }, true, left, home.id);
  assert.equal(copyBottom?.x, 50);
  assert.equal(copyBottom?.y, 50);
  assert.equal(copyBottom?.w, 50);
  assert.equal(copyBottom?.h, 50);

  const copyCenter = focusedPaneBoxAfterDrop(state, ops, { paneId: right }, true, left, home.id);
  assert.equal(copyCenter?.x, 50);
  assert.equal(copyCenter?.w, 50);
  assert.equal(copyCenter?.h, 100);

  const moveLeft = focusedPaneBoxAfterDrop(state, ops, { paneId: right, edge: "left" }, false, left, home.id);
  assert.equal(moveLeft?.x, 0);
  assert.equal(moveLeft?.w, 50);
  assert.equal(moveLeft?.h, 100);

  const moveRight = focusedPaneBoxAfterDrop(state, ops, { paneId: right, edge: "right" }, false, left, home.id);
  assert.equal(moveRight?.x, 50);
  assert.equal(moveRight?.w, 50);

  const moveBottom = focusedPaneBoxAfterDrop(state, ops, { paneId: right, edge: "bottom" }, false, left, home.id);
  assert.equal(moveBottom?.x, 0);
  assert.equal(moveBottom?.y, 50);
  assert.equal(moveBottom?.w, 100);
  assert.equal(moveBottom?.h, 50);

  const moveCenter = focusedPaneBoxAfterDrop(state, ops, { paneId: right }, false, left, home.id);
  assert.equal(moveCenter?.x, 0);
  assert.equal(moveCenter?.w, 100);
  assert.equal(moveCenter?.h, 100);

  const samePaneNoop = focusedPaneBoxAfterDrop(state, ops, { paneId: left, edge: "left" }, false, left, home.id);
  assert.equal(samePaneNoop?.x, 0);
  assert.equal(samePaneNoop?.w, 50);
  assert.equal(state.panes.length, 2);

  const single = ops.create();
  ops.normalizeLayout(single);
  const singleId = single.focusedPaneId;
  const singleHome = ops.activeTab(single);
  const singleMove = focusedPaneBoxAfterDrop(single, ops, { paneId: singleId, edge: "left" }, false, singleId, singleHome.id);
  assert.equal(singleMove?.w, 100);
  const singleCopy = focusedPaneBoxAfterDrop(single, ops, { paneId: singleId, edge: "left" }, true, singleId, singleHome.id);
  assert.equal(singleCopy?.w, 50);

  const twoTab = ops.create();
  const twoHome = ops.activeTab(twoTab);
  const goal = ops.openItem(twoTab, "goals", "CORE", "Core");
  const twoLeft = twoTab.focusedPaneId;
  ops.splitPane(twoTab, twoLeft, "right", "copy");
  const twoRight = twoTab.focusedPaneId;
  const nestedKeepSource = focusedPaneBoxAfterDrop(twoTab, ops, { paneId: twoRight, edge: "left" }, false, twoLeft, goal.id);
  assert.equal(nestedKeepSource?.x, 50);
  assert.equal(nestedKeepSource?.w, 25);
  assert.equal(twoTab.panes.find((pane: { id: string }) => pane.id === twoLeft)?.tabs.some((tab: { id: string }) => tab.id === twoHome.id), true);

  ops.splitPane(state, right, "bottom", "copy");
  const bottom = state.focusedPaneId;
  const threeCopyLeft = focusedPaneBoxAfterDrop(state, ops, { paneId: bottom, edge: "left" }, true, left, home.id);
  assert.equal(threeCopyLeft?.x, 50);
  assert.equal(threeCopyLeft?.y, 50);
  assert.equal(threeCopyLeft?.w, 25);
  assert.equal(threeCopyLeft?.h, 50);
});
