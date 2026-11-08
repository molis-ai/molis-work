import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createTabWorkspaceOps, isCurrentTabWorkspace, isLoosePluginTab, settlePluginTabs, withLayout, withPluginGroups, withSidePane } from "../apps/workbench/src/tab-workspace-ops.js";

// The workspace the page builds: its right side is part of the saved shape (specs/product-flow-governance §4.6.2 口径 1).
const ops = withLayout(withSidePane(createTabWorkspaceOps()));

// 07-S2 口径 3: the project home is not a tab; an empty pane shows it, and the Dock's 项目首页 goes there.
test("PFG-23 a fresh workspace shows the project home with no tab", () => {
  const state = ops.create();
  assert.equal(ops.countTabs(state), 0);
  assert.equal(ops.activeTab(state), null);
  assert.equal(ops.shownPlugin(ops.focused(state)), "home");
  assert.equal(state.exclusive, null);
  assert.equal(state.solo, null);
});

// T-114 (PG-094 ②): a work surface is its plugin's id; Goals has no alias. Feed's second surface `sources` is still Feed's.
test("RAC-1932 a work surface names its plugin by its id, with no Goals alias", () => {
  assert.deepEqual(["goals", "goal", "pages", "feed", "sources"].map((surface) => ops.pluginOfSurface(surface)), ["goals", "goal", "pages", "feed", "feed"]);
});

test("opening a plugin shows its default view without adding a mother tab", () => {
  const state = ops.create();
  ops.openPlugin(state, "goals");
  assert.equal(ops.countTabs(state), 0);
  assert.equal(ops.activeTab(state), null);
  assert.equal(ops.focused(state).viewPlugin, "goals");
  assert.equal(ops.focused(state).tabs.some((tab) => tab.kind === "mother"), false);
});

test("Feed is a named plugin view, not a later-only plugin", () => {
  const named = createTabWorkspaceOps({ feed: "Feed" });
  const state = named.create();
  const tab = named.openPlugin(state, "feed");
  assert.equal(tab.plugin, "feed");
  assert.equal(named.pluginTitle("feed"), "Feed");
  assert.equal(named.focused(state).viewPlugin, "feed");
  assert.equal(named.activeTab(state), null);
});

