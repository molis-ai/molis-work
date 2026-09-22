import type { JellyBlock, JellyItem, JellyWorkspace, JellySchedule, JellyMaterialSnapshot, JellyMaterialBlock, JellyMaterialCoverage, JellyMaterialLocator, JellyStructuredDigest } from "@molis-ai/molis-work-contracts/modules/jelly";
import { emptyJellyWorkspace, validateJellyWorkspace } from "./calendar.js";
import { jellyAddDays } from "./calendar-validation.js";
import { jellyHash, validateJellyContent } from "./content.js";
import { jellyMaterialFingerprint, validateJellyMaterialSnapshot, validateJellyStructuredDigest, renderJellyDigestMarkdown } from "./material.js";
import { jellyAssert } from "./error.js";

type Obj = Record<string, any>;
function object(value: unknown): Obj { jellyAssert(value && typeof value === "object" && !Array.isArray(value), "导入对象格式无效"); return value as Obj; }
function id(value: unknown): string { const raw = typeof value === "string" ? value : object(value).rawValue; jellyAssert(typeof raw === "string" && raw.length > 0, "导入 ID 无效"); return raw; }
/** Swift encodes dictionaries keyed by UUID / structs as [key,value,key,value]. */
function pairs(value: unknown): [any, any][] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) { jellyAssert(value.length % 2 === 0, "Swift 字典必须是交替的键值数组"); const result: [any, any][] = []; for (let i = 0; i < value.length; i += 2) result.push([value[i], value[i + 1]]); return result; }
  return Object.entries(object(value));
}
function identities(value: unknown): [any, any][] { const entries = pairs(value); for (const [key, value] of entries) jellyAssert(id(key) === id(object(value).id), "Swift 字典键与记录 ID 不一致"); return entries; }
function list(value: unknown): any[] { jellyAssert(Array.isArray(value), "导入列表格式无效"); return value; }
function date(value: any): string { if (typeof value === "string") return value; const d = object(value); return `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`; }
function stamp(value: any, fallback: string): string { if (value === undefined || value === null) return fallback; const result = new Date(value); jellyAssert(Number.isFinite(result.getTime()), "导入时间戳无效"); return result.toISOString(); }
function minute(value: any): number | null { return value == null ? null : typeof value === "number" ? value : object(value).value; }
function schedule(value: any): JellySchedule { const s = object(value); return { start_date: date(s.startDate), end_date: date(s.endDate), start_time: minute(s.startTime), end_time: minute(s.endTime) }; }
function priority(value: any): JellyItem["priority"] { return value && value !== "none" ? String(value).toUpperCase() as JellyItem["priority"] : "none"; }
function block(value: any, now: string): JellyBlock {
  const b = object(value), spans = list(b.inlineContent?.spans ?? []).map((s: any) => ({ text: String(s.text ?? ""), marks: list(s.marks ?? []) as ("bold" | "italic" | "code")[], ...(s.linkURL ? { link_url: String(s.linkURL) } : {}) }));
  const text = spans.map(s => s.text).join("");
  return { id: id(b.id), kind: b.kind === "ordered" ? "numbered" : b.kind, text, indent: b.indentLevel ?? 0, completed_at: b.taskState?.completedAt == null ? null : stamp(b.taskState.completedAt, now), completion_description: b.taskState?.completionDescription ?? "", ...(b.codeInfoString ? { language: b.codeInfoString } : {}), inline_spans: spans };
}
function nativeMaterialSnapshot(value: unknown, sourceHash: string, now: string): JellyMaterialSnapshot {
  const raw = object(value);
  const blocks: JellyMaterialBlock[] = list(raw.blocks).map(value => {
    const block = object(value), loc = object(block.locator); jellyAssert(block.confidence == null || (Number.isInteger(block.confidence.basisPoints) && block.confidence.basisPoints >= 0 && block.confidence.basisPoints <= 10_000), "原 Jelly 素材置信度无效"); let locator: JellyMaterialLocator;
    if (loc.paragraph) locator = { kind: "paragraph", index: loc.paragraph.index };
    else if (loc.page) locator = { kind: "page", number: loc.page.number };
    else if (loc.image) locator = { kind: "image", index: loc.image.index };
    else { jellyAssert(loc.timestamp, "原 Jelly 素材定位无效"); locator = { kind: "timestamp", start_seconds: loc.timestamp.startSeconds, end_seconds: loc.timestamp.endSeconds }; }
    return { id: id(block.id), role: block.role, text: block.text, locator, ...(block.confidence == null ? {} : { confidence: block.confidence.basisPoints / 10_000 }) };
  });
  const c = object(raw.coverage); let coverage: JellyMaterialCoverage;
  if (c.sufficient) coverage = { status: "sufficient", processed: blocks.filter(block => block.role !== "metadata").length, issues: [] };
  else if (c.partial) coverage = { status: "partial", processed: c.partial.processed, ...(c.partial.expected === undefined ? {} : { expected: c.partial.expected }), issues: c.partial.issues };
  else { jellyAssert(c.insufficient, "原 Jelly 素材覆盖率无效"); coverage = { status: "insufficient", processed: blocks.filter(block => block.role !== "metadata").length, issues: [c.insufficient.code] }; }
  return validateJellyMaterialSnapshot({ source_hash: sourceHash, content_fingerprint: jellyMaterialFingerprint(blocks, coverage), blocks, coverage, provider: raw.provenance?.adapterIdentifier ?? "jelly-native", acquired_at: stamp(raw.provenance?.acquiredAt ?? raw.createdAt, now) });
}
function nativeStructuredDigest(value: unknown, snapshot: JellyMaterialSnapshot): JellyStructuredDigest {
  const summary = object(value), claim = (raw: unknown) => { const c = object(raw); return { text: c.text, evidence_block_ids: list(c.evidenceBlockIDs).map(id) }; };
  return validateJellyStructuredDigest({ thesis: claim(summary.thesisClaim ?? summary.thesis), takeaways: list(summary.takeawayClaims ?? summary.takeaways).map(claim),
    chapters: list(summary.chapters ?? []).map(ch => ({ title: ch.title, anchor_block_id: id(ch.anchorBlockID), points: list(ch.pointClaims ?? ch.points).map(claim) })),
    quotes: list(summary.quotes ?? []).map(q => ({ text: q.text, evidence_block_id: id(q.evidenceBlockID), ...(q.speaker ? { speaker: q.speaker } : {}) })),
    dropped: list(summary.droppedClaims ?? summary.dropped ?? []).map(claim) }, snapshot);
}
export interface JellyImportResult { workspace: JellyWorkspace; warnings: string[]; source_hash: string }
export function decodeJellyImport(source: unknown, now = new Date().toISOString()): JellyImportResult {
  const parsed = typeof source === "string" ? JSON.parse(source) : structuredClone(source), doc = object(parsed), source_hash = jellyHash(typeof source === "string" ? source : JSON.stringify(source));
  if (doc.schema_version === 1) { const workspace = structuredClone(doc) as JellyWorkspace; validateJellyWorkspace(workspace); validateJellyContent(workspace); return { workspace, warnings: [], source_hash }; }
  jellyAssert(doc.schemaVersion === 5, "支持 Molis Work Jelly 备份或原 Jelly schema 5 工作区");
  const sourceState = object(doc.state), cal = object(sourceState.calendar), recurrence = object(cal.recurrence), nowStamp = now, workspace = emptyJellyWorkspace(), warnings: string[] = [];
  const uncategorizedId = id(cal.uncategorizedID), catId = (v: any) => id(v) === uncategorizedId ? "uncategorized" : id(v);
  workspace.categories = identities(cal.categories).map(([, c]) => ({ id: catId(c.id), name: c.name, color: c.colorHex, sort_index: c.sortIndex }));
  const base = (value: Obj): Omit<JellyItem, keyof JellySchedule> => ({ id: id(value.id), title: value.title, kind: value.kind ?? "task", category_id: catId(value.categoryID), priority: priority(value.priority), pinned: value.isPinned ?? false, completed_at: value.completedAt == null ? null : stamp(value.completedAt, nowStamp), completion_description: value.completionDescription ?? "", notes: value.notes ?? "", untimed_rank: value.untimedRank ?? 0, created_at: stamp(value.createdAt, nowStamp), updated_at: stamp(value.updatedAt, nowStamp), time_zone: value.creationTimeZoneIdentifier ?? "UTC" });
  workspace.items = identities(cal.items).map(([, v]) => ({ ...base(v), ...schedule(v.schedule) }));
  workspace.series = identities(recurrence.series).map(([, v]) => ({ ...base(v), start_date: date(v.ruleStartDate), end_date: jellyAddDays(date(v.ruleStartDate), v.durationDays - 1), start_time: minute(v.startTime), end_time: minute(v.endTime), weekdays: list(v.weekdays), until: v.recurrenceEndDate == null ? null : date(v.recurrenceEndDate), exceptions: {}, completions: {} }));
  for (const [key, value] of pairs(recurrence.exceptions)) {
    const s = workspace.series.find(s => s.id === id(key.seriesID)); jellyAssert(s, "重复例外系列不存在"); const day = date(key.originalDate);
    if ("skipped" in object(value)) s.exceptions[day] = { deleted: true };
    else { const patch = object(value.modified?._0 ?? value.modified); s.exceptions[day] = { patch: { ...schedule(patch.displayedSchedule), title: patch.title, kind: patch.kind, category_id: catId(patch.categoryID), priority: priority(patch.priority), pinned: patch.isPinned ?? false, notes: patch.notes ?? "" } }; }
  }
  for (const [key, value] of pairs(recurrence.completions)) { const s = workspace.series.find(s => s.id === id(key.seriesID)); jellyAssert(s, "完成状态系列不存在"); s.completions[date(key.originalDate)] = { completed_at: stamp(value.completedAt, nowStamp), completion_description: value.completionDescription ?? "" }; }
  for (const [, n] of identities(sourceState.notes)) jellyAssert(n.document?.schemaVersion === 1, "不支持的笔记区块版本");
  workspace.notes = identities(sourceState.notes).map(([, n]) => ({ id: id(n.id), title: n.title, category_id: catId(n.categoryID), blocks: list(n.document.blocks).map(b => block(b, nowStamp)), pinned: n.isPinned ?? false, archived_at: n.archivedAt == null ? null : stamp(n.archivedAt, nowStamp), revision: n.revision, created_at: stamp(n.createdAt, nowStamp), updated_at: stamp(n.updatedAt, nowStamp) }));
  workspace.inspirations = identities(sourceState.inspirations).map(([, i]) => ({ id: id(i.id), input_kind: i.inputKind, title: i.resolvedMetadata?.title ?? i.rawText?.slice(0, 80) ?? i.rawFile?.displayName ?? i.rawURL ?? "灵感", raw_text: i.rawText ?? "", url: i.rawURL ?? null, file_name: i.rawFile?.displayName ?? null, category_id: catId(i.categoryID), archived_at: i.lifecycle === "archived" ? stamp(i.updatedAt, nowStamp) : null, note_id: null, digest: null, created_at: stamp(i.createdAt, nowStamp), updated_at: stamp(i.updatedAt, nowStamp) }));
  for (const l of list(sourceState.inspirationNoteLinks ?? [])) {
    jellyAssert(workspace.notes.some(note => note.id === id(l.noteID)), "灵感关联笔记不存在");
    if (l.source?.deleted) continue; // Deleted-source provenance remains in imported_sources; no live inspiration is invented.
    const sourceId = l.source?.live?._0 ?? l.inspirationID;
    const i = workspace.inspirations.find(i => i.id === id(sourceId)); jellyAssert(i, "灵感关联来源不存在"); i.note_id ??= id(l.noteID);
  }
  workspace.task_links = list(sourceState.taskBlockLinks ?? []).map(l => ({ item_id: id(l.calendarItemID), note_id: id(l.noteID), block_id: id(l.blockID) }));
  // Native task titles are plain text even when the document spans carry formatting.
  for (const l of workspace.task_links) { const b = workspace.notes.find(n => n.id === l.note_id)?.blocks.find(b => b.id === l.block_id), item = workspace.items.find(i => i.id === l.item_id); if (b && item) { const plain = b.inline_spans?.map(s => s.text).join("") ?? b.text; jellyAssert(item.title.trim() === plain.trim() && item.completed_at === b.completed_at, "原工作区任务与日历关联不一致，请先在原 Jelly 修复"); b.text = plain; item.completion_description = b.completion_description; } }
  const graph = sourceState.calendarNoteRelations ?? {};
  for (const [owner, set] of pairs(graph.baselines)) { const ownerId = id(owner.item?._0 ?? owner.series?._0); if (set.primaryNoteID) workspace.relations.push({ owner_id: ownerId, original_date: null, note_id: id(set.primaryNoteID), role: "primary" }); for (const ref of list(set.referenceNoteIDs ?? [])) workspace.relations.push({ owner_id: ownerId, original_date: null, note_id: id(ref), role: "reference" }); }
  workspace.relation_overrides = pairs(graph.occurrenceOverrides).map(([key, v]) => ({ owner_id: id(key.seriesID), original_date: date(key.originalDate), primary: v.primary?.replace ? id(v.primary.replace._0) : v.primary?.clear ? "clear" : "inherit", added_reference_ids: list(v.addedReferenceNoteIDs ?? []).map(id), removed_reference_ids: list(v.removedReferenceNoteIDs ?? []).map(id) }));
  for (const [key, d] of pairs(sourceState.materialDigests)) {
    const i = workspace.inspirations.find(i => i.id === id(key)); jellyAssert(i, "摘要来源灵感不存在");
    const sourceHash = jellyHash(i.raw_text + "\n" + (i.url ?? "")), rawSnapshot = d.result ? d.preparedSnapshot : d.pendingSnapshot ?? d.preparedSnapshot;
    let snapshot: JellyMaterialSnapshot | undefined;
    if (rawSnapshot) { jellyAssert(rawSnapshot.sourceChecksum === d.sourceChecksum, "原摘要素材来源校验不一致"); snapshot = nativeMaterialSnapshot(rawSnapshot, sourceHash, nowStamp); i.material = snapshot; }
    if (!d.result) continue;
    const result = d.result, summary = result.summary, claim = (v: any): string => typeof v === "string" ? v : v?.text ?? "";
    const sourceText = snapshot?.blocks.map(b => b.text).join("\n\n") ?? "";
    const summaryParts = [claim(summary.thesisClaim ?? summary.thesis), ...list(summary.takeawayClaims ?? summary.takeaways ?? []).map(v => `- ${claim(v)}`), ...list(summary.chapters ?? []).flatMap(ch => [`### ${ch.title}`, ...list(ch.pointClaims ?? ch.points ?? []).map(v => `- ${claim(v)}`)]), ...list(summary.quotes ?? []).map(q => `> ${q.text}${q.speaker ? ` —— ${q.speaker}` : ""}`), ...list(summary.droppedClaims ?? summary.dropped ?? []).map(v => `未采纳：${claim(v)}`)];
    const modern = result.provenance?.summaryContractVersion === "summary-contract-v3";
    let structured: JellyStructuredDigest | undefined;
    if (modern) {
      jellyAssert(snapshot && rawSnapshot.contentFingerprint === result.contentFingerprint, "原摘要缺少匹配的素材快照");
      structured = nativeStructuredDigest(summary, snapshot);
    } else warnings.push(`「${i.title}」是旧版摘要：保留正文与素材，原版本没有完整的逐条证据，需重新生成才能达到当前证据要求。`);
    i.digest = { source_hash: sourceHash, source_text: sourceText, summary: structured && snapshot ? renderJellyDigestMarkdown(structured, snapshot) : summaryParts.filter(Boolean).join("\n"), ...(snapshot ? { snapshot } : {}), ...(structured ? { structured } : {}), created_at: stamp(result.completedAt, nowStamp), written_note_ids: [...new Set<string>((d.noteWrite ? [d.noteWrite] : list(d.noteWrites ?? [])).map(w => id(w.noteID)))] };
  }
  if (workspace.inspirations.some(i => i.file_name)) warnings.push("文件名称已导入；原生文件授权书签保存在原包中，浏览器需重新选择文件才能读取。");
  if (pairs(sourceState.materialDigests).length) warnings.push("已有摘要及可用的素材块、定位、逐条引用证据已导入；原生运行状态完整保存在原始备份包中。");
  workspace.imported_sources = [{ sha256: source_hash, schema_version: 5, source: parsed, imported_at: now }];
  validateJellyWorkspace(workspace); validateJellyContent(workspace);
  return { workspace, warnings, source_hash };
}
/** Merge only: existing identities must be identical; no import may overwrite current content. */
export function mergeJellyImport(current: JellyWorkspace, imported: JellyWorkspace): JellyWorkspace {
  const merged = structuredClone(current);
  for (const key of ["categories", "items", "series", "notes", "inspirations"] as const) {
    const target = merged[key] as { id: string }[];
    for (const value of imported[key]) {
      const existing = target.find(v => v.id === value.id);
      if (existing) { if (key === "categories" && value.id === "uncategorized") continue; jellyAssert(JSON.stringify(existing) === JSON.stringify(value), `导入 ${key} 的 ID 与当前内容冲突：${value.id}。请使用空的插件库或消除冲突。`, "jelly.import_conflict", 409); }
      else target.push(structuredClone(value));
    }
  }
  for (const key of ["relations", "task_links", "relation_overrides"] as const) {
    const target = (merged[key] ??= []) as any[];
    for (const value of imported[key] ?? []) if (!target.some(v => JSON.stringify(v) === JSON.stringify(value))) target.push(structuredClone(value));
  }
  merged.applied_plan_ids = [...new Set([...merged.applied_plan_ids, ...imported.applied_plan_ids])];
  for (const entry of imported.imported_sources ?? []) { merged.imported_sources ??= []; if (!merged.imported_sources.some(s => s.sha256 === entry.sha256)) merged.imported_sources.push(structuredClone(entry)); }
  validateJellyWorkspace(merged); validateJellyContent(merged); return merged;
}
