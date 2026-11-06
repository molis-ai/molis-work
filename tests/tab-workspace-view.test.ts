import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { CLIENT_SCRIPT } from "@molis-ai/molis-work-app-workbench";

interface Tab { id: string; plugin: string; kind: string; title: string; itemId?: string; view?: string; pinned?: boolean; groupId?: string }
interface Pane { id: string; tabs: Tab[]; activeTabId: string | null; groups: Array<{ id: string; title: string; color: string; collapsed: boolean }>; viewPlugin: string | null }
interface State { panes: Pane[]; focusedPaneId: string; exclusive: string | null; layout: { direction: string; sizes: number[]; tree?: unknown } }
interface Ops {
  create(): State;
  focused(state: State): Pane;
  activeTab(state: State): Tab | null;
  openPlugin(state: State, plugin: string): Tab;
  openItem(state: State, plugin: string, itemId: string, title?: string): Tab;
  readView(state: State, paneId: string, tabId?: string): string | undefined;
  writeView(state: State, paneId: string, view: unknown, tabId?: string): boolean;
  splitPane(state: State, paneId: string, edge: string, mode: string, sourcePaneId?: string, sourceTabId?: string): State;
  moveTab(state: State, from: string, tabId: string, to: string, beforeId?: string | null, copy?: boolean): State;
  togglePinned(state: State, paneId: string, tabId: string): State;
  addTabToNewGroup(state: State, paneId: string, tabId: string): State;
  closePluginGroup(state: State, paneId: string, plugin: string): unknown;
  reopenPluginGroup(state: State, closed: unknown): State;
}

