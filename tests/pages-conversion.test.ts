import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { Mark, Node } from "prosemirror-model";
import { Command, EditorState, NodeSelection, TextSelection, Transaction } from "prosemirror-state";
import { pagesSchema as s } from "../plugins/native/pages/src/schema.js";
import { convertedBlocks, convertedNodes } from "../plugins/native/pages/src/convert.js";
import {
  applyHeading, applyListSelection, deleteRow, deleteSpan, duplicateRow, duplicateSpan, linkAt, outdentListItem,
  setLink, turnBlockInto, turnRowInto, turnSpanInto,
} from "../plugins/native/pages/src/commands.js";

const localRequire = createRequire(new URL("../plugins/native/pages/package.json", import.meta.url));
const { history, undo, redo } = localRequire("prosemirror-history");
const p = (text: string, marks: readonly Mark[] = [], note = "") => s.node("paragraph", { note }, text ? s.text(text, marks) : null);
const item = (text: string, blocks: Node[] = []) => s.node("list_item", null, [p(text), ...blocks]);
const list = (items: Node[]) => s.node("bullet_list", null, items);
const docOf = (...nodes: Node[]) => s.node("doc", null, nodes);
function textPos(doc: Node, text: string): number {
  let at = -1;
  doc.descendants((node, pos) => { if (node.isText && node.text === text && at < 0) at = pos; });
  assert.ok(at >= 0, text);
  return at;
}
function stateAt(doc: Node, text: string, endText?: string): EditorState {
  const from = textPos(doc, text);
  return EditorState.create({ schema: s, doc, selection: TextSelection.create(doc, from, endText ? textPos(doc, endText) + endText.length : from), plugins: [history()] });
}
function run(state: EditorState, command: Command): EditorState {
  let next = state;
  assert.equal(command(state, (tr) => { next = state.apply(tr); }), true);
  next.doc.check();
  return next;
}
function changed(state: EditorState, tr: Transaction | null): EditorState {
  assert.ok(tr);
  const next = state.apply(tr);
  next.doc.check();
  return next;
}
function roundTrip(before: EditorState, after: EditorState): void {
  const undone = run(after, undo);
  assert.deepEqual(undone.doc.toJSON(), before.doc.toJSON());
  assert.ok(undone.selection.eq(before.selection), "undo restores the user's original selection");
  const redone = run(undone, redo);
  assert.deepEqual(redone.doc.toJSON(), after.doc.toJSON());
  assert.ok(redone.selection.eq(after.selection), "redo returns to the resulting block");
}

test("turning a parent list item keeps its second paragraph, child list, marks and notes", () => {
  const strong = s.mark("strong");
  const nested = list([item("子项")]);
  const parent = s.node("list_item", null, [p("父项", [strong], "保留备注"), p("第二段"), nested]);
  const doc = docOf(list([parent, item("邻项")]));
  const before = stateAt(doc, "父项");
  const after = changed(before, turnRowInto(before, "heading2"));
  assert.deepEqual(after.doc.content.content.map((node) => [node.type.name, node.textContent]), [
    ["heading", "父项"], ["heading", "第二段"], ["bullet_list", "子项"], ["bullet_list", "邻项"],
  ]);
  assert.equal(after.doc.child(0).attrs.note, "保留备注");
  assert.deepEqual(after.doc.child(0).firstChild?.marks, [strong]);
  assert.ok(after.doc.child(2).eq(nested));
  assert.equal(after.selection.$from.parent.textContent, "父项");
  roundTrip(before, after);
});

