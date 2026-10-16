import {queueReplicaChange,replicaApplyingSql} from "@molis-ai/molis-work-storage";
import { syncError } from './sync-errors.js';
import type { DatabaseSync } from "node:sqlite";
import type { PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SyncReplicaAdapter } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import {
  createSqliteReplica, initializeReplica, readDatabaseSpace, replicaMarkSql, replicaTransaction,
  type AggregateReplicaContext,
} from "@molis-ai/molis-work-storage";
import { parseChain } from "./model.js";

export const workflowsSync: PluginSyncDeclaration = {
  protocol_version: 1,
  collections: [{ id: "workflow_history", title: "工作流程与运行记录", schema_version: 1, requires: [] }],
};

type Kind = "workflow" | "instance";
type Row = Record<string, string | number | null>;
const workflowColumns = ["workflow_id", "project_id", "title", "chain_json", "revision", "created_at", "updated_at", "deleted"] as const;
const instanceColumns = ["instance_id", "workflow_id", "project_id", "title", "status", "current", "chain_json", "steps_json", "created_at", "updated_at"] as const;
const limit = 512 * 1024;

/** Install the journal when the store opens, so edits and deletions are recorded before the first sync run. */
export function initializeWorkflowsReplication(db: DatabaseSync): void {
  if (readDatabaseSpace(db)?.kind !== "personal") return;
  replicaTransaction(db, () => {
    initializeReplica(db);
    db.prepare("SELECT workflow_id,revision FROM workflow_editor_versions LIMIT 0").all();
    db.prepare("SELECT instance_id FROM workflow_imported_instances LIMIT 0").all();
    db.exec("INSERT INTO workflow_editor_versions SELECT workflow_id,revision FROM workflows WHERE 1 ON CONFLICT(workflow_id) DO UPDATE SET revision=MAX(revision,excluded.revision)");
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='workflows_replica_insert'").get()) {
      for(const row of db.prepare("SELECT project_id,workflow_id FROM workflows ORDER BY workflow_id").all())queueReplicaChange(db,JSON.stringify([row.project_id,"workflow",row.workflow_id]));
      for(const row of db.prepare("SELECT project_id,instance_id FROM instances ORDER BY instance_id").all())queueReplicaChange(db,JSON.stringify([row.project_id,"instance",row.instance_id]));
      for (const event of ["INSERT", "UPDATE", "DELETE"] as const) {
        const row = event === "DELETE" ? "OLD" : "NEW";
        const other = event === "UPDATE" ? replicaMarkSql("json_array(OLD.project_id,'workflow',OLD.workflow_id)", "OLD.project_id<>NEW.project_id") : "";
        db.exec("CREATE TRIGGER workflows_replica_" + event.toLowerCase() + " AFTER " + event + " ON workflows BEGIN " +
          replicaMarkSql("json_array(" + row + ".project_id,'workflow'," + row + ".workflow_id)") + other +
          (event === "DELETE" ? "" : "INSERT INTO workflow_editor_versions VALUES (" + row + ".workflow_id," + row + ".revision) ON CONFLICT(workflow_id) DO UPDATE SET revision=MAX(revision,excluded.revision);") + " END");
        const oldInstance = event === "UPDATE" ? replicaMarkSql("json_array(OLD.project_id,'instance',OLD.instance_id)", "OLD.project_id<>NEW.project_id") : "";
        db.exec("CREATE TRIGGER instances_replica_" + event.toLowerCase() + " AFTER " + event + " ON instances BEGIN " +
          replicaMarkSql("json_array(" + row + ".project_id,'instance'," + row + ".instance_id)") + oldInstance + " END");
      }
      for (const event of ["INSERT", "UPDATE"] as const) {
        db.exec("CREATE TRIGGER instances_imported_" + event.toLowerCase() + " AFTER " + event +
          " ON instances WHEN "+replicaApplyingSql()+"=1 BEGIN " +
          "INSERT OR IGNORE INTO workflow_imported_instances VALUES (NEW.instance_id); END");
      }
    }
  });
}

export function isImportedWorkflowInstance(db: DatabaseSync, id: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='workflow_imported_instances'").get() &&
    !!db.prepare("SELECT 1 FROM workflow_imported_instances WHERE instance_id=?").get(id);
}

