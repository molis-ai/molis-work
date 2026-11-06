import { sourceSectionsDeclaration, sourceSectionsTracking, messageSectionsDeclaration, messageSectionsTracking } from "./sync-sections.js";
import { syncError } from './sync-errors.js';
import type { PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginSyncCollectionDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-sync";



const COLUMNS = ["project_id", "rule_id", "name", "enabled", "match_json", "created_at", "updated_at", "admission", "judgment_json", "revision"] as const;
type Row = Record<string, unknown>;

function invalid(message = "Feed 捕捉规则同步数据不合法", code: Parameters<typeof syncError>[0] = "invalid"): never {
  throw syncError(code, message);
}
function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Row;
}
function exact(value: Row, columns: readonly string[]): void {
  if (Object.keys(value).length !== columns.length || columns.some(column => !Object.hasOwn(value, column))) invalid();
}
function timestamp(value: unknown): boolean { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function size(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value)) > 100000000) invalid("捕捉规则超过账号容量上限（100 MB）", "limit");
}
function validateRule(value: unknown, projectId: string, ruleId: string): Row {
  const row = object(value);
  exact(row, COLUMNS);
  if (row.project_id !== projectId || row.rule_id !== ruleId || typeof row.name !== "string" ||
    !row.name.trim() || row.name !== row.name.trim() || row.name.length > 80 ||
    (row.enabled !== 0 && row.enabled !== 1) || !timestamp(row.created_at) || !timestamp(row.updated_at) ||
    (row.admission !== "suggest" && row.admission !== "inbox") ||
    typeof row.revision !== "string" || !row.revision || row.revision.length > 100) invalid();
  let match: Row;
  try { match = object(JSON.parse(String(row.match_json))); } catch { return invalid(); }
  if (Object.keys(match).some(key => !["contains", "source_id", "source_kind"].includes(key)) ||
    (match.contains !== undefined && (typeof match.contains !== "string" || !match.contains.trim() || match.contains.length > 200)) ||
    (match.source_id !== undefined && (typeof match.source_id !== "string" || !match.source_id.trim() || match.source_id.length > 200)) ||
    (match.source_kind !== undefined && (typeof match.source_kind !== "string" || !match.source_kind.trim() || match.source_kind.length > 200)) ||
    !Object.keys(match).length) invalid();
  if (row.judgment_json !== null) {
    let judgment: Row;
    try { judgment = object(JSON.parse(String(row.judgment_json))); } catch { return invalid(); }
    if (Object.keys(judgment).some(key => !["capability_id", "version", "provider_id"].includes(key)) ||
      typeof judgment.capability_id !== "string" || !judgment.capability_id || judgment.capability_id.length > 200 ||
      !Number.isSafeInteger(judgment.version) || Number(judgment.version) < 1 ||
      (judgment.provider_id !== undefined && (typeof judgment.provider_id !== "string" || !judgment.provider_id))) invalid();
  }
  return row;
}

export const feedRuleTracking: PluginSyncCollectionDefinition["tracking"] = [
 {table:"feed_out_rules",key:[{column:"project_id"},{literal:"feed_rule"},{column:"rule_id"}]},
];
export function feedRuleCollection(projectId: string): PluginSyncCollectionDefinition {
 return {tracking:feedRuleTracking,create(db,context) {
  const keyId = (key: string): string => {
    let parts: unknown;
    try { parts = JSON.parse(key); } catch { return invalid(); }
    if (!Array.isArray(parts) || parts.length !== 3 || parts[0] !== projectId || parts[1] !== "feed_rule" ||
      typeof parts[2] !== "string" || !parts[2] || parts[2].length > 100) invalid();
    return parts[2] as string;
  };
  return {
    authorizeKey(key){keyId(key);context.project(projectId);},
    canUpload(key){keyId(key);return context.canUploadProject(projectId);},
    belongsToProject(key,target) { keyId(key); return target === projectId; },
    read(key) {
      const id = keyId(key);
      const row = db.prepare("SELECT * FROM feed_out_rules WHERE project_id=? AND rule_id=?").get(projectId, id);
      if (!row) return null;
      validateRule(row, projectId, id);
      const value = { format: 1, spaceId: context.spaceId, project: { id: projectId, title: context.project(projectId).title }, rule: row };
      size(value);
      return value;
    },
    apply(key, value) {
      const id = keyId(key);
      const active = db.prepare("SELECT enabled FROM feed_out_rules WHERE project_id=? AND rule_id=?")
        .get(projectId, id) as { enabled: number } | undefined;
      if (active?.enabled === 1) throw syncError("busy", "本机捕捉规则正在启用，不能被远端记录覆盖");
      if (value === null) {
        db.prepare("DELETE FROM feed_out_rules WHERE project_id=? AND rule_id=?").run(projectId, id);
        return;
      }
      size(value);
      const wire = object(value);
      exact(wire, ["format", "spaceId", "project", "rule"]);
      const project = object(wire.project);
      exact(project, ["id", "title"]);
      if (wire.format !== 1 || wire.spaceId !== context.spaceId || project.id !== projectId ||
        typeof project.title !== "string" || !project.title.trim() || project.title.length > 120) invalid();
      const rule = validateRule(wire.rule, projectId, id);
      // Restored rules are intentionally disabled until explicitly enabled on this device.
      const values = COLUMNS.map(column => column === "enabled" ? 0 : rule[column] as string|number|null);
      db.prepare(`INSERT INTO feed_out_rules (${COLUMNS.join(",")}) VALUES (${COLUMNS.map(() => "?").join(",")})
        ON CONFLICT(project_id,rule_id) DO UPDATE SET ${COLUMNS.filter(column => column !== "project_id" && column !== "rule_id").map(column => `${column}=excluded.${column}`).join(",")}`)
        .run(...values);
      context.authorize();
    },
  };
 }};
}

export const feedSync: PluginSyncDeclaration = {
  protocol_version: 1,
  collections: [{ id: "capture_rules", database: "project", tracking: feedRuleTracking, title: "消息捕捉规则", schema_version: 1, requires: [] },{id:'source_descriptions',database:'project',title:'来源描述与历史',schema_version:1,requires:[],sections:sourceSectionsDeclaration,tracking:sourceSectionsTracking},{id:'messages',database:'project',title:'消息、材料与固定历史',schema_version:1,requires:['source_descriptions'],sections:messageSectionsDeclaration,tracking:messageSectionsTracking}],
};
