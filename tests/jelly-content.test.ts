import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openJellyStore } from "../plugins/native/jelly/src/store.js";
import { jellySourceHash } from "../plugins/native/jelly/src/content.js";
import { jellyMarkdownToBlocks, jellyBlocksToMarkdown, jellyBlocksToHtml, jellyHtmlToBlocks } from "../plugins/native/jelly/src/markdown.js";
import { makeJellyMaterialSnapshot } from "../plugins/native/jelly/src/material.js";
import { decodeJellyImport } from "../plugins/native/jelly/src/import.js";
import type { JellyPlan } from "../packages/contracts/src/modules/jelly.js";
function temporary(t: test.TestContext): string { const home = mkdtempSync(join(tmpdir(), "molis-jelly-")); t.after(() => rmSync(home, { recursive: true, force: true })); return home; }
const schedule = { start_date: "2026-09-22", end_date: "2026-09-22", start_time: 540, end_time: 600 };

test("Jelly persists commands and undo/redo across reopen, rejects stale revisions without changing data", t => {
  const home = temporary(t); let store = openJellyStore(home);
  const first = store.execute({ type: "note.create", title: "我的笔记", markdown: "# 今天\n- [ ] 完成插件" }, 0);
  assert.equal(first.revision, 1); assert.throws(() => store.execute({ type: "note.create", title: "冲突" }, 0), /其他窗口/);
  store.close(); store = openJellyStore(home); assert.equal(store.read().notes[0]?.title, "我的笔记");
  assert.equal(store.execute({ type: "undo" }, 1).notes.length, 0); store.close();
  store = openJellyStore(home); assert.equal(store.execute({ type: "redo" }, 2).notes[0]?.title, "我的笔记");
  assert.equal(store.read().revision, 3); store.close();
});

test("Jelly two connections use atomic revision checks", t => {
  const home = temporary(t), first = openJellyStore(home), second = openJellyStore(home);
  try { first.execute({ type: "note.create", title: "窗口1" }, 0); assert.throws(() => second.execute({ type: "note.create", title: "窗口2" }, 0), /其他窗口/); assert.equal(second.read().notes.length, 1); } finally { first.close(); second.close(); }
});

test("Jelly task scheduling remains one-to-one and title/completion synchronize in both directions", t => {
  const store = openJellyStore(temporary(t)); t.after(() => store.close());
  let state = store.execute({ type: "note.create", title: "发布", markdown: "- [ ] 编写文档\n一些说明" }); const note = state.notes[0]!, block = note.blocks[0]!;
  state = store.execute({ type: "task.schedule", note_id: note.id, block_id: block.id, schedule }); const item = state.items[0]!;
  state = store.execute({ type: "task.schedule", note_id: note.id, block_id: block.id, schedule: { ...schedule, start_time: 600, end_time: 660 } }); assert.equal(state.items.length, 1);
  state = store.execute({ type: "note.update", id: note.id, patch: { markdown: "新增说明\n- [ ] 编写文档\n一些说明" } }); assert.equal(state.notes[0]!.blocks[1]!.id, block.id);
  state = store.execute({ type: "item.update", id: item.id, patch: { title: "完成文档" } }); assert.equal(state.notes[0]!.blocks[1]!.text, "完成文档");
  state = store.execute({ type: "task.complete", note_id: note.id, block_id: block.id, completed: true, completion_description: "已审阅" }); assert.equal(state.items[0]!.completed_at, state.notes[0]!.blocks[1]!.completed_at); assert.equal(state.items[0]!.completion_description, "已审阅");
  state = store.execute({ type: "item.complete", id: item.id, completed: false }); assert.equal(state.notes[0]!.blocks[1]!.completed_at, null);
  const revision = state.revision; assert.throws(() => store.execute({ type: "note.update", id: note.id, patch: { markdown: "删掉任务" } }), /先取消/); assert.equal(store.read().revision, revision);
  store.execute({ type: "task.unlink", note_id: note.id, block_id: block.id }); state = store.execute({ type: "note.update", id: note.id, patch: { markdown: "删掉任务" } }); assert.equal(state.items.length, 1); assert.equal(state.task_links.length, 0);
});