test("conversion carries nested callouts and pictures through text, list and wrapper targets", () => {
  const image = s.node("image", { src: "https://example.com/a.png", alt: "图片", caption: "说明", width: 320, note: "图片备注" });
  const inner = s.node("callout", { tone: "orange", icon: "star", note: "内层备注" }, [p("内层"), image]);
  const outer = s.node("toggle", { open: false, note: "外层备注" }, [p("摘要", [s.mark("em")]), inner, p("末段")]);
  for (const target of ["heading1", "paragraph", "bullet_list", "task_list", "callout", "blockquote"]) {
    const before = EditorState.create({ doc: docOf(outer, p("外部")), selection: NodeSelection.create(docOf(outer, p("外部")), 0), plugins: [history()] });
    const after = run(before, turnBlockInto(0, target));
    let actualInner: Node | null = null;
    after.doc.descendants((node) => { if (node.type.name === "callout" && node.attrs.note === "内层备注") actualInner = node; });
    assert.ok(actualInner && (actualInner as Node).eq(inner), target);
    assert.equal(after.doc.textContent, "摘要内层末段外部", target);
    assert.equal(after.doc.lastChild?.textContent, "外部");
    roundTrip(before, after);
  }
});

test("same-type conversion preserves checked state, numbering, language and container attributes", () => {
  const examples: [string, Node][] = [
    ["task_list", s.node("task_list", { note: "任务备注" }, [s.node("task_item", { checked: true }, [p("已完成")])])],
    ["ordered_list", s.node("ordered_list", { order: 7, note: "列表备注" }, [item("第七项")])],
    ["callout", s.node("callout", { tone: "orange", icon: "star", note: "提示备注" }, [p("提示")])],
    ["toggle", s.node("toggle", { open: false, note: "折叠备注" }, [p("摘要")])],
    ["code_block", s.node("code_block", { language: "typescript", note: "代码备注" }, s.text("const x = 1"))],
    ["heading2", s.node("heading", { level: 2, note: "标题备注" }, s.text("标题"))],
  ];
  for (const [id, node] of examples) {
    assert.equal(convertedBlocks(id, node)?.[0], node, id);
    const state = EditorState.create({ doc: docOf(node) });
    let dispatched = false;
    assert.equal(turnBlockInto(0, id)(state, () => { dispatched = true; }), true);
    assert.equal(dispatched, false, "a no-op should not add undo history");
  }
  const task = examples[0][1];
  const state = stateAt(docOf(task), "已完成");
  const repeated = turnRowInto(state, "task_list");
  assert.ok(repeated);
  assert.equal(repeated.docChanged, false);
  assert.ok(repeated.selection.eq(state.selection));
  assert.equal(repeated.doc.child(0).child(0).attrs.checked, true);
});

test("a text selection in a column or callout changes only that text block", () => {
  const containers = [
    s.node("column_list", null, [s.node("column", { width: 0.75 }, [p("第一段")]), s.node("column", { width: 1.25 }, [p("第二段")])]),
    s.node("callout", { tone: "orange", icon: "star" }, [p("第一段"), p("第二段")]),
  ];
  for (const container of containers) {
    const doc = docOf(container, p("外部"));
    const at = textPos(doc, "第一段");
    const before = EditorState.create({ doc, selection: TextSelection.create(doc, at, at + 2), plugins: [history()] });
    const after = changed(before, applyHeading(before, 1) ?? turnRowInto(before, "heading1"));
    assert.equal(after.doc.firstChild?.type, container.type);
    assert.deepEqual(after.doc.firstChild?.attrs, container.attrs);
    assert.equal(after.doc.textContent, "第一段第二段外部");
    let headingCount = 0;
    after.doc.descendants((node) => { if (node.type.name === "heading") { headingCount += 1; assert.equal(node.textContent, "第一段"); } });
    assert.equal(headingCount, 1);
    roundTrip(before, after);
    const listed = changed(before, applyListSelection(before, "bullet_list"));
    assert.equal(listed.doc.firstChild?.type, container.type);
    assert.equal(listed.doc.textContent, "第一段第二段外部");
  }
});

