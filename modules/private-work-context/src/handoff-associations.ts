import type Database from "better-sqlite3";
import type { ContextAccess, ContextLedgerApi, ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { MolisWorkSessionError } from "./errors.js";

const scope = { kind: "personal", id: "private-work-context" } as const;
const access = (actor = "module:private-work-context"): ContextAccess => ({ actor_id: actor, scope });
const source = (id: string): ObjectRef => ({ module: "private-work-context", object_type: "handoff", id, version: null, scope });

/** Only Handoff cross-module endpoints; content and delivery remain Work facts. */
export class HandoffAssociationRepository {
  constructor(private readonly ledger: ContextLedgerApi) {}

  read(packageId: string) {
    const goal = this.ledger.query.get(access(), `handoff.goal:${packageId}`)?.target;
    const project = this.ledger.query.get(access(), `handoff.project:${packageId}`)?.target;
    const workspace = this.ledger.query.get(access(), `handoff.workspace:${packageId}`)?.target;
    if (!goal?.project_id || goal.module !== "goals" || project?.module !== "projects") {
      throw new MolisWorkSessionError("session.invalid_input", "Handoff 的来源或目标关系缺失，不能猜测恢复");
    }
    return { source_project_id: goal.project_id, source_goal_id: goal.id,
      target_project_id: project.id, target_workspace_id: workspace?.id ?? null };
  }

  recordSource(packageId: string, projectId: string, goalId: string, version: number | null, actor: string, at: string): void {
    this.ledger.commands.put(access(actor), { key: `handoff.goal:${packageId}`, type: "handoff.goal", source: source(packageId),
      target: { module: "goals", id: goalId, version, scope, project_id: projectId },
      cause: "work.handoff_source", recorded_at: at });
  }

  setTarget(packageId: string, projectId: string, workspaceId: string | null, actor: string, at: string): void {
    this.ledger.commands.put(access(actor), { key: `handoff.project:${packageId}`, type: "handoff.project", source: source(packageId),
      target: { module: "projects", object_type: "project", id: projectId, version: null, scope, project_id: projectId },
      cause: "work.handoff_target", recorded_at: at });
    const key = `handoff.workspace:${packageId}`;
    if (!workspaceId) { this.ledger.commands.remove(access(actor), key, "work.handoff_workspace_cleared", at); return; }
    this.ledger.commands.put(access(actor), { key, type: "handoff.workspace", source: source(packageId),
      target: { module: "projects", object_type: "workspace", id: workspaceId, version: null, scope, project_id: projectId },
      cause: "work.handoff_target", recorded_at: at });
  }

  migrate(db: Database.Database): void {
    const version = db.prepare("SELECT value FROM session_meta WHERE key = 'schema_version'").get() as { value: string };
    if (Number(version.value) >= 5) return;
    db.transaction(() => {
      const rows = db.prepare(`SELECT package_id, source_project_id, source_goal_id, target_project_id,
        target_workspace_id, created_by, created_at, updated_at FROM session_handoffs`).all() as Array<{
          package_id: string; source_project_id: string; source_goal_id: string; target_project_id: string;
          target_workspace_id: string | null; created_by: string; created_at: string; updated_at: string;
        }>;
      for (const row of rows) {
        this.recordSource(row.package_id, row.source_project_id, row.source_goal_id, null, row.created_by, row.created_at);
        this.setTarget(row.package_id, row.target_project_id, row.target_workspace_id, "legacy-session-migration", row.updated_at);
      }
      db.prepare(`UPDATE session_handoffs SET source_project_id = '', source_goal_id = '',
        target_project_id = '', target_workspace_id = NULL`).run();
      db.prepare("UPDATE session_meta SET value = '5' WHERE key = 'schema_version'").run();
    }).immediate();
  }
}
