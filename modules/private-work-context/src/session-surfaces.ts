import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { MolisWorkSessionRecord, WorkSessionBindingInput, WorkSessionPanelInput } from "./contract-aliases.js";
import { MolisWorkSessionError } from "./errors.js";
import { SessionRecordRepository } from "./session-records.js";

/** A desktop panel and a Runtime binding write their Session when they are written; nothing is copied at read time. */
export class SessionSurfaceRecorder {
  constructor(
    private readonly db: Database.Database,
    private readonly now: () => Date,
    private readonly sessions: SessionRecordRepository,
  ) {}

  /** A panel's Session: created with the panel, then kept in step with its Goal, title, native identity and status. */
  recordPanel(panel: WorkSessionPanelInput): MolisWorkSessionRecord {
    return this.db.transaction(() => {
      const current = this.sessions.findBySurface(panel.panel_id)
        ?? (panel.host_session_id ? this.sessions.findByNativeRuntimeSession(panel.runtime_id, panel.host_session_id) : null);
      const actor = `desktop-panel:${panel.panel_id}`;
      const now = panel.updated_at || this.now().toISOString();
      if (!current) {
        return this.sessions.insertSession({
          sessionId: `session-${randomUUID()}`,
          runtimeId: panel.runtime_id,
          nativeId: panel.host_session_id,
          correlationToken: null,
          correlationExpiresAt: null,
          surfaceId: panel.panel_id,
          projectId: panel.project_id,
          currentGoalId: panel.goal_id,
          workspaceId: panel.workspace_id,
          workspacePath: panel.workspace_path,
          title: panel.title,
          status: panel.status === "open" ? "active" : "closed",
          provenance: "molis_work_created",
          metadata: { work_context_id: panel.work_context_id },
          actorId: actor,
          createdAt: panel.created_at || now,
          updatedAt: now,
        });
      }
      if (current.runtime_id !== panel.runtime_id) {
        throw new MolisWorkSessionError("session.runtime_mismatch", "panel 与已有 Session 的 Runtime 不匹配");
      }
      if (current.project_id && current.project_id !== panel.project_id) {
        throw new MolisWorkSessionError("session.identity_conflict", "panel 与已有 Session 指向不同项目");
      }
      if (panel.host_session_id && current.native_runtime_session_id && current.native_runtime_session_id !== panel.host_session_id) {
        throw new MolisWorkSessionError("session.identity_conflict", "panel 已连接另一个 Runtime 原生 Session");
      }
      this.sessions.setAssociationReferences(current.session_id, current.project_id ?? panel.project_id,
        panel.goal_id, current.workspace_id ?? panel.workspace_id, actor, now);
      this.db.prepare(`
        UPDATE sessions
        SET native_runtime_session_id = COALESCE(native_runtime_session_id, ?),
            correlation_token = CASE WHEN ? IS NULL THEN correlation_token ELSE NULL END,
            correlation_expires_at = CASE WHEN ? IS NULL THEN correlation_expires_at ELSE NULL END,
            surface_id = COALESCE(surface_id, ?),
            workspace_path = COALESCE(workspace_path, ?), title = COALESCE(title, ?),
            status = ?, updated_at = ?
        WHERE session_id = ?
      `).run(panel.host_session_id, panel.host_session_id, panel.host_session_id, panel.panel_id,
        panel.workspace_path, panel.title, panel.status === "open" ? "active" : "closed", now, current.session_id);
      return this.sessions.get(current.session_id);
    })();
  }

  /** A binding's Session: its panel's when the binding is a panel's work context, else the Runtime's by its stable id. */
  recordBinding(binding: WorkSessionBindingInput, panelSurfaceId: string | null = null): MolisWorkSessionRecord {
    return this.db.transaction(() => {
      const now = this.now().toISOString();
      const current = (panelSurfaceId ? this.sessions.findBySurface(panelSurfaceId) : null)
        ?? this.sessions.findByNativeRuntimeSession(binding.runtime_id, binding.stable_work_context_id);
      if (!current) {
        return this.sessions.insertSession({
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
          provenance: "explicitly_linked",
          metadata: {},
          actorId: binding.bound_by,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (current.project_id && current.project_id !== binding.project_id) {
        throw new MolisWorkSessionError("session.identity_conflict", "这个 Runtime Session 已属于另一个项目");
      }
      if (!current.project_id) {
        this.sessions.setAssociationReferences(current.session_id, binding.project_id,
          current.current_goal_id, current.workspace_id, binding.bound_by, now);
        this.db.prepare("UPDATE sessions SET updated_at = ? WHERE session_id = ?").run(now, current.session_id);
      }
      return this.sessions.get(current.session_id);
    })();
  }
}