test("Jelly note delete requires a current bound preview and undo restores all links", t => {
  const store = openJellyStore(temporary(t)); t.after(() => store.close());
  let state = store.execute({ type: "note.create", markdown: "- [ ] 待办" }); const note = state.notes[0]!;
  store.execute({ type: "task.schedule", note_id: note.id, block_id: note.blocks[0]!.id, schedule }); store.execute({ type: "note.archive", id: note.id });
  assert.throws(() => store.execute({ type: "note.delete", id: note.id }), /预览/);
  const old = store.previewDelete(note.id); store.execute({ type: "note.pin", id: note.id }); assert.throws(() => store.execute({ type: "note.delete", id: note.id, confirmation_token: old.confirmation_token }), /过期/);
  const preview = store.previewDelete(note.id); assert.equal(preview.counts.task_links, 1);
  state = store.execute({ type: "note.delete", id: note.id, confirmation_token: preview.confirmation_token }); assert.equal(state.notes.length, 0); assert.equal(state.items.length, 1); assert.equal(state.task_links.length, 0);
  state = store.execute({ type: "undo" }); assert.equal(state.task_links.length, 1); assert.equal(state.notes.length, 1);
});

test("Jelly digest write and conversion are idempotent and reject changed source", t => {
  const store = openJellyStore(temporary(t)); t.after(() => store.close());
  let state = store.execute({ type: "inspiration.create", raw_text: "原始研究内容", url: "https://example.com/source", input_kind: "url" }); const inspiration = state.inspirations[0]!;
  state = store.execute({ type: "inspiration.convert", id: inspiration.id }); const revision = state.revision; assert.equal(store.execute({ type: "inspiration.convert", id: inspiration.id }).revision, revision);
  const snapshot = makeJellyMaterialSnapshot(jellySourceHash(state, "inspiration", inspiration.id), { text: "原始研究内容" }); const claim = { text: "研究结论", evidence_block_ids: [snapshot.blocks[0]!.id] };
  state = store.execute({ type: "inspiration.update", id: inspiration.id, patch: { digest: { source_hash: snapshot.source_hash, snapshot, structured: { thesis: claim, takeaways: [claim], chapters: [], quotes: [], dropped: [] } } } });
  state = store.execute({ type: "inspiration.digest_write", id: inspiration.id }); const length = state.notes[0]!.blocks.length; assert.equal(store.execute({ type: "inspiration.digest_write", id: inspiration.id }).notes[0]!.blocks.length, length);
  assert.throws(() => store.execute({ type: "inspiration.update", id: inspiration.id, patch: { raw_text: "新的研究" } }), /已锁定/); assert.equal(store.read().inspirations[0]!.raw_text, "原始研究内容");
});

test("Jelly plan source binding, selection, validation and atomic idempotent application", t => {
  const store = openJellyStore(temporary(t)); t.after(() => store.close());
  let state = store.execute({ type: "note.create", markdown: "计划写一篇文章" }); const n = state.notes[0]!;
  const plan: JellyPlan = { id: "plan-1", title: "写文章", source_type: "note", source_id: n.id, source_hash: jellySourceHash(state, "note", n.id), source_text: "计划写一篇文章", created_at: new Date().toISOString(), actions: [{ id: "a", title: "收集资料", notes: "看原始资料", schedule, category_id: "uncategorized", priority: "P1" }, { id: "b", title: "起草", notes: "", schedule: null, category_id: "uncategorized", priority: "none" }] };
  const invalid = structuredClone(plan); invalid.actions[1]!.schedule = { ...schedule, end_time: 400 }; assert.throws(() => store.execute({ type: "plan.apply", plan: invalid }), /结束时间/); assert.equal(store.read().notes[0]!.blocks.length, 1); assert.equal(store.read().items.length, 0);
  state = store.execute({ type: "plan.apply", plan, selected_action_ids: ["a"] }); assert.equal(state.items.length, 1); assert.equal(state.task_links.length, 1); assert.equal(state.notes[0]!.blocks.filter(b => b.kind === "task").length, 1);
  assert.equal(store.execute({ type: "plan.apply", plan }).revision, state.revision);
  assert.throws(() => store.execute({ type: "plan.apply", plan: { ...plan, id: "new-plan" } }), /原文已变更/);
});

