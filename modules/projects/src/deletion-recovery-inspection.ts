import { projectCatalogErrors } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ProjectsSqliteDatabase } from "./repository.js";

type Row = Record<string, unknown>;
export interface ProjectDeletionSourceIdentity {
  project_id: string;
  data_class: ProjectRecord["data_class"];
  created_at: string;
}
export interface ProjectDeletionSourceRecord {
  deletion_id: string;
  project_id: string;
  actor_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  cleanup_state: "pending" | "complete";
  /** Only the Catalog's original decoder may interpret this persisted value. */
  recovery_plan: string;
  owner_steps: { owner_id: string; state: "pending" | "complete" }[];
  current_project: ProjectDeletionSourceIdentity | null;
  retained_project: ProjectDeletionSourceIdentity | null;
}
const invalid = () => projectCatalogErrors.project_storage_invalid("项目删除来源事实不完整或形状不符");
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw invalid();
  return value;
}
function state(value: unknown): "pending" | "complete" {
  if (value !== "pending" && value !== "complete") throw invalid();
  return value;
}
function projectIdentity(row: Row): ProjectDeletionSourceIdentity {
  if (row.data_class !== "user" && row.data_class !== "regenerable_demo") throw invalid();
  return { project_id: text(row.project_id), data_class: row.data_class, created_at: text(row.created_at) };
}
/** All retained Catalog project identities, including pending deletion; no display defaults or private fields. */
export function readProjectDeletionCatalogIdentities(db: ProjectsSqliteDatabase): ProjectDeletionSourceIdentity[] {
  return (db.prepare("SELECT project_id, data_class, created_at FROM projects ORDER BY project_id").all() as Row[]).map(projectIdentity);
}
function identity(db: ProjectsSqliteDatabase, projectId: string) {
  const row = db.prepare(`SELECT project_id, data_class, created_at,
    EXISTS (SELECT 1 FROM project_deletions d WHERE d.project_id=projects.project_id AND d.cleanup_state='pending') AS pending
    FROM projects WHERE project_id=?`).get(projectId) as Row | undefined;
  if (!row) return { current_project: null, retained_project: null };
  const project = projectIdentity(row);
  return { current_project: row.pending ? null : project, retained_project: project };
}
function steps(db: ProjectsSqliteDatabase, deletionId: string) {
  const rows = db.prepare("SELECT owner_id, position, state FROM project_deletion_steps WHERE deletion_id=? ORDER BY position, owner_id")
    .all(deletionId) as Row[];
  if (!rows.length) throw invalid();
  const owners = new Set<string>();
  return rows.map((row, position) => {
    const owner = text(row.owner_id);
    if (row.position !== position || owners.has(owner)) throw invalid();
    owners.add(owner);
    return { owner_id: owner, state: state(row.state) };
  });
}

/** Internal Catalog source projection. Caller owns an existing read transaction and schema/permission checks. */
export function readProjectDeletionRecoveryPage(db: ProjectsSqliteDatabase, input: { after?: string; limit: number }): {
  items: ProjectDeletionSourceRecord[]; exhausted: boolean;
} {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) throw invalid();
  if (input.after !== undefined) text(input.after);
  // Fetch only bounded references first: a plan may be large, but no whole-Catalog array is materialized.
  const refs = db.prepare(`SELECT deletion_id FROM project_deletions
    WHERE (? IS NULL OR deletion_id > ?) ORDER BY deletion_id LIMIT ?`).all(input.after ?? null, input.after ?? null, input.limit + 1) as Row[];
  const exhausted = refs.length <= input.limit;
  if (!exhausted) refs.pop();
  const items = refs.map(ref => {
    const id = text(ref.deletion_id);
    const row = db.prepare(`SELECT deletion_id, project_id, actor_id, idempotency_key, request_fingerprint, cleanup_state, recovery_plan
      FROM project_deletions WHERE deletion_id=?`).get(id) as Row | undefined;
    if (!row) throw invalid();
    const owner_steps = steps(db, id), cleanup_state = state(row.cleanup_state);
    if (cleanup_state === "complete" && owner_steps.some(step => step.state !== "complete")) throw invalid();
    const project_id = text(row.project_id);
    return { deletion_id: id, project_id, actor_id: text(row.actor_id), idempotency_key: text(row.idempotency_key),
      request_fingerprint: text(row.request_fingerprint), cleanup_state, recovery_plan: text(row.recovery_plan),
      owner_steps, ...identity(db, project_id) };
  });
  return { items, exhausted };
}
