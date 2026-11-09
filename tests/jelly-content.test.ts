import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openJellyStore } from "./fixtures/plugin-home-stores.js";
import { applyJellyContentCommand, emptyJellyWorkspace, jellyHash, jellySourceHash } from "@molis-ai/molis-work-plugin-jelly";
import { jellyMarkdownToBlocks, jellyBlocksToMarkdown, jellyBlocksToHtml, jellyHtmlToBlocks } from "@molis-ai/molis-work-plugin-jelly";
import { decodeJellyImport } from "@molis-ai/molis-work-plugin-jelly";
import type { JellyPlan } from "@molis-ai/molis-work-plugin-jelly/contract";
function temporary(t: test.TestContext): string { const home = mkdtempSync(join(tmpdir(), "molis-jelly-")); t.after(() => rmSync(home, { recursive: true, force: true })); return home; }
const schedule = { start_date: "2026-09-22", end_date: "2026-09-22", start_time: 540, end_time: 600 };

test("JLY-27-04: Jelly persists commands and undo/redo across reopen, rejects stale revisions without changing data", t => {
  const home = temporary(t); let store = openJellyStore(home);
  const first = store.execute({ type: "note.create", title: "我的笔记", markdown: "# 今天\n- [ ] 完成插件" }, 0);
  assert.equal(first.revision, 1); assert.throws(() => store.execute({ type: "note.create", title: "冲突" }, 0), /其他窗口/);
  store.close(); store = openJellyStore(home); assert.equal(store.read().notes[0]?.title, "我的笔记");
  assert.equal(store.execute({ type: "undo" }, 1).notes.length, 0); store.close();
  store = openJellyStore(home); assert.equal(store.execute({ type: "redo" }, 2).notes[0]?.title, "我的笔记");
  assert.equal(store.read().revision, 3); store.close();
});

test("JLY-27-04: Jelly two connections use atomic revision checks", t => {
  const home = temporary(t), first = openJellyStore(home), second = openJellyStore(home);
  try { first.execute({ type: "note.create", title: "窗口1" }, 0); assert.throws(() => second.execute({ type: "note.create", title: "窗口2" }, 0), /其他窗口/); assert.equal(second.read().notes.length, 1); } finally { first.close(); second.close(); }
});

