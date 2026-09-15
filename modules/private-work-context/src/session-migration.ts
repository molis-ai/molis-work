import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  MolisWorkSessionRecord,
  LegacySessionMigrationInput,
  LegacySessionMigrationReport,
} from "./contract-aliases.js";
import { MolisWorkSessionError } from "./errors.js";
import { SessionRecordRepository } from "./session-records.js";
import { DEFAULT_CORRELATION_TTL_SECONDS } from "./session-schema.js";

export class LegacySessionMigrator {
  constructor(
    private readonly db: Database.Database,
    private readonly now: () => Date,
    private readonly sessions: SessionRecordRepository,
  ) {}

  migrate(input: LegacySessionMigrationInput): LegacySessionMigrationReport {
    return this.db.transaction(() => {
      let createdSessions = 0;
      let reusedSessions = 0;
      let receiptsWritten = 0;
      const sessionIds = new Set<string>();
      const panelSessions = new Map<string, MolisWorkSessionRecord>();

      for (const panel of input.panels) {
        const sourceId = `panel:${panel.panel_id}`;
        let session = this.sessionForReceipt(sourceId)
          ?? this.sessions.findBySurface(panel.panel_id)
          ?? (panel.host_session_id
            ? this.sessions.findByNativeRuntimeSession(panel.runtime_id, panel.host_session_id)
            : null);
        if (!session) {
          const now = panel.updated_at || this.now().toISOString();
          session = this.sessions.insertSession({
            sessionId: `session-${randomUUID()}`,
            runtimeId: panel.runtime_id,
            nativeId: panel.host_session_id,
            correlationToken: panel.host_session_id ? null : panel.work_context_id,
            correlationExpiresAt: panel.host_session_id
              ? null
              : new Date(this.now().getTime() + DEFAULT_CORRELATION_TTL_SECONDS * 1000).toISOString(),
            surfaceId: panel.panel_id,
            projectId: panel.project_id,
            currentGoalId: panel.goal_id,
            workspaceId: panel.workspace_id,
            workspacePath: panel.workspace_path,
            title: panel.title,
            status: panel.status === "open" ? "active" : "closed",
            provenance: "legacy_migrated",
            metadata: { legacy_work_context_id: panel.work_context_id },
            actorId: "legacy-session-migration",
            createdAt: panel.created_at || now,
            updatedAt: now,
          });
          createdSessions += 1;
        } else {
          session = this.reconcilePanel(session, panel);
          reusedSessions += 1;
        }
        panelSessions.set(panel.panel_id, session);
        sessionIds.add(session.session_id);
        receiptsWritten += this.writeReceipt(sourceId, session.session_id, panel);
      }
      input.before_step?.("after_panels");

      for (const binding of input.bindings) {
        const sourceId = `binding:${binding.binding_id}`;
        let session = this.sessionForReceipt(sourceId);
        if (!session) {
          const matchingPanel = input.panels.find((panel) =>
            panel.runtime_id === binding.runtime_id
            && (panel.work_context_id === binding.stable_work_context_id
              || panel.host_session_id === binding.stable_work_context_id));
          session = matchingPanel ? panelSessions.get(matchingPanel.panel_id) ?? null : null;
        }
        session ??= this.sessions.findByNativeRuntimeSession(binding.runtime_id, binding.stable_work_context_id);
        if (!session) {
          session = this.sessions.insertSession({
            sessionId: `session-${randomUUID()}`,
            runtimeId: binding.runtime_id,
            nativeId: binding.stable_work_context_id,
            correlationToken: null,
            correlationExpiresAt: null,
            surfaceId: null,
            projectId: binding.project_id,
            currentGoalId: null,
            workspaceId: null,
            workspacePath: null,
            title: null,
            status: "active",
            provenance: "legacy_migrated",
            metadata: { legacy_binding_id: binding.binding_id },
            actorId: binding.bound_by || "legacy-session-migration",
            createdAt: binding.created_at,
            updatedAt: binding.updated_at,
          });
          createdSessions += 1;
        } else {
          if (session.project_id && session.project_id !== binding.project_id) {
            throw new MolisWorkSessionError(
              "session.identity_conflict",
              "同一逻辑 Session 的旧 panel 与 binding 指向不同项目，迁移已回滚",
            );
          }
          if (!session.project_id) {
            this.sessions.setAssociationReferences(session.session_id, binding.project_id,
              session.current_goal_id, session.workspace_id, binding.bound_by || "legacy-session-migration", binding.updated_at);
            this.db.prepare("UPDATE sessions SET updated_at = ? WHERE session_id = ?")
              .run(binding.updated_at, session.session_id);
            session = this.sessions.get(session.session_id);
          }
          reusedSessions += 1;
        }
        sessionIds.add(session.session_id);
        receiptsWritten += this.writeReceipt(sourceId, session.session_id, binding);
      }
      input.before_step?.("after_bindings");
      input.before_step?.("before_commit");
      return {
        created_sessions: createdSessions,
        reused_sessions: reusedSessions,
        receipts_written: receiptsWritten,
        session_ids: [...sessionIds].sort(),
      };
    })();
  }

