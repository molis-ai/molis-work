import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeJellyMaterialSnapshot, validateJellyMaterialSnapshot, validateJellyStructuredDigest, renderJellyDigestMarkdown, jellyMaterialFingerprint } from "../plugins/native/jelly/src/material.js";
import { jellyHash, jellySourceHash } from "../plugins/native/jelly/src/content.js";
import { openJellyStore } from "../plugins/native/jelly/src/store.js";
import { decodeJellyImport } from "../plugins/native/jelly/src/import.js";
import type { JellyMaterialSnapshot, JellyStructuredDigest, JellyPlan } from "../packages/contracts/src/modules/jelly.js";
const hash = jellyHash("original-source");
function summaryFor(snapshot: JellyMaterialSnapshot): JellyStructuredDigest { const claim = { text: "以验证过的材料为依据", evidence_block_ids: [snapshot.blocks[0]!.id] }; return { thesis: claim, takeaways: [claim], chapters: [], quotes: [], dropped: [] }; }
function storeFor(t: test.TestContext) { const home = mkdtempSync(join(tmpdir(), "jelly-material-")), store = openJellyStore(home); t.after(() => { store.close(); rmSync(home, { recursive: true, force: true }); }); return store; }

test("Jelly material IDs/fingerprints are deterministic and long paragraphs split without broken Unicode", () => {
  const input = { text: "第一段。\n\n" + "🪼".repeat(8001) + "\n\n第三段。", extractor: "plain-text" };
  const first = makeJellyMaterialSnapshot(hash, input), second = makeJellyMaterialSnapshot(hash, input);
  assert.equal(first.content_fingerprint, second.content_fingerprint); assert.deepEqual(first.blocks, second.blocks); assert.ok(first.blocks.every(block => block.text.length <= 8000));
  assert.equal(first.blocks.filter(block => block.locator.kind === "paragraph" && block.locator.index === 1).map(block => block.text).join(""), "🪼".repeat(8001));
  assert.equal(new Set(first.blocks.map(block => block.id)).size, first.blocks.length);
  const changed = structuredClone(first); changed.blocks[0]!.text = "篡改正文"; assert.throws(() => validateJellyMaterialSnapshot(changed), /指纹校验失败/);
});

test("Jelly material preserves native page, transcript, image/time locators and partial-coverage diagnostics", () => {
  const snapshot = makeJellyMaterialSnapshot(hash, { text: "聚合正文", pages: [{ number: 2, text: "第二页扫描文字", method: "ocr", confidence: 0.8 }], segments: [{ start_seconds: 8.5, end_seconds: 10, text: "语音正文" }], frames: [{ seconds: 12, text: "视频画面文字", confidence: 0.9 }, { index: 3, text: "单张图片文字" }], provider: "native", coverage: { status: "partial", processed_pages: 2, total_pages: 3, issues: ["ocrFailed"] } });
  assert.deepEqual(snapshot.blocks.map(block => block.locator.kind), ["page", "timestamp", "timestamp", "image"]); assert.equal(snapshot.blocks[0]!.role, "ocr"); assert.equal(snapshot.blocks[0]!.confidence, 0.8); assert.deepEqual(snapshot.coverage, { status: "partial", processed: 2, expected: 3, issues: ["ocrFailed"] });
  assert.match(renderJellyDigestMarkdown(summaryFor(snapshot), snapshot), /素材仅部分读取/);
  assert.equal(makeJellyMaterialSnapshot(hash, { text: "" }).coverage.status, "insufficient");
  assert.equal(makeJellyMaterialSnapshot(hash, { text: "正文", pages: [{ number: 1, text: "正文", confidence: null }] }).blocks[0]!.confidence, undefined);
  assert.throws(() => makeJellyMaterialSnapshot(hash, { text: "", segments: [{ text: "bad", start_seconds: 9, end_seconds: 3 }] }), /时间定位/);
});

test("Jelly structured digest rejects missing/metadata-only evidence, fake quotes, fake speakers and chapter reorder", () => {
  const snapshot = makeJellyMaterialSnapshot(hash, { text: "Alice：先做用户验证。\n\n随后才发布产品。" }); const good = summaryFor(snapshot);
  good.quotes = [{ text: "先做用户验证", speaker: "Alice", evidence_block_id: snapshot.blocks[0]!.id }];
  good.chapters = [{ title: "验证", anchor_block_id: snapshot.blocks[0]!.id, points: [good.thesis] }, { title: "发布", anchor_block_id: snapshot.blocks[1]!.id, points: [{ text: "发布", evidence_block_ids: [snapshot.blocks[1]!.id] }] }];
  assert.deepEqual(validateJellyStructuredDigest(good, snapshot), good); assert.match(renderJellyDigestMarkdown(good, snapshot), /正文第 2 段/);
  const mutate = [(s: JellyStructuredDigest) => { s.thesis.evidence_block_ids = []; }, (s: JellyStructuredDigest) => { s.takeaways[0]!.evidence_block_ids = ["invented-id"]; }, (s: JellyStructuredDigest) => { s.quotes[0]!.text = "不存在的原话"; }, (s: JellyStructuredDigest) => { s.quotes[0]!.speaker = "Bob"; }, (s: JellyStructuredDigest) => { s.chapters.reverse(); }];
  for (const change of mutate) { const invalid = structuredClone(good); change(invalid); assert.throws(() => validateJellyStructuredDigest(invalid, snapshot)); }
  const metadata = structuredClone(snapshot); metadata.blocks[0]!.role = "metadata"; metadata.content_fingerprint = jellyMaterialFingerprint(metadata.blocks, metadata.coverage); assert.throws(() => validateJellyStructuredDigest(good, metadata), /元信息/);
});

