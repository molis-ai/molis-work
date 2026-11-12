import type { JellyNote, JellyWorkspace } from "./contract.js";
import { jellyAssert } from "./error.js";

const unique = (values: string[], label: string) => jellyAssert(values.every(x => typeof x === "string" && x.length > 0) && new Set(values).size === values.length, `${label} ID 重复或为空`);
const time = (value: unknown, nullable = false) => (nullable && value === null) || (typeof value === "string" && Number.isFinite(Date.parse(value)));

export function validateJellyNote(n: JellyNote, categoryIds: ReadonlySet<string>): void {
  jellyAssert(typeof n.title === "string" && typeof n.pinned === "boolean" && Number.isSafeInteger(n.revision) && n.revision >= 0, "笔记数据无效");
  jellyAssert(time(n.created_at) && time(n.updated_at) && time(n.archived_at, true), "笔记时间戳无效");
  const categoryId = n.category_id === undefined ? "uncategorized" : n.category_id ?? "";
  jellyAssert(typeof categoryId === "string", "内容必须是文本");
  jellyAssert(categoryIds.has(categoryId), "分类不存在");
  jellyAssert(Array.isArray(n.blocks), "笔记区块无效");
  unique(n.blocks.map(b => b.id), "区块");
  for (const b of n.blocks) {
    jellyAssert(["paragraph", "heading1", "heading2", "heading3", "bullet", "numbered", "task", "quote", "code", "divider", "link"].includes(b.kind) && typeof b.text === "string" && Number.isInteger(b.indent) && b.indent >= 0 && b.indent <= 8 && typeof b.completion_description === "string", "区块内容无效");
    jellyAssert(b.completed_at === null || (b.kind === "task" && time(b.completed_at)), "任务完成时间无效");
    jellyAssert(b.language === undefined || typeof b.language === "string", "代码语言无效");
    if (b.inline_spans !== undefined) {
      jellyAssert(Array.isArray(b.inline_spans), "内联格式无效");
      for (const span of b.inline_spans) jellyAssert(span && typeof span.text === "string" && Array.isArray(span.marks) && new Set(span.marks).size === span.marks.length && span.marks.every(mark => ["bold", "italic", "code"].includes(mark)) && (span.link_url === undefined || typeof span.link_url === "string"), "内联格式内容无效");
    }
  }
}

/** Validate content independently of storage; imported and recovered state uses the same gate. */
export function validateJellyContent(state: JellyWorkspace): void {
  unique(state.notes.map(n => n.id), "笔记"); unique(state.applied_plan_ids, "提案");
  const categoryIds = new Set(state.categories.map(c => c.id));
  for (const note of state.notes) validateJellyNote(note, categoryIds);
  if (state.imported_sources !== undefined) {
    jellyAssert(Array.isArray(state.imported_sources), "原始导入包无效"); unique(state.imported_sources.map(s => s.sha256), "原始导入包");
    for (const s of state.imported_sources) jellyAssert(/^[a-f0-9]{64}$/.test(s.sha256) && Number.isSafeInteger(s.schema_version) && s.schema_version > 0 && time(s.imported_at) && s.source && typeof s.source === "object", "原始导入包内容无效");
  }
}
