import { syncError } from './sync-errors.js';
import type { PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SyncReplicaAdapter } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import {
  createSqliteReplica, initializeReplica, namespacedReplicaDatabase, readDatabaseSpace,
  replicaMarkSql, replicaTransaction, queueReplicaChange, type ReplicaDatabase,
} from "@molis-ai/molis-work-storage";
import { FEED_OUT_RULES_SCHEMA_SQL } from "./out-rules.js";

export const feedSync: PluginSyncDeclaration = {
  protocol_version: 1,
  collections: [{ id: "capture_rules", title: "消息捕捉规则", schema_version: 1, requires: [] }],
};

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
  if (Buffer.byteLength(JSON.stringify(value)) > 512 * 1024) invalid("捕捉规则超过当前同步上限（512 KiB）", "limit");
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

/** Project-local owner journal: capture rules only, not connector credentials or source poll leases. */
export function installFeedReplication(db: ReplicaDatabase, projectId: string): void {
  if (!/^[a-zA-Z0-9_-]{1,80}$/u.test(projectId)) invalid();
  db.exec(FEED_OUT_RULES_SCHEMA_SQL);
  const ledger = namespacedReplicaDatabase(db, "feed");
  const mark = (expression: string) => replicaMarkSql(expression).replace(/\breplica_/gu, "feed_replica_");
  replicaTransaction(db, () => {
    initializeReplica(ledger);
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='feed_rule_sync_insert'").get()) return;
    for(const row of db.prepare('SELECT rule_id FROM feed_out_rules WHERE project_id=? ORDER BY rule_id').all(projectId))queueReplicaChange(ledger,JSON.stringify([projectId,'feed_rule',row.rule_id]));
    for (const [event, row] of [["INSERT", "NEW"], ["UPDATE", "NEW"], ["DELETE", "OLD"]]) {
      db.exec(`CREATE TRIGGER feed_rule_sync_${event.toLowerCase()} AFTER ${event} ON feed_out_rules
        WHEN ${row}.project_id='${projectId}' BEGIN ${mark(`json_array('${projectId}','feed_rule',${row}.rule_id)`)} END`);
    }
  });
}

export function createFeedRuleReplica(db: ReplicaDatabase, context: {
  spaceId: string; projectId: string; title: string; authorize(): void;
}): SyncReplicaAdapter {
  const binding = readDatabaseSpace(db);
  if (binding?.kind !== "personal" || binding.spaceId !== context.spaceId) invalid("只允许同步当前个人空间的捕捉规则", "scope");
  const keyId = (key: string): string => {
    let parts: unknown;
    try { parts = JSON.parse(key); } catch { return invalid(); }
    if (!Array.isArray(parts) || parts.length !== 3 || parts[0] !== context.projectId || parts[1] !== "feed_rule" ||
      typeof parts[2] !== "string" || !parts[2] || parts[2].length > 100) invalid();
    return parts[2] as string;
  };
  return createSqliteReplica(namespacedReplicaDatabase(db, "feed"), {
    authorize: context.authorize,
    read(key) {
      const id = keyId(key);
      const row = db.prepare("SELECT * FROM feed_out_rules WHERE project_id=? AND rule_id=?").get(context.projectId, id);
      if (!row) return null;
      validateRule(row, context.projectId, id);
      const value = { format: 1, spaceId: context.spaceId, project: { id: context.projectId, title: context.title }, rule: row };
      size(value);
      return value;
    },
    apply(key, value) {
      const id = keyId(key);
      const active = db.prepare("SELECT enabled FROM feed_out_rules WHERE project_id=? AND rule_id=?")
        .get(context.projectId, id) as { enabled: number } | undefined;
      if (active?.enabled === 1) throw syncError("busy", "本机捕捉规则正在启用，不能被远端记录覆盖");
      if (value === null) {
        db.prepare("DELETE FROM feed_out_rules WHERE project_id=? AND rule_id=?").run(context.projectId, id);
        return;
      }
      size(value);
      const wire = object(value);
      exact(wire, ["format", "spaceId", "project", "rule"]);
      const project = object(wire.project);
      exact(project, ["id", "title"]);
      if (wire.format !== 1 || wire.spaceId !== context.spaceId || project.id !== context.projectId ||
        typeof project.title !== "string" || !project.title.trim() || project.title.length > 120) invalid();
      const rule = validateRule(wire.rule, context.projectId, id);
      // Restored rules are intentionally disabled until explicitly enabled on this device.
      const values = COLUMNS.map(column => column === "enabled" ? 0 : rule[column] as string|number|null);
      db.prepare(`INSERT INTO feed_out_rules (${COLUMNS.join(",")}) VALUES (${COLUMNS.map(() => "?").join(",")})
        ON CONFLICT(project_id,rule_id) DO UPDATE SET ${COLUMNS.filter(column => column !== "project_id" && column !== "rule_id").map(column => `${column}=excluded.${column}`).join(",")}`)
        .run(...values);
      context.authorize();
    },
  });
}
