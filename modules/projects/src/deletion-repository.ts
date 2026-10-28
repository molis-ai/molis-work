import type { ProjectDeletionReceipt } from "@molis-ai/molis-work-contracts/modules/projects";

import { nullableText, numeric, text, type ProjectsSqliteDatabase, type Row } from "./sqlite.js";

export interface StoredProjectDeletion extends ProjectDeletionReceipt {
  idempotency_key: string;
  request_fingerprint: string;
  staged_directory: string;
  /** Host-owned body-free original cleanup decision; never exposed in the public receipt. */
  recovery_plan: string | null;
}

/** The deletion receipts: `project_deletions`. The per-owner steps of a receipt are `deletion-steps.ts`. */
export class ProjectDeletionRepository {
  constructor(private readonly db: ProjectsSqliteDatabase) {}

  findDeletion(actorId: string, idempotencyKey: string): StoredProjectDeletion | null {
    const row = this.db.prepare(
      "SELECT * FROM project_deletions WHERE actor_id = ? AND idempotency_key = ?",
    ).get(actorId, idempotencyKey) as Row | undefined;
    return row ? mapStoredProjectDeletion(row) : null;
  }

  getDeletion(deletionId: string): StoredProjectDeletion | null {
    const row = this.db.prepare("SELECT * FROM project_deletions WHERE deletion_id = ?")
      .get(deletionId) as Row | undefined;
    return row ? mapStoredProjectDeletion(row) : null;
  }

  listProjectDeletions(): ProjectDeletionReceipt[] {
    return (this.db.prepare(
      "SELECT * FROM project_deletions ORDER BY deleted_at DESC, deletion_id DESC",
    ).all() as Row[]).map((row) => deletionRecord(mapStoredProjectDeletion(row)));
  }

  insertDeletion(record: StoredProjectDeletion): void {
    this.db.prepare(`
      INSERT INTO project_deletions (
        deletion_id, actor_id, idempotency_key, request_fingerprint,
        project_id, display_name, staged_directory, deleted_binding_count,
        cleanup_state, cleanup_error, deleted_at, cleaned_at, recovery_plan
      ) VALUES (@deletion_id, @actor_id, @idempotency_key, @request_fingerprint,
        @project_id, @display_name, @staged_directory, @deleted_binding_count,
        @cleanup_state, @cleanup_error, @deleted_at, @cleaned_at, @recovery_plan)
    `).run(record);
  }

  updateDeletionCleanup(
    deletionId: string,
    input: { state: "complete" | "pending"; error: string | null; cleaned_at: string | null; add_binding_count?: number },
  ): void {
    this.db.prepare(`
      UPDATE project_deletions
      SET cleanup_state = ?, cleanup_error = ?, cleaned_at = ?, deleted_binding_count = deleted_binding_count + ?
      WHERE deletion_id = ?
    `).run(input.state, input.error, input.cleaned_at, input.add_binding_count ?? 0, deletionId);
  }
}

function mapStoredProjectDeletion(row: Row): StoredProjectDeletion {
  return {
    deletion_id: text(row.deletion_id),
    actor_id: text(row.actor_id),
    idempotency_key: text(row.idempotency_key),
    request_fingerprint: text(row.request_fingerprint),
    project_id: text(row.project_id),
    display_name: text(row.display_name),
    staged_directory: text(row.staged_directory),
    deleted_binding_count: numeric(row.deleted_binding_count),
    cleanup_state: text(row.cleanup_state) as StoredProjectDeletion["cleanup_state"],
    cleanup_error: nullableText(row.cleanup_error),
    deleted_at: text(row.deleted_at),
    cleaned_at: nullableText(row.cleaned_at),
    recovery_plan: nullableText(row.recovery_plan),
  };
}

export function deletionRecord(record: StoredProjectDeletion): ProjectDeletionReceipt {
  return {
    deletion_id: record.deletion_id,
    project_id: record.project_id,
    display_name: record.display_name,
    actor_id: record.actor_id,
    deleted_binding_count: record.deleted_binding_count,
    cleanup_state: record.cleanup_state,
    cleanup_error: record.cleanup_error,
    deleted_at: record.deleted_at,
    cleaned_at: record.cleaned_at,
  };
}