test("unsupported conversions reject atom content and code never discards an inline mention", () => {
  const image = s.node("image", { src: "https://example.com/a.png", caption: "证据" });
  const table = s.node("table", null, [s.node("table_row", null, [s.node("table_cell", null, [p("格子")])])]);
  for (const source of [image, table, s.node("column_list", null, [s.node("column", null, [p("甲")]), s.node("column", null, [p("乙")])])]) {
    assert.equal(convertedBlocks("heading1", source), null);
    assert.equal(convertedNodes("paragraph", [p("旁边"), source]), null);
    const state = EditorState.create({ doc: docOf(source) });
    assert.equal(turnBlockInto(0, "paragraph")(state), false);
  }
  const mention = s.node("paragraph", null, [s.text("看这里"), s.node("page_mention", { page_id: "p1", title: "方案" })]);
  const state = stateAt(docOf(mention), "看这里");
  assert.equal(turnRowInto(state, "code_block"), null);
  assert.equal(convertedBlocks("code_block", s.node("callout", null, [p("说明"), image])), null);
  const moved = changed(state, turnRowInto(state, "heading1"));
  assert.equal(moved.doc.child(0).lastChild?.type.name, "page_mention");
  assert.equal(moved.doc.child(0).lastChild?.attrs.page_id, "p1");
  const withBreak = s.node("paragraph", null, [s.text("甲", [s.mark("strong")]), s.node("hard_break"), s.text("乙")]);
  assert.equal(convertedBlocks("code_block", withBreak)?.[0].textContent, "甲\n乙");
  assert.deepEqual(convertedBlocks("code_block", withBreak)?.[0].firstChild?.marks, []);
  assert.equal(convertedBlocks("code_block", list([item("甲", [list([item("子")])]), item("乙")]))?.[0].textContent, "甲\n子\n乙");
  const noted = s.node("callout", { note: "容器备注" }, [p("甲", [], "段落备注"), p("乙")]);
  assert.equal(convertedBlocks("code_block", noted)?.[0].attrs.note, "容器备注\n段落备注");
  const notedList = convertedBlocks("bullet_list", p("甲", [], "段落备注"))![0];
  assert.equal(notedList.attrs.note, "");
  assert.equal(notedList.child(0).firstChild?.attrs.note, "段落备注");
});

test("multi-row conversion preserves nested children while splitting only the selected list items", () => {
  const nested = list([item("子项")]);
  const doc = docOf(list([item("甲"), item("乙", [nested]), item("丙"), item("丁")]));
  const before = stateAt(doc, "乙", "丙");
  const from = textPos(doc, "乙") - 2;
  const to = textPos(doc, "丙") - 2;
  const after = changed(before, turnSpanInto(before, from, to, "heading3"));
  assert.deepEqual(after.doc.content.content.map((node) => [node.type.name, node.textContent]), [
    ["bullet_list", "甲"], ["heading", "乙"], ["bullet_list", "子项"], ["heading", "丙"], ["bullet_list", "丁"],
  ]);
  roundTrip(before, after);
});

test("editing or removing a styled link covers its complete contiguous range and keeps the cursor", () => {
  const link = s.mark("link", { href: "https://old.example/" });
  const doc = docOf(s.node("paragraph", null, [
    s.text("AAA", [link]), s.text("BBB", [link, s.mark("strong")]), s.text("CCC", [link, s.mark("em")]), s.text("DDD", [link]),
    s.text("间隔"), s.text("其他", [link]),
  ]));
  const before = EditorState.create({ doc, selection: TextSelection.create(doc, 2), plugins: [history()] });
  const found = linkAt(doc, before.selection)!;
  assert.deepEqual(found, { from: 1, to: 13, href: "https://old.example/" });
  const changedLink = run(before, setLink(found.from, found.to, "https://new.example/"));
  assert.ok(changedLink.selection.eq(before.selection));
  for (let i = 0; i < 4; i += 1) assert.equal(changedLink.doc.child(0).child(i).marks.find((mark) => mark.type.name === "link")?.attrs.href, "https://new.example/");
  assert.equal(changedLink.doc.child(0).lastChild?.marks[0]?.attrs.href, "https://old.example/");
  roundTrip(before, changedLink);
  const removed = run(before, setLink(found.from, found.to, ""));
  assert.equal(removed.doc.child(0).child(1).marks[0]?.type.name, "strong");
  assert.equal(removed.doc.child(0).lastChild?.marks[0]?.attrs.href, "https://old.example/");
  assert.deepEqual(linkAt(doc, TextSelection.create(doc, 5, 6)), { from: 5, to: 6, href: "https://old.example/" });
});

