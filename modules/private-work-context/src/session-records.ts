import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { MolisWorkSessionError } from "./errors.js";
import { SessionAssociationRepository } from "./session-associations.js";
import type {
  CreateMolisWorkSessionInput,
  DiscoverRuntimeSessionInput,
  ExplicitlyLinkRuntimeSessionInput,
  MolisWorkSessionGoalLink,
  MolisWorkSessionRecord,
  MolisWorkSessionStatus,
  LinkNativeRuntimeSessionInput,
  ReassignWorkspaceSessionsInput,
  SessionListFilter,
  SetMolisWorkSessionStatusInput,
  UpdateSessionAssociationsInput,
} from "./contract-aliases.js";
import {
  correlationTtl,
  mapSession,
  optionalAbsolutePath,
  optionalText,
  requireConfirmation,
  requiredText,
} from "./session-schema.js";

export interface InsertSessionRecordInput {
  sessionId: string;
  runtimeId: string;
  nativeId: string | null;
  correlationToken: string | null;
  correlationExpiresAt: string | null;
  surfaceId: string | null;
  projectId: string | null;
  currentGoalId: string | null;
  workspaceId: string | null;
  workspacePath: string | null;
  title: string | null;
  status: MolisWorkSessionStatus;
  provenance: MolisWorkSessionRecord["provenance"];
  metadata: Record<string, unknown>;
  actorId: string;
  createdAt: string;
  updatedAt: string;
}