test("Jelly import merges only after preview and preserves both source and existing data on failure", t => {
  const store = openJellyStore(temporary(t)); t.after(() => store.close());
  store.execute({ type: "note.create", title: "保留" }); const exported = store.export(), source = JSON.stringify(exported);
  assert.throws(() => store.execute({ type: "workspace.import", source }), /预览/);
  const preview = store.previewImport(source); assert.equal(preview.counts.notes, 0); store.execute({ type: "workspace.import", source, confirmation_token: preview.confirmation_token }); assert.equal(store.read().notes.length, 1); assert.equal(JSON.stringify(exported), source);
  exported.notes[0]!.title = "覆盖旧文"; assert.throws(() => store.previewImport(exported), /冲突/); assert.equal(store.read().notes[0]!.title, "保留");
});

test("Jelly corrupt persisted content is refused and never replaced with an empty workspace", t => {
  const home = temporary(t), store = openJellyStore(home); store.execute({ type: "note.create", title: "不可覆盖" }); store.close();
  const db = new DatabaseSync(join(home, "jelly", "jelly.db")); db.prepare("UPDATE jelly_workspace SET checksum = 'broken'").run(); db.close();
  assert.throws(() => openJellyStore(home), /校验失败/); const verify = new DatabaseSync(join(home, "jelly", "jelly.db")); assert.match(String(verify.prepare("SELECT body FROM jelly_workspace").get()?.body), /不可覆盖/); verify.close();
});

test("Jelly Markdown preserves task IDs, fences, hierarchy, inline formatting and safe HTML", () => {
  const md = "# 标题\n**重点** *强调* [来源](https://example.com)\n  - [x] 完成\n```ts\nconst x = `<script>alert(1)</script>`;\n```\n---";
  const blocks = jellyMarkdownToBlocks(md); assert.equal(blocks[2]!.indent, 1); assert.equal(blocks[2]!.kind, "task"); assert.equal(jellyBlocksToMarkdown(blocks), md);
  const updated = jellyMarkdownToBlocks("新行\n" + md, blocks); assert.equal(updated[3]!.id, blocks[2]!.id); assert.equal(updated[3]!.completed_at, blocks[2]!.completed_at);
  const html = jellyBlocksToHtml(blocks); assert.ok(!html.includes("<script>")); assert.ok(html.includes("<strong>重点</strong>")); assert.equal(jellyHtmlToBlocks("<h2>标题</h2><p><b>粗体</b></p><script>danger()</script>").map(b => b.text).join(""), "标题粗体");
  const rich = jellyHtmlToBlocks('<ol><li>第一项</li><li>第二项</li></ol><pre><code class="language-ts">const a = 1;</code></pre>'); assert.equal(rich.filter(b => b.kind === "numbered").length, 2); assert.equal(rich.find(b => b.kind === "code")?.language, "ts");
});

test("Jelly Swift schema5 alternating dictionary import preserves IDs, links, civil dates and original archive", () => {
  const dt = { year: 2026, month: 9, day: 22 }, timestamp = 1790035200000, noteId = { rawValue: "note-native" }, blockId = { rawValue: "block-native" };
  const doc = { schemaVersion: 5, state: { revision: 8, calendar: { uncategorizedID: "cat-default", categories: ["cat-default", { id: "cat-default", name: "未分类", colorHex: "#8E8E93", sortIndex: 0 }], items: ["item-native", { id: "item-native", title: "任务", kind: "task", categoryID: "cat-default", schedule: { startDate: dt, endDate: dt }, creationTimeZoneIdentifier: "Asia/Shanghai", createdAt: timestamp, updatedAt: timestamp }], recurrence: { series: [], exceptions: [], completions: [] } }, notes: [noteId, { id: noteId, title: "原笔记", document: { schemaVersion: 1, blocks: [{ id: blockId, kind: "task", inlineContent: { spans: [{ text: "任务", marks: [] }] }, indentLevel: 0, taskState: {} }] }, categoryID: "cat-default", revision: 2, createdAt: timestamp, updatedAt: timestamp }], inspirations: [], calendarNoteRelations: { baselines: [{ item: { _0: "item-native" } }, { primaryNoteID: noteId, referenceNoteIDs: [] }], occurrenceOverrides: [] }, taskBlockLinks: [{ noteID: noteId, blockID: blockId, calendarItemID: "item-native" }], inspirationNoteLinks: [], materialDigests: [] } };
  const before = JSON.stringify(doc), result = decodeJellyImport(doc); assert.equal(result.workspace.items[0]!.start_date, "2026-09-22"); assert.equal(result.workspace.notes[0]!.blocks[0]!.id, "block-native"); assert.equal(result.workspace.relations[0]!.note_id, "note-native"); assert.deepEqual(result.workspace.imported_sources?.[0]?.source, doc); assert.equal(JSON.stringify(doc), before);
});