test("RAC-84 PG-060 tab-title rules fall back to a plugin id and retain Host surface titles", () => {
  // Fallback rules only: Manifest title derivation is covered by plugin-declarative-mounting, not this unit test.
  assert.equal(ops.pluginTitle("feed"), "feed");
  assert.equal(ops.pluginTitle("lingguang"), "lingguang");
  assert.equal(ops.pluginTitle("home"), "项目首页");
  assert.equal(ops.pluginTitle("characters"), "Characters");
  assert.equal(ops.pluginTitle("market"), "插件市场");
  assert.equal(createTabWorkspaceOps({ home: "Project home" }).pluginTitle("home"), "Project home");
  assert.equal(createTabWorkspaceOps({ market: "Plugin market" }).pluginTitle("market"), "Plugin market");
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

test("an item tab opens without a plugin mother tab", () => {
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

test("PFG-23 closing the last tab in the workspace goes to the project home", () => {
  const state = ops.create();
  const goal = ops.openItem(state, "goals", "CORE", "Core");
  ops.focused(state).viewPlugin = null;
  ops.closeTab(state, state.focusedPaneId, goal.id);
  assert.equal(ops.activeTab(state), null);
  assert.equal(ops.shownPlugin(ops.focused(state)), "home");
  assert.equal(ops.countTabs(state), 0);
});

test("PFG-23 opening the project home leaves the tabs and shows no current tab", () => {
  const state = ops.create();
  ops.openItem(state, "goals", "CORE", "Core");
  // No tab and no view to write to, so nothing that looks like one comes back.
  assert.equal(ops.openPlugin(state, "home"), null);
  assert.equal(ops.activeTab(state), null);
  assert.equal(ops.focused(state).viewPlugin, null);
  assert.equal(ops.shownPlugin(ops.focused(state)), "home");
  assert.equal(ops.countTabs(state), 1);
});

test("moving the last tab out of a plugin view keeps that pane", () => {
  const state = ops.create();
  const paneId = state.focusedPaneId;
  const goal = ops.openItem(state, "goals", "CORE", "Core");
  ops.openPlugin(state, "inbox");
  ops.splitPane(state, paneId, "left", "move", paneId, goal.id);
  assert.equal(state.panes.length, 2);
  assert.equal(state.panes.some((pane) => pane.viewPlugin === "inbox" && pane.tabs.length === 0), true);
  assert.equal(state.panes.some((pane) => pane.tabs.some((tab) => tab.itemId === "CORE")), true);
});

test("PFG-23 a pane on the project home splits off another on it; nothing shown cannot be moved", () => {
  const state = ops.create();
  ops.splitPane(state, state.focusedPaneId, "right", "copy");
  assert.equal(state.panes.length, 2);
  assert.ok(state.panes.every((pane) => ops.shownPlugin(pane) === "home"));
  ops.splitPane(state, state.focusedPaneId, "right", "move");
  assert.equal(state.panes.length, 2);
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
  assert.equal(ops.countTabs(state), 0);
});


test("PFG-22 a pane's number follows the stage as it reads, not the order the panes were opened in", () => {
  const state = ops.create();
  const first = state.focusedPaneId;
  ops.openItem(state, "goals", "CORE", "Core");
  ops.splitPane(state, first, "top", "copy");
  const above = state.focusedPaneId;
  ops.splitPane(state, first, "left", "copy");
  const left = state.focusedPaneId;
  // The list of panes is not the stage: a stored workspace keeps them in whatever order it was written in.
  state.panes.reverse();
  assert.notEqual(state.panes[0]!.id, above);
  assert.deepEqual([above, left, first].map((id) => ops.paneNumber(state, id)), [1, 2, 3], "the one above is 第 1 栏, then left to right below it");
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
  const first = ops.openItem(state, "pages", "DOC", "Doc");
  const goal = ops.openItem(state, "goals", "CORE", "Core");
  ops.moveTab(state, state.focusedPaneId, goal.id, state.focusedPaneId, first.id);
  assert.equal(ops.focused(state).tabs[0].id, goal.id);
  ops.splitPane(state, state.focusedPaneId, "bottom", "copy");
  ops.closeTab(state, state.focusedPaneId, ops.activeTab(state).id);
  assert.equal(state.panes.length, 1);
  assert.equal(state.layout.tree.paneId, state.panes[0].id);
});

test('pinning keeps tabs first without duplicates and survives moving, copying and restoring', () => {
  const state = ops.create();
  const doc = ops.openItem(state, 'pages', 'DOC', '文稿');
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
  assert.equal(pane.tabs[1].id, doc.id);
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
  ops.normalizeLayout(restored);
  assert.equal(ops.activeTab(restored)?.itemId, 'CORE');
  assert.equal(ops.activeTab(restored)?.pinned, true);
});

test("opening another plugin or item adds a tab without replacing existing ones", () => {
  const state = ops.create();
  const canvas = ops.openPlugin(state, "goals");
  assert.equal(ops.countTabs(state), 0);
  const goal = ops.openItem(state, "goals", "goal-1", "发布");
  assert.notEqual(goal.id, canvas.id);
  assert.equal(goal.kind, "item");
  assert.equal("preview" in goal, false);
  assert.equal(ops.focused(state).tabs.some((tab) => tab.kind === "mother"), false);
  const again = ops.openItem(state, "goals", "goal-1", "发布（已改名）");
  assert.equal(again.id, goal.id);
  assert.equal(again.title, "发布（已改名）");
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
  ops.openPlugin(state, "inbox");
  const again = ops.openItem(state, "goals", "goal-1", "发布");
  assert.equal(again.id, first.id);
  assert.equal(ops.focused(state).tabs.filter((tab) => tab.itemId === "goal-1").length, 1);
  assert.equal(ops.focused(state).tabs.some((tab) => tab.plugin === "inbox" && tab.kind === "mother"), false);
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

test("W1-18-TAB-FORMAT-01: current grouped items and nested panes remain valid after serialization", () => {
  const state = ops.create();
  const goal = ops.openItem(state, "goals", "CORE", "Core");
  ops.addTabToNewGroup(state, state.focusedPaneId, goal.id);
  ops.toggleGroup(state, state.focusedPaneId, ops.focused(state).groups[0].id);
  ops.splitPane(state, state.focusedPaneId, "right", "copy");
  ops.openItem(state, "pages", "DOC", "Document");
  ops.splitPane(state, state.focusedPaneId, "bottom", "copy");
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(isCurrentTabWorkspace(restored), true);
  ops.normalizeLayout(restored);
  assert.equal(restored.panes.length, 3);
  assert.equal(restored.panes[0].groups[0].collapsed, true);
  assert.equal(ops.activeTab(restored).itemId, "DOC");
  assert.equal(restored.layout.tree.children[1].children.length, 2);
});

test("manual groups stay contiguous, collapse is recorded, and pinning leaves the group", () => {
  const state = ops.create();
  const doc = ops.openItem(state, "pages", "DOC", "Doc");
  const goal = ops.openItem(state, "goals", "CORE", "Core");
  ops.openPlugin(state, "inbox");
  const pane = ops.focused(state);
  ops.addTabToNewGroup(state, pane.id, goal.id);
  assert.equal(pane.groups.length, 1);
  ops.addTabToGroup(state, pane.id, doc.id, pane.groups[0].id);
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
  const doc = ops.openItem(state, "pages", "DOC", "Doc");
  const goal = ops.openItem(state, "goals", "CORE", "Core");
  const session = ops.openItem(state, "inbox", "s1", "Entry");
  ops.addTabToNewGroup(state, state.focusedPaneId, goal.id);
  ops.moveTab(state, state.focusedPaneId, session.id, state.focusedPaneId, null);
  assert.equal(session.groupId, goal.groupId);
  ops.moveTab(state, state.focusedPaneId, session.id, state.focusedPaneId, doc.id);
  assert.equal(session.groupId, undefined);
});

test("closing the last item returns to the plugin default instead of home", () => {
  const state = ops.create();
  ops.openItem(state, "goals", "goal-1", "发布");
  ops.closeTab(state, state.focusedPaneId, ops.activeTab(state).id);
  assert.equal(ops.activeTab(state), null);
  assert.equal(ops.focused(state).viewPlugin, "goals");
});

test("PFG-23 opening the project home clears a leftover plugin view", () => {
  const state = ops.create();
  ops.openPlugin(state, "functions");
  assert.equal(ops.focused(state).viewPlugin, "functions");
  ops.openPlugin(state, "home");
  assert.equal(ops.activeTab(state), null);
  assert.equal(ops.focused(state).viewPlugin, null);
});

test("project root landing returns a plugin-only pane to home", () => {
  const state = ops.create();
  ops.openPlugin(state, "functions");
  ops.landAtProjectRoot(state);
  assert.equal(ops.focused(state).viewPlugin, null);
  assert.equal(ops.shownPlugin(ops.focused(state)), "home");
});

test("project root landing keeps item tabs", () => {
  const state = ops.create();
  ops.openItem(state, "goals", "CORE", "Core");
  ops.landAtProjectRoot(state);
  assert.equal(ops.activeTab(state)?.itemId, "CORE");
  assert.equal(ops.focused(state).viewPlugin, "goals");
});

test("W1-18-TAB-FORMAT-01: unsupported saved shapes are rejected instead of becoming current tabs", () => {
  for (const alter of [
    // 口径 3, 4: a home tab is the shape before 07-S2; such a layout is started again, not read with the tab dropped.
    state => { state.panes[0].tabs[0] = { id: "saved", plugin: "home", kind: "home", title: "项目首页" }; },
    state => { delete state.solo; },
    state => { state.solo = "pane"; },
    state => { state.panes[0].tabs[0].kind = "mother"; },
    state => { state.panes[0].tabs[0].preview = true; },
    state => { state.panes[0].collapsed = { goals: true }; },
    state => { state.panes[0].tabs[0] = { id: "saved", plugin: "task", kind: "item", goalId: "CORE", title: "Core" }; },
    state => { state.panes[0].tabs[0] = { id: "saved", plugin: "", kind: "item", itemId: "CORE", title: "Core" }; },
  ]) {
    // 07-S2: the workspace starts with no tab (the project home is the Dock's), so each shape is altered on a Goal's tab.
    const state = ops.create(); ops.openItem(state, "goals", "CORE", "Core"); alter(state);
    assert.equal(isCurrentTabWorkspace(state), false);
  }
});

// 口径 4 (07-S1 review B1): a plugin id is a value in a tab, not the layout's shape. A layout naming a plugin this build and
// Home no longer know (one uninstalled from Home) is read as it is; the page draws that plugin's tabs removed.
test("PFG-22 a saved layout naming a plugin nobody knows any more is still current, tabs, split and side as they were", () => {
  const state = ops.create();
  ops.openItem(state, "gone-plugin", "entry-1", "Entry");
  ops.openBeside(state, "goals", "CORE", "Core");
  state.panes[0].viewPlugin = "gone-plugin";
  state.side.tabs.push({ id: "side-gone", kind: "side", plugin: "gone-plugin", itemId: "plugin:gone-plugin/side", title: "Gone" });
  const saved = JSON.parse(JSON.stringify(state));
  assert.equal(isCurrentTabWorkspace(saved), true);
  assert.deepEqual(saved, JSON.parse(JSON.stringify(state)), "nothing in it is changed by reading it");
});

test("fresh project-root navigation lands leftover plugin views on home", () => {
  const source = readFileSync(new URL("../apps/workbench/src/scripts/client/initialization.ts", import.meta.url), "utf8");
  assert.match(source, /navigationType !== "reload" && navigationType !== "back_forward" && !tabWorkspace\.isEmbedded\?\.\(\)\) tabWorkspace\.landAtProjectRoot\(\)/);
});

test("opening beside puts a second item of the same plugin in a pane to the right, and reuses that pane afterwards", () => {
  const state = ops.create();
  ops.openItem(state, "coding", "session-a", "A");
  const left = ops.focused(state);
  ops.openBeside(state, "coding", "session-b", "B");
  assert.equal(state.panes.length, 2);
  const right = ops.focused(state);
  assert.notEqual(right.id, left.id);
  assert.equal(ops.activeTab(state)?.itemId, "session-b");
  assert.equal(left.tabs.find((tab) => tab.id === left.activeTabId)?.itemId, "session-a", "the pane it came from keeps showing its session");
  assert.deepEqual(state.layout.tree.children.map((child: { paneId: string }) => child.paneId), [left.id, right.id]);
  assert.equal(state.layout.tree.direction, "row");
  // From the left pane again, the next item goes into the pane already on the right rather than a third one.
  state.focusedPaneId = left.id;
  ops.openBeside(state, "coding", "session-c", "C");
  assert.equal(state.panes.length, 2);
  assert.equal(ops.focused(state).id, right.id);
  assert.equal(ops.activeTab(state)?.itemId, "session-c");
  // Without an item, the plugin's own view (its session list) opens beside.
  ops.openBeside(state, "coding");
  assert.equal(state.panes.length, 3, "the right-most pane has nothing to its right, so a new pane opens");
  assert.equal(ops.focused(state).viewPlugin, "coding");
  assert.equal(ops.activeTab(state), null);
});

// specs/archive/page-interaction-flow: the pane's shown plugin is always the plugin of what it shows.
test("activating an item tab makes that tab's plugin the shown plugin", () => {
  const state = ops.create();
  const inbox = ops.openItem(state, "inbox", "entry-1", "来源故障");
  ops.openPlugin(state, "feed");
  assert.equal(ops.focused(state).viewPlugin, "feed");
  ops.activate(state, state.focusedPaneId, inbox.id);
  assert.equal(ops.focused(state).viewPlugin, "inbox");
  assert.equal(ops.shownPlugin(ops.focused(state)), "inbox");
  // A restored pane whose shown plugin went stale is corrected on normalisation.
  ops.focused(state).viewPlugin = "feed";
  ops.normalizeLayout(state);
  assert.equal(ops.focused(state).viewPlugin, "inbox");
});

test("closing the item tab being read shows its own plugin's page, not the page shown before it", () => {
  const state = ops.create();
  const inbox = ops.openItem(state, "inbox", "entry-1", "来源故障");
  ops.openPlugin(state, "feed");
  ops.activate(state, state.focusedPaneId, inbox.id);
  ops.closeTab(state, state.focusedPaneId, inbox.id);
  assert.equal(ops.activeTab(state), null);
  assert.equal(ops.focused(state).viewPlugin, "inbox");
});

test("choosing a tab steps out of a cover, and entering the project does too", () => {
  const state = ops.create();
  const doc = ops.openItem(state, "pages", "DOC", "Doc");
  ops.openPlugin(state, "feed");
  ops.setExclusive(state, "settings");
  ops.activate(state, state.focusedPaneId, doc.id);
  assert.equal(state.exclusive, null);
  ops.closeTab(state, state.focusedPaneId, doc.id);
  ops.openPlugin(state, "feed");
  ops.setExclusive(state, "project-settings");
  ops.landAtProjectRoot(state);
  assert.equal(state.exclusive, null);
  assert.equal(ops.shownPlugin(ops.focused(state)), "home");
});

test("shownPlugin names home for a pane on the project home and the plugin for its page", () => {
  const state = ops.create();
  assert.equal(ops.shownPlugin(ops.focused(state)), "home");
  ops.openPlugin(state, "lingguang");
  assert.equal(ops.shownPlugin(ops.focused(state)), "lingguang");
});

const grouped = () => withLayout(withSidePane(withPluginGroups(createTabWorkspaceOps(), settlePluginTabs, isLoosePluginTab)));
const strip = (pane) => pane.tabs.map((tab) => tab.kind === "item" ? tab.plugin + ":" + tab.itemId : tab.plugin);

test("PTG-01 PTG-02 opening plugins leaves one plugin tab each; choosing one shows that plugin's page", () => {
  const ops = grouped();
  const state = ops.create();
  ops.openPlugin(state, "goals");
  const feed = ops.openPlugin(state, "feed");
  ops.openPlugin(state, "feed");
  const pane = ops.focused(state);
  assert.deepEqual(strip(pane), ["goals", "feed"]);
  assert.equal(feed.kind, "plugin");
  assert.equal(pane.viewPlugin, "feed");
  assert.equal(pane.activeTabId, null);
  ops.activate(state, pane.id, pane.tabs.find((tab) => tab.plugin === "goals").id);
  assert.equal(pane.viewPlugin, "goals");
  assert.equal(pane.activeTabId, null);
  assert.equal(ops.shownPlugin(pane), "goals");
});

test("PTG-03 an item joins its plugin's group behind the items already there; a new group opens beside the current one", () => {
  const ops = grouped();
  const state = ops.create();
  ops.openPlugin(state, "goals");
  ops.openPlugin(state, "feed");
  ops.openItem(state, "goals", "g1", "发布");
  ops.openItem(state, "inbox", "i1", "来信");
  ops.openItem(state, "goals", "g2", "节奏");
  assert.deepEqual(strip(ops.focused(state)), ["goals", "goals:g1", "goals:g2", "inbox", "inbox:i1", "feed"]);
  assert.equal(ops.activeTab(state)?.itemId, "g2");
});

test("PTG-04 a tab in a user group leaves its plugin group; pinned tabs join no group", () => {
  const ops = grouped();
  const state = ops.create();
  const paneId = state.focusedPaneId;
  ops.openItem(state, "goals", "g1", "发布");
  const g2 = ops.openItem(state, "goals", "g2", "节奏");
  ops.addTabToNewGroup(state, paneId, g2.id);
  const pane = ops.focused(state);
  assert.ok(g2.groupId);
  assert.equal(isLoosePluginTab(g2), false);
  assert.deepEqual(ops.pluginGroup(pane, "goals").map((tab) => tab.itemId || tab.kind), ["plugin", "g1"]);
  const g1 = pane.tabs.find((tab) => tab.itemId === "g1");
  ops.togglePinned(state, paneId, g1.id);
  assert.equal(isLoosePluginTab(g1), false);
  assert.equal(pane.tabs[0].id, g1.id);
});

test("PRR-07 a pinned plugin tab is not an automatic-group head and closes only itself", () => {
  const ops = grouped();
  const state = ops.create();
  const paneId = state.focusedPaneId;
  ops.openPlugin(state, "goals");
  const pane = ops.focused(state);
  const head = pane.tabs.find((tab) => tab.kind === "plugin" && tab.plugin === "goals")!;
  ops.togglePinned(state, paneId, head.id);
  const item = ops.openItem(state, "goals", "g1", "发布");
  assert.equal(pane.tabs.filter((tab) => tab.kind === "plugin" && tab.plugin === "goals").length, 1, "no second plugin tab");
  assert.deepEqual(ops.pluginGroup(pane, "goals").map((tab) => tab.id), [item.id], "the pinned head is not part of the automatic group");
  const record = ops.closePluginGroup(state, paneId, "goals");
  assert.deepEqual(record.tabs.map((entry) => entry.tab.id), [head.id], "closing the pinned tab closes only it");
  assert.ok(pane.tabs.some((tab) => tab.id === item.id), "the loose item stays");
});

test("PTG-05 closing a plugin tab closes its group, and reopening puts every tab back in order", () => {
  const ops = grouped();
  const state = ops.create();
  const paneId = state.focusedPaneId;
  ops.openPlugin(state, "goals");
  ops.openItem(state, "feed", "f1", "日报");
  const shown = ops.openItem(state, "feed", "f2", "周报");
  const head = ops.focused(state).tabs.find((tab) => tab.kind === "plugin" && tab.plugin === "feed");
  const record = ops.closePluginGroup(state, paneId, "feed");
  const pane = ops.focused(state);
  assert.deepEqual(strip(pane), ["goals"]);
  assert.equal(ops.shownPlugin(pane), "goals");
  ops.reopenPluginGroup(state, record);
  assert.deepEqual(strip(pane), ["goals", "feed", "feed:f1", "feed:f2"]);
  assert.equal(pane.activeTabId, shown.id);
  ops.closeTab(state, paneId, head.id);
  assert.deepEqual(strip(pane), ["goals"]);
});

test("PTG-08 a saved plugin page without its plugin tab gets one, and plugin tabs pass the saved-state check", () => {
  const ops = grouped();
  const base = withLayout(withSidePane(createTabWorkspaceOps()));
  const saved = base.create();
  base.openItem(saved, "goals", "g1", "发布");
  base.openPlugin(saved, "inbox");
  assert.equal(isCurrentTabWorkspace(saved), true);
  ops.normalizeLayout(saved);
  assert.deepEqual(strip(ops.focused(saved)), ["goals", "goals:g1", "inbox"]);
  ops.togglePluginGroup(saved, saved.focusedPaneId, "goals");
  assert.equal(isCurrentTabWorkspace(JSON.parse(JSON.stringify(saved))), true);
  const tampered = JSON.parse(JSON.stringify(saved));
  tampered.panes[0].tabs.find((tab) => tab.kind === "item").collapsed = true;
  assert.equal(isCurrentTabWorkspace(tampered), false);
});

test("a plugin tab dragged to another pane takes its group, and the pane it left stops showing it", () => {
  const ops = grouped();
  const state = ops.create();
  const left = state.focusedPaneId;
  ops.openItem(state, "feed", "f1", "日报");
  ops.openBeside(state, "goals");
  const right = state.focusedPaneId;
  const head = state.panes.find((pane) => pane.id === left).tabs.find((tab) => tab.kind === "plugin");
  ops.moveTab(state, left, head.id, right, null);
  assert.deepEqual(strip(state.panes.find((pane) => pane.id === right)), ["goals", "feed", "feed:f1"]);
  // With no home tab to hold it (07-S2), the pane it left had nothing else and closed.
  assert.equal(state.panes.some((pane) => pane.id === left), false);
  assert.equal(state.panes.some((pane) => pane.viewPlugin === "feed" && pane.id !== right), false);
});

test("a plugin tab split off to an edge takes its group into the new pane", () => {
  const ops = grouped();
  const state = ops.create();
  const left = state.focusedPaneId;
  ops.openPlugin(state, "goals");
  ops.openItem(state, "feed", "f1", "日报");
  const head = ops.focused(state).tabs.find((tab) => tab.kind === "plugin" && tab.plugin === "feed");
  ops.splitPane(state, left, "right", "move", left, head.id);
  const right = state.panes.find((pane) => pane.id !== left);
  assert.deepEqual(strip(right), ["feed", "feed:f1"]);
  assert.deepEqual(strip(state.panes.find((pane) => pane.id === left)), ["goals"]);
});

const heads = (pane) => pane.tabs.filter((tab) => tab.kind === "plugin").map((tab) => tab.plugin);

test("PTG-02 Alt-dragging a plugin tab in its own pane shows that plugin and does not double its plugin tab", () => {
  const ops = grouped();
  const state = ops.create();
  const paneId = state.focusedPaneId;
  ops.openItem(state, "goals", "g1", "发布");
  const pane = ops.focused(state);
  const head = pane.tabs.find((tab) => tab.kind === "plugin");
  ops.moveTab(state, paneId, head.id, paneId, pane.tabs[0].id, true);
  assert.deepEqual(strip(pane), ["goals", "goals:g1"]);
  assert.equal(pane.tabs.find((tab) => tab.kind === "plugin").id, head.id, "the plugin tab that was there stays");
  assert.equal(ops.shownPlugin(pane), "goals");
  assert.equal(isCurrentTabWorkspace(JSON.parse(JSON.stringify(state))), true);
});

test("PTG-02 Alt-dragging a plugin tab to a pane that has that plugin shows it there, with one plugin tab", () => {
  const ops = grouped();
  const state = ops.create();
  const left = state.focusedPaneId;
  ops.openItem(state, "goals", "g1", "发布");
  ops.openBeside(state, "goals");
  const right = state.focusedPaneId;
  const rightPane = state.panes.find((pane) => pane.id === right);
  ops.openPlugin(state, "feed");
  const head = state.panes.find((pane) => pane.id === left).tabs.find((tab) => tab.kind === "plugin");
  ops.moveTab(state, left, head.id, right, null, true);
  assert.deepEqual(heads(rightPane), ["goals", "feed"]);
  assert.equal(ops.shownPlugin(rightPane), "goals");
  assert.deepEqual(strip(state.panes.find((pane) => pane.id === left)), ["goals", "goals:g1"], "a copy leaves the source as it was");
  assert.equal(isCurrentTabWorkspace(JSON.parse(JSON.stringify(state))), true);
});

test("PTG-02 a plugin's group moved to a pane that has that plugin joins its group there; a record open in both is not doubled", () => {
  const ops = grouped();
  const state = ops.create();
  const left = state.focusedPaneId;
  ops.openItem(state, "goals", "g1", "发布");
  ops.openItem(state, "goals", "g2", "节奏");
  ops.openBeside(state, "goals");
  const right = state.focusedPaneId;
  ops.openItem(state, "goals", "g2", "节奏");
  const rightPane = state.panes.find((pane) => pane.id === right);
  const kept = rightPane.tabs.find((tab) => tab.kind === "plugin");
  const head = state.panes.find((pane) => pane.id === left).tabs.find((tab) => tab.kind === "plugin");
  ops.moveTab(state, left, head.id, right, null);
  assert.deepEqual(heads(rightPane), ["goals"]);
  assert.equal(rightPane.tabs.find((tab) => tab.kind === "plugin").id, kept.id, "the group joins the plugin tab that was there");
  assert.deepEqual(strip(rightPane).filter((key) => key.startsWith("goals:")).sort(), ["goals:g1", "goals:g2"]);
  assert.equal(state.panes.some((pane) => pane.id === left), false, "the pane it left had nothing else and closed");
  assert.equal(isCurrentTabWorkspace(JSON.parse(JSON.stringify(state))), true);
  // Closing the plugin tab now closes the whole group: nothing is left half open.
  ops.closePluginGroup(state, right, "goals");
  assert.deepEqual(strip(rightPane).filter((key) => key.startsWith("goals")), []);
});

test("PTG-02 a saved pane with two plugin tabs of one plugin fails the saved-state check", () => {
  const ops = grouped();
  const state = ops.create();
  ops.openPlugin(state, "goals");
  const saved = JSON.parse(JSON.stringify(state));
  const pane = saved.panes[0];
  pane.tabs.push({ ...pane.tabs.find((tab) => tab.kind === "plugin"), id: "t-double" });
  assert.equal(isCurrentTabWorkspace(saved), false);
});

// The right side as one pane of the workspace (07-S1; specs/product-flow-governance PFG-22, PFG-24).
const sideViews = [
  { key: "files", plugin: "", title: "资料" },
  { key: "browser", plugin: "", title: "浏览器" },
  { key: "plugin:shelf/main", plugin: "shelf", title: "Shelf" },
  { key: "tasks", plugin: "", title: "后台任务" },
];
const sideKeys = (state) => state.side.tabs.map((tab) => tab.itemId);

test("PFG-22 the side's open state, width and current tab live in the workspace state and survive saving", () => {
  const state = ops.create();
  assert.deepEqual(state.side, { id: "side", tabs: [], activeTabId: null, open: false, ratio: .35, closed: [] });
  ops.syncSide(state, sideViews);
  assert.deepEqual(sideKeys(state), ["files", "browser", "plugin:shelf/main", "tasks"]);
  assert.equal(ops.setSideOpen(state, true), true);
  ops.selectSide(state, "browser");
  assert.equal(ops.setSideRatio(state, .9), .55, "the width is held between a quarter and a little over half");
  assert.equal(ops.setSideRatio(state, .1), .25);
  ops.setSideRatio(state, .4);
  const saved = JSON.parse(JSON.stringify(state));
  assert.equal(isCurrentTabWorkspace(saved), true);
  assert.equal(saved.side.open, true);
  assert.equal(saved.side.ratio, .4);
  assert.equal(ops.sideActive(saved).itemId, "browser");
  // Collapsing keeps the tabs and the current one for the next open.
  ops.setSideOpen(saved, false);
  assert.deepEqual(sideKeys(saved), ["files", "browser", "plugin:shelf/main", "tasks"]);
  assert.equal(ops.sideActive(saved).itemId, "browser");
  assert.equal(isCurrentTabWorkspace(JSON.parse(JSON.stringify(saved))), true);
});

test("PFG-22 a side with no tabs cannot be open", () => {
  const state = ops.create();
  assert.equal(ops.setSideOpen(state, true), false);
  assert.equal(state.side.open, false);
});

test("PFG-24 opening a view already on the right recalls its tab instead of adding a second one", () => {
  const state = ops.create();
  ops.syncSide(state, sideViews);
  const shelf = state.side.tabs.find((tab) => tab.itemId === "plugin:shelf/main");
  const again = ops.openSide(state, "plugin:shelf/main", sideViews);
  assert.equal(again.id, shelf.id);
  assert.equal(state.side.tabs.length, sideViews.length);
  assert.equal(state.side.activeTabId, shelf.id);
  assert.equal(state.side.open, true);
  assert.equal(ops.openSide(state, "plugin:missing/view", sideViews), null, "a view the page does not offer is not opened");
});

test("PFG-22 closing a side tab is undone in place, and an open of the same view meanwhile is not doubled", () => {
  const state = ops.create();
  ops.syncSide(state, sideViews);
  ops.openSide(state, "browser", sideViews);
  const browser = ops.sideActive(state);
  const record = ops.closeSideTab(state, browser.id);
  assert.equal(record.side, true);
  assert.equal(record.index, 1);
  assert.equal(record.active, true);
  assert.deepEqual(sideKeys(state), ["files", "plugin:shelf/main", "tasks"]);
  assert.equal(ops.sideActive(state).itemId, "plugin:shelf/main", "the tab after it is shown next");
  ops.reopenSideTab(state, record);
  assert.deepEqual(sideKeys(state), ["files", "browser", "plugin:shelf/main", "tasks"]);
  assert.equal(ops.sideActive(state).id, browser.id, "the same tab comes back, current again");
  const twice = ops.closeSideTab(state, browser.id);
  ops.openSide(state, "browser", sideViews);
  ops.reopenSideTab(state, twice);
  assert.deepEqual(sideKeys(state), ["files", "browser", "plugin:shelf/main", "tasks"]);
});

// 07-S1 review, small fix 3: closing the last tab collapses the side; putting it back is the side as it was, open on it.
test("PFG-22 putting back the tab whose close collapsed the side opens the side again; one closed while collapsed does not", () => {
  const state = ops.create();
  ops.syncSide(state, [sideViews[0]]);
  ops.openSide(state, "files", sideViews);
  const record = ops.closeSideTab(state, ops.sideActive(state).id);
  assert.equal(state.side.open, false, "no tab left, the side collapses");
  assert.equal(record.collapsed, true);
  ops.reopenSideTab(state, record);
  assert.equal(state.side.open, true);
  assert.equal(ops.sideActive(state).itemId, "files");
  ops.syncSide(state, sideViews);
  ops.setSideOpen(state, false);
  const quiet = ops.closeSideTab(state, state.side.tabs.find((tab) => tab.itemId === "browser").id);
  assert.equal(quiet.collapsed, false);
  ops.reopenSideTab(state, quiet);
  assert.equal(state.side.open, false, "a tab closed with the side collapsed comes back with the side still collapsed");
});

test("PFG-22 closing the last side tab collapses the side", () => {
  const state = ops.create();
  ops.syncSide(state, sideViews.slice(0, 1));
  ops.openSide(state, "files", sideViews);
  ops.closeSideTab(state, ops.sideActive(state).id);
  assert.equal(state.side.open, false);
  assert.equal(state.side.activeTabId, null);
  assert.equal(isCurrentTabWorkspace(JSON.parse(JSON.stringify(state))), true);
});

// 07-S1 left this to S2: a side tab the person closed stays closed after a reload (the page offers every view again).
test("PFG-22 the views a page offers settle the side: gone views leave, a closed view stays closed when the plugins change and after a reload", () => {
  const state = ops.create();
  ops.syncSide(state, sideViews);
  ops.closeSideTab(state, state.side.tabs.find((tab) => tab.itemId === "files").id);
  assert.deepEqual(state.side.closed, ["files"]);
  const added = [...sideViews.filter((view) => view.key !== "plugin:shelf/main"), { key: "plugin:lingguang/main", plugin: "lingguang", title: "灵光" }];
  ops.syncSide(state, added);
  assert.deepEqual(sideKeys(state), ["browser", "tasks", "plugin:lingguang/main"]);
  const reloaded = JSON.parse(JSON.stringify(state));
  assert.equal(isCurrentTabWorkspace(reloaded), true);
  ops.syncSide(reloaded, added);
  assert.deepEqual(sideKeys(reloaded), ["browser", "tasks", "plugin:lingguang/main"], "a reload does not bring it back");
  // Asked for again, it comes back and is no longer remembered as closed.
  ops.openSide(reloaded, "files", added);
  assert.deepEqual(sideKeys(reloaded), ["files", "browser", "tasks", "plugin:lingguang/main"]);
  assert.deepEqual(reloaded.side.closed, []);
  // A closed view the page no longer offers is forgotten.
  ops.closeSideTab(reloaded, reloaded.side.tabs[0].id);
  ops.syncSide(reloaded, added.slice(1));
  assert.deepEqual(reloaded.side.closed, []);
});

test("PFG-22 口径 4 a saved layout without the side, or with a side of another shape, is not read", () => {
  const plain = createTabWorkspaceOps().create();
  assert.equal(isCurrentTabWorkspace(JSON.parse(JSON.stringify(plain))), false, "a layout saved before the side joined is started again");
  for (const alter of [
    (state) => { state.side.ratio = .9; },
    (state) => { state.side.open = "true"; },
    (state) => { state.side.width = 420; },
    (state) => { state.side.tabs.push({ ...state.side.tabs[0], id: "t-double" }); },
    (state) => { state.side.tabs[0].kind = "item"; },
    (state) => { state.side.tabs[0].target = { url: "https://example.com" }; },
    (state) => { state.side.id = "pane-2"; },
  ]) {
    const state = ops.create();
    ops.syncSide(state, sideViews);
    alter(state);
    assert.equal(isCurrentTabWorkspace(JSON.parse(JSON.stringify(state))), false);
  }
});

// 07-S2 (specs/product-flow-governance §4.6.2 S2; 口径 2, 8): recall, moving a tab to the right and back, 独看 and merging.
test("PFG-24 locate finds an open view in the focused pane first, then another pane, then the right side", () => {
  const ops = grouped();
  const state = ops.create();
  const left = state.focusedPaneId;
  ops.openItem(state, "pages", "DOC", "Doc");
  ops.openBeside(state, "goals");
  const right = state.focusedPaneId;
  assert.deepEqual(ops.locate(state, "goals"), { paneId: right });
  assert.deepEqual(ops.locate(state, "pages", "DOC"), { paneId: left }, "an item open in the other pane is found there");
  assert.deepEqual(ops.locate(state, "pages"), { paneId: left }, "its plugin's page is where its plugin tab is");
  assert.equal(ops.locate(state, "feed"), null);
  state.focusedPaneId = left;
  ops.openPlugin(state, "goals");
  assert.deepEqual(ops.locate(state, "goals"), { paneId: left }, "the focused pane wins");
  ops.moveToSide(state, left, state.panes.find((pane) => pane.id === left).tabs.find((tab) => tab.itemId === "DOC").id);
  assert.deepEqual(ops.locate(state, "pages", "DOC"), { side: "pane:pages:item:DOC" });
});

test("PFG-22 a main tab moved to the right keeps its record and view, opens the side on it, and goes back to the focused pane", () => {
  const ops = grouped();
  const state = ops.create();
  const paneId = state.focusedPaneId;
  const doc = ops.openItem(state, "pages", "DOC", "Doc");
  ops.writeView(state, paneId, "outline", doc.id);
  ops.openItem(state, "pages", "DOC2", "Other");
  const moved = ops.moveToSide(state, paneId, doc.id);
  assert.deepEqual({ ...moved }, { id: doc.id, kind: "pane", plugin: "pages", itemId: "pane:pages:item:DOC", title: "Doc", item: "DOC", view: "outline" });
  assert.equal(state.side.open, true);
  assert.equal(ops.sideActive(state).id, doc.id);
  assert.equal(ops.focused(state).tabs.some((tab) => tab.itemId === "DOC"), false, "it left the pane");
  const saved = JSON.parse(JSON.stringify(state));
  assert.equal(isCurrentTabWorkspace(saved), true);
  ops.syncSide(saved, sideViews);
  assert.ok(saved.side.tabs.some((tab) => tab.id === doc.id), "a moved tab is not a view the page offers: settling keeps it");
  assert.equal(ops.moveToSide(saved, paneId, doc.id), null, "moving it again from the pane is nothing: it is not there");
  const back = ops.moveToMain(saved, doc.id);
  assert.equal(back.itemId, "DOC");
  assert.equal(ops.activeTab(saved).itemId, "DOC");
  assert.equal(ops.readView(saved, paneId), "outline");
  assert.equal(saved.side.tabs.some((tab) => tab.kind === "pane"), false);
  assert.deepEqual(saved.side.closed, [], "a moved tab that goes back is not a closed view");
});

test("PFG-22 a plugin page moves to the right alone; a plugin tab with records behind it does not move", () => {
  const ops = grouped();
  const state = ops.create();
  const paneId = state.focusedPaneId;
  ops.openPlugin(state, "feed");
  const moved = ops.moveToSide(state, paneId);
  assert.equal(moved.itemId, "pane:feed:plugin");
  assert.equal(ops.focused(state).tabs.some((tab) => tab.plugin === "feed"), false);
  assert.equal(ops.shownPlugin(ops.focused(state)), "home");
  ops.openItem(state, "goals", "g1", "发布");
  const head = ops.focused(state).tabs.find((tab) => tab.kind === "plugin");
  assert.equal(ops.moveToSide(state, paneId, head.id), null);
  ops.moveToMain(state, moved.id);
  assert.equal(ops.shownPlugin(ops.focused(state)), "feed");
});

test("PFG-22 口径 2 独看 shows only the focused pane, collapses the side, and brings both back", () => {
  const ops = grouped();
  const state = ops.create();
  ops.syncSide(state, sideViews);
  assert.equal(ops.toggleSolo(state), false, "one pane and a collapsed side: nothing to step aside");
  ops.openItem(state, "goals", "g1", "发布");
  ops.openBeside(state, "pages");
  ops.setSideOpen(state, true);
  const focused = state.focusedPaneId;
  assert.equal(ops.toggleSolo(state), true);
  assert.deepEqual(state.solo, { paneId: focused, side: true });
  assert.equal(state.exclusive, null, "独看 is not a cover");
  assert.equal(state.side.open, false);
  assert.equal(state.panes.length, 2, "the other pane keeps its place");
  assert.equal(isCurrentTabWorkspace(JSON.parse(JSON.stringify(state))), true);
  ops.settleSolo(state);
  assert.ok(state.solo, "nothing changed: still alone");
  assert.equal(ops.toggleSolo(state), false);
  assert.equal(state.solo, null);
  assert.equal(state.side.open, true, "the side it collapsed opens again");
  // Going to another pane ends it too.
  ops.toggleSolo(state);
  state.focusedPaneId = state.panes.find((pane) => pane.id !== focused).id;
  ops.settleSolo(state);
  assert.equal(state.solo, null);
  assert.equal(state.side.open, true);
});

test("PFG-22 口径 2 独看 of the right side: solo names the side, the main area steps aside, and it ends as the main area's does", () => {
  const ops = grouped();
  const state = ops.create();
  ops.syncSide(state, sideViews);
  ops.openItem(state, "goals", "g1", "发布");
  assert.equal(ops.toggleSolo(state, true), false, "a collapsed side is no column to show alone");
  ops.setSideOpen(state, true);
  const panes = JSON.stringify(state.panes);
  assert.equal(ops.toggleSolo(state, true), true);
  assert.deepEqual(state.solo, { paneId: state.side.id, side: false });
  assert.equal(ops.soloSide(state), true);
  assert.equal(state.side.open, true, "the side stays open: it is the one shown");
  assert.equal(JSON.stringify(state.panes), panes, "the main area keeps every pane and tab");
  assert.equal(isCurrentTabWorkspace(JSON.parse(JSON.stringify(state))), true);
  ops.settleSolo(state, true);
  assert.equal(ops.soloSide(state), true, "the focus still in the side: still alone");
  assert.equal(ops.toggleSolo(state, true), false, "again: everything comes back");
  assert.equal(state.solo, null);
  assert.equal(state.side.open, true);
  // The focus going to the main area ends it, and so does collapsing the side.
  ops.toggleSolo(state, true);
  ops.settleSolo(state, false);
  assert.equal(state.solo, null);
  ops.toggleSolo(state, true);
  ops.setSideOpen(state, false);
  ops.settleSolo(state, true);
  assert.equal(state.solo, null);
  assert.equal(state.side.open, false, "the side's own 独看 collapsed nothing, so nothing reopens");
});

test("merging puts every pane's tabs into the focused one, which keeps what it shows", () => {
  const ops = grouped();
  const state = ops.create();
  ops.openItem(state, "goals", "g1", "发布");
  ops.openBeside(state, "pages", "DOC", "Doc");
  ops.splitPane(state, state.focusedPaneId, "bottom", "copy");
  const into = state.focusedPaneId;
  ops.mergePanes(state);
  assert.equal(state.panes.length, 1);
  assert.equal(state.panes[0].id, into);
  assert.equal(ops.activeTab(state).itemId, "DOC");
  assert.deepEqual(strip(state.panes[0]).sort(), ["goals", "goals:g1", "pages", "pages:DOC"]);
  assert.equal(state.layout.tree.paneId, into);
  assert.equal(isCurrentTabWorkspace(JSON.parse(JSON.stringify(state))), true);
});

test("PFG-22 口径 4 a saved side tab of another shape is not read", () => {
  for (const alter of [
    (state) => { state.side.tabs[0].kind = "pane"; },
    (state) => { state.side.closed = "files"; },
    (state) => { delete state.side.closed; },
  ]) {
    const state = ops.create();
    ops.syncSide(state, sideViews);
    alter(state);
    assert.equal(isCurrentTabWorkspace(JSON.parse(JSON.stringify(state))), false);
  }
});
