import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { createRuntimeContextBindingMetadata, RuntimeContextProjectReferences } from "./context-binding-references.js";
import type {
  RuntimeContextBindingEventRecord,
  RuntimeContextBindingRecord,
} from "@molis-ai/molis-work-contracts/modules/private-work-context";

export interface RuntimeContextSetupRequestRecord {
  request_fingerprint: string;
  project_id: string;
}

export class RuntimeContextBindingRepository {
  private readonly references: RuntimeContextProjectReferences;
  constructor(private readonly db: Database.Database, private readonly options: {
    ledger: ContextLedgerApi;
    assertProject(projectId: string): void;
  }) { this.references = new RuntimeContextProjectReferences(options.ledger); }

  find(runtimeId: string, stableWorkContextId: string): RuntimeContextBindingRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM runtime_context_bindings
      WHERE runtime_id = ? AND stable_work_context_id = ?
    `).get(runtimeId, stableWorkContextId) as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  list(): RuntimeContextBindingRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM runtime_context_bindings
      ORDER BY updated_at DESC, runtime_id, stable_work_context_id
    `).all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.map(row));
  }

  insert(binding: RuntimeContextBindingRecord): void {
    this.db.transaction(() => {
      this.options.assertProject(binding.project_id);
      this.db.prepare(`
      INSERT INTO runtime_context_bindings (
        binding_id, runtime_id, stable_work_context_id,
        bound_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      binding.binding_id,
      binding.runtime_id,
      binding.stable_work_context_id,
      binding.bound_by,
      binding.created_at,
      binding.updated_at,
      );
      this.references.set(binding.binding_id, binding.project_id, binding.bound_by, binding.updated_at);
    }).immediate();
  }

  updateProject(bindingId: string, projectId: string, actorId: string, updatedAt: string): void {
    this.db.transaction(() => {
      this.options.assertProject(projectId);
      const updated = this.db.prepare(`
      UPDATE runtime_context_bindings
      SET bound_by = ?, updated_at = ?
      WHERE binding_id = ?
      `).run(actorId, updatedAt, bindingId);
      if (updated.changes) this.references.set(bindingId, projectId, actorId, updatedAt);
    }).immediate();
  }

  remove(bindingId: string, actorId: string, at: string): number {
    return this.db.transaction(() => {
      const count = this.db.prepare("DELETE FROM runtime_context_bindings WHERE binding_id = ?").run(bindingId).changes;
      if (count) this.references.remove(bindingId, actorId, at);
      return count;
    }).immediate();
  }

  listEvents(filter?: { runtime_id: string; stable_work_context_id: string }): RuntimeContextBindingEventRecord[] {
    const rows = filter
      ? this.db.prepare(`
          SELECT * FROM runtime_context_binding_events
          WHERE runtime_id = ? AND stable_work_context_id = ?
          ORDER BY rowid
        `).all(filter.runtime_id, filter.stable_work_context_id)
      : this.db.prepare("SELECT * FROM runtime_context_binding_events ORDER BY rowid").all();
    return (rows as Array<Record<string, unknown>>).map(mapRuntimeContextBindingEvent);
  }

  appendEvent(input: {
    binding: RuntimeContextBindingRecord;
    type: RuntimeContextBindingEventRecord["type"];
    previous_project_id: string | null;
    actor_id: string;
    created_at: string;
  }): RuntimeContextBindingEventRecord {
    const event: RuntimeContextBindingEventRecord = {
      event_id: `context-binding-event-${randomUUID()}`,
      binding_id: input.binding.binding_id,
      runtime_id: input.binding.runtime_id,
      stable_work_context_id: input.binding.stable_work_context_id,
      type: input.type,
      previous_project_id: input.previous_project_id,
      project_id: input.binding.project_id,
      actor_id: input.actor_id,
      created_at: input.created_at,
    };
    this.db.prepare(`
      INSERT INTO runtime_context_binding_events (
        event_id, binding_id, runtime_id, stable_work_context_id, type,
        previous_project_id, project_id, actor_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.event_id,
      event.binding_id,
      event.runtime_id,
      event.stable_work_context_id,
      event.type,
      event.previous_project_id,
      event.project_id,
      event.actor_id,
      event.created_at,
    );
    return event;
  }

  hasUnboundEvent(runtimeId: string, stableWorkContextId: string): boolean {
    return this.db.prepare(`
      SELECT 1 FROM runtime_context_binding_events
      WHERE runtime_id = ? AND stable_work_context_id = ? AND type = 'context.unbound'
      LIMIT 1
    `).get(runtimeId, stableWorkContextId) != null;
  }

  confirmedProjectIdsForOtherSessions(runtimeId: string, excludedStableWorkContextId: string): string[] {
    const rows = this.db.prepare(`
      SELECT event.project_id
      FROM runtime_context_binding_events AS event
      WHERE event.runtime_id = ?
        AND event.stable_work_context_id <> ?
        AND event.type IN ('context.bound', 'context.rebound')
      ORDER BY event.created_at DESC, event.event_id DESC
    `).all(runtimeId, excludedStableWorkContextId) as Array<{ project_id?: unknown }>;
    return rows.map((row) => String(row.project_id));
  }

  rejectSuggestion(input: {
    runtime_id: string;
    stable_work_context_id: string;
    project_id: string;
    actor_id: string;
    created_at: string;
  }): boolean {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO runtime_context_suggestion_rejections (
        runtime_id, stable_work_context_id, project_id, actor_id, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      input.runtime_id,
      input.stable_work_context_id,
      input.project_id,
      input.actor_id,
      input.created_at,
    );
    return result.changes > 0;
  }

  rejectedProjectIds(runtimeId: string, stableWorkContextId: string): Set<string> {
    const rows = this.db.prepare(`
      SELECT project_id FROM runtime_context_suggestion_rejections
      WHERE runtime_id = ? AND stable_work_context_id = ?
    `).all(runtimeId, stableWorkContextId) as Array<{ project_id?: unknown }>;
    return new Set(rows.map((row) => String(row.project_id)));
  }

  findSetupRequest(
    runtimeId: string,
    persistenceId: string,
    idempotencyKey: string,
  ): RuntimeContextSetupRequestRecord | null {
    const row = this.db.prepare(`
      SELECT request_fingerprint, project_id
      FROM runtime_context_setup_requests
      WHERE runtime_id = ? AND stable_work_context_id = ? AND idempotency_key = ?
    `).get(runtimeId, persistenceId, idempotencyKey) as
      | { request_fingerprint?: unknown; project_id?: unknown }
      | undefined;
    return row
      ? { request_fingerprint: String(row.request_fingerprint), project_id: String(row.project_id) }
      : null;
  }

  insertSetupRequest(input: {
    runtime_id: string;
    persistence_id: string;
    idempotency_key: string;
    request_fingerprint: string;
    project_id: string;
    created_at: string;
  }): void {
    this.db.prepare(`
      INSERT INTO runtime_context_setup_requests (
        runtime_id, stable_work_context_id, idempotency_key,
        request_fingerprint, project_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.runtime_id,
      input.persistence_id,
      input.idempotency_key,
      input.request_fingerprint,
      input.project_id,
      input.created_at,
    );
  }

  removeProjectFacts(projectId: string, actorId: string, at: string): number {
    return this.db.transaction(() => {
      const deletedBindings = this.references.forProject(projectId)
        .reduce((count, id) => count + this.remove(id, actorId, at), 0);
      this.db.prepare("DELETE FROM runtime_context_setup_requests WHERE project_id = ?").run(projectId);
      return deletedBindings;
    }).immediate();
  }

  private map(row: Record<string, unknown>): RuntimeContextBindingRecord {
    return mapRuntimeContextBinding(row, this.references.get(String(row.binding_id)));
  }
}

export function createRuntimeContextBindingTables(db: Database.Database): void {
  createRuntimeContextBindingMetadata(db);
  db.exec(`
    CREATE TABLE runtime_context_binding_events (
      event_id TEXT PRIMARY KEY,
      binding_id TEXT NOT NULL,
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('context.bound', 'context.rebound', 'context.unbound')),
      previous_project_id TEXT,
      project_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX runtime_context_binding_events_context_idx
      ON runtime_context_binding_events(runtime_id, stable_work_context_id, created_at, event_id);
  `);
}

export function createRuntimeContextSetupRequestTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_context_setup_requests (
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(project_id),
      created_at TEXT NOT NULL,
      PRIMARY KEY (runtime_id, stable_work_context_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS runtime_context_setup_requests_project_idx
      ON runtime_context_setup_requests(project_id, created_at);
  `);
}

export function createRuntimeContextSuggestionRejectionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_context_suggestion_rejections (
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (runtime_id, stable_work_context_id, project_id)
    );
    CREATE INDEX IF NOT EXISTS runtime_context_suggestion_rejections_project_idx
      ON runtime_context_suggestion_rejections(project_id, created_at);
  `);
}

export function migrateRuntimeContextBindingEventsForUnbind(db: Database.Database): void {
  db.exec(`
    ALTER TABLE runtime_context_binding_events RENAME TO runtime_context_binding_events_v3;
    CREATE TABLE runtime_context_binding_events (
      event_id TEXT PRIMARY KEY,
      binding_id TEXT NOT NULL,
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('context.bound', 'context.rebound', 'context.unbound')),
      previous_project_id TEXT,
      project_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO runtime_context_binding_events (
      event_id, binding_id, runtime_id, stable_work_context_id, type,
      previous_project_id, project_id, actor_id, created_at
    )
    SELECT event_id, binding_id, runtime_id, stable_work_context_id, type,
      previous_project_id, project_id, actor_id, created_at
    FROM runtime_context_binding_events_v3;
    DROP TABLE runtime_context_binding_events_v3;
    CREATE INDEX runtime_context_binding_events_context_idx
      ON runtime_context_binding_events(runtime_id, stable_work_context_id, created_at, event_id);
  `);
}

function mapRuntimeContextBinding(row: Record<string, unknown>, projectId: string): RuntimeContextBindingRecord {
  return {
    binding_id: String(row.binding_id),
    runtime_id: String(row.runtime_id),
    stable_work_context_id: String(row.stable_work_context_id),
    project_id: projectId,
    bound_by: String(row.bound_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapRuntimeContextBindingEvent(row: Record<string, unknown>): RuntimeContextBindingEventRecord {
  return {
    event_id: String(row.event_id),
    binding_id: String(row.binding_id),
    runtime_id: String(row.runtime_id),
    stable_work_context_id: String(row.stable_work_context_id),
    type: String(row.type) as RuntimeContextBindingEventRecord["type"],
    previous_project_id: row.previous_project_id == null ? null : String(row.previous_project_id),
    project_id: String(row.project_id),
    actor_id: String(row.actor_id),
    created_at: String(row.created_at),
  };
}