test("Jelly undo/redo revisions stay above old drafts, including delete and restart recovery", t => {
  const home = temporary(t); let store = openJellyStore(home);
  let state = store.execute({ type: "note.create", title: "v0" }); const id = state.notes[0]!.id;
  state = store.execute({ type: "note.update", id, patch: { title: "v1" }, expected_note_revision: 0 }); const oldRevision = state.notes[0]!.revision;
  state = store.execute({ type: "undo" }); assert.equal(state.notes[0]!.title, "v0"); assert.ok(state.notes[0]!.revision > oldRevision);
  assert.throws(() => store.execute({ type: "note.update", id, patch: { title: "旧草稿" }, expected_note_revision: oldRevision }), /其他窗口/);
  state = store.execute({ type: "redo" }); const beforeDelete = state.notes[0]!.revision;
  store.execute({ type: "note.archive", id }); const preview = store.previewDelete(id); store.execute({ type: "note.delete", id, confirmation_token: preview.confirmation_token }); store.close();
  store = openJellyStore(home); state = store.execute({ type: "undo" }); assert.ok(state.notes[0]!.revision > beforeDelete); store.close();
});

test("Jelly proposal catches later calendar occupancy and overlapping proposed actions atomically", t => {
  const store = openJellyStore(temporary(t)); t.after(() => store.close());
  let state = store.execute({ type: "note.create", markdown: "发布计划" }); const note = state.notes[0]!;
  const plan: JellyPlan = { id: "occupied-plan", title: "发布", source_type: "note", source_id: note.id, source_hash: jellySourceHash(state, "note", note.id), source_text: "发布计划", created_at: new Date().toISOString(), actions: [{ id: "a", title: "发布", notes: "", schedule, category_id: "uncategorized", priority: "none" }] };
  state = store.execute({ type: "item.create", item: { ...schedule, title: "晚到会议" } });
  assert.throws(() => store.execute({ type: "plan.apply", plan }), /时间已被/); assert.equal(store.read().revision, state.revision); assert.equal(store.read().task_links.length, 0);
  plan.actions[0]!.schedule = { ...schedule, start_time: 600, end_time: 660 }; plan.actions.push({ ...plan.actions[0]!, id: "b", title: "复盘" });
  assert.throws(() => store.execute({ type: "plan.apply", plan }), /排期重叠/); assert.equal(store.read().notes[0]!.blocks.length, 1);
  plan.actions[1]!.schedule = { ...schedule, start_time: 660, end_time: 720 }; state = store.execute({ type: "plan.apply", plan }); assert.equal(state.task_links.length, 2);
});

test("Jelly malformed backup metadata and inline formatting are rejected without changing live data", t => {
  const store = openJellyStore(temporary(t)); t.after(() => store.close()); store.execute({ type: "note.create", title: "原文" });
  for (const mutate of [(s: any) => { s.notes[0].created_at = 1; }, (s: any) => { s.notes[0].blocks[0].inline_spans = [{ text: "坏数据", marks: ["script"] }]; }, (s: any) => { s.notes[0].blocks[0].language = {}; }]) {
    const snapshot = store.export(); mutate(snapshot); assert.throws(() => store.previewImport(snapshot), /无效/); assert.equal(store.read().notes[0]!.title, "原文");
  }
});

