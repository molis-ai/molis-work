import type { JellyWorkspace } from "./contract.js";
import { validateJellyWorkspace } from "./calendar.js";
import { jellyHash, validateJellyContent } from "./content.js";
import { jellyAssert, jellyErrors } from "./error.js";

type Obj = Record<string, any>;
function object(value: unknown): Obj { jellyAssert(value && typeof value === "object" && !Array.isArray(value), "导入对象格式无效"); return value as Obj; }
export interface JellyImportResult { workspace: JellyWorkspace; warnings: string[]; source_hash: string }
export function decodeJellyImport(source: unknown): JellyImportResult {
  const parsed = typeof source === "string" ? JSON.parse(source) : structuredClone(source), doc = object(parsed), source_hash = jellyHash(typeof source === "string" ? source : JSON.stringify(source));
  jellyAssert(doc.schema_version === /* @version format.jelly.workspace */ 1, "仅支持当前版本的 Molis Work Jelly 备份");
  const workspace = structuredClone(doc) as JellyWorkspace;
  validateJellyWorkspace(workspace);
  validateJellyContent(workspace);
  return { workspace, warnings: [], source_hash };
}
function mergeById<T extends { id: string }>(current: T[], incoming: readonly T[], key: string, keepExistingUncategorized = false): void {
  for (const value of incoming) {
    const existing = current.find((item) => item.id === value.id);
    if (existing) {
      if (keepExistingUncategorized && value.id === "uncategorized") continue;
      jellyAssert(JSON.stringify(existing) === JSON.stringify(value), `导入 ${key} 的 ID 与当前内容冲突：${value.id}。请使用空的插件库或消除冲突。`, jellyErrors.import_conflict);
    } else current.push(structuredClone(value));
  }
}
function mergeRows<T>(current: T[] | undefined, incoming: readonly T[] | undefined): T[] {
  const target = current ?? [];
  for (const value of incoming ?? []) {
    if (!target.some((item) => JSON.stringify(item) === JSON.stringify(value))) target.push(structuredClone(value));
  }
  return target;
}
/** Merge only: existing identities must be identical; no import may overwrite current content. */
export function mergeJellyImport(current: JellyWorkspace, imported: JellyWorkspace): JellyWorkspace {
  const merged = structuredClone(current);
  mergeById(merged.categories, imported.categories, "categories", true);
  mergeById(merged.items, imported.items, "items");
  mergeById(merged.series, imported.series, "series");
  mergeById(merged.notes, imported.notes, "notes");
  merged.relations = mergeRows(merged.relations, imported.relations);
  merged.task_links = mergeRows(merged.task_links, imported.task_links);
  merged.relation_overrides = mergeRows(merged.relation_overrides, imported.relation_overrides);
  merged.applied_plan_ids = [...new Set([...merged.applied_plan_ids, ...imported.applied_plan_ids])];
  for (const entry of imported.imported_sources ?? []) { merged.imported_sources ??= []; if (!merged.imported_sources.some(s => s.sha256 === entry.sha256)) merged.imported_sources.push(structuredClone(entry)); }
  validateJellyWorkspace(merged); validateJellyContent(merged); return merged;
}
