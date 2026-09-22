import { createHash } from "node:crypto";
import type { JellyDigestClaim, JellyMaterialBlock, JellyMaterialCoverage, JellyMaterialLocator, JellyMaterialSnapshot, JellyStructuredDigest } from "@molis-ai/molis-work-contracts/modules/jelly";
import { jellyAssert } from "./error.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const MAX_CHARACTERS = 2_000_000, MAX_BLOCKS = 10_000, MAX_TIMESTAMP = 604_800;
type RecordValue = Record<string, unknown>;
function record(value: unknown, label: string): RecordValue { jellyAssert(value && typeof value === "object" && !Array.isArray(value), `${label}格式无效`); return value as RecordValue; }
function text(value: unknown, label: string, maximum: number, allowEmpty = false): string { jellyAssert(typeof value === "string" && value.length <= maximum && (allowEmpty || value.trim().length > 0), `${label}为空或过长`); return value; }
function integer(value: unknown, minimum: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum; }
function digestList(value: unknown, label: string, maximum: number): unknown[] { jellyAssert(Array.isArray(value) && value.length <= maximum, `${label}数量无效`); return value; }
const sha = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export interface JellyMaterialExtraction {
  text: string; file_name?: string; source_sha256?: string;
  pages?: { number?: number; page?: number; text: string; method?: string; confidence?: number | null }[];
  segments?: { start_seconds?: number; end_seconds?: number; startSeconds?: number; endSeconds?: number; start?: number; end?: number; text: string }[];
  frames?: { index?: number; seconds?: number; start_seconds?: number; end_seconds?: number; text: string; confidence?: number | null }[];
  extractor?: string; provider?: string;
  coverage?: JellyMaterialCoverage | { status: string; processed_pages?: number; total_pages?: number; processed?: number; expected?: number; issues?: string[] } | "sufficient" | "partial" | "insufficient";
}
function normalizeLocator(value: unknown): JellyMaterialLocator {
  const loc = record(value, "素材位置");
  if (loc.kind === "paragraph" || loc.kind === "image") { jellyAssert(integer(loc.index, 0), "素材索引无效"); return { kind: loc.kind, index: loc.index }; }
  if (loc.kind === "page") { jellyAssert(integer(loc.number, 1), "素材页码无效"); return { kind: "page", number: loc.number }; }
  jellyAssert(loc.kind === "timestamp" && typeof loc.start_seconds === "number" && typeof loc.end_seconds === "number" && Number.isFinite(loc.start_seconds) && Number.isFinite(loc.end_seconds) && loc.start_seconds >= 0 && loc.end_seconds >= loc.start_seconds && loc.end_seconds <= MAX_TIMESTAMP, "素材时间定位无效");
  return { kind: "timestamp", start_seconds: loc.start_seconds, end_seconds: loc.end_seconds };
}
function normalizeCoverage(value: unknown): JellyMaterialCoverage {
  const c = record(value, "素材覆盖率"); jellyAssert(["sufficient", "partial", "insufficient"].includes(String(c.status)) && integer(c.processed, 0), "素材覆盖率无效");
  jellyAssert(c.expected === undefined || (integer(c.expected, 0) && c.expected >= c.processed), "素材预期数量不能少于已处理数量");
  const issues = digestList(c.issues, "素材诊断", 1000).map(issue => text(issue, "素材诊断", 2000));
  return { status: c.status as JellyMaterialCoverage["status"], processed: c.processed, ...(c.expected === undefined ? {} : { expected: c.expected as number }), issues };
}
function normalizeAttachment(value: unknown): NonNullable<JellyMaterialSnapshot["attachment"]> {
  const attachment = record(value, "素材附件"), fileName = text(attachment.file_name, "附件文件名", 240);
  jellyAssert(fileName !== "." && fileName !== ".." && !/[\/\\\0]/.test(fileName) && !/^[a-z]:/i.test(fileName), "附件必须是文件名，不能包含路径");
  jellyAssert(sha(attachment.sha256), "附件 SHA-256 无效"); return { file_name: fileName, sha256: attachment.sha256 as string };
}
/** Fingerprint binds content, attachment identity, order, locators, confidence and coverage; retrieval time and provider do not change evidence identity. */
export function jellyMaterialFingerprint(blocks: readonly JellyMaterialBlock[], coverage: JellyMaterialCoverage, attachment?: JellyMaterialSnapshot["attachment"]): string {
  return hash(JSON.stringify({ version: "jelly-material-v1", blocks: blocks.map(block => ({ id: block.id, role: block.role, text: block.text, locator: normalizeLocator(block.locator), confidence: block.confidence ?? null })), coverage: normalizeCoverage(coverage), ...(attachment === undefined ? {} : { attachment: normalizeAttachment(attachment) }) }));
}
export function makeJellyMaterialSnapshot(sourceHash: string, extraction: JellyMaterialExtraction): JellyMaterialSnapshot {
  jellyAssert(sha(sourceHash), "素材来源指纹无效"); record(extraction, "素材提取结果"); text(extraction.text, "素材正文", MAX_CHARACTERS, true);
  const blocks: JellyMaterialBlock[] = [];
  const append = (raw: unknown, role: JellyMaterialBlock["role"], locator: JellyMaterialLocator, sourceIndex: number, confidence?: number | null) => {
    const body = text(raw, "素材正文", MAX_CHARACTERS, true).trim(); if (!body) return;
    normalizeLocator(locator); jellyAssert(confidence == null || (Number.isFinite(confidence) && confidence >= 0 && confidence <= 1), "素材置信度无效");
    let part = 0;
    for (let start = 0; start < body.length;) {
      let end = Math.min(start + 8000, body.length);
      if (end < body.length && /[\uD800-\uDBFF]/.test(body[end - 1]!)) end--;
      const chunk = body.slice(start, end); const id = `material-${hash(JSON.stringify({ sourceHash, role, locator, sourceIndex, part, text: chunk })).slice(0, 32)}`;
      blocks.push({ id, role, text: chunk, locator: { ...locator }, ...(confidence == null ? {} : { confidence }) }); start = end; part++;
    }
  };
  if (extraction.pages !== undefined) digestList(extraction.pages, "素材页面", MAX_BLOCKS).forEach((raw, index) => { const page = record(raw, "素材页面"); const role = typeof page.method === "string" && /ocr/i.test(page.method) ? "ocr" : "body"; append(page.text, role, { kind: "page", number: (page.number ?? page.page ?? index + 1) as number }, index, page.confidence as number | null | undefined); });
  if (extraction.segments !== undefined) digestList(extraction.segments, "转录片段", MAX_BLOCKS).forEach((raw, index) => { const segment = record(raw, "转录片段"); append(segment.text, "transcript", { kind: "timestamp", start_seconds: (segment.start_seconds ?? segment.startSeconds ?? segment.start) as number, end_seconds: (segment.end_seconds ?? segment.endSeconds ?? segment.end) as number }, index); });
  if (extraction.frames !== undefined) digestList(extraction.frames, "图片片段", MAX_BLOCKS).forEach((raw, index) => { const frame = record(raw, "图片片段"); const seconds = frame.seconds ?? frame.start_seconds; const locator: JellyMaterialLocator = seconds === undefined ? { kind: "image", index: (frame.index ?? index) as number } : { kind: "timestamp", start_seconds: seconds as number, end_seconds: (frame.end_seconds ?? seconds) as number }; append(frame.text, "ocr", locator, index, frame.confidence as number | null | undefined); });
  if (!blocks.length && extraction.text.trim()) extraction.text.replace(/\r\n?/g, "\n").split(/\n\s*\n/).forEach((paragraph, index) => append(paragraph, "body", { kind: "paragraph", index }, index));
  const rawCoverage = typeof extraction.coverage === "object" ? record(extraction.coverage, "素材覆盖率") : {};
  let status = typeof extraction.coverage === "string" ? extraction.coverage : String(rawCoverage.status ?? "sufficient");
  jellyAssert(rawCoverage.issues === undefined || Array.isArray(rawCoverage.issues), "素材诊断列表无效");
  const issues = Array.isArray(rawCoverage.issues) ? [...rawCoverage.issues] as string[] : [];
  if (!blocks.some(block => block.role !== "metadata")) { status = "insufficient"; if (!issues.includes("empty")) issues.push("empty"); }
  const processed = rawCoverage.processed ?? rawCoverage.processed_pages ?? (extraction.pages ? extraction.pages.filter(page => page.text.trim()).length : blocks.length);
  const expected = rawCoverage.expected ?? rawCoverage.total_pages;
  const coverage = normalizeCoverage({ status, processed, ...(expected === undefined ? {} : { expected }), issues });
  const attachment = extraction.source_sha256 === undefined ? undefined : normalizeAttachment({ file_name: extraction.file_name, sha256: extraction.source_sha256 });
  const snapshot: JellyMaterialSnapshot = { source_hash: sourceHash, content_fingerprint: jellyMaterialFingerprint(blocks, coverage, attachment), blocks, coverage, provider: extraction.provider ?? extraction.extractor ?? "jelly-text", acquired_at: new Date().toISOString(), ...(attachment ? { attachment } : {}) };
  return validateJellyMaterialSnapshot(snapshot);
}
export function validateJellyMaterialSnapshot(value: unknown): JellyMaterialSnapshot {
  const snapshot = record(value, "素材快照"); jellyAssert(sha(snapshot.source_hash) && sha(snapshot.content_fingerprint), "素材快照指纹无效");
  text(snapshot.provider, "素材提取器", 500); jellyAssert(typeof snapshot.acquired_at === "string" && Number.isFinite(Date.parse(snapshot.acquired_at)), "素材读取时间无效");
  let total = 0; const ids = new Set<string>();
  const blocks = digestList(snapshot.blocks, "素材块", MAX_BLOCKS).map(raw => {
    const block = record(raw, "素材块"), id = text(block.id, "素材块 ID", 200); jellyAssert(!ids.has(id), "素材块 ID 重复"); ids.add(id);
    jellyAssert(["body", "transcript", "ocr", "metadata"].includes(String(block.role)), "素材块类型无效");
    const body = text(block.text, "素材块正文", MAX_CHARACTERS, block.role === "metadata"); total += body.length; jellyAssert(total <= MAX_CHARACTERS, "素材正文超过容量上限");
    jellyAssert(block.confidence === undefined || block.confidence === null || (typeof block.confidence === "number" && Number.isFinite(block.confidence) && block.confidence >= 0 && block.confidence <= 1), "素材置信度无效");
    return { id, role: block.role as JellyMaterialBlock["role"], text: body, locator: normalizeLocator(block.locator), ...(block.confidence === undefined ? {} : { confidence: block.confidence as number | null }) };
  });
  const coverage = normalizeCoverage(snapshot.coverage);
  jellyAssert(coverage.status === "insufficient" || blocks.some(block => block.role !== "metadata" && block.text.trim()), "素材覆盖率与正文不一致");
  const attachment = snapshot.attachment === undefined ? undefined : normalizeAttachment(snapshot.attachment);
  jellyAssert(snapshot.content_fingerprint === jellyMaterialFingerprint(blocks, coverage, attachment), "素材内容指纹校验失败");
  return { source_hash: snapshot.source_hash as string, content_fingerprint: snapshot.content_fingerprint as string, blocks, coverage, provider: snapshot.provider as string, acquired_at: snapshot.acquired_at as string, ...(attachment ? { attachment } : {}) };
}
/** Match Swift MaterialDigestEvidence.foldedText: punctuation and whitespace cannot masquerade as evidence. */
const folded = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
export function validateJellyStructuredDigest(value: unknown, snapshotInput: JellyMaterialSnapshot): JellyStructuredDigest {
  const snapshot = validateJellyMaterialSnapshot(snapshotInput), summary = record(value, "结构化摘要");
  jellyAssert(snapshot.coverage.status !== "insufficient", "素材不足，不能生成有来源的摘要");
  const byId = new Map(snapshot.blocks.map((block, index) => [block.id, { block, index }])); let total = 0;
  const claim = (value: unknown, label: string, limit: number): JellyDigestClaim => {
    const c = record(value, label), content = text(c.text, label, limit).trim(); total += content.length;
    const ids = digestList(c.evidence_block_ids, `${label}依据`, MAX_BLOCKS).map(id => text(id, "来源块 ID", 200));
    jellyAssert(ids.length > 0 && new Set(ids).size === ids.length && ids.every(id => byId.has(id)) && ids.some(id => byId.get(id)!.block.role !== "metadata"), `${label}必须引用现有正文素材，不能只引用元信息`);
    return { text: content, evidence_block_ids: ids };
  };
  const thesis = claim(summary.thesis, "中心结论", 4000), takeaways = digestList(summary.takeaways, "要点", 7).map(value => claim(value, "要点", 2000)); jellyAssert(takeaways.length >= 1, "摘要至少需要一个要点");
  let previousIndex = -1;
  const chapters = digestList(summary.chapters, "章节", 100).map(raw => {
    const chapter = record(raw, "章节"), title = text(chapter.title, "章节标题", 500).trim(), anchor = text(chapter.anchor_block_id, "章节来源块", 200), found = byId.get(anchor);
    jellyAssert(found && found.block.role !== "metadata" && found.index >= previousIndex, "章节锚点不存在、只有元信息或顺序倒退"); previousIndex = found.index; total += title.length;
    const points = digestList(chapter.points, "章节要点", 20).map(value => claim(value, "章节要点", 1000)); jellyAssert(points.length > 0, "章节必须有要点"); return { title, anchor_block_id: anchor, points };
  });
  const quotes = digestList(summary.quotes, "引用", 100).map(raw => {
    const quote = record(raw, "引用"), content = text(quote.text, "引用正文", 2000).trim(), evidence = text(quote.evidence_block_id, "引用来源块", 200), found = byId.get(evidence), needle = folded(content);
    jellyAssert(found && needle && folded(found.block.text).includes(needle), "引文未出现在所引用的素材块中"); total += content.length;
    const speaker = quote.speaker === undefined ? undefined : text(quote.speaker, "发言者", 200, true).trim();
    if (speaker) { jellyAssert(folded(speaker) && folded(found.block.text).includes(folded(speaker)), "发言者未出现在所引用的素材块中"); total += speaker.length; }
    return { text: content, evidence_block_id: evidence, ...(speaker ? { speaker } : {}) };
  });
  const dropped = digestList(summary.dropped, "未采纳内容", 100).map(value => claim(value, "未采纳内容", 1000));
  jellyAssert(total <= 200_000, "摘要超过容量上限"); return { thesis, takeaways, chapters, quotes, dropped };
}
export function jellyMaterialLocation(locator: JellyMaterialLocator): string {
  if (locator.kind === "page") return `第 ${locator.number} 页`; if (locator.kind === "image") return `图片 ${locator.index + 1}`; if (locator.kind === "paragraph") return `正文第 ${locator.index + 1} 段`;
  const seconds = Math.floor(locator.start_seconds), end = Math.floor(locator.end_seconds); const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return seconds === end ? clock(seconds) : `${clock(seconds)}–${clock(end)}`;
}
export function renderJellyDigestMarkdown(value: JellyStructuredDigest, snapshot: JellyMaterialSnapshot): string {
  const summary = validateJellyStructuredDigest(value, snapshot), byId = new Map(snapshot.blocks.map(block => [block.id, block]));
  const reference = (ids: string[]) => ids.map(id => { const block = byId.get(id)!; return `${jellyMaterialLocation(block.locator)} · ${id}`; }).join("；");
  const claim = (c: JellyDigestClaim) => `${c.text}（来源：${reference(c.evidence_block_ids)}）`;
  const parts = ["## 中心结论", claim(summary.thesis), "## 要点", ...summary.takeaways.map(c => `- ${claim(c)}`)];
  if (snapshot.coverage.status === "partial") parts.unshift(`> 素材仅部分读取：${snapshot.coverage.processed}${snapshot.coverage.expected === undefined ? "" : ` / ${snapshot.coverage.expected}`}；${snapshot.coverage.issues.join("、") || "请核对原始材料"}`);
  for (const chapter of summary.chapters) parts.push(`### ${chapter.title}（${reference([chapter.anchor_block_id])}）`, ...chapter.points.map(c => `- ${claim(c)}`));
  if (summary.quotes.length) parts.push("## 原文引用", ...summary.quotes.map(q => `> ${q.text}${q.speaker ? ` —— ${q.speaker}` : ""}\n\n来源：${reference([q.evidence_block_id])}`));
  if (summary.dropped.length) parts.push("## 未采纳内容", ...summary.dropped.map(c => `- ${claim(c)}`));
  return parts.join("\n\n");
}