test("Jelly material/digest writes are source-bound, source edits invalidate them, conversion freezes original source", t => {
  const store = storeFor(t); let state = store.execute({ type: "inspiration.create", raw_text: "原材料", material: { text: "原材料", pages: [{ number: 1, text: "原材料" }] } }); const id = state.inspirations[0]!.id;
  const snapshot = state.inspirations[0]!.material!, structured = summaryFor(snapshot);
  state = store.execute({ type: "inspiration.update", id, patch: { digest: { source_hash: snapshot.source_hash, snapshot, structured, summary: "被伪造的摘要正文" } } }); assert.ok(!state.inspirations[0]!.digest!.summary.includes("被伪造"));
  const before = state.revision; const invalid = structuredClone(structured); invalid.thesis.evidence_block_ids = ["fake"];
  assert.throws(() => store.execute({ type: "inspiration.update", id, patch: { digest: { source_hash: snapshot.source_hash, snapshot, structured: invalid } } }), /正文素材/); assert.equal(store.read().revision, before);
  state = store.execute({ type: "inspiration.update", id, patch: { raw_text: "改后的原材料" } }); assert.equal(state.inspirations[0]!.material, undefined); assert.equal(state.inspirations[0]!.digest, null);
  assert.throws(() => store.execute({ type: "inspiration.update", id, patch: { material: snapshot } }), /来源不一致/);
  store.execute({ type: "inspiration.convert", id }); assert.throws(() => store.execute({ type: "inspiration.update", id, patch: { url: "https://different.example.com" } }), /锁定/);
  state = store.execute({ type: "inspiration.update", id, patch: { title: "改标题", raw_text: "改后的原材料", url: null } }); assert.equal(state.inspirations[0]!.title, "改标题");
});

test("Jelly selection plans bind ordered contiguous blocks and insert after the selected range", t => {
  const store = storeFor(t); let state = store.execute({ type: "note.create", markdown: "前文\n第一段需要研究\n第二段需要计划\n末尾保持原位" }); const note = state.notes[0]!;
  const plan: JellyPlan = { id: "selection-plan", title: "选区拆解", source_type: "note", source_id: note.id, source_hash: jellySourceHash(state, "note", note.id), source_text: "需要研究\n第二段需要", selection: { block_ids: note.blocks.slice(1, 3).map(block => block.id), text: "需要研究\n第二段需要" }, actions: [{ id: "a", title: "研究材料", notes: "查看原文", duration_minutes: 45, schedule: null, category_id: "uncategorized", priority: "P1" }], created_at: new Date().toISOString() };
  const invalid = structuredClone(plan); invalid.selection!.block_ids.reverse(); assert.throws(() => store.execute({ type: "plan.apply", plan: invalid }), /连续正文/); assert.equal(store.read().revision, state.revision);
  const changedText = structuredClone(plan); changedText.selection!.text = "伪造选区"; assert.throws(() => store.execute({ type: "plan.apply", plan: changedText }), /选区原文/);
  state = store.execute({ type: "plan.apply", plan }); assert.deepEqual(state.notes[0]!.blocks.map(block => block.text), ["前文", "第一段需要研究", "第二段需要计划", "研究材料", "查看原文", "末尾保持原位"]);
});

