import type Database from "better-sqlite3";
import type { ContextAccess, ContextLedgerApi, ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type { RuntimeContextBindingRecord } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { MolisWorkSessionError } from "./errors.js";

const scope = { kind: "personal", id: "private-work-context" } as const;
const access = (actor = "module:private-work-context"): ContextAccess => ({ actor_id: actor, scope });
const target = (id: string): ObjectRef => ({ module: "projects", object_type: "project", id, version: null, scope, project_id: id });

export class RuntimeContextProjectReferences {
  constructor(private readonly ledger: ContextLedgerApi) {}

  get(bindingId: string): string {
    const edge = this.ledger.query.get(access(), `work.binding_project:${bindingId}`);
    if (!edge || edge.target.module !== "projects") {
      throw new MolisWorkSessionError("session.invalid_input", "Runtime 工作入口的 Project 关系缺失，不能猜测绑定");
    }
    return edge.target.id;
  }

  set(bindingId: string, projectId: string, actor: string, at: string): void {
    this.ledger.commands.put(access(actor), { key: `work.binding_project:${bindingId}`, type: "work.binding_project",
      source: { module: "private-work-context", object_type: "runtime-context", id: bindingId, version: null, scope },
      target: target(projectId), cause: "work.context_bound", recorded_at: at });
  }

  remove(bindingId: string, actor: string, at: string): void {
    this.ledger.commands.remove(access(actor), `work.binding_project:${bindingId}`, "work.context_unbound", at);
  }

  forProject(projectId: string): string[] {
    return this.ledger.query.list(access(), { type: "work.binding_project", target: target(projectId) })
      .map((edge) => edge.source.id);
  }
}

const BINDING_METADATA_SCHEMA = `CREATE TABLE runtime_context_bindings (
  binding_id TEXT PRIMARY KEY, runtime_id TEXT NOT NULL, stable_work_context_id TEXT NOT NULL,
  bound_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(runtime_id, stable_work_context_id)
);`;

export function createRuntimeContextBindingMetadata(db: Database.Database): void { db.exec(BINDING_METADATA_SCHEMA); }

/** Catalog owns its version; Work owns this table migration and only consumes the Ledger API. */
export function migrateRuntimeContextProjectReferences(db: Database.Database, ledger: ContextLedgerApi): void {
  const columns = db.prepare("PRAGMA table_info(runtime_context_bindings)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "project_id")) return;
  db.transaction(() => {
    const rows = db.prepare("SELECT * FROM runtime_context_bindings ORDER BY binding_id").all() as RuntimeContextBindingRecord[];
    const refs = new RuntimeContextProjectReferences(ledger);
    for (const row of rows) refs.set(row.binding_id, row.project_id, row.bound_by, row.updated_at);
    db.exec(`ALTER TABLE runtime_context_bindings RENAME TO runtime_context_bindings_legacy;
      ${BINDING_METADATA_SCHEMA}
      INSERT INTO runtime_context_bindings (binding_id, runtime_id, stable_work_context_id, bound_by, created_at, updated_at)
        SELECT binding_id, runtime_id, stable_work_context_id, bound_by, created_at, updated_at FROM runtime_context_bindings_legacy;
      DROP TABLE runtime_context_bindings_legacy;`);
  }).immediate();
}