// Call the exact rules shipped in the public browser program, including its grouped-ops composition.
// This also catches a source implementation that was changed but left out of the shipped program.
const syntax = ts.createSourceFile("workbench.js", CLIENT_SCRIPT, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = new Set(["createTabWorkspaceOps", "withPluginGroups", "settlePluginTabs", "isLoosePluginTab", "isCurrentTabWorkspace"]);
const bodies = new Map<string, string>();
const visit = (node: ts.Node): void => {
  if ((ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) && node.name && names.has(node.name.text)) bodies.set(node.name.text, node.getText(syntax));
  ts.forEachChild(node, visit);
};
visit(syntax);
assert.equal(bodies.size, names.size, "the shipped rules include all production owners");
const context = vm.createContext({ __name: (value: unknown) => value });
const compiled = Object.fromEntries([...bodies].map(([name, body]) => [name, vm.runInContext("(" + body + ")", context)]));
const fresh = (): Ops => compiled.withPluginGroups(compiled.createTabWorkspaceOps(), compiled.settlePluginTabs, compiled.isLoosePluginTab);
const valid = (value: unknown): boolean => compiled.isCurrentTabWorkspace(value);
const roundTrip = (state: State): State => JSON.parse(JSON.stringify(state));

test("RAC-2687 generic view is owned by the active item or the default plugin head in the exact pane", () => {
  const ops = fresh(), state = ops.create(), pane = ops.focused(state);
  const head = ops.openPlugin(state, "feed");
  assert.equal(ops.activeTab(state), null);
  assert.equal(ops.writeView(state, pane.id, "source-a"), true);
  assert.equal(head.view, "source-a");
  assert.equal(ops.readView(state, pane.id), "source-a");
  const item = ops.openItem(state, "feed", "message-1");
  assert.equal(ops.writeView(state, pane.id, "all"), true);
  assert.equal(item.view, "all");
  assert.equal(ops.readView(state, pane.id, head.id), "source-a");
  const pages = ops.openPlugin(state, "pages");
  assert.equal(ops.writeView(state, pane.id, "outline"), true, "the generic owner accepts another plugin's string");
  assert.equal(pages.view, "outline");
  assert.equal(valid(roundTrip(state)), true);
  for (const value of [null, 1, false, {}, []]) assert.equal(ops.writeView(state, pane.id, value), false);
  assert.equal(ops.writeView(state, "missing", "all"), false);
  assert.equal(ops.writeView(state, pane.id, "all", "missing"), false);
  assert.equal(ops.readView(state, "missing"), undefined);
});

test("RAC-2687 Goal Frame is the absent view and work survives grouped pinned nested-pane JSON round trips", () => {
  const ops = fresh(), state = ops.create(), first = ops.focused(state);
  const goal = ops.openItem(state, "goals", "CORE");
  assert.equal(ops.readView(state, first.id), undefined);
  assert.equal(ops.writeView(state, first.id, "work"), true);
  ops.togglePinned(state, first.id, goal.id);
  const feed = ops.openItem(state, "feed", "message-1");
  ops.writeView(state, first.id, "source-a", feed.id);
  ops.addTabToNewGroup(state, first.id, feed.id);
  ops.splitPane(state, first.id, "right", "copy", first.id, feed.id);
  const second = ops.focused(state);
  ops.writeView(state, second.id, "all");
  ops.splitPane(state, second.id, "bottom", "copy", second.id, ops.activeTab(state)!.id);
  const saved = roundTrip(state);
  assert.equal(valid(saved), true);
  assert.equal(saved.panes.length, 3);
  assert.equal(ops.readView(saved, first.id, goal.id), "work");
  assert.equal(ops.readView(saved, first.id, feed.id), "source-a");
  assert.equal(ops.readView(saved, second.id), "all");
  assert.equal(saved.panes[0]!.tabs.find(tab => tab.id === goal.id)?.pinned, true);
  assert.ok(saved.panes[0]!.groups.length);
  assert.equal(ops.writeView(saved, first.id, undefined, goal.id), true);
  assert.equal(Object.hasOwn(saved.panes[0]!.tabs.find(tab => tab.id === goal.id)!, "view"), false);
});

test("RAC-2687 any retired field rejects the whole layout including inactive panes and mixed new views", () => {
  const ops = fresh(), state = ops.create(), first = ops.focused(state);
  const item = ops.openItem(state, "goals", "CORE");
  ops.writeView(state, first.id, "work");
  ops.splitPane(state, first.id, "right", "copy", first.id, item.id);
  for (const field of ["goalView", "feedTask"]) for (const value of [undefined, null, "", "work"]) {
    const stored = roundTrip(state);
    Object.assign(stored.panes[0]!.tabs.find(tab => tab.kind === "item")!, { [field]: value });
    assert.equal(valid(stored), false, field + " presence rejects even when the new view also exists");
  }
  for (const value of [null, false, 1, {}, []]) {
    const stored = roundTrip(state);
    Object.assign(stored.panes[0]!.tabs.find(tab => tab.kind === "item")!, { view: value });
    assert.equal(valid(stored), false, "a view must be a string or absent");
  }
});

test("RAC-2687 fixed-pane writes cannot follow a later focus or fall back after their pane disappears", () => {
  const ops = fresh(), state = ops.create(), first = ops.focused(state);
  const item = ops.openItem(state, "feed", "message-1");
  ops.writeView(state, first.id, "source-a");
  ops.splitPane(state, first.id, "right", "copy", first.id, item.id);
  const second = ops.focused(state);
  ops.writeView(state, second.id, "source-b");
  assert.equal(ops.writeView(state, first.id, "all", item.id), true);
  assert.equal(ops.readView(state, first.id, item.id), "all");
  assert.equal(ops.readView(state, second.id), "source-b");
  const before = JSON.stringify(state);
  assert.equal(ops.writeView(state, "closed-pane", "source-c", item.id), false);
  assert.equal(JSON.stringify(state), before);
});

for (const mode of ["copy", "move"]) test(`RAC-2687 splitting a default plugin head by ${mode} retains its view and independent tab identity`, () => {
  const ops = fresh(), state = ops.create(), source = ops.focused(state);
  const head = ops.openPlugin(state, "feed");
  ops.writeView(state, source.id, "source-a");
  assert.equal(source.activeTabId, null, "exercise the real layout menu's default-sourceTabId branch");
  ops.splitPane(state, source.id, "right", mode);
  const target = ops.focused(state), targetHead = target.tabs.find(tab => tab.kind === "plugin" && tab.plugin === "feed")!;
  assert.notEqual(target.id, source.id);
  assert.notEqual(targetHead.id, head.id, "the existing default-page split creates its own head");
  assert.equal(target.activeTabId, null);
  assert.equal(ops.readView(state, target.id), "source-a");
  assert.equal(ops.readView(state, source.id, head.id), "source-a");
  ops.writeView(state, target.id, "source-b");
  assert.equal(ops.readView(state, source.id, head.id), "source-a");
  assert.equal(ops.readView(state, target.id), "source-b");
  const before = JSON.stringify(state);
  ops.splitPane(state, "missing-pane", "right", mode, source.id);
  assert.equal(JSON.stringify(state), before, "a rejected split cannot write the source view into the focused neighbour");
  assert.equal(valid(roundTrip(state)), true);
});

test("RAC-2687 copying moving and closing then reopening a plugin group preserve each tab's own view", () => {
  const ops = fresh(), state = ops.create(), first = ops.focused(state);
  const item = ops.openItem(state, "feed", "message-1");
  ops.writeView(state, first.id, "source-a", item.id);
  const head = first.tabs.find(tab => tab.kind === "plugin" && tab.plugin === "feed")!;
  ops.writeView(state, first.id, "all", head.id);
  ops.splitPane(state, first.id, "right", "copy", first.id, item.id);
  const second = ops.focused(state), copied = ops.activeTab(state)!;
  assert.equal(copied.view, "source-a");
  ops.writeView(state, second.id, "source-b", copied.id);
  ops.moveTab(state, second.id, copied.id, first.id);
  assert.equal(ops.readView(state, first.id, item.id), "source-a", "merging a duplicate preserves the existing tab's view");
  const closed = ops.closePluginGroup(state, first.id, "feed");
  assert.ok(closed);
  ops.reopenPluginGroup(state, closed);
  assert.equal(ops.readView(state, first.id, item.id), "source-a");
  assert.equal(ops.readView(state, first.id, head.id), "all");
  assert.equal(valid(roundTrip(state)), true);
});