test("Jelly schema5 imports real source.live links plus snapshot locators, coverage and structured evidence", () => {
  const stamp = Date.parse("2026-09-22T08:00:00Z"), inspirationId = { rawValue: "legacy-inspiration" }, noteId = { rawValue: "legacy-note" }, blockId = { rawValue: "legacy-material-block" }, noteBlockId = { rawValue: "legacy-note-block" };
  const claim = { text: "先验证再发布", evidenceBlockIDs: [blockId] };
  const nativeSnapshot = { sourceChecksum: "a".repeat(64), contentFingerprint: "b".repeat(64), blocks: [{ id: blockId, role: "ocr", text: "Alice：先验证，再发布。", locator: { page: { number: 3 } }, confidence: { basisPoints: 8500 } }], coverage: { partial: { processed: 1, expected: 2, issues: ["ocrFailed"] } }, provenance: { adapterIdentifier: "jelly-pdfkit", adapterVersion: "1", acquiredAt: stamp }, createdAt: stamp };
  const doc: any = { schemaVersion: 5, state: { revision: 3, calendar: { uncategorizedID: "default", categories: ["default", { id: "default", name: "未分类", colorHex: "#8E8E93", sortIndex: 0 }], items: [], recurrence: { series: [], exceptions: [], completions: [] } }, notes: [noteId, { id: noteId, title: "历史摘要", document: { schemaVersion: 1, blocks: [{ id: noteBlockId, kind: "paragraph", inlineContent: { spans: [{ text: "已经写入的摘要", marks: [] }] }, indentLevel: 0 }] }, categoryID: "default", revision: 0, createdAt: stamp, updatedAt: stamp }], inspirations: [inspirationId, { id: inspirationId, inputKind: "file", rawText: "源文件摘要", rawFile: { displayName: "source.pdf", bookmarkData: "opaque-original-bookmark" }, categoryID: "default", lifecycle: "active", createdAt: stamp, updatedAt: stamp }], calendarNoteRelations: { baselines: [], occurrenceOverrides: [] }, taskBlockLinks: [], inspirationNoteLinks: [{ source: { live: { _0: inspirationId } }, noteID: noteId, createdAt: stamp }], materialDigests: [inspirationId, { id: { rawValue: "legacy-digest" }, inspirationID: inspirationId, sourceChecksum: "a".repeat(64), preparedSnapshot: nativeSnapshot, result: { contentFingerprint: "b".repeat(64), summary: { thesis: claim, takeaways: [claim], chapters: [{ title: "验证", anchorBlockID: blockId, points: [claim] }], quotes: [{ text: "先验证，再发布", speaker: "Alice", evidenceBlockID: blockId }], dropped: [] }, provenance: { summaryContractVersion: "summary-contract-v3" }, completedAt: stamp }, noteWrite: { noteID: noteId, resultFingerprint: "c".repeat(64), blockIDs: [noteBlockId], writtenAt: stamp }, createdAt: stamp, updatedAt: stamp }] } };
  const before = JSON.stringify(doc), result = decodeJellyImport(doc), inspiration = result.workspace.inspirations[0]!;
  assert.equal(inspiration.note_id, "legacy-note"); assert.deepEqual(inspiration.material?.blocks[0]?.locator, { kind: "page", number: 3 }); assert.equal(inspiration.material?.blocks[0]?.confidence, 0.85); assert.equal(inspiration.material?.coverage.status, "partial");
  assert.equal(inspiration.digest?.structured?.thesis.evidence_block_ids[0], "legacy-material-block"); assert.match(inspiration.digest!.summary, /第 3 页/); assert.deepEqual(inspiration.digest?.written_note_ids, ["legacy-note"]); assert.deepEqual(result.workspace.imported_sources?.[0]?.source, doc); assert.equal(JSON.stringify(doc), before);
  const forged = structuredClone(doc); forged.state.materialDigests[1]!.result!.summary.quotes[0]!.text = "素材没有说过这句话"; assert.throws(() => decodeJellyImport(forged), /引文未出现/);
});

test("Jelly local attachment receipts survive validation and bind fingerprints even for identical extracted text", t => {
  const store = storeFor(t); let state = store.execute({ type: "inspiration.create", raw_text: "相同正文", file_name: "report.pdf", material: { text: "相同正文", file_name: "report.pdf", source_sha256: "a".repeat(64) } }); const id = state.inspirations[0]!.id, first = state.inspirations[0]!.material!;
  assert.deepEqual(first.attachment, { file_name: "report.pdf", sha256: "a".repeat(64) }); assert.deepEqual(validateJellyMaterialSnapshot(first).attachment, first.attachment);
  const oldDigest = { source_hash: first.source_hash, snapshot: first, structured: summaryFor(first) };
  store.execute({ type: "inspiration.update", id, patch: { digest: oldDigest } });
  const replacement = { text: "相同正文", file_name: "report.pdf", source_sha256: "b".repeat(64) };
  state = store.execute({ type: "inspiration.update", id, patch: { material: replacement } }); const second = state.inspirations[0]!.material!;
  assert.notEqual(first.content_fingerprint, second.content_fingerprint); assert.equal(state.inspirations[0]!.digest, null);
  assert.throws(() => store.execute({ type: "inspiration.update", id, patch: { digest: oldDigest } }), /素材快照已变更/); assert.equal(store.read().inspirations[0]!.material?.attachment?.sha256, "b".repeat(64));
  state = store.execute({ type: "inspiration.update", id, patch: { material: first, digest: oldDigest } }); assert.ok(state.inspirations[0]!.digest); assert.equal(state.inspirations[0]!.material?.attachment?.sha256, "a".repeat(64));
  for (const file_name of ["../report.pdf", "folder/report.pdf", "folder\\report.pdf", ".", "..", "C:report.pdf", "x\0.pdf", "a".repeat(241)]) assert.throws(() => makeJellyMaterialSnapshot(hash, { text: "body", file_name, source_sha256: "a".repeat(64) }));
  assert.throws(() => makeJellyMaterialSnapshot(hash, { text: "body", file_name: "report.pdf", source_sha256: "bad" }), /SHA-256/);
  const plain = makeJellyMaterialSnapshot(hash, { text: "body" }); assert.equal(validateJellyMaterialSnapshot(plain).attachment, undefined);
});
