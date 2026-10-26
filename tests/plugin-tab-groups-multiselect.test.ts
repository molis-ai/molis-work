import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { pluginWorkbenchPacks } from "@molis-ai/molis-work-app-workbench";

// D24 (main regression after #765): the plugin tab groups' ⌘/Ctrl- and middle-click handler, bundled from its browser
// source and run on a small DOM with the rows the catalog declares. A list that picks several (aria-multiselectable)
// keeps ⌘/Ctrl-click for its picking; a middle click there, and a ⌘/Ctrl-click anywhere else, still opens the record
// behind in its plugin's group.

const { outputFiles } = buildSync({ entryPoints: [fileURLToPath(new URL("../apps/workbench/src/scripts/client/plugin-tab-groups.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", globalName: "TabGroups", platform: "browser", target: "es2022" });
const FACTORY = vm.runInNewContext(`${outputFiles[0]!.text};TabGroups.PLUGIN_TAB_GROUPS_FACTORY`, {}) as string;
const packs = pluginWorkbenchPacks();
const ROWS = [...packs.flatMap((pack) => pack.recordRow ? [[pack.project_plugin_id, pack.recordRow.selector, pack.recordRow.idDataset]] : []),
  ...packs.flatMap((pack) => pack.searchRow ? [[pack.project_plugin_id, pack.searchRow.selector, pack.searchRow.idDataset]] : [])];

/** One compound selector: a tag, classes and attributes, as the handler and the catalog's row selectors write them. */
const matchOne = (node: Node, selector: string) => {
  const parts = /^([a-z]+)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(selector);
  if (!parts) throw new Error(`the small DOM does not read ${selector}`);
  if (parts[1] && parts[1] !== node.tag) return false;
  if (parts[2]!.split(".").filter(Boolean).some((name) => !(node.attrs.class ?? "").split(" ").includes(name))) return false;
  return [...parts[3]!.matchAll(/\[([\w-]+)(?:="?([^"\]]*)"?)?\]/g)].every(([, name, value]) => name! in node.attrs && (value === undefined || node.attrs[name!] === value));
};
class Node {
  readonly nodeType = 1;
  parent: Node | null = null;
  children: Node[] = [];
  className = "";
  readonly attrs: Record<string, string>;
  constructor(readonly tag: string, attrs: Record<string, string> = {}, readonly text = "") { this.attrs = { ...attrs }; }
  get dataset() {
    return Object.fromEntries(Object.entries(this.attrs).filter(([name]) => name.startsWith("data-"))
      .map(([name, value]) => [name.slice(5).replace(/-(\w)/g, (_, char: string) => char.toUpperCase()), value]));
  }
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(""); }
  add(...nodes: Node[]) { for (const node of nodes) { node.parent = this; this.children.push(node); } return this; }
  append(...nodes: Node[]) { return this.add(...nodes); }
  getAttribute(name: string) { return this.attrs[name] ?? null; }
  setAttribute(name: string, value: string) { this.attrs[name] = value; }
  removeAttribute(name: string) { delete this.attrs[name]; }
  matches(selector: string) { return selector.split(",").some((one) => matchOne(this, one.trim())); }
  closest(selector: string) { for (let node: Node | null = this; node; node = node.parent) if (node.matches(selector)) return node; return null; }
  contains(other: Node | null) { for (let node = other; node; node = node.parent) if (node === this) return true; return false; }
  querySelector(selector: string): Node | null {
    for (const child of this.children) { const found = child.matches(selector) ? child : child.querySelector(selector); if (found) return found; }
    return null;
  }
}

/** The handler as a split pane runs it (embedded): opening behind is a message to the workbench, copied out of the vm's realm. */
function tabGroups() {
  const listeners = new Map<string, (event: unknown) => void>(), opened: unknown[] = [];
  const window = { addEventListener: (type: string, listener: (event: unknown) => void, capture: boolean) => { assert.equal(capture, true); listeners.set(type, listener); } };
  const document = { createElement: (tag: string) => new Node(tag), body: new Node("body"), addEventListener() {} };
  const factory = vm.runInNewContext(`(${FACTORY})`, { window, document });
  factory({ getState: () => ({}), ops: { pluginOfSurface: (surface: string) => surface }, apply() {}, persist() {}, L: (text: string) => text,
    rows: ROWS, embedded: true, notify: (type: string, detail: object) => opened.push({ type, detail: { ...detail } }), editable: () => false, appendTab() {} });
  const press = (target: Node, init: { type: "click" | "auxclick"; metaKey?: boolean; ctrlKey?: boolean; button?: number }) => {
    const event = { button: 0, metaKey: false, ctrlKey: false, ...init, target, prevented: false, stopped: false,
      preventDefault() { event.prevented = true; }, stopImmediatePropagation() { event.stopped = true; } };
    listeners.get(init.type)!(event);
    return { prevented: event.prevented, stopped: event.stopped, opened: opened.splice(0) };
  };
  return { press };
}

/** A plugin's own page with one record row in a list; the row is spelled the way the catalog declares it. */
function listedRow(plugin: string, attrs: Record<string, string>, title: string, list: Record<string, string>) {
  const row = new Node("button", { class: "feed-stage-entry directory-list-row", role: "option", ...attrs }).add(new Node("strong", {}, title));
  const box = new Node("div", list).add(new Node("article", { role: "none" }).add(row));
  const page = new Node("section", { "data-work-surface": plugin }).add(box);
  const selector = ROWS.find(([id]) => id === plugin)![1]!;
  assert.ok(row.matches(selector), `${plugin}'s row is the one its catalog entry declares (${selector})`);
  return { row, box, page };
}
const PICKING = { role: "listbox", "aria-multiselectable": "true" };
const LISTED = [
  { plugin: "pages", attrs: { "data-page-id": "page-b" }, id: "page-b", title: "Page B" },
  { plugin: "lingguang", attrs: { "data-lingguang-id": "spark-b" }, id: "spark-b", title: "窗边的光" },
];

test("D24 a ⌘/Ctrl-click in a list that picks several (Pages, 灵光) is left to the list; the same row in a plain list opens behind", () => {
  for (const { plugin, attrs, id, title } of LISTED) {
    const { press } = tabGroups(), { row, box } = listedRow(plugin, attrs, title, PICKING);
    for (const keys of [{ metaKey: true }, { ctrlKey: true }]) {
      assert.deepEqual(press(row, { type: "click", ...keys }), { prevented: false, stopped: false, opened: [] }, `${plugin}: ${Object.keys(keys)[0]} picks`);
    }
    box.removeAttribute("aria-multiselectable");
    assert.deepEqual(press(row, { type: "click", metaKey: true }), { prevented: true, stopped: true,
      opened: [{ type: "workbench-pane-open", detail: { plugin, itemId: id, title, background: true } }] }, `${plugin}: without the list's word the click opens behind, as before`);
  }
});

test("D24 a middle click on a row of a list that picks several still opens it behind", () => {
  for (const { plugin, attrs, id, title } of LISTED) {
    const { press } = tabGroups(), { row } = listedRow(plugin, attrs, title, PICKING);
    assert.deepEqual(press(row, { type: "auxclick", button: 1 }), { prevented: true, stopped: true,
      opened: [{ type: "workbench-pane-open", detail: { plugin, itemId: id, title, background: true } }] }, plugin);
    assert.deepEqual(press(row, { type: "click" }), { prevented: false, stopped: false, opened: [] }, `${plugin}: a plain click stays the plugin's`);
  }
});

test("D24 a ⌘-click on a Goal in the tree still opens it behind: only lists that pick several keep the click", () => {
  const { press } = tabGroups();
  const node = new Node("button", { class: "tree-node" }).add(new Node("strong", {}, "Core"));
  const item = new Node("li", { "data-tree-item": "", "data-goal-id": "CORE" }).add(node);
  new Node("section", { "data-record-owner": "goals" }).add(new Node("ul", { role: "tree" }).add(item));
  assert.deepEqual(press(node, { type: "click", metaKey: true }), { prevented: true, stopped: true,
    opened: [{ type: "workbench-pane-open", detail: { plugin: "goals", itemId: "CORE", title: "Core", background: true } }] });
});

test("D24 a list that picks several around the plugin's page, not inside it, does not keep the click", () => {
  const { press } = tabGroups(), { row, page } = listedRow("pages", { "data-page-id": "page-b" }, "Page B", {});
  new Node("div", PICKING).add(page);
  assert.deepEqual(press(row, { type: "click", ctrlKey: true }).opened, [{ type: "workbench-pane-open", detail: { plugin: "pages", itemId: "page-b", title: "Page B", background: true } }]);
});