test("JLY-27-02: Jelly task scheduling remains one-to-one and title/completion synchronize in both directions", t => {
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

test("JLY-27-04: Jelly undo/redo revisions stay above old drafts, including delete and restart recovery", t => {
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

test("JLY-27-03: Jelly malformed backup metadata and inline formatting are rejected without changing live data", t => {
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

test("JLY-27-05: direct content commands publish nothing when removing a linked task fails", () => {
  const state = emptyJellyWorkspace(), now = "2026-09-22T01:00:00.000Z";
  assert.equal(applyJellyContentCommand(state, {
    type: "note.create", id: "note", title: "保留标题", blocks: [{ id: "task", kind: "task", text: "保留任务" }],
  }, now), true);
  assert.equal(applyJellyContentCommand(state, { type: "task.schedule", note_id: "note", block_id: "task", schedule }, now), true);
  const before = structuredClone(state);
  assert.throws(() => applyJellyContentCommand(state, {
    type: "note.update", id: "note", patch: { title: "部分修改", blocks: [] },
  }, now), { code: "jelly.linked_task" });
  assert.deepEqual(state, before);
});

test("JLY-27-02: stored edits move repeating relations and reassign only the affected categories", t => {
  const store = openJellyStore(temporary(t));
  t.after(() => store.close());
  store.execute({ type: "category.create", category: { id: "work", name: "工作" } });
  const blocks = [{ id: "block", text: "原始记录", inline_spans: [{ text: "原始记录", marks: ["bold"] }] }];
  const created = store.execute({ type: "note.create", id: "note", category_id: "work", blocks });
  blocks[0].inline_spans[0].text = "外部修改";
  assert.equal(created.notes[0].blocks[0].inline_spans?.[0].text, "原始记录");

  store.execute({ type: "series.create", series: { id: "series", title: "周会", start_date: "2026-09-21", weekdays: [1] } });
  store.execute({ type: "relation.attach", owner_id: "series", original_date: "2026-10-05", note_id: "note", role: "primary" });
  store.execute({ type: "series.update", id: "series", original_date: "2026-10-05", scope: "onlyThis", patch: { category_id: "work" } });
  const old = store.read();
  const split = store.execute({
    type: "series.update", id: "series", original_date: "2026-09-28", scope: "thisAndFuture",
    new_series_id: "future", patch: { start_date: "2026-09-29" },
  });
  assert.equal(split.relation_overrides?.[0].owner_id, "future");
  assert.equal(split.relation_overrides?.[0].original_date, "2026-10-06");
  assert.equal(split.relation_overrides?.[0].primary, "note");
  assert.equal(old.relation_overrides?.[0].owner_id, "series");
  const remapped = store.execute({ type: "category.delete", id: "work" });
  assert.equal(remapped.series[1].exceptions["2026-10-06"]?.patch?.category_id, "uncategorized");
  assert.equal(remapped.notes[0].category_id, "uncategorized");
  assert.equal(remapped.notes[0].revision, created.notes[0].revision + 1);
  assert.equal(created.notes[0].category_id, "work");
  assert.equal(split.series[1].exceptions["2026-10-06"]?.patch?.category_id, "work");
  assert.deepEqual(store.read(), remapped);

  assert.throws(() => store.execute({ type: "item.create", item: { ...schedule, title: "重复 ID", id: "future" } }), { code: "jelly.invalid" });
  assert.throws(() => store.execute({ type: "series.complete", id: "future", original_date: "2026-10-06", completed: true, completion_description: 12 }), { code: "jelly.invalid" });
  assert.deepEqual(store.read(), remapped);
});

test("JLY-27-03: workspace and history still reject invalid content with correct checksums", t => {
  const home = temporary(t), store = openJellyStore(home);
  const db = new DatabaseSync(join(home, "jelly", "jelly.db"));
  t.after(() => { db.close(); store.close(); });
  const initial = store.execute({ type: "note.create", id: "note", markdown: "**原文**" });
  const latest = store.execute({ type: "note.update", id: "note", patch: { title: "保留" } });
  const invalid = structuredClone(latest);
  const malformed = { ...invalid.notes[0].blocks[0], inline_spans: [{ text: "原文", marks: ["invalid"] }] };
  const badWorkspace = JSON.stringify({ ...invalid, notes: [{ ...invalid.notes[0], blocks: [malformed] }] });
  const update = db.prepare("UPDATE jelly_workspace SET body = ?, checksum = ?");
  update.run(badWorkspace, jellyHash(badWorkspace));
  assert.throws(() => store.read(), { code: "jelly.corrupt" });
  assert.throws(() => store.execute({ type: "note.pin", id: "note" }), { code: "jelly.corrupt" });
  assert.equal(db.prepare("SELECT body FROM jelly_workspace").get()?.body, badWorkspace);

  const valid = JSON.stringify(latest);
  update.run(valid, jellyHash(valid));
  const badHistory = JSON.stringify({ ...initial, notes: [{ ...initial.notes[0], blocks: [malformed] }] });
  db.prepare("UPDATE jelly_history SET before_body = ?, before_checksum = ? WHERE command = 'note.update'").run(badHistory, jellyHash(badHistory));
  assert.throws(() => store.execute({ type: "undo" }), { code: "jelly.invalid" });
  assert.equal(db.prepare("SELECT undone FROM jelly_history WHERE command = 'note.update'").get()?.undone, 0);
  assert.deepEqual(store.read(), latest);
});

test("JLY-27-03: a scoped write rejects content that changes into an invalid form in JSON", t => {
  const store = openJellyStore(temporary(t));
  t.after(() => store.close());
  const original = store.execute({ type: "note.create", id: "note", markdown: "原文" });
  // A sparse marks array has a hole in memory and an invalid null in the stored JSON.
  assert.throws(() => store.execute({
    type: "note.update", id: "note",
    patch: { blocks: [{ text: "变更", inline_spans: [{ text: "变更", marks: Array(1) }] }] },
  }), { code: "jelly.corrupt" });
  assert.deepEqual(store.read(), original);
  assert.equal(store.execute({ type: "undo" }).notes.length, 0);
});

test("JLY-27-03: rejected SQLite readback rolls back the note deletion and retains the preview", t => {
  const home = temporary(t), store = openJellyStore(home);
  const db = new DatabaseSync(join(home, "jelly", "jelly.db"));
  t.after(() => { db.close(); store.close(); });
  store.execute({ type: "note.create", id: "note", title: "保留直到确认" });
  const archived = store.execute({ type: "note.archive", id: "note" });
  const preview = store.previewDelete("note");
  const persisted = () => ["jelly_workspace", "jelly_history", "jelly_note_versions", "jelly_previews"].map(table => db.prepare(`SELECT * FROM ${table}`).all());
  const before = persisted();
  db.exec("CREATE TRIGGER test_rewrite_jelly AFTER UPDATE ON jelly_workspace BEGIN UPDATE jelly_workspace SET checksum = 'test-corrupt'; END");
  const command = { type: "note.delete", id: "note", confirmation_token: preview.confirmation_token };
  assert.throws(() => store.execute(command, archived.revision), { code: "jelly.corrupt" });
  assert.deepEqual(persisted(), before);
  db.exec("DROP TRIGGER test_rewrite_jelly");

  const deleted = store.execute(command, archived.revision);
  assert.equal(deleted.notes.length, 0);
  assert.equal(deleted.revision, archived.revision + 1);
  assert.throws(() => store.execute(command), { code: "jelly.stale_preview" });
  const restored = store.execute({ type: "undo" });
  assert.ok(restored.notes[0].revision > archived.notes[0].revision);
  assert.equal(store.execute({ type: "redo" }).notes.length, 0);

  const workspace = store.export(), source = JSON.stringify(workspace);
  const importPreview = store.previewImport(source);
  assert.equal(store.execute({ type: "workspace.import", source, confirmation_token: importPreview.confirmation_token }).revision, workspace.revision);
  assert.throws(() => store.execute({ type: "workspace.import", source, confirmation_token: importPreview.confirmation_token }), { code: "jelly.stale_preview" });
});

test("JLY-27-04: a redo after the note disappeared still exceeds its persisted high-water revision", t => {
  const home = temporary(t);
  let high: number;
  {
    const store = openJellyStore(home);
    try {
      store.execute({ type: "note.create", id: "note", title: "原文" });
      store.execute({ type: "note.update", id: "note", patch: { title: "更新" } });
      high = store.execute({ type: "undo" }).notes[0].revision;
      assert.equal(store.execute({ type: "undo" }).notes.length, 0);
    } finally { store.close(); }
  }
  const store = openJellyStore(home);
  t.after(() => store.close());
  const restored = store.execute({ type: "redo" });
  assert.equal(restored.notes[0].title, "原文");
  assert.ok(restored.notes[0].revision > high);
  assert.throws(() => store.execute({ type: "note.update", id: "note", patch: { title: "旧草稿" }, expected_note_revision: high }), { code: "jelly.conflict" });
  assert.deepEqual(store.read(), restored);
});
