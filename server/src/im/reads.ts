import type { ImMember, ImMessage, ImMessagePage, ImRoom, ImRoomState, ImThread, ImThreadState } from "@molis-ai/molis-work-contracts/services/im";
import type { ImDatabase } from "./types.js";
import { ImError } from "./errors.js";

type Row = Record<string, string | number | null>;
export class ImReads {
  constructor(readonly db: ImDatabase) {}

  assertMember(roomId: string, memberId: string): void {
    if (!this.db.prepare("SELECT 1 FROM im_members WHERE room_id = ? AND member_id = ?").get(roomId, memberId)) {
      throw new ImError("im.forbidden", "你还不是这个群的成员", 403);
    }
  }

  room(roomId: string): ImRoom {
    const row = this.db.prepare(`SELECT r.*, (SELECT COUNT(*) FROM im_members WHERE room_id = r.id) AS member_count,
      (SELECT CASE WHEN m.body != '' THEN m.body ELSE shared.body END FROM im_messages m
        LEFT JOIN im_messages shared ON shared.id = m.shared_message_id
        WHERE m.room_id = r.id AND m.thread_id IS NULL ORDER BY m.sequence DESC LIMIT 1) AS latest_message
      FROM im_rooms r WHERE r.id = ?`).get(roomId) as unknown as Row | undefined;
    if (!row) throw new ImError("im.room_not_found", "找不到这个群", 404);
    return { id: String(row.id), title: String(row.title), owner_id: String(row.owner_id),
      created_at: String(row.created_at), updated_at: String(row.updated_at),
      member_count: Number(row.member_count), latest_message: row.latest_message === null ? null : String(row.latest_message) };
  }

  rooms(memberId: string): ImRoom[] {
    return this.db.prepare<unknown[], { id: string }>(`SELECT r.id FROM im_rooms r JOIN im_members m ON m.room_id = r.id
      WHERE m.member_id = ? ORDER BY r.updated_at DESC, r.id`).all(memberId).map(row => this.room(String(row.id)));
  }

  thread(roomId: string, threadId: string): ImThread {
    const row = this.db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM im_messages WHERE thread_id = t.id) AS reply_count,
      (SELECT body FROM im_messages WHERE thread_id = t.id ORDER BY sequence DESC LIMIT 1) AS latest_reply
      FROM im_threads t WHERE t.id = ? AND t.room_id = ?`).get(threadId, roomId) as unknown as Row | undefined;
    if (!row) throw new ImError("im.thread_not_found", "找不到这个群里的 Thread", 404);
    return { id: String(row.id), room_id: String(row.room_id), title: String(row.title),
      source_message_id: String(row.source_message_id), created_by: String(row.created_by),
      created_at: String(row.created_at), updated_at: String(row.updated_at),
      reply_count: Number(row.reply_count), latest_reply: row.latest_reply === null ? null : String(row.latest_reply) };
  }

  state(roomId: string): ImRoomState {
    const members = this.db.prepare(`SELECT p.id, p.display_name FROM mw_members p JOIN im_members m ON m.member_id = p.id
      WHERE m.room_id = ? ORDER BY m.joined_at, p.id`).all(roomId) as unknown as ImMember[];
    const threads = this.db.prepare<unknown[], { id: string }>("SELECT id FROM im_threads WHERE room_id = ? ORDER BY updated_at DESC, id")
      .all(roomId).map(row => this.thread(roomId, String(row.id)));
    return { room: this.room(roomId), members, threads };
  }

  threadState(roomId: string, threadId: string): ImThreadState {
    const thread = this.thread(roomId, threadId);
    const context = this.db.prepare<unknown[], { message_id: string }>("SELECT message_id FROM im_thread_context WHERE thread_id = ? ORDER BY position")
      .all(threadId).map(row => this.message(roomId, String(row.message_id)));
    return { thread, context };
  }

  message(roomId: string, messageId: string): ImMessage {
    const row = this.db.prepare(`SELECT m.*, p.display_name FROM im_messages m JOIN mw_members p ON p.id = m.author_id
      WHERE m.id = ? AND m.room_id = ?`).get(messageId, roomId) as unknown as Row | undefined;
    if (!row) throw new ImError("im.message_not_found", "找不到这个群里的消息", 404);
    let shared_reply: ImMessage["shared_reply"] = null;
    if (row.shared_message_id) {
      const shared = this.db.prepare(`SELECT m.id, m.body, m.author_id, m.thread_id, p.display_name, t.title
        FROM im_messages m JOIN mw_members p ON p.id = m.author_id JOIN im_threads t ON t.id = m.thread_id
        WHERE m.id = ? AND m.room_id = ?`).get(row.shared_message_id, roomId) as unknown as Row;
      shared_reply = { message_id: String(shared.id), thread_id: String(shared.thread_id), thread_title: String(shared.title),
        author: { id: String(shared.author_id), display_name: String(shared.display_name) }, body: String(shared.body) };
    }
    return { id: String(row.id), sequence: Number(row.sequence), room_id: roomId,
      thread_id: row.thread_id === null ? null : String(row.thread_id),
      author: { id: String(row.author_id), display_name: String(row.display_name) }, body: String(row.body),
      created_at: String(row.created_at), shared_reply };
  }

  messages(roomId: string, threadId: string | null, before: number | null, limit: number): ImMessagePage {
    if (threadId) this.thread(roomId, threadId);
    const rows = this.db.prepare<unknown[], { id: string }>(`SELECT id FROM im_messages WHERE room_id = ? AND thread_id IS ?
      AND (? IS NULL OR sequence < ?) ORDER BY sequence DESC LIMIT ?`).all(roomId, threadId, before, before, limit + 1);
    const has_more = rows.length > limit;
    const messages = rows.slice(0, limit).reverse().map(row => this.message(roomId, String(row.id)));
    return { messages, has_more, next_before: has_more ? messages[0]!.sequence : null };
  }

}