test("Jelly inline spans on native task blocks survive Markdown and HTML export", () => {
  const blocks = [{ id: "native", kind: "task" as const, text: "重点来源", indent: 0, completed_at: null, completion_description: "", inline_spans: [{ text: "重点", marks: ["bold" as const, "italic" as const] }, { text: "来源", marks: [], link_url: "https://example.com" }] }];
  assert.equal(jellyBlocksToMarkdown(blocks), "- [ ] ***重点***[来源](https://example.com)"); assert.match(jellyBlocksToHtml(blocks), /<strong><em>重点<\/em><\/strong>/); assert.match(jellyBlocksToHtml(blocks), /href="https:\/\/example.com"/);
});

test("Jelly note Markdown/HTML import appends with unique IDs and preserves linked tasks on replace", t => {
  const store = openJellyStore(temporary(t)); t.after(() => store.close());
  let state = store.execute({ type: "note.create", markdown: "- [ ] 原任务" }); const note = state.notes[0]!; store.execute({ type: "task.schedule", note_id: note.id, block_id: note.blocks[0]!.id, schedule });
  state = store.execute({ type: "note.import", id: note.id, source: "<h2>资料</h2><p><b>重点</b></p>", format: "html", mode: "append" }); assert.equal(state.notes[0]!.blocks[1]!.kind, "heading2"); assert.equal(state.task_links.length, 1);
  assert.throws(() => store.execute({ type: "note.import", id: note.id, source: "删除全部任务", format: "markdown", mode: "replace" }), /先取消/);
  state = store.execute({ type: "note.import", id: note.id, source: "开头说明\n- [ ] 原任务", format: "markdown", mode: "replace" }); assert.equal(state.notes[0]!.blocks[1]!.id, note.blocks[0]!.id);
});

test("Jelly legacy notes migrate atomically into the primary note and repeated instances can restore inheritance", t => {
  const store = openJellyStore(temporary(t)); t.after(() => store.close());
  let state = store.execute({ type: "series.create", series: { title: "周会", ...schedule, notes: "**保留随记**", weekdays: [2] } }); const seriesId = state.series[0]!.id;
  state = store.execute({ type: "item.notes_to_note", owner_id: seriesId, mode: "new" }); const primary = state.notes[0]!; assert.equal(state.series[0]!.notes, ""); assert.equal(primary.blocks[0]!.text, "保留随记"); assert.equal(state.relations[0]!.note_id, primary.id);
  state = store.execute({ type: "series.update", id: seriesId, original_date: schedule.start_date, scope: "onlyThis", patch: { notes: "本次记录" } });
  state = store.execute({ type: "item.notes_to_note", owner_id: seriesId, original_date: schedule.start_date, mode: "new" }); assert.equal(state.notes.length, 2); assert.equal(state.relation_overrides?.[0]?.primary, state.notes[1]!.id); assert.equal(state.series[0]!.exceptions[schedule.start_date]?.patch?.notes, "");
  state = store.execute({ type: "relation.reset", owner_id: seriesId, original_date: schedule.start_date }); assert.equal(state.relation_overrides?.length, 0); assert.equal(state.relations[0]!.note_id, primary.id);
});

test("Jelly permanent inspiration deletion requires preview, preserves converted notes and supports undo", t => {
  const store = openJellyStore(temporary(t)); t.after(() => store.close());
  let state = store.execute({ type: "inspiration.create", raw_text: "灵感" }); const id = state.inspirations[0]!.id;
  store.execute({ type: "inspiration.convert", id }); store.execute({ type: "inspiration.archive", id }); assert.throws(() => store.execute({ type: "inspiration.delete", id }), /预览/);
  const preview = store.previewDeleteInspiration(id); state = store.execute({ type: "inspiration.delete", id, confirmation_token: preview.confirmation_token }); assert.equal(state.inspirations.length, 0); assert.equal(state.notes.length, 1);
  state = store.execute({ type: "undo" }); assert.equal(state.inspirations[0]!.note_id, state.notes[0]!.id);
});