test("outdenting selected middle list items keeps later siblings after them, with state and undo", () => {
  for (const task of [false, true]) {
    const makeItem = (text: string, children: Node[] = []) => task ? s.node("task_item", { checked: text === "丙" }, [p(text), ...children]) : item(text, children);
    const makeList = (items: Node[]) => s.node(task ? "task_list" : "bullet_list", null, items);
    const doc = docOf(makeList([makeItem("父", [makeList([makeItem("甲"), makeItem("乙"), makeItem("丙"), makeItem("丁")])]), makeItem("尾")]));
    const before = stateAt(doc, "乙", "丙");
    const after = run(before, outdentListItem);
    assert.equal(after.doc.textContent, "父甲乙丙丁尾");
    assert.equal(after.doc.child(0).child(0).lastChild?.textContent, "甲");
    assert.equal(after.doc.child(0).child(2).lastChild?.textContent, "丁");
    if (task) assert.equal(after.doc.child(0).child(2).attrs.checked, true);
    assert.equal(after.doc.textBetween(after.selection.from, after.selection.to), "乙丙");
    roundTrip(before, after);
  }
});

test("copying a nested row places continued typing in the copy and undo restores the original cursor", () => {
  const doc = docOf(s.node("callout", null, [p("甲"), p("乙")]), p("尾"));
  const before = stateAt(doc, "甲");
  const after = run(before, duplicateRow(textPos(doc, "甲") - 1));
  assert.deepEqual(after.doc.child(0).content.content.map((node) => node.textContent), ["甲", "甲", "乙"]);
  assert.equal(after.selection.from, 5);
  const typed = after.apply(after.tr.insertText("新"));
  assert.deepEqual(typed.doc.child(0).content.content.map((node) => node.textContent), ["甲", "新甲", "乙"]);
  assert.equal(typed.doc.lastChild?.textContent, "尾");
  roundTrip(before, after);
});

test("group copy and row/group deletion keep subsequent typing beside the edited rows", () => {
  const doc = docOf(s.node("callout", null, [p("甲"), p("乙"), p("丙")]), p("尾"));
  const before = stateAt(doc, "乙");
  const jia = textPos(doc, "甲") - 1;
  const yi = textPos(doc, "乙") - 1;
  const copied = run(before, duplicateSpan(jia, yi));
  assert.deepEqual(copied.doc.child(0).content.content.map((node) => node.textContent), ["甲", "乙", "甲", "乙", "丙"]);
  assert.equal(copied.selection.$from.parent.textContent, "甲");
  const copyTyped = copied.apply(copied.tr.insertText("新"));
  assert.deepEqual(copyTyped.doc.child(0).content.content.map((node) => node.textContent), ["甲", "乙", "新甲", "乙", "丙"]);
  roundTrip(before, copied);
  const deleted = run(before, deleteRow(yi));
  assert.deepEqual(deleted.doc.child(0).content.content.map((node) => node.textContent), ["甲", "丙"]);
  assert.equal(deleted.selection.$from.parent.textContent, "甲");
  const rowTyped = deleted.apply(deleted.tr.insertText("续"));
  assert.equal(rowTyped.doc.child(0).child(0).textContent, "甲续");
  assert.equal(rowTyped.doc.lastChild?.textContent, "尾");
  roundTrip(before, deleted);
  const groupDeleted = run(before, deleteSpan(jia, yi));
  assert.equal(groupDeleted.doc.child(0).textContent, "丙");
  assert.equal(groupDeleted.selection.$from.parent.textContent, "丙");
  roundTrip(before, groupDeleted);
});
