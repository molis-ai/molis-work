import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createTabWorkspaceOps, isCurrentTabWorkspace, isLoosePluginTab, settlePluginTabs, withPluginGroups } from "../apps/workbench/src/tab-workspace-ops.js";

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
  ops.openPlugin(state, "inbox");
  ops.closeTab(state, state.focusedPaneId, home.id);
  assert.equal(ops.activeTab(state), null);
  assert.equal(ops.focused(state).viewPlugin, "inbox");
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
  assert.equal(isCurrentTabWorkspace(restored, { home: true, goals: true, pages: true }), true);
  ops.ensureHome(restored);
  assert.equal(restored.panes.length, 3);
  assert.equal(restored.panes[0].groups[0].collapsed, true);
  assert.equal(ops.activeTab(restored).itemId, "DOC");
  assert.equal(restored.layout.tree.children[1].children.length, 2);
});

test("manual groups stay contiguous, collapse is recorded, and pinning leaves the group", () => {
  const state = ops.create();
  const home = ops.activeTab(state);
  const goal = ops.openItem(state, "goals", "CORE", "Core");
  ops.openPlugin(state, "inbox");
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
  const session = ops.openItem(state, "inbox", "s1", "Entry");
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

test("activating the home tab clears a leftover plugin view", () => {
  const state = ops.create();
  const home = ops.activeTab(state);
  ops.openPlugin(state, "functions");
  assert.equal(ops.focused(state).viewPlugin, "functions");
  ops.activate(state, state.focusedPaneId, home.id);
  assert.equal(ops.activeTab(state)?.kind, "home");
  assert.equal(ops.focused(state).viewPlugin, null);
});

test("project root landing returns a plugin-only pane to home", () => {
  const state = ops.create();
  ops.openPlugin(state, "functions");
  ops.landAtProjectRoot(state);
  assert.equal(ops.focused(state).viewPlugin, null);
  assert.equal(ops.activeTab(state)?.kind, "home");
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
    state => { state.panes[0].tabs[0].kind = "mother"; },
    state => { state.panes[0].tabs[0].preview = true; },
    state => { state.panes[0].collapsed = { goals: true }; },
    state => { state.panes[0].tabs[0] = { id: "saved", plugin: "task", kind: "item", goalId: "CORE", title: "Core" }; },
    state => { state.panes[0].tabs[0] = { id: "saved", plugin: "task", kind: "item", itemId: "CORE", title: "Core" }; },
  ]) {
    const state = ops.create(); alter(state);
    assert.equal(isCurrentTabWorkspace(state, { home: true, goals: true }), false);
  }
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
  const home = ops.activeTab(state);
  ops.openPlugin(state, "feed");
  ops.setExclusive(state, "settings");
  ops.activate(state, state.focusedPaneId, home.id);
  assert.equal(state.exclusive, null);
  ops.openPlugin(state, "feed");
  ops.setExclusive(state, "project-settings");
  ops.landAtProjectRoot(state);
  assert.equal(state.exclusive, null);
  assert.equal(ops.activeTab(state)?.kind, "home");
});

test("shownPlugin names home for the home tab and the plugin for its page", () => {
  const state = ops.create();
  assert.equal(ops.shownPlugin(ops.focused(state)), "home");
  ops.openPlugin(state, "lingguang");
  assert.equal(ops.shownPlugin(ops.focused(state)), "lingguang");
});

const grouped = () => withPluginGroups(createTabWorkspaceOps(), settlePluginTabs, isLoosePluginTab);
const strip = (pane) => pane.tabs.map((tab) => tab.kind === "item" ? tab.plugin + ":" + tab.itemId : tab.plugin);

test("PTG-01 PTG-02 opening plugins leaves one plugin tab each; choosing one shows that plugin's page", () => {
  const ops = grouped();
  const state = ops.create();
  ops.openPlugin(state, "goals");
  const feed = ops.openPlugin(state, "feed");
  ops.openPlugin(state, "feed");
  const pane = ops.focused(state);
  assert.deepEqual(strip(pane), ["home", "goals", "feed"]);
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
  assert.deepEqual(strip(ops.focused(state)), ["home", "goals", "goals:g1", "goals:g2", "inbox", "inbox:i1", "feed"]);
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
  assert.deepEqual(strip(pane), ["home", "goals"]);
  assert.equal(ops.shownPlugin(pane), "goals");
  ops.reopenPluginGroup(state, record);
  assert.deepEqual(strip(pane), ["home", "goals", "feed", "feed:f1", "feed:f2"]);
  assert.equal(pane.activeTabId, shown.id);
  ops.closeTab(state, paneId, head.id);
  assert.deepEqual(strip(pane), ["home", "goals"]);
});

test("PTG-08 a saved plugin page without its plugin tab gets one, and plugin tabs pass the saved-state check", () => {
  const ops = grouped();
  const base = createTabWorkspaceOps();
  const saved = base.create();
  base.openItem(saved, "goals", "g1", "发布");
  base.openPlugin(saved, "inbox");
  assert.equal(isCurrentTabWorkspace(saved), true);
  ops.normalizeLayout(saved);
  assert.deepEqual(strip(ops.focused(saved)), ["home", "goals", "goals:g1", "inbox"]);
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
  const leftPane = state.panes.find((pane) => pane.id === left);
  assert.deepEqual(strip(leftPane), ["home"]);
  assert.equal(leftPane.viewPlugin, null);
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
  assert.deepEqual(strip(state.panes.find((pane) => pane.id === left)), ["home", "goals"]);
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
  assert.deepEqual(strip(pane), ["home", "goals", "goals:g1"]);
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
  assert.deepEqual(strip(state.panes.find((pane) => pane.id === left)), ["home", "goals", "goals:g1"], "a copy leaves the source as it was");
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
  assert.deepEqual(strip(state.panes.find((pane) => pane.id === left)), ["home"]);
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
