import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { SessionContentStore } from "./content-store.js";
import type {
  CreateSessionHandoffDraftInput,
  MolisWorkSessionHandoffRecord,
  MolisWorkSessionRecord,
  UpdateSessionHandoffDraftInput,
} from "./contract-aliases.js";
import { MolisWorkSessionError } from "./errors.js";
import { optionalAbsolutePath, optionalText, requiredText } from "./session-schema.js";
import type { HandoffAssociationRepository } from "./handoff-associations.js";

const HANDOFF_SEND_LEASE_MS = 5 * 60 * 1000;

export interface HandoffSessionLookup {
  get(sessionId: string): MolisWorkSessionRecord;
}

export class SessionHandoffRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly now: () => Date,
    private readonly contentStore: SessionContentStore,
    private readonly sessions: HandoffSessionLookup,
    private readonly associations: HandoffAssociationRepository,
  ) {}

  createDraft(input: CreateSessionHandoffDraftInput): MolisWorkSessionHandoffRecord {
    return this.db.transaction(() => this.createDraftRecord(input)).immediate();
  }

  private createDraftRecord(input: CreateSessionHandoffDraftInput): MolisWorkSessionHandoffRecord {
    const sourceSessionId = requiredText(input.source_session_id, "来源 Session 不能为空");
    const sourceProjectId = requiredText(input.source_project_id, "来源 Project 不能为空");
    const sourceGoalId = requiredText(input.source_goal_id, "来源 Goal 不能为空");
    const targetRuntimeId = requiredText(input.target_runtime_id, "请选择目标 Runtime");
    const targetProjectId = requiredText(input.target_project_id, "目标 Project 不能为空");
    const actorId = requiredText(input.actor_id, "Handoff 写入必须记录执行者");
    const content = requiredText(input.content, "Handoff 内容不能为空");
    const source = this.sessions.get(sourceSessionId);
    if (source.project_id !== sourceProjectId || source.current_goal_id !== sourceGoalId) {
      throw new MolisWorkSessionError("session.invalid_input", "来源 Session 的当前 Project 或 Goal 已经变化，请重新生成 Handoff");
    }
    const targetWorkspacePath = optionalAbsolutePath(input.target_workspace_path);
    const { content_ref: contentRef } = this.contentStore.write(content);
    const contentDigest = createHash("sha256").update(content).digest("hex");
    const packageId = `session-handoff-${randomUUID()}`;
    const now = this.now().toISOString();
    this.db.prepare(`
      INSERT INTO session_handoffs (
        package_id, source_session_id, source_project_id, source_goal_id,
        target_runtime_id, target_project_id, target_workspace_id, target_workspace_path,
        destination_session_id, state, delivery_mode, content_ref, content_digest,
        attempt_count, error_code, error_message, retryable,
        created_by, created_at, updated_at, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'draft', NULL, ?, ?, 0, NULL, NULL, 1, ?, ?, ?, NULL)
    `).run(
      packageId,
      sourceSessionId,
      "",
      "",
      targetRuntimeId,
      "",
      null,
      targetWorkspacePath,
      contentRef,
      contentDigest,
      actorId,
      now,
      now,
    );
    this.associations.recordSource(packageId, sourceProjectId, sourceGoalId, input.source_goal_version ?? null, actorId, now);
    this.associations.setTarget(packageId, targetProjectId, optionalText(input.target_workspace_id), actorId, now);
    return this.get(packageId);
  }

  get(packageId: string): MolisWorkSessionHandoffRecord {
    const row = this.db.prepare("SELECT * FROM session_handoffs WHERE package_id = ?")
      .get(requiredText(packageId, "Handoff package ID 不能为空")) as Record<string, unknown> | undefined;
    if (!row) throw new MolisWorkSessionError("session.handoff_not_found", "找不到这条 Handoff package");
    return this.map(row);
  }

  latestPending(sourceSessionId: string): MolisWorkSessionHandoffRecord | null {
    this.recoverInterrupted();
    const row = this.db.prepare(`
      SELECT * FROM session_handoffs
      WHERE source_session_id = ? AND state IN ('draft', 'sending', 'failed')
      ORDER BY updated_at DESC, package_id DESC
      LIMIT 1
    `).get(requiredText(sourceSessionId, "来源 Session 不能为空")) as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  listForSession(sessionId: string): MolisWorkSessionHandoffRecord[] {
    this.sessions.get(sessionId);
    return (this.db.prepare(`
      SELECT * FROM session_handoffs
      WHERE source_session_id = ? OR destination_session_id = ?
      ORDER BY updated_at DESC, package_id DESC
    `).all(sessionId, sessionId) as Array<Record<string, unknown>>).map((row) => this.map(row));
  }

  updateDraft(input: UpdateSessionHandoffDraftInput): MolisWorkSessionHandoffRecord {
    return this.db.transaction(() => this.updateDraftRecord(input)).immediate();
  }

  private updateDraftRecord(input: UpdateSessionHandoffDraftInput): MolisWorkSessionHandoffRecord {
    const current = this.get(input.package_id);
    if (current.state !== "draft" && current.state !== "failed") {
      throw new MolisWorkSessionError("session.handoff_invalid_state", "只有草稿或失败的 Handoff 可以修改");
    }
    if (current.state === "failed" && !current.retryable) {
      throw new MolisWorkSessionError(
        "session.handoff_invalid_state",
        "这次失败不能安全重试；请取消后重新创建 Handoff",
      );
    }
    requiredText(input.actor_id, "Handoff 修改必须记录执行者");
    const targetRuntimeId = requiredText(input.target_runtime_id, "请选择目标 Runtime");
    const targetProjectId = requiredText(input.target_project_id, "目标 Project 不能为空");
    const targetWorkspaceId = optionalText(input.target_workspace_id);
    const targetWorkspacePath = optionalAbsolutePath(input.target_workspace_path);
    const content = requiredText(input.content, "Handoff 内容不能为空");
    if (current.destination_session_id && (
      current.target_runtime_id !== targetRuntimeId
      || current.target_project_id !== targetProjectId
      || current.target_workspace_id !== targetWorkspaceId
      || current.target_workspace_path !== targetWorkspacePath
    )) {
      throw new MolisWorkSessionError(
        "session.handoff_invalid_state",
        "目标 Session 已经创建；可以修改正文并重试，但不能再改变 Runtime、Project 或工作目录",
      );
    }
    const { content_ref: contentRef } = this.contentStore.write(content);
    const contentDigest = createHash("sha256").update(content).digest("hex");
    const now = this.now().toISOString();
    const updated = this.db.prepare(`
      UPDATE session_handoffs
      SET target_runtime_id = ?,
          target_workspace_path = ?, state = 'draft', content_ref = ?, content_digest = ?,
          error_code = NULL, error_message = NULL, retryable = 1, updated_at = ?
      WHERE package_id = ? AND state IN ('draft', 'failed')
    `).run(
      targetRuntimeId,
      targetWorkspacePath,
      contentRef,
      contentDigest,
      now,
      current.package_id,
    );
    if (updated.changes !== 1) {
      throw new MolisWorkSessionError("session.handoff_invalid_state", "Handoff 状态已经变化，请刷新后再操作");
    }
    this.associations.setTarget(current.package_id, targetProjectId, targetWorkspaceId, input.actor_id, now);
    return this.get(current.package_id);
  }

  markSending(packageId: string): MolisWorkSessionHandoffRecord {
    const current = this.get(packageId);
    if (current.state === "sent") return current;
    if (current.state !== "draft" && current.state !== "failed") {
      throw new MolisWorkSessionError("session.handoff_invalid_state", "这条 Handoff 当前不能发送");
    }
    const updated = this.db.prepare(`
      UPDATE session_handoffs
      SET state = 'sending', attempt_count = attempt_count + 1,
          error_code = NULL, error_message = NULL, retryable = 1, updated_at = ?
      WHERE package_id = ? AND state IN ('draft', 'failed')
    `).run(this.now().toISOString(), current.package_id);
    if (updated.changes !== 1) {
      const latest = this.get(current.package_id);
      if (latest.state === "sent") return latest;
      throw new MolisWorkSessionError(
        "session.handoff_invalid_state",
        "这条 Handoff 已在另一个请求中发送，请等待结果后刷新",
      );
    }
    return this.get(current.package_id);
  }

  attachDestination(input: {
    package_id: string;
    destination_session_id: string;
    delivery_mode: NonNullable<MolisWorkSessionHandoffRecord["delivery_mode"]>;
  }): MolisWorkSessionHandoffRecord {
    const current = this.get(input.package_id);
    if (current.state !== "sending") {
      throw new MolisWorkSessionError("session.handoff_invalid_state", "只有发送中的 Handoff 可以记录目标 Session");
    }
    const destination = this.sessions.get(input.destination_session_id);
    if (
      destination.session_id === current.source_session_id
      || destination.project_id !== current.target_project_id
      || destination.current_goal_id !== current.source_goal_id
      || destination.runtime_id !== current.target_runtime_id
    ) {
      throw new MolisWorkSessionError(
        "session.identity_conflict",
        "目标 Session 的 Runtime、Project 或 Goal 与 Handoff 不一致",
      );
    }
    if (current.destination_session_id) {
      if (current.destination_session_id === destination.session_id && current.delivery_mode === input.delivery_mode) {
        return current;
      }
      throw new MolisWorkSessionError("session.identity_conflict", "Handoff 已连接另一个目标 Session");
    }
    const updated = this.db.prepare(`
      UPDATE session_handoffs
      SET destination_session_id = ?, delivery_mode = ?, updated_at = ?
      WHERE package_id = ? AND state = 'sending' AND destination_session_id IS NULL
    `).run(destination.session_id, input.delivery_mode, this.now().toISOString(), current.package_id);
    if (updated.changes !== 1) {
      throw new MolisWorkSessionError("session.handoff_invalid_state", "Handoff 状态已经变化，不能覆盖目标 Session");
    }
    return this.get(current.package_id);
  }

  markFailed(input: {
    package_id: string;
    error_code: string;
    error_message: string;
    retryable: boolean;
    destination_session_id?: string | null;
    delivery_mode?: MolisWorkSessionHandoffRecord["delivery_mode"];
  }): MolisWorkSessionHandoffRecord {
    const current = this.get(input.package_id);
    if (current.state !== "sending") {
      throw new MolisWorkSessionError("session.handoff_invalid_state", "只有发送中的 Handoff 可以记录失败");
    }
    const destinationSessionId = optionalText(input.destination_session_id) ?? current.destination_session_id;
    if (destinationSessionId) this.sessions.get(destinationSessionId);
    const updated = this.db.prepare(`
      UPDATE session_handoffs
      SET state = 'failed', destination_session_id = ?, delivery_mode = ?,
          error_code = ?, error_message = ?, retryable = ?, updated_at = ?
      WHERE package_id = ? AND state = 'sending'
    `).run(
      destinationSessionId,
      input.delivery_mode ?? current.delivery_mode,
      requiredText(input.error_code, "Handoff 失败必须提供错误码"),
      requiredText(input.error_message, "Handoff 失败必须提供恢复说明"),
      input.retryable ? 1 : 0,
      this.now().toISOString(),
      current.package_id,
    );
    if (updated.changes !== 1) {
      throw new MolisWorkSessionError("session.handoff_invalid_state", "Handoff 状态已经变化，不能覆盖当前发送结果");
    }
    return this.get(current.package_id);
  }

  markSent(input: {
    package_id: string;
    destination_session_id: string;
    delivery_mode: NonNullable<MolisWorkSessionHandoffRecord["delivery_mode"]>;
  }): MolisWorkSessionHandoffRecord {
    const current = this.get(input.package_id);
    if (current.state === "sent") return current;
    if (current.state !== "sending") {
      throw new MolisWorkSessionError("session.handoff_invalid_state", "只有发送中的 Handoff 可以完成");
    }
    this.sessions.get(input.destination_session_id);
    const now = this.now().toISOString();
    const updated = this.db.prepare(`
      UPDATE session_handoffs
      SET state = 'sent', destination_session_id = ?, delivery_mode = ?,
          error_code = NULL, error_message = NULL, retryable = 0,
          updated_at = ?, sent_at = ?
      WHERE package_id = ? AND state = 'sending'
    `).run(input.destination_session_id, input.delivery_mode, now, now, current.package_id);
    if (updated.changes !== 1) {
      const latest = this.get(current.package_id);
      if (latest.state === "sent") return latest;
      throw new MolisWorkSessionError("session.handoff_invalid_state", "Handoff 状态已经变化，不能覆盖当前发送结果");
    }
    return this.get(current.package_id);
  }

  cancel(packageId: string): MolisWorkSessionHandoffRecord {
    const current = this.get(packageId);
    if (current.state === "cancelled") return current;
    if (current.state !== "draft" && current.state !== "failed") {
      throw new MolisWorkSessionError("session.handoff_invalid_state", "发送中或已发送的 Handoff 不能取消");
    }
    const updated = this.db.prepare(`
      UPDATE session_handoffs SET state = 'cancelled', retryable = 0, updated_at = ?
      WHERE package_id = ? AND state IN ('draft', 'failed')
    `).run(this.now().toISOString(), current.package_id);
    if (updated.changes !== 1) {
      const latest = this.get(current.package_id);
      if (latest.state === "cancelled") return latest;
      throw new MolisWorkSessionError("session.handoff_invalid_state", "Handoff 状态已经变化，不能取消");
    }
    return this.get(current.package_id);
  }

  recoverInterrupted(): void {
    const now = this.now().toISOString();
    const staleBefore = new Date(this.now().getTime() - HANDOFF_SEND_LEASE_MS).toISOString();
    this.db.prepare(`
      UPDATE session_handoffs
      SET state = 'failed', error_code = 'handoff.interrupted',
          error_message = 'Handoff 发送租约已过期；请检查目标 Runtime 后重试。',
          retryable = 1, updated_at = ?
      WHERE state = 'sending' AND updated_at <= ?
    `).run(now, staleBefore);
  }

  private map(row: Record<string, unknown>): MolisWorkSessionHandoffRecord {
    let content: string | null = null;
    try {
      content = this.contentStore.read(String(row.content_ref));
    } catch {
      content = null;
    }
    return {
      package_id: String(row.package_id),
      source_session_id: String(row.source_session_id),
      ...this.associations.read(String(row.package_id)),
      target_runtime_id: String(row.target_runtime_id),
      target_workspace_path: row.target_workspace_path == null ? null : String(row.target_workspace_path),
      destination_session_id: row.destination_session_id == null ? null : String(row.destination_session_id),
      state: String(row.state) as MolisWorkSessionHandoffRecord["state"],
      delivery_mode: row.delivery_mode == null
        ? null
        : String(row.delivery_mode) as MolisWorkSessionHandoffRecord["delivery_mode"],
      content,
      content_available: content !== null,
      content_digest: String(row.content_digest),
      attempt_count: Number(row.attempt_count),
      error_code: row.error_code == null ? null : String(row.error_code),
      error_message: row.error_message == null ? null : String(row.error_message),
      retryable: Number(row.retryable) === 1,
      created_by: String(row.created_by),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      sent_at: row.sent_at == null ? null : String(row.sent_at),
    };
  }
}
