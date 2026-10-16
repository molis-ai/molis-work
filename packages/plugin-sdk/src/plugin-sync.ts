import type { PluginSyncDeclaration, PluginSyncCollection } from "@molis-ai/molis-work-contracts/platform/plugin";
import { syncError } from "./sync-errors.js";

export function parsePluginSyncDeclaration(value: unknown): PluginSyncDeclaration {
  const object = syncRecord(value);
  exactKeys(object, ["protocol_version", "collections"]);
  if (object.protocol_version !== 1 || !Array.isArray(object.collections)
    || !object.collections.length || object.collections.length > 100) fail("同步声明须包含 1–100 个集合");
  const ids = new Set<string>();
  const collections = object.collections.map((item): PluginSyncCollection => {
    const row = syncRecord(item);
    exactKeys(row, ["id", "title", "schema_version", "requires"]);
    if (typeof row.id !== "string" || !/^[a-z][a-z0-9._-]{0,79}$/.test(row.id)
      || ids.has(row.id) || typeof row.title !== "string" || !row.title.trim() || row.title.length > 100
      || !Number.isSafeInteger(row.schema_version) || Number(row.schema_version) < 1
      || !Array.isArray(row.requires) || row.requires.length > 100
      || row.requires.some(id => typeof id !== "string") || new Set(row.requires).size !== row.requires.length) {
      fail("同步集合的身份、版本或依赖不合法");
    }
    ids.add(row.id);
    return Object.freeze({ id: row.id, title: row.title, schema_version: Number(row.schema_version), requires: Object.freeze([...row.requires]) as readonly string[] });
  });
  const result = Object.freeze({ protocol_version: 1 as const, collections: Object.freeze(collections) });
  // Validate every node, including currently unselected collections.
  expand(result, [...ids]);
  return result;
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
