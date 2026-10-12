import assert from "node:assert/strict";
import test from "node:test";
import { CONTEXT_TOOL_LIMITS } from "@molis-ai/molis-work-contracts/services/contextual";
import {
  CONTEXT_TOOLBAR_CLIENT_SCRIPT, CONTEXT_TOOLBAR_STYLES, CRAFT_FINISH_STYLES, PRIMITIVE_STYLES, VISUAL_FOUNDATION_STYLES, renderPrimitiveCatalog, sanitizeContextTools,
} from "@molis-ai/molis-work-design-system";

// W1-6 (context-program §19.4): the context toolbar primitive. What a plugin publishes as its tools is read bounded and closed (T08);
// the bar is a page program the workbench carries in its own script and sheet (W2); the shared design-system sheets do not carry it.

const item = (id: string, over: Record<string, unknown> = {}) => ({ id, label: `工具 ${id}`, ...over });
const publish = (groups: unknown, context_id: unknown = "ctx-1") => sanitizeContextTools({ context_id, groups }, CONTEXT_TOOL_LIMITS);

test("T08: tools are plain data read bounded and closed; what does not fit the shape is dropped, not repaired", () => {
  const clean = publish([
    { id: "marks", collapse: "overflow", items: [item("strong", { glyph: "B", pressed: true, shortcut: "⌘B", icon: "bold" }), item("em", { glyph: "I", pressed: "yes", disabled: false })] },
    { id: "insert", collapse: "sometimes", items: [item("link", { icon: "link", opens: "panel" }), item("odd", { glyph: "Z", icon: "Not An Icon", opens: "window" })] },
  ]);
  assert.deepEqual(clean, { context_id: "ctx-1", groups: [
    { id: "marks", collapse: "overflow", items: [
      { id: "strong", label: "工具 strong", icon: "bold", glyph: "B", pressed: true, shortcut: "⌘B" },
      { id: "em", label: "工具 em", glyph: "I", disabled: false }] },
    { id: "insert", items: [{ id: "link", label: "工具 link", icon: "link", opens: "panel" }, { id: "odd", label: "工具 odd" }] },
  ] }, "a glyph outside the set, an icon that is not a name, a flag that is not a boolean and a collapse that is not a word are left out");
});

test("T08: the limits hold — groups, items in all, label length — and nothing is taken from a stale or malformed offer", () => {
  const many = Array.from({ length: CONTEXT_TOOL_LIMITS.groups + 3 }, (_, index) => ({ id: `g${index}`, items: [item(`a${index}`)] }));
  assert.equal(publish(many)!.groups.length, CONTEXT_TOOL_LIMITS.groups);
  const crowded = [{ id: "a", items: Array.from({ length: 20 }, (_, index) => item(`x${index}`)) }, { id: "b", items: Array.from({ length: 20 }, (_, index) => item(`y${index}`)) }];
  assert.equal(publish(crowded)!.groups.flatMap(group => group.items).length, CONTEXT_TOOL_LIMITS.items, "24 items in all, across groups");
  assert.equal((publish([{ id: "a", items: [item("x", { label: "长".repeat(80) })] }])!.groups[0]!.items[0]!.label as string).length, CONTEXT_TOOL_LIMITS.label);
  assert.equal(publish([{ id: "a", items: [item("x"), item("x"), item("y", { label: "  " }), { id: "no label" }, "text"] }])!.groups[0]!.items.length, 1, "a repeated id, an empty label and a non-object are dropped");
  assert.deepEqual(publish([{ id: "a", items: [] }, { id: "a", items: [item("x")] }, { id: "has space", items: [item("y")] }])!.groups.map(group => group.id), ["a"], "an empty group, a bad id and a repeated one are dropped");
  for (const bad of [null, "x", [], { groups: [] }, { context_id: "", groups: [] }, { context_id: "c", groups: "no" }]) assert.equal(sanitizeContextTools(bad, CONTEXT_TOOL_LIMITS), null);
  assert.equal(publish([], "x".repeat(300))!.context_id.length, 240);
});

test("W1-06: the program is one function of its host; it carries the placement and the sanitizer as source, and sends no event nobody registered", () => {
  const factory = Function(`return (${CONTEXT_TOOLBAR_CLIENT_SCRIPT})`)() as unknown;
  assert.equal(typeof factory, "function", "it parses");
  assert.match(CONTEXT_TOOLBAR_CLIENT_SCRIPT, /function placeStacked\(/u);
  assert.match(CONTEXT_TOOLBAR_CLIENT_SCRIPT, /function sanitizeContextTools\(/u);
  const names = [...CONTEXT_TOOLBAR_CLIENT_SCRIPT.matchAll(/"(molis:[a-z-]+)"/gu)].map(match => match[1]).sort();
  assert.deepEqual([...new Set(names)], ["molis:context-panel-open", "molis:context-tool-invoke", "molis:context-tools"]);
  // The workbench carries this on every page and its size only goes down (page-assets): a bar that grows past this is made smaller first.
  assert.ok(CONTEXT_TOOLBAR_CLIENT_SCRIPT.length < 13_900, `the program is ${CONTEXT_TOOLBAR_CLIENT_SCRIPT.length} characters`);
});

test("W1-06: styles use tokens only; the shared sheets do not carry the bar, the board has its own specimen", () => {
  assert.doesNotMatch(CONTEXT_TOOLBAR_STYLES, /#[0-9a-fA-F]{3,8}\b|!important|\brgba?\(/u, "no colour literal, no !important");
  assert.match(CONTEXT_TOOLBAR_STYLES, /min-height: 44px/u, "44px where the pointer is coarse");
  for (const sheet of [PRIMITIVE_STYLES, VISUAL_FOUNDATION_STYLES, CRAFT_FINISH_STYLES]) assert.doesNotMatch(sheet, /\.mw-ctx\b/u);
  const board = renderPrimitiveCatalog();
  assert.match(board, /id="context-toolbar"/u);
  assert.match(board, /href="#context-toolbar"/u);
  assert.ok(board.includes(CONTEXT_TOOLBAR_STYLES.slice(0, 120)), "the section carries its own style");
  assert.equal(new Set([...board.matchAll(/\bid="(mw-ctx[^"]*)"/gu)].map(match => match[1])).size, [...board.matchAll(/\bid="(mw-ctx[^"]*)"/gu)].length, "no repeated id");
});