  private sessionForReceipt(sourceId: string): MolisWorkSessionRecord | null {
    const row = this.db.prepare(`
      SELECT sessions.*
      FROM session_migration_receipts AS receipts
      INNER JOIN sessions ON sessions.session_id = receipts.session_id
      WHERE receipts.source_id = ?
    `).get(sourceId) as Record<string, unknown> | undefined;
    return row ? this.sessions.get(String(row.session_id)) : null;
  }

  private writeReceipt(sourceId: string, sessionId: string, source: unknown): number {
    const fingerprint = createHash("sha256").update(JSON.stringify(source)).digest("hex");
    const result = this.db.prepare(`
      INSERT INTO session_migration_receipts (source_id, session_id, source_fingerprint, migrated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(source_id) DO UPDATE SET
        session_id = excluded.session_id,
        source_fingerprint = excluded.source_fingerprint,
        migrated_at = excluded.migrated_at
      WHERE session_migration_receipts.session_id <> excluded.session_id
         OR session_migration_receipts.source_fingerprint <> excluded.source_fingerprint
    `).run(sourceId, sessionId, fingerprint, this.now().toISOString());
    return result.changes;
  }

  private reconcilePanel(
    current: MolisWorkSessionRecord,
    panel: LegacySessionMigrationInput["panels"][number],
  ): MolisWorkSessionRecord {
    if (current.runtime_id !== panel.runtime_id) {
      throw new MolisWorkSessionError("session.runtime_mismatch", "旧 panel 与已有 Session 的 Runtime 不匹配");
    }
    if (current.project_id && current.project_id !== panel.project_id) {
      throw new MolisWorkSessionError("session.identity_conflict", "旧 panel 与已有 Session 指向不同项目");
    }
    if (panel.host_session_id && current.native_runtime_session_id && current.native_runtime_session_id !== panel.host_session_id) {
      throw new MolisWorkSessionError("session.identity_conflict", "旧 panel 已连接另一个 Runtime 原生 Session");
    }
    const now = panel.updated_at || this.now().toISOString();
    this.sessions.setAssociationReferences(current.session_id, current.project_id ?? panel.project_id,
      panel.goal_id, current.workspace_id ?? panel.workspace_id, "legacy-session-migration", now);
    this.db.prepare(`
      UPDATE sessions
      SET native_runtime_session_id = COALESCE(native_runtime_session_id, ?),
          correlation_token = CASE WHEN ? IS NULL THEN correlation_token ELSE NULL END,
          correlation_expires_at = CASE WHEN ? IS NULL THEN correlation_expires_at ELSE NULL END,
          surface_id = COALESCE(surface_id, ?),
          workspace_path = COALESCE(workspace_path, ?), title = COALESCE(title, ?),
          status = ?, updated_at = ?
      WHERE session_id = ?
    `).run(
      panel.host_session_id,
      panel.host_session_id,
      panel.host_session_id,
      panel.panel_id,
      panel.workspace_path,
      panel.title,
      panel.status === "open" ? "active" : "closed",
      now,
      current.session_id,
    );
    return this.sessions.get(current.session_id);
  }
}
