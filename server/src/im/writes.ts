import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ImReadState, ImInvite, ImMessage, ImRoom, ImThreadState } from "@molis-ai/molis-work-contracts/services/im";
import type { ImDatabase, ImEvents, ImSession } from "./types.js";
import { clientId, ImError, textInput } from "./errors.js";
import { ImReads } from "./reads.js";

export class ImWrites {
  constructor(private readonly db: ImDatabase, private readonly reads: ImReads, private readonly events: ImEvents) {}

  markRead(roomId: string, memberId: string, messageId: string): ImReadState {
    const message = this.reads.message(roomId,messageId);
    this.db.prepare(`INSERT INTO im_read_positions VALUES (?,?,?,?) ON CONFLICT(member_id,room_id,target)
      DO UPDATE SET sequence=MAX(sequence,excluded.sequence)`).run(memberId,roomId,message.thread_id ?? '',message.sequence);
    return this.reads.readPositions(roomId,memberId);
  }

  memberChanged(memberId: string): void {
    const rooms = this.db.prepare("SELECT room_id FROM im_members WHERE member_id = ?").all(memberId) as Array<{ room_id: string }>;
    for (const room of rooms) this.event(room.room_id, "member", memberId);
  }

  mutate<T>(session: ImSession, pathname: string, body: Record<string, unknown>, operation: () => T): T {
    const key = clientId(body.client_id);
    const fingerprint = hash(`${pathname}\n${JSON.stringify(Object.fromEntries(Object.entries(body).sort(([a], [b]) => a.localeCompare(b))))}`);
    const previousMemberId = session.member_id;
    try {
      const committed = this.db.transaction(() => {
        // Recovery issues a new session for the same member; its pending sends
        // must reuse the original receipt. Anonymous naming remains session-scoped.
        const prior = (session.member_id
          ? this.db.prepare(`SELECT r.fingerprint,r.result_json FROM im_receipts r JOIN mw_sessions s ON s.id=r.session_id
              WHERE s.member_id=? AND r.client_id=?`).get(session.member_id,key)
          : this.db.prepare("SELECT fingerprint,result_json FROM im_receipts WHERE session_id=? AND client_id=?").get(session.id,key)) as { fingerprint: string; result_json: string } | undefined;
        if (prior) {
          if (prior.fingerprint !== fingerprint) throw new ImError("im.client_id_conflict", "这个提交标识已用于另一项操作，请保留原消息并刷新", 409);
          return { result: JSON.parse(prior.result_json) as T, replayed: true };
        }
        const result = operation();
        this.db.prepare("INSERT INTO im_receipts(session_id, client_id, fingerprint, result_json) VALUES (?, ?, ?, ?)")
          .run(session.id, key, fingerprint, JSON.stringify(result));
        return { result, replayed: false };
      }).immediate();
      // Notifications are hints; a failed notification must never undo a committed message.
      if (!committed.replayed) try { this.events.notify(); } catch { /* A later reconnect reads durable events. */ }
      return committed.result;
    } catch (error) { session.member_id = previousMemberId; throw error; }
  }