export function createWorkflowsReplica(db: DatabaseSync, context: AggregateReplicaContext): SyncReplicaAdapter {
  const space = readDatabaseSpace(db);
  if (space?.kind !== "personal" || space.spaceId !== context.spaceId) throw syncError("scope", "同步空间不匹配");
  const decode = (key: string): { projectId: string; kind: Kind; id: string } => {
    let parts: unknown;
    try { parts = JSON.parse(key); } catch { return invalid(); }
    if (!Array.isArray(parts) || parts.length !== 3 || parts.some(part => typeof part !== "string" || !part || part.length > 80) ||
      !["workflow", "instance"].includes(parts[1])) invalid();
    return { projectId: parts[0] as string, kind: parts[1] as Kind, id: parts[2] as string };
  };
  const local = (kind: Kind, id: string, projectId: string): Row | null => {
    const row = db.prepare(kind === "workflow" ? "SELECT * FROM workflows WHERE workflow_id=?" : "SELECT * FROM instances WHERE instance_id=?").get(id) as Row | undefined;
    if (row && row.project_id !== projectId) throw syncError("scope", "资产标识已属于其他项目");
    return row ?? null;
  };
  return createSqliteReplica(db, {
    authorize: context.authorize,
    canUpload: key => context.canUploadProject(decode(key).projectId),
    read(key) {
      const { projectId, kind, id } = decode(key), project = context.project(projectId), row = local(kind, id, projectId);
      if (!row) return null;
      const columns = kind === "workflow" ? workflowColumns : instanceColumns;
      const record = Object.fromEntries(columns.map(column => [column, row[column]]));
      validate(kind, record);
      const value = { format: 1, spaceId: context.spaceId, project: { id: projectId, title: project.title }, record };
      checkSize(value);
      return value;
    },
    apply(key, value) {
      const { projectId, kind, id } = decode(key);
      context.project(projectId);
      const current = local(kind, id, projectId);
      if (kind === "instance" && current?.status === "active" && !isImportedWorkflowInstance(db, id)) {
        throw syncError("busy", "本机运行中的流程实例不能被远端覆盖");
      }
      const table = kind === "workflow" ? "workflows" : "instances";
      const identity = kind === "workflow" ? "workflow_id" : "instance_id";
      if (value === null) {
        db.prepare("DELETE FROM " + table + " WHERE " + identity + "=? AND project_id=?").run(id, projectId);
        return;
      }
      checkSize(value);
      const envelope = recordOf(value, ["format", "spaceId", "project", "record"]);
      const project = recordOf(envelope.project, ["id", "title"]);
      if (envelope.format !== 1 || envelope.spaceId !== context.spaceId || project.id !== projectId ||
        typeof project.title !== "string" || project.title.length > 120) invalid();
      const columns = kind === "workflow" ? workflowColumns : instanceColumns;
      const record = recordOf(envelope.record, [...columns]);
      if (record[identity] !== id || record.project_id !== projectId) invalid();
      validate(kind, record);
      if (kind === "instance") {
        const parent = db.prepare("SELECT project_id FROM workflows WHERE workflow_id=?").get(record.workflow_id as string) as { project_id: string } | undefined;
        if (!parent) throw syncError("dependencies", "等待流程定义");
        if (parent.project_id !== projectId) throw syncError("scope", "运行实例引用了其他项目的流程");
        record.updated_at = new Date(Math.max(Date.now(), Date.parse(record.updated_at as string),
          current ? Date.parse(current.updated_at as string) + 1 : 0)).toISOString();
      } else {
        const high = db.prepare("SELECT revision FROM workflow_editor_versions WHERE workflow_id=?").get(id) as { revision: number } | undefined;
        record.revision = Math.max(Number(current?.revision ?? 0), high?.revision ?? 0) + 1;
      }
      const values = columns.map(column => record[column] as string | number | null);
      db.prepare("INSERT INTO " + table + " (" + columns.join(",") + ") VALUES (" + columns.map(() => "?").join(",") +
        ") ON CONFLICT(" + identity + ") DO UPDATE SET " + columns.filter(column => column !== identity).map(column => column + "=excluded." + column).join(","))
        .run(...values);
    },
  });
}

function validate(kind: Kind, raw: Record<string, unknown>): void {
  const columns = kind === "workflow" ? workflowColumns : instanceColumns;
  if (Object.keys(raw).length !== columns.length || columns.some(column => !Object.hasOwn(raw, column)) ||
    Object.values(raw).some(value => value !== null && typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value)))) invalid();
  if (typeof raw.project_id !== "string" || typeof raw.title !== "string" || !raw.title || raw.title.length > 120 ||
    typeof raw.created_at !== "string" || !Number.isFinite(Date.parse(raw.created_at)) ||
    typeof raw.updated_at !== "string" || !Number.isFinite(Date.parse(raw.updated_at))) invalid();
  let chain: unknown;
  try { chain = JSON.parse(raw.chain_json as string); } catch { return invalid(); }
  const parsed = parseChain(chain);
  if (!Array.isArray((chain as { stations?: unknown }).stations) ||
    parsed.stations.some((station, index) => station.station_id !== (chain as { stations: Array<{ station_id: string }> }).stations[index]?.station_id)) invalid();
  if (kind === "workflow") {
    if (typeof raw.workflow_id !== "string" || !raw.workflow_id || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 ||
      ![0, 1].includes(raw.deleted as number)) invalid();
  } else {
    if (typeof raw.instance_id !== "string" || !raw.instance_id || typeof raw.workflow_id !== "string" || !raw.workflow_id ||
      !["active", "done", "stopped"].includes(raw.status as string) || !Number.isSafeInteger(raw.current) ||
      (raw.current as number) < 0 || (raw.current as number) >= parsed.stations.length) invalid();
    let steps: unknown;
    try { steps = JSON.parse(raw.steps_json as string); } catch { return invalid(); }
    if (!Array.isArray(steps) || steps.length !== parsed.stations.length ||
      steps.some((step, index) => !step || typeof step !== "object" || step.station_id !== parsed.stations[index]?.station_id ||
        !["pending", "current", "done"].includes(step.status))) invalid();
  }
}

function recordOf(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== fields.length || fields.some(field => !Object.hasOwn(row, field))) invalid();
  return row;
}
function checkSize(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value)) > limit) throw syncError("limit", "流程记录超过当前同步上限（512 KiB），原数据仍保留在本机");
}
function invalid(): never { throw syncError("invalid", "工作流程同步数据不合法"); }
