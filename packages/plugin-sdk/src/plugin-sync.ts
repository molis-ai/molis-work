import { parseSyncSections } from "./sync-sections.js";
import { parseSyncTracking, parseSyncAggregates } from './sync-schema.js';
import type { PluginSyncDeclaration, PluginSyncCollection } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SyncApprovalOutcomeDeclaration, SyncSectionsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import { syncError } from "./sync-errors.js";

export function parsePluginSyncDeclaration(value: unknown): PluginSyncDeclaration {
  const object = syncRecord(value);
  exactKeys(object, ["protocol_version", "collections"]);
  if (object.protocol_version !== /* @version sync.protocol */ 1 || !Array.isArray(object.collections)
    || !object.collections.length || object.collections.length > 100) fail("同步声明须包含 1–100 个集合");
  const ids = new Set<string>();
  const collections = object.collections.map((item): PluginSyncCollection => {
    const row = syncRecord(item);
    exactKeys(row, ["id", "title", "schema_version", "requires", "tracking", "aggregates", "sections", "database", "approval_outcomes"]);
    if (typeof row.id !== "string" || !/^[a-z][a-z0-9._-]{0,79}$/.test(row.id)
      || ids.has(row.id) || typeof row.title !== "string" || !row.title.trim() || row.title.length > 100
      || !Number.isSafeInteger(row.schema_version) || Number(row.schema_version) < 1
      || !Array.isArray(row.requires) || row.requires.length > 100
      || row.requires.some(id => typeof id !== "string") || new Set(row.requires).size !== row.requires.length) {
      fail("同步集合的身份、版本或依赖不合法");
    }
    if (row.database !== undefined && row.database !== "home" && row.database !== "project") fail("同步集合的数据库归属无效");
    ids.add(row.id);
    const sections = row.sections !== undefined ? parseSyncSections(row.sections) : undefined;
    return Object.freeze({ ...(row.database !== undefined ? {database: row.database as "home" | "project"} : {}), id: row.id, title: row.title, schema_version: Number(row.schema_version), requires: Object.freeze([...row.requires]) as readonly string[], ...(sections ? {sections} : {}), ...(row.tracking !== undefined ? {tracking: parseSyncTracking(row.tracking)} : {}), ...(row.aggregates !== undefined ? {aggregates: parseSyncAggregates(row.aggregates)} : {}), ...(row.approval_outcomes !== undefined ? {approval_outcomes: parseApprovalOutcomes(row.approval_outcomes, sections)} : {}) });
  });
  const result = Object.freeze({ protocol_version: /* @version sync.protocol */ 1, collections: Object.freeze(collections) });
  // Validate every node, including currently unselected collections.
  expand(result, [...ids]);
  return result;
}

/**
 * Approval outcomes name tables and columns of this collection's own business sections, one subject kind each, and the subjects' table
 * (44B). The platform reads and digests those rows itself.
 */
function parseApprovalOutcomes(value: unknown, sections: SyncSectionsDeclaration | undefined): readonly SyncApprovalOutcomeDeclaration[] {
  const invalid = () => fail("审批结果声明须指向本集合分区里已声明的表与列");
  if (!sections || !Array.isArray(value) || !value.length || value.length > 20) invalid();
  const column = (section: unknown, table: unknown, name: unknown) => {
    const found = sections!.business.find(row => row.id === section)?.tables.find(row => row.name === table);
    if (typeof name !== "string" || !found?.columns.includes(name)) invalid();
    return found!;
  };
  const kinds = new Set<string>();
  return Object.freeze((value as unknown[]).map(item => {
    const row = syncRecord(item);
    exactKeys(row, ["subject_kind", "section", "table", "decision_column", "subject_column", "subjects"]);
    const subjects = syncRecord(row.subjects);
    exactKeys(subjects, ["section", "table", "column"]);
    if (typeof row.subject_kind !== "string" || !/^[a-z][a-z0-9-]{0,79}$/u.test(row.subject_kind) || kinds.has(row.subject_kind)) invalid();
    kinds.add(row.subject_kind as string);
    for (const name of [row.decision_column, row.subject_column, "project_id"]) column(row.section, row.table, name);
    column(subjects.section, subjects.table, subjects.column);
    return Object.freeze({ subject_kind: row.subject_kind as string, section: row.section as string, table: row.table as string,
      decision_column: row.decision_column as string, subject_column: row.subject_column as string,
      subjects: Object.freeze({ section: subjects.section as string, table: subjects.table as string, column: subjects.column as string }) });
  }));
}

/** Dependency closure only; never grants authority and never selects a new optional collection. */
export function expandPluginSyncSelection(declaration: PluginSyncDeclaration, selected: readonly string[]): readonly string[] {
  return expand(parsePluginSyncDeclaration(declaration), selected);
}

function expand(declaration: PluginSyncDeclaration, selected: readonly string[]): readonly string[] {
  const byId = new Map(declaration.collections.map(item => [item.id, item]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string) => {
    const item = byId.get(id);
    if (!item) fail(`未知的同步集合：${id}`);
    if (visiting.has(id)) fail(`同步集合依赖成环：${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of item.requires) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of selected) visit(id);
  return Object.freeze([...visited]);
}

function syncRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("同步声明须是对象");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail("同步声明包含未知字段");
}
function fail(message: string): never { throw syncError("invalid", message); }