  createRoom(memberId: string, value: unknown): { room: ImRoom } {
    const title = textInput(value, "群名称", 80), id = randomUUID(), now = new Date().toISOString();
    this.db.prepare("INSERT INTO im_rooms(id, title, owner_id, invite_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, title, memberId, inviteToken(), now, now);
    this.db.prepare("INSERT INTO im_members(room_id, member_id, joined_at) VALUES (?, ?, ?)").run(id, memberId, now);
    this.event(id, "member", memberId);
    return { room: this.reads.room(id) };
  }

  join(memberId: string, value: unknown): { room: ImRoom } {
    const token = textInput(value, "邀请凭证", 100);
    const room = this.db.prepare<unknown[], { id: string }>("SELECT id FROM im_rooms WHERE invite_token = ?").get(token);
    if (room && this.reads.room(room.id).project_id) throw new ImError("im.project_invite", "请通过项目邀请加入讨论", 403);
    if (!room) throw new ImError("im.invite_not_found", "邀请已失效，请向群创建者索取新链接", 404);
    const roomId = String(room.id);
    const added = this.db.prepare("INSERT OR IGNORE INTO im_members(room_id, member_id, joined_at) VALUES (?, ?, ?)")
      .run(roomId, memberId, new Date().toISOString());
    if (added.changes) this.event(roomId, "member", memberId);
    return { room: this.reads.room(roomId) };
  }

  invite(roomId: string, memberId: string, origin: string, rotate = false): ImInvite {
    const room = this.reads.room(roomId);
    if (room.project_id) throw new ImError("im.project_invite", "成员由项目权限统一管理", 403);
    if (room.owner_id !== memberId) throw new ImError("im.owner_required", "只有群创建者可以管理邀请链接", 403);
    if (rotate) {
      this.db.prepare("UPDATE im_rooms SET invite_token = ? WHERE id = ?").run(inviteToken(), roomId);
      this.event(roomId, "invite", roomId);
    }
    const token = String(this.db.prepare<unknown[], { invite_token: string }>("SELECT invite_token FROM im_rooms WHERE id = ?").get(roomId)!.invite_token);
    const path = `/im?invite=${encodeURIComponent(token)}`;
    return { room_id: roomId, token, path, url: new URL(path, origin).href };
  }

  createThread(roomId: string, memberId: string, body: Record<string, unknown>): ImThreadState {
    const title = textInput(body.title, "Thread 标题", 120);
    const source = body.source_message_id ? this.reads.message(roomId, textInput(body.source_message_id, "原消息", 100)) : null;
    const firstBody = body.body === undefined ? null : textInput(body.body, "首条消息", 12_000);
    if (!source && !firstBody) throw new ImError("im.empty_thread", "写下第一条消息再创建话题");
    if (source && source.thread_id !== null) throw new ImError("im.invalid_source", "请从群聊里的原消息开 Thread");
    const id = randomUUID(), now = new Date().toISOString();
    this.db.prepare(`INSERT INTO im_threads(id, room_id, title, source_message_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, roomId, title, source?.id ?? null, memberId, now, now);
    const context = source ? this.db.prepare<unknown[], { id: string }>(`SELECT id FROM im_messages WHERE room_id = ? AND thread_id IS NULL
      AND sequence <= ? ORDER BY sequence DESC LIMIT 4`).all(roomId, source.sequence).reverse() : [];
    context.forEach((message, position) => this.db.prepare("INSERT INTO im_thread_context(thread_id, message_id, position) VALUES (?, ?, ?)")
      .run(id, String(message.id), position));
    this.touch(roomId, now);
    this.event(roomId, "thread", id, id);
    if (firstBody) this.insertMessage(roomId, id, memberId, firstBody, null);
    return this.reads.threadState(roomId, id);
  }

  send(roomId: string, threadId: string | null, memberId: string, value: unknown, quoteId?: unknown): { message: ImMessage } {
    if (threadId) this.reads.thread(roomId, threadId);
    const quote = quoteId ? this.reads.message(roomId, textInput(quoteId, "引用消息", 100)) : null;
    return this.insertMessage(roomId, threadId, memberId, textInput(value, "消息", 12_000), null, quote?.id ?? null);
  }

  share(roomId: string, threadId: string, memberId: string, body: Record<string, unknown>): { message: ImMessage } {
    this.reads.thread(roomId, threadId);
    const reply = this.reads.message(roomId, textInput(body.message_id, "回复", 100));
    if (reply.thread_id !== threadId) throw new ImError("im.invalid_reply", "这条回复不属于当前 Thread");
    const note = body.body === undefined || body.body === "" ? "" : textInput(body.body, "分享说明", 12_000);
    return this.insertMessage(roomId, null, memberId, note, reply.id);
  }

  private insertMessage(roomId: string, threadId: string | null, memberId: string, body: string, sharedId: string | null, quoteId: string | null = null): { message: ImMessage } {
    const id = randomUUID(), now = new Date().toISOString();
    this.db.prepare(`INSERT INTO im_messages(id, room_id, thread_id, author_id, body, shared_message_id, created_at, quote_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, roomId, threadId, memberId, body, sharedId, now, quoteId);
    this.touch(roomId, now);
    if (threadId) this.db.prepare("UPDATE im_threads SET updated_at = ? WHERE id = ?").run(now, threadId);
    this.event(roomId, "message", id, threadId);
    return { message: this.reads.message(roomId, id) };
  }

  private touch(roomId: string, now: string): void { this.db.prepare("UPDATE im_rooms SET updated_at = ? WHERE id = ?").run(now, roomId); }
  private event(roomId: string, kind: string, entityId: string, threadId: string | null = null): void {
    this.events.append({ scopeKind: "room", scopeId: roomId, kind, entityId, ...(threadId ? { threadId } : {}) });
  }
}

function inviteToken(): string { return randomBytes(24).toString("base64url"); }

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
