import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { sessionMessageTarget, sessionMessagePrompt, type SessionMessageApi, type SessionMessageRecord, type PrepareSessionMessage } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { WorkSessionRecord } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { SessionContentStore } from "./content-store.js";
import type { SessionEventRepository } from "./session-events.js";
import { MolisWorkSessionError } from "./errors.js";
import { requiredText } from "./session-schema.js";

/** The write-ahead uncertain state deliberately survives crashes and never implies safe replay. */
export class SessionMessageRepository implements SessionMessageApi {
  constructor(private readonly db: Database.Database, private readonly now: () => Date,
    private readonly content: SessionContentStore, private readonly sessions: { get(id: string): WorkSessionRecord },
    private readonly events: SessionEventRepository) {}

  migrate(): void {
    this.db.transaction(() => {
      this.db.exec(`CREATE TABLE IF NOT EXISTS session_messages (
        request_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, project_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL, session_id TEXT NOT NULL REFERENCES sessions(session_id),
        target_json TEXT NOT NULL, content_ref TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('pending','uncertain','failed','accepted')),
        attempt_count INTEGER NOT NULL DEFAULT 0, native_turn_id TEXT, error_code TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(actor_id, project_id, idempotency_key)
      );`);
      this.db.prepare("UPDATE session_meta SET value = '6' WHERE key = 'schema_version'").run();
    }).immediate();
  }

  prepare(input: PrepareSessionMessage): SessionMessageRecord {
    return this.db.transaction(() => {
      requiredText(input.actor_id, "消息缺少调用者"); requiredText(input.project_id, "消息缺少项目");
      requiredText(input.idempotency_key, "消息缺少幂等键"); requiredText(input.text, "消息不能为空");
      if (input.text.length > 20_000 || (input.context?.content.length ?? 0) > 40_000) throw new MolisWorkSessionError("session.invalid_input", "消息或上下文过长");
      const payload = { text: input.text, context: input.context ?? null };
      const existing = this.db.prepare("SELECT request_id FROM session_messages WHERE actor_id = ? AND project_id = ? AND idempotency_key = ?")
        .get(input.actor_id, input.project_id, input.idempotency_key) as { request_id: string } | undefined;
      if (existing) {
        const record = this.get(existing.request_id);
        if (!record.content_available) throw new MolisWorkSessionError("session.message_content_unavailable", "已保留的消息内容不可读，不能重新发送");
        if (record.target.session_id !== input.session_id || record.target.current_goal_id !== input.expected_goal_id
          || JSON.stringify({ text: record.text, context: record.context }) !== JSON.stringify(payload)) {
          throw new MolisWorkSessionError("session.message_conflict", "同一消息请求不能更换内容或目标");
        }
        return record;
      }
      const target = sessionMessageTarget(this.sessions.get(input.session_id));
      if (target.project_id !== input.project_id || target.current_goal_id !== input.expected_goal_id) {
        throw new MolisWorkSessionError("session.message_target_changed", "Session 的项目或目标已变化，请重新选择");
      }
      if (target.status === "closed" || !target.native_runtime_session_id) throw new MolisWorkSessionError("session.message_unavailable", "此会话当前不能接收消息");
      const ref = this.content.write(JSON.stringify(payload)).content_ref;
      const id = `session-message-${randomUUID()}`, at = this.now().toISOString();
      this.db.prepare(`INSERT INTO session_messages(request_id, actor_id, project_id, idempotency_key, session_id, target_json, content_ref, state, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,'pending',?,?)`).run(id, input.actor_id, input.project_id, input.idempotency_key, input.session_id, JSON.stringify(target), ref, at, at);
      return this.get(id);
    }).immediate();
  }

  get(requestId: string): SessionMessageRecord {
    const row = this.db.prepare("SELECT * FROM session_messages WHERE request_id = ?").get(requestId) as Record<string, unknown> | undefined;
    if (!row) throw new MolisWorkSessionError("session.message_not_found", "找不到消息请求");
    let payload: Pick<SessionMessageRecord, "text" | "context"> | undefined;
    try { payload = JSON.parse(this.content.read(String(row.content_ref))); } catch { /* Keep the receipt without inventing lost content. */ }
    return { request_id: String(row.request_id), actor_id: String(row.actor_id), project_id: String(row.project_id), idempotency_key: String(row.idempotency_key),
      target: JSON.parse(String(row.target_json)), text: payload?.text ?? null, context: payload?.context ?? null, content_available: payload !== undefined,
      state: row.state as SessionMessageRecord["state"], attempt_count: Number(row.attempt_count), native_turn_id: row.native_turn_id as string | null,
      error_code: row.error_code as string | null, created_at: String(row.created_at), updated_at: String(row.updated_at) };
  }

  claim(requestId: string, retry: boolean): { claimed: boolean; record: SessionMessageRecord } {
    return this.db.transaction(() => {
      const record = this.get(requestId);
      if (record.state !== (retry ? "failed" : "pending")) return { claimed: false, record };
      if (!record.content_available) throw new MolisWorkSessionError("session.message_content_unavailable", "消息内容不可读，不能发送");
      const current = sessionMessageTarget(this.sessions.get(record.target.session_id));
      if (JSON.stringify(current) !== JSON.stringify(record.target)) throw new MolisWorkSessionError("session.message_target_changed", "消息目标关联已变化，不能继续原请求");
      this.db.prepare("UPDATE session_messages SET state = 'uncertain', attempt_count = attempt_count + 1, error_code = NULL, updated_at = ? WHERE request_id = ?")
        .run(this.now().toISOString(), requestId);
      return { claimed: true, record: this.get(requestId) };
    }).immediate();
  }

  finish(requestId: string, attempt: number, result: Parameters<SessionMessageApi["finish"]>[2]): SessionMessageRecord {
    return this.db.transaction(() => {
      const record = this.get(requestId);
      if (record.state !== "uncertain" || record.attempt_count !== attempt) throw new MolisWorkSessionError("session.message_attempt_changed", "消息发送尝试已变化");
      if (result.state === "accepted") {
        requiredText(result.native_turn_id, "消息缺少原生回执");
        if (!record.content_available) throw new MolisWorkSessionError("session.message_content_unavailable", "消息内容不可读，无法写入会话记录");
        this.events.append({ session_id: record.target.session_id, source: "molis_work", source_id: requestId, kind: "user_message", content: sessionMessagePrompt(record) });
      }
      this.db.prepare("UPDATE session_messages SET state = ?, native_turn_id = ?, error_code = ?, updated_at = ? WHERE request_id = ?")
        .run(result.state, result.state === "accepted" ? result.native_turn_id : null, result.state === "accepted" ? null : result.error_code, this.now().toISOString(), requestId);
      return this.get(requestId);
    }).immediate();
  }
}
