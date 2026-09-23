import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EditorState, type Transaction } from "prosemirror-state";
import { pagesSchema as s } from "../plugins/native/pages/src/schema.js";
import { commitDrag, dragLayoutSource, previewRowPairs } from "../plugins/native/pages/src/drag-preview.js";
import { dragRows, previewSpan } from "../plugins/native/pages/src/reorder.js";

const localRequire = createRequire(new URL("../plugins/native/pages/package.json", import.meta.url));
const { history, undo } = localRequire("prosemirror-history");

const p = (text: string) => s.node("paragraph", null, s.text(text));

test("live drag correspondence follows rows through nesting and real column reflow", () => {
  const a = p("段落甲"), b = p("段落乙"), tail = p("末段");
  const source = s.node("doc", null, [a, s.node("callout", null, [b]), tail]);
  const rows = dragRows(source);
  const preview = previewSpan(source, rows[0].pos, rows[0].pos, 3, 1)!;
  assert.ok(preview);
  const pairs = previewRowPairs(source, preview.doc);
  const moved = pairs.find(pair => pair.from === 0)!;
  assert.equal(preview.doc.resolve(moved.to).parent.type.name, "callout");
  assert.equal(preview.doc.nodeAt(moved.to), a);
  assert.equal(preview.doc.nodeAt(pairs.find(pair => pair.from === rows[2].pos)!.to), b);
  const plain = s.node("doc", null, [a, b, tail]);
  const split = previewSpan(plain, a.nodeSize, a.nodeSize, 1, 1)!;
  assert.equal(split.doc.firstChild!.type.name, "column_list");
  for (const pair of previewRowPairs(plain, split.doc)) {
    assert.equal(plain.nodeAt(pair.from)!.textContent, split.doc.nodeAt(pair.to)!.textContent);
  }
});

test("duplicate text and selected groups retain separate animation targets", () => {
  const same = p("重复内容");
  const source = s.node("doc", null, [same, same, p("尾部")]);
  const rows = dragRows(source);
  const next = previewSpan(source, rows[0].pos, rows[1].pos, 3, 0)!.doc;
  const pairs = previewRowPairs(source, next);
  assert.equal(pairs.length, 3);
  assert.equal(new Set(pairs.map(pair => pair.to)).size, 3);
  assert.deepEqual(next.content.content.map(node => node.textContent), ["尾部", "重复内容", "重复内容"]);
});

test("moving the only callout child keeps its slot instead of matching its old parent", () => {
  const child = p("唯一子段");
  const source = s.node("doc", null, [s.node("callout", null, child), p("尾部")]);
  const next = previewSpan(source, 1, 1, 3, 0)!.doc;
  const pair = previewRowPairs(source, next).find(row => row.from === 1);
  assert.ok(pair, "the dragged child must still own the destination placeholder");
  assert.equal(next.nodeAt(pair.to), child);
  assert.equal(next.resolve(pair.to).depth, 0);
  assert.equal(next.firstChild!.firstChild!.textContent, "");
});

test("dragging one copied block leaves its identical sibling visible in place", () => {
  const copied = p("相同的副本");
  const source = s.node("doc", null, [copied, copied, p("尾部")]);
  const layout = dragLayoutSource(source);
  assert.ok(layout.eq(source));
  const next = previewSpan(layout, 0, 0, 3, 0)!.doc;
  const pairs = previewRowPairs(layout, next);
  assert.equal(pairs.find(pair => pair.from === 0)!.to, next.content.size - copied.nodeSize);
  assert.equal(pairs.find(pair => pair.from === copied.nodeSize)!.to, 0);
  assert.ok(next.eq(previewSpan(source, 0, 0, 3, 0)!.doc), "isolated identities must preserve the actual drop result");
});

test("preview changes no live state; one final drop is one undo after prior typing", () => {
  let state = EditorState.create({ doc: s.node("doc", null, [p("甲"), p("乙"), p("丙")]), plugins: [history()] });
  state = state.apply(state.tr.insertText("写", 2));
  const before = state.doc;
  const rows = dragRows(before);
  for (const gap of [2, 3, 2, 3]) {
    const preview = previewSpan(before, 0, 0, gap, 0);
    assert.ok(preview);
    assert.equal(state.doc, before, "hover must not become a document transaction");
  }
  let commits = 0;
  const live = { get state() { return state; }, dispatch(tr: Transaction) { if (tr.docChanged) commits++; state = state.apply(tr); } };
  assert.ok(commitDrag(live, 0, 0, rows.length, 0));
  assert.equal(commits, 1);
  assert.deepEqual(state.doc.content.content.map(node => node.textContent), ["乙", "丙", "甲写"]);
  const moved = state.doc;
  state = state.apply(state.tr.insertText("后", state.doc.content.size - 1));
  assert.ok(undo(state, (tr: Transaction) => { state = state.apply(tr); }));
  assert.ok(state.doc.eq(moved), "typing immediately after drop has its own undo");
  assert.ok(undo(state, tr => { state = state.apply(tr); }));
  assert.ok(state.doc.eq(before), "undo drop preserves the text typed before drag");
});