export class SessionRecordRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly now: () => Date,
    private readonly associations: SessionAssociationRepository,
  ) {}

  createSession(input: CreateMolisWorkSessionInput): MolisWorkSessionRecord {
    requireConfirmation(input.user_confirmed);
    const runtimeId = requiredText(input.runtime_id, "Runtime 标识不能为空");
    const actorId = requiredText(input.actor_id, "Session 写入必须记录执行者");
    const nativeId = optionalText(input.native_runtime_session_id);
    const surfaceId = optionalText(input.surface_id);
    const now = this.now().toISOString();
    return this.db.transaction(() => {
      if (nativeId) {
        const existing = this.findByNativeRuntimeSession(runtimeId, nativeId);
        if (existing) return this.updateAssociationsInTransaction(existing, input, actorId, now);
      }
      if (surfaceId) {
        const existing = this.findBySurface(surfaceId);
        if (existing) {
          if (existing.runtime_id !== runtimeId) {
            throw new MolisWorkSessionError("session.runtime_mismatch", "这个 surface 已属于另一个 Runtime Session");
          }
          return this.updateAssociationsInTransaction(existing, input, actorId, now);
        }
      }
      const ttl = correlationTtl(input.correlation_ttl_seconds);
      return this.insertSession({
        sessionId: `session-${randomUUID()}`,
        runtimeId,
        nativeId,
        correlationToken: nativeId ? null : `session-correlation-${randomUUID()}`,
        correlationExpiresAt: nativeId ? null : new Date(this.now().getTime() + ttl * 1000).toISOString(),
        surfaceId,
        projectId: optionalText(input.project_id),
        currentGoalId: optionalText(input.current_goal_id),
        workspaceId: optionalText(input.workspace_id),
        workspacePath: optionalAbsolutePath(input.workspace_path),
        title: optionalText(input.title),
        status: "active",
        provenance: input.provenance ?? "molis_work_created",
        metadata: input.metadata ?? {},
        actorId,
        createdAt: now,
        updatedAt: now,
      });
    })();
  }

  discoverSession(input: DiscoverRuntimeSessionInput): MolisWorkSessionRecord {
    const runtimeId = requiredText(input.runtime_id, "Runtime 标识不能为空");
    const nativeId = requiredText(input.native_runtime_session_id, "Runtime 原生 Session ID 不能为空");
    const now = this.now().toISOString();
    return this.db.transaction(() => {
      const existing = this.findByNativeRuntimeSession(runtimeId, nativeId);
      if (!existing) {
        return this.insertSession({
          sessionId: `session-${randomUUID()}`,
          runtimeId,
          nativeId,
          correlationToken: null,
          correlationExpiresAt: null,
          surfaceId: null,
          projectId: null,
          currentGoalId: null,
          workspaceId: null,
          workspacePath: null,
          title: optionalText(input.title),
          status: "discovered",
          provenance: "runtime_discovered",
          metadata: input.metadata ?? {},
          actorId: "runtime-discovery",
          createdAt: now,
          updatedAt: now,
        });
      }
      this.db.prepare(`
        UPDATE sessions
        SET title = COALESCE(?, title), metadata_json = ?, updated_at = ?
        WHERE session_id = ?
      `).run(
        optionalText(input.title),
        JSON.stringify({ ...existing.metadata, ...(input.metadata ?? {}) }),
        now,
        existing.session_id,
      );
      return this.get(existing.session_id);
    })();
  }

  explicitlyLinkSession(input: ExplicitlyLinkRuntimeSessionInput): MolisWorkSessionRecord {
    requireConfirmation(input.user_confirmed);
    const runtimeId = requiredText(input.runtime_id, "Runtime 标识不能为空");
    const nativeId = requiredText(input.native_runtime_session_id, "Runtime 原生 Session ID 不能为空");
    const actorId = requiredText(input.actor_id, "Session 写入必须记录执行者");
    const now = this.now().toISOString();
    return this.db.transaction(() => {
      const existing = this.findByNativeRuntimeSession(runtimeId, nativeId);
      if (existing) return this.updateAssociationsInTransaction(existing, input, actorId, now);
      return this.insertSession({
        sessionId: `session-${randomUUID()}`,
        runtimeId,
        nativeId,
        correlationToken: null,
        correlationExpiresAt: null,
        surfaceId: null,
        projectId: optionalText(input.project_id),
        currentGoalId: optionalText(input.current_goal_id),
        workspaceId: optionalText(input.workspace_id),
        workspacePath: optionalAbsolutePath(input.workspace_path),
        title: optionalText(input.title),
        status: "active",
        provenance: "explicitly_linked",
        metadata: {},
        actorId,
        createdAt: now,
        updatedAt: now,
      });
    })();
  }

  linkNativeRuntimeSession(input: LinkNativeRuntimeSessionInput): MolisWorkSessionRecord {
    const sessionId = requiredText(input.session_id, "Molis Work Session ID 不能为空");
    const runtimeId = requiredText(input.runtime_id, "Runtime 标识不能为空");
    const nativeId = requiredText(input.native_runtime_session_id, "Runtime 原生 Session ID 不能为空");
    requiredText(input.actor_id, "Session 写入必须记录执行者");
    const now = this.now().toISOString();
    return this.db.transaction(() => {
      const current = this.get(sessionId);
      if (current.runtime_id !== runtimeId) {
        throw new MolisWorkSessionError("session.runtime_mismatch", "Runtime 与 Molis Work Session 不匹配");
      }
      if (current.native_runtime_session_id === nativeId) return current;
      if (current.native_runtime_session_id && current.native_runtime_session_id !== nativeId) {
        throw new MolisWorkSessionError("session.identity_conflict", "Molis Work Session 已连接另一个 Runtime 原生 Session");
      }
      const byNative = this.findByNativeRuntimeSession(runtimeId, nativeId);
      if (byNative && byNative.session_id !== current.session_id) {
        throw new MolisWorkSessionError("session.identity_conflict", "Runtime 原生 Session 已连接另一条 Molis Work Session");
      }
      const tokenMatches = Boolean(
        current.correlation_token
        && input.correlation_token === current.correlation_token
        && current.correlation_expires_at
        && Date.parse(current.correlation_expires_at) >= this.now().getTime(),
      );
      const surfaceMatches = Boolean(current.surface_id && input.surface_id === current.surface_id);
      if (!tokenMatches && !surfaceMatches) {
        throw new MolisWorkSessionError(
          "session.correlation_invalid",
          "晚到的 Runtime 原生 Session 缺少有效 correlation 或匹配的 surface",
        );
      }
      this.db.prepare(`
        UPDATE sessions
        SET native_runtime_session_id = ?, correlation_token = NULL,
            correlation_expires_at = NULL, status = 'active', updated_at = ?
        WHERE session_id = ?
      `).run(nativeId, now, current.session_id);
      return this.get(current.session_id);
    })();
  }

  updateAssociations(input: UpdateSessionAssociationsInput): MolisWorkSessionRecord {
    requireConfirmation(input.user_confirmed);
    const actorId = requiredText(input.actor_id, "Session 写入必须记录执行者");
    const now = this.now().toISOString();
    return this.db.transaction(() => this.updateAssociationsInTransaction(this.get(input.session_id), input, actorId, now))();
  }

  setStatus(input: SetMolisWorkSessionStatusInput): MolisWorkSessionRecord {
    requireConfirmation(input.user_confirmed);
    requiredText(input.actor_id, "Session 写入必须记录执行者");
    if (input.status !== "active" && input.status !== "closed") {
      throw new MolisWorkSessionError("session.invalid_input", "Session 只能归档或恢复");
    }
    const now = this.now().toISOString();
    return this.db.transaction(() => {
      const current = this.get(input.session_id);
      if (current.status === input.status) return current;
      this.db.prepare("UPDATE sessions SET status = ?, updated_at = ? WHERE session_id = ?")
        .run(input.status, now, current.session_id);
      return this.get(current.session_id);
    })();
  }

  reassignWorkspaceSessions(input: ReassignWorkspaceSessionsInput): MolisWorkSessionRecord[] {
    requireConfirmation(input.user_confirmed);
    const projectId = requiredText(input.project_id, "Project 标识不能为空");
    requiredText(input.actor_id, "工作目录变更必须记录执行者");
    const previousWorkspaceId = optionalText(input.previous_workspace_id);
    const previousWorkspacePath = optionalAbsolutePath(input.previous_workspace_path);
    if (!previousWorkspaceId && !previousWorkspacePath) {
      throw new MolisWorkSessionError("session.invalid_input", "必须提供要修复或解除的工作目录");
    }
    const workspaceId = optionalText(input.workspace_id);
    const workspacePath = optionalAbsolutePath(input.workspace_path);
    const now = this.now().toISOString();
    return this.db.transaction(() => {
      const rows = this.list({ project_id: projectId }).filter((session) =>
        (previousWorkspaceId && session.workspace_id === previousWorkspaceId)
        || (previousWorkspacePath && session.workspace_path === previousWorkspacePath));
      const update = this.db.prepare(`
        UPDATE sessions SET workspace_path = ?, updated_at = ?
        WHERE session_id = ?
      `);
      for (const row of rows) {
        this.associations.set(row.session_id, { ...this.associations.read(row.session_id), workspace_id: workspaceId }, input.actor_id, now);
        update.run(workspacePath, now, row.session_id);
      }
      return rows.map((row) => this.get(row.session_id));
    })();
  }

  get(sessionId: string): MolisWorkSessionRecord {
    const row = this.db.prepare("SELECT * FROM sessions WHERE session_id = ?").get(sessionId.trim()) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new MolisWorkSessionError("session.not_found", "找不到这条 Molis Work Session");
    return { ...mapSession(row), ...this.associations.read(String(row.session_id)) };
  }

  findByNativeRuntimeSession(runtimeId: string, nativeId: string): MolisWorkSessionRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM sessions WHERE runtime_id = ? AND native_runtime_session_id = ?
    `).get(runtimeId.trim(), nativeId.trim()) as Record<string, unknown> | undefined;
    return row ? this.get(String(row.session_id)) : null;
  }

  findBySurface(surfaceId: string): MolisWorkSessionRecord | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE surface_id = ?").get(surfaceId.trim()) as
      | Record<string, unknown>
      | undefined;
    return row ? this.get(String(row.session_id)) : null;
  }

  list(filter: SessionListFilter = {}): MolisWorkSessionRecord[] {
    const conditions: string[] = [];
    const values: string[] = [];
    for (const [column, value] of [
      ["runtime_id", filter.runtime_id],
      ["status", filter.status],
    ] as const) {
      const normalized = optionalText(value);
      if (!normalized) continue;
      conditions.push(`${column} = ?`);
      values.push(normalized);
    }
    const rows = this.db.prepare(`
      SELECT * FROM sessions
      ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY updated_at DESC, session_id
    `).all(...values) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ ...mapSession(row), ...this.associations.read(String(row.session_id)) }))
      .filter((session) => (!optionalText(filter.project_id) || session.project_id === filter.project_id!.trim())
        && (!optionalText(filter.workspace_id) || session.workspace_id === filter.workspace_id!.trim()));
  }

  goalHistory(sessionId: string): MolisWorkSessionGoalLink[] {
    return this.associations.history(sessionId.trim());
  }

  insertSession(input: InsertSessionRecordInput): MolisWorkSessionRecord {
    this.db.prepare(`
      INSERT INTO sessions (
        session_id, runtime_id, native_runtime_session_id, correlation_token,
        correlation_expires_at, surface_id, project_id, current_goal_id,
        workspace_id, workspace_path, title, status, provenance, metadata_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.sessionId, input.runtimeId, input.nativeId, input.correlationToken,
      input.correlationExpiresAt, input.surfaceId, null, null,
      null, input.workspacePath, input.title, input.status, input.provenance,
      JSON.stringify(input.metadata), input.createdAt, input.updatedAt,
    );
    this.associations.set(input.sessionId, { project_id: input.projectId, current_goal_id: input.currentGoalId,
      workspace_id: input.workspaceId }, input.actorId, input.createdAt);
    return this.get(input.sessionId);
  }

  setAssociationReferences(sessionId: string, projectId: string | null, goalId: string | null,
    workspaceId: string | null, actorId: string, now: string): void {
    this.associations.set(sessionId, { project_id: projectId, current_goal_id: goalId, workspace_id: workspaceId }, actorId, now);
  }

  private updateAssociationsInTransaction(
    current: MolisWorkSessionRecord,
    input: Partial<UpdateSessionAssociationsInput> & {
      project_id?: string | null;
      current_goal_id?: string | null;
      workspace_id?: string | null;
      workspace_path?: string | null;
    },
    actorId: string,
    now: string,
  ): MolisWorkSessionRecord {
    const projectId = Object.hasOwn(input, "project_id") ? optionalText(input.project_id) : current.project_id;
    const goalId = Object.hasOwn(input, "current_goal_id") ? optionalText(input.current_goal_id) : current.current_goal_id;
    const workspaceId = Object.hasOwn(input, "workspace_id") ? optionalText(input.workspace_id) : current.workspace_id;
    const workspacePath = Object.hasOwn(input, "workspace_path")
      ? optionalAbsolutePath(input.workspace_path)
      : current.workspace_path;
    this.associations.set(current.session_id, { project_id: projectId, current_goal_id: goalId, workspace_id: workspaceId }, actorId, now);
    this.db.prepare(`
      UPDATE sessions
      SET workspace_path = ?,
          title = COALESCE(?, title), status = 'active', updated_at = ?
      WHERE session_id = ?
    `).run(
      workspacePath,
      optionalText((input as { title?: string | null }).title),
      now,
      current.session_id,
    );
    return this.get(current.session_id);
  }
}
